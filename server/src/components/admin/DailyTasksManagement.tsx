'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  ListChecks, LogIn, Gamepad2, Package, Send, UtensilsCrossed, Star, Target,
  Coins, Flame, Trophy, Users, RefreshCw, TrendingUp, Calendar, CheckCircle2,
  ChevronDown, ChevronUp, Award, Instagram, Save, RotateCcw, Eye, EyeOff, Loader2,
  ArrowUp, ArrowDown, GripVertical,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

// ── Task definitions (must match DailyTasksTab.tsx) ──────────
interface TaskDef {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  target: number;
  reward: number;
}

const TASK_DEFS: TaskDef[] = [
  { id: 'daily_login',   title: 'Check-in',                 icon: <LogIn size={18} />,            color: '#34c759', target: 1,  reward: 2 },
  { id: 'open_chest',    title: 'Open Chest',               icon: <Package size={18} />,          color: '#ff9500', target: 1,  reward: 3 },
  { id: 'send_coins',    title: 'Send Coins',               icon: <Send size={18} />,             color: '#0071e3', target: 1,  reward: 3 },
  { id: 'order_food',    title: 'Order from Food & Snacks', icon: <UtensilsCrossed size={18} />,  color: '#ff9500', target: 1,  reward: 2 },
  { id: 'play_30_min',   title: 'Play 75 Min',              icon: <Target size={18} />,           color: '#34c759', target: 75, reward: 10 },
];

interface TaskOverride {
  reward?: number;
  target?: number;
  hidden?: boolean;
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
}
type TaskOverrides = Record<string, TaskOverride>;

// Default texts mirror the kiosk's DAILY_TASKS_DEFAULTS.
const TASK_DEFAULT_TEXT: Record<string, { title: string; titleAr: string; description: string; descriptionAr: string }> = {
  daily_login:  { title: 'Check-in',                 titleAr: 'تسجيل الدخول',          description: 'Log in to the kiosk today',                    descriptionAr: 'سجّل دخولك إلى الكشك اليوم' },
  open_chest:   { title: 'Open Chest',               titleAr: 'افتح صندوقاً',          description: 'Open any chest',                               descriptionAr: 'افتح أي صندوق' },
  send_coins:   { title: 'Send Coins',               titleAr: 'أرسل العملات',          description: 'Send coins to a friend',                       descriptionAr: 'أرسل عملات إلى صديق' },
  order_food:   { title: 'Order from Food & Snacks', titleAr: 'اطلب من الطعام والوجبات', description: 'Place any order from the Food & Snacks menu', descriptionAr: 'اطلب أي شيء من قائمة الطعام والوجبات' },
  play_30_min:  { title: 'Play 75 Min',              titleAr: 'العب 75 دقيقة',         description: 'Play for at least 75 minutes',                 descriptionAr: 'العب لمدة 75 دقيقة على الأقل' },
};

// ── EARN MORE COINS (social bonuses) — mirror kiosk's SOCIAL_BONUS_DEFAULTS ──
interface SocialBonusDef {
  id: string;
  title: string; titleAr: string;
  subtitle: string; subtitleAr: string;
  reward: number;
  repeatEveryDays: number | null;
  primaryUrl: string;
  primaryUrlLabel: string; primaryUrlLabelAr: string;
  color: string;
}
interface SocialBonusOverride {
  title?: string; titleAr?: string;
  subtitle?: string; subtitleAr?: string;
  reward?: number;
  repeatEveryDays?: number | null;
  primaryUrl?: string;
  primaryUrlLabel?: string; primaryUrlLabelAr?: string;
  hidden?: boolean;
}
type SocialBonusOverrides = Record<string, SocialBonusOverride>;

const SOCIAL_BONUS_DEFS: SocialBonusDef[] = [
  {
    id: 'check_socials_bonus',
    title: 'Check Our Instagram', titleAr: 'تابع إنستغرام',
    subtitle: 'Like our 3 latest Instagram posts', subtitleAr: 'أعجب بآخر 3 منشورات لنا على إنستغرام',
    reward: 10, repeatEveryDays: 10,
    primaryUrl: 'https://www.instagram.com/ininjagames',
    primaryUrlLabel: 'Open Instagram', primaryUrlLabelAr: 'افتح إنستغرام',
    color: '#E879F9',
  },
  {
    id: 'google_review',
    title: 'Leave Google Review', titleAr: 'اترك تقييم على جوجل',
    subtitle: 'Rate us 5 stars on Google Maps', subtitleAr: 'قيّمنا 5 نجوم على خرائط جوجل',
    reward: 10, repeatEveryDays: 10,
    primaryUrl: 'https://share.google/CW0iX87oFRlrr7Qn0',
    primaryUrlLabel: 'Open Google Review', primaryUrlLabelAr: 'افتح تقييم جوجل',
    color: '#FBBF24',
  },
  {
    id: 'instagram_bio',
    title: 'Add Us to Your Bio', titleAr: 'أضفنا إلى سيرتك الذاتية',
    subtitle: 'Put @ininjagames in your Instagram bio', subtitleAr: 'ضع @ininjagames في سيرتك على إنستغرام',
    reward: 10, repeatEveryDays: null,
    primaryUrl: 'https://www.instagram.com/ininjagames',
    primaryUrlLabel: 'Open Instagram', primaryUrlLabelAr: 'افتح إنستغرام',
    color: '#00BFFF',
  },
];

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TaskDocData {
  playerId: string;
  date: string;
  tasks: Record<string, { progress: number; claimed: boolean }>;
}

interface PlayerStreak {
  uid: string;
  username: string;
  streak: number;
  lastCheckin?: string;
}

interface PlayerTaskSummary {
  playerId: string;
  username: string;
  completed: number;
  claimed: number;
  coinsEarned: number;
}

export function DailyTasksManagement() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayDocs, setTodayDocs] = useState<TaskDocData[]>([]);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>({});
  const [streakBoard, setStreakBoard] = useState<PlayerStreak[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllStreaks, setShowAllStreaks] = useState(false);

  // ── Admin overrides (all task fields editable) + order ──
  const [overrides, setOverrides] = useState<TaskOverrides>({});
  const [order, setOrder] = useState<string[]>(() => TASK_DEFS.map((t) => t.id));
  const [socialOverrides, setSocialOverrides] = useState<SocialBonusOverrides>({});
  const [socialOrder, setSocialOrder] = useState<string[]>(() => SOCIAL_BONUS_DEFS.map((b) => b.id));
  const [dirtyOverrides, setDirtyOverrides] = useState<TaskOverrides | null>(null);
  const [dirtyOrder, setDirtyOrder] = useState<string[] | null>(null);
  const [dirtySocial, setDirtySocial] = useState<SocialBonusOverrides | null>(null);
  const [dirtySocialOrder, setDirtySocialOrder] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'daily-tasks'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setOverrides(data.overrides || {});
        if (Array.isArray(data.order) && data.order.length > 0) {
          // Include any new defaults that aren't in the saved order yet.
          const saved = data.order.filter((id: string) => TASK_DEFS.some((t) => t.id === id));
          const missing = TASK_DEFS.map((t) => t.id).filter((id) => !saved.includes(id));
          setOrder([...saved, ...missing]);
        } else {
          setOrder(TASK_DEFS.map((t) => t.id));
        }
        setSocialOverrides(data.socialOverrides || {});
        if (Array.isArray(data.socialOrder) && data.socialOrder.length > 0) {
          const savedSocial = data.socialOrder.filter((id: string) => SOCIAL_BONUS_DEFS.some((b) => b.id === id));
          const missingSocial = SOCIAL_BONUS_DEFS.map((b) => b.id).filter((id) => !savedSocial.includes(id));
          setSocialOrder([...savedSocial, ...missingSocial]);
        } else {
          setSocialOrder(SOCIAL_BONUS_DEFS.map((b) => b.id));
        }
      } else {
        setOverrides({});
        setOrder(TASK_DEFS.map((t) => t.id));
        setSocialOverrides({});
        setSocialOrder(SOCIAL_BONUS_DEFS.map((b) => b.id));
      }
    });
    return () => unsub();
  }, []);

  const effectiveOverrides = dirtyOverrides ?? overrides;
  const effectiveOrder = dirtyOrder ?? order;
  const effectiveSocial = dirtySocial ?? socialOverrides;
  const effectiveSocialOrder = dirtySocialOrder ?? socialOrder;
  const isDirty =
    dirtyOverrides !== null ||
    dirtyOrder !== null ||
    dirtySocial !== null ||
    dirtySocialOrder !== null;

  // ── Social bonus helpers ─────────────────────────────────────
  const getSocialString = (id: string, field: 'title' | 'titleAr' | 'subtitle' | 'subtitleAr' | 'primaryUrl' | 'primaryUrlLabel' | 'primaryUrlLabelAr') => {
    const val = effectiveSocial[id]?.[field];
    if (typeof val === 'string') return val;
    const def = SOCIAL_BONUS_DEFS.find((b) => b.id === id);
    return def ? (def[field] as string) : '';
  };
  const getSocialReward = (def: SocialBonusDef) => {
    const o = effectiveSocial[def.id]?.reward;
    return typeof o === 'number' ? o : def.reward;
  };
  const getSocialRepeat = (def: SocialBonusDef): number | null => {
    if (effectiveSocial[def.id] && 'repeatEveryDays' in effectiveSocial[def.id]) {
      return effectiveSocial[def.id].repeatEveryDays ?? null;
    }
    return def.repeatEveryDays;
  };
  const isSocialHidden = (id: string) => !!effectiveSocial[id]?.hidden;
  const patchSocial = (id: string, patch: Partial<SocialBonusOverride>) => {
    setDirtySocial((prev) => {
      const base = prev ?? JSON.parse(JSON.stringify(socialOverrides));
      const next: SocialBonusOverrides = { ...base };
      next[id] = { ...(next[id] || {}), ...patch };
      return next;
    });
    setSaveMsg('');
  };
  const moveSocial = (id: string, dir: -1 | 1) => {
    setDirtySocialOrder(() => {
      const arr = [...effectiveSocialOrder];
      const idx = arr.indexOf(id);
      if (idx < 0) return arr;
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
    setSaveMsg('');
  };

  const getString = (taskId: string, field: 'title' | 'titleAr' | 'description' | 'descriptionAr') => {
    const val = effectiveOverrides[taskId]?.[field];
    if (typeof val === 'string') return val;
    return TASK_DEFAULT_TEXT[taskId]?.[field] || '';
  };
  const getReward = (def: TaskDef) => {
    const o = effectiveOverrides[def.id]?.reward;
    return typeof o === 'number' ? o : def.reward;
  };
  const getTarget = (def: TaskDef) => {
    const o = effectiveOverrides[def.id]?.target;
    return typeof o === 'number' ? o : def.target;
  };
  const isHidden = (taskId: string) => !!effectiveOverrides[taskId]?.hidden;

  const patchOverride = (taskId: string, patch: Partial<TaskOverride>) => {
    setDirtyOverrides((prev) => {
      const base = prev ?? JSON.parse(JSON.stringify(overrides));
      const next: TaskOverrides = { ...base };
      next[taskId] = { ...(next[taskId] || {}), ...patch };
      return next;
    });
    setSaveMsg('');
  };

  const moveTask = (taskId: string, dir: -1 | 1) => {
    setDirtyOrder(() => {
      const arr = [...effectiveOrder];
      const idx = arr.indexOf(taskId);
      if (idx < 0) return arr;
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
    setSaveMsg('');
  };

  const saveOverrides = async () => {
    if (!isDirty) return;
    setSaving(true);
    setSaveMsg('');
    try {
      // Strip defaults so the Firestore doc stays tiny + debuggable.
      const cleaned: TaskOverrides = {};
      for (const [id, o] of Object.entries(effectiveOverrides)) {
        const entry: TaskOverride = {};
        const def = TASK_DEFAULT_TEXT[id];
        if (typeof o.reward === 'number') {
          const baseReward = TASK_DEFS.find((t) => t.id === id)?.reward;
          if (o.reward !== baseReward) entry.reward = o.reward;
        }
        if (typeof o.target === 'number') {
          const baseTarget = TASK_DEFS.find((t) => t.id === id)?.target;
          if (o.target !== baseTarget) entry.target = o.target;
        }
        if (o.hidden) entry.hidden = true;
        if (typeof o.title === 'string' && o.title.trim() && o.title.trim() !== def?.title) entry.title = o.title.trim();
        if (typeof o.titleAr === 'string' && o.titleAr.trim() && o.titleAr.trim() !== def?.titleAr) entry.titleAr = o.titleAr.trim();
        if (typeof o.description === 'string' && o.description.trim() && o.description.trim() !== def?.description) entry.description = o.description.trim();
        if (typeof o.descriptionAr === 'string' && o.descriptionAr.trim() && o.descriptionAr.trim() !== def?.descriptionAr) entry.descriptionAr = o.descriptionAr.trim();
        if (Object.keys(entry).length > 0) cleaned[id] = entry;
      }
      // Clean social bonus overrides the same way.
      const cleanedSocial: SocialBonusOverrides = {};
      for (const [id, o] of Object.entries(effectiveSocial)) {
        const def = SOCIAL_BONUS_DEFS.find((b) => b.id === id);
        if (!def) continue;
        const entry: SocialBonusOverride = {};
        if (typeof o.title === 'string' && o.title.trim() && o.title.trim() !== def.title) entry.title = o.title.trim();
        if (typeof o.titleAr === 'string' && o.titleAr.trim() && o.titleAr.trim() !== def.titleAr) entry.titleAr = o.titleAr.trim();
        if (typeof o.subtitle === 'string' && o.subtitle.trim() && o.subtitle.trim() !== def.subtitle) entry.subtitle = o.subtitle.trim();
        if (typeof o.subtitleAr === 'string' && o.subtitleAr.trim() && o.subtitleAr.trim() !== def.subtitleAr) entry.subtitleAr = o.subtitleAr.trim();
        if (typeof o.reward === 'number' && o.reward !== def.reward) entry.reward = o.reward;
        if ('repeatEveryDays' in o && o.repeatEveryDays !== def.repeatEveryDays) entry.repeatEveryDays = o.repeatEveryDays ?? null;
        if (typeof o.primaryUrl === 'string' && o.primaryUrl.trim() && o.primaryUrl.trim() !== def.primaryUrl) entry.primaryUrl = o.primaryUrl.trim();
        if (typeof o.primaryUrlLabel === 'string' && o.primaryUrlLabel.trim() && o.primaryUrlLabel.trim() !== def.primaryUrlLabel) entry.primaryUrlLabel = o.primaryUrlLabel.trim();
        if (typeof o.primaryUrlLabelAr === 'string' && o.primaryUrlLabelAr.trim() && o.primaryUrlLabelAr.trim() !== def.primaryUrlLabelAr) entry.primaryUrlLabelAr = o.primaryUrlLabelAr.trim();
        if (o.hidden) entry.hidden = true;
        if (Object.keys(entry).length > 0) cleanedSocial[id] = entry;
      }
      await setDoc(doc(db, 'config', 'daily-tasks'), {
        overrides: cleaned,
        order: effectiveOrder,
        socialOverrides: cleanedSocial,
        socialOrder: effectiveSocialOrder,
      });
      setDirtyOverrides(null);
      setDirtyOrder(null);
      setDirtySocial(null);
      setDirtySocialOrder(null);
      setSaveMsg('Saved — players see new values instantly.');
    } catch (err: any) {
      setSaveMsg(`Save failed: ${err?.message || 'unknown error'}`);
    }
    setSaving(false);
  };

  const resetAllOverrides = async () => {
    if (!confirm('Reset ALL task customizations? Rewards, targets, texts and order revert to defaults for every task AND social bonus.')) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'daily-tasks'), {
        overrides: {},
        order: TASK_DEFS.map((t) => t.id),
        socialOverrides: {},
        socialOrder: SOCIAL_BONUS_DEFS.map((b) => b.id),
      });
      setDirtyOverrides(null);
      setDirtyOrder(null);
      setDirtySocial(null);
      setDirtySocialOrder(null);
      setSaveMsg('All overrides cleared.');
    } catch (err: any) {
      setSaveMsg(`Reset failed: ${err?.message || 'unknown error'}`);
    }
    setSaving(false);
  };

  const todayKey = getTodayKey();

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = async () => {
    setRefreshing(true);
    try {
      // 1. Get all players for username lookup + streak data
      const playersSnap = await getDocs(collection(db, 'players'));
      const pMap: Record<string, string> = {};
      const streaks: PlayerStreak[] = [];
      playersSnap.docs.forEach(d => {
        const data = d.data();
        pMap[d.id] = data.username || d.id;
        const checkin = data.dailyCheckin || {};
        if (checkin.streak && checkin.streak > 0) {
          streaks.push({
            uid: d.id,
            username: data.username || d.id,
            streak: checkin.streak || 0,
            lastCheckin: checkin.lastDate,
          });
        }
      });
      setPlayerMap(pMap);
      setStreakBoard(streaks.sort((a, b) => b.streak - a.streak));

      // 2. Get today's daily-tasks docs
      const tasksSnap = await getDocs(collection(db, 'daily-tasks'));
      const docs: TaskDocData[] = [];
      tasksSnap.docs.forEach(d => {
        const data = d.data();
        if (d.id.endsWith(`_${todayKey}`)) {
          docs.push({
            playerId: data.playerId || d.id.replace(`_${todayKey}`, ''),
            date: data.date || todayKey,
            tasks: data.tasks || {},
          });
        }
      });
      setTodayDocs(docs);
    } catch (err) {
      console.error('Failed to fetch daily tasks data:', err);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Computed stats ──────────────────────────────────────────
  const taskCompletionCounts: Record<string, number> = {};
  const taskClaimedCounts: Record<string, number> = {};
  let totalTasksCompleted = 0;
  let totalCoinsRewarded = 0;

  TASK_DEFS.forEach(t => {
    taskCompletionCounts[t.id] = 0;
    taskClaimedCounts[t.id] = 0;
  });

  const playerSummaries: PlayerTaskSummary[] = [];

  todayDocs.forEach(docData => {
    let playerCompleted = 0;
    let playerClaimed = 0;
    let playerCoins = 0;

    TASK_DEFS.forEach(taskDef => {
      const tp = docData.tasks[taskDef.id];
      if (!tp) return;
      if (tp.progress >= taskDef.target) {
        taskCompletionCounts[taskDef.id]++;
        totalTasksCompleted++;
        playerCompleted++;
      }
      if (tp.claimed) {
        taskClaimedCounts[taskDef.id]++;
        playerClaimed++;
        playerCoins += taskDef.reward;
        totalCoinsRewarded += taskDef.reward;
      }
    });

    playerSummaries.push({
      playerId: docData.playerId,
      username: playerMap[docData.playerId] || docData.playerId,
      completed: playerCompleted,
      claimed: playerClaimed,
      coinsEarned: playerCoins,
    });
  });

  playerSummaries.sort((a, b) => b.completed - a.completed || b.coinsEarned - a.coinsEarned);

  const displayedPlayers = showAllTasks ? playerSummaries : playerSummaries.slice(0, 10);
  const displayedStreaks = showAllStreaks ? streakBoard : streakBoard.slice(0, 10);

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-[#0071e3]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="text-[#0071e3]" size={28} />
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Daily Tasks
            <HelpTip title={{ en: 'Daily Tasks', ar: 'المهام اليومية' }}
              ar={<p>مهام يومية/أسبوعية للاعبين (العب ساعة، أضف صديق، أكمل...). عدّل الأهداف والمكافآت. اللاعبون يرون تقدمهم في تبويب Tasks.</p>}>
              <p>Daily / weekly missions players complete (Play 1h, Add a friend, Complete X...). Edit targets + rewards. Players track progress on the kiosk Tasks tab.</p>
            </HelpTip>
          </h2>
          <span className="text-[#86868b] text-sm">{todayKey}</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={fetchData}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>

      {/* ── Summary cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Players', value: todayDocs.length, icon: <Users size={20} />, color: '#0071e3' },
          { label: 'Tasks Completed', value: totalTasksCompleted, icon: <CheckCircle2 size={20} />, color: '#af52de' },
          { label: 'Coins Rewarded', value: totalCoinsRewarded, icon: <Coins size={20} />, color: '#ff9500' },
          { label: 'Top Streak', value: streakBoard[0]?.streak || 0, icon: <Flame size={20} />, color: '#ff9500' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: card.color }}>{card.icon}</span>
              <span className="text-[#86868b] text-xs uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-2xl font-semibold text-[#1d1d1f]">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Task editor (FULL admin overrides + reorder) ───────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
            <Award size={18} className="text-[#0071e3]" />
            Edit Daily Tasks
            <HelpTip title={{ en: 'Edit Daily Tasks', ar: 'تعديل المهام اليومية' }}
              ar={<p>محرر كامل: عدّل اسم المهمة والوصف (عربي + إنجليزي)، غيّر المكافأة والهدف، أخفِ المهمة، وأعد ترتيب الصفوف. يُطبَّق فوراً على كل الكشوك.</p>}>
              <p>Full editor — rename each task and its description (EN + AR), change the reward and target, hide the task, and reorder the rows. Applies instantly on every kiosk.</p>
            </HelpTip>
          </h3>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className={`text-xs ${saveMsg.startsWith('Saved') || saveMsg.startsWith('All') ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={resetAllOverrides}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] text-xs font-medium transition-all disabled:opacity-50"
              title="Reset every task to its built-in default"
            >
              <RotateCcw size={13} /> Reset to Defaults
            </button>
            <button
              onClick={saveOverrides}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0071e3] text-white text-xs font-medium hover:bg-[#0077ED] transition-all disabled:opacity-40"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {isDirty ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {effectiveOrder.map((taskId, idx) => {
            const task = TASK_DEFS.find((t) => t.id === taskId);
            if (!task) return null;
            const hidden = isHidden(task.id);
            const reward = getReward(task);
            const target = getTarget(task);
            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 p-4"
                style={{ opacity: hidden ? 0.55 : 1 }}
              >
                <div className="flex items-start gap-4">
                  {/* Reorder column */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <span className="text-[#86868b] text-xs font-mono font-semibold w-6 text-center">#{idx + 1}</span>
                    <button
                      onClick={() => moveTask(task.id, -1)}
                      disabled={idx === 0}
                      title="Move up"
                      className="w-7 h-7 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <GripVertical size={14} className="text-[#c7c7cc]" />
                    <button
                      onClick={() => moveTask(task.id, 1)}
                      disabled={idx === effectiveOrder.length - 1}
                      title="Move down"
                      className="w-7 h-7 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Icon + id */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${task.color}15` }}>
                      <span style={{ color: task.color }}>{task.icon}</span>
                    </div>
                    <span className="text-[9px] text-[#86868b] font-mono tracking-wider">{task.id}</span>
                  </div>

                  {/* Fields */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Title (EN)</span>
                      <input
                        type="text"
                        value={getString(task.id, 'title')}
                        onChange={(e) => patchOverride(task.id, { title: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Title (AR)</span>
                      <input
                        type="text"
                        dir="rtl"
                        value={getString(task.id, 'titleAr')}
                        onChange={(e) => patchOverride(task.id, { titleAr: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Description (EN)</span>
                      <input
                        type="text"
                        value={getString(task.id, 'description')}
                        onChange={(e) => patchOverride(task.id, { description: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Description (AR)</span>
                      <input
                        type="text"
                        dir="rtl"
                        value={getString(task.id, 'descriptionAr')}
                        onChange={(e) => patchOverride(task.id, { descriptionAr: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">
                        Reward (coins) · default {task.reward}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={reward}
                        onChange={(e) => patchOverride(task.id, { reward: Number(e.target.value) || 0 })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#ff9500] font-semibold focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">
                        Target · default {task.target}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={target}
                        onChange={(e) => patchOverride(task.id, { target: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                    </label>
                  </div>

                  {/* Visibility */}
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => patchOverride(task.id, { hidden: !hidden })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                        hidden
                          ? 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/25 hover:bg-[#ff3b30]/20'
                          : 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25 hover:bg-[#34c759]/20'
                      }`}
                    >
                      {hidden ? <><EyeOff size={13} /> Hidden</> : <><Eye size={13} /> Shown</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Earn More Coins editor (social bonus tasks) ─────── */}
      <div>
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
          <Instagram size={18} className="text-[#E879F9]" />
          Edit "Earn More Coins" Bonuses
          <HelpTip title={{ en: 'Edit Social Bonuses', ar: 'تعديل مكافآت التواصل' }}
            ar={<p>تعديل كامل لبطاقات "اكسب المزيد" — العنوان (عربي + إنجليزي)، الوصف، المكافأة، الرابط، إعادة التفعيل كل X يوم، الإخفاء، وإعادة الترتيب. يطبَّق فوراً على كل الكشوك.</p>}>
            <p>Full editor for the "Earn More Coins" cards: title (EN + AR), subtitle, reward, external link, repeat-every-days cooldown, hide and reorder. Live on every kiosk.</p>
          </HelpTip>
        </h3>
        <div className="space-y-3">
          {effectiveSocialOrder.map((id, idx) => {
            const def = SOCIAL_BONUS_DEFS.find((b) => b.id === id);
            if (!def) return null;
            const hidden = isSocialHidden(def.id);
            const repeat = getSocialRepeat(def);
            return (
              <motion.div
                key={def.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 p-4"
                style={{ opacity: hidden ? 0.55 : 1 }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <span className="text-[#86868b] text-xs font-mono font-semibold w-6 text-center">#{idx + 1}</span>
                    <button
                      onClick={() => moveSocial(def.id, -1)}
                      disabled={idx === 0}
                      title="Move up"
                      className="w-7 h-7 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:text-[#E879F9] hover:bg-[#E879F9]/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <GripVertical size={14} className="text-[#c7c7cc]" />
                    <button
                      onClick={() => moveSocial(def.id, 1)}
                      disabled={idx === effectiveSocialOrder.length - 1}
                      title="Move down"
                      className="w-7 h-7 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:text-[#E879F9] hover:bg-[#E879F9]/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `${def.color}15` }}>
                      <span style={{ color: def.color }}>
                        {def.id === 'google_review' ? <Star size={18} /> : def.id === 'instagram_bio' ? <Award size={18} /> : <Instagram size={18} />}
                      </span>
                    </div>
                    <span className="text-[9px] text-[#86868b] font-mono tracking-wider">{def.id}</span>
                  </div>
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Title (EN)</span>
                      <input type="text"
                        value={getSocialString(def.id, 'title')}
                        onChange={(e) => patchSocial(def.id, { title: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Title (AR)</span>
                      <input type="text" dir="rtl"
                        value={getSocialString(def.id, 'titleAr')}
                        onChange={(e) => patchSocial(def.id, { titleAr: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Subtitle (EN)</span>
                      <input type="text"
                        value={getSocialString(def.id, 'subtitle')}
                        onChange={(e) => patchSocial(def.id, { subtitle: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Subtitle (AR)</span>
                      <input type="text" dir="rtl"
                        value={getSocialString(def.id, 'subtitleAr')}
                        onChange={(e) => patchSocial(def.id, { subtitleAr: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">External link (Instagram / Review URL)</span>
                      <input type="url"
                        value={getSocialString(def.id, 'primaryUrl')}
                        onChange={(e) => patchSocial(def.id, { primaryUrl: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Link button (EN)</span>
                      <input type="text"
                        value={getSocialString(def.id, 'primaryUrlLabel')}
                        onChange={(e) => patchSocial(def.id, { primaryUrlLabel: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">Link button (AR)</span>
                      <input type="text" dir="rtl"
                        value={getSocialString(def.id, 'primaryUrlLabelAr')}
                        onChange={(e) => patchSocial(def.id, { primaryUrlLabelAr: e.target.value })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">
                        Reward (coins) · default {def.reward}
                      </span>
                      <input type="number" min={0}
                        value={getSocialReward(def)}
                        onChange={(e) => patchSocial(def.id, { reward: Number(e.target.value) || 0 })}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#ff9500] font-semibold focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-medium text-[#86868b] uppercase tracking-wider block mb-1">
                        Repeat every (days) · 0 or empty = one-time only
                      </span>
                      <input type="number" min={0}
                        value={repeat ?? 0}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          patchSocial(def.id, { repeatEveryDays: n > 0 ? n : null });
                        }}
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#E879F9] focus:ring-2 focus:ring-[#E879F9]/20 outline-none" />
                    </label>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => patchSocial(def.id, { hidden: !hidden })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                        hidden
                          ? 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/25 hover:bg-[#ff3b30]/20'
                          : 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25 hover:bg-[#34c759]/20'
                      }`}
                    >
                      {hidden ? <><EyeOff size={13} /> Hidden</> : <><Eye size={13} /> Shown</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Task definitions grid ───────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-[#0071e3]" />
          Task Progress Today
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {TASK_DEFS.map((task, i) => {
            const completed = taskCompletionCounts[task.id] || 0;
            const claimed = taskClaimedCounts[task.id] || 0;
            const pct = todayDocs.length > 0 ? Math.round((completed / todayDocs.length) * 100) : 0;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${task.color}15` }}
                  >
                    <span style={{ color: task.color }}>{task.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1d1d1f] text-sm font-medium truncate">{task.title}</p>
                    <p className="text-[#86868b] text-xs">
                      Target: {task.target} &middot; <span className="text-[#ff9500]">{task.reward} coins</span>
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-[#f5f5f7] overflow-hidden mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.04 }}
                    className="h-full rounded-full"
                    style={{ background: task.color }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#86868b]">
                    {completed}/{todayDocs.length} players ({pct}%)
                  </span>
                  <span className="text-[#34c759]">
                    {claimed} claimed
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column: Leaderboard + Streaks ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Task completion leaderboard */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden">
          <div className="p-4 border-b border-[#e5e5ea]/60 flex items-center justify-between">
            <h3 className="font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Trophy size={18} className="text-[#ff9500]" />
              Task Leaderboard Today
            </h3>
            <span className="text-[#86868b] text-xs">{playerSummaries.length} players</span>
          </div>

          {playerSummaries.length === 0 ? (
            <div className="p-8 text-center text-[#86868b]">
              No task activity today
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#e5e5ea]/40">
                <AnimatePresence>
                  {displayedPlayers.map((p, i) => (
                    <motion.div
                      key={p.playerId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f5f7] transition-colors"
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-[#ff9500]/10 text-[#ff9500]' :
                        i === 1 ? 'bg-[#86868b]/10 text-[#86868b]' :
                        i === 2 ? 'bg-[#ff9500]/10 text-[#c77800]' :
                        'bg-[#f5f5f7] text-[#86868b]'
                      }`}>
                        {i + 1}
                      </div>

                      {/* Name */}
                      <span className="flex-1 text-[#1d1d1f] text-sm truncate">{p.username}</span>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-[#34c759]">
                          <CheckCircle2 size={13} />
                          {p.completed}/{TASK_DEFS.length}
                        </span>
                        <span className="flex items-center gap-1 text-[#ff9500]">
                          <Coins size={13} />
                          {p.coinsEarned}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {playerSummaries.length > 10 && (
                <button
                  onClick={() => setShowAllTasks(!showAllTasks)}
                  className="w-full py-2 text-xs text-[#86868b] hover:text-[#0071e3] transition-colors flex items-center justify-center gap-1 border-t border-[#e5e5ea]/40"
                >
                  {showAllTasks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showAllTasks ? 'Show Less' : `Show All (${playerSummaries.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Streak leaderboard */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden">
          <div className="p-4 border-b border-[#e5e5ea]/60 flex items-center justify-between">
            <h3 className="font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Flame size={18} className="text-[#ff9500]" />
              Login Streak Leaderboard
            </h3>
            <span className="text-[#86868b] text-xs">{streakBoard.length} players</span>
          </div>

          {streakBoard.length === 0 ? (
            <div className="p-8 text-center text-[#86868b]">
              No streaks recorded yet
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#e5e5ea]/40">
                <AnimatePresence>
                  {displayedStreaks.map((p, i) => (
                    <motion.div
                      key={p.uid}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[#f5f5f7] transition-colors"
                    >
                      {/* Rank */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-[#ff9500]/10 text-[#ff9500]' :
                        i === 1 ? 'bg-[#86868b]/10 text-[#86868b]' :
                        i === 2 ? 'bg-[#ff9500]/10 text-[#c77800]' :
                        'bg-[#f5f5f7] text-[#86868b]'
                      }`}>
                        {i + 1}
                      </div>

                      {/* Name */}
                      <span className="flex-1 text-[#1d1d1f] text-sm truncate">{p.username}</span>

                      {/* Streak */}
                      <div className="flex items-center gap-1.5">
                        <Flame size={14} className={`${
                          p.streak >= 7 ? 'text-[#ff9500]' :
                          p.streak >= 3 ? 'text-[#ff9f0a]' :
                          'text-[#86868b]'
                        }`} />
                        <span className={`text-sm font-semibold ${
                          p.streak >= 7 ? 'text-[#ff9500]' :
                          p.streak >= 3 ? 'text-[#ff9f0a]' :
                          'text-[#86868b]'
                        }`}>
                          {p.streak} day{p.streak !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {streakBoard.length > 10 && (
                <button
                  onClick={() => setShowAllStreaks(!showAllStreaks)}
                  className="w-full py-2 text-xs text-[#86868b] hover:text-[#0071e3] transition-colors flex items-center justify-center gap-1 border-t border-[#e5e5ea]/40"
                >
                  {showAllStreaks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showAllStreaks ? 'Show Less' : `Show All (${streakBoard.length})`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
