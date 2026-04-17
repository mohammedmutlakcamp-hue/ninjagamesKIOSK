'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Save, FolderOpen, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';

// Triggered when the user types "ghanempath" on the login screen.
// Lets staff:
//   1. Re-run GameDiscovery on THIS PC (sends rescan-games via the webview bridge)
//   2. Manually type an exe path for any game the scanner couldn't find
//
// Manual overrides are stored at pcs/{pcDocId}.manualPathOverrides and win over
// the auto-discovered paths in installedGames[] (see server/src/lib/launch.ts).

interface Installed { id: string; name: string; exePath: string; source?: string }

interface Props {
  pcDocId: string | null;
  onClose: () => void;
}

export function PathsDialog({ pcDocId, onClose }: Props) {
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Subscribe to this PC's doc so we see rescan results + existing overrides live.
  useEffect(() => {
    if (!pcDocId) return;
    return onSnapshot(doc(db, 'pcs', pcDocId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      setInstalled((data.installedGames || []) as Installed[]);
      const m = (data.manualPathOverrides || {}) as Record<string, string>;
      setManual(m);
      setEdits((cur) => ({ ...m, ...cur })); // keep in-flight edits, prefill others
    });
  }, [pcDocId]);

  const autoMap = useMemo(() => {
    const m = new Map<string, Installed>();
    for (const g of installed) if (g?.id) m.set(g.id, g);
    return m;
  }, [installed]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return GAMES_CATALOG
      .filter((g) => !q || g.id.includes(q) || g.name.toLowerCase().includes(q))
      .map((g) => {
        const auto = autoMap.get(g.id);
        const manualPath = edits[g.id] ?? '';
        return {
          id: g.id,
          name: g.name,
          defaultPath: (g as any).defaultExePath || '',
          autoPath: auto?.exePath || '',
          autoSource: auto?.source || '',
          manualPath,
        };
      });
  }, [autoMap, edits, filter]);

  const triggerRescan = () => {
    setRescanning(true);
    setStatus('Re-scanning this PC for installed games…');
    try {
      const w = window as any;
      // Send via WebView2 bridge to MainWindow.xaml.cs OnWebMessage → RunCommand("rescan-games")
      if (w.chrome?.webview?.postMessage) {
        w.chrome.webview.postMessage('rescan-games');
      } else if (w.electronAPI?.runCommand) {
        w.electronAPI.runCommand('rescan-games');
      } else {
        setStatus('No kiosk bridge — run this inside the NinjaKiosk app, not a normal browser.');
      }
    } catch (e: any) {
      setStatus(`Rescan failed: ${e?.message || e}`);
    }
    // Firestore will update within a few seconds; keep the spinner short.
    setTimeout(() => {
      setRescanning(false);
      setStatus((prev) => (prev?.startsWith('No kiosk bridge') ? prev : 'Rescan complete. Paths reloaded.'));
      setTimeout(() => setStatus(null), 4000);
    }, 3000);
  };

  const saveAll = async () => {
    if (!pcDocId) { setStatus('No PC ID — can\'t save.'); return; }
    setSaving(true);
    setStatus('Saving overrides…');
    try {
      // Clean: drop empty strings so they don't stomp auto-detected paths.
      const cleaned: Record<string, string> = {};
      for (const [id, p] of Object.entries(edits)) {
        const trimmed = (p || '').trim();
        if (trimmed) cleaned[id] = trimmed;
      }
      await setDoc(doc(db, 'pcs', pcDocId), { manualPathOverrides: cleaned }, { merge: true });
      setStatus(`Saved ${Object.keys(cleaned).length} override(s).`);
      setTimeout(() => setStatus(null), 3500);
    } catch (e: any) {
      setStatus(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const clearOne = (id: string) => setEdits((cur) => ({ ...cur, [id]: '' }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-6"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="relative w-[900px] max-w-full max-h-[86vh] rounded-2xl flex flex-col overflow-hidden"
          style={{
            background: 'linear-gradient(180deg,#050607,#0a0c10 40%,#050607)',
            border: '1px solid rgba(57,255,20,0.28)',
            boxShadow: '0 0 60px rgba(57,255,20,0.12), 0 30px 80px rgba(0,0,0,0.9)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ninja-green/20">
            <div>
              <h2 className="font-ninja text-ninja-green text-xl tracking-wider">Game Paths</h2>
              <p className="text-[11px] text-gray-500">PC: <span className="text-gray-300">{pcDocId || 'unknown'}</span></p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={triggerRescan}
                disabled={rescanning}
                className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(57,255,20,0.12)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.35)' }}
              >
                <RefreshCw size={14} className={rescanning ? 'animate-spin' : ''} />
                {rescanning ? 'Scanning…' : 'Re-scan'}
              </button>
              <button
                onClick={saveAll}
                disabled={saving}
                className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/5 text-gray-400">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Filter + status */}
          <div className="px-6 pt-3 pb-2 flex items-center gap-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by game id or name…"
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-black/40 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-ninja-green/40"
            />
            {status && (
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                {status.toLowerCase().includes('fail') || status.toLowerCase().includes('no kiosk')
                  ? <AlertCircle size={14} className="text-red-400" />
                  : <CheckCircle2 size={14} className="text-green-400" />}
                {status}
              </span>
            )}
          </div>

          {/* Column headers */}
          <div className="px-6 py-2 grid grid-cols-[160px_1fr_auto] gap-3 text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5">
            <span>Game</span>
            <span>Path (manual overrides the auto-detected one)</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          <div className="overflow-y-auto flex-1 px-6 py-3 space-y-1.5">
            {rows.map((r) => {
              const effective = r.manualPath || r.autoPath || r.defaultPath;
              const hasManual = !!r.manualPath && r.manualPath !== r.autoPath;
              const hasAuto = !!r.autoPath;
              return (
                <div key={r.id} className="grid grid-cols-[160px_1fr_auto] gap-3 items-center">
                  <div>
                    <div className="text-sm text-gray-200 truncate">{r.name}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{r.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={r.manualPath}
                      onChange={(e) => setEdits((cur) => ({ ...cur, [r.id]: e.target.value }))}
                      placeholder={r.autoPath || r.defaultPath || 'C:\\path\\to\\game.exe'}
                      className="flex-1 px-3 py-1.5 rounded-md text-xs font-mono bg-black/50 border border-white/10 text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-ninja-green/30"
                    />
                    {r.manualPath && (
                      <button onClick={() => clearOne(r.id)} className="text-[10px] text-gray-500 hover:text-red-400 uppercase tracking-wider">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasManual && <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">MANUAL</span>}
                    {!hasManual && hasAuto && <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/15 text-green-300 border border-green-500/30">AUTO</span>}
                    {!hasManual && !hasAuto && <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">MISSING</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer tip */}
          <div className="px-6 py-3 border-t border-white/5 text-[11px] text-gray-500 flex items-center gap-2">
            <FolderOpen size={12} />
            Paste the full exe path (e.g. <span className="font-mono text-gray-400">D:\Games\Fortnite\Binaries\Win64\FortniteClient-Win64-Shipping.exe</span>). Manual overrides survive re-scans.
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
