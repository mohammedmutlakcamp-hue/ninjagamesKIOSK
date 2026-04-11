'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Wind, Loader2, CheckCircle2, Clock, Send, X, Coins, Sparkles } from 'lucide-react';
import { notifyAdmin } from '@/lib/notify-admin';

interface Props {
  player: any;
}

interface ShishaFlavor {
  id: string;
  name: string;
  nameAr?: string;
  color: string;
  icon: string;
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

  // Listen for active shisha orders
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

  return (
    <div className="relative min-h-full">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #080a12 0%, #0a0c16 40%, #0c1020 70%, #080a12 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(6,182,212,0.05) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(168,85,247,0.03) 0%, transparent 40%)' }} />
      </div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-ninja text-4xl tracking-wider mb-2" style={{ color: '#06B6D4', textShadow: '0 0 25px rgba(6,182,212,0.4)' }}>
              HUBBLY BUBBLY
            </h1>
            <p className="font-body text-gray-500 text-sm">Choose your shisha flavor and we will bring it to you</p>
          </div>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '2px solid rgba(6,182,212,0.3)', boxShadow: '0 0 20px rgba(6,182,212,0.15)' }}>
            <span className="text-3xl">💨</span>
          </div>
        </div>

        {/* Active orders banner */}
        {activeOrders.length > 0 && (
          <div className="mb-6 rounded-xl p-4" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <p className="font-ninja text-sm text-cyan-400 mb-2">ACTIVE ORDERS</p>
            <div className="space-y-2">
              {activeOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{SHISHA_FLAVORS.find(f => f.id === order.flavor)?.icon || '💨'}</span>
                    <span className="font-body text-sm text-gray-300">{order.flavorName}</span>
                  </div>
                  <span className="font-ninja text-xs px-2 py-0.5 rounded" style={{
                    background: order.status === 'pending' ? 'rgba(250,204,21,0.15)' : 'rgba(255,111,0,0.15)',
                    color: order.status === 'pending' ? '#facc15' : '#FF6F00',
                    border: `1px solid ${order.status === 'pending' ? 'rgba(250,204,21,0.3)' : 'rgba(255,111,0,0.3)'}`,
                  }}>
                    {order.status === 'pending' ? 'WAITING' : 'PREPARING'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order sent success */}
        <AnimatePresence>
          {orderSent && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-6 rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.25)' }}>
              <CheckCircle2 size={20} className="text-ninja-green" />
              <p className="font-body text-sm text-ninja-green">Shisha order sent! Staff will bring it to your PC.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Flavor Grid */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {SHISHA_FLAVORS.map((flavor, i) => {
            const selected = selectedFlavor === flavor.id;
            return (
              <motion.button key={flavor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => setSelectedFlavor(selected ? null : flavor.id)}
                className="relative rounded-xl p-5 text-center transition-all"
                style={{
                  background: selected ? `linear-gradient(135deg, ${flavor.color}20, ${flavor.color}08)` : 'rgba(255,255,255,0.02)',
                  border: `2px solid ${selected ? `${flavor.color}60` : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: selected ? `0 0 20px ${flavor.color}20, inset 0 0 20px ${flavor.color}05` : 'none',
                }}>
                {/* HUD corners */}
                {selected && <>
                  <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${flavor.color}`, borderLeft: `2px solid ${flavor.color}` }} />
                  <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${flavor.color}`, borderRight: `2px solid ${flavor.color}` }} />
                </>}
                {/* Popular badge */}
                {flavor.popular && (
                  <div className="absolute -top-1.5 right-2 px-2 py-0.5 rounded font-ninja text-[8px] tracking-wider"
                    style={{ background: `${flavor.color}`, color: '#000' }}>
                    HOT
                  </div>
                )}
                <span className="text-4xl block mb-2">{flavor.icon}</span>
                <p className="font-ninja text-sm tracking-wider mb-1" style={{ color: selected ? flavor.color : '#ccc' }}>{flavor.name.toUpperCase()}</p>
                <p className="font-body text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Coins size={10} className="text-yellow-400" /> {flavor.price}
                </p>
              </motion.button>
            );
          })}
        </div>

        {/* Order button */}
        <motion.button
          whileHover={selectedFlavor ? { scale: 1.02, boxShadow: '0 0 30px rgba(6,182,212,0.4)' } : {}}
          whileTap={selectedFlavor ? { scale: 0.97 } : {}}
          disabled={!selectedFlavor || ordering}
          onClick={handleOrder}
          className="w-full py-4 rounded-xl font-ninja text-xl tracking-wider flex items-center justify-center gap-3 transition-all disabled:opacity-40"
          style={{
            background: selectedFlavor ? 'linear-gradient(135deg, #0891B2, #06B6D4)' : 'rgba(6,182,212,0.15)',
            color: selectedFlavor ? '#fff' : 'rgba(6,182,212,0.4)',
            boxShadow: selectedFlavor ? '0 0 20px rgba(6,182,212,0.3)' : 'none',
          }}>
          {ordering ? <Loader2 size={22} className="animate-spin" /> : <Wind size={22} />}
          {ordering ? 'ORDERING...' : selectedFlavor ? `ORDER ${SHISHA_FLAVORS.find(f => f.id === selectedFlavor)?.name.toUpperCase()}` : 'SELECT A FLAVOR'}
        </motion.button>

        <p className="font-body text-gray-600 text-[11px] text-center mt-3">Staff will bring the hubbly bubbly to your PC</p>
      </div>
    </div>
  );
}
