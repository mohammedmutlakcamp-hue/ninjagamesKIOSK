'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import { NINJA_SKINS, TIER_BORDER_COLORS } from '@/lib/constants';
import {
  Palette, Crown, Search, UserPlus, Shield, X, Coins, Sparkles, Tag,
  Filter, Users, Zap, Gift, Percent, Check, AlertTriangle, Trash2,
  ChevronDown, ChevronUp, Star, Eye, Save, RotateCcw
} from 'lucide-react';

// --- Types ---
interface PlayerDoc {
  id: string;
  username: string;
  ownedNinjas?: string[];
  coins?: number;
  ninjaType?: string;
}

interface OwnershipMap {
  [skinId: string]: number;
}

interface PriceOverrides {
  [skinId: string]: number;
}

// --- Tier config ---
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; order: number }> = {
  free_starter: { label: 'FREE STARTERS', color: '#86868b', bg: 'rgba(134,134,139,0.08)', order: 0 },
  free_country: { label: 'FREE COUNTRY', color: '#34c759', bg: 'rgba(52,199,89,0.08)', order: 1 },
  rare:         { label: 'RARE',          color: '#0071e3', bg: 'rgba(0,113,227,0.08)', order: 2 },
  epic:         { label: 'EPIC',          color: '#af52de', bg: 'rgba(175,82,222,0.08)', order: 3 },
  legendary:    { label: 'LEGENDARY',     color: '#ff9500', bg: 'rgba(255,149,0,0.08)',  order: 4 },
  mythic:       { label: 'MYTHIC',        color: '#ff9f0a', bg: 'rgba(255,159,10,0.08)',  order: 5 },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Tiers' },
  { value: 'free', label: 'Free' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'mythic', label: 'Mythic' },
];

function getTierGroup(skin: typeof NINJA_SKINS[0]): string {
  if (skin.tier === 'free' && skin.category === 'starter') return 'free_starter';
  if (skin.tier === 'free' && skin.category === 'country') return 'free_country';
  return skin.tier;
}

function getTierBadgeColor(tier: string): string {
  switch (tier) {
    case 'free': return '#86868b';
    case 'rare': return '#0071e3';
    case 'epic': return '#af52de';
    case 'legendary': return '#ff9500';
    case 'mythic': return '#ff9f0a';
    default: return '#86868b';
  }
}

export function SkinsManagement() {
  // --- State ---
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [ownership, setOwnership] = useState<OwnershipMap>({});
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrides>({});
  const [editingPrices, setEditingPrices] = useState<PriceOverrides>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Grant skin
  const [showGrant, setShowGrant] = useState(false);
  const [grantSearch, setGrantSearch] = useState('');
  const [grantPlayer, setGrantPlayer] = useState<PlayerDoc | null>(null);
  const [grantSkinId, setGrantSkinId] = useState('');
  const [grantConfirm, setGrantConfirm] = useState(false);
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMsg, setGrantMsg] = useState('');

  // Revoke skin
  const [showRevoke, setShowRevoke] = useState(false);
  const [revokeSearch, setRevokeSearch] = useState('');
  const [revokePlayer, setRevokePlayer] = useState<PlayerDoc | null>(null);
  const [revokeSkinId, setRevokeSkinId] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState('');

  // Active section
  const [activeSection, setActiveSection] = useState<'catalog' | 'grant' | 'revoke' | 'prices'>('catalog');

  // --- Fetch players (real-time) ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'players'), (snap) => {
      const docs: PlayerDoc[] = snap.docs.map(d => ({
        id: d.id,
        username: d.data().username || '',
        ownedNinjas: d.data().ownedNinjas || [],
        coins: d.data().coins || 0,
        ninjaType: d.data().ninjaType || '',
      }));
      setPlayers(docs);

      // Build ownership map
      const map: OwnershipMap = {};
      for (const skin of NINJA_SKINS) {
        map[skin.id] = 0;
      }
      for (const p of docs) {
        for (const skinId of (p.ownedNinjas || [])) {
          if (map[skinId] !== undefined) {
            map[skinId]++;
          }
        }
      }
      setOwnership(map);
    });
    return () => unsub();
  }, []);

  // --- Fetch price overrides ---
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'skins'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPriceOverrides(data.priceOverrides || {});
        setEditingPrices(data.priceOverrides || {});
      }
    });
    return () => unsub();
  }, []);

  // --- Grouped & filtered skins ---
  const groupedSkins = useMemo(() => {
    let filtered = [...NINJA_SKINS];

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(sk => sk.name.toLowerCase().includes(s) || sk.id.toLowerCase().includes(s));
    }

    if (tierFilter !== 'all') {
      if (tierFilter === 'free') {
        filtered = filtered.filter(sk => sk.tier === 'free');
      } else {
        filtered = filtered.filter(sk => sk.tier === tierFilter);
      }
    }

    const groups: Record<string, typeof NINJA_SKINS> = {};
    for (const skin of filtered) {
      const group = getTierGroup(skin);
      if (!groups[group]) groups[group] = [];
      groups[group].push(skin);
    }

    return Object.entries(groups)
      .sort((a, b) => (TIER_CONFIG[a[0]]?.order ?? 99) - (TIER_CONFIG[b[0]]?.order ?? 99));
  }, [search, tierFilter]);

  // --- Stats ---
  const stats = useMemo(() => {
    const totalSkins = NINJA_SKINS.length;
    const freeSkins = NINJA_SKINS.filter(s => s.tier === 'free').length;
    const paidSkins = totalSkins - freeSkins;
    const totalOwned = Object.values(ownership).reduce((a, b) => a + b, 0);
    const mostPopular = Object.entries(ownership).sort((a, b) => b[1] - a[1])[0];
    const mostPopularSkin = mostPopular ? NINJA_SKINS.find(s => s.id === mostPopular[0]) : null;
    return { totalSkins, freeSkins, paidSkins, totalOwned, mostPopularSkin, mostPopularCount: mostPopular?.[1] || 0 };
  }, [ownership]);

  // --- Grant skin handler ---
  const handleGrant = async () => {
    if (!grantPlayer || !grantSkinId) return;
    setGrantLoading(true);
    try {
      await updateDoc(doc(db, 'players', grantPlayer.id), {
        ownedNinjas: arrayUnion(grantSkinId),
      });
      setGrantMsg(`Granted "${NINJA_SKINS.find(s => s.id === grantSkinId)?.name}" to ${grantPlayer.username}`);
      setGrantConfirm(false);
      setGrantSkinId('');
      setTimeout(() => setGrantMsg(''), 3000);
    } catch (e: any) {
      setGrantMsg(`Error: ${e.message}`);
    }
    setGrantLoading(false);
  };

  // --- Revoke skin handler ---
  const handleRevoke = async () => {
    if (!revokePlayer || !revokeSkinId) return;
    setRevokeLoading(true);
    try {
      await updateDoc(doc(db, 'players', revokePlayer.id), {
        ownedNinjas: arrayRemove(revokeSkinId),
      });
      setRevokeMsg(`Revoked "${NINJA_SKINS.find(s => s.id === revokeSkinId)?.name}" from ${revokePlayer.username}`);
      setRevokeConfirm(false);
      setRevokeSkinId('');
      setTimeout(() => setRevokeMsg(''), 3000);
    } catch (e: any) {
      setRevokeMsg(`Error: ${e.message}`);
    }
    setRevokeLoading(false);
  };

  // --- Save price overrides ---
  const handleSavePrices = async () => {
    setLoadingPrices(true);
    try {
      const cleaned: PriceOverrides = {};
      for (const [skinId, price] of Object.entries(editingPrices)) {
        const original = NINJA_SKINS.find(s => s.id === skinId)?.price;
        if (price !== undefined && price !== original && price >= 0) {
          cleaned[skinId] = price;
        }
      }
      await setDoc(doc(db, 'config', 'skins'), { priceOverrides: cleaned }, { merge: true });
      setLoadingPrices(false);
    } catch (e: any) {
      console.error('Failed to save price overrides', e);
      setLoadingPrices(false);
    }
  };

  // --- Filtered players for grant/revoke search ---
  const filteredGrantPlayers = useMemo(() => {
    if (!grantSearch) return [];
    const s = grantSearch.toLowerCase();
    return players.filter(p => p.username.toLowerCase().includes(s)).slice(0, 10);
  }, [grantSearch, players]);

  const filteredRevokePlayers = useMemo(() => {
    if (!revokeSearch) return [];
    const s = revokeSearch.toLowerCase();
    return players.filter(p => p.username.toLowerCase().includes(s)).slice(0, 10);
  }, [revokeSearch, players]);

  // Revoke player's skins
  const revokePlayerSkins = useMemo(() => {
    if (!revokePlayer) return [];
    return NINJA_SKINS.filter(s => (revokePlayer.ownedNinjas || []).includes(s.id));
  }, [revokePlayer, players]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Palette size={24} className="text-[#0071e3]" /> Skins Management
          </h2>
          <p className="text-sm text-[#86868b] mt-1">{stats.totalSkins} total skins ({stats.freeSkins} free, {stats.paidSkins} paid)</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Skins', value: stats.totalSkins.toString(), icon: Palette, color: '#0071e3' },
          { label: 'Total Owned', value: stats.totalOwned.toString(), icon: Users, color: '#34c759' },
          { label: 'Most Popular', value: stats.mostPopularSkin ? `${stats.mostPopularSkin.name} (${stats.mostPopularCount})` : '-', icon: Crown, color: '#ff9500' },
          { label: 'Active Sales', value: Object.keys(priceOverrides).length.toString(), icon: Tag, color: '#af52de' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} style={{ color: stat.color }} />
              <span className="text-xs text-[#86868b] uppercase tracking-wide">{stat.label}</span>
            </div>
            <p className="text-sm font-semibold text-[#1d1d1f] truncate" title={stat.value}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {([
          { key: 'catalog', label: 'Skin Catalog', icon: Palette },
          { key: 'grant', label: 'Grant Skin', icon: UserPlus },
          { key: 'revoke', label: 'Revoke Skin', icon: Trash2 },
          { key: 'prices', label: 'Price Overrides', icon: Tag },
        ] as const).map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeSection === s.key
                ? 'bg-[#0071e3] text-white'
                : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] hover:bg-white'
            }`}
          >
            <s.icon size={14} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ===================== SKIN CATALOG ===================== */}
      {activeSection === 'catalog' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skin name..."
                className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-10 pr-4 py-2.5 text-[#1d1d1f] w-full focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none text-sm"
              />
            </div>
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none appearance-none cursor-pointer"
              >
                {FILTER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Skin Groups */}
          {groupedSkins.map(([groupKey, skins]) => {
            const config = TIER_CONFIG[groupKey] || { label: groupKey.toUpperCase(), color: '#86868b', bg: 'rgba(134,134,139,0.05)', order: 99 };
            return (
              <div key={groupKey} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                  <h3 className="text-sm font-semibold" style={{ color: config.color }}>{config.label}</h3>
                  <span className="text-xs text-[#86868b]">({skins.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {skins.map((skin, idx) => {
                    const overridePrice = priceOverrides[skin.id];
                    const hasOverride = overridePrice !== undefined && overridePrice !== skin.price;
                    return (
                      <motion.div
                        key={skin.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className="bg-white rounded-2xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all group"
                      >
                        {/* Profile Image */}
                        <div className="flex justify-center mb-2">
                          <div
                            className="w-16 h-16 rounded-full overflow-hidden border-2"
                            style={{ borderColor: skin.borderColor || config.color }}
                          >
                            <img
                              src={skin.profileImage}
                              alt={skin.name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          </div>
                        </div>

                        {/* Name */}
                        <p className="text-xs font-medium text-[#1d1d1f] text-center truncate mb-1" title={skin.name}>
                          {skin.name}
                        </p>

                        {/* Tier Badge */}
                        <div className="flex justify-center mb-1">
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase"
                            style={{
                              backgroundColor: `${getTierBadgeColor(skin.tier)}15`,
                              color: getTierBadgeColor(skin.tier),
                              border: `1px solid ${getTierBadgeColor(skin.tier)}30`,
                            }}
                          >
                            {skin.tier}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="flex justify-center items-center gap-1 mb-1">
                          <Coins size={10} className="text-[#ff9500]" />
                          {hasOverride ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-[#86868b] line-through">{skin.price}</span>
                              <span className="text-xs font-semibold text-[#34c759]">{overridePrice}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#86868b]">
                              {skin.price === 0 ? 'FREE' : skin.price}
                            </span>
                          )}
                        </div>

                        {/* Category */}
                        <p className="text-[9px] text-[#86868b] text-center uppercase mb-1">{skin.category}</p>

                        {/* Perks Summary */}
                        {skin.tier !== 'free' && (
                          <div className="flex justify-center gap-1 flex-wrap mb-1">
                            {skin.perks.xpBoost > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#34c759]">
                                <Zap size={8} /> +{skin.perks.xpBoost}% XP
                              </span>
                            )}
                            {skin.perks.coinBonus > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#ff9500]">
                                <Coins size={8} /> +{skin.perks.coinBonus}%
                              </span>
                            )}
                            {skin.perks.chestDiscount > 0 && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#0071e3]">
                                <Percent size={8} /> -{skin.perks.chestDiscount}%
                              </span>
                            )}
                          </div>
                        )}

                        {/* Owners */}
                        <div className="flex justify-center items-center gap-1 mt-1 pt-1 border-t border-[#e5e5ea]/60">
                          <Users size={10} className="text-[#86868b]" />
                          <span className="text-[10px] text-[#86868b]">
                            {ownership[skin.id] || 0} owners
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groupedSkins.length === 0 && (
            <div className="text-center py-12">
              <Palette size={40} className="mx-auto text-[#d2d2d7] mb-3" />
              <p className="text-sm text-[#86868b]">No skins match your search</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ===================== GRANT SKIN ===================== */}
      {activeSection === 'grant' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
            <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2 mb-4">
              <UserPlus size={18} className="text-[#0071e3]" /> Grant Skin to Player
            </h3>

            {/* Success/Error msg */}
            {grantMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
                  grantMsg.startsWith('Error') ? 'bg-[#fff5f5] text-[#ff3b30] border border-[#ff3b30]/20' : 'bg-[#f0faf0] text-[#34c759] border border-[#34c759]/20'
                }`}
              >
                {grantMsg.startsWith('Error') ? <AlertTriangle size={14} /> : <Check size={14} />}
                {grantMsg}
              </motion.div>
            )}

            {/* Step 1: Search player */}
            <div className="mb-4">
              <label className="text-xs text-[#86868b] mb-1 block">1. Search Player</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  value={grantSearch}
                  onChange={(e) => { setGrantSearch(e.target.value); setGrantPlayer(null); setGrantSkinId(''); }}
                  placeholder="Type username..."
                  className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-10 pr-4 py-2.5 text-[#1d1d1f] w-full focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none text-sm"
                />
              </div>
              {/* Results */}
              {filteredGrantPlayers.length > 0 && !grantPlayer && (
                <div className="mt-2 bg-white rounded-xl border border-[#e5e5ea]/60 shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-40 overflow-y-auto">
                  {filteredGrantPlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setGrantPlayer(p); setGrantSearch(p.username); }}
                      className="w-full text-left px-4 py-2 hover:bg-[#f5f5f7] transition-all text-sm text-[#1d1d1f] flex items-center gap-2"
                    >
                      <Users size={12} className="text-[#86868b]" />
                      {p.username}
                      <span className="text-[#86868b] text-xs ml-auto">{(p.ownedNinjas || []).length} skins</span>
                    </button>
                  ))}
                </div>
              )}
              {grantPlayer && (
                <div className="mt-2 flex items-center gap-2">
                  <Check size={14} className="text-[#34c759]" />
                  <span className="text-sm text-[#34c759]">Selected: {grantPlayer.username}</span>
                  <button onClick={() => { setGrantPlayer(null); setGrantSearch(''); setGrantSkinId(''); }} className="text-[#86868b] hover:text-[#1d1d1f] ml-2">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Select skin */}
            {grantPlayer && (
              <div className="mb-4">
                <label className="text-xs text-[#86868b] mb-1 block">2. Select Skin to Grant</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                  {NINJA_SKINS.filter(s => !(grantPlayer.ownedNinjas || []).includes(s.id)).map(skin => (
                    <button
                      key={skin.id}
                      onClick={() => setGrantSkinId(skin.id)}
                      className={`p-2 rounded-xl border transition-all text-center ${
                        grantSkinId === skin.id
                          ? 'border-[#0071e3] bg-[#0071e3]/5'
                          : 'border-[#e5e5ea]/60 bg-[#f5f5f7] hover:border-[#d2d2d7]'
                      }`}
                    >
                      <div className="flex justify-center mb-1">
                        <img src={skin.profileImage} alt={skin.name} className="w-10 h-10 rounded-full object-cover" draggable={false} />
                      </div>
                      <p className="text-[10px] text-[#1d1d1f] truncate">{skin.name}</p>
                      <span
                        className="text-[8px] font-medium uppercase"
                        style={{ color: getTierBadgeColor(skin.tier) }}
                      >
                        {skin.tier}
                      </span>
                    </button>
                  ))}
                </div>
                {NINJA_SKINS.filter(s => !(grantPlayer.ownedNinjas || []).includes(s.id)).length === 0 && (
                  <p className="text-sm text-[#86868b] py-4 text-center">Player already owns all skins</p>
                )}
              </div>
            )}

            {/* Step 3: Confirm */}
            {grantPlayer && grantSkinId && !grantConfirm && (
              <button
                onClick={() => setGrantConfirm(true)}
                className="w-full py-2.5 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all"
              >
                Grant Skin
              </button>
            )}

            {grantConfirm && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-[#fff8f0] border border-[#ff9500]/20"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-[#ff9500]" />
                  <span className="text-sm font-semibold text-[#ff9500]">Confirm Grant</span>
                </div>
                <p className="text-sm text-[#1d1d1f] mb-3">
                  Grant <strong>{NINJA_SKINS.find(s => s.id === grantSkinId)?.name}</strong> to{' '}
                  <strong className="text-[#0071e3]">{grantPlayer?.username}</strong>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleGrant}
                    disabled={grantLoading}
                    className="flex-1 py-2.5 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all disabled:opacity-50"
                  >
                    {grantLoading ? 'Granting...' : 'Yes, Grant'}
                  </button>
                  <button
                    onClick={() => setGrantConfirm(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* ===================== REVOKE SKIN ===================== */}
      {activeSection === 'revoke' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
            <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2 mb-4">
              <Trash2 size={18} className="text-[#ff3b30]" /> Revoke Skin from Player
            </h3>

            {/* Success/Error msg */}
            {revokeMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
                  revokeMsg.startsWith('Error') ? 'bg-[#fff5f5] text-[#ff3b30] border border-[#ff3b30]/20' : 'bg-[#f0faf0] text-[#34c759] border border-[#34c759]/20'
                }`}
              >
                {revokeMsg.startsWith('Error') ? <AlertTriangle size={14} /> : <Check size={14} />}
                {revokeMsg}
              </motion.div>
            )}

            {/* Step 1: Search player */}
            <div className="mb-4">
              <label className="text-xs text-[#86868b] mb-1 block">1. Search Player</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  value={revokeSearch}
                  onChange={(e) => { setRevokeSearch(e.target.value); setRevokePlayer(null); setRevokeSkinId(''); }}
                  placeholder="Type username..."
                  className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-10 pr-4 py-2.5 text-[#1d1d1f] w-full focus:border-[#ff3b30] focus:ring-2 focus:ring-[#ff3b30]/20 outline-none text-sm"
                />
              </div>
              {filteredRevokePlayers.length > 0 && !revokePlayer && (
                <div className="mt-2 bg-white rounded-xl border border-[#e5e5ea]/60 shadow-[0_4px_12px_rgba(0,0,0,0.08)] max-h-40 overflow-y-auto">
                  {filteredRevokePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setRevokePlayer(p); setRevokeSearch(p.username); }}
                      className="w-full text-left px-4 py-2 hover:bg-[#fff5f5] transition-all text-sm text-[#1d1d1f] flex items-center gap-2"
                    >
                      <Users size={12} className="text-[#86868b]" />
                      {p.username}
                      <span className="text-[#86868b] text-xs ml-auto">{(p.ownedNinjas || []).length} skins</span>
                    </button>
                  ))}
                </div>
              )}
              {revokePlayer && (
                <div className="mt-2 flex items-center gap-2">
                  <Check size={14} className="text-[#ff3b30]" />
                  <span className="text-sm text-[#ff3b30]">Selected: {revokePlayer.username}</span>
                  <button onClick={() => { setRevokePlayer(null); setRevokeSearch(''); setRevokeSkinId(''); }} className="text-[#86868b] hover:text-[#1d1d1f] ml-2">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Select skin to revoke */}
            {revokePlayer && (
              <div className="mb-4">
                <label className="text-xs text-[#86868b] mb-1 block">2. Select Skin to Revoke</label>
                {revokePlayerSkins.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                    {revokePlayerSkins.map(skin => (
                      <button
                        key={skin.id}
                        onClick={() => setRevokeSkinId(skin.id)}
                        className={`p-2 rounded-xl border transition-all text-center ${
                          revokeSkinId === skin.id
                            ? 'border-[#ff3b30] bg-[#ff3b30]/5'
                            : 'border-[#e5e5ea]/60 bg-[#f5f5f7] hover:border-[#d2d2d7]'
                        }`}
                      >
                        <div className="flex justify-center mb-1">
                          <img src={skin.profileImage} alt={skin.name} className="w-10 h-10 rounded-full object-cover" draggable={false} />
                        </div>
                        <p className="text-[10px] text-[#1d1d1f] truncate">{skin.name}</p>
                        <span
                          className="text-[8px] font-medium uppercase"
                          style={{ color: getTierBadgeColor(skin.tier) }}
                        >
                          {skin.tier}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#86868b] py-4 text-center">Player has no owned skins</p>
                )}
              </div>
            )}

            {/* Step 3: Confirm */}
            {revokePlayer && revokeSkinId && !revokeConfirm && (
              <button
                onClick={() => setRevokeConfirm(true)}
                className="w-full py-2.5 rounded-xl text-[#ff3b30] border border-[#d2d2d7] font-medium text-sm hover:bg-[#fff5f5] transition-all"
              >
                Revoke Skin
              </button>
            )}

            {revokeConfirm && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-[#fff5f5] border border-[#ff3b30]/20"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-[#ff3b30]" />
                  <span className="text-sm font-semibold text-[#ff3b30]">Confirm Revoke</span>
                </div>
                <p className="text-sm text-[#1d1d1f] mb-3">
                  Remove <strong>{NINJA_SKINS.find(s => s.id === revokeSkinId)?.name}</strong> from{' '}
                  <strong className="text-[#ff3b30]">{revokePlayer?.username}</strong>? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRevoke}
                    disabled={revokeLoading}
                    className="flex-1 py-2.5 rounded-xl bg-[#ff3b30] text-white font-medium text-sm hover:bg-[#ff453a] transition-all disabled:opacity-50"
                  >
                    {revokeLoading ? 'Revoking...' : 'Yes, Revoke'}
                  </button>
                  <button
                    onClick={() => setRevokeConfirm(false)}
                    className="px-4 py-2.5 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* ===================== PRICE OVERRIDES ===================== */}
      {activeSection === 'prices' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                <Tag size={18} className="text-[#0071e3]" /> Skin Price Overrides (Sales)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingPrices(priceOverrides)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-xs font-medium hover:bg-[#f5f5f7] transition-all"
                >
                  <RotateCcw size={12} /> Reset
                </button>
                <button
                  onClick={handleSavePrices}
                  disabled={loadingPrices}
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-[#0071e3] text-white text-xs font-medium hover:bg-[#0077ED] transition-all disabled:opacity-50"
                >
                  <Save size={12} /> {loadingPrices ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            <p className="text-xs text-[#86868b] mb-4">
              Set temporary sale prices for skins. Only paid skins are shown. Leave blank or match original price to remove override.
            </p>

            {/* Paid skins table */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {NINJA_SKINS.filter(s => s.price > 0).map(skin => {
                const hasOverride = editingPrices[skin.id] !== undefined && editingPrices[skin.id] !== skin.price;
                return (
                  <div
                    key={skin.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      hasOverride ? 'bg-[#0071e3]/5 border-[#0071e3]/20' : 'bg-[#f5f5f7] border-[#e5e5ea]/60'
                    }`}
                  >
                    <img src={skin.profileImage} alt={skin.name} className="w-10 h-10 rounded-full object-cover" draggable={false} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1d1d1f] truncate">{skin.name}</p>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-medium uppercase"
                          style={{ color: getTierBadgeColor(skin.tier) }}
                        >
                          {skin.tier}
                        </span>
                        <span className="text-[#86868b] text-[10px]">Original: {skin.price} coins</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins size={14} className="text-[#ff9500]" />
                      <input
                        type="number"
                        min={0}
                        placeholder={skin.price.toString()}
                        value={editingPrices[skin.id] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingPrices(prev => {
                            const next = { ...prev };
                            if (val === '' || val === skin.price.toString()) {
                              delete next[skin.id];
                            } else {
                              next[skin.id] = parseInt(val) || 0;
                            }
                            return next;
                          });
                        }}
                        className="w-24 bg-white border border-[#d2d2d7] rounded-xl px-3 py-1.5 text-[#1d1d1f] text-sm text-center focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                      />
                      {hasOverride && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-[#0071e3]"
                        >
                          <Sparkles size={14} />
                        </motion.span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active overrides summary */}
          {Object.keys(priceOverrides).length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <h4 className="text-sm font-semibold text-[#ff9500] flex items-center gap-2 mb-3">
                <Tag size={14} /> Active Sales ({Object.keys(priceOverrides).length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(priceOverrides).map(([skinId, price]) => {
                  const skin = NINJA_SKINS.find(s => s.id === skinId);
                  if (!skin) return null;
                  const discount = Math.round(((skin.price - price) / skin.price) * 100);
                  return (
                    <div
                      key={skinId}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#fff8f0] border border-[#ff9500]/20"
                    >
                      <img src={skin.profileImage} alt={skin.name} className="w-5 h-5 rounded-full object-cover" draggable={false} />
                      <span className="text-xs text-[#1d1d1f]">{skin.name}</span>
                      <span className="text-xs text-[#86868b] line-through">{skin.price}</span>
                      <span className="text-xs font-semibold text-[#34c759]">{price}</span>
                      {discount > 0 && (
                        <span className="text-[10px] font-medium text-[#ff9500]">-{discount}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
