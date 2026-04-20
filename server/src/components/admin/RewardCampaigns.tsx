'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, Timestamp,
} from 'firebase/firestore';
import { HelpTip } from './HelpTip';
import {
  Megaphone, Plus, Pencil, Trash2, RefreshCw, Coins, Clock, Gift, Package,
  Save, X, Users, TrendingUp, Play, Pause, Zap, Calendar, Star,
  ChevronDown, ChevronUp, Sparkles, Target, CheckCircle2, XCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  type: 'double_xp' | 'bonus_coins' | 'free_chest_login' | 'first_n_logins';
  startDate: string; // ISO date
  endDate: string;
  rewardType: string;
  rewardAmount: number;
  maxRecipients: number;
  currentRecipients: number;
  active: boolean;
  recipients: string[];
}

const CAMPAIGN_TYPES: Record<string, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
  double_xp:       { label: 'Double XP',              color: '#A855F7', icon: <Zap size={16} />,      desc: 'All players earn 2x XP' },
  bonus_coins:     { label: 'Bonus Coins',             color: '#ff9500', icon: <Coins size={16} />,    desc: 'Extra coins on login/play' },
  free_chest_login:{ label: 'Free Chest on Login',     color: '#34c759', icon: <Package size={16} />,  desc: 'Login to claim a free chest' },
  first_n_logins:  { label: 'First N Logins Reward',   color: '#0071e3', icon: <Gift size={16} />,     desc: 'First N players to login get reward' },
};

interface QuickTemplate {
  name: string;
  type: Campaign['type'];
  rewardType: string;
  rewardAmount: number;
  maxRecipients: number;
  durationDays: number;
  color: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  { name: 'Weekend Double XP',         type: 'double_xp',       rewardType: 'xp',    rewardAmount: 2,   maxRecipients: 0,  durationDays: 2,  color: '#A855F7' },
  { name: 'Happy Monday 50 Coins',     type: 'bonus_coins',     rewardType: 'coins', rewardAmount: 50,  maxRecipients: 0,  durationDays: 1,  color: '#ff9500' },
  { name: 'First 10 Logins = Free Chest', type: 'first_n_logins', rewardType: 'chest', rewardAmount: 1,   maxRecipients: 10, durationDays: 1,  color: '#0071e3' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCampaignStatus(c: Campaign): 'active' | 'upcoming' | 'ended' | 'paused' {
  const now = new Date();
  const start = new Date(c.startDate);
  const end = new Date(c.endDate);
  if (!c.active) return 'paused';
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  if (c.maxRecipients > 0 && c.currentRecipients >= c.maxRecipients) return 'ended';
  return 'active';
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:   { bg: 'bg-[#34c759]/10', text: 'text-[#34c759]', label: 'ACTIVE' },
  upcoming: { bg: 'bg-[#0071e3]/10', text: 'text-[#0071e3]', label: 'UPCOMING' },
  ended:    { bg: 'bg-[#f5f5f7]',    text: 'text-[#86868b]', label: 'ENDED' },
  paused:   { bg: 'bg-[#ff9500]/10', text: 'text-[#ff9500]', label: 'PAUSED' },
};

export function RewardCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<Campaign['type']>('bonus_coins');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formRewardType, setFormRewardType] = useState('coins');
  const [formRewardAmount, setFormRewardAmount] = useState('');
  const [formMaxRecipients, setFormMaxRecipients] = useState('0');

  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'ended' | 'paused'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Fetch data (real-time) ────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'campaigns'), orderBy('startDate', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: Campaign[] = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        type: d.data().type || 'bonus_coins',
        startDate: d.data().startDate || '',
        endDate: d.data().endDate || '',
        rewardType: d.data().rewardType || 'coins',
        rewardAmount: d.data().rewardAmount || 0,
        maxRecipients: d.data().maxRecipients || 0,
        currentRecipients: d.data().currentRecipients || 0,
        active: d.data().active !== false,
        recipients: d.data().recipients || [],
      }));
      setCampaigns(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Form handlers ────────────────────────────────────────────
  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormType('bonus_coins');
    setFormStartDate('');
    setFormEndDate('');
    setFormRewardType('coins');
    setFormRewardAmount('');
    setFormMaxRecipients('0');
  };

  const openEditForm = (c: Campaign) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormType(c.type);
    setFormStartDate(c.startDate);
    setFormEndDate(c.endDate);
    setFormRewardType(c.rewardType);
    setFormRewardAmount(c.rewardAmount.toString());
    setFormMaxRecipients(c.maxRecipients.toString());
    setShowForm(true);
  };

  const applyTemplate = (t: QuickTemplate) => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + t.durationDays);

    setFormName(t.name);
    setFormType(t.type);
    setFormStartDate(today.toISOString().split('T')[0]);
    setFormEndDate(end.toISOString().split('T')[0]);
    setFormRewardType(t.rewardType);
    setFormRewardAmount(t.rewardAmount.toString());
    setFormMaxRecipients(t.maxRecipients.toString());
    setEditingId(null);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim() || !formStartDate || !formEndDate || !formRewardAmount) return;
    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        type: formType,
        startDate: formStartDate,
        endDate: formEndDate,
        rewardType: formRewardType,
        rewardAmount: parseFloat(formRewardAmount),
        maxRecipients: parseInt(formMaxRecipients) || 0,
        active: true,
      };

      if (editingId) {
        await updateDoc(doc(db, 'campaigns', editingId), data);
      } else {
        await addDoc(collection(db, 'campaigns'), {
          ...data,
          currentRecipients: 0,
          recipients: [],
        });
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save campaign:', err);
    }
    setSaving(false);
  };

  const toggleActive = async (c: Campaign) => {
    try {
      await updateDoc(doc(db, 'campaigns', c.id), { active: !c.active });
    } catch (err) {
      console.error('Failed to toggle campaign:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'campaigns', id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  // ── Computed ──────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts = { active: 0, upcoming: 0, ended: 0, paused: 0 };
    campaigns.forEach(c => { counts[getCampaignStatus(c)]++; });
    return counts;
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter(c => getCampaignStatus(c) === filter);
  }, [campaigns, filter]);

  const totalRewardsGiven = campaigns.reduce((sum, c) => sum + c.currentRecipients, 0);
  const totalBenefited = new Set(campaigns.flatMap(c => c.recipients)).size;

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
          <Megaphone className="text-[#0071e3]" size={28} />
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Reward Campaigns
            <HelpTip title={{ en: 'Reward Campaigns', ar: 'حملات المكافآت' }}
              ar={<p>حملات مكافآت محدودة الوقت (توكنز مضاعفة في عطلة نهاية الأسبوع، دروبات بونس). جدوِل، فعّل، أوقف.</p>}>
              <p>Time-limited reward boosts (2× token weekend, bonus drops). Schedule, activate, or pause.</p>
            </HelpTip>
          </h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0071e3] text-white font-medium hover:bg-[#0077ED] transition-all"
        >
          <Plus size={16} />
          New Campaign
        </motion.button>
      </div>

      {/* ── Summary cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Campaigns', value: statusCounts.active, icon: <Zap size={20} />, color: '#34c759' },
          { label: 'Total Campaigns', value: campaigns.length, icon: <Megaphone size={20} />, color: '#A855F7' },
          { label: 'Players Benefited', value: totalBenefited, icon: <Users size={20} />, color: '#ff9500' },
          { label: 'Rewards Given', value: totalRewardsGiven, icon: <Gift size={20} />, color: '#0071e3' },
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

      {/* ── Quick Templates ─────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-[#86868b] mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-[#ff9500]" />
          Quick Templates
        </h3>
        <div className="flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((t, i) => (
            <motion.button
              key={t.name}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => applyTemplate(t)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#d2d2d7] bg-white hover:bg-[#f5f5f7] transition-all text-sm text-[#1d1d1f]"
            >
              <span style={{ color: t.color }}>{CAMPAIGN_TYPES[t.type]?.icon}</span>
              {t.name}
            </motion.button>
          ))}
        </div>
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
                  {editingId ? 'Edit Campaign' : 'New Campaign'}
                </h3>
                <button onClick={resetForm} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Name */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Campaign Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Weekend Double XP"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Campaign Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as Campaign['type'])}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  >
                    {Object.entries(CAMPAIGN_TYPES).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>

                {/* Reward type */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Reward Type</label>
                  <select
                    value={formRewardType}
                    onChange={e => setFormRewardType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  >
                    <option value="coins">Coins</option>
                    <option value="xp">XP</option>
                    <option value="chest">Chest</option>
                    <option value="voucher">Voucher</option>
                    <option value="free_time">Free Time</option>
                  </select>
                </div>

                {/* Reward amount */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Reward Amount</label>
                  <input
                    type="number"
                    value={formRewardAmount}
                    onChange={e => setFormRewardAmount(e.target.value)}
                    placeholder="e.g. 50"
                    min={1}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Start date */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* End date */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>

                {/* Max recipients */}
                <div>
                  <label className="text-[#86868b] text-xs uppercase tracking-wider mb-1 block">Max Recipients (0 = unlimited)</label>
                  <input
                    type="number"
                    value={formMaxRecipients}
                    onChange={e => setFormMaxRecipients(e.target.value)}
                    placeholder="0"
                    min={0}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Type description */}
              {CAMPAIGN_TYPES[formType] && (
                <div className="mt-3 px-4 py-2.5 rounded-xl bg-[#f5f5f7] flex items-center gap-2">
                  <span style={{ color: CAMPAIGN_TYPES[formType].color }}>{CAMPAIGN_TYPES[formType].icon}</span>
                  <span className="text-[#86868b] text-xs">{CAMPAIGN_TYPES[formType].desc}</span>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSubmit}
                  disabled={saving || !formName.trim() || !formStartDate || !formEndDate || !formRewardAmount}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0071e3] text-white font-medium hover:bg-[#0077ED] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : editingId ? 'Update Campaign' : 'Create Campaign'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter tabs ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'active', 'upcoming', 'paused', 'ended'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider font-medium transition-all border ${
              filter === f
                ? 'bg-[#0071e3]/10 border-[#0071e3]/30 text-[#0071e3]'
                : 'bg-white border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:border-[#86868b]'
            }`}
          >
            {f}
            {f !== 'all' && (
              <span className="ml-1.5 opacity-60">
                {statusCounts[f as keyof typeof statusCounts] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Campaigns list ──────────────────────────────────── */}
      <div className="space-y-3">
        {filteredCampaigns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 text-center text-[#86868b]">
            {filter === 'all' ? 'No campaigns yet. Create your first one!' : `No ${filter} campaigns`}
          </div>
        ) : (
          filteredCampaigns.map((c, i) => {
            const status = getCampaignStatus(c);
            const statusStyle = STATUS_STYLES[status];
            const typeInfo = CAMPAIGN_TYPES[c.type] || CAMPAIGN_TYPES.bonus_coins;
            const recipientPct = c.maxRecipients > 0
              ? Math.min(100, Math.round((c.currentRecipients / c.maxRecipients) * 100))
              : null;

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#d2d2d7] transition-colors overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Type icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${typeInfo.color}15`, color: typeInfo.color }}
                    >
                      {typeInfo.icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-[#1d1d1f] font-medium text-sm truncate">{c.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${statusStyle.bg} ${statusStyle.text}`}>
                          {statusStyle.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#86868b] mb-2 flex-wrap">
                        <span className="flex items-center gap-1" style={{ color: typeInfo.color }}>
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(c.startDate)} - {formatDate(c.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Gift size={12} />
                          {c.rewardAmount} {c.rewardType}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-[#86868b] flex items-center gap-1">
                          <Users size={12} className="text-[#A855F7]" />
                          {c.currentRecipients} recipients
                        </span>
                        {c.maxRecipients > 0 && (
                          <span className="text-[#86868b]">
                            / {c.maxRecipients} max
                          </span>
                        )}
                        {c.maxRecipients === 0 && (
                          <span className="text-[#86868b]">unlimited</span>
                        )}
                      </div>

                      {/* Progress bar for limited campaigns */}
                      {recipientPct !== null && (
                        <div className="h-1.5 rounded-full bg-[#f5f5f7] overflow-hidden mt-2 max-w-xs">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${recipientPct}%` }}
                            transition={{ duration: 0.6 }}
                            className="h-full rounded-full"
                            style={{ background: recipientPct >= 100 ? '#ff3b30' : typeInfo.color }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => toggleActive(c)}
                        title={c.active ? 'Pause' : 'Resume'}
                        className={`p-2 rounded-xl transition-all ${
                          c.active
                            ? 'bg-[#ff9500]/10 text-[#ff9500] hover:bg-[#ff9500]/20'
                            : 'bg-[#34c759]/10 text-[#34c759] hover:bg-[#34c759]/20'
                        }`}
                      >
                        {c.active ? <Pause size={16} /> : <Play size={16} />}
                      </motion.button>
                      <button
                        onClick={() => openEditForm(c)}
                        className="p-2 rounded-xl hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#ff9500] transition-all"
                      >
                        <Pencil size={16} />
                      </button>
                      {deleteConfirm === c.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="px-2 py-1.5 rounded-xl bg-[#fff5f5] text-[#ff3b30] text-xs hover:bg-red-100 transition-all"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-2 rounded-xl hover:bg-[#f5f5f7] text-[#86868b] transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(c.id)}
                          className="p-2 rounded-xl hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
