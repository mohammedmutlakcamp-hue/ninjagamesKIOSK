'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Loader2, Coins, Globe, Instagram, ExternalLink } from 'lucide-react';
import { Lang, t } from '@/lib/translations';
// ─── OneSignal helpers (SDK init is in root layout.tsx) ──────
function loginOneSignal(playerUid: string, username: string) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  w.OneSignalDeferred = w.OneSignalDeferred || [];
  w.OneSignalDeferred.push(async function(OneSignal: any) {
    try {
      await OneSignal.login(playerUid);
      await OneSignal.User.addTags({ username, uid: playerUid });
      // Request permission
      const perm = await OneSignal.Notifications.permission;
      if (!perm) {
        await OneSignal.Notifications.requestPermission();
      }
    } catch (err) {
      console.error('OneSignal error:', err);
    }
  });
}
import Image from 'next/image';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';
import { MobileRegister } from '@/components/mobile/MobileRegister';
import { VoiceCallProvider } from '@/components/VoiceCallProvider';

type Screen = 'login' | 'register' | 'welcome' | 'dashboard';

// Animated counter hook for welcome screen coins
function useCountUp(target: number, duration: number = 1500, start: boolean = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number;
    let raf: number;
    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

export default function MobileApp() {
  const [screen, setScreen] = useState<Screen>('login');
  const [lang, setLang] = useState<Lang>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('app-lang') as Lang) || 'en' : 'en'
  );
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const pinValue = pin.join('');
  const isReady = username.length > 0 && pinValue.length === 6;

  // Restore persistent session on mount
  useEffect(() => {
    if (typeof window === 'undefined') { setRestoringSession(false); return; }
    try {
      const saved = localStorage.getItem('ninja-player-session');
      if (saved) {
        const data = JSON.parse(saved);
        if (data?.uid) {
          setPlayer(data);
          setScreen('dashboard');
          loginOneSignal(data.uid, data.username);
        }
      }
    } catch {}
    setRestoringSession(false);
  }, []);

  // Welcome auto-transition
  useEffect(() => {
    if (screen !== 'welcome') return;
    const timer = setTimeout(() => setScreen('dashboard'), 2500);
    return () => clearTimeout(timer);
  }, [screen]);

  // Auto-dismiss errors
  useEffect(() => {
    if (!error) return;
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(''), 3500);
    return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); };
  }, [error]);

  const handlePinChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setPin(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }
  }, []);

  const handlePinKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
      setPin(prev => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
    if ((e.key === 'Enter' || e.code === 'NumpadEnter') && isReady) {
      handleLogin();
    }
  }, [pin, isReady]);

  const handleLogin = async () => {
    const currentPin = pin.join('');
    if (!username || currentPin.length !== 6) { setError(t(lang, 'enter_credentials')); return; }
    setLoading(true);
    setError('');
    try {
      const q = query(
        collection(db, 'players'),
        where('username', '==', username.toLowerCase()),
        where('pin', '==', currentPin)
      );
      const snap = await getDocs(q);
      if (snap.empty) { setError(t(lang, 'invalid_credentials')); setLoading(false); return; }

      const playerDoc = snap.docs[0];
      const playerData = { uid: playerDoc.id, ...playerDoc.data() };

      if ((playerData as any).banned) { setError(t(lang, 'account_banned')); setLoading(false); return; }

      setPlayer(playerData);
      localStorage.setItem('ninja-player-session', JSON.stringify(playerData));
      updateDoc(doc(db, 'players', playerDoc.id), { lastLogin: Date.now() }).catch(() => {});

      // Register with OneSignal
      loginOneSignal(playerDoc.id, (playerData as any).username);

      setScreen('welcome');
    } catch {
      setError(t(lang, 'connection_error'));
    }
    setLoading(false);
  };

  // --- Screen: Dashboard ---
  if (screen === 'dashboard' && player) {
    return (
      <VoiceCallProvider player={player}>
        <MobileDashboard player={player} lang={lang} onLogout={() => {
          localStorage.removeItem('ninja-player-session');
          setScreen('login'); setPlayer(null); setUsername(''); setPin(['', '', '', '', '', '']);
        }} />
      </VoiceCallProvider>
    );
  }

  // --- Screen: Register ---
  if (screen === 'register') {
    return <MobileRegister lang={lang} onBack={() => setScreen('login')} onRegistered={(p) => {
      setPlayer(p);
      localStorage.setItem('ninja-player-session', JSON.stringify(p));
      loginOneSignal(p.uid, p.username);
      setScreen('dashboard');
    }} />;
  }

  // Show nothing while restoring session
  if (restoringSession) {
    return <div className="min-h-[100dvh] bg-black" />;
  }

  // --- Screen: Welcome ---
  if (screen === 'welcome' && player) {
    return <WelcomeScreen player={player} lang={lang} onSkip={() => setScreen('dashboard')} />;
  }

  // --- Screen: Login ---
  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col">

      {/* Video Background — FULL brightness, featured */}
      <video ref={videoRef} autoPlay muted loop playsInline
        className="absolute inset-0 w-full h-full object-cover z-0">
        <source src="/img/login-bg.mp4" type="video/mp4" />
      </video>

      {/* Only a bottom gradient so the video is fully visible on top */}
      <div className="absolute inset-0 z-[1]"
        style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.97) 100%)' }} />

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}
          >
            <div className="mx-4 px-5 py-3 rounded-2xl text-sm font-medium text-white text-center max-w-sm"
              style={{
                background: 'rgba(220, 38, 38, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Language Toggle - tiny pill top right */}
      <div className="relative z-10 flex justify-end"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 8px) + 8px)', paddingRight: '16px' }}>
        <div className="flex items-center rounded-full overflow-hidden"
          style={{
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
          {(['en', 'ar'] as Lang[]).map(l => (
            <button key={l} onClick={() => { setLang(l); localStorage.setItem('app-lang', l); }}
              className="relative px-3 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-300"
              style={{ color: lang === l ? '#fff' : 'rgba(255,255,255,0.4)' }}>
              {lang === l && (
                <motion.div layoutId="langPill" className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <span className="relative z-10">{l.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer — pushes login card to bottom so video is visible */}
      <div className="flex-1" />

      {/* Login Card — at bottom, glassmorphism */}
      <div className="relative z-10 px-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl p-6 space-y-5"
          style={{
            background: 'rgba(10,10,10,0.55)',
            backdropFilter: 'blur(50px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(50px) saturate(1.8)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          {/* Title inside the card */}
          <div className="text-center pb-1">
            <h1 className="text-2xl font-bold text-white tracking-[0.2em] font-ninja"
              style={{ textShadow: '0 0 30px rgba(57,255,20,0.25)' }}>
              NINJA GAMES
            </h1>
            <div className="mt-1.5 h-[1px] w-12 mx-auto"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), transparent)' }} />
          </div>

          {/* Username Input */}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0750-\u077F]/g, ''))}
            className="w-full rounded-2xl px-5 py-3.5 text-[15px] text-white font-medium outline-none transition-all duration-300 placeholder:text-white/30"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              caretColor: '#39FF14',
              fontSize: '16px',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(57,255,20,0.35)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(57,255,20,0.08)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            placeholder={t(lang, 'username_placeholder')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
          />

          {/* PIN - 6 digit boxes */}
          <div>
            <p className="text-[10px] font-medium tracking-wider text-white/30 mb-2.5 uppercase text-center">
              {t(lang, 'pin')}
            </p>
            <div className="flex justify-center gap-2" dir="ltr">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <input
                  key={i}
                  ref={el => { pinRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={pin[i]}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-12 h-12 text-center text-xl font-bold text-white rounded-2xl outline-none transition-all duration-300"
                  style={{
                    background: pin[i] ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.06)',
                    border: `1.5px solid ${pin[i] ? 'rgba(57,255,20,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    caretColor: 'transparent',
                    fontSize: '16px',
                    boxShadow: pin[i] ? '0 0 12px rgba(57,255,20,0.1)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Login Button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleLogin}
            disabled={loading || !isReady}
            className="relative w-full py-3.5 rounded-2xl font-bold text-[15px] tracking-wider flex items-center justify-center gap-2 overflow-hidden transition-all duration-300"
            style={{
              background: isReady
                ? 'linear-gradient(135deg, #39FF14, #10B981)'
                : 'rgba(255,255,255,0.07)',
              color: isReady ? '#000' : 'rgba(255,255,255,0.25)',
              boxShadow: isReady ? '0 4px 24px rgba(57,255,20,0.3)' : 'none',
            }}
          >
            {isReady && !loading && (
              <motion.div
                className="absolute inset-0 rounded-2xl"
                animate={{ opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ boxShadow: '0 0 0 2px rgba(57,255,20,0.3)' }}
              />
            )}
            {loading && <Loader2 size={18} className="animate-spin" />}
            <span className="relative z-10">
              {loading ? t(lang, 'connecting') : t(lang, 'login')}
            </span>
          </motion.button>

          {/* Register Link */}
          <button onClick={() => setScreen('register')}
            className="w-full text-center text-[13px] text-white/35 font-medium transition-colors active:text-white/60 py-1">
            {lang === 'ar' ? 'جديد؟ أنشئ حساب' : 'New here? Create account'}
          </button>
        </motion.div>

        {/* Socials — "Check this out" link to info page */}
        <a
          href="https://www.ninjagamesjo.com/info"
          target="_blank"
          rel="noopener"
          className="mt-4 flex items-center justify-center gap-2 text-[12px] text-white/50 hover:text-white/80 transition-colors py-2"
        >
          <Instagram size={14} className="text-ninja-green" />
          <span className="font-medium tracking-wide">
            {lang === 'ar' ? 'تابعنا — شاهد روابطنا' : 'Follow us — check this out'}
          </span>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}


// --- Welcome Screen Component ---
function WelcomeScreen({ player, lang, onSkip }: { player: any; lang: Lang; onSkip: () => void }) {
  const ninjaType = player.ninjaType || 'neon';
  const coins = useCountUp(Math.floor(player.coins || 0), 1200, true);
  return (
    <div
      className="min-h-[100dvh] bg-black flex flex-col items-center justify-center px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={onSkip}
    >
      {/* Avatar */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <div className="w-28 h-28 rounded-full overflow-hidden mx-auto"
          style={{
            border: '2px solid rgba(57,255,20,0.25)',
            boxShadow: '0 0 60px rgba(57,255,20,0.2), 0 0 20px rgba(57,255,20,0.1)',
          }}>
          <Image src={`/img/pfp-${ninjaType}.png`} alt="Avatar" width={112} height={112} className="object-contain" />
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="text-[11px] font-medium tracking-[0.3em] uppercase mt-6"
        style={{ color: 'rgba(57,255,20,0.6)' }}
      >
        {lang === 'ar' ? 'أهلاً بعودتك' : t(lang, 'welcome_back')}
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        className="font-bold text-3xl text-white mt-2 tracking-wide"
      >
        {player.username?.toUpperCase()}
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 20 }}
        className="flex items-center gap-2.5 mt-5 px-6 py-2.5 rounded-full"
        style={{ background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.12)' }}
      >
        <Coins size={16} className="text-yellow-400" />
        <span className="font-bold text-lg tabular-nums" style={{ color: '#FBBF24' }}>
          {coins.toLocaleString()}
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ delay: 1.8 }}
        className="text-[10px] text-white mt-4 tracking-wider uppercase"
      >
        {t(lang, 'click_to_skip')}
      </motion.p>
    </div>
  );
}
