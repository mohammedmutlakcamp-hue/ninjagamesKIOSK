'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, doc, query, where, onSnapshot, addDoc, updateDoc, getDocs, getDoc, deleteDoc
} from 'firebase/firestore';
import { Lang, t } from '@/lib/translations';
import {
  Monitor, Clock, XCircle, CheckCircle, AlertTriangle, Loader2, Timer, Wifi, WifiOff
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
interface PC {
  id: string;
  name: string;
  status: 'available' | 'in-use' | 'reserved' | 'offline';
  currentPlayer?: string;
  reservedBy?: string | null;
  reservedUntil?: number | null;
  reservationId?: string | null;
}

interface Reservation {
  id: string;
  playerId: string;
  playerName: string;
  pcId: string;
  pcName: string;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'expired' | 'used' | 'cancelled';
}

// ─── Animation variants ─────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

const cardPop = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 20, stiffness: 300 } },
};

const RESERVATION_DURATION = 15 * 60 * 1000; // 15 minutes

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export function ReservePC({ player, lang }: { player: any; lang: Lang }) {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [reserving, setReserving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmPC, setConfirmPC] = useState<PC | null>(null);
  const [loading, setLoading] = useState(true);
  const notifiedOneMin = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Listen to PCs collection ──────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const pcList: PC[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as PC[];
      setPcs(pcList.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Listen for active reservation ─────────────────────────
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'reservations'),
      where('playerId', '==', player.uid),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setActiveReservation({ id: d.id, ...d.data() } as Reservation);
      } else {
        setActiveReservation(null);
        notifiedOneMin.current = false;
      }
    });
    return () => unsub();
  }, [player?.uid]);

  // ─── Countdown timer ───────────────────────────────────────
  useEffect(() => {
    if (!activeReservation) {
      setTimeLeft(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const tick = () => {
      const remaining = activeReservation.expiresAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        handleExpire();
        return;
      }
      setTimeLeft(remaining);

      // 1-minute warning notification
      if (remaining <= 60000 && remaining > 59000 && !notifiedOneMin.current) {
        notifiedOneMin.current = true;
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Reservation Expiring!',
            message: `Your reservation for ${activeReservation.pcName} expires in 1 minute!`,
            targetUids: [player.uid],
            data: { type: 'reservation_expiring' },
          }),
        }).catch(() => {});
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeReservation]);

  // ─── Handle expiration ─────────────────────────────────────
  const handleExpire = useCallback(async () => {
    if (!activeReservation) return;
    try {
      await updateDoc(doc(db, 'reservations', activeReservation.id), { status: 'expired' });
      await updateDoc(doc(db, 'pcs', activeReservation.pcId), {
        reservedBy: null,
        reservedUntil: null,
        reservationId: null,
        status: 'available',
      });
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Reservation Expired',
          message: `Your reservation for ${activeReservation.pcName} has expired.`,
          targetUids: [player.uid],
          data: { type: 'reservation_expired' },
        }),
      }).catch(() => {});
    } catch (err) {
      console.error('Expire reservation error:', err);
    }
  }, [activeReservation, player?.uid]);

  // ─── Reserve a PC ──────────────────────────────────────────
  const handleReserve = useCallback(async (pc: PC) => {
    if (reserving || activeReservation) return;
    setReserving(true);
    setConfirmPC(null);

    const now = Date.now();
    const expiresAt = now + RESERVATION_DURATION;

    try {
      const resRef = await addDoc(collection(db, 'reservations'), {
        playerId: player.uid,
        playerName: player.username || 'Unknown',
        pcId: pc.id,
        pcName: pc.name,
        createdAt: now,
        expiresAt,
        status: 'active',
      });

      await updateDoc(doc(db, 'pcs', pc.id), {
        reservedBy: player.uid,
        reservedUntil: expiresAt,
        reservationId: resRef.id,
        status: 'reserved',
      });
    } catch (err) {
      console.error('Reserve error:', err);
    }

    setReserving(false);
  }, [reserving, activeReservation, player]);

  // ─── Cancel reservation ────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!activeReservation || cancelling) return;
    setCancelling(true);

    try {
      await updateDoc(doc(db, 'reservations', activeReservation.id), { status: 'cancelled' });
      await updateDoc(doc(db, 'pcs', activeReservation.pcId), {
        reservedBy: null,
        reservedUntil: null,
        reservationId: null,
        status: 'available',
      });
    } catch (err) {
      console.error('Cancel error:', err);
    }

    setCancelling(false);
  }, [activeReservation, cancelling]);

  // ─── Format countdown ─────────────────────────────────────
  function formatCountdown(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function getTimerColor(): string {
    if (timeLeft <= 60000) return '#FF4444';
    if (timeLeft <= 5 * 60000) return '#FFB800';
    return '#39FF14';
  }

  // ─── PC status config ─────────────────────────────────────
  function getStatusConfig(pc: PC) {
    if (pc.status === 'available' && !pc.reservedBy) {
      return { color: '#39FF14', label: lang === 'ar' ? 'متاح' : 'Available', icon: CheckCircle };
    }
    if (pc.status === 'reserved' || pc.reservedBy) {
      return { color: '#FFB800', label: lang === 'ar' ? 'محجوز' : 'Reserved', icon: Clock };
    }
    if (pc.status === 'in-use') {
      return { color: '#FF4444', label: lang === 'ar' ? 'قيد الاستخدام' : 'In Use', icon: Monitor };
    }
    return { color: '#666', label: lang === 'ar' ? 'غير متصل' : 'Offline', icon: WifiOff };
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" exit="exit" className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-2 pb-3">
        <h2 className="text-white text-lg font-bold">
          <Monitor size={20} className="inline mr-2" style={{ color: '#39FF14' }} />
          {lang === 'ar' ? 'حجز كمبيوتر' : 'Reserve a PC'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ overscrollBehavior: 'contain' }}>
        {/* Active reservation card */}
        <AnimatePresence>
          {activeReservation && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-5 rounded-2xl p-4 border overflow-hidden relative"
              style={{
                background: 'linear-gradient(135deg, rgba(57,255,20,0.08), rgba(57,255,20,0.02))',
                borderColor: `${getTimerColor()}30`,
              }}
            >
              {/* Glow effect */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 0%, ${getTimerColor()}15, transparent 70%)`,
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wider">
                      {lang === 'ar' ? 'حجزك النشط' : 'Your Reservation'}
                    </p>
                    <p className="text-white font-bold text-lg mt-0.5">{activeReservation.pcName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Timer size={16} color={getTimerColor()} />
                    <span className="text-xs text-white/40">
                      {lang === 'ar' ? 'متبقي' : 'remaining'}
                    </span>
                  </div>
                </div>

                {/* Timer display */}
                <div className="text-center my-4">
                  <motion.p
                    key={formatCountdown(timeLeft)}
                    initial={{ scale: 1.05 }}
                    animate={{ scale: 1 }}
                    className="font-mono text-5xl font-bold tracking-wider"
                    style={{ color: getTimerColor() }}
                  >
                    {formatCountdown(timeLeft)}
                  </motion.p>

                  {/* Timer bar */}
                  <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: getTimerColor(),
                        width: `${Math.max(0, (timeLeft / RESERVATION_DURATION) * 100)}%`,
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  {timeLeft <= 60000 && timeLeft > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-center gap-1.5 mt-2"
                    >
                      <AlertTriangle size={14} color="#FF4444" />
                      <span className="text-xs text-red-400">
                        {lang === 'ar' ? 'ينتهي الحجز قريبا!' : 'Reservation expiring soon!'}
                      </span>
                    </motion.div>
                  )}
                </div>

                {/* Cancel button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full py-3 rounded-xl border border-red-500/30 flex items-center justify-center gap-2 transition-colors active:bg-red-500/10"
                  style={{ background: 'rgba(255,68,68,0.08)' }}
                >
                  {cancelling ? (
                    <Loader2 size={16} className="animate-spin" color="#FF4444" />
                  ) : (
                    <XCircle size={16} color="#FF4444" />
                  )}
                  <span className="text-red-400 text-sm font-medium">
                    {lang === 'ar' ? 'إلغاء الحجز' : 'Cancel Reservation'}
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" color="#39FF14" />
          </div>
        )}

        {/* PCs grid */}
        {!loading && (
          <>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
              {lang === 'ar' ? 'أجهزة الكمبيوتر' : 'Available PCs'} ({pcs.filter((p) => p.status === 'available' && !p.reservedBy).length}/{pcs.length})
            </p>

            <div className="grid grid-cols-2 gap-3">
              {pcs.map((pc, i) => {
                const status = getStatusConfig(pc);
                const StatusIcon = status.icon;
                const canReserve = pc.status === 'available' && !pc.reservedBy && !activeReservation;
                const isMyReservation = activeReservation?.pcId === pc.id;

                return (
                  <motion.div
                    key={pc.id}
                    variants={cardPop}
                    initial="initial"
                    animate="animate"
                    transition={{ delay: i * 0.03 }}
                    className="rounded-2xl p-3.5 border relative overflow-hidden"
                    style={{
                      background: isMyReservation
                        ? 'rgba(57,255,20,0.06)'
                        : 'rgba(255,255,255,0.03)',
                      borderColor: isMyReservation
                        ? 'rgba(57,255,20,0.25)'
                        : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Status dot */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: status.color,
                            boxShadow: `0 0 8px ${status.color}50`,
                          }}
                        />
                        <span className="text-[10px] font-medium" style={{ color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                      <StatusIcon size={14} color={status.color} style={{ opacity: 0.6 }} />
                    </div>

                    {/* PC name */}
                    <p className="text-white font-semibold text-sm mb-1">{pc.name}</p>

                    {/* Current user if in use */}
                    {pc.status === 'in-use' && pc.currentPlayer && (
                      <p className="text-white/30 text-[10px] truncate mb-2">
                        {pc.currentPlayer}
                      </p>
                    )}

                    {isMyReservation && (
                      <p className="text-[#39FF14] text-[10px] font-medium mb-2">
                        {lang === 'ar' ? 'حجزك' : 'Your reservation'}
                      </p>
                    )}

                    {/* Reserve button */}
                    {canReserve && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setConfirmPC(pc)}
                        disabled={reserving}
                        className="w-full mt-1 py-2 rounded-xl text-xs font-semibold transition-colors"
                        style={{
                          background: 'rgba(57,255,20,0.12)',
                          color: '#39FF14',
                          border: '1px solid rgba(57,255,20,0.2)',
                        }}
                      >
                        {lang === 'ar' ? 'احجز' : 'Reserve'}
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {pcs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 opacity-40">
                <Monitor size={48} color="#39FF14" />
                <p className="text-white/50 text-sm mt-4">
                  {lang === 'ar' ? 'لا توجد أجهزة متاحة' : 'No PCs available'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      <AnimatePresence>
        {confirmPC && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={() => setConfirmPC(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 border border-white/10"
              style={{ background: '#141414' }}
            >
              <div className="text-center mb-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(57,255,20,0.1)', border: '2px solid rgba(57,255,20,0.2)' }}
                >
                  <Monitor size={28} color="#39FF14" />
                </div>
                <h3 className="text-white font-bold text-lg">
                  {lang === 'ar' ? 'تأكيد الحجز' : 'Confirm Reservation'}
                </h3>
                <p className="text-white/50 text-sm mt-1">
                  {lang === 'ar'
                    ? `هل تريد حجز ${confirmPC.name} لمدة 15 دقيقة؟`
                    : `Reserve ${confirmPC.name} for 15 minutes?`}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmPC(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-white/60 border border-white/10 active:bg-white/5 transition-colors"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleReserve(confirmPC)}
                  disabled={reserving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: '#39FF14', color: '#0a0a0a' }}
                >
                  {reserving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      {lang === 'ar' ? 'تأكيد' : 'Confirm'}
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
