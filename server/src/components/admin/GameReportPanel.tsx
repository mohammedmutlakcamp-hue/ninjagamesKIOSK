'use client';

// ═══════════════════════════════════════════════════════════════════
//  Game Report — per-PC view of installed vs missing games
// ───────────────────────────────────────────────────────────────────
//  How it works:
//    1. Admin clicks PULL on a PC → we write `rescan-games` to its
//       pendingCommand. Within ~8 s the kiosk client runs
//       GameDiscovery.ScanInstalled() and writes the results to
//       pcs/{pcId}.installedGames[] (each entry: id, name, exePath,
//       source). We also store installedGamesScannedAt / Count.
//    2. We diff that list against the catalog (GAMES_CATALOG +
//       INSTALL_SOURCES). Anything in the catalog that is NOT in the
//       PC's installedGames[] is shown as "missing".
//    3. Click "Install" on a missing game → we send
//       run-cmd:start steam://install/<appid> (or Epic / browser
//       fallback) to that PC. Steam silently installs; Epic / browser
//       open the relevant store page.
//
//  Zero kiosk-client changes — `rescan-games` and `run-cmd:` are
//  already in NinjaKiosk MainWindow.xaml.cs.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import {
  INSTALL_SOURCES, SOURCE_BADGE, buildInstallShellCommand,
} from '@/lib/install-sources';
import { pcIsOnline as sharedPcIsOnline, pcLastSeenLabel } from '@/lib/pc-status';
import {
  ClipboardList, RefreshCw, Monitor, Wifi, WifiOff, ChevronDown, ChevronRight,
  Check, X, Download, Loader2, FolderOpen, Info, Search, Gamepad2, AlertCircle,
} from 'lucide-react';

interface InstalledGame {
  id: string;
  name: string;
  exePath: string;
  source: string;
}

interface PCDoc {
  id: string;
  name?: string;
  pcName?: string;
  zone?: string;
  online?: boolean;
  lastSeen?: any;        // Firestore Timestamp written by the C# kiosk
  lastHeartbeat?: number; // legacy fallback
  installedGames?: InstalledGame[];
  installedGamesCount?: number;
  installedGamesScannedAt?: any;
}

// Reuse the project-wide canonical helpers so this panel agrees with
// PCManagement, RemoteInstallPanel, and GameUpdatePusher about whether
// a PC is online (90s window, multi-format heartbeat parsing).
const pcIsOnline = sharedPcIsOnline;
function tsToMs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && 'seconds' in ts) return ts.seconds * 1000;
  if (typeof ts === 'object' && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts === 'string') { const t = Date.parse(ts); return isNaN(t) ? null : t; }
  return null;
}

function fmtAge(ms: number | null): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function GameReportPanel() {
  const [pcs, setPcs] = useState<PCDoc[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullingAll, setPullingAll] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null); // key = `${pcId}:${gameId}`
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PCDoc[];
      setPcs(list.sort((a, b) => (a.name || a.pcName || a.id).localeCompare(b.name || b.pcName || b.id)));
    });
    return () => unsub();
  }, []);

  // PC is online when its kiosk heartbeat (lastSeen Firestore Timestamp)
  // lands within 60 s. Falls back to legacy lastHeartbeat number if any
  // older PC doc still uses it.
  const isOnline = (pc: PCDoc) => pcIsOnline(pc);

  const togglePc = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(pcs.map((p) => p.id)));
  const collapseAll = () => setExpanded(new Set());

  // PULL — tell a PC to re-scan its installed games and push the results.
  const pullOne = async (pcId: string) => {
    setPulling(pcId);
    try {
      await updateDoc(doc(db, 'pcs', pcId), {
        pendingCommand: { command: 'rescan-games', data: null, timestamp: Date.now(), executed: false },
        command: 'rescan-games',
      });
    } catch (err) { console.error('pull failed', err); }
    setPulling(null);
  };

  const pullAllOnline = async () => {
    setPullingAll(true);
    for (const pc of pcs) {
      if (!isOnline(pc)) continue;
      try {
        await updateDoc(doc(db, 'pcs', pc.id), {
          pendingCommand: { command: 'rescan-games', data: null, timestamp: Date.now(), executed: false },
          command: 'rescan-games',
        });
      } catch (err) { console.error('pull-all failed for', pc.id, err); }
    }
    setPullingAll(false);
  };

  // INSTALL — push the install command to one PC for one game
  const installOnPc = async (pcId: string, gameId: string) => {
    const src = INSTALL_SOURCES[gameId];
    if (!src) return;
    const key = `${pcId}:${gameId}`;
    setInstalling(key);
    try {
      const shell = buildInstallShellCommand(src);
      await updateDoc(doc(db, 'pcs', pcId), {
        pendingCommand: { command: `run-cmd:${shell}`, data: null, timestamp: Date.now(), executed: false },
        command: `run-cmd:${shell}`,
      });
    } catch (err) { console.error('install push failed', err); }
    setInstalling(null);
  };

  // Build per-PC report: { installedRows, missingRows }
  const report = useMemo(() => {
    return pcs.map((pc) => {
      const installedList = pc.installedGames || [];
      const installedById = new Map(installedList.map((g) => [g.id, g]));
      const installedRows = GAMES_CATALOG
        .filter((g) => installedById.has(g.id))
        .map((g) => ({ ...g, installed: installedById.get(g.id)! }));
      // Show in installed: ALSO any game id that the kiosk reported but that
      // isn't in our catalog (defensive — keeps the report honest).
      const catalogIds = new Set(GAMES_CATALOG.map((g) => g.id));
      const orphanInstalled = installedList
        .filter((g) => !catalogIds.has(g.id))
        .map((g) => ({ id: g.id, name: g.name, genre: 'Unknown', installed: g, defaultExePath: '' }));
      const missingRows = GAMES_CATALOG
        .filter((g) => !installedById.has(g.id))
        .map((g) => ({ ...g, installable: !!INSTALL_SOURCES[g.id] }));
      return {
        pc,
        installedRows: [...installedRows, ...orphanInstalled],
        missingRows,
      };
    });
  }, [pcs]);

  const filteredReport = useMemo(() => {
    if (!search.trim()) return report;
    const s = search.toLowerCase().trim();
    return report.filter((r) => {
      const label = (r.pc.name || r.pc.pcName || r.pc.id).toLowerCase();
      return label.includes(s) || (r.pc.zone || '').toLowerCase().includes(s);
    });
  }, [report, search]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
            <ClipboardList size={22} className="text-[#a855f7]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Game Report</h2>
            <p className="text-[#86868b] text-sm">
              See which games are installed (and where) on every PC, and install missing ones with one click.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll}
            className="text-xs px-3 py-2 rounded-lg bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5ea] border border-[#e5e5ea] transition-colors">
            Expand all
          </button>
          <button onClick={collapseAll}
            className="text-xs px-3 py-2 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:bg-[#e5e5ea] border border-[#e5e5ea] transition-colors">
            Collapse all
          </button>
          <button
            onClick={pullAllOnline}
            disabled={pullingAll || pcs.filter(isOnline).length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0071e3] text-white text-xs font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-40"
          >
            {pullingAll ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Pull from ALL online ({pcs.filter(isOnline).length})
          </button>
        </div>
      </div>

      {/* Help banner */}
      <AnimatePresence>
        {showHelp && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mb-5 rounded-xl bg-white border border-[#0071e3]/20 overflow-hidden">
            <div className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0,113,227,0.1)', border: '1px solid rgba(0,113,227,0.25)' }}>
                <Info size={16} className="text-[#0071e3]" />
              </div>
              <div className="flex-1 text-sm leading-relaxed">
                <p className="font-semibold text-[#1d1d1f] mb-2">How to use this panel</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-[#1d1d1f]">
                  <li>
                    <span className="font-medium">PULL.</span>{' '}
                    Click the green <kbd className="px-1.5 py-0.5 rounded border border-[#e5e5ea] bg-[#f5f5f7] text-[11px]">Pull</kbd>
                    {' '}button on any PC card (or <span className="text-[#0071e3] font-medium">Pull from ALL online</span> at the top).
                    The kiosk runs <code className="px-1 rounded bg-[#f5f5f7] text-[11px]">GameDiscovery.ScanInstalled()</code>
                    {' '}and pushes the result to Firestore. Card refreshes within ~8 seconds.
                  </li>
                  <li>
                    <span className="font-medium">REVIEW.</span>{' '}
                    The card shows two sections:
                    <span className="text-[#34c759] font-medium"> Installed</span> (with the actual exe path detected on disk)
                    and <span className="text-[#ff3b30] font-medium">Missing</span> (catalog entries not found on this PC).
                  </li>
                  <li>
                    <span className="font-medium">INSTALL.</span>{' '}
                    For any missing game with a known source, hit the
                    <span className="text-[#0071e3] font-medium"> Install</span> button. We send
                    {' '}<code className="px-1 rounded bg-[#f5f5f7] text-[11px]">run-cmd:start steam://install/&lt;appid&gt;</code>
                    {' '}(or Epic / browser fallback). Steam handles the install silently — the player never leaves the kiosk.
                  </li>
                  <li>
                    <span className="font-medium">VERIFY.</span>{' '}
                    After ~5–10 minutes (depending on the download), hit Pull again to confirm
                    the game now appears under Installed with its real path.
                  </li>
                </ol>
                <p className="text-[12px] text-[#86868b] mt-3">
                  <span className="font-medium text-[#1d1d1f]">Source badges:</span>{' '}
                  <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold mr-1" style={{ background: '#1b2838' }}>STEAM</span>
                  silent install ·{' '}
                  <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold mx-1" style={{ background: '#2a2a2a' }}>EPIC</span>
                  opens Epic store page (one click at desk) ·{' '}
                  <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-bold mx-1" style={{ background: '#6b7280' }}>BROWSER</span>
                  opens download page in default browser
                </p>
              </div>
              <button onClick={() => setShowHelp(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!showHelp && (
        <button onClick={() => setShowHelp(true)}
          className="mb-3 text-xs text-[#0071e3] hover:underline flex items-center gap-1">
          <Info size={12} /> Show help
        </button>
      )}

      {/* PC search */}
      <div className="mb-4 max-w-sm relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PC by name or zone..."
          className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-[#d2d2d7] text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
        />
      </div>

      {/* Per-PC cards */}
      {filteredReport.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e5e5ea] p-12 text-center text-[#86868b] text-sm">
          No PCs match the search.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReport.map(({ pc, installedRows, missingRows }) => {
            const online = isOnline(pc);
            const isExpanded = expanded.has(pc.id);
            const isPulling = pulling === pc.id || pullingAll;
            const scannedAtMs = tsToMs(pc.installedGamesScannedAt);
            const label = pc.name || pc.pcName || pc.id;

            return (
              <motion.div key={pc.id} layout
                className="bg-white rounded-2xl border border-[#e5e5ea] overflow-hidden">
                {/* Card header */}
                <button
                  onClick={() => togglePc(pc.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-[#f5f5f7]/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: online ? 'rgba(52,199,89,0.1)' : 'rgba(134,134,139,0.1)',
                      border: `1px solid ${online ? 'rgba(52,199,89,0.3)' : 'rgba(134,134,139,0.2)'}`,
                    }}>
                    {online ? <Wifi size={16} className="text-[#34c759]" /> : <WifiOff size={16} className="text-[#86868b]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1d1d1f]">{label}</span>
                      {pc.zone && <span className="text-xs text-[#86868b]">· {pc.zone}</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${online ? 'bg-[#34c759]/10 text-[#34c759]' : 'bg-[#86868b]/10 text-[#86868b]'}`}>
                        {online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#86868b]">
                      <span><span className="text-[#34c759] font-medium">{installedRows.length}</span> installed</span>
                      <span><span className="text-[#ff3b30] font-medium">{missingRows.length}</span> missing</span>
                      <span>· last scan {fmtAge(scannedAtMs)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); pullOne(pc.id); }}
                    disabled={!online || isPulling}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#34c759] text-white text-xs font-medium hover:bg-[#28a247] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={online ? 'Pull installed-games list from this PC' : 'PC must be online to pull'}
                  >
                    {isPulling ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Pull
                  </button>
                  {isExpanded ? <ChevronDown size={16} className="text-[#86868b]" /> : <ChevronRight size={16} className="text-[#86868b]" />}
                </button>

                {/* Card body */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden border-t border-[#e5e5ea]">
                      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* INSTALLED */}
                        <div>
                          <h3 className="text-xs font-bold tracking-wider text-[#34c759] mb-2 flex items-center gap-2">
                            <Check size={14} /> INSTALLED ({installedRows.length})
                          </h3>
                          {installedRows.length === 0 ? (
                            <p className="text-xs text-[#86868b] italic py-3 px-3 rounded-lg bg-[#f5f5f7]">
                              {scannedAtMs ? 'Pull returned no installed games.' : 'Hit Pull to scan this PC.'}
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                              {installedRows.map((row) => (
                                <div key={row.id} className="rounded-lg border border-[#e5e5ea] p-2.5 bg-[#fafafa]">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Gamepad2 size={12} className="text-[#34c759] flex-shrink-0" />
                                    <span className="text-sm font-medium text-[#1d1d1f] truncate" title={row.name}>{row.name}</span>
                                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: '#34c759' }}>
                                      {(row.installed.source || 'unknown').toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-[#86868b] font-mono break-all">
                                    <FolderOpen size={10} className="flex-shrink-0 mt-0.5" />
                                    {row.installed.exePath || '(no path reported)'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* MISSING */}
                        <div>
                          <h3 className="text-xs font-bold tracking-wider text-[#ff3b30] mb-2 flex items-center gap-2">
                            <X size={14} /> MISSING ({missingRows.length})
                          </h3>
                          {missingRows.length === 0 ? (
                            <p className="text-xs text-[#86868b] italic py-3 px-3 rounded-lg bg-[#f5f5f7]">
                              Every catalog game is installed. Nice.
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                              {missingRows.map((row) => {
                                const src = INSTALL_SOURCES[row.id];
                                const badge = src ? SOURCE_BADGE[src.type] : null;
                                const installKey = `${pc.id}:${row.id}`;
                                const isInst = installing === installKey;
                                return (
                                  <div key={row.id} className="rounded-lg border border-[#e5e5ea] p-2.5 bg-[#fafafa] flex items-center gap-2">
                                    <Gamepad2 size={12} className="text-[#ff3b30] flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[#1d1d1f] truncate" title={row.name}>{row.name}</span>
                                        <span className="text-[10px] text-[#86868b]">· {row.genre}</span>
                                      </div>
                                    </div>
                                    {badge ? (
                                      <button
                                        onClick={() => installOnPc(pc.id, row.id)}
                                        disabled={!online || isInst}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{ background: badge.color }}
                                        title={online ? `Install via ${badge.label}` : 'PC must be online'}
                                      >
                                        {isInst ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                                        Install · {badge.label}
                                      </button>
                                    ) : (
                                      <span className="flex items-center gap-1 text-[10px] text-[#86868b] px-2 py-1 rounded-md bg-white border border-[#e5e5ea]">
                                        <AlertCircle size={10} /> manual
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
