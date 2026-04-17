'use client';

// ═══════════════════════════════════════════════════════════════════
//  Remote Game Install — push installs to any PC without leaving the kiosk
// ───────────────────────────────────────────────────────────────────
//  How it works:
//    • Each kiosk PC polls `pcs/{pcId}.pendingCommand` every 8s
//      (see NinjaKiosk MainWindow.xaml.cs FirebasePollCommandAsync).
//    • The C# client already supports `run-cmd:<shell>` — we send
//        run-cmd:start steam://install/<appid>
//      which Steam handles natively (silent install if user is logged in).
//    • For Epic / Riot / direct downloads we fall back to opening the
//      relevant store page or download URL in the default browser.
//
//  No kiosk client changes required — this panel is pure server-side.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import {
  INSTALL_SOURCES, SOURCE_BADGE, buildInstallShellCommand,
  type InstallSource,
} from '@/lib/install-sources';
import {
  Download, Monitor, Search, Send, Check, Loader2, Wifi, WifiOff,
  Gamepad2, Plus, X, ExternalLink,
} from 'lucide-react';

interface PCDoc {
  id: string;
  name?: string;
  pcName?: string;
  status?: string;
  online?: boolean;
  lastHeartbeat?: number;
  zone?: string;
}

export function RemoteInstallPanel() {
  const [pcs, setPcs] = useState<PCDoc[]>([]);
  const [selectedPcIds, setSelectedPcIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ msg: string; ok: boolean } | null>(null);

  // Custom Steam appid (for games not in the catalog)
  const [customAppid, setCustomAppid] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PCDoc[];
      setPcs(list.sort((a, b) => (a.name || a.pcName || a.id).localeCompare(b.name || b.pcName || b.id)));
    });
    return () => unsub();
  }, []);

  // PC is "online" if heartbeat in the last 30s
  const onlinePcs = useMemo(() => {
    const now = Date.now();
    return pcs.filter((p) => p.lastHeartbeat && now - p.lastHeartbeat < 30_000);
  }, [pcs]);

  const togglePc = (id: string) => {
    setSelectedPcIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllOnline = () => {
    setSelectedPcIds(new Set(onlinePcs.map((p) => p.id)));
  };

  const clearSelection = () => setSelectedPcIds(new Set());

  // Push install command to every selected PC
  const installOn = async (gameId: string, gameLabel: string, src: InstallSource) => {
    if (selectedPcIds.size === 0) {
      setLastResult({ msg: 'Pick at least one PC first.', ok: false });
      return;
    }
    setSending(gameId);
    setLastResult(null);
    const shell = buildInstallShellCommand(src);
    const cmdString = `run-cmd:${shell}`;
    let okCount = 0;
    for (const pcId of Array.from(selectedPcIds)) {
      try {
        await updateDoc(doc(db, 'pcs', pcId), {
          pendingCommand: { command: cmdString, data: null, timestamp: Date.now(), executed: false },
          command: cmdString,
        });
        okCount++;
      } catch (err) {
        console.error('install push failed for', pcId, err);
      }
    }
    setLastResult({
      msg: `Sent ${gameLabel} install to ${okCount}/${selectedPcIds.size} PC(s) via ${SOURCE_BADGE[src.type].label}.`,
      ok: okCount > 0,
    });
    setSending(null);
  };

  const installCustomSteam = async () => {
    const appid = parseInt(customAppid.trim(), 10);
    if (!appid || appid <= 0) {
      setLastResult({ msg: 'Enter a valid Steam AppID (numbers only).', ok: false });
      return;
    }
    const label = customLabel.trim() || `Steam #${appid}`;
    await installOn(`custom-${appid}`, label, { type: 'steam', appid });
  };

  // Filter catalog games by search and only show those we have install URIs for
  const installableGames = useMemo(() => {
    return GAMES_CATALOG
      .filter((g) => INSTALL_SOURCES[g.id])
      .filter((g) => !search.trim() || g.name.toLowerCase().includes(search.toLowerCase().trim()));
  }, [search]);

  const inputClass = 'bg-white border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none text-sm';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(0,113,227,0.1)', border: '1px solid rgba(0,113,227,0.25)' }}>
          <Download size={22} className="text-[#0071e3]" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Remote Install Games</h2>
          <p className="text-[#86868b] text-sm">
            Push game installs to one or many PCs without exiting the kiosk.
            {' '}{onlinePcs.length}/{pcs.length} PCs online.
          </p>
        </div>
      </div>

      {/* PC selector */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea] p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-[#0071e3]" />
            <h3 className="font-semibold text-[#1d1d1f] text-sm">Target PCs</h3>
            <span className="text-xs text-[#86868b]">({selectedPcIds.size} selected)</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAllOnline}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5ea] transition-colors border border-[#e5e5ea]">
              Select all online
            </button>
            <button onClick={clearSelection}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:bg-[#e5e5ea] transition-colors border border-[#e5e5ea]">
              Clear
            </button>
          </div>
        </div>
        {pcs.length === 0 ? (
          <p className="text-[#86868b] text-sm py-4 text-center">No PCs registered yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {pcs.map((pc) => {
              const isOnline = onlinePcs.some((p) => p.id === pc.id);
              const selected = selectedPcIds.has(pc.id);
              const label = pc.name || pc.pcName || pc.id;
              return (
                <button
                  key={pc.id}
                  onClick={() => togglePc(pc.id)}
                  disabled={!isOnline}
                  className={`relative px-3 py-2.5 rounded-xl text-left text-sm transition-all border-2 ${
                    !isOnline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                  style={{
                    background: selected ? 'rgba(52,199,89,0.08)' : 'white',
                    borderColor: selected ? '#34c759' : '#e5e5ea',
                  }}
                >
                  <div className="flex items-center gap-2">
                    {selected ? <Check size={14} className="text-[#34c759]" /> :
                      isOnline ? <Wifi size={14} className="text-[#34c759]" /> :
                      <WifiOff size={14} className="text-[#86868b]" />}
                    <span className="font-medium text-[#1d1d1f] truncate">{label}</span>
                  </div>
                  {pc.zone && <span className="text-[10px] text-[#86868b] block ml-6">{pc.zone}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Steam appid */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea] p-4 mb-5">
        <h3 className="font-semibold text-[#1d1d1f] text-sm mb-2 flex items-center gap-2">
          <Plus size={14} /> Install by Steam AppID (custom)
        </h3>
        <p className="text-xs text-[#86868b] mb-3">
          Find any game's AppID at <a href="https://steamdb.info" target="_blank" rel="noreferrer" className="text-[#0071e3] underline">steamdb.info</a>.
        </p>
        <div className="flex gap-2">
          <input
            value={customAppid}
            onChange={(e) => setCustomAppid(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="AppID (e.g. 730)"
            className={`${inputClass} w-40`}
          />
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Game name (optional)"
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={installCustomSteam}
            disabled={!customAppid || sending !== null || selectedPcIds.size === 0}
            className="px-4 py-2 rounded-xl bg-[#0071e3] text-white text-sm font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            <Send size={14} /> Push Install
          </button>
        </div>
      </div>

      {/* Catalog grid */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[#1d1d1f] text-sm flex items-center gap-2">
            <Gamepad2 size={14} /> Game catalog ({installableGames.length})
          </h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search game..."
              className={`${inputClass} pl-9 w-64`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
          {installableGames.map((g) => {
            const src = INSTALL_SOURCES[g.id]!;
            const badge = SOURCE_BADGE[src.type];
            const isSending = sending === g.id;
            return (
              <motion.div
                key={g.id}
                whileHover={{ y: -2 }}
                className="rounded-xl p-3 border border-[#e5e5ea] bg-[#fafafa] flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-[#1d1d1f] text-sm truncate flex-1" title={g.name}>{g.name}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                    style={{ background: badge.color }}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-[10px] text-[#86868b]">{g.genre}</p>
                <button
                  onClick={() => installOn(g.id, g.name, src)}
                  disabled={isSending || selectedPcIds.size === 0}
                  className="mt-auto w-full px-3 py-1.5 rounded-lg bg-[#0071e3] text-white text-xs font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {isSending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {isSending ? 'Sending...' : `Install on ${selectedPcIds.size} PC${selectedPcIds.size === 1 ? '' : 's'}`}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Result toast */}
      {lastResult && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-sm"
          style={{
            background: lastResult.ok ? 'rgba(52,199,89,0.95)' : 'rgba(255,59,48,0.95)',
            color: 'white',
          }}>
          {lastResult.ok ? <Check size={16} /> : <X size={16} />}
          <span className="text-sm">{lastResult.msg}</span>
          <button onClick={() => setLastResult(null)} className="ml-auto">
            <X size={14} />
          </button>
        </motion.div>
      )}

      {/* How-it-works footer */}
      <div className="mt-6 rounded-xl p-4 bg-[#f5f5f7] border border-[#e5e5ea]">
        <p className="text-xs text-[#86868b] leading-relaxed">
          <span className="font-medium text-[#1d1d1f]">How this works:</span> the panel writes
          <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-[#e5e5ea] text-[#1d1d1f]">run-cmd:start steam://install/&lt;appid&gt;</code>
          to each selected PC's pendingCommand. The kiosk client polls every ~8s,
          executes the command silently (no kiosk exit needed), and Steam handles the rest.
          Epic and Browser sources open the relevant store/download page — a worker may need
          to click "Install" once at the desk for those.
          <span className="inline-flex items-center gap-1 ml-2">
            <ExternalLink size={11} /> Steam links auto-install when the user is logged in.
          </span>
        </p>
      </div>
    </div>
  );
}
