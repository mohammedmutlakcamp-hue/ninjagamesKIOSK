'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Wind, Loader2, CheckCircle2, Clock, Send, Coins } from 'lucide-react';
import { notifyAdmin } from '@/lib/notify-admin';

interface Props {
  player: any;
}

interface ShishaFlavor {
  id: string;
  name: string;
  icon: string;
  color: string;
  price: number;
  popular?: boolean;
}

const SHISHA_FLAVORS: ShishaFlavor[] = [
  { id: 'grape', name: 'Grape', icon: '🍇', color: '#8B5CF6', price: 50, popular: true },
  { id: 'mint', name: 'Mint', icon: '🌿', color: '#10B981', price: 50 },
  { id: 'double-apple', name: 'Double Apple', icon: '🍎', color: '#EF4444', price: 50, popular: true },
  { id: 'watermelon', name: 'Watermelon', icon: '🍉', color: '#F472B6', price: 50 },
  { id: 'blueberry', name: 'Blueberry', icon: '🫐', color: '#6366F1', price: 50 },
  { id: 'peach', name: 'Peach', icon: '🍑', color: '#FB923C', price: 50 },
  { id: 'lemon-mint', name: 'Lemon Mint', icon: '🍋', color: '#FACC15', price: 50 },
  { id: 'strawberry', name: 'Strawberry', icon: '🍓', color: '#F43F5E', price: 50 },
  { id: 'mango', name: 'Mango', icon: '🥭', color: '#F59E0B', price: 50 },
  { id: 'mixed-fruits', name: 'Mixed Fruits', icon: '🍹', color: '#EC4899', price: 60, popular: true },
  { id: 'rose', name: 'Rose', icon: '🌹', color: '#FB7185', price: 55 },
  { id: 'gum', name: 'Gum', icon: '🫧', color: '#38BDF8', price: 50 },
];

interface ActiveOrder {
  id: string;
  flavor: string;
  flavorName: string;
  status: string;
  createdAt: number;
  price: number;
}

export function HubblyTab({ player }: Props) {
  const [selectedFlavor, setSelectedFlavor] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);

  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'shisha-orders'),
      where('playerId', '==', player.uid),
      where('status', 'in', ['pending', 'preparing']),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActiveOrder)));
    });
    return () => unsub();
  }, [player?.uid]);

  const handleOrder = async () => {
    if (!selectedFlavor || ordering) return;
    const flavor = SHISHA_FLAVORS.find(f => f.id === selectedFlavor);
    if (!flavor) return;
    setOrdering(true);
    try {
      await addDoc(collection(db, 'shisha-orders'), {
        playerId: player.uid,
        playerName: player.username,
        flavor: flavor.id,
        flavorName: flavor.name,
        price: flavor.price,
        status: 'pending',
        createdAt: Date.now(),
      });
      notifyAdmin('shisha_order', 'Shisha Order', `${player.username} ordered ${flavor.name}`);
      setOrderSent(true);
      setTimeout(() => { setOrderSent(false); setSelectedFlavor(null); }, 2000);
    } catch (err) {
      console.error('Shisha order failed:', err);
    }
    setOrdering(false);
  };

  const selected = SHISHA_FLAVORS.find(f => f.id === selectedFlavor);

  return (
    <div className="relative w-full h-full overflow-y-auto">
      <div className="max-w-[650px] mx-auto p-5 pb-8">

        {/* Header */}
        <div className="text-center pt-2 pb-4">
          <span className="text-4xl block mb-2">💨</span>
          <h1 className="font-ninja text-xl tracking-wider" style={{ color: '#06B6D4' }}>HUBBLY BUBBLY</h1>
          <p className="font-body text-[10px] text-gray-600 mt-0.5">Pick a flavor, we bring it to you</p>
        </div>

        {/* Active orders */}
        {activeOrders.length > 0 && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <p className="font-ninja text-[10px] text-cyan-400 mb-2">ACTIVE ORDERS</p>
            {activeOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-1">
                <span className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                  {SHISHA_FLAVORS.find(f => f.id === order.flavor)?.icon || '💨'} {order.flavorName}
                </span>
                <span className="font-ninja text-[9px] px-2 py-0.5 rounded" style={{
                  background: order.status === 'pending' ? 'rgba(250,204,21,0.1)' : 'rgba(255,111,0,0.1)',
                  color: order.status === 'pending' ? '#facc15' : '#FF6F00',
                }}>{order.status === 'pending' ? 'WAITING' : 'PREPARING'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Success */}
        <AnimatePresence>
          {orderSent && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)' }}>
              <CheckCircle2 size={16} className="text-[#39FF14]" />
              <p className="font-body text-xs text-[#39FF14]">Order sent! Staff will bring it to your PC.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Flavor grid — radio button style like TopUp */}
        <div className="space-y-2 mb-5">
          {SHISHA_FLAVORS.map((flavor, i) => {
            const isSelected = selectedFlavor === flavor.id;
            return (
              <motion.div key={flavor.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedFlavor(isSelected ? null : flavor.id)}
                className="relative rounded-xl p-3.5 cursor-pointer transition-all flex items-center gap-3"
                style={{
                  background: isSelected ? `${flavor.color}10` : 'rgba(255,255,255,0.015)',
                  border: isSelected ? `1.5px solid ${flavor.color}50` : '1.5px solid rgba(255,255,255,0.04)',
                  boxShadow: isSelected ? `0 0 15px ${flavor.color}15` : 'none',
                }}>
                {/* Radio dot */}
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                  style={{
                    border: isSelected ? `2px solid ${flavor.color}` : '2px solid rgba(255,255,255,0.1)',
                    background: isSelected ? `${flavor.color}15` : 'transparent',
                  }}>
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: flavor.color }} />}
                </div>

                {/* Emoji */}
                <span className="text-2xl">{flavor.icon}</span>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-ninja text-xs tracking-wider" style={{ color: isSelected ? flavor.color : '#ccc' }}>
                    {flavor.name.toUpperCase()}
                  </p>
                </div>

                {/* Popular badge */}
                {flavor.popular && (
                  <span className="font-ninja text-[7px] px-1.5 py-0.5 rounded tracking-wider shrink-0"
                    style={{ background: `${flavor.color}20`, color: flavor.color, border: `1px solid ${flavor.color}30` }}>
                    HOT
                  </span>
                )}

                {/* Price */}
                <span className="font-ninja text-xs flex items-center gap-0.5 shrink-0" style={{ color: isSelected ? flavor.color : '#666' }}>
                  <Coins size={10} /> {flavor.price}
                </span>

                {/* Selected check */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: flavor.color }}>
                    <CheckCircle2 size={10} className="text-black" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Order button */}
        <motion.button
          whileTap={selectedFlavor ? { scale: 0.97 } : {}}
          disabled={!selectedFlavor || ordering}
          onClick={handleOrder}
          className="w-full py-3.5 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-35"
          style={{
            background: selectedFlavor ? `linear-gradient(135deg, ${selected?.color || '#06B6D4'}, ${selected?.color || '#06B6D4'}cc)` : 'rgba(6,182,212,0.1)',
            color: selectedFlavor ? '#fff' : 'rgba(6,182,212,0.3)',
            boxShadow: selectedFlavor ? `0 0 20px ${selected?.color || '#06B6D4'}30` : 'none',
          }}>
          {ordering ? <Loader2 size={16} className="animate-spin" /> : <Wind size={16} />}
          {ordering ? 'ORDERING...' : selectedFlavor ? `ORDER ${selected?.name.toUpperCase()}` : 'SELECT A FLAVOR'}
        </motion.button>

        <p className="font-body text-gray-700 text-[9px] text-center mt-2">Staff will bring the hubbly to your PC</p>
      </div>
    </div>
  );
}
