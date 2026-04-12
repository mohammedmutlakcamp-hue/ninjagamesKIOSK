'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc, onSnapshot, updateDoc, collection, query,
  where, getDocs, orderBy, limit, increment, addDoc, arrayUnion,
} from 'firebase/firestore';
import { COINS_PER_MINUTE, NINJA_TYPES as NINJA_TYPES_CONST, CHESTS, CHEST_REWARDS } from '@/lib/constants';
import type { Chest, ChestReward } from '@/types';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { Lang, t } from '@/lib/translations';
import {
  Coins, Trophy, Package, User, ClipboardCheck, Users,
  LogOut, Timer, Gift, Star, Send, Loader2, X,
  ChevronRight, Home, MessageCircle, Menu, Monitor,
  Check, Crown, Medal, Flame, Zap, Bell, ShoppingBag, Swords,
  CreditCard, Gamepad2, UtensilsCrossed,
} from 'lucide-react';

// Parallel sub-screen components
import { ChatView } from './ChatView';
import { ReservePC } from './ReservePC';
import { InventoryView } from './InventoryView';
import { FriendsView } from './FriendsView';
// Import PC Kiosk tabs for mobile use
import { GamesTab } from '../kiosk/tabs/GamesTab';
import { TournamentTab } from '../kiosk/tabs/TournamentTab';
import { SoftwareTab } from '../kiosk/tabs/SoftwareTab';
import { FoodTab } from '../kiosk/tabs/FoodTab';
import { VIPTab } from '../kiosk/tabs/VIPTab';
import { StoreTab } from '../kiosk/tabs/StoreTab';
import { SupportBubble } from '../kiosk/SupportBubble';

// ─── Types ──────────────────────────────────────────────────
type Screen = 'home' | 'chests' | 'chat' | 'reserve' | 'inventory' | 'friends' | 'tasks' | 'leaderboard' | 'profile' | 'store' | 'games' | 'tournaments' | 'software' | 'vip' | 'food';

interface Props {
  player: any;
  lang: Lang;
  onLogout: () => void;
}

// ─── Ninja types for profile ────────────────────────────────
const NINJA_TYPES = [
  { id: 'neon',   label: 'Neon',   color: '#39FF14' },
  { id: 'fire',   label: 'Fire',   color: '#FF4500' },
  { id: 'ice',    label: 'Ice',    color: '#00BFFF' },
  { id: 'shadow', label: 'Shadow', color: '#8B00FF' },
  { id: 'cyber',  label: 'Cyber',  color: '#9B59B6' },
];

// ─── Chest tier config ──────────────────────────────────────
const CHEST_META: Record<string, { img: string; label: string; glow: string }> = {
  bronze:    { img: '/img/chest-bronze.png',     label: 'Bronze Chest',    glow: 'rgba(205,127,50,0.5)' },
  silver:    { img: '/img/chest-silver.png',     label: 'Silver Chest',    glow: 'rgba(192,192,192,0.5)' },
  gold:      { img: '/img/chest-gold.png',       label: 'Gold Chest',      glow: 'rgba(255,215,0,0.5)' },
  legendary: { img: '/img/chest-legendary.png',  label: 'Legendary Chest', glow: 'rgba(155,89,182,0.5)' },
  ninja:     { img: '/img/chest-ninja.png',      label: 'Ninja Chest',     glow: 'rgba(57,255,20,0.5)' },
};

// ─── Roulette rewards ───────────────────────────────────────
const ROULETTE_ITEMS = [
  { label: '10 Tokens',    icon: '\u{1FA99}', color: '#FFD700' },
  { label: '25 Tokens',    icon: '\u{1FA99}', color: '#FFD700' },
  { label: '50 Tokens',    icon: '\u{1FA99}', color: '#FFD700' },
  { label: '150 Tokens',   icon: '\u{1F4B0}', color: '#FF6F00' },
  { label: 'Free Drink',   icon: '\u{1F964}', color: '#1E88E5' },
  { label: 'Free Snack',   icon: '\u{1F36A}', color: '#8D6E63' },
  { label: '75 Min Play',  icon: '\u23F1\uFE0F', color: '#39FF14' },
  { label: 'Free Meal',    icon: '\u{1F354}', color: '#FF4500' },
  { label: '1h Free Play', icon: '\u{1F3AE}', color: '#A855F7' },
  { label: '500 Tokens',   icon: '\u{1F48E}', color: '#FFD700' },
];

// ─── Drawer menu items ──────────────────────────────────────
const ADMIN_USERS = ['مالبورو', 'zzzz'];

const DRAWER_ITEMS: { id: Screen; icon: typeof Monitor; label: string; color: string }[] = [
  // Core features
  { id: 'games',       icon: Gamepad2,       label: 'Games Library',     color: '#39FF14' },
  { id: 'store',       icon: ShoppingBag,    label: 'Store',             color: '#FF6F00' },
  { id: 'tournaments', icon: Trophy,         label: 'Tournaments',       color: '#FFD700' },

  // Social & Progress
  { id: 'friends',     icon: Users,          label: 'Friends',           color: '#3B82F6' },
  { id: 'leaderboard', icon: Trophy,         label: 'Leaderboard',       color: '#FFD700' },
  { id: 'tasks',       icon: ClipboardCheck, label: 'Daily Tasks',       color: '#39FF14' },

  // Management
  { id: 'inventory',   icon: Package,        label: 'Inventory',         color: '#A855F7' },
  { id: 'reserve',     icon: Monitor,        label: 'Reserve a PC',      color: '#39FF14' },
  { id: 'software',    icon: Monitor,        label: 'Software',          color: '#06B6D4' },
  { id: 'food',        icon: UtensilsCrossed, label: 'Food & Drinks',    color: '#F97316' },
  { id: 'vip',         icon: Crown,          label: 'VIP Benefits',      color: '#FFD700' },
  { id: 'profile',     icon: User,           label: 'Profile & Settings', color: '#FFFFFF' },
];

// ─── Animation variants ─────────────────────────────────────
const pageVariants = {
  initial:  { opacity: 0, y: 20, scale: 0.98 },
  animate:  { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
  exit:     { opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.2 } },
};

const staggerChildren = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

// ══════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════
export function MobileDashboard({ player, lang, onLogout }: Props) {
  // ─── Navigation state ───────────────────────────────────────
  const [screen, setScreen] = useState<Screen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previousScreen, setPreviousScreen] = useState<Screen>('home');

  // ─── Data state ─────────────────────────────────────────────
  const [livePlayer, setLivePlayer] = useState<any>(player);
  const [topPlayers, setTopPlayers] = useState<any[]>([]);
  const [leaderboardPlayers, setLeaderboardPlayers] = useState<any[]>([]);
  const [dailyTasks, setDailyTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  
  // Store state
  const [storeTab, setStoreTab] = useState<'skins' | 'time' | 'coins'>('skins');
  const [selectedSkin, setSelectedSkin] = useState<any>(null);
  const [buying, setBuying] = useState(false);

  // ─── Chest opening state ────────────────────────────────────
  const [openingChest, setOpeningChest] = useState<any>(null);
  const [chestPhase, setChestPhase] = useState<'shake' | 'spin' | 'reveal' | null>(null);
  const [instantOpen, setInstantOpen] = useState(false);
  const [bundleResults, setBundleResults] = useState<any[] | null>(null);
  const [revealedReward, setRevealedReward] = useState<any>(null);

  // ─── Profile state ──────────────────────────────────────────
  const [selectedNinja, setSelectedNinja] = useState(player.ninjaType || 'neon');
  const [savingNinja, setSavingNinja] = useState(false);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);

  // ─── Navigation helpers ─────────────────────────────────────
  const navigate = useCallback((to: Screen) => {
    setPreviousScreen(screen);
    setScreen(to);
    setDrawerOpen(false);
    if (contentRef.current) contentRef.current.scrollTop = 0;
    // Mark chat as read when opening
    if (to === 'chat' && player?.uid) {
      localStorage.setItem(`chat_last_open_${player.uid}`, String(Date.now()));
      setUnreadChatCount(0);
    }
  }, [screen, player?.uid]);

  const activeBottomTab = (() => {
    if (screen === 'home') return 'home';
    if (screen === 'chests') return 'chests';
    if (screen === 'chat') return 'chat';
    return 'more';
  })();

  // ─── Real-time player listener ──────────────────────────────
  useEffect(() => {
    if (!player?.uid) return;
    const unsub = onSnapshot(doc(db, 'players', player.uid), (snap) => {
      if (snap.exists()) setLivePlayer({ uid: player.uid, ...snap.data() });
    });
    return () => unsub();
  }, [player?.uid]);

  // ─── Top 5 leaderboard for home ────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'players'), orderBy('totalPlaytime', 'desc'), limit(5));
        const snap = await getDocs(q);
        setTopPlayers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      } catch {}
    })();
  }, []);

  // ─── Full leaderboard (top 20) ─────────────────────────────
  useEffect(() => {
    if (screen !== 'leaderboard') return;
    (async () => {
      try {
        const q = query(collection(db, 'players'), orderBy('totalPlaytime', 'desc'), limit(20));
        const snap = await getDocs(q);
        setLeaderboardPlayers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      } catch {}
    })();
  }, [screen]);

  // ─── Daily tasks listener ──────────────────────────────────
  useEffect(() => {
    if (screen !== 'tasks' || !player?.uid) return;
    setLoadingTasks(true);
    const unsub = onSnapshot(doc(db, 'dailyTasks', player.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDailyTasks(data.tasks || []);
      } else {
        setDailyTasks([]);
      }
      setLoadingTasks(false);
    });
    return () => unsub();
  }, [screen, player?.uid]);

  // ─── Set online status on mount ─────────────────────────────
  useEffect(() => {
    if (!player?.uid) return;
    // Mark player as online on mobile
    updateDoc(doc(db, 'players', player.uid), {
      isOnline: true,
      status: 'online',
      platform: 'mobile',
      lastSeen: Date.now(),
    }).catch(() => {});
    // On unmount, set offline
    return () => {
      updateDoc(doc(db, 'players', player.uid), {
        isOnline: false,
        status: 'offline',
        platform: null,
        lastSeen: Date.now(),
      }).catch(() => {});
    };
  }, [player?.uid]);

  // ─── Unread chat count (private messages since last chat open) ─
  useEffect(() => {
    if (!player?.uid) return;
    const lastChatOpen = parseInt(localStorage.getItem(`chat_last_open_${player.uid}`) || '0');
    const q = query(
      collection(db, 'messages'),
      where('channelId', '!=', 'public'),
      orderBy('channelId'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        // Count messages sent to me (my uid is in the channelId) that are newer than last open
        if (data.channelId?.includes(player.uid) && data.senderId !== player.uid && data.createdAt > lastChatOpen) {
          count++;
        }
      });
      setUnreadChatCount(count);
    });
    return () => unsub();
  }, [player?.uid]);

  // ─── Derived data ──────────────────────────────────────────
  const totalXP    = calculateTotalXP(livePlayer);
  const levelInfo  = getLevelInfo(totalXP);
  const coins      = livePlayer.coins ?? 0;
  const minutesLeft = Math.floor(coins / COINS_PER_MINUTE);
  const hoursLeft   = Math.floor(minutesLeft / 60);
  const minsLeft    = minutesLeft % 60;
  const ninjaColor  = NINJA_TYPES.find((n) => n.id === (livePlayer.ninjaType || 'neon'))?.color || '#39FF14';

  // Chest discount from level
  const chestDiscount = levelInfo.chestDiscount || 0;
  const getDiscountedCost = (cost: number) => Math.floor(cost * (1 - chestDiscount / 100));

  // Roll a reward from chest's reward pool
  function rollReward(chest: Chest): ChestReward {
    const pool = chest.rewards;
    const totalWeight = pool.reduce((sum, r) => sum + r.dropRate, 0);
    let roll = Math.random() * totalWeight;
    for (const reward of pool) {
      roll -= reward.dropRate;
      if (roll <= 0) return reward;
    }
    return pool[pool.length - 1];
  }

  // ─── Apply a single chest reward to player ─────────────────
  async function applyReward(won: ChestReward) {
    if (won.type === 'coins' && won.value) {
      try { await updateDoc(doc(db, 'players', player.uid), { coins: increment(won.value) }); } catch {}
    }
    if (won.type === 'voucher') {
      try {
        const inv = livePlayer.inventory || [];
        inv.push({ id: `${won.id}_${Date.now()}`, type: 'voucher', name: won.name, rarity: won.rarity, used: false, earnedAt: Date.now() });
        await updateDoc(doc(db, 'players', player.uid), { inventory: inv });
      } catch {}
    }
  }

  function rewardToDisplay(won: ChestReward) {
    return {
      label: won.name,
      icon: won.type === 'coins' ? '🪙' : won.type === 'voucher' ? '🎫' : '🎁',
      color: won.rarity === 'legendary' ? '#FF6F00' : won.rarity === 'mythical' ? '#E91E63' : won.rarity === 'immortal' ? '#FFD700' : won.rarity === 'rare' ? '#1E88E5' : won.rarity === 'uncommon' ? '#43A047' : '#666',
    };
  }

  // ─── Chest opening handler ─────────────────────────────────
  async function handleOpenChest(chest: Chest) {
    const cost = getDiscountedCost(chest.cost);
    if (coins < cost) return;

    // Deduct coins and track stat
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        coins: coins - cost,
        'stats.chestsOpened': increment(1),
      });
    } catch {}

    const won = rollReward(chest);

    if (instantOpen) {
      // Instant: skip animation, show result directly
      setOpeningChest(chest);
      setRevealedReward(rewardToDisplay(won));
      setChestPhase('reveal');
      await applyReward(won);
      return;
    }

    // Animated open
    setOpeningChest(chest);
    setRevealedReward(null);

    setChestPhase('shake');
    await new Promise((r) => setTimeout(r, 1000));

    setChestPhase('spin');
    await new Promise((r) => setTimeout(r, 2500));

    setRevealedReward(rewardToDisplay(won));
    setChestPhase('reveal');
    await applyReward(won);
  }

  // ─── Bundle: open 3 chests at once ─────────────────────────
  async function handleOpenBundle(chest: Chest) {
    const cost = getDiscountedCost(chest.cost) * 3;
    if (coins < cost) return;

    // Deduct total cost
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        coins: coins - cost,
        'stats.chestsOpened': increment(3),
      });
    } catch {}

    // Roll 3 rewards
    const rewards = [rollReward(chest), rollReward(chest), rollReward(chest)];
    const displays = rewards.map(rewardToDisplay);

    // Apply all rewards
    for (const won of rewards) await applyReward(won);

    setBundleResults(displays);
    setOpeningChest(chest);
    setChestPhase('reveal');
  }

  function closeChestOverlay() {
    setOpeningChest(null);
    setChestPhase(null);
    setRevealedReward(null);
    setBundleResults(null);
  }

  // ─── Task claim handler ────────────────────────────────────
  async function handleClaimTask(taskIndex: number) {
    const task = dailyTasks[taskIndex];
    if (!task || task.claimed) return;
    const updatedTasks = [...dailyTasks];
    updatedTasks[taskIndex] = { ...task, claimed: true };
    try {
      await updateDoc(doc(db, 'dailyTasks', player.uid), { tasks: updatedTasks });
      if (task.reward) {
        await updateDoc(doc(db, 'players', player.uid), { coins: coins + (task.reward || 0) });
      }
    } catch {}
  }

  // ─── Ninja type change ─────────────────────────────────────
  async function handleNinjaChange(ninjaId: string) {
    setSelectedNinja(ninjaId);
    setSavingNinja(true);
    try {
      await updateDoc(doc(db, 'players', player.uid), { ninjaType: ninjaId });
    } catch {}
    setSavingNinja(false);
  }

  // ══════════════════════════════════════════════════════════════
  //  HOME SCREEN
  // ══════════════════════════════════════════════════════════════
  function renderHome() {
    return (
      <motion.div
        className="flex flex-col items-center gap-5 px-4 pt-5 pb-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Player card */}
        <motion.div variants={fadeUp} className="w-full max-w-sm">
          <div className="relative bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 overflow-hidden">
            {/* Glow accent */}
            <div
              className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20"
              style={{ background: ninjaColor }}
            />

            <div className="flex items-center gap-4 relative z-10">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden border-[3px]"
                  style={{ borderColor: ninjaColor, boxShadow: `0 0 24px ${ninjaColor}33` }}
                >
                  <img
                    src={livePlayer.avatar || `/img/pfp-${livePlayer.ninjaType || 'neon'}.png`}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-ninja whitespace-nowrap"
                  style={{ background: levelInfo.color, color: '#000' }}
                >
                  LVL {levelInfo.level}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="font-ninja text-lg text-white truncate">{livePlayer.username}</h2>
                <p className="text-xs font-body mt-0.5" style={{ color: levelInfo.color }}>
                  {levelInfo.title}
                </p>

                {/* XP bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[9px] text-white/40 font-body mb-1">
                    <span>XP {levelInfo.currentXP.toLocaleString()}</span>
                    <span>{levelInfo.xpForNext.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${levelInfo.color}, ${ninjaColor})` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(levelInfo.progress * 100).toFixed(1)}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Coins & Time */}
        <motion.div variants={fadeUp} className="flex gap-3 w-full max-w-sm">
          <div className="flex-1 bg-white/[0.04] backdrop-blur-xl rounded-2xl p-4 text-center border border-white/[0.06]">
            <Coins className="w-5 h-5 mx-auto mb-1.5 text-yellow-400" />
            <p className="text-2xl font-ninja text-yellow-400">{coins.toLocaleString()}</p>
            <p className="text-[10px] text-white/40 font-body">{t(lang, 'coins') || 'tokens'}</p>
          </div>
          <div className="flex-1 bg-white/[0.04] backdrop-blur-xl rounded-2xl p-4 text-center border border-white/[0.06]">
            <Timer className="w-5 h-5 mx-auto mb-1.5 text-[#39FF14]" />
            <p className="text-2xl font-ninja text-[#39FF14]">
              {hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`}
            </p>
            <p className="text-[10px] text-white/40 font-body">{t(lang, 'time_left') || 'time left'}</p>
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={fadeUp} className="flex gap-3 w-full max-w-sm">
          {[
            { label: 'Open Chest', icon: Gift,           screen: 'chests' as Screen,  color: '#A855F7', bg: 'rgba(168,85,247,0.08)' },
            { label: 'Daily Tasks', icon: ClipboardCheck, screen: 'tasks' as Screen,   color: '#39FF14', bg: 'rgba(57,255,20,0.08)' },
            { label: 'Reserve PC', icon: Monitor,         screen: 'reserve' as Screen, color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.screen)}
              className="flex-1 flex flex-col items-center gap-2 py-3.5 rounded-2xl border border-white/[0.06] active:scale-95 transition-transform"
              style={{ background: action.bg }}
            >
              <action.icon className="w-5 h-5" style={{ color: action.color }} />
              <span className="text-[10px] text-white/70 font-body">{action.label}</span>
            </button>
          ))}
        </motion.div>

        {/* Slogan */}
        <motion.div variants={fadeUp} className="w-full max-w-sm text-center">
          <p className="font-ninja text-[10px] tracking-[0.3em]" style={{ color: '#39FF14', opacity: 0.5 }}>
            PLAY MORE, PAY LESS
          </p>
        </motion.div>

        {/* VIP Banner (shown if player has active VIP) */}
        {livePlayer.vip?.active && (
          <motion.div variants={fadeUp} className="w-full max-w-sm">
            <motion.div
              className="relative overflow-hidden rounded-2xl p-4 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.1))', border: '1px solid rgba(255,215,0,0.3)' }}
              animate={{ boxShadow: ['0 0 10px rgba(255,215,0,0.15)', '0 0 20px rgba(255,215,0,0.3)', '0 0 10px rgba(255,215,0,0.15)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Crown className="w-7 h-7 text-yellow-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-ninja text-sm text-yellow-400">VIP {livePlayer.vip.tier?.toUpperCase() || 'BASIC'}</p>
                <p className="text-[10px] text-white/50 font-body">
                  {livePlayer.vip.trialUsed ? '7-Day Trial Active' : 'VIP Active'}
                  {livePlayer.vip.expiresAt && ` · Expires ${new Date(livePlayer.vip.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="text-yellow-400/60 text-xs font-body">Perks Active</div>
            </motion.div>
          </motion.div>
        )}

        {/* Store Card */}
        <motion.div variants={fadeUp} className="w-full max-w-sm">
          <button
            onClick={() => navigate('store')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/[0.06] active:scale-95 transition-transform"
            style={{ background: 'rgba(255,111,0,0.06)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,111,0,0.12)' }}>
              <ShoppingBag className="w-5 h-5" style={{ color: '#FF6F00' }} />
            </div>
            <div className="flex-1 text-left">
              <p className="font-ninja text-sm text-white">NINJA STORE</p>
              <p className="font-body text-[10px] text-white/40">Skins, boosts & more</p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </button>
        </motion.div>

        {/* Mini leaderboard */}
        <motion.div variants={fadeUp} className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-ninja text-sm text-white/80 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-yellow-400" />
              {t(lang, 'top_players') || 'TOP PLAYERS'}
            </h3>
            <button
              onClick={() => navigate('leaderboard')}
              className="text-[10px] text-[#39FF14] font-ninja flex items-center gap-0.5 active:scale-95 transition-transform"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {topPlayers.map((p, i) => {
              const xp = calculateTotalXP(p);
              const info = getLevelInfo(xp);
              const isMe = p.uid === player.uid;
              const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
              return (
                <motion.div
                  key={p.uid}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    isMe
                      ? 'bg-[#39FF14]/[0.06] border-[#39FF14]/20'
                      : 'bg-white/[0.04] border-white/[0.06]'
                  }`}
                >
                  <span className="text-base w-6 text-center">{medals[i] || `#${i + 1}`}</span>
                  <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: info.color }}>
                    <img
                      src={p.avatar || `/img/pfp-${p.ninjaType || 'neon'}.png`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-body truncate">
                      {p.username} {isMe && <span className="text-[#39FF14] text-[10px]">(you)</span>}
                    </p>
                    <p className="text-[10px] font-body" style={{ color: info.color }}>
                      Lvl {info.level} &middot; {info.title}
                    </p>
                  </div>
                  <p className="text-xs text-white/40 font-body">{(p.totalPlaytime || 0).toLocaleString()}m</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  CHESTS SCREEN
  // ══════════════════════════════════════════════════════════════
  function renderChests() {
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="font-ninja text-lg text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#A855F7]" />
            {t(lang, 'chests') || 'Treasure Chests'}
          </h2>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
            <Coins className="w-3.5 h-3.5 text-yellow-400" />
            <span className="font-ninja text-sm text-yellow-400">{coins.toLocaleString()}</span>
          </div>
        </div>

        <p className="text-white/40 font-body text-xs -mt-2">
          Open chests to win tokens, vouchers, free play & more!
        </p>

        {chestDiscount > 0 && (
          <div className="px-3 py-2 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/20">
            <p className="text-[#39FF14] text-xs font-ninja">Level {levelInfo.level} Perk: {chestDiscount}% chest discount!</p>
          </div>
        )}

        <motion.div
          className="grid grid-cols-2 gap-3"
          variants={staggerChildren}
          initial="initial"
          animate="animate"
        >
          {CHESTS.map((chest) => {
            const meta = CHEST_META[chest.tier] || CHEST_META.bronze;
            const cost = getDiscountedCost(chest.cost);
            const canAfford = coins >= cost;
            return (
              <motion.div
                key={chest.id}
                variants={fadeUp}
                className="relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] p-4 flex flex-col items-center gap-3"
                style={{ opacity: canAfford ? 1 : 0.5 }}
              >
                {/* Glow */}
                <div
                  className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full blur-3xl opacity-30"
                  style={{ background: chest.glowColor }}
                />

                <div className="relative z-10 w-20 h-20 flex items-center justify-center"
                  style={{ filter: `drop-shadow(0 0 12px ${chest.glowColor})` }}>
                  <img src={meta.img} alt={chest.name} className="w-16 h-16 object-contain" />
                </div>

                <p className="font-ninja text-xs text-white relative z-10">{chest.name}</p>

                {chestDiscount > 0 && (
                  <p className="text-[10px] text-white/30 line-through font-body relative z-10">{chest.cost}</p>
                )}

                <button
                  onClick={() => canAfford ? handleOpenChest(chest) : undefined}
                  disabled={!canAfford}
                  className="w-full py-2.5 rounded-xl font-ninja text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform relative z-10 disabled:opacity-50"
                  style={{
                    background: canAfford ? `linear-gradient(135deg, ${chest.color}, ${chest.color}CC)` : 'rgba(255,255,255,0.05)',
                    color: canAfford ? '#000' : 'rgba(255,255,255,0.3)',
                    boxShadow: canAfford ? `0 0 16px ${chest.glowColor}` : 'none',
                  }}
                >
                  <Coins className="w-3 h-3" />
                  {cost}
                </button>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Instant open toggle */}
        <div className="flex items-center justify-between px-1">
          <span className="text-white/50 font-body text-xs">Instant Open (skip animation)</span>
          <button
            onClick={() => setInstantOpen(!instantOpen)}
            className={`w-11 h-6 rounded-full transition-all relative ${instantOpen ? 'bg-[#39FF14]' : 'bg-white/10'}`}
          >
            <motion.div
              className="w-5 h-5 rounded-full bg-white absolute top-0.5"
              animate={{ left: instantOpen ? 22 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {/* 3-Chest Bundle Deals */}
        <div className="mt-2">
          <h3 className="font-ninja text-sm text-white/80 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Bundle Deals — Open 3 at once!
          </h3>
          <div className="flex flex-col gap-3">
            {CHESTS.map((chest) => {
              const singleCost = getDiscountedCost(chest.cost);
              const bundleCost = singleCost * 3;
              const canAfford = coins >= bundleCost;
              const meta = CHEST_META[chest.tier] || CHEST_META.bronze;
              return (
                <motion.div
                  key={`bundle-${chest.id}`}
                  className="relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] p-3"
                  style={{ opacity: canAfford ? 1 : 0.5 }}
                >
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full blur-2xl opacity-20" style={{ background: chest.glowColor }} />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="flex -space-x-3">
                      {[0, 1, 2].map((i) => (
                        <img key={i} src={meta.img} alt="" className="w-10 h-10 object-contain" style={{ filter: `drop-shadow(0 0 6px ${chest.glowColor})` }} />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-ninja text-xs text-white">{chest.name} x3</p>
                      <p className="text-[10px] text-white/40 font-body">3 rewards at once</p>
                    </div>
                    <button
                      onClick={() => canAfford ? handleOpenBundle(chest) : undefined}
                      disabled={!canAfford}
                      className="px-4 py-2.5 rounded-xl font-ninja text-xs flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50"
                      style={{
                        background: canAfford ? `linear-gradient(135deg, ${chest.color}, ${chest.color}CC)` : 'rgba(255,255,255,0.05)',
                        color: canAfford ? '#000' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      <Coins className="w-3 h-3" />
                      {bundleCost}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  CHEST OPENING OVERLAY
  // ══════════════════════════════════════════════════════════════
  function renderChestOverlay() {
    if (!openingChest) return null;
    const meta = CHEST_META[openingChest.tier] || CHEST_META.bronze;

    return (
      <motion.div
        className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Particle effects during reveal */}
        {chestPhase === 'reveal' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: revealedReward?.color || '#FFD700',
                  left: '50%',
                  top: '50%',
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: (Math.random() - 0.5) * 400,
                  y: (Math.random() - 0.5) * 600,
                  opacity: 0,
                  scale: Math.random() * 2 + 0.5,
                }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: Math.random() * 0.3 }}
              />
            ))}
          </div>
        )}

        {/* Phase: Shake */}
        {chestPhase === 'shake' && (
          <motion.div
            className="w-32 h-32"
            animate={{
              rotate: [0, -8, 8, -8, 8, -5, 5, -3, 3, 0],
              scale: [1, 1.05, 1, 1.05, 1, 1.1, 1, 1.1, 1.15, 1.2],
            }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          >
            <img src={meta.img} alt="" className="w-full h-full object-contain drop-shadow-2xl" />
          </motion.div>
        )}

        {/* Phase: Roulette Spin */}
        {chestPhase === 'spin' && (
          <>
            <motion.div
              className="w-24 h-24 mb-8"
              initial={{ scale: 1.2, opacity: 0.8 }}
              animate={{ scale: 0.8, opacity: 0.4, y: -40 }}
              transition={{ duration: 0.5 }}
            >
              <img src={meta.img} alt="" className="w-full h-full object-contain" />
            </motion.div>

            {/* Roulette strip */}
            <div className="relative w-full max-w-xs h-24 overflow-hidden rounded-2xl bg-white/[0.04] border border-white/10">
              <motion.div
                className="flex gap-3 absolute top-0 left-0 h-full items-center px-3"
                animate={{ x: [0, -2800] }}
                transition={{ duration: 2.5, ease: [0.15, 0.85, 0.35, 1] }}
              >
                {Array.from({ length: 40 }).map((_, i) => {
                  const item = ROULETTE_ITEMS[i % ROULETTE_ITEMS.length];
                  return (
                    <div
                      key={i}
                      className="flex-shrink-0 w-20 h-20 rounded-xl flex flex-col items-center justify-center"
                      style={{ background: `${item.color}10`, border: `1px solid ${item.color}20` }}
                    >
                      <span className="text-3xl">{item.icon}</span>
                      <span className="text-[8px] text-white/60 mt-1 font-body">{item.label}</span>
                    </div>
                  );
                })}
              </motion.div>
              {/* Center indicator line */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-[#39FF14] z-10 shadow-[0_0_8px_rgba(57,255,20,0.6)]" />
              {/* Edge fades */}
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#0a0a0a] to-transparent z-10" />
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10" />
            </div>

            <motion.p
              className="mt-6 text-white/50 font-body text-sm"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              Spinning...
            </motion.p>
          </>
        )}

        {/* Phase: Reveal — single reward */}
        {chestPhase === 'reveal' && revealedReward && !bundleResults && (
          <motion.div
            className="flex flex-col items-center gap-5"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 200 }}
          >
            <motion.div
              className="w-28 h-28 rounded-full flex items-center justify-center text-6xl"
              style={{
                background: `${revealedReward.color}15`,
                boxShadow: `0 0 60px ${revealedReward.color}33, 0 0 120px ${revealedReward.color}15`,
              }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {revealedReward.icon}
            </motion.div>
            <p className="font-ninja text-lg text-white/80">{t(lang, 'you_got') || 'You got'}</p>
            <motion.p
              className="font-ninja text-3xl"
              style={{ color: revealedReward.color }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {revealedReward.label}
            </motion.p>
            <motion.button
              onClick={closeChestOverlay}
              className="mt-4 px-10 py-3.5 rounded-xl bg-[#39FF14] text-black font-ninja text-sm active:scale-95 transition-transform shadow-lg shadow-[#39FF14]/25"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              AWESOME!
            </motion.button>
          </motion.div>
        )}

        {/* Phase: Reveal — bundle (3 rewards) */}
        {chestPhase === 'reveal' && bundleResults && (
          <motion.div
            className="flex flex-col items-center gap-6 w-full max-w-xs"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 200 }}
          >
            <p className="font-ninja text-lg text-white/80">You got 3 rewards!</p>
            <div className="flex gap-3 w-full">
              {bundleResults.map((reward: any, i: number) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3 flex flex-col items-center gap-2"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.2 }}
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                    style={{ background: `${reward.color}15`, boxShadow: `0 0 20px ${reward.color}22` }}
                  >
                    {reward.icon}
                  </div>
                  <p className="font-ninja text-[10px] text-center" style={{ color: reward.color }}>
                    {reward.label}
                  </p>
                </motion.div>
              ))}
            </div>
            <motion.button
              onClick={closeChestOverlay}
              className="mt-2 px-10 py-3.5 rounded-xl bg-[#39FF14] text-black font-ninja text-sm active:scale-95 transition-transform shadow-lg shadow-[#39FF14]/25"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              AWESOME!
            </motion.button>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  TASKS SCREEN (inline)
  // ══════════════════════════════════════════════════════════════
  function renderTasks() {
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <h2 className="font-ninja text-lg text-white flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-[#39FF14]" />
          {t(lang, 'daily_tasks_title') || 'DAILY TASKS'}
        </h2>

        {loadingTasks ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#39FF14] animate-spin" />
          </div>
        ) : dailyTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center">
              <ClipboardCheck className="w-8 h-8 text-white/10" />
            </div>
            <p className="text-white/40 font-body text-sm">No tasks available</p>
            <p className="text-white/25 font-body text-xs">Check back tomorrow for new challenges!</p>
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-3"
            variants={staggerChildren}
            initial="initial"
            animate="animate"
          >
            {dailyTasks.map((task: any, i: number) => {
              const progress = Math.min((task.progress || 0) / (task.goal || 1), 1);
              const isComplete = progress >= 1;
              return (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className={`p-4 rounded-2xl border backdrop-blur-xl transition-colors ${
                    task.claimed
                      ? 'bg-white/[0.02] border-white/[0.04] opacity-50'
                      : isComplete
                      ? 'bg-[#39FF14]/[0.04] border-[#39FF14]/20'
                      : 'bg-white/[0.04] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-body">{task.name}</p>
                        {task.claimed && <Check className="w-3.5 h-3.5 text-[#39FF14]" />}
                      </div>
                      <p className="text-[10px] text-white/30 font-body mt-0.5">{task.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-yellow-400 text-xs font-ninja bg-yellow-500/10 px-2.5 py-1 rounded-full">
                      <Coins className="w-3 h-3" />
                      +{task.reward}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2.5">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: isComplete ? '#39FF14' : 'rgba(255,255,255,0.2)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-white/40 font-body">
                      {task.progress || 0} / {task.goal}
                    </p>
                    {task.claimed ? (
                      <span className="text-[10px] text-[#39FF14]/60 font-ninja flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t(lang, 'completed') || 'Claimed'}
                      </span>
                    ) : isComplete ? (
                      <button
                        onClick={() => handleClaimTask(i)}
                        className="px-5 py-1.5 rounded-xl bg-[#39FF14] text-black text-xs font-ninja active:scale-95 transition-transform shadow-lg shadow-[#39FF14]/20"
                      >
                        {t(lang, 'claim') || 'Claim'}
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  LEADERBOARD SCREEN (inline)
  // ══════════════════════════════════════════════════════════════
  function renderLeaderboard() {
    const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    const MedalIcons = [Crown, Medal, Medal];

    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <h2 className="font-ninja text-lg text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          {t(lang, 'leaderboard_title') || 'LEADERBOARD'}
        </h2>

        {/* Top 3 podium */}
        {leaderboardPlayers.length >= 3 && (
          <div className="flex items-end justify-center gap-3 pt-2 pb-4">
            {[1, 0, 2].map((rank) => {
              const p = leaderboardPlayers[rank];
              if (!p) return null;
              const xp = calculateTotalXP(p);
              const info = getLevelInfo(xp);
              const heights = ['h-28', 'h-20', 'h-16'];
              const sizes = ['w-16 h-16', 'w-12 h-12', 'w-12 h-12'];
              const idx = rank === 0 ? 0 : rank === 1 ? 1 : 2;
              return (
                <motion.div
                  key={p.uid}
                  className="flex flex-col items-center gap-1.5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * rank }}
                >
                  <div className="relative">
                    <div
                      className={`${sizes[idx]} rounded-full overflow-hidden border-2`}
                      style={{ borderColor: medalColors[rank] }}
                    >
                      <img
                        src={p.avatar || `/img/pfp-${p.ninjaType || 'neon'}.png`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-ninja"
                      style={{ background: medalColors[rank], color: '#000' }}
                    >
                      {rank + 1}
                    </div>
                  </div>
                  <p className="text-[11px] text-white font-body truncate max-w-[70px]">{p.username}</p>
                  <div
                    className={`${heights[idx]} w-16 rounded-t-xl flex items-center justify-center`}
                    style={{ background: `${medalColors[rank]}15`, borderTop: `2px solid ${medalColors[rank]}40` }}
                  >
                    <span className="text-[10px] font-ninja" style={{ color: medalColors[rank] }}>
                      {(p.totalPlaytime || 0).toLocaleString()}m
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div className="flex flex-col gap-2">
          {leaderboardPlayers.map((p, i) => {
            const xp = calculateTotalXP(p);
            const info = getLevelInfo(xp);
            const isMe = p.uid === player.uid;
            const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

            return (
              <motion.div
                key={p.uid}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                  isMe
                    ? 'bg-[#39FF14]/[0.06] border-[#39FF14]/20'
                    : 'bg-white/[0.04] border-white/[0.06]'
                }`}
              >
                <span className="text-sm w-7 text-center font-ninja" style={i < 3 ? { color: medalColors[i] } : { color: 'rgba(255,255,255,0.4)' }}>
                  {medals[i] || `#${i + 1}`}
                </span>
                <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: info.color }}>
                  <img
                    src={p.avatar || `/img/pfp-${p.ninjaType || 'neon'}.png`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-body truncate">
                    {p.username} {isMe && <span className="text-[#39FF14] text-[10px]">(you)</span>}
                  </p>
                  <p className="text-[10px] font-body" style={{ color: info.color }}>
                    Lvl {info.level} &middot; {info.title}
                  </p>
                </div>
                <p className="text-xs text-white/40 font-body">{(p.totalPlaytime || 0).toLocaleString()}m</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  PROFILE SCREEN (inline)
  // ══════════════════════════════════════════════════════════════
  function renderProfile() {
    const stats = livePlayer.stats || {};
    return (
      <motion.div
        className="flex flex-col items-center gap-5 px-4 pt-5 pb-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Avatar */}
        <motion.div variants={fadeUp} className="relative">
          <div
            className="w-28 h-28 rounded-full overflow-hidden border-[3px]"
            style={{ borderColor: ninjaColor, boxShadow: `0 0 40px ${ninjaColor}44` }}
          >
            <img
              src={livePlayer.avatar || `/img/pfp-${livePlayer.ninjaType || 'neon'}.png`}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold font-ninja whitespace-nowrap"
            style={{ background: levelInfo.color, color: '#000' }}
          >
            LVL {levelInfo.level}
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="text-center">
          <h2 className="font-ninja text-xl text-white">{livePlayer.username}</h2>
          <p className="text-xs font-body" style={{ color: levelInfo.color }}>
            {levelInfo.title} &middot; Level {levelInfo.level}
          </p>
          <p className="text-[10px] text-white/30 font-body mt-1">
            {totalXP.toLocaleString()} Total XP
          </p>
        </motion.div>

        {/* Stats grid */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 w-full max-w-sm">
          {[
            { label: t(lang, 'playtime') || 'Playtime',       value: `${(livePlayer.totalPlaytime || 0).toLocaleString()}m`,  icon: Timer,   color: '#39FF14' },
            { label: t(lang, 'coins') || 'Tokens',            value: coins.toLocaleString(),                                  icon: Coins,   color: '#FFD700' },
            { label: t(lang, 'chests_opened') || 'Chests',    value: String(stats.chestsOpened || 0),                          icon: Package, color: '#A855F7' },
            { label: t(lang, 'friends') || 'Friends',          value: String((livePlayer.friends || []).length),                icon: Users,   color: '#3B82F6' },
            { label: t(lang, 'wins') || 'Wins',               value: String(stats.totalWins || 0),                             icon: Trophy,  color: '#FF6F00' },
            { label: t(lang, 'games_played') || 'Games',      value: String(stats.gamesPlayed || 0),                           icon: Zap,     color: '#00BFFF' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06]"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${stat.color}12` }}
              >
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-sm text-white font-ninja">{stat.value}</p>
                <p className="text-[9px] text-white/35 font-body">{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Ninja type selector */}
        <motion.div variants={fadeUp} className="w-full max-w-sm">
          <p className="font-ninja text-xs text-white/50 mb-3">NINJA TYPE</p>
          <div className="grid grid-cols-5 gap-2">
            {NINJA_TYPES.map((ninja) => (
              <button
                key={ninja.id}
                onClick={() => handleNinjaChange(ninja.id)}
                disabled={savingNinja}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95 ${
                  selectedNinja === ninja.id
                    ? 'border-opacity-60'
                    : 'border-white/[0.06] bg-white/[0.04]'
                }`}
                style={
                  selectedNinja === ninja.id
                    ? { borderColor: ninja.color, background: `${ninja.color}15`, boxShadow: `0 0 16px ${ninja.color}22` }
                    : {}
                }
              >
                <div
                  className="w-8 h-8 rounded-full overflow-hidden border"
                  style={{ borderColor: selectedNinja === ninja.id ? ninja.color : 'rgba(255,255,255,0.1)' }}
                >
                  <img
                    src={`/img/pfp-${ninja.id}.png`}
                    alt={ninja.label}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span
                  className="text-[9px] font-ninja"
                  style={{ color: selectedNinja === ninja.id ? ninja.color : 'rgba(255,255,255,0.4)' }}
                >
                  {ninja.label}
                </span>
              </button>
            ))}
          </div>
          {savingNinja && (
            <p className="text-center mt-2 text-[10px] text-white/30 font-body">
              <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Saving...
            </p>
          )}
        </motion.div>

        {/* Notifications */}
        <motion.div variants={fadeUp} className="w-full max-w-sm">
          <p className="font-ninja text-xs text-white/50 mb-3">
            {lang === 'ar' ? 'الإشعارات' : 'NOTIFICATIONS'}
          </p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                const w = window as any;
                w.OneSignalDeferred = w.OneSignalDeferred || [];
                w.OneSignalDeferred.push(async function(OneSignal: any) {
                  try {
                    const perm = await OneSignal.Notifications.permission;
                    if (!perm) {
                      await OneSignal.Notifications.requestPermission();
                    } else {
                      alert(lang === 'ar' ? 'الإشعارات مفعلة بالفعل!' : 'Notifications are already enabled!');
                    }
                  } catch (err) {
                    console.error('Notification permission error:', err);
                  }
                });
              }
            }}
            className="w-full flex items-center gap-3.5 p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] active:scale-[0.97] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#39FF14]/10">
              <Bell className="w-5 h-5 text-[#39FF14]" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm text-white font-body">
                {lang === 'ar' ? 'تفعيل الإشعارات' : 'Enable Notifications'}
              </p>
              <p className="text-[10px] text-white/35 font-body">
                {lang === 'ar' ? 'استقبل إشعارات الرسائل والهدايا والأصدقاء' : 'Get alerts for messages, gifts & friends'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </button>
        </motion.div>

        {/* Logout */}
        <motion.button
          variants={fadeUp}
          onClick={onLogout}
          className="mt-4 flex items-center gap-2 px-8 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-ninja text-sm active:scale-95 transition-transform"
        >
          <LogOut className="w-4 h-4" />
          {t(lang, 'logout') || 'Logout'}
        </motion.button>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  STORE SCREEN
  // ══════════════════════════════════════════════════════════════
  function renderStore() {
    // Safety check - return loading if player data not ready
    if (!livePlayer || !livePlayer.uid) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-white/60">Loading marketplace...</div>
        </div>
      );
    }

    const NINJA_SKINS = [
      { id: 'neon', name: 'Neon Ninja', tier: 'free', price: 0, color: '#39FF14' },
      { id: 'fire', name: 'Fire Ninja', tier: 'rare', price: 150, color: '#FF4500' },
      { id: 'ice', name: 'Ice Ninja', tier: 'rare', price: 150, color: '#00BFFF' },
      { id: 'golden', name: 'Golden Ninja', tier: 'epic', price: 500, color: '#FFD700' },
      { id: 'dragon', name: 'Dragon Ninja', tier: 'legendary', price: 1200, color: '#FF2D00' },
    ];

    const TIME_PACKAGES = [
      { id: 'time_1h', label: '1 Hour', hours: 1, coins: 100 },
      { id: 'time_3h', label: '3 Hours', hours: 3, coins: 250 },
      { id: 'time_7h', label: '7 Hours', hours: 7, coins: 500 },
      { id: 'time_15h', label: '15 Hours', hours: 15, coins: 1000 },
    ];

    const JOD_PACKAGES = [
      { id: 'jod_1', jod: 1, coins: 100 },
      { id: 'jod_5', jod: 5, coins: 550 },
      { id: 'jod_10', jod: 10, coins: 1150 },
    ];

    const ownedNinjas = livePlayer.ownedNinjas || ['neon', 'shadow'];

    const buySkin = async (skin: any) => {
      if (buying || ownedNinjas.includes(skin.id) || livePlayer.coins < skin.price || !livePlayer.uid) return;
      setBuying(true);
      try {
        await updateDoc(doc(db, 'players', livePlayer.uid), {
          coins: increment(-skin.price),
          ownedNinjas: arrayUnion(skin.id),
        });
        setSelectedSkin(null);
      } catch (error) {
        console.error('Purchase failed:', error);
      }
      setBuying(false);
    };

    const buyTime = async (pkg: any) => {
      if (livePlayer.coins < pkg.coins || !livePlayer.uid) return;
      try {
        await updateDoc(doc(db, 'players', livePlayer.uid), {
          coins: increment(-pkg.coins),
          // Add time logic here
        });
      } catch (error) {
        console.error('Time purchase failed:', error);
      }
    };

    const requestTopup = async (pkg: any) => {
      if (!livePlayer.uid) return;
      try {
        await addDoc(collection(db, 'topup_requests'), {
          playerId: livePlayer.uid,
          playerName: livePlayer.username,
          packageId: pkg.id,
          coins: pkg.coins,
          jod: pkg.jod,
          status: 'pending',
          createdAt: Date.now(),
        });
      } catch (error) {
        console.error('Topup request failed:', error);
      }
    };

    return (
      <motion.div
        className="flex flex-col gap-5 px-4 pt-5 pb-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-ninja text-lg text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: '#FF6F00' }} />
            NINJA STORE
          </h2>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
            <Coins className="w-3.5 h-3.5 text-yellow-400" />
            <span className="font-ninja text-sm text-yellow-400">{coins.toLocaleString()}</span>
          </div>
        </div>

        {/* Store tabs */}
        <div className="flex gap-2">
          {[
            { id: 'skins', label: 'Skins', icon: Star, color: '#A855F7' },
            { id: 'time', label: 'Time', icon: Timer, color: '#39FF14' },
            { id: 'coins', label: 'Coins', icon: Coins, color: '#FFD700' },
          ].map((tab: any) => (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStoreTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl font-ninja text-xs transition-all"
              style={{
                background: storeTab === tab.id ? `${tab.color}15` : 'rgba(255,255,255,0.04)',
                color: storeTab === tab.id ? tab.color : '#888',
                border: `1px solid ${storeTab === tab.id ? `${tab.color}30` : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Store content */}
        <AnimatePresence mode="wait">
          {storeTab === 'skins' && (
            <motion.div
              key="skins"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-2 gap-3"
            >
              {NINJA_SKINS.map((skin) => {
                const owned = ownedNinjas.includes(skin.id);
                const canAfford = livePlayer.coins >= skin.price;
                return (
                  <motion.div
                    key={skin.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => !owned && setSelectedSkin(skin)}
                    className="rounded-2xl p-4 border cursor-pointer relative overflow-hidden"
                    style={{
                      background: owned ? `${skin.color}08` : 'rgba(255,255,255,0.04)',
                      borderColor: owned ? `${skin.color}30` : 'rgba(255,255,255,0.06)',
                      opacity: owned || canAfford ? 1 : 0.5,
                    }}
                  >
                    {owned && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                    
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full overflow-hidden border-2"
                      style={{ borderColor: skin.color }}>
                      <img
                        src={`/img/pfp-${skin.id}.png`}
                        alt={skin.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    
                    <h3 className="font-ninja text-sm text-center mb-2" style={{ color: skin.color }}>
                      {skin.name}
                    </h3>
                    
                    <div className="text-center">
                      {skin.tier === 'free' ? (
                        <span className="text-green-400 font-ninja text-xs">FREE</span>
                      ) : owned ? (
                        <span className="text-green-400 font-ninja text-xs">OWNED</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Coins size={12} className="text-yellow-400" />
                          <span className="font-ninja text-xs text-yellow-400">{skin.price}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {storeTab === 'time' && (
            <motion.div
              key="time"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {TIME_PACKAGES.map((pkg) => {
                const canAfford = livePlayer.coins >= pkg.coins;
                return (
                  <motion.div
                    key={pkg.id}
                    whileTap={canAfford ? { scale: 0.98 } : {}}
                    onClick={() => canAfford && buyTime(pkg)}
                    className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer"
                    style={{
                      background: canAfford ? 'rgba(57,255,20,0.06)' : 'rgba(255,255,255,0.02)',
                      borderColor: canAfford ? 'rgba(57,255,20,0.2)' : 'rgba(255,255,255,0.06)',
                      opacity: canAfford ? 1 : 0.5,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Timer size={20} className="text-green-400" />
                      </div>
                      <div>
                        <h3 className="font-ninja text-white">{pkg.label}</h3>
                        <p className="text-xs text-white/50">{pkg.hours * 60} minutes</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Coins size={16} className="text-yellow-400" />
                      <span className="font-ninja text-yellow-400">{pkg.coins}</span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {storeTab === 'coins' && (
            <motion.div
              key="coins"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <p className="text-white/50 text-sm text-center mb-4">
                Purchase coins with Jordanian Dinar (JOD)
              </p>
              
              {JOD_PACKAGES.map((pkg) => (
                <motion.div
                  key={pkg.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => requestTopup(pkg)}
                  className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer"
                  style={{
                    background: 'rgba(255,215,0,0.06)',
                    borderColor: 'rgba(255,215,0,0.2)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <CreditCard size={20} className="text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="font-ninja text-yellow-400">{pkg.jod} JOD</h3>
                      <p className="text-xs text-white/50">{pkg.coins} coins</p>
                    </div>
                  </div>
                  
                  <span className="font-ninja text-xs text-yellow-400">REQUEST</span>
                </motion.div>
              ))}
              
              <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-white/40">
                  Staff will process your request and collect payment in person.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skin purchase modal */}
        <AnimatePresence>
          {selectedSkin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
              onClick={() => setSelectedSkin(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl p-6 border bg-black/95"
                style={{ borderColor: `${selectedSkin.color}30` }}
              >
                <div className="text-center mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden border-4"
                    style={{ borderColor: selectedSkin.color }}>
                    <img
                      src={`/img/pfp-${selectedSkin.id}.png`}
                      alt={selectedSkin.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-ninja text-xl mb-2" style={{ color: selectedSkin.color }}>
                    {selectedSkin.name}
                  </h3>
                  <p className="text-white/50 text-sm capitalize">{selectedSkin.tier} Tier</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedSkin(null)}
                    className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-ninja"
                  >
                    CANCEL
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => buySkin(selectedSkin)}
                    disabled={buying || livePlayer.coins < selectedSkin.price}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-ninja disabled:opacity-50"
                    style={{
                      background: livePlayer.coins >= selectedSkin.price ? selectedSkin.color : '#333',
                      color: livePlayer.coins >= selectedSkin.price ? '#000' : '#666',
                    }}
                  >
                    {buying ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Coins size={16} />
                        BUY {selectedSkin.price}
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  SCREEN CONTENT ROUTER
  // ══════════════════════════════════════════════════════════════
  function renderScreen() {
    switch (screen) {
      case 'home':        return renderHome();
      case 'chests':      return renderChests();
      case 'chat':        return null; // Rendered as fixed overlay above
      case 'reserve':     return <ReservePC player={livePlayer} lang={lang} />;
      case 'inventory':   return <InventoryView player={livePlayer} lang={lang} />;
      case 'friends':     return <FriendsView player={livePlayer} lang={lang} onNavigateToChat={() => navigate('chat')} />;
      case 'tasks':       return renderTasks();
      case 'leaderboard': return renderLeaderboard();
      case 'profile':     return renderProfile();
      case 'store':       return renderStore();

      // New PC-equivalent features
      case 'games':       return <GamesTab player={livePlayer} lang={lang} onAddCredit={() => {}} onSendCoins={() => {}} onLogout={() => {}} />;
      case 'tournaments': return <TournamentTab player={livePlayer} />;
      case 'software':    return <SoftwareTab />;
      case 'food':        return <FoodTab player={livePlayer} />;
      case 'vip':         return <VIPTab player={livePlayer} />;
      
      default:            return renderHome();
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  DRAWER MENU
  // ══════════════════════════════════════════════════════════════
  function renderDrawer() {
    return (
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[50] bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />

            {/* Panel */}
            <motion.div
              className="fixed top-0 right-0 bottom-0 z-[51] w-[80%] max-w-[320px] bg-[#111111]/95 backdrop-blur-2xl border-l border-white/[0.06] flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Header: Player info */}
              <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3.5 mb-4">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden border-2 flex-shrink-0"
                    style={{ borderColor: ninjaColor, boxShadow: `0 0 20px ${ninjaColor}33` }}
                  >
                    <img
                      src={livePlayer.avatar || `/img/pfp-${livePlayer.ninjaType || 'neon'}.png`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-ninja text-base text-white truncate">{livePlayer.username}</h3>
                    <p className="text-xs font-body" style={{ color: levelInfo.color }}>
                      {levelInfo.title} &middot; Lvl {levelInfo.level}
                    </p>
                  </div>
                </div>

                {/* XP bar */}
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(levelInfo.progress * 100).toFixed(1)}%`,
                      background: `linear-gradient(90deg, ${levelInfo.color}, ${ninjaColor})`,
                    }}
                  />
                </div>
                <p className="text-[9px] text-white/30 font-body mt-1.5">
                  {levelInfo.currentXP.toLocaleString()} / {levelInfo.xpForNext.toLocaleString()} XP
                </p>
              </div>

              {/* Menu items */}
              <div className="flex-1 overflow-y-auto overscroll-contain py-3 px-3">
                {DRAWER_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = screen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl mb-1 transition-all active:scale-[0.97] ${
                        isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${item.color}12` }}
                      >
                        <Icon className="w-4.5 h-4.5" style={{ color: item.color }} />
                      </div>
                      <span className={`font-body text-sm ${isActive ? 'text-white' : 'text-white/70'}`}>
                        {item.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/20 ml-auto" />
                    </button>
                  );
                })}
              </div>

              {/* Admin + Logout at bottom */}
              <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] flex flex-col gap-1">
                {ADMIN_USERS.includes(livePlayer.username?.toLowerCase()) && (
                  <button
                    onClick={() => { setDrawerOpen(false); window.location.href = '/ghanimadmin'; }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all active:scale-[0.97] hover:bg-orange-500/[0.06]"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-500/10">
                      <Crown className="w-4.5 h-4.5 text-orange-400" />
                    </div>
                    <span className="font-body text-sm text-orange-400">Admin Panel</span>
                  </button>
                )}
                <button
                  onClick={() => { setDrawerOpen(false); onLogout(); }}
                  className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all active:scale-[0.97] hover:bg-red-500/[0.06]"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-500/10">
                    <LogOut className="w-4.5 h-4.5 text-red-400" />
                  </div>
                  <span className="font-body text-sm text-red-400">{t(lang, 'logout') || 'Logout'}</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  MAIN RETURN
  // ══════════════════════════════════════════════════════════════
  return (
    <div
      className="min-h-[100dvh] bg-[#0a0a0a] flex flex-col relative"
      style={{ WebkitOverflowScrolling: 'touch' } as any}
    >
      {/* ─── Top header ──────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/[0.06]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full overflow-hidden border"
            style={{ borderColor: ninjaColor }}
          >
            <img
              src={livePlayer.avatar || `/img/pfp-${livePlayer.ninjaType || 'neon'}.png`}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-ninja text-sm text-white truncate max-w-[140px]">{livePlayer.username}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
          <Coins className="w-3.5 h-3.5 text-yellow-400" />
          <span className="font-ninja text-sm text-yellow-400">{coins.toLocaleString()}</span>
        </div>
      </header>

      {/* ─── Content area ──────────────────────────────────── */}
      {screen === 'chat' ? (
        /* Chat gets its own fixed container between header and nav */
        <div
          className="fixed left-0 right-0 z-30"
          style={{
            top: 'calc(72px + env(safe-area-inset-top, 0px))',
            bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <ChatView player={livePlayer} lang={lang} />
        </div>
      ) : (
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 16px)',
            WebkitOverflowScrolling: 'touch',
          } as any}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </main>
      )}

      {/* ─── Bottom navigation bar ───────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-[#0a0a0a]/80 backdrop-blur-2xl border-t border-white/[0.06]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Home */}
        <button
          onClick={() => navigate('home')}
          className="flex flex-col items-center justify-center gap-0.5 w-16 h-14 transition-colors active:scale-95"
        >
          <Home
            className="w-5 h-5 transition-colors"
            style={{ color: activeBottomTab === 'home' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          />
          <span
            className="text-[9px] font-body transition-colors"
            style={{ color: activeBottomTab === 'home' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          >
            {t(lang, 'home_tab') || 'Home'}
          </span>
        </button>

        {/* Chests */}
        <button
          onClick={() => navigate('chests')}
          className="flex flex-col items-center justify-center gap-0.5 w-16 h-14 transition-colors active:scale-95"
        >
          <Gift
            className="w-5 h-5 transition-colors"
            style={{ color: activeBottomTab === 'chests' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          />
          <span
            className="text-[9px] font-body transition-colors"
            style={{ color: activeBottomTab === 'chests' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          >
            {t(lang, 'chests') || 'Chests'}
          </span>
        </button>

        {/* Chat */}
        <button
          onClick={() => navigate('chat')}
          className="flex flex-col items-center justify-center gap-0.5 w-16 h-14 transition-colors relative active:scale-95"
        >
          <div className="relative">
            <MessageCircle
              className="w-5 h-5 transition-colors"
              style={{ color: activeBottomTab === 'chat' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
            />
            {unreadChatCount > 0 && (
              <motion.div
                className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
              >
                <span className="text-[9px] text-white font-ninja">{unreadChatCount > 9 ? '9+' : unreadChatCount}</span>
              </motion.div>
            )}
          </div>
          <span
            className="text-[9px] font-body transition-colors"
            style={{ color: activeBottomTab === 'chat' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          >
            Chat
          </span>
        </button>

        {/* More (drawer toggle) */}
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="flex flex-col items-center justify-center gap-0.5 w-16 h-14 transition-colors active:scale-95"
        >
          <Menu
            className="w-5 h-5 transition-colors"
            style={{ color: activeBottomTab === 'more' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          />
          <span
            className="text-[9px] font-body transition-colors"
            style={{ color: activeBottomTab === 'more' ? '#39FF14' : 'rgba(255,255,255,0.35)' }}
          >
            More
          </span>
        </button>
      </nav>

      {/* ─── Drawer ──────────────────────────────────────────── */}
      {renderDrawer()}

      {/* ─── Support Chat Bubble ────────────────────────────── */}
      <SupportBubble player={livePlayer} isMobile />

      {/* ─── Chest opening overlay ───────────────────────────── */}
      <AnimatePresence>
        {openingChest && renderChestOverlay()}
      </AnimatePresence>
    </div>
  );
}
