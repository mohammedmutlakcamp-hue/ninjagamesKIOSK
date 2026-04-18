'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';

const KEY = 'ghanem-shop-unlocked';
const PASSWORD = 'ghanem';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null); // null = checking
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

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
      setInput('');
      setTimeout(() => setError(false), 1200);
    }
  };

  if (unlocked === null) {
    return <div className="min-h-screen bg-black" />;
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(57,255,20,0.15), transparent 50%), radial-gradient(circle at 70% 70%, rgba(57,255,20,0.08), transparent 50%)' }} />
      </div>
      <form onSubmit={tryUnlock} className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.jpeg" alt="Ninja Games" width={72} height={72} className="rounded-2xl shadow-lg shadow-green-500/20 mb-4" />
          <h1 className="font-mono text-xs tracking-[0.3em] text-neutral-500 uppercase mb-1">Internal Preview</h1>
          <h2 className="text-2xl font-bold text-white">Ghanem Shop Pitch</h2>
          <p className="text-sm text-neutral-400 mt-1">Enter access code to view the proposal</p>
        </div>

        <input
          autoFocus
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Access code"
          className={`w-full px-5 py-4 bg-neutral-900 border rounded-2xl text-white placeholder:text-neutral-600 outline-none transition-all ${error ? 'border-red-500 animate-shake' : 'border-neutral-800 focus:border-green-500'}`}
          style={{ boxShadow: error ? '0 0 30px rgba(239,68,68,0.3)' : '0 0 0 transparent' }}
        />
        <button type="submit" className="mt-3 w-full py-4 rounded-2xl bg-[#39FF14] text-black font-bold tracking-wide hover:bg-[#2ee010] transition-colors">
          Unlock
        </button>

        <p className="mt-8 text-center text-[11px] text-neutral-600">
          Confidential — not for public sharing.<br />
          Built as a proposal for Ghanem (owner, Ninja Games).
        </p>
      </form>
      <style jsx>{`
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
        .animate-shake { animation: shake 0.4s; }
      `}</style>
    </div>
  );
}
