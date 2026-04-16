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

let overrides: Map<string, string> = new Map();
let unsub: (() => void) | null = null;
let currentPcId: string | null = null;

export function initLaunchOverrides(pcDocId: string | null): void {
  if (currentPcId === pcDocId) return;
  currentPcId = pcDocId;
  if (unsub) { unsub(); unsub = null; }
  if (!pcDocId) { overrides = new Map(); return; }
  unsub = onSnapshot(doc(db, 'pcs', pcDocId), (snap) => {
    if (!snap.exists()) return;
    const list: InstalledGame[] = (snap.data() as any).installedGames || [];
    const next = new Map<string, string>();
    for (const g of list) {
      if (g?.id && g?.exePath) next.set(g.id, g.exePath);
    }
    overrides = next;
  });
}

/** Returns true if the launch was dispatched (i.e. the bridge exists). */
export function launchOnPc(id: string, fallbackExePath: string): boolean {
  const path = overrides.get(id) || fallbackExePath;
  const api = (window as any).electronAPI;
  if (api?.launchGame) {
    api.launchGame(id, path);
    return true;
  }
  return false;
}

export function getOverridePath(id: string): string | null {
  return overrides.get(id) || null;
}

export function getAllOverrides(): ReadonlyMap<string, string> {
  return overrides;
}
