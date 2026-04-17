'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, collection, query, where, getDocs } from 'firebase/firestore';
import { RARITY_COLORS, VIP_CONFIG, CHESTS } from '@/lib/constants';
import {
  Package, Coins, Zap, Coffee, Cookie, UtensilsCrossed, Trophy,
  Gift, Check, X, Send, Search, Lock, Loader2, Sparkles, Palette,
  ShieldCheck, Clock, Star, Swords, Crown,
} from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { ChestSlider } from '@/components/kiosk/ChestSlider';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props {
  player: any;
  highlightItemId?: string | null;
  onHighlightSeen?: () => void;
}

interface InventoryItem {
  id: string;
  type: string;
  name: string;
  rarity: string;
  value?: number;
  obtainedAt: number;
  used: boolean;
  sentBy?: string;
  tradeable?: boolean;
  skinId?: string;
}

const DEFAULT_NINJAS: InventoryItem[] = [
  { id: 'default_neon', type: 'skin', name: 'Neon Ninja', rarity: 'common', skinId: 'neon', value: 0, obtainedAt: 0, used: false, tradeable: false },
  { id: 'default_shadow', type: 'skin', name: 'Shadow Ninja', rarity: 'common', skinId: 'shadow', value: 0, obtainedAt: 0, used: false, tradeable: false },
];

const getItemIcon = (item: InventoryItem, size = 24) => {
  if (item.type === 'vip') return <Crown size={size} />;
  if (item.type === 'skin') return <Palette size={size} />;
  if (item.type === 'xp_boost') return <Zap size={size} />;
  if (item.name.toLowerCase().includes('drink')) return <Coffee size={size} />;
  if (item.name.toLowerCase().includes('snack')) return <Cookie size={size} />;
  if (item.name.toLowerCase().includes('food') || item.name.toLowerCase().includes('meal')) return <UtensilsCrossed size={size} />;
  if (item.name.toLowerCase().includes('tournament')) return <Trophy size={size} />;
  return <Gift size={size} />;
};

const getItemImage = (item: InventoryItem): string | null => {
  if (item.type === 'vip') return null;
  if (item.type === 'skin' && item.skinId) return `/img/pfp-${item.skinId}.png`;
  if (item.id?.includes('chest_')) { const tier = item.id.match(/chest_(bronze|silver|gold|legendary|ninja)/)?.[1] || 'bronze'; return `/img/chest-${tier}.png`; }
  if (item.id?.includes('coins_10') || item.name === '10 Tokens') return '/img/reward-coins-10.png';
  if (item.id?.includes('coins_25') || item.name === '25 Tokens') return '/img/reward-coins-25.png';
  if (item.id?.includes('coins_50') || item.name === '50 Tokens') return '/img/reward-coins-50.png';
  if (item.id?.includes('coins_150') || item.name === '150 Tokens') return '/img/reward-coins-150.png';
  if (item.id?.includes('coins_500') || item.name === '500 Tokens') return '/img/reward-coins-500.png';
  if (item.id?.includes('voucher_drink') || item.name?.includes('Drink')) return '/img/reward-voucher-drink.png';
  if (item.id?.includes('voucher_snack') || item.name?.includes('Snack')) return '/img/reward-voucher-snack.png';
  if (item.id?.includes('voucher_food') || item.name?.includes('Food')) return '/img/reward-voucher-food.png';
  if (item.id?.includes('tournament') || item.name?.includes('Tournament')) return '/img/reward-tournament-pass.png';
  if (item.id?.includes('extra_time_30') || item.name?.includes('30 Min')) return '/img/reward-time-30m.png';
  if (item.id?.includes('extra_time_1h') || item.name?.includes('1 Hour')) return '/img/reward-time-1h.png';
  if (item.type === 'coins' || item.name.toLowerCase().includes('token')) return '/img/coin.png';
  return null;
};

const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'common'];

type Category = 'all' | 'skins' | 'vouchers' | 'boosts' | 'gifts' | 'chests';

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode; color: string; match: (item: InventoryItem) => boolean }[] = [
  { id: 'all',      label: 'ALL',      icon: <Package size={18} />, color: '#39FF14', match: () => true },
  { id: 'skins',    label: 'SKINS',    icon: <Palette size={18} />, color: '#00BFFF', match: (i) => i.type === 'skin' },
  { id: 'vouchers', label: 'VOUCHERS', icon: <Coffee size={18} />,  color: '#FF6F00', match: (i) => i.type === 'voucher' || i.name.toLowerCase().includes('free play') || i.name.toLowerCase().includes('tournament') },
  { id: 'boosts',   label: 'BOOSTS',   icon: <Zap size={18} />,     color: '#FFD700', match: (i) => i.type === 'xp_boost' },
  { id: 'chests',   label: 'CHESTS',   icon: <Package size={18} />,  color: '#CD7F32', match: (i) => i.type === 'chest' || i.name.toLowerCase().includes('chest') || i.name.toLowerCase().includes('daily') },
  { id: 'gifts',    label: 'GIFTS',    icon: <Gift size={18} />,    color: '#A855F7', match: (i) => !!i.sentBy },
];

export function InventoryTab({ player, highlightItemId, onHighlightSeen }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [detailModal, setDetailModal] = useState<InventoryItem | null>(null);
  const [sellModal, setSellModal] = useState<InventoryItem | null>(null);
  const [useModal, setUseModal] = useState<InventoryItem | null>(null);
  const [sendModal, setSendModal] = useState<InventoryItem | null>(null);
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 24;

  // ESC closes inner modals (innermost last = closes first)
  useEscapeKey(() => setDetailModal(null), detailModal !== null);
  useEscapeKey(() => setSellModal(null), sellModal !== null);
  useEscapeKey(() => setUseModal(null), useModal !== null);
  useEscapeKey(() => setSendModal(null), sendModal !== null);

  // Highlight state — when item received via gift popup click
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const pendingHighlightRef = useRef<string | null>(null);

  // One-time cleanup: persistently remove duplicate skin entries left over
  // from the old probability-based chest engine. Runs once per inventory
  // load. Only mutates Firestore if duplicates are actually found, so it's
  // a no-op for already-clean accounts.
  useEffect(() => {
    if (!player?.uid) return;
    const inv = (player.inventory || []) as any[];
    if (inv.length === 0) return;
    const seen = new Set<string>();
    const cleaned: any[] = [];
    let removed = 0;
    for (const it of inv) {
      if (it?.type === 'skin' && it?.skinId) {
        if (seen.has(it.skinId)) { removed++; continue; }
        seen.add(it.skinId);
      }
      cleaned.push(it);
    }
    if (removed > 0) {
      updateDoc(doc(db, 'players', player.uid), { inventory: cleaned })
        .catch(err => console.error('Skin de-dup cleanup failed', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.uid]);

  // Listen for "open-daily-chest" — fired from Daily Tasks after All Complete.
  // Auto-opens the most recent unused daily chest in the player's inventory.
  useEffect(() => {
    const handler = () => {
      const inv = (player.inventory || []) as InventoryItem[];
      const dailyChests = inv
        .filter(i => !i.used && (i.type === 'chest' || (i.name || '').toLowerCase().includes('daily')))
        .sort((a, b) => (b.obtainedAt || 0) - (a.obtainedAt || 0));
      if (dailyChests.length === 0) return;
      setUseModal(dailyChests[0]);
    };
    window.addEventListener('open-daily-chest', handler);
    return () => window.removeEventListener('open-daily-chest', handler);
  }, [player.inventory]);

  // When highlightItemId prop changes, queue it up
  useEffect(() => {
    if (!highlightItemId) return;
    setCategory('all');
    setSearchQuery('');
    pendingHighlightRef.current = highlightItemId;
    setActiveHighlight(highlightItemId);
    const timer = setTimeout(() => {
      setActiveHighlight(null);
      pendingHighlightRef.current = null;
      onHighlightSeen?.();
    }, 8000);
    return () => clearTimeout(timer);
  }, [highlightItemId]);

  // Once filteredInventory is computed (after category/search reset), find the page
  useEffect(() => {
    if (!activeHighlight) return;
    // Search in the SORTED filtered list (which is what's actually rendered)
    const allSorted = [...(player.inventory || []).filter((i: InventoryItem) => !i.used)];
    const defaultSkins = DEFAULT_NINJAS.filter(n => !new Set(allSorted.filter(i => i.type === 'skin').map(i => i.skinId)).has(n.skinId));
    const combined = [...defaultSkins, ...allSorted].sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
    const idx = combined.findIndex((i: InventoryItem) => i.id === activeHighlight);
    if (idx >= 0) {
      setPage(Math.floor(idx / ITEMS_PER_PAGE));
    }
    // Scroll after a short delay to let DOM update
    setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [activeHighlight]);

  // Send state
  const [sendTarget, setSendTarget] = useState('');
  const [sendPin, setSendPin] = useState('');
  const [sendPinVerified, setSendPinVerified] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  // Combine regular inventory with default ninja skins.
  // Skin de-dup: a player can only ever own ONE copy of a given skinId.
  // If pre-fix data left multiple inventory entries for the same skinId we
  // collapse them here (UI side) so duplicate cards don't render. The
  // earliest-obtained entry wins; later duplicates are silently dropped.
  const rawInventory: InventoryItem[] = (player.inventory || []).filter((i: InventoryItem) => !i.used);
  const seenSkinIds = new Set<string>();
  const regularInventory: InventoryItem[] = [];
  for (const it of rawInventory) {
    if (it.type === 'skin' && it.skinId) {
      if (seenSkinIds.has(it.skinId)) continue;
      seenSkinIds.add(it.skinId);
    }
    regularInventory.push(it);
  }
  const defaultNinjasToAdd = DEFAULT_NINJAS.filter(n => !seenSkinIds.has(n.skinId!));
  const inventory: InventoryItem[] = [...defaultNinjasToAdd, ...regularInventory];

  const catMatch = CATEGORIES.find(c => c.id === category)?.match || (() => true);
  const filteredInventory = inventory
    .filter(item => catMatch(item))
    .filter(item => !searchQuery.trim() || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.rarity.toLowerCase().includes(searchQuery.toLowerCase()) || (item.sentBy && item.sentBy.toLowerCase().includes(searchQuery.toLowerCase())))
    .sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));

  // BULLETPROOF SELL VALUES — kiosk can never lose money to a buy/sell loop.
  // Hard caps per type:
  //   • skin     → 0  (cosmetics are permanent — can't be cashed out)
  //   • voucher  → 0  (represent physical goods — must be redeemed at desk)
  //   • chest    → floor(cost × 0.50) when unopened (cost looked up from CHESTS)
  //   • coins    → floor(value × 0.25)
  //   • item     → floor(value × 0.20)
  // Reasoning: chest payout target is ~67% of cost (33% house edge). Even
  // refunding 50% of an unopened chest still leaves the kiosk in profit.
  // For everything that can come *out* of a chest the cap stays well under
  // what the kiosk earned from the original chest.
  const getSellValue = (item: InventoryItem) => {
    if (!item) return 0;
    if (item.tradeable === false) return 0;
    if (item.type === 'skin')   return 0;
    if (item.type === 'voucher') return 0;
    if (item.type === 'chest') {
      const tier = (item as any).chestTier || (item as any).tier;
      const chest = CHESTS.find(c => c.tier === tier || c.id === tier);
      const cost = chest?.cost ?? 0;
      return Math.floor(cost * 0.50);
    }
    if (item.type === 'consumable' || item.type === 'coins') {
      return Math.floor((item.value || 0) * 0.25);
    }
    return Math.floor((item.value || 0) * 0.20);
  };
  const rarityColor = (rarity: string) => (RARITY_COLORS[rarity as keyof typeof RARITY_COLORS])?.bg || '#666';
  const rarityGlow = (rarity: string) => (RARITY_COLORS[rarity as keyof typeof RARITY_COLORS])?.glow || 'rgba(100,100,100,0.2)';
  const isEquipped = (item: InventoryItem) => item.type === 'skin' && item.skinId === player.ninjaType;
  const formatDate = (ts: number) => { if (!ts) return 'Default'; const d = new Date(ts); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = inventory.filter(i => cat.match(i)).length;
    return acc;
  }, {} as Record<string, number>);

  // ========== HANDLERS ==========
  const handleSell = async (item: InventoryItem) => {
    if (processing) return;
    setProcessing(true);
    const sellValue = getSellValue(item);
    const updatedInventory = (player.inventory || []).map((inv: InventoryItem) => inv.id === item.id ? { ...inv, used: true } : inv);
    try { await updateDoc(doc(db, 'players', player.uid), { inventory: updatedInventory, coins: increment(sellValue) }); } catch (err) { console.error('Failed to sell:', err); }
    setSellModal(null); setDetailModal(null); setProcessing(false);
  };

  // Daily chest rewards pool
  const DAILY_CHEST_REWARDS = [
    { name: '10 Tokens',          type: 'coins',   rarity: 'common', value: 10,  image: '/img/reward-coins-10.png' },
    { name: '25 Tokens',          type: 'coins',   rarity: 'common', value: 25,  image: '/img/reward-coins-25.png' },
    { name: '50 Tokens',          type: 'coins',   rarity: 'rare',   value: 50,  image: '/img/reward-coins-50.png' },
    { name: 'Free Drink Voucher', type: 'voucher', rarity: 'rare',   value: 40,  image: '/img/reward-voucher-food.png' },
    { name: 'Free Snack Voucher', type: 'voucher', rarity: 'rare',   value: 25,  image: '/img/reward-voucher-snack.png' },
    { name: '30 Min Free Play',   type: 'voucher', rarity: 'epic',   value: 100, image: '/img/reward-time-30m.png' },
  ];
  const DAILY_CHEST_WEIGHTS = [30, 25, 15, 12, 12, 6];

  const [chestResult, setChestResult] = useState<{ name: string; rarity: string; type: string; value: number; image?: string } | null>(null);
  const [chestPhase, setChestPhase] = useState<'idle' | 'spinning' | 'reveal'>('idle');
  const [spinItems, setSpinItems] = useState<Array<{ name: string; rarity: string; type: string; value: number; image?: string }>>([]);
  const [spinWinIndex, setSpinWinIndex] = useState(0);

  const handleOpenChest = async (item: InventoryItem) => {
    if (processing || chestPhase !== 'idle') return;
    setProcessing(true);
    try {
      // Roll reward
      const totalW = DAILY_CHEST_WEIGHTS.reduce((a, b) => a + b, 0);
      let roll = Math.random() * totalW;
      let won = DAILY_CHEST_REWARDS[0];
      for (let i = 0; i < DAILY_CHEST_REWARDS.length; i++) {
        roll -= DAILY_CHEST_WEIGHTS[i];
        if (roll <= 0) { won = DAILY_CHEST_REWARDS[i]; break; }
      }

      // Mark chest as used + add reward to inventory
      const updatedInventory = (player.inventory || []).map((inv: InventoryItem) => inv.id === item.id ? { ...inv, used: true } : inv);
      const rewardItem = {
        id: `chest_reward_${Date.now()}`,
        type: won.type, name: won.name, rarity: won.rarity, value: won.value,
        obtainedAt: Date.now(), used: false, tradeable: true,
      };
      const updates: any = { inventory: [...updatedInventory, rewardItem] };
      if (won.type === 'coins') updates.coins = increment(won.value);

      await updateDoc(doc(db, 'players', player.uid), updates);

      // Build slider items: 40 random rewards with the winner placed at index 33
      const items: Array<{ name: string; rarity: string; type: string; value: number }> = [];
      for (let i = 0; i < 40; i++) {
        items.push(DAILY_CHEST_REWARDS[Math.floor(Math.random() * DAILY_CHEST_REWARDS.length)]);
      }
      items[33] = won;
      setSpinItems(items);
      setSpinWinIndex(33);
      setChestResult(won);
      setChestPhase('spinning');
    } catch (err) {
      console.error('Failed to open chest:', err);
      setChestPhase('idle');
    }
    setProcessing(false);
  };

  const handleSpinComplete = useCallback(() => {
    setChestPhase('reveal');
    setTimeout(() => {
      setChestResult(null);
      setChestPhase('idle');
      setSpinItems([]);
      setUseModal(null);
      setDetailModal(null);
    }, 3800);
  }, []);

  const handleUse = async (item: InventoryItem) => {
    if (processing) return;
    // If it's a chest, open it with rewards
    if (item.type === 'chest') { handleOpenChest(item); return; }

    // If it's a VIP pass, activate VIP on the player
    if (item.type === 'vip') {
      setProcessing(true);
      const updatedInventory = (player.inventory || []).map((inv: InventoryItem) => inv.id === item.id ? { ...inv, used: true } : inv);
      try {
        const now = Date.now();
        const currentExpiry = player.vip?.active ? (player.vip.expiresAt || now) : now;
        const baseTime = Math.max(currentExpiry, now);
        const newExpiry = baseTime + VIP_CONFIG.durationDays * 24 * 60 * 60 * 1000;
        await updateDoc(doc(db, 'players', player.uid), {
          inventory: updatedInventory,
          'vip.active': true,
          'vip.startedAt': now,
          'vip.expiresAt': newExpiry,
          'vip.tier': 'basic',
        });
      } catch (err) { console.error('Failed to activate VIP:', err); }
      setUseModal(null); setDetailModal(null); setProcessing(false);
      return;
    }

    setProcessing(true);
    const updatedInventory = (player.inventory || []).map((inv: InventoryItem) => inv.id === item.id ? { ...inv, used: true } : inv);
    try {
      const isFreePlay = item.name.toLowerCase().includes('free play');
      const is1Hour = item.name.toLowerCase().includes('1 hour');
      if (isFreePlay) {
        const duration = is1Hour ? 60 * 60 * 1000 : 30 * 60 * 1000;
        await updateDoc(doc(db, 'players', player.uid), { inventory: updatedInventory, freePlayUntil: Date.now() + duration });
      } else {
        await updateDoc(doc(db, 'players', player.uid), { inventory: updatedInventory });
        if (item.type === 'voucher' && !item.name.toLowerCase().includes('tournament')) {
          const { addDoc } = await import('firebase/firestore');
          await addDoc(collection(db, 'orders'), {
            playerId: player.uid, playerName: player.username, pcId: 'voucher-redeem',
            items: [{ menuItemId: item.id, name: `[VOUCHER] ${item.name}`, quantity: 1, price: 0 }],
            totalCoins: 0, status: 'pending', createdAt: Date.now(), updatedAt: Date.now(),
          });
        }
      }
    } catch (err) { console.error('Failed to use:', err); }
    setUseModal(null); setDetailModal(null); setProcessing(false);
  };

  const handleEquipSkin = async (item: InventoryItem) => {
    if (processing || !item.skinId) return;
    setProcessing(true);
    try { await updateDoc(doc(db, 'players', player.uid), { ninjaType: item.skinId }); } catch (err) { console.error('Failed to equip:', err); }
    setDetailModal(null); setProcessing(false);
  };

  const handleSendToFriend = async (item: InventoryItem) => {
    if (sendLoading) return;
    if (!sendPinVerified) {
      if (!sendPin || sendPin.length !== 6) { setSendError(ar ? 'أدخل رمز PIN المكون من 6 أرقام' : 'Enter your 6-digit PIN'); return; }
      if (sendPin !== String(player.pin)) { setSendError(ar ? 'رمز PIN غير صحيح' : 'Wrong PIN'); setSendPin(''); return; }
      setSendPinVerified(true); setSendError(''); return;
    }
    if (!sendTarget.trim()) { setSendError(ar ? 'أدخل اسم المستخدم' : 'Enter a username'); return; }
    setSendLoading(true); setSendError('');
    try {
      const q = query(collection(db, 'players'), where('username', '==', sendTarget.trim()));
      const snap = await getDocs(q);
      if (snap.empty) { setSendError(ar ? 'اللاعب غير موجود' : 'Player not found'); setSendLoading(false); return; }
      const targetDoc = snap.docs[0];
      if (targetDoc.id === player.uid) { setSendError(ar ? 'لا يمكنك الإرسال لنفسك' : "Can't send to yourself"); setSendLoading(false); return; }
      const senderInventory = (player.inventory || []).map((inv: InventoryItem) => inv.id === item.id ? { ...inv, used: true } : inv);
      const targetData = targetDoc.data();
      const receiverInventory = [...(targetData.inventory || []), { ...item, id: `${item.id}-gift-${Date.now()}`, used: false, obtainedAt: Date.now(), sentBy: player.username }];
      await updateDoc(doc(db, 'players', player.uid), { inventory: senderInventory });
      await updateDoc(doc(db, 'players', targetDoc.id), { inventory: receiverInventory });
      fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Gift Received!', message: `${player.username} sent you "${item.name}"`, targetUids: [targetDoc.id] }) }).catch(() => {});
      setSendSuccess(`Sent "${item.name}" to ${sendTarget}!`);
      setTimeout(() => { setSendModal(null); setDetailModal(null); setSendSuccess(''); setSendTarget(''); setSendPin(''); setSendPinVerified(false); }, 1500);
    } catch (err) { console.error(err); setSendError(ar ? 'فشل إرسال العنصر' : 'Failed to send item'); }
    setSendLoading(false);
  };

  const closeSendModal = () => { setSendModal(null); setSendTarget(''); setSendPin(''); setSendPinVerified(false); setSendError(''); setSendSuccess(''); };

  const handleBulkSell = async () => {
    if (processing || selectedIds.size === 0) return;
    setProcessing(true);
    let totalValue = 0;
    const updatedInventory = (player.inventory || []).map((inv: InventoryItem) => {
      if (selectedIds.has(inv.id)) { totalValue += Math.floor((inv.value || 0) * 0.8); return { ...inv, used: true }; }
      return inv;
    });
    try { await updateDoc(doc(db, 'players', player.uid), { inventory: updatedInventory, coins: increment(totalValue) }); } catch { /* ignore */ }
    setSelectedIds(new Set()); setBulkMode(false); setProcessing(false);
  };

  const bulkSellTotal = Array.from(selectedIds).reduce((sum, id) => { const item = inventory.find(i => i.id === id); return sum + (item ? getSellValue(item) : 0); }, 0);

  return (
    <div className="relative h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}>
      {/* PCB grid overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      {/* Hex pattern overlay */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      {/* Radial glows */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 15% 10%, rgba(57,255,20,0.06) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(0,200,255,0.05) 0%, transparent 35%)',
      }} />
      {/* PCB traces */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <path d="M200,100 L400,100 L420,80 L600,80 L620,100 L900,100" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
        <path d="M200,300 L350,300 L370,280 L550,280 L570,300 L800,300" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.06" />
        <path d="M200,500 L400,500 L420,520 L650,520 L670,500 L1000,500" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.05" />
        <path d="M200,700 L300,700 L320,680 L500,680 L520,700 L800,700" stroke="#00c8ff" strokeWidth="0.4" fill="none" opacity="0.04" />
        <path d="M500,0 L500,80 L520,100 L520,280" stroke="#39FF14" strokeWidth="0.4" fill="none" opacity="0.05" />
        <path d="M800,100 L800,300 L780,320 L780,500" stroke="#00c8ff" strokeWidth="0.4" fill="none" opacity="0.04" />
        <circle cx="500" cy="80" r="2" fill="#39FF14" opacity="0.1" className="pcb-node-flash" />
        <circle cx="800" cy="300" r="2" fill="#00c8ff" opacity="0.08" className="pcb-node-flash2" />
        <circle cx="600" cy="520" r="2" fill="#39FF14" opacity="0.06" className="pcb-node-flash3" />
      </svg>
      {/* Top edge neon line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.3), rgba(0,200,255,0.2), rgba(168,85,247,0.15), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }} />
      {/* Bottom edge line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.15), rgba(168,85,247,0.1), transparent)' }} />

      <div className="relative z-10 flex h-full w-full gap-0">

      {/* ═══ LEFT SIDEBAR — Heavy Cyberpunk Design ═══ */}
      <div className="shrink-0 flex flex-col relative z-10 overflow-hidden" style={{
        width: 300,
        background: 'linear-gradient(180deg, #060810 0%, #080a14 30%, #0a0c18 60%, #060810 100%)',
        borderRight: '2px solid rgba(57,255,20,0.15)',
      }}>
        {/* Top neon accent line */}
        <div className="h-[2px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, #39FF14, #00c8ff, #39FF14)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }} />

        {/* Dense PCB traces background */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 800" preserveAspectRatio="none">
          <path d="M0,60 L80,60 L95,45 L210,45 L225,60 L300,60" stroke="#00ffb4" strokeWidth="0.7" fill="none" opacity="0.08" />
          <path d="M300,130 L240,130 L225,145 L100,145 L85,130 L0,130" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.06" />
          <path d="M0,220 L60,220 L75,205 L200,205 L215,220 L300,220" stroke="#00ffb4" strokeWidth="0.6" fill="none" opacity="0.06" />
          <path d="M300,310 L230,310 L215,325 L100,325 L85,310 L0,310" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
          <path d="M0,400 L90,400 L105,385 L210,385 L225,400 L300,400" stroke="#00ffb4" strokeWidth="0.5" fill="none" opacity="0.05" />
          <path d="M300,490 L210,490 L195,505 L120,505 L105,490 L0,490" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.04" />
          <path d="M150,0 L150,45 L130,60 L130,145" stroke="#00ffb4" strokeWidth="0.5" fill="none" opacity="0.06" />
          <path d="M220,60 L220,130 L240,145 L240,220" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
          <rect x="147" y="42" width="6" height="6" rx="1" fill="none" stroke="#00ffb4" strokeWidth="0.7" opacity="0.1" />
          <rect x="217" y="127" width="6" height="6" rx="1" fill="none" stroke="#00c8ff" strokeWidth="0.7" opacity="0.08" />
          <circle cx="150" cy="45" r="2" fill="#00ffb4" opacity="0.12" className="pcb-node-flash" />
          <circle cx="220" cy="130" r="2" fill="#00c8ff" opacity="0.1" className="pcb-node-flash2" />
          <circle cx="100" cy="220" r="2" fill="#00ffb4" opacity="0.08" className="pcb-node-flash3" />
          <circle cx="210" cy="400" r="2" fill="#00ffb4" opacity="0.08" className="pcb-node-flash" />
        </svg>

        {/* Radial glow overlays */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.06) 0%, transparent 40%), radial-gradient(ellipse at 50% 95%, rgba(0,200,255,0.04) 0%, transparent 40%)' }} />
        {/* Right edge glow line */}
        <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.3), rgba(0,200,255,0.1), rgba(57,255,20,0.2))' }} />

        {/* Title with HUD frame */}
        <div className="relative z-10 mx-3 mt-5 mb-5">
          <div className="relative rounded-lg px-3 py-3" style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.06), rgba(0,200,255,0.03))', border: '1px solid rgba(57,255,20,0.2)' }}>
            {/* Mini HUD corners */}
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
            <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: '2px solid #00c8ff', borderRight: '2px solid #00c8ff' }} />
            <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: '2px solid #00c8ff', borderLeft: '2px solid #00c8ff' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
            <div className="flex items-center gap-2">
              <Package size={20} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.6))' }} />
              <div>
                <h2 className="font-ninja text-base text-ninja-green tracking-wider" style={{ textShadow: '0 0 15px rgba(57,255,20,0.5)' }}>{ar ? 'الحقيبة' : 'INVENTORY'}</h2>
                <p className="font-body text-[9px] text-gray-600">{ar ? `${inventory.length} عنصر` : `${inventory.length} items collected`}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Categories — each as a mini HUD card */}
        <div className="flex flex-col gap-2 px-3 relative z-10">
          {CATEGORIES.map((cat, ci) => {
            const active = category === cat.id;
            const count = categoryCounts[cat.id] || 0;
            return (
              <motion.button key={cat.id} onClick={() => { setCategory(cat.id); setPage(0); }}
                className="relative rounded-lg text-left transition-all overflow-hidden"
                whileHover={{ scale: 1.02, x: 3 }} whileTap={{ scale: 0.96 }}
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ci * 0.06 }}
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${cat.color}15, ${cat.color}05)`
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${active ? `${cat.color}40` : 'rgba(255,255,255,0.05)'}`,
                  boxShadow: active ? `0 0 15px ${cat.color}12, inset 0 0 15px ${cat.color}08` : 'none',
                }}>
                {/* Top-left HUD corner mark on active */}
                {active && (
                  <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${cat.color}`, borderLeft: `2px solid ${cat.color}` }} />
                )}
                {/* Active left 3px glow bar */}
                {active && (
                  <motion.div layoutId="invCatBar" className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: cat.color, boxShadow: `0 0 8px ${cat.color}, 0 0 15px ${cat.color}60` }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }} />
                )}
                {/* Bottom accent line */}
                <div className="absolute bottom-0 left-4 right-4 h-[1px]"
                  style={{ background: active ? `linear-gradient(90deg, transparent, ${cat.color}40, transparent)` : 'transparent' }} />

                <div className="flex items-center gap-2.5 px-3 py-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: active ? `${cat.color}18` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? `${cat.color}40` : 'rgba(255,255,255,0.06)'}`,
                      boxShadow: active ? `0 0 8px ${cat.color}20` : 'none',
                    }}>
                    <span style={{ color: active ? cat.color : '#555', filter: active ? `drop-shadow(0 0 4px ${cat.color})` : 'none' }}>{cat.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-ninja text-[11px] tracking-wider block truncate"
                      style={{ color: active ? cat.color : '#666', textShadow: active ? `0 0 8px ${cat.color}40` : 'none' }}>
                      {cat.label}
                    </span>
                  </div>
                  <span className="font-ninja text-[10px] px-2 py-0.5 rounded-md flex-shrink-0"
                    style={{
                      background: active ? `${cat.color}20` : 'rgba(255,255,255,0.03)',
                      color: active ? cat.color : '#555',
                      border: `1px solid ${active ? `${cat.color}35` : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: active ? `0 0 6px ${cat.color}15` : 'none',
                    }}>{count}</span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Balance Card — heavy HUD style */}
        <div className="mt-auto pt-4 px-3 relative z-10">
          <div className="relative rounded-lg overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(234,179,8,0.03))', border: '2px solid rgba(234,179,8,0.25)' }}>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: '2px solid #eab308', borderLeft: '2px solid #eab308' }} />
            <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: '2px solid #eab308', borderRight: '2px solid #eab308' }} />
            <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: '2px solid #eab308', borderLeft: '2px solid #eab308' }} />
            <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: '2px solid #eab308', borderRight: '2px solid #eab308' }} />
            {/* Bottom accent */}
            <div className="absolute bottom-0 left-4 right-4 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.4), transparent)' }} />
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', boxShadow: '0 0 10px rgba(234,179,8,0.1)' }}>
                <Coins size={18} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 6px rgba(234,179,8,0.6))' }} />
              </div>
              <div>
                <span className="font-body text-[8px] text-gray-500 uppercase tracking-wider">{ar ? 'الرصيد' : 'BALANCE'}</span>
                <p className="font-ninja text-lg text-yellow-300 leading-tight" style={{ textShadow: '0 0 10px rgba(234,179,8,0.4)' }}>{Math.floor(player.coins).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom neon accent */}
        <div className="h-[2px] w-full mt-4 shrink-0" style={{ background: 'linear-gradient(90deg, #00c8ff, #39FF14, #00c8ff)', boxShadow: '0 0 8px rgba(0,200,255,0.2)' }} />
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden p-5 relative z-10">
        {/* Top bar: Search + Select (same row) */}
        <div className="relative rounded-lg mb-4 overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(57,255,20,0.04), rgba(0,200,255,0.02))',
          border: '1px solid rgba(57,255,20,0.15)',
          boxShadow: '0 0 20px rgba(57,255,20,0.04)',
        }}>
          {/* HUD corners */}
          <div className="absolute top-0 left-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
          <div className="absolute top-0 right-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderTop: '1px solid rgba(0,200,255,0.3)', borderRight: '1px solid rgba(0,200,255,0.3)' }} />
          <div className="absolute bottom-0 left-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderBottom: '1px solid rgba(0,200,255,0.3)', borderLeft: '1px solid rgba(0,200,255,0.3)' }} />
          <div className="absolute bottom-0 right-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderBottom: '2px solid rgba(168,85,247,0.3)', borderRight: '2px solid rgba(168,85,247,0.3)' }} />
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), transparent)' }} />
          {/* Left glow bar */}
          <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] pointer-events-none z-[1]" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14, 0 0 12px rgba(57,255,20,0.3)', opacity: 0.3 }} />

          <div className="relative z-[2] flex items-center gap-2 px-3 py-2">
            <div className="flex-1 max-w-xs relative">
              <NinjaInput type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={ar ? 'بحث...' : 'Search...'} icon={<Search size={12} />} />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white z-10"><X size={12} /></button>}
            </div>
            <button onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              className={`ninja-btn ${bulkMode ? 'ninja-btn-red' : 'ninja-btn-ghost'} text-[11px] flex-shrink-0 px-4 py-2`}>
              {bulkMode ? (ar ? 'إلغاء' : 'CANCEL') : (ar ? 'اختيار العناصر' : 'SELECT ITEMS')}
            </button>
            {bulkMode && (
              <>
                <button onClick={() => {
                  const tradeableIds = filteredInventory.filter(i => i.tradeable !== false).map(i => i.id);
                  setSelectedIds(prev => prev.size === tradeableIds.length ? new Set() : new Set(tradeableIds));
                }} className="ninja-btn ninja-btn-sm ninja-btn-ghost text-[11px] flex-shrink-0">
                  {selectedIds.size === filteredInventory.filter(i => i.tradeable !== false).length ? (ar ? 'لا شيء' : 'NONE') : (ar ? 'الكل' : 'ALL')}
                </button>
                {selectedIds.size > 0 && (
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleBulkSell}
                    className="ninja-btn ninja-btn-sm ninja-btn-yellow flex items-center gap-1.5 text-[11px] flex-shrink-0">
                    <Coins size={12} /> {ar ? 'بيع' : 'SELL'} {selectedIds.size} ({bulkSellTotal} <Coins size={10} className="inline" />)
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Card grid */}
        {filteredInventory.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-4">
                {category === 'all' ? <Package size={40} className="text-gray-700" /> : <Search size={36} className="text-gray-700" />}
              </div>
              <p className="font-ninja text-lg text-gray-600">{inventory.length === 0 ? (ar ? 'لا توجد عناصر' : 'NO ITEMS YET') : (ar ? 'لا توجد نتائج' : 'NO MATCHES')}</p>
              <p className="font-body text-gray-700 text-sm mt-1">{inventory.length === 0 ? (ar ? 'افتح الصناديق للحصول على العناصر!' : 'Open chests to get items!') : (ar ? 'جرب فئة أخرى أو بحثاً مختلفاً' : 'Try a different category or search')}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {filteredInventory.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE).map((item, i) => {
                const color = rarityColor(item.rarity);
                const itemImg = getItemImage(item);
                const isNonTradeable = item.tradeable === false;
                const equipped = isEquipped(item);
                const showRibbon = ['epic', 'legendary', 'mythic'].includes(item.rarity);
                const isHighlighted = activeHighlight === item.id;

                return (
                  <motion.div key={item.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02, duration: 0.3 }}
                    whileHover={!bulkMode ? { scale: 1.04, y: -3 } : {}}
                    onClick={() => {
                      if (bulkMode && !isNonTradeable) {
                        setSelectedIds(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
                      } else if (!bulkMode) setDetailModal(item);
                    }}
                    className="relative cursor-pointer group"
                    style={{ height: 240 }}>

                    {/* Highlight pulse effect for newly received items */}
                    {isHighlighted && (
                      <>
                        <motion.div className="absolute -inset-1 rounded-xl z-0 pointer-events-none"
                          animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.02, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                          style={{ background: `linear-gradient(135deg, #c084fc33, #c084fc11)`, border: '2px solid #c084fc', boxShadow: '0 0 25px #c084fc55, 0 0 50px #c084fc22' }} />
                        <motion.div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full font-ninja text-[9px] tracking-wider whitespace-nowrap"
                          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                          style={{ background: 'rgba(192,132,252,0.25)', border: '1px solid rgba(192,132,252,0.5)', color: '#c084fc', boxShadow: '0 0 12px rgba(192,132,252,0.3)' }}>
                          {ar ? 'عنصر جديد' : 'NEW ITEM'}
                        </motion.div>
                      </>
                    )}

                    <div className={`w-full h-full rounded-xl relative overflow-hidden transition-all duration-300 ${selectedIds.has(item.id) ? 'ring-2 ring-ninja-green ring-offset-1 ring-offset-black' : ''} ${equipped ? 'ring-2 ring-ninja-green/60' : ''} ${isHighlighted ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-black' : ''}`}
                      style={{
                        background: `linear-gradient(180deg, ${color}0A 0%, #040608 40%, #030508 100%)`,
                        border: `1px solid ${isHighlighted ? '#c084fc' : `${color}25`}`,
                        boxShadow: `0 4px 20px ${color}10, inset 0 0 20px ${color}05`,
                      }}>
                      {/* Inner PCB grid */}
                      <div className="absolute inset-0 pointer-events-none" style={{
                        backgroundImage: `linear-gradient(${color}08 1px, transparent 1px), linear-gradient(90deg, ${color}08 1px, transparent 1px)`,
                        backgroundSize: '25px 25px',
                        opacity: 0.35,
                      }} />
                      {/* Top HUD corners — rarity color */}
                      <div className="absolute top-0 left-0 w-3.5 h-3.5 z-20" style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, opacity: 0.7 }} />
                      <div className="absolute top-0 right-0 w-3.5 h-3.5 z-20" style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}`, opacity: 0.7 }} />
                      {/* Bottom HUD corners — cyan */}
                      <div className="absolute bottom-0 left-0 w-3.5 h-3.5 z-20" style={{ borderBottom: '2px solid rgba(0,200,255,0.5)', borderLeft: '2px solid rgba(0,200,255,0.5)' }} />
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 z-20" style={{ borderBottom: '2px solid rgba(0,200,255,0.5)', borderRight: '2px solid rgba(0,200,255,0.5)' }} />
                      {/* Top accent line with glow */}
                      <div className="absolute top-0 left-0 right-0 h-[2px] z-[15]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 10px ${color}60` }} />
                      {/* Left vertical glow bar */}
                      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[15]" style={{ background: color, boxShadow: `0 0 8px ${color}, 0 0 15px ${color}40`, opacity: 0.4 }} />
                      {/* Bottom accent line — cyan */}
                      <div className="absolute bottom-0 left-0 right-0 h-[1px] z-[15]" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.4), transparent)' }} />

                      {/* Hover glow */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at 50% 30%, ${color}18 0%, transparent 70%)` }} />

                      {/* Rarity ribbon */}
                      {showRibbon && <div className={`rarity-ribbon rarity-ribbon-${item.rarity}`} data-label={item.rarity} />}

                      {/* Top-left: bulk select only */}
                      {bulkMode && !isNonTradeable && (
                        <div className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.has(item.id) ? 'bg-ninja-green border-ninja-green shadow-[0_0_8px_rgba(57,255,20,0.4)]' : 'border-gray-600 bg-black/60'}`}>
                          {selectedIds.has(item.id) && <Check size={12} className="text-black" />}
                        </div>
                      )}

                      {/* Bottom-left: equipped badge (doesn't overlap ribbon) */}
                      {equipped && !bulkMode && (
                        <div className="absolute bottom-10 left-2 z-20 flex items-center gap-1 bg-ninja-green/20 border border-ninja-green/40 rounded-md px-1.5 py-0.5">
                          <ShieldCheck size={10} className="text-ninja-green" />
                          <span className="font-ninja text-[8px] text-ninja-green">{ar ? 'مُجهز' : 'EQUIPPED'}</span>
                        </div>
                      )}

                      {/* Top-right badges */}
                      <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1 items-end">
                        {/* Non-sellable badge */}
                        {isNonTradeable && !equipped && (
                          <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-md px-1.5 py-0.5">
                            <Lock size={8} className="text-gray-500" />
                            <span className="font-body text-[7px] text-gray-500">{ar ? 'غير قابل للتبادل' : 'NON-TRADEABLE'}</span>
                          </div>
                        )}
                        {/* Gift badge — sent by friend */}
                        {item.sentBy && (
                          <div className="flex items-center gap-1 bg-purple-500/20 border border-purple-500/30 rounded-md px-1.5 py-0.5">
                            <Gift size={8} className="text-purple-400" />
                            <span className="font-body text-[7px] text-purple-300 max-w-[60px] truncate">{ar ? `من ${item.sentBy}` : `from ${item.sentBy}`}</span>
                          </div>
                        )}
                      </div>

                      {/* Item image area — big photos in compact cards */}
                      <div className="flex items-center justify-center pt-3 pb-1 px-2" style={{ height: 170 }}>
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full blur-2xl opacity-25 group-hover:opacity-45 transition-opacity"
                            style={{ background: color, transform: 'scale(1.5)' }} />
                          {itemImg ? (
                            <img src={itemImg} alt={item.name}
                              className={`relative z-10 object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-110 ${
                                item.type === 'skin' ? 'w-32 h-32 rounded-full' : 'w-28 h-28'
                              }`}
                              style={{ filter: `drop-shadow(0 0 16px ${color}50)` }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const fb = (e.target as HTMLImageElement).nextElementSibling; if (fb) (fb as HTMLElement).classList.remove('hidden'); }} />
                          ) : null}
                          <div className={`relative z-10 w-28 h-28 rounded-2xl flex items-center justify-center ${itemImg ? 'hidden' : ''}`}
                            style={{ background: `${color}12`, border: `1px solid ${color}20`, color }}>
                            {getItemIcon(item, 48)}
                          </div>
                        </div>
                      </div>

                      {/* Item info bottom */}
                      <div className="absolute bottom-0 left-0 right-0">
                        <p className="font-ninja text-[11px] text-white text-center px-2 truncate tracking-wider leading-tight">{item.name.toUpperCase()}</p>
                        <p className="font-body text-[9px] capitalize text-center mt-0.5 mb-1.5" style={{ color, opacity: 0.8 }}>
                          {item.rarity}{item.value ? ` - ${item.value}` : ''}{item.value ? <Coins size={8} className="inline ml-0.5 -mt-0.5" /> : null}
                        </p>
                        <div className="w-full h-[3px]" style={{ background: `linear-gradient(90deg, transparent 0%, ${color} 20%, ${color} 80%, transparent 100%)` }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination at bottom — only shows if multiple pages */}
            {Math.ceil(filteredInventory.length / ITEMS_PER_PAGE) > 1 && (
              <div className="relative mt-4 rounded-lg overflow-hidden" style={{
                background: 'linear-gradient(135deg, rgba(57,255,20,0.04), rgba(0,200,255,0.02))',
                border: '1px solid rgba(57,255,20,0.12)',
                boxShadow: '0 0 15px rgba(57,255,20,0.03)',
              }}>
                {/* HUD corners */}
                <div className="absolute top-0 left-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
                <div className="absolute top-0 right-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderTop: '1px solid rgba(0,200,255,0.25)', borderRight: '1px solid rgba(0,200,255,0.25)' }} />
                <div className="absolute bottom-0 left-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderBottom: '1px solid rgba(0,200,255,0.25)', borderLeft: '1px solid rgba(0,200,255,0.25)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3 pointer-events-none z-[1]" style={{ borderBottom: '2px solid rgba(168,85,247,0.25)', borderRight: '2px solid rgba(168,85,247,0.25)' }} />
                {/* Top accent line */}
                <div className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.4), rgba(0,200,255,0.25), transparent)' }} />

                <div className="relative z-[2] flex items-center justify-center gap-3 py-3">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                    className={`ninja-btn ninja-btn-ghost ninja-btn-sm text-[11px] ${page === 0 ? 'opacity-30' : ''}`}>&lt; {ar ? 'السابق' : 'Prev'}</button>
                  <span className="font-ninja text-sm text-gray-400">
                    {ar ? 'صفحة' : 'Page'} <span className="text-white">{page + 1}</span>/{Math.ceil(filteredInventory.length / ITEMS_PER_PAGE)}
                  </span>
                  <button onClick={() => setPage(Math.min(Math.ceil(filteredInventory.length / ITEMS_PER_PAGE) - 1, page + 1))}
                    disabled={page >= Math.ceil(filteredInventory.length / ITEMS_PER_PAGE) - 1}
                    className={`ninja-btn ninja-btn-ghost ninja-btn-sm text-[11px] ${page >= Math.ceil(filteredInventory.length / ITEMS_PER_PAGE) - 1 ? 'opacity-30' : ''}`}>{ar ? 'التالي' : 'Next'} &gt;</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      </div>

      {/* ═══ DETAIL MODAL — Cyberpunk HUD ═══ */}
      <AnimatePresence>
        {detailModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.85, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className="relative w-[480px] max-h-[90vh] rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
                border: '1px solid rgba(57,255,20,0.15)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)',
              }}
              onClick={e => e.stopPropagation()}>

              {/* HUD corner brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderLeft: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(168,85,247,0.25)', borderRight: '2px solid rgba(168,85,247,0.25)' }} />
              {/* Top neon accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />

              <button onClick={() => setDetailModal(null)}
                className="absolute top-4 right-4 z-50 w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:rotate-90 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s' }}>
                <X size={18} />
              </button>
              {['epic', 'legendary', 'mythic'].includes(detailModal.rarity) && <div className={`rarity-ribbon rarity-ribbon-${detailModal.rarity}`} data-label={detailModal.rarity} />}

              {/* Large image — BIGGER */}
              <div className="relative flex items-center justify-center py-10 px-6" style={{ minHeight: 240 }}>
                <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(ellipse at 50% 50%, ${rarityColor(detailModal.rarity)}40 0%, transparent 70%)` }} />
                {(() => {
                  const img = getItemImage(detailModal);
                  return img ? (
                    <motion.img initial={{ scale: 0.8 }} animate={{ scale: 1 }} src={img} alt={detailModal.name}
                      className={`relative z-10 object-contain ${detailModal.type === 'skin' ? 'w-44 h-44 rounded-full ring-2 ring-offset-2 ring-offset-transparent' : 'w-40 h-40'}`}
                      style={{ filter: `drop-shadow(0 0 24px ${rarityColor(detailModal.rarity)}60)` }} />
                  ) : (
                    <div className="relative z-10 w-32 h-32 rounded-2xl flex items-center justify-center"
                      style={{ background: `${rarityColor(detailModal.rarity)}12`, border: `1px solid ${rarityColor(detailModal.rarity)}25`, color: rarityColor(detailModal.rarity) }}>
                      {getItemIcon(detailModal, 56)}
                    </div>
                  );
                })()}
              </div>

              {/* Rarity accent line */}
              <div className="w-full h-[3px] relative z-10" style={{ background: `linear-gradient(90deg, transparent 0%, ${rarityColor(detailModal.rarity)} 15%, ${rarityColor(detailModal.rarity)} 85%, transparent 100%)`, boxShadow: `0 0 10px ${rarityColor(detailModal.rarity)}40` }} />

              <div className="px-7 py-5">
                <h3 className="font-ninja text-xl text-white tracking-wider mb-1" style={{ textShadow: `0 0 15px ${rarityColor(detailModal.rarity)}30` }}>{detailModal.name.toUpperCase()}</h3>
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <span className="font-ninja text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-md"
                    style={{ color: rarityColor(detailModal.rarity), background: `${rarityColor(detailModal.rarity)}15`, border: `1px solid ${rarityColor(detailModal.rarity)}30`, boxShadow: `0 0 8px ${rarityColor(detailModal.rarity)}10` }}>
                    {detailModal.rarity}
                  </span>
                  <span className="font-body text-[10px] text-gray-500 uppercase">{detailModal.type.replace('_', ' ')}</span>
                  {isEquipped(detailModal) && <span className="flex items-center gap-1 font-ninja text-[10px] text-ninja-green" style={{ textShadow: '0 0 6px rgba(57,255,20,0.4)' }}><ShieldCheck size={10} /> {ar ? 'مُجهز' : 'EQUIPPED'}</span>}
                  {detailModal.tradeable === false && <span className="flex items-center gap-1 font-body text-[9px] text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/5"><Lock size={8} /> {ar ? 'غير قابل للتبادل' : 'Non-tradeable'}</span>}
                </div>

                {/* Details grid — HUD styled */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {detailModal.value !== undefined && detailModal.value > 0 && (
                    <div className="relative rounded-lg px-3 py-2.5" style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)' }}>
                      <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '1px solid rgba(234,179,8,0.4)', borderLeft: '1px solid rgba(234,179,8,0.4)' }} />
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1px solid rgba(234,179,8,0.4)', borderRight: '1px solid rgba(234,179,8,0.4)' }} />
                      <p className="font-body text-[9px] text-gray-500 uppercase mb-0.5">{ar ? 'القيمة' : 'Value'}</p>
                      <p className="font-ninja text-sm text-yellow-400 flex items-center gap-1"><Coins size={12} /> {detailModal.value}</p>
                    </div>
                  )}
                  <div className="relative rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.15)', borderLeft: '1px solid rgba(255,255,255,0.15)' }} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)' }} />
                    <p className="font-body text-[9px] text-gray-500 uppercase mb-0.5">{ar ? 'تاريخ الحصول' : 'Obtained'}</p>
                    <p className="font-body text-sm text-gray-300 flex items-center gap-1"><Clock size={11} className="text-gray-500" /> {formatDate(detailModal.obtainedAt)}</p>
                  </div>
                  {detailModal.sentBy && (
                    <div className="relative rounded-lg px-3 py-2.5 col-span-2" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
                      <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '1px solid rgba(168,85,247,0.4)', borderLeft: '1px solid rgba(168,85,247,0.4)' }} />
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1px solid rgba(168,85,247,0.4)', borderRight: '1px solid rgba(168,85,247,0.4)' }} />
                      <p className="font-body text-[9px] text-purple-400 uppercase mb-0.5">{ar ? 'هدية من صديق' : 'Gift from friend'}</p>
                      <p className="font-body text-sm text-purple-300 flex items-center gap-1"><Gift size={11} /> {detailModal.sentBy}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons — cyberpunk styled */}
                <div className="flex gap-2.5">
                  {detailModal.type === 'skin' && !isEquipped(detailModal) && (
                    <motion.button whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(57,255,20,0.3)' }} whileTap={{ scale: 0.96 }} onClick={() => handleEquipSkin(detailModal)} disabled={processing}
                      className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-ninja text-sm text-black"
                      style={{ background: 'linear-gradient(135deg, #2ddb1a, #39FF14)', boxShadow: '0 0 12px rgba(57,255,20,0.2)' }}>
                      {processing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} {ar ? 'تجهيز' : 'EQUIP'}
                    </motion.button>
                  )}
                  {detailModal.type === 'skin' && isEquipped(detailModal) && (
                    <div className="flex-1 py-3 flex items-center justify-center gap-2 font-ninja text-sm rounded-xl"
                      style={{ color: 'rgba(57,255,20,0.5)', border: '1px solid rgba(57,255,20,0.2)', background: 'rgba(57,255,20,0.04)' }}>
                      <ShieldCheck size={16} /> {ar ? 'مُجهز حالياً' : 'CURRENTLY EQUIPPED'}
                    </div>
                  )}
                  {detailModal.type !== 'skin' && detailModal.tradeable !== false && (
                    <motion.button whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(57,255,20,0.3)' }} whileTap={{ scale: 0.96 }} onClick={() => setUseModal(detailModal)}
                      className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-ninja text-sm text-black"
                      style={{ background: 'linear-gradient(135deg, #2ddb1a, #39FF14)', boxShadow: '0 0 12px rgba(57,255,20,0.2)' }}>
                      <Sparkles size={16} /> {ar ? 'استخدام' : 'USE'}
                    </motion.button>
                  )}
                  {detailModal.tradeable !== false && (
                    <motion.button whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(168,85,247,0.3)' }} whileTap={{ scale: 0.96 }} onClick={() => setSendModal(detailModal)}
                      className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-ninja text-sm text-white"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 12px rgba(168,85,247,0.15)' }}>
                      <Send size={16} /> {ar ? 'إرسال' : 'SEND'}
                    </motion.button>
                  )}
                  {detailModal.tradeable !== false && detailModal.type !== 'skin' && detailModal.type !== 'vip' && (
                    <motion.button whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(234,179,8,0.3)' }} whileTap={{ scale: 0.96 }} onClick={() => setSellModal(detailModal)}
                      className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-ninja text-sm text-black"
                      style={{ background: 'linear-gradient(135deg, #d4a017, #eab308)', boxShadow: '0 0 12px rgba(234,179,8,0.2)' }}>
                      <Coins size={16} /> {ar ? 'بيع' : 'SELL'}
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SELL MODAL — Cyberpunk HUD ═══ */}
      <AnimatePresence>
        {sellModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[210] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
            <motion.div initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className="relative rounded-2xl overflow-hidden p-7 w-[420px]"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
              onClick={e => e.stopPropagation()}>
              {/* HUD corner brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderLeft: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(168,85,247,0.25)', borderRight: '2px solid rgba(168,85,247,0.25)' }} />
              {/* Top neon accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-xl text-yellow-400 tracking-wider" style={{ textShadow: '0 0 12px rgba(234,179,8,0.4)' }}>{ar ? 'بيع العنصر' : 'SELL ITEM'}</h3>
                <button onClick={() => setSellModal(null)} className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:rotate-90" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s' }}><X size={16} /></button>
              </div>
              <div className="relative flex items-center gap-4 mb-5 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '1px solid rgba(234,179,8,0.3)', borderLeft: '1px solid rgba(234,179,8,0.3)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '1px solid rgba(234,179,8,0.3)', borderRight: '1px solid rgba(234,179,8,0.3)' }} />
                {(() => { const img = getItemImage(sellModal); return img ? <img src={img} alt="" className="w-14 h-14 object-contain" style={{ filter: `drop-shadow(0 0 10px ${rarityColor(sellModal.rarity)}50)` }} /> : <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: `${rarityColor(sellModal.rarity)}12`, color: rarityColor(sellModal.rarity) }}>{getItemIcon(sellModal, 28)}</div>; })()}
                <div><p className="font-ninja text-sm text-white">{sellModal.name.toUpperCase()}</p><p className="font-body text-[10px] capitalize" style={{ color: rarityColor(sellModal.rarity) }}>{sellModal.rarity}</p></div>
              </div>
              <div className="relative rounded-xl p-4 mb-5 space-y-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(234,179,8,0.12)' }}>
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '1px solid rgba(234,179,8,0.25)', borderLeft: '1px solid rgba(234,179,8,0.25)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '1px solid rgba(234,179,8,0.25)', borderRight: '1px solid rgba(234,179,8,0.25)' }} />
                {(() => {
                  const recv = getSellValue(sellModal);
                  const refRaw = sellModal.type === 'chest'
                    ? (CHESTS.find(c => c.tier === ((sellModal as any).chestTier || (sellModal as any).tier) || c.id === ((sellModal as any).chestTier || (sellModal as any).tier))?.cost ?? 0)
                    : (sellModal.value || 0);
                  const refLabel = sellModal.type === 'chest' ? (ar ? 'سعر الصندوق' : 'Chest cost') : (ar ? 'قيمة العنصر' : 'Item value');
                  const fee = Math.max(0, refRaw - recv);
                  const nonSellable = (sellModal.type === 'skin' || sellModal.type === 'voucher' || sellModal.tradeable === false);
                  return (
                    <>
                      <div className="flex items-center justify-between"><span className="font-body text-xs text-gray-500">{refLabel}</span><span className="font-body text-sm text-gray-300 flex items-center gap-1"><Coins size={12} className="text-yellow-500" /> {refRaw}</span></div>
                      {!nonSellable && (
                        <div className="flex items-center justify-between"><span className="font-body text-xs text-gray-500">{ar ? 'رسوم البيع' : 'Sell fee'}</span><span className="font-body text-sm text-red-400">-{fee}</span></div>
                      )}
                      {nonSellable && (
                        <div className="text-[10px] text-red-400/80 leading-snug">
                          {sellModal.type === 'skin'
                            ? (ar ? 'الستايلات لا يمكن بيعها — تبقى معك للأبد.' : 'Skins are permanent and cannot be sold.')
                            : sellModal.type === 'voucher'
                              ? (ar ? 'الكوبونات تُستبدل عند الكاشير، ولا تُباع.' : 'Vouchers must be redeemed at the desk — not sellable.')
                              : (ar ? 'هذا العنصر غير قابل للتداول.' : 'This item is bound and cannot be sold.')}
                        </div>
                      )}
                      <div className="border-t border-white/10 pt-2 flex items-center justify-between"><span className="font-body text-xs text-gray-400 font-bold">{ar ? 'ستستلم' : 'You receive'}</span><span className="font-ninja text-lg text-yellow-400 flex items-center gap-1" style={{ textShadow: '0 0 8px rgba(234,179,8,0.4)' }}><Coins size={14} /> {recv}</span></div>
                    </>
                  );
                })()}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setSellModal(null)} className="flex-1 py-3 rounded-xl font-ninja text-sm text-gray-400" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>{ar ? 'إلغاء' : 'CANCEL'}</button>
                <motion.button whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(234,179,8,0.4)' }} whileTap={{ scale: 0.96 }} onClick={() => handleSell(sellModal)} disabled={processing}
                  className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-ninja text-sm text-black"
                  style={{ background: 'linear-gradient(135deg, #d4a017, #eab308)', boxShadow: '0 0 12px rgba(234,179,8,0.2)' }}>
                  {processing ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />} {ar ? 'تأكيد البيع' : 'CONFIRM SELL'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ USE / OPEN CHEST MODAL — Cyberpunk HUD ═══ */}
      <AnimatePresence>
        {useModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[210] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { if (chestPhase === 'idle' && !chestResult) setUseModal(null); }}>
            <motion.div initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className="relative rounded-2xl overflow-hidden p-7 w-[420px]"
              style={{
                background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
                border: '1px solid rgba(57,255,20,0.15)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)',
              }}
              onClick={e => e.stopPropagation()}>
              {/* HUD corner brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderLeft: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(168,85,247,0.25)', borderRight: '2px solid rgba(168,85,247,0.25)' }} />
              {/* Top neon accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />

              {/* ═══ REVEAL PHASE: reward shown (spinning phase handled by full-screen overlay below) ═══ */}
              {chestPhase === 'reveal' && chestResult ? (
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 180 }}
                  className="text-center py-4 relative overflow-hidden" style={{ minHeight: 260 }}>

                  {/* Coin shower for token rewards */}
                  {chestResult.type === 'coins' && Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute pointer-events-none"
                      style={{ left: `${Math.random() * 100}%`, top: '-10%', fontSize: 16 + Math.random() * 14 }}
                      initial={{ y: 0, opacity: 0, rotate: 0 }}
                      animate={{
                        y: [0, 400],
                        opacity: [0, 1, 1, 0],
                        rotate: [0, 360 + Math.random() * 360],
                        x: [0, (Math.random() - 0.5) * 80],
                      }}
                      transition={{ duration: 2 + Math.random() * 1.5, delay: Math.random() * 1.2, ease: 'easeIn' }}
                    >
                      🪙
                    </motion.div>
                  ))}

                  {/* Burst rays for voucher */}
                  {chestResult.type !== 'coins' && (
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.5, 0] }}
                      transition={{ duration: 1.2 }}
                      style={{ background: `radial-gradient(circle, ${rarityColor(chestResult.rarity)}40, transparent 60%)` }}
                    />
                  )}

                  {/* Reward icon */}
                  <motion.div
                    animate={{
                      scale: [0, 1.3, 1, 1.08, 1],
                      rotate: chestResult.type === 'coins' ? [0, -10, 10, 0] : [0, 0, 0, 0],
                    }}
                    transition={{ duration: 0.9 }}
                    className="relative z-10 mx-auto mb-4 flex items-center justify-center"
                  >
                    {chestResult.type === 'coins' ? (
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="relative"
                      >
                        <div className="text-6xl" style={{ filter: 'drop-shadow(0 0 20px rgba(255,215,0,0.8))' }}>🪙</div>
                        {/* Spinning ring */}
                        <motion.div
                          className="absolute inset-[-10px] rounded-full pointer-events-none"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                          style={{ border: '2px dashed rgba(255,215,0,0.35)' }}
                        />
                      </motion.div>
                    ) : (
                      <div className="w-24 h-24 rounded-full flex items-center justify-center relative"
                        style={{ background: `${rarityColor(chestResult.rarity)}18`, border: `2px solid ${rarityColor(chestResult.rarity)}60`, boxShadow: `0 0 40px ${rarityColor(chestResult.rarity)}40` }}>
                        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                          <Gift size={44} style={{ color: rarityColor(chestResult.rarity), filter: `drop-shadow(0 0 12px ${rarityColor(chestResult.rarity)}90)` }} />
                        </motion.div>
                      </div>
                    )}
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="font-ninja text-xs uppercase tracking-widest mb-1 relative z-10" style={{ color: rarityColor(chestResult.rarity) }}>
                    {chestResult.rarity}
                  </motion.p>

                  {/* Token value with big yellow number */}
                  {chestResult.type === 'coins' ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="relative z-10"
                    >
                      <p className="font-ninja text-5xl text-yellow-400 mb-1 flex items-center justify-center gap-2"
                        style={{ textShadow: '0 0 30px rgba(255,215,0,0.7), 0 0 60px rgba(255,149,0,0.4)' }}>
                        +{chestResult.value}
                      </p>
                      <p className="font-ninja text-sm text-yellow-300/80 tracking-[0.3em]">{ar ? 'توكنز' : 'TOKENS'}</p>
                    </motion.div>
                  ) : (
                    <motion.p
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                      className="font-ninja text-2xl text-white mb-2 relative z-10">
                      {chestResult.name}
                    </motion.p>
                  )}

                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                    className="font-body text-gray-400 text-sm mt-4 relative z-10">
                    {chestResult.type === 'coins' ? (ar ? 'تمت الإضافة إلى رصيدك!' : 'Added to your balance!') : (ar ? 'تمت الإضافة إلى حقيبتك!' : 'Added to your inventory!')}
                  </motion.p>
                </motion.div>
              ) : chestPhase !== 'idle' ? null : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-ninja text-lg tracking-wider" style={{ color: useModal.type === 'chest' ? '#00BFFF' : '#39FF14' }}>
                      {useModal.type === 'chest' ? (ar ? 'فتح الصندوق' : 'OPEN CHEST') : (ar ? 'استخدام العنصر' : 'USE ITEM')}
                    </h3>
                    <button onClick={() => setUseModal(null)} className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-gray-400 hover:text-white"><X size={16} /></button>
                  </div>

                  {/* Item preview */}
                  <div className="flex items-center gap-4 mb-5 bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                    {useModal.type === 'chest' ? (
                      <img src="/img/chest-free.png" alt="" className="w-16 h-16 object-contain" style={{ filter: 'drop-shadow(0 0 12px rgba(0,191,255,0.4))' }} />
                    ) : (
                      (() => { const img = getItemImage(useModal); return img ? <img src={img} alt="" className="w-14 h-14 object-contain" style={{ filter: `drop-shadow(0 0 8px ${rarityColor(useModal.rarity)}50)` }} /> : <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: `${rarityColor(useModal.rarity)}12`, color: rarityColor(useModal.rarity) }}>{getItemIcon(useModal, 28)}</div>; })()
                    )}
                    <div>
                      <p className="font-ninja text-sm text-white">{useModal.name.toUpperCase()}</p>
                      <p className="font-body text-[10px] capitalize" style={{ color: useModal.type === 'chest' ? '#00BFFF' : rarityColor(useModal.rarity) }}>{useModal.type === 'chest' ? (ar ? 'صندوق قابل للفتح' : 'Openable Chest') : useModal.rarity}</p>
                    </div>
                  </div>

                  {/* Chest rewards preview */}
                  {useModal.type === 'chest' && (
                    <div className="mb-5">
                      <p className="font-ninja text-[10px] text-gray-400 tracking-wider mb-2">{ar ? 'المكافآت المحتملة' : 'POSSIBLE REWARDS'}</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DAILY_CHEST_REWARDS.map((r, i) => (
                          <div key={i} className="text-center p-2 rounded-lg" style={{ background: `${rarityColor(r.rarity)}08`, border: `1px solid ${rarityColor(r.rarity)}15` }}>
                            <p className="font-body text-[9px] text-white truncate">{r.name}</p>
                            <p className="font-body text-[8px] capitalize" style={{ color: rarityColor(r.rarity) }}>{r.rarity}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {useModal.type === 'vip' && (
                    <div className="bg-yellow-400/[0.05] border border-yellow-400/10 rounded-lg px-3 py-2 mb-4"><p className="font-body text-xs text-gray-400">{ar ? 'سيتم تفعيل VIP لمدة ' : 'VIP will activate for '}<span className="text-yellow-400 font-ninja">{VIP_CONFIG.durationDays} {ar ? 'يوم' : 'days'}</span>{ar ? '. إذا كان مفعلاً بالفعل، ستُضاف الأيام إلى تاريخ انتهائك الحالي.' : '. If already active, days will be added to your current expiry.'}</p></div>
                  )}
                  {useModal.type === 'voucher' && !useModal.name.toLowerCase().includes('tournament') && (
                    <div className="bg-ninja-green/[0.05] border border-ninja-green/10 rounded-lg px-3 py-2 mb-4"><p className="font-body text-xs text-gray-400">{ar ? 'سيتم إنشاء طلب للموظفين' : 'An order will be created for the staff'}</p></div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setUseModal(null)} className="ninja-btn ninja-btn-ghost flex-1 py-3 font-ninja text-sm">{ar ? 'إلغاء' : 'CANCEL'}</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleUse(useModal)} disabled={processing}
                      className={`flex-1 py-3 flex items-center justify-center gap-2 font-ninja text-sm rounded-xl transition-all ${
                        useModal.type === 'chest' ? 'text-white' : useModal.type === 'vip' ? 'text-black' : 'ninja-btn ninja-btn-green'
                      }`}
                      style={useModal.type === 'chest' ? { background: 'linear-gradient(135deg, #00BFFF, #0080FF)', border: 'none' } : useModal.type === 'vip' ? { background: 'linear-gradient(135deg, #FFD700, #FFA000)', border: 'none' } : {}}>
                      {processing ? <Loader2 size={16} className="animate-spin" /> : useModal.type === 'chest' ? <Package size={16} /> : useModal.type === 'vip' ? <Crown size={16} /> : <Sparkles size={16} />}
                      {useModal.type === 'chest' ? (ar ? 'فتح الصندوق' : 'OPEN CHEST') : useModal.type === 'vip' ? (ar ? 'تفعيل VIP' : 'ACTIVATE VIP') : (ar ? 'تأكيد الاستخدام' : 'CONFIRM USE')}
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ CHEST SPINNING (FULL-SCREEN SLIDER) ═══ */}
      <AnimatePresence>
        {chestPhase === 'spinning' && spinItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(180deg, rgba(3,5,8,0.98) 0%, rgba(4,7,14,0.98) 50%, rgba(3,5,8,0.98) 100%)' }}
          >
            <ChestSlider
              items={spinItems.map(r => ({
                name: r.name,
                rarity: r.rarity,
                image: r.image,
                icon: r.type === 'coins' ? <Coins size={44} /> : <Gift size={44} />,
              }))}
              winIndex={spinWinIndex}
              accentColor="#39FF14"
              title={ar ? 'الصندوق اليومي' : 'Daily Chest'}
              rarityColor={rarityColor}
              onComplete={handleSpinComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SEND MODAL ═══ */}
      <AnimatePresence>
        {sendModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[210] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={closeSendModal}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative rounded-2xl overflow-hidden p-7 w-[400px]" style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
              onClick={e => e.stopPropagation()}>
              {/* HUD corner brackets */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderLeft: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(168,85,247,0.25)', borderRight: '2px solid rgba(168,85,247,0.25)' }} />
              {/* Top neon accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-lg text-purple-400 tracking-wider">{ar ? 'إرسال إلى صديق' : 'SEND TO FRIEND'}</h3>
                <button onClick={closeSendModal} className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-gray-400 hover:text-white"><X size={16} /></button>
              </div>
              {sendSuccess ? (
                <div className="text-center py-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                    <div className="w-16 h-16 rounded-full bg-ninja-green/20 border border-ninja-green/30 flex items-center justify-center mx-auto mb-4"><Check size={30} className="text-ninja-green" /></div>
                  </motion.div>
                  <p className="font-ninja text-lg text-ninja-green mb-1">{sendSuccess}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-5 bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                    {(() => { const img = getItemImage(sendModal); return img ? <img src={img} alt="" className="w-14 h-14 object-contain" style={{ filter: `drop-shadow(0 0 8px ${rarityColor(sendModal.rarity)}50)` }} /> : <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: `${rarityColor(sendModal.rarity)}12`, color: rarityColor(sendModal.rarity) }}>{getItemIcon(sendModal, 28)}</div>; })()}
                    <div><p className="font-ninja text-sm text-white">{sendModal.name.toUpperCase()}</p><p className="font-body text-[10px] capitalize" style={{ color: rarityColor(sendModal.rarity) }}>{sendModal.rarity}</p></div>
                  </div>
                  {!sendPinVerified ? (
                    <div className="space-y-4">
                      <div>
                        <label className="font-body text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1"><Lock size={10} /> {ar ? 'تحقق من PIN' : 'Verify PIN'}</label>
                        <NinjaInput type="password" maxLength={6} value={sendPin} onChange={(e) => { setSendPin(e.target.value.replace(/\D/g, '')); setSendError(''); }}
                          placeholder={ar ? 'أدخل رمز PIN المكون من 6 أرقام' : 'Enter your 6-digit PIN'} icon={<Lock size={14} />} className="text-center text-lg tracking-[0.5em]" />
                      </div>
                      {sendError && <p className="font-body text-red-400 text-sm text-center">{sendError}</p>}
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSendToFriend(sendModal)}
                        className="ninja-btn ninja-btn-purple w-full py-3 flex items-center justify-center gap-2 font-ninja text-sm"><Lock size={16} /> {ar ? 'تحقق من PIN' : 'VERIFY PIN'}</motion.button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="font-body text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">{ar ? 'اسم المستلم' : 'Recipient Username'}</label>
                        <NinjaInput type="text" value={sendTarget} onChange={(e) => { setSendTarget(e.target.value); setSendError(''); }} placeholder={ar ? 'أدخل اسم صديقك' : "Enter friend's username"} />
                      </div>
                      {sendError && <p className="font-body text-red-400 text-sm text-center">{sendError}</p>}
                      <div className="flex gap-3">
                        <button onClick={closeSendModal} className="ninja-btn ninja-btn-ghost flex-1 py-3 font-ninja text-sm">{ar ? 'إلغاء' : 'CANCEL'}</button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSendToFriend(sendModal)} disabled={sendLoading}
                          className="ninja-btn ninja-btn-purple flex-1 py-3 flex items-center justify-center gap-2 font-ninja text-sm">
                          {sendLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sendLoading ? (ar ? 'جاري الإرسال...' : 'SENDING...') : (ar ? 'إرسال' : 'SEND')}
                        </motion.button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
