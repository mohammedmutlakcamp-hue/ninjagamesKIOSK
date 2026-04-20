'use client';

// LIVE PCs DASHBOARD
// Real-time grid of every PC in the shop. Each tile shows:
//   - PC name + zone
//   - Status: Online / Offline / Locked / In-session
//   - Current player (username + avatar) if any
//   - Time left (minutes) if player on
//   - Current game / activity if known
//   - Quick actions: add 15m, add 30m, add 1h, send message, force logout, lock, unlock
//
// Data sources:
//   - pcs collection: one doc per PC (pcId, pcName, zone, online, lastSeen, locked, currentPlayerId, currentPlayerName)
//   - players collection: for the current player's remainingPlaytime + activity
//
// Writes to `pc-commands/{commandId}` for the C# client to pick up and execute.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, addDoc, updateDoc, doc, increment, query, orderBy,
} from 'firebase/firestore';
import {
  Monitor, User, Zap, ZapOff, Lock, Unlock, LogOut, MessageCircle,
  Plus, Loader2, Clock, Gamepad2, Activity, Wifi, WifiOff, X, Send,
} from 'lucide-react';

interface PC {
  id: string;
  pcName?: string;
  zone?: string;
  online?: boolean;
  lastSeen?: number;
  locked?: boolean;
  currentPlayerId?: string;
  currentPlayerName?: string;
  sessionStartedAt?: number;
}

interface PlayerLite {
  uid: string;
  username?: string;
  coins?: number;
  remainingPlaytime?: number;
  onlineStatus?: { isOnline?: boolean; currentActivity?: string; currentGameId?: string };
  profilePhoto?: string;
  character?: any;
  ninjaType?: string;
}

const input = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] text-sm';

function isOnline(pc: PC): boolean {
  if (pc.online) return true;
  if (!pc.lastSeen) return false;
  return Date.now() - pc.lastSeen < 90_000; // 90s grace
}

function fmtTimeAgo(ts?: number): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtSessionLength(start?: number): string {
  if (!start) return '—';
  const mins = Math.floor((Date.now() - start) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function LivePCsDashboard() {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [msgTarget, setMsgTarget] = useState<PC | null>(null);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      setPcs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as PC));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'players'), (snap) => {
      const map: Record<string, PlayerLite> = {};
      snap.docs.forEach((d) => { map[d.id] = { uid: d.id, ...(d.data() as any) } as PlayerLite; });
      setPlayers(map);
    });
    return () => unsub();
  }, []);

  const zones = useMemo(() => {
    const set = new Set<string>();
    pcs.forEach((p) => { if (p.zone) set.add(p.zone); });
    return Array.from(set).sort();
  }, [pcs]);

  const filteredPcs = useMemo(() => {
    const base = zoneFilter === 'all' ? pcs : pcs.filter((p) => p.zone === zoneFilter);
    return base.sort((a, b) => (a.pcName || a.id).localeCompare(b.pcName || b.id));
  }, [pcs, zoneFilter]);

  const stats = useMemo(() => {
    const online = pcs.filter(isOnline).length;
    const inSession = pcs.filter((p) => isOnline(p) && !!p.currentPlayerId).length;
    const locked = pcs.filter((p) => p.locked).length;
    return { total: pcs.length, online, inSession, idle: online - inSession, locked };
  }, [pcs]);

  // ── Actions ──────────────────────────────────────────────────
  const sendCommand = async (pc: PC, command: string, extra: Record<string, any> = {}) => {
    setActionBusy(`${pc.id}-${command}`);
    try {
      await addDoc(collection(db, 'pc-commands'), {
        pcId: pc.id, pcName: pc.pcName || pc.id,
        command, ...extra, status: 'sent', createdAt: Date.now(),
      });
    } finally {
      setActionBusy(null);
    }
  };

  const addMinutesToPlayer = async (pc: PC, minutes: number) => {
    if (!pc.currentPlayerId) return;
    setActionBusy(`${pc.id}-addtime-${minutes}`);
    try {
      await updateDoc(doc(db, 'players', pc.currentPlayerId), { remainingPlaytime: increment(minutes) });
    } finally {
      setActionBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!msgTarget || !msgText.trim()) return;
    setMsgSending(true);
    try {
      await addDoc(collection(db, 'pc-commands'), {
        pcId: msgTarget.id, pcName: msgTarget.pcName || msgTarget.id,
        command: 'show-message', message: msgText.trim(),
        status: 'sent', createdAt: Date.now(),
      });
      setMsgText('');
      setMsgTarget(null);
    } finally {
      setMsgSending(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.25)' }}>
            <Monitor size={22} className="text-[#34c759]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Live PCs</h2>
            <p className="text-[#86868b] text-sm">Real-time shop floor — updates every second via Firestore</p>
          </div>
        </div>
        {zones.length > 0 && (
          <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}
            className={`${input} w-auto`}>
            <option value="all">All zones</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total PCs', value: stats.total, color: '#1d1d1f' },
          { label: 'Online', value: stats.online, color: '#34c759' },
          { label: 'In session', value: stats.inSession, color: '#0071e3' },
          { label: 'Idle', value: stats.idle, color: '#ff9500' },
          { label: 'Locked', value: stats.locked, color: '#ff3b30' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#e5e5ea]/60 rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-[#86868b] mb-1">{s.label}</div>
            <div className="text-2xl font-semibold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {pcs.length === 0 ? (
        <div className="text-center py-16 bg-[#f5f5f7] rounded-2xl border border-dashed border-[#d2d2d7]">
          <Monitor size={40} className="mx-auto mb-3 text-[#86868b] opacity-40" />
          <p className="text-[#1d1d1f] font-medium">No PCs registered</p>
          <p className="text-[#86868b] text-sm mt-1">Kiosks report themselves on first launch.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPcs.map((pc) => {
            const player = pc.currentPlayerId ? players[pc.currentPlayerId] : null;
            const online = isOnline(pc);
            const accent = !online ? '#86868b' : pc.currentPlayerId ? '#34c759' : '#ff9500';
            return (
              <motion.div key={pc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-[#e5e5ea]/60 overflow-hidden"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {/* Header strip */}
                <div className="relative px-4 py-3 flex items-center justify-between"
                  style={{ background: `${accent}10`, borderBottom: `1px solid ${accent}20` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: accent, boxShadow: online ? `0 0 6px ${accent}` : 'none' }} />
                    <span className="font-semibold text-[#1d1d1f]">{pc.pcName || pc.id}</span>
                    {pc.zone && <span className="text-[10px] text-[#86868b]">· {pc.zone}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {online ? <Wifi size={12} className="text-[#34c759]" /> : <WifiOff size={12} className="text-[#86868b]" />}
                    {pc.locked && <Lock size={12} className="text-[#ff3b30]" />}
                  </div>
                </div>

                {/* Body */}
                <div className="p-4">
                  {!online ? (
                    <div className="py-4 text-center text-[#86868b] text-sm">
                      <WifiOff size={20} className="mx-auto mb-1 opacity-50" />
                      Offline · last seen {fmtTimeAgo(pc.lastSeen)}
                    </div>
                  ) : pc.currentPlayerId && player ? (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center flex-shrink-0">
                          <User size={18} className="text-[#0071e3]" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-[#1d1d1f] truncate">{player.username || pc.currentPlayerName}</div>
                          <div className="text-[10px] text-[#86868b]">
                            {fmtSessionLength(pc.sessionStartedAt)} on session
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-[#f5f5f7] rounded-lg px-2 py-1.5">
                          <div className="text-[9px] text-[#86868b]">TIME LEFT</div>
                          <div className={`text-sm font-semibold ${(player.remainingPlaytime || 0) <= 5 ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>
                            {player.remainingPlaytime ?? 0} min
                          </div>
                        </div>
                        <div className="bg-[#f5f5f7] rounded-lg px-2 py-1.5">
                          <div className="text-[9px] text-[#86868b]">TOKENS</div>
                          <div className="text-sm font-semibold text-[#eab308]">{Math.floor(player.coins || 0).toLocaleString()}</div>
                        </div>
                      </div>

                      {player.onlineStatus?.currentActivity && (
                        <div className="text-[11px] text-[#86868b] flex items-center gap-1 mb-2 truncate">
                          <Gamepad2 size={11} /> {player.onlineStatus.currentActivity}
                        </div>
                      )}

                      {/* Add-time buttons */}
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        {[15, 30, 60].map((m) => {
                          const busy = actionBusy === `${pc.id}-addtime-${m}`;
                          return (
                            <button key={m} onClick={() => addMinutesToPlayer(pc, m)} disabled={busy}
                              className="py-1.5 rounded-lg bg-[#34c759]/10 text-[#34c759] text-[11px] font-semibold hover:bg-[#34c759]/20 disabled:opacity-40 flex items-center justify-center gap-1">
                              {busy ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} {m}m
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="py-3 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ff9500]/10 text-[#ff9500] text-[10px] font-bold tracking-wider">
                        <Activity size={10} /> IDLE — no player
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    <button onClick={() => setMsgTarget(pc)} disabled={!online}
                      title="Send message"
                      className="py-1.5 rounded-lg bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/20 disabled:opacity-40 flex items-center justify-center">
                      <MessageCircle size={12} />
                    </button>
                    <button onClick={() => sendCommand(pc, pc.locked ? 'unlock' : 'lock')} disabled={!online}
                      title={pc.locked ? 'Unlock' : 'Lock'}
                      className="py-1.5 rounded-lg bg-[#ff9500]/10 text-[#ff9500] hover:bg-[#ff9500]/20 disabled:opacity-40 flex items-center justify-center">
                      {pc.locked ? <Unlock size={12} /> : <Lock size={12} />}
                    </button>
                    <button onClick={() => sendCommand(pc, 'force-logout')} disabled={!online || !pc.currentPlayerId}
                      title="Force logout"
                      className="py-1.5 rounded-lg bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20 disabled:opacity-40 flex items-center justify-center">
                      <LogOut size={12} />
                    </button>
                    <button onClick={() => sendCommand(pc, 'restart')} disabled={!online}
                      title="Restart"
                      className="py-1.5 rounded-lg bg-[#86868b]/10 text-[#86868b] hover:bg-[#86868b]/20 disabled:opacity-40 flex items-center justify-center">
                      <Zap size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ───── Send Message Modal ───── */}
      <AnimatePresence>
        {msgTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
            onClick={() => !msgSending && setMsgTarget(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-[480px] max-w-full"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <MessageCircle size={18} className="text-[#0071e3]" />
                  Message {msgTarget.pcName || msgTarget.id}
                </h3>
                <button onClick={() => setMsgTarget(null)} className="w-8 h-8 rounded-lg hover:bg-[#f5f5f7]"><X size={16} /></button>
              </div>
              <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={4}
                placeholder="e.g. Please come to the counter" className={`${input} resize-none mb-3`} />
              <button onClick={sendMessage} disabled={msgSending || !msgText.trim()}
                className="w-full py-2.5 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] disabled:opacity-50">
                {msgSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send to kiosk
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
