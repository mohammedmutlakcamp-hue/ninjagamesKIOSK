'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { UtensilsCrossed, Wind, Clock, CheckCircle2, ChefHat, X, ChevronDown, Snowflake } from 'lucide-react';

interface Props {
  playerUid: string;
}

interface Order {
  id: string;
  kind: 'food' | 'shisha';
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  createdAt: number;
  prepTime: number; // minutes
  label: string;
  icon: React.ReactNode;
  color: string;
  details?: string;
  iceInWater?: boolean;
}

const FOOD_COLOR = '#FF6F00';
const SHISHA_COLOR = '#06B6D4';

export function OrderBubble({ playerUid }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending:   { label: ar ? 'قيد الانتظار' : 'WAITING',   color: '#FACC15',  icon: <Clock size={12} /> },
    preparing: { label: ar ? 'قيد التحضير' : 'PREPARING', color: '#FF6F00',  icon: <ChefHat size={12} /> },
    ready:     { label: ar ? 'جاهز!' : 'READY!',    color: '#39FF14',  icon: <CheckCircle2 size={12} /> },
  };
  const [foodOrders, setFoodOrders] = useState<any[]>([]);
  const [shishaOrders, setShishaOrders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0); // forces re-render for countdown
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Tick every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Position bottom-right initially
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth - 90, y: window.innerHeight - 140 });
    }
  }, []);

  // Listen to food orders (no orderBy to avoid composite index requirement)
  useEffect(() => {
    if (!playerUid) return;
    const q = query(collection(db, 'orders'), where('playerId', '==', playerUid));
    const unsub = onSnapshot(q, snap => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setFoodOrders(active);
    }, err => console.error('Food orders listener failed:', err));
    return () => unsub();
  }, [playerUid]);

  // Listen to shisha orders
  useEffect(() => {
    if (!playerUid) return;
    const q = query(collection(db, 'shisha-orders'), where('playerId', '==', playerUid));
    const unsub = onSnapshot(q, snap => {
      const active = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setShishaOrders(active);
    }, err => console.error('Shisha orders listener failed:', err));
    return () => unsub();
  }, [playerUid]);

  // Combine orders
  const orders: Order[] = [
    ...foodOrders.map(o => ({
      id: o.id,
      kind: 'food' as const,
      status: o.status,
      createdAt: o.createdAt,
      prepTime: o.prepTime || 12, // food default 12 min
      label: ar ? `${o.items?.length || 0} صنف` : `${o.items?.length || 0} item${(o.items?.length || 0) > 1 ? 's' : ''}`,
      details: (o.items || []).map((i: any) => `${i.name} ×${i.quantity}`).join(', '),
      icon: <UtensilsCrossed size={18} />,
      color: FOOD_COLOR,
    })),
    ...shishaOrders.map(o => ({
      id: o.id,
      kind: 'shisha' as const,
      status: o.status,
      createdAt: o.createdAt,
      prepTime: o.prepTime || 10,
      label: o.flavorName || (ar ? 'أرجيلة' : 'Shisha'),
      details: o.iceInWater ? (ar ? 'مع ثلج' : 'With ice') : (ar ? 'بدون ثلج' : 'No ice'),
      iceInWater: o.iceInWater,
      icon: <Wind size={18} />,
      color: SHISHA_COLOR,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  if (orders.length === 0) return null;

  // Compute countdown for the soonest order (most urgent)
  const soonest = orders[0];
  const getRemaining = (o: Order) => {
    if (o.status === 'ready') return 0;
    const elapsed = (Date.now() - o.createdAt) / 1000; // seconds
    const total = o.prepTime * 60;
    return Math.max(0, total - elapsed);
  };

  const fmtTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const soonestRemaining = getRemaining(soonest);
  const soonestProgress = 1 - soonestRemaining / (soonest.prepTime * 60);

  // Use the soonest order's color for the bubble
  const bubbleColor = soonest.status === 'ready' ? '#39FF14' : soonest.color;

  return (
    <>
      {/* Constraints for dragging (full viewport) */}
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[249]" />

      {/* Floating bubble */}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={constraintsRef}
        onDragStart={() => setDragging(true)}
        onDragEnd={(_, info) => {
          setDragging(false);
          setPosition({
            x: Math.max(10, Math.min(window.innerWidth - 80, position.x + info.offset.x)),
            y: Math.max(10, Math.min(window.innerHeight - 80, position.y + info.offset.y)),
          });
        }}
        onClick={() => { if (!dragging) setExpanded(e => !e); }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="fixed z-[250] cursor-grab active:cursor-grabbing"
        style={{ left: position.x, top: position.y, touchAction: 'none' }}
      >
        <motion.div
          animate={soonest.status === 'ready' ? {
            scale: [1, 1.1, 1],
            boxShadow: [
              `0 0 20px ${bubbleColor}50`,
              `0 0 40px ${bubbleColor}80`,
              `0 0 20px ${bubbleColor}50`,
            ],
          } : {
            boxShadow: [
              `0 0 15px ${bubbleColor}30`,
              `0 0 25px ${bubbleColor}50`,
              `0 0 15px ${bubbleColor}30`,
            ],
          }}
          transition={{ duration: soonest.status === 'ready' ? 1 : 2, repeat: Infinity }}
          className="w-[68px] h-[68px] rounded-full flex items-center justify-center relative overflow-hidden"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${bubbleColor}60, ${bubbleColor}20 50%, #0a0a0a 90%)`,
            border: `2px solid ${bubbleColor}`,
          }}
        >
          {/* Progress ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 68 68" style={{ pointerEvents: 'none' }}>
            <circle cx="34" cy="34" r="30" fill="none" stroke={`${bubbleColor}20`} strokeWidth="3" />
            <motion.circle
              cx="34" cy="34" r="30" fill="none"
              stroke={bubbleColor} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 30}`}
              strokeDashoffset={`${2 * Math.PI * 30 * (1 - soonestProgress)}`}
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          </svg>

          {/* Icon and countdown */}
          <div className="flex flex-col items-center justify-center">
            <span style={{ color: bubbleColor, filter: `drop-shadow(0 0 4px ${bubbleColor}80)` }}>
              {soonest.icon}
            </span>
            {soonest.status === 'ready' ? (
              <span className="font-ninja text-[8px] mt-0.5" style={{ color: bubbleColor }}>{ar ? 'جاهز!' : 'READY!'}</span>
            ) : (
              <span className="font-ninja text-[9px] mt-0.5 tabular-nums" style={{ color: bubbleColor }}>
                {fmtTime(soonestRemaining)}
              </span>
            )}
          </div>

          {/* Multiple order count badge */}
          {orders.length > 1 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center font-ninja text-[9px] text-white"
              style={{ background: bubbleColor, boxShadow: `0 0 8px ${bubbleColor}80` }}>
              {orders.length}
            </div>
          )}

          {/* Ready pulse */}
          {soonest.status === 'ready' && (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{ border: `2px solid ${bubbleColor}` }}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[251] rounded-2xl overflow-hidden"
            style={{
              left: Math.min(window.innerWidth - 320, Math.max(10, position.x - 260)),
              top: Math.min(window.innerHeight - 400, Math.max(10, position.y - 20)),
              width: 310,
              background: 'linear-gradient(180deg, #0c1018 0%, #080a10 100%)',
              border: `1px solid ${bubbleColor}30`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 30px ${bubbleColor}15`,
            }}
          >
            {/* Gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${bubbleColor}, transparent)` }} />

            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="font-ninja text-sm tracking-wider" style={{ color: bubbleColor }}>
                {ar ? 'طلباتك' : 'YOUR ORDERS'}
              </p>
              <button onClick={() => setExpanded(false)} className="p-1 rounded hover:bg-white/5">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="max-h-[340px] overflow-y-auto">
              {orders.map((o, i) => {
                const rem = getRemaining(o);
                const total = o.prepTime * 60;
                const progress = 1 - rem / total;
                const sc = STATUS_CFG[o.status] || STATUS_CFG.pending;
                return (
                  <motion.div key={o.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4"
                    style={{ borderBottom: i < orders.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: `${o.color}15`, border: `1px solid ${o.color}30` }}>
                        <span style={{ color: o.color }}>{o.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-ninja text-xs tracking-wider" style={{ color: o.color }}>
                            {o.kind === 'shisha' ? (ar ? 'أرجيلة' : 'HUBBLY') : (ar ? 'طعام' : 'FOOD')}
                          </p>
                          {o.kind === 'shisha' && o.iceInWater && <Snowflake size={10} className="text-cyan-400" />}
                        </div>
                        <p className="font-body text-xs text-gray-300 truncate">{o.details || o.label}</p>
                      </div>
                      <span className="font-ninja text-[9px] px-2 py-1 rounded flex items-center gap-1"
                        style={{ background: `${sc.color}15`, color: sc.color, border: `1px solid ${sc.color}30` }}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>

                    {o.status !== 'ready' ? (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-body text-[10px] text-gray-500">{ar ? 'الوقت المتبقي' : 'Time remaining'}</span>
                          <span className="font-ninja text-sm tabular-nums" style={{ color: o.color }}>
                            {fmtTime(rem)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <motion.div
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${o.color}, ${o.color}cc)`, boxShadow: `0 0 6px ${o.color}60` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 py-1 px-2 rounded-lg" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)' }}>
                        <CheckCircle2 size={14} className="text-[#39FF14]" />
                        <p className="font-body text-xs text-[#39FF14]">{ar ? 'جاهز للاستلام!' : 'Ready for pickup!'}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="px-4 py-2 flex items-center justify-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="font-body text-[10px] text-gray-600">{ar ? 'اسحب الفقاعة للتحريك · اضغط للتبديل' : 'Drag the bubble to move · Tap to toggle'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
