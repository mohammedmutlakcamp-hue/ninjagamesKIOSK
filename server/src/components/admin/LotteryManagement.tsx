'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { Ticket, Plus, Trash2, Save, Coins, Clock, Gift, Sparkles, AlertTriangle } from 'lucide-react';
import { LotteryConfig, LotteryReward, DEFAULT_LOTTERY_CONFIG } from '@/lib/lottery';
import { HelpTip } from './HelpTip';

export function LotteryManagement() {
  const [config, setConfig] = useState<LotteryConfig>(DEFAULT_LOTTERY_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'lottery'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<LotteryConfig>;
        setConfig({
          entryCost: typeof data.entryCost === 'number' ? data.entryCost : DEFAULT_LOTTERY_CONFIG.entryCost,
          enabled: data.enabled !== false,
          rewards: Array.isArray(data.rewards) && data.rewards.length ? (data.rewards as LotteryReward[]) : DEFAULT_LOTTERY_CONFIG.rewards,
        });
      } else {
        setConfig(DEFAULT_LOTTERY_CONFIG);
      }
      setDirty(false);
    });
    return () => unsub();
  }, []);

  const totalWeight = config.rewards.reduce((s, r) => s + Math.max(0, r.probability || 0), 0);

  const updateReward = (idx: number, patch: Partial<LotteryReward>) => {
    const next = [...config.rewards];
    next[idx] = { ...next[idx], ...patch };
    setConfig({ ...config, rewards: next });
    setDirty(true);
  };
  const removeReward = (idx: number) => {
    setConfig({ ...config, rewards: config.rewards.filter((_, i) => i !== idx) });
    setDirty(true);
  };
  const addReward = () => {
    const id = `lot_custom_${Date.now()}`;
    setConfig({
      ...config,
      rewards: [
        ...config.rewards,
        { id, name: 'New Reward', type: 'coins', amount: 100, probability: 10, color: '#60a5fa', rarity: 'common' },
      ],
    });
    setDirty(true);
  };
  const resetDefaults = () => {
    if (!confirm('Reset lottery config to defaults? This wipes any custom rewards.')) return;
    setConfig(DEFAULT_LOTTERY_CONFIG);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'lottery'), config, { merge: false });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('lottery save failed', err);
    }
    setSaving(false);
  };

  const typeIcon = (t: LotteryReward['type']) => {
    if (t === 'coins') return <Coins size={14} />;
    if (t === 'time_minutes') return <Clock size={14} />;
    if (t === 'voucher') return <Gift size={14} />;
    if (t === 'skin') return <Sparkles size={14} />;
    return <Ticket size={14} />;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Ticket size={22} className="text-[#eab308]" /> Lottery Chest
            <HelpTip title={{ en: 'Lottery Chest', ar: 'صندوق اليانصيب' }}
              ar={(
                <>
                  <p className="mb-2">كل زيادة في احتمالية مكافأة = زيادة في فرصة حصول اللاعب عليها. الاحتمالية مرجّحة — لا يلزم أن يكون المجموع 100.</p>
                  <p className="mb-2"><strong>تكلفة الدخول:</strong> التوكنز اللازمة لكل لفة.</p>
                  <p className="mb-2"><strong>أنواع المكافآت:</strong> توكنز، دقائق لعب مجانية، كوبون، سكن (نادر).</p>
                  <p className="text-[#86868b]">استخدم "تعطيل" للإخفاء من الكشك بدون مسح الإعدادات.</p>
                </>
              )}>
              <p className="mb-2">Higher probability = higher chance of that reward dropping. Weights are normalized — they don't have to add to 100.</p>
              <p className="mb-2"><strong>Entry cost:</strong> tokens charged per spin.</p>
              <p className="mb-2"><strong>Reward types:</strong> coins, playtime minutes, voucher, skin (rare).</p>
              <p className="text-[#86868b]">Use "Disabled" to hide the lottery from the kiosk without wiping rewards.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">{config.rewards.length} rewards · total weight {totalWeight.toFixed(1)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetDefaults} className="px-3 py-2 rounded-xl text-sm bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:bg-[#e8e8ed]">
            Reset to Defaults
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={save} disabled={!dirty || saving}
            className={`px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
              dirty
                ? 'bg-[#0071e3] text-white hover:bg-[#0077ED]'
                : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7]'
            }`}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : <><Save size={14} /> Save Changes</>}
          </motion.button>
        </div>
      </div>

      {/* Top-level controls */}
      <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-6">
        <div className="grid grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-[#86868b] text-xs font-semibold uppercase tracking-wider block mb-1">Entry Cost (tokens)</label>
            <input type="number" value={config.entryCost}
              onChange={(e) => { setConfig({ ...config, entryCost: Math.max(0, parseInt(e.target.value) || 0) }); setDirty(true); }}
              className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] font-semibold focus:border-[#0071e3] outline-none" />
          </div>
          <div>
            <label className="text-[#86868b] text-xs font-semibold uppercase tracking-wider block mb-1">Status</label>
            <button
              onClick={() => { setConfig({ ...config, enabled: !config.enabled }); setDirty(true); }}
              className={`w-full px-4 py-2.5 rounded-xl font-semibold transition-colors ${
                config.enabled
                  ? 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/30'
                  : 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/30'
              }`}
            >
              {config.enabled ? '● ENABLED' : '○ DISABLED'}
            </button>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl px-4 py-2.5 border border-[#e5e5ea]">
            <p className="text-[10px] text-[#86868b] uppercase font-semibold tracking-wider">Expected Value</p>
            <p className="text-lg font-extrabold text-[#0071e3]">
              {totalWeight > 0
                ? (config.rewards.reduce((s, r) => s + (r.type === 'coins' ? r.amount : 0) * (r.probability / totalWeight), 0)).toFixed(0)
                : '—'} coins / spin
            </p>
          </div>
        </div>
        {config.entryCost > 0 && totalWeight > 0 && (() => {
          const evCoins = config.rewards.reduce((s, r) => s + (r.type === 'coins' ? r.amount : 0) * (r.probability / totalWeight), 0);
          const margin = ((config.entryCost - evCoins) / config.entryCost) * 100;
          return (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${margin > 20 ? 'bg-[#34c759]/8 text-[#34c759] border border-[#34c759]/20' : margin > 0 ? 'bg-[#ff9500]/8 text-[#ff9500] border border-[#ff9500]/20' : 'bg-[#ff3b30]/8 text-[#ff3b30] border border-[#ff3b30]/20'}`}>
              <AlertTriangle size={12} />
              House margin: <strong>{margin.toFixed(1)}%</strong> — {margin > 20 ? 'safe, profitable' : margin > 0 ? 'thin, verify' : 'LOSING, bump entry cost or trim jackpots'}
            </div>
          );
        })()}
      </div>

      {/* Rewards table */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.6fr_0.4fr] gap-3 px-4 py-3 bg-[#f5f5f7] text-[10px] font-semibold uppercase tracking-wider text-[#86868b]">
          <div>Reward Name</div>
          <div>Type</div>
          <div>Amount</div>
          <div>Probability (%)</div>
          <div>Chance</div>
          <div></div>
        </div>
        {config.rewards.map((r, i) => {
          const chance = totalWeight > 0 ? (r.probability / totalWeight) * 100 : 0;
          return (
            <div key={r.id} className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr_0.6fr_0.4fr] gap-3 px-4 py-3 items-center border-t border-[#e5e5ea] hover:bg-[#fafafa]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <input type="text" value={r.name}
                  onChange={(e) => updateReward(i, { name: e.target.value })}
                  className="flex-1 bg-transparent text-[#1d1d1f] text-sm font-medium outline-none border-b border-transparent focus:border-[#0071e3]" />
              </div>
              <select value={r.type}
                onChange={(e) => updateReward(i, { type: e.target.value as LotteryReward['type'] })}
                className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1.5 text-xs text-[#1d1d1f] outline-none">
                <option value="coins">Coins</option>
                <option value="time_minutes">Time (min)</option>
                <option value="voucher">Voucher</option>
                <option value="skin">Skin</option>
                <option value="nothing">Nothing</option>
              </select>
              <input type="number" value={r.amount}
                onChange={(e) => updateReward(i, { amount: Math.max(0, parseInt(e.target.value) || 0) })}
                className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1.5 text-sm text-[#1d1d1f] outline-none" />
              <input type="number" step="0.5" min="0" value={r.probability}
                onChange={(e) => updateReward(i, { probability: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1.5 text-sm text-[#1d1d1f] outline-none" />
              <span className="text-sm font-semibold text-[#0071e3]">{chance.toFixed(2)}%</span>
              <button onClick={() => removeReward(i)}
                className="w-8 h-8 rounded-lg text-[#ff3b30] hover:bg-[#ff3b30]/10 flex items-center justify-center">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={addReward}
        className="w-full py-3 rounded-xl border-2 border-dashed border-[#0071e3]/30 text-[#0071e3] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0071e3]/5 transition-colors">
        <Plus size={14} /> Add Reward
      </button>
    </div>
  );
}
