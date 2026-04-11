'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, increment, collection, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { CHESTS, RARITY_COLORS } from '@/lib/constants';
import { Chest, ChestReward } from '@/types';
import { Coins, Sparkles, Star, Zap, Gift, Coffee, Cookie, UtensilsCrossed, Trophy, Percent, X, Clock, Crown, Users, SkipForward, Package, ChevronLeft, Eye, TrendingUp } from 'lucide-react';
import { trackDailyTask } from '@/lib/daily-tasks';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props { player: any; }

// Chest image mapping
const CHEST_IMAGES: Record<string, string> = {
  common: '/img/chest-common.png',
  rare: '/img/chest-rare.png',
  legendary: '/img/chest-legendary-new.png',
  mythical: '/img/chest-mythical.png',
};

interface ChestDrop {
  id: string;
  playerId: string;
  playerName: string;
  rewardName: string;
  rewardRarity: string;
  rewardType: string;
  rewardImage?: string;
  rewardSkinId?: string;
  rewardValue?: number;
  chestTier: string;
  timestamp: number;
}

const getRewardIcon = (r: ChestReward, size = 20) => {
  if (r.type === 'coins') return <Coins size={size} />;
  if (r.type === 'xp_boost') return <Zap size={size} />;
  if (r.id?.includes('drink')) return <Coffee size={size} />;
  if (r.id?.includes('snack')) return <Cookie size={size} />;
  if (r.id?.includes('food')) return <UtensilsCrossed size={size} />;
  if (r.id?.includes('tournament')) return <Trophy size={size} />;
  if (r.id?.includes('time')) return <Clock size={size} />;
  return <Gift size={size} />;
};

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function ChestsTab({ player }: Props) {
  // Core state
  const [selectedChest, setSelectedChest] = useState<Chest | null>(null);
  const [openCount, setOpenCount] = useState(1);
  const [phase, setPhase] = useState<'pick' | 'preview' | 'spinning' | 'reveal' | 'bulk-reveal'>('pick');
  const [reward, setReward] = useState<ChestReward | null>(null);
  const [bulkResults, setBulkResults] = useState<ChestReward[]>([]);
  const [processing, setProcessing] = useState(false);

  // Live feed
  const [recentDrops, setRecentDrops] = useState<ChestDrop[]>([]);
  const [luckyDrops, setLuckyDrops] = useState<ChestDrop[]>([]);

  // ESC resets the current chest open flow (back to pick phase).
  useEscapeKey(() => {
    if (phase === 'reveal' || phase === 'bulk-reveal') { setPhase('pick'); setReward(null); setBulkResults([]); }
    else if (phase === 'preview') setPhase('pick');
    else if (selectedChest) setSelectedChest(null);
  }, selectedChest !== null || phase !== 'pick');

  // Spin state
  const [spinItems, setSpinItems] = useState<ChestReward[]>([]);
  const [spinOffset, setSpinOffset] = useState(0);
  const [winIndex, setWinIndex] = useState(0);
  const [activeCardIndex, setActiveCardIndex] = useState(-1);
  const animFrameRef = useRef<number>(0);
  const spinStartRef = useRef(0);

  const totalXP = calculateTotalXP(player);
  const levelInfo = getLevelInfo(totalXP);
  const chestDiscount = levelInfo.chestDiscount;
  const getDiscountedCost = (cost: number) => Math.floor(cost * (1 - chestDiscount / 100));

  // Live listener for recent drops (all players)
  useEffect(() => {
    const q = query(collection(db, 'chest-drops'), orderBy('timestamp', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const drops = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChestDrop));
      setRecentDrops(drops);
      // Lucky = rare+ rarity drops
      setLuckyDrops(drops.filter(d => ['rare', 'legendary', 'mythical', 'immortal'].includes(d.rewardRarity)));
    });
    return () => unsub();
  }, []);

  const rollReward = (chest: Chest): ChestReward => {
    const pool = chest.rewards;
    const totalWeight = pool.reduce((sum, r) => sum + r.dropRate, 0);
    let roll = Math.random() * totalWeight;
    for (const r of pool) { roll -= r.dropRate; if (roll <= 0) return r; }
    return pool[pool.length - 1];
  };

  const saveReward = async (won: ChestReward, chest: Chest) => {
    if (player.isGuest) return; // Guests don't save rewards
    try {
      if (won.type === 'coins' && won.value) {
        await updateDoc(doc(db, 'players', player.uid), { coins: increment(won.value) });
      } else if (won.type === 'skin' && won.skinId) {
        await updateDoc(doc(db, 'players', player.uid), {
          ownedNinjas: arrayUnion(won.skinId),
          inventory: arrayUnion({ id: `${won.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type: won.type, name: won.name, rarity: won.rarity, skinId: won.skinId, value: won.value || 0, obtainedAt: Date.now(), used: false }),
        });
      } else {
        await updateDoc(doc(db, 'players', player.uid), {
          inventory: arrayUnion({ id: `${won.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type: won.type, name: won.name, rarity: won.rarity, value: won.value || 0, obtainedAt: Date.now(), used: false }),
        });
      }
      await addDoc(collection(db, 'chest-drops'), {
        playerId: player.uid, playerName: player.username || 'Anonymous',
        rewardName: won.name, rewardRarity: won.rarity, rewardType: won.type,
        rewardImage: won.image || null, rewardSkinId: won.skinId || null,
        rewardValue: won.value || 0,
        chestTier: chest.tier, timestamp: Date.now(),
      }).catch(() => {});
    } catch (err) { console.error('Save reward failed:', err); }
  };

  // Single open with spin
  const openSingle = async (chest: Chest) => {
    const cost = getDiscountedCost(chest.cost);
    if (player.coins < cost || processing) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-cost), totalCoinsSpent: increment(cost), 'stats.chestsOpened': increment(1) });
      trackDailyTask(player.uid, 'open_chest');
    } catch { setProcessing(false); return; }
    const won = rollReward(chest);
    setReward(won);
    const items: ChestReward[] = [];
    for (let i = 0; i < 40; i++) items.push(chest.rewards[Math.floor(Math.random() * chest.rewards.length)]);
    items[33] = won;
    setSpinItems(items);
    setWinIndex(33);
    setSpinOffset(0);
    spinStartRef.current = Date.now();
    setPhase('spinning');
    await saveReward(won, chest);
    setProcessing(false);
  };

  // Bulk open
  const openBulk = async (chest: Chest, count: number) => {
    const cost = getDiscountedCost(chest.cost) * count;
    if (player.coins < cost || processing) return;
    setProcessing(true);
    try {
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-cost), totalCoinsSpent: increment(cost), 'stats.chestsOpened': increment(count) });
      for (let i = 0; i < count; i++) trackDailyTask(player.uid, 'open_chest');
    } catch { setProcessing(false); return; }
    const results: ChestReward[] = [];
    for (let i = 0; i < count; i++) {
      const won = rollReward(chest);
      results.push(won);
      await saveReward(won, chest);
    }
    setBulkResults(results);
    setPhase('bulk-reveal');
    setProcessing(false);
  };

  // Spin animation
  const CARD_W = 200;
  useEffect(() => {
    if (phase !== 'spinning') return;
    const SPIN_DURATION = 6000;
    const targetOffset = winIndex * CARD_W + Math.random() * (CARD_W * 0.3);
    let lastCard = -1;
    const animate = () => {
      const progress = Math.min((Date.now() - spinStartRef.current) / SPIN_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setSpinOffset(eased * targetOffset);
      const ci = Math.floor((eased * targetOffset) / CARD_W);
      if (ci !== lastCard) { lastCard = ci; setActiveCardIndex(ci); }
      if (progress < 1) animFrameRef.current = requestAnimationFrame(animate);
      else { setActiveCardIndex(winIndex); setTimeout(() => setPhase('reveal'), 500); }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, winIndex]);

  const skipSpin = () => {
    cancelAnimationFrame(animFrameRef.current);
    setSpinOffset(winIndex * CARD_W);
    setActiveCardIndex(winIndex);
    setPhase('reveal');
  };

  const reset = () => {
    setPhase('pick');
    setReward(null);
    setBulkResults([]);
    setSpinItems([]);
    setSpinOffset(0);
    setOpenCount(1);
  };

  const goToPreview = (chest: Chest) => {
    setSelectedChest(chest);
    setOpenCount(1);
    setPhase('preview');
  };

  return (
    <div className="relative h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}>
      {/* Breathing glow */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
      {/* PCB grid overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      {/* Hex overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      {/* PCB traces */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <path d="M0,80 L100,80 L130,50 L350,50 L380,80 L500,80" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.1" />
        <path d="M1200,150 L1080,150 L1050,180 L850,180 L820,150 L700,150" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.07" />
        <path d="M0,350 L120,350 L150,320 L400,320 L430,350 L600,350" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.06" />
        <path d="M1200,450 L1050,450 L1020,480 L800,480 L770,450 L600,450" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M0,650 L150,650 L180,620 L450,620 L480,650 L700,650" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M1200,700 L1000,700 L970,730 L750,730 L720,700 L550,700" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.04" />
        {/* Vertical */}
        <path d="M300,0 L300,50 L270,80 L270,180" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.07" />
        <path d="M900,0 L900,150 L930,180 L930,320" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M600,350 L600,450 L570,480 L570,620" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.04" />
        {/* Nodes */}
        <circle cx="350" cy="50" r="3" fill="#39FF14" opacity="0.2" className="pcb-node-flash" />
        <circle cx="850" cy="180" r="2.5" fill="#00c8ff" opacity="0.15" className="pcb-node-flash2" />
        <circle cx="400" cy="320" r="2.5" fill="#39FF14" opacity="0.12" className="pcb-node-flash3" />
        <circle cx="800" cy="480" r="2" fill="#a855f7" opacity="0.1" className="pcb-node-flash" />
        <circle cx="450" cy="620" r="2" fill="#00c8ff" opacity="0.1" className="pcb-node-flash2" />
        {/* Glow halos */}
        <circle cx="350" cy="50" r="8" fill="none" stroke="#39FF14" strokeWidth="0.4" opacity="0.06" className="pcb-node-flash" />
        <circle cx="850" cy="180" r="7" fill="none" stroke="#00c8ff" strokeWidth="0.3" opacity="0.05" className="pcb-node-flash2" />
      </svg>
      {/* Data pulses */}
      <div className="absolute top-[80px] left-0 w-5 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 10px #39FF14, 0 0 20px #39FF14' }} />
      <div className="absolute top-[350px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff, 0 0 16px #00c8ff' }} />
      <div className="absolute top-[650px] right-0 w-4 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
      <div className="absolute top-0 left-[300px] w-[2px] h-4 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
      <div className="absolute top-0 left-[900px] w-[2px] h-3 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
      {/* Scanline sweeps */}
      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.2) 30%, rgba(0,200,255,0.15) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(57,255,20,0.1)' }} />
      <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.15) 40%, rgba(0,200,255,0.1) 60%, transparent 100%)' }} />
      {/* Floating energy orbs */}
      <div className="absolute left-[10%] top-[25%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.5) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.3)' }} />
      <div className="absolute right-[15%] top-[60%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.4) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.25)' }} />
      <div className="absolute left-[50%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(168,85,247,0.2)' }} />
      {/* Radial glow spots */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 15% 10%, rgba(57,255,20,0.08) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(0,200,255,0.06) 0%, transparent 35%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.03) 0%, transparent 45%), radial-gradient(ellipse at 80% 20%, rgba(57,255,20,0.04) 0%, transparent 30%), radial-gradient(ellipse at 20% 80%, rgba(0,200,255,0.04) 0%, transparent 30%)',
      }} />
      {/* Edge glow lines */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.3), rgba(0,200,255,0.2), rgba(168,85,247,0.15), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.15), rgba(168,85,247,0.1), transparent)' }} />
      <div className="absolute top-0 left-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.2), rgba(0,200,255,0.1), transparent)' }} />
      <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.15), rgba(168,85,247,0.1), transparent)' }} />

      {/* ═══ PICK PHASE — Choose chest ═══ */}
      {phase === 'pick' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 px-6 py-5 h-full flex flex-col overflow-hidden">
          {/* Header — HUD framed */}
          <div className="flex items-center justify-between mb-3">
            {/* Coins — LEFT */}
            <div className="relative flex items-center gap-2 px-4 py-2 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(234,179,8,0.02))', border: '1px solid rgba(234,179,8,0.18)' }}>
              <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(234,179,8,0.4)', borderLeft: '1px solid rgba(234,179,8,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(234,179,8,0.4)', borderRight: '1px solid rgba(234,179,8,0.4)' }} />
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <Coins size={13} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }} />
              </div>
              <span className="font-ninja text-sm text-yellow-400" style={{ textShadow: '0 0 8px rgba(234,179,8,0.3)' }}>{Math.floor(player.coins)}</span>
            </div>
            {/* Title — CENTER */}
            <div className="relative px-5 py-2 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.06), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.15)' }}>
              <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '2px solid rgba(57,255,20,0.4)', borderRight: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent)' }} />
              <h2 className="font-ninja text-2xl tracking-[0.15em]" style={{ color: '#39FF14', textShadow: '0 0 15px rgba(57,255,20,0.4)' }}>TREASURE CHESTS</h2>
            </div>
            {/* Discount — RIGHT */}
            {chestDiscount > 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ninja text-xs" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.15)', color: '#39FF14' }}>
                <Percent size={11} /> {chestDiscount}% DISCOUNT
              </div>
            ) : <div className="w-[100px]" />}
          </div>
          <div className="h-[1px] mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.2), rgba(0,200,255,0.12), transparent)' }} />

          {/* 4 Chest Cards */}
          <div className="flex justify-center gap-6 mb-6">
            {CHESTS.map((chest, i) => {
              const cost = getDiscountedCost(chest.cost);
              const canAfford = player.coins >= cost;
              return (
                <motion.div key={chest.id}
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  whileHover={canAfford ? { y: -10, scale: 1.03 } : {}}
                  onClick={() => canAfford && goToPreview(chest)}
                  className={`relative cursor-pointer flex-shrink-0 rounded-xl transition-all group overflow-hidden ${!canAfford ? 'opacity-30 cursor-not-allowed' : ''}`}
                  style={{
                    width: 340, height: 440,
                    background: `linear-gradient(180deg, ${chest.color}0A 0%, #040608 40%, #030508 100%)`,
                    border: `1px solid ${chest.color}25`,
                    boxShadow: canAfford ? `0 4px 40px ${chest.color}12, 0 0 60px ${chest.color}06` : 'none',
                  }}>
                  {/* PCB grid inside card */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: `linear-gradient(${chest.color}08 1px, transparent 1px), linear-gradient(90deg, ${chest.color}08 1px, transparent 1px)`,
                    backgroundSize: '30px 30px',
                    opacity: 0.4,
                  }} />
                  {/* PCB traces */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 340" preserveAspectRatio="none">
                    <path d={`M0,60 L40,60 L55,45 L120,45`} stroke={chest.color} strokeWidth="0.6" fill="none" opacity="0.12" />
                    <path d={`M300,100 L250,100 L235,115 L180,115`} stroke={chest.color} strokeWidth="0.5" fill="none" opacity="0.08" />
                    <path d={`M0,250 L50,250 L65,265 L140,265`} stroke={chest.color} strokeWidth="0.5" fill="none" opacity="0.08" />
                    <path d={`M300,280 L260,280 L245,295 L200,295`} stroke={chest.color} strokeWidth="0.5" fill="none" opacity="0.06" />
                    <circle cx="120" cy="45" r="2" fill={chest.color} opacity="0.15" className="pcb-node-flash" />
                    <circle cx="180" cy="115" r="1.5" fill={chest.color} opacity="0.1" className="pcb-node-flash2" />
                  </svg>
                  {/* HUD corners — all 4 */}
                  <div className="absolute top-0 left-0 w-4 h-4 z-[1]" style={{ borderTop: `2px solid ${chest.color}60`, borderLeft: `2px solid ${chest.color}60` }} />
                  <div className="absolute top-0 right-0 w-4 h-4 z-[1]" style={{ borderTop: `1px solid ${chest.color}30`, borderRight: `1px solid ${chest.color}30` }} />
                  <div className="absolute bottom-0 left-0 w-4 h-4 z-[1]" style={{ borderBottom: `1px solid ${chest.color}30`, borderLeft: `1px solid ${chest.color}30` }} />
                  <div className="absolute bottom-0 right-0 w-4 h-4 z-[1]" style={{ borderBottom: `2px solid ${chest.color}60`, borderRight: `2px solid ${chest.color}60` }} />
                  {/* Top neon accent line */}
                  <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: `linear-gradient(90deg, transparent, ${chest.color}, transparent)`, boxShadow: `0 0 12px ${chest.color}40` }} />
                  {/* Bottom accent */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] z-[1]" style={{ background: `linear-gradient(90deg, transparent, ${chest.color}40, transparent)` }} />
                  {/* Left glow bar */}
                  <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[1]" style={{ background: chest.color, boxShadow: `0 0 8px ${chest.color}, 0 0 15px ${chest.color}40`, opacity: 0.3 }} />
                  {/* Right glow bar */}
                  <div className="absolute right-0 top-[15%] bottom-[15%] w-[2px] z-[1]" style={{ background: chest.color, boxShadow: `0 0 8px ${chest.color}, 0 0 15px ${chest.color}40`, opacity: 0.15 }} />
                  {/* Radial glow behind chest */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: `radial-gradient(ellipse at 50% 40%, ${chest.color}10 0%, transparent 60%)`,
                  }} />

                  {chestDiscount > 0 && (
                    <div className="absolute top-3 right-3 z-10 font-ninja text-[9px] px-2.5 py-1 rounded flex items-center gap-0.5" style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.3)', color: '#39FF14', boxShadow: '0 0 10px rgba(57,255,20,0.2)' }}>
                      <Percent size={9} /> {chestDiscount}%
                    </div>
                  )}

                  {/* Chest image */}
                  <div className="flex justify-center mt-3 relative z-[1]">
                    <motion.img
                      src={CHEST_IMAGES[chest.id] || `/img/chest-${chest.tier}.png`}
                      alt={chest.name}
                      className="object-contain"
                      style={{ width: (chest.id === 'common' || chest.id === 'legendary') ? 320 : 305, height: (chest.id === 'common' || chest.id === 'legendary') ? 320 : 305, filter: `drop-shadow(0 0 40px ${chest.glowColor})` }}
                      animate={canAfford ? { y: [0, -6, 0] } : {}}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    />
                  </div>

                  <p className="font-ninja text-sm text-center tracking-wider relative z-[1]" style={{ color: chest.color, textShadow: `0 0 10px ${chest.color}40` }}>
                    {chest.name.toUpperCase()}
                  </p>
                  <p className="font-body text-xs text-center text-gray-500 mt-0.5 relative z-[1]">
                    {chest.rewards.length} unique rewards
                  </p>

                  {/* Cost — HUD badge */}
                  <div className="absolute bottom-4 left-4 right-4 z-[1]">
                    <div className="flex items-center justify-center gap-2 py-3 rounded-lg" style={{ background: `linear-gradient(135deg, ${chest.color}12, ${chest.color}04)`, border: `1px solid ${chest.color}30`, boxShadow: `0 0 12px ${chest.color}10` }}>
                      <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: `rgba(234,179,8,0.12)`, border: '1px solid rgba(234,179,8,0.2)' }}>
                        <Coins size={14} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />
                      </div>
                      <span className="font-ninja text-lg" style={{ color: canAfford ? chest.color : '#444', textShadow: canAfford ? `0 0 10px ${chest.color}40` : 'none' }}>
                        {chestDiscount > 0 ? <><span className="line-through text-gray-600 text-sm mr-1.5">{chest.cost}</span>{cost}</> : cost}
                      </span>
                    </div>
                  </div>

                  {/* Hover glow */}
                  {canAfford && (
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[1]"
                      style={{ boxShadow: `inset 0 0 50px ${chest.color}12, 0 0 50px ${chest.color}18` }} />
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* ═══ LAST OPENED + LUCKY PLAYERS — Full Cyberpunk ═══ */}
          <div className="grid grid-cols-2 gap-5" style={{ width: `${340 * 4 + 24 * 3}px`, maxWidth: '100%', margin: '0 auto' }}>
            {/* ── Last Opened ── */}
            <div className="relative rounded-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.04) 0%, #040608 40%, #030508 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 0 25px rgba(57,255,20,0.04)' }}>
              {/* PCB grid inside */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
                backgroundSize: '25px 25px', opacity: 0.5,
              }} />
              {/* PCB traces */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 300" preserveAspectRatio="none">
                <path d="M0,40 L60,40 L80,20 L200,20" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.08" />
                <path d="M600,120 L520,120 L500,140 L400,140" stroke="#00c8ff" strokeWidth="0.4" fill="none" opacity="0.06" />
                <path d="M0,220 L80,220 L100,200 L250,200" stroke="#39FF14" strokeWidth="0.4" fill="none" opacity="0.05" />
                <circle cx="200" cy="20" r="2" fill="#39FF14" opacity="0.12" className="pcb-node-flash" />
                <circle cx="400" cy="140" r="1.5" fill="#00c8ff" opacity="0.08" className="pcb-node-flash2" />
              </svg>
              {/* HUD corners — all 4 */}
              <div className="absolute top-0 left-0 w-4 h-4 z-[1]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 z-[1]" style={{ borderTop: '1px solid rgba(57,255,20,0.2)', borderRight: '1px solid rgba(57,255,20,0.2)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 z-[1]" style={{ borderBottom: '1px solid rgba(0,200,255,0.15)', borderLeft: '1px solid rgba(0,200,255,0.15)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 z-[1]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              {/* Top neon accent */}
              <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.5), rgba(0,200,255,0.2), transparent)', boxShadow: '0 0 8px rgba(57,255,20,0.2)' }} />
              {/* Left glow bar */}
              <div className="absolute left-0 top-[10%] bottom-[10%] w-[2px] z-[1]" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14, 0 0 12px rgba(57,255,20,0.2)', opacity: 0.25 }} />
              {/* Content */}
              <div className="relative z-[2] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 8px rgba(57,255,20,0.15)' }}>
                    <Clock size={12} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                  </div>
                  <span className="font-ninja text-xs text-gray-200 tracking-wider" style={{ textShadow: '0 0 8px rgba(57,255,20,0.15)' }}>LAST OPENED</span>
                  <span className="ml-auto font-body text-[9px] text-gray-600">Live</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-ninja-green animate-pulse" style={{ boxShadow: '0 0 6px rgba(57,255,20,0.5)' }} />
                </div>
                <div className="space-y-1">
                  {recentDrops.length === 0 ? (
                    <p className="font-body text-[11px] text-gray-600 text-center py-2">No drops yet — be the first!</p>
                  ) : (
                    recentDrops.slice(0, 5).map((drop, idx) => {
                      const rc = RARITY_COLORS[drop.rewardRarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                      return (
                        <motion.div key={drop.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors relative overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${rc}08, transparent)`, border: `1px solid ${rc}12` }}
                        >
                          <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-r" style={{ background: rc, opacity: 0.3 }} />
                          <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${rc}12`, border: `1px solid ${rc}20`, boxShadow: `0 0 8px ${rc}10` }}>
                            {drop.rewardImage ? <img src={drop.rewardImage} alt="" className="w-6 h-6 object-contain" /> : <Gift size={16} style={{ color: rc, filter: `drop-shadow(0 0 3px ${rc})` }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-body text-xs text-white truncate">{drop.playerName}</p>
                            <p className="font-body text-[10px] truncate" style={{ color: rc }}>{drop.rewardName}</p>
                          </div>
                          <span className="font-body text-[10px] text-gray-600 flex-shrink-0">{formatTime(drop.timestamp)}</span>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ── Lucky Players ── */}
            <div className="relative rounded-xl overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.04) 0%, #040608 40%, #030508 100%)', border: '1px solid rgba(255,215,0,0.15)', boxShadow: '0 0 25px rgba(255,215,0,0.04)' }}>
              {/* PCB grid inside */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(rgba(255,215,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.03) 1px, transparent 1px)',
                backgroundSize: '25px 25px', opacity: 0.5,
              }} />
              {/* PCB traces */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 300" preserveAspectRatio="none">
                <path d="M600,40 L530,40 L510,60 L400,60" stroke="#FFD700" strokeWidth="0.5" fill="none" opacity="0.08" />
                <path d="M0,150 L80,150 L100,130 L220,130" stroke="#a855f7" strokeWidth="0.4" fill="none" opacity="0.05" />
                <path d="M600,240 L500,240 L480,260 L350,260" stroke="#FFD700" strokeWidth="0.4" fill="none" opacity="0.05" />
                <circle cx="400" cy="60" r="2" fill="#FFD700" opacity="0.1" className="pcb-node-flash" />
                <circle cx="220" cy="130" r="1.5" fill="#a855f7" opacity="0.07" className="pcb-node-flash3" />
              </svg>
              {/* HUD corners — all 4 */}
              <div className="absolute top-0 left-0 w-4 h-4 z-[1]" style={{ borderTop: '2px solid rgba(255,215,0,0.5)', borderLeft: '2px solid rgba(255,215,0,0.5)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 z-[1]" style={{ borderTop: '1px solid rgba(255,215,0,0.2)', borderRight: '1px solid rgba(255,215,0,0.2)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 z-[1]" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)', borderLeft: '1px solid rgba(168,85,247,0.15)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 z-[1]" style={{ borderBottom: '2px solid rgba(168,85,247,0.3)', borderRight: '2px solid rgba(168,85,247,0.3)' }} />
              {/* Top neon accent */}
              <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.5), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 8px rgba(255,215,0,0.2)' }} />
              {/* Left glow bar */}
              <div className="absolute left-0 top-[10%] bottom-[10%] w-[2px] z-[1]" style={{ background: '#FFD700', boxShadow: '0 0 6px #FFD700, 0 0 12px rgba(255,215,0,0.2)', opacity: 0.25 }} />
              {/* Content */}
              <div className="relative z-[2] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)', boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
                    <Crown size={12} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.6))' }} />
                  </div>
                  <span className="font-ninja text-xs text-yellow-300/90 tracking-wider" style={{ textShadow: '0 0 8px rgba(255,215,0,0.15)' }}>LUCKY PLAYERS</span>
                  <Sparkles size={10} className="text-yellow-400/40 ml-auto" />
                </div>
                <div className="space-y-1">
                  {luckyDrops.length === 0 ? (
                    <p className="font-body text-[11px] text-gray-600 text-center py-2">No big wins yet — try your luck!</p>
                  ) : (
                    luckyDrops.slice(0, 5).map((drop, idx) => {
                      const rc = RARITY_COLORS[drop.rewardRarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                      return (
                        <motion.div key={drop.id}
                          initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg relative overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${rc}0A, transparent)`, border: `1px solid ${rc}15` }}
                        >
                          <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-r" style={{ background: rc, opacity: 0.3 }} />
                          <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${rc}15`, border: `1px solid ${rc}20`, boxShadow: `0 0 8px ${rc}10` }}>
                            {drop.rewardImage ? <img src={drop.rewardImage} alt="" className="w-6 h-6 object-contain" /> : <Sparkles size={16} style={{ color: rc, filter: `drop-shadow(0 0 3px ${rc})` }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-body text-xs text-white truncate">
                              <span className="font-ninja" style={{ color: rc }}>{drop.playerName}</span>
                            </p>
                            <p className="font-body text-[10px] text-gray-400 truncate">
                              won <span style={{ color: rc }}>{drop.rewardName}</span> from {drop.chestTier}
                            </p>
                          </div>
                          <span className="font-ninja text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                            style={{ color: rc, background: `${rc}12`, border: `1px solid ${rc}20`, boxShadow: `0 0 6px ${rc}08` }}>
                            {drop.rewardRarity?.toUpperCase()}
                          </span>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ PREVIEW PHASE — Big centered chest + rewards + open ═══ */}
      {phase === 'preview' && selectedChest && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 h-full flex flex-col items-center overflow-hidden px-6 py-3">
          {/* Back button — HUD styled */}
          <div className="w-full mb-1">
            <button onClick={() => { setPhase('pick'); setSelectedChest(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-ninja text-xs tracking-wider text-gray-400 hover:text-ninja-green transition-all relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.05), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.12)' }}>
              <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(57,255,20,0.3)', borderLeft: '1px solid rgba(57,255,20,0.3)' }} />
              <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(57,255,20,0.3)', borderRight: '1px solid rgba(57,255,20,0.3)' }} />
              <ChevronLeft size={14} /> BACK
            </button>
          </div>

          {/* Chest name */}
          <h2 className="font-ninja text-2xl tracking-[0.15em] mb-0.5" style={{ color: selectedChest.color, textShadow: `0 0 20px ${selectedChest.glowColor}` }}>
            {selectedChest.name.toUpperCase()}
          </h2>
          <p className="font-body text-xs text-gray-500 mb-1">{selectedChest.rewards.length} possible rewards</p>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-ninja text-xl flex items-center gap-1.5" style={{ color: selectedChest.color }}>
              <Coins size={18} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }} />
              {chestDiscount > 0 ? <><span className="line-through text-gray-600 text-sm">{selectedChest.cost}</span> {getDiscountedCost(selectedChest.cost)}</> : selectedChest.cost}
              <span className="text-gray-500 text-xs ml-1">tokens</span>
            </span>
          </div>

          {/* BIG chest image — with glow ring */}
          <div className="relative mb-2">
            <div className="absolute inset-[-50px] rounded-full pointer-events-none" style={{
              background: `radial-gradient(circle, ${selectedChest.color}15 0%, ${selectedChest.color}06 40%, transparent 65%)`,
            }} />
            <motion.img
              src={CHEST_IMAGES[selectedChest.id] || `/img/chest-${selectedChest.tier}.png`}
              alt={selectedChest.name}
              className="w-[280px] h-[280px] object-contain relative z-10"
              style={{ filter: `drop-shadow(0 0 50px ${selectedChest.glowColor})` }}
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Amount selector — HUD styled */}
          <div className="flex items-center justify-center gap-3 mb-3">
            {[1, 3, 5, 10].map(n => {
              const totalCost = getDiscountedCost(selectedChest.cost) * n;
              const canAfford = player.coins >= totalCost;
              const active = openCount === n;
              return (
                <motion.button key={n} whileHover={canAfford ? { scale: 1.05 } : {}} whileTap={canAfford ? { scale: 0.95 } : {}}
                  onClick={() => canAfford && setOpenCount(n)} disabled={!canAfford}
                  className={`relative px-5 py-3 rounded-lg font-ninja text-sm transition-all overflow-hidden ${!canAfford ? 'opacity-25' : ''}`}
                  style={{
                    background: active ? `linear-gradient(135deg, ${selectedChest.color}15, ${selectedChest.color}08)` : 'linear-gradient(135deg, rgba(255,255,255,0.02), transparent)',
                    border: `1.5px solid ${active ? `${selectedChest.color}50` : 'rgba(255,255,255,0.06)'}`,
                    color: active ? selectedChest.color : '#555',
                    boxShadow: active ? `0 0 18px ${selectedChest.color}15, inset 0 0 12px ${selectedChest.color}06` : 'none',
                  }}>
                  {active && <>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `2px solid ${selectedChest.color}`, borderLeft: `2px solid ${selectedChest.color}` }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `2px solid ${selectedChest.color}`, borderRight: `2px solid ${selectedChest.color}` }} />
                    <div className="absolute top-0 left-[20%] right-[20%] h-[2px]" style={{ background: selectedChest.color, boxShadow: `0 0 6px ${selectedChest.color}` }} />
                  </>}
                  <span className="text-lg relative z-10">x{n}</span>
                  <span className="block font-body text-[9px] text-gray-500 mt-0.5 relative z-10">{totalCost} <Coins size={8} className="inline" /></span>
                </motion.button>
              );
            })}
          </div>

          {/* Open button — HUD styled with glow */}
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!selectedChest) return;
              if (openCount === 1) openSingle(selectedChest);
              else openBulk(selectedChest, openCount);
            }}
            disabled={processing || player.coins < getDiscountedCost(selectedChest.cost) * openCount}
            className="relative px-16 py-3.5 rounded-xl font-ninja text-lg tracking-wider flex items-center justify-center gap-3 transition-all disabled:opacity-30 mb-4 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${selectedChest.color}, ${selectedChest.color}BB)`, color: '#000', boxShadow: `0 0 40px ${selectedChest.color}35, 0 4px 20px rgba(0,0,0,0.4)` }}>
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(0,0,0,0.3)', borderLeft: '2px solid rgba(0,0,0,0.3)' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,0,0,0.3)', borderRight: '2px solid rgba(0,0,0,0.3)' }} />
            {processing ? <span className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full" /> : <Package size={22} />}
            {processing ? 'OPENING...' : `OPEN ${openCount > 1 ? `${openCount}x ` : ''}${selectedChest.name.toUpperCase()}`}
          </motion.button>

          {/* REWARDS GRID — HUD framed */}
          <div className="w-full max-w-5xl relative rounded-xl overflow-hidden p-4" style={{
            background: `linear-gradient(135deg, ${selectedChest.color}04, #040608)`,
            border: `1px solid ${selectedChest.color}12`,
          }}>
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${selectedChest.color}40`, borderLeft: `2px solid ${selectedChest.color}40` }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${selectedChest.color}25`, borderRight: `2px solid ${selectedChest.color}25` }} />
            <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${selectedChest.color}30, transparent 50%)` }} />
            <div className="flex items-center justify-center gap-2 mb-3">
              <Eye size={14} style={{ color: selectedChest.color, filter: `drop-shadow(0 0 4px ${selectedChest.color})` }} />
              <span className="font-ninja text-xs tracking-wider" style={{ color: selectedChest.color, textShadow: `0 0 6px ${selectedChest.color}30` }}>POSSIBLE REWARDS</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              {selectedChest.rewards.map((r, idx) => {
                const rc = RARITY_COLORS[r.rarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                const pct = (r.dropRate * 100).toFixed(1);
                return (
                  <motion.div key={r.id}
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.04 }}
                    className="relative rounded-lg overflow-hidden flex-shrink-0"
                    style={{
                      width: 110,
                      background: `linear-gradient(170deg, ${rc}0C, #040608)`,
                      border: `1px solid ${rc}20`,
                    }}>
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: rc, boxShadow: `0 0 6px ${rc}40` }} />
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: `1px solid ${rc}60`, borderLeft: `1px solid ${rc}60` }} />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: `1px solid ${rc}30`, borderRight: `1px solid ${rc}30` }} />
                    <div className="flex items-center justify-center py-3 px-2" style={{ height: 75 }}>
                      {r.image ? (
                        <img src={r.image} alt="" className="w-12 h-12 object-contain" style={{ filter: `drop-shadow(0 0 8px ${rc})` }} />
                      ) : (
                        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${rc}12`, color: rc }}>
                          {getRewardIcon(r, 22)}
                        </div>
                      )}
                    </div>
                    <div className="text-center px-1.5 pb-2">
                      <p className="font-ninja text-[9px] text-white truncate">{r.name}</p>
                      <p className="font-body text-[8px] capitalize" style={{ color: rc }}>{r.rarity} · {pct}%</p>
                    </div>
                    <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${rc}60, transparent)` }} />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ SPINNING PHASE ═══ */}
      {phase === 'spinning' && selectedChest && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center" style={{ background: 'linear-gradient(180deg, rgba(3,5,8,0.98) 0%, rgba(4,7,14,0.98) 50%, rgba(3,5,8,0.98) 100%)' }}>
          {/* BG effects on spin screen */}
          <div className="absolute inset-0 pointer-events-none pcb-grid-fade" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(57,255,20,0.06) 0%, transparent 50%)' }} />
          <motion.p initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="font-ninja text-2xl mb-8 tracking-[0.2em] relative z-10" style={{ color: selectedChest.color, textShadow: `0 0 30px ${selectedChest.glowColor}` }}>
            {selectedChest.name.toUpperCase()}
          </motion.p>
          <div className="relative w-full max-w-[850px] z-10">
            {/* Center indicator */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center">
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent -mb-px" style={{ borderTopColor: '#39FF14', filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} />
              <div className="w-[2px] flex-1" style={{ background: '#39FF14', boxShadow: '0 0 10px rgba(57,255,20,0.8), 0 0 20px rgba(57,255,20,0.3)' }} />
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[12px] border-l-transparent border-r-transparent -mt-px" style={{ borderBottomColor: '#39FF14', filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} />
            </div>
            <div className="overflow-hidden h-[250px] relative rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(4,6,8,0.95), rgba(5,8,14,0.95))', border: '1px solid rgba(57,255,20,0.1)', boxShadow: '0 0 30px rgba(0,0,0,0.5), 0 0 60px rgba(57,255,20,0.03)' }}>
              {/* HUD corners on spin box */}
              <div className="absolute top-0 left-0 w-4 h-4 z-20 pointer-events-none" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 z-20 pointer-events-none" style={{ borderTop: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 z-20 pointer-events-none" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderLeft: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 z-20 pointer-events-none" style={{ borderBottom: '2px solid rgba(57,255,20,0.4)', borderRight: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] z-20 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), rgba(0,200,255,0.2), rgba(57,255,20,0.3))', boxShadow: '0 0 8px rgba(57,255,20,0.15)' }} />
              <div className="absolute bottom-0 left-0 right-0 h-[1px] z-20 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(0,200,255,0.2), rgba(57,255,20,0.15), rgba(0,200,255,0.2))' }} />
              <div className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, #030508, transparent)' }} />
              <div className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, #030508, transparent)' }} />
              <div className="flex items-stretch h-full" style={{ transform: `translateX(calc(50% - ${CARD_W/2}px - ${spinOffset}px))` }}>
                {spinItems.map((item, idx) => {
                  const isCenter = idx === activeCardIndex;
                  const rc = RARITY_COLORS[item.rarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                  return (
                    <div key={idx} className={`spin-card flex-shrink-0 ${isCenter ? 'active' : ''}`}
                      style={{ width: `${CARD_W}px`, height: '100%', '--spin-color': rc } as React.CSSProperties}>
                      <div className="spin-card-inner">
                        <div className="flex-1 flex items-center justify-center p-3">
                          {item.image ? <img src={item.image} alt="" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 0 10px ${rc})` }} />
                            : <div style={{ color: rc }}>{getRewardIcon(item, 44)}</div>}
                        </div>
                        <p className="font-body text-[11px] text-white text-center px-1 truncate w-full">{item.name}</p>
                        <div className="w-full h-[3px] mt-1" style={{ background: rc, boxShadow: isCenter ? `0 0 10px ${rc}` : 'none' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 0.8 }}
            onClick={skipSpin} className="relative mt-6 flex items-center gap-2 px-8 py-2.5 rounded-lg font-ninja text-sm text-gray-400 hover:text-ninja-green transition-all z-10 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.05), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.12)' }}>
            <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(57,255,20,0.3)', borderLeft: '1px solid rgba(57,255,20,0.3)' }} />
            <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(57,255,20,0.3)', borderRight: '1px solid rgba(57,255,20,0.3)' }} />
            <SkipForward size={14} /> SKIP
          </motion.button>
        </div>
      )}

      {/* ═══ SINGLE REVEAL PHASE ═══ */}
      {phase === 'reveal' && reward && selectedChest && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center cursor-pointer" style={{ background: 'linear-gradient(180deg, rgba(3,5,8,0.98) 0%, rgba(4,7,14,0.98) 50%, rgba(3,5,8,0.98) 100%)' }} onClick={reset}>
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            className="text-center flex flex-col items-center">
            {[...Array(20)].map((_, i) => (
              <motion.div key={i} initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: (Math.random()-0.5)*600, y: (Math.random()-0.5)*600, opacity: 0 }}
                transition={{ duration: 2, delay: i*0.03 }}
                className="absolute" style={{ left: '50%', top: '50%', color: RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg || '#fff' }}>
                <Sparkles size={16} />
              </motion.div>
            ))}
            <motion.div animate={{ borderColor: [`${(RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg || '#fff')}50`, RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg || '#fff', `${(RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg || '#fff')}50`] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="reveal-card" style={{ width: 280, height: 380, borderColor: RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg, '--reveal-color1': RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg, '--reveal-color2': '#fff' } as React.CSSProperties}>
              <div className="reveal-card-shadow" />
              <div className="reveal-card-content">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
                  {reward.image ? <img src={reward.image} alt="" className="w-28 h-28 object-contain" style={{ filter: `drop-shadow(0 0 25px ${RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg})` }} />
                    : <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: `${RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg}20`, color: RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg }}>{getRewardIcon(reward, 52)}</div>}
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                  className="font-body text-base flex items-center gap-1" style={{ color: RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg }}>
                  <Star size={14} fill={RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg} /> {reward.rarity.toUpperCase()} <Star size={14} fill={RARITY_COLORS[reward.rarity as keyof typeof RARITY_COLORS]?.bg} />
                </motion.p>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="font-ninja text-2xl text-white">{reward.name}</motion.p>
                {reward.type === 'coins' && reward.value && (
                  <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: 'spring' }}
                    className="font-ninja text-3xl text-yellow-400 flex items-center gap-2">+{reward.value} <Coins size={26} /></motion.p>
                )}
              </div>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 1.2 }}
              className="font-ninja text-gray-600 mt-6 text-xs tracking-wider" style={{ textShadow: '0 0 6px rgba(57,255,20,0.1)' }}>CLICK ANYWHERE TO CONTINUE</motion.p>
          </motion.div>
        </div>
      )}

      {/* ═══ BULK REVEAL PHASE ═══ */}
      {phase === 'bulk-reveal' && selectedChest && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center cursor-pointer" style={{ background: 'linear-gradient(180deg, rgba(3,5,8,0.98) 0%, rgba(4,7,14,0.98) 50%, rgba(3,5,8,0.98) 100%)' }} onClick={reset}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl px-6 text-center">
            <motion.h3 initial={{ y: -20 }} animate={{ y: 0 }}
              className="font-ninja text-2xl mb-3 tracking-wider" style={{ color: selectedChest.color }}>
              {bulkResults.length}x {selectedChest.name.toUpperCase()} OPENED!
            </motion.h3>

            <div className="flex gap-3 justify-center mb-5 flex-wrap">
              {(() => {
                const totalCoins = bulkResults.filter(r => r.type === 'coins').reduce((s, r) => s + (r.value || 0), 0);
                const skins = bulkResults.filter(r => r.type === 'skin').length;
                const rareUp = bulkResults.filter(r => ['rare','legendary','mythical','immortal'].includes(r.rarity)).length;
                return (
                  <>
                    {totalCoins > 0 && <div className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.03))', border: '1px solid rgba(234,179,8,0.2)' }}><div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(234,179,8,0.4)', borderLeft: '1px solid rgba(234,179,8,0.4)' }} /><Coins size={16} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }} /><span className="font-ninja text-base text-yellow-400" style={{ textShadow: '0 0 8px rgba(234,179,8,0.3)' }}>+{totalCoins}</span></div>}
                    {skins > 0 && <div className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(168,85,247,0.03))', border: '1px solid rgba(168,85,247,0.2)' }}><div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(168,85,247,0.4)', borderLeft: '1px solid rgba(168,85,247,0.4)' }} /><Star size={16} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.5))' }} /><span className="font-ninja text-base text-purple-400" style={{ textShadow: '0 0 8px rgba(168,85,247,0.3)' }}>{skins} skins</span></div>}
                    {rareUp > 0 && <div className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.1), rgba(57,255,20,0.03))', border: '1px solid rgba(57,255,20,0.2)' }}><div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(57,255,20,0.4)', borderLeft: '1px solid rgba(57,255,20,0.4)' }} /><Sparkles size={16} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }} /><span className="font-ninja text-base text-ninja-green" style={{ textShadow: '0 0 8px rgba(57,255,20,0.3)' }}>{rareUp} rare+</span></div>}
                  </>
                );
              })()}
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
              {bulkResults.map((r, idx) => {
                const rc = RARITY_COLORS[r.rarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                return (
                  <motion.div key={idx} initial={{ opacity: 0, scale: 0.7, rotateY: 180 }} animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    transition={{ delay: idx * 0.12, type: 'spring', stiffness: 200, damping: 18 }}
                    className="rounded-xl relative overflow-hidden"
                    style={{ width: 150, height: 200, background: `linear-gradient(170deg, ${rc}0C, #040608)`, border: `1px solid ${rc}25`, boxShadow: `0 0 20px ${rc}10` }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${rc}60`, borderLeft: `1px solid ${rc}60` }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1px solid ${rc}40`, borderRight: `1px solid ${rc}40` }} />
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${rc}, transparent)`, boxShadow: `0 0 8px ${rc}40` }} />
                    <div className="flex items-center justify-center pt-5 pb-2" style={{ height: 130 }}>
                      {r.image ? <img src={r.image} alt="" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 0 12px ${rc})` }} />
                        : <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${rc}15`, color: rc }}>{getRewardIcon(r, 32)}</div>}
                    </div>
                    <div className="text-center px-2">
                      <p className="font-ninja text-[11px] text-white truncate">{r.name}</p>
                      <p className="font-body text-[9px] capitalize" style={{ color: rc }}>{r.rarity}</p>
                      {r.type === 'coins' && r.value && (
                        <p className="font-ninja text-xs text-yellow-400 mt-0.5 flex items-center justify-center gap-0.5">+{r.value} <Coins size={9} /></p>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${rc}, transparent)` }} />
                  </motion.div>
                );
              })}
            </div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: bulkResults.length * 0.12 + 0.5 }}
              className="font-ninja text-gray-600 mt-6 text-xs tracking-wider" style={{ textShadow: '0 0 6px rgba(57,255,20,0.1)' }}>CLICK ANYWHERE TO CONTINUE</motion.p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
