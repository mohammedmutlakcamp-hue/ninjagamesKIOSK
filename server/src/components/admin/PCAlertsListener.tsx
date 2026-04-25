'use client';

// ═══════════════════════════════════════════════════════════════════
//  PC Alerts Listener — popup toasts when a player taps "Inform admin"
// ───────────────────────────────────────────────────────────────────
//  Each kiosk client posts a doc to `pc-alerts` whenever a player
//  presses the "Inform admin" button on the launch-failure popup
//  (see kiosk-source/MainWindow.xaml.cs PostAlertAsync).
//
//  This component listens to the collection, surfaces new unack'd
//  alerts as a stack of toasts, and offers two one-click actions:
//    1. Install on this PC  — writes a `run-cmd:start steam://...`
//                             via the same path as RemoteInstallPanel.
//    2. Acknowledge          — marks the alert acknowledged; toast leaves.
//
//  Mount once at the top of AdminDashboard. No UI of its own when no
//  alerts pending.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { INSTALL_SOURCES, buildInstallShellCommand } from '@/lib/install-sources';
import { AlertTriangle, Download, Check, X, Wrench, Loader2 } from 'lucide-react';

interface PCAlert {
  id: string;
  pcId: string;
  pcName?: string;
  playerName?: string;
  kind?: string;            // 'launch_failed' etc
  gameId?: string;
  gameName?: string;
  failureKind?: string;     // 'not_installed' | 'error' | 'timeout'
  error?: string;
  createdAt?: string;
  serverTime?: any;
  acknowledged?: boolean;
}

export function PCAlertsListener() {
  const [alerts, setAlerts] = useState<PCAlert[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    // Listen to *unacknowledged* alerts only — acknowledged ones leave the stack
    // immediately when staff click ✓. Limit to recent ones in case the field
    // index doesn't include the boolean filter yet.
    const q = query(collection(db, 'pc-alerts'), where('acknowledged', '==', false));
    const unsub = onSnapshot(q, (snap) => {
      const list: PCAlert[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      // Newest first
      list.sort((a, b) => {
        const ta = a.serverTime?.seconds || (a.createdAt ? Date.parse(a.createdAt) / 1000 : 0);
        const tb = b.serverTime?.seconds || (b.createdAt ? Date.parse(b.createdAt) / 1000 : 0);
        return tb - ta;
      });
      // Cap visible toasts at 4 — overflow is invisible until cleared
      setAlerts(list.slice(0, 4));
    });
    return () => unsub();
  }, []);

  const acknowledge = async (id: string) => {
    setBusyId(id);
    try {
      await updateDoc(doc(db, 'pc-alerts', id), {
        acknowledged: true,
        acknowledgedAt: Date.now(),
      });
    } catch { /* best-effort */ }
    setBusyId(null);
  };

  const installOnPc = async (alert: PCAlert) => {
    if (!alert.gameId || !alert.pcId) return;
    const src = INSTALL_SOURCES[alert.gameId];
    if (!src) {
      // No catalog mapping — nothing to install. Acknowledge instead.
      await acknowledge(alert.id);
      return;
    }
    setBusyId(alert.id);
    try {
      const shell = buildInstallShellCommand(src);
      await updateDoc(doc(db, 'pcs', alert.pcId), {
        pendingCommand: { command: `run-cmd:${shell}`, data: null, timestamp: Date.now(), executed: false },
        command: `run-cmd:${shell}`,
      });
      // Auto-ack — staff doesn't need to click twice
      await updateDoc(doc(db, 'pc-alerts', alert.id), {
        acknowledged: true,
        acknowledgedAt: Date.now(),
        action: 'install_pushed',
      });
    } catch (err) {
      console.error('install on PC failed', err);
    }
    setBusyId(null);
  };

  return (
    <div className="fixed top-4 right-4 z-[400] flex flex-col gap-3 max-w-sm pointer-events-none">
      <AnimatePresence>
        {alerts.map((a) => {
          const isLaunchFail = a.kind === 'launch_failed';
          const installable = isLaunchFail && !!a.gameId && !!INSTALL_SOURCES[a.gameId];
          const busy = busyId === a.id;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-red-500/15 backdrop-blur-md shadow-2xl shadow-amber-500/20 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-100 text-sm leading-tight">
                    {a.pcName || a.pcId} {a.playerName ? `· ${a.playerName}` : ''}
                  </p>
                  <p className="text-amber-200/80 text-xs mt-0.5">
                    {isLaunchFail
                      ? <>Game launch failed: <span className="font-medium text-amber-100">{a.gameName || a.gameId}</span></>
                      : (a.kind || 'Alert')}
                  </p>
                  {a.failureKind && (
                    <p className="text-[11px] text-amber-300/70 mt-0.5 font-mono">
                      {a.failureKind}{a.error ? ` — ${a.error.slice(0, 80)}${a.error.length > 80 ? '…' : ''}` : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => acknowledge(a.id)}
                  disabled={busy}
                  className="p-1.5 rounded-lg hover:bg-amber-500/30 text-amber-200 disabled:opacity-40">
                  <X size={14} />
                </button>
              </div>

              <div className="flex gap-2 mt-3">
                {installable && (
                  <button
                    onClick={() => installOnPc(a)}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Install on PC
                  </button>
                )}
                <button
                  onClick={() => acknowledge(a.id)}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-amber-100 text-xs font-medium flex items-center justify-center gap-1.5">
                  <Check size={12} />
                  Acknowledge
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
