'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, getDoc, setDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { trackDailyTask } from '@/lib/daily-tasks';
import {
  Coins, CheckCircle2, Sparkles, Calendar, Flame,
  LogIn, Package, Send, UtensilsCrossed, Gamepad2, Target, UserPlus,
  Loader2, ArrowRight, X, Gift, Lock, Instagram, Star, ExternalLink, AtSign, Heart,
  Camera, MessageCircle,
} from 'lucide-react';

export type DailyShortcutAction = 'food' | 'chests' | 'send-coins' | 'add-friend';

// Bonus awarded when every daily task is claimed.
const DAILY_FULL_BONUS_COINS = 5;

// Bonus awarded when the full 7-day streak is completed
const STREAK_COMPLETION_BONUS = 10;

// ==================== LOGIN STREAK REWARDS ====================
const STREAK_REWARDS = [
  { day: 1, coins: 1 },
  { day: 2, coins: 2 },
  { day: 3, coins: 3 },
  { day: 4, coins: 4 },
  { day: 5, coins: 5 },
  { day: 6, coins: 6 },
  { day: 7, coins: 7, chest: true },
];

// Simple free chest rewards (given on day 7)
const FREE_CHEST_REWARDS = [
  { name: '5 Tokens', value: 5, weight: 40 },
  { name: '10 Tokens', value: 10, weight: 30 },
  { name: '15 Tokens', value: 15, weight: 15 },
  { name: '20 Tokens', value: 20, weight: 10 },
  { name: '25 Tokens', value: 25, weight: 5 },
];

function pickFreeChestReward(): { name: string; value: number } {
  const totalWeight = FREE_CHEST_REWARDS.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const r of FREE_CHEST_REWARDS) {
    roll -= r.weight;
    if (roll <= 0) return { name: r.name, value: r.value };
  }
  return FREE_CHEST_REWARDS[0];
}

interface Props {
  player: any;
  onClose?: () => void;
  onShortcut?: (action: DailyShortcutAction) => void;
}

function getDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function getYesterdayKey(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return getDateKey(d);
}

interface DailyTask {
  id: string;
  title: string;          titleAr: string;
  description: string;    descriptionAr: string;
  icon: React.ReactNode; color: string; glowColor: string;
  target: number; reward: number;
  shortcut?: DailyShortcutAction;
  shortcutLabel?: string; shortcutLabelAr?: string;
}

const DAILY_TASKS: DailyTask[] = [
  { id: 'daily_login',    title: 'Check-in',                 titleAr: 'تسجيل الدخول',          description: 'Log in to the kiosk today',                                    descriptionAr: 'سجّل دخولك إلى الكشك اليوم',                                   icon: <CheckCircle2 size={32} />,    color: '#39FF14', glowColor: '57,255,20',   target: 1,  reward: 2 },
  { id: 'open_chest',     title: 'Open Chest',               titleAr: 'افتح صندوقاً',          description: 'Open any chest',                                              descriptionAr: 'افتح أي صندوق',                                                icon: <Package size={32} />,         color: '#FFB800', glowColor: '255,184,0',   target: 1,  reward: 3, shortcut: 'chests',     shortcutLabel: 'OPEN',  shortcutLabelAr: 'افتح'  },
  { id: 'send_coins',     title: 'Send Coins',               titleAr: 'أرسل العملات',          description: 'Send coins to a friend',                                      descriptionAr: 'أرسل عملات إلى صديق',                                          icon: <Send size={32} />,            color: '#E879F9', glowColor: '232,121,249', target: 1,  reward: 3, shortcut: 'send-coins', shortcutLabel: 'SEND',  shortcutLabelAr: 'أرسل' },
  { id: 'order_food',     title: 'Order from Food & Snacks', titleAr: 'اطلب من الطعام والوجبات', description: 'Place any order from the Food & Snacks menu',               descriptionAr: 'اطلب أي شيء من قائمة الطعام والوجبات',                          icon: <UtensilsCrossed size={32} />, color: '#F97316', glowColor: '249,115,22',  target: 1,  reward: 2, shortcut: 'food',       shortcutLabel: 'ORDER', shortcutLabelAr: 'اطلب' },
  { id: 'check_socials',  title: 'Check Our Socials',        titleAr: 'تابع حساباتنا',          description: 'Like 3 of our latest Instagram posts — admin will verify',    descriptionAr: 'أعجب بآخر 3 منشورات لنا على إنستغرام — يؤكد الموظف',           icon: <Instagram size={32} />,       color: '#E879F9', glowColor: '232,121,249', target: 1,  reward: 25 },
  { id: 'play_30_min',    title: 'Play 75 Min',              titleAr: 'العب 75 دقيقة',         description: 'Play for at least 75 minutes',                                descriptionAr: 'العب لمدة 75 دقيقة على الأقل',                                  icon: <Target size={32} />,          color: '#39FF14', glowColor: '57,255,20',   target: 75, reward: 10 },
];

// One-time / repeatable bonus tasks — manual admin verification.
// Stored on player.socialBonus.{id} = { requested, requestedAt, claimed, claimedAt }
// If repeatEveryDays is set, the "claimed" state expires after that many days.
interface SocialBonus {
  id: string;
  title: string;             titleAr: string;
  subtitle: string;          subtitleAr: string;
  icon: React.ReactNode; color: string; glow: string;
  reward: number;
  repeatEveryDays?: number; // if set, player can re-claim after X days; otherwise one-time
  steps: { icon: React.ReactNode; text: string; textAr: string }[];
  primaryUrl?: string;
  primaryUrlLabel?: string;  primaryUrlLabelAr?: string;
  highlightHandle?: string;
}

const SOCIAL_BONUS_TASKS: SocialBonus[] = [
  {
    id: 'check_socials_bonus',
    title: 'Check Our Socials',                  titleAr: 'تابع حساباتنا',
    subtitle: 'Like our 3 latest Instagram posts', subtitleAr: 'أعجب بآخر 3 منشورات لنا على إنستغرام',
    icon: <Instagram size={28} />, color: '#E879F9', glow: '232,121,249', reward: 10,
    repeatEveryDays: 10,
    primaryUrl: 'https://www.instagram.com/ininjagames',
    primaryUrlLabel: 'Open Instagram',           primaryUrlLabelAr: 'افتح إنستغرام',
    highlightHandle: '@ininjagames',
    steps: [
      { icon: <Heart size={14} />,        text: 'Like 3 of our most recent Instagram posts',                  textAr: 'أعجب بآخر 3 منشورات لنا على إنستغرام' },
      { icon: <Camera size={14} />,       text: 'Send a screenshot to admin OR show your phone at the desk', textAr: 'أرسل لقطة شاشة للموظف أو اعرض هاتفك عند الكاشير' },
      { icon: <CheckCircle2 size={14} />, text: 'Worker confirms — coins arrive instantly',                   textAr: 'يؤكد الموظف — تصلك العملات فوراً' },
    ],
  },
  {
    id: 'google_review',
    title: 'Leave Google Review',                titleAr: 'اترك تقييم على جوجل',
    subtitle: 'Rate us 5 stars on Google Maps',  subtitleAr: 'قيّمنا 5 نجوم على خرائط جوجل',
    icon: <Star size={28} />, color: '#FBBF24', glow: '251,191,36', reward: 10,
    repeatEveryDays: 10,
    primaryUrl: 'https://share.google/CW0iX87oFRlrr7Qn0',
    primaryUrlLabel: 'Open Google Review',       primaryUrlLabelAr: 'افتح تقييم جوجل',
    steps: [
      { icon: <Star size={14} />,           text: 'Open the Google review link',          textAr: 'افتح رابط تقييم جوجل' },
      { icon: <MessageCircle size={14} />,  text: 'Leave 5 stars and a short comment',    textAr: 'اترك 5 نجوم وتعليقاً قصيراً' },
      { icon: <Camera size={14} />,         text: 'Show the published review at the desk', textAr: 'اعرض التقييم المنشور عند الكاشير' },
    ],
  },
  {
    id: 'instagram_bio',
    title: 'Add Us to Your Bio',                 titleAr: 'أضفنا إلى سيرتك الذاتية',
    subtitle: 'Put @ininjagames in your Instagram bio', subtitleAr: 'ضع @ininjagames في سيرتك على إنستغرام',
    icon: <AtSign size={28} />, color: '#00BFFF', glow: '0,191,255', reward: 10,
    // no repeatEveryDays → one-time bonus
    primaryUrl: 'https://www.instagram.com/ininjagames',
    primaryUrlLabel: 'Open Instagram',           primaryUrlLabelAr: 'افتح إنستغرام',
    highlightHandle: '@ininjagames',
    steps: [
      { icon: <AtSign size={14} />,       text: 'Add @ininjagames to your Instagram bio',  textAr: 'أضف @ininjagames إلى سيرتك على إنستغرام' },
      { icon: <Camera size={14} />,       text: 'Show your bio to a worker at the desk',   textAr: 'اعرض سيرتك للموظف عند الكاشير' },
      { icon: <CheckCircle2 size={14} />, text: 'Worker confirms — bonus coins added',     textAr: 'يؤكد الموظف — تُضاف العملات الإضافية' },
    ],
  },
];

export function DailyTasksTab({ player, onClose, onShortcut }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [claiming, setClaimingId] = useState<string | null>(null);
  const [showReward, setShowReward] = useState<{ amount: number; x: number; y: number } | null>(null);
  const [taskProgress, setTaskProgress] = useState<Record<string, { progress: number; claimed: boolean }>>({});
  const [fullBonusClaimed, setFullBonusClaimed] = useState(false);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Streak reward state
  const [claimingStreak, setClaimingStreak] = useState(false);
  const [streakRewardClaimed, setStreakRewardClaimed] = useState(false);
  const [chestRevealed, setChestRevealed] = useState<{ name: string; value: number } | null>(null);
  // Social verification modal
  const [socialOpen, setSocialOpen] = useState<SocialBonus | null>(null);
  const [socialSubmitting, setSocialSubmitting] = useState(false);
  const [socialSubmitted, setSocialSubmitted] = useState<string>('');
  const [chestOpening, setChestOpening] = useState(false);
  const todayKey = getDateKey();
  const yesterdayKey = getYesterdayKey();
  const checkin = player?.dailyCheckin || {};
  const streak: number = checkin.streak || 0;

  // ESC safety net — closes the popup even if the parent handler misfires.
  useEscapeKey(() => onClose?.(), !!onClose);

  // Check if streak reward already claimed today
  useEffect(() => {
    const claimedDate = player?.dailyCheckin?.streakRewardClaimedDate || '';
    setStreakRewardClaimed(claimedDate === todayKey);
  }, [player?.dailyCheckin?.streakRewardClaimedDate, todayKey]);

  // Real-time listener — task progress updates the moment any other tab
  // calls trackDailyTask (chest opens, food orders, etc), so the CLAIM
  // button appears immediately instead of waiting for the next 30 s poll.
  useEffect(() => {
    if (!player?.uid) return;
    const docRef = doc(db, 'daily-tasks', `${player.uid}_${todayKey}`);
    let initialized = false;

    const unsub = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTaskProgress(data.tasks || {});
        setFullBonusClaimed(!!data.fullBonusClaimed);
        setLoaded(true);
        return;
      }
      // Doc doesn't exist yet — create it once with initial progress so the
      // listener has something to read on the next snapshot.
      if (initialized) return;
      initialized = true;
      const initial: Record<string, { progress: number; claimed: boolean }> = {};
      DAILY_TASKS.forEach(t => { initial[t.id] = { progress: t.id === 'daily_login' ? 1 : 0, claimed: false }; });
      try {
        await setDoc(docRef, { tasks: initial, date: todayKey, playerId: player.uid, fullBonusClaimed: false });
      } catch (err) {
        console.error('Daily tasks init failed', err);
      }
      setTaskProgress(initial);
      setFullBonusClaimed(false);
      setLoaded(true);
    }, (err) => console.error('Daily-tasks snapshot listener failed', err));

    return () => unsub();
  }, [player?.uid, todayKey]);

  // Player taps "Request verification" in the social-bonus popup.
  // Uses a STABLE doc id (player + bonus, no timestamp) so a player who
  // taps the button five times still only creates ONE pending request.
  // Stops the "admin sees the same popup 5 times" spam.
  const submitSocialRequest = async (bonus: SocialBonus) => {
    if (socialSubmitting || socialSubmitted === bonus.id) return;
    setSocialSubmitting(true);
    try {
      const reqRef = doc(db, 'social-verification-requests', `${player.uid}_${bonus.id}`);
      await setDoc(reqRef, {
        playerId: player.uid,
        playerName: player.username,
        bonusId: bonus.id,
        bonusTitle: bonus.title,
        reward: bonus.reward,
        status: 'pending',
        createdAt: Date.now(),
      });
      // Mark requested on player doc so UI stays in "PENDING" across reloads.
      // Also clear any expired `claimed`/`claimedAt` from a previous cycle so
      // the new request isn't mistaken for the old one.
      await updateDoc(doc(db, 'players', player.uid), {
        [`socialBonus.${bonus.id}.requested`]: true,
        [`socialBonus.${bonus.id}.requestedAt`]: Date.now(),
        [`socialBonus.${bonus.id}.claimed`]: false,
      }).catch(() => {});
      setSocialSubmitted(bonus.id);
    } catch (err) {
      console.error('Social request failed', err);
    }
    setSocialSubmitting(false);
  };

  const handleClaim = async (task: DailyTask, e: React.MouseEvent) => {
    if (claiming) return;
    const tp = taskProgress[task.id];
    if (!tp || tp.claimed || tp.progress < task.target) return;
    setClaimingId(task.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    try {
      const playerRef = doc(db, 'players', player.uid);
      const taskDocRef = doc(db, 'daily-tasks', `${player.uid}_${todayKey}`);
      const updatedTasks = { ...taskProgress, [task.id]: { ...tp, claimed: true } };
      const isVip = player.vip?.active && player.vip?.expiresAt > Date.now();
      const bonus = isVip ? VIP_CONFIG.dailyTaskBonusCoins : 0;
      await updateDoc(playerRef, { coins: increment(task.reward + bonus) });
      await updateDoc(taskDocRef, { tasks: updatedTasks });
      if (task.id === 'daily_login') {
        const lastClaim = checkin.lastClaimDate || '';
        const newStreak = lastClaim === yesterdayKey ? streak + 1 : 1;
        await updateDoc(playerRef, { 'dailyCheckin.lastClaimDate': todayKey, 'dailyCheckin.streak': newStreak });
      }
      setTaskProgress(updatedTasks);
      setShowReward({ amount: task.reward + bonus, x: rect.left + rect.width / 2, y: rect.top });
      setTimeout(() => setShowReward(null), 1500);
    } catch (err) { console.error('Task claim failed', err); }
    setClaimingId(null);
  };

  // ── Streak reward logic ──
  const checkinClaimed = taskProgress['daily_login']?.claimed === true;
  const currentStreak = streak; // live value from player doc
  const streakDay = currentStreak >= 1 ? ((currentStreak - 1) % 7) + 1 : 0;
  const streakCanClaim = checkinClaimed && streakDay >= 1 && !streakRewardClaimed;
  const todayStreakReward = streakDay >= 1 ? STREAK_REWARDS[streakDay - 1] : null;

  const handleClaimStreakReward = async (e: React.MouseEvent) => {
    if (claimingStreak || !streakCanClaim || !todayStreakReward) return;
    setClaimingStreak(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    try {
      const playerRef = doc(db, 'players', player.uid);
      let totalCoins = todayStreakReward.coins;

      // On day 7, also give the +10 streak completion bonus + a free chest reward
      if (todayStreakReward.chest) {
        totalCoins += STREAK_COMPLETION_BONUS;
        const chestDrop = pickFreeChestReward();
        totalCoins += chestDrop.value;
        setChestOpening(true);
        await new Promise(r => setTimeout(r, 800));
        setChestOpening(false);
        setChestRevealed(chestDrop);
      }

      await updateDoc(playerRef, {
        coins: increment(totalCoins),
        'dailyCheckin.streakRewardClaimedDate': todayKey,
      });
      setStreakRewardClaimed(true);
      setShowReward({ amount: totalCoins, x: rect.left + rect.width / 2, y: rect.top });
      setTimeout(() => setShowReward(null), 1500);
      // Auto-dismiss chest reveal after 3s
      if (todayStreakReward.chest) {
        setTimeout(() => setChestRevealed(null), 4000);
      }
    } catch (err) {
      console.error('Streak reward claim failed', err);
      setChestOpening(false);
    }
    setClaimingStreak(false);
  };

  const completedCount = DAILY_TASKS.filter(t => { const tp = taskProgress[t.id]; return tp && tp.progress >= t.target; }).length;
  const claimedCount = DAILY_TASKS.filter(t => taskProgress[t.id]?.claimed).length;
  const totalReward = DAILY_TASKS.reduce((sum, t) => sum + t.reward, 0);
  const allClaimed = loaded && claimedCount === DAILY_TASKS.length;

  const handleClaimFullBonus = async () => {
    if (claimingBonus || fullBonusClaimed || !allClaimed) return;
    setClaimingBonus(true);
    try {
      const playerRef = doc(db, 'players', player.uid);
      const taskDocRef = doc(db, 'daily-tasks', `${player.uid}_${todayKey}`);
      // Daily chest reward — only if 24h cooldown has elapsed
      const FREE_CHEST_COOLDOWN = 24 * 60 * 60 * 1000;
      const lastChest = player?.lastFreeChest || 0;
      const chestReady = Date.now() - lastChest >= FREE_CHEST_COOLDOWN;
      const updates: any = {
        coins: increment(DAILY_FULL_BONUS_COINS),
      };
      if (chestReady) {
        const chestItem = {
          id: `daily_chest_${Date.now()}`,
          type: 'chest',
          name: 'Daily Chest',
          rarity: 'rare',
          value: 0,
          chestTier: 'daily',
          obtainedAt: Date.now(),
          used: false,
          tradeable: true,
        };
        updates.lastFreeChest = Date.now();
        updates.inventory = arrayUnion(chestItem);
      }
      await updateDoc(playerRef, updates);
      await updateDoc(taskDocRef, { fullBonusClaimed: true });
      setFullBonusClaimed(true);
    } catch (err) {
      console.error('Full bonus claim failed', err);
    }
    setClaimingBonus(false);
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
        border: '1px solid rgba(57,255,20,0.15)',
        boxShadow: '0 0 30px rgba(57,255,20,0.05), inset 0 0 30px rgba(0,0,0,0.4)',
      }}
    >
      {/* ═══ Animated cyberpunk background — matches the right-panel sidebar ═══ */}
      {/* Breathing glow */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
      {/* PCB grid */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
        backgroundSize: '35px 35px',
      }} />
      {/* Hex pattern */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      {/* PCB traces (SVG) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 760 720" preserveAspectRatio="none">
        <path d="M0,60 L120,60 L150,40 L380,40 L410,60 L760,60" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.12" />
        <path d="M760,180 L560,180 L530,200 L220,200 L190,180 L0,180" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
        <path d="M0,340 L160,340 L190,320 L440,320 L470,340 L760,340" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
        <path d="M760,480 L580,480 L550,500 L240,500 L210,480 L0,480" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.07" />
        <path d="M0,600 L180,600 L210,580 L460,580 L490,600 L760,600" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.06" />
        {/* Verticals */}
        <path d="M380,0 L380,40 L350,60 L350,180" stroke="#39FF14" strokeWidth="0.7" fill="none" opacity="0.1" />
        <path d="M560,180 L560,320 L580,340 L580,480" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.07" />
        <path d="M220,340 L220,480 L210,500 L210,600" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.06" />
        {/* Nodes */}
        <circle cx="380" cy="40" r="3" fill="#39FF14" opacity="0.25" className="pcb-node-flash" />
        <circle cx="190" cy="200" r="2.5" fill="#00c8ff" opacity="0.2" className="pcb-node-flash2" />
        <circle cx="440" cy="320" r="2.5" fill="#39FF14" opacity="0.18" className="pcb-node-flash3" />
        <circle cx="240" cy="500" r="2" fill="#a855f7" opacity="0.15" className="pcb-node-flash" />
        <circle cx="460" cy="580" r="2" fill="#00c8ff" opacity="0.15" className="pcb-node-flash2" />
      </svg>
      {/* Data pulses (animated dots traveling along the traces) */}
      <div className="absolute top-[60px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 15px #39FF14' }} />
      <div className="absolute top-[340px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
      <div className="absolute top-[600px] left-0 w-3 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
      <div className="absolute top-0 left-[380px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
      <div className="absolute top-0 left-[560px] w-[2px] h-2 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
      {/* Scanlines sweeping top→bottom */}
      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(57,255,20,0.15)' }} />
      <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
      {/* Energy orbs */}
      <div className="absolute left-[12%] top-[18%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.4)' }} />
      <div className="absolute left-[70%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
      <div className="absolute left-[35%] top-[75%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3)' }} />
      {/* Radial glows */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.08) 0%, transparent 40%), radial-gradient(ellipse at 30% 40%, rgba(0,200,255,0.05) 0%, transparent 30%), radial-gradient(ellipse at 70% 70%, rgba(168,85,247,0.04) 0%, transparent 30%), radial-gradient(ellipse at 50% 95%, rgba(57,255,20,0.06) 0%, transparent 40%)',
      }} />
      {/* Top neon edge */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 12px rgba(57,255,20,0.3)' }} />
      {/* Left neon edge */}
      <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />
      {/* Right neon edge */}
      <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)' }} />

      {/* Close button (top-right, only when rendered as standalone popup) */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[100] w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-ninja-green transition-all hover:rotate-90"
          style={{ background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 0 10px rgba(57,255,20,0.05)' }}
        >
          <X size={22} />
        </button>
      )}

      <div className="relative z-10 px-5 pt-5 pb-16">
        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <motion.h1 initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              className="font-ninja text-5xl tracking-wider mb-2"
              style={{ color: '#39FF14', textShadow: '0 0 30px rgba(57,255,20,0.3), 0 0 60px rgba(57,255,20,0.1)' }}>
              {ar ? 'المهام اليومية' : 'DAILY TASKS'}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="font-body text-gray-500 text-sm">
              {ar ? 'أنجز كل المهام لفتح عملات إضافية + صندوقك اليومي المجاني' : 'Finish ALL tasks to unlock bonus coins + your FREE DAILY CHEST'}
            </motion.p>
          </div>

          {/* Streak Badge - Hexagonal (offset so the close button doesn't overlap it) */}
          <motion.div initial={{ opacity: 0, scale: 0, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 120 }}
            className="mr-16">
            <div className="relative w-20 h-20">
              {/* Hex shape */}
              <div className="absolute inset-0 flex items-center justify-center"
                style={{
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                  background: 'linear-gradient(180deg, rgba(249,115,22,0.25), rgba(220,80,10,0.15))',
                  boxShadow: '0 0 30px rgba(249,115,22,0.3)',
                }}>
                <div className="absolute inset-[2px] flex flex-col items-center justify-center"
                  style={{
                    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                    background: 'linear-gradient(180deg, #1a0f00, #0d0800)',
                  }}>
                  <Flame size={18} className="text-orange-400 mb-0.5" style={{ filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.8))' }} />
                  <span className="font-ninja text-2xl text-orange-400" style={{ textShadow: '0 0 10px rgba(249,115,22,0.6)' }}>{streak || 1}</span>
                </div>
              </div>
              {/* STREAK label */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="font-ninja text-[8px] tracking-[0.25em] text-orange-300 px-2 py-0.5 rounded"
                  style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.3)' }}>
                  {ar ? 'سلسلة' : 'STREAK'}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ═══ LOGIN STREAK REWARDS (TOP) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-5 relative"
          style={{
            background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(0,15,25,0.6))',
            border: '2px solid rgba(249,115,22,0.25)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
        >
          {/* HUD corners - orange */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
            <div key={i} className={`absolute ${pos} w-6 h-6`} style={{
              ...(pos.includes('top') ? { borderTop: '3px solid #F97316' } : { borderBottom: '3px solid #F97316' }),
              ...(pos.includes('left') ? { borderLeft: '3px solid #F97316' } : { borderRight: '3px solid #F97316' }),
            }} />
          ))}

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-orange-400" style={{ filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.8))' }} />
              <span className="font-ninja text-base text-orange-300 tracking-wider">
                {ar ? `سلسلة الدخول — اليوم ${streakDay || 1}/7` : `LOGIN STREAK — DAY ${streakDay || 1}/7`}
              </span>
            </div>
            {!checkinClaimed && (
              <span className="font-body text-xs text-gray-500">{ar ? 'استلم تسجيل الدخول أولاً' : 'Claim check-in first'}</span>
            )}
          </div>

          {/* 7-day strip + bonus */}
          <div className="flex items-center gap-2">
            {STREAK_REWARDS.map((sr, i) => {
              const isPast = streakDay > sr.day || (streakDay === sr.day && streakRewardClaimed);
              const isCurrent = streakDay === sr.day && !streakRewardClaimed;
              const isFuture = streakDay < sr.day || streakDay === 0;
              const isDay7 = sr.day === 7;

              return (
                <motion.div
                  key={sr.day}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="flex-1 relative"
                >
                  <div
                    className={`relative rounded-lg flex flex-col items-center justify-center py-2.5 px-1 transition-all ${
                      isCurrent && checkinClaimed ? 'cursor-pointer' : ''
                    }`}
                    onClick={isCurrent && checkinClaimed ? handleClaimStreakReward : undefined}
                    style={{
                      background: isPast
                        ? 'linear-gradient(180deg, rgba(57,255,20,0.12), rgba(57,255,20,0.04))'
                        : isCurrent
                        ? 'linear-gradient(180deg, rgba(249,115,22,0.2), rgba(249,115,22,0.06))'
                        : 'rgba(255,255,255,0.02)',
                      border: isPast
                        ? '1.5px solid rgba(57,255,20,0.4)'
                        : isCurrent
                        ? `2px solid rgba(249,115,22,${checkinClaimed ? '0.8' : '0.3'})`
                        : '1.5px solid rgba(255,255,255,0.08)',
                      boxShadow: isCurrent && checkinClaimed
                        ? '0 0 15px rgba(249,115,22,0.3), inset 0 0 10px rgba(249,115,22,0.1)'
                        : isPast
                        ? '0 0 8px rgba(57,255,20,0.1)'
                        : 'none',
                    }}
                  >
                    {/* Pulse animation on claimable day */}
                    {isCurrent && checkinClaimed && (
                      <motion.div
                        className="absolute inset-0 rounded-lg pointer-events-none"
                        style={{ border: '2px solid rgba(249,115,22,0.5)' }}
                        animate={{ opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}

                    {/* Day label */}
                    <span className="font-ninja text-[10px] tracking-wider mb-1" style={{
                      color: isPast ? '#39FF14' : isCurrent ? '#F97316' : '#555',
                    }}>
                      D{sr.day}
                    </span>

                    {/* Icon / Status */}
                    {isPast ? (
                      <CheckCircle2 size={20} style={{ color: '#39FF14', filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                    ) : isCurrent ? (
                      isDay7 ? (
                        <Gift size={20} style={{ color: checkinClaimed ? '#F97316' : '#555', filter: checkinClaimed ? 'drop-shadow(0 0 6px rgba(249,115,22,0.6))' : 'none' }} />
                      ) : (
                        <Coins size={20} style={{ color: checkinClaimed ? '#F97316' : '#555', filter: checkinClaimed ? 'drop-shadow(0 0 4px rgba(249,115,22,0.5))' : 'none' }} />
                      )
                    ) : (
                      <Lock size={16} style={{ color: '#333' }} />
                    )}

                    {/* Reward amount */}
                    <span className="font-ninja text-sm mt-1" style={{
                      color: isPast ? '#39FF14' : isCurrent ? (checkinClaimed ? '#FFD700' : '#555') : '#333',
                      textShadow: isPast ? '0 0 6px rgba(57,255,20,0.4)' : isCurrent && checkinClaimed ? '0 0 6px rgba(255,215,0,0.4)' : 'none',
                    }}>
                      +{sr.coins}
                    </span>
                  </div>

                  {/* Connector line between days */}
                  {i < 6 && (
                    <div className="absolute top-1/2 -right-1.5 w-2 h-[2px]" style={{
                      background: isPast && (streakDay > sr.day + 1 || (streakDay === sr.day + 1 && streakRewardClaimed))
                        ? '#39FF14'
                        : 'rgba(255,255,255,0.08)',
                    }} />
                  )}
                </motion.div>
              );
            })}

            {/* ── +10 BONUS card after day 7 ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="flex-1 relative"
            >
              {(() => {
                const allStreakDone = streakDay === 7 && streakRewardClaimed;
                return (
                  <div
                    className="relative rounded-lg flex flex-col items-center justify-center py-2.5 px-1 transition-all"
                    style={{
                      background: allStreakDone
                        ? 'linear-gradient(180deg, rgba(255,215,0,0.18), rgba(255,215,0,0.06))'
                        : 'rgba(255,255,255,0.02)',
                      border: allStreakDone
                        ? '2px solid rgba(255,215,0,0.6)'
                        : '1.5px solid rgba(255,255,255,0.08)',
                      boxShadow: allStreakDone
                        ? '0 0 18px rgba(255,215,0,0.25), inset 0 0 12px rgba(255,215,0,0.08)'
                        : 'none',
                    }}
                  >
                    {/* Shimmer on bonus when unlocked */}
                    {allStreakDone && (
                      <motion.div
                        className="absolute inset-0 rounded-lg pointer-events-none overflow-hidden"
                        style={{ border: '2px solid rgba(255,215,0,0.5)' }}
                        animate={{ opacity: [0.3, 0.9, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                    <span className="font-ninja text-[9px] tracking-wider mb-1" style={{
                      color: allStreakDone ? '#FFD700' : '#333',
                    }}>
                      BONUS
                    </span>
                    <Sparkles size={20} style={{
                      color: allStreakDone ? '#FFD700' : '#333',
                      filter: allStreakDone ? 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' : 'none',
                    }} />
                    <span className="font-ninja text-sm mt-1" style={{
                      color: allStreakDone ? '#FFD700' : '#333',
                      textShadow: allStreakDone ? '0 0 8px rgba(255,215,0,0.5)' : 'none',
                    }}>
                      +{STREAK_COMPLETION_BONUS}
                    </span>
                  </div>
                );
              })()}
            </motion.div>
          </div>

          {/* Claim button row — only when current day is claimable */}
          {streakCanClaim && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center justify-center"
            >
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(249,115,22,0.5)' }}
                whileTap={{ scale: 0.92 }}
                onClick={handleClaimStreakReward}
                disabled={claimingStreak}
                className="px-6 py-2 rounded-lg font-ninja text-sm tracking-wider text-black flex items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #F97316, #FB923C)',
                  boxShadow: '0 0 14px rgba(249,115,22,0.4)',
                }}
              >
                {claimingStreak ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : chestOpening ? (
                  <>
                    <Package size={14} className="animate-bounce" /> OPENING...
                  </>
                ) : (
                  <>
                    <Flame size={14} /> CLAIM DAY {streakDay} {todayStreakReward?.chest ? '+ CHEST' : ''}
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* Streak reward already claimed today */}
          {streakRewardClaimed && checkinClaimed && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="font-body text-xs text-gray-500">Day {streakDay} reward claimed — come back tomorrow!</span>
            </div>
          )}
        </motion.div>

        {/* ═══ FREE CHEST REVEAL (Day 7) ═══ */}
        <AnimatePresence>
          {chestRevealed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="mb-5 relative rounded-xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(255,215,0,0.1))',
                border: '2px solid rgba(255,215,0,0.5)',
                boxShadow: '0 0 30px rgba(255,215,0,0.2)',
                padding: '20px',
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, -5, 5, -3, 3, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.6 }}
                >
                  <Gift size={40} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.8))' }} />
                </motion.div>
                <span className="font-ninja text-2xl text-yellow-400 tracking-wider" style={{ textShadow: '0 0 15px rgba(255,215,0,0.5)' }}>
                  STREAK CHEST OPENED!
                </span>
                <div className="flex items-center gap-2">
                  <Coins size={22} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.6))' }} />
                  <span className="font-ninja text-3xl text-yellow-400" style={{ textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>
                    {chestRevealed.name}
                  </span>
                </div>
                <span className="font-body text-xs text-gray-400">{ar ? 'مكافأة إضافية على سلسلة 7 أيام!' : 'Bonus reward for 7-day streak!'}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ PROGRESS BAR ═══ */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="mb-5 relative"
          style={{
            background: 'linear-gradient(135deg, rgba(0,20,30,0.8), rgba(0,15,25,0.6))',
            border: '2px solid rgba(0,200,255,0.25)',
            borderRadius: '12px',
            padding: '16px 20px',
          }}>
          {/* HUD corners - thick cyan */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
            <div key={i} className={`absolute ${pos} w-6 h-6`} style={{
              ...(pos.includes('top') ? { borderTop: '3px solid #00c8ff' } : { borderBottom: '3px solid #00c8ff' }),
              ...(pos.includes('left') ? { borderLeft: '3px solid #00c8ff' } : { borderRight: '3px solid #00c8ff' }),
            }} />
          ))}

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-cyan-400" />
              <span className="font-ninja text-base text-cyan-300 tracking-wider">
                {completedCount}/{DAILY_TASKS.length} TASKS DONE
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Coins size={16} className="text-yellow-400" />
              <span className="font-ninja text-base text-yellow-400">+{totalReward} TOTAL COINS</span>
            </div>
          </div>

          {/* Dashed segmented progress bar */}
          <div className="h-4 rounded-full overflow-hidden relative" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,200,255,0.15)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / DAILY_TASKS.length) * 100}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full relative overflow-hidden"
              style={{
                background: 'linear-gradient(90deg, #39FF14, #00d4ff, #3B82F6)',
                boxShadow: '0 0 12px rgba(57,255,20,0.5), 0 0 25px rgba(0,200,255,0.3)',
              }}>
              {/* Dashed overlay pattern */}
              <div className="absolute inset-0" style={{
                backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(0,0,0,0.3) 8px, rgba(0,0,0,0.3) 10px)',
              }} />
            </motion.div>
          </div>
          {/* Small indicator dots */}
          <div className="flex justify-center gap-1.5 mt-2">
            {DAILY_TASKS.map((t) => {
              const done = taskProgress[t.id] && taskProgress[t.id].progress >= t.target;
              return <div key={t.id} className="w-2 h-2 rounded-full transition-all" style={{ background: done ? '#39FF14' : 'rgba(255,255,255,0.1)', boxShadow: done ? '0 0 6px rgba(57,255,20,0.6)' : 'none' }} />;
            })}
          </div>
        </motion.div>

        {/* ═══ TASK CARDS ═══ */}
        <div className="space-y-2">
          {DAILY_TASKS.map((task, i) => {
            const tp = taskProgress[task.id] || { progress: 0, claimed: false };
            const isComplete = tp.progress >= task.target;
            const isClaimed = tp.claimed;
            const progressPercent = Math.min(100, (tp.progress / task.target) * 100);

            return (
              <motion.div key={task.id}
                initial={{ opacity: 0, x: -40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 90 }}
                className="relative"
                style={{ opacity: isClaimed ? 0.55 : 1 }}>

                {/* Card with thick colored border */}
                <div className="relative rounded-xl overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, rgba(${task.glowColor},0.06) 0%, rgba(${task.glowColor},0.02) 50%, rgba(0,0,0,0.4) 100%)`,
                    border: `2px solid rgba(${task.glowColor},${isClaimed ? '0.15' : isComplete ? '0.6' : '0.3'})`,
                    boxShadow: isComplete && !isClaimed
                      ? `0 0 20px rgba(${task.glowColor},0.2), inset 0 0 30px rgba(${task.glowColor},0.05)`
                      : `inset 0 0 20px rgba(${task.glowColor},0.03)`,
                  }}>

                  {/* HUD corner brackets - task colored */}
                  {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                    <div key={ci} className={`absolute ${pos} w-5 h-5 z-10`} style={{
                      ...(pos.includes('top') ? { borderTop: `2px solid ${task.color}` } : { borderBottom: `2px solid ${task.color}` }),
                      ...(pos.includes('left') ? { borderLeft: `2px solid ${task.color}` } : { borderRight: `2px solid ${task.color}` }),
                      opacity: isClaimed ? 0.3 : 0.7,
                    }} />
                  ))}

                  {/* Angled cut accent on bottom border */}
                  <div className="absolute bottom-0 left-6 right-6 h-[2px] z-10"
                    style={{ background: `linear-gradient(90deg, transparent, rgba(${task.glowColor},${isClaimed ? '0.1' : '0.4'}), rgba(0,200,255,${isClaimed ? '0.05' : '0.2'}), transparent)` }} />

                  <div className="flex items-center gap-4 px-5 py-3">
                    {/* Large Icon Container */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                      style={{
                        background: `linear-gradient(135deg, rgba(${task.glowColor},0.15), rgba(${task.glowColor},0.05))`,
                        border: `2px solid rgba(${task.glowColor},${isClaimed ? '0.15' : '0.4'})`,
                        boxShadow: !isClaimed ? `0 0 15px rgba(${task.glowColor},0.2), inset 0 0 10px rgba(${task.glowColor},0.1)` : 'none',
                        color: isClaimed ? '#444' : task.color,
                      }}>
                      {isClaimed ? <CheckCircle2 size={30} style={{ color: '#39FF14', filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.5))' }} /> : task.icon}
                    </div>

                    {/* Task Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-ninja text-xl tracking-wide"
                          style={{
                            color: isClaimed ? '#555' : task.color,
                            textShadow: isClaimed ? 'none' : `0 0 15px rgba(${task.glowColor},0.4)`,
                            textDecoration: isClaimed ? 'line-through' : 'none',
                            fontStyle: 'italic',
                          }}>
                          {ar ? task.titleAr : task.title}
                        </span>
                        {(isClaimed || isComplete) && (
                          <span className="font-ninja text-[10px] tracking-[0.15em] px-3 py-1 rounded"
                            style={{
                              background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(57,255,20,0.1))',
                              border: '1px solid rgba(57,255,20,0.4)',
                              color: '#39FF14',
                              boxShadow: '0 0 8px rgba(57,255,20,0.15)',
                              fontStyle: 'italic',
                            }}>
                            {ar ? 'منجز' : 'DONE'}
                          </span>
                        )}
                      </div>
                      <p className="font-body text-sm text-gray-500">{ar ? task.descriptionAr : task.description}</p>

                      {task.target > 1 && !isClaimed && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(${task.glowColor},0.15)` }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.8 }}
                              className="h-full rounded-full" style={{ background: task.color, boxShadow: `0 0 6px rgba(${task.glowColor},0.5)` }} />
                          </div>
                          <span className="font-ninja text-xs text-gray-500">{tp.progress}/{task.target}</span>
                        </div>
                      )}
                    </div>

                    {/* Reward */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Coins size={18} className={isClaimed ? 'text-gray-600' : 'text-yellow-400'} style={!isClaimed ? { filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' } : {}} />
                        <span className={`font-ninja text-lg ${isClaimed ? 'text-gray-600' : 'text-yellow-400'}`}
                          style={!isClaimed ? { textShadow: '0 0 8px rgba(234,179,8,0.4)' } : {}}>
                          +{task.reward}
                        </span>
                      </div>

                      {/* Shortcut button — always visible when the task has one and isn't claimed yet */}
                      {!isClaimed && task.shortcut && onShortcut && (
                        <motion.button
                          whileHover={{ scale: 1.06, boxShadow: `0 0 18px rgba(${task.glowColor},0.4)` }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => onShortcut(task.shortcut!)}
                          className="w-[112px] h-[42px] rounded-lg font-ninja text-sm tracking-wider flex items-center justify-center gap-1.5 transition-all flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, rgba(${task.glowColor},0.2), rgba(${task.glowColor},0.06))`,
                            border: `1.5px solid rgba(${task.glowColor},0.5)`,
                            color: task.color,
                            boxShadow: `0 0 12px rgba(${task.glowColor},0.25)`,
                            textShadow: `0 0 6px rgba(${task.glowColor},0.5)`,
                          }}>
                          {(ar ? task.shortcutLabelAr : task.shortcutLabel) || task.shortcutLabel} <ArrowRight size={13} />
                        </motion.button>
                      )}
                      {/* Special: check_socials opens the verification popup */}
                      {!isClaimed && !isComplete && task.id === 'check_socials' && (
                        <motion.button
                          whileHover={{ scale: 1.06, boxShadow: `0 0 18px rgba(${task.glowColor},0.4)` }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => {
                            if (player?.uid) trackDailyTask(player.uid, 'check_socials').catch(() => {});
                            setSocialOpen(SOCIAL_BONUS_TASKS[0]);
                          }}
                          className="w-[112px] h-[42px] rounded-lg font-ninja text-sm tracking-wider flex items-center justify-center gap-1.5 transition-all flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, rgba(${task.glowColor},0.2), rgba(${task.glowColor},0.06))`,
                            border: `1.5px solid rgba(${task.glowColor},0.5)`,
                            color: task.color,
                            boxShadow: `0 0 12px rgba(${task.glowColor},0.25)`,
                            textShadow: `0 0 6px rgba(${task.glowColor},0.5)`,
                          }}>
                          {ar ? 'تحقّق' : 'CHECK'} <ArrowRight size={13} />
                        </motion.button>
                      )}

                      {!isClaimed && isComplete && (
                        <motion.button
                          whileHover={{ scale: 1.08, boxShadow: `0 0 20px rgba(${task.glowColor},0.5)` }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => handleClaim(task, e)}
                          disabled={claiming === task.id}
                          className="w-[112px] h-[42px] rounded-lg font-ninja text-sm tracking-wider text-black flex items-center justify-center flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${task.color}, ${task.color}CC)`,
                            boxShadow: `0 0 12px rgba(${task.glowColor},0.4)`,
                          }}>
                          {claiming === task.id ? <Loader2 size={14} className="animate-spin" /> : (ar ? 'استلم' : 'CLAIM')}
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ═══ EARN MORE COINS ═══ One-time bonus tasks, manual admin verification */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-[2px] flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4))' }} />
            <span className="font-ninja text-sm tracking-[0.25em] text-yellow-400" style={{ textShadow: '0 0 10px rgba(251,191,36,0.5)' }}>
              ⚡ EARN MORE COINS
            </span>
            <div className="h-[2px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.4), transparent)' }} />
          </div>
          <p className="text-center font-body text-xs text-gray-500 mb-3">
            One-time bonuses · admin verifies and pays out
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {SOCIAL_BONUS_TASKS.map((b, i) => {
              const sb = (player.socialBonus && player.socialBonus[b.id]) || {};
              const cooldownMs = b.repeatEveryDays ? b.repeatEveryDays * 24 * 60 * 60 * 1000 : null;
              const claimedAt: number = sb.claimedAt || 0;
              const requestedAt: number = sb.requestedAt || 0;
              const cooldownActive = cooldownMs !== null && claimedAt > 0 && (Date.now() - claimedAt) < cooldownMs;
              const claimed = cooldownMs === null
                ? !!sb.claimed                         // one-time bonus
                : cooldownActive;                       // repeatable: cooldown still running
              // "Pending" only if the most-recent request happened AFTER the most-recent claim.
              // This prevents a stale `requested:true` from a previous cycle from sticking.
              const requested = !claimed && (socialSubmitted === b.id || (!!sb.requested && requestedAt > claimedAt));
              const daysRemaining = cooldownActive ? Math.max(1, Math.ceil((cooldownMs! - (Date.now() - claimedAt)) / (24 * 60 * 60 * 1000))) : 0;
              return (
                <motion.button key={b.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.06 }}
                  whileHover={!claimed ? { scale: 1.02, boxShadow: `0 0 22px rgba(${b.glow},0.35)` } : undefined}
                  whileTap={!claimed ? { scale: 0.98 } : undefined}
                  disabled={claimed}
                  onClick={() => setSocialOpen(b)}
                  className="relative rounded-xl overflow-hidden text-left p-4 transition-all"
                  style={{
                    background: claimed
                      ? 'linear-gradient(135deg, rgba(57,255,20,0.04), rgba(0,0,0,0.4))'
                      : `linear-gradient(135deg, rgba(${b.glow},0.10), rgba(${b.glow},0.02) 60%, rgba(0,0,0,0.4))`,
                    border: `1.5px solid rgba(${b.glow},${claimed ? '0.15' : '0.45'})`,
                    boxShadow: claimed ? 'none' : `inset 0 0 18px rgba(${b.glow},0.05)`,
                    opacity: claimed ? 0.55 : 1,
                  }}>
                  {/* HUD corners */}
                  {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                    <div key={ci} className={`absolute ${pos} w-3 h-3 z-10`} style={{
                      ...(pos.includes('top') ? { borderTop: `1.5px solid ${b.color}` } : { borderBottom: `1.5px solid ${b.color}` }),
                      ...(pos.includes('left') ? { borderLeft: `1.5px solid ${b.color}` } : { borderRight: `1.5px solid ${b.color}` }),
                      opacity: claimed ? 0.3 : 0.7,
                    }} />
                  ))}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, rgba(${b.glow},0.2), rgba(${b.glow},0.06))`,
                        border: `1.5px solid rgba(${b.glow},0.4)`,
                        color: b.color,
                        boxShadow: `0 0 10px rgba(${b.glow},0.2)`,
                      }}>{b.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-ninja text-base text-white truncate" style={{ textShadow: `0 0 8px rgba(${b.glow},0.4)` }}>
                        {b.title}
                      </p>
                      <p className="font-body text-[11px] text-gray-500 truncate">{b.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1">
                      <Coins size={14} className="text-yellow-400" />
                      <span className="font-ninja text-sm text-yellow-400" style={{ textShadow: '0 0 6px rgba(234,179,8,0.4)' }}>
                        +{b.reward}
                      </span>
                    </div>
                    {claimed ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-ninja tracking-wider"
                        style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.3)', color: '#39FF14' }}>
                        <CheckCircle2 size={10} /> {b.repeatEveryDays ? (ar ? `بعد ${daysRemaining} ي` : `${daysRemaining}D LEFT`) : (ar ? 'تم' : 'CLAIMED')}
                      </span>
                    ) : requested ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-ninja tracking-wider"
                        style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24' }}>
                        <Loader2 size={10} className="animate-spin" /> PENDING
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-ninja tracking-wider" style={{ color: b.color }}>
                        OPEN <ArrowRight size={10} />
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* All complete — claimable 10-coin bonus */}
        {allClaimed && (
          <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            className="mt-4 relative rounded-xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,215,0,0.14), rgba(255,140,0,0.08) 50%, rgba(234,179,8,0.1))',
              border: '2px solid rgba(255,215,0,0.5)',
              boxShadow: fullBonusClaimed ? '0 0 12px rgba(255,215,0,0.08)' : '0 0 30px rgba(255,215,0,0.22)',
            }}>
            {/* Shimmer sweep while unclaimed */}
            {!fullBonusClaimed && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(110deg, transparent 40%, rgba(255,215,0,0.15) 50%, transparent 60%)',
                  backgroundSize: '200% 100%',
                }}
                animate={{ backgroundPosition: ['200% 0%', '-50% 0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              />
            )}
            {/* HUD corners */}
            {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
              <div key={ci} className={`absolute ${pos} w-4 h-4 z-10`} style={{
                ...(pos.includes('top') ? { borderTop: '2px solid #FFD700' } : { borderBottom: '2px solid #FFD700' }),
                ...(pos.includes('left') ? { borderLeft: '2px solid #FFD700' } : { borderRight: '2px solid #FFD700' }),
                opacity: fullBonusClaimed ? 0.35 : 0.85,
                filter: fullBonusClaimed ? 'none' : 'drop-shadow(0 0 5px rgba(255,215,0,0.6))',
              }} />
            ))}
            <div className="relative z-[5] flex items-center gap-4 px-5 py-4">
              <Gift size={32} className="text-yellow-400 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.7))' }} />
              <div className="flex-1 min-w-0">
                <p className="font-ninja text-xl text-yellow-400 tracking-wide" style={{ textShadow: '0 0 12px rgba(255,215,0,0.5)', fontStyle: 'italic' }}>
                  ALL TASKS COMPLETE!
                </p>
                <p className="font-body text-xs text-gray-400 mt-0.5">
                  {fullBonusClaimed
                    ? (ar ? 'هل تريد فتح صندوقك الآن؟' : 'Ready to open your chest?')
                    : (ar ? 'استلم عملات المكافأة + صندوقاً يومياً مجاناً' : 'Claim your bonus coins + FREE DAILY CHEST')}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Coins size={16} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />
                <span className="font-ninja text-base text-yellow-400" style={{ textShadow: '0 0 8px rgba(234,179,8,0.4)' }}>
                  +{DAILY_FULL_BONUS_COINS}
                </span>
              </div>
              {fullBonusClaimed ? (
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 22px rgba(255,215,0,0.55)' }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    // Jump straight to Inventory and trigger the daily-chest opener.
                    window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'inventory' }));
                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-daily-chest')), 150);
                    if (onClose) onClose();
                  }}
                  className="h-[42px] px-4 rounded-lg font-ninja text-sm tracking-wider text-black flex items-center justify-center gap-1.5 flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    boxShadow: '0 0 14px rgba(255,215,0,0.4)',
                  }}>
                  <Gift size={14} /> {ar ? 'افتح الآن' : 'OPEN NOW'}
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 22px rgba(255,215,0,0.55)' }}
                  whileTap={{ scale: 0.92 }}
                  onClick={handleClaimFullBonus}
                  disabled={claimingBonus}
                  className="w-[112px] h-[42px] rounded-lg font-ninja text-sm tracking-wider text-black flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    boxShadow: '0 0 14px rgba(255,215,0,0.4)',
                  }}>
                  {claimingBonus ? <Loader2 size={14} className="animate-spin" /> : 'CLAIM'}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Social verification popup */}
      <AnimatePresence>
        {socialOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.92, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[480px] max-w-[92vw] rounded-2xl overflow-hidden p-6"
              style={{
                background: `linear-gradient(180deg, rgba(${socialOpen.glow},0.06) 0%, #060810 50%, #050a10 100%)`,
                border: `1.5px solid rgba(${socialOpen.glow},0.4)`,
                boxShadow: `0 25px 60px rgba(0,0,0,0.9), 0 0 50px rgba(${socialOpen.glow},0.18)`,
              }}>
              {/* HUD corners */}
              {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
                <div key={i} className={`absolute ${pos} w-4 h-4 pointer-events-none z-[2]`} style={{
                  ...(pos.includes('top') ? { borderTop: `2px solid ${socialOpen.color}` } : { borderBottom: `2px solid ${socialOpen.color}` }),
                  ...(pos.includes('left') ? { borderLeft: `2px solid ${socialOpen.color}` } : { borderRight: `2px solid ${socialOpen.color}` }),
                  filter: `drop-shadow(0 0 6px ${socialOpen.color})`,
                }} />
              ))}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]"
                style={{ background: `linear-gradient(90deg, transparent, ${socialOpen.color}, transparent)`, boxShadow: `0 0 12px ${socialOpen.color}` }} />

              {/* Close */}
              <button onClick={() => { setSocialOpen(null); setSocialSubmitted(''); }}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white transition-all z-[10]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={14} />
              </button>

              <div className="relative z-[3]">
                {/* Header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, rgba(${socialOpen.glow},0.22), rgba(${socialOpen.glow},0.06))`,
                      border: `1.5px solid rgba(${socialOpen.glow},0.5)`,
                      color: socialOpen.color,
                      boxShadow: `0 0 16px rgba(${socialOpen.glow},0.3)`,
                    }}>{socialOpen.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-ninja text-2xl text-white tracking-wider truncate"
                      style={{ textShadow: `0 0 12px rgba(${socialOpen.glow},0.4)` }}>
                      {ar ? socialOpen.titleAr : socialOpen.title}
                    </p>
                    <p className="font-body text-xs text-gray-400 mt-1">{ar ? socialOpen.subtitleAr : socialOpen.subtitle}</p>
                  </div>
                  <div className="flex flex-col items-center px-3 py-2 rounded-lg flex-shrink-0"
                    style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)' }}>
                    <Coins size={16} className="text-yellow-400" />
                    <span className="font-ninja text-base text-yellow-400 mt-0.5">+{socialOpen.reward}</span>
                  </div>
                </div>

                {/* Highlighted handle */}
                {socialOpen.highlightHandle && (
                  <div className="relative rounded-lg p-3 mb-4 text-center"
                    style={{
                      background: `linear-gradient(135deg, rgba(${socialOpen.glow},0.12), rgba(${socialOpen.glow},0.04))`,
                      border: `1px solid rgba(${socialOpen.glow},0.35)`,
                    }}>
                    <p className="font-body text-[10px] text-gray-500 uppercase tracking-wider mb-1">{ar ? 'ضع إشارة' : 'Tag us'}</p>
                    <p className="font-ninja text-2xl tracking-wider" style={{ color: socialOpen.color, textShadow: `0 0 12px rgba(${socialOpen.glow},0.5)` }}>
                      {socialOpen.highlightHandle}
                    </p>
                  </div>
                )}

                {/* Verification notice */}
                <div className="rounded-lg p-3 mb-4"
                  style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <p className="font-ninja text-[11px] tracking-wider text-yellow-400 mb-1">
                    {ar ? '⚠ تحقّق يدوي' : '⚠ MANUAL VERIFICATION'}
                  </p>
                  <p className="font-body text-xs text-gray-400 leading-relaxed">
                    {ar
                      ? 'تُمنح العملات بعد أن يؤكد الموظف أنك أتممت الخطوات. أحضر هاتفك إلى الكاشير أو أرسل لقطة شاشة في دردشة الكشك.'
                      : 'Coins are paid out by a worker after they confirm you completed the steps. Bring your phone to the desk OR send a screenshot in the kiosk chat.'}
                  </p>
                </div>

                {/* Steps */}
                <div className="space-y-2 mb-5">
                  {socialOpen.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-ninja"
                        style={{
                          background: `rgba(${socialOpen.glow},0.15)`,
                          border: `1px solid rgba(${socialOpen.glow},0.4)`,
                          color: socialOpen.color,
                        }}>{i + 1}</div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span style={{ color: socialOpen.color, opacity: 0.7 }}>{s.icon}</span>
                        <span className="font-body text-xs text-gray-300">{ar ? s.textAr : s.text}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {socialOpen.primaryUrl && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { window.open(socialOpen.primaryUrl, '_blank'); }}
                      className="flex-1 relative h-12 rounded-lg font-ninja text-xs tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, rgba(${socialOpen.glow},0.2), rgba(${socialOpen.glow},0.06))`,
                        border: `1.5px solid rgba(${socialOpen.glow},0.55)`,
                        color: socialOpen.color,
                        boxShadow: `0 0 14px rgba(${socialOpen.glow},0.25)`,
                      }}>
                      <ExternalLink size={13} /> {(ar ? socialOpen.primaryUrlLabelAr : socialOpen.primaryUrlLabel) || (ar ? 'افتح الرابط' : 'OPEN LINK')}
                    </motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { window.open('/info', '_blank'); }}
                    className="relative h-12 px-4 rounded-lg font-ninja text-xs tracking-wider flex items-center justify-center gap-1.5 overflow-hidden"
                    style={{
                      background: 'rgba(57,255,20,0.08)',
                      border: '1px solid rgba(57,255,20,0.3)',
                      color: '#39FF14',
                    }}>
                    {ar ? 'كل الروابط' : 'ALL LINKS'}
                  </motion.button>
                </div>

                {/* Submit verification request */}
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={() => submitSocialRequest(socialOpen)}
                  disabled={socialSubmitting || socialSubmitted === socialOpen.id}
                  className="w-full mt-2 h-12 rounded-lg font-ninja text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{
                    background: socialSubmitted === socialOpen.id
                      ? 'rgba(57,255,20,0.1)'
                      : 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(251,191,36,0.08))',
                    border: socialSubmitted === socialOpen.id
                      ? '1px solid rgba(57,255,20,0.45)'
                      : '1.5px solid rgba(251,191,36,0.55)',
                    color: socialSubmitted === socialOpen.id ? '#39FF14' : '#FBBF24',
                    boxShadow: socialSubmitted === socialOpen.id ? 'none' : '0 0 14px rgba(251,191,36,0.25)',
                  }}>
                  {socialSubmitting ? <><Loader2 size={14} className="animate-spin" /> {ar ? 'جاري الإرسال...' : 'SENDING...'}</>
                   : socialSubmitted === socialOpen.id ? <><CheckCircle2 size={14} /> {ar ? 'أُرسل — بانتظار الموظف' : 'SENT — WAIT FOR ADMIN'}</>
                   : <>{ar ? 'أتممتها — اطلب التحقق' : 'I DID IT — REQUEST VERIFICATION'}</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating reward */}
      <AnimatePresence>
        {showReward && (
          <motion.div initial={{ opacity: 1, y: 0, scale: 1 }} animate={{ opacity: 0, y: -60, scale: 1.3 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="fixed z-[999] pointer-events-none font-ninja text-2xl text-yellow-400 flex items-center gap-1"
            style={{ left: showReward.x - 30, top: showReward.y - 20, textShadow: '0 0 20px rgba(234,179,8,0.8)' }}>
            <Coins size={20} /> +{showReward.amount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
