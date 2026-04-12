'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, increment, addDoc, collection } from 'firebase/firestore';
import { CHESTS, TIME_PACKAGES as BASE_TIME_PACKAGES, COIN_PACKAGES as BASE_COIN_PACKAGES } from '@/lib/constants';
import {
  Coins, X, Check, Crown, Star, Package, Clock, CreditCard,
  ChevronDown, Timer, Lock, Info, ShoppingBag, Sparkles,
} from 'lucide-react';

interface Props {
  player: any;
  onBack?: () => void;
}

// ── Tier config ──────────────────────────────────────────────
const TIER_CONFIG = {
  free:      { label: 'FREE',      color: '#4ade80', glow: 'rgba(74,222,128,0.3)'  },
  rare:      { label: 'RARE',      color: '#1E88E5', glow: 'rgba(30,136,229,0.3)'  },
  epic:      { label: 'EPIC',      color: '#8E24AA', glow: 'rgba(142,36,170,0.3)'  },
  legendary: { label: 'LEGENDARY', color: '#FF6F00', glow: 'rgba(255,111,0,0.35)' },
  mythic:    { label: 'MYTHIC',    color: '#FF1493', glow: 'rgba(255,20,147,0.35)' },
} as const;
type Tier = keyof typeof TIER_CONFIG;

const NINJA_SKINS = [
  { id: 'neon',    name: 'Neon Ninja',    tier: 'free'      as Tier, price: 0,    color: '#39FF14', description: 'Electric energy flows through your veins.', perks: ['Neon trail effect', 'Green aura', 'Free for all'] },
  { id: 'shadow',  name: 'Shadow Ninja',  tier: 'free'      as Tier, price: 0,    color: '#8B00FF', description: 'One with the darkness.', perks: ['Dark aura', 'Shadow border', 'Free for all'] },
  { id: 'fire',    name: 'Fire Ninja',    tier: 'rare'      as Tier, price: 150,  color: '#FF4500', description: 'Born from the flames of battle.', perks: ['Flame trail', 'Fire border', '+2% XP'] },
  { id: 'ice',     name: 'Ice Ninja',     tier: 'rare'      as Tier, price: 150,  color: '#00BFFF', description: 'Cold as the arctic wind.', perks: ['Frost particles', 'Ice border', '+2% XP'] },
  { id: 'cyber',   name: 'Cyber Ninja',   tier: 'rare'      as Tier, price: 200,  color: '#9B59B6', description: 'Enhanced with cutting-edge technology.', perks: ['Circuit overlay', 'Cyber HUD', '+3% XP'] },
  { id: 'golden',  name: 'Golden Ninja',  tier: 'epic'      as Tier, price: 500,  color: '#FFD700', description: 'Legendary warrior of light.', perks: ['Gold shimmer', 'Gold crown icon', '+5% XP', 'Gold badge'] },
  { id: 'phantom', name: 'Phantom Ninja', tier: 'epic'      as Tier, price: 500,  color: '#8B00FF', description: 'Between worlds and beyond reach.', perks: ['Phase-shift animation', 'Phantom pulse', '+5% XP'] },
  { id: 'dragon',  name: 'Dragon Ninja',  tier: 'legendary' as Tier, price: 1200, color: '#FF2D00', description: 'Infused with dragon spirit.', perks: ['Dragon aura', 'Scales border', '+10% XP', 'Red name'] },
  { id: 'storm',   name: 'Storm Ninja',   tier: 'legendary' as Tier, price: 1200, color: '#00E5FF', description: 'Born in lightning.', perks: ['Lightning effect', 'Storm border', '+10% XP', 'Blue name'] },
  { id: 'shogun',  name: 'Shogun Ninja',  tier: 'mythic'    as Tier, price: 0,    color: '#FF1493', description: 'The ultimate ninja. Currently locked.', perks: ['Full body glow', 'Shogun title', '+15% XP', 'VIP only'] },
];

const TIME_PACKAGES = BASE_TIME_PACKAGES.map(p => {
  const savings = (p.hours * 100) - p.coins;
  return {
    id: p.id,
    label: p.label,
    hours: p.hours,
    coins: p.coins,
    popular: p.id === 'time_gold',
    savings: savings > 0 ? `Save ${savings}` : undefined,
  };
});

const JOD_PACKAGES = BASE_COIN_PACKAGES.map(p => ({
  id: p.id,
  jod: p.price,
  coins: p.coins,
  popular: !!p.popular,
  name: p.name,
  bonus: p.bonusPercentage || 0,
}));

const TIERS_ORDER: Tier[] = ['free', 'rare', 'epic', 'legendary', 'mythic'];
type SubTab = 'skins' | 'chests' | 'time' | 'coins';

export function StoreView({ player, onBack }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('skins');
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [selectedSkin, setSelectedSkin] = useState<typeof NINJA_SKINS[number] | null>(null);
  const [buying, setBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const ownedNinjas: string[] = player.ownedNinjas || ['neon', 'shadow'];

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const buySkin = async (skin: typeof NINJA_SKINS[number]) => {
    if (buying) return;
    if (ownedNinjas.includes(skin.id)) return showToast('Already owned!', false);
    if (skin.tier === 'mythic') return showToast('Mythic skins are locked.', false);
    if (player.coins < skin.price) return showToast('Not enough coins!', false);
    setBuying(true);
    try {
      // Add skin to both ownedNinjas and inventory
      const skinItem = {
        id: `skin_${skin.id}_${Date.now()}`,
        type: 'skin',
        name: skin.name,
        rarity: skin.tier === 'legendary' ? 'legendary' : skin.tier === 'epic' ? 'epic' : skin.tier === 'rare' ? 'rare' : 'common',
        skinId: skin.id,
        value: skin.price,
        obtainedAt: Date.now(),
        used: false,
        tradeable: skin.tier !== 'free',
      };
      const currentInventory = [...(player.inventory || []), skinItem];
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-skin.price),
        ownedNinjas: arrayUnion(skin.id),
        totalCoinsSpent: increment(skin.price),
        inventory: currentInventory,
      });
      setBuySuccess(true);
      showToast(`${skin.name} unlocked!`, true);
      setTimeout(() => { setBuySuccess(false); setSelectedSkin(null); }, 1500);
    } catch {
      showToast('Purchase failed.', false);
    } finally {
      setBuying(false);
    }
  };

  const requestTopup = async (pkg: typeof JOD_PACKAGES[number]) => {
    try {
      await addDoc(collection(db, 'topup_requests'), {
        playerId: player.uid,
        playerName: player.username,
        packageId: pkg.id,
        coins: pkg.coins,
        jod: pkg.jod,
        status: 'pending',
        createdAt: Date.now(),
      });
      showToast(`Request sent! Staff will process ${pkg.jod} JOD.`, true);
    } catch {
      showToast('Request failed.', false);
    }
  };

  const filteredSkins = NINJA_SKINS.filter(s => tierFilter === 'all' || s.tier === tierFilter);

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden relative">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="absolute top-16 left-4 right-4 z-50 px-4 py-3 rounded-xl font-body text-sm flex items-center gap-2"
            style={{
              background: toast.ok ? 'rgba(57,255,20,0.15)' : 'rgba(255,50,50,0.15)',
              border: `1px solid ${toast.ok ? '#39FF14' : '#FF4444'}50`,
              color: toast.ok ? '#39FF14' : '#FF6666',
              backdropFilter: 'blur(12px)',
            }}
          >
            {toast.ok ? <Check size={15} /> : <X size={15} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pb-3 border-b border-white/6"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        {onBack && (
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/6 text-gray-400 active:bg-white/12">
            <ChevronDown size={20} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="font-ninja text-xl text-ninja-green">STORE</h1>
          <p className="font-body text-xs text-gray-500 flex items-center gap-1">
            <Coins size={11} className="text-yellow-400" /> {Math.floor(player.coins)} coins
          </p>
        </div>
        <ShoppingBag size={20} className="text-gray-500" />
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto no-scrollbar shrink-0">
        {([
          { id: 'skins', label: 'SKINS', icon: <Star size={13} /> },
          { id: 'chests', label: 'CHESTS', icon: <Package size={13} /> },
          { id: 'time', label: 'TIME', icon: <Clock size={13} /> },
          { id: 'coins', label: 'COINS', icon: <Coins size={13} /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-ninja text-xs whitespace-nowrap transition-all shrink-0"
            style={{
              background: subTab === tab.id ? 'rgba(57,255,20,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${subTab === tab.id ? '#39FF14' : 'rgba(255,255,255,0.08)'}`,
              color: subTab === tab.id ? '#39FF14' : '#666',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── SKINS ── */}
          {subTab === 'skins' && (
            <motion.div key="skins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 pb-6">
              {/* Tier filter scroll */}
              <div className="flex gap-2 py-3 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setTierFilter('all')}
                  className="px-3 py-1 rounded-full font-ninja text-[11px] shrink-0 transition-all"
                  style={{
                    background: tierFilter === 'all' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tierFilter === 'all' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: tierFilter === 'all' ? '#fff' : '#555',
                  }}
                >ALL</button>
                {TIERS_ORDER.map(tier => {
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <button key={tier} onClick={() => setTierFilter(tier)}
                      className="px-3 py-1 rounded-full font-ninja text-[11px] shrink-0 transition-all"
                      style={{
                        background: tierFilter === tier ? `${cfg.color}20` : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${tierFilter === tier ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                        color: tierFilter === tier ? cfg.color : '#555',
                      }}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* 2-col grid */}
              <div className="grid grid-cols-2 gap-3">
                {filteredSkins.map((skin, i) => {
                  const cfg = TIER_CONFIG[skin.tier];
                  const owned = ownedNinjas.includes(skin.id);
                  const isMythic = skin.tier === 'mythic';
                  const canAfford = player.coins >= skin.price;
                  return (
                    <motion.div
                      key={skin.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => !isMythic && setSelectedSkin(skin)}
                      className="rounded-2xl overflow-hidden relative active:scale-95 transition-transform"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `2px solid ${cfg.color}35`,
                        boxShadow: owned ? `0 0 14px ${cfg.glow}` : 'none',
                        opacity: isMythic ? 0.6 : 1,
                      }}
                    >
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full font-ninja text-[9px]"
                        style={{ background: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
                        {cfg.label}
                      </div>
                      {owned && (
                        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-ninja-green flex items-center justify-center">
                          <Check size={10} className="text-black" />
                        </div>
                      )}
                      {isMythic && (
                        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center border border-pink-500/40">
                          <Lock size={9} className="text-pink-400" />
                        </div>
                      )}

                      <div className="h-28 flex items-center justify-center relative"
                        style={{ background: `radial-gradient(circle, ${cfg.color}12 0%, transparent 70%)` }}>
                        <img
                          src={`/ninjas/profiles/${skin.id}-ninja-profile-photo.png`}
                          alt={skin.name}
                          className="h-24 w-24 object-contain"
                          style={{ filter: `drop-shadow(0 0 8px ${cfg.color}70)` }}
                          onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${skin.id}.png`; }}
                        />
                      </div>

                      <div className="p-2.5">
                        <p className="font-ninja text-[13px] text-white truncate">{skin.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          {skin.tier === 'free' ? (
                            <span className="font-body text-[11px] text-green-400">FREE</span>
                          ) : isMythic ? (
                            <span className="font-body text-[11px] text-pink-400">LOCKED</span>
                          ) : (
                            <span className="font-body text-[11px] text-yellow-300 flex items-center gap-0.5">
                              <Coins size={9} /> {skin.price}
                            </span>
                          )}
                          <span className="font-body text-[10px]" style={{ color: owned ? '#39FF14' : canAfford ? cfg.color : '#444' }}>
                            {owned ? 'OWNED' : isMythic ? '' : canAfford ? '→' : 'LOW'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── CHESTS ── */}
          {subTab === 'chests' && (
            <motion.div key="chests" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 pb-6 pt-2">
              <p className="font-body text-gray-500 text-xs mb-4 text-center">Buy chests — win coins, vouchers & more</p>
              <div className="grid grid-cols-2 gap-3">
                {CHESTS.map((chest, i) => {
                  const canAfford = player.coins >= chest.cost;
                  return (
                    <motion.div key={chest.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="rounded-2xl p-4 text-center relative overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `2px solid ${chest.color}35`,
                        boxShadow: canAfford ? `0 0 16px ${chest.glowColor}` : 'none',
                        opacity: canAfford ? 1 : 0.5,
                      }}
                    >
                      <div className="absolute inset-0" style={{ background: `radial-gradient(circle, ${chest.color}10 0%, transparent 70%)` }} />
                      <img src={`/img/chest-${chest.tier}.png`} alt={chest.name}
                        className="w-16 h-16 mx-auto object-contain mb-2 relative z-10"
                        style={{ filter: `drop-shadow(0 0 8px ${chest.glowColor})` }} />
                      <h3 className="font-ninja text-sm relative z-10" style={{ color: chest.color }}>{chest.name}</h3>
                      <p className="font-body text-base text-white mt-1 relative z-10 flex items-center justify-center gap-1">
                        <Coins size={13} className="text-yellow-400" /> {chest.cost}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
              <p className="font-body text-gray-600 text-xs text-center mt-4">Open chests from the Home tab for the full spin experience!</p>
            </motion.div>
          )}

          {/* ── TIME ── */}
          {subTab === 'time' && (
            <motion.div key="time" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 pb-6 pt-2">
              <p className="font-body text-gray-500 text-xs mb-4 text-center">Add playtime using your coins</p>
              <div className="space-y-3">
                {TIME_PACKAGES.map((pkg, i) => {
                  const canAfford = player.coins >= pkg.coins;
                  return (
                    <motion.div key={pkg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${pkg.popular ? '#39FF14' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: pkg.popular ? '0 0 16px rgba(57,255,20,0.12)' : 'none',
                      }}
                    >
                      {pkg.popular && (
                        <div className="absolute top-0 right-0 px-2 py-0.5 bg-ninja-green rounded-bl-xl rounded-tr-xl font-ninja text-[9px] text-black">
                          BEST
                        </div>
                      )}
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)' }}>
                        <Timer size={22} className="text-ninja-green" />
                      </div>
                      <div className="flex-1">
                        <p className="font-ninja text-white text-base">{pkg.label}</p>
                        <p className="font-body text-xs text-gray-500">{pkg.hours * 60} minutes</p>
                        {'savings' in pkg && pkg.savings && (
                          <p className="font-body text-[11px] text-ninja-green">{pkg.savings}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-body text-sm text-yellow-300 flex items-center gap-0.5">
                          <Coins size={12} /> {pkg.coins}
                        </p>
                        <button
                          onClick={() => {
                            if (!canAfford) return showToast('Not enough coins!', false);
                            showToast(`${pkg.label} added!`, true);
                          }}
                          className="mt-1 px-3 py-1 rounded-lg font-ninja text-[11px] transition-all active:scale-95"
                          style={{
                            background: canAfford ? 'rgba(57,255,20,0.15)' : '#111',
                            border: `1px solid ${canAfford ? '#39FF14' : '#333'}`,
                            color: canAfford ? '#39FF14' : '#444',
                          }}
                        >
                          {canAfford ? 'BUY' : 'LOW'}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── COINS ── */}
          {subTab === 'coins' && (
            <motion.div key="coins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 pb-6 pt-2">
              <p className="font-body text-gray-500 text-xs mb-4 text-center">Purchase coins with Jordanian Dinar</p>
              <div className="space-y-3">
                {JOD_PACKAGES.map((pkg, i) => (
                  <motion.div key={pkg.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${pkg.popular ? '#FFD700' : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: pkg.popular ? '0 0 16px rgba(255,215,0,0.12)' : 'none',
                    }}
                  >
                    {pkg.popular && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 bg-yellow-500 rounded-bl-xl rounded-tr-xl font-ninja text-[9px] text-black flex items-center gap-1">
                        <Crown size={8} /> POPULAR
                      </div>
                    )}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)' }}>
                      <CreditCard size={22} className="text-yellow-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-ninja text-yellow-400 text-lg">{pkg.jod} JOD</p>
                      <p className="font-body text-xs text-gray-400 flex items-center gap-1">
                        <Coins size={10} className="text-yellow-300" /> {pkg.coins} coins
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => requestTopup(pkg)}
                      className="px-4 py-2 rounded-xl font-ninja text-xs transition-all"
                      style={{
                        background: 'rgba(255,215,0,0.12)',
                        border: '1px solid rgba(255,215,0,0.35)',
                        color: '#FFD700',
                      }}
                    >
                      REQUEST
                    </motion.button>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-xl flex items-start gap-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Info size={14} className="text-gray-600 mt-0.5 shrink-0" />
                <p className="font-body text-[11px] text-gray-600">A staff member will come to you to collect payment and add coins to your account.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Skin Detail Sheet ─────────────────────────────────── */}
      <AnimatePresence>
        {selectedSkin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-40"
              onClick={() => setSelectedSkin(null)}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
              style={{
                background: 'rgba(8,8,8,0.97)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${TIER_CONFIG[selectedSkin.tier].color}30`,
                borderBottom: 'none',
                maxHeight: '85vh',
                paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              <div className="overflow-y-auto px-5 pb-4">
                {/* Tier + close */}
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 rounded-full font-ninja text-xs"
                    style={{ background: `${TIER_CONFIG[selectedSkin.tier].color}20`, color: TIER_CONFIG[selectedSkin.tier].color, border: `1px solid ${TIER_CONFIG[selectedSkin.tier].color}40` }}>
                    {TIER_CONFIG[selectedSkin.tier].label}
                  </span>
                  <button onClick={() => setSelectedSkin(null)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/6 text-gray-400">
                    <X size={16} />
                  </button>
                </div>

                {/* Image */}
                <div className="flex justify-center mb-4 py-2"
                  style={{ background: `radial-gradient(circle, ${TIER_CONFIG[selectedSkin.tier].color}12, transparent 70%)`, borderRadius: 16 }}>
                  <motion.img
                    src={`/ninjas/profiles/${selectedSkin.id}-ninja-profile-photo.png`}
                    alt={selectedSkin.name}
                    className="h-32 w-32 object-contain"
                    style={{ filter: `drop-shadow(0 0 16px ${TIER_CONFIG[selectedSkin.tier].color}80)` }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                    onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${selectedSkin.id}.png`; }}
                  />
                </div>

                <h2 className="font-ninja text-xl mb-1" style={{ color: TIER_CONFIG[selectedSkin.tier].color }}>{selectedSkin.name}</h2>
                <p className="font-body text-sm text-gray-400 mb-4">{selectedSkin.description}</p>

                {/* Perks */}
                <p className="font-ninja text-xs text-gray-600 mb-2">PERKS</p>
                <div className="space-y-2 mb-6">
                  {selectedSkin.perks.map((perk, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check size={13} style={{ color: TIER_CONFIG[selectedSkin.tier].color }} />
                      <span className="font-body text-sm text-gray-300">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed buy button */}
              <div className="px-5">
                {ownedNinjas.includes(selectedSkin.id) ? (
                  <div className="py-3.5 rounded-2xl border border-ninja-green/30 bg-ninja-green/10 flex items-center justify-center gap-2">
                    <Check size={16} className="text-ninja-green" />
                    <span className="font-ninja text-sm text-ninja-green">ALREADY OWNED</span>
                  </div>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => buySkin(selectedSkin)}
                    disabled={buying || buySuccess || player.coins < selectedSkin.price}
                    className="w-full py-4 rounded-2xl font-ninja text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: buySuccess
                        ? '#39FF14'
                        : player.coins >= selectedSkin.price
                          ? TIER_CONFIG[selectedSkin.tier].color
                          : '#1a1a1a',
                      color: buySuccess || player.coins >= selectedSkin.price ? '#000' : '#444',
                      boxShadow: player.coins >= selectedSkin.price && !buySuccess
                        ? `0 0 24px ${TIER_CONFIG[selectedSkin.tier].glow}` : 'none',
                    }}
                  >
                    {buying ? (
                      <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : buySuccess ? (
                      <><Check size={18} /> UNLOCKED!</>
                    ) : player.coins >= selectedSkin.price ? (
                      <><Coins size={16} /> BUY FOR {selectedSkin.price} COINS</>
                    ) : (
                      'NOT ENOUGH COINS'
                    )}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
