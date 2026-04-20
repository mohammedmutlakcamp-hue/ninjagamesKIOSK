'use client';

// Cmd+K / Ctrl+K command palette for the admin panel.
// Lets the owner jump to any tab or run common actions (add time, ban,
// force-logout, send announcement, etc.) by typing a few characters.
//
// Mount once near the top of AdminDashboard. It registers a global
// keydown listener and mounts its own overlay.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, updateDoc, increment, setDoc, addDoc,
} from 'firebase/firestore';
import {
  Search, Command, ArrowRight, Monitor, Users, Coins,
  ClipboardList, Megaphone, Wrench, Trophy, LogOut, Clock,
  Flame, Video, MessageSquare, Gift, TrendingUp, Package,
  Palette, Sliders, Settings, CalendarClock,
} from 'lucide-react';

interface Props {
  onNavigate: (tab: string) => void;
}

interface PaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string;   // space-separated search hints
  icon: React.ComponentType<any>;
  run: () => Promise<void> | void;
}

export function CommandPalette({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [players, setPlayers] = useState<any[]>([]);
  const [pcs, setPcs] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open / close shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setSelectedIdx(0);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus input on open
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  // Lazy-fetch players + pcs for "add time to X" / "ban Y" actions.
  // Only runs once per session.
  useEffect(() => {
    if (!open || players.length > 0) return;
    (async () => {
      try {
        const pSnap = await getDocs(collection(db, 'players'));
        setPlayers(pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch { /* non-fatal */ }
      try {
        const pcSnap = await getDocs(collection(db, 'pcs'));
        setPcs(pcSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch { /* non-fatal */ }
    })();
  }, [open, players.length]);

  // ── Navigation actions ─────────────────────────────────────────────
  const navActions: PaletteAction[] = useMemo(() => ([
    { id: 'nav-dashboard',  title: 'Dashboard',       icon: TrendingUp,      keywords: 'home overview stats', run: () => { onNavigate('dashboard'); setOpen(false); } },
    { id: 'nav-livepcs',    title: 'Live PCs',        icon: Monitor,         keywords: 'pcs stations live now', run: () => { onNavigate('pcshub'); setOpen(false); } },
    { id: 'nav-players',    title: 'Players',         icon: Users,           keywords: 'users accounts profiles', run: () => { onNavigate('players'); setOpen(false); } },
    { id: 'nav-topups',     title: 'Top Ups',         icon: Coins,           keywords: 'tokens credit topup', run: () => { onNavigate('topups'); setOpen(false); } },
    { id: 'nav-orders',     title: 'Food Orders',     icon: ClipboardList,   keywords: 'orders food cafe', run: () => { onNavigate('orders'); setOpen(false); } },
    { id: 'nav-hubbly',     title: 'Hubbly',          icon: Flame,           keywords: 'shisha hookah tobacco', run: () => { onNavigate('hubblyhub'); setOpen(false); } },
    { id: 'nav-cameras',    title: 'Cameras',         icon: Video,           keywords: 'hikvision cctv surveillance', run: () => { onNavigate('cameras'); setOpen(false); } },
    { id: 'nav-whatsapp',   title: 'WhatsApp',        icon: MessageSquare,   keywords: 'whatsapp sms notifications', run: () => { onNavigate('whatsapp'); setOpen(false); } },
    { id: 'nav-promos',     title: 'Promotions',      icon: Gift,            keywords: 'bundles happy hour deals', run: () => { onNavigate('promotions'); setOpen(false); } },
    { id: 'nav-chests',     title: 'Chests',          icon: Package,         keywords: 'loot drops rewards luck', run: () => { onNavigate('chests'); setOpen(false); } },
    { id: 'nav-skins',      title: 'Skins / Ninjas',  icon: Palette,         keywords: 'skins ninjas custom avatar', run: () => { onNavigate('skins'); setOpen(false); } },
    { id: 'nav-tournaments',title: 'Tournaments',     icon: Trophy,          keywords: 'tournaments events brackets', run: () => { onNavigate('tournaments'); setOpen(false); } },
    { id: 'nav-pl',         title: 'Profit & Loss',   icon: TrendingUp,      keywords: 'pl profit revenue margin', run: () => { onNavigate('realpl'); setOpen(false); } },
    { id: 'nav-scheduled',  title: 'Scheduled Tasks', icon: CalendarClock,   keywords: 'cron scheduler automation', run: () => { onNavigate('scheduled'); setOpen(false); } },
    { id: 'nav-announce',   title: 'Announcements',   icon: Megaphone,       keywords: 'announcement banner maintenance', run: () => { onNavigate('announcements'); setOpen(false); } },
    { id: 'nav-settings',   title: 'Settings',        icon: Settings,        keywords: 'config settings shop', run: () => { onNavigate('settings'); setOpen(false); } },
    { id: 'nav-pricing',    title: 'Pricing',         icon: Sliders,         keywords: 'pricing time package coin rate', run: () => { onNavigate('pricing'); setOpen(false); } },
  ]), [onNavigate]);

  // ── Direct-action shortcuts ────────────────────────────────────────
  // Pattern: type "add 60 ahmed" → finds ahmed, adds 60 min.
  // Pattern: type "ban ahmed" → bans the player.
  const parseDirectCommand = useCallback((q: string): PaletteAction[] => {
    const out: PaletteAction[] = [];
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return out;

    // "add <minutes> <playerName>"
    const addMatch = trimmed.match(/^add\s+(\d+)\s*(?:min|m)?\s*(.+)$/);
    if (addMatch) {
      const mins = parseInt(addMatch[1], 10);
      const pname = addMatch[2].trim();
      const p = players.find((x) => (x.username || '').toLowerCase().includes(pname));
      if (p) {
        out.push({
          id: `add-time-${p.id}-${mins}`,
          title: `Add ${mins} min to ${p.username}`,
          subtitle: `Current time left: ${p.remainingPlaytime ?? 0} min`,
          icon: Clock,
          keywords: 'add time minutes',
          run: async () => {
            await updateDoc(doc(db, 'players', p.id), { remainingPlaytime: increment(mins) });
            setOpen(false);
          },
        });
      }
    }

    // "ban <playerName>"
    const banMatch = trimmed.match(/^ban\s+(.+)$/);
    if (banMatch) {
      const pname = banMatch[1].trim();
      const p = players.find((x) => (x.username || '').toLowerCase().includes(pname));
      if (p) {
        out.push({
          id: `ban-${p.id}`,
          title: `Ban ${p.username}`,
          subtitle: 'Sets banned:true on player doc',
          icon: LogOut,
          keywords: 'ban kick',
          run: async () => {
            if (!confirm(`Ban ${p.username}?`)) return;
            await updateDoc(doc(db, 'players', p.id), { banned: true, bannedAt: Date.now() });
            setOpen(false);
          },
        });
      }
    }

    // "logout <pcName>" → force-logout a specific PC
    const logoutMatch = trimmed.match(/^logout\s+(.+)$/);
    if (logoutMatch) {
      const pcName = logoutMatch[1].trim();
      const pc = pcs.find((x) => (x.pcName || x.id || '').toLowerCase().includes(pcName));
      if (pc) {
        out.push({
          id: `logout-${pc.id}`,
          title: `Force-logout ${pc.pcName || pc.id}`,
          subtitle: pc.currentPlayerName ? `Current: ${pc.currentPlayerName}` : 'No active session',
          icon: LogOut,
          keywords: 'logout force kick session',
          run: async () => {
            await addDoc(collection(db, 'pc-commands'), {
              pcId: pc.id, pcName: pc.pcName || pc.id,
              command: 'force-logout', status: 'sent', createdAt: Date.now(),
            });
            setOpen(false);
          },
        });
      }
    }

    // "close" → maintenance mode ON
    if (trimmed === 'close' || trimmed === 'close shop') {
      out.push({
        id: 'close-shop',
        title: 'Close shop (maintenance mode ON)',
        subtitle: 'Every kiosk will show the maintenance screen',
        icon: Wrench,
        keywords: 'close shutdown maintenance',
        run: async () => {
          if (!confirm('Enable maintenance mode on every kiosk?')) return;
          await setDoc(doc(db, 'config', 'maintenance'),
            { active: true, message: 'Shop is closed. Back soon.' }, { merge: true });
          setOpen(false);
        },
      });
    }
    if (trimmed === 'open' || trimmed === 'open shop') {
      out.push({
        id: 'open-shop',
        title: 'Re-open shop (maintenance OFF)',
        subtitle: 'Clears the maintenance screen',
        icon: Wrench,
        keywords: 'open re-open reopen maintenance off',
        run: async () => {
          await setDoc(doc(db, 'config', 'maintenance'), { active: false }, { merge: true });
          setOpen(false);
        },
      });
    }

    return out;
  }, [players, pcs]);

  // ── Search filter ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const direct = parseDirectCommand(query);
    const q = query.trim().toLowerCase();
    const nav = navActions.filter((a) => {
      if (!q) return true;
      return (a.title + ' ' + (a.keywords || '')).toLowerCase().includes(q);
    });
    // Direct commands first (more specific), then nav options.
    return [...direct, ...nav].slice(0, 12);
  }, [query, navActions, parseDirectCommand]);

  // Keep selected index in range
  useEffect(() => { setSelectedIdx(0); }, [query, open]);

  const runSelected = useCallback(() => {
    const item = filtered[selectedIdx];
    if (item) item.run();
  }, [filtered, selectedIdx]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); runSelected(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(0, i - 1)); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-24 px-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10 }}
            className="w-full max-w-[640px] rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.4)]"
            style={{ background: '#17171a', border: '1px solid #2e2e35' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2e2e35]">
              <Search size={18} className="text-[#86868b] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder='Type to navigate or run — try "add 30 ahmed", "ban mohamed", "close shop"'
                className="flex-1 bg-transparent outline-none text-white placeholder:text-[#6e6e74] text-sm"
              />
              <kbd className="text-[10px] text-[#86868b] px-1.5 py-0.5 border border-[#2e2e35] rounded">Esc</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[420px] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-6 py-12 text-center text-[#86868b] text-sm">
                  No matches. Try a different search.
                </div>
              )}
              {filtered.map((item, i) => {
                const Icon = item.icon;
                const active = i === selectedIdx;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSelectedIdx(i)}
                    onClick={() => item.run()}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      active ? 'bg-[#0071e3]/15' : 'hover:bg-[#24242a]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#0071e3]/20' : 'bg-[#24242a]'}`}>
                      <Icon size={16} className={active ? 'text-[#0071e3]' : 'text-[#86868b]'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{item.title}</div>
                      {item.subtitle && <div className="text-[11px] text-[#86868b] truncate">{item.subtitle}</div>}
                    </div>
                    {active && <ArrowRight size={14} className="text-[#86868b]" />}
                  </button>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-[#2e2e35] text-[10px] text-[#86868b]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-[#24242a] border border-[#2e2e35] rounded">↑↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-[#24242a] border border-[#2e2e35] rounded">↵</kbd> select</span>
              </div>
              <span className="flex items-center gap-1">
                <Command size={10} /> K to toggle
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
