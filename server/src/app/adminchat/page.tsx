'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';
import { AdminChatDashboard } from '@/components/admin/AdminChatDashboard';
import { motion } from 'framer-motion';
import { Headphones, Mail, KeyRound, Loader2 } from 'lucide-react';

export default function AdminChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setError('Enter email and password'); return; }
    setLoginLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Invalid credentials');
    }
    setLoginLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-ninja-green" />
      </div>
    );
  }

  // Init OneSignal for admin push notifications
  useEffect(() => {
    if (!user) return;
    const initAdminOneSignal = async () => {
      const ONESIGNAL_APP_ID = '236a3577-a482-4cb5-a810-8daccc0272ff';
      await new Promise<void>((resolve) => {
        if ((window as any).OneSignal) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.async = true;
        script.onload = () => {
          const check = setInterval(() => {
            if ((window as any).OneSignal) { clearInterval(check); resolve(); }
          }, 100);
          setTimeout(() => { clearInterval(check); resolve(); }, 10000);
        };
        document.head.appendChild(script);
        setTimeout(() => resolve(), 10000);
      });
      const OneSignal = (window as any).OneSignal;
      if (!OneSignal) return;
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          notifyButton: { enable: false },
          allowLocalhostAsSecureOrigin: true,
        });
        await OneSignal.login(user.uid);
        await OneSignal.User.addTags({ role: 'admin', username: 'admin' });
        const permission = await OneSignal.Notifications.permission;
        if (!permission) {
          await OneSignal.Notifications.requestPermission();
        }
      } catch (err) {
        console.error('Admin OneSignal init error:', err);
      }
    };
    initAdminOneSignal();
  }, [user]);

  if (user) {
    return <AdminChatDashboard admin={user} />;
  }

  // Login screen (mobile-optimized)
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[380px] rounded-2xl p-8 border border-ninja-green/15"
        style={{ background: 'rgba(15,15,15,0.95)', backdropFilter: 'blur(20px)' }}
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-ninja-green/10 flex items-center justify-center border border-ninja-green/25">
            <Headphones size={28} className="text-ninja-green" />
          </div>
          <h1 className="font-ninja text-2xl text-ninja-green" style={{ textShadow: '0 0 15px rgba(57,255,20,0.3)' }}>
            NINJA OPS
          </h1>
          <p className="font-body text-gray-500 text-xs mt-1">Admin Chat & Orders</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-gray-500 text-[10px] font-body mb-1 block flex items-center gap-1.5">
              <Mail size={11} className="text-ninja-green/60" /> EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-body focus:border-ninja-green/30 outline-none transition-all"
              placeholder="admin@ninjagames.com"
              autoFocus
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[10px] font-body mb-1 block flex items-center gap-1.5">
              <KeyRound size={11} className="text-ninja-green/60" /> PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-body focus:border-ninja-green/30 outline-none transition-all"
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center text-sm mt-3 font-body">
            {error}
          </motion.p>
        )}

        <button
          onClick={handleLogin}
          disabled={loginLoading}
          className="w-full mt-5 bg-ninja-green text-black py-3.5 rounded-xl font-ninja text-base font-bold active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loginLoading ? <Loader2 size={18} className="animate-spin" /> : <Headphones size={18} />}
          {loginLoading ? 'LOGGING IN...' : 'LOGIN'}
        </button>
      </motion.div>
    </div>
  );
}
