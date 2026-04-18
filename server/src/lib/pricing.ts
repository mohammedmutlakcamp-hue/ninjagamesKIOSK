// ==================== PERSONAL COIN VALUE SYSTEM ====================
// Each player has an `effectiveRate` = weighted-average JOD/coin across every
// top-up they have made. This lets the owner sell time packages at a discount
// (intended bulk playtime incentive) while keeping chest / food / gift-card /
// skin / VIP prices at their real JOD value regardless of how cheaply the
// player's tokens were bought.
//
// Rules
// - Only TIME packages are exempt from the multiplier (listed coin cost applies).
// - Every other coin spend is wrapped in `personalCoinCost()`.
// - Only JOD top-ups update `effectiveRate` (rewards, chest drops, transfers do not).
// - Top-up rates deeper than Master (50 JOD → 7000 coins) are capped to Master
//   so no custom admin grant or stacked pack ever beats the 40% bonus tier.

import type { Player } from '@/types';

// Base rate: 1 JOD = 100 coins → 0.01 JOD per coin.
export const BASE_RATE = 0.01;

// Master pack rate (50 JOD for 7000 coins = 0.007142857… JOD/coin).
// No top-up is allowed to push the player's rate below this (= no bigger bonus).
export const MIN_EFFECTIVE_RATE = 50 / 7000;

// Hard floor on player-facing top-ups. Any package or custom admin grant that
// provides fewer than this many coins is rejected at the UI / approval layer.
export const MIN_TOPUP_COINS = 7000;

/**
 * Cap a raw rate so no top-up gets a deeper discount than the Master tier.
 * Example: admin grants 15 000 coins for 100 JOD → raw = 0.00667 → capped to 0.00714.
 */
export function cappedRate(coins: number, priceJOD: number): number {
  if (!coins || coins <= 0) return BASE_RATE;
  const raw = priceJOD / coins;
  return Math.max(raw, MIN_EFFECTIVE_RATE);
}

/**
 * Compute the player's NEW weighted-average effective rate after a top-up.
 * `prevCoinsFromPurchases` is the lifetime count of coins ever added through
 * paid top-ups (not rewards / transfers). Rate is weighted by that quantity.
 */
export function blendRate(
  prevCoinsFromPurchases: number,
  prevRate: number | undefined,
  addedCoins: number,
  addedPriceJOD: number
): { rate: number; coinsFromPurchases: number } {
  const prevCoins = Math.max(0, prevCoinsFromPurchases || 0);
  const safePrev = typeof prevRate === 'number' && prevRate > 0 ? prevRate : BASE_RATE;
  const addedRate = cappedRate(addedCoins, addedPriceJOD);
  const total = prevCoins + addedCoins;
  if (total <= 0) return { rate: BASE_RATE, coinsFromPurchases: 0 };
  const blended = (prevCoins * safePrev + addedCoins * addedRate) / total;
  return {
    rate: Math.max(blended, MIN_EFFECTIVE_RATE),
    coinsFromPurchases: total,
  };
}

/**
 * Translate a base coin price (= price at BASE_RATE) into the player's personal
 * coin price. If the player never topped up (or only at base rate), returns the
 * original `baseCoins`. If they got a bulk bonus, the cost scales up so the JOD
 * value of the item is preserved.
 *
 * Example: Master player (rate = 0.00714) buying a Mythical Chest (base 400):
 *   multiplier = 0.01 / 0.00714 = 1.40 → pays 560 coins (= 4 JOD worth).
 */
export function personalCoinCost(
  baseCoins: number,
  player: Pick<Player, 'effectiveRate'> | null | undefined
): number {
  if (!player || !baseCoins || baseCoins <= 0) return Math.max(0, baseCoins || 0);
  const rate = player.effectiveRate;
  if (typeof rate !== 'number' || rate <= 0 || rate >= BASE_RATE) return baseCoins;
  const multiplier = BASE_RATE / rate;
  return Math.ceil(baseCoins * multiplier);
}

/**
 * Convenience for UI: return the multiplier as a number (e.g. 1.40 = 40% uplift).
 */
export function coinMultiplier(player: Pick<Player, 'effectiveRate'> | null | undefined): number {
  if (!player) return 1;
  const rate = player.effectiveRate;
  if (typeof rate !== 'number' || rate <= 0 || rate >= BASE_RATE) return 1;
  return BASE_RATE / rate;
}
