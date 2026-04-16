'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Wind, Loader2, CheckCircle2, Clock, Send, Coins, Snowflake, ChevronLeft, ChevronRight, Droplet, Cigarette } from 'lucide-react';
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
  iceInWater?: boolean;
  type?: 'hookah' | 'tobacco';
  cigaretteName?: string;
}

type MainTab = 'hookah' | 'tobacco';
type HookahStep = 'flavor' | 'ice' | 'confirm';

interface CigaretteOption {
  id: string;
  name: string;
  color: string;
  price: number;
  badge?: string;
}

const CIGARETTES: CigaretteOption[] = [
  { id: 'marlboro-red',   name: 'Marlboro Red',   color: '#DC2626', price: 200, badge: 'CLASSIC' },
  { id: 'marlboro-gold',  name: 'Marlboro Gold',  color: '#D4A017', price: 200, badge: 'SMOOTH' },
  { id: 'winston',        name: 'Winston',        color: '#3B82F6', price: 180 },
];

export function HubblyTab({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';

  // Main tab — HOOKAH (shisha flow) or TOBACCO (cigarettes alone)
  const [mainTab, setMainTab] = useState<MainTab>('hookah');

  // Hookah flow state
  const [step, setStep] = useState<HookahStep>('flavor');
  const [selectedFlavor, setSelectedFlavor] = useState<string | null>(null);
  const [iceInWater, setIceInWater] = useState<boolean | null>(null);

  // Tobacco flow state
  const [tobaccoPick, setTobaccoPick] = useState<string | null>(null);

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

  const selected = SHISHA_FLAVORS.find(f => f.id === selectedFlavor);
  const tobaccoSelected = CIGARETTES.find(c => c.id === tobaccoPick);

  // ── Place a HOOKAH (shisha) order ──
  const placeHookahOrder = async () => {
    if (!selected || ordering || iceInWater === null) return;
    setOrdering(true);
    try {
      await addDoc(collection(db, 'shisha-orders'), {
        playerId: player.uid,
        playerName: player.username,
        pcName: player.pcName || 'Kiosk',
        type: 'hookah',
        flavor: selected.id,
        flavorName: selected.name,
        price: selected.price,
        shishaPrice: selected.price,
        iceInWater,
        cigarette: null,
        prepTime: 10,
        status: 'pending',
        createdAt: Date.now(),
      });
      notifyAdmin(
        'shisha_order',
        'Shisha Order',
        `${player.username} ordered ${selected.name}${iceInWater ? ' (with ice)' : ''}`
      );
      setOrderSent(true);
      setTimeout(() => {
        setOrderSent(false);
        setSelectedFlavor(null);
        setIceInWater(null);
        setStep('flavor');
      }, 2000);
    } catch (err) {
      console.error('Hookah order failed:', err);
    }
    setOrdering(false);
  };

  // ── Place a TOBACCO (cigarettes alone) order ──
  const placeTobaccoOrder = async () => {
    if (!tobaccoSelected || ordering) return;
    setOrdering(true);
    try {
      await addDoc(collection(db, 'shisha-orders'), {
        playerId: player.uid,
        playerName: player.username,
        pcName: player.pcName || 'Kiosk',
        type: 'tobacco',
        flavor: tobaccoSelected.id,
        flavorName: tobaccoSelected.name,
        price: tobaccoSelected.price,
        cigarette: { id: tobaccoSelected.id, name: tobaccoSelected.name, price: tobaccoSelected.price },
        cigaretteName: tobaccoSelected.name,
        prepTime: 3,
        status: 'pending',
        createdAt: Date.now(),
      });
      notifyAdmin(
        'tobacco_order',
        'Tobacco Order',
        `${player.username} ordered ${tobaccoSelected.name}`
      );
      setOrderSent(true);
      setTimeout(() => {
        setOrderSent(false);
        setTobaccoPick(null);
      }, 2000);
    } catch (err) {
      console.error('Tobacco order failed:', err);
    }
    setOrdering(false);
  };

  const goNext = () => {
    if (step === 'flavor' && selectedFlavor) setStep('ice');
    else if (step === 'ice' && iceInWater !== null) setStep('confirm');
  };

  const goBack = () => {
    if (step === 'confirm') setStep('ice');
    else if (step === 'ice') setStep('flavor');
  };

  // Switching tabs resets in-progress state
  const switchTab = (t: MainTab) => {
    if (t === mainTab) return;
    setMainTab(t);
    setStep('flavor');
    setSelectedFlavor(null);
    setIceInWater(null);
    setTobaccoPick(null);
    setOrderSent(false);
  };

  return (
    <div className="relative w-full h-full overflow-y-auto">
      <div className="max-w-[650px] mx-auto p-5 pb-8">

        {/* Header */}
        <div className="text-center pt-2 pb-4">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-4xl block mb-2">💨</motion.span>
          <h1 className="font-ninja text-2xl tracking-wider" style={{ color: '#06B6D4' }}>{ar ? 'شيشة' : 'HUBBLY BUBBLY'}</h1>
        </div>

        {/* ═══ MAIN TABS — HOOKAH / TOBACCO ═══ */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {([
            { id: 'hookah',  label: ar ? 'شيشة' : 'HOOKAH',  icon: <Wind size={18} />,      color: '#06B6D4' },
            { id: 'tobacco', label: ar ? 'سجائر' : 'TOBACCO', icon: <Cigarette size={18} />, color: '#F97316' },
          ] as { id: MainTab; label: string; icon: React.ReactNode; color: string }[]).map(t => {
            const active = mainTab === t.id;
            return (
              <motion.button key={t.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => switchTab(t.id)}
                className="relative rounded-xl py-4 px-3 flex items-center justify-center gap-2 font-ninja text-sm tracking-[0.2em] transition-all overflow-hidden"
                style={{
                  background: active ? `linear-gradient(135deg, ${t.color}22, ${t.color}08)` : 'rgba(255,255,255,0.02)',
                  border: active ? `1.5px solid ${t.color}80` : '1.5px solid rgba(255,255,255,0.06)',
                  color: active ? t.color : '#888',
                  boxShadow: active ? `0 0 20px ${t.color}30` : 'none',
                }}>
                {active && (
                  <>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${t.color}`, borderLeft: `2px solid ${t.color}` }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${t.color}`, borderRight: `2px solid ${t.color}` }} />
                  </>
                )}
                {t.icon} {t.label}
              </motion.button>
            );
          })}
        </div>

        {/* ═══ Active orders ═══ */}
        {activeOrders.length > 0 && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <p className="font-ninja text-[10px] text-cyan-400 mb-2">{ar ? 'الطلبات النشطة' : 'ACTIVE ORDERS'}</p>
            {activeOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-1">
                <span className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                  {order.type === 'tobacco' ? '🚬' : (SHISHA_FLAVORS.find(f => f.id === order.flavor)?.icon || '💨')} {order.flavorName}
                  {order.iceInWater && <Snowflake size={10} className="text-cyan-400" />}
                </span>
                <span className="font-ninja text-[9px] px-2 py-0.5 rounded" style={{
                  background: order.status === 'pending' ? 'rgba(250,204,21,0.1)' : 'rgba(255,111,0,0.1)',
                  color: order.status === 'pending' ? '#facc15' : '#FF6F00',
                }}>{order.status === 'pending' ? (ar ? 'قيد الانتظار' : 'WAITING') : (ar ? 'قيد التحضير' : 'PREPARING')}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Success toast ═══ */}
        <AnimatePresence>
          {orderSent && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)' }}>
              <CheckCircle2 size={16} className="text-[#39FF14]" />
              <p className="font-body text-xs text-[#39FF14]">{ar ? 'تم إرسال الطلب! الموظفون سيحضرونها إلى جهازك.' : 'Order sent! Staff will bring it to your PC.'}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════ HOOKAH FLOW ═══════════ */}
        {mainTab === 'hookah' && (
          <>
            {/* Step indicator dots — 3 steps now */}
            <div className="flex items-center justify-center gap-2 mb-5">
              {(['flavor', 'ice', 'confirm'] as HookahStep[]).map((s, i) => {
                const order: HookahStep[] = ['flavor', 'ice', 'confirm'];
                const currentIdx = order.indexOf(step);
                const myIdx = order.indexOf(s);
                const current = step === s;
                const done = myIdx < currentIdx;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <motion.div
                      animate={current ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-8 h-8 rounded-full flex items-center justify-center font-ninja text-xs"
                      style={{
                        background: current ? '#06B6D4' : done ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${current || done ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        color: current ? '#000' : done ? '#06B6D4' : '#555',
                      }}>
                      {done ? <CheckCircle2 size={14} /> : i + 1}
                    </motion.div>
                    {i < 2 && <div className="w-6 h-[1px]" style={{ background: done ? '#06B6D4' : 'rgba(255,255,255,0.08)' }} />}
                  </div>
                );
              })}
            </div>

            {/* STEP 1: FLAVOR */}
            {step === 'flavor' && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="font-body text-xs text-gray-500 text-center mb-4">{ar ? 'اختر نكهتك' : 'Pick your flavor'}</p>
                <div className="space-y-2 mb-5">
                  {SHISHA_FLAVORS.map((flavor, i) => {
                    const isSelected = selectedFlavor === flavor.id;
                    return (
                      <motion.div key={flavor.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => setSelectedFlavor(flavor.id)}
                        className="relative rounded-xl p-3.5 cursor-pointer transition-all flex items-center gap-3"
                        style={{
                          background: isSelected ? `${flavor.color}10` : 'rgba(255,255,255,0.015)',
                          border: isSelected ? `1.5px solid ${flavor.color}60` : '1.5px solid rgba(255,255,255,0.04)',
                          boxShadow: isSelected ? `0 0 15px ${flavor.color}15` : 'none',
                        }}>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                          style={{
                            border: isSelected ? `2px solid ${flavor.color}` : '2px solid rgba(255,255,255,0.1)',
                            background: isSelected ? `${flavor.color}15` : 'transparent',
                          }}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: flavor.color }} />}
                        </div>
                        <span className="text-2xl">{flavor.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-ninja text-sm tracking-wider" style={{ color: isSelected ? flavor.color : '#ccc' }}>
                            {flavor.name.toUpperCase()}
                          </p>
                        </div>
                        {flavor.popular && (
                          <span className="font-ninja text-[8px] px-1.5 py-0.5 rounded tracking-wider shrink-0"
                            style={{ background: `${flavor.color}20`, color: flavor.color, border: `1px solid ${flavor.color}30` }}>
                            HOT
                          </span>
                        )}
                        <span className="font-ninja text-xs flex items-center gap-0.5 shrink-0" style={{ color: isSelected ? flavor.color : '#666' }}>
                          <Coins size={11} /> {flavor.price}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                <motion.button
                  whileTap={selectedFlavor ? { scale: 0.97 } : {}}
                  disabled={!selectedFlavor}
                  onClick={goNext}
                  className="w-full py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  style={{
                    background: selectedFlavor ? `linear-gradient(135deg, ${selected?.color}, ${selected?.color}cc)` : 'rgba(6,182,212,0.1)',
                    color: selectedFlavor ? '#fff' : 'rgba(6,182,212,0.3)',
                    boxShadow: selectedFlavor ? `0 0 20px ${selected?.color}30` : 'none',
                  }}>
                  {selectedFlavor ? <>{ar ? 'متابعة' : 'CONTINUE'} <ChevronRight size={18} /></> : (ar ? 'اختر نكهة' : 'SELECT A FLAVOR')}
                </motion.button>
              </motion.div>
            )}

            {/* STEP 2: ICE */}
            {step === 'ice' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: `${selected?.color}08`, border: `1px solid ${selected?.color}25` }}>
                  <span className="text-2xl">{selected?.icon}</span>
                  <div className="flex-1">
                    <p className="font-ninja text-xs tracking-wider" style={{ color: selected?.color }}>{selected?.name.toUpperCase()}</p>
                    <p className="font-body text-[10px] text-gray-500">{ar ? 'تم تثبيت نكهتك' : 'Your flavor is locked in'}</p>
                  </div>
                  <CheckCircle2 size={16} style={{ color: selected?.color }} />
                </div>

                <h2 className="font-ninja text-lg text-center mb-1" style={{ color: '#06B6D4' }}>{ar ? 'ثلج في الماء؟' : 'ICE IN THE WATER?'}</h2>
                <p className="font-body text-xs text-gray-500 text-center mb-5">{ar ? 'دخان أبرد، سحب أنعم' : 'Colder smoke, smoother draw'}</p>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { val: true, icon: <Snowflake size={32} />, title: ar ? 'نعم' : 'YES', sub: ar ? 'مع ثلج' : 'With Ice', desc: ar ? 'بارد وناعم' : 'Cold & smooth', color: '#06B6D4' },
                    { val: false, icon: <Droplet size={32} />, title: ar ? 'لا' : 'NO', sub: ar ? 'درجة الغرفة' : 'Room Temp', desc: ar ? 'الإحساس الكلاسيكي' : 'Classic feel', color: '#A855F7' },
                  ].map((opt, i) => {
                    const isSel = iceInWater === opt.val;
                    return (
                      <motion.button key={String(opt.val)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        whileTap={{ scale: 0.97 }}
                        whileHover={{ y: -2 }}
                        onClick={() => setIceInWater(opt.val)}
                        className="relative rounded-xl p-5 text-center transition-all"
                        style={{
                          background: isSel ? `${opt.color}10` : 'rgba(255,255,255,0.02)',
                          border: isSel ? `2px solid ${opt.color}60` : '2px solid rgba(255,255,255,0.06)',
                          boxShadow: isSel ? `0 0 25px ${opt.color}20` : 'none',
                        }}>
                        {isSel && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: opt.color }}>
                            <CheckCircle2 size={14} className="text-black" />
                          </motion.div>
                        )}
                        <motion.div
                          animate={isSel ? { rotate: [0, 10, -10, 0], y: [0, -4, 0] } : {}}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-16 h-16 rounded-xl mx-auto mb-3 flex items-center justify-center"
                          style={{ background: `${opt.color}15`, border: `1px solid ${opt.color}30` }}>
                          <span style={{ color: opt.color, filter: isSel ? `drop-shadow(0 0 8px ${opt.color}80)` : 'none' }}>{opt.icon}</span>
                        </motion.div>
                        <p className="font-ninja text-2xl" style={{ color: isSel ? opt.color : '#666' }}>{opt.title}</p>
                        <p className="font-ninja text-[10px] tracking-wider mt-1" style={{ color: isSel ? `${opt.color}90` : '#555' }}>{opt.sub}</p>
                        <p className="font-body text-[10px] text-gray-500 mt-1">{opt.desc}</p>
                      </motion.button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button onClick={goBack}
                    className="flex-1 py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>
                    <ChevronLeft size={18} /> {ar ? 'رجوع' : 'BACK'}
                  </button>
                  <motion.button
                    whileTap={iceInWater !== null ? { scale: 0.97 } : {}}
                    disabled={iceInWater === null}
                    onClick={goNext}
                    className="flex-1 py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                    style={{
                      background: iceInWater !== null ? `linear-gradient(135deg, ${selected?.color}, ${selected?.color}cc)` : 'rgba(6,182,212,0.1)',
                      color: iceInWater !== null ? '#fff' : 'rgba(6,182,212,0.3)',
                      boxShadow: iceInWater !== null ? `0 0 20px ${selected?.color}30` : 'none',
                    }}>
                    {ar ? 'متابعة' : 'CONTINUE'} <ChevronRight size={18} />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: CONFIRM (hookah) */}
            {step === 'confirm' && selected && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="rounded-2xl p-6 text-center relative overflow-hidden" style={{
                  background: `linear-gradient(135deg, ${selected.color}12, ${selected.color}04)`,
                  border: `2px solid ${selected.color}40`,
                  boxShadow: `0 0 30px ${selected.color}15`,
                }}>
                  <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${selected.color}`, borderLeft: `2px solid ${selected.color}` }} />
                  <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: `2px solid ${selected.color}60`, borderRight: `2px solid ${selected.color}60` }} />
                  <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: `2px solid ${selected.color}60`, borderLeft: `2px solid ${selected.color}60` }} />
                  <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${selected.color}`, borderRight: `2px solid ${selected.color}` }} />

                  <motion.span
                    animate={{ y: [0, -6, 0], rotate: [0, 8, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="text-6xl block mb-3">
                    {selected.icon}
                  </motion.span>
                  <h2 className="font-ninja text-2xl mb-2" style={{ color: selected.color, textShadow: `0 0 20px ${selected.color}50` }}>
                    {selected.name.toUpperCase()}
                  </h2>
                  <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                    <span className="px-3 py-1 rounded-full font-ninja text-xs flex items-center gap-1.5" style={{
                      background: iceInWater ? 'rgba(6,182,212,0.12)' : 'rgba(168,85,247,0.12)',
                      border: `1px solid ${iceInWater ? 'rgba(6,182,212,0.3)' : 'rgba(168,85,247,0.3)'}`,
                      color: iceInWater ? '#06B6D4' : '#A855F7',
                    }}>
                      {iceInWater ? <><Snowflake size={12} /> {ar ? 'مع ثلج' : 'WITH ICE'}</> : <><Droplet size={12} /> {ar ? 'بدون ثلج' : 'NO ICE'}</>}
                    </span>
                    <span className="px-3 py-1 rounded-full font-ninja text-xs flex items-center gap-1.5" style={{
                      background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700',
                    }}>
                      <Coins size={12} /> {selected.price}
                    </span>
                    <span className="px-3 py-1 rounded-full font-ninja text-xs flex items-center gap-1.5" style={{
                      background: 'rgba(255,111,0,0.1)', border: '1px solid rgba(255,111,0,0.3)', color: '#FF6F00',
                    }}>
                      <Clock size={12} /> {ar ? '~10 دقائق' : '~10 MIN'}
                    </span>
                  </div>
                  <p className="font-body text-xs text-gray-400">{ar ? 'ستُحضر شيشتك إلى جهازك' : 'Your hubbly will be brought to your PC'}</p>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={goBack}
                    className="flex-1 py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>
                    <ChevronLeft size={18} /> {ar ? 'رجوع' : 'BACK'}
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    disabled={ordering}
                    onClick={placeHookahOrder}
                    className="flex-[2] py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${selected.color}, ${selected.color}cc)`,
                      color: '#fff',
                      boxShadow: `0 0 25px ${selected.color}40`,
                    }}>
                    <motion.div className="absolute inset-0 pointer-events-none"
                      animate={{ x: ['-100%', '250%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                      style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)', width: '40%' }} />
                    {ordering ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {ordering ? (ar ? 'جاري الإرسال...' : 'SENDING...') : (ar ? 'إرسال الطلب' : 'PLACE ORDER')}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* ═══════════ TOBACCO FLOW (standalone) ═══════════ */}
        {mainTab === 'tobacco' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <p className="font-body text-xs text-gray-500 text-center mb-4">
              {ar ? 'اختر نوع السجائر' : 'Pick your pack'}
            </p>

            <div className="space-y-2.5 mb-5">
              {CIGARETTES.map((cig, i) => {
                const isSel = tobaccoPick === cig.id;
                return (
                  <motion.div key={cig.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setTobaccoPick(cig.id)}
                    className="relative rounded-xl p-4 cursor-pointer transition-all flex items-center gap-3"
                    style={{
                      background: isSel ? `${cig.color}10` : 'rgba(255,255,255,0.015)',
                      border: isSel ? `1.5px solid ${cig.color}60` : '1.5px solid rgba(255,255,255,0.04)',
                      boxShadow: isSel ? `0 0 15px ${cig.color}15` : 'none',
                    }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        border: isSel ? `2px solid ${cig.color}` : '2px solid rgba(255,255,255,0.1)',
                        background: isSel ? `${cig.color}15` : 'transparent',
                      }}>
                      {isSel && <div className="w-2.5 h-2.5 rounded-full" style={{ background: cig.color }} />}
                    </div>
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${cig.color}15`, border: `1px solid ${cig.color}30` }}>
                      <span className="text-2xl">🚬</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-ninja text-sm tracking-wider" style={{ color: isSel ? cig.color : '#ccc' }}>
                        {cig.name.toUpperCase()}
                      </p>
                      {cig.badge && <p className="font-ninja text-[8px] tracking-wider mt-0.5" style={{ color: isSel ? `${cig.color}90` : '#555' }}>{cig.badge}</p>}
                    </div>
                    <span className="font-ninja text-sm flex items-center gap-1 shrink-0" style={{ color: isSel ? cig.color : '#666' }}>
                      <Coins size={12} /> {cig.price}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Confirmation card when a pick is made */}
            {tobaccoSelected && (
              <div className="rounded-2xl p-5 text-center relative overflow-hidden mb-4" style={{
                background: `linear-gradient(135deg, ${tobaccoSelected.color}12, ${tobaccoSelected.color}04)`,
                border: `2px solid ${tobaccoSelected.color}40`,
                boxShadow: `0 0 20px ${tobaccoSelected.color}15`,
              }}>
                <span className="text-5xl block mb-2">🚬</span>
                <h2 className="font-ninja text-xl mb-2" style={{ color: tobaccoSelected.color, textShadow: `0 0 14px ${tobaccoSelected.color}50` }}>
                  {tobaccoSelected.name.toUpperCase()}
                </h2>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full font-ninja text-xs flex items-center gap-1.5" style={{
                    background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700',
                  }}>
                    <Coins size={12} /> {tobaccoSelected.price}
                  </span>
                  <span className="px-3 py-1 rounded-full font-ninja text-xs flex items-center gap-1.5" style={{
                    background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', color: '#F97316',
                  }}>
                    <Clock size={12} /> {ar ? '~3 دقائق' : '~3 MIN'}
                  </span>
                </div>
              </div>
            )}

            <motion.button
              whileTap={tobaccoPick ? { scale: 0.97 } : {}}
              disabled={!tobaccoPick || ordering}
              onClick={placeTobaccoOrder}
              className="w-full py-4 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-30 relative overflow-hidden"
              style={{
                background: tobaccoPick && tobaccoSelected
                  ? `linear-gradient(135deg, ${tobaccoSelected.color}, ${tobaccoSelected.color}cc)`
                  : 'rgba(249,115,22,0.1)',
                color: tobaccoPick && tobaccoSelected ? '#fff' : 'rgba(249,115,22,0.3)',
                boxShadow: tobaccoPick && tobaccoSelected ? `0 0 20px ${tobaccoSelected.color}40` : 'none',
              }}>
              {tobaccoPick && (
                <motion.div className="absolute inset-0 pointer-events-none"
                  animate={{ x: ['-100%', '250%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)', width: '40%' }} />
              )}
              {ordering ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {ordering
                ? (ar ? 'جاري الإرسال...' : 'SENDING...')
                : (tobaccoPick ? (ar ? 'إرسال الطلب' : 'PLACE ORDER') : (ar ? 'اختر نوع السجائر' : 'SELECT A PACK'))}
            </motion.button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
