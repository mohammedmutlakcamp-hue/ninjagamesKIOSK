'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, increment as fbIncrement } from 'firebase/firestore';
import { CHESTS, CHEST_REWARDS } from '@/lib/constants';
import {
  Package, Search, TrendingUp, Crown, Gift, Clock, Filter,
  ChevronDown, ChevronUp, Coins, Star, Trophy, Sparkles,
  Settings, Send, Percent, DollarSign, BarChart3, Zap, Users, AlertTriangle, Sliders,
  Loader2, X as XIcon,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { UploadButton } from './ImageUploadField';

interface ChestDrop {
  id: string;
  playerId: string;
  playerName: string;
  rewardName: string;
  rewardRarity: string;
  rewardType: string;
  rewardImage: string;
  rewardSkinId?: string;
  rewardValue?: number;
  chestTier: string;
  timestamp: number;
}

interface ChestConfig {
  luckMultiplier: number; // 1.0 = normal, 2.0 = double rare+ chance
  promoActive: boolean;
  promoMessage: string;
  promoEndTime: number;
  profitTarget: number; // JOD target before running promotions
}

const RARITY_COLORS: Record<string, string> = {
  common: '#86868b',
  uncommon: '#34c759',
  rare: '#0071e3',
  legendary: '#ff9500',
  mythical: '#af52de',
  immortal: '#ff9500',
};

const CHEST_COLORS: Record<string, string> = {
  common: '#0071e3',
  rare: '#ff9500',
  legendary: '#af52de',
  mythical: '#34c759',
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ChestManagement() {
  const [drops, setDrops] = useState<ChestDrop[]>([]);
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeSection, setActiveSection] = useState<'history' | 'profit' | 'config' | 'droptable' | 'promo'>('profit');
  // Chest content overrides — stored in config/chest-content-overrides
  // { [chestId]: { disabledRewardIds: string[] } }
  const [contentOverrides, setContentOverrides] = useState<Record<string, { disabledRewardIds?: string[]; extraRewards?: any[] }>>({});
  const [contentSaving, setContentSaving] = useState(false);
  // "Add Reward" modal state — which chest, and the draft reward being edited.
  const [addRewardFor, setAddRewardFor] = useState<string | null>(null);
  const [draftReward, setDraftReward] = useState<any>({
    id: '', name: '', description: '', type: 'coins', rarity: 'common',
    value: 50, image: '', icon: 'coins', dropRate: 0.05,
  });

  // Config state
  const [config, setConfig] = useState<ChestConfig>({
    luckMultiplier: 1.0,
    promoActive: false,
    promoMessage: '',
    promoEndTime: 0,
    profitTarget: 50,
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);

  // Promo send state
  const [promoChestTier, setPromoChestTier] = useState('common');
  const [promoCount, setPromoCount] = useState(1);
  const [promoMinReward, setPromoMinReward] = useState(100);
  const [promoMaxReward, setPromoMaxReward] = useState(250);
  const [promoPlayerCount, setPromoPlayerCount] = useState(10);
  const [promoSending, setPromoSending] = useState(false);
  const [promoResult, setPromoResult] = useState('');

  // Real-time listener on chest-drops
  useEffect(() => {
    const q = query(collection(db, 'chest-drops'), orderBy('timestamp', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      setDrops(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChestDrop)));
    });
    return () => unsub();
  }, []);

  // Load config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'chest-config', 'settings'), (snap) => {
      if (snap.exists()) {
        setConfig((prev) => ({ ...prev, ...(snap.data() as any) } as ChestConfig));
      }
    });
    return () => unsub();
  }, []);

  // Load players for promo
  useEffect(() => {
    if (activeSection === 'promo') {
      getDocs(collection(db, 'players')).then(snap => {
        setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      });
    }
  }, [activeSection]);

  // Load chest content overrides (per-chest disabled reward ids).
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'chest-content-overrides'), (snap) => {
      if (snap.exists()) setContentOverrides(snap.data() as any || {});
      else setContentOverrides({});
    });
    return () => unsub();
  }, []);

  const toggleRewardEnabled = async (chestId: string, rewardId: string) => {
    setContentSaving(true);
    try {
      const existing = contentOverrides[chestId]?.disabledRewardIds || [];
      const isDisabled = existing.includes(rewardId);
      const next = isDisabled ? existing.filter(x => x !== rewardId) : [...existing, rewardId];
      const updated = { ...contentOverrides, [chestId]: { disabledRewardIds: next } };
      await setDoc(doc(db, 'config', 'chest-content-overrides'), updated);
    } catch (err) {
      console.error('toggle reward failed', err);
    } finally {
      setContentSaving(false);
    }
  };

  const resetChestContent = async (chestId: string) => {
    if (!confirm('Re-enable every reward in this chest? (Custom rewards you added stay.)')) return;
    setContentSaving(true);
    try {
      const current = contentOverrides[chestId] || {};
      const updated = { ...contentOverrides };
      // Clear disabled list; keep extraRewards + priceOverride.
      const keep: any = {};
      if (current.extraRewards && current.extraRewards.length > 0) keep.extraRewards = current.extraRewards;
      if (typeof (current as any).priceOverride === 'number') keep.priceOverride = (current as any).priceOverride;
      if (Object.keys(keep).length > 0) {
        updated[chestId] = keep;
      } else {
        delete updated[chestId];
      }
      await setDoc(doc(db, 'config', 'chest-content-overrides'), updated);
    } finally {
      setContentSaving(false);
    }
  };

  // Write an admin-entered price to config/chest-content-overrides. Passing
  // null clears the override so the hardcoded default from constants.ts
  // takes over again.
  const savePriceOverride = async (chestId: string, price: number | null) => {
    setContentSaving(true);
    try {
      const current = (contentOverrides[chestId] || {}) as any;
      const next: any = { ...current };
      if (price === null) {
        delete next.priceOverride;
      } else {
        next.priceOverride = Math.max(0, Math.floor(price));
      }
      const updated: any = { ...contentOverrides };
      if (Object.keys(next).length === 0) {
        delete updated[chestId];
      } else {
        updated[chestId] = next;
      }
      await setDoc(doc(db, 'config', 'chest-content-overrides'), updated);
    } catch (err) {
      console.error('save price failed', err);
      alert('Price save failed.');
    } finally {
      setContentSaving(false);
    }
  };

  // Effective price helper — admin override wins, falls back to hardcoded cost.
  const effectivePrice = (chestId: string, fallback: number): number => {
    const ov = (contentOverrides[chestId] as any)?.priceOverride;
    return typeof ov === 'number' && ov >= 0 ? ov : fallback;
  };
  const hasPriceOverride = (chestId: string): boolean => {
    const ov = (contentOverrides[chestId] as any)?.priceOverride;
    return typeof ov === 'number' && ov >= 0;
  };

  const openAddReward = (chestId: string) => {
    setAddRewardFor(chestId);
    setDraftReward({
      id: '', name: '', description: '', type: 'coins', rarity: 'common',
      value: 50, image: '', icon: 'coins', dropRate: 0.05,
    });
  };

  const saveNewReward = async () => {
    if (!addRewardFor || !draftReward.name?.trim()) return;
    setContentSaving(true);
    try {
      const rewardId = draftReward.id?.trim() || `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newReward = {
        id: rewardId,
        type: draftReward.type,
        name: draftReward.name.trim(),
        description: draftReward.description?.trim() || '',
        rarity: draftReward.rarity,
        value: Number(draftReward.value) || 0,
        icon: draftReward.icon || 'coins',
        image: draftReward.image?.trim() || '',
        dropRate: Number(draftReward.dropRate) || 0.05,
      };
      const current = contentOverrides[addRewardFor] || {};
      const existingExtras = current.extraRewards || [];
      const updated = {
        ...contentOverrides,
        [addRewardFor]: {
          ...current,
          extraRewards: [...existingExtras, newReward],
        },
      };
      await setDoc(doc(db, 'config', 'chest-content-overrides'), updated);
      setAddRewardFor(null);
    } catch (err) {
      console.error('add reward failed', err);
      alert('Add failed.');
    } finally {
      setContentSaving(false);
    }
  };

  const deleteExtraReward = async (chestId: string, rewardId: string) => {
    if (!confirm('Remove this custom reward from the pool?')) return;
    setContentSaving(true);
    try {
      const current = contentOverrides[chestId] || {};
      const extras = (current.extraRewards || []).filter((r: any) => r.id !== rewardId);
      const updated = { ...contentOverrides, [chestId]: { ...current, extraRewards: extras } };
      await setDoc(doc(db, 'config', 'chest-content-overrides'), updated);
    } finally {
      setContentSaving(false);
    }
  };

  // Save config
  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      await setDoc(doc(db, 'chest-config', 'settings'), config, { merge: true });
    } catch (err) { console.error(err); }
    setConfigSaving(false);
  };

  // Send promo chests
  const sendPromoChests = async () => {
    setPromoSending(true);
    setPromoResult('');
    try {
      // Pick random players
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(promoPlayerCount, players.length));

      let sent = 0;
      for (const p of selected) {
        // Give guaranteed coins in the range
        const rewardValue = promoMinReward + Math.floor(Math.random() * (promoMaxReward - promoMinReward + 1));

        // Add to player
        await updateDoc(doc(db, 'players', p.uid), {
          coins: fbIncrement(rewardValue),
        });

        // Log the drop
        await addDoc(collection(db, 'chest-drops'), {
          playerId: p.uid,
          playerName: p.username || 'Unknown',
          rewardName: `${rewardValue} Promo Tokens`,
          rewardRarity: 'legendary',
          rewardType: 'coins',
          rewardValue: rewardValue,
          chestTier: `promo-${promoChestTier}`,
          timestamp: Date.now(),
        });
        sent++;
      }
      setPromoResult(`Sent promo chests to ${sent} players! (${promoMinReward}-${promoMaxReward} tokens each)`);
    } catch (err: any) {
      setPromoResult(`Error: ${err.message}`);
    }
    setPromoSending(false);
  };

  // Filtered & sorted drops
  const filteredDrops = useMemo(() => {
    let result = [...drops];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(d =>
        d.playerName?.toLowerCase().includes(s) ||
        d.rewardName?.toLowerCase().includes(s)
      );
    }
    if (rarityFilter !== 'all') {
      result = result.filter(d => d.rewardRarity === rarityFilter);
    }
    if (sortAsc) result.reverse();
    return result;
  }, [drops, search, rarityFilter, sortAsc]);

  // Profit calculations
  const profitStats = useMemo(() => {
    const chestCosts: Record<string, number> = {};
    CHESTS.forEach(c => {
      const ov = (contentOverrides[c.id] as any)?.priceOverride;
      chestCosts[c.tier] = typeof ov === 'number' && ov >= 0 ? ov : c.cost;
    });

    let totalSpentTokens = 0;
    let totalGivenTokens = 0;
    let totalSpentJOD = 0;
    let totalGivenJOD = 0;
    const perChest: Record<string, { opens: number; spent: number; given: number }> = {};

    for (const d of drops) {
      const tier = d.chestTier?.replace('promo-', '');
      const cost = chestCosts[tier] || 0;
      totalSpentTokens += cost;
      totalGivenTokens += d.rewardValue || 0;

      if (!perChest[tier]) perChest[tier] = { opens: 0, spent: 0, given: 0 };
      perChest[tier].opens++;
      perChest[tier].spent += cost;
      perChest[tier].given += d.rewardValue || 0;
    }

    // 100 tokens = 1 JOD
    totalSpentJOD = totalSpentTokens / 100;
    totalGivenJOD = totalGivenTokens / 100;

    const netProfit = totalSpentTokens - totalGivenTokens;
    const netProfitJOD = netProfit / 100;
    const houseEdge = totalSpentTokens > 0 ? ((netProfit / totalSpentTokens) * 100).toFixed(1) : '0';

    return { totalSpentTokens, totalGivenTokens, totalSpentJOD, totalGivenJOD, netProfit, netProfitJOD, houseEdge, perChest };
  }, [drops, contentOverrides]);

  // Stats
  const stats = useMemo(() => {
    if (drops.length === 0) return { total: 0, mostCommon: '-', rarest: '-', topOpener: '-', topOpenerCount: 0 };
    const rewardCounts: Record<string, number> = {};
    const playerCounts: Record<string, { name: string; count: number }> = {};
    let rarestDrop: ChestDrop | null = null;
    const rarityRank = ['common', 'uncommon', 'rare', 'legendary', 'mythical', 'immortal'];
    for (const d of drops) {
      rewardCounts[d.rewardName] = (rewardCounts[d.rewardName] || 0) + 1;
      if (!playerCounts[d.playerId]) playerCounts[d.playerId] = { name: d.playerName, count: 0 };
      playerCounts[d.playerId].count++;
      if (!rarestDrop || rarityRank.indexOf(d.rewardRarity) > rarityRank.indexOf(rarestDrop.rewardRarity)) rarestDrop = d;
    }
    const mostCommon = Object.entries(rewardCounts).sort((a, b) => b[1] - a[1])[0];
    const topOpener = Object.values(playerCounts).sort((a, b) => b.count - a.count)[0];
    return {
      total: drops.length,
      mostCommon: mostCommon ? `${mostCommon[0]} (${mostCommon[1]}x)` : '-',
      rarest: rarestDrop ? `${rarestDrop.rewardName} (${rarestDrop.rewardRarity}) by ${rarestDrop.playerName}` : '-',
      topOpener: topOpener ? topOpener.name : '-',
      topOpenerCount: topOpener ? topOpener.count : 0,
    };
  }, [drops]);

  const inputClass = "bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none text-sm";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Package size={24} className="text-[#0071e3]" /> Chest Management
          </h2>
          <p className="text-[#86868b] text-sm">{drops.length} drops recorded | Net profit: <span className={profitStats.netProfitJOD >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}>{profitStats.netProfitJOD.toFixed(2)} JOD</span></p>
        </div>
        {config.promoActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/20">
            <Zap size={14} className="text-[#ff9500]" />
            <span className="text-xs font-medium text-[#ff9500]">PROMO ACTIVE ({config.luckMultiplier}x luck)</span>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Opened', value: stats.total.toString(), icon: Package, color: '#0071e3' },
          { label: 'Revenue (Tokens In)', value: `${profitStats.totalSpentTokens} (${profitStats.totalSpentJOD.toFixed(1)} JOD)`, icon: TrendingUp, color: '#34c759' },
          { label: 'Paid Out (Tokens Out)', value: `${profitStats.totalGivenTokens} (${profitStats.totalGivenJOD.toFixed(1)} JOD)`, icon: Gift, color: '#ff9500' },
          { label: 'Net Profit', value: `${profitStats.netProfit} tokens (${profitStats.netProfitJOD.toFixed(1)} JOD) -- ${profitStats.houseEdge}% edge`, icon: DollarSign, color: profitStats.netProfitJOD >= 0 ? '#34c759' : '#ff3b30' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} style={{ color: stat.color }} />
              <span className="text-xs text-[#86868b] uppercase">{stat.label}</span>
            </div>
            <p className="text-sm font-semibold text-[#1d1d1f] truncate" title={stat.value}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {([
          { key: 'history', label: 'Drop History', icon: Clock, accent: '#0071e3' },
          { key: 'profit', label: 'Profit & Analytics', icon: BarChart3, accent: '#0071e3' },
          { key: 'config', label: 'Luck Slider & Settings', icon: Sliders, accent: '#ff9500' },
          { key: 'droptable', label: 'Drop Table (Content)', icon: Package, accent: '#A855F7' },
          { key: 'promo', label: 'Promotions', icon: Send, accent: '#0071e3' },
        ] as const).map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeSection === s.key
                ? 'text-white'
                : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] border border-[#e5e5ea]/60'
            }`}
            style={activeSection === s.key ? { background: s.accent } : undefined}>
            <s.icon size={14} /> {s.label}
            {s.key === 'config' && activeSection !== 'config' && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#ff9500]/10 text-[#ff9500] text-[9px] font-bold tracking-wider">
                LUCK
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ===================== DROP HISTORY ===================== */}
      {activeSection === 'history' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player or reward..."
                className={`${inputClass} pl-10 w-full`} />
            </div>
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}
                className={`${inputClass} pl-9 appearance-none cursor-pointer`}>
                <option value="all">All Rarities</option>
                {['common','uncommon','rare','legendary','mythical','immortal'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <button onClick={() => setSortAsc(!sortAsc)}
              className="flex items-center gap-1 px-3 py-2 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-[#86868b] hover:text-[#1d1d1f] text-sm transition-colors">
              <Clock size={14} /> {sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {sortAsc ? 'Oldest' : 'Newest'}
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f5f5f7] border-b border-[#e5e5ea]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Player</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Chest</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Reward</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Value</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Rarity</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#86868b] uppercase">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrops.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-[#86868b]">{drops.length === 0 ? 'No chest drops recorded yet' : 'No drops match your filters'}</td></tr>
                  ) : (
                    filteredDrops.map((drop, i) => (
                      <motion.tr key={drop.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.5) }}
                        className={`border-b border-[#e5e5ea] hover:bg-[#f5f5f7]/50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                        <td className="px-4 py-3 text-sm text-[#1d1d1f]">{drop.playerName || 'Unknown'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-1 rounded-full"
                            style={{ color: CHEST_COLORS[drop.chestTier?.replace('promo-', '')] || '#86868b', background: `${CHEST_COLORS[drop.chestTier?.replace('promo-', '')] || '#86868b'}10`, border: `1px solid ${CHEST_COLORS[drop.chestTier?.replace('promo-', '')] || '#86868b'}25` }}>
                            {drop.chestTier?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#1d1d1f] flex items-center gap-2">
                          {drop.rewardImage && <img src={drop.rewardImage} alt="" className="w-6 h-6 rounded object-cover" />}
                          {drop.rewardName}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-[#ff9500]">
                          {drop.rewardValue ? `${drop.rewardValue}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium" style={{ color: RARITY_COLORS[drop.rewardRarity] || '#86868b' }}>{drop.rewardRarity?.toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#86868b]">{formatTime(drop.timestamp)}</td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-[#86868b] mt-2">Showing {filteredDrops.length} of {drops.length} drops (last 500)</p>
        </motion.div>
      )}

      {/* ===================== PROFIT & ANALYTICS ===================== */}
      {activeSection === 'profit' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Per-chest breakdown */}
          <h3 className="text-sm font-semibold text-[#86868b] mb-3 tracking-wider uppercase">Per-Chest Breakdown</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {CHESTS.map((chest) => {
              const data = profitStats.perChest[chest.tier] || { opens: 0, spent: 0, given: 0 };
              const net = data.spent - data.given;
              const edge = data.spent > 0 ? ((net / data.spent) * 100).toFixed(1) : '0';
              const avgPayout = data.opens > 0 ? (data.given / data.opens).toFixed(0) : '0';
              return (
                <motion.div key={chest.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${chest.color}10`, border: `1px solid ${chest.color}25` }}>
                      <Package size={20} style={{ color: chest.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[#1d1d1f]">{chest.name.toUpperCase()}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] uppercase tracking-wider text-[#86868b]">Cost</span>
                        <input
                          type="number"
                          min={0}
                          defaultValue={effectivePrice(chest.id, chest.cost)}
                          disabled={contentSaving}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            const n = raw === '' ? chest.cost : parseInt(raw, 10);
                            if (!Number.isFinite(n) || n < 0) { e.target.value = String(effectivePrice(chest.id, chest.cost)); return; }
                            if (n === chest.cost) savePriceOverride(chest.id, null);
                            else if (n !== effectivePrice(chest.id, chest.cost)) savePriceOverride(chest.id, n);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="w-20 bg-[#f5f5f7] border border-[#d2d2d7] rounded-md px-2 py-0.5 text-xs font-medium text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                        />
                        <span className="text-[10px] text-[#86868b]">tokens</span>
                        {hasPriceOverride(chest.id) && (
                          <button
                            onClick={() => savePriceOverride(chest.id, null)}
                            disabled={contentSaving}
                            title={`Reset to default (${chest.cost})`}
                            className="text-[10px] text-[#ff9500] hover:text-[#ff3b30] underline">reset</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between"><span className="text-xs text-[#86868b]">Times Opened</span><span className="text-sm font-medium text-[#1d1d1f]">{data.opens}</span></div>
                    <div className="flex justify-between"><span className="text-xs text-[#86868b]">Tokens In</span><span className="text-sm font-medium text-[#34c759]">{data.spent}</span></div>
                    <div className="flex justify-between"><span className="text-xs text-[#86868b]">Tokens Out</span><span className="text-sm font-medium text-[#ff9500]">{data.given}</span></div>
                    <div className="flex justify-between"><span className="text-xs text-[#86868b]">Avg Payout</span><span className="text-sm font-medium text-[#1d1d1f]">{avgPayout} tokens</span></div>
                    <div className="flex justify-between border-t border-[#e5e5ea] pt-2">
                      <span className="text-xs text-[#86868b]">Net Profit</span>
                      <span className={`text-sm font-medium ${net >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{net} tokens ({edge}% edge)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-[#86868b]">Profit (JOD)</span>
                      <span className={`text-sm font-medium ${net >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{(net / 100).toFixed(2)} JOD</span>
                    </div>
                  </div>

                  {/* Reward distribution */}
                  <div className="mt-3 pt-3 border-t border-[#e5e5ea]">
                    <p className="text-[10px] text-[#86868b] uppercase mb-2">Expected Rewards</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(chest.rewards.reduce((acc: Record<string, number>, r) => { acc[r.rarity] = (acc[r.rarity] || 0) + 1; return acc; }, {}))
                        .map(([rarity, count]) => (
                          <span key={rarity} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ color: RARITY_COLORS[rarity], background: `${RARITY_COLORS[rarity]}10`, border: `1px solid ${RARITY_COLORS[rarity]}25` }}>
                            {count} {rarity}
                          </span>
                        ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Promotion suggestion */}
          {profitStats.netProfitJOD >= config.profitTarget && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#ff9500]/20 flex items-start gap-3">
              <Trophy size={20} className="text-[#ff9500] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#ff9500]">Promotion Threshold Reached!</p>
                <p className="text-xs text-[#86868b] mt-1">
                  You've made {profitStats.netProfitJOD.toFixed(2)} JOD profit from chests (target: {config.profitTarget} JOD).
                  Consider running a promotion to boost player engagement!
                </p>
                <button onClick={() => setActiveSection('promo')}
                  className="mt-2 px-4 py-1.5 rounded-xl bg-[#ff9500]/10 text-[#ff9500] text-xs font-medium hover:bg-[#ff9500]/15 transition-colors border border-[#ff9500]/20">
                  Go to Promotions
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ===================== SETTINGS ===================== */}
      {activeSection === 'config' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 space-y-6">
            <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Settings size={18} className="text-[#0071e3]" /> Chest Settings
              <HelpTip title={{ en: 'Chest Settings', ar: 'إعدادات الصناديق' }}
                ar={(
                  <>
                    <p className="mb-2">تحكُّم عام باقتصاد الصناديق. ثلاثة مفاتيح:</p>
                    <p className="mb-1.5"><strong>منزلق الحظ:</strong> يميل احتمالات الدروب النادرة لصالح اللاعب أو الكازينو. 50 = عادل.</p>
                    <p className="mb-1.5"><strong>هدف الربح:</strong> عندما يتخطى الربح هذا الرقم بالدينار، المنصة تقترح عليك تفعيل عرض ترويجي.</p>
                    <p><strong>العرض مفعَّل:</strong> عند التفعيل، يرى اللاعبون رسالة "درّوبات معززة" في الكشك.</p>
                  </>
                )}>
                <p className="mb-2">Global controls for the chest economy. Three knobs:</p>
                <p className="mb-1.5"><strong>Luck Slider:</strong> tilts rare+ drop odds toward the house or the player. 50 = Fair.</p>
                <p className="mb-1.5"><strong>Profit Target:</strong> when house margin exceeds this JOD number, the panel suggests a promo.</p>
                <p><strong>Promotion Active:</strong> when ON, players see a boosted-drops message on the kiosk chest screen.</p>
              </HelpTip>
            </h3>

            {/* Luck Slider — % boost on rare+ drop chance (mirrors the Crash bias slider UX) */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-[#86868b] uppercase flex items-center gap-1.5">
                  Chest Luck — rare+ drop rate boost
                  <HelpTip title={{ en: 'Luck Slider', ar: 'منزلق الحظ' }}
                    ar={(
                      <>
                        <p className="mb-2">يضبط احتمالية الحصول على دروبات نادرة / أسطورية / خرافية. الدروب العادية لا تتأثر.</p>
                        <p className="mb-1.5"><strong>+%</strong> = حظ أفضل للّاعبين (دروبات نادرة أكثر، أرباح أقل للمحل).</p>
                        <p className="mb-1.5"><strong>−%</strong> = لصالح المحل (دروبات نادرة أقل، أرباح أعلى).</p>
                        <p className="mb-2"><strong>عادل (0 / 1.0×)</strong> = التوازن الافتراضي.</p>
                        <p className="text-[#86868b]"><strong>نصيحة:</strong> +50% في العطلات البطيئة ليرجع اللاعبون، −25% عندما الأرباح تضغط.</p>
                      </>
                    )}>
                    <p className="mb-2">Scales how often players hit rare / legendary / mythical drops. Common + uncommon drops unaffected.</p>
                    <p className="mb-1.5"><strong>+%</strong> = players luckier, less house margin.</p>
                    <p className="mb-1.5"><strong>−%</strong> = house favored, more margin.</p>
                    <p className="mb-2"><strong>Fair (0 / 1.0x)</strong> = default balance.</p>
                    <p className="text-[#86868b]"><strong>Use case:</strong> +50% on slow weekends to bring players back; −25% when margins tighten.</p>
                  </HelpTip>
                </label>
                <span className="text-lg font-semibold" style={{ color: config.luckMultiplier > 1 ? '#ff9500' : config.luckMultiplier < 1 ? '#ff3b30' : '#1d1d1f' }}>
                  {config.luckMultiplier >= 1
                    ? `+${Math.round((config.luckMultiplier - 1) * 100)}%`
                    : `−${Math.round((1 - config.luckMultiplier) * 100)}%`}
                  <span className="text-xs text-[#86868b] ml-1.5">({config.luckMultiplier.toFixed(2)}x)</span>
                </span>
              </div>
              {/* Slider: 0-100 slider position maps to 0.5x-5x multiplier, with 50 = 1.0x */}
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={config.luckMultiplier <= 1
                  ? Math.round((config.luckMultiplier - 0.5) / 0.5 * 50)   // 0.5→0, 1.0→50
                  : Math.round(50 + (config.luckMultiplier - 1) / 4 * 50)} // 1.0→50, 5.0→100
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  const mult = pct <= 50
                    ? 0.5 + (pct / 50) * 0.5            // 0→0.5, 50→1.0
                    : 1 + ((pct - 50) / 50) * 4;        // 50→1.0, 100→5.0
                  setConfig({ ...config, luckMultiplier: Math.round(mult * 100) / 100 });
                }}
                className="w-full accent-[#ff9500] h-2"
              />
              <div className="flex justify-between text-xs text-[#86868b] mt-1">
                <span>−50% — House favored</span>
                <span>0% — Fair</span>
                <span>+400% — Players favored</span>
              </div>

              {/* Quick-select percentage buttons (matches Crash slider UX) */}
              <div className="grid grid-cols-6 gap-2 mt-3">
                {[
                  { label: '−50%', mult: 0.5 },
                  { label: '−25%', mult: 0.75 },
                  { label: 'Fair', mult: 1.0 },
                  { label: '+50%', mult: 1.5 },
                  { label: '+100%', mult: 2.0 },
                  { label: '+200%', mult: 3.0 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setConfig({ ...config, luckMultiplier: p.mult })}
                    className={`py-2 rounded-xl text-xs font-medium transition-all border ${
                      Math.abs(config.luckMultiplier - p.mult) < 0.01
                        ? 'bg-[#ff9500]/10 border-[#ff9500]/40 text-[#ff9500]'
                        : 'bg-[#f5f5f7] border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-[#86868b] mt-2">
                Applies to <strong>rare / legendary / mythical</strong> drop chances only. Common + uncommon always stay at baseline so every chest still feels rewarding.
              </p>
            </div>

            {/* Profit Target */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Profit Target (JOD) -- triggers promo suggestion</label>
              <input type="number" value={config.profitTarget} onChange={(e) => setConfig({ ...config, profitTarget: parseInt(e.target.value) || 0 })}
                className={`${inputClass} w-32`} />
            </div>

            {/* Promo Toggle */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Promotion Active</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setConfig({ ...config, promoActive: !config.promoActive })}
                  className={`relative w-14 h-7 rounded-full transition-all ${config.promoActive ? 'bg-[#0071e3]' : 'bg-[#d2d2d7]'}`}>
                  <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${config.promoActive ? 'left-8' : 'left-1'}`} />
                </button>
                <span className="text-sm text-[#86868b]">{config.promoActive ? 'Players see boosted drop rates' : 'Normal drop rates'}</span>
              </div>
            </div>

            {config.promoActive && (
              <div>
                <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Promo Message (shown to players)</label>
                <input type="text" value={config.promoMessage} onChange={(e) => setConfig({ ...config, promoMessage: e.target.value })}
                  placeholder="e.g. 2x LUCK EVENT! Limited time only!"
                  className={`${inputClass} w-full`} />
              </div>
            )}

            <button onClick={saveConfig} disabled={configSaving}
              className="w-full py-3 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-colors disabled:opacity-50">
              {configSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Per-chest drop rate overview */}
          <div className="mt-6 bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
            <h3 className="text-sm font-semibold text-[#86868b] mb-4 tracking-wider uppercase">Drop Rates Overview</h3>
            {CHESTS.map(chest => (
              <div key={chest.id} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded" style={{ background: chest.color }} />
                  <span className="text-xs font-medium" style={{ color: chest.color }}>{chest.name.toUpperCase()}</span>
                  <span className="text-[10px] text-[#86868b] ml-auto">
                    Cost: <span className={hasPriceOverride(chest.id) ? 'font-semibold text-[#0071e3]' : ''}>{effectivePrice(chest.id, chest.cost)}</span> tokens
                    {hasPriceOverride(chest.id) && <span className="ml-1 text-[9px] text-[#86868b] line-through">{chest.cost}</span>}
                  </span>
                </div>
                <div className="space-y-1">
                  {chest.rewards.map(r => {
                    const rc = RARITY_COLORS[r.rarity] || '#86868b';
                    const pct = (r.dropRate * 100);
                    const adjustedPct = r.rarity !== 'common' && r.rarity !== 'uncommon' ? pct * config.luckMultiplier : pct;
                    return (
                      <div key={r.id} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#86868b] w-36 truncate">{r.name}</span>
                        <span className="text-[10px] font-medium w-16" style={{ color: rc }}>{r.rarity}</span>
                        <div className="flex-1 h-2 bg-[#f5f5f7] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(adjustedPct * 3, 100)}%`, background: rc }} />
                        </div>
                        <span className="text-[10px] text-[#86868b] w-12 text-right">
                          {adjustedPct.toFixed(1)}%
                          {config.luckMultiplier !== 1 && r.rarity !== 'common' && r.rarity !== 'uncommon' && (
                            <span className="text-[#ff9500] ml-0.5">*</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {config.luckMultiplier !== 1 && (
              <p className="text-[10px] text-[#ff9500] mt-2">* Adjusted by {config.luckMultiplier}x luck multiplier (rare+ only)</p>
            )}
          </div>
        </motion.div>
      )}

      {/* ===================== DROP TABLE (CONTENT EDITOR) ===================== */}
      {activeSection === 'droptable' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl">
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 mb-4">
            <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2 mb-1">
              <Package size={18} className="text-[#A855F7]" /> Chest Drop Table — Content Editor
            </h3>
            <p className="text-xs text-[#86868b] leading-relaxed">
              Enable or disable individual rewards per chest. Disabled rewards are excluded from the drop pool
              immediately — the chest picker skips them when rolling. Use this to temporarily hide expensive
              skins, hide vouchers during a menu change, or prune the pool to your current inventory.
              The deterministic budget-based picker keeps house margins stable regardless of which rewards are enabled.
            </p>
          </div>

          <div className="space-y-5">
            {CHESTS.map((chest) => {
              const override = contentOverrides[chest.id];
              const disabled = override?.disabledRewardIds || [];
              const extras = override?.extraRewards || [];
              const enabledBuiltIns = chest.rewards.filter(r => !disabled.includes(r.id)).length;
              return (
                <div key={chest.id} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${chest.color}15`, border: `1px solid ${chest.color}40` }}>
                        <Package size={18} style={{ color: chest.color }} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[#1d1d1f]">{chest.name}</h4>
                        <p className="text-[11px] text-[#86868b]">
                          {enabledBuiltIns}/{chest.rewards.length} built-in · {extras.length} custom · cost {effectivePrice(chest.id, chest.cost)} tokens{hasPriceOverride(chest.id) && <span className="ml-1 text-[#0071e3]">(override)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openAddReward(chest.id)} disabled={contentSaving}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#A855F7] text-white hover:bg-[#9333EA] disabled:opacity-50 flex items-center gap-1.5 font-medium">
                        <Package size={12} /> Add Reward
                      </button>
                      {disabled.length > 0 && (
                        <button onClick={() => resetChestContent(chest.id)} disabled={contentSaving}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] border border-[#d2d2d7] disabled:opacity-50">
                          Re-enable all
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {chest.rewards.map((r) => {
                      const isDisabled = disabled.includes(r.id);
                      const rc = RARITY_COLORS[r.rarity] || '#86868b';
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleRewardEnabled(chest.id, r.id)}
                          disabled={contentSaving}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                            isDisabled
                              ? 'bg-[#fff5f5] border-[#ff3b30]/30 opacity-60'
                              : 'bg-[#f5f5f7] border-[#e5e5ea] hover:border-[#0071e3]/40'
                          }`}
                        >
                          <div className="w-2 h-8 rounded-full" style={{ background: rc }} />
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-white" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: `${rc}20` }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-medium truncate ${isDisabled ? 'line-through text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                              {r.name}
                            </div>
                            <div className="text-[10px] text-[#86868b] truncate">
                              {r.rarity} · {r.type === 'coins' ? `${r.value} tokens` : r.type === 'voucher' ? 'voucher' : r.type}
                              {r.dropRate ? ` · ${(r.dropRate * 100).toFixed(1)}%` : ''}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isDisabled ? 'bg-[#ff3b30]/10 text-[#ff3b30]' : 'bg-[#34c759]/10 text-[#34c759]'
                          }`}>
                            {isDisabled ? 'OFF' : 'ON'}
                          </span>
                        </button>
                      );
                    })}

                    {/* Custom (admin-added) rewards — marked with a purple CUSTOM pill */}
                    {extras.map((r: any) => {
                      const rc = RARITY_COLORS[r.rarity] || '#86868b';
                      return (
                        <div key={r.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left bg-[#faf5ff] border-[#A855F7]/30 group">
                          <div className="w-2 h-8 rounded-full" style={{ background: rc }} />
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.image} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-white" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: `${rc}20` }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium truncate text-[#1d1d1f]">{r.name}</div>
                            <div className="text-[10px] text-[#86868b] truncate">
                              {r.rarity} · {r.type === 'coins' ? `${r.value} tokens` : r.type === 'voucher' ? 'voucher' : r.type}
                              {r.dropRate ? ` · ${(r.dropRate * 100).toFixed(1)}%` : ''}
                            </div>
                          </div>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#A855F7]/15 text-[#7C3AED] flex-shrink-0">CUSTOM</span>
                          <button onClick={() => deleteExtraReward(chest.id, r.id)}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20 flex items-center justify-center transition-opacity">
                            <AlertTriangle size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* ───── Add-Reward Modal ───── */}
            {addRewardFor && (
              <div className="fixed inset-0 z-[999] flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
                onClick={() => !contentSaving && setAddRewardFor(null)}>
                <div onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl w-[560px] max-w-full max-h-[90vh] overflow-y-auto">
                  <div className="sticky top-0 bg-white border-b border-[#e5e5ea] px-6 py-4 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-[#1d1d1f]">
                      Add Custom Reward — {CHESTS.find((c) => c.id === addRewardFor)?.name}
                    </h3>
                    <button onClick={() => setAddRewardFor(null)}
                      className="w-9 h-9 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center text-[#86868b]">
                      <XIcon size={18} />
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name</label>
                        <input type="text" value={draftReward.name}
                          onChange={(e) => setDraftReward({ ...draftReward, name: e.target.value })}
                          placeholder="e.g. 75 Tokens, Free Energy Drink, Dragon Skin"
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Type</label>
                        <select value={draftReward.type}
                          onChange={(e) => setDraftReward({ ...draftReward, type: e.target.value })}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm">
                          <option value="coins">Coins (tokens)</option>
                          <option value="voucher">Voucher (free item)</option>
                          <option value="skin">Skin (ninja avatar)</option>
                          <option value="xp_boost">XP Boost</option>
                          <option value="title">Title</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Description (shown in the kiosk reward reveal)</label>
                      <input type="text" value={draftReward.description}
                        onChange={(e) => setDraftReward({ ...draftReward, description: e.target.value })}
                        placeholder="e.g. A nice bonus, Free coffee on us!"
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Rarity</label>
                        <select value={draftReward.rarity}
                          onChange={(e) => setDraftReward({ ...draftReward, rarity: e.target.value })}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm">
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                          <option value="legendary">Legendary</option>
                          <option value="mythical">Mythical</option>
                          <option value="immortal">Immortal</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Value</label>
                        <input type="number" value={draftReward.value}
                          onChange={(e) => setDraftReward({ ...draftReward, value: Number(e.target.value) })}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm" />
                        <p className="text-[10px] text-[#86868b] mt-1">Tokens for coins; JOD*100 for vouchers</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Drop rate</label>
                        <input type="number" step="0.01" min={0.001} max={0.5} value={draftReward.dropRate}
                          onChange={(e) => setDraftReward({ ...draftReward, dropRate: Number(e.target.value) })}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm" />
                        <p className="text-[10px] text-[#86868b] mt-1">0.05 = 5% (rough target)</p>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Image (optional)</label>
                      <div className="flex items-stretch gap-2">
                        <input type="text"
                          value={draftReward.image && !draftReward.image.startsWith('data:') ? draftReward.image : ''}
                          onChange={(e) => setDraftReward({ ...draftReward, image: e.target.value })}
                          placeholder={draftReward.image?.startsWith('data:') ? 'Uploaded image' : '/img/reward-coins-50.png or URL'}
                          disabled={draftReward.image?.startsWith('data:')}
                          className="flex-1 bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-sm disabled:opacity-60" />
                        <UploadButton onUpload={(d) => setDraftReward({ ...draftReward, image: d })} maxWidth={256} maxHeight={256} />
                      </div>
                      <p className="text-[10px] text-[#86868b] mt-1">Paste URL or upload from PC. Leave blank to use a colored placeholder.</p>
                    </div>

                    <div className="bg-[#fef3c7] border border-[#f59e0b]/40 rounded-xl p-3 text-[11px] text-[#92400e]">
                      <strong>Note:</strong> the chest picker uses a deterministic profit-locked engine. Your drop rate is a hint — actual win frequency depends on the house budget. The Luck Slider still scales rare+ drops globally.
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-[#e5e5ea]">
                      <button onClick={saveNewReward} disabled={contentSaving || !draftReward.name?.trim()}
                        className="flex-1 py-3 bg-[#A855F7] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#9333EA] disabled:opacity-50">
                        {contentSaving ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                        Add to chest
                      </button>
                      <button onClick={() => setAddRewardFor(null)}
                        className="px-5 py-3 bg-[#f5f5f7] text-[#1d1d1f] rounded-xl border border-[#d2d2d7] hover:bg-[#e5e5ea]">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 bg-[#f5f5f7] border border-[#e5e5ea] rounded-xl p-4 text-[11px] text-[#86868b] leading-relaxed">
            <p><strong className="text-[#1d1d1f]">How changes apply:</strong> disabled rewards are filtered out of the
              chest picker on the very next drop — no redeploy, no player refresh needed. Kiosks pick up the change via
              Firestore live sync.</p>
            <p className="mt-2"><strong className="text-[#1d1d1f]">Safety:</strong> you can't disable every reward — the
              picker always has at least one fallback. If you disable so many that the house can't stay profitable on
              small-chest opens, the Luck Slider still caps what players win per tier, so house margin holds.</p>
          </div>
        </motion.div>
      )}

      {/* ===================== PROMOTIONS ===================== */}
      {activeSection === 'promo' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 space-y-5">
            <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Send size={18} className="text-[#ff9500]" /> Send Promo Chests
            </h3>
            <p className="text-xs text-[#86868b]">
              Send guaranteed token rewards to random players. Great for engagement after reaching profit targets.
            </p>

            {/* Chest tier */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Chest Tier (visual only)</label>
              <div className="flex gap-2">
                {CHESTS.map(c => (
                  <button key={c.id} onClick={() => setPromoChestTier(c.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${promoChestTier === c.id ? 'text-white' : 'text-[#86868b] border border-[#d2d2d7] hover:bg-[#f5f5f7]'}`}
                    style={promoChestTier === c.id ? { background: c.color } : {}}>
                    {c.name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Token range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Min Tokens</label>
                <input type="number" value={promoMinReward} onChange={(e) => setPromoMinReward(parseInt(e.target.value) || 0)}
                  className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Max Tokens</label>
                <input type="number" value={promoMaxReward} onChange={(e) => setPromoMaxReward(parseInt(e.target.value) || 0)}
                  className={`${inputClass} w-full`} />
              </div>
            </div>

            {/* Player count */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">
                Number of Random Players (out of {players.length} total)
              </label>
              <input type="number" value={promoPlayerCount} min={1} max={players.length}
                onChange={(e) => setPromoPlayerCount(parseInt(e.target.value) || 1)}
                className={`${inputClass} w-32`} />
            </div>

            {/* Cost estimate */}
            <div className="rounded-xl p-3 bg-[#ff9500]/5 border border-[#ff9500]/15">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#ff9500]" />
                <span className="text-xs font-medium text-[#ff9500]">COST ESTIMATE</span>
              </div>
              <p className="text-xs text-[#86868b] mt-1">
                {promoPlayerCount} players x {promoMinReward}-{promoMaxReward} tokens = <span className="text-[#1d1d1f] font-medium">
                  {promoPlayerCount * promoMinReward} - {promoPlayerCount * promoMaxReward} tokens
                </span> ({((promoPlayerCount * promoMinReward) / 100).toFixed(1)} - {((promoPlayerCount * promoMaxReward) / 100).toFixed(1)} JOD)
              </p>
            </div>

            <button onClick={sendPromoChests} disabled={promoSending || players.length === 0}
              className="w-full py-3 rounded-xl bg-[#ff9500] text-white font-medium text-sm hover:bg-[#e68600] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {promoSending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send size={16} />}
              {promoSending ? 'Sending...' : `Send to ${promoPlayerCount} Random Players`}
            </button>

            {promoResult && (
              <div className={`rounded-xl p-3 text-sm ${promoResult.startsWith('Error') ? 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20' : 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20'}`}>
                {promoResult}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
