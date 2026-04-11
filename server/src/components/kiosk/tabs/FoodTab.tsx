'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, query, where, orderBy, limit } from 'firebase/firestore';
import { MenuItem } from '@/types';
import { trackDailyTask } from '@/lib/daily-tasks';
import { VIP_CONFIG } from '@/lib/constants';
import { notifyAdmin } from '@/lib/notify-admin';
import {
  Coffee, Sandwich, Cookie, ShoppingCart, Plus, Minus, Trash2, Send, CheckCircle2,
  UtensilsCrossed, Coins, Clock, X, ChefHat, Loader2
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

const STATUS_CONFIG: Record<string, { label: string; color: string; desc: string }> = {
  pending:   { label: 'WAITING',   color: '#facc15', desc: 'Waiting for kitchen...' },
  preparing: { label: 'PREPARING', color: '#FF6F00', desc: 'Being prepared!' },
  ready:     { label: 'READY!',    color: '#39FF14', desc: 'Pick up your order!' },
};

export function FoodTab({ player }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState<'all' | 'drinks' | 'snacks' | 'food'>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);

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
  const addToCart = (id: string) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
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
      await addDoc(collection(db, 'orders'), {
        playerId: player.uid, playerName: player.username, pcId: 'kiosk',
        items: orderItems, totalCoins: actualTotal, status: 'pending', createdAt: Date.now(), updatedAt: Date.now(),
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

        {/* Big image */}
        <div className="w-full h-32 relative overflow-hidden" style={{ background: '#0c0c10' }}>
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
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <Coins size={10} className="text-[#39FF14]" />
            <span className="font-ninja text-xs text-[#39FF14]">{item.price}</span>
          </div>

          {/* Prep time */}
          {item.preparationTime > 0 && (
            <div className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(0,0,0,0.7)' }}>
              <Clock size={8} className="text-gray-400" />
              <span className="font-body text-[8px] text-gray-400">{item.preparationTime}m</span>
            </div>
          )}

          {/* Selected overlay */}
          {selected && (
            <div className="absolute inset-0 bg-[#39FF14]/10 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-[#39FF14] flex items-center justify-center">
                <CheckCircle2 size={16} className="text-black" />
              </div>
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: selected ? 'rgba(57,255,20,0.04)' : 'rgba(255,255,255,0.02)' }}>
          <div className="min-w-0 flex-1">
            <p className="font-ninja text-[11px] text-white truncate">{item.name}</p>
            {item.nameAr && <p className="font-body text-[8px] text-gray-600 truncate" dir="rtl">{item.nameAr}</p>}
          </div>

          {inCart > 0 ? (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                className="w-6 h-6 rounded flex items-center justify-center text-red-400"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <Minus size={10} />
              </button>
              <span className="font-ninja text-xs text-white w-4 text-center">{inCart}</span>
              <button onClick={(e) => { e.stopPropagation(); addToCart(item.id); }}
                className="w-6 h-6 rounded flex items-center justify-center text-[#39FF14]"
                style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)' }}>
                <Plus size={10} />
              </button>
            </div>
          ) : (
            <div className="w-6 h-6 rounded flex items-center justify-center text-gray-600 shrink-0 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/30 transition-all"
              style={{ border: '1.5px solid rgba(255,255,255,0.08)' }}>
              <Plus size={12} />
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
        <div className="grid grid-cols-3 gap-3">
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
            <UtensilsCrossed size={20} /> NINJA KITCHEN
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
          { id: 'all' as const, label: 'All', icon: <UtensilsCrossed size={11} /> },
          { id: 'food' as const, label: 'Food', icon: <Sandwich size={11} /> },
          { id: 'drinks' as const, label: 'Drinks', icon: <Coffee size={11} /> },
          { id: 'snacks' as const, label: 'Snacks', icon: <Cookie size={11} /> },
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
              {renderSection('FOOD & SANDWICHES', foodItems, '#ef4444')}
              {renderSection('DRINKS', drinkItems, '#3b82f6')}
              {renderSection('SNACKS', snackItems, '#f59e0b')}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-3">
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
                <span className="font-ninja text-xs text-white">ORDER</span>
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
                  <span className="font-body text-[10px] text-gray-400">Total</span>
                  <span className="font-ninja text-sm text-yellow-400 flex items-center gap-0.5"><Coins size={11} /> {totalCoins}</span>
                </div>
                {totalCoins > player.coins && <p className="text-red-400 text-[9px] font-body">Not enough coins</p>}
                <button onClick={placeOrder} disabled={ordering || totalCoins > player.coins}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-ninja text-[10px] transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #FF6F00, #FF4500)', color: '#fff' }}>
                  {ordering ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {ordering ? 'ORDERING...' : 'PLACE ORDER'}
                </button>
                <button onClick={() => setCart({})}
                  className="w-full flex items-center justify-center gap-1 py-1 text-red-400/50 hover:text-red-400 font-body text-[8px]">
                  <Trash2 size={8} /> Clear
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
                    <span className="font-ninja text-[8px]" style={{ color: cfg.color }}>{cfg.label}</span>
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
            <span className="font-ninja text-xs text-[#39FF14]">ORDER PLACED!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
