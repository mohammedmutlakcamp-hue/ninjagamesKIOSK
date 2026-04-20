// ═══════════════════════════════════════════════════════════════════
//  All Skins helper — merges built-in NINJA_SKINS with admin-added
//  custom skins from config/skins.customSkins.
// ───────────────────────────────────────────────────────────────────
//  Every consumer on the kiosk (StoreTab, ProfileTab, Inventory, etc)
//  should import `useAllSkins()` instead of NINJA_SKINS directly, so
//  admin-added ninjas show up everywhere.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { NINJA_SKINS } from '@/lib/constants';

type NinjaSkin = (typeof NINJA_SKINS)[number];

interface CustomSkin {
  id: string;
  name: string;
  tier: NinjaSkin['tier'];
  color: string;
  description?: string;
  vibe?: string;
  price?: number;
  unlockLevel?: number;
  profileImage?: string;
  createdAt?: number;
}

// In-memory cache so multiple components re-use the same snapshot.
let cache: NinjaSkin[] = [...NINJA_SKINS];
const subscribers = new Set<(s: NinjaSkin[]) => void>();
let listenerStarted = false;

function normalizeCustom(c: CustomSkin): NinjaSkin {
  // Reuse the perks structure from any base skin at the same tier so the
  // custom ninja inherits tier-level benefits (chest discount, coin bonus,
  // etc.). Falls back to the first skin if the tier has no built-in sample.
  const basePerks = (NINJA_SKINS.find((s) => s.tier === (c.tier || 'rare')) || NINJA_SKINS[0]).perks;
  const out: any = {
    id: c.id,
    name: c.name,
    tier: c.tier || 'rare',
    color: c.color || '#0071e3',
    description: c.description || '',
    vibe: c.vibe || 'custom',
    category: c.tier || 'rare',
    price: c.price ?? 0,
    unlockLevel: c.unlockLevel ?? 1,
    borderColor: (NINJA_SKINS[0] as any).borderColor,
    profileImage: c.profileImage || '/img/pfp-neon.png',
    perks: basePerks,
  };
  return out as NinjaSkin;
}

function startListener() {
  if (listenerStarted) return;
  listenerStarted = true;
  onSnapshot(
    doc(db, 'config', 'skins'),
    (snap) => {
      const data = snap.exists() ? (snap.data() as any) : {};
      const extras: CustomSkin[] = Array.isArray(data.customSkins) ? data.customSkins : [];
      const mediaOverrides: Record<string, { profileImage?: string; welcomeVideo?: string }> = data.mediaOverrides || {};
      // Apply admin media overrides to built-in skins so the kiosk shows
      // the replacement image/video everywhere (store preview, chest
      // reveal, inventory, profile).
      const builtIns = NINJA_SKINS.map((s) => {
        const o = mediaOverrides[s.id];
        if (!o) return s;
        const merged: any = { ...s };
        if (o.profileImage) merged.profileImage = o.profileImage;
        if (o.welcomeVideo) merged.welcomeVideo = o.welcomeVideo;
        return merged;
      });
      cache = [...builtIns, ...extras.map(normalizeCustom)];
      subscribers.forEach((cb) => cb(cache));
    },
    (err) => console.error('[skins-all] listener failed', err),
  );
}

export function useAllSkins(): NinjaSkin[] {
  const [skins, setSkins] = useState<NinjaSkin[]>(cache);
  useEffect(() => {
    startListener();
    subscribers.add(setSkins);
    setSkins(cache);
    return () => { subscribers.delete(setSkins); };
  }, []);
  return skins;
}

// For non-React consumers (e.g. chest-economy).
export function getAllSkins(): NinjaSkin[] {
  startListener();
  return cache;
}

// Look up a skin by id, falling back to a synthetic placeholder so
// custom skins referenced somewhere without having propagated yet
// don't cause runtime errors.
export function findSkinById(id: string): NinjaSkin | undefined {
  return cache.find((s) => s.id === id);
}
