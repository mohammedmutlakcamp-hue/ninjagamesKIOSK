// Chest price overrides — admin-editable prices stored in
// `config/chest-content-overrides.{chestId}.priceOverride`.
//
// When an override is present and non-negative, it replaces `CHESTS[].cost`
// at runtime. Otherwise the hardcoded default from `constants.ts` is used.
//
// Usage (React):
//   const prices = useChestPrices();
//   const cost = getChestCost(chest, prices);
//   const discounted = Math.floor(cost * (1 - chestDiscount / 100));
//
// Usage (non-React, e.g. chest-economy.ts):
//   subscribe manually to config/chest-content-overrides and read
//   data[chestId].priceOverride. The kiosk-side flow already keeps a module
//   cache keyed on chestId — add priceOverride to that cache.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { CHESTS } from './constants';

export type ChestPriceMap = Record<string, number>;

/** Fallback prices from the static CHESTS constant — used before Firestore loads. */
const DEFAULT_PRICES: ChestPriceMap = (() => {
  const out: ChestPriceMap = {};
  for (const c of CHESTS) out[c.id] = c.cost;
  return out;
})();

/** Returns `{ chestId: effectiveCost }`. Subscribes to overrides and updates live. */
export function useChestPrices(): ChestPriceMap {
  const [prices, setPrices] = useState<ChestPriceMap>(DEFAULT_PRICES);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'chest-content-overrides'), (snap) => {
      const overrides = (snap.data() || {}) as Record<string, { priceOverride?: number }>;
      const next: ChestPriceMap = { ...DEFAULT_PRICES };
      for (const c of CHESTS) {
        const raw = overrides[c.id]?.priceOverride;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
          next[c.id] = Math.floor(raw);
        }
      }
      setPrices(next);
    });
    return () => unsub();
  }, []);

  return prices;
}

/** Resolve a chest's effective cost. Falls back to the hardcoded default. */
export function getChestCost(
  chest: { id: string; cost: number },
  prices: ChestPriceMap,
): number {
  const v = prices[chest.id];
  return typeof v === 'number' ? v : chest.cost;
}
