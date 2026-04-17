'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, AlertCircle, X } from 'lucide-react';

const LS_KEY = 'beta-welcome-dismissed-v1';
const HOLD_SECONDS = 7;

export function BetaWelcomePopup({ playerId }: { playerId?: string }) {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  // Countdown ticks down from HOLD_SECONDS to 0. The X button is locked
  // and shows the remaining seconds until 0; only then can the popup close.
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(LS_KEY) === '1';
    if (!dismissed) {
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [playerId]);

  // Tick the countdown only while the popup is on-screen.
  useEffect(() => {
    if (!open) return;
    setSecondsLeft(HOLD_SECONDS);
    const id = setInterval(() => {
      setSecondsLeft(s => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [open]);

  const canClose = secondsLeft <= 0;
  const close = () => {
    if (!canClose) return; // unskippable until countdown finishes
    if (dontShow) localStorage.setItem(LS_KEY, '1');
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          /* Backdrop click is intentionally ignored until countdown finishes
             so the popup is truly unskippable for the first HOLD_SECONDS. */
          onClick={canClose ? close : undefined}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[640px] max-w-[92vw] rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, #0a0a0a 0%, #111 60%, #0c0c0c 100%)',
              border: '1px solid rgba(57,255,20,0.4)',
              boxShadow: '0 0 60px rgba(57,255,20,0.25), 0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Glowing top accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)' }} />
            {/* HUD corners */}
            <div className="absolute top-2 left-2 w-4 h-4" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
            <div className="absolute top-2 right-2 w-4 h-4" style={{ borderTop: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
            <div className="absolute bottom-2 left-2 w-4 h-4" style={{ borderBottom: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
            <div className="absolute bottom-2 right-2 w-4 h-4" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />

            {/* Close control. While the countdown is running the X is
                replaced by the remaining seconds and is non-interactive. */}
            <button
              onClick={close}
              disabled={!canClose}
              aria-label={canClose ? 'close' : `wait ${secondsLeft}s`}
              className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full flex items-center justify-center transition"
              style={{
                background: canClose ? 'transparent' : 'rgba(57,255,20,0.08)',
                border: canClose ? 'none' : '1px solid rgba(57,255,20,0.35)',
                color: canClose ? '#9CA3AF' : '#39FF14',
                cursor: canClose ? 'pointer' : 'not-allowed',
                textShadow: canClose ? 'none' : '0 0 8px rgba(57,255,20,0.5)',
              }}
            >
              {canClose
                ? <X size={20} />
                : <span className="font-ninja text-sm tracking-wider">{secondsLeft}</span>}
            </button>

            <div className="px-10 pt-10 pb-7">
              {/* Beta badge */}
              <div className="flex items-center justify-center gap-2 mb-5">
                <span
                  className="font-ninja text-xs tracking-[0.3em] px-3 py-1 rounded-full"
                  style={{
                    color: '#39FF14',
                    background: 'rgba(57,255,20,0.08)',
                    border: '1px solid rgba(57,255,20,0.3)',
                    textShadow: '0 0 8px rgba(57,255,20,0.6)',
                  }}
                >
                  BETA · تجريبي
                </span>
              </div>

              {/* English block */}
              <div className="text-center mb-7" dir="ltr">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles size={18} className="text-ninja-green" />
                  <h2 className="font-ninja text-xl text-white tracking-wider">WELCOME TO THE BETA LAUNCH</h2>
                </div>
                <p className="font-body text-gray-300 text-sm leading-relaxed max-w-[480px] mx-auto">
                  We&apos;re still in the testing phase. Spot any bug, glitch, or issue?{' '}
                  <span className="text-ninja-green font-semibold">Report it to the admin and earn coins</span> as a thank-you.
                  We hope you enjoy the new experience.
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ninja-green/30 to-transparent" />
                <Coins size={14} className="text-ninja-green opacity-60" />
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ninja-green/30 to-transparent" />
              </div>

              {/* Arabic block */}
              <div className="text-center mb-7" dir="rtl">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h2 className="font-ninja text-xl text-white tracking-wider">مرحبًا بك في الإصدار التجريبي</h2>
                  <Sparkles size={18} className="text-ninja-green" />
                </div>
                <p className="font-body text-gray-300 text-sm leading-relaxed max-w-[480px] mx-auto">
                  نحن لا نزال في مرحلة الاختبار. وجدت أي خلل أو مشكلة؟{' '}
                  <span className="text-ninja-green font-semibold">أبلغ الإدارة واحصل على توكنز</span> كمكافأة.
                  نتمنى أن تستمتع بالتجربة الجديدة.
                </p>
              </div>

              {/* Where to report */}
              <div
                className="flex items-start gap-3 mb-6 px-4 py-3 rounded-lg"
                style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)' }}
              >
                <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs leading-relaxed">
                  <span className="text-yellow-300 font-semibold">Report bugs to the admin desk</span>
                  <span className="text-gray-500"> · </span>
                  <span className="text-yellow-300 font-semibold" dir="rtl">أبلغ المشاكل إلى مكتب الإدارة</span>
                </div>
              </div>

              {/* Don't show + close */}
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={dontShow}
                    onChange={(e) => setDontShow(e.target.checked)}
                    className="w-4 h-4 rounded accent-ninja-green cursor-pointer"
                  />
                  <span className="font-body text-xs text-gray-400 group-hover:text-gray-200 transition">
                    Don&apos;t show again · لا تظهر مجدداً
                  </span>
                </label>
                <button
                  onClick={close}
                  disabled={!canClose}
                  className="ninja-btn ninja-btn-green px-8 py-2 font-ninja tracking-wider text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {canClose ? 'GOT IT · حسناً' : `${secondsLeft}s · ${secondsLeft} ث`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
