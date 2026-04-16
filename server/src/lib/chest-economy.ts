// ═══════════════════════════════════════════════════════════════════
//  Chest Economy — admin-controlled, profit-biased reward selection
// ───────────────────────────────────────────────────────────────────
//  The house sets a profit threshold in `config/chest-economy`.
//  Every time the player rolls for a chest reward:
//    • We fetch the running ledger (total paid − total awarded value)
//    • If the house is AHEAD of threshold, we nudge odds toward high-
//      value rewards (players feel lucky → retention)
//    • If the house is BEHIND, we nudge odds toward low-value rewards
//      (protects margin)
//
//  Also handles the "one-of-each skin" rule: if the player already
//  owns a rolled skin, it's converted to a coin reward of equivalent
//  value (the SKIN_DUP_COIN_VALUE mapping below).
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, increment as fsIncrement } from 'firebase/firestore';
import type { Chest, ChestReward } from '@/types';

// Coin value a duplicate skin is converted to, per rarity.
// Tuned so players aren't wrecked but also not over-rewarded for dupes.
const SKIN_DUP_COIN_VALUE: Record<string, number> = {
  common:    20,
  uncommon:  30,
  rare:      75,
  epic:      150,
  legendary: 300,
  mythical:  600,
  mythic:    600,
  immortal:  1000,
};

export interface ChestEconomyConfig {
  // When house profit >= profitThreshold, boost high-value drops by boostFactor.
  // When house profit <= -lossThreshold, dampen high-value drops by dampenFactor.
  profitThreshold: number;   // default 3000
  lossThreshold:   number;   // default 1000
  boostFactor:     number;   // default 1.8 (× high-value weights when winning)
  dampenFactor:    number;   // default 0.5 (× high-value weights when losing)
  // What counts as "high value" for biasing. Rewards with value >= this
  // threshold are biased. Skins always count as high value.
  highValueThreshold: number; // default 100 coins
  // Kill switch. If false, roll is pure RNG (ignore ledger).
  biasEnabled:     boolean;
}

export const DEFAULT_ECONOMY: ChestEconomyConfig = {
  profitThreshold: 3000,
  lossThreshold:   1000,
  boostFactor:     1.8,
  dampenFactor:    0.5,
  highValueThreshold: 100,
  biasEnabled: true,
};

// Cached in memory per tab. Listener in the chest component updates it.
let cachedEconomy: ChestEconomyConfig = DEFAULT_ECONOMY;
let cachedLedger: { paid: number; awarded: number } = { paid: 0, awarded: 0 };

export function setEconomyConfig(cfg: ChestEconomyConfig) {
  cachedEconomy = { ...DEFAULT_ECONOMY, ...cfg };
}

export function setLedger(paid: number, awarded: number) {
  cachedLedger = { paid: paid || 0, awarded: awarded || 0 };
}

export function getLedgerProfit(): number {
  return cachedLedger.paid - cachedLedger.awarded;
}

// ─── Core: roll a reward from a chest, applying bias + dedup rules ──
// `ownedSkinIds` is player.ownedNinjas — rolled skins NOT in this set
// are kept; duplicates are converted to the coin reward of equivalent value.
export function rollChestReward(
  chest: Chest,
  ownedSkinIds: string[] = [],
): { reward: ChestReward; wasDuplicateSkin: boolean; originalSkinId?: string } {
  const pool = chest.rewards;
  const ownedSet = new Set(ownedSkinIds);
  const profit = getLedgerProfit();
  const cfg = cachedEconomy;

  // Compute biased weight per reward
  const weighted: { r: ChestReward; w: number }[] = pool.map(r => {
    let w = r.dropRate;
    if (cfg.biasEnabled) {
      const isHighValue = r.type === 'skin' || (r.value || 0) >= cfg.highValueThreshold;
      if (isHighValue) {
        if (profit >= cfg.profitThreshold) w *= cfg.boostFactor;    // give players luck
        else if (profit <= -cfg.lossThreshold) w *= cfg.dampenFactor; // protect margin
      } else {
        // Inverse — low-value rewards get the opposite bias (milder)
        const inv = 1 + (1 - (isHighValue ? 1 : 0));
        if (profit >= cfg.profitThreshold) w *= (1 / Math.sqrt(cfg.boostFactor));
        else if (profit <= -cfg.lossThreshold) w *= Math.sqrt(1 / cfg.dampenFactor);
      }
    }
    return { r, w: Math.max(0.0001, w) };
  });

  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * total;
  let chosen: ChestReward = pool[pool.length - 1];
  for (const { r, w } of weighted) {
    roll -= w;
    if (roll <= 0) { chosen = r; break; }
  }

  // Dedup skin: if player already owns it, convert to coins.
  if (chosen.type === 'skin' && chosen.skinId && ownedSet.has(chosen.skinId)) {
    const coinValue = SKIN_DUP_COIN_VALUE[chosen.rarity] || 50;
    const replacement: ChestReward = {
      id: `${chosen.id}_dup_coins`,
      type: 'coins',
      name: `${coinValue} Tokens`,
      description: `Duplicate ${chosen.name} converted to tokens`,
      rarity: chosen.rarity,
      value: coinValue,
      icon: 'coins',
      image: '/img/reward-coins-150.png',
      dropRate: 0,
    } as ChestReward;
    return { reward: replacement, wasDuplicateSkin: true, originalSkinId: chosen.skinId };
  }

  return { reward: chosen, wasDuplicateSkin: false };
}

// ─── Ledger updates ─────────────────────────────────────────────────
// Call these from the chest-open handler. We persist a single running
// counter doc at config/chest-ledger so admin can see live P&L.
export async function recordChestPaid(amount: number) {
  if (!amount || amount <= 0) return;
  cachedLedger.paid += amount;
  try {
    await setDoc(doc(db, 'config', 'chest-ledger'), {
      totalPaid: fsIncrement(amount),
      lastUpdate: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.error('recordChestPaid failed', err);
  }
}

export async function recordChestAwarded(value: number) {
  if (!value || value <= 0) return;
  cachedLedger.awarded += value;
  try {
    await setDoc(doc(db, 'config', 'chest-ledger'), {
      totalAwarded: fsIncrement(value),
      lastUpdate: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.error('recordChestAwarded failed', err);
  }
}

// ─── One-shot fetch on component mount (cheaper than a listener) ────
export async function loadEconomyOnce() {
  try {
    const [cfgSnap, ledSnap] = await Promise.all([
      getDoc(doc(db, 'config', 'chest-economy')),
      getDoc(doc(db, 'config', 'chest-ledger')),
    ]);
    if (cfgSnap.exists()) setEconomyConfig(cfgSnap.data() as ChestEconomyConfig);
    if (ledSnap.exists()) {
      const d = ledSnap.data() as any;
      setLedger(d.totalPaid || 0, d.totalAwarded || 0);
    }
  } catch (err) {
    console.error('loadEconomyOnce failed', err);
  }
}
