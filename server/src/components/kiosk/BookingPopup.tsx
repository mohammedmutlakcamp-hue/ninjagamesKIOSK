'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  collection, onSnapshot, query, where, addDoc, doc, updateDoc, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookingConfig, BookingConfig, DEFAULT_BOOKING_CONFIG } from '@/lib/bookings';
import { Monitor, Clock, X, CheckCircle2, AlertTriangle, Loader2, Calendar } from 'lucide-react';

interface Pc {
  id: string;
  pcName: string;
  status: string;
  zone?: string;
  booked?: boolean;
}

interface Props {
  player: any;
  onClose: () => void;
  onBooked?: (pcName: string) => void;
}

export function BookingPopup({ player, onClose, onBooked }: Props) {
  const [pcs, setPcs] = useState<Pc[]>([]);
  const [bookedPcIds, setBookedPcIds] = useState<Set<string>>(new Set());
  const [cfg, setCfg] = useState<BookingConfig>(DEFAULT_BOOKING_CONFIG);
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';

  useEffect(() => {
    loadBookingConfig().then(setCfg);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      setPcs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pc)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Track which PCs already have an active booking so we don't double-book.
    const q = query(collection(db, 'bookings'), where('status', '==', 'active'));
    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      const now = Date.now();
      snap.docs.forEach(d => {
        const data = d.data() as any;
        if ((data.expiresAt || 0) > now) ids.add(data.pcId);
      });
      setBookedPcIds(ids);
    });
    return () => unsub();
  }, []);

  // Penalty + existing booking guards
  const penaltyUntil = (player as any).penaltyUntil || 0;
  const inPenalty = penaltyUntil > Date.now();
  const penaltyMinutesLeft = Math.max(0, Math.ceil((penaltyUntil - Date.now()) / 60000));

  const availablePcs = pcs.filter(p => (p.status === 'available' || p.status === 'free' || !p.status) && !bookedPcIds.has(p.id));

  const confirmBooking = async () => {
    if (!selected || booking) return;
    if (inPenalty) {
      setError(ar ? `لديك عقوبة فعالة — انتظر ${penaltyMinutesLeft} د` : `You have an active penalty — wait ${penaltyMinutesLeft} min`);
      return;
    }
    // Don't allow two active bookings per player
    try {
      const existingSnap = await getDocs(query(
        collection(db, 'bookings'),
        where('playerId', '==', player.uid),
        where('status', '==', 'active'),
      ));
      const alreadyActive = existingSnap.docs.some(d => ((d.data() as any).expiresAt || 0) > Date.now());
      if (alreadyActive) {
        setError(ar ? 'لديك حجز نشط بالفعل' : 'You already have an active booking');
        return;
      }
    } catch { /* non-fatal */ }

    const pc = pcs.find(p => p.id === selected);
    if (!pc) return;
    setBooking(true);
    setError(null);
    try {
      const now = Date.now();
      const expiresAt = now + cfg.holdMinutes * 60 * 1000;
      const ref = await addDoc(collection(db, 'bookings'), {
        playerId: player.uid,
        playerName: player.username,
        pcId: pc.id,
        pcName: pc.pcName,
        createdAt: now,
        expiresAt,
        status: 'active',
        penaltyApplied: false,
      });
      // Stash id on the player doc so KioskDashboard can listen without a query.
      await updateDoc(doc(db, 'players', player.uid), { activeBookingId: ref.id });
      setSuccess(ar ? `تم حجز ${pc.pcName}!` : `Booked ${pc.pcName}!`);
      onBooked?.(pc.pcName);
      setTimeout(onClose, 1600);
    } catch (err) {
      console.error('booking failed', err);
      setError(ar ? 'فشل الحجز' : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[220] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="relative w-[620px] max-w-[95vw] max-h-[85vh] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #060810 100%)',
          border: '2px solid rgba(0,200,255,0.35)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(0,200,255,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HUD corners */}
        <div className="absolute top-0 left-0 w-4 h-4 z-10" style={{ borderTop: '2px solid #00c8ff', borderLeft: '2px solid #00c8ff' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 z-10" style={{ borderBottom: '2px solid #00c8ff', borderRight: '2px solid #00c8ff' }} />

        <button onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <X size={18} className="text-gray-300" />
        </button>

        <div className="p-7 overflow-y-auto max-h-[85vh]">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(0,200,255,0.2) 0%, transparent 70%)',
                border: '2px solid rgba(0,200,255,0.4)',
                boxShadow: '0 0 24px rgba(0,200,255,0.25)',
              }}>
              <Calendar size={28} className="text-cyan-400" />
            </div>
            <h2 className="font-ninja text-2xl text-cyan-400 tracking-widest mb-1" style={{ textShadow: '0 0 10px rgba(0,200,255,0.4)' }}>
              {ar ? 'احجز جهازاً' : 'BOOK A DEVICE'}
            </h2>
            <p className="font-body text-xs text-gray-400">
              {ar
                ? `احتفظ بجهاز لمدة ${cfg.holdMinutes} دقيقة — خصم ${cfg.deductMinutes}د وعقوبة ${cfg.penaltyMinutes}د إذا لم تسجل دخولك`
                : `Hold any free PC for ${cfg.holdMinutes} min — no-show = −${cfg.deductMinutes}min playtime + ${cfg.penaltyMinutes}min penalty`}
            </p>
          </div>

          {inPenalty && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="font-ninja text-sm text-red-400 tracking-wider">{ar ? 'عقوبة فعالة' : 'PENALTY ACTIVE'}</p>
                <p className="font-body text-xs text-gray-400">
                  {ar ? `الحجز غير متاح لمدة ${penaltyMinutesLeft} دقيقة أخرى` : `Booking locked for another ${penaltyMinutesLeft} min`}
                </p>
              </div>
            </div>
          )}

          {/* Available PCs grid */}
          <div className="bg-black/40 rounded-xl p-4 mb-4 border border-cyan-500/15">
            <p className="text-[10px] font-ninja text-cyan-500/70 tracking-widest mb-3">
              {ar ? `أجهزة متاحة (${availablePcs.length})` : `AVAILABLE DEVICES (${availablePcs.length})`}
            </p>
            {availablePcs.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">{ar ? 'لا توجد أجهزة حرة حالياً' : 'No free PCs right now'}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {availablePcs.map(pc => {
                  const active = selected === pc.id;
                  return (
                    <button key={pc.id} onClick={() => setSelected(pc.id)} disabled={inPenalty}
                      className={`p-3 rounded-lg text-left transition-all ${inPenalty ? 'opacity-40 cursor-not-allowed' : ''}`}
                      style={{
                        background: active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(0,200,255,0.6)' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: active ? '0 0 14px rgba(0,200,255,0.3)' : 'none',
                      }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Monitor size={12} className={active ? 'text-cyan-300' : 'text-gray-500'} />
                        <span className={`font-ninja text-xs ${active ? 'text-cyan-300' : 'text-gray-300'}`}>{pc.pcName}</span>
                      </div>
                      {pc.zone && <span className="text-[9px] text-gray-500 font-body">{pc.zone}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-xs text-center flex items-center justify-center gap-2">
              <CheckCircle2 size={13} /> {success}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={confirmBooking}
            disabled={!selected || booking || inPenalty}
            className="w-full py-3.5 rounded-xl font-ninja text-lg tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
            style={{
              background: selected ? 'linear-gradient(135deg, #00c8ff, #0088cc)' : 'rgba(255,255,255,0.05)',
              color: selected ? '#000' : '#666',
              boxShadow: selected ? '0 0 18px rgba(0,200,255,0.4)' : 'none',
            }}>
            {booking ? <Loader2 size={18} className="animate-spin" /> : <Clock size={18} />}
            {ar ? `حجز لمدة ${cfg.holdMinutes} دقيقة` : `HOLD FOR ${cfg.holdMinutes} MIN`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
