'use client';

// BookingWatcher — mounted once inside KioskDashboard. Polls the active booking
// belonging to this player, plays 10/5-min warning chimes, and applies the
// no-show penalty when the hold expires without the player logging in on the
// booked PC.
//
// Enforcement is idempotent: we move the booking status from 'active' → 'expired'
// inside a transaction so only the first caller actually deducts playtime and
// sets penaltyUntil. Any other client running the same check gracefully no-ops.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  doc, onSnapshot, runTransaction, updateDoc, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookingConfig, BookingConfig, DEFAULT_BOOKING_CONFIG, Booking } from '@/lib/bookings';
import { Calendar, AlertTriangle, X, CheckCircle2 } from 'lucide-react';

interface Props {
  player: any;
}

export function BookingWatcher({ player }: Props) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [cfg, setCfg] = useState<BookingConfig>(DEFAULT_BOOKING_CONFIG);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const warnedRef = useRef<Set<number>>(new Set());
  const expiredAppliedRef = useRef(false);
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';

  useEffect(() => { loadBookingConfig().then(setCfg); }, []);

  // Watch active booking via activeBookingId on the player doc.
  useEffect(() => {
    const bookingId = (player as any).activeBookingId;
    if (!bookingId) { setBooking(null); return; }
    const unsub = onSnapshot(doc(db, 'bookings', bookingId), (snap) => {
      if (!snap.exists()) { setBooking(null); return; }
      const data = snap.data() as any;
      setBooking({ id: snap.id, ...data } as Booking);
      if (data.status !== 'active') setBooking(null);
    });
    return () => unsub();
  }, [(player as any).activeBookingId]);

  // Play a short beep. Skipped silently if AudioContext unavailable.
  const beep = (urgent: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      const n = (freq: number, delay: number, dur: number, vol = 0.28) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = urgent ? 'square' : 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, now + delay);
        g.gain.linearRampToValueAtTime(vol, now + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
        osc.start(now + delay); osc.stop(now + delay + dur);
      };
      if (urgent) { n(1200, 0, 0.18); n(800, 0.22, 0.2); n(1200, 0.46, 0.2); }
      else { n(900, 0, 0.14); n(700, 0.18, 0.22); }
    } catch { /* ignore */ }
  };

  // Minute-by-minute ticker: warnings + auto-expire.
  useEffect(() => {
    if (!booking) { setMinutesLeft(null); return; }
    const tick = () => {
      const msLeft = booking.expiresAt - Date.now();
      const mLeft = Math.ceil(msLeft / 60000);
      setMinutesLeft(mLeft);

      // Warning chimes at configured thresholds (each fires once per booking).
      for (const w of cfg.warnAt) {
        if (mLeft === w && !warnedRef.current.has(w)) {
          warnedRef.current.add(w);
          beep(w <= 5);
          setToastMsg(ar
            ? `⚠️ باقي ${w} دقيقة على انتهاء حجزك`
            : `⚠️ ${w} minutes left on your booking`);
          setTimeout(() => setToastMsg(null), 5000);
        }
      }

      // Expired — apply no-show penalty once.
      if (msLeft <= 0 && !expiredAppliedRef.current) {
        expiredAppliedRef.current = true;
        applyNoShowPenalty(booking);
      }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [booking, cfg.warnAt, ar]);

  const applyNoShowPenalty = async (b: Booking) => {
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'bookings', b.id);
        const cur = await tx.get(ref);
        if (!cur.exists()) return;
        const d = cur.data() as any;
        // Another client already processed this booking — bail.
        if (d.status !== 'active' || d.penaltyApplied) return;
        tx.update(ref, {
          status: 'expired',
          penaltyApplied: true,
          expiredAt: Date.now(),
        });
      });
      // Outside the transaction: deduct playtime + set penaltyUntil.
      const penaltyUntil = Date.now() + cfg.penaltyMinutes * 60 * 1000;
      await updateDoc(doc(db, 'players', b.playerId), {
        remainingPlaytime: increment(-cfg.deductMinutes),
        penaltyUntil,
        activeBookingId: null,
      });
      setToastMsg(ar
        ? `❌ لم تحضر للحجز — خصم ${cfg.deductMinutes} دقيقة وعقوبة ${cfg.penaltyMinutes} دقيقة`
        : `❌ No-show — ${cfg.deductMinutes} min deducted + ${cfg.penaltyMinutes} min penalty`);
      setTimeout(() => setToastMsg(null), 8000);
    } catch (err) {
      console.error('no-show penalty failed', err);
    }
  };

  if (!booking || dismissed) {
    return toastMsg ? (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[260] px-4 py-3 rounded-xl bg-black/90 border border-cyan-500/40 text-cyan-200 font-ninja text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        {toastMsg}
      </div>
    ) : null;
  }

  const left = minutesLeft || 0;
  const urgent = left <= 5;

  return (
    <>
      {/* Floating booking chip */}
      <motion.div
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[240] flex items-center gap-2 px-4 py-2 rounded-full font-ninja text-sm tracking-wider shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        style={{
          background: urgent
            ? 'linear-gradient(135deg, rgba(255,59,48,0.95), rgba(220,38,38,0.95))'
            : 'linear-gradient(135deg, rgba(0,200,255,0.95), rgba(0,136,204,0.95))',
          color: '#000',
          border: `1px solid ${urgent ? 'rgba(255,59,48,0.5)' : 'rgba(0,200,255,0.4)'}`,
        }}
      >
        {urgent ? <AlertTriangle size={14} /> : <Calendar size={14} />}
        {ar
          ? `${booking.pcName} · ${left} د`
          : `${booking.pcName} · ${left}m left`}
        <button
          onClick={() => setDismissed(true)}
          className="ml-1 w-5 h-5 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center"
          title={ar ? 'إخفاء' : 'Hide'}
        >
          <X size={11} strokeWidth={3} />
        </button>
      </motion.div>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-32 left-1/2 -translate-x-1/2 z-[260] px-4 py-3 rounded-xl bg-black/90 border border-cyan-500/40 text-cyan-200 font-ninja text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
