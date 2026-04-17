// ═══════════════════════════════════════════════════════════════════
//  Feature flags — admin-controlled tab visibility
// ───────────────────────────────────────────────────────────────────
//  Source of truth: Firestore doc `config/feature-flags`.
//  Default: every flag is FALSE (= "coming soon"). Admin flips them on
//  in the Feature Flags admin panel.
//
//  Usage in a component:
//    const flags = useFeatureFlags();
//    if (!flags.foodMenu) return <ComingSoon/>;
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface FeatureFlags {
  foodMenu: boolean;   // Food category in FoodTab
  giftCards: boolean;  // Gift cards section in StoreTab
}

export const DEFAULT_FLAGS: FeatureFlags = {
  foodMenu: false,
  giftCards: false,
};

// In-memory cache so consumers that mount during the first snapshot
// don't briefly flash the default state.
let cached: FeatureFlags = DEFAULT_FLAGS;
const subscribers = new Set<(f: FeatureFlags) => void>();
let listenerStarted = false;

function startListener() {
  if (listenerStarted) return;
  listenerStarted = true;
  onSnapshot(
    doc(db, 'config', 'feature-flags'),
    (snap) => {
      const data = snap.exists() ? (snap.data() as Partial<FeatureFlags>) : {};
      cached = { ...DEFAULT_FLAGS, ...data };
      subscribers.forEach((cb) => cb(cached));
    },
    (err) => console.error('feature-flags listener failed', err),
  );
}

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(cached);
  useEffect(() => {
    startListener();
    subscribers.add(setFlags);
    setFlags(cached);
    return () => { subscribers.delete(setFlags); };
  }, []);
  return flags;
}

export async function setFeatureFlag(name: keyof FeatureFlags, value: boolean) {
  await setDoc(doc(db, 'config', 'feature-flags'), { [name]: value }, { merge: true });
}
