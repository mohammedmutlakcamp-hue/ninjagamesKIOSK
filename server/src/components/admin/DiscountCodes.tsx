'use client';

// Promo / discount code admin.
//
// Firestore: collection `discount-codes/{id}`. Shape:
//   code: string (uppercase, unique-ish)
//   description: string                     // internal admin note, visible on card
//   rewardType: 'coins' | 'free-time' | 'chest' | 'percentage' | 'bonus-multiplier'
//   rewardAmount: number                    // coins | minutes | count | % | multiplier
//   chestTier?: 'common'|'rare'|'legendary'|'mythical'   // only when rewardType === 'chest'
//   maxUses: number                         // total cap across all players
//   currentUses: number                     // bumped by the redemption flow
//   onePerPlayer: boolean                   // block repeat redemption by the same player
//   minTopUpJOD: number                     // 0 = no minimum; only applies to codes tied to a top-up
//   firstOrderOnly: boolean                 // player must have 0 top-ups so far
//   audience: 'all' | 'new-only' | 'vip-only' | 'specific'
//   audienceUsernames: string[]             // only used when audience === 'specific'
//   daysOfWeek: boolean[7]                  // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]. all-true = always
//   timeStart: string | null                // "HH:MM" local, null = no start-of-day bound
//   timeEnd: string | null
//   startAt: number | null                  // Date.now()-comparable, null = immediately active
//   expiresAt: number | null                // null = never expires
//   active: boolean                         // master kill switch
//   createdAt: number
//   redemptions: { playerId, playerName, redeemedAt }[]
//
// NOTE: the player-side redemption flow (kiosk popup that enters the code,
// validates rules, and grants the reward) is NOT wired yet. These fields are
// the source of truth for when that flow is built — it should read every
// rule here and enforce it transactionally.

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, setDoc,
} from 'firebase/firestore';
import {
  Ticket, Plus, Trash2, Copy, RefreshCw, Coins, Clock, Package, Eye, X, Loader2,
  CheckCircle2, Shuffle, Users, CalendarClock, Edit3, Percent, Sparkles, Crown,
  Calendar, UserCheck, ShieldAlert, Search, Filter,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface Redemption {
  playerId: string;
  playerName: string;
  redeemedAt: number;
}

type RewardType = 'coins' | 'free-time' | 'chest' | 'percentage' | 'bonus-multiplier';
type ChestTier = 'common' | 'rare' | 'legendary' | 'mythical';
type Audience = 'all' | 'new-only' | 'vip-only' | 'specific';

interface DiscountCode {
  id: string;
  code: string;
  description: string;
  rewardType: RewardType;
  rewardAmount: number;
  chestTier?: ChestTier;
  maxUses: number;
  currentUses: number;
  onePerPlayer: boolean;
  minTopUpJOD: number;
  firstOrderOnly: boolean;
  audience: Audience;
  audienceUsernames: string[];
  daysOfWeek: boolean[]; // length 7, Sun..Sat
  timeStart: string | null;
  timeEnd: string | null;
  startAt: number | null;
  expiresAt: number | null;
  active: boolean;
  createdAt: number;
  redemptions: Redemption[];
}

const REWARD_META: Record<RewardType, { label: string; icon: React.ReactNode; color: string; unit: string; hint: string }> = {
  'coins':            { label: 'Coins',             icon: <Coins size={14} />,    color: '#ff9500', unit: 'coins',           hint: 'Flat coins credited on redemption' },
  'free-time':        { label: 'Free Time',         icon: <Clock size={14} />,    color: '#0071e3', unit: 'minutes',         hint: 'Free play minutes added' },
  'chest':            { label: 'Chest',             icon: <Package size={14} />,  color: '#5856d6', unit: 'chests',          hint: 'N chests of the chosen tier' },
  'percentage':       { label: 'Top-up Discount',   icon: <Percent size={14} />,  color: '#34c759', unit: '% off',           hint: 'Discount applied to the next top-up amount' },
  'bonus-multiplier': { label: 'Bonus Multiplier',  icon: <Sparkles size={14} />, color: '#af52de', unit: '× coins',         hint: '2× doubles the coins received on the next top-up' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const input = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all text-sm';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'NINJA-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function emptyCode(): DiscountCode {
  return {
    id: '',
    code: generateCode(),
    description: '',
    rewardType: 'coins',
    rewardAmount: 100,
    maxUses: 50,
    currentUses: 0,
    onePerPlayer: true,
    minTopUpJOD: 0,
    firstOrderOnly: false,
    audience: 'all',
    audienceUsernames: [],
    daysOfWeek: [true, true, true, true, true, true, true],
    timeStart: null,
    timeEnd: null,
    startAt: null,
    expiresAt: null,
    active: true,
    createdAt: Date.now(),
    redemptions: [],
  };
}

function toLocalInputValue(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(code: DiscountCode): { key: 'disabled' | 'scheduled' | 'expired' | 'maxed' | 'active'; label: string; color: string } {
  if (!code.active) return { key: 'disabled', label: 'Disabled', color: '#86868b' };
  if (code.startAt && code.startAt > Date.now()) return { key: 'scheduled', label: 'Scheduled', color: '#0071e3' };
  if (code.expiresAt && code.expiresAt < Date.now()) return { key: 'expired', label: 'Expired', color: '#ff3b30' };
  if (code.currentUses >= code.maxUses) return { key: 'maxed', label: 'Max Used', color: '#ff9500' };
  return { key: 'active', label: 'Active', color: '#34c759' };
}

function ruleChips(code: DiscountCode): { label: string; color: string }[] {
  const chips: { label: string; color: string }[] = [];
  if (code.onePerPlayer) chips.push({ label: '1× per player', color: '#0071e3' });
  if (code.minTopUpJOD > 0) chips.push({ label: `Min ${code.minTopUpJOD} JOD`, color: '#ff9500' });
  if (code.firstOrderOnly) chips.push({ label: 'First order', color: '#34c759' });
  if (code.audience === 'new-only') chips.push({ label: 'New players', color: '#34c759' });
  else if (code.audience === 'vip-only') chips.push({ label: 'VIP only', color: '#eab308' });
  else if (code.audience === 'specific') chips.push({ label: `${code.audienceUsernames.length} user${code.audienceUsernames.length === 1 ? '' : 's'}`, color: '#af52de' });
  if (!code.daysOfWeek.every(Boolean)) {
    const active = DAY_LABELS.filter((_, i) => code.daysOfWeek[i]).join(' ');
    chips.push({ label: active || 'Never', color: '#86868b' });
  }
  if (code.timeStart && code.timeEnd) chips.push({ label: `${code.timeStart}–${code.timeEnd}`, color: '#86868b' });
  return chips;
}

export function DiscountCodes() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [viewingLog, setViewingLog] = useState<DiscountCode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'disabled' | 'maxed'>('all');

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'discount-codes'));
      const list: DiscountCode[] = snap.docs.map(d => {
        const data: any = d.data();
        return {
          id: d.id,
          code: data.code || '',
          description: data.description || '',
          rewardType: (data.rewardType || 'coins') as RewardType,
          rewardAmount: data.rewardAmount || 0,
          chestTier: data.chestTier,
          maxUses: data.maxUses || 0,
          currentUses: data.currentUses || 0,
          onePerPlayer: data.onePerPlayer ?? true,
          minTopUpJOD: data.minTopUpJOD || 0,
          firstOrderOnly: !!data.firstOrderOnly,
          audience: (data.audience || 'all') as Audience,
          audienceUsernames: data.audienceUsernames || [],
          daysOfWeek: Array.isArray(data.daysOfWeek) && data.daysOfWeek.length === 7 ? data.daysOfWeek : [true, true, true, true, true, true, true],
          timeStart: data.timeStart || null,
          timeEnd: data.timeEnd || null,
          startAt: data.startAt?.toMillis?.() || data.startAt || null,
          expiresAt: data.expiresAt?.toMillis?.() || data.expiresAt || null,
          active: data.active ?? true,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
          redemptions: data.redemptions || [],
        };
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      setCodes(list);
    } catch (err) {
      console.error('Failed to fetch discount codes:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCodes(); }, []);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.code.trim()) { alert('Code is required'); return; }
    setSaving(true);
    try {
      // Strip `id` before writing; the doc path IS the id.
      const { id: omitId, ...rest } = editing;
      const payload: any = {
        ...rest,
        code: editing.code.trim().toUpperCase(),
        description: editing.description.trim(),
        audienceUsernames: editing.audienceUsernames.map(u => u.trim().toLowerCase()).filter(Boolean),
        startAt: editing.startAt ? Timestamp.fromMillis(editing.startAt) : null,
        expiresAt: editing.expiresAt ? Timestamp.fromMillis(editing.expiresAt) : null,
        createdAt: Timestamp.fromMillis(editing.createdAt || Date.now()),
      };
      if (editing.rewardType !== 'chest') delete payload.chestTier;

      if (editing.id) {
        await setDoc(doc(db, 'discount-codes', editing.id), payload, { merge: false });
      } else {
        await addDoc(collection(db, 'discount-codes'), payload);
      }
      setEditing(null);
      await fetchCodes();
    } catch (err) {
      console.error('Failed to save code:', err);
      alert(`Save failed: ${(err as Error).message || 'unknown'}`);
    }
    setSaving(false);
  };

  const toggleActive = async (code: DiscountCode) => {
    try {
      await updateDoc(doc(db, 'discount-codes', code.id), { active: !code.active });
      setCodes(prev => prev.map(c => c.id === code.id ? { ...c, active: !c.active } : c));
    } catch (err) {
      console.error('Failed to toggle code:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'discount-codes', id));
      setCodes(prev => prev.filter(c => c.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete code:', err);
    }
  };

  const handleDuplicate = (code: DiscountCode) => {
    const draft: DiscountCode = {
      ...code,
      id: '',
      code: generateCode(),
      description: code.description ? `${code.description} (copy)` : '',
      currentUses: 0,
      redemptions: [],
      createdAt: Date.now(),
    };
    setEditing(draft);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return codes.filter(c => {
      if (s && !c.code.toLowerCase().includes(s) && !c.description.toLowerCase().includes(s)) return false;
      if (statusFilter !== 'all' && statusOf(c).key !== statusFilter) return false;
      return true;
    });
  }, [codes, search, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
          <Ticket size={24} className="text-[#0071e3]" /> Discount Codes
          <HelpTip title={{ en: 'Discount Codes', ar: 'أكواد الخصم' }}
            ar={<p>أنشئ أكواد ترويجية يدخلها اللاعب للحصول على توكنز إضافية أو خصم. حدد القيمة، القواعد، الجمهور، والنافذة الزمنية.</p>}>
            <p>Create promo codes with full rule control — audience, min top-up, day/time window, expiry, and reward type.</p>
          </HelpTip>
        </h1>
        <div className="flex gap-3">
          <button onClick={fetchCodes} className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] flex items-center gap-2 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setEditing(emptyCode())} className="bg-[#0071e3] text-white rounded-xl font-medium px-4 py-2 text-sm hover:bg-[#0077ED] flex items-center gap-2 transition-colors">
            <Plus size={14} /> Create Code
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] bg-white border border-[#e5e5ea] rounded-xl px-3 py-2">
          <Search size={14} className="text-[#86868b]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description..."
            className="flex-1 outline-none text-sm text-[#1d1d1f] placeholder:text-[#86868b] bg-transparent"
          />
          {search && <button onClick={() => setSearch('')} className="text-[#86868b] hover:text-[#1d1d1f]"><X size={14} /></button>}
        </div>
        <div className="flex items-center gap-1 bg-white border border-[#e5e5ea] rounded-xl p-1">
          {(['all', 'active', 'scheduled', 'maxed', 'expired', 'disabled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === f ? 'bg-[#0071e3] text-white' : 'text-[#86868b] hover:bg-[#f5f5f7]'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Codes list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={32} className="animate-spin text-[#0071e3]" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <Ticket size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-[#86868b]">{codes.length === 0 ? 'No discount codes yet — create one to get started.' : 'No codes match the current filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(code => {
            const status = statusOf(code);
            const meta = REWARD_META[code.rewardType];
            const chips = ruleChips(code);
            return (
              <motion.div key={code.id} layout className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:border-[#0071e3]/20 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Row 1: code + status + description */}
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="text-lg font-semibold text-[#1d1d1f] tracking-widest">{code.code}</span>
                      <button onClick={() => copyCode(code.code)} className="text-[#86868b] hover:text-[#0071e3] transition-colors" title="Copy code">
                        {copied === code.code ? <CheckCircle2 size={14} className="text-[#34c759]" /> : <Copy size={14} />}
                      </button>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: status.color, background: `${status.color}15` }}>
                        {status.label}
                      </span>
                      {code.description && <span className="text-xs text-[#86868b] truncate max-w-[280px]">— {code.description}</span>}
                    </div>

                    {/* Row 2: reward + counters + window */}
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-[#86868b] flex-wrap">
                      <span className="flex items-center gap-1" style={{ color: meta.color }}>
                        {meta.icon} {code.rewardAmount} {meta.unit}
                        {code.rewardType === 'chest' && code.chestTier && <span className="text-[10px] opacity-70">({code.chestTier})</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {code.currentUses}/{code.maxUses}
                      </span>
                      {code.startAt && code.startAt > Date.now() && (
                        <span className="flex items-center gap-1 text-[#0071e3]">
                          <Calendar size={12} /> starts {new Date(code.startAt).toLocaleDateString()}
                        </span>
                      )}
                      {code.expiresAt && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} /> {new Date(code.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Row 3: rule chips */}
                    {chips.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {chips.map((c, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: c.color, background: `${c.color}12`, border: `1px solid ${c.color}25` }}>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleActive(code)}
                      className="p-1.5 transition-colors"
                      title={code.active ? 'Disable' : 'Enable'}>
                      <div className={`relative w-10 h-5 rounded-full transition-colors ${code.active ? 'bg-[#34c759]' : 'bg-[#d1d1d6]'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${code.active ? 'left-[22px]' : 'left-0.5'}`} />
                      </div>
                    </button>
                    <button onClick={() => setViewingLog(code)} className="px-2.5 py-1.5 border border-[#d2d2d7] rounded-lg text-xs text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-1 transition-colors" title="Redemption log">
                      <Eye size={13} />
                    </button>
                    <button onClick={() => setEditing(code)} className="px-2.5 py-1.5 border border-[#d2d2d7] rounded-lg text-xs text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-1 transition-colors" title="Edit">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => handleDuplicate(code)} className="px-2.5 py-1.5 border border-[#d2d2d7] rounded-lg text-xs text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-1 transition-colors" title="Duplicate">
                      <Copy size={13} />
                    </button>
                    {deleteConfirm === code.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(code.id)} className="text-[#ff3b30] text-xs font-medium px-2 py-1 bg-[#ff3b30]/10 rounded-lg hover:bg-[#ff3b30]/20 transition-colors">Confirm</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-[#86868b] text-xs px-2 py-1">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(code.id)} className="p-1.5 text-[#86868b] hover:text-[#ff3b30] transition-colors" title="Delete">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─────────────── Edit / create modal ─────────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
            onClick={() => !saving && setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl w-[820px] max-w-full max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-[#e5e5ea] px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-xl font-semibold text-[#1d1d1f] flex items-center gap-2">
                  {editing.id ? <><Edit3 size={18} className="text-[#0071e3]" /> Edit Code</> : <><Plus size={18} className="text-[#0071e3]" /> New Code</>}
                  {editing.id && <span className="text-xs font-normal text-[#86868b] ml-2">{editing.currentUses} redemption{editing.currentUses === 1 ? '' : 's'} so far</span>}
                </h3>
                <button onClick={() => setEditing(null)} className="w-9 h-9 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center"><X size={18} /></button>
              </div>

              <div className="p-6 space-y-5">
                {/* ── Basics ── */}
                <Section icon={<Ticket size={14} />} title="Basics">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Code</Label>
                      <div className="flex gap-2">
                        <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                          className={`${input} tracking-widest font-semibold`} />
                        <button type="button" onClick={() => setEditing({ ...editing, code: generateCode() })}
                          className="px-3 py-2 border border-[#d2d2d7] rounded-lg text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors" title="Generate random">
                          <Shuffle size={16} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label>Description <span className="text-[#86868b] font-normal">(internal note)</span></Label>
                      <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        placeholder="e.g. New Year 2026 promo" className={input} />
                    </div>
                  </div>
                </Section>

                {/* ── Reward ── */}
                <Section icon={<Sparkles size={14} />} title="Reward">
                  <div className="grid grid-cols-[1fr,1fr,auto] gap-3">
                    <div>
                      <Label>Reward Type</Label>
                      <select value={editing.rewardType}
                        onChange={(e) => setEditing({ ...editing, rewardType: e.target.value as RewardType })}
                        className={input}>
                        {(Object.keys(REWARD_META) as RewardType[]).map(k => (
                          <option key={k} value={k}>{REWARD_META[k].label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[#86868b] mt-1">{REWARD_META[editing.rewardType].hint}</p>
                    </div>
                    <div>
                      <Label>Amount <span className="text-[#86868b] font-normal">({REWARD_META[editing.rewardType].unit})</span></Label>
                      <input type="number" min={0} step={editing.rewardType === 'bonus-multiplier' ? 0.1 : 1}
                        value={editing.rewardAmount}
                        onChange={(e) => setEditing({ ...editing, rewardAmount: parseFloat(e.target.value) || 0 })}
                        className={input} />
                    </div>
                    {editing.rewardType === 'chest' && (
                      <div>
                        <Label>Chest Tier</Label>
                        <select value={editing.chestTier || 'common'}
                          onChange={(e) => setEditing({ ...editing, chestTier: e.target.value as ChestTier })}
                          className={input}>
                          <option value="common">Common</option>
                          <option value="rare">Rare</option>
                          <option value="legendary">Legendary</option>
                          <option value="mythical">Mythical</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Section>

                {/* ── Usage limits ── */}
                <Section icon={<ShieldAlert size={14} />} title="Usage Limits">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Max Total Uses</Label>
                      <input type="number" min={1} value={editing.maxUses}
                        onChange={(e) => setEditing({ ...editing, maxUses: parseInt(e.target.value) || 1 })}
                        className={input} />
                    </div>
                    <div>
                      <Label>Min Top-up (JOD) <span className="text-[#86868b] font-normal">— 0 = no minimum</span></Label>
                      <input type="number" min={0} step={0.5} value={editing.minTopUpJOD}
                        onChange={(e) => setEditing({ ...editing, minTopUpJOD: parseFloat(e.target.value) || 0 })}
                        className={input} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 pt-1">
                    <Toggle label="Only once per player" checked={editing.onePerPlayer}
                      onChange={(v) => setEditing({ ...editing, onePerPlayer: v })} />
                    <Toggle label="First-order only" checked={editing.firstOrderOnly}
                      onChange={(v) => setEditing({ ...editing, firstOrderOnly: v })} />
                  </div>
                </Section>

                {/* ── Audience ── */}
                <Section icon={<UserCheck size={14} />} title="Audience">
                  <div className="grid grid-cols-4 gap-2">
                    {(['all', 'new-only', 'vip-only', 'specific'] as Audience[]).map(a => (
                      <button key={a} type="button"
                        onClick={() => setEditing({ ...editing, audience: a })}
                        className={`py-2 rounded-lg text-xs font-medium transition-all ${editing.audience === a ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#86868b] border border-[#e5e5ea]'}`}>
                        {a === 'all' ? 'Everyone' : a === 'new-only' ? 'New players' : a === 'vip-only' ? 'VIP only' : 'Specific users'}
                      </button>
                    ))}
                  </div>
                  {editing.audience === 'specific' && (
                    <div>
                      <Label>Usernames <span className="text-[#86868b] font-normal">(comma-separated)</span></Label>
                      <textarea value={editing.audienceUsernames.join(', ')}
                        onChange={(e) => setEditing({ ...editing, audienceUsernames: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="marlboro, ninja_god, player123"
                        className={`${input} h-[72px] resize-none`} />
                      {editing.audienceUsernames.length > 0 && (
                        <p className="text-[11px] text-[#86868b] mt-1">{editing.audienceUsernames.length} username{editing.audienceUsernames.length === 1 ? '' : 's'}</p>
                      )}
                    </div>
                  )}
                </Section>

                {/* ── Schedule ── */}
                <Section icon={<Calendar size={14} />} title="Schedule">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Starts at <span className="text-[#86868b] font-normal">(optional)</span></Label>
                      <input type="datetime-local" value={toLocalInputValue(editing.startAt)}
                        onChange={(e) => setEditing({ ...editing, startAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                        className={input} />
                    </div>
                    <div>
                      <Label>Expires at <span className="text-[#86868b] font-normal">(optional)</span></Label>
                      <input type="datetime-local" value={toLocalInputValue(editing.expiresAt)}
                        onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                        className={input} />
                    </div>
                  </div>
                  <div>
                    <Label>Days of the week</Label>
                    <div className="grid grid-cols-7 gap-2">
                      {DAY_LABELS.map((label, i) => {
                        const on = editing.daysOfWeek[i];
                        return (
                          <button key={label} type="button"
                            onClick={() => setEditing({ ...editing, daysOfWeek: editing.daysOfWeek.map((d, idx) => idx === i ? !d : d) })}
                            className={`py-2 rounded-lg text-xs font-medium transition-all ${on ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#86868b] border border-[#e5e5ea]'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Start time (daily) <span className="text-[#86868b] font-normal">(optional)</span></Label>
                      <input type="time" value={editing.timeStart || ''}
                        onChange={(e) => setEditing({ ...editing, timeStart: e.target.value || null })}
                        className={input} />
                    </div>
                    <div>
                      <Label>End time (daily) <span className="text-[#86868b] font-normal">(optional)</span></Label>
                      <input type="time" value={editing.timeEnd || ''}
                        onChange={(e) => setEditing({ ...editing, timeEnd: e.target.value || null })}
                        className={input} />
                    </div>
                  </div>
                </Section>

                {/* ── Active toggle ── */}
                <Section icon={<CheckCircle2 size={14} />} title="Status">
                  <Toggle label="Active (visible to players)" checked={editing.active}
                    onChange={(v) => setEditing({ ...editing, active: v })} />
                </Section>

                {/* Save / delete */}
                <div className="flex gap-3 pt-4 border-t border-[#e5e5ea] sticky bottom-0 bg-white -mx-6 px-6 py-4">
                  <button onClick={handleSave} disabled={saving || !editing.code.trim()}
                    className="flex-1 py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {editing.id ? 'Save changes' : 'Create code'}
                  </button>
                  {editing.id && (
                    <button onClick={() => { if (confirm('Delete this code permanently?')) { handleDelete(editing.id); setEditing(null); } }}
                      className="px-5 py-3 bg-[#ff3b30]/10 text-[#ff3b30] rounded-xl hover:bg-[#ff3b30]/20 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────── Redemption log modal ─────────────── */}
      <AnimatePresence>
        {viewingLog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setViewingLog(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 border border-[#e5e5ea]/60 w-full max-w-lg max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Eye size={18} className="text-[#0071e3]" /> Redemption Log — {viewingLog.code}
                </h3>
                <button onClick={() => setViewingLog(null)} className="text-[#86868b] hover:text-[#1d1d1f]"><X size={20} /></button>
              </div>

              <div className="flex items-center gap-4 mb-4 text-sm text-[#86868b] flex-wrap">
                <span className="flex items-center gap-1" style={{ color: REWARD_META[viewingLog.rewardType].color }}>
                  {REWARD_META[viewingLog.rewardType].icon} {viewingLog.rewardAmount} {REWARD_META[viewingLog.rewardType].unit}
                </span>
                <span>{viewingLog.currentUses}/{viewingLog.maxUses} used</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {viewingLog.redemptions.length === 0 ? (
                  <p className="text-[#86868b] text-center py-8">No redemptions yet.</p>
                ) : (
                  viewingLog.redemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#f5f5f7] rounded-xl px-4 py-2.5 border border-[#e5e5ea]/60">
                      <span className="text-[#1d1d1f]">{r.playerName}</span>
                      <span className="text-[#86868b] text-xs">{new Date(r.redeemedAt).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────── Helpers ──────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#86868b]">
        {icon} {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-[#86868b] mb-1.5 block">{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-[#1d1d1f]">
      <div className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-[#34c759]' : 'bg-[#d1d1d6]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
      <span>{label}</span>
    </button>
  );
}
