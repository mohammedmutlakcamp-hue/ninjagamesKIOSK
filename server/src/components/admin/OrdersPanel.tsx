'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { FoodOrder, OrderStatus } from '@/types';
import {
  Clock, ChefHat, CheckCircle2, Package, XCircle, User,
  Coins, ClipboardList, ArrowRight, Ban, Bell, Volume2
} from 'lucide-react';

export function OrdersPanel() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [newOrderPopup, setNewOrderPopup] = useState<FoodOrder | null>(null);
  const prevOrderCountRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as FoodOrder));
      setOrders(allOrders);

      // Detect new pending orders
      const pendingOrders = allOrders.filter(o => o.status === 'pending');
      if (pendingOrders.length > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
        // New order came in!
        const newest = pendingOrders[0];
        setNewOrderPopup(newest);
        playNotificationSound();
        // Auto-dismiss after 15 seconds
        setTimeout(() => setNewOrderPopup(prev => prev?.id === newest.id ? null : prev), 15000);
      }
      prevOrderCountRef.current = pendingOrders.length;
    });
    return () => unsub();
  }, []);

  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext();
      // Play a pleasant notification chime
      const playTone = (freq: number, delay: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };
      playTone(880, 0, 0.15);
      playTone(1100, 0.15, 0.15);
      playTone(1320, 0.3, 0.3);
    } catch { /* ignore */ }
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: Date.now() });
    if (newOrderPopup?.id === orderId) setNewOrderPopup(null);
  };

  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
  const pendingOrders = activeOrders.filter(o => o.status === 'pending');
  const preparingOrders = activeOrders.filter(o => o.status === 'preparing');
  const readyOrders = activeOrders.filter(o => o.status === 'ready');
  const completedOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status));

  const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; next?: OrderStatus; nextLabel?: string; nextIcon?: React.ReactNode }> = {
    pending:    { label: 'PENDING',    color: 'text-[#ff9500]',     bg: 'bg-[#ff9500]/5 border-[#ff9500]/15', icon: <Clock size={20} className="text-[#ff9500]" />,         next: 'preparing', nextLabel: 'Accept & Prepare', nextIcon: <ChefHat size={16} /> },
    preparing:  { label: 'PREPARING',  color: 'text-[#ff9500]',     bg: 'bg-[#ff9500]/5 border-[#ff9500]/15', icon: <ChefHat size={20} className="text-[#ff9500]" />,       next: 'ready',     nextLabel: 'Mark Ready',       nextIcon: <CheckCircle2 size={16} /> },
    ready:      { label: 'READY',      color: 'text-[#34c759]',     bg: 'bg-[#34c759]/5 border-[#34c759]/15', icon: <CheckCircle2 size={20} className="text-[#34c759]" />,  next: 'delivered',  nextLabel: 'Mark Delivered',    nextIcon: <Package size={16} /> },
    delivered:  { label: 'DELIVERED',  color: 'text-[#86868b]',     bg: 'bg-[#f5f5f7] border-[#e5e5ea]',      icon: <Package size={18} className="text-[#86868b]" /> },
    cancelled:  { label: 'CANCELLED',  color: 'text-[#ff3b30]',    bg: 'bg-[#ff3b30]/5 border-[#ff3b30]/15', icon: <XCircle size={18} className="text-[#ff3b30]" /> },
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeSince = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const renderOrderCard = (order: FoodOrder, i: number) => {
    const config = statusConfig[order.status];
    return (
      <motion.div key={order.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
        className={`bg-white rounded-2xl p-5 border shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${config.bg}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {config.icon}
            <div>
              <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                <User size={14} className="text-[#0071e3]" /> {order.playerName?.toUpperCase()}
              </p>
              <p className="text-xs text-[#86868b]">
                PC: {order.pcId} · {formatTime(order.createdAt)} · {getTimeSince(order.createdAt)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold ${config.color}`}>{config.label}</p>
            <p className="text-sm text-[#0071e3] flex items-center gap-1 justify-end font-medium">
              <Coins size={12} /> {order.totalCoins}
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-[#f5f5f7] rounded-xl p-3 mb-3">
          {order.items.map((item, j) => (
            <div key={j} className="flex items-center justify-between">
              <p className="text-sm text-[#1d1d1f]">
                {item.quantity}x {item.name}
              </p>
              <span className="text-xs text-[#86868b] flex items-center gap-0.5">
                <Coins size={9} /> {item.price * item.quantity}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {config.next && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => updateStatus(order.id, config.next!)}
              className="flex-1 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#0077ED] transition-colors">
              {config.nextIcon} {config.nextLabel}
            </motion.button>
          )}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button onClick={() => updateStatus(order.id, 'cancelled')}
              className="px-4 py-2.5 text-[#ff3b30] rounded-xl text-sm hover:bg-[#fff5f5] flex items-center gap-1 border border-[#d2d2d7]">
              <Ban size={14} /> Cancel
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Orders</h2>
          <p className="text-[#86868b] text-sm">{activeOrders.length} active orders</p>
        </div>
        {/* Status summary pills */}
        <div className="flex gap-2">
          {pendingOrders.length > 0 && (
            <span className="px-3 py-1 rounded-full bg-[#ff9500]/10 border border-[#ff9500]/20 text-[#ff9500] text-xs font-medium flex items-center gap-1">
              <Clock size={12} /> {pendingOrders.length} Pending
            </span>
          )}
          {preparingOrders.length > 0 && (
            <span className="px-3 py-1 rounded-full bg-[#ff9500]/10 border border-[#ff9500]/20 text-[#ff9500] text-xs font-medium flex items-center gap-1">
              <ChefHat size={12} /> {preparingOrders.length} Preparing
            </span>
          )}
          {readyOrders.length > 0 && (
            <span className="px-3 py-1 rounded-full bg-[#34c759]/10 border border-[#34c759]/20 text-[#34c759] text-xs font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> {readyOrders.length} Ready
            </span>
          )}
        </div>
      </div>

      {/* Active Orders — grouped by status */}
      {activeOrders.length > 0 ? (
        <div className="space-y-6 mb-8">
          {/* Pending orders first — most urgent */}
          {pendingOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  <Bell size={16} className="text-[#ff9500]" />
                </motion.div>
                <h3 className="text-sm font-semibold text-[#ff9500] tracking-wider">NEW ORDERS</h3>
              </div>
              <div className="space-y-3">
                {pendingOrders.map((o, i) => renderOrderCard(o, i))}
              </div>
            </div>
          )}

          {/* Preparing */}
          {preparingOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ChefHat size={16} className="text-[#ff9500]" />
                <h3 className="text-sm font-semibold text-[#ff9500] tracking-wider">PREPARING</h3>
              </div>
              <div className="space-y-3">
                {preparingOrders.map((o, i) => renderOrderCard(o, i))}
              </div>
            </div>
          )}

          {/* Ready */}
          {readyOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-[#34c759]" />
                <h3 className="text-sm font-semibold text-[#34c759] tracking-wider">READY FOR PICKUP</h3>
              </div>
              <div className="space-y-3">
                {readyOrders.map((o, i) => renderOrderCard(o, i))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl mb-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <ClipboardList size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-lg font-semibold text-[#86868b]">No active orders</p>
          <p className="text-[#86868b] text-sm mt-1">New orders will appear here with a notification</p>
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[#86868b] mb-3">Completed</h3>
          <div className="space-y-2">
            {completedOrders.slice(0, 20).map((order) => {
              const config = statusConfig[order.status];
              return (
                <div key={order.id} className="bg-white rounded-xl p-3 flex items-center justify-between opacity-60 border border-[#e5e5ea]/60">
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <div>
                      <p className="text-sm text-[#1d1d1f]">
                        {order.playerName} — {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </p>
                      <p className="text-xs text-[#86868b]">{new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* NEW ORDER POPUP NOTIFICATION */}
      <AnimatePresence>
        {newOrderPopup && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed top-6 right-6 z-[300] w-[380px]"
          >
            <div className="bg-white rounded-2xl p-5 relative overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#ff9500]/30">
              {/* Pulsing border */}
              <motion.div className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ border: '2px solid rgba(255, 149, 0, 0.4)' }}
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }} />

              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.5, repeat: 3 }}>
                    <Bell size={20} className="text-[#ff9500]" />
                  </motion.div>
                  <span className="text-lg font-semibold text-[#ff9500] tracking-wider">New Order!</span>
                </div>
                <button onClick={() => setNewOrderPopup(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f5f5f7] text-[#86868b]">
                  <XCircle size={18} />
                </button>
              </div>

              {/* Order info */}
              <div className="bg-[#f5f5f7] rounded-xl p-3 mb-3">
                <p className="font-semibold text-[#1d1d1f] flex items-center gap-1.5 mb-1">
                  <User size={14} className="text-[#0071e3]" /> {newOrderPopup.playerName?.toUpperCase()}
                </p>
                {newOrderPopup.items.map((item, j) => (
                  <p key={j} className="text-sm text-[#1d1d1f]">{item.quantity}x {item.name}</p>
                ))}
                <p className="text-sm text-[#ff9500] mt-2 flex items-center gap-1 font-semibold">
                  <Coins size={12} /> {newOrderPopup.totalCoins} tokens
                </p>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => updateStatus(newOrderPopup.id, 'preparing')}
                  className="flex-1 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#0077ED]">
                  <ChefHat size={16} /> Accept & Prepare
                </motion.button>
                <button onClick={() => { updateStatus(newOrderPopup.id, 'cancelled'); setNewOrderPopup(null); }}
                  className="px-4 py-2.5 text-[#ff3b30] rounded-xl text-sm hover:bg-[#fff5f5] border border-[#d2d2d7]">
                  <Ban size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
