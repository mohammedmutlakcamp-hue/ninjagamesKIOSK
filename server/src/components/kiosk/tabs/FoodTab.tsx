'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, query, where, orderBy, limit } from 'firebase/firestore';
import { MenuItem } from '@/types';
import { trackDailyTask } from '@/lib/daily-tasks';
import { VIP_CONFIG } from '@/lib/constants';
import { notifyAdmin } from '@/lib/notify-admin';
import { findBundleRuleWithFallback, getBundleSuggestions, type BundleRule } from '@/lib/bundles';
import {
  Coffee, Sandwich, Cookie, ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle2,
  UtensilsCrossed, Coins, Clock, X, ChefHat, Loader2, Sparkles, ArrowRight
} from 'lucide-react';

interface Props {
  player: any;
}

interface ActiveOrder {
  id: string;
  items: { name: string; quantity: number; price: number }[];
  status: string;
  totalCoins: number;
  createdAt: number;
}

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; color: string; desc: string; descAr: string }> = {
  pending:   { label: 'WAITING',   labelAr: 'في الانتظار', color: '#facc15', desc: 'Waiting for kitchen...', descAr: 'بانتظار المطبخ...' },
  preparing: { label: 'PREPARING', labelAr: 'قيد التحضير', color: '#FF6F00', desc: 'Being prepared!', descAr: 'جاري التحضير!' },
  ready:     { label: 'READY!',    labelAr: 'جاهز!',       color: '#39FF14', desc: 'Pick up your order!', descAr: 'استلم طلبك!' },
};

export function FoodTab({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState<'all' | 'drinks' | 'snacks' | 'food'>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);

  // Bundle suggestion popup
  const [bundlePopup, setBundlePopup] = useState<{
    rule: BundleRule;
    suggestions: { id: string; name: string; price: number; image?: string }[];
    triggerItemName: string;
  } | null>(null);
  // Track which triggers have already been shown this session to avoid repeats
  const [shownTriggers, setShownTriggers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menu'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)).filter(i => i.available));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!player?.uid) return;
    const q = query(collection(db, 'orders'), where('playerId', '==', player.uid), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActiveOrder));
      setActiveOrders(orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)));
    });
    return () => unsub();
  }, [player?.uid]);

  const filtered = items.filter(i => category === 'all' || i.category === category);

  const addToCart = (id: string) => {
    const item = items.find(i => i.id === id);
    setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

    // Check for bundle suggestions only when first adding (not on quantity increments)
    // and only once per trigger per session
    if (!item) return;
    const currentCart = { ...cart };
    const wasAlreadyInCart = (currentCart[id] || 0) > 0;
    if (wasAlreadyInCart) return;

    const rule = findBundleRuleWithFallback(item.name);
    // Use the specific trigger that matched (first one) as the session key,
    // so each distinct item type only shows its popup once.
    const triggerKey = `${rule.trigger.join('|')}::${item.id}`;
    if (shownTriggers.has(triggerKey)) return;

    const suggestions = getBundleSuggestions(rule, items, Object.keys(currentCart), id);
    if (suggestions.length === 0) return;

    setBundlePopup({ rule, suggestions, triggerItemName: item.name });
    setShownTriggers(prev => { const n = new Set(prev); n.add(triggerKey); return n; });
  };

  const addSuggestionToCart = (suggestionId: string) => {
    setCart(prev => ({ ...prev, [suggestionId]: (prev[suggestionId] || 0) + 1 }));
    // Remove from popup so user sees remaining options
    setBundlePopup(prev => prev ? { ...prev, suggestions: prev.suggestions.filter(s => s.id !== suggestionId) } : null);
  };

  const closeBundlePopup = () => setBundlePopup(null);
  const removeFromCart = (id: string) => setCart(prev => { const n = { ...prev }; if (n[id] > 1) n[id]--; else delete n[id]; return n; });
  const subtotalCoins = Object.entries(cart).reduce((s, [id, qty]) => { const item = items.find(i => i.id === id); return s + (item ? item.price * qty : 0); }, 0);
  const isVip = player.vip?.active && player.vip?.expiresAt > Date.now();
  const vipDiscount = isVip ? Math.floor(subtotalCoins * VIP_CONFIG.cafeDiscountPercent / 100) : 0;
  const totalCoins = subtotalCoins - vipDiscount;
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const placeOrder = async () => {
    const currentlyVip = player.vip?.active && (player.vip?.expiresAt || 0) > Date.now();
    const actualDiscount = currentlyVip ? Math.floor(subtotalCoins * VIP_CONFIG.cafeDiscountPercent / 100) : 0;
    const actualTotal = subtotalCoins - actualDiscount;
    if (actualTotal > (player.coins || 0) || cartCount === 0) return;
    setOrdering(true);
    try {
      const orderItems = Object.entries(cart).map(([id, qty]) => {
        const item = items.find(i => i.id === id)!;
        return { menuItemId: id, name: item.name, quantity: qty, price: item.price };
      });
      // Default prep time: 3 min for drinks, 12 min for everything else.
      // Use the MAX across cart items so the countdown reflects the slowest item.
      const defaultPrepFor = (cat: string) => cat === 'drinks' ? 3 : 12;
      const prepTime = Math.max(
        ...Object.keys(cart).map(id => {
          const item = items.find(i => i.id === id);
          if (!item) return 12;
          // Use menu item's explicit preparationTime if set, otherwise category default
          return (item.preparationTime && item.preparationTime > 0) ? item.preparationTime : defaultPrepFor(item.category);
        })
      );
      await addDoc(collection(db, 'orders'), {
        playerId: player.uid, playerName: player.username, pcId: 'kiosk',
        items: orderItems, totalCoins: actualTotal, prepTime, status: 'pending', createdAt: Date.now(), updatedAt: Date.now(),
      });
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-actualTotal), totalCoinsSpent: increment(actualTotal), 'stats.foodOrdered': increment(cartCount),
      });
      trackDailyTask(player.uid, 'order_food');
      notifyAdmin('order', 'New Food Order', `${player.username} ordered ${cartCount} item${cartCount > 1 ? 's' : ''} (${actualTotal} coins)`);
      setCart({});
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 3000);
    } catch (err) { console.error('Order failed:', err); }
    setOrdering(false);
  };

  const catIcon = (cat: string, size = 14) => {
    if (cat === 'drinks') return <Coffee size={size} />;
    if (cat === 'snacks') return <Cookie size={size} />;
    return <Sandwich size={size} />;
  };

  const renderCard = (item: any, i: number) => {
    const inCart = cart[item.id] || 0;
    const hasImage = item.image && item.image !== '';
    const selected = inCart > 0;

    return (
      <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
        className="relative rounded-xl overflow-hidden cursor-pointer group transition-all"
        style={{
          border: selected ? '2px solid rgba(57,255,20,0.4)' : '2px solid rgba(255,255,255,0.04)',
          boxShadow: selected ? '0 0 20px rgba(57,255,20,0.1)' : 'none',
        }}
        onClick={() => !selected && addToCart(item.id)}>

        {/* Square image */}
        <div className="w-full aspect-square relative overflow-hidden" style={{ background: '#0c0c10' }}>
          {hasImage ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-700">
              {catIcon(item.category, 36)}
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.8) 100%)' }} />

          {/* Price badge */}
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
            <Coins size={8} className="text-[#39FF14]" />
            <span className="font-ninja text-[10px] text-[#39FF14]">{item.price}</span>
          </div>

          {/* Prep time */}
          {item.preparationTime > 0 && (
            <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1 py-0.5 rounded"
              style={{ background: 'rgba(0,0,0,0.75)' }}>
              <Clock size={7} className="text-gray-400" />
              <span className="font-body text-[7px] text-gray-400">{item.preparationTime}m</span>
            </div>
          )}

          {/* Selected overlay */}
          {selected && (
            <div className="absolute inset-0 bg-[#39FF14]/10 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-[#39FF14] flex items-center justify-center">
                <CheckCircle2 size={12} className="text-black" />
              </div>
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="px-1.5 py-1.5 flex items-center justify-between gap-1" style={{ background: selected ? 'rgba(57,255,20,0.04)' : 'rgba(255,255,255,0.02)' }}>
          <div className="min-w-0 flex-1">
            <p className="font-ninja text-[9px] text-white truncate leading-tight">{item.name}</p>
            {item.nameAr && <p className="font-body text-[7px] text-gray-600 truncate leading-tight" dir="rtl">{item.nameAr}</p>}
          </div>

          {inCart > 0 ? (
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                className="w-4 h-4 rounded flex items-center justify-center text-red-400"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Minus size={8} />
              </button>
              <span className="font-ninja text-[10px] text-white w-3 text-center">{inCart}</span>
              <button onClick={(e) => { e.stopPropagation(); addToCart(item.id); }}
                className="w-4 h-4 rounded flex items-center justify-center text-[#39FF14]"
                style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)' }}>
                <Plus size={8} />
              </button>
            </div>
          ) : (
            <div className="w-5 h-5 rounded flex items-center justify-center text-gray-600 shrink-0 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/30 transition-all"
              style={{ border: '1.5px solid rgba(255,255,255,0.08)' }}>
              <Plus size={10} />
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  const renderSection = (title: string, sectionItems: any[], color: string) => {
    if (sectionItems.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-1.5 h-4 rounded-full" style={{ background: color }} />
          <h3 className="font-ninja text-xs tracking-widest" style={{ color }}>{title}</h3>
          <span className="font-body text-[9px] text-gray-700">{sectionItems.length}</span>
          <div className="flex-1 h-px ml-1" style={{ background: `${color}20` }} />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {sectionItems.map((item, i) => renderCard(item, i))}
        </div>
      </div>
    );
  };

  const drinkItems = filtered.filter(i => i.category === 'drinks');
  const snackItems = filtered.filter(i => i.category === 'snacks');
  const foodItems = filtered.filter(i => i.category === 'food');

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <div>
          <h2 className="font-ninja text-xl tracking-wider text-[#39FF14] flex items-center gap-2">
            <UtensilsCrossed size={20} /> {ar ? 'مطبخ النينجا' : 'NINJA KITCHEN'}
          </h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.15)' }}>
          <Coins size={13} className="text-[#39FF14]" />
          <span className="font-ninja text-sm text-[#39FF14]">{Math.floor(player.coins).toLocaleString()}</span>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex gap-1.5 px-5 pb-3 shrink-0">
        {([
          { id: 'all' as const, label: ar ? 'الكل' : 'All', icon: <UtensilsCrossed size={11} /> },
          { id: 'food' as const, label: ar ? 'طعام' : 'Food', icon: <Sandwich size={11} /> },
          { id: 'drinks' as const, label: ar ? 'مشروبات' : 'Drinks', icon: <Coffee size={11} /> },
          { id: 'snacks' as const, label: ar ? 'سناكات' : 'Snacks', icon: <Cookie size={11} /> },
        ]).map(cat => {
          const active = category === cat.id;
          return (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full font-ninja text-[10px] tracking-wider transition-all"
              style={{
                background: active ? '#39FF14' : 'transparent',
                border: `1.5px solid ${active ? '#39FF14' : 'rgba(57,255,20,0.15)'}`,
                color: active ? '#000' : 'rgba(57,255,20,0.5)',
              }}>
              {cat.icon} {cat.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {category === 'all' ? (
            <>
              {renderSection(ar ? 'الطعام والسندويشات' : 'FOOD & SANDWICHES', foodItems, '#ef4444')}
              {renderSection(ar ? 'المشروبات' : 'DRINKS', drinkItems, '#3b82f6')}
              {renderSection(ar ? 'السناكات' : 'SNACKS', snackItems, '#f59e0b')}
            </>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {filtered.map((item, i) => renderCard(item, i))}
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="w-52 shrink-0 border-l border-white/5 flex flex-col overflow-hidden"
              style={{ background: 'rgba(10,10,14,0.8)' }}>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
                <ShoppingCart size={14} className="text-[#FF6F00]" />
                <span className="font-ninja text-xs text-white">{ar ? 'الطلب' : 'ORDER'}</span>
                <span className="ml-auto text-[9px] text-black px-1.5 py-0.5 rounded-full font-ninja" style={{ background: '#FF6F00' }}>{cartCount}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5">
                {Object.entries(cart).map(([id, qty]) => {
                  const item = items.find(i => i.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      {(item as any).image && <img src={(item as any).image} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-[9px] text-white truncate">{item.name}</p>
                        <p className="font-body text-[8px] text-yellow-400">{item.price * qty} <Coins size={6} className="inline" /></p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => removeFromCart(id)} className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-red-400"><Minus size={8} /></button>
                        <span className="font-ninja text-[9px] text-white w-3 text-center">{qty}</span>
                        <button onClick={() => addToCart(id)} className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-[#39FF14]"><Plus size={8} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-2.5 border-t border-white/5 space-y-1.5">
                {isVip && vipDiscount > 0 && (
                  <div className="flex justify-between text-[9px]">
                    <span className="text-yellow-400 font-body">VIP -{VIP_CONFIG.cafeDiscountPercent}%</span>
                    <span className="text-yellow-400 font-body">-{vipDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="font-body text-[10px] text-gray-400">{ar ? 'الإجمالي' : 'Total'}</span>
                  <span className="font-ninja text-sm text-yellow-400 flex items-center gap-0.5"><Coins size={11} /> {totalCoins}</span>
                </div>
                {totalCoins > player.coins && <p className="text-red-400 text-[9px] font-body">{ar ? 'عملات غير كافية' : 'Not enough coins'}</p>}
                <button onClick={placeOrder} disabled={ordering || totalCoins > player.coins}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-ninja text-[10px] transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #FF6F00, #FF4500)', color: '#fff' }}>
                  {ordering ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {ordering ? (ar ? 'جاري الطلب...' : 'ORDERING...') : (ar ? 'إرسال الطلب' : 'PLACE ORDER')}
                </button>
                <button onClick={() => setCart({})}
                  className="w-full flex items-center justify-center gap-1 py-1 text-red-400/50 hover:text-red-400 font-body text-[8px]">
                  <Trash2 size={8} /> {ar ? 'مسح' : 'Clear'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active orders */}
      <AnimatePresence>
        {activeOrders.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 z-[180] w-[200px] rounded-xl overflow-hidden"
            style={{ background: 'rgba(12,12,16,0.97)', border: '1px solid rgba(255,111,0,0.2)', backdropFilter: 'blur(20px)' }}>
            {activeOrders.map(order => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              return (
                <div key={order.id} className="px-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {order.status === 'preparing' ? <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1, repeat: Infinity }}><ChefHat size={11} style={{ color: cfg.color }} /></motion.div>
                     : order.status === 'ready' ? <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}><CheckCircle2 size={11} style={{ color: cfg.color }} /></motion.div>
                     : <Clock size={11} style={{ color: cfg.color }} />}
                    <span className="font-ninja text-[8px]" style={{ color: cfg.color }}>{ar ? cfg.labelAr : cfg.label}</span>
                  </div>
                  {order.items.map((item, idx) => <p key={idx} className="font-body text-[8px] text-gray-500">{item.quantity}x {item.name}</p>)}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-xl px-6 py-3 flex items-center gap-2"
            style={{ background: 'rgba(10,12,16,0.95)', border: '1px solid rgba(57,255,20,0.3)' }}>
            <CheckCircle2 size={18} className="text-[#39FF14]" />
            <span className="font-ninja text-xs text-[#39FF14]">{ar ? 'تم إرسال الطلب!' : 'ORDER PLACED!'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ BUNDLE SUGGESTION POPUP ═══════════ */}
      <AnimatePresence>
        {bundlePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[250] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
            onClick={closeBundlePopup}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="rounded-2xl p-6 w-[480px] max-w-[94%] relative overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #0c1018 0%, #080a10 100%)',
                border: '1px solid rgba(57,255,20,0.25)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 30px rgba(57,255,20,0.1)',
              }}
            >
              {/* Animated gradient accent */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-[2px]"
                animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                style={{
                  background: 'linear-gradient(90deg, transparent, #39FF14, #00C8FF, #FFD700, transparent)',
                  backgroundSize: '200% 100%',
                }}
              />
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
              <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: '2px solid rgba(0,200,255,0.4)', borderRight: '2px solid rgba(0,200,255,0.4)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: '2px solid rgba(0,200,255,0.4)', borderLeft: '2px solid rgba(0,200,255,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.3)' }}
                  >
                    <Sparkles size={20} className="text-[#39FF14]" />
                  </motion.div>
                  <div>
                    <h3 className="font-ninja text-xl tracking-wider text-[#39FF14]">
                      {bundlePopup.rule.title || (ar ? 'أضف المزيد؟' : 'Add more?')}
                    </h3>
                    <p className="font-body text-xs text-gray-400 mt-0.5">
                      {bundlePopup.rule.reason || (ar ? `يتناسب تماماً مع ${bundlePopup.triggerItemName}` : `Goes great with ${bundlePopup.triggerItemName}`)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeBundlePopup}
                  className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all hover:rotate-90"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <X size={18} className="text-gray-400" />
                </button>
              </div>

              {/* Trigger item chip */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)' }}>
                <CheckCircle2 size={14} className="text-[#39FF14]" />
                <p className="font-body text-xs text-gray-300">
                  {ar ? (<>أضفت <span className="font-semibold text-[#39FF14]">{bundlePopup.triggerItemName}</span> — ما رأيك أن تضيف معه:</>) : (<>You added <span className="font-semibold text-[#39FF14]">{bundlePopup.triggerItemName}</span> — how about pairing it with:</>)}
                </p>
              </div>

              {/* Suggestions */}
              {bundlePopup.suggestions.length > 0 ? (
                <div className="space-y-2.5 mb-4">
                  {bundlePopup.suggestions.map((s, i) => (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-3 p-3 rounded-xl relative overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {/* Image */}
                      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {s.image ? (
                          <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-700">
                            <Coffee size={24} />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-ninja text-sm text-white truncate">{s.name}</p>
                        <p className="text-xs text-[#39FF14] flex items-center gap-1 mt-0.5">
                          <Coins size={10} /> {s.price}
                        </p>
                      </div>
                      {/* Add button */}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addSuggestionToCart(s.id)}
                        className="px-4 py-2 rounded-lg font-ninja text-xs tracking-wider flex items-center gap-1.5 relative overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, #39FF14, #2ddb1a)',
                          color: '#000',
                          boxShadow: '0 0 15px rgba(57,255,20,0.3)',
                        }}
                      >
                        <Plus size={14} /> {ar ? 'أضف' : 'ADD'}
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center mb-2">
                  <CheckCircle2 size={24} className="text-[#39FF14] mx-auto mb-2" />
                  <p className="font-body text-sm text-gray-400">{ar ? 'تم إضافة الكل إلى السلة!' : 'All added to your cart!'}</p>
                </div>
              )}

              {/* Actions */}
              <button
                onClick={closeBundlePopup}
                className="w-full py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#888',
                }}
              >
                {bundlePopup.suggestions.length > 0 ? (ar ? 'تخطي' : 'SKIP') : (ar ? 'تم' : 'DONE')} <ArrowRight size={14} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
