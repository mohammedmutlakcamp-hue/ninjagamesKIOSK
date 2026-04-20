// ═══════════════════════════════════════════════════════════════════
//  Chest Economy v2 — DETERMINISTIC profit-locked sequence
// ───────────────────────────────────────────────────────────────────
//  No probability rolling. Every reward is picked from a deterministic
//  rotation that is gated by a per-tier ledger so the kiosk ALWAYS keeps
//  at least HOUSE_RAKE (33% by default) of every token spent on chests.
//
//  How it works (per chest tier):
//    • A Firestore doc `config/chest-ledger-{tier}` tracks
//        { paid, awarded, opens, pity, cursor }
//    • On every open we run a transaction:
//        1. paid += chest.cost; opens++; pity++
//        2. budget = paid * (1 - HOUSE_RAKE) - awarded
//           (how many tokens we are allowed to give without breaking 33%)
//        3. If pity ≥ TIER_PITY[tier] AND budget covers a jackpot in the
//           pool, release the biggest affordable jackpot, reset pity.
//        4. Else cycle through a small/medium rotation pool by `cursor`
//           (deterministic — players cannot game it because the cursor
//           is shared across every player on this kiosk).
//        5. awarded += effectiveValue(reward); persist.
//
//  Skin handling:
//    • effectiveValue(skin) = ninja's store price (or DUP value for
//      mythics that can't be bought).
//    • Duplicates auto-convert to a small coin pack (existing rule).
//
//  Result: kiosk profit margin is mathematically locked — every cycle
//  of opens, the house keeps ~33% (or more if budget never overflows
//  enough to unlock a jackpot).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import type { Chest, ChestReward } from '@/types';
import { CHESTS, NINJA_SKINS } from '@/lib/constants';

// House keeps this fraction of every token spent on chests.
export const HOUSE_RAKE = 0.33;

// Opens since last jackpot before the next jackpot is allowed to fire
// (only fires if budget covers it — pity alone never overrides budget).
const TIER_PITY: Record<string, number> = {
  common:    8,
  rare:      8,
  legendary: 10,
  mythical:  12,
};

// Coin value when a duplicate skin lands.
const SKIN_DUP_COIN_VALUE: Record<string, number> = {
  common:   20,
  uncommon: 30,
  rare:     75,
  epic:     150,
  legendary: 300,
  mythic:   600,
  mythical: 600,
  immortal: 1000,
};

interface TierLedger {
  paid:    number; // cumulative tokens spent on this chest by all players
  awarded: number; // cumulative effective value paid out
  opens:   number; // total opens
  pity:    number; // opens since last jackpot
  cursor:  number; // rotation cursor for non-jackpot rewards
}

const blankLedger = (): TierLedger => ({
  paid: 0, awarded: 0, opens: 0, pity: 0, cursor: 0,
});

const ledgerDocId = (tier: string) => `chest-ledger-${tier}`;

// In-memory cache of last-known ledger state for read-only UI.
const cache: Record<string, TierLedger> = {};

export function getCachedLedger(tier: string): TierLedger {
  return cache[tier] || blankLedger();
}

export function getLedgerProfit(): number {
  // Sum across all tiers for the global "house profit" stat.
  return Object.values(cache).reduce((s, l) => s + (l.paid - l.awarded), 0);
}

// Effective value for budget math. Skins use store price.
function effectiveValue(r: ChestReward): number {
  if (r.type === 'skin') {
    const skin = NINJA_SKINS.find(s => s.id === r.skinId);
    if (skin && skin.price > 0) return skin.price;
    return SKIN_DUP_COIN_VALUE[r.rarity] || 100;
  }
  return r.value || 0;
}

// Admin-controlled per-chest overrides — populated by loadEconomyOnce
// from config/chest-content-overrides. Rewards whose id appears in the
// disabled set are excluded from both the rotation and jackpot pools.
// Admin-added `extraRewards` are merged into the base pool and treated
// the same as built-in rewards by the picker.
const disabledByChest: Record<string, Set<string>> = {};
const extrasByChest: Record<string, ChestReward[]> = {};

function isDisabled(chestId: string, rewardId: string): boolean {
  return !!disabledByChest[chestId]?.has(rewardId);
}

// Merge built-ins + admin-added extras, dropping anything disabled.
function effectiveRewards(chest: Chest): ChestReward[] {
  const extras = extrasByChest[chest.id] || [];
  const all = [...chest.rewards, ...extras];
  return all.filter(r => !isDisabled(chest.id, r.id));
}

// Rotation pool = small/medium rewards only. Skins and immortal/mythical-
// tier coin packs go through the jackpot gate instead.
function rotationPool(chest: Chest): ChestReward[] {
  return effectiveRewards(chest).filter(r => {
    if (r.type === 'skin') return false;
    if (r.rarity === 'mythical' || r.rarity === 'immortal') return false;
    return true;
  });
}

// Heavy hitters available only via the pity gate.
function jackpotPool(chest: Chest): ChestReward[] {
  return effectiveRewards(chest).filter(r => {
    if (r.type === 'skin') return true;
    if (r.rarity === 'mythical' || r.rarity === 'immortal') return true;
    return false;
  });
}

export interface OpenResult {
  reward:            ChestReward;
  wasDuplicateSkin:  boolean;
  originalSkinId?:   string;
  isJackpot:         boolean;
  ledger:            TierLedger; // post-update snapshot, useful for admin UI
}

// Main entry point. Atomically charges the chest, picks a reward, and
// updates the ledger inside a Firestore transaction.
export async function pickChestReward(
  chest: Chest,
  ownedSkinIds: string[] = [],
): Promise<OpenResult> {
  const tier   = chest.tier;
  const ledRef = doc(db, 'config', ledgerDocId(tier));
  const ownedSet = new Set(ownedSkinIds);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ledRef);
    const led: TierLedger = snap.exists()
      ? { ...blankLedger(), ...(snap.data() as any) }
      : blankLedger();

    led.paid  += chest.cost;
    led.opens += 1;
    led.pity  += 1;

    const budget = led.paid * (1 - HOUSE_RAKE) - led.awarded;

    let chosen: ChestReward | null = null;
    let isJackpot = false;

    // 1. JACKPOT GATE — biggest affordable reward, only if pity exhausted.
    if (led.pity >= (TIER_PITY[tier] ?? 10)) {
      const cand = jackpotPool(chest)
        .filter(r => effectiveValue(r) <= budget)
        .filter(r => r.type !== 'skin' || !ownedSet.has(r.skinId!))
        .sort((a, b) => effectiveValue(b) - effectiveValue(a));
      if (cand.length > 0) {
        chosen = cand[0];
        isJackpot = true;
        led.pity = 0;
      }
    }

    // 2. ROTATION — walk the small/medium pool deterministically until
    //    we find one that fits the budget. If nothing fits, give the
    //    cheapest reward in the pool (defensive — should never happen
    //    once a few opens have built up the budget).
    if (!chosen) {
      const pool = rotationPool(chest);
      if (pool.length > 0) {
        for (let attempt = 0; attempt < pool.length; attempt++) {
          const cand = pool[(led.cursor + attempt) % pool.length];
          if (effectiveValue(cand) <= Math.max(budget, 0)) {
            chosen = cand;
            led.cursor = (led.cursor + attempt + 1) % pool.length;
            break;
          }
        }
        if (!chosen) {
          chosen = [...pool].sort((a, b) => effectiveValue(a) - effectiveValue(b))[0];
          led.cursor = (led.cursor + 1) % pool.length;
        }
      } else {
        chosen = chest.rewards[0];
      }
    }

    // 3. SKIN DEDUP — convert duplicate skin to a small coin pack.
    let wasDup = false;
    let dupId: string | undefined;
    if (chosen.type === 'skin' && chosen.skinId && ownedSet.has(chosen.skinId)) {
      wasDup = true;
      dupId = chosen.skinId;
      const cv = SKIN_DUP_COIN_VALUE[chosen.rarity] || 50;
      chosen = {
        id: `${chosen.id}_dup_coins`,
        type: 'coins',
        name: `${cv} Tokens`,
        description: `Duplicate skin converted to tokens`,
        rarity: chosen.rarity,
        value: cv,
        icon: 'coins',
        image: '/img/reward-coins-150.png',
        dropRate: 0,
      } as ChestReward;
    }

    led.awarded += effectiveValue(chosen);
    tx.set(ledRef, led);

    return { reward: chosen, wasDuplicateSkin: wasDup, originalSkinId: dupId, isJackpot, ledger: led };
  });

  cache[tier] = result.ledger;
  return result;
}

// ─── Backwards-compat shims ────────────────────────────────────────
//
// The old API was: recordChestPaid(cost) → rollChestReward(chest) → recordChestAwarded(value).
// The new model handles the entire ledger update inside pickChestReward,
// so the old record* functions become no-ops. rollChestReward is kept as
// a thin sync shim around pickChestReward — but it's NOT recommended for
// new code; await pickChestReward instead.

let overridesListenerStarted = false;

export async function loadEconomyOnce(): Promise<void> {
  // Hydrate the local cache for the admin dashboard. Errors are non-fatal.
  await Promise.all(CHESTS.map(async (c) => {
    try {
      const snap = await getDoc(doc(db, 'config', ledgerDocId(c.tier)));
      cache[c.tier] = snap.exists()
        ? { ...blankLedger(), ...(snap.data() as any) }
        : blankLedger();
    } catch {
      cache[c.tier] = blankLedger();
    }
  }));

  // Subscribe once to the admin-controlled disabled-reward overrides so every
  // subsequent chest-open picks from a fresh pool without needing a reload.
  if (!overridesListenerStarted) {
    overridesListenerStarted = true;
    try {
      onSnapshot(doc(db, 'config', 'chest-content-overrides'), (snap) => {
        // Wipe local state — anything not in the new payload reverts to defaults.
        Object.keys(disabledByChest).forEach((k) => delete disabledByChest[k]);
        Object.keys(extrasByChest).forEach((k) => delete extrasByChest[k]);
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, { disabledRewardIds?: string[]; extraRewards?: ChestReward[] }>;
        for (const chestId of Object.keys(data)) {
          const ids = data[chestId]?.disabledRewardIds || [];
          disabledByChest[chestId] = new Set(ids);
          const extras = data[chestId]?.extraRewards || [];
          extrasByChest[chestId] = extras;
        }
      }, (err) => console.error('[chest-economy] overrides listener', err));
    } catch { /* non-fatal */ }
  }
}

export function recordChestPaid(_amount: number): void {
  // No-op: ledger is updated transactionally inside pickChestReward.
}

export function recordChestAwarded(_amount: number): void {
  // No-op: ledger is updated transactionally inside pickChestReward.
}

// Synchronous shim. Prefer pickChestReward (async, transactional). This
// version reads the cache and fires the transaction in the background;
// if you need the post-update ledger, use pickChestReward directly.
export function rollChestReward(
  chest: Chest,
  ownedSkinIds: string[] = [],
): { reward: ChestReward; wasDuplicateSkin: boolean; originalSkinId?: string; rerolls: number } {
  // Run the transaction in the background; UI gets a best-effort sync
  // pick from the cached ledger. The transaction's authoritative result
  // overwrites the cache when it lands.
  void pickChestReward(chest, ownedSkinIds).catch((err) =>
    console.error('pickChestReward background failed', err),
  );

  // Best-effort sync mirror of the same logic against the cached ledger.
  // Used only for instant UI feedback; the persisted state is always the
  // transaction's result.
  const tier = chest.tier;
  const led: TierLedger = { ...(cache[tier] || blankLedger()) };
  led.paid  += chest.cost;
  led.opens += 1;
  led.pity  += 1;
  const budget = led.paid * (1 - HOUSE_RAKE) - led.awarded;
  const ownedSet = new Set(ownedSkinIds);

  let chosen: ChestReward | null = null;
  if (led.pity >= (TIER_PITY[tier] ?? 10)) {
    const cand = jackpotPool(chest)
      .filter(r => effectiveValue(r) <= budget)
      .filter(r => r.type !== 'skin' || !ownedSet.has(r.skinId!))
      .sort((a, b) => effectiveValue(b) - effectiveValue(a));
    if (cand.length) chosen = cand[0];
  }
  if (!chosen) {
    const pool = rotationPool(chest);
    if (pool.length) {
      for (let a = 0; a < pool.length; a++) {
        const c = pool[(led.cursor + a) % pool.length];
        if (effectiveValue(c) <= Math.max(budget, 0)) { chosen = c; break; }
      }
      if (!chosen) chosen = [...pool].sort((a, b) => effectiveValue(a) - effectiveValue(b))[0];
    } else {
      chosen = chest.rewards[0];
    }
  }
  let dup = false;
  let dupId: string | undefined;
  if (chosen.type === 'skin' && chosen.skinId && ownedSet.has(chosen.skinId)) {
    dup = true; dupId = chosen.skinId;
    const cv = SKIN_DUP_COIN_VALUE[chosen.rarity] || 50;
    chosen = { ...chosen, type: 'coins', name: `${cv} Tokens`, value: cv, dropRate: 0 } as ChestReward;
  }
  return { reward: chosen, wasDuplicateSkin: dup, originalSkinId: dupId, rerolls: 0 };
}

// Legacy economy-config shape kept for the admin Settings UI.
// All fields are now informational only — the actual policy is the
// HOUSE_RAKE constant + per-tier ledger.
export interface ChestEconomyConfig {
  profitThreshold:    number;
  lossThreshold:      number;
  boostFactor:        number;
  dampenFactor:       number;
  highValueThreshold: number;
  biasEnabled:        boolean;
}

export const DEFAULT_ECONOMY: ChestEconomyConfig = {
  profitThreshold: 3000, lossThreshold: 1000,
  boostFactor: 1.0, dampenFactor: 1.0,
  highValueThreshold: 100, biasEnabled: false,
};

export function setEconomyConfig(_cfg: ChestEconomyConfig) { /* informational only */ }
export function setLedger(paid: number, awarded: number) {
  // Aggregate into the "common" tier slot so the old admin stat panel still has something to show.
  cache['_legacy'] = { ...blankLedger(), paid, awarded };
}
