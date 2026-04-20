'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where
} from 'firebase/firestore';
import {
  Trophy, Plus, Edit3, Trash2, Award, Search, X, Save, User,
  Clock, Coins, Package, Users, Swords, Sparkles, Target, Gift, Star, Check
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditionType: 'playtime_hours' | 'coins_spent' | 'chests_opened' | 'games_played' | 'friends_count' | 'tournaments_won';
  threshold: number;
  rewardType: 'coins' | 'skin' | 'title';
  rewardAmount: number | string;
}

interface PlayerResult {
  id: string;
  username: string;
  achievements: string[];
}

const CONDITION_TYPES = [
  { value: 'playtime_hours', label: 'Playtime (hours)', icon: <Clock size={16} /> },
  { value: 'coins_spent', label: 'Coins Spent', icon: <Coins size={16} /> },
  { value: 'chests_opened', label: 'Chests Opened', icon: <Package size={16} /> },
  { value: 'games_played', label: 'Games Played', icon: <Target size={16} /> },
  { value: 'friends_count', label: 'Friends Count', icon: <Users size={16} /> },
  { value: 'tournaments_won', label: 'Tournaments Won', icon: <Swords size={16} /> },
];

const REWARD_TYPES = [
  { value: 'coins', label: 'Coins' },
  { value: 'skin', label: 'Skin' },
  { value: 'title', label: 'Title' },
];

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Play for 1 hour total', icon: '🥾', conditionType: 'playtime_hours', threshold: 1, rewardType: 'coins', rewardAmount: 50 },
  { id: 'social-butterfly', name: 'Social Butterfly', description: 'Make 5 friends', icon: '🦋', conditionType: 'friends_count', threshold: 5, rewardType: 'coins', rewardAmount: 100 },
  { id: 'treasure-hunter', name: 'Treasure Hunter', description: 'Open 10 chests', icon: '🗝️', conditionType: 'chests_opened', threshold: 10, rewardType: 'coins', rewardAmount: 150 },
  { id: 'ninja-master', name: 'Ninja Master', description: 'Play for 50 hours total', icon: '🥷', conditionType: 'playtime_hours', threshold: 50, rewardType: 'title', rewardAmount: 'Ninja Master' },
  { id: 'big-spender', name: 'Big Spender', description: 'Spend 5000 coins', icon: '💰', conditionType: 'coins_spent', threshold: 5000, rewardType: 'coins', rewardAmount: 500 },
  { id: 'tournament-champion', name: 'Tournament Champion', description: 'Win 1 tournament', icon: '🏆', conditionType: 'tournaments_won', threshold: 1, rewardType: 'coins', rewardAmount: 1000 },
];

const CONDITION_ICONS: Record<string, React.ReactNode> = {
  playtime_hours: <Clock size={14} className="text-[#0071e3]" />,
  coins_spent: <Coins size={14} className="text-[#ff9500]" />,
  chests_opened: <Package size={14} className="text-[#af52de]" />,
  games_played: <Target size={14} className="text-[#34c759]" />,
  friends_count: <Users size={14} className="text-[#5ac8fa]" />,
  tournaments_won: <Swords size={14} className="text-[#ff9500]" />,
};

export function AchievementsManager() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [earnedCounts, setEarnedCounts] = useState<Record<string, number>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formIcon, setFormIcon] = useState('🏅');
  const [formCondition, setFormCondition] = useState<Achievement['conditionType']>('playtime_hours');
  const [formThreshold, setFormThreshold] = useState(1);
  const [formRewardType, setFormRewardType] = useState<Achievement['rewardType']>('coins');
  const [formRewardAmount, setFormRewardAmount] = useState<number | string>(100);

  // Grant modal
  const [showGrant, setShowGrant] = useState(false);
  const [grantAchievementId, setGrantAchievementId] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState('');

  useEffect(() => {
    loadAchievements();
  }, []);

  async function loadAchievements() {
    setLoading(true);
    try {
      const configDoc = await getDoc(doc(db, 'config', 'achievements'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        setAchievements(data.achievements || []);
      } else {
        // Seed defaults
        await setDoc(doc(db, 'config', 'achievements'), { achievements: DEFAULT_ACHIEVEMENTS });
        setAchievements(DEFAULT_ACHIEVEMENTS);
      }

      // Count how many players earned each achievement
      const playersSnap = await getDocs(collection(db, 'players'));
      const counts: Record<string, number> = {};
      playersSnap.docs.forEach(d => {
        const playerAch = d.data().achievements as string[] | undefined;
        if (playerAch) {
          playerAch.forEach(achId => {
            counts[achId] = (counts[achId] || 0) + 1;
          });
        }
      });
      setEarnedCounts(counts);
    } catch (err) {
      console.error('Failed to load achievements:', err);
    }
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormIcon('🏅');
    setFormCondition('playtime_hours');
    setFormThreshold(1);
    setFormRewardType('coins');
    setFormRewardAmount(100);
    setEditingId(null);
  }

  function startEdit(ach: Achievement) {
    setFormName(ach.name);
    setFormDesc(ach.description);
    setFormIcon(ach.icon);
    setFormCondition(ach.conditionType);
    setFormThreshold(ach.threshold);
    setFormRewardType(ach.rewardType);
    setFormRewardAmount(ach.rewardAmount);
    setEditingId(ach.id);
    setShowCreate(true);
  }

  async function saveAchievement() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const id = editingId || formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const ach: Achievement = {
        id,
        name: formName.trim(),
        description: formDesc.trim(),
        icon: formIcon,
        conditionType: formCondition,
        threshold: formThreshold,
        rewardType: formRewardType,
        rewardAmount: formRewardAmount,
      };

      let updated: Achievement[];
      if (editingId) {
        updated = achievements.map(a => a.id === editingId ? ach : a);
      } else {
        // Check duplicate
        if (achievements.some(a => a.id === id)) {
          alert('An achievement with this ID already exists.');
          setSaving(false);
          return;
        }
        updated = [...achievements, ach];
      }

      await setDoc(doc(db, 'config', 'achievements'), { achievements: updated });
      setAchievements(updated);
      setShowCreate(false);
      resetForm();
    } catch (err) {
      console.error('Failed to save achievement:', err);
    }
    setSaving(false);
  }

  async function deleteAchievement(id: string) {
    if (!confirm('Delete this achievement? Players who earned it will keep it in their records.')) return;
    try {
      const updated = achievements.filter(a => a.id !== id);
      await setDoc(doc(db, 'config', 'achievements'), { achievements: updated });
      setAchievements(updated);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function searchPlayers() {
    if (!playerSearch.trim()) return;
    setSearchLoading(true);
    try {
      const snap = await getDocs(collection(db, 'players'));
      const results: PlayerResult[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        const username = (data.username || '').toLowerCase();
        if (username.includes(playerSearch.toLowerCase())) {
          results.push({
            id: d.id,
            username: data.username || 'Unknown',
            achievements: data.achievements || [],
          });
        }
      });
      setPlayerResults(results.slice(0, 10));
    } catch (err) {
      console.error('Search failed:', err);
    }
    setSearchLoading(false);
  }

  async function grantToPlayer(playerId: string, playerUsername: string) {
    if (!grantAchievementId) return;
    try {
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) return;

      const current = playerSnap.data().achievements || [];
      if (current.includes(grantAchievementId)) {
        setGrantSuccess(`${playerUsername} already has this achievement`);
        setTimeout(() => setGrantSuccess(''), 2000);
        return;
      }

      await updateDoc(playerRef, {
        achievements: [...current, grantAchievementId],
      });

      // Update local earned counts
      setEarnedCounts(prev => ({
        ...prev,
        [grantAchievementId]: (prev[grantAchievementId] || 0) + 1,
      }));

      // Update player results to reflect
      setPlayerResults(prev => prev.map(p =>
        p.id === playerId ? { ...p, achievements: [...p.achievements, grantAchievementId] } : p
      ));

      setGrantSuccess(`Granted to ${playerUsername}!`);
      setTimeout(() => setGrantSuccess(''), 2000);
    } catch (err) {
      console.error('Grant failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <Trophy size={32} className="text-[#0071e3]" />
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
            <Trophy size={24} className="text-[#0071e3]" /> Achievements Manager
            <HelpTip title={{ en: 'Achievements', ar: 'الإنجازات' }}
              ar={<p>شارات الإنجازات التي يفتحها اللاعبون. حدد الاسم، الأيقونة، شرط الإلغاء والمكافأة.</p>}>
              <p>Badges players unlock via in-game milestones. Set name, icon, trigger condition, and reward.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm mt-1">Create and manage player achievements and badges.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowGrant(true); setGrantAchievementId(achievements[0]?.id || ''); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#d2d2d7] text-[#af52de] text-sm font-medium hover:bg-[#f5f5f7] transition-colors"
          >
            <Gift size={16} /> Grant to Player
          </button>
          <button
            onClick={() => { resetForm(); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0071e3] text-white text-sm font-medium hover:bg-[#0077ED] transition-colors"
          >
            <Plus size={16} /> Create Achievement
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <p className="text-2xl font-semibold text-[#0071e3]">{achievements.length}</p>
          <p className="text-xs text-[#86868b]">Total Achievements</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <p className="text-2xl font-semibold text-[#ff9500]">
            {Object.values(earnedCounts).reduce((s, c) => s + c, 0)}
          </p>
          <p className="text-xs text-[#86868b]">Total Earned (all players)</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <p className="text-2xl font-semibold text-[#af52de]">
            {achievements.filter(a => (earnedCounts[a.id] || 0) > 0).length}
          </p>
          <p className="text-xs text-[#86868b]">Achievements Unlocked</p>
        </div>
      </div>

      {/* Achievement Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {achievements.map((ach, i) => {
          const condLabel = CONDITION_TYPES.find(c => c.value === ach.conditionType)?.label || ach.conditionType;
          const earned = earnedCounts[ach.id] || 0;
          return (
            <motion.div
              key={ach.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#f5f5f7] flex items-center justify-center text-2xl border border-[#e5e5ea]/60">
                    {ach.icon}
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-[#1d1d1f]">{ach.name}</h4>
                    <p className="text-xs text-[#86868b]">{ach.description}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(ach)}
                    className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => deleteAchievement(ach.id)}
                    className="p-1.5 rounded-lg hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-[#86868b]">
                  {CONDITION_ICONS[ach.conditionType]} {condLabel}
                </div>
                <div className="text-xs font-semibold text-[#1d1d1f]">
                  {ach.threshold.toLocaleString()}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#e5e5ea]/60">
                <div className="flex items-center gap-1.5">
                  <Star size={12} className="text-[#ff9500]" />
                  <span className="text-xs text-[#86868b]">
                    Reward: <span className="text-[#ff9500]">
                      {ach.rewardType === 'coins' ? `${ach.rewardAmount} coins` :
                       ach.rewardType === 'title' ? `"${ach.rewardAmount}"` :
                       `Skin: ${ach.rewardAmount}`}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#86868b]">
                  <Award size={12} />
                  {earned} earned
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center"
            onClick={() => { setShowCreate(false); resetForm(); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[520px] max-w-[90vw] bg-white rounded-2xl p-7 shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editingId ? 'Edit Achievement' : 'Create Achievement'}
                </h3>
                <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Icon + Name */}
                <div className="flex gap-3">
                  <div>
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Icon</label>
                    <input
                      value={formIcon}
                      onChange={e => setFormIcon(e.target.value)}
                      className="w-16 h-11 text-center text-2xl bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Name</label>
                    <input
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="Achievement name"
                      className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Description</label>
                  <input
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="What the player needs to do"
                    className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                  />
                </div>

                {/* Condition */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Condition Type</label>
                    <select
                      value={formCondition}
                      onChange={e => setFormCondition(e.target.value as Achievement['conditionType'])}
                      className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none appearance-none"
                    >
                      {CONDITION_TYPES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Threshold</label>
                    <input
                      type="number"
                      value={formThreshold}
                      onChange={e => setFormThreshold(Number(e.target.value))}
                      min={1}
                      className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    />
                  </div>
                </div>

                {/* Reward */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Reward Type</label>
                    <select
                      value={formRewardType}
                      onChange={e => setFormRewardType(e.target.value as Achievement['rewardType'])}
                      className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none appearance-none"
                    >
                      {REWARD_TYPES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">
                      {formRewardType === 'coins' ? 'Coin Amount' : formRewardType === 'title' ? 'Title Text' : 'Skin ID'}
                    </label>
                    <input
                      type={formRewardType === 'coins' ? 'number' : 'text'}
                      value={formRewardAmount}
                      onChange={e => setFormRewardAmount(formRewardType === 'coins' ? Number(e.target.value) : e.target.value)}
                      placeholder={formRewardType === 'coins' ? '100' : formRewardType === 'title' ? 'Ninja Master' : 'skin-id'}
                      className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea]/60">
                  <p className="text-[10px] text-[#86868b] uppercase tracking-wide mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{formIcon}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#1d1d1f]">{formName || 'Achievement Name'}</p>
                      <p className="text-xs text-[#86868b]">{formDesc || 'Description'}</p>
                    </div>
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={saveAchievement}
                  disabled={saving || !formName.trim()}
                  className="w-full py-3 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={16} /> {editingId ? 'Update' : 'Create'} Achievement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grant Achievement Modal */}
      <AnimatePresence>
        {showGrant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center"
            onClick={() => { setShowGrant(false); setPlayerSearch(''); setPlayerResults([]); setGrantSuccess(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[480px] max-w-[90vw] bg-white rounded-2xl p-7 shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#af52de] flex items-center gap-2">
                  <Gift size={20} /> Grant Achievement
                </h3>
                <button onClick={() => { setShowGrant(false); setPlayerSearch(''); setPlayerResults([]); setGrantSuccess(''); }} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Select achievement */}
              <div className="mb-4">
                <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Achievement</label>
                <select
                  value={grantAchievementId}
                  onChange={e => setGrantAchievementId(e.target.value)}
                  className="w-full h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#af52de] focus:ring-2 focus:ring-[#af52de]/20 outline-none appearance-none"
                >
                  {achievements.map(a => (
                    <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Search player */}
              <div className="mb-4">
                <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Search Player</label>
                <div className="flex gap-2">
                  <input
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchPlayers()}
                    placeholder="Type username..."
                    className="flex-1 h-11 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 text-sm text-[#1d1d1f] focus:border-[#af52de] focus:ring-2 focus:ring-[#af52de]/20 outline-none"
                  />
                  <button
                    onClick={searchPlayers}
                    disabled={searchLoading}
                    className="px-4 h-11 rounded-xl border border-[#d2d2d7] text-[#af52de] hover:bg-[#f5f5f7] transition-colors"
                  >
                    <Search size={16} />
                  </button>
                </div>
              </div>

              {/* Success message */}
              {grantSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 rounded-xl bg-[#34c759]/10 border border-[#34c759]/20 text-[#34c759] text-sm flex items-center gap-2"
                >
                  <Check size={16} /> {grantSuccess}
                </motion.div>
              )}

              {/* Player results */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {searchLoading ? (
                  <div className="text-center py-4">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">
                      <Search size={20} className="text-[#86868b]" />
                    </motion.div>
                  </div>
                ) : playerResults.length > 0 ? (
                  playerResults.map(p => {
                    const alreadyHas = p.achievements.includes(grantAchievementId);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebf0] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#af52de]/10 flex items-center justify-center">
                            <User size={14} className="text-[#af52de]" />
                          </div>
                          <span className="text-sm text-[#1d1d1f]">{p.username}</span>
                        </div>
                        {alreadyHas ? (
                          <span className="flex items-center gap-1 text-xs text-[#34c759]">
                            <Check size={12} /> Has it
                          </span>
                        ) : (
                          <button
                            onClick={() => grantToPlayer(p.id, p.username)}
                            className="px-3 py-1.5 rounded-lg bg-[#0071e3] text-white text-xs font-medium hover:bg-[#0077ED] transition-colors"
                          >
                            Grant
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : playerSearch && !searchLoading ? (
                  <p className="text-center py-4 text-sm text-[#86868b]">No players found</p>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
