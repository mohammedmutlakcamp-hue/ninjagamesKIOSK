'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from 'firebase/firestore';
import {
  Ticket, Plus, Trash2, ToggleLeft, ToggleRight, Copy, RefreshCw,
  Coins, Clock, Package, Eye, X, Loader2, CheckCircle2, Shuffle,
  Users, CalendarClock,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface Redemption {
  playerId: string;
  playerName: string;
  redeemedAt: number;
}

interface DiscountCode {
  id: string;
  code: string;
  rewardType: 'coins' | 'free-time' | 'chest';
  rewardAmount: number;
  maxUses: number;
  currentUses: number;
  expiresAt: number | null;
  active: boolean;
  createdAt: number;
  redemptions: Redemption[];
}

const REWARD_ICONS: Record<string, React.ReactNode> = {
  'coins': <Coins size={16} className="text-[#ff9500]" />,
  'free-time': <Clock size={16} className="text-[#0071e3]" />,
  'chest': <Package size={16} className="text-[#5856d6]" />,
};

const REWARD_LABELS: Record<string, string> = {
  'coins': 'Coins',
  'free-time': 'Free Time (min)',
  'chest': 'Chest',
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'NINJA-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function DiscountCodes() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCode, setSelectedCode] = useState<DiscountCode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state
  const [formCode, setFormCode] = useState(generateCode());
  const [formRewardType, setFormRewardType] = useState<'coins' | 'free-time' | 'chest'>('coins');
  const [formRewardAmount, setFormRewardAmount] = useState(100);
  const [formMaxUses, setFormMaxUses] = useState(50);
  const [formExpiry, setFormExpiry] = useState('');

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'discount-codes'));
      const list: DiscountCode[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          code: data.code || '',
          rewardType: data.rewardType || 'coins',
          rewardAmount: data.rewardAmount || 0,
          maxUses: data.maxUses || 0,
          currentUses: data.currentUses || 0,
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

  const handleCreate = async () => {
    if (!formCode.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'discount-codes'), {
        code: formCode.trim().toUpperCase(),
        rewardType: formRewardType,
        rewardAmount: formRewardAmount,
        maxUses: formMaxUses,
        currentUses: 0,
        expiresAt: formExpiry ? Timestamp.fromDate(new Date(formExpiry)) : null,
        active: true,
        createdAt: Timestamp.now(),
        redemptions: [],
      });
      setShowForm(false);
      setFormCode(generateCode());
      setFormRewardAmount(100);
      setFormMaxUses(50);
      setFormExpiry('');
      await fetchCodes();
    } catch (err) {
      console.error('Failed to create code:', err);
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

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (code: DiscountCode) => code.expiresAt && code.expiresAt < Date.now();
  const isMaxed = (code: DiscountCode) => code.currentUses >= code.maxUses;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
          <Ticket size={24} className="text-[#0071e3]" /> Discount Codes
          <HelpTip title={{ en: 'Discount Codes', ar: 'أكواد الخصم' }}
            ar={<p>أنشئ أكواد ترويجية يدخلها اللاعب على الكشك عند الشحن لبونس توكنز أو خصم. حدد قيمة، حد أقصى للاستخدام، وتاريخ انتهاء.</p>}>
            <p>Create promo codes players enter at top-up for bonus tokens or a discount. Set value, usage cap, expiry date.</p>
          </HelpTip>
        </h1>
        <div className="flex gap-3">
          <button onClick={fetchCodes} className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] flex items-center gap-2 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowForm(!showForm)} className="bg-[#0071e3] text-white rounded-xl font-medium px-4 py-2 text-sm hover:bg-[#0077ED] flex items-center gap-2 transition-colors">
            <Plus size={14} /> Create Code
          </button>
        </div>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 mb-6">
              <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">New Code</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Code */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block font-medium">Code</label>
                  <div className="flex gap-2">
                    <input
                      value={formCode}
                      onChange={e => setFormCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none tracking-widest transition-all"
                    />
                    <button onClick={() => setFormCode(generateCode())} className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors" title="Generate random">
                      <Shuffle size={16} />
                    </button>
                  </div>
                </div>
                {/* Reward Type */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block font-medium">Reward Type</label>
                  <select
                    value={formRewardType}
                    onChange={e => setFormRewardType(e.target.value as any)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  >
                    <option value="coins">Coins</option>
                    <option value="free-time">Free Time (minutes)</option>
                    <option value="chest">Chest</option>
                  </select>
                </div>
                {/* Reward Amount */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block font-medium">Reward Amount</label>
                  <input
                    type="number"
                    value={formRewardAmount}
                    onChange={e => setFormRewardAmount(parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                </div>
                {/* Max Uses */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block font-medium">Max Uses</label>
                  <input
                    type="number"
                    value={formMaxUses}
                    onChange={e => setFormMaxUses(parseInt(e.target.value) || 1)}
                    min={1}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                </div>
                {/* Expiry */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block font-medium">Expiry Date (optional)</label>
                  <input
                    type="datetime-local"
                    value={formExpiry}
                    onChange={e => setFormExpiry(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                </div>
                {/* Submit */}
                <div className="flex items-end">
                  <button
                    onClick={handleCreate}
                    disabled={saving || !formCode.trim()}
                    className="bg-[#0071e3] text-white rounded-xl font-medium px-6 py-2 flex items-center gap-2 hover:bg-[#0077ED] disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Create
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Codes List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-[#0071e3]" />
        </div>
      ) : codes.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <Ticket size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-[#86868b]">No discount codes yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {codes.map(code => {
            const expired = isExpired(code);
            const maxed = isMaxed(code);
            const statusColor = !code.active ? 'text-[#86868b]' : expired ? 'text-[#ff3b30]' : maxed ? 'text-[#ff9500]' : 'text-[#34c759]';
            const statusText = !code.active ? 'Disabled' : expired ? 'Expired' : maxed ? 'Max Used' : 'Active';

            return (
              <motion.div
                key={code.id}
                layout
                className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:border-[#0071e3]/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Code string */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-[#1d1d1f] tracking-widest">{code.code}</span>
                      <button onClick={() => copyCode(code.code)} className="text-[#86868b] hover:text-[#0071e3] transition-colors" title="Copy code">
                        {copied === code.code ? <CheckCircle2 size={14} className="text-[#34c759]" /> : <Copy size={14} />}
                      </button>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor} bg-[#f5f5f7]`}>
                        {statusText}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-[#86868b]">
                      <span className="flex items-center gap-1">
                        {REWARD_ICONS[code.rewardType]} {code.rewardAmount} {REWARD_LABELS[code.rewardType]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {code.currentUses}/{code.maxUses} uses
                      </span>
                      {code.expiresAt && (
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} /> {new Date(code.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCode(code)}
                      className="px-3 py-1.5 border border-[#d2d2d7] rounded-xl text-sm text-[#1d1d1f] hover:bg-[#f5f5f7] flex items-center gap-1 transition-colors"
                    >
                      <Eye size={14} /> Log
                    </button>
                    <button
                      onClick={() => toggleActive(code)}
                      className="text-[#86868b] hover:text-[#0071e3] transition-colors p-1.5"
                      title={code.active ? 'Disable' : 'Enable'}
                    >
                      {code.active ? <ToggleRight size={22} className="text-[#34c759]" /> : <ToggleLeft size={22} />}
                    </button>
                    {deleteConfirm === code.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(code.id)} className="text-[#ff3b30] text-xs font-medium px-2 py-1 bg-[#ff3b30]/5 rounded-lg hover:bg-[#ff3b30]/10 transition-colors">
                          Confirm
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-[#86868b] text-xs px-2 py-1">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(code.id)}
                        className="text-[#86868b] hover:text-[#ff3b30] transition-colors p-1.5"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Usage Log Modal */}
      <AnimatePresence>
        {selectedCode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setSelectedCode(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 border border-[#e5e5ea]/60 w-full max-w-lg max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Eye size={18} className="text-[#0071e3]" />
                  Usage Log &mdash; {selectedCode.code}
                </h3>
                <button onClick={() => setSelectedCode(null)} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-4 text-sm text-[#86868b]">
                <span className="flex items-center gap-1">{REWARD_ICONS[selectedCode.rewardType]} {selectedCode.rewardAmount} {REWARD_LABELS[selectedCode.rewardType]}</span>
                <span>{selectedCode.currentUses}/{selectedCode.maxUses} used</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {selectedCode.redemptions.length === 0 ? (
                  <p className="text-[#86868b] text-center py-8">No redemptions yet.</p>
                ) : (
                  selectedCode.redemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#f5f5f7] rounded-xl px-4 py-2.5 border border-[#e5e5ea]/60">
                      <span className="text-[#1d1d1f]">{r.playerName}</span>
                      <span className="text-[#86868b] text-xs">
                        {new Date(r.redeemedAt).toLocaleString()}
                      </span>
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
