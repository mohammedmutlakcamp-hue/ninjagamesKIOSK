'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  VIP_CONFIG as DEFAULT_VIP_CONFIG,
  TIME_PACKAGES as DEFAULT_TIME_PACKAGES,
  COINS_PER_HOUR as DEFAULT_COINS_PER_HOUR,
  JOD_TO_COINS as DEFAULT_JOD_TO_COINS,
  USERNAME_CHANGE_COST as DEFAULT_USERNAME_CHANGE_COST,
} from './constants';
import type { TimePackage } from '@/types';

// Admins edit these values in /ghanimadmin -> Pricing.
// They are persisted to Firestore at config/pricing. This hook subscribes to
// that doc so every kiosk / mobile surface picks up price changes live
// without a page refresh or server restart.

export interface LiveVipConfig {
  trialDays: number;
  priceCoins: number;
  durationDays: number;
  cafeDiscountPercent: number;
  dailyTaskBonusCoins: number;
  dailyInviteFreeMinutes: number;
  dailyInviteBonusCoins: number;
}

export interface LivePricingConfig {
  vip: LiveVipConfig;
  timePackages: TimePackage[];
  coinsPerHour: number;
  jodToCoins: number;
  usernameChangeCost: number;
  loaded: boolean;
}

const DEFAULTS: LivePricingConfig = {
  vip: { ...DEFAULT_VIP_CONFIG },
  timePackages: DEFAULT_TIME_PACKAGES.map((p) => ({ ...p })),
  coinsPerHour: DEFAULT_COINS_PER_HOUR,
  jodToCoins: DEFAULT_JOD_TO_COINS,
  usernameChangeCost: DEFAULT_USERNAME_CHANGE_COST,
  loaded: false,
};

let cached: LivePricingConfig = { ...DEFAULTS };
let listeners: Array<(c: LivePricingConfig) => void> = [];
let unsub: (() => void) | null = null;

function ensureSubscribed() {
  if (unsub) return;
  unsub = onSnapshot(doc(db, 'config', 'pricing'), (snap) => {
    if (!snap.exists()) {
      cached = { ...DEFAULTS, loaded: true };
    } else {
      const data = snap.data() as any;
      cached = {
        vip: { ...DEFAULT_VIP_CONFIG, ...(data.vipConfig || {}) },
        timePackages: Array.isArray(data.timePackages) && data.timePackages.length > 0
          ? data.timePackages
          : DEFAULT_TIME_PACKAGES.map((p) => ({ ...p })),
        coinsPerHour: typeof data.coinsPerHour === 'number' ? data.coinsPerHour : DEFAULT_COINS_PER_HOUR,
        jodToCoins: typeof data.jodToCoins === 'number' ? data.jodToCoins : DEFAULT_JOD_TO_COINS,
        usernameChangeCost: typeof data.usernameChangeCost === 'number'
          ? data.usernameChangeCost
          : DEFAULT_USERNAME_CHANGE_COST,
        loaded: true,
      };
    }
    listeners.forEach((fn) => fn(cached));
  });
}

export function usePricingConfig(): LivePricingConfig {
  const [state, setState] = useState<LivePricingConfig>(cached);
  useEffect(() => {
    ensureSubscribed();
    listeners.push(setState);
    // If we already have a cached value, sync immediately.
    if (cached.loaded) setState(cached);
    return () => {
      listeners = listeners.filter((fn) => fn !== setState);
    };
  }, []);
  return state;
}

export function useVipConfig(): LiveVipConfig {
  return usePricingConfig().vip;
}
