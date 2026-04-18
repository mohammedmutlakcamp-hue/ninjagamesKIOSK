'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, increment, addDoc, collection } from 'firebase/firestore';
import { CHESTS, COIN_PACKAGES, NINJA_SKINS, RARITY_COLORS, VIP_CONFIG, TIME_PACKAGES as BASE_TIME_PACKAGES } from '@/lib/constants';
import { personalCoinCost } from '@/lib/pricing';
import { Chest, ChestReward, NinjaSkin } from '@/types';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { trackDailyTask } from '@/lib/daily-tasks';
import { useFeatureFlags } from '@/lib/feature-flags';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { ChestDropsPanels } from '@/components/kiosk/ChestDropsPanels';
import {
  Coins, Star, Package, Clock, X, Check,
  Crown, Timer, CreditCard, Lock, Info, ShoppingBag,
  Sparkles, Zap, Shield, Swords, Eye, Percent, ShieldCheck, Globe,
  Gift, Coffee, Cookie, UtensilsCrossed, Trophy, Users,
} from 'lucide-react';

interface Props {
  player: any;
  onClose?: () => void;
  initialSubTab?: string | null;
}

const TIER_CONFIG = {
  free:      { label: 'FREE',      color: '#4ade80', glow: 'rgba(74,222,128,0.35)',  border: 'rgba(74,222,128,0.35)',  gradient: 'from-green-500/20 to-green-900/10' },
  rare:      { label: 'RARE',      color: '#1E88E5', glow: 'rgba(30,136,229,0.35)',  border: 'rgba(30,136,229,0.35)',  gradient: 'from-blue-500/20 to-blue-900/10' },
  epic:      { label: 'EPIC',      color: '#8E24AA', glow: 'rgba(142,36,170,0.35)',  border: 'rgba(142,36,170,0.35)',  gradient: 'from-purple-500/20 to-purple-900/10' },
  legendary: { label: 'LEGENDARY', color: '#FF6F00', glow: 'rgba(255,111,0,0.4)',    border: 'rgba(255,111,0,0.4)',    gradient: 'from-orange-500/20 to-orange-900/10' },
  mythic:    { label: 'MYTHIC',    color: '#FF1493', glow: 'rgba(255,20,147,0.45)',  border: 'rgba(255,20,147,0.45)',  gradient: 'from-pink-500/20 to-pink-900/10' },
} as const;

type Tier = keyof typeof TIER_CONFIG;

// Time packages — sourced from shared constants so pricing stays consistent.
// Savings = coins saved vs buying the same hours at the 1h/100-coin base rate.
const TIME_PACKAGES = BASE_TIME_PACKAGES.map(p => {
  const savings = (p.hours * 100) - p.coins;
  return {
    id: p.id,
    label: p.label,
    hours: p.hours,
    coins: p.coins,
    popular: p.id === 'time_gold',
    savings: savings > 0 ? `Save ${savings}` : null as string | null,
  };
});

// JOD → coins packages — sourced from COIN_PACKAGES.
const JOD_PACKAGES = COIN_PACKAGES.map(p => ({
  id: p.id,
  jod: p.price,
  coins: p.coins,
  popular: !!p.popular,
  name: p.name,
  bonus: p.bonusPercentage || 0,
}));

type SubTab = 'skins' | 'chests' | 'giftcards' | 'time' | 'coins' | 'vip';
type CategoryFilter = 'all' | 'starter' | 'rare' | 'epic' | 'legendary' | 'mythic';

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'skins',     label: 'SKINS',     icon: <Swords size={18} /> },
  { id: 'chests',    label: 'CHESTS',    icon: <Package size={18} /> },
  { id: 'giftcards', label: 'GIFT CARDS', icon: <CreditCard size={18} /> },
  { id: 'time',      label: 'TIME',      icon: <Timer size={18} /> },
  { id: 'coins',     label: 'COINS',     icon: <Coins size={18} /> },
];

const CATEGORY_CARDS: { id: CategoryFilter; label: string; description: string; count?: number; color: string; icon: React.ReactNode }[] = [
  { id: 'rare',      label: 'RARE',      description: '6 unique skins', color: '#1E88E5', icon: <Zap size={24} /> },
  { id: 'epic',      label: 'EPIC',      description: '6 powerful skins', color: '#8E24AA', icon: <Shield size={24} /> },
  { id: 'legendary', label: 'LEGENDARY', description: '6 elite skins', color: '#FF6F00', icon: <Crown size={24} /> },
  { id: 'mythic',    label: 'MYTHIC',    description: '3 god-tier skins', color: '#FF1493', icon: <Star size={24} /> },
];

function getPerksList(skin: NinjaSkin): string[] {
  const perks = skin.perks;
  const list: string[] = [];
  if (perks.xpBoost > 0) list.push(`+${perks.xpBoost}% XP Boost`);
  if (perks.coinBonus > 0) list.push(`+${perks.coinBonus}% Coin Bonus`);
  if (perks.chestDiscount > 0) list.push(`${perks.chestDiscount}% Chest Discount`);
  if (perks.dailyLoginBonus > 0) list.push(`${perks.dailyLoginBonus} Daily Login Coins`);
  if (perks.bonusPlaytimeMinutes > 0) list.push(`+${perks.bonusPlaytimeMinutes} min Bonus/hr`);
  if (perks.freeWeeklyChest) list.push(`Free Weekly ${perks.freeWeeklyChest} Chest`);
  if (perks.nameGlowColor) list.push(`Name Glow Effect`);
  if (perks.badge) list.push(`${perks.badge} Badge`);
  if (perks.voiceMessages) list.push(`Voice Messages`);
  if (perks.chatEffects) list.push(`Chat Effects`);
  if (perks.animatedFrame) list.push(`Animated Frame`);
  if (list.length === 0) list.push('Default ninja perks');
  return list;
}

const getRewardIcon = (reward: ChestReward) => {
  if (reward.type === 'coins') return <Coins size={20} />;
  if (reward.type === 'xp_boost') return <Zap size={20} />;
  if (reward.id === 'voucher_drink') return <Coffee size={20} />;
  if (reward.id === 'voucher_snack') return <Cookie size={20} />;
  if (reward.id === 'voucher_food') return <UtensilsCrossed size={20} />;
  if (reward.id === 'tournament_pass') return <Trophy size={20} />;
  return <Gift size={20} />;
};

const getLargeRewardIcon = (reward: ChestReward, size = 40) => {
  if (reward.type === 'coins') return <Coins size={size} />;
  if (reward.type === 'xp_boost') return <Zap size={size} />;
  if (reward.id === 'voucher_drink') return <Coffee size={size} />;
  if (reward.id === 'voucher_snack') return <Cookie size={size} />;
  if (reward.id === 'voucher_food') return <UtensilsCrossed size={size} />;
  if (reward.id === 'tournament_pass') return <Trophy size={size} />;
  return <Gift size={size} />;
};

// ─── COLLECTION REWARDS ─────────────────────────────────────────────────────
const COLLECTION_REWARDS = [
  { tier: 'rare',      required: 3, reward: '500 Coins + Rare Chest', color: '#1E88E5' },
  { tier: 'epic',      required: 3, reward: '2000 Coins + Gold Chest', color: '#8E24AA' },
  { tier: 'legendary', required: 3, reward: '5000 Coins + Legendary Chest', color: '#FF6F00' },
  { tier: 'mythic',    required: 2, reward: '10000 Coins + Exclusive Title', color: '#FF1493' },
];

// ─── BUNDLES ──────────────────────────────────────────────────────────────
const BUNDLES = [
  {
    id: 'starter',
    name: 'STARTER PACK',
    description: 'Perfect for new players',
    color: '#39FF14',
    originalPrice: 750,
    price: 500,
    savings: 33,
    items: [
      { icon: 'coins', label: '500 Coins', color: '#FFD700' },
      { icon: 'time', label: '2 Hours Time', color: '#39FF14' },
      { icon: 'chest', label: 'Rare Chest', color: '#1E88E5' },
    ],
  },
  {
    id: 'gamer',
    name: 'GAMER BUNDLE',
    description: 'Best value for regulars',
    color: '#1E88E5',
    originalPrice: 1800,
    price: 1200,
    savings: 33,
    popular: true,
    items: [
      { icon: 'coins', label: '1200 Coins', color: '#FFD700' },
      { icon: 'time', label: '5 Hours Time', color: '#39FF14' },
      { icon: 'chest', label: '3x Rare Chests', color: '#1E88E5' },
      { icon: 'skin', label: 'Random Epic Skin', color: '#8E24AA' },
    ],
  },
  {
    id: 'elite',
    name: 'ELITE BUNDLE',
    description: 'For serious competitors',
    color: '#FF6F00',
    originalPrice: 4000,
    price: 2500,
    savings: 37,
    items: [
      { icon: 'coins', label: '2500 Coins', color: '#FFD700' },
      { icon: 'time', label: '15 Hours Time', color: '#39FF14' },
      { icon: 'chest', label: 'Legendary Chest', color: '#FF6F00' },
      { icon: 'skin', label: 'Random Legendary Skin', color: '#FF6F00' },
      { icon: 'tournament', label: 'Tournament Pass', color: '#FFD700' },
    ],
  },
  {
    id: 'mythic',
    name: 'MYTHIC BUNDLE',
    description: 'Ultimate ninja package',
    color: '#FF1493',
    originalPrice: 8000,
    price: 5000,
    savings: 37,
    items: [
      { icon: 'coins', label: '5000 Coins', color: '#FFD700' },
      { icon: 'time', label: '30 Hours Time', color: '#39FF14' },
      { icon: 'chest', label: '2x Legendary Chests', color: '#FF6F00' },
      { icon: 'skin', label: 'Random Mythic Skin', color: '#FF1493' },
      { icon: 'vip', label: '30-day VIP Pass', color: '#FFD700' },
    ],
  },
];

// ─── GIFT CARD BRANDS ─────────────────────────────────────────────────────
type GiftCardCategory = 'gaming' | 'apps' | 'shopping' | 'mobile';

interface GiftCardBrand {
  id: string;
  name: string;
  wordmark: string;     // big stylized brand text shown on the card
  tagline: string;      // small sub-line shown below wordmark
  category: GiftCardCategory;
  color: string;        // base background color
  bgGradient: string;   // full background gradient
  accent: string;       // accent / wordmark color
  glow: string;         // glow rgba
  currency: string;
  denominations: number[];
  logos: string[];      // multi-stage fallback URLs
  italic?: boolean;
}

// Real brand logos via multiple sources with fallback
const CB = (domain: string) => `https://logo.clearbit.com/${domain}?size=256`;
const SI = (slug: string) => `https://cdn.simpleicons.org/${slug}/white`;
const SIC = (slug: string, color: string) => `https://cdn.simpleicons.org/${slug}/${color}`;

const GIFT_CARD_BRANDS: GiftCardBrand[] = [
  // ═══ GAMING ═══
  { id: 'steam', name: 'Steam Wallet', wordmark: 'STEAM', tagline: 'WALLET CODE', category: 'gaming',
    color: '#1B2838', bgGradient: 'linear-gradient(135deg, #1B2838 0%, #2A475E 60%, #66C0F4 200%)', accent: '#FFFFFF', glow: 'rgba(102,192,244,0.5)',
    currency: '$', denominations: [5, 10, 20, 25, 50, 100],
    logos: [CB('store.steampowered.com'), CB('steampowered.com'), SI('steam')] },

  { id: 'psn', name: 'PlayStation Store', wordmark: 'PlayStation', tagline: 'STORE GIFT CARD', category: 'gaming',
    color: '#003791', bgGradient: 'linear-gradient(135deg, #00439C 0%, #002569 60%, #001A4D 100%)', accent: '#FFFFFF', glow: 'rgba(0,99,195,0.6)',
    currency: '$', denominations: [10, 20, 25, 50, 75, 100], italic: true,
    logos: [CB('playstation.com'), CB('sony.com'), SI('playstation')] },

  { id: 'xbox', name: 'Xbox Gift Card', wordmark: 'XBOX', tagline: 'DIGITAL CODE', category: 'gaming',
    color: '#107C10', bgGradient: 'linear-gradient(135deg, #107C10 0%, #0A4D08 60%, #052804 100%)', accent: '#9BF00B', glow: 'rgba(155,240,11,0.5)',
    currency: '$', denominations: [10, 15, 25, 50, 75, 100],
    logos: [CB('xbox.com'), SI('xbox'), SIC('xbox', '9BF00B')] },

  { id: 'nintendo', name: 'Nintendo eShop', wordmark: 'Nintendo', tagline: 'eSHOP CARD', category: 'gaming',
    color: '#E60012', bgGradient: 'linear-gradient(135deg, #E60012 0%, #B00010 60%, #660008 100%)', accent: '#FFFFFF', glow: 'rgba(230,0,18,0.5)',
    currency: '$', denominations: [10, 20, 35, 50],
    logos: [CB('nintendo.com'), SI('nintendoswitch'), SI('nintendo')] },

  { id: 'roblox', name: 'Roblox', wordmark: 'ROBLOX', tagline: 'GIFT CARD', category: 'gaming',
    color: '#000000', bgGradient: 'linear-gradient(135deg, #232527 0%, #000000 60%, #C8001A 200%)', accent: '#FFFFFF', glow: 'rgba(255,255,255,0.4)',
    currency: '$', denominations: [10, 25, 50, 100],
    logos: [CB('roblox.com'), CB('corp.roblox.com'), SI('roblox')] },

  { id: 'fortnite', name: 'Fortnite V-Bucks', wordmark: 'V-BUCKS', tagline: 'FORTNITE CODE', category: 'gaming',
    color: '#7B59D7', bgGradient: 'linear-gradient(135deg, #7B59D7 0%, #4E2EAE 60%, #2A1655 100%)', accent: '#FCD002', glow: 'rgba(252,208,2,0.5)',
    currency: '$', denominations: [10, 25, 60, 100],
    logos: [CB('fortnite.com'), CB('epicgames.com'), SI('fortnite'), SIC('fortnite', 'FCD002')] },

  { id: 'valorant', name: 'Valorant Points', wordmark: 'VALORANT', tagline: 'POINTS CODE', category: 'gaming',
    color: '#FF4655', bgGradient: 'linear-gradient(135deg, #FF4655 0%, #C42F3D 60%, #6B0E18 100%)', accent: '#FFFFFF', glow: 'rgba(255,70,85,0.5)',
    currency: '$', denominations: [10, 25, 50, 100],
    logos: [CB('playvalorant.com'), CB('riotgames.com'), SI('valorant'), SI('riotgames')] },

  { id: 'lol', name: 'League of Legends', wordmark: 'LEAGUE', tagline: 'OF LEGENDS · RP', category: 'gaming',
    color: '#0A1428', bgGradient: 'linear-gradient(135deg, #0A1428 0%, #0F1F3D 60%, #1B2D5B 100%)', accent: '#C89B3C', glow: 'rgba(200,155,60,0.6)',
    currency: '$', denominations: [10, 25, 50, 100],
    logos: [CB('leagueoflegends.com'), CB('riotgames.com'), SIC('leagueoflegends', 'C89B3C'), SI('leagueoflegends')] },

  { id: 'razer', name: 'Razer Gold', wordmark: 'RAZER', tagline: 'GOLD WALLET', category: 'gaming',
    color: '#000000', bgGradient: 'linear-gradient(135deg, #0a0a0a 0%, #000 60%, #1a3300 100%)', accent: '#44D62C', glow: 'rgba(68,214,44,0.5)',
    currency: '$', denominations: [10, 20, 50, 100],
    logos: [CB('razer.com'), SIC('razer', '44D62C'), SI('razer')] },

  { id: 'battlenet', name: 'Battle.net', wordmark: 'BATTLE.NET', tagline: 'BALANCE CARD', category: 'gaming',
    color: '#00AEFF', bgGradient: 'linear-gradient(135deg, #00AEFF 0%, #0078B5 60%, #003C5C 100%)', accent: '#FFFFFF', glow: 'rgba(0,174,255,0.5)',
    currency: '$', denominations: [20, 50, 100],
    logos: [CB('battle.net'), CB('blizzard.com'), SI('battledotnet'), SI('blizzardentertainment')] },

  { id: 'minecraft', name: 'Minecraft Minecoins', wordmark: 'MINECRAFT', tagline: 'MINECOINS', category: 'gaming',
    color: '#5A9630', bgGradient: 'linear-gradient(135deg, #5A9630 0%, #3F6B1F 60%, #243E10 100%)', accent: '#FFFFFF', glow: 'rgba(90,150,48,0.5)',
    currency: '$', denominations: [10, 25, 50],
    logos: [CB('minecraft.net'), SI('minecraft')] },

  { id: 'epic', name: 'Epic Games', wordmark: 'EPIC GAMES', tagline: 'STORE CARD', category: 'gaming',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #2A2A2D 0%, #0E0E10 60%, #000000 100%)', accent: '#FFFFFF', glow: 'rgba(255,255,255,0.4)',
    currency: '$', denominations: [10, 25, 50, 100],
    logos: [CB('epicgames.com'), CB('store.epicgames.com'), SI('epicgames')] },

  { id: 'gog', name: 'GOG.com', wordmark: 'GOG.COM', tagline: 'DRM FREE', category: 'gaming',
    color: '#86328A', bgGradient: 'linear-gradient(135deg, #86328A 0%, #4D1A50 60%, #260A28 100%)', accent: '#FFFFFF', glow: 'rgba(134,50,138,0.5)',
    currency: '$', denominations: [10, 20, 50],
    logos: [CB('gog.com'), SI('gogdotcom'), SI('gog')] },

  // ═══ APPS & STREAMING ═══
  { id: 'itunes', name: 'iTunes / App Store', wordmark: 'App Store', tagline: '& iTUNES', category: 'apps',
    color: '#0A0A0A', bgGradient: 'linear-gradient(135deg, #1d1d1f 0%, #0a0a0a 60%, #000 100%)', accent: '#FFFFFF', glow: 'rgba(255,255,255,0.5)',
    currency: '$', denominations: [10, 15, 25, 50, 100],
    logos: [CB('apple.com'), SI('appstore'), SI('apple'), SI('itunes')] },

  { id: 'google', name: 'Google Play', wordmark: 'Google Play', tagline: 'GIFT CARD', category: 'apps',
    color: '#01875F', bgGradient: 'linear-gradient(135deg, #01875F 0%, #014D38 60%, #002A1F 100%)', accent: '#FFFFFF', glow: 'rgba(1,135,95,0.5)',
    currency: '$', denominations: [10, 15, 25, 50, 100],
    logos: [CB('play.google.com'), CB('google.com'), SI('googleplay')] },

  { id: 'spotify', name: 'Spotify Premium', wordmark: 'SPOTIFY', tagline: 'PREMIUM', category: 'apps',
    color: '#191414', bgGradient: 'linear-gradient(135deg, #191414 0%, #000000 60%, #0d2e1a 100%)', accent: '#1DB954', glow: 'rgba(29,185,84,0.6)',
    currency: '$', denominations: [10, 30, 60],
    logos: [CB('spotify.com'), SIC('spotify', '1DB954'), SI('spotify')] },

  { id: 'netflix', name: 'Netflix', wordmark: 'NETFLIX', tagline: 'GIFT CARD', category: 'apps',
    color: '#000000', bgGradient: 'linear-gradient(135deg, #1a0000 0%, #000000 60%, #4d0006 100%)', accent: '#E50914', glow: 'rgba(229,9,20,0.6)',
    currency: '$', denominations: [15, 25, 50, 100],
    logos: [CB('netflix.com'), SIC('netflix', 'E50914'), SI('netflix')] },

  { id: 'youtube', name: 'YouTube Premium', wordmark: 'YouTube', tagline: 'PREMIUM', category: 'apps',
    color: '#0F0F0F', bgGradient: 'linear-gradient(135deg, #0F0F0F 0%, #000 60%, #330000 100%)', accent: '#FF0000', glow: 'rgba(255,0,0,0.6)',
    currency: '$', denominations: [15, 25, 50],
    logos: [CB('youtube.com'), SIC('youtube', 'FF0000'), SI('youtube')] },

  { id: 'disney', name: 'Disney+', wordmark: 'Disney+', tagline: 'SUBSCRIPTION', category: 'apps',
    color: '#113CCF', bgGradient: 'linear-gradient(135deg, #113CCF 0%, #0A2380 60%, #051140 100%)', accent: '#FFFFFF', glow: 'rgba(17,60,207,0.5)',
    currency: '$', denominations: [15, 30, 50],
    logos: [CB('disneyplus.com'), CB('disney.com'), SI('disneyplus'), SI('disney')] },

  { id: 'discord', name: 'Discord Nitro', wordmark: 'DISCORD', tagline: 'NITRO', category: 'apps',
    color: '#5865F2', bgGradient: 'linear-gradient(135deg, #5865F2 0%, #3942B0 60%, #1D2266 100%)', accent: '#FFFFFF', glow: 'rgba(88,101,242,0.5)',
    currency: '$', denominations: [10, 50, 100],
    logos: [CB('discord.com'), SI('discord')] },

  { id: 'twitch', name: 'Twitch Bits', wordmark: 'TWITCH', tagline: 'BITS WALLET', category: 'apps',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #2d1655 100%)', accent: '#9146FF', glow: 'rgba(145,70,255,0.6)',
    currency: '$', denominations: [5, 10, 25, 50],
    logos: [CB('twitch.tv'), SIC('twitch', '9146FF'), SI('twitch')] },

  { id: 'hbo', name: 'HBO Max', wordmark: 'MAX', tagline: 'BY HBO', category: 'apps',
    color: '#000000', bgGradient: 'linear-gradient(135deg, #1a0033 0%, #000 60%, #2D0066 100%)', accent: '#741DE3', glow: 'rgba(116,29,227,0.6)',
    currency: '$', denominations: [15, 30, 50],
    logos: [CB('max.com'), CB('hbomax.com'), CB('hbo.com'), SIC('hbo', '741DE3')] },

  // ═══ MOBILE GAMES ═══
  { id: 'pubg', name: 'PUBG Mobile UC', wordmark: 'PUBG MOBILE', tagline: 'UNKNOWN CASH', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #4d3500 100%)', accent: '#F2A900', glow: 'rgba(242,169,0,0.6)',
    currency: '$', denominations: [5, 10, 25, 50, 100],
    logos: [CB('pubgmobile.com'), CB('pubg.com'), CB('krafton.com'), SIC('pubg', 'F2A900')] },

  { id: 'freefire', name: 'Free Fire Diamonds', wordmark: 'FREE FIRE', tagline: 'DIAMONDS', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #4d2200 100%)', accent: '#F06E26', glow: 'rgba(240,110,38,0.6)',
    currency: '$', denominations: [5, 10, 25, 50],
    logos: [CB('ff.garena.com'), CB('garena.com'), SIC('garena', 'F06E26'), SI('garena')] },

  { id: 'mlbb', name: 'Mobile Legends', wordmark: 'MOBILE LEGENDS', tagline: 'BANG BANG', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #4d2900 100%)', accent: '#FF8800', glow: 'rgba(255,136,0,0.6)',
    currency: '$', denominations: [5, 10, 25, 50],
    logos: [CB('mobilelegends.com'), CB('moonton.com'), SIC('moonton', 'FF8800')] },

  { id: 'codm', name: 'Call of Duty Mobile', wordmark: 'CALL OF DUTY', tagline: 'MOBILE · CP', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #1a2611 0%, #0E0E10 60%, #2d3d1f 100%)', accent: '#8BC34A', glow: 'rgba(139,195,74,0.5)',
    currency: '$', denominations: [10, 25, 50, 100],
    logos: [CB('callofduty.com'), CB('activision.com'), SIC('callofduty', '8BC34A')] },

  { id: 'genshin', name: 'Genshin Impact', wordmark: 'GENSHIN', tagline: 'IMPACT · GENESIS', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #003344 100%)', accent: '#00B5E3', glow: 'rgba(0,181,227,0.6)',
    currency: '$', denominations: [5, 10, 25, 50, 100],
    logos: [CB('genshin.hoyoverse.com'), CB('hoyoverse.com'), CB('mihoyo.com'), SIC('hoyoverse', '00B5E3')] },

  { id: 'clashroyale', name: 'Clash Royale', wordmark: 'CLASH ROYALE', tagline: 'GEMS', category: 'mobile',
    color: '#0E0E10', bgGradient: 'linear-gradient(135deg, #0E0E10 0%, #000 60%, #1a3066 100%)', accent: '#5C92FF', glow: 'rgba(92,146,255,0.6)',
    currency: '$', denominations: [5, 10, 25, 50],
    logos: [CB('supercell.com'), CB('clashroyale.com'), SIC('supercell', '5C92FF')] },

  // ═══ SHOPPING ═══
  { id: 'amazon', name: 'Amazon', wordmark: 'amazon', tagline: 'GIFT CARD', category: 'shopping',
    color: '#232F3E', bgGradient: 'linear-gradient(135deg, #232F3E 0%, #131A24 60%, #000 100%)', accent: '#FF9900', glow: 'rgba(255,153,0,0.6)',
    currency: '$', denominations: [10, 25, 50, 100, 200],
    logos: [CB('amazon.com'), SIC('amazon', 'FF9900'), SI('amazon')] },

  { id: 'visa', name: 'Visa Prepaid', wordmark: 'VISA', tagline: 'PREPAID CARD', category: 'shopping',
    color: '#1A1F71', bgGradient: 'linear-gradient(135deg, #1A1F71 0%, #0F1448 60%, #050828 100%)', accent: '#F7B600', glow: 'rgba(247,182,0,0.6)',
    currency: '$', denominations: [25, 50, 100, 200, 500],
    logos: [CB('visa.com'), SIC('visa', 'F7B600'), SI('visa')] },

  { id: 'ebay', name: 'eBay', wordmark: 'ebay', tagline: 'GIFT CARD', category: 'shopping',
    color: '#000000', bgGradient: 'linear-gradient(135deg, #1a1a1a 0%, #000 60%, #4d0a0c 100%)', accent: '#E53238', glow: 'rgba(229,50,56,0.6)',
    currency: '$', denominations: [15, 25, 50, 100],
    logos: [CB('ebay.com'), SIC('ebay', 'E53238'), SI('ebay')] },
];

const GC_CATEGORIES: { id: GiftCardCategory | 'all'; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all',      label: 'ALL',        icon: <Star size={14} />,        color: '#39FF14' },
  { id: 'gaming',   label: 'GAMING',     icon: <Swords size={14} />,      color: '#39FF14' },
  { id: 'apps',     label: 'APPS',       icon: <Sparkles size={14} />,    color: '#00BFFF' },
  { id: 'mobile',   label: 'MOBILE',     icon: <Zap size={14} />,         color: '#FF6F00' },
  { id: 'shopping', label: 'SHOPPING',   icon: <ShoppingBag size={14} />, color: '#FF1493' },
];

// 1 USD ≈ 71 coins (1 JOD = 100 coins, 1 USD ≈ 0.71 JOD)
const USD_TO_COINS = 71;

// ─── Smart logo with multi-fallback ──────────────────────────────────────
function BrandLogo({ logos, alt, className, style }: { logos: string[]; alt: string; className?: string; style?: React.CSSProperties }) {
  const [idx, setIdx] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Reset on logos change (when switching brands)
  useEffect(() => { setIdx(0); setHidden(false); }, [logos]);
  if (hidden || idx >= logos.length) return null;
  return (
    <img src={logos[idx]} alt={alt} className={className} style={style}
      onError={() => {
        if (idx + 1 < logos.length) setIdx(idx + 1);
        else setHidden(true);
      }} />
  );
}

export function StoreTab({ player, onClose, initialSubTab }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const flags = useFeatureFlags();
  const [subTab, setSubTab] = useState<SubTab>((initialSubTab as SubTab) || 'skins');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('rare');
  const [selectedSkin, setSelectedSkin] = useState<NinjaSkin | null>(null);
  const [buying, setBuying] = useState(false);
  const [buySuccess, setBuySuccess] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Chest state (replica of ChestsTab)
  const [opening, setOpening] = useState(false);
  const [selectedChest, setSelectedChest] = useState<Chest | null>(null);
  const [reward, setReward] = useState<ChestReward | null>(null);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'reveal'>('idle');
  const [spinItems, setSpinItems] = useState<ChestReward[]>([]);
  const [spinOffset, setSpinOffset] = useState(0);
  const [winIndex, setWinIndex] = useState(0);
  const [activeCardIndex, setActiveCardIndex] = useState(-1);
  const [confirmChest, setConfirmChest] = useState<Chest | null>(null);
  const animFrameRef = useRef<number>(0);
  const spinStartRef = useRef(0);

  // ESC unwinds the store modals in innermost order.
  useEscapeKey(() => setConfirmChest(null), confirmChest !== null);
  useEscapeKey(() => setSelectedSkin(null), selectedSkin !== null);
  useEscapeKey(() => {
    if (phase === 'reveal') { setPhase('idle'); setReward(null); }
    else if (selectedChest) setSelectedChest(null);
  }, selectedChest !== null || phase !== 'idle');

  // TopUp state
  const [topUpSelected, setTopUpSelected] = useState<string | null>(null);
  const [topUpSent, setTopUpSent] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Gift card state
  const [gcCategory, setGcCategory] = useState<GiftCardCategory | 'all'>('all');
  const [gcModal, setGcModal] = useState<GiftCardBrand | null>(null);
  const [gcAmount, setGcAmount] = useState<number | null>(null);
  const [gcSending, setGcSending] = useState(false);
  const [gcRequestSent, setGcRequestSent] = useState(false);

  // Cleanup roulette on unmount (prevents ghost overlay when store closes)
  useEffect(() => {
    return () => {
      setOpening(false);
      setPhase('idle');
      setSelectedSkin(null);
      setConfirmChest(null);
    };
  }, []);

  const ownedNinjas: string[] = player.ownedNinjas || ['neon', 'shadow'];
  const totalXP = calculateTotalXP(player);
  const levelInfo = getLevelInfo(totalXP);
  const playerLevel = levelInfo.level;
  const chestDiscount = levelInfo.chestDiscount;

  // Applies the tier-level chest discount first, then the player's personal-coin
  // multiplier so bulk-bought tokens do not further cheapen chests.
  const getDiscountedCost = (cost: number) =>
    personalCoinCost(Math.floor(cost * (1 - chestDiscount / 100)), player);
  // For every non-time item (skins, VIP, bundles, gift cards) — preserves JOD value.
  const myPrice = (baseCost: number) => personalCoinCost(baseCost, player);

  const filteredSkins = useMemo(() =>
    NINJA_SKINS.filter(s => s.category !== 'country' && (categoryFilter === 'all' || s.category === categoryFilter)),
  [categoryFilter]);

  const ownedSkins = useMemo(() =>
    NINJA_SKINS.filter(s => ownedNinjas.includes(s.id)),
  [ownedNinjas]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: NINJA_SKINS.length };
    NINJA_SKINS.forEach(s => { counts[s.category] = (counts[s.category] || 0) + 1; });
    return counts;
  }, []);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── Skin purchase ────────────────────────────────────────────────────────
  const buySkin = async (skin: NinjaSkin) => {
    if (buying) return;
    if (ownedNinjas.includes(skin.id)) return showToast(ar ? 'تمتلك هذا السكن بالفعل!' : 'You already own this skin!', false);
    if (skin.tier === 'mythic') return showToast(ar ? 'لا يمكن شراء السكنز الأسطورية الخرافية!' : 'Mythic skins cannot be purchased!', false);
    if (skin.unlockLevel && playerLevel < skin.unlockLevel) return showToast(ar ? `تحتاج المستوى ${skin.unlockLevel}!` : `Need Level ${skin.unlockLevel}!`, false);
    const skinCost = myPrice(skin.price);
    if (skin.price > 0 && player.coins < skinCost) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);
    if (skin.tier === 'free' && skin.price === 0) {
      setBuying(true);
      try {
        await updateDoc(doc(db, 'players', player.uid), { ownedNinjas: arrayUnion(skin.id) });
        setBuySuccess(true); showToast(ar ? `تم فتح ${skin.name}!` : `${skin.name} unlocked!`, true);
        setTimeout(() => { setBuySuccess(false); setSelectedSkin(null); }, 1600);
      } catch { showToast(ar ? 'فشل فتح القفل.' : 'Failed to unlock.', false); }
      finally { setBuying(false); }
      return;
    }
    setBuying(true);
    try {
      const skinItem = {
        id: `skin_${skin.id}_${Date.now()}`, type: 'skin', name: skin.name,
        rarity: skin.tier === 'legendary' ? 'legendary' : skin.tier === 'epic' ? 'epic' : skin.tier === 'rare' ? 'rare' : 'common',
        skinId: skin.id, value: skinCost, obtainedAt: Date.now(), used: false, tradeable: skin.tier !== 'free',
      };
      const currentInventory = [...(player.inventory || []), skinItem];
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-skinCost), ownedNinjas: arrayUnion(skin.id),
        totalCoinsSpent: increment(skinCost), inventory: currentInventory,
      });
      setBuySuccess(true); showToast(ar ? `تم فتح ${skin.name}!` : `${skin.name} unlocked!`, true);
      setTimeout(() => { setBuySuccess(false); setSelectedSkin(null); }, 1600);
    } catch { showToast(ar ? 'فشل الشراء.' : 'Purchase failed.', false); }
    finally { setBuying(false); }
  };

  // ─── Buy Time ─────────────────────────────────────────────────────────────
  const buyTime = async (pkg: typeof TIME_PACKAGES[number]) => {
    if (buying) return;
    if (player.coins < pkg.coins) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);
    setBuying(true);
    try {
      // Buy time = deduct coins and add playtime (hours converted to minutes)
      const playtimeMinutes = pkg.hours * 60;
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-pkg.coins),
        totalCoinsSpent: increment(pkg.coins),
        totalPlaytime: increment(playtimeMinutes),
      });
      showToast(ar ? `تمت إضافة ${pkg.label} من وقت اللعب! (-${pkg.coins} توكنز)` : `${pkg.label} of playtime added! (-${pkg.coins} coins)`, true);
    } catch { showToast(ar ? 'فشل الشراء.' : 'Purchase failed.', false); }
    finally { setBuying(false); }
  };

  // ─── Top-up request ───────────────────────────────────────────────────────
  const requestTopup = async (pkgId: string) => {
    const pkg = COIN_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) return;
    setTopUpLoading(true);
    try {
      await addDoc(collection(db, 'topup-requests'), {
        playerId: player.uid, playerName: player.username,
        packageId: pkg.id, coins: pkg.coins, price: pkg.price,
        status: 'pending', createdAt: Date.now(), timestamp: Date.now(),
      });
      setTopUpSent(true);
    } catch { showToast(ar ? 'فشل الطلب.' : 'Request failed.', false); }
    setTopUpLoading(false);
  };

  // ─── Buy VIP ──────────────────────────────────────────────────────────────
  const [buyingVip, setBuyingVip] = useState(false);
  const isVIP: boolean = player.vip?.active === true;

  const buyVip = async () => {
    if (buyingVip) return;
    const vipCost = myPrice(VIP_CONFIG.priceCoins);
    if (player.coins < vipCost) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);
    setBuyingVip(true);
    try {
      const vipItem = {
        id: `vip_pass_${Date.now()}`,
        type: 'vip',
        name: 'VIP Pass (30 Days)',
        rarity: 'legendary',
        value: vipCost,
        obtainedAt: Date.now(),
        used: false,
        tradeable: true,
      };
      const currentInventory = [...(player.inventory || []), vipItem];
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-vipCost),
        totalCoinsSpent: increment(vipCost),
        inventory: currentInventory,
      });
      showToast(ar ? 'تمت إضافة VIP Pass إلى مخزونك! اذهب إلى المخزون لتفعيله.' : 'VIP Pass added to your inventory! Go to Inventory to activate it.', true);
    } catch { showToast(ar ? 'فشل الشراء.' : 'Purchase failed.', false); }
    finally { setBuyingVip(false); }
  };

  // ─── Buy chest (adds to inventory, doesn't open) ──────────────────────────
  const buyChestToInventory = async (chest: Chest) => {
    const cost = getDiscountedCost(chest.cost);
    if (buying) return;
    if (player.coins < cost) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);
    setBuying(true);
    try {
      const chestItem = {
        id: `chest_${chest.id}_${Date.now()}`,
        type: 'chest',
        name: `${chest.name} Chest`,
        rarity: chest.tier,
        chestId: chest.id,
        value: cost,
        obtainedAt: Date.now(),
        used: false,
        tradeable: true,
      };
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-cost),
        totalCoinsSpent: increment(cost),
        inventory: arrayUnion(chestItem),
      });
      showToast(ar ? `تمت إضافة صندوق ${chest.name} إلى المخزون!` : `${chest.name} chest added to inventory!`, true);
    } catch { showToast(ar ? 'فشل الشراء.' : 'Purchase failed.', false); }
    finally { setBuying(false); }
  };

  // ─── Buy bundle ───────────────────────────────────────────────────────────
  const buyBundle = async (bundle: typeof BUNDLES[number]) => {
    if (buying) return;
    const bundleCost = myPrice(bundle.price);
    if (player.coins < bundleCost) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);
    setBuying(true);
    try {
      const bundleItem = {
        id: `bundle_${bundle.id}_${Date.now()}`,
        type: 'bundle',
        name: bundle.name,
        rarity: 'legendary',
        bundleId: bundle.id,
        value: bundleCost,
        obtainedAt: Date.now(),
        used: false,
        tradeable: false,
      };
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-bundleCost),
        totalCoinsSpent: increment(bundleCost),
        inventory: arrayUnion(bundleItem),
      });
      showToast(ar ? `تم شراء ${bundle.name}! افتحه من المخزون.` : `${bundle.name} purchased! Open it from inventory.`, true);
    } catch { showToast(ar ? 'فشل الشراء.' : 'Purchase failed.', false); }
    finally { setBuying(false); }
  };

  // ─── Request gift card from admin ─────────────────────────────────────────
  const requestGiftCard = async () => {
    if (gcSending) return;
    if (!gcModal || !gcAmount) return showToast(ar ? 'اختر المبلغ!' : 'Select an amount!', false);
    const costCoins = myPrice(gcAmount * USD_TO_COINS);
    if (player.coins < costCoins) return showToast(ar ? 'عملات غير كافية!' : 'Not enough coins!', false);

    setGcSending(true);
    try {
      await addDoc(collection(db, 'giftcard-requests'), {
        playerId: player.uid,
        playerName: player.username,
        brandId: gcModal.id,
        brandName: gcModal.name,
        amountUSD: gcAmount,
        coinsCost: costCoins,
        status: 'pending',
        createdAt: Date.now(),
      });
      // Reserve the coins (deduct now, admin will refund if cancelled)
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-costCoins),
        totalCoinsSpent: increment(costCoins),
      });
      setGcRequestSent(true);
      showToast(ar ? `تم طلب ${gcModal.name} $${gcAmount}!` : `${gcModal.name} $${gcAmount} requested!`, true);
    } catch (err) {
      console.error(err);
      showToast(ar ? 'فشل طلب بطاقة الهدية.' : 'Failed to request gift card.', false);
    }
    finally { setGcSending(false); }
  };

  // ─── Chest logic (replicated from ChestsTab) ─────────────────────────────
  const rollReward = (chest: Chest): ChestReward => {
    const pool = chest.rewards;
    const totalWeight = pool.reduce((sum, r) => sum + r.dropRate, 0);
    let roll = Math.random() * totalWeight;
    for (const r of pool) { roll -= r.dropRate; if (roll <= 0) return r; }
    return pool[pool.length - 1];
  };

  const buildSpinStrip = useCallback((chest: Chest, wonReward: ChestReward): ChestReward[] => {
    const items: ChestReward[] = [];
    const pool = chest.rewards;
    for (let i = 0; i < 40; i++) items.push(pool[Math.floor(Math.random() * pool.length)]);
    items[33] = wonReward;
    return items;
  }, []);

  const openChest = async (chest: Chest) => {
    const cost = getDiscountedCost(chest.cost);
    if (player.coins < cost || opening) return;
    setOpening(true); setSelectedChest(chest);
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-cost), totalCoinsSpent: increment(cost), 'stats.chestsOpened': increment(1),
      });
      trackDailyTask(player.uid, 'open_chest');
    } catch { setOpening(false); return; }
    const won = rollReward(chest);
    setReward(won);
    const strip = buildSpinStrip(chest, won);
    setSpinItems(strip); setWinIndex(33);
    setPhase('spinning'); setSpinOffset(0); spinStartRef.current = Date.now();
    // Save reward
    try {
      if (won.type === 'coins' && won.value) {
        await updateDoc(doc(db, 'players', player.uid), { coins: increment(won.value) });
      } else if (won.type === 'skin' && won.skinId) {
        await updateDoc(doc(db, 'players', player.uid), {
          ownedNinjas: arrayUnion(won.skinId),
          inventory: arrayUnion({ id: `${won.id}_${Date.now()}`, type: won.type, name: won.name, rarity: won.rarity, skinId: won.skinId, value: won.value || 0, obtainedAt: Date.now(), used: false }),
        });
      } else {
        await updateDoc(doc(db, 'players', player.uid), {
          inventory: arrayUnion({ id: `${won.id}_${Date.now()}`, type: won.type, name: won.name, rarity: won.rarity, value: won.value || 0, obtainedAt: Date.now(), used: false }),
        });
      }
    } catch (err) { console.error('Failed to save reward:', err); }
  };

  const CARD_W = 200;
  useEffect(() => {
    if (phase !== 'spinning') return;
    const SPIN_DURATION = 7000;
    const targetOffset = winIndex * CARD_W + Math.random() * (CARD_W * 0.4) - CARD_W * 0.2;
    let lastCardIndex = -1;
    const animate = () => {
      const elapsed = Date.now() - spinStartRef.current;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setSpinOffset(eased * targetOffset);
      const ci = Math.floor((eased * targetOffset) / CARD_W);
      if (ci !== lastCardIndex) { lastCardIndex = ci; setActiveCardIndex(ci); }
      if (progress < 1) animFrameRef.current = requestAnimationFrame(animate);
      else { setActiveCardIndex(winIndex); setTimeout(() => setPhase('reveal'), 600); }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, winIndex]);

  const closeReveal = () => {
    setOpening(false); setSelectedChest(null); setReward(null);
    setPhase('idle'); setSpinItems([]); setSpinOffset(0);
  };

  const getSkinStatus = (skin: NinjaSkin) => {
    if (ownedNinjas.includes(skin.id)) return 'owned';
    if (skin.tier === 'mythic') return 'locked';
    if (skin.unlockLevel && playerLevel < skin.unlockLevel) return 'level-locked';
    if (skin.price === 0) return 'free';
    if (player.coins >= skin.price) return 'buyable';
    return 'expensive';
  };

  /* ════════════════════════════════════════════════════════════════════════════
     RENDER
  ═���══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-full w-full gap-3 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}>
      {/* ═══ Cyberpunk BG effects ═══ */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      {/* PCB traces */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <path d="M0,80 L100,80 L130,50 L350,50 L380,80 L500,80" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.1" />
        <path d="M1200,150 L1080,150 L1050,180 L850,180 L820,150 L700,150" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.07" />
        <path d="M0,350 L120,350 L150,320 L400,320 L430,350 L600,350" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.06" />
        <path d="M1200,450 L1050,450 L1020,480 L800,480 L770,450 L600,450" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M0,650 L150,650 L180,620 L450,620 L480,650 L700,650" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M300,0 L300,50 L270,80 L270,180" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.07" />
        <path d="M900,0 L900,150 L930,180 L930,320" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
        <circle cx="350" cy="50" r="3" fill="#39FF14" opacity="0.2" className="pcb-node-flash" />
        <circle cx="850" cy="180" r="2.5" fill="#00c8ff" opacity="0.15" className="pcb-node-flash2" />
        <circle cx="400" cy="320" r="2.5" fill="#39FF14" opacity="0.12" className="pcb-node-flash3" />
        <circle cx="800" cy="480" r="2" fill="#a855f7" opacity="0.1" className="pcb-node-flash" />
      </svg>
      {/* Data pulses */}
      <div className="absolute top-[80px] left-0 w-5 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 10px #39FF14, 0 0 20px #39FF14' }} />
      <div className="absolute top-[350px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
      <div className="absolute top-[650px] right-0 w-4 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
      <div className="absolute top-0 left-[300px] w-[2px] h-4 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
      <div className="absolute top-0 left-[900px] w-[2px] h-3 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
      {/* Scanlines */}
      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.2) 30%, rgba(0,200,255,0.15) 70%, transparent 100%)' }} />
      <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.15) 40%, rgba(0,200,255,0.1) 60%, transparent 100%)' }} />
      {/* Energy orbs */}
      <div className="absolute left-[10%] top-[25%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.5) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.3)' }} />
      <div className="absolute right-[15%] top-[60%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.4) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.25)' }} />
      <div className="absolute left-[50%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(168,85,247,0.2)' }} />
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 15% 10%, rgba(57,255,20,0.06) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(0,200,255,0.05) 0%, transparent 35%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.03) 0%, transparent 45%)',
      }} />
      {/* Edge glow */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.3), rgba(0,200,255,0.2), rgba(168,85,247,0.15), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.15), rgba(168,85,247,0.1), transparent)' }} />

      {/* ── TOAST ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-6 left-1/2 z-[300] px-6 py-3 rounded-xl font-body text-sm font-semibold flex items-center gap-2"
            style={{ background: toast.ok ? 'rgba(57,255,20,0.15)' : 'rgba(255,50,50,0.15)', border: `1px solid ${toast.ok ? '#39FF14' : '#FF4444'}60`, color: toast.ok ? '#39FF14' : '#FF6666', backdropFilter: 'blur(10px)' }}>
            {toast.ok ? <Check size={16} /> : <X size={16} />} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <div className="relative shrink-0 flex flex-col py-5 px-4 z-10" style={{ width: 220, background: 'linear-gradient(180deg, rgba(4,6,10,0.95) 0%, rgba(3,5,8,0.98) 50%, rgba(4,6,10,0.95) 100%)', borderRight: '1px solid rgba(57,255,20,0.15)' }}>
        {/* HUD edge */}
        <div className="absolute top-0 right-0 bottom-0 w-[2px]" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />

        {/* Title — HUD framed */}
        <div className="relative px-3 py-2 rounded-lg mb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.06), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.15)' }}>
          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '2px solid rgba(57,255,20,0.4)', borderRight: '2px solid rgba(57,255,20,0.4)' }} />
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent)' }} />
          <h2 className="font-ninja text-lg text-center tracking-[0.15em]" style={{ color: '#39FF14', textShadow: '0 0 15px rgba(57,255,20,0.5)' }}>{ar ? 'متجر النينجا' : 'NINJA SHOP'}</h2>
        </div>

        {/* Balance — HUD card */}
        <div className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(234,179,8,0.02))', border: '1px solid rgba(234,179,8,0.18)' }}>
          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(234,179,8,0.4)', borderLeft: '1px solid rgba(234,179,8,0.4)' }} />
          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(234,179,8,0.4)', borderRight: '1px solid rgba(234,179,8,0.4)' }} />
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.2)', boxShadow: '0 0 8px rgba(234,179,8,0.15)' }}>
            <Coins size={15} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }} />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-body text-[9px] text-gray-500 uppercase tracking-wider">{ar ? 'الرصيد' : 'Balance'}</span>
            <span className="font-ninja text-base text-yellow-400 leading-tight" style={{ textShadow: '0 0 8px rgba(234,179,8,0.3)' }}>{Math.floor(player.coins)}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-[1px] mb-3" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.2), rgba(0,200,255,0.12), transparent)' }} />

        {/* Nav — HUD buttons */}
        <div className="flex flex-col gap-1.5">
          {SUB_TABS.map(tab => {
            const active = subTab === tab.id;
            // "Coming soon" comes from the live feature-flags doc — admin
            // toggles it on/off in the Feature Flags panel without a redeploy.
            const soon = (tab.id === 'giftcards' && !flags.giftCards);
            return (
              <motion.button key={tab.id}
                onClick={() => { if (!soon) setSubTab(tab.id); }}
                disabled={soon}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all overflow-hidden group ${soon ? 'cursor-not-allowed' : ''}`}
                whileHover={!soon ? { x: 2 } : undefined}
                whileTap={!soon ? { scale: 0.97 } : undefined}
                style={{
                  background: soon
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.02), transparent)'
                    : (active ? 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.05))' : 'linear-gradient(135deg, rgba(57,255,20,0.04), transparent)'),
                  border: soon ? '1px solid rgba(255,255,255,0.06)' : (active ? '1px solid rgba(57,255,20,0.4)' : '1px solid rgba(57,255,20,0.1)'),
                  boxShadow: soon ? 'none' : (active ? '0 0 18px rgba(57,255,20,0.12), inset 0 0 15px rgba(57,255,20,0.05)' : '0 0 6px rgba(57,255,20,0.04)'),
                  opacity: soon ? 0.45 : 1,
                }}>
                {!soon && active && <>
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
                  <motion.div layoutId="sidebarActive" className="absolute left-0 top-[15%] bottom-[15%] w-[3px]" style={{ background: '#39FF14', boxShadow: '0 0 10px #39FF14, 0 0 18px rgba(57,255,20,0.4)' }} transition={{ type: 'spring', stiffness: 350, damping: 30 }} />
                </>}
                <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: soon ? 'rgba(255,255,255,0.04)' : (active ? 'rgba(57,255,20,0.15)' : 'rgba(57,255,20,0.06)'), border: soon ? '1px solid rgba(255,255,255,0.08)' : (active ? '1px solid rgba(57,255,20,0.35)' : '1px solid rgba(57,255,20,0.12)') }}>
                  <span style={{ color: soon ? 'rgba(255,255,255,0.4)' : (active ? '#39FF14' : '#39FF1480'), filter: !soon && active ? 'drop-shadow(0 0 4px #39FF14)' : 'none' }}>{tab.icon}</span>
                </div>
                <span className="font-ninja text-xs tracking-wider flex-1" style={{ color: soon ? 'rgba(255,255,255,0.45)' : (active ? '#39FF14' : 'rgba(200,200,200,0.6)'), textShadow: !soon && active ? '0 0 8px rgba(57,255,20,0.4)' : 'none' }}>{ar ? (tab.id === 'skins' ? 'السكنز' : tab.id === 'chests' ? 'الصناديق' : tab.id === 'giftcards' ? 'بطاقات الهدايا' : tab.id === 'time' ? 'الوقت' : tab.id === 'coins' ? 'التوكنز' : tab.label) : tab.label}</span>
                {soon && (
                  <span className="font-ninja text-[8px] tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)' }}>
                    {ar ? 'قريباً' : 'SOON'}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Level — HUD card */}
        <div className="mt-auto pt-3">
          <div className="relative px-3 py-3 rounded-lg text-center overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0,200,255,0.06), rgba(0,200,255,0.02))', border: '1px solid rgba(0,200,255,0.15)' }}>
            <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(0,200,255,0.4)', borderLeft: '1px solid rgba(0,200,255,0.4)' }} />
            <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(0,200,255,0.4)', borderRight: '1px solid rgba(0,200,255,0.4)' }} />
            <p className="font-body text-[9px] text-gray-500 uppercase tracking-wider">{ar ? 'المستوى' : 'Level'}</p>
            <p className="font-ninja text-xl text-cyan-300" style={{ textShadow: '0 0 10px rgba(0,200,255,0.5)' }}>{playerLevel}</p>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      {/* Extra left padding (pl-8) gives a small but visible gap between the
          sidebar's right edge and the cards/content. Coming-soon banner is
          unaffected — it lives inside this same container. */}
      <div className="relative flex-1 overflow-hidden pl-8 pr-6 py-6 z-10 h-full flex flex-col">
        <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">

          {/* ══════════════════════════════════════════════════════════════════
              SKINS TAB — Category cards + Grid + Owned + Collection rewards
          ══════════════════════════════════════════════════════════════════ */}
          {subTab === 'skins' && (
            <motion.div key="skins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto">

              {/* Category showcase cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {CATEGORY_CARDS.map((cat, i) => {
                  const active = categoryFilter === cat.id;
                  const ownedCount = NINJA_SKINS.filter(s => s.category === cat.id && ownedNinjas.includes(s.id)).length;
                  const totalCount = categoryCounts[cat.id] || 0;
                  return (
                    <motion.div key={cat.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      whileHover={{ scale: 1.03, y: -4 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setCategoryFilter(active ? 'all' : cat.id)}
                      className="relative cursor-pointer rounded-xl overflow-hidden"
                      style={{
                        height: 150,
                        background: `linear-gradient(180deg, ${cat.color}0A 0%, #040608 40%, #030508 100%)`,
                        border: `1px solid ${active ? `${cat.color}60` : `${cat.color}25`}`,
                        boxShadow: active ? `0 0 30px ${cat.color}25, inset 0 0 30px ${cat.color}08` : `0 4px 20px ${cat.color}08`,
                      }}>
                      {/* PCB grid */}
                      <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `linear-gradient(${cat.color}08 1px, transparent 1px), linear-gradient(90deg, ${cat.color}08 1px, transparent 1px)`,
                        backgroundSize: '25px 25px', opacity: 0.4,
                      }} />
                      {/* HUD corners */}
                      <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${cat.color}60`, borderLeft: `2px solid ${cat.color}60` }} />
                      <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: `1px solid ${cat.color}30`, borderRight: `1px solid ${cat.color}30` }} />
                      <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: `1px solid ${cat.color}30`, borderLeft: `1px solid ${cat.color}30` }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${cat.color}60`, borderRight: `2px solid ${cat.color}60` }} />
                      {/* Top neon accent */}
                      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${cat.color}, transparent)`, boxShadow: `0 0 10px ${cat.color}40` }} />
                      {/* Left glow bar */}
                      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px]" style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}, 0 0 15px ${cat.color}40`, opacity: active ? 0.6 : 0.25 }} />
                      {/* Glow orb */}
                      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full" style={{ background: `radial-gradient(circle, ${cat.color}18, transparent 70%)` }} />

                      <div className="relative z-10 p-4 flex flex-col h-full">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-11 h-11 rounded-md flex items-center justify-center" style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}30`, boxShadow: `0 0 10px ${cat.color}15` }}>
                            <span style={{ color: cat.color, filter: `drop-shadow(0 0 6px ${cat.color})` }}>{cat.icon}</span>
                          </div>
                          <div>
                            <p className="font-ninja text-sm tracking-[0.15em]" style={{ color: cat.color, textShadow: `0 0 8px ${cat.color}40` }}>{cat.label}</p>
                            <p className="font-body text-[10px] text-gray-500">{cat.description}</p>
                          </div>
                        </div>
                        <div className="mt-auto">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-ninja text-xs text-gray-400">{ownedCount}/{totalCount}</span>
                            <span className="font-body text-[9px] text-gray-600 uppercase tracking-wider">{ar ? 'مملوكة' : 'owned'}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${cat.color}15` }}>
                            <div className="h-full rounded-full" style={{ width: `${totalCount > 0 ? (ownedCount / totalCount) * 100 : 0}%`, background: cat.color, boxShadow: `0 0 8px ${cat.color}` }} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Quick filter pills */}
              <div className="flex gap-2 mb-4">
                {(['all', 'starter', 'country'] as CategoryFilter[]).map(id => {
                  const active = categoryFilter === id;
                  return (
                    <button key={id} onClick={() => setCategoryFilter(id)}
                      className="px-3 py-1.5 rounded-full font-ninja text-[10px] tracking-wider transition-all"
                      style={{
                        background: active ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(57,255,20,0.35)' : 'rgba(255,255,255,0.06)'}`,
                        color: active ? '#39FF14' : '#777',
                      }}>
                      {(ar ? ((id as string) === 'all' ? 'الكل' : (id as string) === 'starter' ? 'مبتدئ' : (id as string) === 'country' ? 'دولة' : String(id).toUpperCase()) : String(id).toUpperCase())} ({categoryCounts[id] || 0})
                    </button>
                  );
                })}
              </div>

              {/* Skin grid */}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {filteredSkins.map((skin, i) => {
                  const status = getSkinStatus(skin);
                  const tierCfg = TIER_CONFIG[skin.tier];
                  const owned = status === 'owned';
                  return (
                    <motion.div key={skin.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4), duration: 0.25 }}
                      className="cursor-pointer group" onClick={() => setSelectedSkin(skin)}>
                      <div className="relative rounded-xl overflow-hidden transition-all duration-200 group-hover:scale-[0.97]"
                        style={{
                          height: 230, background: `linear-gradient(180deg, ${tierCfg.color}0A 0%, #040608 40%, #030508 100%)`,
                          border: `1px solid ${owned ? `${tierCfg.color}50` : `${tierCfg.color}20`}`,
                          boxShadow: owned ? `0 4px 24px rgba(0,0,0,0.4), 0 0 25px ${tierCfg.glow}` : `0 4px 20px ${tierCfg.color}08`,
                          opacity: skin.tier === 'mythic' && !owned ? 0.65 : 1,
                        }}>
                        {/* PCB grid */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                          backgroundImage: `linear-gradient(${tierCfg.color}06 1px, transparent 1px), linear-gradient(90deg, ${tierCfg.color}06 1px, transparent 1px)`,
                          backgroundSize: '20px 20px', opacity: 0.4,
                        }} />
                        {/* HUD corners */}
                        <div className="absolute top-0 left-0 w-3 h-3 z-[1]" style={{ borderTop: `2px solid ${tierCfg.color}60`, borderLeft: `2px solid ${tierCfg.color}60` }} />
                        <div className="absolute bottom-0 right-0 w-3 h-3 z-[1]" style={{ borderBottom: `2px solid ${tierCfg.color}40`, borderRight: `2px solid ${tierCfg.color}40` }} />
                        {/* Top neon accent */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: `linear-gradient(90deg, transparent, ${tierCfg.color}, transparent)`, boxShadow: `0 0 8px ${tierCfg.color}40` }} />
                        {/* Left glow bar */}
                        <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] z-[1]" style={{ background: tierCfg.color, boxShadow: `0 0 6px ${tierCfg.color}`, opacity: 0.3 }} />
                        {/* Radial glow behind avatar */}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 35%, ${tierCfg.color}15 0%, transparent 50%)` }} />

                        {owned && <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 8px rgba(57,255,20,0.4)' }}><Check size={11} className="text-ninja-green" /></div>}
                        {skin.tier === 'mythic' && !owned && <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(255,20,147,0.1)', border: '1px solid rgba(255,20,147,0.4)' }}><Lock size={10} className="text-pink-400" /></div>}

                        <div className="flex justify-center pt-5 relative z-[2]">
                          <img src={skin.profileImage} alt={skin.name}
                            className="w-20 h-20 rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
                            style={{ border: `2px solid ${tierCfg.color}`, boxShadow: `0 0 18px ${tierCfg.color}50` }}
                            onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${skin.id}.png`; }} />
                        </div>
                        <p className="font-ninja text-xs text-white text-center mt-2 truncate px-2 relative z-[2]" style={{ textShadow: `0 0 8px ${tierCfg.color}30` }}>{skin.name}</p>
                        <p className="font-ninja text-[9px] text-center tracking-widest mt-0.5 relative z-[2]" style={{ color: tierCfg.color, textShadow: `0 0 6px ${tierCfg.color}40` }}>{tierCfg.label}</p>
                        {/* HUD price badge */}
                        <div className="absolute bottom-3 left-3 right-3 z-[2]">
                          <div className="flex items-center justify-center gap-1 py-1.5 rounded" style={{ background: `linear-gradient(135deg, ${tierCfg.color}10, transparent)`, border: `1px solid ${tierCfg.color}20` }}>
                            {status === 'owned' ? <span className="font-ninja text-[10px] text-ninja-green flex items-center gap-1"><Check size={10} /> {ar ? 'مملوك' : 'OWNED'}</span>
                              : status === 'free' ? <span className="font-ninja text-[10px] text-green-400">{ar ? 'مجاني' : 'FREE'}</span>
                              : status === 'locked' || status === 'level-locked' ? <span className="font-ninja text-[10px] flex items-center gap-1" style={{ color: tierCfg.color }}><Lock size={10} /> {ar ? `مستوى ${skin.unlockLevel}` : `LVL ${skin.unlockLevel}`}</span>
                              : <span className="font-ninja text-[10px] text-yellow-300 flex items-center gap-1"><Coins size={10} className="text-yellow-400" /> {myPrice(skin.price)}</span>}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Owned skins section */}
              {ownedSkins.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 8px rgba(57,255,20,0.15)' }}>
                      <Check size={14} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                    </div>
                    <h3 className="font-ninja text-sm text-ninja-green tracking-wider" style={{ textShadow: '0 0 8px rgba(57,255,20,0.3)' }}>{ar ? `مجموعتك — ${ownedSkins.length}/${NINJA_SKINS.length}` : `YOUR COLLECTION — ${ownedSkins.length}/${NINJA_SKINS.length}`}</h3>
                    <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.2), transparent)' }} />
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
                    {ownedSkins.map(skin => {
                      const tierCfg = TIER_CONFIG[skin.tier];
                      const equipped = skin.id === player.ninjaType;
                      return (
                        <motion.div key={skin.id} whileHover={{ scale: 1.05, y: -3 }}
                          className="flex-shrink-0 rounded-xl cursor-pointer relative overflow-hidden group"
                          onClick={() => setSelectedSkin(skin)}
                          style={{
                            width: 140, height: 180,
                            background: `linear-gradient(180deg, ${tierCfg.color}0A 0%, #040608 40%, #030508 100%)`,
                            border: `1px solid ${equipped ? '#39FF14' : tierCfg.color}40`,
                            boxShadow: equipped ? '0 0 18px rgba(57,255,20,0.25)' : `0 4px 16px ${tierCfg.color}10`,
                          }}>
                          {/* HUD corners */}
                          <div className="absolute top-0 left-0 w-2.5 h-2.5 z-[1]" style={{ borderTop: `2px solid ${equipped ? '#39FF14' : tierCfg.color}80`, borderLeft: `2px solid ${equipped ? '#39FF14' : tierCfg.color}80` }} />
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 z-[1]" style={{ borderBottom: `2px solid ${equipped ? '#39FF14' : tierCfg.color}40`, borderRight: `2px solid ${equipped ? '#39FF14' : tierCfg.color}40` }} />
                          {/* Top accent */}
                          <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: `linear-gradient(90deg, transparent, ${equipped ? '#39FF14' : tierCfg.color}, transparent)`, boxShadow: `0 0 8px ${equipped ? 'rgba(57,255,20,0.5)' : tierCfg.color + '40'}` }} />
                          {/* Equipped badge */}
                          {equipped && (
                            <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-ninja-green/25 border border-ninja-green/40 rounded-md px-1.5 py-0.5">
                              <ShieldCheck size={9} className="text-ninja-green" />
                              <span className="font-ninja text-[7px] text-ninja-green">{ar ? 'مفعّل' : 'IN USE'}</span>
                            </div>
                          )}
                          {/* Big profile image */}
                          <div className="flex justify-center pt-4">
                            <img src={skin.profileImage} alt={skin.name}
                              className="w-24 h-24 rounded-full object-cover transition-transform group-hover:scale-110"
                              style={{ border: `2.5px solid ${tierCfg.color}`, boxShadow: `0 0 18px ${tierCfg.color}35` }}
                              onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${skin.id}.png`; }} />
                          </div>
                          {/* Name + tier */}
                          <div className="absolute bottom-0 left-0 right-0 text-center pb-2.5 pt-1" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.6))' }}>
                            <p className="font-ninja text-[11px] text-white truncate px-2">{skin.name}</p>
                            <p className="font-ninja text-[8px] tracking-widest" style={{ color: tierCfg.color }}>{tierCfg.label}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Collection rewards */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)', boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
                    <Trophy size={14} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.6))' }} />
                  </div>
                  <h3 className="font-ninja text-sm text-yellow-400 tracking-wider" style={{ textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>{ar ? 'مكافآت المجموعة' : 'COLLECTION REWARDS'}</h3>
                  <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.2), transparent)' }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {COLLECTION_REWARDS.map(cr => {
                    const ownedCount = NINJA_SKINS.filter(s => s.tier === cr.tier && ownedNinjas.includes(s.id)).length;
                    const complete = ownedCount >= cr.required;
                    return (
                      <div key={cr.tier} className="relative flex items-center gap-3 p-3 rounded-lg overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${cr.color}08, transparent)`,
                          border: `1px solid ${complete ? `${cr.color}40` : `${cr.color}15`}`,
                          boxShadow: complete ? `0 0 15px ${cr.color}15` : 'none',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${cr.color}50`, borderLeft: `1px solid ${cr.color}50` }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1px solid ${cr.color}30`, borderRight: `1px solid ${cr.color}30` }} />
                        <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${cr.color}40, transparent)` }} />
                        <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 relative z-10"
                          style={{ background: `${cr.color}15`, border: `1px solid ${cr.color}30`, boxShadow: `0 0 8px ${cr.color}15` }}>
                          {complete ? <Check size={18} style={{ color: cr.color, filter: `drop-shadow(0 0 4px ${cr.color})` }} /> : <Star size={18} style={{ color: cr.color }} />}
                        </div>
                        <div className="flex-1 min-w-0 relative z-10">
                          <p className="font-ninja text-xs" style={{ color: cr.color, textShadow: `0 0 6px ${cr.color}30` }}>{cr.tier.toUpperCase()} ({ownedCount}/{cr.required})</p>
                          <p className="font-body text-[10px] text-gray-500 truncate">{cr.reward}</p>
                        </div>
                        {complete && <span className="font-ninja text-[9px] text-ninja-green px-2 py-1 rounded relative z-10" style={{ background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.3)', boxShadow: '0 0 6px rgba(57,255,20,0.15)' }}>{ar ? 'استلام' : 'CLAIM'}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              CHESTS TAB — Buy chests to inventory
          ══════════════════════════════════════════════════════════════════ */}
          {subTab === 'chests' && (
            <motion.div key="chests" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }}>
                  <Package size={16} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                </div>
                <div>
                  <h3 className="font-ninja text-xl tracking-[0.15em]" style={{ color: '#39FF14', textShadow: '0 0 12px rgba(57,255,20,0.4)' }}>{ar ? 'صناديق الكنز' : 'TREASURE CHESTS'}</h3>
                  <p className="font-body text-xs text-gray-500">{ar ? 'اضغط على صندوق لفتحه — أو احفظه لوقت لاحق' : 'Tap a chest to open it — or save it for later'}</p>
                </div>
                <div className="flex-1 h-[1px] ml-3" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.2), transparent)' }} />
              </div>

              {/* Live drops panels */}
              <ChestDropsPanels />

              <div className="grid grid-cols-4 gap-5">
                {CHESTS.map((chest, i) => {
                  const cost = getDiscountedCost(chest.cost);
                  const canAfford = player.coins >= cost;
                  return (
                    <motion.div key={chest.id}
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      whileHover={canAfford ? { y: -6, scale: 1.03 } : {}}
                      className={`relative rounded-xl overflow-hidden ${!canAfford ? 'opacity-30' : ''}`}
                      style={{
                        height: 320,
                        background: `linear-gradient(180deg, ${chest.color}0A 0%, #040608 40%, #030508 100%)`,
                        border: `1px solid ${chest.color}25`,
                        boxShadow: `0 4px 30px ${chest.color}10`,
                      }}>
                      <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `linear-gradient(${chest.color}08 1px, transparent 1px), linear-gradient(90deg, ${chest.color}08 1px, transparent 1px)`,
                        backgroundSize: '25px 25px', opacity: 0.4,
                      }} />
                      <div className="absolute top-0 left-0 w-3 h-3 z-[1]" style={{ borderTop: `2px solid ${chest.color}60`, borderLeft: `2px solid ${chest.color}60` }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3 z-[1]" style={{ borderBottom: `2px solid ${chest.color}60`, borderRight: `2px solid ${chest.color}60` }} />
                      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${chest.color}, transparent)`, boxShadow: `0 0 8px ${chest.color}40` }} />
                      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px]" style={{ background: chest.color, boxShadow: `0 0 6px ${chest.color}`, opacity: 0.3 }} />
                      <div className="flex justify-center mt-3 relative z-[1]">
                        <motion.img src={`/img/chest-${chest.id === 'legendary' ? 'legendary-new' : chest.id === 'common' ? 'common' : chest.tier}.png`} alt={chest.name}
                          className="object-contain"
                          style={{ width: (chest.id === 'common' || chest.id === 'legendary') ? 180 : 170, height: (chest.id === 'common' || chest.id === 'legendary') ? 180 : 170, filter: `drop-shadow(0 0 25px ${chest.glowColor})` }}
                          animate={canAfford ? { y: [0, -5, 0] } : {}} transition={{ duration: 2.5, repeat: Infinity }} />
                      </div>
                      <p className="font-ninja text-sm text-center tracking-wider relative z-[1]" style={{ color: chest.color, textShadow: `0 0 8px ${chest.color}40` }}>{chest.name.toUpperCase()}</p>
                      <p className="font-body text-[10px] text-center text-gray-500 mb-2 relative z-[1]">{chest.rewards.length} {ar ? 'مكافأة' : 'rewards'}</p>
                      <div className="absolute bottom-3 left-3 right-3 z-[1]">
                        <button onClick={() => canAfford && setConfirmChest(chest)} disabled={!canAfford || buying}
                          className="relative w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-ninja text-xs tracking-wider transition-all disabled:opacity-40"
                          style={{ background: `linear-gradient(135deg, ${chest.color}15, ${chest.color}05)`, border: `1px solid ${chest.color}40`, color: chest.color, boxShadow: canAfford ? `0 0 12px ${chest.color}15` : 'none' }}>
                          <Coins size={13} className="text-yellow-400" />
                          {chestDiscount > 0 ? <><span className="line-through text-gray-600 text-[10px]">{chest.cost}</span> {cost}</> : cost}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              GIFT CARDS TAB — coming-soon banner OR live brand grid.
              Banner shown whenever the feature-flag is OFF; real grid only
              renders when admin flips `giftCards` on in the Feature Flags
              panel. Sidebar button disabled by the same flag above.
          ══════════════════════════════════════════════════════════════════ */}
          {subTab === 'giftcards' && !flags.giftCards && (
            <motion.div key="giftcards-soon" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto flex items-center justify-center">
              <div className="relative w-full max-w-[520px] mx-auto rounded-2xl p-8 text-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,184,0,0.06) 0%, #040608 50%, #030508 100%)',
                  border: '1px solid rgba(255,184,0,0.25)',
                  boxShadow: '0 0 30px rgba(255,184,0,0.08)',
                }}>
                <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: '2px solid #FFB800', borderLeft: '2px solid #FFB800' }} />
                <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: '2px solid #FFB800', borderRight: '2px solid #FFB800' }} />
                <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: '2px solid #FFB800', borderLeft: '2px solid #FFB800' }} />
                <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: '2px solid #FFB800', borderRight: '2px solid #FFB800' }} />
                <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #FFB800, transparent)' }} />

                <div className="w-16 h-16 mx-auto mb-5 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.3)' }}>
                  <CreditCard size={28} className="text-[#FFB800]" style={{ filter: 'drop-shadow(0 0 8px rgba(255,184,0,0.6))' }} />
                </div>
                <h3 className="font-ninja text-2xl tracking-[0.18em] mb-2" style={{ color: '#FFB800', textShadow: '0 0 14px rgba(255,184,0,0.45)' }}>
                  {ar ? 'بطاقات الهدايا — قريباً' : 'GIFT CARDS — COMING SOON'}
                </h3>
                <p className="font-body text-sm text-gray-400 leading-relaxed max-w-[420px] mx-auto">
                  {ar
                    ? 'بطاقات هدايا PSN و Xbox و Roblox و Google Play والمزيد — قيد الإعداد. ترقّب الإطلاق قريباً.'
                    : 'PSN, Xbox, Roblox, Google Play and more digital gift cards are on the way. Stay tuned for launch.'}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-ninja tracking-[0.25em]"
                  style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', color: '#FFB800' }}>
                  {ar ? 'الإطلاق قريباً' : 'LAUNCHING SOON'}
                </div>
              </div>
            </motion.div>
          )}
          {subTab === 'giftcards' && flags.giftCards && (
            <motion.div key="giftcards" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'rgba(255,20,147,0.1)', border: '1px solid rgba(255,20,147,0.25)', boxShadow: '0 0 10px rgba(255,20,147,0.15)' }}>
                  <CreditCard size={16} className="text-pink-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,20,147,0.6))' }} />
                </div>
                <div>
                  <h3 className="font-ninja text-xl tracking-[0.15em]" style={{ color: '#FF1493', textShadow: '0 0 12px rgba(255,20,147,0.4)' }}>{ar ? 'بطاقات هدايا رقمية' : 'DIGITAL GIFT CARDS'}</h3>
                  <p className="font-body text-xs text-gray-500">{ar ? 'استرداد فوري — يتم تسليم الأكواد إلى حسابك عن طريق الموظفين' : 'Redeem instantly — codes delivered to your account by staff'}</p>
                </div>
                <div className="flex-1 h-[1px] ml-3" style={{ background: 'linear-gradient(90deg, rgba(255,20,147,0.2), transparent)' }} />
              </div>

              {/* Category pills */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                {GC_CATEGORIES.map(cat => {
                  const active = gcCategory === cat.id;
                  return (
                    <motion.button key={cat.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setGcCategory(cat.id)}
                      className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg font-ninja text-[11px] tracking-wider overflow-hidden transition-all"
                      style={{
                        background: active ? `linear-gradient(135deg, ${cat.color}18, ${cat.color}05)` : 'linear-gradient(135deg, rgba(255,255,255,0.02), transparent)',
                        border: `1px solid ${active ? `${cat.color}50` : 'rgba(255,255,255,0.06)'}`,
                        color: active ? cat.color : '#666',
                        boxShadow: active ? `0 0 12px ${cat.color}15, inset 0 0 10px ${cat.color}06` : 'none',
                      }}>
                      {active && <>
                        <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: `2px solid ${cat.color}`, borderLeft: `2px solid ${cat.color}` }} />
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: `2px solid ${cat.color}`, borderRight: `2px solid ${cat.color}` }} />
                      </>}
                      <span style={{ color: active ? cat.color : '#555', filter: active ? `drop-shadow(0 0 4px ${cat.color})` : 'none' }}>{cat.icon}</span>
                      {ar ? (cat.id === 'all' ? 'الكل' : cat.id === 'gaming' ? 'الألعاب' : cat.id === 'apps' ? 'تطبيقات' : cat.id === 'mobile' ? 'جوال' : cat.id === 'shopping' ? 'تسوق' : cat.label) : cat.label}
                    </motion.button>
                  );
                })}
              </div>

              {/* Brand grid — full color gift cards */}
              <div className="grid grid-cols-4 gap-4">
                {GIFT_CARD_BRANDS.filter(b => gcCategory === 'all' || b.category === gcCategory).map((brand, i) => (
                  <motion.button key={brand.id}
                    initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    whileHover={{ y: -10 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setGcModal(brand); setGcAmount(brand.denominations[0]); setGcRequestSent(false); }}
                    className="relative rounded-2xl overflow-hidden group transition-all duration-300"
                    style={{
                      aspectRatio: '1.586 / 1',
                      background: brand.bgGradient,
                      boxShadow: `0 12px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)`,
                    }}>
                    {/* Top-left highlight */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: `radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.12) 0%, transparent 55%)`,
                    }} />
                    {/* Brand glow bottom-right */}
                    <div className="absolute -bottom-16 -right-16 w-44 h-44 rounded-full pointer-events-none" style={{
                      background: `radial-gradient(circle, ${brand.accent}30 0%, transparent 60%)`,
                    }} />
                    {/* Diagonal sheen */}
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                      background: `linear-gradient(115deg, transparent 35%, ${brand.accent}25 50%, transparent 65%)`,
                    }} />

                    {/* Top corner: GIFT CARD label */}
                    <div className="absolute top-3 left-4 z-10">
                      <p className="font-ninja text-[9px] text-white/50 tracking-[0.25em] uppercase">{ar ? 'بطاقة هدية' : 'Gift Card'}</p>
                    </div>

                    {/* Top-right OPTIONS badge */}
                    <div className="absolute top-3 right-3 z-10">
                      <div className="font-ninja text-[8px] px-1.5 py-0.5 rounded tracking-wider" style={{
                        background: `${brand.accent}15`,
                        border: `1px solid ${brand.accent}40`,
                        color: brand.accent,
                      }}>
                        {brand.denominations.length}
                      </div>
                    </div>

                    {/* CENTER: BIG logo */}
                    <div className="absolute inset-0 flex items-center justify-center pt-2 z-[5]">
                      <BrandLogo logos={brand.logos} alt={brand.name}
                        className="max-w-[60%] max-h-[55%] object-contain transition-transform duration-300 group-hover:scale-110"
                        style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.7)) drop-shadow(0 0 20px rgba(0,0,0,0.4))' }} />
                    </div>

                    {/* Bottom strip — wordmark + price */}
                    <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 z-10" style={{
                      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55) 60%)',
                    }}>
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-ninja text-xs tracking-[0.1em] truncate" style={{
                            color: brand.accent,
                            textShadow: `0 0 10px ${brand.accent}60, 0 1px 3px rgba(0,0,0,0.9)`,
                            fontStyle: brand.italic ? 'italic' : 'normal',
                          }}>{brand.wordmark}</p>
                          <p className="font-body text-[8px] text-white/60 tracking-[0.15em] uppercase truncate">{brand.tagline}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-body text-[7px] text-white/50 tracking-wider leading-none">{ar ? 'من' : 'FROM'}</p>
                          <p className="font-ninja text-base leading-none mt-0.5" style={{ color: brand.accent, textShadow: `0 0 10px ${brand.accent}, 0 1px 3px rgba(0,0,0,0.9)` }}>
                            {brand.currency}{brand.denominations[0]}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Hover edge glow */}
                    <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                      boxShadow: `inset 0 0 0 2px ${brand.accent}, 0 0 45px ${brand.glow}`,
                    }} />
                  </motion.button>
                ))}
              </div>

              {/* Info strip */}
              <div className="relative rounded-lg p-3 mt-5 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255,20,147,0.04), transparent)', border: '1px solid rgba(255,20,147,0.12)' }}>
                <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(255,20,147,0.4)', borderLeft: '1px solid rgba(255,20,147,0.4)' }} />
                <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(255,20,147,0.4)', borderRight: '1px solid rgba(255,20,147,0.4)' }} />
                <div className="flex items-center gap-2">
                  <Info size={12} className="text-pink-400 flex-shrink-0" />
                  <p className="font-body text-[11px] text-gray-400">{ar ? `ادفع بالتوكنز. سيقوم الموظفون بتسليم الكود خلال دقائق عبر الدردشة أو مطبوع. 1 دولار ≈ ${USD_TO_COINS} توكنز.` : `Pay with tokens. Staff will deliver your code within minutes via chat or printout. 1 USD ≈ ${USD_TO_COINS} tokens.`}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TIME TAB — Replica of Top-Up modal style
          ══════════════════════════════════════════════════════════════════ */}
          {subTab === 'time' && (
            <motion.div key="time" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full flex items-center justify-center">
              <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(57,255,20,0.08)', border: '2px solid rgba(57,255,20,0.2)' }}>
                    <Timer size={32} className="text-ninja-green" />
                  </div>
                  <h3 className="font-ninja text-2xl text-ninja-green mb-1" style={{ textShadow: '0 0 20px rgba(57,255,20,0.3)' }}>{ar ? 'شراء وقت اللعب' : 'BUY PLAY TIME'}</h3>
                  <p className="font-body text-gray-400 text-sm">
                    {ar ? 'الرصيد:' : 'Balance:'} <span className="text-yellow-400 font-ninja">{Math.floor(player.coins)} {ar ? 'توكنز' : 'coins'}</span>
                  </p>
                </div>

                {/* Time packages — radio-button style like TopUp modal */}
                <div className="space-y-3 mb-6">
                  {TIME_PACKAGES.map((pkg, i) => {
                    const canAfford = player.coins >= pkg.coins;
                    const selected = topUpSelected === pkg.id;
                    return (
                      <motion.button key={pkg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        onClick={() => setTopUpSelected(pkg.id)}
                        disabled={!canAfford}
                        className={`w-full rounded-xl p-4 text-left transition-all border ${
                          selected ? 'border-ninja-green/50 bg-ninja-green/10' : canAfford ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-white/[0.03] bg-white/[0.01] opacity-50'
                        }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-ninja-green' : 'border-gray-600'}`}>
                              {selected && <div className="w-2.5 h-2.5 rounded-full bg-ninja-green" />}
                            </div>
                            <div>
                              <span className="font-ninja text-white">{pkg.label}</span>
                              <span className="font-body text-gray-500 text-xs ml-2">({pkg.coins} {ar ? 'توكنز' : 'coins'})</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {pkg.popular && <span className="px-2 py-0.5 rounded-full bg-ninja-green/20 text-ninja-green font-ninja text-[9px]">{ar ? 'الأفضل' : 'BEST'}</span>}
                            {pkg.savings && <span className="font-body text-[10px] text-ninja-green">{ar ? pkg.savings.replace('Save', 'وفر') : pkg.savings}</span>}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Buy button */}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  disabled={!topUpSelected || buying}
                  onClick={() => {
                    const pkg = TIME_PACKAGES.find(p => p.id === topUpSelected);
                    if (pkg) buyTime(pkg);
                  }}
                  className="ninja-btn ninja-btn-green-fill ninja-btn-lg w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-ninja text-base">
                  {buying ? <span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" /> : <Timer size={18} />}
                  {buying ? (ar ? 'جاري الشراء...' : 'PURCHASING...') : (ar ? 'شراء الوقت' : 'BUY TIME')}
                </motion.button>

                <p className="font-body text-gray-600 text-[10px] text-center mt-3">{ar ? 'يُضاف الوقت فوراً إلى جلستك. يتوقف خصم العملات أثناء اللعب المجاني.' : 'Time is added instantly to your session. Coin deduction pauses during free play.'}</p>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              COINS TAB — TopUp modal style + VIP promo
          ══════════════════════════════════════════════════════════════════ */}
          {/* ══════════════════════════════════════════════════════════════════
              VIP TAB — Buy VIP Pass
          ══════════════════════════════════════════════════════════════════ */}
          {subTab === 'vip' && (
            <motion.div key="vip" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'rgba(255,215,0,0.12)', border: '2px solid rgba(255,215,0,0.4)', boxShadow: '0 0 40px rgba(255,215,0,0.2)' }}>
                    <Crown size={38} className="text-yellow-400" />
                  </motion.div>
                  <h3 className="font-ninja text-3xl text-yellow-400 mb-2" style={{ textShadow: '0 0 20px rgba(255,215,0,0.3)' }}>{ar ? 'VIP PASS' : 'VIP PASS'}</h3>
                  <p className="font-body text-gray-400 text-sm">{ar ? 'اشترِ VIP Pass لمدة 30 يوماً. فعّله من المخزون أو أهدِه لصديق.' : 'Purchase a 30-day VIP pass. Activate from your inventory or gift it to a friend.'}</p>
                </div>

                {/* VIP Card */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="rounded-2xl overflow-hidden mb-6"
                  style={{
                    background: 'linear-gradient(160deg, rgba(255,215,0,0.08), rgba(255,20,147,0.04))',
                    border: '2px solid rgba(255,215,0,0.25)',
                    boxShadow: '0 0 40px rgba(255,215,0,0.1)',
                  }}>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="font-ninja text-xl text-yellow-400">{ar ? 'بطاقة VIP' : 'VIP PASS'}</p>
                        <p className="font-body text-xs text-gray-500">{ar ? '30 يوماً من المزايا المميزة' : '30 days of premium benefits'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-ninja text-3xl text-yellow-400">{myPrice(VIP_CONFIG.priceCoins).toLocaleString()}</p>
                        <p className="font-ninja text-sm text-gray-500">{ar ? 'توكنز' : 'coins'}</p>
                      </div>
                    </div>

                    {/* Benefits grid */}
                    <div className="grid grid-cols-2 gap-2 mb-6">
                      {[
                        { icon: <Coffee size={14} />, label: ar ? `${VIP_CONFIG.cafeDiscountPercent}% خصم الكافيه` : `${VIP_CONFIG.cafeDiscountPercent}% Café Discount`, color: '#00BFFF' },
                        { icon: <Coins size={14} />, label: ar ? '+1 عملة لكل مهمة' : '+1 Coin Per Task', color: '#FFD700' },
                        { icon: <Sparkles size={14} />, label: ar ? 'سكنز VIP حصرية' : 'Exclusive VIP Skins', color: '#FF1493' },
                        { icon: <Crown size={14} />, label: ar ? 'شارة وواجهة VIP' : 'VIP Badge & UI', color: '#9B59B6' },
                        { icon: <Gift size={14} />, label: ar ? '30 دقيقة دعوة يومية' : '30min Daily Invite', color: '#39FF14' },
                        { icon: <Coins size={14} />, label: ar ? 'هدية يومية 50 توكن' : '50 Coins Daily Gift', color: '#FF6F00' },
                      ].map((perk, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: perk.color }}>{perk.icon}</span>
                          <span className="font-body text-xs text-gray-300">{perk.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Buy / Status */}
                    {isVIP ? (
                      <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-yellow-400/30 bg-yellow-400/10 mb-3">
                        <Crown size={17} className="text-yellow-400" />
                        <span className="font-ninja text-sm text-yellow-400">{ar ? 'VIP مفعّل' : 'VIP ACTIVE'}</span>
                      </div>
                    ) : null}

                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={buyVip} disabled={buyingVip || player.coins < myPrice(VIP_CONFIG.priceCoins)}
                      className="w-full py-3.5 rounded-xl font-ninja text-base flex items-center justify-center gap-2"
                      style={{
                        background: player.coins >= myPrice(VIP_CONFIG.priceCoins)
                          ? 'linear-gradient(135deg, #FFD700, #FFA000)'
                          : 'rgba(255,255,255,0.05)',
                        color: player.coins >= myPrice(VIP_CONFIG.priceCoins) ? '#000' : '#666',
                        border: player.coins < myPrice(VIP_CONFIG.priceCoins) ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      }}>
                      {buyingVip ? (
                        <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : player.coins < myPrice(VIP_CONFIG.priceCoins) ? (
                        <><Lock size={16} /> {ar ? `توكنز غير كافية (${Math.floor(player.coins).toLocaleString()}/${myPrice(VIP_CONFIG.priceCoins).toLocaleString()})` : `NOT ENOUGH COINS (${Math.floor(player.coins).toLocaleString()}/${myPrice(VIP_CONFIG.priceCoins).toLocaleString()})`}</>
                      ) : (
                        <><ShoppingBag size={16} /> {ar ? `اشترِ VIP PASS — ${myPrice(VIP_CONFIG.priceCoins).toLocaleString()} توكن` : `BUY VIP PASS — ${myPrice(VIP_CONFIG.priceCoins).toLocaleString()} COINS`}</>
                      )}
                    </motion.button>

                    <p className="font-body text-[10px] text-gray-600 text-center mt-3">
                      {ar ? 'يذهب VIP Pass إلى مخزونك. استخدمه للتفعيل، أو أهدِه لصديق.' : 'VIP Pass goes to your inventory. Use it to activate, or gift it to a friend.'}
                    </p>
                  </div>
                </motion.div>

                {/* How it works */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                  className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="font-ninja text-xs text-gray-500 mb-3">{ar ? 'كيف يعمل' : 'HOW IT WORKS'}</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { step: '1', title: ar ? 'اشترِ' : 'Buy', desc: ar ? 'اشترِ VIP Pass من هذا المتجر' : 'Purchase VIP Pass from this store', icon: <ShoppingBag size={18} />, color: '#FFD700' },
                      { step: '2', title: ar ? 'المخزون' : 'Inventory', desc: ar ? 'يظهر VIP Pass في مخزونك' : 'VIP Pass appears in your inventory', icon: <Package size={18} />, color: '#39FF14' },
                      { step: '3', title: ar ? 'فعّل أو أهدِ' : 'Activate or Gift', desc: ar ? 'استخدمه بنفسك أو أهدِه لصديق' : 'Use it yourself or gift to a friend', icon: <Gift size={18} />, color: '#FF6F00' },
                    ].map(s => (
                      <div key={s.step} className="text-center">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                          style={{ background: `${s.color}15`, border: `1px solid ${s.color}30` }}>
                          <span style={{ color: s.color }}>{s.icon}</span>
                        </div>
                        <p className="font-ninja text-sm text-white">{s.title}</p>
                        <p className="font-body text-[10px] text-gray-500 mt-1">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {subTab === 'coins' && (
            <motion.div key="coins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full flex items-center justify-center">
              <div className="w-full max-w-lg">
                {topUpSent ? (
                  <div className="text-center py-12">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                      <div className="w-20 h-20 rounded-full bg-ninja-green/20 flex items-center justify-center mx-auto mb-4">
                        <Check size={36} className="text-ninja-green" />
                      </div>
                    </motion.div>
                    <h3 className="font-ninja text-2xl text-ninja-green mb-2">{ar ? 'تم إرسال الطلب!' : 'REQUEST SENT!'}</h3>
                    <p className="font-body text-gray-400 text-sm mb-6">{ar ? 'سيأتي موظف لمعالجة دفعتك.' : 'A staff member will come to process your payment.'}</p>
                    <button onClick={() => { setTopUpSent(false); setTopUpSelected(null); }}
                      className="ninja-btn ninja-btn-green px-8 py-2.5 rounded-xl font-ninja">{ar ? 'موافق' : 'OK'}</button>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <div className="relative w-20 h-20 rounded-xl flex items-center justify-center mx-auto mb-3 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 25px rgba(234,179,8,0.15)' }}>
                        <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(234,179,8,0.6)', borderLeft: '2px solid rgba(234,179,8,0.6)' }} />
                        <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(234,179,8,0.6)', borderRight: '2px solid rgba(234,179,8,0.6)' }} />
                        <Coins size={32} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 10px rgba(234,179,8,0.6))' }} />
                      </div>
                      <h3 className="font-ninja text-2xl text-yellow-400 mb-1 tracking-[0.15em]" style={{ textShadow: '0 0 20px rgba(255,215,0,0.4)' }}>{ar ? 'شراء التوكنز' : 'BUY COINS'}</h3>
                      <p className="font-body text-gray-400 text-sm">
                        {ar ? 'الرصيد:' : 'Balance:'} <span className="text-yellow-400 font-ninja">{Math.floor(player.coins)} {ar ? 'توكنز' : 'coins'}</span>
                      </p>
                    </div>

                    {/* Coin packages — radio style */}
                    <div className="space-y-3 mb-6">
                      {COIN_PACKAGES.map((pkg, i) => {
                        const selected = topUpSelected === pkg.id;
                        return (
                          <motion.button key={pkg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                            onClick={() => setTopUpSelected(pkg.id)}
                            className="relative w-full rounded-lg p-4 text-left transition-all overflow-hidden"
                            style={{
                              background: selected ? 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))' : 'linear-gradient(135deg, rgba(234,179,8,0.04), transparent)',
                              border: `1px solid ${selected ? 'rgba(234,179,8,0.5)' : 'rgba(234,179,8,0.12)'}`,
                              boxShadow: selected ? '0 0 18px rgba(234,179,8,0.15), inset 0 0 12px rgba(234,179,8,0.05)' : 'none',
                            }}>
                            {selected && <>
                              <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(234,179,8,0.6)', borderLeft: '2px solid rgba(234,179,8,0.6)' }} />
                              <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(234,179,8,0.6)', borderRight: '2px solid rgba(234,179,8,0.6)' }} />
                              <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#eab308', boxShadow: '0 0 6px #eab308' }} />
                            </>}
                            <div className="flex items-center justify-between relative z-10">
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-yellow-400' : 'border-gray-600'}`} style={{ boxShadow: selected ? '0 0 6px rgba(234,179,8,0.4)' : 'none' }}>
                                  {selected && <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" style={{ boxShadow: '0 0 4px #eab308' }} />}
                                </div>
                                <div>
                                  <span className="font-ninja text-white" style={{ textShadow: selected ? '0 0 8px rgba(234,179,8,0.3)' : 'none' }}>{pkg.coins.toLocaleString()} {ar ? 'توكنز' : 'tokens'}</span>
                                  {(pkg.bonusPercentage || 0) > 0 && (
                                    <span className="font-ninja text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(57,255,20,0.12)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.3)' }}>+{pkg.bonusPercentage}% BONUS</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {pkg.popular && <span className="px-2 py-0.5 rounded font-ninja text-[9px]" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}>{ar ? 'الأفضل' : 'BEST'}</span>}
                                <span className="font-ninja text-lg text-white" style={{ textShadow: '0 0 8px rgba(234,179,8,0.2)' }}>{pkg.price} <span className="text-gray-500 text-sm">JOD</span></span>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Buy button */}
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      disabled={!topUpSelected || topUpLoading}
                      onClick={() => topUpSelected && requestTopup(topUpSelected)}
                      className="w-full ninja-btn ninja-btn-green-fill ninja-btn-lg flex items-center justify-center gap-2 py-3.5 rounded-xl font-ninja text-base"
                      style={{ background: topUpSelected ? 'linear-gradient(135deg, #FFD700, #FFA000)' : undefined, color: topUpSelected ? '#000' : undefined }}>
                      {topUpLoading ? <span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" /> : <Coins size={18} />}
                      {topUpLoading ? (ar ? 'جاري الإرسال...' : 'SENDING...') : (ar ? 'طلب شحن' : 'REQUEST TOP-UP')}
                    </motion.button>
                    <p className="font-body text-gray-600 text-[10px] text-center mt-2">{ar ? 'سيأتي موظف لاستلام الدفعة وإضافة التوكنز إلى حسابك.' : 'A staff member will come to collect payment and add coins to your account.'}</p>

                    {/* Coin info cards */}
                    <div className="mt-8 grid grid-cols-3 gap-3">
                      {[
                        { label: ar ? 'السعر' : 'Rate', value: '100/JOD', sub: ar ? '1 دينار = 100 توكن' : '1 JOD = 100 coins', color: '#39FF14' },
                        { label: ar ? 'تكلفة اللعب' : 'Play Cost', value: '2.5/min', sub: ar ? '150 توكن لكل ساعة' : '150 coins per hour', color: '#00BFFF' },
                        { label: ar ? 'رسوم التحويل' : 'Transfer Fee', value: '10%', sub: ar ? 'عند إرسال التوكنز' : 'When sending coins', color: '#FF6F00' },
                      ].map(info => (
                        <div key={info.label} className="relative text-center p-3 rounded-lg overflow-hidden" style={{ background: `linear-gradient(135deg, ${info.color}06, transparent)`, border: `1px solid ${info.color}18`, boxShadow: `0 0 10px ${info.color}06` }}>
                          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${info.color}50`, borderLeft: `1px solid ${info.color}50` }} />
                          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1px solid ${info.color}30`, borderRight: `1px solid ${info.color}30` }} />
                          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${info.color}40, transparent)` }} />
                          <p className="font-ninja text-lg relative z-10" style={{ color: info.color, textShadow: `0 0 8px ${info.color}40` }}>{info.value}</p>
                          <p className="font-ninja text-[9px] text-gray-400 relative z-10">{info.label}</p>
                          <p className="font-body text-[9px] text-gray-600 mt-1 relative z-10">{info.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* VIP Promo */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                      className="mt-6 rounded-2xl p-5 relative overflow-hidden cursor-pointer"
                      onClick={() => setSubTab('vip')}
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,215,0,0.06) 0%, rgba(255,111,0,0.04) 50%, rgba(255,20,147,0.04) 100%)',
                        border: '1px solid rgba(255,215,0,0.15)',
                      }}>
                      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.1), transparent 70%)' }} />
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,215,0,0.1)', border: '1.5px solid rgba(255,215,0,0.25)' }}>
                          <Crown size={28} className="text-yellow-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-ninja text-sm text-yellow-400 tracking-wider">{ar ? 'كن VIP' : 'BECOME VIP'}</p>
                          <p className="font-body text-xs text-gray-400 mt-0.5">{ar ? 'احصل على مزايا حصرية، لعب مجاني يومي، خصومات الكافيه، سكنز حصرية والمزيد!' : 'Get exclusive perks, daily free play, café discounts, exclusive skins & more!'}</p>
                          <p className="font-ninja text-xs text-white mt-1">{myPrice(VIP_CONFIG.priceCoins).toLocaleString()} {ar ? 'توكن' : 'Coins'}</p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="px-3 py-1.5 rounded-lg font-ninja text-xs text-black" style={{ background: 'linear-gradient(135deg, #FFD700, #FFA000)' }}>{ar ? 'عرض' : 'VIEW'}</div>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          GIFT CARD AMOUNT MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {gcModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[250] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { setGcModal(null); setGcAmount(null); setGcRequestSent(false); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="relative overflow-hidden rounded-2xl w-[520px] max-w-[94vw]"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: `1px solid ${gcModal.accent}40`, boxShadow: `0 25px 60px rgba(0,0,0,0.9), 0 0 40px ${gcModal.glow}` }}
              onClick={e => e.stopPropagation()}>
              {/* PCB grid */}
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: `linear-gradient(${gcModal.accent}08 1px, transparent 1px), linear-gradient(90deg, ${gcModal.accent}08 1px, transparent 1px)`,
                backgroundSize: '30px 30px', opacity: 0.5,
              }} />
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4 z-[2]" style={{ borderTop: `2px solid ${gcModal.accent}80`, borderLeft: `2px solid ${gcModal.accent}80` }} />
              <div className="absolute top-0 right-0 w-4 h-4 z-[2]" style={{ borderTop: `2px solid ${gcModal.accent}50`, borderRight: `2px solid ${gcModal.accent}50` }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 z-[2]" style={{ borderBottom: `2px solid ${gcModal.accent}50`, borderLeft: `2px solid ${gcModal.accent}50` }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 z-[2]" style={{ borderBottom: `2px solid ${gcModal.accent}80`, borderRight: `2px solid ${gcModal.accent}80` }} />
              {/* Top accent */}
              <div className="absolute top-0 left-0 right-0 h-[2px] z-[2]" style={{ background: `linear-gradient(90deg, transparent, ${gcModal.accent}, transparent)`, boxShadow: `0 0 10px ${gcModal.accent}` }} />
              {/* Close */}
              <button onClick={() => { setGcModal(null); setGcAmount(null); setGcRequestSent(false); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center z-20 transition-colors hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={14} className="text-gray-400" />
              </button>

              <div className="relative z-10 p-6">
                {/* Brand preview card — full color, bigger version of grid */}
                <div className="relative rounded-2xl overflow-hidden mb-5" style={{
                  aspectRatio: '1.586 / 1',
                  background: gcModal.bgGradient,
                  boxShadow: `0 15px 40px rgba(0,0,0,0.7), 0 0 30px ${gcModal.glow}`,
                }}>
                  {/* Top-left highlight */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: `radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.14) 0%, transparent 55%)`,
                  }} />
                  {/* Brand glow bottom-right */}
                  <div className="absolute -bottom-20 -right-20 w-56 h-56 rounded-full pointer-events-none" style={{
                    background: `radial-gradient(circle, ${gcModal.accent}35 0%, transparent 60%)`,
                  }} />

                  {/* GIFT CARD label top-left */}
                  <div className="absolute top-4 left-5 z-10">
                    <p className="font-ninja text-[11px] text-white/60 tracking-[0.25em] uppercase">{ar ? 'بطاقة هدية' : 'Gift Card'}</p>
                  </div>

                  {/* Chip top-right */}
                  <div className="absolute top-4 right-5 w-10 h-7 rounded opacity-70 z-10" style={{
                    background: `linear-gradient(135deg, ${gcModal.accent}DD, ${gcModal.accent}66)`,
                    border: `1px solid ${gcModal.accent}`,
                  }}>
                    <div className="absolute inset-[2px] grid grid-cols-3 gap-[1px]">
                      {[...Array(6)].map((_, idx) => <div key={idx} style={{ background: `${gcModal.accent}80` }} />)}
                    </div>
                  </div>

                  {/* CENTER: Big logo */}
                  <div className="absolute inset-0 flex items-center justify-center pt-3 z-[5]">
                    <BrandLogo logos={gcModal.logos} alt={gcModal.name}
                      className="max-w-[55%] max-h-[55%] object-contain"
                      style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7)) drop-shadow(0 0 25px rgba(0,0,0,0.4))' }} />
                  </div>

                  {/* Bottom strip */}
                  <div className="absolute bottom-0 left-0 right-0 px-5 py-3 z-10" style={{
                    background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.6) 60%)',
                  }}>
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-ninja text-base tracking-[0.1em] truncate" style={{
                          color: gcModal.accent,
                          textShadow: `0 0 12px ${gcModal.accent}, 0 1px 3px rgba(0,0,0,0.9)`,
                          fontStyle: gcModal.italic ? 'italic' : 'normal',
                        }}>{gcModal.wordmark}</p>
                        <p className="font-body text-[10px] text-white/60 tracking-[0.15em] uppercase truncate">{gcModal.tagline}</p>
                      </div>
                      <p className="font-ninja text-3xl leading-none flex-shrink-0" style={{ color: gcModal.accent, textShadow: `0 0 14px ${gcModal.accent}, 0 2px 6px rgba(0,0,0,0.9)` }}>
                        {gcModal.currency}{gcAmount || gcModal.denominations[0]}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h2 className="font-ninja text-lg text-white mb-1 tracking-wider" style={{ textShadow: `0 0 10px ${gcModal.accent}40` }}>{gcModal.name}</h2>
                <p className="font-body text-xs text-gray-500 mb-4">{ar ? 'اختر مبلغاً من الأسفل' : 'Select an amount below'}</p>

                {/* Denomination grid */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {gcModal.denominations.map(d => {
                    const cost = d * USD_TO_COINS;
                    const canAfford = player.coins >= cost;
                    const selected = gcAmount === d;
                    return (
                      <motion.button key={d} whileHover={canAfford ? { scale: 1.03 } : {}} whileTap={canAfford ? { scale: 0.97 } : {}}
                        onClick={() => canAfford && setGcAmount(d)} disabled={!canAfford}
                        className={`relative rounded-lg p-3 overflow-hidden transition-all ${!canAfford ? 'opacity-25' : ''}`}
                        style={{
                          background: selected ? `linear-gradient(135deg, ${gcModal.accent}20, ${gcModal.accent}08)` : 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)',
                          border: `1.5px solid ${selected ? `${gcModal.accent}70` : 'rgba(255,255,255,0.08)'}`,
                          boxShadow: selected ? `0 0 15px ${gcModal.accent}30, inset 0 0 10px ${gcModal.accent}10` : 'none',
                        }}>
                        {selected && <>
                          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `2px solid ${gcModal.accent}`, borderLeft: `2px solid ${gcModal.accent}` }} />
                          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `2px solid ${gcModal.accent}`, borderRight: `2px solid ${gcModal.accent}` }} />
                        </>}
                        <p className="font-ninja text-xl" style={{ color: selected ? gcModal.accent : '#888', textShadow: selected ? `0 0 8px ${gcModal.accent}60` : 'none' }}>{gcModal.currency}{d}</p>
                        <p className="font-body text-[10px] text-gray-600 mt-0.5 flex items-center justify-center gap-1"><Coins size={9} className="text-yellow-400" /> {cost.toLocaleString()}</p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Cost summary */}
                {gcAmount && (
                  <div className="relative rounded-lg p-3 mb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.06), transparent)', border: '1px solid rgba(234,179,8,0.18)' }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(234,179,8,0.4)', borderLeft: '1px solid rgba(234,179,8,0.4)' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(234,179,8,0.4)', borderRight: '1px solid rgba(234,179,8,0.4)' }} />
                    <div className="flex items-center justify-between">
                      <span className="font-ninja text-[11px] text-gray-400 tracking-wider">{ar ? 'التكلفة الإجمالية' : 'TOTAL COST'}</span>
                      <span className="font-ninja text-lg text-yellow-400 flex items-center gap-1.5" style={{ textShadow: '0 0 8px rgba(234,179,8,0.3)' }}>
                        <Coins size={14} /> {(myPrice(gcAmount * USD_TO_COINS)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Success state */}
                {gcRequestSent ? (
                  <div className="relative rounded-lg p-4 mb-3 text-center overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.1), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.3)', boxShadow: '0 0 20px rgba(57,255,20,0.12)' }}>
                    <Check size={24} className="text-ninja-green mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.5))' }} />
                    <p className="font-ninja text-sm text-ninja-green tracking-wider" style={{ textShadow: '0 0 8px rgba(57,255,20,0.3)' }}>{ar ? 'تم إرسال الطلب' : 'REQUEST SENT'}</p>
                    <p className="font-body text-[10px] text-gray-500 mt-1">{ar ? 'سيقوم الموظفون بتسليم الكود قريباً' : 'Staff will deliver your code shortly'}</p>
                  </div>
                ) : null}

                {/* Buy button */}
                {!gcRequestSent && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={requestGiftCard} disabled={gcSending || !gcAmount || (gcAmount ? player.coins < myPrice(gcAmount * USD_TO_COINS) : false)}
                    className="relative w-full py-3.5 rounded-xl font-ninja text-base tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${gcModal.accent}, ${gcModal.accent}BB)`, color: '#000', boxShadow: `0 0 25px ${gcModal.glow}` }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '2px solid rgba(0,0,0,0.3)', borderLeft: '2px solid rgba(0,0,0,0.3)' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '2px solid rgba(0,0,0,0.3)', borderRight: '2px solid rgba(0,0,0,0.3)' }} />
                    {gcSending ? <span className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full" /> : <CreditCard size={18} />}
                    {gcSending ? (ar ? 'جاري الطلب...' : 'REQUESTING...') : (ar ? `طلب ${gcModal.currency}${gcAmount || ''}` : `REQUEST ${gcModal.currency}${gcAmount || ''}`)}
                  </motion.button>
                )}

                <p className="font-body text-[10px] text-gray-600 text-center mt-3">
                  {ar ? 'سيقوم الموظفون بتسليم الكود خلال بضع دقائق.' : 'Staff will deliver your code within a few minutes.'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          SKIN DETAIL MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedSkin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="relative overflow-hidden rounded-2xl w-[560px] max-w-[94vw] max-h-[85vh] overflow-y-auto"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              <button onClick={() => setSelectedSkin(null)} className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <X size={16} className="text-gray-400" />
              </button>
              <div className="p-6">
                <div className="flex gap-6 mb-6">
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="relative">
                      <div className="absolute -inset-4 rounded-full opacity-40" style={{ background: `radial-gradient(circle, ${TIER_CONFIG[selectedSkin.tier].color}30 20%, transparent 70%)` }} />
                      <img src={selectedSkin.profileImage} alt={selectedSkin.name}
                        className="w-40 h-40 rounded-full object-cover relative z-10"
                        style={{ border: `3px solid ${selectedSkin.color}`, boxShadow: `0 0 30px ${selectedSkin.color}40` }}
                        onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${selectedSkin.id}.png`; }} />
                    </div>
                  </div>
                  <div className="flex-1 pt-2">
                    <h2 className="font-ninja text-2xl mb-2" style={{ color: TIER_CONFIG[selectedSkin.tier].color }}>{selectedSkin.name}</h2>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-full font-ninja text-[10px] tracking-wider" style={{ background: `${TIER_CONFIG[selectedSkin.tier].color}15`, color: TIER_CONFIG[selectedSkin.tier].color, border: `1px solid ${TIER_CONFIG[selectedSkin.tier].color}35` }}>{TIER_CONFIG[selectedSkin.tier].label}</span>
                      {ownedNinjas.includes(selectedSkin.id) && <span className="px-2.5 py-1 rounded-full font-ninja text-[10px] tracking-wider bg-ninja-green/15 text-ninja-green border border-ninja-green/25">{ar ? 'مملوك' : 'OWNED'}</span>}
                    </div>
                    <p className="font-body text-sm text-gray-400 leading-relaxed">{selectedSkin.description}</p>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={14} style={{ color: TIER_CONFIG[selectedSkin.tier].color }} />
                    <p className="font-ninja text-xs text-gray-400 tracking-wider">{ar ? 'المزايا والمكافآت' : 'PERKS & BONUSES'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {getPerksList(selectedSkin).map((perk, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: `${TIER_CONFIG[selectedSkin.tier].color}18` }}>
                          <Check size={9} style={{ color: TIER_CONFIG[selectedSkin.tier].color }} />
                        </div>
                        <span className="font-body text-xs text-gray-300">{perk}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-px mb-5" style={{ background: `linear-gradient(90deg, transparent, ${TIER_CONFIG[selectedSkin.tier].color}25, transparent)` }} />
                {ownedNinjas.includes(selectedSkin.id) ? (
                  <div className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-ninja-green/20" style={{ background: 'rgba(57,255,20,0.05)' }}>
                    <Check size={18} className="text-ninja-green" />
                    <span className="font-ninja text-sm text-ninja-green tracking-wider">{ar ? 'مملوك بالفعل' : 'ALREADY OWNED'}</span>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => setSelectedSkin(null)} className="ninja-btn ninja-btn-ghost flex-1">{ar ? 'إلغاء' : 'CANCEL'}</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => buySkin(selectedSkin)}
                      disabled={buying || buySuccess || (selectedSkin.price > 0 && player.coins < selectedSkin.price) || (selectedSkin.unlockLevel ? playerLevel < selectedSkin.unlockLevel : false)}
                      className="ninja-btn flex-[2] flex items-center justify-center gap-2 font-ninja tracking-wider"
                      style={
                        buySuccess ? { background: 'linear-gradient(135deg, #39FF14, #00C853)', color: '#000', border: 'none' }
                        : selectedSkin.price > 0 && player.coins < selectedSkin.price ? { background: '#1a1a1a', color: '#444', border: '1px solid #333' }
                        : selectedSkin.unlockLevel && playerLevel < selectedSkin.unlockLevel ? { background: '#1a1a1a', color: '#444', border: '1px solid #333' }
                        : selectedSkin.price === 0 ? { background: 'linear-gradient(135deg, #39FF14, #00C853)', color: '#000', border: 'none' }
                        : { background: `linear-gradient(135deg, ${TIER_CONFIG[selectedSkin.tier].color}, ${TIER_CONFIG[selectedSkin.tier].color}CC)`, color: '#000', border: 'none' }
                      }>
                      {buying ? <span className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full" />
                        : buySuccess ? <><Check size={16} /> {ar ? 'تم الفتح!' : 'UNLOCKED!'}</>
                        : selectedSkin.unlockLevel && playerLevel < selectedSkin.unlockLevel ? <><Lock size={14} /> {ar ? `تحتاج المستوى ${selectedSkin.unlockLevel}` : `NEED LVL ${selectedSkin.unlockLevel}`}</>
                        : selectedSkin.price > 0 ? <><Coins size={14} /> {ar ? `اشترِ بـ ${selectedSkin.price} توكن` : `BUY FOR ${selectedSkin.price} COINS`}</>
                        : <><Sparkles size={14} /> {ar ? 'احصل مجاناً' : 'CLAIM FREE'}</>}
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          CHEST CONFIRM MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {confirmChest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative overflow-hidden rounded-2xl p-6 max-w-[90vw] max-h-[80vh] overflow-y-auto"
              style={{ width: 550, background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              <div className="flex justify-end mb-1">
                <button onClick={() => setConfirmChest(null)} className="ninja-btn ninja-btn-ghost ninja-btn-icon w-9 h-9"><X size={22} /></button>
              </div>
              <div className="text-center mb-5">
                <motion.img src={`/img/chest-${confirmChest.id}.png`} alt={confirmChest.name}
                  className="w-32 h-32 mx-auto object-contain mb-3" style={{ filter: `drop-shadow(0 0 20px ${confirmChest.glowColor})` }}
                  animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity }} />
                <h3 className="font-ninja text-2xl" style={{ color: confirmChest.color }}>{confirmChest.name}</h3>
                <p className="font-body text-sm text-gray-400 mt-1 flex items-center justify-center gap-1">{ar ? 'التكلفة:' : 'Cost:'} <Coins size={14} className="text-yellow-400" /> {getDiscountedCost(confirmChest.cost)}</p>
              </div>
              <h4 className="font-ninja text-sm text-gray-300 mb-3 text-center tracking-wider">{ar ? 'المكافآت المحتملة' : 'POSSIBLE REWARDS'}</h4>
              <div className="grid grid-cols-3 gap-2 max-h-[250px] overflow-y-auto pr-1 mb-5">
                {confirmChest.rewards.map(r => (
                  <div key={r.id} className="rounded-xl p-2.5 text-center" style={{ background: `${RARITY_COLORS[r.rarity]?.bg || '#666'}08`, border: `1px solid ${RARITY_COLORS[r.rarity]?.bg || '#666'}20` }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-1" style={{ background: `${RARITY_COLORS[r.rarity]?.bg || '#666'}12` }}>
                      {r.image ? <img src={r.image} alt={r.name} className="w-8 h-8 object-contain" /> : <span style={{ color: RARITY_COLORS[r.rarity]?.bg || '#666' }}>{getRewardIcon(r)}</span>}
                    </div>
                    <p className="font-body text-[10px] text-white truncate">{r.name}</p>
                    <p className="font-body text-[9px] capitalize" style={{ color: RARITY_COLORS[r.rarity]?.bg || '#666' }}>{r.rarity}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmChest(null)} className="ninja-btn ninja-btn-ghost px-4 py-3 rounded-xl font-ninja text-xs">{ar ? 'إلغاء' : 'CANCEL'}</button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { buyChestToInventory(confirmChest); setConfirmChest(null); }}
                  className="flex-1 py-3 rounded-xl font-ninja text-xs tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${confirmChest.color}40`, color: confirmChest.color }}>
                  {ar ? 'احفظ لوقت لاحق' : 'SAVE FOR LATER'}
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { openChest(confirmChest); setConfirmChest(null); }}
                  className="ninja-btn ninja-btn-green-fill flex-[1.3] py-3 rounded-xl font-ninja text-black text-sm tracking-wider"
                  style={{ background: confirmChest.color }}>{ar ? 'افتح الآن' : 'OPEN NOW'}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          ROULETTE / SPIN OVERLAY
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {opening && selectedChest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center flex-col relative overflow-hidden rounded-2xl"
            style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
            onClick={phase === 'reveal' ? closeReveal : undefined}>
            <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
            <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
            <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
            {phase === 'spinning' && (
              <div className="w-full flex flex-col items-center justify-center h-full">
                <motion.p initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="font-ninja text-3xl mb-10 tracking-wider"
                  style={{ color: selectedChest.color, textShadow: `0 0 30px ${selectedChest.glowColor}` }}>{selectedChest.name.toUpperCase()}</motion.p>
                <div className="relative w-full max-w-[900px] mx-auto">
                  <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 z-30 flex flex-col items-center">
                    <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[14px] border-l-transparent border-r-transparent -mb-px" style={{ borderTopColor: '#39FF14', filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.8))' }} />
                    <div className="w-[2px] flex-1" style={{ background: '#39FF14', boxShadow: '0 0 12px rgba(57,255,20,0.8)' }} />
                    <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[14px] border-l-transparent border-r-transparent -mt-px" style={{ borderBottomColor: '#39FF14', filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.8))' }} />
                  </div>
                  <div className="overflow-hidden h-[280px] relative rounded-lg" style={{ background: 'rgba(8,8,8,0.95)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="absolute left-0 top-0 bottom-0 w-40 z-10 pointer-events-none bg-gradient-to-r from-black via-black/80 to-transparent" />
                    <div className="absolute right-0 top-0 bottom-0 w-40 z-10 pointer-events-none bg-gradient-to-l from-black via-black/80 to-transparent" />
                    <div className="flex items-stretch h-full" style={{ transform: `translateX(calc(50% - ${CARD_W / 2}px - ${spinOffset}px))`, transition: 'none' }}>
                      {spinItems.map((item, idx) => {
                        const isCenter = idx === activeCardIndex;
                        const rarityCol = RARITY_COLORS[item.rarity].bg;
                        return (
                          <div key={idx} className={`spin-card flex-shrink-0 ${isCenter ? 'active' : ''}`}
                            style={{ width: `${CARD_W}px`, height: '100%', '--spin-color': rarityCol } as React.CSSProperties}>
                            <div className="spin-card-inner">
                              <div className="flex-1 flex items-center justify-center p-3">
                                {item.image ? <img src={item.image} alt={item.name} className="w-24 h-24 object-contain" style={{ filter: `drop-shadow(0 0 12px ${rarityCol})` }} />
                                  : <div style={{ color: rarityCol }}>{getLargeRewardIcon(item, 52)}</div>}
                              </div>
                              <p className="font-body text-xs text-white text-center px-1 truncate w-full">{item.name}</p>
                              <div className="w-full h-[4px] flex-shrink-0 mt-1" style={{ background: rarityCol, boxShadow: isCenter ? `0 0 12px ${rarityCol}` : 'none' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 2 }}
                  onClick={() => { cancelAnimationFrame(animFrameRef.current); setSpinOffset(winIndex * CARD_W); setActiveCardIndex(winIndex); setPhase('reveal'); }}
                  className="ninja-btn ninja-btn-ghost mt-10 px-10 py-3 rounded-xl font-ninja text-sm">{ar ? 'تخطي' : 'SKIP'}</motion.button>
              </div>
            )}
            {phase === 'reveal' && reward && (
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="text-center flex flex-col items-center">
                {[...Array(30)].map((_, i) => (
                  <motion.div key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1.5 }}
                    animate={{ x: (Math.random() - 0.5) * 800, y: (Math.random() - 0.5) * 800, opacity: 0, scale: 0 }}
                    transition={{ duration: 2.2, delay: i * 0.02 }}
                    className="absolute" style={{ left: '50%', top: '50%', color: RARITY_COLORS[reward.rarity].bg }}>
                    <Sparkles size={20} />
                  </motion.div>
                ))}
                <motion.div animate={{ borderColor: [`${RARITY_COLORS[reward.rarity].bg}60`, RARITY_COLORS[reward.rarity].bg, `${RARITY_COLORS[reward.rarity].bg}60`] }}
                  transition={{ duration: 2, repeat: Infinity }} className="reveal-card"
                  style={{ width: 300, height: 420, borderColor: RARITY_COLORS[reward.rarity].bg, '--reveal-color1': RARITY_COLORS[reward.rarity].bg, '--reveal-color2': '#fff' } as React.CSSProperties}>
                  <div className="reveal-card-shadow" />
                  <div className="reveal-card-content">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}>
                      {reward.image ? <img src={reward.image} alt={reward.name} className="w-36 h-36 object-contain" style={{ filter: `drop-shadow(0 0 30px ${RARITY_COLORS[reward.rarity].bg})` }} />
                        : <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: `${RARITY_COLORS[reward.rarity].bg}20`, color: RARITY_COLORS[reward.rarity].bg }}>{getLargeRewardIcon(reward, 64)}</div>}
                    </motion.div>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="font-body text-lg flex items-center gap-1.5" style={{ color: RARITY_COLORS[reward.rarity].bg }}>
                      <Star size={18} fill={RARITY_COLORS[reward.rarity].bg} /> {reward.rarity.toUpperCase()} <Star size={18} fill={RARITY_COLORS[reward.rarity].bg} />
                    </motion.p>
                    <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="font-ninja text-3xl text-white">{reward.name}</motion.p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="font-body text-gray-400 text-base">{reward.description}</motion.p>
                    {reward.type === 'coins' && reward.value && (
                      <motion.p initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1, type: 'spring' }} className="font-ninja text-4xl text-yellow-400 flex items-center gap-2">+{reward.value} <Coins size={32} /></motion.p>
                    )}
                  </div>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1.5 }} className="font-body text-gray-500 mt-8">{ar ? 'اضغط في أي مكان للمتابعة' : 'Click anywhere to continue'}</motion.p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
