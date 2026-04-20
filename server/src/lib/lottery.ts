// Lottery Chest — a single-entry high-variance spin that players pay tokens
// to enter. All probabilities + rewards live in `config/lottery` on Firestore
// so admins can rebalance without a redeploy.
//
// Reward roll uses cumulative-weight selection: sum(probabilities) need not
// equal 1 — we normalize. That way admins can slot a new reward in at "10"
// without recalculating every other weight.

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type LotteryRewardType = 'coins' | 'time_minutes' | 'voucher' | 'skin' | 'nothing';

export interface LotteryReward {
  id: string;
  name: string;
  type: LotteryRewardType;
  amount: number; // coins, minutes, or skin-rarity-tier marker
  probability: number; // any positive weight; normalized at pick time
  color: string;
  /** Optional rarity tag for the UI (common / rare / epic / legendary / jackpot) */
  rarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'jackpot';
  /** Optional skin pool to pick from when type === 'skin'. */
  skinPool?: string[];
}

export interface LotteryConfig {
  entryCost: number;
  rewards: LotteryReward[];
  /** When false, lottery is hidden from the kiosk entirely. */
  enabled: boolean;
}

export const DEFAULT_LOTTERY_CONFIG: LotteryConfig = {
  entryCost: 150,
  enabled: true,
  rewards: [
    { id: 'lot_coins_50',    name: '50 Coins',       type: 'coins',        amount: 50,   probability: 38, color: '#9ca3af', rarity: 'common' },
    { id: 'lot_coins_100',   name: '100 Coins',      type: 'coins',        amount: 100,  probability: 25, color: '#60a5fa', rarity: 'common' },
    { id: 'lot_coins_250',   name: '250 Coins',      type: 'coins',        amount: 250,  probability: 15, color: '#3b82f6', rarity: 'rare' },
    { id: 'lot_time_30',     name: '30 Min Free Play', type: 'time_minutes', amount: 30, probability: 8,  color: '#22c55e', rarity: 'rare' },
    { id: 'lot_coins_500',   name: '500 Coins',      type: 'coins',        amount: 500,  probability: 7,  color: '#a855f7', rarity: 'epic' },
    { id: 'lot_voucher_food', name: 'Free Food Voucher', type: 'voucher',  amount: 1,    probability: 3,  color: '#f59e0b', rarity: 'epic' },
    { id: 'lot_coins_1000',  name: '1,000 Coins',    type: 'coins',        amount: 1000, probability: 2.5, color: '#ec4899', rarity: 'legendary' },
    { id: 'lot_coins_5000',  name: '5,000 COIN JACKPOT', type: 'coins',    amount: 5000, probability: 1.5, color: '#FFD700', rarity: 'jackpot' },
  ],
};

/**
 * Load the live config; falls back to defaults if the doc is missing or
 * malformed. Missing fields are merged from defaults so partial docs work.
 */
export async function loadLotteryConfig(): Promise<LotteryConfig> {
  try {
    const snap = await getDoc(doc(db, 'config', 'lottery'));
    if (!snap.exists()) return DEFAULT_LOTTERY_CONFIG;
    const data = snap.data() as Partial<LotteryConfig>;
    return {
      entryCost: typeof data.entryCost === 'number' ? data.entryCost : DEFAULT_LOTTERY_CONFIG.entryCost,
      enabled: data.enabled !== false,
      rewards: Array.isArray(data.rewards) && data.rewards.length > 0
        ? data.rewards as LotteryReward[]
        : DEFAULT_LOTTERY_CONFIG.rewards,
    };
  } catch {
    return DEFAULT_LOTTERY_CONFIG;
  }
}

/** Weighted-random pick. Returns the selected reward or null if rewards is empty. */
export function pickLotteryReward(rewards: LotteryReward[]): LotteryReward | null {
  if (!rewards || rewards.length === 0) return null;
  const total = rewards.reduce((s, r) => s + Math.max(0, r.probability || 0), 0);
  if (total <= 0) return rewards[0];
  let roll = Math.random() * total;
  for (const r of rewards) {
    const w = Math.max(0, r.probability || 0);
    if (roll < w) return r;
    roll -= w;
  }
  return rewards[rewards.length - 1];
}
