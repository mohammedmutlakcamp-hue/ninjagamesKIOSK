'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, increment, arrayUnion, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { Tournament, TournamentParticipant } from '@/types/tournament';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import { Club, CLUB_MAX_MEMBERS, chargeEachMemberShare, clubShareOf, consumeClubVouchers } from '@/lib/clubs';
import { personalCoinCost } from '@/lib/pricing';
import { useEscapeKey } from '@/lib/useEscapeKey';
import {
  Trophy, Coins, Users, Clock, Swords, Calendar, ChevronRight,
  X, Check, AlertTriangle, Shield, Award, Ticket, Star, Crown, Flame, User, Lock,
} from 'lucide-react';

interface Props {
  player: any;
}

const getGameImage = (gameName: string) => {
  const game = GAMES_CATALOG.find(g => g.name.toLowerCase().includes(gameName.toLowerCase()) || gameName.toLowerCase().includes(g.name.toLowerCase()));
  return game ? game.coverImage : null;
};

const getGameBanner = (gameName: string) => {
  const game = GAMES_CATALOG.find(g => g.name.toLowerCase().includes(gameName.toLowerCase()) || gameName.toLowerCase().includes(g.name.toLowerCase()));
  return game?.bannerImage || game?.coverImage || null;
};

export function TournamentTab({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [view, setView] = useState<'all' | 'active' | 'past'>('all');
  // Registration mode picker (Single vs Club). Only shown when the player is in a club.
  const [regChoiceTournament, setRegChoiceTournament] = useState<Tournament | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [clubLoading, setClubLoading] = useState(false);
  // PIN gate — confirm the player's 6-digit PIN before committing to a tournament
  const [pinGateTournament, setPinGateTournament] = useState<Tournament | null>(null);
  const [gatePin, setGatePin] = useState('');
  const [gatePinError, setGatePinError] = useState('');
  useEscapeKey(() => setPinGateTournament(null), pinGateTournament !== null);
  useEscapeKey(() => setRegChoiceTournament(null), regChoiceTournament !== null && pinGateTournament === null);
  useEscapeKey(() => setSelectedTournament(null), selectedTournament !== null && regChoiceTournament === null && pinGateTournament === null);

  // Subscribe to the player's club (if any), so registration choices show up correctly.
  useEffect(() => {
    if (!player?.clubId) { setClub(null); return; }
    setClubLoading(true);
    const unsub = onSnapshot(doc(db, 'clubs', player.clubId), (snap) => {
      if (snap.exists()) setClub({ id: snap.id, ...(snap.data() as any) });
      else setClub(null);
      setClubLoading(false);
    });
    return () => unsub();
  }, [player?.clubId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tournaments'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Tournament))
        .filter(t => t.status !== 'cancelled')
        .sort((a, b) => b.startTime - a.startTime);
      setTournaments(data);
    });
    return () => unsub();
  }, []);

  const isRegistered = (t: Tournament) => t.participants?.some(p => p.playerId === player.uid);
  const hasTournamentPass = () => (player.inventory || []).some((item: any) => item.name === 'Tournament Entry Pass' && !item.used);

  // Entry point from the UI. If the player is in a club (any size), show the
  // Single/Club picker so they can choose treasury vs personal entry. Players
  // with no club go straight to solo registration.
  const handleJoinClick = (t: Tournament) => {
    setJoinError('');
    if (club) {
      setRegChoiceTournament(t);
    } else {
      joinAsSingle(t);
    }
  };

  const joinAsSingle = async (t: Tournament) => {
    if (joining) return;
    setJoining(true); setJoinError('');
    if (isRegistered(t)) { setJoinError(ar ? 'مسجّل بالفعل!' : 'Already registered!'); setJoining(false); return; }
    if ((t.participants?.length || 0) >= t.maxPlayers) { setJoinError(ar ? 'البطولة ممتلئة!' : 'Tournament is full!'); setJoining(false); return; }
    const hasPass = hasTournamentPass();
    const entryCost = personalCoinCost(t.entryFee, player);
    if (!hasPass && player.coins < entryCost) { setJoinError(ar ? 'التوكنز غير كافية!' : 'Not enough tokens!'); setJoining(false); return; }
    try {
      if (hasPass) {
        let found = false;
        const finalInventory = (player.inventory || []).map((inv: any) => { if (!found && inv.name === 'Tournament Entry Pass' && !inv.used) { found = true; return { ...inv, used: true }; } return inv; });
        await updateDoc(doc(db, 'players', player.uid), { inventory: finalInventory });
      } else {
        await updateDoc(doc(db, 'players', player.uid), { coins: increment(-entryCost), totalCoinsSpent: increment(entryCost) });
      }
      const participant: TournamentParticipant = {
        playerId: player.uid, playerName: player.username,
        registeredAt: Date.now(), paid: true, seed: null, eliminated: false,
        registrationMode: 'single',
      };
      await updateDoc(doc(db, 'tournaments', t.id), { participants: arrayUnion(participant) });
      setSelectedTournament({ ...t, participants: [...(t.participants || []), participant] });
      setRegChoiceTournament(null);
    } catch { setJoinError(ar ? 'فشل الانضمام.' : 'Failed to join.'); }
    setJoining(false);
  };

  // Register as a club. Each member's entry is individually paid with EITHER:
  //   (a) a Tournament Entry Pass from their own inventory (burned on use), or
  //   (b) their personal cut of the club treasury (entryFee tokens).
  // If any member has neither, the whole registration aborts with that member's name.
  // Prizes from this tournament are routed back to the club treasury (rewardsTo: 'club').
  const joinAsClub = async (t: Tournament) => {
    if (joining || !club) return;
    setJoining(true); setJoinError('');
    try {
      const existingIds = new Set((t.participants || []).map(p => p.playerId));
      const alreadyRegistered = club.members.filter(uid => existingIds.has(uid));
      if (alreadyRegistered.length > 0) {
        setJoinError(ar ? 'أحد أعضاء ناديك مسجّل بالفعل. اتركه أو حلّ النادي أولاً.' : 'One of your club members is already registered. Leave or disband first.');
        setJoining(false); return;
      }
      const openSlots = t.maxPlayers - (t.participants?.length || 0);
      if (openSlots < club.members.length) {
        setJoinError(ar ? `لا توجد مساحة كافية — المتبقي ${openSlots} مقعد، النادي يحتاج ${club.members.length}.` : `Not enough space — tournament has ${openSlots} slot${openSlots === 1 ? '' : 's'} left, club needs ${club.members.length}.`);
        setJoining(false); return;
      }

      // Fetch each member's live doc so we can check inventory (vouchers) and username.
      type MemberInfo = { uid: string; username: string; inventory: any[]; hasVoucher: boolean };
      const memberInfos: MemberInfo[] = [];
      for (const uid of club.members) {
        try {
          const snap = await getDoc(doc(db, 'players', uid));
          const data = snap.exists() ? (snap.data() as any) : {};
          const inv = (data.inventory || []) as any[];
          const hasVoucher = inv.some(it => it && it.name === 'Tournament Entry Pass' && !it.used);
          memberInfos.push({
            uid,
            username: data.username || 'Unknown',
            inventory: inv,
            hasVoucher,
          });
        } catch {
          memberInfos.push({ uid, username: 'Unknown', inventory: [], hasVoucher: false });
        }
      }

      // Allocation strategy per member (in order):
      //   1) Burn the member's OWN Tournament Entry Pass if they have one
      //   2) Else consume one from the club voucher pool
      //   3) Else charge entryFee from the member's personal share
      const pooledAvailable = club.vouchers || 0;
      let pooledBudget = pooledAvailable;
      const memberAllocation: { m: MemberInfo; method: 'own-voucher' | 'pool-voucher' | 'share' }[] = [];
      for (const m of memberInfos) {
        if (m.hasVoucher) memberAllocation.push({ m, method: 'own-voucher' });
        else if (pooledBudget > 0) { memberAllocation.push({ m, method: 'pool-voucher' }); pooledBudget--; }
        else memberAllocation.push({ m, method: 'share' });
      }

      // Pre-flight: members on the 'share' track must have enough in their cut.
      const shortfall = memberAllocation.find(a => a.method === 'share' && clubShareOf(club, a.m.uid) < t.entryFee);
      if (shortfall) {
        const mine = clubShareOf(club, shortfall.m.uid);
        const needCount = memberAllocation.filter(a => a.method === 'share').length;
        const totalNeeded = needCount * t.entryFee;
        setJoinError(ar ? `حصة ${shortfall.m.username} من الخزينة منخفضة (${mine}/${t.entryFee}). النادي يحتاج ${totalNeeded} توكن لـ ${needCount} عضو غير مغطى، أو أضف المزيد من التذاكر.` : `${shortfall.m.username}'s treasury share is too low (${mine}/${t.entryFee}). Club needs ${totalNeeded} tokens for ${needCount} uncovered member${needCount === 1 ? '' : 's'}, or add more vouchers.`);
        setJoining(false); return;
      }

      // Phase 1: burn personal vouchers.
      for (const a of memberAllocation.filter(x => x.method === 'own-voucher')) {
        let burned = false;
        const newInv = a.m.inventory.map((it: any) => {
          if (!burned && it && it.name === 'Tournament Entry Pass' && !it.used) {
            burned = true;
            return { ...it, used: true };
          }
          return it;
        });
        try {
          await updateDoc(doc(db, 'players', a.m.uid), { inventory: newInv });
        } catch (err) {
          console.error('voucher burn failed for', a.m.uid, err);
          setJoinError(ar ? 'فشل استخدام التذكرة، حاول مرة أخرى.' : 'Failed to burn voucher, try again.');
          setJoining(false); return;
        }
      }

      // Phase 2: consume pooled vouchers.
      const pooledUsed = memberAllocation.filter(a => a.method === 'pool-voucher').length;
      if (pooledUsed > 0) {
        const poolResult = await consumeClubVouchers(club.id, pooledUsed);
        if (poolResult !== 'ok') {
          setJoinError(poolResult === 'insufficient' ? (ar ? 'نفدت تذاكر النادي. أودع المزيد.' : 'Club voucher pool ran out. Deposit more.') : (ar ? 'فشل استخدام تذاكر النادي.' : 'Failed to use pooled vouchers.'));
          setJoining(false); return;
        }
      }

      // Phase 3: charge entryFee to each share-paying member (atomic transaction).
      const shareUids = memberAllocation.filter(a => a.method === 'share').map(a => a.m.uid);
      if (shareUids.length > 0) {
        const exempt = memberAllocation.filter(a => a.method !== 'share').map(a => a.m.uid);
        const result = await chargeEachMemberShare(club.id, t.entryFee, exempt);
        if (result !== 'ok') {
          if (typeof result === 'object' && result.error === 'insufficient') {
            const offender = memberInfos.find(m => m.uid === result.offender);
            setJoinError(ar ? `نفدت حصة ${offender?.username || 'أحد الأعضاء'}.` : `${offender?.username || 'A member'}'s share ran out.`);
          } else {
            setJoinError(ar ? 'فشل خصم المبلغ من خزينة النادي.' : 'Failed to charge club treasury.');
          }
          setJoining(false); return;
        }
      }

      // Phase 3: build participant entries and append to the tournament doc.
      const participants: TournamentParticipant[] = memberInfos.map(m => ({
        playerId: m.uid,
        playerName: m.username,
        registeredAt: Date.now(),
        paid: true,
        seed: null,
        eliminated: false,
        registrationMode: 'club',
        clubId: club.id,
        clubName: club.name,
        clubTag: club.tag,
        registeredBy: player.uid,
        rewardsTo: 'club',
      }));
      const tSnap = await getDoc(doc(db, 'tournaments', t.id));
      if (!tSnap.exists()) throw new Error('Tournament gone');
      const tData = tSnap.data() as any;
      const newParticipants = [...(tData.participants || []), ...participants];
      await updateDoc(doc(db, 'tournaments', t.id), { participants: newParticipants });

      setSelectedTournament({ ...t, participants: newParticipants });
      setRegChoiceTournament(null);
    } catch (err) {
      console.error('Club registration failed', err);
      setJoinError(ar ? 'فشل تسجيل النادي.' : 'Failed to register club.');
    }
    setJoining(false);
  };

  const active = tournaments.filter(t => t.status === 'active');
  const upcoming = tournaments.filter(t => t.status === 'upcoming' || t.status === 'registration');
  const completed = tournaments.filter(t => t.status === 'completed');
  const filtered = view === 'active' ? [...active, ...upcoming] : view === 'past' ? completed : tournaments;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="relative h-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}>
      {/* ═══ Background HUD layers ═══ */}
      {/* PCB grid */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      {/* Hex pattern overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23FF6F00' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      {/* Radial glow spots */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 15% 10%, rgba(255,111,0,0.08) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(255,69,0,0.06) 0%, transparent 35%), radial-gradient(ellipse at 50% 50%, rgba(234,179,8,0.03) 0%, transparent 45%), radial-gradient(ellipse at 80% 20%, rgba(255,111,0,0.04) 0%, transparent 30%), radial-gradient(ellipse at 20% 80%, rgba(255,69,0,0.04) 0%, transparent 30%)',
      }} />
      {/* Top edge neon line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,111,0,0.4), rgba(255,69,0,0.25), rgba(234,179,8,0.2), transparent)', boxShadow: '0 0 12px rgba(255,111,0,0.18)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,69,0,0.18), rgba(234,179,8,0.12), transparent)' }} />
      <div className="absolute top-0 left-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(255,111,0,0.22), rgba(255,69,0,0.1), transparent)' }} />
      <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(255,69,0,0.18), rgba(234,179,8,0.1), transparent)' }} />
      {/* Floating orbs */}
      <div className="absolute left-[10%] top-[25%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(255,111,0,0.5) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(255,111,0,0.3)' }} />
      <div className="absolute right-[15%] top-[60%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(255,69,0,0.4) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(255,69,0,0.25)' }} />
      <div className="absolute left-[50%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(234,179,8,0.4) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(234,179,8,0.2)' }} />

      <div className="relative z-10 px-6 py-5 h-full overflow-y-auto overflow-x-hidden">
      {/* Header — HUD framed */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {/* Icon box with glow */}
          <div className="w-11 h-11 rounded-lg flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255,111,0,0.12), rgba(255,69,0,0.04))', border: '1px solid rgba(255,111,0,0.3)', boxShadow: '0 0 14px rgba(255,111,0,0.2)' }}>
            <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(255,111,0,0.5)', borderLeft: '1px solid rgba(255,111,0,0.5)' }} />
            <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(255,111,0,0.5)', borderRight: '1px solid rgba(255,111,0,0.5)' }} />
            <Flame size={22} style={{ color: '#FF6F00', filter: 'drop-shadow(0 0 6px rgba(255,111,0,0.7))' }} />
          </div>
          <div>
            <h2 className="font-ninja text-3xl tracking-wider flex items-center gap-3" style={{ color: '#FF6F00', textShadow: '0 0 20px rgba(255,111,0,0.4)' }}>
              {ar ? 'البطولات' : 'TOURNAMENTS'}
            </h2>
            <p className="font-body text-gray-400 text-sm mt-0.5">{ar ? 'تنافس من أجل المجد والجوائز الضخمة!' : 'Compete for glory and massive prizes!'}</p>
          </div>
          {/* Trailing accent line */}
          <div className="h-[1px] flex-1 min-w-[40px] ml-2" style={{ background: 'linear-gradient(90deg, rgba(255,111,0,0.4), rgba(255,69,0,0.2), transparent)', boxShadow: '0 0 6px rgba(255,111,0,0.15)' }} />
        </div>
        {/* Filter tabs — HUD nav button style */}
        <div className="flex gap-2">
          {(['all', 'active', 'past'] as const).map(v => {
            const isActive = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className="relative px-5 py-2 rounded-lg font-ninja text-xs tracking-wider transition-all overflow-hidden"
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(255,111,0,0.15), rgba(255,69,0,0.05))',
                  border: '1px solid rgba(255,111,0,0.4)',
                  color: '#FF6F00',
                  boxShadow: '0 0 14px rgba(255,111,0,0.18), inset 0 0 10px rgba(255,111,0,0.06)',
                  textShadow: '0 0 8px rgba(255,111,0,0.5)',
                } : {
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005))',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#666',
                }}>
                {/* HUD corners — visible when active */}
                {isActive && <>
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #FF6F00', borderLeft: '2px solid #FF6F00' }} />
                  <div className="absolute top-0 right-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(255,69,0,0.6)', borderRight: '2px solid rgba(255,69,0,0.6)' }} />
                  <div className="absolute bottom-0 left-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(255,69,0,0.6)', borderLeft: '2px solid rgba(255,69,0,0.6)' }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #FF6F00', borderRight: '2px solid #FF6F00' }} />
                  {/* Active left indicator bar */}
                  <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#FF6F00', boxShadow: '0 0 8px #FF6F00, 0 0 14px rgba(255,111,0,0.4)' }} />
                  {/* Top accent */}
                  <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,111,0,0.6), transparent)' }} />
                </>}
                <span className="relative z-[1]">{v === 'all' ? (ar ? 'الكل' : 'ALL') : v === 'active' ? (ar ? 'نشط' : 'ACTIVE') : (ar ? 'منتهي' : 'PAST')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 relative">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 relative" style={{ background: 'linear-gradient(135deg, rgba(255,111,0,0.06), rgba(255,69,0,0.02))', border: '1px solid rgba(255,111,0,0.15)' }}>
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(255,111,0,0.4)', borderLeft: '2px solid rgba(255,111,0,0.4)' }} />
            <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(255,69,0,0.3)', borderRight: '2px solid rgba(255,69,0,0.3)' }} />
            <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,69,0,0.3)', borderLeft: '2px solid rgba(255,69,0,0.3)' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,111,0,0.4)', borderRight: '2px solid rgba(255,111,0,0.4)' }} />
            <Trophy size={40} className="text-gray-700" />
          </div>
          <p className="font-ninja text-xl text-gray-500 tracking-wider" style={{ textShadow: '0 0 10px rgba(255,111,0,0.1)' }}>{ar ? 'لا توجد بطولات بعد' : 'NO TOURNAMENTS YET'}</p>
          <p className="font-body text-gray-700 mt-2">{ar ? 'عد قريباً!' : 'Check back soon!'}</p>
        </div>
      ) : (
        <>
          {/* Section header — HUD */}
          <div className="flex items-center gap-3 mb-4 max-w-5xl mx-auto">
            <div className="w-8 h-8 rounded-md flex items-center justify-center relative" style={{ background: 'rgba(255,111,0,0.1)', border: '1px solid rgba(255,111,0,0.3)', boxShadow: '0 0 10px rgba(255,111,0,0.18)' }}>
              <Trophy size={15} style={{ color: '#FF6F00', filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.6))' }} />
            </div>
            <span className="font-ninja text-sm text-orange-400 tracking-[0.2em]" style={{ textShadow: '0 0 10px rgba(255,111,0,0.35)' }}>
              {view === 'active' ? (ar ? 'البطولات النشطة' : 'ACTIVE TOURNAMENTS') : view === 'past' ? (ar ? 'البطولات السابقة' : 'PAST TOURNAMENTS') : (ar ? 'كل البطولات' : 'ALL TOURNAMENTS')}
            </span>
            <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,111,0,0.4), rgba(255,69,0,0.18), transparent)', boxShadow: '0 0 6px rgba(255,111,0,0.15)' }} />
            <span className="font-ninja text-[10px] text-gray-500 tracking-wider">{filtered.length} {ar ? 'المجموع' : 'TOTAL'}</span>
          </div>

          <div className="space-y-4 max-w-5xl mx-auto">
          {filtered.map((t, i) => {
            const gameImg = getGameImage(t.game);
            const gameBanner = getGameBanner(t.game);
            const registered = isRegistered(t);
            const isLive = t.status === 'active';
            const isCompleted = t.status === 'completed';
            const isOpen = t.status === 'registration';
            const winner = t.results?.[0];
            const statusColor = isLive ? '#facc15' : isOpen ? '#39FF14' : isCompleted ? '#666' : '#3b82f6';
            const tournamentColor = isCompleted ? '#666' : '#FF6F00';

            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.01 }}
                onClick={() => setSelectedTournament(t)}
                className="rounded-2xl overflow-hidden cursor-pointer transition-all relative group"
                style={{
                  background: `linear-gradient(180deg, ${tournamentColor}0A 0%, #040608 40%, #030508 100%)`,
                  border: `1px solid ${tournamentColor}25`,
                  boxShadow: isLive ? `0 0 28px ${statusColor}20, 0 0 50px ${tournamentColor}08` : `0 0 24px ${tournamentColor}08`,
                }}>
                {/* PCB grid inside card */}
                <div className="absolute inset-0 pointer-events-none z-[1]" style={{
                  backgroundImage: `linear-gradient(${tournamentColor}08 1px, transparent 1px), linear-gradient(90deg, ${tournamentColor}08 1px, transparent 1px)`,
                  backgroundSize: '30px 30px',
                  opacity: 0.3,
                }} />
                {/* HUD corners — all 4 (orange/red tournament theme) */}
                <div className="absolute top-0 left-0 w-5 h-5 z-[3] pointer-events-none" style={{ borderTop: `2px solid ${tournamentColor}`, borderLeft: `2px solid ${tournamentColor}` }} />
                <div className="absolute top-0 right-0 w-5 h-5 z-[3] pointer-events-none" style={{ borderTop: '2px solid rgba(255,69,0,0.5)', borderRight: '2px solid rgba(255,69,0,0.5)' }} />
                <div className="absolute bottom-0 left-0 w-5 h-5 z-[3] pointer-events-none" style={{ borderBottom: '2px solid rgba(255,69,0,0.5)', borderLeft: '2px solid rgba(255,69,0,0.5)' }} />
                <div className="absolute bottom-0 right-0 w-5 h-5 z-[3] pointer-events-none" style={{ borderBottom: `2px solid ${tournamentColor}`, borderRight: `2px solid ${tournamentColor}` }} />
                {/* Top neon accent line with glow */}
                <div className="absolute top-0 left-0 right-0 h-[2px] z-[3] pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${tournamentColor}, rgba(255,69,0,0.6), transparent)`, boxShadow: `0 0 14px ${tournamentColor}50` }} />
                {/* Bottom accent */}
                <div className="absolute bottom-0 left-0 right-0 h-[1px] z-[3] pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${tournamentColor}50, transparent)` }} />
                {/* Left vertical glow bar */}
                <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[3] pointer-events-none" style={{ background: tournamentColor, boxShadow: `0 0 8px ${tournamentColor}, 0 0 16px ${tournamentColor}60`, opacity: 0.45 }} />
                {/* Right vertical glow bar */}
                <div className="absolute right-0 top-[15%] bottom-[15%] w-[2px] z-[3] pointer-events-none" style={{ background: tournamentColor, boxShadow: `0 0 8px ${tournamentColor}`, opacity: 0.2 }} />
                {/* Glow orb in corner */}
                <div className="absolute top-3 left-3 w-2 h-2 rounded-full z-[3] pointer-events-none" style={{ background: tournamentColor, boxShadow: `0 0 10px ${tournamentColor}, 0 0 18px ${tournamentColor}80` }} />
                {/* Radial glow overlay */}
                <div className="absolute inset-0 pointer-events-none z-[1]" style={{ background: `radial-gradient(ellipse at 20% 0%, ${tournamentColor}14 0%, transparent 45%)` }} />

                {/* Banner with game image */}
                <div className="h-32 relative overflow-hidden z-[2]">
                  {gameBanner ? (
                    <img src={gameBanner} alt={t.game} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${tournamentColor}15, rgba(10,10,14,0.95))` }} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                  {/* Orange wash overlay */}
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${tournamentColor}15 0%, transparent 40%, transparent 60%, ${tournamentColor}10 100%)` }} />
                  {/* Status badge — HUD style */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 rounded-md font-ninja text-[10px] relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${statusColor}20, ${statusColor}08)`, border: `1px solid ${statusColor}50`, color: statusColor, backdropFilter: 'blur(8px)', boxShadow: `0 0 10px ${statusColor}25`, textShadow: `0 0 6px ${statusColor}80` }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${statusColor}80`, borderLeft: `1px solid ${statusColor}80` }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1px solid ${statusColor}80`, borderRight: `1px solid ${statusColor}80` }} />
                    {isLive && <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full relative" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />}
                    <span className="relative z-[1]">{isLive ? (ar ? 'مباشر' : 'LIVE') : isOpen ? (ar ? 'مفتوح' : 'OPEN') : isCompleted ? (ar ? 'منتهي' : 'ENDED') : (ar ? 'قريبا' : 'UPCOMING')}</span>
                  </div>
                  {registered && (
                    <div className="absolute top-3 left-8 flex items-center gap-1 px-2 py-0.5 rounded-md font-ninja text-[9px] relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(57,255,20,0.06))', border: '1px solid rgba(57,255,20,0.4)', color: '#39FF14', backdropFilter: 'blur(8px)', boxShadow: '0 0 8px rgba(57,255,20,0.25)', textShadow: '0 0 6px rgba(57,255,20,0.6)' }}>
                      <Check size={10} /> {ar ? 'انضممت' : 'JOINED'}
                    </div>
                  )}
                  {/* Tournament name over banner */}
                  <div className="absolute bottom-3 left-5">
                    <h3 className="font-ninja text-2xl text-white tracking-wider" style={{ textShadow: `0 2px 12px rgba(0,0,0,0.9), 0 0 18px ${tournamentColor}40` }}>{t.name}</h3>
                    <p className="font-body text-sm text-gray-300">{t.game} <span style={{ color: tournamentColor }}>·</span> {t.format?.toUpperCase()}</p>
                  </div>
                </div>

                {/* Info row */}
                <div className="flex items-center justify-between px-5 py-4 relative z-[2]" style={{ background: 'linear-gradient(180deg, rgba(10,10,14,0.95), rgba(4,6,8,0.98))', borderTop: `1px solid ${tournamentColor}20` }}>
                  <div className="flex items-center gap-3">
                    {/* Prize info — HUD-bordered box */}
                    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.02))', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 10px rgba(234,179,8,0.1)' }}>
                      <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(234,179,8,0.5)', borderLeft: '1px solid rgba(234,179,8,0.5)' }} />
                      <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(234,179,8,0.5)', borderRight: '1px solid rgba(234,179,8,0.5)' }} />
                      <Coins size={14} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />
                      <span className="font-ninja text-base text-yellow-300" style={{ textShadow: '0 0 8px rgba(234,179,8,0.4)' }}>{t.prizePool}</span>
                      <span className="text-gray-500 text-[10px] font-body uppercase tracking-wider">{ar ? 'الجائزة' : 'prize'}</span>
                    </div>

                    {/* Players */}
                    <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)' }}>
                      <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(59,130,246,0.4)', borderLeft: '1px solid rgba(59,130,246,0.4)' }} />
                      <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.4)', borderRight: '1px solid rgba(59,130,246,0.4)' }} />
                      <Users size={13} className="text-blue-400" />
                      <span className="font-ninja text-sm text-blue-300">{t.participants?.length || 0}/{t.maxPlayers}</span>
                    </div>

                    {/* Entry */}
                    <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.2)', borderLeft: '1px solid rgba(255,255,255,0.2)' }} />
                      <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.2)' }} />
                      <Coins size={12} className="text-gray-400" />
                      <span className="font-body text-xs text-gray-300">{t.entryFee} {ar ? 'رسوم' : 'entry'}</span>
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-1.5 font-body text-xs text-gray-500">
                      <Clock size={13} /> {new Date(t.startTime).toLocaleDateString()}
                    </div>
                  </div>
                  {/* Winner for completed */}
                  {isCompleted && winner && (
                    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.02))', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 10px rgba(234,179,8,0.1)' }}>
                      <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(234,179,8,0.5)', borderLeft: '1px solid rgba(234,179,8,0.5)' }} />
                      <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(234,179,8,0.5)', borderRight: '1px solid rgba(234,179,8,0.5)' }} />
                      <Crown size={14} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.7))' }} />
                      <span className="font-ninja text-sm text-yellow-300" style={{ textShadow: '0 0 8px rgba(234,179,8,0.35)' }}>{winner.playerName}</span>
                    </div>
                  )}
                  {!isCompleted && (
                    <div className="flex items-center gap-1 text-orange-400 group-hover:translate-x-1 transition-transform">
                      <span className="font-ninja text-[10px] tracking-wider opacity-60">{ar ? 'عرض' : 'VIEW'}</span>
                      <ChevronRight size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.5))' }} />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          </div>
        </>
      )}
      </div>

      {/* Tournament Detail Modal */}
      <AnimatePresence>
        {selectedTournament && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { setSelectedTournament(null); setJoinError(''); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative overflow-hidden rounded-2xl w-[700px] max-w-[95vw] max-h-[85vh] overflow-y-auto overflow-x-hidden"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(255,111,0,0.2)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 50px rgba(255,111,0,0.08)' }}
              onClick={e => e.stopPropagation()}>
              {/* HUD corner brackets — all 4 */}
              <div className="absolute top-0 left-0 w-5 h-5 pointer-events-none z-[5]" style={{ borderTop: '2px solid rgba(255,111,0,0.6)', borderLeft: '2px solid rgba(255,111,0,0.6)' }} />
              <div className="absolute top-0 right-0 w-5 h-5 pointer-events-none z-[5]" style={{ borderTop: '2px solid rgba(255,69,0,0.4)', borderRight: '2px solid rgba(255,69,0,0.4)' }} />
              <div className="absolute bottom-0 left-0 w-5 h-5 pointer-events-none z-[5]" style={{ borderBottom: '2px solid rgba(255,69,0,0.4)', borderLeft: '2px solid rgba(255,69,0,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-5 h-5 pointer-events-none z-[5]" style={{ borderBottom: '2px solid rgba(255,111,0,0.6)', borderRight: '2px solid rgba(255,111,0,0.6)' }} />
              {/* Top neon accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[5]" style={{ background: 'linear-gradient(90deg, rgba(255,111,0,0.6), rgba(255,69,0,0.3), rgba(234,179,8,0.2), transparent)', boxShadow: '0 0 14px rgba(255,111,0,0.3)' }} />
              {/* Bottom accent */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-[5]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,69,0,0.3), transparent)' }} />
              {/* Left glow bar */}
              <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] pointer-events-none z-[5]" style={{ background: '#FF6F00', boxShadow: '0 0 8px #FF6F00, 0 0 14px rgba(255,111,0,0.4)', opacity: 0.3 }} />
              {/* PCB grid bg */}
              <div className="absolute inset-0 pointer-events-none z-[1]" style={{
                backgroundImage: 'linear-gradient(rgba(255,111,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,111,0,0.04) 1px, transparent 1px)',
                backgroundSize: '30px 30px',
                opacity: 0.4,
              }} />

              {/* Banner header with glow overlay */}
              <div className="h-44 relative overflow-hidden z-[2]">
                {(() => { const b = getGameBanner(selectedTournament.game); return b ? <img src={b} alt="" className="w-full h-full object-cover object-top" /> : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, rgba(255,111,0,0.12), rgba(10,10,14,0.95))' }} />; })()}
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,14,1)] via-black/50 to-transparent" />
                {/* Orange glow overlay */}
                <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 100%, rgba(255,111,0,0.25) 0%, transparent 50%), linear-gradient(135deg, rgba(255,111,0,0.12) 0%, transparent 45%)' }} />
                {/* Banner bottom accent line */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #FF6F00, rgba(255,69,0,0.6), transparent)', boxShadow: '0 0 12px rgba(255,111,0,0.4)' }} />
                <button onClick={() => { setSelectedTournament(null); setJoinError(''); }}
                  className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:rotate-90 transition-all z-[6]"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,111,0,0.3)', backdropFilter: 'blur(8px)', boxShadow: '0 0 10px rgba(255,111,0,0.15)' }}>
                  <X size={18} />
                </button>
                <div className="absolute bottom-4 left-6">
                  <h3 className="font-ninja text-3xl text-white tracking-wider" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.9), 0 0 20px rgba(255,111,0,0.5)' }}>{selectedTournament.name}</h3>
                  <p className="font-body text-base text-gray-300">{selectedTournament.game} <span className="text-orange-400">·</span> {selectedTournament.format?.toUpperCase()}</p>
                </div>
              </div>

              <div className="px-6 pb-6 pt-4 space-y-5 relative z-[2]">
                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: ar ? 'الجائزة' : 'Prize Pool', value: selectedTournament.prizePool, icon: <Coins size={16} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />, color: 'text-yellow-400', accent: 'rgba(234,179,8,0.3)', bg: 'rgba(234,179,8,0.04)' },
                    { label: ar ? 'رسوم الدخول' : 'Entry Fee', value: selectedTournament.entryFee, icon: <Ticket size={16} className="text-orange-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.6))' }} />, color: 'text-orange-400', accent: 'rgba(255,111,0,0.3)', bg: 'rgba(255,111,0,0.04)' },
                    { label: ar ? 'اللاعبون' : 'Players', value: `${selectedTournament.participants?.length || 0}/${selectedTournament.maxPlayers}`, icon: <Users size={16} className="text-blue-400" style={{ filter: 'drop-shadow(0 0 4px rgba(59,130,246,0.6))' }} />, color: 'text-blue-400', accent: 'rgba(59,130,246,0.3)', bg: 'rgba(59,130,246,0.04)' },
                    { label: ar ? 'البداية' : 'Start', value: new Date(selectedTournament.startTime).toLocaleDateString(), icon: <Calendar size={16} className="text-gray-400" />, color: 'text-gray-300', accent: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.02)' },
                  ].map((s, i) => (
                    <div key={i} className="relative rounded-xl p-3 text-center overflow-hidden" style={{ background: s.bg, border: `1px solid ${s.accent}` }}>
                      <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: `1px solid ${s.accent}`, borderLeft: `1px solid ${s.accent}` }} />
                      <div className="absolute top-0 right-0 w-2.5 h-2.5" style={{ borderTop: `1px solid ${s.accent}`, borderRight: `1px solid ${s.accent}` }} />
                      <div className="absolute bottom-0 left-0 w-2.5 h-2.5" style={{ borderBottom: `1px solid ${s.accent}`, borderLeft: `1px solid ${s.accent}` }} />
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: `1px solid ${s.accent}`, borderRight: `1px solid ${s.accent}` }} />
                      <div className="flex justify-center mb-1.5 relative z-[1]">{s.icon}</div>
                      <p className={`font-ninja text-xl ${s.color} relative z-[1]`}>{s.value}</p>
                      <p className="font-body text-xs text-gray-500 uppercase mt-0.5 tracking-wider relative z-[1]">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Prize Distribution */}
                {selectedTournament.prizeDistribution?.length > 0 && (
                  <div className="relative rounded-xl p-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.05), rgba(234,179,8,0.015))', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 15px rgba(234,179,8,0.05)' }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(234,179,8,0.5)', borderLeft: '2px solid rgba(234,179,8,0.5)' }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(234,179,8,0.3)', borderRight: '2px solid rgba(234,179,8,0.3)' }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(234,179,8,0.3)', borderLeft: '2px solid rgba(234,179,8,0.3)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(234,179,8,0.5)', borderRight: '2px solid rgba(234,179,8,0.5)' }} />
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.5), transparent)' }} />
                    <div className="flex items-center gap-2 mb-3 relative z-[1]">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 8px rgba(234,179,8,0.15)' }}>
                        <Crown size={12} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />
                      </div>
                      <p className="font-ninja text-sm text-yellow-400 tracking-[0.15em]" style={{ textShadow: '0 0 8px rgba(234,179,8,0.4)' }}>{ar ? 'توزيع الجوائز' : 'PRIZE DISTRIBUTION'}</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(234,179,8,0.3), transparent)' }} />
                    </div>
                    <div className="space-y-2 relative z-[1]">
                      {selectedTournament.prizeDistribution.map((p, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-4 rounded-lg relative overflow-hidden" style={{ background: i === 0 ? 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.02))' : 'rgba(255,255,255,0.02)', border: `1px solid ${i === 0 ? 'rgba(234,179,8,0.25)' : 'rgba(255,255,255,0.04)'}` }}>
                          {i === 0 && <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#eab308', boxShadow: '0 0 6px #eab308', opacity: 0.5 }} />}
                          <span className="font-body text-base text-gray-300 flex items-center gap-2">
                            {i === 0 ? <Crown size={16} className="text-yellow-400" /> : i === 1 ? <Award size={14} className="text-gray-300" /> : <Award size={14} className="text-orange-400" />}
                            {p.position === 1 ? (ar ? 'الأول' : '1st') : p.position === 2 ? (ar ? 'الثاني' : '2nd') : p.position === 3 ? (ar ? 'الثالث' : '3rd') : `${p.position}th`} {ar ? '' : 'Place'}
                          </span>
                          <span className="font-ninja text-yellow-400 flex items-center gap-1" style={{ textShadow: '0 0 6px rgba(234,179,8,0.3)' }}><Coins size={13} /> {p.coins}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results for completed tournaments */}
                {selectedTournament.results?.length > 0 && (
                  <div className="relative rounded-xl p-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.04), rgba(57,255,20,0.01))', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 15px rgba(57,255,20,0.04)' }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.3)', borderRight: '2px solid rgba(57,255,20,0.3)' }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.3)', borderLeft: '2px solid rgba(57,255,20,0.3)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.5)', borderRight: '2px solid rgba(57,255,20,0.5)' }} />
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), transparent)' }} />
                    <div className="flex items-center gap-2 mb-3 relative z-[1]">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.3)', boxShadow: '0 0 8px rgba(57,255,20,0.15)' }}>
                        <Trophy size={12} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                      </div>
                      <p className="font-ninja text-xs text-ninja-green tracking-[0.15em]" style={{ textShadow: '0 0 8px rgba(57,255,20,0.4)' }}>{ar ? 'النتائج النهائية' : 'FINAL RESULTS'}</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent)' }} />
                    </div>
                    <div className="space-y-2 relative z-[1]">
                      {selectedTournament.results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg relative overflow-hidden"
                          style={{ background: i === 0 ? 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.02))' : 'rgba(255,255,255,0.015)', border: i === 0 ? '1px solid rgba(234,179,8,0.25)' : '1px solid rgba(255,255,255,0.05)' }}>
                          {i === 0 && <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#eab308', boxShadow: '0 0 6px #eab308', opacity: 0.5 }} />}
                          <div className="flex items-center gap-3">
                            {i === 0 ? <Crown size={18} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.7))' }} /> : <span className="font-ninja text-sm text-gray-500 w-5 text-center">#{r.position}</span>}
                            <span className={`font-ninja text-sm ${i === 0 ? 'text-yellow-400' : 'text-gray-300'}`} style={i === 0 ? { textShadow: '0 0 6px rgba(234,179,8,0.3)' } : undefined}>{r.playerName}</span>
                          </div>
                          <span className="font-ninja text-yellow-400 flex items-center gap-1"><Coins size={12} /> {r.prizeClaimed}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules */}
                {selectedTournament.rules && (
                  <div className="relative rounded-xl p-4 overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.2)', borderLeft: '1px solid rgba(255,255,255,0.2)' }} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.2)' }} />
                    <div className="flex items-center gap-2 mb-2 relative z-[1]">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Shield size={12} className="text-gray-400" />
                      </div>
                      <p className="font-ninja text-sm text-gray-400 tracking-[0.15em]">{ar ? 'القواعد' : 'RULES'}</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
                    </div>
                    <p className="font-body text-base text-gray-300 whitespace-pre-wrap leading-relaxed relative z-[1]">{selectedTournament.rules}</p>
                  </div>
                )}

                {/* Brackets */}
                {selectedTournament.brackets?.length > 0 && selectedTournament.status === 'active' && (
                  <div className="relative rounded-xl p-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(250,204,21,0.05), rgba(250,204,21,0.01))', border: '1px solid rgba(250,204,21,0.25)', boxShadow: '0 0 15px rgba(250,204,21,0.06)' }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(250,204,21,0.5)', borderLeft: '2px solid rgba(250,204,21,0.5)' }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(250,204,21,0.3)', borderRight: '2px solid rgba(250,204,21,0.3)' }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(250,204,21,0.3)', borderLeft: '2px solid rgba(250,204,21,0.3)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(250,204,21,0.5)', borderRight: '2px solid rgba(250,204,21,0.5)' }} />
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(250,204,21,0.5), transparent)' }} />
                    <div className="flex items-center gap-2 mb-3 relative z-[1]">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.3)', boxShadow: '0 0 8px rgba(250,204,21,0.15)' }}>
                        <Swords size={12} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(250,204,21,0.6))' }} />
                      </div>
                      <p className="font-ninja text-xs text-yellow-400 tracking-[0.15em]" style={{ textShadow: '0 0 8px rgba(250,204,21,0.4)' }}>{ar ? 'الأقواس المباشرة' : 'LIVE BRACKETS'}</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(250,204,21,0.3), transparent)' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(250,204,21,0.6)' }} />
                    </div>
                    <div className="space-y-2 relative z-[1]">
                      {selectedTournament.brackets.map((b, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg relative overflow-hidden"
                          style={{ background: b.status === 'active' ? 'linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02))' : b.status === 'completed' ? 'rgba(57,255,20,0.03)' : 'rgba(255,255,255,0.02)', border: `1px solid ${b.status === 'active' ? 'rgba(250,204,21,0.3)' : b.status === 'completed' ? 'rgba(57,255,20,0.15)' : 'rgba(255,255,255,0.05)'}` }}>
                          {b.status === 'active' && <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#facc15', boxShadow: '0 0 6px #facc15', opacity: 0.6 }} />}
                          <span className="font-body text-xs text-gray-500 w-14">R{b.round} M{b.matchIndex + 1}</span>
                          <span className={`font-ninja text-sm flex-1 text-right ${b.winner === b.player1 ? 'text-ninja-green' : 'text-gray-300'}`}>{b.player1 || (ar ? 'قريباً' : 'TBD')}</span>
                          <span className="font-body text-xs text-gray-600 px-3">{ar ? 'ضد' : 'vs'}</span>
                          <span className={`font-ninja text-sm flex-1 ${b.winner === b.player2 ? 'text-ninja-green' : 'text-gray-300'}`}>{b.player2 || (ar ? 'قريباً' : 'TBD')}</span>
                          <span className="font-ninja text-xs text-gray-500 w-10 text-right">{b.score1}-{b.score2}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Participants */}
                {selectedTournament.participants?.length > 0 && (
                  <div className="relative rounded-xl p-4 overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,111,0,0.15)' }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '1px solid rgba(255,111,0,0.4)', borderLeft: '1px solid rgba(255,111,0,0.4)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '1px solid rgba(255,111,0,0.4)', borderRight: '1px solid rgba(255,111,0,0.4)' }} />
                    <div className="flex items-center gap-2 mb-3 relative z-[1]">
                      <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(255,111,0,0.08)', border: '1px solid rgba(255,111,0,0.25)' }}>
                        <Users size={12} className="text-orange-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.5))' }} />
                      </div>
                      <p className="font-ninja text-sm text-orange-400 tracking-[0.15em]" style={{ textShadow: '0 0 8px rgba(255,111,0,0.3)' }}>{ar ? 'المشاركون' : 'PARTICIPANTS'} ({selectedTournament.participants.length})</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,111,0,0.25), transparent)' }} />
                    </div>
                    <div className="flex flex-wrap gap-2 relative z-[1]">
                      {selectedTournament.participants.map((p, i) => (
                        <span key={i} className={`px-3 py-2 rounded-lg text-sm font-body border relative ${
                          p.playerId === player.uid ? 'text-ninja-green' : 'text-gray-400'
                        }`}
                        style={p.playerId === player.uid
                          ? { background: 'linear-gradient(135deg, rgba(57,255,20,0.12), rgba(57,255,20,0.03))', borderColor: 'rgba(57,255,20,0.4)', boxShadow: '0 0 10px rgba(57,255,20,0.15)', textShadow: '0 0 6px rgba(57,255,20,0.4)' }
                          : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                          {p.playerName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Join Button */}
                {(selectedTournament.status === 'registration' || selectedTournament.status === 'upcoming') && !isRegistered(selectedTournament) && (
                  <div>
                    {joinError && (
                      <div className="relative mb-3 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 overflow-hidden" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 0 10px rgba(239,68,68,0.1)' }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(239,68,68,0.5)', borderLeft: '1px solid rgba(239,68,68,0.5)' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(239,68,68,0.5)', borderRight: '1px solid rgba(239,68,68,0.5)' }} />
                        <AlertTriangle size={14} className="text-red-400" />
                        <p className="text-red-400 font-body text-sm">{joinError}</p>
                      </div>
                    )}
                    <motion.button whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(255,111,0,0.4)' }} whileTap={{ scale: 0.98 }}
                      onClick={() => { setGatePin(''); setGatePinError(''); setPinGateTournament(selectedTournament); }} disabled={joining}
                      className="relative w-full py-3.5 rounded-xl font-ninja text-base flex items-center justify-center gap-2 transition-all overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #FF6F00, #FF4500)', color: '#fff', border: '1px solid rgba(255,111,0,0.5)', boxShadow: '0 0 18px rgba(255,111,0,0.3), inset 0 0 15px rgba(255,255,255,0.08)', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>
                      <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(255,255,255,0.6)' }} />
                      <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(255,255,255,0.6)', borderRight: '2px solid rgba(255,255,255,0.6)' }} />
                      <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(255,255,255,0.6)' }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,255,255,0.6)', borderRight: '2px solid rgba(255,255,255,0.6)' }} />
                      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
                      <span className="relative z-[1] flex items-center gap-2">
                        {joining ? (ar ? 'جاري الانضمام...' : 'JOINING...') : <><Swords size={20} /> {ar ? 'انضم إلى البطولة' : 'JOIN TOURNAMENT'} {hasTournamentPass() ? <span className="text-sm font-body ml-1 flex items-center gap-1">(<Ticket size={14} /> {ar ? 'تذكرة' : 'Pass'})</span> : <span className="text-sm font-body ml-1 flex items-center gap-1">(<Coins size={14} /> {selectedTournament.entryFee})</span>}</>}
                      </span>
                    </motion.button>
                  </div>
                )}

                {isRegistered(selectedTournament) && (
                  <div className="relative text-center py-3 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.12), rgba(57,255,20,0.03))', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 18px rgba(57,255,20,0.15)' }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.6)', borderLeft: '2px solid rgba(57,255,20,0.6)' }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.6)', borderRight: '2px solid rgba(57,255,20,0.6)' }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.6)', borderLeft: '2px solid rgba(57,255,20,0.6)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.6)', borderRight: '2px solid rgba(57,255,20,0.6)' }} />
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.6), transparent)', boxShadow: '0 0 8px rgba(57,255,20,0.4)' }} />
                    <p className="font-ninja text-ninja-green flex items-center justify-center gap-2 relative z-[1]" style={{ textShadow: '0 0 10px rgba(57,255,20,0.5)' }}><Check size={18} /> {ar ? 'أنت مسجّل' : 'YOU ARE REGISTERED'}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Single-vs-Club registration picker ═══ */}
      <AnimatePresence>
        {regChoiceTournament && club && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[260] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
            onClick={() => !joining && setRegChoiceTournament(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 140, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[560px] max-w-[95vw] rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #06090e 0%, #080c14 40%, #050810 100%)',
                border: '2px solid rgba(255,111,0,0.4)',
                boxShadow: '0 0 40px rgba(255,111,0,0.22), inset 0 0 30px rgba(255,111,0,0.04)',
              }}
            >
              {/* HUD corners */}
              {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                <div key={ci} className={`absolute ${pos} w-6 h-6 z-10 pointer-events-none`} style={{
                  ...(pos.includes('top') ? { borderTop: '3px solid #FF6F00' } : { borderBottom: '3px solid #FF6F00' }),
                  ...(pos.includes('left') ? { borderLeft: '3px solid #FF6F00' } : { borderRight: '3px solid #FF6F00' }),
                  filter: 'drop-shadow(0 0 6px rgba(255,111,0,0.6))',
                }} />
              ))}

              <div className="relative p-7">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(255,111,0,0.25), rgba(255,111,0,0.08))', border: '1px solid rgba(255,111,0,0.5)', boxShadow: '0 0 15px rgba(255,111,0,0.22)' }}>
                      <Swords size={22} className="text-orange-400" style={{ filter: 'drop-shadow(0 0 5px rgba(255,111,0,0.7))' }} />
                    </div>
                    <div>
                      <h2 className="font-ninja text-xl text-white tracking-wider" style={{ textShadow: '0 0 12px rgba(255,111,0,0.35)' }}>{ar ? 'كيف تريد التسجيل؟' : 'HOW DO YOU WANT TO REGISTER?'}</h2>
                      <p className="font-body text-[11px] text-gray-500">{regChoiceTournament.name}</p>
                    </div>
                  </div>
                  <button onClick={() => !joining && setRegChoiceTournament(null)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Single */}
                  <button
                    disabled={joining}
                    onClick={() => joinAsSingle(regChoiceTournament)}
                    className="relative p-5 rounded-xl text-left transition-all overflow-hidden hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0,191,255,0.08), rgba(0,191,255,0.02))',
                      border: '1px solid rgba(0,191,255,0.35)',
                      boxShadow: '0 0 15px rgba(0,191,255,0.1)',
                    }}
                  >
                    <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #00BFFF', borderLeft: '2px solid #00BFFF' }} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #00BFFF', borderRight: '2px solid #00BFFF' }} />
                    <User size={28} className="text-cyan-300 mb-3" style={{ filter: 'drop-shadow(0 0 5px rgba(0,191,255,0.6))' }} />
                    <h3 className="font-ninja text-lg text-white mb-1 tracking-wide">{ar ? 'فردي' : 'SOLO'}</h3>
                    <p className="font-body text-[11px] text-gray-400 mb-3">{ar ? 'سجّل نفسك فقط.' : 'Register just yourself.'}</p>
                    <div className="flex items-center gap-1 text-[11px] text-yellow-400">
                      <Coins size={12} /> {regChoiceTournament.entryFee} {ar ? 'رسوم الدخول' : 'entry fee'}
                    </div>
                  </button>

                  {/* Club */}
                  <button
                    disabled={joining}
                    onClick={() => joinAsClub(regChoiceTournament)}
                    className="relative p-5 rounded-xl text-left transition-all overflow-hidden hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.03))',
                      border: '1px solid rgba(168,85,247,0.45)',
                      boxShadow: '0 0 18px rgba(168,85,247,0.15)',
                    }}
                  >
                    <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #A855F7', borderLeft: '2px solid #A855F7' }} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #A855F7', borderRight: '2px solid #A855F7' }} />
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={28} className="text-purple-300" style={{ filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.6))' }} />
                      <span className="text-xl">{club.logo || '⚔️'}</span>
                    </div>
                    <h3 className="font-ninja text-lg text-white mb-1 tracking-wide">[{club.tag}] {ar ? 'النادي' : 'CLUB'}</h3>
                    <p className="font-body text-[11px] text-gray-400 mb-2">{ar ? `جميع الأعضاء (${club.members.length}) ينضمون تلقائياً. الجوائز → خزينة النادي.` : `All ${club.members.length} members auto-join. Prizes → club treasury.`}</p>
                    {(() => {
                      const totalFee = regChoiceTournament.entryFee * club.members.length;
                      // Per-member readiness: each member needs either a voucher or share >= entryFee.
                      // We can only see the acting player's inventory synchronously; others are checked
                      // inside joinAsClub at commit time. Show a best-effort summary.
                      const shares = club.shares || {};
                      const insufficientMembers = club.members.filter(uid => (shares[uid] || 0) < regChoiceTournament.entryFee);
                      const allCoveredByShares = insufficientMembers.length === 0;
                      return (
                        <>
                          <div className="flex items-center gap-1 text-[11px] text-yellow-400">
                            <Coins size={12} /> {regChoiceTournament.entryFee} / {ar ? 'عضو' : 'member'} · {totalFee} {ar ? 'المجموع' : 'total'}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] mt-1" style={{ color: allCoveredByShares ? '#39FF14' : '#F59E0B' }}>
                            {allCoveredByShares
                              ? `All ${club.members.length} shares covered ✓`
                              : `${insufficientMembers.length} member${insufficientMembers.length === 1 ? '' : 's'} need voucher or deposit`}
                          </div>
                        </>
                      );
                    })()}
                  </button>
                </div>

                {joinError && (
                  <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <AlertTriangle size={14} className="text-red-400" />
                    <p className="font-body text-xs text-red-300">{joinError}</p>
                  </div>
                )}
                {joining && (
                  <p className="font-body text-xs text-gray-500 text-center mt-4">{ar ? 'جاري معالجة التسجيل...' : 'Processing registration...'}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PIN gate — confirm identity before committing to tournament ═══ */}
      <AnimatePresence>
        {pinGateTournament && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[270] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
            onClick={() => !joining && setPinGateTournament(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[380px] max-w-[92vw] rounded-2xl p-6"
              style={{
                background: 'linear-gradient(180deg, #050a14 0%, #030508 100%)',
                border: '1.5px solid rgba(255,111,0,0.45)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(255,111,0,0.2)',
              }}
            >
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,111,0,0.12)', border: '1px solid rgba(255,111,0,0.4)', boxShadow: '0 0 18px rgba(255,111,0,0.2)' }}>
                  <Lock size={24} className="text-orange-400" />
                </div>
                <h3 className="font-ninja text-xl text-white tracking-wider mb-1">
                  {ar ? 'تأكيد بالرمز السري' : 'CONFIRM WITH PIN'}
                </h3>
                <p className="font-body text-xs text-gray-400">
                  {ar
                    ? `أدخل رمز PIN الخاص بك للانضمام إلى ${pinGateTournament.name}`
                    : `Enter your 6-digit PIN to join ${pinGateTournament.name}`}
                </p>
              </div>

              <input
                type="password"
                autoFocus
                value={gatePin}
                onChange={(e) => { setGatePin(e.target.value.slice(0, 400)); setGatePinError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && gatePin.length >= 1) {
                    if (gatePin === player.pin) {
                      const t = pinGateTournament;
                      setPinGateTournament(null);
                      setGatePin('');
                      handleJoinClick(t);
                    } else {
                      setGatePinError(ar ? 'رمز PIN غير صحيح' : 'Wrong PIN');
                      setGatePin('');
                    }
                  }
                }}
                placeholder={ar ? 'رمز PIN' : 'PIN'}
                maxLength={400}
                className="w-full bg-black/50 border border-orange-500/30 rounded-lg px-4 py-4 text-center font-mono text-2xl tracking-[0.3em] text-white focus:outline-none focus:border-orange-400 mb-3"
                style={{ direction: 'ltr' }}
              />

              {gatePinError && (
                <p className="text-red-400 font-body text-xs text-center mb-3">{gatePinError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setPinGateTournament(null); setGatePin(''); setGatePinError(''); }}
                  disabled={joining}
                  className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-gray-300"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {ar ? 'إلغاء' : 'CANCEL'}
                </button>
                <button
                  disabled={joining || gatePin.length < 1}
                  onClick={() => {
                    if (gatePin !== player.pin) {
                      setGatePinError(ar ? 'رمز PIN غير صحيح' : 'Wrong PIN');
                      setGatePin('');
                      return;
                    }
                    const t = pinGateTournament;
                    setPinGateTournament(null);
                    setGatePin('');
                    handleJoinClick(t);
                  }}
                  className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #FF6F00, #FF4500)',
                    color: '#fff',
                    boxShadow: '0 0 14px rgba(255,111,0,0.35)',
                  }}
                >
                  {ar ? 'تأكيد وانضم' : 'CONFIRM & JOIN'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
