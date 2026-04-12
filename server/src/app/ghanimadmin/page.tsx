'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { motion } from 'framer-motion';
import { Shield, Mail, KeyRound, Loader2, ArrowLeft } from 'lucide-react';

export default function AdminPage() {
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
    if (!email || !password) {
      setError('Enter email and password');
      return;
    }
    setLoginLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError('Invalid credentials');
    }
    setLoginLoading(false);
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#86868b]" />
      </div>
    );
  }

  if (user) {
    return <AdminDashboard admin={user} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-[420px] max-w-[90vw]"
      >
        {/* Back button */}
        <div className="mb-8">
          <button
            onClick={() => window.location.href = '/kiosk'}
            className="flex items-center gap-1.5 text-[#0071e3] text-sm font-medium hover:underline transition-all"
          >
            <ArrowLeft size={16} /> Back to Kiosk
          </button>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-10 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#f5f5f7] flex items-center justify-center">
              <Shield size={26} className="text-[#1d1d1f]" />
            </div>
            <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>Admin Panel</h1>
            <p className="text-[#86868b] text-sm">Sign in to manage Ninja Games</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[#1d1d1f] text-xs font-medium mb-1.5 block tracking-wide uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] text-[15px] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all placeholder-[#86868b]"
                placeholder="admin@ninjagames.com"
                autoFocus
                onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleLogin()}
              />
            </div>

            <div>
              <label className="text-[#1d1d1f] text-xs font-medium mb-1.5 block tracking-wide uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] text-[15px] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all placeholder-[#86868b]"
                placeholder="Enter password"
                onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleLogin()}
              />
            </div>
          </div>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[#ff3b30] text-center mt-4 text-sm font-medium">
              {error}
            </motion.p>
          )}

          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full mt-6 bg-[#0071e3] text-white py-3.5 rounded-xl font-medium text-[15px] hover:bg-[#0077ED] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loginLoading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <p className="text-center text-[#86868b] text-xs mt-6">
          Ninja Games Admin &middot; Authorized personnel only
        </p>
      </motion.div>
    </div>
  );
}
