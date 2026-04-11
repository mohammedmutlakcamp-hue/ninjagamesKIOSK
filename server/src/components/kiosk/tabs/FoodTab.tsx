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
  UtensilsCrossed, Coins, Clock, X, ChefHat, Package, Loader2, Star, Flame
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  pending:   { label: 'WAITING',    color: '#facc15', bg: 'rgba(250,204,21,0.08)',  description: 'Waiting for kitchen...' },
  preparing: { label: 'PREPARING',  color: '#FF6F00', bg: 'rgba(255,111,0,0.08)',   description: 'Being prepared now!' },
  ready:     { label: 'READY!',     color: '#39FF14', bg: 'rgba(57,255,20,0.08)',   description: 'Pick up your order!' },
  delivered: { label: 'DONE',       color: '#666',    bg: 'rgba(100,100,100,0.05)', description: 'Enjoy!' },
};

export function FoodTab({ player }: Props) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [category, setCategory] = useState<'all' | 'drinks' | 'snacks' | 'food'>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const prevOrderStatuses = useRef<Record<string, string>>({});

  // Load menu
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menu'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)).filter(i => i.available));
    });
    return () => unsub();
  }, []);

  // Listen for active orders + auto-dismiss delivered
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(collection(db, 'orders'), where('playerId', '==', player.uid), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as ActiveOrder));
      const active = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));

      // Check if any order just became 'delivered' — auto-dismiss after 3s
      orders.forEach(o => {
        const prev = prevOrderStatuses.current[o.id];
        if (prev && prev !== 'delivered' && o.status === 'delivered') {
          // Was active, now done — it'll disappear from active list automatically
        }
      });
      const statuses: Record<string, string> = {};
      orders.forEach(o => { statuses[o.id] = o.status; });
      prevOrderStatuses.current = statuses;

      setActiveOrders(active);
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
  const totalJOD = Object.entries(cart).reduce((s, [id, qty]) => { const item = items.find(i => i.id === id); return s + (item ? (item as any).priceJOD * qty : 0); }, 0);
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

  const drinkItems = filtered.filter(i => i.category === 'drinks');
  const snackItems = filtered.filter(i => i.category === 'snacks');
  const foodItems = filtered.filter(i => i.category === 'food');

  const renderItem = (item: any, i: number) => {
    const inCart = cart[item.id] || 0;
    const jod = item.priceJOD || (item.price / 100);
    const hasImage = item.image && item.image !== '';
    const catColor = getCategoryColor(item.category);

    return (
      <motion.div key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
        className="flex items-center gap-4 py-3.5 px-2 border-b border-white/[0.04] last:border-0 group hover:bg-white/[0.02] transition-all rounded-lg">
        {/* Image — rounded square */}
        <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 relative"
          style={{ background: hasImage ? '#111' : `linear-gradient(135deg, ${catColor}15, ${catColor}08)`, border: `1px solid ${catColor}20` }}>
          {hasImage ? (
            <img src={item.image} alt={item.name} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: catColor }}>
              {getCategoryIcon(item.category, 26)}
            </div>
          )}
          {inCart > 0 && (
            <div className="absolute inset-0 bg-ninja-green/30 flex items-center justify-center backdrop-blur-[1px]">
              <span className="font-ninja text-sm text-white">{inCart}x</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-ninja text-base text-white truncate">{item.name}</h4>
            {item.nameAr && (
              <span className="font-body text-[10px] px-2 py-0.5 rounded text-ninja-green" dir="rtl"
                style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)' }}>
                {item.nameAr}
              </span>
            )}
          </div>
          <p className="font-body text-[11px] text-gray-500 truncate">{item.description}</p>
          {item.preparationTime > 0 && (
            <span className="font-ninja text-[10px] text-ninja-green flex items-center gap-1 mt-1">
              <Clock size={9} /> {item.preparationTime} min
            </span>
          )}
        </div>

        {/* Price + Add */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="font-ninja text-lg flex items-center gap-1 justify-end" style={{ color: '#39FF14', textShadow: '0 0 6px rgba(57,255,20,0.3)' }}>
              <Coins size={13} className="text-ninja-green" /> {item.price}
            </p>
            <p className="font-body text-[10px] text-gray-600">{jod.toFixed(1)} JOD</p>
          </div>
          {inCart > 0 ? (
            <div className="flex items-center gap-1">
              <button onClick={() => removeFromCart(item.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/15 transition-all"
                style={{ border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
                <Minus size={14} />
              </button>
              <span className="font-ninja text-sm text-white w-6 text-center">{inCart}</span>
              <button onClick={() => addToCart(item.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ninja-green hover:bg-ninja-green/15 transition-all"
                style={{ border: '1.5px solid rgba(57,255,20,0.3)', background: 'rgba(57,255,20,0.06)' }}>
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <motion.button whileHover={{ scale: 1.1, boxShadow: '0 0 12px rgba(57,255,20,0.3)' }} whileTap={{ scale: 0.9 }}
              onClick={() => addToCart(item.id)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-ninja-green transition-all"
              style={{ border: '2px solid rgba(57,255,20,0.35)', background: 'rgba(57,255,20,0.08)' }}>
              <Plus size={20} />
            </motion.button>
          )}
        </div>
      </motion.div>
    );
  };

  const getCategoryIcon = (cat: string, size = 22) => {
    if (cat === 'drinks') return <Coffee size={size} />;
    if (cat === 'snacks') return <Cookie size={size} />;
    return <Sandwich size={size} />;
  };

  const getCategoryColor = (cat: string) => {
    if (cat === 'drinks') return '#3b82f6';
    if (cat === 'snacks') return '#f59e0b';
    return '#ef4444';
  };

  const renderSection = (title: string, sectionItems: any[], icon: React.ReactNode, color: string) => {
    if (sectionItems.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 py-2"
          style={{ background: 'linear-gradient(180deg, rgba(8,10,16,1) 0%, rgba(8,10,16,0.95) 80%, transparent 100%)' }}>
          <span className="text-lg" style={{ color }}>#</span>
          <h3 className="font-ninja text-lg tracking-wider" style={{ color, textShadow: `0 0 10px ${color}40` }}>{title}</h3>
          <span className="font-body text-[10px] text-gray-600">{sectionItems.length} items</span>
          <div className="flex-1 h-[2px] ml-2" style={{ background: `linear-gradient(90deg, ${color}30, rgba(0,200,255,0.1), transparent)` }} />
        </div>
        {sectionItems.map((item, i) => renderItem(item, i))}
      </div>
    );
  };

  return (
    <div className="relative min-h-full">
      {/* Cyberpunk background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #080a10 0%, #0a0c14 40%, #0c1020 70%, #080a10 100%)' }} />
        <div className="absolute inset-0 pcb-grid-fade" style={{ backgroundImage: 'linear-gradient(rgba(0,255,180,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,180,0.15) 1px, transparent 1px)', backgroundSize: '45px 45px' }} />
        {/* PCB traces */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="none">
          <path d="M0,700 L200,700 L220,680 L500,680 L520,700 L800,700 L820,680 L1200,680" stroke="#00c8ff" strokeWidth="0.8" fill="none" opacity="0.1" />
          <path d="M1200,750 L900,750 L880,730 L600,730 L580,750 L300,750 L280,730 L0,730" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.07" />
          <path d="M500,680 L500,600 L520,580 L520,500" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.06" />
          <path d="M800,700 L800,620 L780,600 L780,520" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.05" />
          <circle cx="500" cy="680" r="2" fill="#00c8ff" opacity="0.1" className="pcb-node-flash" />
          <circle cx="800" cy="700" r="2" fill="#39FF14" opacity="0.08" className="pcb-node-flash2" />
        </svg>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 90%, rgba(0,200,255,0.04) 0%, transparent 50%)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 p-2">
      {/* Header — NINJA KITCHEN */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-ninja text-4xl tracking-wider flex items-center gap-3" style={{ color: '#39FF14', textShadow: '0 0 25px rgba(57,255,20,0.4), 0 0 50px rgba(57,255,20,0.15)' }}>
            <UtensilsCrossed size={32} style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.5))' }} /> NINJA KITCHEN
          </h2>
          <p className="font-body text-gray-500 text-sm mt-1">Order straight to your station</p>
        </div>
        {/* Balance — HUD framed */}
        <div className="relative rounded-lg px-4 py-2.5 flex items-center gap-2"
          style={{ background: 'rgba(57,255,20,0.04)', border: '2px solid rgba(57,255,20,0.2)' }}>
          <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
          <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
          <Coins size={16} className="text-ninja-green" />
          <span className="font-ninja text-lg text-ninja-green" style={{ textShadow: '0 0 8px rgba(57,255,20,0.3)' }}>
            {Math.floor(player.coins).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Category tabs — pill buttons */}
      <div className="flex gap-2 mb-5">
        {([
          { id: 'all' as const, label: 'Full Menu', icon: <UtensilsCrossed size={14} />, color: '#39FF14', filled: false },
          { id: 'food' as const, label: 'Food', icon: <Sandwich size={14} />, color: '#39FF14', filled: true },
          { id: 'drinks' as const, label: 'Drinks', icon: <Coffee size={14} />, color: '#06B6D4', filled: true },
          { id: 'snacks' as const, label: 'Snacks', icon: <Cookie size={14} />, color: '#39FF14', filled: false },
        ]).map(cat => {
          const active = category === cat.id;
          return (
            <motion.button key={cat.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => setCategory(cat.id)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-ninja text-xs tracking-wider transition-all"
              style={{
                background: active ? (cat.filled ? cat.color : 'transparent') : 'transparent',
                border: `2px solid ${active ? cat.color : 'rgba(57,255,20,0.2)'}`,
                color: active ? (cat.filled ? '#000' : cat.color) : 'rgba(57,255,20,0.5)',
                boxShadow: active ? `0 0 12px ${cat.color}30` : 'none',
              }}>
              {cat.icon} {cat.label}
            </motion.button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Menu — list style like real restaurant */}
        <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {category === 'all' ? (
            <>
              {renderSection('FOOD & SANDWICHES', foodItems, <Sandwich size={18} />, '#ef4444')}
              {renderSection('DRINKS', drinkItems, <Coffee size={18} />, '#3b82f6')}
              {renderSection('SNACKS', snackItems, <Cookie size={18} />, '#f59e0b')}
            </>
          ) : (
            <div>
              {filtered.map((item, i) => renderItem(item, i))}
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-center py-20">
              <UtensilsCrossed size={48} className="text-gray-600 mx-auto mb-4" />
              <p className="font-ninja text-xl text-gray-500">No items available</p>
            </div>
          )}
        </div>

        {/* Cart Sidebar */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="w-72 rounded-2xl p-5 h-fit sticky top-4 flex-shrink-0"
              style={{ background: 'linear-gradient(170deg, rgba(20,20,25,0.95) 0%, rgba(8,8,12,0.98) 100%)', border: '1px solid rgba(255,111,0,0.15)' }}>
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart size={18} style={{ color: '#FF6F00' }} />
                <h3 className="font-ninja text-lg text-white">YOUR ORDER</h3>
                <span className="ml-auto text-xs text-black px-2 py-0.5 rounded-full font-ninja" style={{ background: '#FF6F00' }}>{cartCount}</span>
              </div>

              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {Object.entries(cart).map(([id, qty]) => {
                  const item = items.find(i => i.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 bg-black/30 rounded-lg p-2">
                      {(item as any).image && (
                        <img src={(item as any).image} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-white truncate">{item.name}</p>
                        <p className="font-body text-[10px] text-yellow-400 flex items-center gap-0.5">
                          <Coins size={8} /> {item.price * qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => removeFromCart(id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all">
                          <Minus size={11} />
                        </button>
                        <span className="font-ninja text-xs text-white w-5 text-center">{qty}</span>
                        <button onClick={() => addToCart(id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-ninja-green hover:bg-ninja-green/10 transition-all">
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-800 pt-3 mb-3 space-y-1">
                {isVip && vipDiscount > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="font-body text-gray-500 text-xs">Subtotal</span>
                      <span className="font-body text-sm text-gray-500 line-through">{subtotalCoins}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-body text-yellow-400 text-xs flex items-center gap-1">VIP {VIP_CONFIG.cafeDiscountPercent}% OFF</span>
                      <span className="font-body text-sm text-yellow-400">-{vipDiscount}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="font-body text-gray-400 text-sm">Total</span>
                  <span className="font-ninja text-xl text-yellow-400 flex items-center gap-1"><Coins size={16} /> {totalCoins}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-body text-gray-600 text-xs">JOD</span>
                  <span className="font-body text-xs text-gray-500">{totalJOD.toFixed(2)} JOD</span>
                </div>
                {totalCoins > player.coins && <p className="text-red-400 text-xs font-body">Not enough coins</p>}
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={placeOrder} disabled={ordering || totalCoins > player.coins}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-ninja text-sm transition-all"
                style={{ background: 'linear-gradient(135deg, #FF6F00, #FF4500)', color: '#fff', border: 'none' }}>
                {ordering ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {ordering ? 'ORDERING...' : 'PLACE ORDER'}
              </motion.button>

              <button onClick={() => setCart({})}
                className="w-full flex items-center justify-center gap-1 py-2 mt-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-400/5 font-body text-xs transition-all">
                <Trash2 size={11} /> Clear order
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ FLOATING ORDER STATUS — auto-closes when delivered ═══ */}
      <AnimatePresence>
        {activeOrders.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="absolute bottom-6 right-6 z-[180] w-[280px]">
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(15,16,21,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,111,0,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
              {activeOrders.map(order => {
                const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                return (
                  <motion.div key={order.id} layout className="p-3.5 border-b border-white/[0.04] last:border-0">
                    {/* Status row */}
                    <div className="flex items-center gap-2 mb-2">
                      {order.status === 'preparing' ? (
                        <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1, repeat: Infinity }}>
                          <ChefHat size={16} style={{ color: cfg.color }} />
                        </motion.div>
                      ) : order.status === 'ready' ? (
                        <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                          <CheckCircle2 size={16} style={{ color: cfg.color }} />
                        </motion.div>
                      ) : (
                        <Clock size={16} style={{ color: cfg.color }} />
                      )}
                      <span className="font-ninja text-xs tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
                      {order.status === 'preparing' && (
                        <div className="ml-auto flex gap-0.5">
                          {[0, 1, 2].map(j => (
                            <motion.div key={j} animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 0.8, repeat: Infinity, delay: j * 0.2 }}
                              className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="font-body text-[10px] text-gray-500 mb-1.5">{cfg.description}</p>
                    {/* Items summary */}
                    <div className="space-y-0.5">
                      {order.items.map((item, idx) => (
                        <p key={idx} className="font-body text-[11px] text-gray-400">{item.quantity}x {item.name}</p>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order success toast */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[200] rounded-xl px-8 py-4 flex items-center gap-3"
            style={{ background: 'rgba(10,12,16,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,111,0,0.3)', boxShadow: '0 0 30px rgba(255,111,0,0.1)' }}>
            <CheckCircle2 size={24} style={{ color: '#FF6F00' }} />
            <div>
              <p className="font-ninja" style={{ color: '#FF6F00' }}>ORDER PLACED!</p>
              <p className="font-body text-gray-400 text-sm">We'll notify you when it's ready</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </div>
  );
}
