'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  query, where, orderBy, limit, getDocs
} from 'firebase/firestore';
import { PC, PCStatus, KioskCommand } from '@/types';
import {
  Monitor, Lock, Unlock, RotateCcw, Power, X, User, Coins, Clock,
  Wifi, WifiOff, AlertTriangle, Shield, ShieldOff,
  ShieldCheck, LogOut, Snowflake, MessageSquare,
  Cpu, HardDrive, MemoryStick, Activity, BarChart3, Timer, Users,
  Send, Eye, Terminal, Search, Maximize2,
  LayoutGrid, List, Loader2, Camera,
  Trash2, ArrowRight, Settings2, History,
  Moon, ExternalLink, Play, Square, ChevronDown,
  Globe, Server, Zap, Hash, Network, Info
} from 'lucide-react';

// ═══════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════

type FilterType = 'all' | 'online' | 'occupied' | 'free' | 'offline';
type ViewMode = 'grid' | 'list';
type DetailTab = 'controls' | 'screen' | 'terminal' | 'processes' | 'info' | 'sessions';

interface SessionDoc {
  playerId: string;
  playerName: string;
  pcId: string;
  pcName?: string;
  startTime?: number;
  startedAt?: any;
  endTime?: number | null;
  endedAt?: any;
  duration?: number;
  durationSec?: number;
  coinsSpent?: number;
  active?: boolean;
}

interface PCUsageStats {
  totalSessions: number;
  totalHours: number;
  totalCoins: number;
}

interface CommandLog {
  command: string;
  timestamp: number;
  status: 'sent' | 'ok' | 'failed';
}

interface ProcessInfo {
  pid: number;
  name: string;
  mem: number;
  title: string;
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTimestamp(ts: any): string {
  if (!ts) return 'N/A';
  let d: Date;
  if (typeof ts === 'object' && ts.seconds) d = new Date(ts.seconds * 1000);
  else if (typeof ts === 'object' && ts.toDate) d = ts.toDate();
  else d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function getSessionDuration(startTime: any): string {
  let ts = startTime;
  if (typeof ts === 'object' && ts.seconds) ts = ts.seconds * 1000;
  else if (typeof ts === 'object' && ts.toDate) ts = ts.toDate().getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function timeAgo(ts: any): string {
  if (!ts) return 'Never';
  let ms = ts;
  if (typeof ts === 'object' && ts.seconds) ms = ts.seconds * 1000;
  else if (typeof ts === 'object' && ts.toDate) ms = ts.toDate().getTime();
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ═══════════════════════════════════════════
//  SMALL UI COMPONENTS
// ═══════════════════════════════════════════

function HealthRing({ value, label, icon, color }: { value: number; label: string; icon: React.ReactNode; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct > 90 ? '#ff3b30' : pct > 70 ? '#ff9500' : color;
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const dashArray = `${(pct / 100) * circumference} ${circumference}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e5ea" strokeWidth="4" />
          <circle cx="26" cy="26" r={r} fill="none"
            stroke={barColor} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={dashArray}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#1d1d1f]">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <span className="opacity-70" style={{ color: barColor }}>{icon}</span>
        <span className="text-[10px] text-[#86868b] uppercase">{label}</span>
      </div>
    </div>
  );
}

function HealthBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct > 90 ? '#ff3b30' : pct > 70 ? '#ff9500' : color;
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] text-[#86868b] w-8 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#e5e5ea] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <span className="text-[10px] w-8 text-right shrink-0" style={{ color: barColor }}>{Math.round(pct)}%</span>
    </div>
  );
}

function StatusBadge({ status, online }: { status: string; online: boolean }) {
  if (!online || status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f5f5f7] text-[#86868b] border border-[#e5e5ea]">
        <div className="w-1.5 h-1.5 rounded-full bg-[#d2d2d7]" /> OFFLINE
      </span>
    );
  }
  if (status === 'occupied') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ff3b30]/5 text-[#ff3b30] border border-[#ff3b30]/20">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff3b30] animate-pulse" /> IN USE
      </span>
    );
  }
  if (status === 'reserved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ff9500]/5 text-[#ff9500] border border-[#ff9500]/20">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ff9500]" /> RESERVED
      </span>
    );
  }
  if (status === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#ff9500]/5 text-[#ff9500] border border-[#ff9500]/20">
        <Lock size={8} /> LOCKED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#34c759]/5 text-[#34c759] border border-[#34c759]/20">
      <div className="w-1.5 h-1.5 rounded-full bg-[#34c759]" /> AVAILABLE
    </span>
  );
}

function ActionButton({ onClick, disabled, icon, label, color, small, loading }: {
  onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string;
  color: 'green' | 'red' | 'blue' | 'orange' | 'cyan' | 'purple' | 'gray' | 'yellow';
  small?: boolean; loading?: boolean;
}) {
  const colors = {
    green: 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/20 hover:bg-[#34c759]/20',
    red: 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/20 hover:bg-[#ff3b30]/20',
    blue: 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20 hover:bg-[#0071e3]/20',
    orange: 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/20 hover:bg-[#ff9500]/20',
    cyan: 'bg-[#5ac8fa]/10 text-[#5ac8fa] border-[#5ac8fa]/20 hover:bg-[#5ac8fa]/20',
    purple: 'bg-[#af52de]/10 text-[#af52de] border-[#af52de]/20 hover:bg-[#af52de]/20',
    gray: 'bg-[#f5f5f7] text-[#86868b] border-[#d2d2d7] hover:bg-[#e8e8ed]',
    yellow: 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/20 hover:bg-[#ff9500]/20',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-1.5 border rounded-xl font-medium transition-all
        ${small ? 'px-3 py-2 text-[10px]' : 'px-4 py-2.5 text-xs'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : colors[color]}
        ${loading ? 'opacity-60' : ''}
      `}
    >
      {loading ? <Loader2 size={small ? 10 : 14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]/60">
      <div className="flex items-center gap-2">
        {icon && <span className="text-[#86868b]">{icon}</span>}
        <span className="text-[11px] text-[#86868b]">{label}</span>
      </div>
      <span className={`text-[11px] text-[#1d1d1f] text-right max-w-[220px] truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════

export function PCManagement() {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [selectedPC, setSelectedPC] = useState<PC | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ pc: PC; action: string; label: string } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<string | null>(null);

  const [detailTab, setDetailTab] = useState<DetailTab>('controls');
  const [recentSessions, setRecentSessions] = useState<SessionDoc[]>([]);
  const [usageStats, setUsageStats] = useState<PCUsageStats | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [freezeMessage, setFreezeMessage] = useState('');
  const [popupMessage, setPopupMessage] = useState('');
  const [killAppName, setKillAppName] = useState('');
  const [openUrlValue, setOpenUrlValue] = useState('');

  const [commandLog, setCommandLog] = useState<CommandLog[]>([]);
  const [commandSending, setCommandSending] = useState(false);

  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [screenshotTime, setScreenshotTime] = useState<number>(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [screenshotFullscreen, setScreenshotFullscreen] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<{ cmd: string; output: string; ts: number }[]>([]);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processFilter, setProcessFilter] = useState('');
  const [processLoading, setProcessLoading] = useState(false);
  const [processSortBy, setProcessSortBy] = useState<'mem' | 'name' | 'pid'>('mem');

  const [systemInfo, setSystemInfo] = useState<Record<string, string> | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(false);

  const lastResponseTsRef = useRef<number>(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const updated = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PC))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
      setPcs(updated);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (selectedPC) {
      const live = pcs.find(p => p.id === selectedPC.id);
      if (live) {
        setSelectedPC(live);
        const pcData = live as any;
        if (pcData.screenshot && pcData.screenshotAt) {
          setLiveScreenshot(pcData.screenshot);
          const at = pcData.screenshotAt;
          setScreenshotTime(typeof at === 'object' && at.seconds ? at.seconds * 1000 : typeof at === 'object' && at.toDate ? at.toDate().getTime() : at);
        }
        if (pcData.commandResponse) {
          const resp = pcData.commandResponse;
          const type = resp.type || resp?.type?.stringValue;
          const data = resp.data || resp?.data?.stringValue;
          const respTs = resp.timestamp;
          let tsMs = 0;
          if (respTs) {
            if (typeof respTs === 'object' && respTs.seconds) tsMs = respTs.seconds * 1000;
            else if (typeof respTs === 'object' && respTs.toDate) tsMs = respTs.toDate().getTime();
            else if (typeof respTs === 'number') tsMs = respTs;
          }
          if (type && data && tsMs > lastResponseTsRef.current) {
            lastResponseTsRef.current = tsMs;
            handleCommandResponse(type, data);
          }
        }
      }
    }
  }, [pcs]);

  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (autoRefresh && selectedPC && isOnline(selectedPC)) {
      sendCommand(selectedPC.id, 'screenshot');
      autoRefreshRef.current = setInterval(() => {
        if (selectedPC) sendCommand(selectedPC.id, 'screenshot');
      }, 4000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, selectedPC?.id]);

  useEffect(() => {
    if (!selectedPC) {
      setRecentSessions([]); setUsageStats(null); setDetailTab('controls');
      setFreezeMessage(''); setPopupMessage(''); setKillAppName(''); setOpenUrlValue('');
      setCommandLog([]); setLiveScreenshot(null); setAutoRefresh(false);
      setTerminalHistory([]); setTerminalInput(''); setProcesses([]); setSystemInfo(null);
      lastResponseTsRef.current = 0;
      return;
    }
    const loadData = async () => {
      setLoadingSessions(true);
      try {
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('pcId', '==', selectedPC.id), orderBy('startedAt', 'desc'), limit(30));
        const snap = await getDocs(q);
        setRecentSessions(snap.docs.map(d => d.data() as SessionDoc));
        let totalSessions = 0, totalSeconds = 0, totalCoins = 0;
        snap.docs.forEach(d => { const data = d.data(); totalSessions++; totalSeconds += data.durationSec || 0; totalCoins += data.coinsSpent || 0; });
        setUsageStats({ totalSessions, totalHours: Math.round((totalSeconds / 3600) * 10) / 10, totalCoins });
      } catch (err) { console.error('Failed to load session data:', err); }
      setLoadingSessions(false);
    };
    const pcData = selectedPC as any;
    if (pcData.screenshot) {
      setLiveScreenshot(pcData.screenshot);
      const at = pcData.screenshotAt;
      setScreenshotTime(at ? (typeof at === 'object' && at.seconds ? at.seconds * 1000 : typeof at === 'object' && at.toDate ? at.toDate().getTime() : at) : 0);
    }
    loadData();
  }, [selectedPC?.id]);

  const handleCommandResponse = useCallback((type: string, data: string) => {
    if (type === 'exec') {
      setTerminalHistory(prev => {
        const updated = [...prev];
        let lastPending = -1;
        for (let i = updated.length - 1; i >= 0; i--) { if (updated[i].output === '... Running...') { lastPending = i; break; } }
        if (lastPending >= 0) { updated[lastPending] = { ...updated[lastPending], output: data || '(no output)' }; }
        return updated;
      });
      setTerminalLoading(false);
    } else if (type === 'list-processes') {
      try { const procs: ProcessInfo[] = JSON.parse(data); setProcesses(procs); } catch { setProcesses([]); }
      setProcessLoading(false);
    } else if (type === 'system-info') {
      try { const info = JSON.parse(data); setSystemInfo(info); } catch { setSystemInfo(null); }
      setSystemInfoLoading(false);
    }
  }, []);

  const sendCommand = useCallback(async (pcId: string, command: KioskCommand | string, data?: string) => {
    const cmdString = data ? `${command}:${data}` : command;
    setCommandSending(true);
    const log: CommandLog = { command: cmdString, timestamp: Date.now(), status: 'sent' };
    setCommandLog(prev => [log, ...prev.slice(0, 29)]);
    try {
      await updateDoc(doc(db, 'pcs', pcId), { pendingCommand: { command, data: data || null, timestamp: Date.now(), executed: false }, command: cmdString });
      log.status = 'ok';
      setCommandLog(prev => [{ ...prev[0], status: 'ok' }, ...prev.slice(1)]);
    } catch (err) {
      log.status = 'failed';
      setCommandLog(prev => [{ ...prev[0], status: 'failed' }, ...prev.slice(1)]);
    }
    setCommandSending(false);
  }, []);

  const toggleLock = useCallback(async (pc: PC) => {
    const newStatus: PCStatus = pc.status === 'locked' ? 'free' : 'locked';
    await updateDoc(doc(db, 'pcs', pc.id), { status: newStatus });
    sendCommand(pc.id, newStatus === 'locked' ? 'lock' : 'unlock');
  }, [sendCommand]);

  const toggleLockdown = useCallback(async (pc: PC) => {
    const newCmd = pc.lockdownActive ? 'fullaccess' : 'lockdown';
    await sendCommand(pc.id, newCmd);
    await updateDoc(doc(db, 'pcs', pc.id), { lockdownActive: !pc.lockdownActive });
  }, [sendCommand]);

  const forceLogout = useCallback(async (pc: PC) => {
    await sendCommand(pc.id, 'force-logout');
    await updateDoc(doc(db, 'pcs', pc.id), { status: 'free' as PCStatus, currentPlayer: null, currentPlayerName: null, currentPlayerId: '', sessionStart: null, coinsRemaining: null, minutesRemaining: null });
  }, [sendCommand]);

  const deletePC = useCallback(async (pc: PC) => { await deleteDoc(doc(db, 'pcs', pc.id)); setSelectedPC(null); }, []);

  const executeBulkAction = useCallback(async (action: string) => {
    const targets = pcs.filter(p => isOnline(p) && p.status !== 'offline');
    for (const pc of targets) {
      if (action === 'restart-all') await sendCommand(pc.id, 'restart');
      else if (action === 'shutdown-all') { await sendCommand(pc.id, 'shutdown'); await updateDoc(doc(db, 'pcs', pc.id), { status: 'offline' as PCStatus }); }
      else if (action === 'lock-all') await sendCommand(pc.id, 'lock');
      else if (action === 'unlock-all') await sendCommand(pc.id, 'unlock');
      else if (action === 'lockdown-all') { await sendCommand(pc.id, 'lockdown'); await updateDoc(doc(db, 'pcs', pc.id), { lockdownActive: true }); }
      else if (action === 'fullaccess-all') { await sendCommand(pc.id, 'fullaccess'); await updateDoc(doc(db, 'pcs', pc.id), { lockdownActive: false }); }
      else if (action === 'screenshot-all') { await sendCommand(pc.id, 'screenshot'); }
    }
    setBulkConfirm(null);
  }, [pcs, sendCommand]);

  const runTerminalCommand = useCallback((cmd: string) => {
    if (!selectedPC || !cmd.trim()) return;
    setTerminalHistory(prev => [...prev, { cmd: cmd.trim(), output: '... Running...', ts: Date.now() }]);
    setTerminalLoading(true);
    sendCommand(selectedPC.id, 'exec', cmd.trim());
    setTerminalInput('');
    setTimeout(() => { terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' }); }, 100);
  }, [selectedPC, sendCommand]);

  const loadProcesses = useCallback(() => { if (!selectedPC) return; setProcessLoading(true); sendCommand(selectedPC.id, 'list-processes'); }, [selectedPC, sendCommand]);
  const loadSystemInfo = useCallback(() => { if (!selectedPC) return; setSystemInfoLoading(true); sendCommand(selectedPC.id, 'system-info'); }, [selectedPC, sendCommand]);

  function isOnline(pc: PC): boolean {
    const lastHb = (pc as any)?.lastSeen || pc?.lastHeartbeat || 0;
    let ms = lastHb;
    if (typeof lastHb === 'object' && lastHb.seconds) ms = lastHb.seconds * 1000;
    else if (typeof lastHb === 'object' && lastHb.toDate) ms = lastHb.toDate().getTime();
    return ms > 0 && Date.now() - ms < 90000;
  }

  function getHealth(pc: PC): { cpu: number; ram: number; disk: number } | null {
    const h = (pc as any).health;
    if (!h) return null;
    const cpu = h.cpu?.integerValue ? parseInt(h.cpu.integerValue) : (h.cpu || 0);
    const ram = h.ram?.integerValue ? parseInt(h.ram.integerValue) : (h.ram || 0);
    const disk = h.disk?.integerValue ? parseInt(h.disk.integerValue) : (h.disk || 0);
    return { cpu, ram, disk };
  }

  const filteredPCs = pcs.filter(pc => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (pc.name || '').toLowerCase().includes(q);
      const matchPlayer = ((pc as any).currentPlayerName || '').toLowerCase().includes(q);
      const matchIP = ((pc as any).ipAddress || '').includes(q);
      const matchHost = ((pc as any).hostname || '').toLowerCase().includes(q);
      if (!matchName && !matchPlayer && !matchIP && !matchHost) return false;
    }
    if (filter === 'all') return true;
    if (filter === 'online') return isOnline(pc);
    if (filter === 'offline') return !isOnline(pc) || pc.status === 'offline';
    if (filter === 'occupied') return pc.status === 'occupied';
    if (filter === 'free') return (pc.status === 'free' || pc.status === 'locked') && isOnline(pc);
    return true;
  });

  const stats = {
    total: pcs.length,
    online: pcs.filter(p => isOnline(p)).length,
    occupied: pcs.filter(p => p.status === 'occupied').length,
    free: pcs.filter(p => isOnline(p) && p.status !== 'occupied' && p.status !== 'offline').length,
    offline: pcs.filter(p => !isOnline(p) || p.status === 'offline').length,
  };

  // ═══════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* HEADER */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-3xl font-semibold text-[#1d1d1f] tracking-tight">PC Command Center</h2>
          <p className="text-[#86868b] mt-1 text-sm">Real-time monitoring & remote control</p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Online', value: stats.online, color: 'text-[#34c759]', bg: 'bg-[#34c759]/5 border-[#34c759]/15' },
            { label: 'In Use', value: stats.occupied, color: 'text-[#ff3b30]', bg: 'bg-[#ff3b30]/5 border-[#ff3b30]/15' },
            { label: 'Free', value: stats.free, color: 'text-[#0071e3]', bg: 'bg-[#0071e3]/5 border-[#0071e3]/15' },
            { label: 'Offline', value: stats.offline, color: 'text-[#86868b]', bg: 'bg-[#f5f5f7] border-[#e5e5ea]' },
          ].map(s => (
            <div key={s.label} className={`px-3 py-1.5 rounded-xl border ${s.bg} flex items-center gap-2`}>
              <span className={`font-semibold text-lg ${s.color}`}>{s.value}</span>
              <span className="text-[10px] text-[#86868b]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search PC, player, IP, hostname..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all" />
        </div>
        <div className="flex gap-1">
          {([
            { key: 'all' as FilterType, label: 'All', count: stats.total },
            { key: 'online' as FilterType, label: 'Online', count: stats.online },
            { key: 'occupied' as FilterType, label: 'In Use', count: stats.occupied },
            { key: 'free' as FilterType, label: 'Free', count: stats.free },
            { key: 'offline' as FilterType, label: 'Offline', count: stats.offline },
          ]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 ${
                filter === f.key
                  ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 font-medium'
                  : 'bg-[#f5f5f7] text-[#86868b] border border-transparent hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
              }`}
            >
              {f.label}
              <span className="text-[9px] opacity-60">({f.count})</span>
            </button>
          ))}
        </div>
        <div className="flex border border-[#d2d2d7] rounded-xl overflow-hidden ml-auto">
          <button onClick={() => setViewMode('grid')}
            className={`p-2 transition-all ${viewMode === 'grid' ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}>
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => setViewMode('list')}
            className={`p-2 transition-all ${viewMode === 'list' ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}>
            <List size={14} />
          </button>
        </div>
      </div>

      {/* BULK ACTIONS BAR */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { id: 'restart-all', label: 'Restart All', icon: <RotateCcw size={11} />, color: 'text-[#0071e3] bg-[#0071e3]/5 border-[#0071e3]/15 hover:bg-[#0071e3]/10' },
          { id: 'shutdown-all', label: 'Shutdown All', icon: <Power size={11} />, color: 'text-[#ff3b30] bg-[#ff3b30]/5 border-[#ff3b30]/15 hover:bg-[#ff3b30]/10' },
          { id: 'lock-all', label: 'Lock All', icon: <Lock size={11} />, color: 'text-[#ff9500] bg-[#ff9500]/5 border-[#ff9500]/15 hover:bg-[#ff9500]/10' },
          { id: 'unlock-all', label: 'Unlock All', icon: <Unlock size={11} />, color: 'text-[#34c759] bg-[#34c759]/5 border-[#34c759]/15 hover:bg-[#34c759]/10' },
          { id: 'lockdown-all', label: 'Lockdown All', icon: <Shield size={11} />, color: 'text-[#ff9500] bg-[#ff9500]/5 border-[#ff9500]/15 hover:bg-[#ff9500]/10' },
          { id: 'fullaccess-all', label: 'Full Access All', icon: <ShieldOff size={11} />, color: 'text-[#5ac8fa] bg-[#5ac8fa]/5 border-[#5ac8fa]/15 hover:bg-[#5ac8fa]/10' },
          { id: 'screenshot-all', label: 'Screenshot All', icon: <Camera size={11} />, color: 'text-[#af52de] bg-[#af52de]/5 border-[#af52de]/15 hover:bg-[#af52de]/10' },
        ].map(action => (
          <button key={action.id} onClick={() => setBulkConfirm(action.id)}
            className={`px-3 py-1.5 rounded-xl font-medium text-[10px] border transition-all flex items-center gap-1.5 ${action.color}`}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>

      {/* PC GRID / LIST */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {filteredPCs.map((pc, i) => (
            <PCGridCard key={pc.id} pc={pc} index={i} isOnline={isOnline(pc)} getHealth={getHealth}
              onSelect={() => setSelectedPC(pc)}
              onQuickAction={(action) => {
                if (action === 'lock') toggleLock(pc);
                else if (action === 'restart') sendCommand(pc.id, 'restart');
                else if (action === 'shutdown') setConfirmAction({ pc, action: 'shutdown', label: `Shutdown ${pc.name}?` });
              }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredPCs.map((pc, i) => (
            <PCListRow key={pc.id} pc={pc} index={i} isOnline={isOnline(pc)} getHealth={getHealth}
              onSelect={() => setSelectedPC(pc)}
              onQuickAction={(action) => {
                if (action === 'lock') toggleLock(pc);
                else if (action === 'restart') sendCommand(pc.id, 'restart');
                else if (action === 'shutdown') setConfirmAction({ pc, action: 'shutdown', label: `Shutdown ${pc.name}?` });
                else if (action === 'force-logout') forceLogout(pc);
              }}
            />
          ))}
        </div>
      )}

      {filteredPCs.length === 0 && (
        <div className="text-center py-20">
          <Monitor size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-lg font-semibold text-[#86868b]">
            {searchQuery ? 'No Matching PCs' : 'No PCs Found'}
          </p>
          <p className="text-[#86868b] mt-2 text-sm">
            {searchQuery ? 'Try a different search term' : 'PCs will auto-register when kiosk software connects'}
          </p>
        </div>
      )}

      {/* PC DETAIL PANEL */}
      <AnimatePresence>
        {selectedPC && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={() => setSelectedPC(null)}
          >
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 bottom-0 w-[640px] max-w-[95vw] overflow-y-auto bg-white border-l border-[#e5e5ea]"
              onClick={e => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="sticky top-0 z-10 p-5 pb-3 border-b border-[#e5e5ea] bg-white/95 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      isOnline(selectedPC) ? 'bg-[#0071e3]/10 border border-[#0071e3]/20' : 'bg-[#f5f5f7] border border-[#e5e5ea]'
                    }`}>
                      <Monitor size={22} className={isOnline(selectedPC) ? 'text-[#0071e3]' : 'text-[#86868b]'} />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-[#1d1d1f]">{selectedPC.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={selectedPC.status} online={isOnline(selectedPC)} />
                        <span className="text-[10px] text-[#86868b]">{timeAgo((selectedPC as any).lastSeen || selectedPC.lastHeartbeat)}</span>
                        {(selectedPC as any).ipAddress && (
                          <span className="font-mono text-[9px] text-[#86868b]">{(selectedPC as any).ipAddress}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPC(null)}
                    className="p-2 rounded-xl hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all">
                    <X size={18} />
                  </button>
                </div>

                {selectedPC.status === 'occupied' && (selectedPC as any).currentPlayerName && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/10 mb-3">
                    <User size={16} className="text-[#ff3b30] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1d1d1f] truncate">{(selectedPC as any).currentPlayerName}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {(selectedPC as any).minutesRemaining != null && (
                          <span className="text-[10px] text-[#5ac8fa] flex items-center gap-1"><Clock size={9} /> {(selectedPC as any).minutesRemaining}m left</span>
                        )}
                        {(selectedPC as any).coinsRemaining != null && (
                          <span className="text-[10px] text-[#ff9500] flex items-center gap-1"><Coins size={9} /> {Math.floor((selectedPC as any).coinsRemaining)} tokens</span>
                        )}
                        {(selectedPC as any).sessionStartedAt && (
                          <span className="text-[10px] text-[#86868b] flex items-center gap-1"><Timer size={9} /> {getSessionDuration((selectedPC as any).sessionStartedAt)}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => forceLogout(selectedPC)}
                      className="px-3 py-1.5 rounded-xl text-[10px] font-medium bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20 hover:bg-[#ff3b30]/20 transition-all flex items-center gap-1">
                      <LogOut size={10} /> Kick
                    </button>
                  </div>
                )}

                <div className="flex gap-1">
                  {([
                    { key: 'controls' as DetailTab, label: 'Controls', icon: <Settings2 size={11} /> },
                    { key: 'screen' as DetailTab, label: 'Screen', icon: <Eye size={11} /> },
                    { key: 'terminal' as DetailTab, label: 'Terminal', icon: <Terminal size={11} /> },
                    { key: 'processes' as DetailTab, label: 'Processes', icon: <Activity size={11} /> },
                    { key: 'info' as DetailTab, label: 'Info', icon: <Info size={11} /> },
                    { key: 'sessions' as DetailTab, label: 'Sessions', icon: <Users size={11} /> },
                  ]).map(t => (
                    <button key={t.key}
                      onClick={() => { setDetailTab(t.key); if (t.key === 'processes' && processes.length === 0) loadProcesses(); if (t.key === 'info' && !systemInfo) loadSystemInfo(); }}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-xl font-medium text-[10px] transition-all ${
                        detailTab === t.key
                          ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                          : 'bg-[#f5f5f7] text-[#86868b] border border-transparent hover:bg-[#e8e8ed]'
                      }`}
                    >{t.icon} {t.label}</button>
                  ))}
                </div>
              </div>

              {/* Panel Content */}
              <div className="p-5">
                {/* CONTROLS TAB */}
                {detailTab === 'controls' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                      <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><Power size={12} className="text-[#0071e3]" /> Power & Session</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <ActionButton onClick={() => sendCommand(selectedPC.id, 'restart')} disabled={!isOnline(selectedPC)} icon={<RotateCcw size={13} />} label="Restart" color="blue" loading={commandSending} />
                        <ActionButton onClick={() => setConfirmAction({ pc: selectedPC, action: 'shutdown', label: `Shutdown ${selectedPC.name}?` })} disabled={!isOnline(selectedPC)} icon={<Power size={13} />} label="Shutdown" color="red" />
                        <ActionButton onClick={() => sendCommand(selectedPC.id, 'sleep')} disabled={!isOnline(selectedPC)} icon={<Moon size={13} />} label="Sleep" color="purple" />
                        <ActionButton onClick={() => sendCommand(selectedPC.id, 'logoff')} disabled={!isOnline(selectedPC)} icon={<LogOut size={13} />} label="Log Off" color="orange" />
                        <ActionButton onClick={() => toggleLock(selectedPC)} disabled={!isOnline(selectedPC)} icon={selectedPC.status === 'locked' ? <Unlock size={13} /> : <Lock size={13} />} label={selectedPC.status === 'locked' ? 'Unlock' : 'Lock'} color={selectedPC.status === 'locked' ? 'green' : 'orange'} />
                        <ActionButton onClick={() => sendCommand(selectedPC.id, 'screenshot')} disabled={!isOnline(selectedPC)} icon={<Camera size={13} />} label="Screenshot" color="gray" />
                      </div>
                      {selectedPC.status === 'occupied' && (
                        <button onClick={() => forceLogout(selectedPC)}
                          className="w-full mt-2 py-2.5 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 bg-[#ff3b30]/5 text-[#ff3b30] border border-[#ff3b30]/15 hover:bg-[#ff3b30]/10 transition-all">
                          <LogOut size={13} /> Force Logout Player
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                      <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><Shield size={12} className="text-[#ff9500]" /> Security</h4>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#e5e5ea]/60">
                        <div>
                          <p className={`text-sm font-semibold ${selectedPC.lockdownActive ? 'text-[#ff9500]' : 'text-[#0071e3]'}`}>
                            {selectedPC.lockdownActive ? 'Restricted Mode' : 'Full Access'}
                          </p>
                          <p className="text-[10px] text-[#86868b] mt-0.5">
                            {selectedPC.lockdownActive ? 'Task Manager, CMD, Start Menu disabled' : 'All Windows features accessible'}
                          </p>
                        </div>
                        <button onClick={() => toggleLockdown(selectedPC)} disabled={!isOnline(selectedPC)}
                          className={`px-4 py-2 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-all ${
                            !isOnline(selectedPC) ? 'opacity-30 cursor-not-allowed bg-[#f5f5f7] text-[#86868b]' :
                            selectedPC.lockdownActive ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/20' : 'bg-[#ff9500]/10 text-[#ff9500] border border-[#ff9500]/20 hover:bg-[#ff9500]/20'
                          }`}>
                          {selectedPC.lockdownActive ? <><ShieldOff size={12} /> Unlock</> : <><Shield size={12} /> Lock Down</>}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#5ac8fa]/5 border border-[#5ac8fa]/10 p-4">
                      <h4 className="text-xs font-semibold text-[#5ac8fa] mb-2 flex items-center gap-1.5"><Snowflake size={12} /> Freeze Screen</h4>
                      <p className="text-[10px] text-[#86868b] mb-2">Overlays a freeze message. Player cannot interact until unfrozen.</p>
                      <div className="flex gap-2">
                        <input type="text" value={freezeMessage} onChange={e => setFreezeMessage(e.target.value)} placeholder="Freeze message (optional)"
                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#d2d2d7] text-[#1d1d1f] text-xs placeholder-[#86868b] focus:outline-none focus:border-[#5ac8fa]"
                          onKeyDown={e => { if (e.key === 'Enter') { sendCommand(selectedPC.id, 'freeze', freezeMessage || 'PC frozen by admin.'); setFreezeMessage(''); } }} />
                        <button onClick={() => { sendCommand(selectedPC.id, 'freeze', freezeMessage || 'PC frozen by admin.'); setFreezeMessage(''); }} disabled={!isOnline(selectedPC)}
                          className="px-4 py-2 rounded-xl font-medium text-xs bg-[#5ac8fa]/10 text-[#5ac8fa] border border-[#5ac8fa]/20 hover:bg-[#5ac8fa]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                          <Snowflake size={12} /> Freeze
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#af52de]/5 border border-[#af52de]/10 p-4">
                      <h4 className="text-xs font-semibold text-[#af52de] mb-2 flex items-center gap-1.5"><MessageSquare size={12} /> Send Message</h4>
                      <div className="flex gap-2">
                        <input type="text" value={popupMessage} onChange={e => setPopupMessage(e.target.value)} placeholder="Type a message to display on PC..."
                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#d2d2d7] text-[#1d1d1f] text-xs placeholder-[#86868b] focus:outline-none focus:border-[#af52de]"
                          onKeyDown={e => { if (e.key === 'Enter' && popupMessage.trim()) { sendCommand(selectedPC.id, 'show-message', popupMessage.trim()); setPopupMessage(''); } }} />
                        <button onClick={() => { if (popupMessage.trim()) { sendCommand(selectedPC.id, 'show-message', popupMessage.trim()); setPopupMessage(''); } }} disabled={!popupMessage.trim() || !isOnline(selectedPC)}
                          className="px-4 py-2 rounded-xl font-medium text-xs bg-[#af52de]/10 text-[#af52de] border border-[#af52de]/20 hover:bg-[#af52de]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                          <Send size={12} /> Send
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#0071e3]/5 border border-[#0071e3]/10 p-4">
                      <h4 className="text-xs font-semibold text-[#0071e3] mb-2 flex items-center gap-1.5"><Globe size={12} /> Open URL on PC</h4>
                      <div className="flex gap-2">
                        <input type="text" value={openUrlValue} onChange={e => setOpenUrlValue(e.target.value)} placeholder="https://..."
                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#d2d2d7] text-[#1d1d1f] font-mono text-xs placeholder-[#86868b] focus:outline-none focus:border-[#0071e3]"
                          onKeyDown={e => { if (e.key === 'Enter' && openUrlValue.trim()) { sendCommand(selectedPC.id, 'open-url', openUrlValue.trim()); setOpenUrlValue(''); } }} />
                        <button onClick={() => { if (openUrlValue.trim()) { sendCommand(selectedPC.id, 'open-url', openUrlValue.trim()); setOpenUrlValue(''); } }} disabled={!openUrlValue.trim() || !isOnline(selectedPC)}
                          className="px-4 py-2 rounded-xl font-medium text-xs bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                          <ExternalLink size={12} /> Open
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#ff3b30]/5 border border-[#ff3b30]/10 p-4">
                      <h4 className="text-xs font-semibold text-[#ff3b30] mb-2 flex items-center gap-1.5"><Square size={12} /> Kill Application</h4>
                      <div className="flex gap-2">
                        <input type="text" value={killAppName} onChange={e => setKillAppName(e.target.value)} placeholder="e.g. chrome.exe or chrome"
                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#d2d2d7] text-[#1d1d1f] font-mono text-xs placeholder-[#86868b] focus:outline-none focus:border-[#ff3b30]"
                          onKeyDown={e => { if (e.key === 'Enter' && killAppName.trim()) { sendCommand(selectedPC.id, 'kill-app', killAppName.trim()); setKillAppName(''); } }} />
                        <button onClick={() => { if (killAppName.trim()) { sendCommand(selectedPC.id, 'kill-app', killAppName.trim()); setKillAppName(''); } }} disabled={!killAppName.trim() || !isOnline(selectedPC)}
                          className="px-4 py-2 rounded-xl font-medium text-xs bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20 hover:bg-[#ff3b30]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                          <Square size={12} /> Kill
                        </button>
                      </div>
                    </div>

                    {commandLog.length > 0 && (
                      <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                        <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><History size={12} /> Command Log</h4>
                        <div className="space-y-1 max-h-[180px] overflow-y-auto">
                          {commandLog.map((log, i) => (
                            <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-lg bg-white">
                              {log.status === 'ok' ? <Zap size={10} className="text-[#34c759] shrink-0" /> : log.status === 'failed' ? <X size={10} className="text-[#ff3b30] shrink-0" /> : <Loader2 size={10} className="text-[#ff9500] animate-spin shrink-0" />}
                              <span className="font-mono text-[10px] text-[#86868b] truncate flex-1">{log.command}</span>
                              <span className="text-[9px] text-[#86868b] shrink-0">{timeAgo(log.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl bg-[#ff3b30]/[0.02] border border-[#ff3b30]/10 p-4">
                      <h4 className="text-xs font-semibold text-[#ff3b30]/60 mb-3 flex items-center gap-1.5"><AlertTriangle size={12} /> Danger Zone</h4>
                      <button onClick={() => setConfirmAction({ pc: selectedPC, action: 'delete', label: `Remove ${selectedPC.name} from panel?` })}
                        className="w-full py-2 border border-[#ff3b30]/15 rounded-xl text-[#ff3b30]/50 text-[11px] hover:bg-[#ff3b30]/5 hover:text-[#ff3b30] transition-all flex items-center justify-center gap-1.5">
                        <Trash2 size={11} /> Remove PC from panel
                      </button>
                    </div>
                  </div>
                )}

                {/* SCREEN TAB */}
                {detailTab === 'screen' && (
                  <div className="space-y-4">
                    {!isOnline(selectedPC) ? (
                      <div className="text-center py-16 rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60">
                        <WifiOff size={36} className="text-[#d2d2d7] mx-auto mb-3" />
                        <p className="text-sm font-semibold text-[#86868b]">PC is Offline</p>
                        <p className="text-[11px] text-[#86868b] mt-1">Live view requires the PC to be online</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <ActionButton onClick={() => sendCommand(selectedPC.id, 'screenshot')} icon={<Camera size={12} />} label="Capture" color="green" small />
                          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] cursor-pointer">
                            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="w-3 h-3 rounded accent-[#0071e3]" />
                            <span className="text-[10px] text-[#86868b]">Auto-refresh (4s)</span>
                          </label>
                          {liveScreenshot && (
                            <button onClick={() => setScreenshotFullscreen(true)} className="ml-auto p-2 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] text-[#86868b] hover:text-[#1d1d1f] transition-all"><Maximize2 size={13} /></button>
                          )}
                        </div>
                        <div className="rounded-2xl overflow-hidden border border-[#e5e5ea] bg-[#f5f5f7] relative">
                          {liveScreenshot ? (
                            <>
                              <img src={`data:image/jpeg;base64,${liveScreenshot}`} alt="Live view" className="w-full h-auto" style={{ imageRendering: 'auto' }} />
                              <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/90 backdrop-blur-sm shadow-sm">
                                {autoRefresh && <div className="w-1.5 h-1.5 rounded-full bg-[#ff3b30] animate-pulse" />}
                                <span className="text-[9px] text-[#1d1d1f]">{autoRefresh ? 'LIVE' : 'PAUSED'}</span>
                                <span className="text-[9px] text-[#86868b]">{timeAgo(screenshotTime)}</span>
                              </div>
                            </>
                          ) : (
                            <div className="aspect-video flex items-center justify-center">
                              <div className="text-center">
                                <Eye size={32} className="text-[#d2d2d7] mx-auto mb-2" />
                                <p className="text-xs text-[#86868b]">No screenshot yet</p>
                                <button onClick={() => sendCommand(selectedPC.id, 'screenshot')}
                                  className="mt-3 px-4 py-2 rounded-xl font-medium text-xs bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/20 transition-all">
                                  <Camera size={12} className="inline mr-1.5" /> Take Screenshot
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <ActionButton onClick={() => sendCommand(selectedPC.id, 'freeze', 'Screen frozen by admin')} icon={<Snowflake size={12} />} label="Freeze" color="cyan" small />
                          <ActionButton onClick={() => forceLogout(selectedPC)} disabled={selectedPC.status !== 'occupied'} icon={<LogOut size={12} />} label="Kick" color="red" small />
                          <ActionButton onClick={() => toggleLock(selectedPC)} icon={selectedPC.status === 'locked' ? <Unlock size={12} /> : <Lock size={12} />} label={selectedPC.status === 'locked' ? 'Unlock' : 'Lock'} color={selectedPC.status === 'locked' ? 'green' : 'orange'} small />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {screenshotFullscreen && liveScreenshot && (
                  <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setScreenshotFullscreen(false)}>
                    <img src={`data:image/jpeg;base64,${liveScreenshot}`} alt="Fullscreen" className="max-w-[95vw] max-h-[95vh] object-contain" />
                    <button onClick={() => setScreenshotFullscreen(false)} className="absolute top-4 right-4 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"><X size={20} /></button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm">
                      <span className="text-sm font-semibold text-[#1d1d1f]">{selectedPC.name}</span>
                      <span className="text-xs text-[#86868b] ml-3">{timeAgo(screenshotTime)}</span>
                    </div>
                  </div>
                )}

                {/* TERMINAL TAB */}
                {detailTab === 'terminal' && (
                  <div className="space-y-3">
                    {!isOnline(selectedPC) ? (
                      <div className="text-center py-16 rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60"><WifiOff size={36} className="text-[#d2d2d7] mx-auto mb-3" /><p className="text-sm font-semibold text-[#86868b]">PC is Offline</p></div>
                    ) : (
                      <>
                        <div ref={terminalRef} className="rounded-2xl bg-[#1d1d1f] border border-[#e5e5ea] p-4 h-[400px] overflow-y-auto font-mono text-xs">
                          {terminalHistory.length === 0 && (
                            <div className="text-[#86868b]"><p className="text-[#86868b] mb-2">Remote terminal — commands execute on {selectedPC.name}</p><p className="text-[#86868b]/60">Examples: dir, ipconfig, tasklist, systeminfo, whoami, hostname</p></div>
                          )}
                          {terminalHistory.map((entry, i) => (
                            <div key={i} className="mb-3">
                              <div className="flex items-center gap-2 text-[#0071e3]"><span className="text-[#86868b]">$</span><span>{entry.cmd}</span></div>
                              <pre className="text-[#d2d2d7] mt-1 whitespace-pre-wrap break-all text-[11px] leading-relaxed max-h-[300px] overflow-y-auto">{entry.output}</pre>
                            </div>
                          ))}
                          {terminalLoading && (<div className="flex items-center gap-2 text-[#ff9500] mt-2"><Loader2 size={12} className="animate-spin" /><span className="text-[11px]">Waiting for response...</span></div>)}
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#1d1d1f] border border-[#e5e5ea] focus-within:border-[#0071e3]">
                            <span className="text-[#0071e3] font-mono text-sm">$</span>
                            <input type="text" value={terminalInput} onChange={e => setTerminalInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') runTerminalCommand(terminalInput); }}
                              placeholder="Type a command..." className="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none placeholder-[#86868b]" disabled={terminalLoading} />
                          </div>
                          <button onClick={() => runTerminalCommand(terminalInput)} disabled={!terminalInput.trim() || terminalLoading}
                            className="px-4 py-2.5 rounded-xl font-medium text-xs bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                            <Play size={12} /> Run
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {['ipconfig', 'hostname', 'whoami', 'tasklist /fo table', 'systeminfo', 'dir C:\\', 'netstat -an', 'wmic cpu get name'].map(cmd => (
                            <button key={cmd} onClick={() => runTerminalCommand(cmd)}
                              className="px-2.5 py-1 rounded-lg bg-[#f5f5f7] border border-[#e5e5ea] font-mono text-[9px] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#e8e8ed] transition-all">{cmd}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* PROCESSES TAB */}
                {detailTab === 'processes' && (
                  <div className="space-y-3">
                    {!isOnline(selectedPC) ? (
                      <div className="text-center py-16 rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60"><WifiOff size={36} className="text-[#d2d2d7] mx-auto mb-3" /><p className="text-sm font-semibold text-[#86868b]">PC is Offline</p></div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                            <input type="text" value={processFilter} onChange={e => setProcessFilter(e.target.value)} placeholder="Filter processes..."
                              className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] font-mono text-xs placeholder-[#86868b] focus:outline-none focus:border-[#0071e3]" />
                          </div>
                          <ActionButton onClick={loadProcesses} icon={<RotateCcw size={12} />} label="Refresh" color="green" small loading={processLoading} />
                        </div>
                        <div className="flex gap-1">
                          {[{ key: 'mem' as const, label: 'Memory' }, { key: 'name' as const, label: 'Name' }, { key: 'pid' as const, label: 'PID' }].map(s => (
                            <button key={s.key} onClick={() => setProcessSortBy(s.key)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${processSortBy === s.key ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium' : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}>
                              Sort: {s.label}
                            </button>
                          ))}
                          <span className="ml-auto text-[10px] text-[#86868b] self-center">{processes.length} processes</span>
                        </div>
                        <div className="rounded-2xl bg-white border border-[#e5e5ea]/60 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="grid grid-cols-[60px_1fr_1fr_70px_40px] gap-2 px-3 py-2 border-b border-[#e5e5ea] text-[9px] font-semibold text-[#86868b]">
                            <span>PID</span><span>Process</span><span>Window</span><span>Mem</span><span></span>
                          </div>
                          <div className="max-h-[450px] overflow-y-auto">
                            {(() => {
                              let sorted = [...processes];
                              if (processFilter) { const q = processFilter.toLowerCase(); sorted = sorted.filter(p => p.name.toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q)); }
                              if (processSortBy === 'mem') sorted.sort((a, b) => b.mem - a.mem);
                              else if (processSortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
                              else sorted.sort((a, b) => b.pid - a.pid);
                              return sorted.slice(0, 100).map((p, i) => (
                                <div key={`${p.pid}-${i}`} className={`grid grid-cols-[60px_1fr_1fr_70px_40px] gap-2 px-3 py-1.5 border-b border-[#e5e5ea]/40 hover:bg-[#f5f5f7] transition-colors items-center ${i % 2 === 0 ? 'bg-white' : 'bg-[#f5f5f7]'}`}>
                                  <span className="font-mono text-[10px] text-[#86868b]">{p.pid}</span>
                                  <span className="text-[10px] text-[#1d1d1f] truncate">{p.name}</span>
                                  <span className="text-[10px] text-[#86868b] truncate">{p.title || '—'}</span>
                                  <span className={`font-mono text-[10px] ${p.mem > 1000 ? 'text-[#ff3b30]' : p.mem > 500 ? 'text-[#ff9500]' : 'text-[#86868b]'}`}>{p.mem}MB</span>
                                  <button onClick={() => sendCommand(selectedPC.id, 'kill-pid', String(p.pid))}
                                    className="p-1 rounded hover:bg-[#ff3b30]/10 text-[#d2d2d7] hover:text-[#ff3b30] transition-all" title={`Kill ${p.name}`}><X size={11} /></button>
                                </div>
                              ));
                            })()}
                          </div>
                          {processes.length === 0 && !processLoading && (
                            <div className="text-center py-8"><Activity size={24} className="text-[#d2d2d7] mx-auto mb-2" /><p className="text-xs text-[#86868b]">No process data</p>
                              <button onClick={loadProcesses} className="mt-2 px-3 py-1.5 rounded-xl font-medium text-[10px] bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20">Load Processes</button></div>
                          )}
                          {processLoading && (<div className="text-center py-8"><Loader2 size={20} className="animate-spin text-[#0071e3]/40 mx-auto" /><p className="text-xs text-[#86868b] mt-2">Loading...</p></div>)}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* INFO TAB */}
                {detailTab === 'info' && (
                  <div className="space-y-4">
                    {(() => { const health = getHealth(selectedPC); return (
                      <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                        <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><Activity size={12} className="text-[#0071e3]" /> System Health</h4>
                        {health && isOnline(selectedPC) ? (
                          <div className="flex justify-around">
                            <HealthRing value={health.cpu} label="CPU" icon={<Cpu size={10} />} color="#0071e3" />
                            <HealthRing value={health.ram} label="RAM" icon={<MemoryStick size={10} />} color="#5ac8fa" />
                            <HealthRing value={health.disk} label="DISK" icon={<HardDrive size={10} />} color="#af52de" />
                          </div>
                        ) : (<p className="text-center text-xs text-[#86868b] py-4">{isOnline(selectedPC) ? 'Waiting for health data...' : 'PC is offline'}</p>)}
                      </div>
                    ); })()}

                    <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                      <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><Monitor size={12} className="text-[#0071e3]" /> PC Information</h4>
                      <div className="space-y-1.5">
                        <InfoRow label="Station ID" value={selectedPC.id} icon={<Hash size={10} />} mono />
                        <InfoRow label="PC Name" value={selectedPC.name || 'N/A'} icon={<Monitor size={10} />} />
                        <InfoRow label="Hostname" value={(selectedPC as any).hostname || 'N/A'} icon={<Server size={10} />} />
                        <InfoRow label="IP Address" value={(selectedPC as any).ipAddress || 'N/A'} icon={<Globe size={10} />} mono />
                        <InfoRow label="MAC Address" value={(selectedPC as any).macAddress || 'N/A'} icon={<Network size={10} />} mono />
                        <InfoRow label="Status" value={selectedPC.status || 'unknown'} icon={<Zap size={10} />} />
                        <InfoRow label="Last Seen" value={timeAgo((selectedPC as any).lastSeen || selectedPC.lastHeartbeat)} icon={<Clock size={10} />} />
                        <InfoRow label="Security" value={selectedPC.lockdownActive ? 'Restricted' : 'Full Access'} icon={<Shield size={10} />} />
                        <InfoRow label="Time Remaining" value={`${(selectedPC as any).timeRemaining || 0} min`} icon={<Timer size={10} />} />
                        <InfoRow label="Online" value={isOnline(selectedPC) ? 'Yes' : 'No'} icon={isOnline(selectedPC) ? <Wifi size={10} /> : <WifiOff size={10} />} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-[#86868b] flex items-center gap-1.5"><Cpu size={12} className="text-[#5ac8fa]" /> System Details</h4>
                        <button onClick={loadSystemInfo} disabled={!isOnline(selectedPC)}
                          className="px-2.5 py-1 rounded-lg font-medium text-[9px] bg-white text-[#86868b] hover:text-[#1d1d1f] border border-[#e5e5ea] transition-all disabled:opacity-30 flex items-center gap-1">
                          {systemInfoLoading ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />} Refresh
                        </button>
                      </div>
                      {systemInfo ? (
                        <div className="space-y-1.5">
                          {systemInfo.hostname && <InfoRow label="Hostname" value={systemInfo.hostname} icon={<Server size={10} />} />}
                          {systemInfo.user && <InfoRow label="Windows User" value={systemInfo.user} icon={<User size={10} />} />}
                          {systemInfo.os && <InfoRow label="OS" value={systemInfo.os} icon={<Monitor size={10} />} />}
                          {systemInfo.uptime && <InfoRow label="Uptime" value={systemInfo.uptime} icon={<Clock size={10} />} />}
                          {systemInfo.processors && <InfoRow label="CPU Cores" value={systemInfo.processors} icon={<Cpu size={10} />} />}
                          {systemInfo.totalRamGB && <InfoRow label="Total RAM" value={`${systemInfo.totalRamGB} GB`} icon={<MemoryStick size={10} />} />}
                          {systemInfo.drives && <InfoRow label="Drives" value={systemInfo.drives} icon={<HardDrive size={10} />} />}
                          {systemInfo.network && <InfoRow label="Network" value={systemInfo.network} icon={<Network size={10} />} />}
                          {systemInfo.mac && <InfoRow label="MAC" value={systemInfo.mac} icon={<Network size={10} />} mono />}
                          {systemInfo.dotnet && <InfoRow label=".NET Version" value={systemInfo.dotnet} icon={<Zap size={10} />} />}
                        </div>
                      ) : systemInfoLoading ? (
                        <div className="text-center py-6"><Loader2 size={20} className="animate-spin text-[#5ac8fa]/40 mx-auto" /><p className="text-xs text-[#86868b] mt-2">Fetching system info...</p></div>
                      ) : (
                        <div className="text-center py-6"><Cpu size={24} className="text-[#d2d2d7] mx-auto mb-2" /><p className="text-xs text-[#86868b]">{isOnline(selectedPC) ? 'Click Refresh to load system details' : 'PC must be online'}</p></div>
                      )}
                    </div>

                    {selectedPC.status === 'occupied' && (selectedPC as any).currentPlayerName && (
                      <div className="rounded-2xl bg-[#ff3b30]/[0.03] border border-[#ff3b30]/10 p-4">
                        <h4 className="text-xs font-semibold text-[#ff3b30] mb-3 flex items-center gap-1.5"><User size={12} /> Current Player</h4>
                        <div className="space-y-1.5">
                          <InfoRow label="Player" value={(selectedPC as any).currentPlayerName} icon={<User size={10} />} />
                          {(selectedPC as any).currentPlayerId && <InfoRow label="Player ID" value={(selectedPC as any).currentPlayerId} icon={<Hash size={10} />} mono />}
                          {(selectedPC as any).sessionStartedAt && <InfoRow label="Session Started" value={formatTimestamp((selectedPC as any).sessionStartedAt)} icon={<Clock size={10} />} />}
                          {(selectedPC as any).sessionStartedAt && <InfoRow label="Duration" value={getSessionDuration((selectedPC as any).sessionStartedAt)} icon={<Timer size={10} />} />}
                          {(selectedPC as any).coinsRemaining != null && <InfoRow label="Tokens" value={String(Math.floor((selectedPC as any).coinsRemaining))} icon={<Coins size={10} />} />}
                          {(selectedPC as any).minutesRemaining != null && <InfoRow label="Time Left" value={`${(selectedPC as any).minutesRemaining} min`} icon={<Clock size={10} />} />}
                        </div>
                      </div>
                    )}

                    {usageStats && (
                      <div className="rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60 p-4">
                        <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><BarChart3 size={12} className="text-[#ff9500]" /> Lifetime Stats</h4>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Sessions', value: usageStats.totalSessions.toLocaleString(), color: 'text-[#0071e3]', bg: 'bg-[#0071e3]/5 border-[#0071e3]/15' },
                            { label: 'Hours', value: String(usageStats.totalHours), color: 'text-[#5ac8fa]', bg: 'bg-[#5ac8fa]/5 border-[#5ac8fa]/15' },
                            { label: 'Tokens', value: usageStats.totalCoins.toLocaleString(), color: 'text-[#ff9500]', bg: 'bg-[#ff9500]/5 border-[#ff9500]/15' },
                          ].map((s) => (
                            <div key={s.label} className={`p-3 rounded-xl border text-center ${s.bg}`}>
                              <p className={`font-semibold text-xl ${s.color}`}>{s.value}</p>
                              <p className="text-[9px] text-[#86868b] mt-1">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SESSIONS TAB */}
                {detailTab === 'sessions' && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#86868b] mb-3 flex items-center gap-1.5"><Users size={12} className="text-[#0071e3]" /> Recent Sessions</h4>
                    {loadingSessions ? (
                      <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-[#0071e3]/40 mx-auto" /><p className="text-[#86868b] text-xs mt-2">Loading sessions...</p></div>
                    ) : recentSessions.length === 0 ? (
                      <div className="text-center py-12 rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]/60"><Users size={32} className="text-[#d2d2d7] mx-auto mb-2" /><p className="text-[#86868b] text-xs">No session history</p></div>
                    ) : (
                      <div className="space-y-1.5">
                        {recentSessions.map((session, idx) => (
                          <motion.div key={idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                            className={`p-3 rounded-xl border border-[#e5e5ea]/60 hover:border-[#d2d2d7] transition-all ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f5f5f7]'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5"><User size={11} className="text-[#0071e3]" /> {session.playerName}</span>
                              {session.active && (<span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20">ACTIVE</span>)}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-[#86868b]">
                              <span>{formatTimestamp(session.startedAt || session.startTime)}</span>
                              <ArrowRight size={8} className="text-[#d2d2d7]" />
                              <span>{session.endedAt || session.endTime ? formatTimestamp(session.endedAt || session.endTime) : <span className="text-[#34c759]">Active</span>}</span>
                              <span className="ml-auto text-[#5ac8fa] flex items-center gap-0.5">
                                <Timer size={9} />{session.durationSec ? formatDuration(session.durationSec / 60) : session.duration ? formatDuration(session.duration) : 'N/A'}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM MODAL */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] flex items-center justify-center" onClick={() => setConfirmAction(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-[400px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#e5e5ea]/60" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#ff3b30]/10 flex items-center justify-center border border-[#ff3b30]/20"><AlertTriangle size={24} className="text-[#ff3b30]" /></div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">{confirmAction.label}</h3>
                {confirmAction.action === 'shutdown' && confirmAction.pc.status === 'occupied' && (<p className="text-[#ff3b30] text-xs mt-2">This PC is occupied by {(confirmAction.pc as any).currentPlayerName}!</p>)}
                {confirmAction.action === 'delete' && (<p className="text-[#86868b] text-xs mt-2">The PC will re-appear if kiosk software is still running.</p>)}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 border border-[#d2d2d7] rounded-xl text-[#86868b] text-sm hover:bg-[#f5f5f7] transition-all">Cancel</button>
                <button onClick={async () => {
                  if (confirmAction.action === 'shutdown') { await sendCommand(confirmAction.pc.id, 'shutdown'); await updateDoc(doc(db, 'pcs', confirmAction.pc.id), { status: 'offline' as PCStatus }); }
                  else if (confirmAction.action === 'delete') { await deletePC(confirmAction.pc); }
                  setConfirmAction(null);
                }} className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-[#ff3b30] text-white hover:bg-[#ff3b30]/90 transition-all">Confirm</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BULK CONFIRM MODAL */}
      <AnimatePresence>
        {bulkConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] flex items-center justify-center" onClick={() => setBulkConfirm(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-[440px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#e5e5ea]/60" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#ff9500]/10 flex items-center justify-center border border-[#ff9500]/20"><AlertTriangle size={24} className="text-[#ff9500]" /></div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">{bulkConfirm.replace('-all', '').replace('-', ' ').toUpperCase()} All PCs?</h3>
                <p className="text-[#86868b] text-xs mt-2">This will affect <span className="text-[#1d1d1f] font-semibold">{pcs.filter(p => isOnline(p) && p.status !== 'offline').length}</span> online PCs.</p>
                {stats.occupied > 0 && (bulkConfirm === 'shutdown-all' || bulkConfirm === 'restart-all') && (<p className="text-[#ff3b30] text-xs mt-1">{stats.occupied} PC(s) are currently occupied!</p>)}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setBulkConfirm(null)} className="flex-1 py-2.5 border border-[#d2d2d7] rounded-xl text-[#86868b] text-sm hover:bg-[#f5f5f7] transition-all">Cancel</button>
                <button onClick={() => executeBulkAction(bulkConfirm)} className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-[#ff3b30] text-white hover:bg-[#ff3b30]/90 transition-all">Confirm</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════
//  PC GRID CARD
// ═══════════════════════════════════════════

function PCGridCard({ pc, index, isOnline: online, getHealth, onSelect, onQuickAction }: {
  pc: PC; index: number; isOnline: boolean;
  getHealth: (pc: PC) => { cpu: number; ram: number; disk: number } | null;
  onSelect: () => void;
  onQuickAction: (action: string) => void;
}) {
  const isOff = !online || pc.status === 'offline';
  const health = getHealth(pc);

  const borderColor = pc.status === 'occupied' ? 'border-[#ff3b30]/30'
    : pc.status === 'reserved' ? 'border-[#ff9500]/30'
    : isOff ? 'border-[#e5e5ea]'
    : pc.status === 'locked' ? 'border-[#ff9500]/20'
    : 'border-[#34c759]/20';

  const screenGlow = pc.status === 'occupied' ? '#ff3b30'
    : isOff ? '#d2d2d7'
    : pc.status === 'locked' ? '#ff9500'
    : '#34c759';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.02 }}
      onClick={onSelect}
      className={`bg-white rounded-2xl p-3.5 cursor-pointer border transition-all hover:border-[#0071e3]/30 hover:shadow-md group shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${borderColor} ${isOff ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="relative">
          <svg width="36" height="30" viewBox="0 0 36 30">
            <rect x="3" y="1" width="30" height="21" rx="2.5" fill="#f5f5f7" stroke={screenGlow} strokeWidth="1.5" />
            <rect x="5.5" y="3.5" width="25" height="16" rx="1" fill={`${screenGlow}15`}>
              {!isOff && <animate attributeName="fill" values={`${screenGlow}08;${screenGlow}20;${screenGlow}08`} dur="3s" repeatCount="indefinite" />}
            </rect>
            <rect x="13" y="22" width="10" height="3" fill="#e5e5ea" />
            <rect x="10" y="25" width="16" height="2.5" rx="1" fill="#d2d2d7" />
          </svg>
          <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${online ? 'bg-[#34c759]' : 'bg-[#d2d2d7]'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1d1d1f] truncate">{pc.name}</h3>
          <StatusBadge status={pc.status} online={online} />
        </div>
      </div>

      {pc.status === 'occupied' && (pc as any).currentPlayerName && (
        <div className="mb-2.5 p-2 rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/10">
          <p className="text-[11px] font-semibold text-[#1d1d1f] flex items-center gap-1 truncate"><User size={10} className="text-[#ff3b30] shrink-0" /> {(pc as any).currentPlayerName}</p>
          <div className="flex items-center gap-2.5 mt-1">
            {(pc as any).minutesRemaining != null && (<span className="text-[9px] text-[#5ac8fa] flex items-center gap-0.5"><Clock size={8} /> {(pc as any).minutesRemaining}m</span>)}
            {(pc as any).coinsRemaining != null && (<span className="text-[9px] text-[#ff9500] flex items-center gap-0.5"><Coins size={8} /> {Math.floor((pc as any).coinsRemaining)}</span>)}
            {(pc as any).sessionStartedAt && (<span className="text-[9px] text-[#86868b] flex items-center gap-0.5"><Timer size={8} /> {getSessionDuration((pc as any).sessionStartedAt)}</span>)}
          </div>
        </div>
      )}

      {health && online && (health.cpu > 0 || health.ram > 0) && (
        <div className="mb-2 space-y-0.5">
          <HealthBar value={health.cpu} label="CPU" color="#0071e3" />
          <HealthBar value={health.ram} label="RAM" color="#5ac8fa" />
        </div>
      )}

      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium mb-2 ${
        pc.lockdownActive ? 'bg-[#ff9500]/5 text-[#ff9500]/80 border border-[#ff9500]/10' : 'bg-[#0071e3]/5 text-[#0071e3]/60 border border-[#0071e3]/10'
      }`}>
        {pc.lockdownActive ? <><ShieldCheck size={8} /> Restricted</> : <><ShieldOff size={8} /> Open</>}
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={e => { e.stopPropagation(); !isOff && onQuickAction('lock'); }} disabled={isOff}
          className={`flex-1 py-1.5 rounded-xl flex items-center justify-center text-[9px] font-medium transition-all ${
            isOff ? 'bg-[#f5f5f7] text-[#d2d2d7] cursor-not-allowed' :
            pc.status === 'locked' ? 'bg-[#34c759]/10 text-[#34c759] hover:bg-[#34c759]/20' : 'bg-[#ff9500]/10 text-[#ff9500] hover:bg-[#ff9500]/20'
          }`} title={pc.status === 'locked' ? 'Unlock' : 'Lock'}>
          {pc.status === 'locked' ? <Unlock size={10} /> : <Lock size={10} />}
        </button>
        <button onClick={e => { e.stopPropagation(); !isOff && onQuickAction('restart'); }} disabled={isOff}
          className={`flex-1 py-1.5 rounded-xl flex items-center justify-center text-[9px] transition-all ${
            isOff ? 'bg-[#f5f5f7] text-[#d2d2d7] cursor-not-allowed' : 'bg-[#0071e3]/10 text-[#0071e3] hover:bg-[#0071e3]/20'}`} title="Restart">
          <RotateCcw size={10} />
        </button>
        <button onClick={e => { e.stopPropagation(); onQuickAction('shutdown'); }}
          className={`flex-1 py-1.5 rounded-xl flex items-center justify-center text-[9px] transition-all ${
            isOff ? 'bg-[#f5f5f7] text-[#d2d2d7] cursor-not-allowed' : 'bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20'}`} title="Shutdown">
          <Power size={10} />
        </button>
      </div>

      <p className="text-[8px] text-[#86868b] mt-1.5 text-center">
        {(pc as any).lastSeen ? timeAgo((pc as any).lastSeen) : pc.lastHeartbeat ? timeAgo(pc.lastHeartbeat) : 'Never connected'}
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════
//  PC LIST ROW
// ═══════════════════════════════════════════

function PCListRow({ pc, index, isOnline: online, getHealth, onSelect, onQuickAction }: {
  pc: PC; index: number; isOnline: boolean;
  getHealth: (pc: PC) => { cpu: number; ram: number; disk: number } | null;
  onSelect: () => void;
  onQuickAction: (action: string) => void;
}) {
  const isOff = !online || pc.status === 'offline';
  const health = getHealth(pc);

  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.015 }}
      onClick={onSelect}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all hover:bg-[#f5f5f7] border border-transparent hover:border-[#e5e5ea] ${isOff ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 w-[140px] shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          pc.status === 'occupied' ? 'bg-[#ff3b30] animate-pulse' : isOff ? 'bg-[#d2d2d7]' : pc.status === 'locked' ? 'bg-[#ff9500]' : 'bg-[#34c759]'
        }`} />
        <span className="text-sm font-semibold text-[#1d1d1f] truncate">{pc.name}</span>
      </div>
      <div className="w-[90px] shrink-0"><StatusBadge status={pc.status} online={online} /></div>
      <div className="flex-1 min-w-0">
        {pc.status === 'occupied' && (pc as any).currentPlayerName ? (
          <div className="flex items-center gap-2">
            <User size={11} className="text-[#ff3b30] shrink-0" />
            <span className="text-xs text-[#1d1d1f] truncate">{(pc as any).currentPlayerName}</span>
            {(pc as any).sessionStartedAt && (<span className="text-[10px] text-[#86868b] shrink-0">{getSessionDuration((pc as any).sessionStartedAt)}</span>)}
          </div>
        ) : (<span className="text-xs text-[#86868b]">—</span>)}
      </div>
      <div className="w-[120px] shrink-0">
        {health && online && (health.cpu > 0 || health.ram > 0) ? (
          <div className="space-y-0.5"><HealthBar value={health.cpu} label="CPU" color="#0071e3" /><HealthBar value={health.ram} label="RAM" color="#5ac8fa" /></div>
        ) : (<span className="text-[10px] text-[#d2d2d7]">—</span>)}
      </div>
      <div className="flex gap-1 w-[100px] shrink-0 justify-end">
        <button onClick={e => { e.stopPropagation(); !isOff && onQuickAction('lock'); }} disabled={isOff}
          className={`p-1.5 rounded-lg transition-all ${isOff ? 'text-[#d2d2d7] cursor-not-allowed' : pc.status === 'locked' ? 'text-[#34c759] hover:bg-[#34c759]/10' : 'text-[#ff9500] hover:bg-[#ff9500]/10'}`}>
          {pc.status === 'locked' ? <Unlock size={12} /> : <Lock size={12} />}
        </button>
        <button onClick={e => { e.stopPropagation(); !isOff && onQuickAction('restart'); }} disabled={isOff}
          className={`p-1.5 rounded-lg transition-all ${isOff ? 'text-[#d2d2d7] cursor-not-allowed' : 'text-[#0071e3] hover:bg-[#0071e3]/10'}`}>
          <RotateCcw size={12} />
        </button>
        <button onClick={e => { e.stopPropagation(); onQuickAction('shutdown'); }}
          className={`p-1.5 rounded-lg transition-all ${isOff ? 'text-[#d2d2d7] cursor-not-allowed' : 'text-[#ff3b30] hover:bg-[#ff3b30]/10'}`}>
          <Power size={12} />
        </button>
      </div>
      <span className="text-[9px] text-[#86868b] w-[60px] text-right shrink-0">
        {(pc as any).lastSeen ? timeAgo((pc as any).lastSeen) : 'N/A'}
      </span>
    </motion.div>
  );
}
