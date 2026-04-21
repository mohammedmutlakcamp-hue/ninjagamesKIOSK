'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const KEY = 'ghanem-shop-unlocked';
const PASSWORD = 'ghanem';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setUnlocked(typeof window !== 'undefined' && localStorage.getItem(KEY) === '1');
  }, []);

  const tryUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim().toLowerCase() === PASSWORD) {
      localStorage.setItem(KEY, '1');
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setInput('');
      setTimeout(() => { setError(false); setShake(false); }, 1200);
    }
  };

  if (unlocked === null) {
    return <div className="min-h-screen bg-white" />;
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      {/* Subtle background texture */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.06) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.04) 0%, transparent 70%)' }} />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.6 }}
        onSubmit={tryUnlock}
        className="relative w-full max-w-sm"
      >
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt="Ninja Games"
            width={64}
            height={64}
            className="rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] mb-5"
          />
          <p className="text-[11px] font-semibold tracking-[0.22em] text-[#a3a3a3] uppercase mb-2">
            Internal Preview
          </p>
          <h1
            className="text-[28px] font-bold text-[#0a0a0a] tracking-tight leading-tight text-center"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            Ghanem Shop Pitch
          </h1>
          <p className="text-sm text-[#525252] mt-1.5 text-center">
            Enter access code to view the proposal
          </p>
        </div>

        <motion.div
          animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <input
            autoFocus
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Access code"
            className={`w-full px-5 py-4 bg-[#f5f5f5] border-2 rounded-xl text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none transition-all text-sm ${
              error
                ? 'border-red-400 bg-red-50'
                : 'border-transparent focus:border-[#39FF14] focus:bg-white'
            }`}
          />
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-xs text-red-500 text-center font-medium"
            >
              Incorrect access code
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          className="mt-4 w-full py-4 rounded-xl bg-[#0a0a0a] text-white font-semibold text-sm tracking-wide hover:bg-[#1a1a1a] transition-colors"
        >
          Unlock
        </button>

        <p className="mt-10 text-center text-[11px] text-[#a3a3a3] leading-relaxed">
          Confidential — not for public sharing.
          <br />
          Built as a proposal for Ghanem (owner, Ninja Games).
        </p>
      </motion.form>
    </div>
  );
}
