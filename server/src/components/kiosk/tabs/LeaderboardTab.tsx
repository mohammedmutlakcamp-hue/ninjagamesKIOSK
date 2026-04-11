'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, getDoc, setDoc, runTransaction, increment, arrayUnion,
} from 'firebase/firestore';
import {
  Trophy, Clock, Coins, Package, Crown, Medal, Award, ChevronRight, X, Gift, Timer,
} from 'lucide-react';

type LeaderboardType = 'playtime' | 'coins_spent' | 'chests_opened';

const leaderboardTypes: { id: LeaderboardType; label: string; icon: React.ReactNode; color: string; glow: string }[] = [
  { id: 'playtime',       label: 'Playtime',     icon: <Clock size={14} />,   color: '#39FF14', glow: '57,255,20'   },
  { id: 'coins_spent',    label: 'Tokens Spent', icon: <Coins size={14} />,   color: '#FFD700', glow: '255,215,0'   },
  { id: 'chests_opened',  label: 'Chests Opened', icon: <Package size={14} />, color: '#A855F7', glow: '168,85,247' },
];

// Reward payouts for top 3 each week
const WEEKLY_REWARDS = [200, 100, 50];

/** Compute the next Friday at 00:00 (local time) as a unix ms timestamp. */
function nextFridayMidnight(fromMs: number = Date.now()): number {
  const d = new Date(fromMs);
  d.setHours(0, 0, 0, 0);
  // Day of week: 0=Sun, 1=Mon, ..., 5=Fri
  const daysUntilFri = (5 - d.getDay() + 7) % 7;
  // If today IS Friday and we're already past midnight, that's "today" → days = 0 → we'd pick today.
  // But we want NEXT Friday midnight strictly after `fromMs`. If days=0 and midnight already passed today, advance 7.
  if (daysUntilFri === 0 && d.getTime() <= fromMs) {
    d.setDate(d.getDate() + 7);
  } else {
    d.setDate(d.getDate() + daysUntilFri);
  }
  return d.getTime();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface Props {
  onClose?: () => void;
}

export function LeaderboardTab({ onClose }: Props = {}) {
  const [type, setType] = useState<LeaderboardType>('playtime');
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextRewardAt, setNextRewardAt] = useState<number>(nextFridayMidnight());
  const [now, setNow] = useState<number>(Date.now());
  const [justDistributedWinners, setJustDistributedWinners] = useState<{ uid: string; username: string; rank: number; coins: number }[] | null>(null);
  const distributionCheckedRef = useRef(false);

  // Live clock for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load players + meta
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'players'));
        if (cancelled) return;
        const data = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
        setPlayers(data);

        // Read the weekly meta doc, then check if rewards are due.
        const metaRef = doc(db, 'leaderboard-meta', 'weekly');
        const metaSnap = await getDoc(metaRef);
        let meta = metaSnap.exists() ? metaSnap.data() as any : null;
        if (!meta) {
          // First-time init: set the next reward target to the upcoming Friday midnight.
          const initial = { nextRewardAt: nextFridayMidnight(), lastDistributedAt: 0, lastWinners: [] };
          await setDoc(metaRef, initial);
          meta = initial;
        }
        if (!cancelled) setNextRewardAt(meta.nextRewardAt || nextFridayMidnight());

        // Auto-distribute if the period has ended and we haven't distributed already this tick.
        if (!distributionCheckedRef.current && meta.nextRewardAt && Date.now() >= meta.nextRewardAt) {
          distributionCheckedRef.current = true;
          await distributeRewards(data, type);
        }
      } catch (err) {
        console.error('Leaderboard load failed', err);
      }
      if (!cancelled) setLoading(false);
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [type]);

  // Atomically claim distribution, compute winners, credit rewards, advance period.
  const distributeRewards = async (currentPlayers: any[], forType: LeaderboardType) => {
    const metaRef = doc(db, 'leaderboard-meta', 'weekly');
    try {
      // Sort players by the active leaderboard type and pick top 3 eligible (non-guest, has stats > 0).
      const sortedTop3 = [...currentPlayers]
        .filter((p: any) => !p.isGuest)
        .sort((a, b) => getValueFor(b, forType) - getValueFor(a, forType))
        .slice(0, 3)
        .filter(p => getValueFor(p, forType) > 0);

      if (sortedTop3.length === 0) {
        // Nothing to distribute, just advance the period.
        await runTransaction(db, async (tx) => {
          const meta = await tx.get(metaRef);
          const current = meta.exists() ? (meta.data() as any) : {};
          if (current.nextRewardAt && Date.now() < current.nextRewardAt) return;
          tx.set(metaRef, {
            nextRewardAt: nextFridayMidnight(Date.now()),
            lastDistributedAt: Date.now(),
            lastWinners: [],
          });
        });
        return;
      }

      const winners: { uid: string; username: string; rank: number; coins: number }[] = sortedTop3.map((p: any, i: number) => ({
        uid: p.uid, username: p.username || 'Unknown', rank: i + 1, coins: WEEKLY_REWARDS[i] || 0,
      }));

      await runTransaction(db, async (tx) => {
        const meta = await tx.get(metaRef);
        const current = meta.exists() ? (meta.data() as any) : {};
        // Guard: don't double-distribute if another client already advanced the period.
        if (current.nextRewardAt && Date.now() < current.nextRewardAt) return;

        // Pay each winner: increment coins AND drop a trophy inventory item so they see proof.
        for (const w of winners) {
          const playerRef = doc(db, 'players', w.uid);
          const trophy = {
            id: `lb_trophy_${Date.now()}_${w.uid}`,
            type: 'trophy',
            name: `Weekly #${w.rank} — ${leaderboardTypes.find(t => t.id === forType)?.label || ''}`,
            rarity: w.rank === 1 ? 'legendary' : w.rank === 2 ? 'epic' : 'rare',
            value: w.coins,
            obtainedAt: Date.now(),
            used: false,
            tradeable: false,
          };
          tx.update(playerRef, {
            coins: increment(w.coins),
            inventory: arrayUnion(trophy),
          });
        }
        tx.set(metaRef, {
          nextRewardAt: nextFridayMidnight(Date.now()),
          lastDistributedAt: Date.now(),
          lastWinners: winners,
        });
      });

      setJustDistributedWinners(winners);
      setNextRewardAt(nextFridayMidnight(Date.now()));
      // Auto-dismiss the winners banner after a few seconds
      setTimeout(() => setJustDistributedWinners(null), 8000);
    } catch (err) {
      console.error('Reward distribution failed', err);
    }
  };

  const getValueFor = (player: any, forType: LeaderboardType): number => {
    const s = player.stats || {};
    switch (forType) {
      case 'playtime': return player.totalPlaytime || 0;
      case 'coins_spent': return player.totalCoinsSpent || 0;
      case 'chests_opened': return s.chestsOpened || 0;
      default: return 0;
    }
  };

  const getValue = (player: any): number => getValueFor(player, type);

  const formatValue = (val: number): string => {
    if (type === 'playtime') return `${Math.floor(val / 60)}h ${val % 60}m`;
    if (type === 'chests_opened') return `${val.toLocaleString()} chests`;
    if (type === 'coins_spent') return `${val.toLocaleString()} tokens`;
    return val.toLocaleString();
  };

  const sorted = [...players].filter(p => !p.isGuest).sort((a, b) => getValue(b) - getValue(a)).slice(0, 20);
  const activeType = leaderboardTypes.find(t => t.id === type) || leaderboardTypes[0];
  const countdown = Math.max(0, nextRewardAt - now);

  const rankIcons = [
    <Crown size={26} key="1" style={{ color: '#FFD700', filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.7))' }} />,
    <Medal size={26} key="2" style={{ color: '#C0C0C0', filter: 'drop-shadow(0 0 5px rgba(200,200,200,0.5))' }} />,
    <Award size={26} key="3" style={{ color: '#CD7F32', filter: 'drop-shadow(0 0 5px rgba(205,127,50,0.6))' }} />,
  ];

  return (
    <div
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
        border: '1px solid rgba(255,215,0,0.2)',
        boxShadow: '0 0 35px rgba(255,215,0,0.08), inset 0 0 30px rgba(0,0,0,0.4)',
        maxHeight: '88vh',
      }}
    >
      {/* ═══ Animated sidebar-style background ═══ */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(255,215,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.05) 1px, transparent 1px)',
        backgroundSize: '35px 35px',
      }} />
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23FFD700' stroke-width='0.5' opacity='0.05'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 720 800" preserveAspectRatio="none">
        <path d="M0,60 L120,60 L150,40 L380,40 L410,60 L720,60" stroke="#FFD700" strokeWidth="0.8" fill="none" opacity="0.12" />
        <path d="M720,180 L540,180 L510,200 L200,200 L170,180 L0,180" stroke="#39FF14" strokeWidth="0.7" fill="none" opacity="0.1" />
        <path d="M0,340 L160,340 L190,320 L440,320 L470,340 L720,340" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.08" />
        <path d="M720,500 L560,500 L530,520 L220,520 L190,500 L0,500" stroke="#A855F7" strokeWidth="0.5" fill="none" opacity="0.07" />
        <path d="M0,660 L180,660 L210,640 L460,640 L490,660 L720,660" stroke="#FFD700" strokeWidth="0.5" fill="none" opacity="0.06" />
        <path d="M380,0 L380,40 L350,60 L350,180" stroke="#FFD700" strokeWidth="0.7" fill="none" opacity="0.1" />
        <path d="M540,200 L540,320 L560,340 L560,500" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.07" />
        <path d="M220,340 L220,500 L210,520 L210,660" stroke="#A855F7" strokeWidth="0.5" fill="none" opacity="0.06" />
        <circle cx="380" cy="40" r="3" fill="#FFD700" opacity="0.25" className="pcb-node-flash" />
        <circle cx="170" cy="200" r="2.5" fill="#39FF14" opacity="0.2" className="pcb-node-flash2" />
        <circle cx="440" cy="320" r="2.5" fill="#00c8ff" opacity="0.18" className="pcb-node-flash3" />
        <circle cx="220" cy="520" r="2" fill="#A855F7" opacity="0.15" className="pcb-node-flash" />
        <circle cx="460" cy="660" r="2" fill="#FFD700" opacity="0.15" className="pcb-node-flash2" />
      </svg>
      <div className="absolute top-[60px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#FFD700', boxShadow: '0 0 8px #FFD700, 0 0 15px #FFD700' }} />
      <div className="absolute top-[340px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
      <div className="absolute top-[660px] left-0 w-3 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
      <div className="absolute top-0 left-[380px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#FFD700', boxShadow: '0 0 8px #FFD700' }} />
      <div className="absolute top-0 left-[540px] w-[2px] h-2 rounded-full pcb-pulse-v2 z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(255,215,0,0.15)' }} />
      <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
      <div className="absolute left-[10%] top-[20%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(255,215,0,0.45)' }} />
      <div className="absolute left-[72%] top-[42%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
      <div className="absolute left-[40%] top-[78%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3)' }} />
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 50% 5%, rgba(255,215,0,0.1) 0%, transparent 42%), radial-gradient(ellipse at 30% 40%, rgba(0,200,255,0.05) 0%, transparent 30%), radial-gradient(ellipse at 70% 70%, rgba(168,85,247,0.04) 0%, transparent 30%), radial-gradient(ellipse at 50% 95%, rgba(255,215,0,0.05) 0%, transparent 40%)',
      }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.55), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 12px rgba(255,215,0,0.35)' }} />
      <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #FFD700, #00c8ff, #a855f7, #00c8ff, #FFD700)', boxShadow: '0 0 8px rgba(255,215,0,0.35)' }} />
      <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)' }} />

      {/* Close button */}
      {onClose && (
        <button onClick={onClose}
          className="absolute top-4 right-4 z-[100] w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-yellow-400 transition-all hover:rotate-90"
          style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.25)', boxShadow: '0 0 10px rgba(255,215,0,0.1)' }}
        >
          <X size={22} />
        </button>
      )}

      {/* Content */}
      <div className="relative z-[5] flex flex-col flex-1 min-h-0 px-8 pt-7 pb-6">
        {/* Header */}
        <div className="mb-5 flex-shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <Trophy size={30} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(255,215,0,0.7))' }} />
            <h2 className="font-ninja text-4xl tracking-wider" style={{ color: '#FFD700', textShadow: '0 0 22px rgba(255,215,0,0.45), 0 0 45px rgba(255,215,0,0.12)' }}>
              LEADERBOARD
            </h2>
          </div>
          <p className="font-body text-gray-500 text-xs tracking-wider">TOP NINJAS · WEEKLY REWARDS</p>
        </div>

        {/* Reward banner + countdown */}
        <div className="relative mb-4 rounded-lg overflow-hidden flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,140,0,0.03))',
            border: '1px solid rgba(255,215,0,0.35)',
            boxShadow: '0 0 15px rgba(255,215,0,0.1)',
          }}>
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
            <div key={ci} className={`absolute ${pos} w-2.5 h-2.5`} style={{
              ...(pos.includes('top') ? { borderTop: '1.5px solid #FFD700' } : { borderBottom: '1.5px solid #FFD700' }),
              ...(pos.includes('left') ? { borderLeft: '1.5px solid #FFD700' } : { borderRight: '1.5px solid #FFD700' }),
              opacity: 0.7,
            }} />
          ))}
          <div className="relative z-[2] flex items-center gap-4 px-5 py-3">
            <Gift size={22} className="text-yellow-400 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.65))' }} />
            <div className="flex items-center gap-2">
              <span className="font-ninja text-sm text-yellow-400 tracking-wider">1st</span>
              <span className="font-ninja text-sm text-yellow-300 flex items-center gap-1"><Coins size={12} />{WEEKLY_REWARDS[0]}</span>
            </div>
            <div className="w-px h-4 bg-yellow-500/30" />
            <div className="flex items-center gap-2">
              <span className="font-ninja text-sm text-gray-300 tracking-wider">2nd</span>
              <span className="font-ninja text-sm text-gray-200 flex items-center gap-1"><Coins size={12} />{WEEKLY_REWARDS[1]}</span>
            </div>
            <div className="w-px h-4 bg-yellow-500/30" />
            <div className="flex items-center gap-2">
              <span className="font-ninja text-sm text-amber-600 tracking-wider">3rd</span>
              <span className="font-ninja text-sm text-amber-500 flex items-center gap-1"><Coins size={12} />{WEEKLY_REWARDS[2]}</span>
            </div>
            <div className="flex-1 flex items-center justify-end gap-2">
              <Timer size={14} className="text-cyan-400" />
              <span className="font-ninja text-xs text-cyan-300 tracking-wider">
                RESET IN {formatCountdown(countdown)}
              </span>
            </div>
          </div>
        </div>

        {/* Type selector */}
        <div className="flex gap-2.5 justify-center mb-5 flex-wrap flex-shrink-0">
          {leaderboardTypes.map((t) => {
            const active = type === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className="relative px-5 py-2.5 rounded-lg font-ninja text-xs tracking-wider flex items-center gap-2 transition-all overflow-hidden hover:brightness-125"
                style={{
                  background: active
                    ? `linear-gradient(135deg, rgba(${t.glow},0.22), rgba(${t.glow},0.08))`
                    : 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)',
                  border: active ? `1px solid rgba(${t.glow},0.6)` : '1px solid rgba(255,255,255,0.08)',
                  color: active ? t.color : '#888',
                  boxShadow: active ? `0 0 14px rgba(${t.glow},0.3)` : 'none',
                  textShadow: active ? `0 0 6px rgba(${t.glow},0.5)` : 'none',
                }}
              >
                <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{
                  borderTop: `1.5px solid ${active ? t.color : 'rgba(255,255,255,0.15)'}`,
                  borderLeft: `1.5px solid ${active ? t.color : 'rgba(255,255,255,0.15)'}`,
                }} />
                <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{
                  borderBottom: `1.5px solid ${active ? t.color : 'rgba(255,255,255,0.15)'}`,
                  borderRight: `1.5px solid ${active ? t.color : 'rgba(255,255,255,0.15)'}`,
                }} />
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable rankings */}
        <div className="relative flex-1 min-h-0 overflow-y-auto pr-2 space-y-2"
          style={{ scrollbarWidth: 'thin', scrollbarColor: `rgba(${activeType.glow},0.25) transparent` }}>
          {sorted.map((player, i) => {
            const isTop3 = i < 3;
            const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#6b7280';
            const rankGlow = i === 0 ? '255,215,0' : i === 1 ? '192,192,192' : i === 2 ? '205,127,50' : '107,114,128';
            const ninjaType = player.ninjaType || player.character?.ninjaType || 'neon';
            const rewardCoins = isTop3 ? WEEKLY_REWARDS[i] : 0;

            return (
              <motion.div
                key={player.uid}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.025, type: 'spring', stiffness: 130 }}
                className="relative rounded-lg overflow-hidden cursor-pointer transition-all hover:brightness-110"
                onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: player.uid } }))}
                style={{
                  background: isTop3
                    ? `linear-gradient(135deg, rgba(${rankGlow},0.12) 0%, rgba(${rankGlow},0.03) 45%, rgba(0,0,0,0.4) 100%)`
                    : 'linear-gradient(135deg, rgba(255,255,255,0.025), rgba(0,0,0,0.3))',
                  border: isTop3 ? `1px solid rgba(${rankGlow},0.45)` : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isTop3 ? `0 0 14px rgba(${rankGlow},0.16), inset 0 0 16px rgba(${rankGlow},0.04)` : 'none',
                }}
              >
                {isTop3 && ['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                  <div key={ci} className={`absolute ${pos} w-2.5 h-2.5 z-[1]`} style={{
                    ...(pos.includes('top') ? { borderTop: `2px solid ${rankColor}` } : { borderBottom: `2px solid ${rankColor}` }),
                    ...(pos.includes('left') ? { borderLeft: `2px solid ${rankColor}` } : { borderRight: `2px solid ${rankColor}` }),
                    opacity: 0.8,
                    filter: `drop-shadow(0 0 3px ${rankColor})`,
                  }} />
                ))}
                <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px]" style={{
                  background: isTop3 ? rankColor : 'rgba(255,255,255,0.15)',
                  boxShadow: isTop3 ? `0 0 6px ${rankColor}` : 'none',
                  opacity: isTop3 ? 0.75 : 0.3,
                }} />

                <div className="relative z-[2] flex items-center gap-3.5 px-4 py-3">
                  {/* Rank icon or number */}
                  <div className="w-11 flex items-center justify-center flex-shrink-0">
                    {isTop3 ? rankIcons[i] : (
                      <span className="font-ninja text-xl text-gray-500">#{i + 1}</span>
                    )}
                  </div>

                  {/* Octagonal avatar */}
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{
                        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                        background: `linear-gradient(135deg, rgba(${rankGlow},0.45), rgba(${rankGlow},0.2))`,
                        boxShadow: isTop3 ? `0 0 12px rgba(${rankGlow},0.45)` : 'none',
                      }} />
                    <div className="absolute inset-[2px] overflow-hidden"
                      style={{
                        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                        background: '#0a0a0a',
                      }}>
                      <img src={player.profilePhoto || `/img/pfp-${ninjaType}.png`} alt={player.username}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-ninja text-base tracking-wide truncate" style={{
                      color: isTop3 ? rankColor : '#fff',
                      textShadow: isTop3 ? `0 0 9px rgba(${rankGlow},0.45)` : 'none',
                    }}>
                      {player.username?.toUpperCase()}
                    </p>
                    <p className="font-body text-[11px] text-gray-500 tracking-wider truncate">{player.activeTitle || 'NEWCOMER'}</p>
                  </div>

                  {/* Value */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-ninja text-base" style={{
                      color: isTop3 ? rankColor : '#fff',
                      textShadow: isTop3 ? `0 0 7px rgba(${rankGlow},0.4)` : 'none',
                    }}>
                      {formatValue(getValue(player))}
                    </p>
                    {isTop3 && (
                      <p className="font-ninja text-[11px] text-yellow-400 flex items-center justify-end gap-0.5 mt-0.5">
                        <Coins size={10} /> +{rewardCoins}
                      </p>
                    )}
                  </div>

                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `rgba(${rankGlow},0.08)`,
                      border: `1px solid rgba(${rankGlow},0.2)`,
                    }}>
                    <ChevronRight size={14} style={{ color: isTop3 ? rankColor : '#888' }} />
                  </div>
                </div>
              </motion.div>
            );
          })}

          {sorted.length === 0 && !loading && (
            <div className="text-center py-12">
              <Trophy size={40} className="text-gray-600 mx-auto mb-3" />
              <p className="font-ninja text-base text-gray-500">No players yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Just-distributed winners overlay */}
      {justDistributedWinners && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute bottom-4 left-4 right-4 z-[50] rounded-lg p-3"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,140,0,0.08))',
            border: '2px solid rgba(255,215,0,0.5)',
            boxShadow: '0 0 30px rgba(255,215,0,0.35)',
          }}
        >
          <p className="font-ninja text-sm text-yellow-300 tracking-wider mb-1.5 flex items-center gap-2">
            <Trophy size={14} /> WEEKLY REWARDS DISTRIBUTED
          </p>
          <div className="flex gap-3 flex-wrap">
            {justDistributedWinners.map(w => (
              <div key={w.uid} className="font-body text-[11px] text-yellow-200">
                #{w.rank} <span className="font-ninja text-white">{w.username}</span> +<Coins size={9} className="inline" />{w.coins}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
