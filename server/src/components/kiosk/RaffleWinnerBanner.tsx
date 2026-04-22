'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAvatarSrcFromFields } from '@/lib/avatar';
import { Raffle, RaffleEntrant } from '@/lib/raffle';
import { Trophy, Crown, X } from 'lucide-react';

// Global banner that announces the raffle winner on every kiosk the moment
// the admin draws. Listens to `raffles/current` and compares drawnAt against
// a per-session ref to only pop for *new* draws — a player who joins mid-
// session shouldn't see a week-old winner announcement.
//
// Mounted once in KioskDashboard; renders nothing until a fresh draw fires.
// Self-dismisses after DISPLAY_MS; player can also tap the X.

const DISPLAY_MS = 14000;

interface Props {
  playerUid?: string;
}

export function RaffleWinnerBanner({ playerUid }: Props) {
  const [show, setShow] = useState(false);
  const [winner, setWinner] = useState<RaffleEntrant | null>(null);
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const lastSeenDrawnAt = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang: 'en' | 'ar' = typeof window !== 'undefined'
    ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en')
    : 'en';
  const ar = lang === 'ar';

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'raffles', 'current'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Raffle;

      // Seed the "last seen" ref on first snapshot so we don't blast the
      // banner for raffles that were already drawn before the player opened
      // their session.
      if (lastSeenDrawnAt.current === null) {
        lastSeenDrawnAt.current = data.drawnAt || 0;
        return;
      }

      if (
        data.status === 'drawn' &&
        typeof data.drawnAt === 'number' &&
        data.drawnAt > (lastSeenDrawnAt.current || 0) &&
        typeof data.winnerIndex === 'number' &&
        Array.isArray(data.entrants) &&
        data.entrants[data.winnerIndex]
      ) {
        lastSeenDrawnAt.current = data.drawnAt;
        setRaffle(data);
        setWinner(data.entrants[data.winnerIndex]);
        setShow(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShow(false), DISPLAY_MS);
      }
    });
    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const isMe = !!winner && !!playerUid && winner.uid === playerUid;
  const rewardLabel = raffle
    ? (ar && raffle.reward.nameAr ? raffle.reward.nameAr : raffle.reward.name)
    : '';

  return (
    <AnimatePresence>
      {show && winner && raffle && (
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          className="fixed left-1/2 -translate-x-1/2 top-6 z-[400] pointer-events-none"
          style={{ width: 'min(92vw, 720px)' }}
        >
          <div
            className="relative pointer-events-auto rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(16,12,4,0.98), rgba(24,18,4,0.98))',
              border: '2px solid rgba(255,215,0,0.75)',
              boxShadow: '0 25px 70px rgba(0,0,0,0.9), 0 0 60px rgba(255,215,0,0.35)',
            }}
          >
            {/* Animated gold glow */}
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{
                boxShadow: [
                  'inset 0 0 30px rgba(255,215,0,0.15)',
                  'inset 0 0 50px rgba(255,215,0,0.35)',
                  'inset 0 0 30px rgba(255,215,0,0.15)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Metallic sweep */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ x: ['-100%', '250%'] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
              style={{
                background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                width: '35%',
              }}
            />
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #FFD700', borderLeft: '2px solid #FFD700' }} />
            <div className="absolute top-0 right-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #FFD700', borderRight: '2px solid #FFD700' }} />
            <div className="absolute bottom-0 left-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #FFD700', borderLeft: '2px solid #FFD700' }} />
            <div className="absolute bottom-0 right-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #FFD700', borderRight: '2px solid #FFD700' }} />

            {/* Close-button shield */}
            <div
              className="absolute top-0 right-0 z-[11] pointer-events-none"
              style={{
                width: 72, height: 56,
                background: 'linear-gradient(225deg, rgba(12,10,4,0.98) 55%, rgba(12,10,4,0.85) 78%, transparent 100%)',
                borderTopRightRadius: 16,
              }}
            />
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 z-[12] w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all"
              style={{ background: 'rgba(12,10,4,0.95)', border: '1px solid rgba(255,215,0,0.4)' }}
            >
              <X size={14} className="text-yellow-300/80" />
            </button>

            <div className="relative z-[5] flex items-center gap-4 p-5 pr-14">
              {/* Winner avatar */}
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.55), transparent 70%)', filter: 'blur(4px)' }} />
                <img
                  src={getAvatarSrcFromFields(winner.profilePhoto, winner.ninjaType)}
                  alt={winner.username}
                  className="relative w-20 h-20 rounded-full object-cover"
                  style={{
                    border: '3px solid #FFD700',
                    boxShadow: '0 0 28px rgba(255,215,0,0.65)',
                  }}
                />
                <motion.div
                  className="absolute -top-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  style={{ background: '#FFD700', boxShadow: '0 0 16px #FFD700' }}
                >
                  <Crown size={16} className="text-black" />
                </motion.div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy size={14} className="text-yellow-400 flex-shrink-0" />
                  <p className="font-ninja text-[11px] tracking-[0.25em] text-yellow-400/90">
                    {ar ? 'فائز اليانصيب' : 'LOTTERY WINNER'}
                  </p>
                </div>
                <p className="font-ninja text-2xl md:text-3xl truncate"
                  style={{
                    background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 0 18px rgba(255,215,0,0.4)',
                  }}>
                  {isMe ? (ar ? 'أنت!' : 'THAT’S YOU!') : winner.username}
                </p>
                <p className="font-body text-sm text-white/90 mt-1 truncate">
                  {ar ? `ربح ${rewardLabel}` : `won ${rewardLabel}`}
                </p>
              </div>
            </div>

            {/* Auto-dismiss progress bar */}
            <motion.div
              className="h-[3px]"
              style={{ background: 'linear-gradient(90deg, #FFD700, #FFA500)' }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: DISPLAY_MS / 1000, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
