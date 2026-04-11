/**
 * Club helpers — data model + Firestore CRUD for the Clubs feature.
 *
 * A Club is a 5-player roster (1 leader + up to 4 members). Clubs can register
 * for tournaments as a unit; when they do, every current member is auto-added
 * to the tournament roster.
 *
 * Firestore layout:
 *   collection  clubs/{clubId}
 *     - name, tag, leaderUid, members[], createdAt, wins, losses, logo
 *   collection  club-invites/{inviteId}
 *     - clubId, clubName, from, fromUsername, to, status, createdAt
 *   player.clubId: string | null
 */

import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, getDoc, getDocs, query, where,
  updateDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch,
  increment, runTransaction,
} from 'firebase/firestore';

export const CLUB_MAX_MEMBERS = 5;

export interface Club {
  id: string;
  name: string;
  tag: string;        // 2-5 char tag, e.g. "NJA"
  leaderUid: string;
  members: string[];  // includes leader
  createdAt: number;
  wins: number;
  losses: number;
  logo?: string;      // emoji or short string, optional
  /**
   * Legacy field — total treasury balance. Kept in sync with the sum of `shares`
   * for display/back-compat. Do not write directly; use the helpers which manage
   * both `shares` and `balance` together.
   */
  balance?: number;
  /**
   * Per-member share ledger. Every deposit/prize is split evenly across current
   * members and added to their entry. Each member can only withdraw from their
   * OWN entry. Tournament fees deduct entryFee from each member's own cut.
   * shape: `{ [playerUid]: tokens }`
   */
  shares?: Record<string, number>;
  /**
   * Pooled Tournament Entry Pass count. Sum of `vouchersByMember` — kept for
   * back-compat and quick reads.
   */
  vouchers?: number;
  /**
   * Per-member voucher ownership ledger. Only the depositor can withdraw a
   * voucher back to their inventory — nobody can touch someone else's deposit.
   * `{ [playerUid]: count }`
   */
  vouchersByMember?: Record<string, number>;
}

/** Sum of all member shares. */
export function clubTotalBalance(club: Club): number {
  return Object.values(club.shares || {}).reduce((s, v) => s + (v || 0), 0);
}

/** A member's individual treasury share (defaults to 0). */
export function clubShareOf(club: Club, uid: string): number {
  return (club.shares && club.shares[uid]) || 0;
}

/** Split `amount` evenly across members, with any remainder going to the leader. */
function splitAmount(amount: number, members: string[], leaderUid: string): Record<string, number> {
  const n = members.length;
  if (n === 0) return {};
  const per = Math.floor(amount / n);
  const remainder = amount - per * n;
  const out: Record<string, number> = {};
  for (const uid of members) out[uid] = per;
  if (remainder > 0 && out[leaderUid] !== undefined) out[leaderUid] += remainder;
  else if (remainder > 0) out[members[0]] += remainder;
  return out;
}

export interface ClubInvite {
  id: string;
  clubId: string;
  clubName: string;
  clubTag: string;
  from: string;
  fromUsername: string;
  to: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export async function createClub(params: {
  name: string;
  tag: string;
  leaderUid: string;
  leaderUsername: string;
  logo?: string;
}): Promise<string> {
  const { name, tag, leaderUid, logo } = params;
  // Create club doc
  const clubRef = await addDoc(collection(db, 'clubs'), {
    name: name.trim(),
    tag: tag.trim().toUpperCase().slice(0, 5),
    leaderUid,
    members: [leaderUid],
    createdAt: Date.now(),
    wins: 0,
    losses: 0,
    balance: 0,
    logo: logo || '',
  });
  // Attach clubId to the leader's player doc
  await updateDoc(doc(db, 'players', leaderUid), { clubId: clubRef.id });
  return clubRef.id;
}

/**
 * Deposit tokens from a player's coins into the club treasury. The tokens are
 * split evenly across all current members (remainder to the leader) so every
 * member gets an equal personal share of the deposit.
 * Atomic — uses a Firestore transaction to prevent race conditions.
 */
export async function depositToClub(clubId: string, playerUid: string, amount: number): Promise<'ok' | 'insufficient' | 'not-member' | 'invalid'> {
  if (!Number.isFinite(amount) || amount <= 0) return 'invalid';
  try {
    return await runTransaction(db, async (tx) => {
      const playerRef = doc(db, 'players', playerUid);
      const clubRef = doc(db, 'clubs', clubId);
      const [playerSnap, clubSnap] = await Promise.all([tx.get(playerRef), tx.get(clubRef)]);
      if (!playerSnap.exists() || !clubSnap.exists()) return 'invalid' as const;
      const player = playerSnap.data() as any;
      const club = clubSnap.data() as any;
      const members: string[] = club.members || [];
      if (!members.includes(playerUid)) return 'not-member' as const;
      if ((player.coins || 0) < amount) return 'insufficient' as const;

      const splits = splitAmount(amount, members, club.leaderUid);
      const newShares: Record<string, number> = { ...(club.shares || {}) };
      for (const uid of members) newShares[uid] = (newShares[uid] || 0) + (splits[uid] || 0);
      const newBalance = Object.values(newShares).reduce((s, v) => s + (v || 0), 0);

      tx.update(playerRef, { coins: increment(-amount), totalCoinsSpent: increment(amount) });
      tx.update(clubRef, { shares: newShares, balance: newBalance });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('depositToClub failed', err);
    return 'invalid';
  }
}

/**
 * Withdraw tokens from the treasury — ONLY from the caller's own share.
 * Any member can withdraw their own cut; no one can withdraw other members' cuts.
 */
export async function withdrawFromClub(clubId: string, actingUid: string, amount: number): Promise<'ok' | 'insufficient-share' | 'not-member' | 'invalid'> {
  if (!Number.isFinite(amount) || amount <= 0) return 'invalid';
  try {
    return await runTransaction(db, async (tx) => {
      const playerRef = doc(db, 'players', actingUid);
      const clubRef = doc(db, 'clubs', clubId);
      const [playerSnap, clubSnap] = await Promise.all([tx.get(playerRef), tx.get(clubRef)]);
      if (!playerSnap.exists() || !clubSnap.exists()) return 'invalid' as const;
      const club = clubSnap.data() as any;
      const members: string[] = club.members || [];
      if (!members.includes(actingUid)) return 'not-member' as const;

      const shares: Record<string, number> = { ...(club.shares || {}) };
      const mine = shares[actingUid] || 0;
      if (mine < amount) return 'insufficient-share' as const;

      shares[actingUid] = mine - amount;
      const newBalance = Object.values(shares).reduce((s, v) => s + (v || 0), 0);

      tx.update(clubRef, { shares, balance: newBalance });
      tx.update(playerRef, { coins: increment(amount) });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('withdrawFromClub failed', err);
    return 'invalid';
  }
}

/**
 * Charge each member `perMemberAmount` from their personal share. Fails atomically
 * if any member has insufficient share. Tournament club entry uses this.
 * `exempt` (optional): uids to skip (e.g. members who burned a voucher instead).
 */
export async function chargeEachMemberShare(
  clubId: string,
  perMemberAmount: number,
  exempt: string[] = [],
): Promise<'ok' | 'insufficient' | { error: 'insufficient'; offender: string } | 'invalid'> {
  if (!Number.isFinite(perMemberAmount) || perMemberAmount <= 0) return 'invalid';
  try {
    return await runTransaction(db, async (tx) => {
      const clubRef = doc(db, 'clubs', clubId);
      const snap = await tx.get(clubRef);
      if (!snap.exists()) return 'invalid' as const;
      const club = snap.data() as any;
      const members: string[] = club.members || [];
      const exemptSet = new Set(exempt);
      const shares: Record<string, number> = { ...(club.shares || {}) };

      for (const uid of members) {
        if (exemptSet.has(uid)) continue;
        const mine = shares[uid] || 0;
        if (mine < perMemberAmount) {
          return { error: 'insufficient' as const, offender: uid };
        }
      }
      for (const uid of members) {
        if (exemptSet.has(uid)) continue;
        shares[uid] = (shares[uid] || 0) - perMemberAmount;
      }
      const newBalance = Object.values(shares).reduce((s, v) => s + (v || 0), 0);
      tx.update(clubRef, { shares, balance: newBalance });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('chargeEachMemberShare failed', err);
    return 'invalid';
  }
}

/**
 * Deposit one Tournament Entry Pass from a player's inventory into the club
 * voucher pool. Atomic — burns the voucher, increments `club.vouchers` AND
 * `club.vouchersByMember[playerUid]` so we know who owns it.
 */
export async function depositVoucherToClub(clubId: string, playerUid: string): Promise<'ok' | 'no-voucher' | 'not-member' | 'invalid'> {
  try {
    return await runTransaction(db, async (tx) => {
      const playerRef = doc(db, 'players', playerUid);
      const clubRef = doc(db, 'clubs', clubId);
      const [playerSnap, clubSnap] = await Promise.all([tx.get(playerRef), tx.get(clubRef)]);
      if (!playerSnap.exists() || !clubSnap.exists()) return 'invalid' as const;
      const player = playerSnap.data() as any;
      const club = clubSnap.data() as any;
      if (!(club.members || []).includes(playerUid)) return 'not-member' as const;

      const inventory: any[] = player.inventory || [];
      let burned = false;
      const newInv = inventory.map((it: any) => {
        if (!burned && it && it.name === 'Tournament Entry Pass' && !it.used) {
          burned = true;
          return { ...it, used: true };
        }
        return it;
      });
      if (!burned) return 'no-voucher' as const;

      const byMember = { ...(club.vouchersByMember || {}) };
      byMember[playerUid] = (byMember[playerUid] || 0) + 1;

      tx.update(playerRef, { inventory: newInv });
      tx.update(clubRef, { vouchers: increment(1), vouchersByMember: byMember });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('depositVoucherToClub failed', err);
    return 'invalid';
  }
}

/**
 * Withdraw ONE of the caller's own deposited vouchers back to their inventory.
 * Only the original depositor can withdraw their vouchers — nobody can touch
 * another member's deposits.
 */
export async function withdrawVoucherFromClub(clubId: string, playerUid: string): Promise<'ok' | 'none-owned' | 'not-member' | 'invalid'> {
  try {
    return await runTransaction(db, async (tx) => {
      const playerRef = doc(db, 'players', playerUid);
      const clubRef = doc(db, 'clubs', clubId);
      const [playerSnap, clubSnap] = await Promise.all([tx.get(playerRef), tx.get(clubRef)]);
      if (!playerSnap.exists() || !clubSnap.exists()) return 'invalid' as const;
      const player = playerSnap.data() as any;
      const club = clubSnap.data() as any;
      if (!(club.members || []).includes(playerUid)) return 'not-member' as const;
      const byMember = { ...(club.vouchersByMember || {}) };
      const owned = byMember[playerUid] || 0;
      if (owned <= 0) return 'none-owned' as const;
      byMember[playerUid] = owned - 1;
      const currentTotal = club.vouchers || 0;

      const newVoucher = {
        id: `tournament_pass_${Date.now()}`,
        type: 'ticket',
        name: 'Tournament Entry Pass',
        rarity: 'rare',
        value: 0,
        obtainedAt: Date.now(),
        used: false,
        tradeable: true,
      };
      const inventory: any[] = player.inventory || [];
      tx.update(playerRef, { inventory: [...inventory, newVoucher] });
      tx.update(clubRef, {
        vouchers: Math.max(0, currentTotal - 1),
        vouchersByMember: byMember,
      });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('withdrawVoucherFromClub failed', err);
    return 'invalid';
  }
}

/**
 * Consume N vouchers from the club pool atomically. When decrementing the
 * total pool count, we also decrement `vouchersByMember` entries in order
 * (first depositor first) so ownership stays consistent.
 */
export async function consumeClubVouchers(clubId: string, count: number): Promise<'ok' | 'insufficient' | 'invalid'> {
  if (!Number.isFinite(count) || count <= 0) return 'invalid';
  try {
    return await runTransaction(db, async (tx) => {
      const clubRef = doc(db, 'clubs', clubId);
      const snap = await tx.get(clubRef);
      if (!snap.exists()) return 'invalid' as const;
      const club = snap.data() as any;
      const available = club.vouchers || 0;
      if (available < count) return 'insufficient' as const;

      // Decrement from the byMember ledger in entry order.
      const byMember = { ...(club.vouchersByMember || {}) };
      let remaining = count;
      for (const uid of Object.keys(byMember)) {
        if (remaining <= 0) break;
        const owned = byMember[uid] || 0;
        const take = Math.min(owned, remaining);
        byMember[uid] = owned - take;
        remaining -= take;
      }
      tx.update(clubRef, { vouchers: increment(-count), vouchersByMember: byMember });
      return 'ok' as const;
    });
  } catch (err) {
    console.error('consumeClubVouchers failed', err);
    return 'invalid';
  }
}

/** Add prize tokens to the club treasury, split evenly across current members. */
export async function depositPrizeToClub(clubId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  try {
    await runTransaction(db, async (tx) => {
      const clubRef = doc(db, 'clubs', clubId);
      const snap = await tx.get(clubRef);
      if (!snap.exists()) return;
      const club = snap.data() as any;
      const members: string[] = club.members || [];
      const splits = splitAmount(amount, members, club.leaderUid);
      const newShares: Record<string, number> = { ...(club.shares || {}) };
      for (const uid of members) newShares[uid] = (newShares[uid] || 0) + (splits[uid] || 0);
      const newBalance = Object.values(newShares).reduce((s, v) => s + (v || 0), 0);
      tx.update(clubRef, { shares: newShares, balance: newBalance });
    });
  } catch (err) {
    console.error('depositPrizeToClub failed', err);
  }
}

export async function inviteToClub(params: {
  clubId: string;
  clubName: string;
  clubTag: string;
  from: string;
  fromUsername: string;
  to: string;
}): Promise<'ok' | 'already-pending' | 'already-in-club'> {
  const { clubId, clubName, clubTag, from, fromUsername, to } = params;
  // Reject if target already in a club
  const target = await getDoc(doc(db, 'players', to));
  if (target.exists() && target.data().clubId) return 'already-in-club';
  // Reject if an active pending invite already exists
  const existing = await getDocs(query(
    collection(db, 'club-invites'),
    where('clubId', '==', clubId),
    where('to', '==', to),
    where('status', '==', 'pending'),
  ));
  if (!existing.empty) return 'already-pending';
  await addDoc(collection(db, 'club-invites'), {
    clubId, clubName, clubTag,
    from, fromUsername, to,
    status: 'pending',
    createdAt: Date.now(),
  });
  return 'ok';
}

export async function acceptClubInvite(inviteId: string, playerUid: string): Promise<'ok' | 'full' | 'gone' | 'already-in-club'> {
  const inviteRef = doc(db, 'club-invites', inviteId);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) return 'gone';
  const invite = inviteSnap.data() as any;
  if (invite.status !== 'pending') return 'gone';
  // Re-check player isn't already in a club
  const playerSnap = await getDoc(doc(db, 'players', playerUid));
  if (playerSnap.exists() && playerSnap.data().clubId) return 'already-in-club';
  // Re-check club has space
  const clubRef = doc(db, 'clubs', invite.clubId);
  const clubSnap = await getDoc(clubRef);
  if (!clubSnap.exists()) return 'gone';
  const club = clubSnap.data() as any;
  if ((club.members || []).length >= CLUB_MAX_MEMBERS) return 'full';

  const batch = writeBatch(db);
  batch.update(clubRef, { members: arrayUnion(playerUid) });
  batch.update(doc(db, 'players', playerUid), { clubId: invite.clubId });
  batch.update(inviteRef, { status: 'accepted' });
  await batch.commit();
  return 'ok';
}

export async function declineClubInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'club-invites', inviteId), { status: 'declined' });
}

export async function leaveClub(clubId: string, playerUid: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  const clubSnap = await getDoc(clubRef);
  if (!clubSnap.exists()) {
    // Club gone, just clear player ref
    await updateDoc(doc(db, 'players', playerUid), { clubId: null });
    return;
  }
  const club = clubSnap.data() as any;
  const remaining = (club.members || []).filter((m: string) => m !== playerUid);

  const batch = writeBatch(db);
  // If leader leaves or last member: delete the club
  if (club.leaderUid === playerUid || remaining.length === 0) {
    batch.delete(clubRef);
    // Clear clubId for all remaining members too
    for (const memberUid of remaining) {
      batch.update(doc(db, 'players', memberUid), { clubId: null });
    }
  } else {
    batch.update(clubRef, { members: arrayRemove(playerUid) });
  }
  batch.update(doc(db, 'players', playerUid), { clubId: null });
  await batch.commit();
}

export async function disbandClub(clubId: string, leaderUid: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  const clubSnap = await getDoc(clubRef);
  if (!clubSnap.exists()) return;
  const club = clubSnap.data() as any;
  if (club.leaderUid !== leaderUid) throw new Error('Only the leader can disband the club');
  const batch = writeBatch(db);
  for (const memberUid of club.members || []) {
    batch.update(doc(db, 'players', memberUid), { clubId: null });
  }
  batch.delete(clubRef);
  await batch.commit();
}

export async function kickMember(clubId: string, memberUid: string, actingLeaderUid: string): Promise<void> {
  const clubRef = doc(db, 'clubs', clubId);
  const clubSnap = await getDoc(clubRef);
  if (!clubSnap.exists()) return;
  const club = clubSnap.data() as any;
  if (club.leaderUid !== actingLeaderUid) throw new Error('Only the leader can kick members');
  if (memberUid === actingLeaderUid) throw new Error('Leader cannot kick themselves — disband instead');

  const batch = writeBatch(db);
  batch.update(clubRef, { members: arrayRemove(memberUid) });
  batch.update(doc(db, 'players', memberUid), { clubId: null });
  await batch.commit();
}
