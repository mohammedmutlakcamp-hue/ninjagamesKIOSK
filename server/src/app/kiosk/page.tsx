'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleBackground } from '@/components/ParticleBackground';
import { CyberBackground } from '@/components/CyberBackground';
import { KioskDashboard } from '@/components/kiosk/KioskDashboard';
import { RegisterScreen } from '@/components/kiosk/RegisterScreen';
import { TopUpScreen } from '@/components/kiosk/TopUpScreen';
import { NinjaAvatar } from '@/components/NinjaAvatar';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, orderBy, limit, addDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { LogIn, UserPlus, KeyRound, Loader2, Shield, Coins, Monitor, User, Instagram, Globe, Trophy, Swords, Clock, Crown, Gamepad2, ArrowRight, Sparkles } from 'lucide-react';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import { Lang, t } from '@/lib/translations';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Image from 'next/image';
import { notifyAdmin } from '@/lib/notify-admin';

type Screen = 'login' | 'register' | 'welcome' | 'dashboard' | 'admin-login' | 'killswitch';

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>('login');
  const [lang, setLang] = useState<Lang>('en');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  // Session tracking ref
  const sessionIdRef = useRef<string | null>(null);
  // Hidden admin phrase detection
  const keystrokeBuffer = useRef('');
  const adminPhrase = 'ghanemadmin';
  // PC identity from Electron
  const [pcDocId, setPcDocId] = useState<string | null>(null);
  const [pcNameDisplay, setPcNameDisplay] = useState<string | null>(null);
  // Admin login state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  // Last user who played (persist across reloads)
  const [lastUser, setLastUser] = useState<string | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem('kiosk-last-user');
    if (saved) setLastUser(saved);
  }, []);
  // Login leaderboard
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'playtime' | 'coins_spent' | 'chests_opened'>('playtime');
  // Active/upcoming tournaments (shown on the login screen)
  const [activeTournaments, setActiveTournaments] = useState<any[]>([]);
  // Login-screen side panel open state
  const [tournamentsOpen, setTournamentsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  // Hidden kill switch
  const hiddenClickCount = useRef(0);
  const hiddenClickTimer = useRef<NodeJS.Timeout | null>(null);
  // Kill switch phrase
  const [killPhrase, setKillPhrase] = useState('');
  // Zero-coins top-up overlay on login
  const [showLoginTopUp, setShowLoginTopUp] = useState(false);
  const [zeroCoinsPlayer, setZeroCoinsPlayer] = useState<any>(null);
  // Guest request state
  const [guestRequestPending, setGuestRequestPending] = useState(false);
  const [guestRequestId, setGuestRequestId] = useState<string | null>(null);
  const [guestRequestStatus, setGuestRequestStatus] = useState<string>('');
  const guestRequestTimestamps = useRef<number[]>([]);

  // Load leaderboard on mount — fetch all players so we can sort client-side
  // when the login leaderboard tab changes without re-querying.
  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const snap = await getDocs(collection(db, 'players'));
        setLeaderboard(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      } catch {}
    };
    loadLeaderboard();
  }, []);

  // Subscribe to active/upcoming tournaments for the login-screen panel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tournaments'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((t: any) => t.status === 'active' || t.status === 'registration' || t.status === 'upcoming')
        .sort((a: any, b: any) => (a.startTime || 0) - (b.startTime || 0));
      setActiveTournaments(list);
    });
    return () => unsub();
  }, []);

  // Get PC identity from Electron
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getPcInfo) {
      api.getPcInfo().then((info: any) => {
        if (info?.pcDocId) setPcDocId(info.pcDocId);
        if (info?.pcName) setPcNameDisplay(info.pcName);
      });
    }
    if (api?.onPcInfo) {
      api.onPcInfo((info: any) => {
        if (info?.pcDocId) setPcDocId(info.pcDocId);
        if (info?.pcName) setPcNameDisplay(info.pcName);
      });
    }
  }, []);

  // Update PC status in Firebase
  const updatePcStatus = async (status: string, playerData?: any) => {
    if (!pcDocId) return;
    try {
      const updates: any = { status };
      if (playerData) {
        updates.currentPlayer = playerData.uid;
        updates.currentPlayerName = playerData.username;
        updates.sessionStart = Date.now();
        updates.coinsRemaining = playerData.coins;
      } else {
        updates.currentPlayer = null;
        updates.currentPlayerName = null;
        updates.sessionStart = null;
        updates.coinsRemaining = null;
        updates.minutesRemaining = null;
      }
      await setDoc(doc(db, 'pcs', pcDocId), updates, { merge: true });
    } catch (err) {
      console.error('Failed to update PC status:', err);
    }
  };

  // Listen for hidden admin phrase
  useEffect(() => {
    if (screen !== 'login') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key && e.key.length === 1) {
        keystrokeBuffer.current += e.key.toLowerCase();
        if (keystrokeBuffer.current.length > 50) {
          keystrokeBuffer.current = keystrokeBuffer.current.slice(-50);
        }
        if (keystrokeBuffer.current.includes(adminPhrase)) {
          keystrokeBuffer.current = '';
          setScreen('admin-login');
        }
        if (keystrokeBuffer.current.includes('ghanemexit')) {
          keystrokeBuffer.current = '';
          const api = (window as any).electronAPI;
          if (api?.killSwitch) api.killSwitch();
        }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [screen]);

  // Welcome screen auto-transition
  useEffect(() => {
    if (screen !== 'welcome') return;
    const timer = setTimeout(() => setScreen('dashboard'), 5000);
    return () => clearTimeout(timer);
  }, [screen]);

  const handleLogin = async () => {
    if (!username || !pin) {
      setError(t(lang, 'enter_credentials'));
      return;
    }
    setLoading(true);
    setError('');

    try {
      // First check if username exists at all
      const usernameQ = query(
        collection(db, 'players'),
        where('username', '==', username.toLowerCase())
      );
      const usernameSnap = await getDocs(usernameQ);

      if (usernameSnap.empty) {
        setError(lang === 'ar' ? 'اسم المستخدم غير موجود. أنشئ حساب جديد!' : 'Username not found. Create a new account!');
        setLoading(false);
        return;
      }

      // Username exists, now check PIN
      const q = query(
        collection(db, 'players'),
        where('username', '==', username.toLowerCase()),
        where('pin', '==', pin)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(lang === 'ar' ? 'رمز PIN غير صحيح' : 'Incorrect PIN');
        setLoading(false);
        return;
      }

      const playerDoc = snap.docs[0];
      const playerData = { uid: playerDoc.id, ...playerDoc.data() };

      if ((playerData as any).banned) {
        setError(t(lang, 'account_banned'));
        setLoading(false);
        return;
      }

      const hasTokens = (playerData as any).coins > 0;
      const hasPlaytime = (playerData as any).remainingPlaytime > 0;

      // Block only if NO tokens AND NO playtime
      if (!hasTokens && !hasPlaytime) {
        setError(lang === 'ar' ? 'رصيدك 0! يرجى شحن حسابك للعب 💰' : 'Your balance is 0! Please top up to play 💰');
        setZeroCoinsPlayer(playerData);
        setLoading(false);
        setTimeout(() => setShowLoginTopUp(true), 1000);
        return;
      }

      setPlayer({ ...playerData, coinsAtLogin: (playerData as any).coins, loginTime: Date.now() });
      // Don't block login on lastLogin or PC status update
      updateDoc(doc(db, 'players', playerDoc.id), {
        lastLogin: Date.now(),
        lastPcUsed: pcNameDisplay || 'unknown',
        lastPcId: pcDocId || null,
      }).catch(() => {});
      updatePcStatus('occupied', playerData).catch(() => {});
      // Log session start
      addDoc(collection(db, 'sessions'), {
        playerId: (playerData as any).uid,
        playerName: (playerData as any).username,
        pcId: pcDocId || 'unknown',
        pcName: pcNameDisplay || 'unknown',
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        coinsSpent: 0,
        coinsAtStart: (playerData as any).coins || 0,
      }).then((sessionRef) => {
        sessionIdRef.current = sessionRef.id;
      }).catch(() => {});
      // Tell kiosk to switch to unlocked mode
      const api = (window as any).electronAPI;
      if (api?.sessionLogin) api.sessionLogin();
      if (api?.playerLogin) api.playerLogin({ username: (playerData as any).username, uid: (playerData as any).uid });
      setScreen('welcome');
    } catch (err) {
      setError(t(lang, 'connection_error'));
    }
    setLoading(false);
  };

  const handleHiddenClick = () => {
    hiddenClickCount.current++;
    if (hiddenClickTimer.current) clearTimeout(hiddenClickTimer.current);
    hiddenClickTimer.current = setTimeout(() => { hiddenClickCount.current = 0; }, 3000);
    if (hiddenClickCount.current >= 15) {
      hiddenClickCount.current = 0;
      setScreen('killswitch');
    }
  };

  const handleKillSwitch = () => {
    if (killPhrase.toLowerCase() === 'ghanemexit') {
      const api = (window as any).electronAPI;
      if (api?.killSwitch) api.killSwitch();
    }
  };

  const handleAdminLogin = async () => {
    if (!adminEmail || !adminPassword) {
      setAdminError('Enter email and password');
      return;
    }
    setAdminLoading(true);
    setAdminError('');
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      window.location.href = '/ghanimadmin';
    } catch (err: any) {
      setAdminError('Invalid credentials');
    }
    setAdminLoading(false);
  };

  // Listen for guest request approval
  useEffect(() => {
    if (!guestRequestId) return;
    const unsub = onSnapshot(doc(db, 'guest-requests', guestRequestId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'approved') {
        const minutes = data.approvedMinutes || 30;
        const guestPlayer = {
          uid: 'guest_' + Date.now(),
          username: 'Guest_' + Math.random().toString(36).slice(2, 6),
          coins: 0,
          isGuest: true,
          ninjaType: 'neon',
          inventory: [],
          friends: [],
          stats: {},
          character: { skinColor: '#39FF14' },
          freePlayUntil: Date.now() + minutes * 60 * 1000,
          totalPlaytime: 0,
          loginTime: Date.now(),
          coinsAtLogin: 0,
          vip: null,
          remainingPlaytime: 0,
        };
        setPlayer(guestPlayer);
        updatePcStatus('occupied', guestPlayer).catch(() => {});
        const api = (window as any).electronAPI;
        if (api?.sessionLogin) api.sessionLogin();
        if (api?.playerLogin) api.playerLogin({ username: guestPlayer.username, uid: guestPlayer.uid });
        setGuestRequestPending(false);
        setGuestRequestId(null);
        setGuestRequestStatus('');
        setScreen('dashboard');
      } else if (data.status === 'rejected') {
        setGuestRequestPending(false);
        setGuestRequestId(null);
        setGuestRequestStatus(lang === 'ar' ? 'تم رفض طلب الضيف' : 'Guest request denied');
        setTimeout(() => setGuestRequestStatus(''), 3000);
      }
    });
    return () => unsub();
  }, [guestRequestId, lang]);

  const handleGuestLogin = async () => {
    // Rate limit: max 3 requests per minute per PC
    const now = Date.now();
    guestRequestTimestamps.current = guestRequestTimestamps.current.filter(t => now - t < 60000);
    if (guestRequestTimestamps.current.length >= 3) {
      setGuestRequestStatus(lang === 'ar' ? 'انتظر قليلاً قبل إرسال طلب آخر' : 'Please wait before sending another request');
      setTimeout(() => setGuestRequestStatus(''), 3000);
      return;
    }

    setGuestRequestPending(true);
    setGuestRequestStatus(lang === 'ar' ? 'بانتظار موافقة الإدارة...' : 'Waiting for admin approval...');

    try {
      const docRef = await addDoc(collection(db, 'guest-requests'), {
        pcName: pcNameDisplay || 'Unknown PC',
        pcDocId: pcDocId || null,
        status: 'pending',
        timestamp: Date.now(),
      });
      guestRequestTimestamps.current.push(now);
      setGuestRequestId(docRef.id);
      notifyAdmin('guest_play', 'Guest Play Request', `Guest wants to play on ${pcNameDisplay || 'Unknown PC'}`);
    } catch (err) {
      console.error('Guest request failed:', err);
      setGuestRequestPending(false);
      setGuestRequestStatus(lang === 'ar' ? 'فشل الطلب' : 'Request failed');
      setTimeout(() => setGuestRequestStatus(''), 3000);
    }
  };

  if (screen === 'dashboard' && player) {
    return (
      <KioskDashboard player={player} onLogout={() => {
        if (player.isGuest) {
          // Guest: skip all Firestore operations, just clear state
          updatePcStatus('free');
          const api = (window as any).electronAPI;
          if (api?.sessionLogout) api.sessionLogout();
          if (api?.playerLogout) api.playerLogout();
          setScreen('login'); setPlayer(null); setUsername(''); setPin('');
          return;
        }
        // Log session end
        if (sessionIdRef.current) {
          const endTime = Date.now();
          const sessionDoc = doc(db, 'sessions', sessionIdRef.current);
          updateDoc(sessionDoc, {
            endTime,
            duration: Math.floor((endTime - (player.loginTime || endTime)) / 60000),
            coinsSpent: Math.max(0, (player.coinsAtLogin || player.coins || 0) - (player.coins || 0)),
          }).catch(() => {});
          sessionIdRef.current = null;
        }
        updatePcStatus('free');
        // Track recent users on this PC
        if (pcDocId) {
          const pcRef = doc(db, 'pcs', pcDocId);
          const recentUser = { playerName: player.username, playerId: player.uid, time: Date.now() };
          updateDoc(pcRef, { recentUsers: arrayUnion(recentUser) }).catch(() => {});
        }
        const api = (window as any).electronAPI;
        if (api?.sessionLogout) api.sessionLogout();
        if (api?.playerLogout) api.playerLogout();
        setLastUser(player.username);
        localStorage.setItem('kiosk-last-user', player.username);
        setScreen('login'); setPlayer(null); setUsername(''); setPin('');
      }} />
    );
  }

  if (screen === 'register') {
    return (
      <>
        <ParticleBackground />
        <RegisterScreen onBack={() => setScreen('login')} onRegistered={(p) => {
          // New player has 0 coins — route to login screen with TopUp overlay open.
          // After admin approves the top-up, the player can sign in normally with their PIN.
          setLastUser(p.username);
          try { localStorage.setItem('kiosk-last-user', p.username); } catch {}
          setUsername(p.username);
          setPin('');
          setZeroCoinsPlayer(p);
          setScreen('login');
          setTimeout(() => setShowLoginTopUp(true), 400);
        }} lang={lang} />
      </>
    );
  }

  // Ninjas with welcome screen videos
  const NINJAS_WITH_VIDEO = ['neon', 'shadow', 'fire', 'ice', 'cyber', 'phantom', 'storm', 'venom', 'blood-moon', 'crystal', 'stealth', 'sakura', 'prince-of-persia'];

  // Welcome Back Screen
  if (screen === 'welcome' && player) {
    const ninjaType = player.ninjaType || player.character?.ninjaType || 'neon';
    const hasVideo = NINJAS_WITH_VIDEO.includes(ninjaType);
    return (
      <div className="min-h-screen bg-black relative overflow-hidden" onClick={() => setScreen('dashboard')}>
        <ParticleBackground />
        {/* Black overlay 20% transparent */}
        <div className="absolute inset-0 z-[2] bg-black/20" />

        {/* Centered content */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center">
          {/* Ninja Avatar — big circle */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12 }}
            className="mb-8 relative"
          >
            <div className="rounded-full overflow-hidden relative bg-black" style={{ width: 420, height: 420, boxShadow: '0 0 100px rgba(57, 255, 20, 0.5), 0 0 200px rgba(57, 255, 20, 0.15)', border: '5px solid rgba(57, 255, 20, 0.4)' }}
            >
              {hasVideo ? (
                <video autoPlay muted playsInline className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}>
                  <source src={`/ninjas/videos/${ninjaType}-welcome.mp4`} type="video/mp4" />
                </video>
              ) : (
                <Image
                  src={`/img/pfp-${ninjaType}.png`}
                  alt="Ninja"
                  width={420}
                  height={420}
                  className="object-contain w-full h-full"
                  style={{ background: 'transparent' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            {/* Glow ring */}
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 20px rgba(57, 255, 20, 0.2)',
                  '0 0 50px rgba(57, 255, 20, 0.5)',
                  '0 0 20px rgba(57, 255, 20, 0.2)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-ninja-green/30"
            />
          </motion.div>

          {/* Welcome Back Text */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-ninja text-2xl text-ninja-green mb-2 tracking-widest"
            style={{ textShadow: '0 0 20px rgba(57, 255, 20, 0.5)' }}
          >
            {t(lang, 'welcome_back')}
          </motion.h1>

          {/* Username */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="font-ninja text-5xl text-white mb-3"
            style={{ textShadow: '0 0 30px rgba(57, 255, 20, 0.3)' }}
          >
            {player.username?.toUpperCase()}
          </motion.h2>

          {/* Title */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-gray-400 font-body text-lg mb-4"
          >
            {player.activeTitle || 'Newcomer'}
          </motion.p>

          {/* Coin Balance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9 }}
            className="flex items-center gap-2 px-6 py-2 glass rounded-full border border-ninja-green/20"
          >
            <Coins size={18} className="text-yellow-400" />
            <span className="font-ninja text-xl text-yellow-400">{Math.floor(player.coins || 0)}</span>
            <span className="text-gray-500 font-body text-sm">{t(lang, 'coins')}</span>
          </motion.div>

          {/* Skip hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ delay: 2 }}
            className="text-gray-600 font-body text-sm mt-8"
          >
            {t(lang, 'click_to_skip')}
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ParticleBackground />

      {/* Language Toggle — single flag pill, click to flip */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-30">
        <motion.button
          whileHover={{ scale: 1.05, y: -1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            const next = lang === 'en' ? 'ar' : 'en';
            setLang(next);
            if (typeof window !== 'undefined') localStorage.setItem('kiosk-lang', next);
          }}
          className="group relative flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full overflow-hidden"
          style={{
            background: 'rgba(6,10,14,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(57,255,20,0.35)',
            boxShadow: '0 6px 22px rgba(0,0,0,0.5), 0 0 18px rgba(57,255,20,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
          title={lang === 'en' ? 'Switch to العربية' : 'Switch to English'}
        >
          {/* Subtle green glow pulse */}
          <div className="absolute inset-0 pointer-events-none opacity-60" style={{
            background: 'radial-gradient(ellipse at center, rgba(57,255,20,0.12), transparent 70%)',
          }} />
          {/* Current flag */}
          <motion.img
            key={lang}
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.35 }}
            src={lang === 'en' ? '/img/flag-en.png' : '/img/flag-sa.svg'}
            alt={lang}
            className="relative w-8 h-8 rounded-full object-cover ring-2 ring-ninja-green/40"
          />
          {/* Current lang label */}
          <motion.span
            key={`label-${lang}`}
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="relative font-ninja text-sm tracking-wider text-ninja-green"
            style={{ textShadow: '0 0 8px rgba(57,255,20,0.6)' }}
          >
            {lang === 'en' ? 'ENGLISH' : 'العربية'}
          </motion.span>
          {/* Swap indicator */}
          <div className="relative w-px h-4 bg-ninja-green/25 mx-0.5" />
          <Globe size={14} className="relative text-ninja-green/70 group-hover:text-ninja-green group-hover:rotate-180 transition-all duration-500" />
        </motion.button>
      </div>

      {/* Social Icons — bottom right */}
      <div className="fixed bottom-4 right-5 z-20 flex gap-3">
        <a href="https://instagram.com/ninjagamesjo" target="_blank" rel="noopener" className="w-9 h-9 rounded-lg border border-ninja-green/20 flex items-center justify-center text-ninja-green/50 hover:text-ninja-green hover:border-ninja-green/50 hover:bg-ninja-green/5 transition-all">
          <Instagram size={16} />
        </a>
        <a href="https://ninjagamesjo.com" target="_blank" rel="noopener" className="w-9 h-9 rounded-lg border border-ninja-green/20 flex items-center justify-center text-ninja-green/50 hover:text-ninja-green hover:border-ninja-green/50 hover:bg-ninja-green/5 transition-all">
          <Globe size={16} />
        </a>
      </div>


      {/* Version + Copyright — bottom left (hidden kill switch: click 15 times) */}
      <div className="fixed bottom-4 left-5 z-20 select-none" style={{ opacity: 0.4 }}>
        <div onClick={handleHiddenClick} className="cursor-default">
          <p className="font-body text-[11px] text-gray-400 tracking-wide">Ninja Games Kiosk v10.0.2</p>
          <p className="font-body text-[9px] text-gray-500">&copy; {new Date().getFullYear()} Ninja Games Gaming Center. All rights reserved.</p>
        </div>
      </div>

      <div className="min-h-screen relative z-10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <AnimatePresence mode="wait">
          {screen === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="min-h-screen flex items-center justify-center"
            >
              {/* Login Card */}
              <div className="flex flex-col items-center">
                {/* Last user display */}
                {lastUser && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 flex items-center justify-center gap-2 px-4 py-2 glass rounded-xl border border-ninja-green/10"
                  >
                    <User size={14} className="text-gray-500" />
                    <span className="font-body text-gray-400 text-sm">{t(lang, 'last_player')}:</span>
                    <span className="font-ninja text-ninja-green text-sm">{lastUser.toUpperCase()}</span>
                  </motion.div>
                )}

                <div className="relative w-[440px] max-w-[92vw]">
                  {/* Card body — animated cyberpunk sidebar style (darker) */}
                  <div className="relative z-10 rounded-2xl p-10 overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, #000000 0%, #010204 20%, #02050a 50%, #010204 80%, #000000 100%)',
                      border: '1.5px solid rgba(57,255,20,0.3)',
                      boxShadow: '0 0 40px rgba(57,255,20,0.12), 0 25px 60px rgba(0,0,0,0.95), inset 0 0 50px rgba(0,0,0,0.85)',
                    }}>
                    {/* ═══ Animated sidebar-style background layers ═══ */}
                    <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                    <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                      backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
                      backgroundSize: '32px 32px',
                    }} />
                    <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
                      backgroundSize: '60px 52px',
                    }} />
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 440 760" preserveAspectRatio="none">
                      <path d="M0,80 L100,80 L130,60 L280,60 L310,80 L440,80" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.12" />
                      <path d="M440,220 L300,220 L270,240 L140,240 L110,220 L0,220" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
                      <path d="M0,400 L120,400 L150,380 L300,380 L330,400 L440,400" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
                      <path d="M440,560 L320,560 L290,580 L140,580 L110,560 L0,560" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.07" />
                      <path d="M220,0 L220,60 L190,80 L190,220" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.09" />
                      <circle cx="280" cy="60" r="2.5" fill="#39FF14" opacity="0.25" className="pcb-node-flash" />
                      <circle cx="110" cy="240" r="2" fill="#00c8ff" opacity="0.2" className="pcb-node-flash2" />
                      <circle cx="300" cy="380" r="2" fill="#39FF14" opacity="0.18" className="pcb-node-flash3" />
                      <circle cx="140" cy="580" r="2" fill="#a855f7" opacity="0.15" className="pcb-node-flash" />
                    </svg>
                    {/* Data pulses */}
                    <div className="absolute top-[80px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 14px #39FF14' }} />
                    <div className="absolute top-[400px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
                    <div className="absolute top-0 left-[220px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
                    {/* Scanlines */}
                    <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(57,255,20,0.15)' }} />
                    <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
                    {/* Energy orbs */}
                    <div className="absolute left-[12%] top-[15%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.4)' }} />
                    <div className="absolute left-[75%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
                    <div className="absolute left-[35%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3)' }} />
                    {/* Radial glows */}
                    <div className="absolute inset-0 pointer-events-none z-0" style={{
                      background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.1) 0%, transparent 42%), radial-gradient(ellipse at 30% 50%, rgba(0,200,255,0.05) 0%, transparent 40%), radial-gradient(ellipse at 70% 90%, rgba(168,85,247,0.05) 0%, transparent 40%)',
                    }} />
                    {/* Neon edges */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.6), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 14px rgba(57,255,20,0.4)' }} />
                    <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />
                    <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.35), rgba(168,85,247,0.2), transparent)' }} />
                    {/* HUD corners */}
                    {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                      <div key={ci} className={`absolute ${pos} w-6 h-6 z-[2] pointer-events-none`} style={{
                        ...(pos.includes('top') ? { borderTop: `3px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderBottom: `3px solid ${ci === 2 ? '#00c8ff' : '#a855f7'}` }),
                        ...(pos.includes('left') ? { borderLeft: `3px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderRight: `3px solid ${ci === 1 ? '#00c8ff' : '#a855f7'}` }),
                        filter: 'drop-shadow(0 0 6px currentColor)',
                      }} />
                    ))}

                    {/* ═══ Content (above background) ═══ */}
                    <div className="relative z-[5]">
                    {/* Logo block with pulsing ring */}
                    <div className="relative text-center mb-6">
                      <div className="relative inline-block">
                        <motion.div
                          className="absolute inset-0 rounded-full"
                          animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.15, 0.35] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                            background: 'radial-gradient(circle, rgba(57,255,20,0.3) 0%, transparent 65%)',
                            filter: 'blur(12px)',
                          }}
                        />
                        <img src="/img/ninja-logo.png" alt="Ninja Games" width={312} height={312}
                          className="relative mx-auto"
                          style={{ filter: 'drop-shadow(0 0 18px rgba(57,255,20,0.4))' }} />
                      </div>
                      {/* Terminal-style subtitle */}
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <motion.div
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.4, repeat: Infinity }}
                          className="w-1.5 h-1.5 rounded-full bg-ninja-green"
                          style={{ boxShadow: '0 0 6px #39FF14' }}
                        />
                        <p className="font-mono text-[11px] tracking-[0.3em] text-ninja-green/80 uppercase" style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
                          SYSTEM ONLINE
                        </p>
                        <motion.div
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.4, repeat: Infinity, delay: 0.7 }}
                          className="w-1.5 h-1.5 rounded-full bg-ninja-green"
                          style={{ boxShadow: '0 0 6px #39FF14' }}
                        />
                      </div>
                      {pcNameDisplay && (
                        <div className="flex items-center justify-center gap-1.5 mt-2">
                          <Monitor size={11} className="text-blue-400" />
                          <span className="font-mono text-[10px] text-blue-400/80 tracking-wider">{pcNameDisplay}</span>
                        </div>
                      )}
                    </div>

                    {/* Section label */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.4))' }} />
                      <span className="font-mono text-[10px] tracking-[0.3em] text-ninja-green/70">&gt; AUTHENTICATE</span>
                      <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), transparent)' }} />
                    </div>

                    <div className="space-y-5">
                      {/* Username — modern glass input with animated bottom bar */}
                      <div className="relative group">
                        <div className="relative">
                          <LogIn size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ninja-green/70 z-[2] pointer-events-none group-focus-within:text-ninja-green transition-colors" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }} />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0750-\u077F]/g, ''))}
                            className="relative w-full rounded-lg pl-11 pr-4 py-4 font-mono text-base tracking-wider outline-none transition-all z-[1]"
                            style={{
                              background: 'rgba(8,12,18,0.9)',
                              backdropFilter: 'blur(8px)',
                              border: '1px solid rgba(57,255,20,0.2)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
                              color: '#ffffff',
                              colorScheme: 'dark',
                              WebkitTextFillColor: '#ffffff',
                            }}
                            placeholder={t(lang, 'username_placeholder')}
                            autoFocus
                            onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleLogin()}
                          />
                          {/* Animated bottom bar — grows from center on focus */}
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 group-focus-within:w-full transition-all duration-300 pointer-events-none"
                            style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)', boxShadow: '0 0 8px #39FF14' }}
                          />
                        </div>
                      </div>

                      {/* PIN — modern glass input with dot indicators */}
                      <div className="relative group">
                        <div className="relative">
                          <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ninja-green/70 z-[2] pointer-events-none group-focus-within:text-ninja-green transition-colors" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }} />
                          <input
                            type="password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="relative w-full rounded-lg pl-11 pr-4 py-4 font-mono text-2xl tracking-[0.5em] text-center outline-none transition-all z-[1]"
                            style={{
                              background: 'rgba(8,12,18,0.9)',
                              backdropFilter: 'blur(8px)',
                              border: '1px solid rgba(57,255,20,0.2)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
                              textShadow: '0 0 10px rgba(57,255,20,0.6)',
                              color: '#ffffff',
                              colorScheme: 'dark',
                              WebkitTextFillColor: '#ffffff',
                            }}
                            placeholder="• • • • • •"
                            maxLength={6}
                            onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleLogin()}
                          />
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 group-focus-within:w-full transition-all duration-300 pointer-events-none"
                            style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)', boxShadow: '0 0 8px #39FF14' }}
                          />
                        </div>
                        {/* 6 PIN dot indicators below */}
                        <div className="flex items-center justify-center gap-2 mt-2">
                          {[0, 1, 2, 3, 4, 5].map(i => (
                            <motion.div
                              key={i}
                              animate={{
                                scale: i < pin.length ? 1 : 0.7,
                                opacity: i < pin.length ? 1 : 0.3,
                              }}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                background: i < pin.length ? '#39FF14' : '#374151',
                                boxShadow: i < pin.length ? '0 0 6px #39FF14' : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-4">
                        <p className="text-red-400 font-body">{error}</p>
                        {error.includes('not found') || error.includes('غير موجود') ? (
                          <button
                            onClick={() => setScreen('register')}
                            className="mt-2 text-ninja-green font-ninja text-sm underline underline-offset-4 hover:text-ninja-green/80 transition-all"
                          >
                            {lang === 'ar' ? '← إنشاء حساب جديد' : '→ Create New Account'}
                          </button>
                        ) : null}
                      </motion.div>
                    )}

                    {/* LOGIN — cyberpunk sidebar-layered modern button */}
                    <motion.button
                      whileHover="hover"
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLogin}
                      disabled={loading}
                      className="group relative w-full mt-7 h-[64px] rounded-xl font-bold text-[17px] tracking-wide disabled:opacity-50 flex items-center justify-center gap-3 overflow-hidden"
                      style={{
                        background: 'linear-gradient(180deg, #0d1f14 0%, #06120a 100%)',
                        border: '1px solid rgba(57,255,20,0.55)',
                        boxShadow: '0 0 0 1px rgba(57,255,20,0.15) inset, 0 12px 32px -10px rgba(57,255,20,0.55), 0 6px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
                      }}
                    >
                      {/* Sidebar cyberpunk layers */}
                      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                        backgroundImage: 'linear-gradient(rgba(57,255,20,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.08) 1px, transparent 1px)',
                        backgroundSize: '14px 14px',
                      }} />
                      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern opacity-40" style={{
                        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,200,255,0.22) 1px, transparent 0)',
                        backgroundSize: '10px 10px',
                      }} />
                      {/* PCB traces */}
                      <div className="absolute top-[8px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
                      <div className="absolute bottom-[8px] right-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
                      {/* Scanline */}
                      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5) 50%, transparent)', boxShadow: '0 0 12px rgba(57,255,20,0.25)' }} />
                      {/* Energy orbs */}
                      <div className="absolute left-[10%] top-[25%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.7) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(57,255,20,0.5)' }} />
                      <div className="absolute right-[8%] top-[60%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.6) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.4)' }} />
                      {/* HUD corners */}
                      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-ninja-green/80 pointer-events-none" />
                      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-ninja-green/80 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-ninja-green/80 pointer-events-none" />
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-ninja-green/80 pointer-events-none" />
                      {/* Hover shine sweep */}
                      <motion.div
                        variants={{ hover: { x: ['-120%', '220%'] } }}
                        transition={{ duration: 0.85, ease: 'easeInOut' }}
                        className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
                        style={{
                          background: 'linear-gradient(110deg, transparent 20%, rgba(57,255,20,0.35) 50%, transparent 80%)',
                          filter: 'blur(6px)',
                        }}
                      />
                      {/* Content */}
                      {loading ? (
                        <Loader2 size={22} className="animate-spin relative z-10 text-ninja-green" strokeWidth={2.8} />
                      ) : (
                        <LogIn size={22} className="relative z-10 text-ninja-green" strokeWidth={2.8} style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.8))' }} />
                      )}
                      <span className="relative z-10 font-ninja uppercase text-ninja-green" style={{ textShadow: '0 0 10px rgba(57,255,20,0.7)' }}>
                        {loading ? t(lang, 'connecting') : t(lang, 'login')}
                      </span>
                      {!loading && (
                        <motion.div
                          variants={{ hover: { x: 5 } }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="relative z-10 text-ninja-green"
                          style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.8))' }}
                        >
                          <ArrowRight size={22} strokeWidth={2.8} />
                        </motion.div>
                      )}
                    </motion.button>

                    {/* REGISTER + GUEST — side-by-side with cyberpunk layers */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <motion.button
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setScreen('register')}
                        className="group relative h-[54px] rounded-xl font-semibold text-[13px] tracking-wide flex items-center justify-center gap-2 overflow-hidden transition-colors"
                        style={{
                          background: 'linear-gradient(180deg, rgba(13,31,20,0.7) 0%, rgba(6,18,10,0.85) 100%)',
                          border: '1px solid rgba(74,222,128,0.3)',
                          color: 'rgba(255,255,255,0.9)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.4), 0 0 14px rgba(57,255,20,0.08)',
                        }}
                      >
                        <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade opacity-50" style={{
                          backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
                          backgroundSize: '12px 12px',
                        }} />
                        <div className="absolute top-0 left-[20%] w-2 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
                        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-ninja-green/70 pointer-events-none" />
                        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-ninja-green/70 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-ninja-green/70 pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-ninja-green/70 pointer-events-none" />
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{
                          background: 'linear-gradient(180deg, rgba(74,222,128,0.15), transparent 70%)',
                        }} />
                        <UserPlus size={16} className="text-ninja-green relative z-10" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                        <span className="relative z-10 font-ninja uppercase">
                          {lang === 'ar' ? 'حساب جديد' : 'Register'}
                        </span>
                      </motion.button>
                      <motion.button
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleGuestLogin}
                        disabled={guestRequestPending}
                        className="group relative h-[54px] rounded-xl font-semibold text-[13px] tracking-wide flex items-center justify-center gap-2 overflow-hidden transition-colors disabled:opacity-60 disabled:cursor-wait"
                        style={{
                          background: 'linear-gradient(180deg, rgba(10,20,32,0.7) 0%, rgba(4,10,18,0.85) 100%)',
                          border: '1px solid rgba(0,200,255,0.3)',
                          color: 'rgba(255,255,255,0.9)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.4), 0 0 14px rgba(0,200,255,0.08)',
                        }}
                      >
                        <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade opacity-50" style={{
                          backgroundImage: 'linear-gradient(rgba(0,200,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.06) 1px, transparent 1px)',
                          backgroundSize: '12px 12px',
                        }} />
                        <div className="absolute bottom-0 right-[20%] w-2 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
                        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-cyan-400/70 pointer-events-none" />
                        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-cyan-400/70 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-cyan-400/70 pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-cyan-400/70 pointer-events-none" />
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{
                          background: 'linear-gradient(180deg, rgba(0,200,255,0.15), transparent 70%)',
                        }} />
                        {guestRequestPending ? (
                          <>
                            <Loader2 size={14} className="animate-spin relative z-10 text-cyan-400" />
                            <span className="relative z-10 font-ninja uppercase text-[11px] text-cyan-400">
                              {lang === 'ar' ? 'انتظار' : 'Waiting'}
                            </span>
                          </>
                        ) : (
                          <>
                            <User size={16} className="text-cyan-400 relative z-10" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 0 4px rgba(0,200,255,0.6))' }} />
                            <span className="relative z-10 font-ninja uppercase">
                              {lang === 'ar' ? 'ضيف' : 'Guest'}
                            </span>
                          </>
                        )}
                      </motion.button>
                    </div>
                    {guestRequestStatus && !guestRequestPending && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-2 font-body text-sm text-yellow-400">
                        {guestRequestStatus}
                      </motion.p>
                    )}
                    </div>{/* end z-[5] content wrapper */}
                  </div>
                </div>
              </div>

            </motion.div>
          )}

          {screen === 'killswitch' && (
            <motion.div
              key="killswitch"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong rounded-2xl p-10 w-[420px] max-w-[90vw] border border-red-500/20"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
                  <Shield size={32} className="text-red-400" />
                </div>
                <h1 className="font-ninja text-2xl text-red-400 mb-1">KIOSK EXIT</h1>
                <p className="font-body text-gray-600 text-sm">Enter the exit phrase to close the kiosk</p>
              </div>
              <input
                type="password"
                value={killPhrase}
                onChange={(e) => setKillPhrase(e.target.value)}
                className="w-full bg-black/50 border-2 border-red-500/30 rounded-lg px-4 py-3 text-white font-body mb-4 focus:border-red-400 outline-none transition-all"
                placeholder="Enter exit phrase..."
                autoFocus
                onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleKillSwitch()}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setScreen('login'); setKillPhrase(''); }}
                  className="flex-1 py-3 border border-gray-700 rounded-lg text-gray-500 font-ninja"
                >
                  Cancel
                </button>
                <button
                  onClick={handleKillSwitch}
                  className="flex-1 py-3 bg-red-500/80 text-white rounded-lg font-ninja hover:bg-red-500/90 transition-all"
                >
                  EXIT KIOSK
                </button>
              </div>
            </motion.div>
          )}

          {screen === 'admin-login' && (
            <motion.div
              key="admin-login"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong rounded-2xl p-10 w-[420px] max-w-[90vw] border border-red-500/20"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
                  <Shield size={32} className="text-red-400" />
                </div>
                <h1 className="font-ninja text-2xl text-red-400 mb-1">{t(lang, 'admin_access')}</h1>
                <p className="font-body text-gray-600 text-sm">{t(lang, 'admin_only')}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm font-body mb-1 block">{t(lang, 'email')}</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-black/50 border-2 border-red-500/30 rounded-lg px-4 py-3 text-white font-body focus:border-red-400 outline-none transition-all"
                    placeholder="admin@ninjagames.com"
                    autoFocus
                    onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleAdminLogin()}
                  />
                </div>

                <div>
                  <label className="text-gray-400 text-sm font-body mb-1 block">{t(lang, 'password')}</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-black/50 border-2 border-red-500/30 rounded-lg px-4 py-3 text-white font-body focus:border-red-400 outline-none transition-all"
                    placeholder="Enter password"
                    onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleAdminLogin()}
                  />
                </div>
              </div>

              {adminError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center mt-4 font-body">
                  {adminError}
                </motion.p>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAdminLogin}
                disabled={adminLoading}
                className="w-full mt-6 bg-red-500/80 text-white py-4 rounded-lg font-ninja font-bold text-lg hover:bg-red-500/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {adminLoading ? <Loader2 size={20} className="animate-spin" /> : <Shield size={20} />}
                {adminLoading ? t(lang, 'authenticating') : t(lang, 'admin_login')}
              </motion.button>

              <button
                onClick={() => { setScreen('login'); setAdminError(''); }}
                className="w-full mt-3 py-3 border border-gray-700 rounded-lg text-gray-500 font-body hover:text-gray-400 transition-all"
              >
                {t(lang, 'back_to_login')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active Tournaments — left side dropdown */}
      {screen === 'login' && (
        <div className="fixed left-8 top-8 z-20 flex flex-col items-start pointer-events-auto">
          {/* Toggle button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTournamentsOpen(v => !v)}
            className="relative w-[340px] h-[56px] rounded-xl overflow-hidden flex items-center gap-3 px-4 transition-all"
            style={{
              background: 'linear-gradient(180deg, #000000 0%, #02050a 50%, #000000 100%)',
              border: '1.5px solid rgba(255,111,0,0.5)',
              boxShadow: tournamentsOpen
                ? '0 0 25px rgba(255,111,0,0.3), inset 0 1px 0 rgba(255,111,0,0.3)'
                : '0 0 15px rgba(255,111,0,0.15), inset 0 1px 0 rgba(255,111,0,0.2)',
            }}
          >
            {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
              <div key={ci} className={`absolute ${pos} w-2.5 h-2.5`} style={{
                ...(pos.includes('top') ? { borderTop: '2px solid #FF6F00' } : { borderBottom: '2px solid #FF6F00' }),
                ...(pos.includes('left') ? { borderLeft: '2px solid #FF6F00' } : { borderRight: '2px solid #FF6F00' }),
                filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.6))',
              }} />
            ))}
            <Swords size={20} className="text-orange-400 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,111,0,0.8))' }} />
            <span className="font-ninja text-base tracking-[0.15em] flex-1 text-left" style={{ color: '#FF6F00', textShadow: '0 0 10px rgba(255,111,0,0.5)' }}>
              TOURNAMENTS
            </span>
            <span className="font-ninja text-[10px] text-orange-300/80 tracking-wider">{activeTournaments.length} LIVE</span>
            <motion.div
              animate={{ rotate: tournamentsOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6F00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </motion.div>
          </motion.button>

          {/* Expanded panel */}
          <AnimatePresence>
          {tournamentsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.25 }}
            className="relative w-[340px] rounded-xl overflow-hidden flex flex-col mt-2"
            style={{
              background: 'linear-gradient(180deg, #000000 0%, #010204 20%, #02050a 50%, #010204 80%, #000000 100%)',
              border: '1.5px solid rgba(255,111,0,0.35)',
              boxShadow: '0 0 35px rgba(255,111,0,0.12), inset 0 0 40px rgba(0,0,0,0.8)',
              maxHeight: '70vh',
              height: '560px',
            }}
          >
            {/* ═══ Animated background layers (orange/red tournament theme) ═══ */}
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
            <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
              backgroundImage: 'linear-gradient(rgba(255,111,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,111,0,0.05) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }} />
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23FF6F00' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 52px',
            }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 340 700" preserveAspectRatio="none">
              <path d="M0,60 L80,60 L100,40 L220,40 L240,60 L340,60" stroke="#FF6F00" strokeWidth="0.7" fill="none" opacity="0.1" />
              <path d="M340,220 L240,220 L220,240 L120,240 L100,220 L0,220" stroke="#FFD700" strokeWidth="0.6" fill="none" opacity="0.08" />
              <path d="M0,400 L120,400 L140,380 L240,380 L260,400 L340,400" stroke="#FF6F00" strokeWidth="0.5" fill="none" opacity="0.07" />
              <circle cx="220" cy="40" r="2" fill="#FF6F00" opacity="0.25" className="pcb-node-flash" />
              <circle cx="100" cy="240" r="2" fill="#FFD700" opacity="0.2" className="pcb-node-flash2" />
              <circle cx="240" cy="380" r="2" fill="#FF4500" opacity="0.18" className="pcb-node-flash3" />
            </svg>
            <div className="absolute top-[60px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#FF6F00', boxShadow: '0 0 8px #FF6F00' }} />
            <div className="absolute top-[400px] left-0 w-2.5 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#FFD700', boxShadow: '0 0 8px #FFD700' }} />
            <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,111,0,0.3) 50%, transparent)', boxShadow: '0 0 12px rgba(255,111,0,0.15)' }} />
            <div className="absolute left-[12%] top-[18%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(255,111,0,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(255,111,0,0.4)' }} />
            <div className="absolute right-[15%] top-[50%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.5) 0%, transparent 70%)', boxShadow: '0 0 9px rgba(255,215,0,0.3)' }} />
            <div className="absolute inset-0 pointer-events-none z-0" style={{
              background: 'radial-gradient(ellipse at 50% 0%, rgba(255,111,0,0.1) 0%, transparent 45%), radial-gradient(ellipse at 50% 100%, rgba(255,69,0,0.05) 0%, transparent 45%)',
            }} />
            {/* Neon edges */}
            <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,111,0,0.55), rgba(255,215,0,0.3), transparent)', boxShadow: '0 0 12px rgba(255,111,0,0.35)' }} />
            <div className="absolute top-0 right-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #FF6F00, #FFD700, #FF4500, #FF6F00)', boxShadow: '0 0 6px rgba(255,111,0,0.3)' }} />
            {/* HUD corners */}
            {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
              <div key={ci} className={`absolute ${pos} w-4 h-4 z-[2] pointer-events-none`} style={{
                ...(pos.includes('top') ? { borderTop: '2px solid #FF6F00' } : { borderBottom: '2px solid #FF6F00' }),
                ...(pos.includes('left') ? { borderLeft: '2px solid #FF6F00' } : { borderRight: '2px solid #FF6F00' }),
                filter: 'drop-shadow(0 0 5px rgba(255,111,0,0.7))',
              }} />
            ))}

            {/* ═══ Content ═══ */}
            <div className="relative z-[5] p-5 flex flex-col flex-1 min-h-0">
              {/* Tournament rows */}
              <div className="space-y-2.5 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {activeTournaments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <Swords size={36} className="text-gray-700 mb-3" />
                    <p className="font-ninja text-sm text-gray-500 tracking-wider">NO TOURNAMENTS</p>
                    <p className="font-body text-[11px] text-gray-600 mt-1">Check back soon</p>
                  </div>
                ) : (
                  activeTournaments.map((t: any) => {
                    const isLive = t.status === 'active';
                    const isReg = t.status === 'registration';
                    const statusColor = isLive ? '#EF4444' : isReg ? '#39FF14' : '#00BFFF';
                    const statusGlow = isLive ? '239,68,68' : isReg ? '57,255,20' : '0,191,255';
                    const statusLabel = isLive ? 'LIVE' : isReg ? 'OPEN' : 'SOON';
                    const participantsCount = (t.participants || []).length;
                    // Lookup game banner from the catalog
                    const gameName = t.game || '';
                    const game = GAMES_CATALOG.find(g =>
                      g.name.toLowerCase().includes(gameName.toLowerCase()) ||
                      gameName.toLowerCase().includes(g.name.toLowerCase())
                    );
                    const bannerUrl = game?.bannerImage || game?.coverImage || null;
                    return (
                      <div key={t.id} className="relative rounded-lg overflow-hidden"
                        style={{
                          border: '1px solid rgba(255,111,0,0.4)',
                          boxShadow: '0 0 12px rgba(255,111,0,0.15)',
                          minHeight: '108px',
                        }}>
                        {/* Banner background */}
                        {bannerUrl ? (
                          <img src={bannerUrl} alt={gameName}
                            className="absolute inset-0 w-full h-full object-cover object-center"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="absolute inset-0" style={{
                            background: 'linear-gradient(135deg, rgba(255,111,0,0.2), rgba(20,10,5,0.8))',
                          }} />
                        )}
                        {/* Dark gradient overlay for text readability */}
                        <div className="absolute inset-0" style={{
                          background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.9) 100%), linear-gradient(90deg, rgba(255,111,0,0.15), transparent 60%)',
                        }} />
                        {/* Left glow bar */}
                        <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[2]" style={{ background: '#FF6F00', boxShadow: '0 0 6px #FF6F00', opacity: 0.8 }} />
                        {/* Top-right status badge */}
                        <div className="absolute top-2 right-2 z-[3] px-1.5 py-0.5 rounded font-ninja text-[9px] tracking-wider flex items-center gap-1"
                          style={{
                            background: `rgba(${statusGlow},0.22)`,
                            border: `1px solid rgba(${statusGlow},0.55)`,
                            color: statusColor,
                            boxShadow: `0 0 8px rgba(${statusGlow},0.35)`,
                            textShadow: `0 0 4px rgba(${statusGlow},0.6)`,
                            backdropFilter: 'blur(4px)',
                          }}>
                          {isLive && (
                            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
                              className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ boxShadow: '0 0 4px #EF4444' }} />
                          )}
                          {statusLabel}
                        </div>

                        {/* Text content positioned at bottom */}
                        <div className="absolute left-3 right-3 bottom-2 z-[2]">
                          <p className="font-ninja text-sm text-white truncate" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 8px rgba(255,111,0,0.5)' }}>
                            {t.name || 'TOURNAMENT'}
                          </p>
                          <p className="font-body text-[10px] text-orange-300/90 truncate mt-0.5" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                            {gameName || 'Multi-game'}
                          </p>
                          <div className="flex items-center gap-2.5 mt-1.5 text-[10px]">
                            <span className="flex items-center gap-1 text-yellow-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                              <Trophy size={10} /> {(t.prizePool || 0).toLocaleString()}
                            </span>
                            <span className="flex items-center gap-1 text-cyan-400" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                              <User size={10} /> {participantsCount}/{t.maxPlayers || '?'}
                            </span>
                            {t.entryFee > 0 && (
                              <span className="flex items-center gap-1 text-orange-300" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                                <Coins size={10} /> {t.entryFee}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}

      {/* Leaderboard — right side, vertically centered (3 tabs, cyberpunk styled) */}
      {screen === 'login' && leaderboard.length > 0 && (() => {
        const tabs: { id: 'playtime' | 'coins_spent' | 'chests_opened'; label: string; icon: React.ReactNode; color: string; glow: string }[] = [
          { id: 'playtime',      label: 'PLAYTIME', icon: <Clock size={11} />,  color: '#39FF14', glow: '57,255,20' },
          { id: 'coins_spent',   label: 'TOKENS',   icon: <Coins size={11} />,  color: '#FFD700', glow: '255,215,0' },
          { id: 'chests_opened', label: 'CHESTS',   icon: <Trophy size={11} />, color: '#A855F7', glow: '168,85,247' },
        ];
        const activeTab = tabs.find(t => t.id === leaderboardTab) || tabs[0];
        const getValueFor = (p: any): number => {
          if (leaderboardTab === 'playtime') return p.totalPlaytime || 0;
          if (leaderboardTab === 'coins_spent') return p.totalCoinsSpent || 0;
          if (leaderboardTab === 'chests_opened') return p.stats?.chestsOpened || 0;
          return 0;
        };
        const formatValue = (v: number): string => {
          if (leaderboardTab === 'playtime') return `${Math.floor(v / 60)}h ${v % 60}m`;
          if (leaderboardTab === 'coins_spent') return `${v.toLocaleString()} tok`;
          return `${v.toLocaleString()}`;
        };
        const sorted = [...leaderboard]
          .filter((p: any) => !p.isGuest)
          .sort((a, b) => getValueFor(b) - getValueFor(a))
          .slice(0, 20);
        return (
        <div className="fixed right-8 top-8 z-20 flex flex-col items-end pointer-events-auto">
          {/* Toggle button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setLeaderboardOpen(v => !v)}
            className="relative w-[340px] h-[56px] rounded-xl overflow-hidden flex items-center gap-3 px-4 transition-all"
            style={{
              background: 'linear-gradient(180deg, #000000 0%, #02050a 50%, #000000 100%)',
              border: '1.5px solid rgba(255,215,0,0.5)',
              boxShadow: leaderboardOpen
                ? '0 0 25px rgba(255,215,0,0.3), inset 0 1px 0 rgba(255,215,0,0.3)'
                : '0 0 15px rgba(255,215,0,0.15), inset 0 1px 0 rgba(255,215,0,0.2)',
            }}
          >
            {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
              <div key={ci} className={`absolute ${pos} w-2.5 h-2.5`} style={{
                ...(pos.includes('top') ? { borderTop: '2px solid #FFD700' } : { borderBottom: '2px solid #FFD700' }),
                ...(pos.includes('left') ? { borderLeft: '2px solid #FFD700' } : { borderRight: '2px solid #FFD700' }),
                filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.6))',
              }} />
            ))}
            <Trophy size={20} className="text-yellow-400 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.8))' }} />
            <span className="font-ninja text-base tracking-[0.15em] flex-1 text-left" style={{ color: '#FFD700', textShadow: '0 0 10px rgba(255,215,0,0.5)' }}>
              LEADERBOARD
            </span>
            <span className="font-ninja text-[10px] text-yellow-300/80 tracking-wider">TOP 20</span>
            <motion.div
              animate={{ rotate: leaderboardOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </motion.div>
          </motion.button>

          {/* Expanded panel */}
          <AnimatePresence>
          {leaderboardOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.25 }}
          className="relative w-[340px] rounded-xl overflow-hidden flex flex-col mt-2"
          style={{
            background: 'linear-gradient(180deg, #000000 0%, #010204 20%, #02050a 50%, #010204 80%, #000000 100%)',
            border: '1.5px solid rgba(255,215,0,0.35)',
            boxShadow: '0 0 35px rgba(255,215,0,0.12), inset 0 0 40px rgba(0,0,0,0.8)',
            maxHeight: '70vh',
            height: '560px',
          }}
        >
          {/* ═══ Animated background layers ═══ */}
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
          <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
            backgroundImage: 'linear-gradient(rgba(255,215,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23FFD700' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 52px',
          }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 320 700" preserveAspectRatio="none">
            <path d="M0,60 L80,60 L100,40 L200,40 L220,60 L320,60" stroke="#FFD700" strokeWidth="0.7" fill="none" opacity="0.1" />
            <path d="M320,200 L220,200 L200,220 L100,220 L80,200 L0,200" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
            <path d="M0,360 L100,360 L120,340 L220,340 L240,360 L320,360" stroke="#A855F7" strokeWidth="0.5" fill="none" opacity="0.07" />
            <path d="M320,520 L200,520 L180,540 L80,540 L60,520 L0,520" stroke="#FFD700" strokeWidth="0.5" fill="none" opacity="0.06" />
            <circle cx="200" cy="40" r="2" fill="#FFD700" opacity="0.25" className="pcb-node-flash" />
            <circle cx="80" cy="220" r="2" fill="#39FF14" opacity="0.2" className="pcb-node-flash2" />
            <circle cx="220" cy="340" r="2" fill="#A855F7" opacity="0.18" className="pcb-node-flash3" />
          </svg>
          <div className="absolute top-[60px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#FFD700', boxShadow: '0 0 8px #FFD700' }} />
          <div className="absolute top-[360px] left-0 w-2.5 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
          <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.3) 50%, transparent 100%)', boxShadow: '0 0 12px rgba(255,215,0,0.15)' }} />
          <div className="absolute left-[12%] top-[20%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(255,215,0,0.4)' }} />
          <div className="absolute left-[72%] top-[55%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.5) 0%, transparent 70%)', boxShadow: '0 0 9px rgba(57,255,20,0.35)' }} />
          <div className="absolute inset-0 pointer-events-none z-0" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.1) 0%, transparent 45%), radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.05) 0%, transparent 45%)',
          }} />
          {/* Neon edges */}
          <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.55), rgba(57,255,20,0.3), transparent)', boxShadow: '0 0 12px rgba(255,215,0,0.35)' }} />
          <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #FFD700, #39FF14, #A855F7, #FFD700)', boxShadow: '0 0 6px rgba(255,215,0,0.3)' }} />
          {/* HUD corners */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
            <div key={ci} className={`absolute ${pos} w-4 h-4 z-[2] pointer-events-none`} style={{
              ...(pos.includes('top') ? { borderTop: '2px solid #FFD700' } : { borderBottom: '2px solid #FFD700' }),
              ...(pos.includes('left') ? { borderLeft: '2px solid #FFD700' } : { borderRight: '2px solid #FFD700' }),
              filter: 'drop-shadow(0 0 5px rgba(255,215,0,0.7))',
            }} />
          ))}

          {/* ═══ Content ═══ */}
          <div className="relative z-[5] p-5 flex flex-col flex-1 min-h-0">
            {/* Tabs */}
            <div className="flex gap-1.5 mb-4 flex-shrink-0">
              {tabs.map(tab => {
                const active = leaderboardTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLeaderboardTab(tab.id)}
                    className="relative flex-1 px-2 py-2 rounded-md font-ninja text-[11px] tracking-wider flex items-center justify-center gap-1.5 transition-all overflow-hidden"
                    style={{
                      background: active
                        ? `linear-gradient(135deg, rgba(${tab.glow},0.2), rgba(${tab.glow},0.05))`
                        : 'rgba(255,255,255,0.03)',
                      border: active ? `1px solid rgba(${tab.glow},0.55)` : '1px solid rgba(255,255,255,0.08)',
                      color: active ? tab.color : '#888',
                      boxShadow: active ? `0 0 10px rgba(${tab.glow},0.25)` : 'none',
                      textShadow: active ? `0 0 5px rgba(${tab.glow},0.45)` : 'none',
                    }}
                  >
                    {active && (
                      <>
                        <div className="absolute top-0 left-0 w-1 h-1" style={{ borderTop: `1px solid ${tab.color}`, borderLeft: `1px solid ${tab.color}` }} />
                        <div className="absolute bottom-0 right-0 w-1 h-1" style={{ borderBottom: `1px solid ${tab.color}`, borderRight: `1px solid ${tab.color}` }} />
                      </>
                    )}
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Rows */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {sorted.map((p: any, i: number) => {
                const isTop3 = i < 3;
                const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#6b7280';
                const rankGlow = i === 0 ? '255,215,0' : i === 1 ? '192,192,192' : i === 2 ? '205,127,50' : '107,114,128';
                return (
                  <div key={p.uid} className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-md overflow-hidden"
                    style={{
                      background: isTop3
                        ? `linear-gradient(135deg, rgba(${rankGlow},0.1), rgba(${rankGlow},0.02))`
                        : 'rgba(255,255,255,0.02)',
                      border: isTop3 ? `1px solid rgba(${rankGlow},0.35)` : '1px solid rgba(255,255,255,0.05)',
                      boxShadow: isTop3 ? `0 0 8px rgba(${rankGlow},0.1)` : 'none',
                    }}>
                    <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px]" style={{
                      background: isTop3 ? rankColor : 'rgba(255,255,255,0.1)',
                      boxShadow: isTop3 ? `0 0 6px ${rankColor}` : 'none',
                      opacity: isTop3 ? 0.8 : 0.3,
                    }} />
                    <span className={`font-ninja text-sm w-7 text-center flex-shrink-0`} style={{
                      color: rankColor,
                      textShadow: isTop3 ? `0 0 6px rgba(${rankGlow},0.8)` : 'none',
                    }}>
                      {i === 0 ? <Crown size={16} className="inline" /> : `#${i + 1}`}
                    </span>
                    <span className="font-body text-sm text-white flex-1 truncate" style={{
                      textShadow: isTop3 ? `0 0 6px rgba(${rankGlow},0.4)` : 'none',
                    }}>
                      {p.username?.toUpperCase()}
                    </span>
                    <span className="font-ninja text-xs flex-shrink-0 flex items-center gap-1" style={{ color: activeTab.color }}>
                      {activeTab.icon}
                      {formatValue(getValueFor(p))}
                    </span>
                  </div>
                );
              })}
              {sorted.length === 0 && (
                <p className="font-body text-xs text-gray-600 text-center py-4">No players yet</p>
              )}
            </div>
          </div>
        </motion.div>
          )}
          </AnimatePresence>
        </div>
        );
      })()}

      {/* Top-up overlay for 0-coins player on login screen */}
      {showLoginTopUp && zeroCoinsPlayer && (
        <div className="fixed inset-0 z-[400]">
          <TopUpScreen player={zeroCoinsPlayer} lang={lang} />
          <button
            onClick={() => { setShowLoginTopUp(false); setZeroCoinsPlayer(null); }}
            className="fixed top-6 right-6 z-[500] w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
