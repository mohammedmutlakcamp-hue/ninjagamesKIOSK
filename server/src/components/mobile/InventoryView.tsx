'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Lang, t } from '@/lib/translations';
import { CHEST_REWARDS, CHESTS } from '@/lib/constants';
import { pickChestReward } from '@/lib/chest-economy';
import {
  Package, Gem, Palette, Zap, Filter, ChevronRight, Sparkles, Trash2, Check, Coins, X, 
  Send, Users, Gift, Play, ArrowRight, Loader2, Star, Crown
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
type FilterTab = 'all' | 'chest' | 'skin' | 'item';

interface InventoryItem {
  id: string;
  name: string;
  type: 'chest' | 'skin' | 'consumable' | 'item' | 'voucher';
  tier?: string;
  icon?: string;
  used?: boolean;
  equipped?: boolean;
  value?: number;
  rarity?: string;
  sentBy?: string;
  tradeable?: boolean;
  skinId?: string;
}

const DEFAULT_NINJAS: InventoryItem[] = [
  { id: 'default_neon', type: 'skin', name: 'Neon Ninja', rarity: 'common', skinId: 'neon', value: 0, used: false, tradeable: false },
  { id: 'default_shadow', type: 'skin', name: 'Shadow Ninja', rarity: 'common', skinId: 'shadow', value: 0, used: false, tradeable: false },
];

// ─── Config ──────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { color: string; label: string; labelAr: string; icon: typeof Package }> = {
  chest:      { color: '#FFB800', label: 'Chest',      labelAr: 'صندوق',    icon: Package },
  skin:       { color: '#A855F7', label: 'Skin',       labelAr: 'ستايل',    icon: Palette },
  consumable: { color: '#39FF14', label: 'Consumable', labelAr: 'استهلاكي', icon: Zap },
  item:       { color: '#00BFFF', label: 'Item',       labelAr: 'عنصر',     icon: Gem },
  voucher:    { color: '#FF6F00', label: 'Voucher',    labelAr: 'كوبون',    icon: Gift },
};

const CHEST_IMAGES: Record<string, string> = {
  bronze: '/img/chest-bronze.png',
  silver: '/img/chest-silver.png',
  gold: '/img/chest-gold.png',
  legendary: '/img/chest-legendary.png',
  ninja: '/img/chest-ninja.png',
};

// ─── Animation variants ─────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04 } },
};

const cardPop = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 350 } },
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
// BULLETPROOF SELL VALUES — kiosk can never lose money to a buy/sell loop.
// (Mirrors InventoryTab.getSellValue. See that file for the full reasoning.)
function getSellValue(item: InventoryItem): number {
  if (!item) return 0;
  if (item.tradeable === false) return 0;
  if (item.type === 'skin')   return 0; // permanent cosmetic
  if (item.type === 'voucher') return 0; // redeem at desk only
  if (item.type === 'chest') {
    const tier = (item as any).chestTier || item.tier;
    const chest = CHESTS.find(c => c.tier === tier || c.id === tier);
    return Math.floor((chest?.cost ?? 0) * 0.50);
  }
  if (item.type === 'consumable') {
    return Math.floor((item.value || 0) * 0.25);
  }
  return Math.floor((item.value || 0) * 0.20);
}

export function InventoryView({ player, lang }: { player: any; lang: Lang }) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selling, setSelling] = useState(false);
  
  // Item action modals
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendToUsername, setSendToUsername] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  
  // Chest opening
  const [openingChest, setOpeningChest] = useState<InventoryItem | null>(null);
  const [chestReward, setChestReward] = useState<any>(null);

  const inventory: InventoryItem[] = useMemo(() => {
    const raw: InventoryItem[] = (player?.inventory || []).map((item: any, i: number) => ({
      id: item.id || `item-${i}`,
      name: item.name || 'Unknown Item',
      type: item.type || 'item',
      tier: item.tier || null,
      icon: item.icon || null,
      used: item.used || false,
      equipped: item.equipped || false,
      value: item.value,
      rarity: item.rarity,
      sentBy: item.sentBy,
      tradeable: item.tradeable,
      skinId: item.skinId,
    }));
    // Skin de-dup — one card per skinId max. Collapses any pre-fix duplicate
    // skin entries so the inventory grid never shows the same skin twice.
    const seenSkinIds = new Set<string>();
    const items: InventoryItem[] = [];
    for (const it of raw) {
      if (it.type === 'skin' && it.skinId) {
        if (seenSkinIds.has(it.skinId)) continue;
        seenSkinIds.add(it.skinId);
      }
      items.push(it);
    }
    const defaultNinjasToAdd = DEFAULT_NINJAS.filter(n => !seenSkinIds.has(n.skinId!));
    return [...defaultNinjasToAdd, ...items];
  }, [player?.inventory]);

  // Load friends for sending
  useEffect(() => {
    if (!player?.friends?.length) return;
    
    const loadFriends = async () => {
      try {
        const friendPromises = player.friends.map((fid: string) => 
          getDocs(query(collection(db, 'players'), where('__name__', '==', fid)))
        );
        const results = await Promise.all(friendPromises);
        const friendsData = results.map(snap => 
          snap.docs[0] ? { uid: snap.docs[0].id, ...snap.docs[0].data() } : null
        ).filter(Boolean);
        setFriends(friendsData);
      } catch (error) {
        console.error('Failed to load friends:', error);
      }
    };
    
    loadFriends();
  }, [player?.friends]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return inventory;
    if (activeFilter === 'item') {
      return inventory.filter((i) => i.type === 'item' || i.type === 'consumable' || i.type === 'voucher');
    }
    return inventory.filter((i) => i.type === activeFilter);
  }, [inventory, activeFilter]);

  const filterTabs: { id: FilterTab; label: string; labelAr: string; count: number }[] = [
    { id: 'all', label: 'All', labelAr: 'الكل', count: inventory.length },
    { id: 'chest', label: 'Chests', labelAr: 'صناديق', count: inventory.filter((i) => i.type === 'chest').length },
    { id: 'skin', label: 'Skins', labelAr: 'ستايلات', count: inventory.filter((i) => i.type === 'skin').length },
    { id: 'item', label: 'Items', labelAr: 'عناصر', count: inventory.filter((i) => i.type === 'item' || i.type === 'consumable' || i.type === 'voucher').length },
  ];

  const toggleSelect = (id: string) => {
    // Block selection of anything that cannot be sold (sell value would be 0).
    const item = inventory.find(i => i.id === id);
    if (!item || getSellValue(item) === 0) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllUsed = () => {
    const usedIds = inventory.filter(i => i.used).map(i => i.id);
    setSelectedIds(new Set(usedIds));
  };

  const totalSellValue = useMemo(() => {
    let total = 0;
    selectedIds.forEach(id => {
      const item = inventory.find(i => i.id === id);
      if (item) total += getSellValue(item);
    });
    return total;
  }, [selectedIds, inventory]);

  async function handleSellSelected() {
    if (selectedIds.size === 0 || selling || !player?.uid) return;
    setSelling(true);
    try {
      const remaining = (player.inventory || []).filter((item: any) => !selectedIds.has(item.id));
      await updateDoc(doc(db, 'players', player.uid), {
        inventory: remaining,
        coins: increment(totalSellValue),
      });
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch {}
    setSelling(false);
  }

  // Open chest — routes through the deterministic chest engine so the
  // 33% house edge is enforced even from the mobile UI.
  async function handleOpenChest(item: InventoryItem) {
    if (item.type !== 'chest' || item.used || !player?.uid) return;

    const tier = (item as any).chestTier || item.tier;
    const chest = CHESTS.find(c => c.tier === tier || c.id === tier);
    if (!chest) return;

    setOpeningChest(item);
    let won;
    try {
      const ownedSkinIds = (player.ownedNinjas || []) as string[];
      const result = await pickChestReward(chest, ownedSkinIds);
      won = result.reward;
    } catch (err) {
      console.error('pickChestReward failed', err);
      setOpeningChest(null);
      return;
    }

    // Mark chest as used
    const updatedInventory = (player.inventory || []).map((invItem: any) =>
      invItem.id === item.id ? { ...invItem, used: true } : invItem,
    );

    const updates: any = { inventory: updatedInventory };

    if (won.type === 'coins') {
      updates.coins = increment(won.value || 0);
    } else if (won.type === 'voucher') {
      updatedInventory.push({
        id: `voucher_${Date.now()}`,
        type: 'voucher',
        name: won.name,
        rarity: won.rarity,
        value: won.value || 0,
        used: false,
        // Tradeable so players can gift it. Sell-for-tokens is blocked by the
        // voucher type guard in the Sell modal — same model as the kiosk side.
        tradeable: true,
        earnedAt: Date.now(),
      });
    } else if (won.type === 'skin' && won.skinId) {
      // Award skin to ownedNinjas (deterministic engine handles dedup).
      updates.ownedNinjas = arrayUnionSafe(player.ownedNinjas || [], won.skinId);
    }

    await updateDoc(doc(db, 'players', player.uid), updates);
    setChestReward(won);

    setTimeout(() => {
      setOpeningChest(null);
      setChestReward(null);
    }, 2000);
  }

  // Local helper — Firestore arrayUnion would require an extra import; this
  // works because we already write the whole `ownedNinjas` field below.
  function arrayUnionSafe<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr : [...arr, val];
  }

  // Use item function
  async function handleUseItem(item: InventoryItem) {
    if (item.used || !player?.uid) return;

    const updatedInventory = (player.inventory || []).map((invItem: any) =>
      invItem.id === item.id ? { ...invItem, used: true } : invItem
    );

    const updates: any = { inventory: updatedInventory };

    // Apply item effects based on type
    if (item.type === 'consumable') {
      if (item.name.includes('Coin')) {
        const coinValue = parseInt(item.name.match(/\d+/)?.[0] || '0');
        updates.coins = increment(coinValue);
      }
    } else if (item.type === 'voucher') {
      const lower = item.name.toLowerCase();
      const isFreePlay = lower.includes('free play');
      const is1Hour = lower.includes('1 hour') || lower.includes('60 min');
      if (isFreePlay) {
        // Self-redeems — grant free playtime directly.
        const duration = is1Hour ? 60 * 60 * 1000 : 30 * 60 * 1000;
        updates.freePlayUntil = Date.now() + duration;
      } else if (!lower.includes('tournament')) {
        // Desk-redeemable voucher: create a paid-by-voucher order so staff
        // sees it in the admin Orders panel. No cash, no coins deducted.
        try {
          await addDoc(collection(db, 'orders'), {
            playerId: player.uid,
            playerName: player.username,
            pcId: 'voucher-redeem',
            pcName: player.pcName || 'Mobile',
            items: [{ menuItemId: item.id, name: `[VOUCHER] ${item.name}`, quantity: 1, price: 0, priceJOD: 0 }],
            totalCoins: 0,
            totalJOD: 0,
            paid: true,
            paymentMethod: 'voucher',
            voucherName: item.name,
            voucherValue: item.value || 0,
            prepTime: 5,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch (err) { console.error('voucher order creation failed', err); }
      }
    }

    await updateDoc(doc(db, 'players', player.uid), updates);
    setSelectedItem(null);
  }

  // Send item to friend
  async function handleSendItem() {
    if (!selectedItem || !sendToUsername.trim() || sendLoading || !player?.uid) return;
    
    setSendLoading(true);
    setSendError('');
    
    try {
      // Find recipient
      const q = query(collection(db, 'players'), where('username', '==', sendToUsername.toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setSendError(lang === 'ar' ? 'اللاعب غير موجود' : 'Player not found');
        setSendLoading(false);
        return;
      }
      
      const recipient = snap.docs[0];
      const recipientData = recipient.data();
      
      // Remove item from sender's inventory
      const senderInventory = (player.inventory || []).filter((item: any) => item.id !== selectedItem.id);
      
      // Add item to recipient's inventory with sender info
      const recipientInventory = [...(recipientData.inventory || [])];
      recipientInventory.push({
        ...selectedItem,
        id: `gift_${Date.now()}`,
        sentBy: player.username,
        receivedAt: Date.now(),
      });
      
      // Update both players
      await updateDoc(doc(db, 'players', player.uid), { inventory: senderInventory });
      await updateDoc(doc(db, 'players', recipient.id), { inventory: recipientInventory });
      
      // Close modals
      setShowSendModal(false);
      setSelectedItem(null);
      setSendToUsername('');
      
    } catch (error) {
      setSendError(lang === 'ar' ? 'فشل إرسال العنصر' : 'Failed to send item');
    }
    
    setSendLoading(false);
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" exit="exit" className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">
            <Package size={20} className="inline mr-2" style={{ color: '#39FF14' }} />
            {t(lang, 'inventory') || (lang === 'ar' ? 'المخزون' : 'Inventory')}
          </h2>
          <div className="flex items-center gap-2">
            {!selectMode ? (
              <button
                onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}
                className="text-[11px] text-white/40 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] active:scale-95 transition-transform"
              >
                {lang === 'ar' ? 'اختيار' : 'Select'}
              </button>
            ) : (
              <button
                onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                className="text-[11px] text-white/50 px-2 py-1.5 active:scale-95"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Select mode toolbar */}
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between mt-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllUsed}
                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-white/60 active:scale-95 transition-transform"
              >
                {lang === 'ar' ? 'اختر المستخدم' : 'Select Used'}
              </button>
              <span className="text-[11px] text-white/40">
                {selectedIds.size} {lang === 'ar' ? 'مختار' : 'selected'}
              </span>
            </div>
            <button
              onClick={handleSellSelected}
              disabled={selectedIds.size === 0 || selling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-transform disabled:opacity-30"
              style={{
                background: selectedIds.size > 0 ? 'rgba(255,59,48,0.15)' : 'rgba(255,255,255,0.04)',
                color: selectedIds.size > 0 ? '#FF3B30' : '#666',
                border: `1px solid ${selectedIds.size > 0 ? 'rgba(255,59,48,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <Trash2 size={12} />
              {lang === 'ar' ? 'بيع' : 'Sell'}
              {selectedIds.size > 0 && (
                <span className="flex items-center gap-0.5 text-yellow-400">
                  <Coins size={10} /> +{totalSellValue}
                </span>
              )}
            </button>
          </motion.div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveFilter(tab.id)}
                className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all"
                style={{
                  background: isActive ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#39FF14' : '#888',
                  border: `1px solid ${isActive ? 'rgba(57,255,20,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {lang === 'ar' ? tab.labelAr : tab.label}
                {tab.count > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: isActive ? '#39FF14' : 'rgba(255,255,255,0.1)',
                      color: isActive ? '#0a0a0a' : '#888',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ overscrollBehavior: 'contain' }}>
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-40">
            <Package size={48} color="#39FF14" />
            <p className="text-white/50 text-sm mt-4 text-center px-8">
              {lang === 'ar'
                ? 'مخزونك فارغ. افتح صناديق للحصول على عناصر!'
                : 'Your inventory is empty. Open chests to get items!'}
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-3 gap-2.5"
          >
            {filteredItems.map((item) => {
              const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.item;
              const isChest = item.type === 'chest';
              const chestImg = isChest ? CHEST_IMAGES[item.tier || 'bronze'] : null;

              const isSelected = selectedIds.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  variants={cardPop}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(item.id);
                    } else if (!item.used) {
                      setSelectedItem(item);
                    }
                  }}
                  className="relative rounded-2xl p-3 border flex flex-col items-center text-center overflow-hidden cursor-pointer"
                  style={{
                    background: item.used
                      ? 'rgba(255,255,255,0.02)'
                      : 'rgba(255,255,255,0.04)',
                    borderColor: item.used
                      ? 'rgba(255,255,255,0.04)'
                      : `${config.color}20`,
                    opacity: item.used ? 0.5 : 1,
                  }}
                >
                  {/* Selection indicator */}
                  {selectMode && (
                    <div
                      className="absolute top-2 left-2 z-20 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all"
                      style={{
                        background: isSelected ? '#39FF14' : 'rgba(255,255,255,0.05)',
                        borderColor: isSelected ? '#39FF14' : 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                    </div>
                  )}

                  {/* Subtle glow for unused items */}
                  {!item.used && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at 50% 30%, ${config.color}08, transparent 70%)`,
                      }}
                    />
                  )}

                  {/* Item icon/image */}
                  <div className="relative z-10 w-12 h-12 mb-2 flex items-center justify-center">
                    {chestImg ? (
                      <img
                        src={chestImg}
                        alt={item.name}
                        className="w-12 h-12 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : item.icon ? (
                      <span className="text-3xl">{item.icon}</span>
                    ) : (
                      <config.icon size={28} color={config.color} style={{ opacity: 0.7 }} />
                    )}
                  </div>

                  {/* Item name */}
                  <p className="relative z-10 text-white text-[11px] font-medium leading-tight truncate w-full">
                    {item.name}
                  </p>

                  {/* Type badge */}
                  <span
                    className="relative z-10 mt-1.5 text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{
                      background: `${config.color}15`,
                      color: config.color,
                    }}
                  >
                    {lang === 'ar' ? config.labelAr : config.label}
                  </span>

                  {/* Used badge */}
                  {item.used && (
                    <div
                      className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.1)', color: '#888' }}
                    >
                      {lang === 'ar' ? 'مستخدم' : 'Used'}
                    </div>
                  )}

                  {/* Equipped badge */}
                  {item.equipped && !item.used && (
                    <div
                      className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(57,255,20,0.15)', color: '#39FF14' }}
                    >
                      <Sparkles size={8} className="inline mr-0.5" />
                      {lang === 'ar' ? 'مُجهز' : 'Equipped'}
                    </div>
                  )}

                  {/* Non-tradeable badge — vouchers are sendable now, skip the badge for them */}
                  {item.tradeable === false && item.type !== 'voucher' && !item.used && !item.equipped && (
                    <div
                      className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.08)', color: '#888' }}
                    >
                      {lang === 'ar' ? 'غير قابل للتداول' : 'Bound'}
                    </div>
                  )}

                  {/* Chest open indicator */}
                  {isChest && !item.used && (
                    <div className="relative z-10 mt-1.5 flex items-center gap-0.5">
                      <ChevronRight size={10} color={config.color} />
                      <span className="text-[9px]" style={{ color: config.color }}>
                        {lang === 'ar' ? 'اضغط لفتح' : 'Tap to open'}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Item Action Modal */}
      <AnimatePresence>
        {selectedItem && !openingChest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 border"
              style={{
                background: 'rgba(10,10,10,0.95)',
                backdropFilter: 'blur(20px)',
                borderColor: `${TYPE_CONFIG[selectedItem.type]?.color || '#39FF14'}30`,
              }}
            >
              {/* Item preview */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  {selectedItem.type === 'chest' && selectedItem.tier ? (
                    <img
                      src={CHEST_IMAGES[selectedItem.tier] || CHEST_IMAGES.bronze}
                      alt={selectedItem.name}
                      className="w-16 h-16 object-contain"
                    />
                  ) : selectedItem.icon ? (
                    <span className="text-4xl">{selectedItem.icon}</span>
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center"
                      style={{ background: `${TYPE_CONFIG[selectedItem.type]?.color}20` }}
                    >
                      {(() => {
                        const Icon = TYPE_CONFIG[selectedItem.type]?.icon || Package;
                        return <Icon size={32} color={TYPE_CONFIG[selectedItem.type]?.color} />;
                      })()}
                    </div>
                  )}
                </div>
                <h3 className="text-white text-lg font-bold">{selectedItem.name}</h3>
                <p className="text-white/50 text-sm capitalize">
                  {TYPE_CONFIG[selectedItem.type]?.label || 'Item'}
                  {selectedItem.rarity && ` • ${selectedItem.rarity}`}
                </p>
                {selectedItem.sentBy && (
                  <p className="text-purple-400 text-xs mt-1">
                    <Gift size={12} className="inline mr-1" />
                    {lang === 'ar' ? `هدية من ${selectedItem.sentBy}` : `Gift from ${selectedItem.sentBy}`}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-3">
                {/* Use/Open button */}
                {selectedItem.type === 'chest' && !selectedItem.used && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleOpenChest(selectedItem)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #FFB800, #FF8C00)' }}
                  >
                    <Package size={18} />
                    {lang === 'ar' ? 'فتح الصندوق' : 'Open Chest'}
                  </motion.button>
                )}

                {(selectedItem.type === 'consumable' || selectedItem.type === 'voucher') && !selectedItem.used && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleUseItem(selectedItem)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-black"
                    style={{ background: 'linear-gradient(135deg, #39FF14, #00E600)' }}
                  >
                    {selectedItem.type === 'voucher' ? <Gift size={18} /> : <Zap size={18} />}
                    {selectedItem.type === 'voucher'
                      ? (lang === 'ar' ? 'استبدال عند الكاشير' : 'Redeem at Desk')
                      : (lang === 'ar' ? 'استخدام' : 'Use')}
                  </motion.button>
                )}

                {/* Send to friend — vouchers are always sendable, others need tradeable. */}
                {!selectedItem.used && (selectedItem.tradeable !== false || selectedItem.type === 'voucher') && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowSendModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold"
                  >
                    <Send size={18} />
                    {lang === 'ar' ? 'إرسال لصديق' : 'Send to Friend'}
                  </motion.button>
                )}

                {/* Non-tradeable notice — only for truly locked items (skins, etc.) */}
                {selectedItem.tradeable === false && selectedItem.type !== 'voucher' && (
                  <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm">
                    <Package size={16} />
                    {lang === 'ar' ? 'عنصر غير قابل للتداول' : 'Non-tradeable item'}
                  </div>
                )}

                {/* Close */}
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-bold"
                >
                  {lang === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Item Modal */}
      <AnimatePresence>
        {showSendModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSendModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 border bg-black/95 backdrop-blur-20"
              style={{ borderColor: 'rgba(59,130,246,0.3)' }}
            >
              <h3 className="text-white text-lg font-bold text-center mb-6">
                <Send className="inline mr-2" size={20} />
                {lang === 'ar' ? 'إرسال عنصر' : 'Send Item'}
              </h3>

              {/* Friends list */}
              {friends.length > 0 && (
                <div className="mb-4">
                  <p className="text-white/50 text-sm mb-2">{lang === 'ar' ? 'أصدقاؤك:' : 'Your Friends:'}</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {friends.map((friend) => (
                      <button
                        key={friend.uid}
                        onClick={() => setSendToUsername(friend.username)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <Users size={16} className="text-blue-400" />
                        <span className="text-white text-sm">{friend.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual username input */}
              <div className="mb-4">
                <label className="block text-white/50 text-sm mb-2">
                  {lang === 'ar' ? 'اسم اللاعب:' : 'Player Username:'}
                </label>
                <input
                  type="text"
                  value={sendToUsername}
                  onChange={(e) => setSendToUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500/50 outline-none"
                  placeholder={lang === 'ar' ? 'أدخل اسم اللاعب' : 'Enter username'}
                  autoFocus
                />
              </div>

              {sendError && (
                <p className="text-red-400 text-sm mb-4 text-center">{sendError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-bold"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendItem}
                  disabled={!sendToUsername.trim() || sendLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
                >
                  {sendLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  {lang === 'ar' ? 'إرسال' : 'Send'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chest Opening Modal */}
      <AnimatePresence>
        {openingChest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-center"
            >
              {!chestReward ? (
                // Opening animation
                <div>
                  <motion.div
                    animate={{ 
                      rotate: [-5, 5, -5, 5, 0],
                      scale: [1, 1.1, 1, 1.1, 1.2]
                    }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-24 h-24 mx-auto mb-6"
                  >
                    <img
                      src={CHEST_IMAGES[openingChest.tier || 'bronze']}
                      alt="Opening chest"
                      className="w-full h-full object-contain"
                    />
                  </motion.div>
                  <p className="text-white text-lg font-bold">
                    {lang === 'ar' ? 'جاري فتح الصندوق...' : 'Opening chest...'}
                  </p>
                </div>
              ) : (
                // Reward reveal
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <div
                    className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center text-4xl"
                    style={{
                      background: `${chestReward.rarity === 'legendary' ? '#FF6F00' : '#39FF14'}20`,
                      border: `2px solid ${chestReward.rarity === 'legendary' ? '#FF6F00' : '#39FF14'}`,
                    }}
                  >
                    {chestReward.type === 'coins' ? '🪙' : '🎁'}
                  </div>
                  <h3 className="text-2xl font-bold mb-2" style={{ 
                    color: chestReward.rarity === 'legendary' ? '#FF6F00' : '#39FF14' 
                  }}>
                    {chestReward.name}
                  </h3>
                  <p className="text-white/60">
                    {lang === 'ar' ? 'مبروك!' : 'Congratulations!'}
                  </p>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
