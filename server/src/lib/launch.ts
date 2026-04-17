/**
 * Per-PC game launch helper.
 *
 * The C# kiosk client scans the local machine on install and writes its real
 * installed-game exe paths to `pcs/{pcDocId}.installedGames[]`. This module
 * subscribes to that array and overrides `games-catalog.ts` defaultExePath
 * values at launch time, so the same web build can target many PCs with
 * different install layouts (Steam on D:, Epic in custom folder, etc.).
 *
 * Use `launchOnPc(id, fallbackExePath)` everywhere instead of calling
 * `window.electronAPI.launchGame` directly.
 */
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type InstalledGame = { id: string; name: string; exePath: string; source?: string };

// Auto-discovered paths (rewritten on every rescan).
let overrides: Map<string, string> = new Map();
// Manual overrides set via the ghanempath dialog — win over auto-discovered
// and survive rescans (stored in pcs/{id}.manualPathOverrides).
let manualOverrides: Map<string, string> = new Map();
let unsub: (() => void) | null = null;
let currentPcId: string | null = null;

export function initLaunchOverrides(pcDocId: string | null): void {
  if (currentPcId === pcDocId) return;
  currentPcId = pcDocId;
  if (unsub) { unsub(); unsub = null; }
  if (!pcDocId) { overrides = new Map(); manualOverrides = new Map(); return; }
  unsub = onSnapshot(doc(db, 'pcs', pcDocId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as any;
    const list: InstalledGame[] = data.installedGames || [];
    const next = new Map<string, string>();
    for (const g of list) {
      if (g?.id && g?.exePath) next.set(g.id, g.exePath);
    }
    overrides = next;
    // Load manual overrides — shape: { gameId: exePath }
    const manual = (data.manualPathOverrides || {}) as Record<string, string>;
    const mnext = new Map<string, string>();
    for (const [id, p] of Object.entries(manual)) {
      if (id && p) mnext.set(id, p);
    }
    manualOverrides = mnext;
  });
}

/** Returns true if the launch was dispatched (i.e. the bridge exists). */
export function launchOnPc(id: string, fallbackExePath: string): boolean {
  // Manual override first, then auto-discovered, then catalog fallback.
  const path = manualOverrides.get(id) || overrides.get(id) || fallbackExePath;
  const api = (window as any).electronAPI;
  if (api?.launchGame) {
    api.launchGame(id, path);
    return true;
  }
  return false;
}

export function getOverridePath(id: string): string | null {
  return manualOverrides.get(id) || overrides.get(id) || null;
}

export function getAllOverrides(): ReadonlyMap<string, string> {
  return overrides;
}

export function getManualOverrides(): ReadonlyMap<string, string> {
  return manualOverrides;
}
