'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, collection, getDocs,
} from 'firebase/firestore';
import { HelpTip } from './HelpTip';
import {
  Award, Plus, Pencil, Trash2, RefreshCw, Coins, Clock, Gift, Package,
  Save, X, ChevronUp, ChevronDown, Users, TrendingUp, Target, Star,
  Sparkles, Shield,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface Milestone {
  id: string;
  hours: number;
  rewardType: 'coins' | 'skin' | 'voucher' | 'free_time';
  rewardAmount: number;
  name: string;
  description: string;
}

interface PlayerProgress {
  uid: string;
  username: string;
  totalPlaytime: number; // minutes
  nextMilestone: Milestone | null;
  hoursRemaining: number;
  completedCount: number;
}

const REWARD_TYPE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  coins:     { label: 'Coins',     color: '#ff9500', icon: <Coins size={16} /> },
  skin:      { label: 'Skin',      color: '#A855F7', icon: <Sparkles size={16} /> },
  voucher:   { label: 'Voucher',   color: '#0071e3', icon: <Gift size={16} /> },
  free_time: { label: 'Free Time', color: '#34c759', icon: <Clock size={16} /> },
};

const DEFAULT_MILESTONES: Milestone[] = [
  { id: 'ms_10',  hours: 10,  rewardType: 'coins', rewardAmount: 50,   name: 'Rookie Ninja',    description: 'Play for 10 hours' },
  { id: 'ms_25',  hours: 25,  rewardType: 'coins', rewardAmount: 150,  name: 'Rising Warrior',  description: 'Play for 25 hours' },
  { id: 'ms_50',  hours: 50,  rewardType: 'coins', rewardAmount: 500,  name: 'Shadow Master',   description: 'Play for 50 hours' },
  { id: 'ms_100', hours: 100, rewardType: 'coins', rewardAmount: 1000, name: 'Ninja Legend',    description: 'Play for 100 hours + free chest' },
];

function generateId(): string {
  return 'ms_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function LoyaltyProgram() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [players, setPlayers] = useState<PlayerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formHours, setFormHours] = useState('');
  const [formRewardType, setFormRewardType] = useState<Milestone['rewardType']>('coins');
  const [formRewardAmount, setFormRewardAmount] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Fetch data ────────────────────────────────────────────────
  const fetchData = async () => {
    setRefreshing(true);
    try {
      // Get loyalty config
      const configSnap = await getDoc(doc(db, 'config', 'loyalty'));
      let ms: Milestone[] = [];
      if (configSnap.exists()) {
        ms = (configSnap.data().milestones || []) as Milestone[];
      } else {
        // Seed defaults
        ms = DEFAULT_MILESTONES;
        await setDoc(doc(db, 'config', 'loyalty'), { milestones: ms });
      }
      ms.sort((a, b) => a.hours - b.hours);
      setMilestones(ms);

      // Get players
      const playersSnap = await getDocs(collection(db, 'players'));
      const progressList: PlayerProgress[] = [];
      playersSnap.docs.forEach(d => {
        const data = d.data();
        const totalMinutes = data.totalPlaytime || 0;
        const totalHours = totalMinutes / 60;

        // Find next milestone
        const sorted = [...ms].sort((a, b) => a.hours - b.hours);
        let nextMs: Milestone | null = null;
        let completedCount = 0;
        for (const m of sorted) {
          if (totalHours >= m.hours) {
            completedCount++;
          } else if (!nextMs) {
            nextMs = m;
          }
        }

        progressList.push({
          uid: d.id,
          username: data.username || d.id,
          totalPlaytime: totalMinutes,
          nextMilestone: nextMs,
          hoursRemaining: nextMs ? Math.max(0, nextMs.hours - totalHours) : 0,
          completedCount,
        });
      });

      progressList.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
      setPlayers(progressList);
    } catch (err) {
      console.error('Failed to fetch loyalty data:', err);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Save milestones ───────────────────────────────────────────
  const saveMilestones = async (updated: Milestone[]) => {
    setSaving(true);
    try {
      const sorted = [...updated].sort((a, b) => a.hours - b.hours);
      await setDoc(doc(db, 'config', 'loyalty'), { milestones: sorted });
      setMilestones(sorted);
    } catch (err) {
      console.error('Failed to save milestones:', err);
    }
    setSaving(false);
  };

  // ── Form handlers ────────────────────────────────────────────
  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormHours('');
    setFormRewardType('coins');
    setFormRewardAmount('');
    setFormName('');
    setFormDesc('');
  };

  const openEditForm = (ms: Milestone) => {
    setEditingId(ms.id);
    setFormHours(ms.hours.toString());
    setFormRewardType(ms.rewardType);
    setFormRewardAmount(ms.rewardAmount.toString());
    setFormName(ms.name);
    setFormDesc(ms.description);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const hours = parseFloat(formHours);
    const amount = parseFloat(formRewardAmount);
    if (!hours || !amount || !formName.trim()) return;

    const milestone: Milestone = {
      id: editingId || generateId(),
      hours,
      rewardType: formRewardType,
      rewardAmount: amount,
      name: formName.trim(),
      description: formDesc.trim(),
    };

    let updated: Milestone[];
    if (editingId) {
      updated = milestones.map(m => m.id === editingId ? milestone : m);
    } else {
      updated = [...milestones, milestone];
    }

    await saveMilestones(updated);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const updated = milestones.filter(m => m.id !== id);
    await saveMilestones(updated);
    setDeleteConfirm(null);
    fetchData();
  };

  // ── Computed ──────────────────────────────────────────────────
  const playersCloseToMilestone = useMemo(() => {
    return players.filter(p => p.nextMilestone && p.hoursRemaining <= 5 && p.hoursRemaining > 0);
  }, [players]);

  const totalPlayersWithProgress = players.filter(p => p.completedCount > 0).length;
  const maxCompletedPlayer = players.length > 0
    ? players.reduce((a, b) => a.completedCount > b.completedCount ? a : b)
    : null;

  const displayedPlayers = showAllPlayers ? players : players.slice(0, 12);

  // ── Render ────────────────────────────────────────────────────
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
          <Award className="text-[#0071e3]" size={28} />
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Loyalty Program
            <HelpTip title={{ en: 'Loyalty Program', ar: 'برنامج الولاء' }}
              ar={<p>مراحل ولاء متدرّجة (برونزي/فضي/ذهبي...). حدد مقاطع الإنفاق والمميزات لكل مرحلة. الترقية تحدث تلقائياً.</p>}>
              <p>Tiered loyalty (Bronze/Silver/Gold…). Set spend milestones + perks per tier. Upgrades happen automatically.</p>
            </HelpTip>
          </h2>
        </div>
        <div className="flex items-center gap-2">
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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0071e3] text-white font-medium hover:bg-[#0077ED] transition-all"
          >
            <Plus size={16} />
            Add Milestone
          </motion.button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Milestones', value: milestones.length, icon: <Target size={20} />, color: '#0071e3' },
          { label: 'Players Reached', value: totalPlayersWithProgress, icon: <Users size={20} />, color: '#A855F7' },
          { label: 'Close to Next', value: playersCloseToMilestone.length, icon: <TrendingUp size={20} />, color: '#ff9500' },
          { label: 'Top Achiever', value: maxCompletedPlayer ? `${maxCompletedPlayer.completedCount}/${milestones.length}` : '-', icon: <Star size={20} />, color: '#ff9500' },
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

      {/* ── Create/Edit form ────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  {editingId ? <Pencil size={18} className="text-[#ff9500]" /> : <Plus size={18} className="text-[#0071e3]" />}
                  {editingId ? 'Edit Milestone' : 'New Milestone'}
                </h3>
                <button onClick={resetForm} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Name */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Shadow Master"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Hours threshold */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Hours Threshold</label>
                  <input
                    type="number"
                    value={formHours}
                    onChange={e => setFormHours(e.target.value)}
                    placeholder="e.g. 50"
                    min={1}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Reward type */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Reward Type</label>
                  <select
                    value={formRewardType}
                    onChange={e => setFormRewardType(e.target.value as Milestone['rewardType'])}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  >
                    {Object.entries(REWARD_TYPE_LABELS).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>

                {/* Reward amount */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Reward Amount</label>
                  <input
                    type="number"
                    value={formRewardAmount}
                    onChange={e => setFormRewardAmount(e.target.value)}
                    placeholder="e.g. 500"
                    min={1}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Description</label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="e.g. Play for 50 hours to unlock"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSubmit}
                  disabled={saving || !formName.trim() || !formHours || !formRewardAmount}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0071e3] text-white font-medium hover:bg-[#0077ED] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : editingId ? 'Update Milestone' : 'Create Milestone'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Milestones list ─────────────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
          <Shield size={18} className="text-[#0071e3]" />
          Milestones ({milestones.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {milestones.map((ms, i) => {
            const rewardInfo = REWARD_TYPE_LABELS[ms.rewardType] || REWARD_TYPE_LABELS.coins;
            const playersReached = players.filter(p => (p.totalPlaytime / 60) >= ms.hours).length;

            return (
              <motion.div
                key={ms.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:border-[#d2d2d7] transition-colors relative group"
              >
                {/* Actions */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditForm(ms)}
                    className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#ff9500] transition-all"
                  >
                    <Pencil size={14} />
                  </button>
                  {deleteConfirm === ms.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(ms.id)}
                        className="px-2 py-1 rounded-lg bg-[#fff5f5] text-[#ff3b30] text-xs hover:bg-red-100 transition-all"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(ms.id)}
                      className="p-1.5 rounded-lg hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Hours badge */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold"
                    style={{ background: `${rewardInfo.color}15`, color: rewardInfo.color }}
                  >
                    {ms.hours}h
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1d1d1f] text-sm font-medium truncate">{ms.name}</p>
                    <p className="text-[#86868b] text-xs truncate">{ms.description}</p>
                  </div>
                </div>

                {/* Reward */}
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[#f5f5f7]">
                  <span style={{ color: rewardInfo.color }}>{rewardInfo.icon}</span>
                  <span className="text-[#1d1d1f] text-sm font-medium">{ms.rewardAmount}</span>
                  <span className="text-[#86868b] text-xs">{rewardInfo.label}</span>
                </div>

                {/* Players reached */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#86868b] flex items-center gap-1">
                    <Users size={12} />
                    {playersReached} reached
                  </span>
                  <span className="text-[#86868b]">
                    {players.length > 0 ? Math.round((playersReached / players.length) * 100) : 0}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-[#f5f5f7] overflow-hidden mt-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${players.length > 0 ? (playersReached / players.length) * 100 : 0}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className="h-full rounded-full"
                    style={{ background: rewardInfo.color }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Players close to next milestone ─────────────────── */}
      {playersCloseToMilestone.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-[#ff9500]" />
            Almost There! ({playersCloseToMilestone.length} players within 5h)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {playersCloseToMilestone.slice(0, 6).map((p, i) => (
              <motion.div
                key={p.uid}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#ff9500]/20 hover:border-[#ff9500]/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#1d1d1f] font-medium text-sm truncate">{p.username}</span>
                  <span className="text-[#34c759] text-xs">{p.completedCount}/{milestones.length}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-[#ff9500]" />
                  <span className="text-[#86868b] text-xs">
                    {(p.totalPlaytime / 60).toFixed(1)}h played
                  </span>
                  <span className="text-[#d2d2d7]">|</span>
                  <span className="text-[#ff9500] text-xs font-medium">
                    {p.hoursRemaining.toFixed(1)}h to &quot;{p.nextMilestone?.name}&quot;
                  </span>
                </div>
                {p.nextMilestone && (
                  <div className="h-1.5 rounded-full bg-[#f5f5f7] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, ((p.totalPlaytime / 60) / p.nextMilestone.hours) * 100)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      className="h-full rounded-full bg-[#ff9500]"
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── All players progress ────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden">
        <div className="p-4 border-b border-[#e5e5ea]/60 flex items-center justify-between">
          <h3 className="font-semibold text-[#1d1d1f] flex items-center gap-2">
            <Users size={18} className="text-[#A855F7]" />
            Player Progress
          </h3>
          <span className="text-[#86868b] text-xs">{players.length} players</span>
        </div>

        {players.length === 0 ? (
          <div className="p-8 text-center text-[#86868b]">No players found</div>
        ) : (
          <>
            <div className="divide-y divide-[#e5e5ea]/40">
              {displayedPlayers.map((p, i) => (
                <div key={p.uid} className="px-4 py-3 flex items-center gap-4 hover:bg-[#f5f5f7] transition-colors">
                  <span className="text-[#86868b] text-xs w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1d1d1f] text-sm truncate">{p.username}</p>
                    <p className="text-[#86868b] text-xs">
                      {(p.totalPlaytime / 60).toFixed(1)}h played &middot; {p.completedCount}/{milestones.length} milestones
                    </p>
                  </div>
                  {p.nextMilestone ? (
                    <div className="text-right">
                      <p className="text-[#ff9500] text-xs font-medium">{p.hoursRemaining.toFixed(1)}h left</p>
                      <p className="text-[#86868b] text-[10px]">{p.nextMilestone.name}</p>
                    </div>
                  ) : (
                    <span className="text-[#34c759] text-xs flex items-center gap-1">
                      <Star size={12} /> All complete
                    </span>
                  )}
                </div>
              ))}
            </div>

            {players.length > 12 && (
              <button
                onClick={() => setShowAllPlayers(!showAllPlayers)}
                className="w-full py-3 text-center text-[#86868b] hover:text-[#1d1d1f] text-xs flex items-center justify-center gap-1 border-t border-[#e5e5ea]/40 transition-colors"
              >
                {showAllPlayers ? <><ChevronUp size={14} /> Show less</> : <><ChevronDown size={14} /> Show all {players.length}</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
