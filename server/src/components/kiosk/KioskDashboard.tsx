'use client';

import { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Lang, t } from '@/lib/translations';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, addDoc, collection, increment, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { COINS_PER_MINUTE, LOW_BALANCE_WARNING, GRACE_PERIOD_SECONDS, TIME_PACKAGES, COIN_PACKAGES } from '@/lib/constants';
import { launchOnPc } from '@/lib/launch';
import { installLifecycleListeners, dlog } from '@/lib/debug-logger';
import { DebugOverlay } from './DebugOverlay';
import { BetaWelcomePopup } from './BetaWelcomePopup';
import { GamesTab } from './tabs/GamesTab';
import { ChestsTab } from './tabs/ChestsTab';
import { FoodTab } from './tabs/FoodTab';
import { ProfileTab } from './tabs/ProfileTab';
import { LeaderboardTab } from './tabs/LeaderboardTab';
import { InventoryTab } from './tabs/InventoryTab';
import { TournamentTab } from './tabs/TournamentTab';
import { DailyTasksTab } from './tabs/DailyTasksTab';
import { FriendsTab } from './tabs/FriendsTab';
import { SoftwareTab } from './tabs/SoftwareTab';
import { HubblyTab } from './tabs/HubblyTab';
import { StoreTab } from './tabs/StoreTab';
import { VIPTab } from './tabs/VIPTab';
import { ChatBubble } from './ChatBubble';
import { OrderBubble } from './OrderBubble';
import { SupportBubble } from './SupportBubble';
import { KioskVoiceCall } from './KioskVoiceCall';
import { TopUpScreen } from './TopUpScreen';
import { FriendNotification, FriendToast } from './FriendNotification';
import { NinjaAvatar } from '@/components/NinjaAvatar';
import { PlayerProfileCard } from './PlayerProfileCard';
import { ClubInfoCard } from './ClubInfoCard';
import { trackDailyTask } from '@/lib/daily-tasks';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { notifyAdmin } from '@/lib/notify-admin';
import Image from 'next/image';
import {
  Gamepad2, Package, UtensilsCrossed, Trophy, User,
  Coins, LogOut, AlertTriangle, Swords, Backpack, ClipboardCheck,
  Users, ChevronLeft, ChevronRight, Send, Timer, Loader2,
  Monitor, Globe, UserCog, CreditCard, X, Gift, ShoppingBag, Crown, Wrench, Play, Plus, Shield, Eye, EyeOff, Settings, Sparkles, UserPlus, Check, Lock, Flame, Wind, TrendingUp, ArrowRight, Clock
} from 'lucide-react';

type Tab = 'games' | 'chests' | 'food' | 'hubbly' | 'tournaments' | 'inventory' | 'profile' | 'leaderboard' | 'dailytasks' | 'friends' | 'software' | 'store' | 'vip';

// Error Boundary to prevent crashes
class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface Props {
  player: any;
  onLogout: () => void;
}

export function KioskDashboard({ player: initialPlayer, onLogout }: Props) {
  const [lang, setLang] = useState<Lang>(() => (typeof window !== 'undefined' && localStorage.getItem('kiosk-lang') as Lang) || 'en');
  const [tab, setTab] = useState<Tab>('games');
  const [activePopup, setActivePopup] = useState<Tab | null>(null);
  const [player, setPlayer] = useState(initialPlayer);
  const [coins, setCoins] = useState(initialPlayer.isGuest ? 0 : initialPlayer.coins);
  const [remainingPlaytime, setRemainingPlaytime] = useState(initialPlayer.remainingPlaytime || 0); // minutes of playtime left
  const [minutesLeft, setMinutesLeft] = useState(initialPlayer.remainingPlaytime || 0);
  const [secondsLeft, setSecondsLeft] = useState(59);
  const [showBuyTimeOnLogin, setShowBuyTimeOnLogin] = useState(false);
  const [lowBalanceWarning, setLowBalanceWarning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [friendToasts, setFriendToasts] = useState<FriendToast[]>([]);
  const [showSendCoinsModal, setShowSendCoinsModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpSelected, setTopUpSelected] = useState<string | null>(null);
  const [topUpSent, setTopUpSent] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpPlayerName, setTopUpPlayerName] = useState(player?.username || '');
  const [editingTopUpName, setEditingTopUpName] = useState(false);
  // Custom token amount (min 1150). Uses the 1150-package discount rate: 115 tokens / JOD.
  const CUSTOM_TOKEN_MIN = 100;
  const CUSTOM_TOKENS_PER_JOD = 100;
  const [topUpCustomTokens, setTopUpCustomTokens] = useState<string>(''); // string to allow empty/invalid input
  const topUpCustomNum = parseInt(topUpCustomTokens, 10);
  const topUpCustomValid = !isNaN(topUpCustomNum) && topUpCustomNum >= CUSTOM_TOKEN_MIN;
  const topUpCustomPriceJOD = topUpCustomValid ? Math.round((topUpCustomNum / CUSTOM_TOKENS_PER_JOD) * 100) / 100 : 0;
  // Become a User popup for guests
  const [showBecomeUser, setShowBecomeUser] = useState(false);
  const [becomeUserStep, setBecomeUserStep] = useState<string>('info'); // info | waiting | register | form | ninja | package | pendingApproval
  const [adminCode, setAdminCode] = useState('');
  const [adminCodeError, setAdminCodeError] = useState('');
  const [adminCodeLoading, setAdminCodeLoading] = useState(false);
  const [regRequestSending, setRegRequestSending] = useState(false);
  // Registration form fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPhone, setRegPhone] = useState('+962 ');
  const [regPin, setRegPin] = useState('');
  const [regConfirmPin, setRegConfirmPin] = useState('');
  const [regNinja, setRegNinja] = useState('neon');
  const [regCountry, setRegCountry] = useState('jordan');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regSelectedPkg, setRegSelectedPkg] = useState<string | null>(null);
  const [regCustomTokens, setRegCustomTokens] = useState<string>('');
  const regCustomNum = parseInt(regCustomTokens, 10);
  const regCustomValid = !isNaN(regCustomNum) && regCustomNum >= 100;
  const regCustomPriceJOD = regCustomValid ? Math.round((regCustomNum / 100) * 100) / 100 : 0;
  const [regPendingRequestId, setRegPendingRequestId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendPin, setSendPin] = useState('');
  const [sendPinVerified, setSendPinVerified] = useState(false);
  const [sendCountdown, setSendCountdown] = useState(0);
  const sendCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const sendConfirmedRef = useRef(false);
  const [freePlayRemaining, setFreePlayRemaining] = useState(0);
  const [showBuyTimeModal, setShowBuyTimeModal] = useState(false);
  const [buyTimeSelected, setBuyTimeSelected] = useState<string | null>(null);
  const [buyTimeLoading, setBuyTimeLoading] = useState(false);
  const [centerNotification, setCenterNotification] = useState<{ id: string; title: string; message: string; color: string; itemId?: string } | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [hideBalance, setHideBalance] = useState(false);
  const [gameSearch, setGameSearch] = useState('');
  const [gameSearchFocused, setGameSearchFocused] = useState(false);
  const [gameSearchPlaceholderIdx, setGameSearchPlaceholderIdx] = useState(0);
  const gameSearchPlaceholders = ['Search Fortnite...', 'Search CS2...', 'Search Valorant...', 'Search Roblox...', 'Search GTA V...', 'Search Dota 2...', 'Search FIFA 25...', 'Search Minecraft...', 'Search Apex...', 'Search LOL...'];
  const [viewPlayerUid, setViewPlayerUid] = useState<string | null>(null);
  const [viewClubId, setViewClubId] = useState<string | null>(null);
  const [visibleTabs, setVisibleTabs] = useState<Record<string, boolean>>({
    games: true, tournaments: true, food: true,
    dailytasks: false, profile: true, friends: false, chests: true,
    inventory: true, leaderboard: true, software: true,
    store: true, vip: true,
  });

  const dismissToast = useCallback((id: string) => {
    setFriendToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ═══ ESC KEY → close topmost popup ═══
  // Order matters: the most-recently-pushed handler runs first (innermost),
  // so we register outermost first and innermost last. (showLevelUpModal ESC
  // is bound later, once its state is declared.)
  useEscapeKey(() => setActivePopup(null), activePopup !== null);
  useEscapeKey(() => setShowBuyTimeOnLogin(false), showBuyTimeOnLogin);
  useEscapeKey(() => setShowSendCoinsModal(false), showSendCoinsModal);
  useEscapeKey(() => setShowTopUpModal(false), showTopUpModal);
  useEscapeKey(() => setShowBuyTimeModal(false), showBuyTimeModal);
  useEscapeKey(() => setShowBecomeUser(false), showBecomeUser);

  // Rotate game search placeholder
  useEffect(() => {
    if (gameSearchFocused || gameSearch) return;
    const timer = setInterval(() => setGameSearchPlaceholderIdx(i => (i + 1) % gameSearchPlaceholders.length), 2500);
    return () => clearInterval(timer);
  }, [gameSearchFocused, gameSearch, gameSearchPlaceholders.length]);

  // ── Debug overlay state ────────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(false);

  // ── Install debug logger once ──────────────────────────────────────
  useEffect(() => { installLifecycleListeners(); }, []);

  // ── Secret phrases — global keystroke listener ─────────────────────
  //   "ghanemexit"    → kill-switch out of the kiosk
  //   "ghanemrefresh" → hard-reload the webview (pick up new deploy without rebooting)
  //   "ghanemreset"   → full client reset: clear localStorage/sessionStorage + reload
  //   "ghanemdebug"   → toggle on-screen debug overlay (focus/visibility/launch logs)
  useEffect(() => {
    let buf = '';
    const handler = (e: KeyboardEvent) => {
      if (!e.key || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-50);
      if (buf.includes('ghanemexit')) {
        buf = '';
        const api = (window as any).electronAPI;
        if (api?.killSwitch) api.killSwitch();
      }
      if (buf.includes('ghanemrefresh')) {
        buf = '';
        try { window.location.reload(); } catch { window.location.href = window.location.href; }
      }
      if (buf.includes('ghanemreset')) {
        buf = '';
        try { localStorage.clear(); sessionStorage.clear(); } catch {}
        try { window.location.reload(); } catch { window.location.href = window.location.href; }
      }
      if (buf.includes('ghanemdebug')) {
        buf = '';
        setShowDebug(v => { dlog('debug', `overlay ${!v ? 'shown' : 'hidden'}`); return !v; });
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  // Listen for tab switch events (from FriendsTab "Send Gift" etc.)
  const [storeSubTab, setStoreSubTab] = useState<string | null>(null);
  useEffect(() => {
    const handleSwitchTab = (e: CustomEvent) => {
      const targetTab = typeof e.detail === 'string' ? e.detail : e.detail?.tab;
      const subTab = typeof e.detail === 'object' ? e.detail?.subTab : null;
      if (targetTab === 'games') { setActivePopup(null); }
      else if (targetTab) {
        setActivePopup(targetTab);
        if (subTab) setStoreSubTab(subTab);
      }
    };
    window.addEventListener('switch-tab', handleSwitchTab as EventListener);

    // Listen for player profile view events from any child component
    const handleViewProfile = (e: CustomEvent) => {
      const { uid } = e.detail;
      if (!uid) return;
      if (uid === player.uid) {
        // Viewing own profile → open profile settings popup
        setActivePopup('profile');
      } else {
        setViewPlayerUid(uid);
      }
    };
    window.addEventListener('view-player-profile', handleViewProfile as EventListener);

    // Listen for club profile view events
    const handleViewClub = (e: CustomEvent) => {
      const { clubId } = e.detail;
      if (clubId) setViewClubId(clubId);
    };
    window.addEventListener('view-club-profile', handleViewClub as EventListener);

    return () => {
      window.removeEventListener('switch-tab', handleSwitchTab as EventListener);
      window.removeEventListener('view-player-profile', handleViewProfile as EventListener);
      window.removeEventListener('view-club-profile', handleViewClub as EventListener);
    };
  }, [player.uid]);

  // Listen for sidebar visibility config from admin
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'sidebar'), (snap) => {
      if (snap.exists()) {
        setVisibleTabs(prev => ({ ...prev, ...snap.data() }));
      }
    });
    return () => unsub();
  }, []);

  // Load admin configs from Firestore
  const [adminPricing, setAdminPricing] = useState<any>(null);
  const [happyHourActive, setHappyHourActive] = useState(false);
  const [happyHourDiscount, setHappyHourDiscount] = useState(0);
  const [disabledGames, setDisabledGames] = useState<string[]>([]);

  useEffect(() => {
    // Pricing config
    const unsubPricing = onSnapshot(doc(db, 'config', 'pricing'), (snap) => {
      if (snap.exists()) setAdminPricing(snap.data());
    });
    // Happy-hour pricing disabled — flat prices for food/snacks/chests.
    const unsubHappy = () => {};
    // Game availability
    const unsubGames = onSnapshot(doc(db, 'config', 'games'), (snap) => {
      if (snap.exists()) {
        setDisabledGames(snap.data().disabledGames || []);
      }
    });
    return () => { unsubPricing(); unsubHappy(); unsubGames(); };
  }, []);

  // ── Promotions (admin-scheduled time-window bundles) ──
  interface KioskPromotion {
    id: string;
    name: string;
    active: boolean;
    startHour: string;
    endHour: string;
    days: boolean[];
    bundle: { name: string; qty: number }[];
    priceJOD: number;
    priceTokens: number;
    bannerText: string;
    bannerStyle: 'promo' | 'info' | 'urgent';
    ctaLabel: string;
  }
  const [promotions, setPromotions] = useState<KioskPromotion[]>([]);
  const [activePromo, setActivePromo] = useState<KioskPromotion | null>(null);
  const [promoOrderOpen, setPromoOrderOpen] = useState(false);
  const [promoOrderMethod, setPromoOrderMethod] = useState<'cash' | 'tokens'>('cash');
  const [promoOrderBusy, setPromoOrderBusy] = useState(false);
  const [promoOrderResult, setPromoOrderResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Listen for promotions
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promotions'), (snap) => {
      setPromotions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as KioskPromotion));
    });
    return () => unsub();
  }, []);
  // Re-compute the active promo every minute (and whenever the list changes)
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const today = now.getDay();
      const live = promotions.find((p) => {
        if (!p.active) return false;
        if (!p.days?.[today]) return false;
        const [sh, sm] = p.startHour.split(':').map(Number);
        const [eh, em] = p.endHour.split(':').map(Number);
        return nowMin >= sh * 60 + sm && nowMin < eh * 60 + em;
      });
      setActivePromo(live || null);
    };
    tick();
    const iv = setInterval(tick, 60 * 1000);
    return () => clearInterval(iv);
  }, [promotions]);

  // Announcement & maintenance mode listener
  const [announcement, setAnnouncement] = useState<{ active: boolean; title: string; message: string; type: string; duration: number; createdAt: number } | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<{ active: boolean; message: string } | null>(null);
  const announcementTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const unsubAnn = onSnapshot(doc(db, 'config', 'announcement'), (snap) => {
      if (snap.exists() && snap.data().active) {
        const data = snap.data() as any;
        setAnnouncement(data);
        if (data.duration && data.duration > 0) {
          const elapsed = Date.now() - (data.createdAt || 0);
          const remaining = data.duration * 1000 - elapsed;
          if (remaining > 0) {
            if (announcementTimerRef.current) clearTimeout(announcementTimerRef.current);
            announcementTimerRef.current = setTimeout(() => setAnnouncement(null), remaining);
          }
          else setAnnouncement(null);
        }
      } else { setAnnouncement(null); }
    });
    const unsubMaint = onSnapshot(doc(db, 'config', 'maintenance'), (snap) => {
      if (snap.exists() && snap.data().active) setMaintenanceMode(snap.data() as any);
      else setMaintenanceMode(null);
    });
    return () => { unsubAnn(); unsubMaint(); };
  }, []);

  const isGuest = !!initialPlayer.isGuest;

  // Set online status on mount, clear on unmount
  useEffect(() => {
    if (isGuest) return; // Skip Firestore for guests
    const playerRef = doc(db, 'players', initialPlayer.uid);
    updateDoc(playerRef, {
      'onlineStatus.isOnline': true,
      'onlineStatus.currentActivity': 'In lobby',
      'onlineStatus.lastSeen': Date.now(),
      platform: 'kiosk',
    }).catch(() => {});

    // Notify friends that player is online
    const friendIds: string[] = initialPlayer.friends || [];
    if (friendIds.length > 0) {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Friend Online! 🟢',
          message: `${initialPlayer.username} is now online at Ninja Games`,
          targetUids: friendIds,
        }),
      }).catch(() => {});
    }

    return () => {
      updateDoc(playerRef, {
        'onlineStatus.isOnline': false,
        'onlineStatus.currentActivity': '',
        'onlineStatus.lastSeen': Date.now(),
      }).catch(() => {});
    };
  }, [initialPlayer.uid, isGuest]);

  // ── Game-end detection (web-side) ───────────────────────────────────────
  // When a game is launched, the C# client pushes the kiosk window behind
  // the game. If the player closes the game, the kiosk regains visibility.
  // We use that as our "game ended" signal: if the kiosk becomes visible
  // AND at least 10 seconds have passed since the last launch, clear the
  // player's currentActivity back to 'In lobby' so friends stop seeing a
  // ghost game.
  useEffect(() => {
    if (isGuest) return;
    let lastLaunchTs = 0;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const onLaunchResult = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.success) lastLaunchTs = Date.now();
    };
    const onVisibility = () => {
      if (document.hidden) return;
      // Only treat "window back in view" as game-end if we actually launched
      // something at least 10s ago — guards against tab-switch / dev tools.
      if (lastLaunchTs === 0 || Date.now() - lastLaunchTs < 10_000) return;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        updateDoc(doc(db, 'players', initialPlayer.uid), {
          'onlineStatus.currentActivity': 'In lobby',
          'onlineStatus.currentGameId': null,
          'onlineStatus.lastSeen': Date.now(),
        }).catch(() => {});
        lastLaunchTs = 0;
      }, 3000); // 3s dwell so a brief alt-tab doesn't trip it
    };
    window.addEventListener('game-launch-result', onLaunchResult);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      window.removeEventListener('game-launch-result', onLaunchResult);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [initialPlayer.uid, isGuest]);

  useEffect(() => {
    if (isGuest) return; // Skip Firestore listener for guests
    const unsub = onSnapshot(doc(db, 'players', initialPlayer.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const p = { uid: snap.id, ...data };
        setPlayer(p);
        setCoins(data.coins);
        const rp = data.remainingPlaytime || 0;
        setRemainingPlaytime(rp);
        setMinutesLeft(rp);

        // Level-up detection — grant a Common Chest
        const newLevel = levelInfo.level;
        if (newLevel > prevLevelRef.current) {
          setLevelUpNewLevel(newLevel);
          setShowLevelUpModal(true);
          const inv = [...(data.inventory || [])];
          inv.push({ id: `chest_common_lvlup_${Date.now()}`, type: 'chest', tier: 'common', name: 'Common Chest', rarity: 'common', used: false, earnedAt: Date.now(), reason: 'level_up' });
          updateDoc(doc(db, 'players', snap.id), { inventory: inv }).catch(() => {});
        }
        prevLevelRef.current = newLevel;

        // Playtime chest: every 3 hours (180 minutes) → Common chest
        const currentPlaytime = data.totalPlaytime || 0;
        const prevPlaytime = prevPlaytimeRef.current;
        const prevMilestone = Math.floor(prevPlaytime / 180);
        const currentMilestone = Math.floor(currentPlaytime / 180);
        if (currentMilestone > prevMilestone && prevPlaytime > 0) {
          const inv = [...(data.inventory || [])];
          inv.push({ id: `chest_common_playtime_${Date.now()}`, type: 'chest', tier: 'common', name: 'Common Chest', rarity: 'common', used: false, earnedAt: Date.now(), reason: 'playtime_reward' });
          updateDoc(doc(db, 'players', snap.id), { inventory: inv }).catch(() => {});
          setCenterNotification({ id: `playtime-chest-${Date.now()}`, title: lang === 'ar' ? 'مكافأة 3 ساعات!' : '3-HOUR BONUS!', message: lang === 'ar' ? 'حصلت على صندوق عادي مقابل 3 ساعات لعب!' : 'You earned a Common Chest for 3h of play!', color: '#43d9be' });
          setTimeout(() => setCenterNotification(null), 4000);
        }
        prevPlaytimeRef.current = currentPlaytime;
      }
    });
    return () => unsub();
  }, [initialPlayer.uid, isGuest]);

  // Watch for incoming gifts and token transfers
  const prevCoinsRef = useRef(initialPlayer.coins);
  const prevInventoryLenRef = useRef((initialPlayer.inventory || []).filter((i: any) => !i.used).length);
  // Global token-received acknowledgement popup (fires on ANY positive coin delta:
  // admin top-up, friend transfer, chest reward, daily task, tournament prize, etc.)
  const [tokensReceived, setTokensReceived] = useState<{ amount: number; ts: number } | null>(null);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const prevLevelRef = useRef(getLevelInfo(calculateTotalXP(initialPlayer)).level);
  const prevPlaytimeRef = useRef(initialPlayer.totalPlaytime || 0);

  // ESC closes the level-up modal and the view-player-info modal.
  useEscapeKey(() => setShowLevelUpModal(false), showLevelUpModal);
  useEscapeKey(() => setViewPlayerUid(null), viewPlayerUid !== null);

  useEffect(() => {
    const currentCoins = player.coins || 0;
    const currentInventory = (player.inventory || []).filter((i: any) => !i.used);
    const currentInvLen = currentInventory.length;

    // Detect new gift items (inventory grew and latest item has sentBy)
    if (currentInvLen > prevInventoryLenRef.current) {
      const newItems = currentInventory.filter((item: any) => item.sentBy);
      const latest = newItems[newItems.length - 1];
      if (latest && latest.sentBy) {
        setCenterNotification({
          id: `gift-${Date.now()}`,
          title: 'GIFT RECEIVED!',
          message: `${latest.sentBy} sent you "${latest.name}"`,
          color: '#c084fc',
          itemId: latest.id,
        });
        setTimeout(() => setCenterNotification(null), 4000);
      }
    }

    // Detect token gains — any positive delta triggers the received-tokens
    // acknowledgement popup. Source-agnostic: admin top-up, friend transfer,
    // chest reward, daily-task claim, tournament prize — anything that grows
    // the coin field fires this once per change.
    const delta = Math.floor(currentCoins) - Math.floor(prevCoinsRef.current || 0);
    if (delta > 0 && prevCoinsRef.current !== undefined) {
      setTokensReceived({ amount: delta, ts: Date.now() });
    }

    prevCoinsRef.current = currentCoins;
    prevInventoryLenRef.current = currentInvLen;
  }, [player.coins, player.inventory]);

  // Auto-dismiss the tokens-received popup after 4s.
  useEffect(() => {
    if (!tokensReceived) return;
    const t = setTimeout(() => setTokensReceived(null), 4000);
    return () => clearTimeout(t);
  }, [tokensReceived]);

  // Watch friends for online status changes (notifications)
  useEffect(() => {
    const friendIds: string[] = player.friends || [];
    if (friendIds.length === 0) return;

    const previousStatus = new Map<string, { isOnline: boolean; currentActivity: string }>();

    const unsubs = friendIds.map((fid) =>
      onSnapshot(doc(db, 'players', fid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const prev = previousStatus.get(fid);
        const curr = data.onlineStatus;

        if (prev && curr) {
          // Friend came online
          if (!prev.isOnline && curr.isOnline) {
            setFriendToasts((t) => [
              ...t,
              {
                id: `${fid}-online-${Date.now()}`,
                friendName: data.username,
                friendNinjaType: data.ninjaType,
                message: lang === 'ar' ? 'أصبح متصلاً الآن!' : 'Just came online!',
                type: 'online',
              },
            ]);
          }
          // Friend started playing something new (strip "Playing " prefix for a cleaner toast)
          if (curr.isOnline && prev.currentActivity !== curr.currentActivity && curr.currentActivity && curr.currentActivity !== 'In lobby') {
            const gameName = (curr.currentActivity as string).replace(/^Playing\s+/i, '');
            setFriendToasts((t) => [
              ...t,
              {
                id: `${fid}-playing-${Date.now()}`,
                friendName: data.username,
                friendNinjaType: data.ninjaType,
                message: lang === 'ar' ? `بدأ لعب ${gameName}` : `Started playing ${gameName}`,
                type: 'playing',
              },
            ]);
          }
        }

        previousStatus.set(fid, {
          isOnline: curr?.isOnline || false,
          currentActivity: curr?.currentActivity || '',
        });
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [player.friends]);

  // Seconds countdown — ticks every second
  useEffect(() => {
    if (remainingPlaytime <= 0 && freePlayRemaining <= 0) return;
    const tick = setInterval(() => {
      setSecondsLeft(s => (s <= 0 ? 59 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [remainingPlaytime, freePlayRemaining]);

  // Track play time for daily tasks (every 5 minutes)
  useEffect(() => {
    if (isGuest) return; // Skip for guests
    const timer = setInterval(() => {
      trackDailyTask(player.uid, 'play_time', 5);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [player.uid, isGuest]);

  // Playtime deduction every 60 seconds (deducts 1 minute of remainingPlaytime)
  useEffect(() => {
    if (isGuest) return;
    const interval = setInterval(async () => {
      // Skip during free play
      const fpu = player.freePlayUntil;
      if (fpu && fpu > Date.now()) {
        try {
          await updateDoc(doc(db, 'players', player.uid), {
            totalPlaytime: increment(1),
          });
        } catch (err) { /* ignore */ }
        return;
      }

      if (remainingPlaytime <= 0) {
        clearInterval(interval);
        return;
      }
      try {
        await updateDoc(doc(db, 'players', player.uid), {
          remainingPlaytime: increment(-1),
          totalPlaytime: increment(1),
        });
      } catch (err) {
        console.error('Failed to deduct playtime:', err);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [remainingPlaytime, player.uid, player.freePlayUntil, isGuest]);

  // Minimum tokens needed to buy ANY time package
  const minTimePackageCost = Math.min(...TIME_PACKAGES.map(p => p.coins));

  // When playtime runs out — show Buy Time popup (if tokens enough) or Top-Up popup
  useEffect(() => {
    if (isGuest) return;
    const fpu = player.freePlayUntil;
    if (fpu && fpu > Date.now()) return;

    if (remainingPlaytime <= 0) {
      if (coins >= minTimePackageCost) {
        // Has enough tokens to afford at least one time package
        setShowBuyTimeModal(true);
        setBuyTimeSelected(null);
      } else {
        // Not enough tokens (or zero) — show Top-Up modal so they can buy more tokens
        setShowTopUpModal(true);
        setTopUpSelected(null);
        setTopUpSent(false);
      }
      setLowBalanceWarning(true);
    } else if (remainingPlaytime <= 5) {
      setLowBalanceWarning(true);
    } else {
      setLowBalanceWarning(false);
    }
  }, [remainingPlaytime, coins, player.freePlayUntil, isGuest, minTimePackageCost]);

  // Auto-show correct popup on login when playtime is 0
  useEffect(() => {
    if (isGuest) return;
    const fpu = player.freePlayUntil;
    if (fpu && fpu > Date.now()) return;
    if (remainingPlaytime <= 0 && !showBuyTimeOnLogin) {
      setShowBuyTimeOnLogin(true);
      setTimeout(() => {
        if (coins >= minTimePackageCost) {
          setShowBuyTimeModal(true);
          setBuyTimeSelected(null);
        } else {
          setShowTopUpModal(true);
          setTopUpSelected(null);
          setTopUpSent(false);
        }
      }, 1000);
    }
  }, []);

  // Free play countdown timer
  useEffect(() => {
    const fpu = player.freePlayUntil;
    if (!fpu || fpu <= Date.now()) {
      setFreePlayRemaining(0);
      return;
    }
    setFreePlayRemaining(Math.max(0, Math.floor((fpu - Date.now()) / 1000)));
    const iv = setInterval(() => {
      const rem = Math.max(0, Math.floor((fpu - Date.now()) / 1000));
      setFreePlayRemaining(rem);
      if (rem <= 0) {
        clearInterval(iv);
        // Could show a toast here; for now just clear
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [player.freePlayUntil]);

  // Listen for guest registration top-up approval/rejection
  useEffect(() => {
    if (!regPendingRequestId) return;
    const unsub = onSnapshot(doc(db, 'guest-reg-topups', regPendingRequestId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'approved') {
        // Admin approved — create the account and log in
        (async () => {
          try {
            const rd = data.regData;
            const docRef = await addDoc(collection(db, 'players'), {
              ...rd,
              coins: data.coins || 0,
              createdAt: Date.now(),
              lastLogin: Date.now(),
            });
            // Logout guest and go to login so they can sign in
            setShowBecomeUser(false);
            setBecomeUserStep('info');
            setRegPendingRequestId(null);
            onLogout();
          } catch (err) {
            console.error('Failed to create account:', err);
          }
        })();
        unsub();
      } else if (data.status === 'rejected') {
        // Admin rejected — logout entirely, no account
        setShowBecomeUser(false);
        setBecomeUserStep('info');
        setRegPendingRequestId(null);
        onLogout();
        unsub();
      }
    });
    return () => unsub();
  }, [regPendingRequestId]);

  const handleSendCoinsQuick = async () => {
    if (sendLoading) return;
    if (!sendPin || sendPin.length !== 6) { setSendError(lang === 'ar' ? 'أدخل رمز PIN المكون من 6 أرقام' : 'Enter your 6-digit PIN'); return; }
    if (sendPin !== String(player.pin)) { setSendError(lang === 'ar' ? 'رمز PIN غير صحيح' : 'Wrong PIN'); setSendPin(''); return; }
    const amount = parseInt(sendAmount);
    if (!sendTarget.trim()) { setSendError(lang === 'ar' ? 'أدخل اسم المستخدم' : 'Enter a username'); return; }
    if (!amount || amount <= 0) { setSendError(lang === 'ar' ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount'); return; }
    if (Math.ceil(amount * 1.1) > player.coins) { setSendError(lang === 'ar' ? 'التوكنز غير كافية (تشمل رسوم 10%)' : 'Not enough tokens (includes 10% fee)'); return; }
    setSendLoading(true);
    setSendError('');
    setSendSuccess('');
    try {
      const { collection, query, where, getDocs, increment: inc } = await import('firebase/firestore');
      const q = query(collection(db, 'players'), where('username', '==', sendTarget.trim()));
      const snap = await getDocs(q);
      if (snap.empty) { setSendError(lang === 'ar' ? 'اللاعب غير موجود' : 'Player not found'); setSendLoading(false); return; }
      const targetDoc = snap.docs[0];
      if (targetDoc.id === player.uid) { setSendError(lang === 'ar' ? 'لا يمكنك الإرسال لنفسك' : "Can't send to yourself"); setSendLoading(false); return; }
      const fee = Math.ceil(amount * 0.1);
      const batch = writeBatch(db);
      batch.update(doc(db, 'players', player.uid), { coins: inc(-(amount + fee)), totalCoinsSpent: inc(amount + fee) });
      batch.update(doc(db, 'players', targetDoc.id), { coins: inc(amount) });
      await batch.commit();
      addDoc(collection(db, 'coin-transfers'), {
        senderId: player.uid, senderName: player.username,
        receiverId: targetDoc.id, receiverName: targetDoc.data().username,
        amount, type: 'send', timestamp: Date.now()
      }).catch(() => {});
      setSendSuccess(`Sent ${amount} tokens to ${sendTarget}! (${fee} fee burned)`);
      setSendAmount('');
      trackDailyTask(player.uid, 'send_coins').catch(() => {});
      setTimeout(() => { setShowSendCoinsModal(false); setSendSuccess(''); setSendTarget(''); setSendPin(''); setSendPinVerified(false); }, 1500);
    } catch (err) {
      console.error(err);
      setSendError(lang === 'ar' ? 'فشل إرسال التوكنز' : 'Failed to send tokens');
    }
    setSendLoading(false);
  };

  // Tabs that trigger "Become a User" popup for guests
  const guestRestrictedTabs = new Set<Tab>(['chests', 'store', 'inventory', 'vip', 'friends', 'dailytasks', 'leaderboard', 'tournaments']);

  const navItems: { id: Tab; label: string; icon: React.ReactNode; color?: string }[] = ([
    { id: 'games' as Tab, label: t(lang, 'games'), icon: <Gamepad2 size={20} />, color: '#39FF14' },
    { id: 'tournaments' as Tab, label: t(lang, 'tournaments'), icon: <Swords size={20} />, color: '#FF4444' },
    { id: 'software' as Tab, label: t(lang, 'software'), icon: <Monitor size={20} />, color: '#A855F7' },
    { id: 'chests' as Tab, label: t(lang, 'chests'), icon: <Package size={20} />, color: '#00BFFF' },
    { id: 'inventory' as Tab, label: lang === 'ar' ? 'الحقيبة' : 'Inventory', icon: <Backpack size={20} />, color: '#E879F9' },
    { id: 'store' as Tab, label: lang === 'ar' ? 'المتجر' : 'Store', icon: <ShoppingBag size={20} />, color: '#FF6F00' },
    { id: 'food' as Tab, label: lang === 'ar' ? 'الطعام والوجبات' : 'Food & Snacks', icon: <UtensilsCrossed size={20} />, color: '#F97316' },
    { id: 'hubbly' as Tab, label: lang === 'ar' ? 'شيشة' : 'Hubbly Bubbly', icon: <Flame size={20} />, color: '#06B6D4' },
    // VIP moved to bottom section
  ] as { id: Tab; label: string; icon: React.ReactNode; color?: string }[])
    .filter(item => visibleTabs[item.id] !== false);

  const ninjaType = player.ninjaType || player.character?.ninjaType || 'neon';
  const isPlayerVIP = !isGuest && player.vip?.active && (player.vip?.expiresAt || 0) > Date.now();
  const showMainSidebar = true;
  const sidebarW = sidebarCollapsed ? '72px' : '280px';
  const totalXP = calculateTotalXP(player);
  const levelInfo = getLevelInfo(totalXP);
  const effectiveCostPerHour = Math.round(COINS_PER_MINUTE * 60 * (1 - levelInfo.coinRateBonus / 100));

  // Guest auto-logout when free play expires
  if (isGuest && player.freePlayUntil && player.freePlayUntil <= Date.now()) {
    onLogout();
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#0a0a0a] flex"
    >
      <DebugOverlay visible={showDebug} onClose={() => setShowDebug(false)} />
      <BetaWelcomePopup playerId={player?.uid} />
      {/* Maintenance Mode Overlay */}
      {maintenanceMode?.active && (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
          <div className="text-center">
            <Wrench size={64} className="text-yellow-400 mx-auto mb-6 animate-pulse" />
            <h1 className="font-ninja text-4xl text-yellow-400 mb-4">{lang === 'ar' ? 'وضع الصيانة' : 'MAINTENANCE MODE'}</h1>
            <p className="font-body text-xl text-gray-300 max-w-md">{maintenanceMode.message || (lang === 'ar' ? 'النظام قيد الصيانة. الرجاء الانتظار.' : 'System is under maintenance. Please wait.')}</p>
          </div>
        </div>
      )}

      {/* Guest Mode Badge */}
      {isGuest && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[998] px-5 py-1.5 glass rounded-full border border-ninja-green/30 flex items-center gap-2">
          <Gamepad2 size={14} className="text-ninja-green" />
          <span className="font-ninja text-sm text-ninja-green tracking-wider">{lang === 'ar' ? 'وضع الضيف' : 'GUEST MODE'}</span>
          <span className="text-gray-500 font-body text-xs">·</span>
          <button onClick={() => { setShowBecomeUser(true); setBecomeUserStep('info'); }}
            className="font-ninja text-xs text-purple-400 hover:text-purple-300 transition-all underline underline-offset-2">
            {lang === 'ar' ? 'كن نينجا' : 'BECOME A USER'}
          </button>
        </div>
      )}

      {/* Promotion Banner — admin-scheduled time-window bundle with BUY NOW CTA.
          Sits above the Announcement banner so a live deal is always the most prominent callout. */}
      {activePromo && !maintenanceMode?.active && !isGuest && (
        <div className={`fixed top-0 left-0 right-0 z-[1000] py-3 px-6 flex items-center justify-between gap-3 flex-wrap ${
          activePromo.bannerStyle === 'urgent' ? 'bg-red-600' : activePromo.bannerStyle === 'info' ? 'bg-blue-600' : 'bg-gradient-to-r from-green-600 via-emerald-500 to-green-600'
        }`}
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Gift size={20} className="text-white flex-shrink-0" />
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-ninja text-white tracking-wider truncate">
                {activePromo.bannerText || activePromo.name}
              </span>
              <span className="font-body text-white/80 text-sm">
                · {activePromo.priceJOD.toFixed(2)} JOD / {activePromo.priceTokens} tokens
              </span>
            </div>
          </div>
          <button
            onClick={() => { setPromoOrderOpen(true); setPromoOrderResult(null); setPromoOrderMethod('cash'); }}
            className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-white text-green-700 font-ninja tracking-wider text-sm hover:scale-105 active:scale-95 transition-transform"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            {activePromo.ctaLabel || (lang === 'ar' ? 'اشتري الآن' : 'BUY NOW')}
          </button>
        </div>
      )}

      {/* Promo Order Popup */}
      {promoOrderOpen && activePromo && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }}
          onClick={() => !promoOrderBusy && setPromoOrderOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-full rounded-2xl p-6 relative"
            style={{
              background: 'linear-gradient(180deg, #0a0a12 0%, #0c1018 60%, #080810 100%)',
              border: '1px solid rgba(34,197,94,0.4)',
              boxShadow: '0 0 50px rgba(34,197,94,0.15), 0 20px 60px rgba(0,0,0,0.7)',
            }}>
            {/* Close */}
            <button onClick={() => !promoOrderBusy && setPromoOrderOpen(false)}
              className="absolute top-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center bg-black/80 border border-white/10 text-gray-200 hover:rotate-90 transition-all z-[100]">
              <X size={20} strokeWidth={2.4} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)' }}>
                <Gift size={22} className="text-green-400" />
              </div>
              <div>
                <h2 className="font-ninja text-xl text-green-400 tracking-wider">{activePromo.name}</h2>
                <p className="font-body text-gray-400 text-xs">{activePromo.bannerText}</p>
              </div>
            </div>

            {/* Bundle contents */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 mb-4">
              <div className="font-ninja text-[10px] tracking-widest text-green-400/80 mb-2">INCLUDED</div>
              <ul className="space-y-1.5">
                {activePromo.bundle.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-white text-sm">
                    <Check size={14} className="text-green-400 flex-shrink-0" />
                    {b.qty > 1 && <span className="text-green-400 font-semibold">{b.qty}×</span>}
                    <span>{b.name}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Payment method picker */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <button onClick={() => setPromoOrderMethod('cash')}
                className={`rounded-xl px-4 py-3 text-left transition-all ${promoOrderMethod === 'cash' ? 'bg-green-500/15 border border-green-500/50' : 'bg-white/[0.03] border border-white/10'}`}>
                <div className="font-ninja text-[10px] tracking-widest text-gray-400 mb-0.5">PAY CASH</div>
                <div className="font-ninja text-lg text-white">{activePromo.priceJOD.toFixed(2)} <span className="text-xs text-gray-400">JOD</span></div>
              </button>
              <button onClick={() => setPromoOrderMethod('tokens')} disabled={coins < activePromo.priceTokens}
                className={`rounded-xl px-4 py-3 text-left transition-all disabled:opacity-40 ${promoOrderMethod === 'tokens' ? 'bg-yellow-500/15 border border-yellow-500/50' : 'bg-white/[0.03] border border-white/10'}`}>
                <div className="font-ninja text-[10px] tracking-widest text-gray-400 mb-0.5">PAY TOKENS</div>
                <div className="font-ninja text-lg text-yellow-400">{activePromo.priceTokens.toLocaleString()}</div>
                {coins < activePromo.priceTokens && <div className="text-[9px] text-red-400 mt-0.5">Not enough tokens</div>}
              </button>
            </div>

            {/* Confirm */}
            <button
              disabled={promoOrderBusy || (promoOrderMethod === 'tokens' && coins < activePromo.priceTokens)}
              onClick={async () => {
                setPromoOrderBusy(true);
                setPromoOrderResult(null);
                try {
                  const nowTs = Date.now();
                  if (promoOrderMethod === 'tokens') {
                    // Deduct tokens + save order
                    await updateDoc(doc(db, 'players', player.uid), { coins: increment(-activePromo.priceTokens), totalCoinsSpent: increment(activePromo.priceTokens) });
                    await addDoc(collection(db, 'promo-orders'), {
                      playerId: player.uid, playerName: player.username, promoId: activePromo.id, promoName: activePromo.name,
                      bundle: activePromo.bundle, method: 'tokens', tokensPaid: activePromo.priceTokens,
                      status: 'paid', paid: true, paidAt: nowTs, createdAt: nowTs,
                    });
                    notifyAdmin('order', 'Promo Order — PAID (tokens)', `${player.username} bought ${activePromo.name} with ${activePromo.priceTokens} tokens`);
                  } else {
                    // Cash order — admin must confirm at counter
                    await addDoc(collection(db, 'promo-orders'), {
                      playerId: player.uid, playerName: player.username, promoId: activePromo.id, promoName: activePromo.name,
                      bundle: activePromo.bundle, method: 'cash', priceJOD: activePromo.priceJOD,
                      paid: false, paymentMethod: 'cash', status: 'pending', createdAt: nowTs,
                    });
                    notifyAdmin('order', 'Promo Order — UNPAID', `${player.username} ordered ${activePromo.name} · collect ${activePromo.priceJOD.toFixed(2)} JOD at counter`);
                  }
                  setPromoOrderResult({
                    ok: true,
                    msg: promoOrderMethod === 'cash'
                      ? `✅ Ordered! Pay ${activePromo.priceJOD.toFixed(2)} JOD at the counter.`
                      : `✅ Ordered! ${activePromo.priceTokens} tokens deducted. Pick up at counter.`,
                  });
                  setTimeout(() => { setPromoOrderOpen(false); setPromoOrderResult(null); }, 2500);
                } catch (err: any) {
                  setPromoOrderResult({ ok: false, msg: err?.message || 'Order failed' });
                } finally {
                  setPromoOrderBusy(false);
                }
              }}
              className="w-full py-3 rounded-xl font-ninja tracking-wider text-black bg-gradient-to-r from-green-400 via-emerald-400 to-green-400 hover:brightness-110 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {promoOrderBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
              {promoOrderMethod === 'cash'
                ? `ORDER · PAY ${activePromo.priceJOD.toFixed(2)} JOD AT COUNTER`
                : `CONFIRM · −${activePromo.priceTokens} TOKENS`}
            </button>

            {promoOrderResult && (
              <div className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${
                promoOrderResult.ok ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'
              }`}>
                {promoOrderResult.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Announcement Banner */}
      {announcement?.active && !maintenanceMode?.active && (
        <div className={`fixed top-0 left-0 right-0 z-[999] py-3 px-6 flex items-center justify-between ${
          announcement.type === 'urgent' ? 'bg-red-600' : announcement.type === 'warning' ? 'bg-yellow-600' : announcement.type === 'promo' ? 'bg-green-600' : 'bg-blue-600'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-white" />
            <span className="font-ninja text-white">{announcement.title}</span>
            <span className="font-body text-white/80">{announcement.message}</span>
          </div>
          <button onClick={() => setAnnouncement(null)} className="text-white/60 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {/* Left Sidebar — BEAST Cyberpunk HUD */}
      {showMainSidebar && <div
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          width: sidebarW,
          height: '100vh',
          background: isPlayerVIP
            ? 'linear-gradient(180deg, rgba(20,16,8,0.98) 0%, rgba(12,10,6,0.98) 40%, rgba(10,10,12,0.98) 100%)'
            : 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
          borderRight: 'none',
          boxShadow: isPlayerVIP
            ? '0 0 20px rgba(0,0,0,0.3)'
            : '0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        {/* VIP gold accent line at top */}
        {isPlayerVIP && (
          <div className="h-[3px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, rgba(255,140,0,0.6), rgba(255,215,0,0.8), rgba(255,140,0,0.6))' }} />
        )}
        {/* Cyberpunk neon accent line at top */}
        {!isPlayerVIP && (
          <div className="h-[3px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 15px rgba(57,255,20,0.4), 0 2px 20px rgba(0,200,255,0.2)' }} />
        )}
        {/* VIP overlays */}
        {isPlayerVIP && (
          <>
            <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.08) 0%, rgba(255,180,0,0.03) 25%, transparent 50%)' }} />
            <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'linear-gradient(0deg, rgba(255,215,0,0.04) 0%, transparent 30%)' }} />
            <div className="absolute top-0 right-0 bottom-0 w-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.4), rgba(255,215,0,0.1), rgba(255,215,0,0.4))' }} />
          </>
        )}
        {/* ═══ NON-VIP: HEAVY animated background ═══ */}
        {!isPlayerVIP && (
          <>
            {/* Breathing glow on whole sidebar */}
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
            {/* Grid pattern — brighter */}
            <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
              backgroundImage: 'linear-gradient(rgba(57,255,20,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.12) 1px, transparent 1px)',
              backgroundSize: '35px 35px',
            }} />
            {/* Hex overlay pattern */}
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 52px',
            }} />
            {/* Scanline sweep effects */}
            <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 20px rgba(57,255,20,0.15), 0 0 40px rgba(57,255,20,0.05)' }} />
            <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)', boxShadow: '0 0 15px rgba(168,85,247,0.1)' }} />
            {/* Floating energy orbs */}
            <div className="absolute left-[15%] top-[20%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, rgba(57,255,20,0) 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.4), 0 0 25px rgba(57,255,20,0.15)' }} />
            <div className="absolute left-[70%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, rgba(0,200,255,0) 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35), 0 0 20px rgba(0,200,255,0.1)' }} />
            <div className="absolute left-[40%] top-[75%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, rgba(168,85,247,0) 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3), 0 0 20px rgba(168,85,247,0.1)' }} />
            {/* Dense PCB traces — MUCH more visible */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 280 1000" preserveAspectRatio="none">
              {/* Heavy horizontal traces */}
              <path d="M0,50 L60,50 L80,30 L180,30 L200,50 L280,50" stroke="#39FF14" strokeWidth="1.2" fill="none" opacity="0.18" />
              <path d="M280,120 L200,120 L180,140 L100,140 L80,120 L0,120" stroke="#00c8ff" strokeWidth="1" fill="none" opacity="0.15" />
              <path d="M0,200 L70,200 L90,180 L190,180 L210,200 L280,200" stroke="#39FF14" strokeWidth="1" fill="none" opacity="0.14" />
              <path d="M280,300 L210,300 L190,320 L90,320 L70,300 L0,300" stroke="#a855f7" strokeWidth="0.9" fill="none" opacity="0.12" />
              <path d="M0,400 L80,400 L100,380 L200,380 L220,400 L280,400" stroke="#00c8ff" strokeWidth="0.9" fill="none" opacity="0.12" />
              <path d="M280,500 L190,500 L170,520 L110,520 L90,500 L0,500" stroke="#39FF14" strokeWidth="0.9" fill="none" opacity="0.1" />
              <path d="M0,600 L60,600 L80,580 L200,580 L220,600 L280,600" stroke="#00c8ff" strokeWidth="0.8" fill="none" opacity="0.1" />
              <path d="M280,700 L180,700 L160,720 L100,720 L80,700 L0,700" stroke="#a855f7" strokeWidth="0.8" fill="none" opacity="0.09" />
              <path d="M0,800 L90,800 L110,780 L190,780 L210,800 L280,800" stroke="#39FF14" strokeWidth="0.7" fill="none" opacity="0.08" />
              <path d="M280,900 L200,900 L180,920 L80,920 L60,900 L0,900" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.07" />
              {/* Extra diagonal traces for density */}
              <path d="M0,160 L40,160 L70,130 L130,130 L160,160 L200,160" stroke="#39FF14" strokeWidth="0.7" fill="none" opacity="0.08" />
              <path d="M280,250 L230,250 L200,270 L140,270 L110,250 L60,250" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.07" />
              <path d="M0,450 L50,450 L75,430 L170,430 L195,450 L280,450" stroke="#a855f7" strokeWidth="0.6" fill="none" opacity="0.06" />
              <path d="M280,650 L220,650 L195,670 L85,670 L60,650 L0,650" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.06" />
              <path d="M0,850 L70,850 L95,830 L185,830 L210,850 L280,850" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.05" />
              {/* Vertical connections */}
              <path d="M140,0 L140,30 L120,50 L120,140" stroke="#39FF14" strokeWidth="1" fill="none" opacity="0.15" />
              <path d="M200,50 L200,120 L220,140 L220,200" stroke="#00c8ff" strokeWidth="0.9" fill="none" opacity="0.12" />
              <path d="M80,200 L80,300 L60,320 L60,400" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.1" />
              <path d="M210,400 L210,500 L190,520 L190,600" stroke="#00c8ff" strokeWidth="0.8" fill="none" opacity="0.09" />
              <path d="M100,600 L100,700 L120,720 L120,800" stroke="#a855f7" strokeWidth="0.7" fill="none" opacity="0.08" />
              <path d="M50,130 L50,250 L70,270 L70,320" stroke="#a855f7" strokeWidth="0.6" fill="none" opacity="0.06" />
              <path d="M230,270 L230,400 L210,430 L210,450" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.06" />
              {/* IC chip pads — brighter */}
              <rect x="136" y="26" width="8" height="8" rx="1.5" fill="none" stroke="#39FF14" strokeWidth="1.2" opacity="0.22" />
              <rect x="196" y="116" width="8" height="8" rx="1.5" fill="none" stroke="#00c8ff" strokeWidth="1" opacity="0.18" />
              <rect x="76" y="196" width="8" height="8" rx="1.5" fill="none" stroke="#39FF14" strokeWidth="1" opacity="0.15" />
              <rect x="206" y="396" width="8" height="8" rx="1.5" fill="none" stroke="#00c8ff" strokeWidth="0.9" opacity="0.12" />
              <rect x="96" y="596" width="8" height="8" rx="1.5" fill="none" stroke="#a855f7" strokeWidth="0.9" opacity="0.1" />
              <rect x="46" y="246" width="6" height="6" rx="1" fill="none" stroke="#a855f7" strokeWidth="0.7" opacity="0.08" />
              <rect x="226" y="646" width="6" height="6" rx="1" fill="none" stroke="#39FF14" strokeWidth="0.7" opacity="0.08" />
              {/* Pulsing via holes — bigger, brighter */}
              <circle cx="140" cy="30" r="4" fill="#39FF14" opacity="0.3" className="pcb-node-flash" />
              <circle cx="200" cy="120" r="3.5" fill="#00c8ff" opacity="0.25" className="pcb-node-flash2" />
              <circle cx="80" cy="200" r="3.5" fill="#39FF14" opacity="0.2" className="pcb-node-flash3" />
              <circle cx="210" cy="400" r="3" fill="#00c8ff" opacity="0.2" className="pcb-node-flash" />
              <circle cx="100" cy="600" r="3" fill="#a855f7" opacity="0.2" className="pcb-node-flash2" />
              <circle cx="140" cy="800" r="2.5" fill="#39FF14" opacity="0.15" className="pcb-node-flash3" />
              {/* Extra nodes */}
              <circle cx="50" cy="250" r="2.5" fill="#a855f7" opacity="0.15" className="pcb-node-flash4" />
              <circle cx="230" cy="650" r="2.5" fill="#39FF14" opacity="0.12" className="pcb-node-flash4" />
              <circle cx="160" cy="500" r="3" fill="#00c8ff" opacity="0.18" className="pcb-node-flash3" />
              <circle cx="60" cy="450" r="2" fill="#39FF14" opacity="0.15" className="pcb-node-flash" />
              <circle cx="220" cy="270" r="2" fill="#00c8ff" opacity="0.12" className="pcb-node-flash2" />
              {/* Glow halos around key nodes */}
              <circle cx="140" cy="30" r="10" fill="none" stroke="#39FF14" strokeWidth="0.5" opacity="0.08" className="pcb-node-flash" />
              <circle cx="200" cy="120" r="8" fill="none" stroke="#00c8ff" strokeWidth="0.4" opacity="0.06" className="pcb-node-flash2" />
              <circle cx="100" cy="600" r="8" fill="none" stroke="#a855f7" strokeWidth="0.4" opacity="0.06" className="pcb-node-flash2" />
            </svg>
            {/* Animated data pulses along traces — more, brighter */}
            <div className="absolute top-[50px] left-0 w-5 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 10px #39FF14, 0 0 20px #39FF14, 0 0 30px rgba(57,255,20,0.3)' }} />
            <div className="absolute top-[200px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 10px #00c8ff, 0 0 20px #00c8ff' }} />
            <div className="absolute top-[400px] left-0 w-4 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 16px #39FF14' }} />
            <div className="absolute top-[300px] right-0 w-4 h-[2px] rounded-full pcb-pulse-h3 z-0" style={{ background: '#a855f7', boxShadow: '0 0 10px #a855f7, 0 0 18px #a855f7' }} />
            <div className="absolute top-[600px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h4 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff, 0 0 15px #00c8ff' }} />
            <div className="absolute top-0 left-[140px] w-[2px] h-4 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 10px #39FF14, 0 0 20px #39FF14' }} />
            <div className="absolute top-0 left-[200px] w-[2px] h-3 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff, 0 0 16px #00c8ff' }} />
            <div className="absolute top-0 left-[80px] w-[2px] h-3 rounded-full pcb-pulse-v3 z-0" style={{ background: '#a855f7', boxShadow: '0 0 8px #a855f7, 0 0 16px #a855f7' }} />
            {/* Heavy radial glow spots — brighter, more of them */}
            <div className="absolute inset-0 pointer-events-none z-0" style={{
              background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.12) 0%, transparent 40%), radial-gradient(ellipse at 30% 40%, rgba(0,200,255,0.08) 0%, transparent 30%), radial-gradient(ellipse at 70% 70%, rgba(168,85,247,0.07) 0%, transparent 30%), radial-gradient(ellipse at 50% 95%, rgba(57,255,20,0.1) 0%, transparent 40%), radial-gradient(ellipse at 20% 65%, rgba(57,255,20,0.06) 0%, transparent 25%), radial-gradient(ellipse at 80% 25%, rgba(0,200,255,0.06) 0%, transparent 25%)',
            }} />
            {/* Right edge neon glow — wider, brighter with breathing */}
            <div className="absolute top-0 right-0 bottom-0 w-[3px] pointer-events-none z-0 sidebar-edge-glow" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 12px rgba(57,255,20,0.5), -3px 0 20px rgba(57,255,20,0.15), -6px 0 40px rgba(0,200,255,0.08)' }} />
            {/* Bottom glow pool */}
            <div className="absolute bottom-0 left-0 right-0 h-[80px] pointer-events-none z-0" style={{ background: 'linear-gradient(0deg, rgba(57,255,20,0.08) 0%, transparent 100%)' }} />
          </>
        )}
        {/* Player header — Cyberpunk HUD */}
        <div className="p-4 relative z-10">
          {!sidebarCollapsed && (
            <>
              {/* Top row: Language — Avatar — Settings */}
              <div className="flex items-center justify-between mb-2">
                {/* Language switcher — inline SVG flags drawn to fill the
                    circle perfectly. No external image, no aspect-ratio
                    fitting bugs, no transparent gutters. Stripes for the
                    USA flag, green field + shahada-style band for Saudi. */}
                <button onClick={() => { const next = lang === 'en' ? 'ar' : 'en'; setLang(next); if (typeof window !== 'undefined') localStorage.setItem('kiosk-lang', next); }}
                  className="w-12 h-12 rounded-full flex items-center justify-center overflow-visible transition-all hover:scale-110 relative"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), transparent 60%)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.55), 0 0 14px rgba(168,85,247,0.18), inset 0 -2px 6px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                  title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}>
                  {lang === 'en' ? (
                    /* USA flag — 3D spherical rendering: radial-shaded field, proper 5-point stars, glossy highlight, beveled rim. */
                    <svg viewBox="0 0 60 60" className="w-full h-full rounded-full" preserveAspectRatio="xMidYMid slice" aria-label="EN">
                      <defs>
                        <clipPath id="usaCircle"><circle cx="30" cy="30" r="29" /></clipPath>
                        <radialGradient id="usaSphereShade" cx="35%" cy="30%" r="75%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
                        </radialGradient>
                        <radialGradient id="usaGloss" cx="40%" cy="20%" r="45%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                          <stop offset="70%" stopColor="#ffffff" stopOpacity="0" />
                        </radialGradient>
                        <symbol id="usStar" viewBox="0 0 10 10">
                          <polygon points="5,0.4 6.2,3.8 9.8,3.8 6.9,5.8 8.0,9.2 5,7.1 2,9.2 3.1,5.8 0.2,3.8 3.8,3.8"
                            fill="#FFFFFF" />
                        </symbol>
                      </defs>
                      <g clipPath="url(#usaCircle)">
                        {/* 13 stripes */}
                        {Array.from({ length: 13 }).map((_, i) => (
                          <rect key={i} x="0" y={i * (60 / 13)} width="60" height={60 / 13}
                            fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
                        ))}
                        {/* Blue canton — rows 0..6 of stripes */}
                        <rect x="0" y="0" width="30" height={(60 / 13) * 7} fill="#0A3161" />
                        {/* Stars — staggered rows, 5 per row */}
                        {[0, 1, 2, 3].map((r) => (
                          Array.from({ length: 5 }).map((__, c) => (
                            <use key={`${r}-${c}`} href="#usStar"
                              x={3 + c * 5.5 + (r % 2) * 2.7} y={2 + r * 3.6}
                              width={3} height={3} />
                          ))
                        ))}
                        {/* 3D sphere shading overlay */}
                        <rect x="0" y="0" width="60" height="60" fill="url(#usaSphereShade)" />
                        {/* Top gloss */}
                        <ellipse cx="24" cy="15" rx="20" ry="11" fill="url(#usaGloss)" />
                      </g>
                      {/* Rim */}
                      <circle cx="30" cy="30" r="29" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                      <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
                    </svg>
                  ) : (
                    /* Saudi Arabia flag — 3D sphere with green radial field, stylized shahada script, crossed sword, glossy highlight. */
                    <svg viewBox="0 0 60 60" className="w-full h-full rounded-full" preserveAspectRatio="xMidYMid slice" aria-label="AR">
                      <defs>
                        <clipPath id="saCircle"><circle cx="30" cy="30" r="29" /></clipPath>
                        <radialGradient id="saField" cx="35%" cy="30%" r="80%">
                          <stop offset="0%" stopColor="#0E9652" />
                          <stop offset="55%" stopColor="#0A7A41" />
                          <stop offset="100%" stopColor="#03421F" />
                        </radialGradient>
                        <radialGradient id="saSphereShade" cx="35%" cy="30%" r="75%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
                          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
                        </radialGradient>
                        <radialGradient id="saGloss" cx="40%" cy="20%" r="45%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                          <stop offset="70%" stopColor="#ffffff" stopOpacity="0" />
                        </radialGradient>
                        <linearGradient id="swordBlade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fdfdfd" />
                          <stop offset="50%" stopColor="#cfd3d8" />
                          <stop offset="100%" stopColor="#8a8f94" />
                        </linearGradient>
                      </defs>
                      <g clipPath="url(#saCircle)">
                        <rect x="0" y="0" width="60" height="60" fill="url(#saField)" />
                        {/* Stylized shahada script — flowing curved strokes (calligraphic impression) */}
                        <g fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 21 Q18 17 26 21 T42 21 T52 21" />
                          <path d="M11 26 Q20 22 30 26 Q40 30 50 26" opacity="0.85" />
                        </g>
                        {/* Diacritical dots above the script */}
                        <circle cx="18" cy="17" r="0.9" fill="#FFFFFF" />
                        <circle cx="34" cy="17" r="0.9" fill="#FFFFFF" />
                        <circle cx="46" cy="17" r="0.9" fill="#FFFFFF" />
                        {/* Crossed sword — chrome blade + gold hilt */}
                        <g>
                          {/* Blade */}
                          <rect x="10" y="35.5" width="38" height="2.6" rx="1.2" fill="url(#swordBlade)"
                            stroke="#e7eaee" strokeWidth="0.3" />
                          {/* Blade tip (arrow) */}
                          <polygon points="48,34.2 52,36.8 48,39.4" fill="url(#swordBlade)" stroke="#e7eaee" strokeWidth="0.3" />
                          {/* Cross guard */}
                          <rect x="8" y="34.5" width="2.2" height="4.6" rx="0.6" fill="#d1b44a" stroke="#8a6f1d" strokeWidth="0.3" />
                          {/* Hilt pommel */}
                          <circle cx="6.8" cy="36.8" r="1.6" fill="#e9c968" stroke="#8a6f1d" strokeWidth="0.3" />
                        </g>
                        {/* 3D sphere shading overlay */}
                        <rect x="0" y="0" width="60" height="60" fill="url(#saSphereShade)" />
                        {/* Top gloss */}
                        <ellipse cx="24" cy="15" rx="20" ry="11" fill="url(#saGloss)" />
                      </g>
                      {/* Rim */}
                      <circle cx="30" cy="30" r="29" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                      <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
                    </svg>
                  )}
                  {/* Country code chip in corner so it's instantly readable */}
                  <span className="absolute bottom-0 right-0 text-[8px] font-ninja font-bold leading-none px-1 py-0.5 rounded-tl"
                    style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                    {lang === 'en' ? 'EN' : 'AR'}
                  </span>
                </button>

                {/* Center — Big avatar in octagonal sci-fi frame */}
                <div className="relative cursor-pointer" onClick={() => setActivePopup('profile')}>
                  {/* Octagonal outer frame */}
                  <div className="w-[90px] h-[90px] relative">
                    {/* Outer octagon border with glow */}
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{
                        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                        background: `linear-gradient(135deg, rgba(150,150,150,0.4), ${isPlayerVIP ? 'rgba(255,215,0,0.3)' : 'rgba(57,255,20,0.3)'}, rgba(150,150,150,0.4))`,
                        boxShadow: isPlayerVIP ? '0 0 20px rgba(255,215,0,0.3)' : '0 0 20px rgba(57,255,20,0.25)',
                      }} />
                    {/* Inner octagon with avatar */}
                    <div className="absolute inset-[3px] flex items-center justify-center overflow-hidden"
                      style={{
                        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                        background: '#0a0a0a',
                      }}>
                      {player.profilePhoto ? (
                        <img src={player.profilePhoto} alt="Avatar" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${ninjaType}.png`; }} />
                      ) : (
                        <Image src={`/img/pfp-${ninjaType}.png`} alt="Avatar" width={84} height={84}
                          className="object-contain w-full h-full" style={{ background: 'transparent' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                    </div>
                  </div>
                  {/* Level shield badge */}
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
                    <div className="w-9 h-10 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(180deg, ${isPlayerVIP ? '#FFD700' : levelInfo.color}, ${isPlayerVIP ? '#B8860B' : levelInfo.color}AA)`,
                        clipPath: 'polygon(50% 0%, 100% 15%, 100% 70%, 50% 100%, 0% 70%, 0% 15%)',
                        boxShadow: `0 2px 10px ${isPlayerVIP ? 'rgba(255,215,0,0.5)' : `${levelInfo.color}60`}`,
                      }}>
                      <span className="font-ninja text-[12px] text-black font-bold mt-0.5">{levelInfo.level}</span>
                    </div>
                  </div>
                </div>

                {/* Settings button in chrome/cyan circle */}
                <button onClick={() => setActivePopup('profile')}
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={{ border: '2px solid rgba(0,200,255,0.3)', background: 'radial-gradient(circle, rgba(0,200,255,0.1) 0%, rgba(0,0,0,0.4) 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.15)' }}
                  title={lang === 'ar' ? 'الإعدادات' : 'Settings'}>
                  <Settings size={22} className="text-cyan-400" style={{ filter: 'drop-shadow(0 0 4px rgba(0,200,255,0.5))' }} />
                </button>
              </div>

              {/* Username — large green glow */}
              <div className="text-center mt-4 mb-4">
                <p className="font-ninja text-xl tracking-wider"
                  style={{
                    color: isPlayerVIP ? '#FFD700' : '#39FF14',
                    textShadow: isPlayerVIP ? '0 0 20px rgba(255,215,0,0.5)' : '0 0 20px rgba(57,255,20,0.5), 0 0 40px rgba(57,255,20,0.2)',
                  }}>
                  {player.username?.toUpperCase()}
                </p>
                {isPlayerVIP && (
                  <div className="inline-flex items-center gap-1 mt-1.5 px-3 py-0.5 rounded-full"
                    style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.1))', border: '1px solid rgba(255,215,0,0.25)' }}>
                    <Crown size={9} style={{ color: '#FFD700' }} />
                    <span className="font-ninja text-[8px] tracking-widest" style={{ color: '#FFD700' }}>{lang === 'ar' ? 'عضو VIP' : 'VIP MEMBER'}</span>
                  </div>
                )}
              </div>

              {/* Tokens bar — Cyberpunk HUD */}
              <div className="relative flex items-center mb-2.5 h-[46px] rounded-lg overflow-hidden" style={{
                border: '1px solid rgba(234,179,8,0.25)',
                background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(234,179,8,0.02))',
                boxShadow: '0 0 15px rgba(234,179,8,0.06), inset 0 0 15px rgba(234,179,8,0.03)',
              }}>
                {/* HUD corners */}
                <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(234,179,8,0.5)', borderLeft: '2px solid rgba(234,179,8,0.5)' }} />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(234,179,8,0.5)', borderRight: '2px solid rgba(234,179,8,0.5)' }} />
                {/* Left glow bar */}
                <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full" style={{ background: '#eab308', boxShadow: '0 0 6px #eab308, 0 0 12px rgba(234,179,8,0.3)', opacity: 0.5 }} />
                <div className="flex items-center gap-2 px-3 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', boxShadow: '0 0 8px rgba(234,179,8,0.15)' }}>
                    <span className="text-[10px] font-bold text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.6))' }}>$</span>
                  </div>
                  <span className="font-ninja text-sm text-yellow-400 truncate" style={{ textShadow: '0 0 8px rgba(234,179,8,0.4)' }}>
                    {hideBalance ? '****' : Math.floor(coins).toLocaleString()}
                  </span>
                </div>
                <button onClick={() => { if (isGuest) { setShowBecomeUser(true); setBecomeUserStep('info'); return; } setShowTopUpModal(true); setTopUpSelected('custom'); setTopUpSent(false); }}
                  className="h-[32px] w-[72px] mx-1.5 rounded-md flex items-center justify-center gap-1 font-ninja text-[10px] tracking-wider text-black hover:brightness-110 active:scale-95 transition-all flex-shrink-0 relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #eab308, #fbbf24)', boxShadow: '0 0 12px rgba(234,179,8,0.3), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                  <Plus size={11} strokeWidth={3} /> Tokens
                </button>
              </div>

              {/* Time bar — Cyberpunk HUD */}
              <div className="relative flex items-center mb-3 h-[46px] rounded-lg overflow-hidden" style={{
                border: '1px solid rgba(57,255,20,0.2)',
                background: freePlayRemaining > 0
                  ? 'linear-gradient(135deg, rgba(57,255,20,0.12), rgba(57,255,20,0.04))'
                  : 'linear-gradient(135deg, rgba(57,255,20,0.06), rgba(57,255,20,0.02))',
                boxShadow: freePlayRemaining > 0
                  ? '0 0 20px rgba(57,255,20,0.1), inset 0 0 20px rgba(57,255,20,0.05)'
                  : '0 0 15px rgba(57,255,20,0.04), inset 0 0 15px rgba(57,255,20,0.02)',
              }}>
                {/* HUD corners */}
                <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(57,255,20,0.4)', borderRight: '2px solid rgba(57,255,20,0.4)' }} />
                {/* Left glow bar */}
                <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14, 0 0 12px rgba(57,255,20,0.3)', opacity: freePlayRemaining > 0 ? 0.8 : 0.4 }} />
                <div className="flex items-center gap-2 px-3 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 8px rgba(57,255,20,0.12)' }}>
                    <Timer size={14} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
                  </div>
                  {freePlayRemaining > 0 ? (
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-ninja text-sm text-ninja-green" style={{ textShadow: '0 0 10px rgba(57,255,20,0.5)' }}>
                        {Math.floor(freePlayRemaining / 60)}:{String(freePlayRemaining % 60).padStart(2, '0')}
                      </span>
                      <span className="font-ninja text-[8px] px-1.5 py-0.5 rounded text-black tracking-wider flex-shrink-0" style={{ background: '#39FF14', boxShadow: '0 0 8px rgba(57,255,20,0.4)' }}>FREE</span>
                    </div>
                  ) : (
                    <span className={`font-ninja text-sm truncate ${remainingPlaytime <= 5 ? 'text-red-400' : 'text-ninja-green'}`} style={{ textShadow: remainingPlaytime <= 5 ? '0 0 8px rgba(239,68,68,0.4)' : '0 0 8px rgba(57,255,20,0.3)' }}>
                      {(() => { const h = Math.floor(minutesLeft / 60); const m = minutesLeft % 60; return `${h}:${String(m).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`; })()}
                    </span>
                  )}
                </div>
                <button onClick={() => { if (isGuest) { setShowBecomeUser(true); setBecomeUserStep('info'); return; } if (freePlayRemaining > 0) return; setShowBuyTimeModal(true); setBuyTimeSelected(null); }}
                  className="h-[32px] w-[72px] mx-1.5 rounded-md flex items-center justify-center gap-1 font-ninja text-[10px] tracking-wider hover:brightness-110 active:scale-95 transition-all flex-shrink-0 relative overflow-hidden"
                  style={{
                    background: freePlayRemaining > 0 && !isGuest ? 'rgba(57,255,20,0.12)' : 'linear-gradient(135deg, #39FF14, #2dd40f)',
                    color: freePlayRemaining > 0 && !isGuest ? 'rgba(57,255,20,0.35)' : '#000',
                    cursor: freePlayRemaining > 0 && !isGuest ? 'not-allowed' : 'pointer',
                    boxShadow: freePlayRemaining > 0 && !isGuest ? 'none' : '0 0 12px rgba(57,255,20,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                  }}>
                  <Plus size={11} strokeWidth={3} /> Time
                </button>
              </div>

              {/* Divider between player info and search */}
              <div className="w-full mt-2 mb-1 flex flex-col items-center gap-[2px]">
                <div className="h-[1px] w-full" style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(57,255,20,0.35) 30%, rgba(0,200,255,0.25) 50%, rgba(168,85,247,0.2) 70%, transparent 95%)', boxShadow: '0 0 6px rgba(57,255,20,0.15)' }} />
                <div className="h-[1px] w-[70%]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.15), transparent)' }} />
              </div>
            </>
          )}
        </div>

        {/* Search box — always visible */}
        {!sidebarCollapsed && (
          <div className="px-3 pt-1 pb-0 relative z-10">
            <div className="ss-search-wrap">
            <div id="sidebar-search-poda">
              <div className="ss-glow"></div>
              <div className="ss-darkBorderBg"></div>
              <div className="ss-darkBorderBg"></div>
              <div className="ss-darkBorderBg"></div>
              <div className="ss-white"></div>
              <div className="ss-border"></div>
              <div className="ss-main">
                <input
                  type="text"
                  value={gameSearch}
                  onChange={e => { setGameSearch(e.target.value); if (e.target.value) setOpenDropdown('games'); }}
                  onFocus={() => { setGameSearchFocused(true); setOpenDropdown('games'); }}
                  onBlur={() => { setGameSearchFocused(false); if (!gameSearch) setTimeout(() => setOpenDropdown(prev => prev === 'games' ? null : prev), 200); }}
                  placeholder={gameSearchFocused || gameSearch ? 'Search...' : gameSearchPlaceholders[gameSearchPlaceholderIdx]}
                  className="ss-input"
                />
                <div className="ss-search-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" height="20" fill="none">
                    <circle stroke="url(#ss-search-grad)" r="8" cy="11" cx="11" />
                    <line stroke="url(#ss-searchl-grad)" y2="16.65" y1="22" x2="16.65" x1="22" />
                    <defs>
                      <linearGradient gradientTransform="rotate(50)" id="ss-search-grad">
                        <stop stopColor="#e7f8e7" offset="0%" />
                        <stop stopColor="#7aaa7a" offset="50%" />
                      </linearGradient>
                      <linearGradient id="ss-searchl-grad">
                        <stop stopColor="#7aaa7a" offset="0%" />
                        <stop stopColor="#4a744a" offset="50%" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Nav items — this section scrolls */}
        <nav className="flex-1 py-2 px-3 overflow-y-auto relative z-10" style={{ minHeight: 0 }}>
          <div className="flex flex-col gap-0.5">

            {/* ── DROPDOWN: Games ── */}
            {!sidebarCollapsed ? (
              <div className="mb-1">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'games' ? null : 'games')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all relative overflow-hidden group"
                  style={{
                    background: openDropdown === 'games'
                      ? 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.05))'
                      : 'linear-gradient(135deg, rgba(57,255,20,0.06), rgba(57,255,20,0.02))',
                    border: openDropdown === 'games' ? '1px solid rgba(57,255,20,0.35)' : '1px solid rgba(57,255,20,0.12)',
                    boxShadow: openDropdown === 'games'
                      ? '0 0 20px rgba(57,255,20,0.12), inset 0 0 20px rgba(57,255,20,0.05)'
                      : '0 0 8px rgba(57,255,20,0.04)',
                  }}
                >
                  {/* HUD corners */}
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(57,255,20,0.5)', borderRight: '2px solid rgba(57,255,20,0.5)' }} />
                  {/* Glow bar left */}
                  <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14, 0 0 12px rgba(57,255,20,0.3)', opacity: openDropdown === 'games' ? 0.8 : 0.3 }} />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }}>
                      <Gamepad2 size={18} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.7))' }} />
                    </div>
                    <span className="font-ninja text-[14px] tracking-wider text-ninja-green" style={{ textShadow: '0 0 10px rgba(57,255,20,0.5)' }}>{lang === 'ar' ? 'الألعاب' : 'GAMES'}</span>
                  </div>
                  <ChevronRight size={14} className={`text-ninja-green/60 transition-transform duration-200 ${openDropdown === 'games' ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                  {openDropdown === 'games' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="pl-3 space-y-0.5 mt-0.5 max-h-[50vh] overflow-y-auto scrollbar-thin">
                        {/* Games Library tab link */}
                        <button onClick={() => setActivePopup(null)}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all group bg-ninja-green/10 border border-ninja-green/20">
                          <Gamepad2 size={16} className="text-ninja-green" />
                          <span className="font-body text-[12px] text-ninja-green">{t(lang, 'games')}</span>
                        </button>
                        {/* All games from catalog */}
                        {GAMES_CATALOG.filter(g => g.genre !== 'App' && (!gameSearch || g.name.toLowerCase().includes(gameSearch.toLowerCase()))).map(game => (
                          <button key={game.id}
                            onClick={() => { window.dispatchEvent(new CustomEvent('select-game', { detail: game })); }}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left hover:bg-white/[0.03] transition-all group border border-transparent">
                            <img src={game.coverImage} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                            <span className="font-body text-[13px] font-medium text-gray-500 group-hover:text-gray-300 truncate">{game.name}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => setTab('games')} title={lang === 'ar' ? 'الألعاب' : 'Games'}
                className={`w-full flex justify-center py-2 rounded-lg transition-all ${(tab as string) === 'games' ? 'bg-ninja-green/10 text-ninja-green' : 'text-gray-500 hover:text-gray-300'}`}>
                <Gamepad2 size={18} />
              </button>
            )}

            {/* ── DROPDOWN: Launchers ── */}
            {!sidebarCollapsed ? (
              <div className="mb-1">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'launchers' ? null : 'launchers')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all relative overflow-hidden group"
                  style={{
                    background: openDropdown === 'launchers'
                      ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))'
                      : 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(59,130,246,0.02))',
                    border: openDropdown === 'launchers' ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(59,130,246,0.12)',
                    boxShadow: openDropdown === 'launchers'
                      ? '0 0 20px rgba(59,130,246,0.12), inset 0 0 20px rgba(59,130,246,0.05)'
                      : '0 0 8px rgba(59,130,246,0.04)',
                  }}
                >
                  {/* HUD corners */}
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(59,130,246,0.5)', borderLeft: '2px solid rgba(59,130,246,0.5)' }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(59,130,246,0.5)', borderRight: '2px solid rgba(59,130,246,0.5)' }} />
                  {/* Glow bar left */}
                  <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full" style={{ background: '#3b82f6', boxShadow: '0 0 6px #3b82f6, 0 0 12px rgba(59,130,246,0.3)', opacity: openDropdown === 'launchers' ? 0.8 : 0.3 }} />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', boxShadow: '0 0 10px rgba(59,130,246,0.15)' }}>
                      <Play size={18} className="text-blue-400" style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.7))' }} />
                    </div>
                    <span className="font-ninja text-[14px] tracking-wider text-blue-400" style={{ textShadow: '0 0 10px rgba(59,130,246,0.5)' }}>{lang === 'ar' ? 'المشغلات' : 'LAUNCHERS'}</span>
                  </div>
                  <ChevronRight size={14} className={`text-blue-400/60 transition-transform duration-200 ${openDropdown === 'launchers' ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                  {openDropdown === 'launchers' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="pl-3 space-y-0.5 mt-0.5">
                        {[
                          { id: 'steam', name: 'Steam', exePath: 'C:\\Program Files (x86)\\Steam\\steam.exe', icon: '/launchers/steam.png' },
                          { id: 'epicgames', name: 'Epic Games', exePath: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe', icon: '/launchers/epicgames.png' },
                          { id: 'battlenet', name: 'Battle.net', exePath: 'C:\\Program Files (x86)\\Battle.net\\Battle.net Launcher.exe', icon: '/launchers/battlenet.png' },
                          { id: 'riotclient', name: 'Riot Client', exePath: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe', icon: '/launchers/riot.png' },
                          { id: 'roblox', name: 'Roblox', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Roblox\\Versions\\version-b130242ed064436f\\RobloxPlayerBeta.exe', icon: '/launchers/roblox.png' },
                          { id: 'faceit', name: 'FACEIT', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\FACEIT\\FACEIT.exe', icon: '/launchers/faceit.png' },
                          { id: 'fivem', name: 'FiveM', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\FiveM\\FiveM.exe', icon: '/launchers/fivem.png' },
                        ].map(lnch => (
                          <button key={lnch.id}
                            onClick={() => launchOnPc(lnch.id, lnch.exePath)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left hover:bg-white/[0.03] transition-all group border border-transparent">
                            <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                              <img src={lnch.icon} alt="" className="w-full h-full object-contain" />
                            </div>
                            <span className="font-body text-[13px] text-gray-500 group-hover:text-gray-300">{lnch.name}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => setOpenDropdown(openDropdown === 'launchers' ? null : 'launchers')} title={lang === 'ar' ? 'المشغلات' : 'Launchers'}
                className="w-full flex justify-center py-2 rounded-lg text-gray-500 hover:text-blue-400 transition-all">
                <Play size={18} />
              </button>
            )}

            {/* ── DROPDOWN: Creator Tools ── */}
            {!sidebarCollapsed ? (
              <div className="mb-1">
                <button
                  onClick={() => setOpenDropdown(openDropdown === 'creator' ? null : 'creator')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all relative overflow-hidden group"
                  style={{
                    background: openDropdown === 'creator'
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))'
                      : 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(168,85,247,0.02))',
                    border: openDropdown === 'creator' ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(168,85,247,0.12)',
                    boxShadow: openDropdown === 'creator'
                      ? '0 0 20px rgba(168,85,247,0.12), inset 0 0 20px rgba(168,85,247,0.05)'
                      : '0 0 8px rgba(168,85,247,0.04)',
                  }}
                >
                  {/* HUD corners */}
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid rgba(168,85,247,0.5)', borderLeft: '2px solid rgba(168,85,247,0.5)' }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid rgba(168,85,247,0.5)', borderRight: '2px solid rgba(168,85,247,0.5)' }} />
                  {/* Glow bar left */}
                  <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px] rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px #a855f7, 0 0 12px rgba(168,85,247,0.3)', opacity: openDropdown === 'creator' ? 0.8 : 0.3 }} />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 0 10px rgba(168,85,247,0.15)' }}>
                      <Wrench size={18} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.7))' }} />
                    </div>
                    <span className="font-ninja text-[14px] tracking-wider text-purple-400" style={{ textShadow: '0 0 10px rgba(168,85,247,0.5)' }}>{lang === 'ar' ? 'أدوات المبدعين' : 'CREATOR TOOLS'}</span>
                  </div>
                  <ChevronRight size={14} className={`text-purple-400/60 transition-transform duration-200 ${openDropdown === 'creator' ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                  {openDropdown === 'creator' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="pl-3 space-y-0.5 mt-0.5">
                        {/* Software tab link */}
                        <button onClick={() => setActivePopup('software')}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all group ${activePopup === 'software' ? 'bg-purple-500/10 border border-purple-500/20' : 'border border-transparent hover:bg-white/[0.03]'}`}>
                          <Monitor size={16} className={activePopup === 'software' ? 'text-purple-400' : 'text-gray-500 group-hover:text-gray-300'} />
                          <span className={`font-body text-[12px] ${activePopup === 'software' ? 'text-purple-400' : 'text-gray-500 group-hover:text-gray-300'}`}>{t(lang, 'software')}</span>
                        </button>
                        {/* Divider */}
                        <div className="my-1 border-t border-gray-800/40" />
                        {/* All software items */}
                        {[
                          { id: 'chrome', name: 'Google Chrome', exePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', icon: '/software/chrome.png', color: '#4285F4' },
                          { id: 'edge', name: 'Microsoft Edge', exePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', icon: '/software/edge.png', color: '#0078D7' },
                          { id: 'discord', name: 'Discord', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', icon: '/software/discord.png', color: '#5865F2' },
                          { id: 'obs', name: 'OBS Studio', exePath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe', icon: '/software/obs.png', color: '#302E31' },
                          { id: 'streamlabs', name: 'Streamlabs', exePath: 'C:\\Program Files\\Streamlabs OBS\\Streamlabs OBS.exe', icon: '/software/streamlabs.png', color: '#80F5D2' },
                          { id: 'hyperx', name: 'HyperX NGENUITY', exePath: 'C:\\Program Files\\HyperX\\HyperX NGENUITY\\HyperXNGENUITY.exe', icon: '/software/hyperx.png', color: '#FF0000' },
                          { id: 'geforce', name: 'GeForce Experience', exePath: 'C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe', icon: '/software/geforce.png', color: '#76B900' },
                          { id: 'razer', name: 'Razer Synapse', exePath: 'C:\\Program Files (x86)\\Razer\\Synapse3\\UserProcess\\Razer Synapse 3.exe', icon: '/software/razer.png', color: '#44D62C' },
                        ].map(sw => (
                          <button key={sw.id}
                            onClick={() => launchOnPc(sw.id, sw.exePath)}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left hover:bg-white/[0.03] transition-all group border border-transparent">
                            <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                              <img
                                src={sw.icon || `/software/${sw.id}.png`}
                                alt=""
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.style.display = 'none';
                                  img.parentElement!.innerHTML = `<span class="font-ninja text-[10px] text-white" style="background:${sw.color};display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:4px;">${sw.name.charAt(0)}</span>`;
                                }}
                              />
                            </div>
                            <span className="font-body text-[13px] text-gray-500 group-hover:text-gray-300">{sw.name}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => setActivePopup('software')} title={lang === 'ar' ? 'أدوات المبدعين' : 'Creator Tools'}
                className={`w-full flex justify-center py-2 rounded-lg transition-all ${activePopup === 'software' ? 'bg-purple-500/10 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>
                <Wrench size={18} />
              </button>
            )}

            {/* ── Divider ── */}
            <div className={`my-1 border-t ${isPlayerVIP ? 'border-yellow-500/10' : 'border-gray-800/40'}`} />

            {/* ── Nav items with HUD frames ── */}
            {navItems.filter(item => !['games', 'tournaments', 'software'].includes(item.id)).map((item) => {
              const isActive = activePopup === item.id;
              const itemColor = item.color || (isPlayerVIP ? '#FFD700' : '#39FF14');
              const isVIPButton = item.id === 'vip';
              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    if (isGuest && guestRestrictedTabs.has(item.id)) {
                      setShowBecomeUser(true);
                      setBecomeUserStep('info');
                      return;
                    }
                    setActivePopup(item.id);
                  }}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.97 }}
                  className={`${sidebarCollapsed ? 'w-full justify-center' : 'w-full'} flex items-center gap-3 px-3 ${isVIPButton ? 'py-3' : 'py-2.5'} text-left transition-all relative group rounded-lg overflow-hidden`}
                  title={sidebarCollapsed ? item.label : undefined}
                  style={isVIPButton ? (isActive ? {
                    background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(120,80,255,0.10), rgba(0,200,255,0.08))',
                    border: '1px solid rgba(57,255,20,0.5)',
                    boxShadow: '0 0 25px rgba(57,255,20,0.2), 0 0 50px rgba(120,80,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
                  } : {
                    background: 'linear-gradient(180deg, rgba(57,255,20,0.08) 0%, rgba(120,80,255,0.05) 50%, rgba(0,200,255,0.04) 100%)',
                    border: '1px solid rgba(57,255,20,0.22)',
                    boxShadow: '0 0 15px rgba(57,255,20,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }) : (isActive ? {
                    background: `linear-gradient(135deg, ${itemColor}18, ${itemColor}08)`,
                    border: `1px solid ${itemColor}40`,
                    boxShadow: `0 0 18px ${itemColor}15, inset 0 0 20px ${itemColor}08`,
                  } : {
                    border: `1px solid ${itemColor}12`,
                    background: `linear-gradient(135deg, ${itemColor}06, transparent)`,
                    boxShadow: `0 0 6px ${itemColor}06`,
                  })}
                >
                  {/* Hover glow bg */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `radial-gradient(ellipse at 30% 50%, ${itemColor}12, transparent 70%)` }} />
                  {/* Active HUD corners */}
                  {isActive && <>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${itemColor}`, borderLeft: `2px solid ${itemColor}` }} />
                    <div className="absolute top-0 right-0 w-3 h-3" style={{ borderTop: `1px solid ${itemColor}60`, borderRight: `1px solid ${itemColor}60` }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3" style={{ borderBottom: `1px solid ${itemColor}60`, borderLeft: `1px solid ${itemColor}60` }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${itemColor}`, borderRight: `2px solid ${itemColor}` }} />
                  </>}
                  {/* Active left bar */}
                  {isActive && (
                    <motion.div layoutId="sideNavBar" className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: itemColor, boxShadow: `0 0 10px ${itemColor}, 0 0 20px ${itemColor}40` }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }} />
                  )}
                  {/* Inactive subtle dot */}
                  {!isActive && (
                    <div className="absolute left-[3px] top-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: itemColor, boxShadow: `0 0 4px ${itemColor}` }} />
                  )}
                  {/* VIP metallic shimmer sweep */}
                  {isVIPButton && (
                    <motion.div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden"
                      animate={{ backgroundPosition: ['200% 0%', '-100% 0%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3 }}
                      style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 45%, rgba(57,255,20,0.12) 50%, rgba(255,255,255,0.08) 55%, transparent 70%)', backgroundSize: '200% 100%' }} />
                  )}
                  <span
                    className="relative z-10 transition-all"
                    style={{
                      color: isVIPButton ? (isActive ? '#39FF14' : '#39FF14CC') : (isActive ? itemColor : `${itemColor}90`),
                      filter: isVIPButton
                        ? (isActive ? 'drop-shadow(0 0 10px rgba(57,255,20,0.9))' : 'drop-shadow(0 0 5px rgba(57,255,20,0.5))')
                        : (isActive ? `drop-shadow(0 0 8px ${itemColor})` : `drop-shadow(0 0 3px ${itemColor}50)`),
                    }}
                  >{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span
                      className={`relative z-10 font-ninja tracking-wider transition-all ${isVIPButton ? 'text-[13px]' : 'text-[12px]'}`}
                      style={{
                        color: isVIPButton
                          ? (isActive ? '#39FF14' : 'rgba(57,255,20,0.75)')
                          : (isActive ? itemColor : 'rgba(200,200,200,0.6)'),
                        textShadow: isVIPButton
                          ? '0 0 15px rgba(57,255,20,0.5)'
                          : (isActive ? `0 0 12px ${itemColor}60` : 'none'),
                      }}
                    >{item.label}</span>
                  )}
                  {/* VIP badge */}
                  {isVIPButton && !sidebarCollapsed && isPlayerVIP && (
                    <span className="relative z-10 ml-auto px-1.5 py-0.5 rounded text-[7px] font-ninja tracking-wider"
                      style={{ background: 'rgba(57,255,20,0.12)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.2)' }}>
                      ACTIVE
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </nav>

        {/* Bottom section */}
        <div className={`p-3 space-y-2 flex-shrink-0 border-t relative z-10 ${isPlayerVIP ? 'border-yellow-500/10' : 'border-gray-800/40'}`}>
          {/* VIP Button — always glowing gold */}
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(255,215,0,0.35)' }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              if (isGuest) { setShowBecomeUser(true); setBecomeUserStep('info'); return; }
              setActivePopup('vip');
            }}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-lg font-ninja text-sm tracking-wider transition-all relative overflow-hidden`}
            style={{
              background: activePopup === 'vip'
                ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.10))'
                : 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,140,0,0.05))',
              border: activePopup === 'vip' ? '2px solid rgba(255,215,0,0.5)' : '2px solid rgba(255,215,0,0.25)',
              boxShadow: '0 0 15px rgba(255,215,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
            {/* Animated gold glow */}
            <motion.div className="absolute inset-0 rounded-lg pointer-events-none"
              animate={{ boxShadow: ['inset 0 0 15px rgba(255,215,0,0.04)', 'inset 0 0 25px rgba(255,215,0,0.1)', 'inset 0 0 15px rgba(255,215,0,0.04)'] }}
              transition={{ duration: 2.5, repeat: Infinity }} />
            {/* Metallic sweep */}
            <motion.div className="absolute inset-0 rounded-lg pointer-events-none overflow-hidden">
              <motion.div
                animate={{ x: ['-100%', '250%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3 }}
                className="h-full"
                style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 45%, rgba(255,215,0,0.15) 50%, rgba(255,255,255,0.1) 55%, transparent 70%)', width: '40%' }} />
            </motion.div>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #FFD700', borderLeft: '2px solid #FFD700' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,215,0,0.5)', borderRight: '2px solid rgba(255,215,0,0.5)' }} />
            <Crown size={18} className="relative z-10" style={{ color: '#FFD700', filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.7))' }} />
            {!sidebarCollapsed && (
              <span className="relative z-10" style={{ color: '#FFD700', textShadow: '0 0 12px rgba(255,215,0,0.5)' }}>VIP</span>
            )}
            {!sidebarCollapsed && isPlayerVIP && (
              <span className="relative z-10 ml-auto px-1.5 py-0.5 rounded text-[7px] font-ninja tracking-wider"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                ACTIVE
              </span>
            )}
          </motion.button>
          {/* Admin Panel — only for مالبورو */}
          {player.username === '\u0645\u0627\u0644\u0628\u0648\u0631\u0648' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { window.location.href = '/ghanimadmin'; }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 font-body text-sm hover:bg-purple-500/20 transition-all">
              <Shield size={16} />
              {!sidebarCollapsed && <span>{lang === 'ar' ? 'لوحة الإدارة' : 'Admin Panel'}</span>}
            </motion.button>
          )}
          {/* Logout — Cyberpunk styled. Force-set onlineStatus.isOnline:false
              BEFORE handing off to the parent so friends don't keep seeing
              this player as online (the unmount cleanup is too late once the
              page navigates). */}
          <motion.button whileHover={{ scale: 1.02, boxShadow: '0 0 15px rgba(239,68,68,0.3)' }} whileTap={{ scale: 0.96 }}
            onClick={async () => {
              try {
                if (!isGuest && initialPlayer?.uid) {
                  await updateDoc(doc(db, 'players', initialPlayer.uid), {
                    'onlineStatus.isOnline': false,
                    'onlineStatus.currentActivity': '',
                    'onlineStatus.currentGameId': null,
                    'onlineStatus.lastSeen': Date.now(),
                  });
                }
              } catch { /* logout anyway */ }
              onLogout();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-ninja text-sm tracking-wider transition-all relative overflow-hidden"
            style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #ef4444', borderLeft: '2px solid #ef4444' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid #ef4444', borderRight: '2px solid #ef4444' }} />
            <LogOut size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.5))' }} />
            {!sidebarCollapsed && <span style={{ textShadow: '0 0 8px rgba(239,68,68,0.3)' }}>{t(lang, 'logout')}</span>}
          </motion.button>
        </div>
      </div>}

      {/* Main Content */}
      <div
        onClick={() => { if (openDropdown) setOpenDropdown(null); }}
        className="flex-1 min-h-screen overflow-x-hidden overflow-y-auto transition-all duration-300 ease-in-out"
        style={{ marginLeft: showMainSidebar ? sidebarW : '0', paddingLeft: 0 }}
      >
        {/* Free play announcement bar removed — timer is now shown in sidebar */}

        {/* Always show GamesTab as base layer */}
        <GamesTab player={player} lang={lang}
          onAddCredit={isGuest ? () => { setShowBecomeUser(true); setBecomeUserStep('info'); } : () => { setShowTopUpModal(true); setTopUpSelected('custom'); setTopUpSent(false); }}
          onSendCoins={isGuest ? () => { setShowBecomeUser(true); setBecomeUserStep('info'); } : (prefillUsername?: string) => { setShowSendCoinsModal(true); setSendError(''); setSendSuccess(''); if (prefillUsername) setSendTarget(prefillUsername); }}
          onLogout={onLogout}
          disabledGames={disabledGames}
          onBecomeUser={isGuest ? () => { setShowBecomeUser(true); setBecomeUserStep('info'); } : undefined}
        />

        {/* Popup overlay for other tabs */}
        {activePopup && (
            <motion.div
              key="popup-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[150] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`${activePopup === 'dailytasks' ? 'relative overflow-y-auto overflow-x-hidden' : activePopup === 'leaderboard' ? 'relative overflow-visible' : 'kiosk-popup-panel relative'} ${activePopup === 'chests' || activePopup === 'store' ? 'overflow-hidden' : activePopup !== 'dailytasks' && activePopup !== 'leaderboard' ? 'overflow-y-auto overflow-x-hidden' : ''} ${activePopup === 'dailytasks' ? 'kiosk-popup-compact' : activePopup === 'food' || activePopup === 'hubbly' ? 'kiosk-popup-large' : activePopup === 'chests' || activePopup === 'store' ? 'kiosk-popup-max' : 'kiosk-popup-full'}`}
                onClick={(e) => e.stopPropagation()}
                style={
                  activePopup === 'dailytasks'
                    ? ({
                        // Sizing comes from .kiosk-popup-compact (height: auto,
                        // max-height: calc(100vh - 80px)). Inline only handles
                        // chrome — keep transparent so the inner panel renders
                        // its own border/glow.
                        background: 'transparent',
                        border: 'none',
                        boxShadow: 'none',
                      } as React.CSSProperties)
                    : activePopup === 'leaderboard'
                    ? ({
                        background: 'transparent',
                        border: 'none',
                        boxShadow: 'none',
                        width: '864px',
                        maxWidth: '94vw',
                        height: 'auto',
                        maxHeight: '92vh',
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {/* Outer wrapper chrome — skipped for daily tasks and leaderboard (they provide their own) */}
                {activePopup !== 'dailytasks' && activePopup !== 'leaderboard' && (() => {
                  const isVipPopup = activePopup === 'vip';
                  const accentA = isVipPopup ? 'rgba(255,215,0,0.5)' : 'rgba(57,255,20,0.5)';
                  const accentB = isVipPopup ? 'rgba(255,140,0,0.35)' : 'rgba(0,200,255,0.3)';
                  const accentC = isVipPopup ? 'rgba(184,134,11,0.3)' : 'rgba(168,85,247,0.3)';
                  return (
                  <>
                    {/* HUD corner brackets */}
                    <div className="absolute top-0 left-0 w-5 h-5 z-[2] pointer-events-none" style={{ borderTop: `2px solid ${accentA}`, borderLeft: `2px solid ${accentA}` }} />
                    <div className="absolute top-0 right-0 w-5 h-5 z-[2] pointer-events-none" style={{ borderTop: `2px solid ${accentB}`, borderRight: `2px solid ${accentB}` }} />
                    <div className="absolute bottom-0 left-0 w-5 h-5 z-[2] pointer-events-none" style={{ borderBottom: `2px solid ${accentB}`, borderLeft: `2px solid ${accentB}` }} />
                    <div className="absolute bottom-0 right-0 w-5 h-5 z-[2] pointer-events-none" style={{ borderBottom: `2px solid ${accentC}`, borderRight: `2px solid ${accentC}` }} />
                    {/* Bottom neon accent line */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] z-[2] pointer-events-none" style={{ background: isVipPopup ? 'linear-gradient(90deg, transparent, rgba(255,215,0,0.3), rgba(255,140,0,0.25), transparent)' : 'linear-gradient(90deg, transparent, rgba(0,200,255,0.25), rgba(168,85,247,0.2), transparent)' }} />
                    {/* Close button — opaque backdrop so no tab content (coins, timers,
                        balance chips) ever bleeds through underneath it. */}
                    <button
                      onClick={() => setActivePopup(null)}
                      title={lang === 'ar' ? 'إغلاق' : 'Close'}
                      className={`absolute top-4 right-4 z-[100] w-12 h-12 flex items-center justify-center rounded-xl text-gray-300 transition-all hover:rotate-90 ${isVipPopup ? 'hover:text-yellow-400' : 'hover:text-ninja-green'}`}
                      style={{
                        background: isVipPopup
                          ? 'linear-gradient(135deg, rgba(12,10,4,0.96), rgba(18,14,4,0.96))'
                          : 'linear-gradient(135deg, rgba(8,10,12,0.96), rgba(12,16,20,0.96))',
                        border: `1px solid ${isVipPopup ? 'rgba(255,215,0,0.4)' : 'rgba(57,255,20,0.35)'}`,
                        boxShadow: `0 0 12px ${isVipPopup ? 'rgba(255,215,0,0.2)' : 'rgba(57,255,20,0.18)'}, 0 6px 16px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.4)`,
                        backdropFilter: 'blur(6px)',
                        transition: 'all 0.3s',
                      }}
                    >
                      <X size={22} strokeWidth={2.4} />
                    </button>
                  </>
                  );
                })()}

                {activePopup === 'profile' && <ProfileTab player={player} />}
                {activePopup === 'friends' && <FriendsTab player={player} />}
                {activePopup === 'chests' && <ChestsTab player={player} />}
                {activePopup === 'inventory' && <InventoryTab player={player} highlightItemId={highlightItemId} onHighlightSeen={() => setHighlightItemId(null)} />}
                {activePopup === 'store' && <StoreTab player={player} onClose={() => setActivePopup(null)} initialSubTab={storeSubTab} />}
                {activePopup === 'dailytasks' && (
                  <DailyTasksTab
                    player={player}
                    onClose={() => setActivePopup(null)}
                    onShortcut={(action) => {
                      if (action === 'food') setActivePopup('food');
                      else if (action === 'chests') setActivePopup('chests');
                      else if (action === 'send-coins') {
                        setActivePopup(null);
                        setShowSendCoinsModal(true);
                        setSendError(''); setSendSuccess(''); setSendTarget('');
                      } else if (action === 'add-friend') {
                        setActivePopup(null);
                        window.dispatchEvent(new CustomEvent('open-add-friend'));
                      }
                    }}
                  />
                )}
                {activePopup === 'vip' && <VIPTab player={player} />}
                {activePopup === 'food' && <FoodTab player={player} />}
                {activePopup === 'hubbly' && <HubblyTab player={player} />}
                {activePopup === 'leaderboard' && <LeaderboardTab onClose={() => setActivePopup(null)} />}
                {activePopup === 'tournaments' && <TournamentTab player={player} />}
                {activePopup === 'software' && <SoftwareTab />}
              </motion.div>
            </motion.div>
        )}
      </div>

      {/* Tokens-received acknowledgement popup — fires on any positive coin delta */}
      <AnimatePresence>
        {tokensReceived && (
          <motion.div
            key={`tokens-received-${tokensReceived.ts}`}
            initial={{ opacity: 0, y: -40, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[250] pointer-events-auto cursor-pointer"
            onClick={() => setTokensReceived(null)}
          >
            <div className="relative rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(20,15,5,0.97), rgba(30,22,8,0.97))',
                border: '1px solid rgba(234,179,8,0.5)',
                boxShadow: '0 0 40px rgba(234,179,8,0.35), 0 20px 50px rgba(0,0,0,0.6)',
                minWidth: 340,
              }}>
              {/* Animated gold shimmer sweep */}
              <motion.div className="absolute inset-0 pointer-events-none"
                animate={{ backgroundPosition: ['0% 50%', '200% 50%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                style={{
                  background: 'linear-gradient(105deg, transparent 30%, rgba(255,215,0,0.1) 45%, rgba(255,215,0,0.18) 50%, rgba(255,215,0,0.1) 55%, transparent 70%)',
                  backgroundSize: '200% 100%',
                }} />
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none" style={{ borderTop: '2px solid #eab308', borderLeft: '2px solid #eab308' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none" style={{ borderBottom: '2px solid #eab308', borderRight: '2px solid #eab308' }} />

              <div className="relative flex items-center gap-4 px-6 py-4">
                {/* Spinning coin icon */}
                <motion.div
                  animate={{ rotateY: [0, 360], scale: [1, 1.1, 1] }}
                  transition={{ rotateY: { duration: 1.2, repeat: Infinity, ease: 'linear' }, scale: { duration: 1, repeat: Infinity } }}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'radial-gradient(circle, rgba(234,179,8,0.3), rgba(234,179,8,0.1))',
                    border: '2px solid rgba(234,179,8,0.6)',
                    boxShadow: '0 0 20px rgba(234,179,8,0.5), inset 0 0 10px rgba(255,215,0,0.2)',
                  }}>
                  <Coins size={28} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.8))' }} />
                </motion.div>

                <div className="flex-1 leading-tight">
                  <div className="font-ninja text-[11px] tracking-[0.3em] text-yellow-400/80">
                    {lang === 'ar' ? 'تم استلام توكنز' : 'TOKENS RECEIVED'}
                  </div>
                  <div className="font-ninja text-3xl tabular-nums mt-0.5"
                    style={{ color: '#fbbf24', textShadow: '0 0 18px rgba(234,179,8,0.55), 0 0 40px rgba(234,179,8,0.25)' }}>
                    +{tokensReceived.amount.toLocaleString()}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); setTokensReceived(null); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
                  style={{ border: '1px solid rgba(234,179,8,0.25)' }}>
                  <X size={16} className="text-yellow-500/70" />
                </button>
              </div>

              {/* Bottom progress bar (4s auto-dismiss) */}
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 4, ease: 'linear' }}
                className="absolute bottom-0 left-0 h-[2px]"
                style={{ background: 'linear-gradient(90deg, #fbbf24, #eab308)', boxShadow: '0 0 6px rgba(234,179,8,0.6)' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Low balance overlay */}
      <AnimatePresence>
        {lowBalanceWarning && remainingPlaytime <= 5 && !isGuest && !(player.freePlayUntil && player.freePlayUntil > Date.now()) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(40,0,0,0.3)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="relative rounded-2xl p-8 text-center pointer-events-auto overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #100408 0%, #080406 50%, #0a0608 100%)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 40px rgba(239,68,68,0.08)' }}
            >
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none" style={{ borderTop: '2px solid rgba(239,68,68,0.5)', borderLeft: '2px solid rgba(239,68,68,0.5)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none" style={{ borderBottom: '2px solid rgba(239,68,68,0.5)', borderRight: '2px solid rgba(239,68,68,0.5)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.5), rgba(239,68,68,0.2), transparent)' }} />
              <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.4))' }} />
              <p className="font-ninja text-2xl text-red-400 mb-2">
                {remainingPlaytime <= 0 ? 'TIME IS UP!' : `${remainingPlaytime} MIN LEFT`}
              </p>
              <p className="font-body text-gray-400">
                {remainingPlaytime <= 0
                  ? (coins > 0
                      ? (lang === 'ar' ? 'اشترِ وقتًا أكثر بالتوكنز' : 'Buy more time with your tokens')
                      : (lang === 'ar' ? 'اشحن التوكنز للاستمرار في اللعب' : 'Top up tokens to continue playing'))
                  : (lang === 'ar' ? 'وقت اللعب على وشك الانتهاء' : 'Your playtime is running low')}
              </p>
              <button onClick={() => {
                if (coins > 0) { setShowBuyTimeModal(true); setBuyTimeSelected(null); }
                else { setShowTopUpModal(true); setTopUpSelected('custom'); setTopUpSent(false); }
              }} className="ninja-btn ninja-btn-green mt-4 px-6">
                {coins > 0 ? (lang === 'ar' ? 'شراء وقت' : 'BUY TIME') : (lang === 'ar' ? 'شحن' : 'TOP UP')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Report Modal */}
      {/* ══ Become a User Popup (Guest Mode) ══ */}
      <AnimatePresence>
        {showBecomeUser && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center"
            style={{ backdropFilter: 'blur(12px)' }}
            onClick={() => setShowBecomeUser(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 120, damping: 15 }}
              className="w-[600px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-purple-500/30"
              style={{ background: 'linear-gradient(180deg, #0c0014 0%, #0a0a1a 40%, #080810 100%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {becomeUserStep === 'waiting' ? (
                /* ── Waiting for admin step ── */
                <>
                  <div className="px-8 py-10 text-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(147,51,234,0.1)', border: '2px solid rgba(147,51,234,0.3)', boxShadow: '0 0 30px rgba(147,51,234,0.2)' }}
                    >
                      <Loader2 size={36} className="text-purple-400 animate-spin" />
                    </motion.div>
                    <h2 className="font-ninja text-2xl text-purple-400 mb-3 tracking-wider">{lang === 'ar' ? 'بانتظار الإدارة' : 'WAITING FOR ADMIN'}</h2>
                    <p className="font-body text-gray-400 text-sm mb-2">{lang === 'ar' ? 'تم إرسال طلب تسجيلك!' : 'Your registration request has been sent!'}</p>
                    <p className="font-body text-gray-500 text-xs mb-8">{lang === 'ar' ? 'اطلب من أحد الموظفين الحضور إلى جهازك. سيعطيك رمزًا من 6 أرقام.' : 'Ask a staff member to come to your PC. They will give you a 6-digit code.'}</p>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setBecomeUserStep('register')}
                      className="w-full py-4 rounded-xl font-ninja text-lg tracking-wider text-white flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 20px rgba(147,51,234,0.3)' }}
                    >
                      <Shield size={20} /> {lang === 'ar' ? 'لدي الرمز' : 'I HAVE THE CODE'}
                    </motion.button>
                    <button onClick={() => { setShowBecomeUser(false); setBecomeUserStep('info'); }}
                      className="w-full mt-3 py-2 text-gray-600 font-body text-sm hover:text-gray-400 transition-all">
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </>
              ) : becomeUserStep === 'info' ? (
                <>
                  {/* Header with glow */}
                  <div className="relative px-8 pt-8 pb-4 text-center overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full"
                      style={{ background: 'radial-gradient(ellipse, rgba(147,51,234,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
                    <div className="relative z-10">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.2), rgba(168,85,247,0.1))', border: '2px solid rgba(147,51,234,0.3)', boxShadow: '0 0 30px rgba(147,51,234,0.2)' }}
                      >
                        <Crown size={36} className="text-purple-400" />
                      </motion.div>
                      <h1 className="font-ninja text-3xl tracking-wider mb-2" style={{ background: 'linear-gradient(90deg, #A855F7, #E879F9, #C084FC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {lang === 'ar' ? 'كن نينجا' : 'BECOME A NINJA'}
                      </h1>
                      <p className="font-body text-gray-400 text-sm">{lang === 'ar' ? 'أنشئ حسابك وافتح كل الميزات' : 'Create your account and unlock everything'}</p>
                    </div>
                  </div>

                  {/* Unlock features grid */}
                  <div className="px-8 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: <Package size={22} />, title: lang === 'ar' ? 'الصناديق' : 'CHESTS', desc: lang === 'ar' ? 'افتح الصناديق واربح الأزياء' : 'Open chests & win skins', color: '#00BFFF', glow: 'rgba(0,191,255,0.15)' },
                        { icon: <Users size={22} />, title: lang === 'ar' ? 'الأصدقاء' : 'FRIENDS', desc: lang === 'ar' ? 'أضف أصدقاء ودردش واتصل' : 'Add friends, chat & call', color: '#39FF14', glow: 'rgba(57,255,20,0.15)' },
                        { icon: <Swords size={22} />, title: lang === 'ar' ? 'البطولات' : 'TOURNAMENTS', desc: lang === 'ar' ? 'نافس واربح جوائز' : 'Compete & win prizes', color: '#FF6B6B', glow: 'rgba(255,107,107,0.15)' },
                        { icon: <ClipboardCheck size={22} />, title: lang === 'ar' ? 'المهام اليومية' : 'DAILY TASKS', desc: lang === 'ar' ? 'أكمل المهام للمكافآت' : 'Complete tasks for rewards', color: '#FBBF24', glow: 'rgba(251,191,36,0.15)' },
                        { icon: <ShoppingBag size={22} />, title: lang === 'ar' ? 'المتجر' : 'STORE', desc: lang === 'ar' ? 'اشترِ أزياء وعناصر' : 'Buy skins & items', color: '#FF6F00', glow: 'rgba(255,111,0,0.15)' },
                        { icon: <Backpack size={22} />, title: lang === 'ar' ? 'الحقيبة' : 'INVENTORY', desc: lang === 'ar' ? 'اجمع وأهدِ عناصر' : 'Collect & gift items', color: '#A855F7', glow: 'rgba(168,85,247,0.15)' },
                      ].map((f, i) => (
                        <motion.div key={f.title}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="rounded-xl p-4 border transition-all hover:scale-[1.02]"
                          style={{ background: f.glow, borderColor: `${f.color}30` }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                              <span style={{ color: f.color }}>{f.icon}</span>
                            </div>
                            <div>
                              <p className="font-ninja text-sm text-white tracking-wider">{f.title}</p>
                              <p className="font-body text-[11px] text-gray-500">{f.desc}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>


                  {/* CTA button */}
                  <div className="px-8 pb-8">
                    <motion.button
                      whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(147,51,234,0.4)' }}
                      whileTap={{ scale: 0.98 }}
                      disabled={regRequestSending}
                      onClick={async () => {
                        setRegRequestSending(true);
                        try {
                          await addDoc(collection(db, 'guest-register-requests'), {
                            pcName: player.lastPcUsed || 'Unknown PC',
                            guestUid: player.uid,
                            status: 'pending',
                            timestamp: Date.now(),
                          });
                          notifyAdmin('guest_register', 'Guest Registration', `Guest on ${player.lastPcUsed || 'Unknown PC'} wants to create an account`);
                          setBecomeUserStep('waiting');
                        } catch (err) {
                          console.error('Failed to send register request:', err);
                        }
                        setRegRequestSending(false);
                      }}
                      className="w-full py-4 rounded-xl font-ninja text-xl tracking-wider text-white flex items-center justify-center gap-3 transition-all disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)', boxShadow: '0 0 20px rgba(147,51,234,0.3)' }}
                    >
                      {regRequestSending ? <Loader2 size={22} className="animate-spin" /> : <UserPlus size={22} />} {lang === 'ar' ? 'أنشئ حسابي' : 'CREATE MY ACCOUNT'}
                    </motion.button>
                    <button onClick={() => setShowBecomeUser(false)}
                      className="w-full mt-3 py-2 text-gray-600 font-body text-sm hover:text-gray-400 transition-all">
                      {lang === 'ar' ? 'ربما لاحقًا' : 'Maybe later'}
                    </button>
                  </div>
                </>
              ) : becomeUserStep === 'register' ? (
                /* ── Register Step: Enter admin approval code ── */
                <>
                  <div className="px-8 pt-8 pb-4 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(57,255,20,0.1)', border: '2px solid rgba(57,255,20,0.3)' }}>
                      <Shield size={32} className="text-ninja-green" />
                    </div>
                    <h2 className="font-ninja text-2xl text-ninja-green mb-2 tracking-wider">{lang === 'ar' ? 'موافقة الإدارة' : 'ADMIN APPROVAL'}</h2>
                    <p className="font-body text-gray-400 text-sm mb-1">{lang === 'ar' ? 'اطلب من الموظف رمز الموافقة المكون من 6 أرقام' : 'Ask the staff for your 6-digit approval code'}</p>
                    <p className="font-body text-gray-600 text-xs">{lang === 'ar' ? 'سيحضر المسؤول لإعداد حسابك' : 'The admin will come to you to set up your account'}</p>
                  </div>

                  <div className="px-8 pb-6">
                    <div className="flex justify-center mb-6">
                      <input
                        type="text"
                        value={adminCode}
                        onChange={(e) => { setAdminCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setAdminCodeError(''); }}
                        className="w-64 bg-black/60 border-2 border-ninja-green/30 rounded-xl px-6 py-4 text-white font-ninja text-3xl tracking-[0.6em] text-center focus:border-ninja-green outline-none transition-all"
                        placeholder="• • • • • •"
                        maxLength={6}
                        autoFocus
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.code === 'NumpadEnter') && adminCode.length === 6) {
                            // Verify code
                            setAdminCodeLoading(true);
                            (async () => {
                              try {
                                const q2 = query(collection(db, 'guest-approval-codes'), where('code', '==', adminCode), where('used', '==', false));
                                const snap = await getDocs(q2);
                                if (snap.empty) {
                                  setAdminCodeError(lang === 'ar' ? 'رمز غير صالح' : 'Invalid code');
                                  setAdminCodeLoading(false);
                                  return;
                                }
                                // Mark code as used
                                const codeDoc = snap.docs[0];
                                await updateDoc(doc(db, 'guest-approval-codes', codeDoc.id), { used: true, usedAt: Date.now() });
                                // Close the admin's registration popup by flipping the originating request.
                                // requestId is stamped by AdminDashboard.generateRegistrationCode.
                                const codeData = codeDoc.data() as any;
                                if (codeData.requestId) {
                                  try { await updateDoc(doc(db, 'guest-register-requests', codeData.requestId), { status: 'used', usedAt: Date.now() }); } catch { /* non-fatal */ }
                                }
                                // Go to registration form
                                setBecomeUserStep('form');
                                setAdminCode('');
                                setAdminCodeLoading(false);
                              } catch (err) {
                                setAdminCodeError('Error verifying code');
                                setAdminCodeLoading(false);
                              }
                            })();
                          }
                        }}
                      />
                    </div>

                    {adminCodeError && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center font-body text-sm mb-4">
                        {adminCodeError}
                      </motion.p>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={adminCode.length !== 6 || adminCodeLoading}
                      onClick={async () => {
                        setAdminCodeLoading(true);
                        try {
                          const q2 = query(collection(db, 'guest-approval-codes'), where('code', '==', adminCode), where('used', '==', false));
                          const snap = await getDocs(q2);
                          if (snap.empty) {
                            setAdminCodeError(lang === 'ar' ? 'رمز غير صالح' : 'Invalid code');
                            setAdminCodeLoading(false);
                            return;
                          }
                          const codeDoc = snap.docs[0];
                          await updateDoc(doc(db, 'guest-approval-codes', codeDoc.id), { used: true, usedAt: Date.now() });
                          const codeData = codeDoc.data() as any;
                          if (codeData.requestId) {
                            try { await updateDoc(doc(db, 'guest-register-requests', codeData.requestId), { status: 'used', usedAt: Date.now() }); } catch { /* non-fatal */ }
                          }
                          setBecomeUserStep('form');
                          setAdminCode('');
                          setAdminCodeLoading(false);
                        } catch (err) {
                          setAdminCodeError('Error verifying code');
                          setAdminCodeLoading(false);
                        }
                      }}
                      className="w-full py-4 rounded-xl font-ninja text-lg tracking-wider text-black flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      style={{ background: adminCode.length === 6 ? '#39FF14' : 'rgba(57,255,20,0.3)' }}
                    >
                      {adminCodeLoading ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                      {lang === 'ar' ? 'تحقق من الرمز' : 'VERIFY CODE'}
                    </motion.button>

                    <button onClick={() => setBecomeUserStep('waiting')}
                      className="w-full mt-3 py-2 text-gray-600 font-body text-sm hover:text-gray-400 transition-all flex items-center justify-center gap-2">
                      {lang === 'ar' ? 'رجوع' : 'Back'}
                    </button>
                  </div>
                </>
              ) : becomeUserStep === 'form' ? (
                /* ── Registration Form ── */
                <>
                  <div className="px-8 pt-6 pb-2 text-center">
                    <h2 className="font-ninja text-2xl tracking-wider mb-1" style={{ background: 'linear-gradient(90deg, #A855F7, #E879F9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{lang === 'ar' ? 'أنشئ حسابك' : 'CREATE YOUR ACCOUNT'}</h2>
                    <p className="font-body text-gray-500 text-xs">{lang === 'ar' ? 'املأ بياناتك لتصبح نينجا' : 'Fill in your details to become a Ninja'}</p>
                  </div>
                  <div className="px-8 pb-6 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'الاسم الأول' : 'First Name'}</label>
                        <input type="text" value={regFirstName} onChange={e => setRegFirstName(e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm focus:border-purple-500 outline-none" placeholder={lang === 'ar' ? 'الاسم الأول' : 'First name'} />
                      </div>
                      <div>
                        <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'اسم العائلة' : 'Last Name'}</label>
                        <input type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm focus:border-purple-500 outline-none" placeholder={lang === 'ar' ? 'اسم العائلة' : 'Last name'} />
                      </div>
                    </div>
                    <div>
                      <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'اسم المستخدم' : 'Username'}</label>
                      <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, ''))}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm focus:border-purple-500 outline-none" placeholder={lang === 'ar' ? 'اختر اسم مستخدم' : 'Choose a username'} />
                    </div>
                    <div>
                      <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'الهاتف (الأردن)' : 'Phone (Jordan)'}</label>
                      <input type="tel" value={regPhone} onChange={e => { let d = e.target.value.replace(/\D/g, ''); if (!d.startsWith('962')) d = '962' + d.replace(/^0/, ''); setRegPhone('+' + d.slice(0,12)); }}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm focus:border-purple-500 outline-none" placeholder="+962 7X XXXX XXX" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'رمز PIN من 6 أرقام' : '6-Digit PIN'}</label>
                        <input type="password" value={regPin} onChange={e => setRegPin(e.target.value.replace(/\D/g, '').slice(0,6))}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm tracking-[0.3em] text-center focus:border-purple-500 outline-none" placeholder="• • • • • •" maxLength={6} />
                      </div>
                      <div>
                        <label className="text-gray-500 font-body text-[11px] mb-1 block">{lang === 'ar' ? 'تأكيد رمز PIN' : 'Confirm PIN'}</label>
                        <input type="password" value={regConfirmPin} onChange={e => setRegConfirmPin(e.target.value.replace(/\D/g, '').slice(0,6))}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white font-body text-sm tracking-[0.3em] text-center focus:border-purple-500 outline-none" placeholder="• • • • • •" maxLength={6} />
                      </div>
                    </div>
                    {regError && <p className="text-red-400 font-body text-sm text-center">{regError}</p>}
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={async () => {
                        setRegError('');
                        if (!regFirstName || !regLastName || !regUsername || !regPin) { setRegError('Fill all fields'); return; }
                        if (regPin.length !== 6) { setRegError('PIN must be 6 digits'); return; }
                        if (regPin !== regConfirmPin) { setRegError('PINs do not match'); return; }
                        setRegLoading(true);
                        const qU = query(collection(db, 'players'), where('username', '==', regUsername.toLowerCase()));
                        const sU = await getDocs(qU);
                        if (!sU.empty) { setRegError('Username taken'); setRegLoading(false); return; }
                        setRegLoading(false);
                        setBecomeUserStep('ninja');
                      }}
                      disabled={regLoading}
                      className="w-full py-3.5 rounded-xl font-ninja text-lg tracking-wider text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}
                    >
                      {regLoading ? <Loader2 size={18} className="animate-spin" /> : null} {lang === 'ar' ? 'التالي - اختر نينجا' : 'NEXT - CHOOSE NINJA'}
                    </motion.button>
                  </div>
                </>
              ) : becomeUserStep === 'ninja' ? (
                /* ── Ninja Picker ── */
                <>
                  <div className="px-8 pt-6 pb-2 text-center">
                    <h2 className="font-ninja text-2xl tracking-wider mb-1" style={{ background: 'linear-gradient(90deg, #A855F7, #E879F9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{lang === 'ar' ? 'اختر نينجاك' : 'CHOOSE YOUR NINJA'}</h2>
                    <p className="font-body text-gray-500 text-xs">{lang === 'ar' ? 'اختر نينجاك المبتدئ' : 'Pick your starter ninja'}</p>
                  </div>
                  <div className="px-8 pb-4">
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'neon', name: 'Neon', color: '#39FF14' }, { id: 'fire', name: 'Fire', color: '#FF4500' },
                        { id: 'ice', name: 'Ice', color: '#00BFFF' }, { id: 'shadow', name: 'Shadow', color: '#8B00FF' },
                        { id: 'cyber', name: 'Cyber', color: '#9B59B6' }, { id: 'phantom', name: 'Phantom', color: '#708090' },
                        { id: 'storm', name: 'Storm', color: '#4169E1' }, { id: 'sakura', name: 'Sakura', color: '#FF69B4' },
                      ].map(n => (
                        <motion.button key={n.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => setRegNinja(n.id)}
                          className={`rounded-xl p-3 text-center border-2 transition-all ${regNinja === n.id ? 'border-opacity-60' : 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]'}`}
                          style={regNinja === n.id ? { borderColor: n.color, background: `${n.color}15`, boxShadow: `0 0 15px ${n.color}30` } : {}}>
                          <div className="w-14 h-14 mx-auto mb-1.5 rounded-full overflow-hidden border-2" style={{ borderColor: regNinja === n.id ? n.color : 'rgba(255,255,255,0.1)' }}>
                            <img src={`/ninjas/profiles/${n.id}-ninja-profile-photo.png`} alt={n.name} className="w-full h-full object-cover" />
                          </div>
                          <p className="font-ninja text-[11px] tracking-wider" style={{ color: regNinja === n.id ? n.color : '#9CA3AF' }}>{n.name.toUpperCase()}</p>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  <div className="px-8 pb-6">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => setBecomeUserStep('package')}
                      className="w-full py-3.5 rounded-xl font-ninja text-lg tracking-wider text-white flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #A855F7)' }}
                    >
                      {lang === 'ar' ? 'التالي - اختر الباقة' : 'NEXT - CHOOSE PACKAGE'}
                    </motion.button>
                    <button onClick={() => setBecomeUserStep('form')} className="w-full mt-2 py-2 text-gray-600 font-body text-sm hover:text-gray-400 transition-all">{lang === 'ar' ? 'رجوع' : 'Back'}</button>
                  </div>
                </>
              ) : becomeUserStep === 'package' ? (
                /* ── Package Picker + Complete ── */
                <>
                  <div className="px-8 pt-6 pb-2 text-center">
                    <h2 className="font-ninja text-2xl tracking-wider mb-1" style={{ background: 'linear-gradient(90deg, #FBBF24, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{lang === 'ar' ? 'اختر الباقة' : 'CHOOSE YOUR PACKAGE'}</h2>
                    <p className="font-body text-gray-500 text-xs">{lang === 'ar' ? 'اختر باقة عملات لبدء اللعب' : 'Select a token package to start playing'}</p>
                  </div>
                  <div className="px-8 pb-4">
                    <div className="rounded-xl p-5 border-2 border-yellow-500/40 bg-yellow-500/[0.05]">
                      <label className="block font-ninja text-xs text-gray-400 tracking-wider mb-2">
                        {lang === 'ar' ? 'كم توكنز تريد؟' : 'HOW MANY TOKENS?'}
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            min={100}
                            step={50}
                            inputMode="numeric"
                            value={regCustomTokens}
                            onChange={(e) => setRegCustomTokens(e.target.value)}
                            placeholder={lang === 'ar' ? 'أدخل التوكنز' : 'Enter tokens'}
                            className="w-full bg-white/5 border border-yellow-500/30 rounded-md px-3 py-2.5 font-ninja text-xl text-white outline-none focus:border-yellow-400 placeholder:text-gray-600"
                          />
                          <Coins size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-500/60 pointer-events-none" />
                        </div>
                        <div className="text-right">
                          <div className="font-ninja text-2xl text-white leading-none">
                            {regCustomValid ? regCustomPriceJOD.toFixed(2) : '—'}
                          </div>
                          <div className="font-body text-[10px] text-gray-500 mt-0.5">JOD</div>
                        </div>
                      </div>
                      <p className="font-body text-[10px] text-gray-500 mt-2">
                        {lang === 'ar' ? `الحد الأدنى 100 · 100 توكنز = 1 دينار` : `Min 100 · 100 tokens = 1 JOD`}
                      </p>
                    </div>
                  </div>
                  <div className="px-8 pb-6">
                    {regError && <p className="text-red-400 font-body text-sm text-center mb-3">{regError}</p>}
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      disabled={!regCustomValid || regLoading}
                      onClick={async () => {
                        if (!regCustomValid) return;
                        setRegLoading(true);
                        setRegError('');
                        try {
                          const pkg = { id: 'custom', coins: regCustomNum, price: regCustomPriceJOD };
                          const ninjaColor = [
                            { id: 'neon', c: '#39FF14' }, { id: 'fire', c: '#FF4500' }, { id: 'ice', c: '#00BFFF' }, { id: 'shadow', c: '#8B00FF' },
                            { id: 'cyber', c: '#9B59B6' }, { id: 'phantom', c: '#708090' }, { id: 'storm', c: '#4169E1' }, { id: 'sakura', c: '#FF69B4' },
                          ].find(n => n.id === regNinja)?.c || '#39FF14';
                          const genRefCode = regUsername.toUpperCase().slice(0, 4) + String(Date.now()).slice(-4);
                          const regData = {
                            firstName: regFirstName, lastName: regLastName,
                            username: regUsername.toLowerCase(), phone: regPhone.replace(/\s/g, ''), pin: regPin,
                            totalCoinsSpent: 0, totalPlaytime: 0, ninjaType: regNinja,
                            character: { skinColor: ninjaColor, outfitId: 'outfit_default', maskId: 'mask_default', accessoryId: 'none', equippedSkins: [], ninjaType: regNinja },
                            ownedNinjas: [regCountry, regNinja], equippedNinja: regNinja,
                            vip: { active: false },
                            inventory: [], friends: [], titles: ['Newcomer'], activeTitle: 'Newcomer',
                            stats: { totalKills: 0, totalDeaths: 0, totalHeadshots: 0, totalWins: 0, gamesPlayed: 0, chestsOpened: 0, foodOrdered: 0, longestStreak: 0, favoriteGame: '', gameStats: {} },
                            onlineStatus: { isOnline: false, currentActivity: '', lastSeen: Date.now() },
                            banned: false, referralCode: genRefCode, referredBy: null, bio: '', socialLinks: {},
                            privacySettings: { inventoryVisibility: 'public', profileVisibility: 'public' },
                            totalGiftsReceived: 0, gamePlaytime: {}, country: regCountry || '',
                          };
                          // Send pending request to admin (don't create account yet)
                          const reqRef = await addDoc(collection(db, 'guest-reg-topups'), {
                            regData,
                            packageId: pkg?.id || '',
                            coins: pkg?.coins || 0,
                            priceJOD: pkg?.price || 0,
                            playerName: regUsername.toLowerCase(),
                            status: 'pending',
                            createdAt: Date.now(),
                          });
                          notifyAdmin('guest_reg_topup', 'New Account + Top-Up', `${regUsername} wants to register + ${pkg?.coins || 0} coins (${pkg?.price || 0} JOD)`);
                          setRegPendingRequestId(reqRef.id);
                          setBecomeUserStep('pendingApproval');
                        } catch (err) {
                          setRegError('Request failed. Try again.');
                        }
                        setRegLoading(false);
                      }}
                      className="w-full py-4 rounded-xl font-ninja text-xl tracking-wider text-black flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      style={{ background: regCustomValid ? 'linear-gradient(135deg, #FBBF24, #F59E0B)' : 'rgba(251,191,36,0.3)' }}
                    >
                      {regLoading ? <Loader2 size={20} className="animate-spin text-black" /> : <Sparkles size={20} />}
                      {lang === 'ar' ? 'طلب الحساب والشحن' : 'REQUEST ACCOUNT & TOP-UP'}
                    </motion.button>
                    <button onClick={() => setBecomeUserStep('ninja')} className="w-full mt-2 py-2 text-gray-600 font-body text-sm hover:text-gray-400 transition-all">{lang === 'ar' ? 'رجوع' : 'Back'}</button>
                  </div>
                </>
              ) : becomeUserStep === 'pendingApproval' ? (
                /* Waiting for admin to approve top-up */
                <>
                  <div className="px-8 py-12 text-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(251,191,36,0.1)', border: '2px solid rgba(251,191,36,0.3)', boxShadow: '0 0 30px rgba(251,191,36,0.2)' }}
                    >
                      <Loader2 size={36} className="text-yellow-400 animate-spin" />
                    </motion.div>
                    <h2 className="font-ninja text-2xl text-yellow-400 mb-3 tracking-wider">{lang === 'ar' ? 'بانتظار الموافقة' : 'WAITING FOR APPROVAL'}</h2>
                    <p className="font-body text-gray-400 text-sm mb-2">{lang === 'ar' ? 'تم إرسال طلب التسجيل والشحن!' : 'Your registration and top-up request has been sent!'}</p>
                    <p className="font-body text-gray-500 text-xs mb-2">{lang === 'ar' ? 'سيوافق المسؤول على دفعتك وسيتم إنشاء حسابك تلقائيًا.' : 'The admin will approve your payment and your account will be created automatically.'}</p>
                    <p className="font-body text-gray-600 text-[11px]">{lang === 'ar' ? 'الرجاء الانتظار أو اطلب المساعدة من الموظفين.' : 'Please wait or ask staff for help.'}</p>
                  </div>
                </>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Up Modal — Cyberpunk HUD (matches Buy Time) */}
      <AnimatePresence>
        {showTopUpModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowTopUpModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
              className="w-[520px] max-w-[95vw] relative overflow-visible rounded-2xl"
              onClick={(e) => e.stopPropagation()}>
              {/* Background + PCB */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0c0810 0%, #0a0a18 30%, #0c1018 60%, #080810 100%)' }} />
                <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 80% 80%, rgba(234,179,8,0.06) 0%, transparent 50%), radial-gradient(circle at 20% 20%, rgba(0,200,255,0.04) 0%, transparent 50%)' }} />
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 520 650" preserveAspectRatio="none">
                  <motion.path d="M0,60 L90,60 L110,40 L250,40 L270,60 L520,60" stroke="#eab308" strokeWidth="0.7" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.1 }} transition={{ duration: 2, delay: 0.3 }} />
                  <motion.path d="M520,180 L400,180 L380,200 L280,200 L260,180 L140,180" stroke="#00c8ff" strokeWidth="0.6" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 2, delay: 0.6 }} />
                  <motion.path d="M0,320 L120,320 L140,340 L300,340 L320,320 L520,320" stroke="#eab308" strokeWidth="0.6" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 2, delay: 0.8 }} />
                  <motion.path d="M520,460 L380,460 L360,480 L200,480 L180,460 L0,460" stroke="#00c8ff" strokeWidth="0.5" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 1 }} />
                  <motion.path d="M250,0 L250,40 L230,60 L230,180" stroke="#eab308" strokeWidth="0.5" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 1.5, delay: 0.7 }} />
                  <motion.path d="M380,200 L380,320 L360,340 L360,460" stroke="#00c8ff" strokeWidth="0.5" fill="none"
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 1.5, delay: 1 }} />
                  <motion.circle cx="250" cy="40" r="2" fill="#eab308" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.2, 0.08] }} transition={{ duration: 1, delay: 2.5, repeat: Infinity, repeatDelay: 4 }} />
                  <motion.circle cx="380" cy="200" r="2" fill="#00c8ff" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.18, 0.07] }} transition={{ duration: 1, delay: 3, repeat: Infinity, repeatDelay: 5 }} />
                  <motion.rect x="246" y="36" width="8" height="8" rx="1" fill="none" stroke="#eab308" strokeWidth="0.7" initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 2 }} />
                </svg>
              </div>

              <div className="relative z-10 p-8">
              {topUpSent ? (
                <div className="text-center py-8">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 150 }}>
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                      style={{ background: 'rgba(234,179,8,0.1)', border: '2px solid rgba(234,179,8,0.3)', boxShadow: '0 0 25px rgba(234,179,8,0.15)' }}>
                      <Coins size={36} className="text-yellow-400" />
                    </div>
                  </motion.div>
                  <h3 className="font-ninja text-2xl text-yellow-400 mb-2">{t(lang, 'request_sent')}</h3>
                  <p className="font-body text-gray-400 text-sm">{t(lang, 'admin_notified')}</p>
                  <button onClick={() => setShowTopUpModal(false)}
                    className="buytime-bubble-btn mt-6 px-10 py-3 rounded-xl font-ninja text-lg border-none cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, #d4a017, #eab308)', color: '#000' }}>
                    {t(lang, 'ok')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                    className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ border: '2px solid rgba(234,179,8,0.4)', background: 'radial-gradient(circle, rgba(234,179,8,0.15) 0%, transparent 70%)', boxShadow: '0 0 15px rgba(234,179,8,0.1)' }}>
                        <Coins size={20} className="text-yellow-400" />
                      </motion.div>
                      <h2 className="font-ninja text-3xl text-white tracking-wide" style={{ textShadow: '0 0 20px rgba(234,179,8,0.15)' }}>{lang === 'ar' ? 'شحن' : 'TOP UP'}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Switch to Buy Time */}
                      <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}
                        onClick={() => { setShowTopUpModal(false); setShowBuyTimeModal(true); setBuyTimeSelected(null); }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="hidden sm:flex items-center gap-1.5 px-3 h-11 rounded-xl font-ninja text-xs tracking-wider transition-all relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.12), rgba(57,255,20,0.05))', border: '1px solid rgba(57,255,20,0.35)', color: '#39FF14', boxShadow: '0 0 10px rgba(57,255,20,0.08)' }}>
                        <Timer size={14} /> {lang === 'ar' ? 'شراء وقت' : 'BUY TIME'}
                      </motion.button>
                      <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                        onClick={() => setShowTopUpModal(false)}
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:rotate-90 relative z-[100]"
                        style={{
                          background: 'linear-gradient(135deg, rgba(8,10,12,0.96), rgba(12,16,20,0.96))',
                          border: '1px solid rgba(255,255,255,0.18)',
                          boxShadow: '0 0 12px rgba(0,0,0,0.5), 0 6px 16px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.4)',
                          backdropFilter: 'blur(6px)',
                          transition: 'all 0.3s',
                        }}>
                        <X size={22} strokeWidth={2.4} className="text-gray-200" />
                      </motion.button>
                    </div>
                  </motion.div>

                  {/* Balance + Name */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                    className="font-body text-sm text-gray-400 mb-5 flex items-center justify-between flex-wrap gap-2">
                    <span>{lang === 'ar' ? 'الرصيد:' : 'Balance:'} <motion.span
                      animate={{ textShadow: ['0 0 8px rgba(234,179,8,0.3)', '0 0 16px rgba(234,179,8,0.6)', '0 0 8px rgba(234,179,8,0.3)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="font-ninja text-yellow-400 text-lg">{Math.floor(coins)} {lang === 'ar' ? 'توكنز' : 'tokens'}</motion.span></span>
                    <span className="flex items-center gap-1.5">
                      {lang === 'ar' ? 'لـ:' : 'For:'}{' '}
                      {editingTopUpName ? (
                        <input type="text" value={topUpPlayerName} onChange={(e) => setTopUpPlayerName(e.target.value)}
                          onBlur={() => setEditingTopUpName(false)} onKeyDown={(e) => e.key === 'Enter' && setEditingTopUpName(false)} autoFocus
                          className="inline-block bg-white/5 border border-yellow-500/40 rounded px-2 py-0.5 text-yellow-400 font-ninja text-sm outline-none focus:border-yellow-400 w-28 text-center" />
                      ) : (
                        <span onClick={() => setEditingTopUpName(true)} className="text-yellow-400 font-ninja cursor-pointer hover:underline underline-offset-2">{topUpPlayerName || player.username}</span>
                      )}
                    </span>
                  </motion.div>

                  {/* ── Package cards (compact, one row per tier, no scroll) ── */}
                  <div className="space-y-1.5 mb-5">
                    {COIN_PACKAGES.map((pkg, idx) => {
                      const selected = topUpSelected === pkg.id;
                      const isPopular = !!pkg.popular;
                      return (
                        <motion.button key={pkg.id}
                          initial={{ opacity: 0, x: -24 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.22 + idx * 0.05, type: 'spring', stiffness: 120 }}
                          onClick={() => { setTopUpSelected(pkg.id); setTopUpCustomTokens(''); }}
                          className="w-full text-left transition-all relative group">
                          <motion.div
                            animate={selected ? { boxShadow: ['0 0 0px rgba(234,179,8,0)', '0 0 18px rgba(234,179,8,0.18)', '0 0 0px rgba(234,179,8,0)'] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="relative rounded-lg overflow-hidden"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: isPopular ? 'none' : `1px solid ${selected ? 'rgba(234,179,8,0.45)' : 'rgba(255,255,255,0.08)'}`,
                            }}>
                            {isPopular && (
                              <motion.div className="absolute -inset-[1.5px] rounded-lg"
                                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                style={{
                                  background: 'linear-gradient(135deg, #fbbf24, #eab308, #d4a017, #fbbf24)',
                                  backgroundSize: '300% 300%',
                                }} />
                            )}
                            <div className="relative rounded-lg px-4 py-2.5" style={{
                              background: isPopular
                                ? 'linear-gradient(135deg, #140f04, #1a1405, #140e04)'
                                : 'rgba(255,255,255,0.02)',
                            }}>
                              {/* HUD corner accents */}
                              {[
                                { pos: 'top-0 left-0', border: 'borderTop,borderLeft' },
                                { pos: 'top-0 right-0', border: 'borderTop,borderRight' },
                                { pos: 'bottom-0 left-0', border: 'borderBottom,borderLeft' },
                                { pos: 'bottom-0 right-0', border: 'borderBottom,borderRight' },
                              ].map((corner, ci) => {
                                const borders: Record<string, string> = {};
                                corner.border.split(',').forEach(b => { borders[b] = `2px solid ${selected ? '#eab308' : 'rgba(234,179,8,0.3)'}`; });
                                return (
                                  <div key={ci} className={`absolute ${corner.pos} w-3 h-3 pointer-events-none`} style={borders} />
                                );
                              })}

                              <div className="flex items-center gap-3">
                                {/* Radio */}
                                <motion.div
                                  animate={selected ? { boxShadow: ['0 0 6px rgba(234,179,8,0.3)', '0 0 12px rgba(234,179,8,0.55)', '0 0 6px rgba(234,179,8,0.3)'] } : {}}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{ border: `2px solid ${selected ? '#eab308' : 'rgba(150,150,150,0.4)'}` }}>
                                  <AnimatePresence>
                                    {selected && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 300 }}
                                        className="w-2 h-2 rounded-full bg-yellow-400" style={{ boxShadow: '0 0 5px rgba(234,179,8,0.8)' }} />
                                    )}
                                  </AnimatePresence>
                                </motion.div>

                                {/* Swap: JOD → tokens */}
                                <div className="flex-1 flex items-center justify-center gap-2 relative overflow-hidden">
                                  {/* JOD side — inline "20 JOD" */}
                                  <motion.div
                                    animate={selected ? { x: [-3, 3, -3], scale: [1, 1.03, 1] } : {}}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="flex items-baseline gap-1.5 flex-1 justify-end tabular-nums"
                                  >
                                    <span className="font-ninja text-2xl text-white"
                                      style={{ textShadow: selected ? '0 0 18px rgba(255,255,255,0.3)' : '0 0 6px rgba(255,255,255,0.12)' }}>
                                      {pkg.price}
                                    </span>
                                    <span className="font-ninja text-[12px] tracking-[0.2em] text-white/70">JOD</span>
                                  </motion.div>

                                  {/* Swap arrow + gold particles */}
                                  <div className="relative w-11 h-7 flex items-center justify-center flex-shrink-0">
                                    <motion.div
                                      animate={selected ? { x: [-2, 2, -2], opacity: [0.6, 1, 0.6] } : {}}
                                      transition={{ duration: 1.2, repeat: Infinity }}
                                      className="flex items-center"
                                    >
                                      <div className="w-3 h-[2px] rounded-full" style={{ background: selected ? '#eab308' : 'rgba(234,179,8,0.3)', boxShadow: selected ? '0 0 6px rgba(234,179,8,0.55)' : 'none' }} />
                                      <ArrowRight size={16} style={{ color: selected ? '#eab308' : 'rgba(234,179,8,0.4)', filter: selected ? 'drop-shadow(0 0 5px rgba(234,179,8,0.7))' : 'none' }} />
                                    </motion.div>
                                    {selected && (
                                      <>
                                        {[0, 1, 2].map(i => (
                                          <motion.div key={i}
                                            className="absolute w-1 h-1 rounded-full"
                                            style={{ background: '#FFD700', boxShadow: '0 0 5px #FFD700' }}
                                            animate={{ x: [-16, 16], opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
                                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.3, ease: 'linear' }}
                                          />
                                        ))}
                                      </>
                                    )}
                                  </div>

                                  {/* Tokens side */}
                                  <motion.div
                                    animate={selected ? { x: [3, -3, 3], scale: [1, 1.03, 1] } : {}}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="flex items-center gap-1.5 flex-1"
                                  >
                                    <Coins size={20} className="text-yellow-400 flex-shrink-0"
                                      style={{ filter: selected ? 'drop-shadow(0 0 8px rgba(234,179,8,0.55))' : 'none' }} />
                                    <div className="text-left leading-tight">
                                      <div className="flex items-baseline gap-1">
                                        <span className="font-ninja text-2xl text-yellow-400 tabular-nums"
                                          style={{ textShadow: selected ? '0 0 16px rgba(234,179,8,0.5)' : '0 0 6px rgba(234,179,8,0.2)' }}>
                                          +{pkg.coins.toLocaleString()}
                                        </span>
                                        {pkg.bonusPercentage !== undefined && pkg.bonusPercentage > 0 && (
                                          <span className="font-ninja text-[10px] tracking-wider text-green-400">+{pkg.bonusPercentage}%</span>
                                        )}
                                      </div>
                                      <div className="font-ninja text-[9px] tracking-[0.25em] text-yellow-500/60 leading-none">
                                        {(pkg.name || 'TOKENS').toUpperCase()}
                                      </div>
                                    </div>
                                  </motion.div>
                                </div>
                              </div>

                            </div>
                          </motion.div>

                          {/* POPULAR pill — rendered outside the overflow-hidden card so
                              the bubble can float above the edge at full size. */}
                          {isPopular && (
                            <motion.div
                              animate={{ y: [0, -2, 0], scale: [1, 1.05, 1], boxShadow: ['0 0 10px rgba(234,179,8,0.35)', '0 0 22px rgba(234,179,8,0.6)', '0 0 10px rgba(234,179,8,0.35)'] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="absolute -top-2.5 right-4 px-2.5 py-[3px] rounded-full font-ninja text-[10px] tracking-[0.25em] flex items-center gap-1 z-20 whitespace-nowrap pointer-events-none"
                              style={{
                                background: 'linear-gradient(135deg, #fde047, #fbbf24, #eab308)',
                                color: '#000',
                                border: '1px solid rgba(255,220,0,0.6)',
                                textShadow: '0 1px 0 rgba(255,255,255,0.2)',
                              }}>
                              ⭐ {lang === 'ar' ? 'الأكثر شعبية' : 'POPULAR'}
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* ── TOP-UP AMOUNT card ── */}
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
                    onClick={() => setTopUpSelected('custom')}
                    className="w-full text-left mb-6 cursor-pointer"
                  >
                    <div
                      className="relative rounded-lg overflow-hidden px-5 py-4"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${topUpSelected === 'custom' ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: topUpSelected === 'custom' ? '0 0 18px rgba(234,179,8,0.12)' : 'none',
                      }}
                    >
                      {/* HUD corners */}
                      {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                        <div
                          key={ci}
                          className={`absolute ${pos} w-4 h-4 pointer-events-none`}
                          style={{
                            ...(pos.includes('top') ? { borderTop: `2px solid ${topUpSelected === 'custom' ? '#eab308' : 'rgba(234,179,8,0.25)'}` } : { borderBottom: `2px solid ${topUpSelected === 'custom' ? '#eab308' : 'rgba(234,179,8,0.25)'}` }),
                            ...(pos.includes('left') ? { borderLeft: `2px solid ${topUpSelected === 'custom' ? '#eab308' : 'rgba(234,179,8,0.25)'}` } : { borderRight: `2px solid ${topUpSelected === 'custom' ? '#eab308' : 'rgba(234,179,8,0.25)'}` }),
                          }}
                        />
                      ))}

                      <div className="flex items-center gap-4">
                        {/* Radio indicator */}
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ border: `2px solid ${topUpSelected === 'custom' ? '#eab308' : 'rgba(150,150,150,0.4)'}` }}
                        >
                          {topUpSelected === 'custom' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" style={{ boxShadow: '0 0 6px rgba(234,179,8,0.8)' }} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-ninja text-sm text-gray-400 tracking-wider">{lang === 'ar' ? 'مبلغ مخصص' : 'CUSTOM AMOUNT'}</span>
                            <span className="font-body text-[10px] text-gray-600">{lang === 'ar' ? 'الحد الأدنى' : 'min'} {CUSTOM_TOKEN_MIN.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 relative">
                              <input
                                type="number"
                                min={CUSTOM_TOKEN_MIN}
                                step={50}
                                inputMode="numeric"
                                value={topUpCustomTokens}
                                onChange={(e) => { setTopUpCustomTokens(e.target.value); setTopUpSelected('custom'); }}
                                onClick={(e) => { e.stopPropagation(); setTopUpSelected('custom'); }}
                                placeholder={lang === 'ar' ? 'أدخل التوكنز' : 'Enter tokens'}
                                className="w-full bg-white/5 border border-yellow-500/30 rounded-md px-3 py-2 font-ninja text-lg text-white outline-none focus:border-yellow-400 placeholder:text-gray-600"
                                style={{ textShadow: '0 0 8px rgba(234,179,8,0.2)' }}
                              />
                              <Coins size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-500/60 pointer-events-none" />
                            </div>
                            <div className="text-right">
                              <div className="font-ninja text-2xl text-white leading-none">
                                {topUpCustomValid ? topUpCustomPriceJOD.toFixed(2) : '—'}
                              </div>
                              <div className="font-body text-[10px] text-gray-500 mt-0.5">JOD</div>
                            </div>
                          </div>
                          {!topUpCustomValid && topUpCustomTokens && (
                            <p className="font-body text-[10px] text-red-400 mt-1.5">
                              {lang === 'ar'
                                ? `الحد الأدنى هو ${CUSTOM_TOKEN_MIN.toLocaleString()} توكنز. استخدم باقة للمبالغ الأصغر.`
                                : `Minimum is ${CUSTOM_TOKEN_MIN.toLocaleString()} tokens. Use a package for smaller amounts.`}
                            </p>
                          )}
                          {topUpCustomValid && (
                            <p className="font-body text-[10px] text-gray-500 mt-1.5">
                              {CUSTOM_TOKENS_PER_JOD} {lang === 'ar' ? 'توكنز / دينار · ' : 'tokens / JOD · '}{Math.floor(topUpCustomNum / 150)}h {Math.round((topUpCustomNum % 150) / 2.5)}m {lang === 'ar' ? 'وقت لعب' : 'play time'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Request Top-Up button with bubble effect */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                    style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                    {(() => {
                      const selectedPkg = topUpSelected && topUpSelected !== 'custom'
                        ? COIN_PACKAGES.find(p => p.id === topUpSelected)
                        : null;
                      // Valid if: a package is selected OR a valid custom amount typed.
                      const canSubmit = !!selectedPkg || topUpCustomValid;
                      return (
                        <button
                          disabled={!canSubmit || topUpLoading}
                          onClick={async () => {
                            if (!canSubmit) return;
                            setTopUpLoading(true);
                            try {
                              const payload = selectedPkg
                                ? { packageId: selectedPkg.id, coins: selectedPkg.coins, priceJOD: selectedPkg.price, custom: false }
                                : { packageId: 'custom', coins: topUpCustomNum, priceJOD: topUpCustomPriceJOD, custom: true };
                              await addDoc(collection(db, 'topup-requests'), {
                                playerId: player.uid, playerName: topUpPlayerName || player.username,
                                ...payload,
                                status: 'pending', createdAt: Date.now(),
                              });
                            } catch (err) {
                              console.error('TopUp request failed:', err);
                            }
                            setTopUpLoading(false);
                            setTopUpSent(true);
                          }}
                          className={`buytime-bubble-btn w-full py-4 rounded-xl font-ninja text-xl tracking-wider flex items-center justify-center gap-3 border-none cursor-pointer ${!canSubmit ? 'opacity-40 pointer-events-none' : ''}`}
                          style={{
                            background: canSubmit ? 'linear-gradient(135deg, #d4a017, #eab308, #d4a017)' : 'rgba(234,179,8,0.15)',
                            color: canSubmit ? '#000' : 'rgba(234,179,8,0.4)',
                            boxShadow: canSubmit ? '0 0 20px rgba(234,179,8,0.3)' : 'none',
                          }}>
                          {topUpLoading ? <Loader2 size={20} className="animate-spin" /> : <Coins size={20} />}
                          {topUpLoading ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'SENDING...') : (lang === 'ar' ? 'طلب شحن' : 'REQUEST TOP-UP')}
                        </button>
                      );
                    })()}
                  </motion.div>

                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                    className="font-body text-gray-600 text-[11px] text-center mt-4">{lang === 'ar' ? 'اطلب من الموظف تأكيد دفعتك.' : 'Ask staff to confirm your payment.'}</motion.p>
                </>
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buy Time Modal — Animated Cyberpunk HUD */}
      <AnimatePresence>
        {showBuyTimeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowBuyTimeModal(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
              className="w-[520px] max-w-[95vw] relative overflow-visible rounded-2xl"
              onClick={(e) => e.stopPropagation()}>
              {/* Background layers — clipped to card */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #080c12 0%, #0a1018 30%, #0c1420 60%, #081014 100%)' }} />
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(0,255,180,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(0,200,255,0.05) 0%, transparent 50%)' }} />

              {/* PCB / Motherboard trace pattern — full background */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 520 700" preserveAspectRatio="none">
                {/* Main horizontal traces */}
                <motion.path d="M0,50 L80,50 L100,70 L200,70 L220,50 L350,50 L370,70 L520,70" stroke="#00ffb4" strokeWidth="0.8" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.12 }} transition={{ duration: 2, delay: 0.2 }} />
                <motion.path d="M0,140 L60,140 L80,120 L180,120 L200,140 L300,140" stroke="#00c8ff" strokeWidth="0.8" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.1 }} transition={{ duration: 2, delay: 0.4 }} />
                <motion.path d="M520,200 L420,200 L400,220 L300,220 L280,200 L180,200 L160,220 L100,220" stroke="#00ffb4" strokeWidth="0.8" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.08 }} transition={{ duration: 2.5, delay: 0.5 }} />
                <motion.path d="M0,320 L120,320 L140,300 L240,300 L260,320 L380,320 L400,300 L520,300" stroke="#00c8ff" strokeWidth="0.6" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.08 }} transition={{ duration: 2, delay: 0.7 }} />
                <motion.path d="M520,430 L440,430 L420,450 L320,450 L300,430 L200,430 L180,450 L0,450" stroke="#00ffb4" strokeWidth="0.6" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 2, delay: 0.9 }} />
                <motion.path d="M0,560 L100,560 L120,540 L220,540 L240,560 L360,560 L380,540 L520,540" stroke="#00c8ff" strokeWidth="0.6" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 1.1 }} />
                {/* Vertical traces */}
                <motion.path d="M100,0 L100,70 L120,90 L120,220" stroke="#00ffb4" strokeWidth="0.5" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.08 }} transition={{ duration: 1.8, delay: 0.6 }} />
                <motion.path d="M400,70 L400,200 L380,220 L380,320" stroke="#00c8ff" strokeWidth="0.5" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 1.8, delay: 0.8 }} />
                <motion.path d="M250,0 L250,50 L270,70 L270,140" stroke="#00ffb4" strokeWidth="0.5" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 1.5, delay: 1 }} />
                <motion.path d="M180,300 L180,450 L200,470 L200,560" stroke="#00c8ff" strokeWidth="0.5" fill="none"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 1.5, delay: 1.2 }} />
                {/* IC chip pads (small rectangles at trace junctions) */}
                <motion.rect x="96" y="66" width="8" height="8" rx="1" fill="none" stroke="#00ffb4" strokeWidth="0.8"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.15 }} transition={{ delay: 2 }} />
                <motion.rect x="196" y="66" width="8" height="8" rx="1" fill="none" stroke="#00ffb4" strokeWidth="0.8"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 2.1 }} />
                <motion.rect x="396" y="196" width="8" height="8" rx="1" fill="none" stroke="#00c8ff" strokeWidth="0.8"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 2.2 }} />
                <motion.rect x="296" y="296" width="8" height="8" rx="1" fill="none" stroke="#00ffb4" strokeWidth="0.8"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ delay: 2.3 }} />
                <motion.rect x="176" y="446" width="8" height="8" rx="1" fill="none" stroke="#00c8ff" strokeWidth="0.8"
                  initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ delay: 2.4 }} />
                {/* Via holes (filled circles at junctions) */}
                <motion.circle cx="100" cy="70" r="2.5" fill="#00ffb4"
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.25, 0.12] }} transition={{ duration: 1, delay: 2.5, repeat: Infinity, repeatDelay: 4 }} />
                <motion.circle cx="400" cy="200" r="2.5" fill="#00c8ff"
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.2, 0.1] }} transition={{ duration: 1, delay: 3, repeat: Infinity, repeatDelay: 5 }} />
                <motion.circle cx="250" cy="50" r="2" fill="#00ffb4"
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.2, 0.08] }} transition={{ duration: 1, delay: 3.5, repeat: Infinity, repeatDelay: 4.5 }} />
                <motion.circle cx="300" cy="320" r="2" fill="#00c8ff"
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.18, 0.08] }} transition={{ duration: 1, delay: 4, repeat: Infinity, repeatDelay: 5.5 }} />
                <motion.circle cx="180" cy="450" r="2" fill="#00ffb4"
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.15, 0.07] }} transition={{ duration: 1, delay: 4.5, repeat: Infinity, repeatDelay: 6 }} />
              </svg>
              </div>{/* end background clip wrapper */}

              {/* Content */}
              <div className="relative z-10 p-8">
              {freePlayRemaining > 0 ? (
                <div className="text-center py-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
                    className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4 border border-yellow-500/30">
                    <Timer size={30} className="text-yellow-400" />
                  </motion.div>
                  <h3 className="font-ninja text-xl text-yellow-400 mb-2">{lang === 'ar' ? 'اللعب المجاني نشط' : 'FREE PLAY ACTIVE'}</h3>
                  <p className="font-body text-gray-400 text-sm mb-4">{lang === 'ar' ? 'يمكنك شراء الوقت بعد انتهاء اللعب المجاني.' : 'You can buy time after your free play expires.'}</p>
                  <p className="font-ninja text-lg text-ninja-green">{Math.floor(freePlayRemaining / 60)}:{String(freePlayRemaining % 60).padStart(2, '0')} {lang === 'ar' ? 'متبقٍ' : 'remaining'}</p>
                  <button onClick={() => setShowBuyTimeModal(false)} className="ninja-btn ninja-btn-ghost mt-6 px-8">{t(lang, 'ok')}</button>
                </div>
              ) : (
                <>
                  {/* Animated Header */}
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                    className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ border: '2px solid rgba(150,150,150,0.4)', background: 'radial-gradient(circle, rgba(57,255,20,0.15) 0%, transparent 70%)', boxShadow: '0 0 15px rgba(57,255,20,0.1)' }}>
                        <Timer size={20} className="text-ninja-green" />
                      </motion.div>
                      <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="font-ninja text-3xl text-white tracking-wide"
                        style={{ textShadow: '0 0 20px rgba(57,255,20,0.15)' }}>{lang === 'ar' ? 'شراء وقت' : 'BUY TIME'}</motion.h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Switch to Buy Tokens */}
                      <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}
                        onClick={() => { setShowBuyTimeModal(false); setShowTopUpModal(true); setTopUpSelected('custom'); setTopUpSent(false); }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="hidden sm:flex items-center gap-1.5 px-3 h-11 rounded-xl font-ninja text-xs tracking-wider transition-all relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.05))', border: '1px solid rgba(234,179,8,0.35)', color: '#facc15', boxShadow: '0 0 10px rgba(234,179,8,0.08)' }}>
                        <Coins size={14} /> {lang === 'ar' ? 'شراء توكنز' : 'BUY TOKENS'}
                      </motion.button>
                      <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                        onClick={() => setShowBuyTimeModal(false)}
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:rotate-90 relative z-[100]"
                        style={{
                          background: 'linear-gradient(135deg, rgba(8,10,12,0.96), rgba(12,16,20,0.96))',
                          border: '1px solid rgba(255,255,255,0.18)',
                          boxShadow: '0 0 12px rgba(0,0,0,0.5), 0 6px 16px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.4)',
                          backdropFilter: 'blur(6px)',
                          transition: 'all 0.3s',
                        }}>
                        <X size={22} strokeWidth={2.4} className="text-gray-200" />
                      </motion.button>
                    </div>
                  </motion.div>

                  {/* Animated Balance */}
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                    className="font-body text-gray-400 mb-5">
                    {lang === 'ar' ? 'الرصيد:' : 'Balance:'} <motion.span
                      animate={{ textShadow: ['0 0 8px rgba(57,255,20,0.3)', '0 0 16px rgba(57,255,20,0.6)', '0 0 8px rgba(57,255,20,0.3)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="font-ninja text-ninja-green text-lg">{Math.floor(coins)} {lang === 'ar' ? 'توكنز' : 'tokens'}</motion.span>
                  </motion.p>

                  {/* Staggered Package cards */}
                  <div className="space-y-3 mb-6">
                    {TIME_PACKAGES.map((pkg, idx) => {
                      const canAfford = coins >= pkg.coins;
                      const selected = buyTimeSelected === pkg.id;
                      const isBest = pkg.id === 'time_gold';
                      return (
                        <motion.button key={pkg.id}
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: canAfford ? 1 : 0.4, x: 0 }}
                          transition={{ delay: 0.3 + idx * 0.1, type: 'spring', stiffness: 100 }}
                          onClick={() => canAfford && setBuyTimeSelected(pkg.id)}
                          disabled={!canAfford}
                          className="w-full text-left transition-all relative group">
                          {/* Card with animated HUD corner frame */}
                          <motion.div
                            animate={selected ? { boxShadow: ['0 0 0px rgba(57,255,20,0)', '0 0 20px rgba(57,255,20,0.15)', '0 0 0px rgba(57,255,20,0)'] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="relative rounded-lg overflow-hidden" style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: isBest ? 'none' : `1px solid ${selected ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          }}>
                            {/* Rainbow gradient border for BEST */}
                            {isBest && (
                              <motion.div className="absolute -inset-[2px] rounded-lg"
                                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                                style={{
                                  background: 'linear-gradient(135deg, #a855f7, #06b6d4, #39ff14, #a855f7)',
                                  backgroundSize: '300% 300%',
                                }} />
                            )}
                            <div className="relative rounded-lg px-5 py-4" style={{
                              // Solid dark bg for BEST card so the yellow/green swap numbers stay legible.
                              // Rainbow border remains visible around the outside.
                              background: isBest
                                ? 'linear-gradient(135deg, #0a0d14, #0b1120, #0a0e14)'
                                : 'rgba(255,255,255,0.02)',
                            }}>
                              {/* Animated HUD corner accents */}
                              {[
                                { pos: 'top-0 left-0', border: 'borderTop,borderLeft' },
                                { pos: 'top-0 right-0', border: 'borderTop,borderRight' },
                                { pos: 'bottom-0 left-0', border: 'borderBottom,borderLeft' },
                                { pos: 'bottom-0 right-0', border: 'borderBottom,borderRight' },
                              ].map((corner, ci) => {
                                const borders: Record<string, string> = {};
                                corner.border.split(',').forEach(b => { borders[b] = `2px solid ${selected ? '#39FF14' : 'rgba(57,255,20,0.3)'}`; });
                                return (
                                  <motion.div key={ci}
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 + idx * 0.1 + ci * 0.05 }}
                                    className={`absolute ${corner.pos} w-4 h-4`}
                                    style={borders} />
                                );
                              })}

                              <div className="flex items-center justify-between gap-4">
                                {/* Animated Radio button */}
                                <motion.div
                                  animate={selected ? { boxShadow: ['0 0 8px rgba(57,255,20,0.3)', '0 0 16px rgba(57,255,20,0.6)', '0 0 8px rgba(57,255,20,0.3)'] } : {}}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{ border: `2px solid ${selected ? '#39FF14' : 'rgba(150,150,150,0.4)'}` }}>
                                  <AnimatePresence>
                                    {selected && (
                                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 300 }}
                                        className="w-2.5 h-2.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px rgba(57,255,20,0.8)' }} />
                                    )}
                                  </AnimatePresence>
                                </motion.div>

                                {/* ═══ SWAP DISPLAY: tokens → time ═══ */}
                                <div className="flex-1 flex items-center justify-center gap-3 relative overflow-hidden">
                                  {/* Tokens side */}
                                  <motion.div
                                    animate={selected ? { x: [-4, 4, -4], scale: [1, 1.04, 1] } : {}}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="flex items-center gap-2 flex-1 justify-end"
                                  >
                                    <Coins size={28} className="text-yellow-400 flex-shrink-0"
                                      style={{ filter: selected ? 'drop-shadow(0 0 10px rgba(234,179,8,0.6))' : 'none' }} />
                                    <div className="text-right">
                                      <span className="font-ninja text-3xl text-yellow-400 tabular-nums"
                                        style={{ textShadow: selected ? '0 0 20px rgba(234,179,8,0.55), 0 0 40px rgba(234,179,8,0.25)' : '0 0 8px rgba(234,179,8,0.25)' }}>
                                        −{pkg.coins.toLocaleString()}
                                      </span>
                                      <p className="font-ninja text-[10px] tracking-[0.3em] text-yellow-500/70 leading-none mt-0.5">{lang === 'ar' ? 'توكنز' : 'TOKENS'}</p>
                                    </div>
                                  </motion.div>

                                  {/* Swap arrow with flying coins */}
                                  <div className="relative w-14 h-10 flex items-center justify-center flex-shrink-0">
                                    {/* Base arrow */}
                                    <motion.div
                                      animate={selected ? { x: [-2, 2, -2], opacity: [0.6, 1, 0.6] } : {}}
                                      transition={{ duration: 1.2, repeat: Infinity }}
                                      className="flex items-center"
                                    >
                                      <div className="w-4 h-[2px] rounded-full" style={{ background: selected ? '#39FF14' : 'rgba(57,255,20,0.3)', boxShadow: selected ? '0 0 8px rgba(57,255,20,0.6)' : 'none' }} />
                                      <ArrowRight size={20} style={{ color: selected ? '#39FF14' : 'rgba(57,255,20,0.4)', filter: selected ? 'drop-shadow(0 0 6px rgba(57,255,20,0.7))' : 'none' }} />
                                    </motion.div>
                                    {/* Flying coin particles when selected */}
                                    {selected && (
                                      <>
                                        {[0, 1, 2].map(i => (
                                          <motion.div key={i}
                                            className="absolute w-1.5 h-1.5 rounded-full"
                                            style={{ background: '#FFD700', boxShadow: '0 0 6px #FFD700' }}
                                            animate={{ x: [-20, 20], opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
                                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.3, ease: 'linear' }}
                                          />
                                        ))}
                                      </>
                                    )}
                                  </div>

                                  {/* Time side */}
                                  <motion.div
                                    animate={selected ? { x: [4, -4, 4], scale: [1, 1.04, 1] } : {}}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                    className="flex items-center gap-2 flex-1"
                                  >
                                    <div className="text-left">
                                      <span className="font-ninja text-3xl text-ninja-green tabular-nums"
                                        style={{ textShadow: selected ? '0 0 20px rgba(57,255,20,0.55), 0 0 40px rgba(57,255,20,0.25)' : '0 0 8px rgba(57,255,20,0.25)' }}>
                                        +{pkg.hours}h
                                      </span>
                                      <p className="font-ninja text-[10px] tracking-[0.3em] text-ninja-green/70 leading-none mt-0.5">{pkg.label.toUpperCase()}</p>
                                    </div>
                                    <Clock size={28} className="text-ninja-green flex-shrink-0"
                                      style={{ filter: selected ? 'drop-shadow(0 0 10px rgba(57,255,20,0.6))' : 'none' }} />
                                  </motion.div>
                                </div>

                              </div>
                            </div>
                          </motion.div>

                          {/* BEST badge — rendered outside the overflow-hidden card so
                              the bubble can float fully above the edge, no clipping. */}
                          {isBest && (
                            <motion.div
                              animate={{ y: [0, -2, 0], scale: [1, 1.05, 1], boxShadow: ['0 0 12px rgba(57,255,20,0.35)', '0 0 24px rgba(57,255,20,0.6)', '0 0 12px rgba(57,255,20,0.35)'] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="absolute -top-2.5 right-4 px-2.5 py-[3px] rounded-full font-ninja text-[10px] tracking-[0.25em] flex items-center gap-1 z-20 whitespace-nowrap pointer-events-none"
                              style={{
                                background: 'linear-gradient(135deg, #86efac, #39FF14, #06b6d4)',
                                color: '#000',
                                border: '1px solid rgba(120,255,140,0.7)',
                                textShadow: '0 1px 0 rgba(255,255,255,0.2)',
                              }}>
                              <Shield size={10} />
                              {lang === 'ar' ? 'الأفضل' : 'BEST'}
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* BUY TIME button with bubble particle effect */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                    style={{ overflow: 'visible', position: 'relative', zIndex: 10 }}>
                    <button
                      disabled={!buyTimeSelected || buyTimeLoading}
                      onClick={async () => {
                        if (!buyTimeSelected) return;
                        const pkg = TIME_PACKAGES.find(p => p.id === buyTimeSelected);
                        if (!pkg || coins < pkg.coins) return;
                        setBuyTimeLoading(true);
                        try {
                          const playtimeMinutes = pkg.hours * 60;
                          await updateDoc(doc(db, 'players', player.uid), {
                            coins: increment(-pkg.coins),
                            totalCoinsSpent: increment(pkg.coins),
                            remainingPlaytime: increment(playtimeMinutes),
                          });
                          // Notify admin (OneSignal + WhatsApp fanout)
                          notifyAdmin('top_up', 'Time Purchased',
                            `${player.username} bought ${pkg.hours}h of play (${pkg.coins} tokens)`);
                          setShowBuyTimeModal(false);
                          setBuyTimeSelected(null);
                        } catch (err) { console.error('Buy time failed:', err); }
                        setBuyTimeLoading(false);
                      }}
                      className={`buytime-bubble-btn w-full py-4 rounded-xl font-ninja text-xl tracking-wider flex items-center justify-center gap-3 border-none cursor-pointer ${!buyTimeSelected ? 'opacity-40 pointer-events-none' : ''}`}
                      style={{
                        background: buyTimeSelected ? 'linear-gradient(135deg, #2ddb1a, #39FF14, #2ddb1a)' : 'rgba(57,255,20,0.15)',
                        color: buyTimeSelected ? '#000' : 'rgba(57,255,20,0.4)',
                        boxShadow: buyTimeSelected ? '0 0 20px rgba(57,255,20,0.3)' : 'none',
                      }}>
                      {buyTimeLoading ? <Loader2 size={20} className="animate-spin" /> : <Timer size={20} />}
                      {buyTimeLoading ? (lang === 'ar' ? 'جارٍ الشراء...' : 'BUYING...') : (lang === 'ar' ? 'شراء وقت' : 'BUY TIME')}
                    </button>
                  </motion.div>

                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                    className="font-body text-gray-600 text-[11px] text-center mt-4">{lang === 'ar' ? 'يتم خصم العملات وإضافة وقت اللعب فورًا.' : 'Coins are deducted and playtime is added instantly.'}</motion.p>
                </>
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level-Up Celebration Modal */}
      <AnimatePresence>
        {showLevelUpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center"
            onClick={() => setShowLevelUpModal(false)}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 12 }}
              className="text-center p-10 rounded-3xl border-2"
              style={{ background: 'rgba(11,12,16,0.98)', borderColor: '#FFD700', boxShadow: '0 0 60px rgba(255,215,0,0.3)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1.2, 1.2, 1.2, 1] }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-7xl mb-4"
              >⚡</motion.div>
              <h2 className="font-ninja text-4xl text-yellow-400 mb-2" style={{ textShadow: '0 0 30px rgba(255,215,0,0.6)' }}>
                {lang === 'ar' ? 'ارتقاء مستوى!' : 'LEVEL UP!'}
              </h2>
              <p className="font-ninja text-6xl text-white mb-2">{lang === 'ar' ? 'المستوى' : 'LVL'} {levelUpNewLevel}</p>
              <p className="font-body text-gray-400 text-sm mb-2">{lang === 'ar' ? 'لقد ربحت صندوقًا عاديًا!' : 'You earned a Common Chest!'}</p>
              <div className="flex items-center justify-center gap-2 mb-6">
                <span className="text-2xl">🎁</span>
                <span className="font-ninja text-yellow-400 text-sm">{lang === 'ar' ? 'تمت إضافة الصندوق العادي إلى الحقيبة' : 'Common Chest Added to Inventory'}</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowLevelUpModal(false)}
                className="ninja-btn ninja-btn-yellow ninja-btn-lg px-10"
              >
                {lang === 'ar' ? 'رائع!' : 'AWESOME!'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Notification (gift/coins received) */}
      <AnimatePresence>
        {centerNotification && (
          <motion.div
            key={centerNotification.id}
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -30 }}
            transition={{ type: 'spring', damping: 15 }}
            className="fixed bottom-8 left-8 z-[250] pointer-events-none"
          >
            <motion.div
              animate={{ boxShadow: [`0 0 30px ${centerNotification.color}40`, `0 0 60px ${centerNotification.color}60`, `0 0 30px ${centerNotification.color}40`] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="glass-strong rounded-2xl px-12 py-8 text-center pointer-events-auto border-2"
              onClick={() => { setHighlightItemId(centerNotification?.itemId || null); setCenterNotification(null); setActivePopup('inventory'); }}
              style={{ cursor: 'pointer', borderColor: `${centerNotification.color}50`, background: 'rgba(11,12,16,0.95)' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                transition={{ type: 'spring', delay: 0.1 }}
                className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: `${centerNotification.color}20`, border: `2px solid ${centerNotification.color}40` }}
              >
                {centerNotification.title.includes('GIFT') ? <Gift size={32} style={{ color: centerNotification.color }} /> : <Coins size={32} style={{ color: centerNotification.color }} />}
              </motion.div>
              <h3 className="font-ninja text-2xl mb-2" style={{ color: centerNotification.color, textShadow: `0 0 20px ${centerNotification.color}60` }}>
                {centerNotification.title}
              </h3>
              <p className="font-body text-gray-300 text-sm">{centerNotification.message}</p>
              <p className="font-body text-gray-600 text-xs mt-3">{lang === 'ar' ? 'انقر لعرض الحقيبة' : 'Click to view inventory'}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Notifications */}
      <FriendNotification toasts={friendToasts} onDismiss={dismissToast} />

      {/* Floating Order Bubble (food + shisha) */}
      {!isGuest && player?.uid && <OrderBubble playerUid={player.uid} />}

      {/* Chat Panel — no floating bubble, opens via events */}
      <ChatBubble player={player} hideBubble />

      {/* Support Chat Bubble — floating bubble for contacting admin */}
      <SupportBubble player={player} />

      {/* Voice Call — listens for start-voice-call events + incoming calls */}
      <KioskVoiceCall player={player} />

      {/* Player Profile Card — triggered from any component via view-player-profile event */}
      {viewPlayerUid && (
        <PlayerProfileCard
          targetUid={viewPlayerUid}
          currentPlayer={player}
          lang={lang}
          onClose={() => setViewPlayerUid(null)}
          onStartCall={(uid, name) => {
            window.dispatchEvent(new CustomEvent('start-voice-call', { detail: { friendId: uid, friendName: name } }));
          }}
        />
      )}

      {/* Club Info Card — triggered via view-club-profile event (e.g. from PlayerProfileCard club badge) */}
      {viewClubId && (
        <ClubInfoCard
          clubId={viewClubId}
          lang={lang}
          onClose={() => setViewClubId(null)}
        />
      )}

      {/* Send Coins Modal */}
      <AnimatePresence>
        {showSendCoinsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(16px)' }}
            onClick={() => { setShowSendCoinsModal(false); setSendError(''); setSendSuccess(''); setSendPin(''); setSendPinVerified(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative rounded-2xl p-6 w-[400px] max-w-[90vw] overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 50px rgba(57,255,20,0.04)' }}
            >
              {/* HUD decorations */}
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              {/* PCB grid */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,1) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
              <div className="relative z-10">
              <div className="text-center mb-5">
                <Send size={28} className="text-ninja-green mx-auto mb-2" style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.4))' }} />
                <h3 className="font-ninja text-lg text-white" style={{ textShadow: '0 0 10px rgba(57,255,20,0.2)' }}>{t(lang, 'send_coins_title')}</h3>
                <p className="text-gray-500 font-body text-sm">{t(lang, 'transfer_coins')}</p>
              </div>

              <div className="mb-3">
                <label className="text-gray-400 text-xs font-body mb-1.5 block">{t(lang, 'recipient_username')}</label>
                <NinjaInput
                  type="text"
                  value={sendTarget}
                  onChange={(e) => setSendTarget(e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSendCoinsQuick()}
                  placeholder={t(lang, 'enter_username')}
                  autoFocus={!sendTarget}
                  icon={<User size={18} />}
                />
              </div>

              <div className="mb-4">
                <label className="text-gray-400 text-xs font-body mb-1.5 block">{t(lang, 'amount')}</label>
                <NinjaInput
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSendCoinsQuick()}
                  placeholder="0"
                  min={1}
                  autoFocus={!!sendTarget}
                  icon={<Coins size={18} className="text-yellow-400" />}
                />
                <p className="text-gray-600 font-body text-xs mt-1.5">
                  {t(lang, 'your_balance')}: <span className="text-yellow-400">{Math.floor(player.coins || 0)}</span> {t(lang, 'coins')}
                </p>
                {sendAmount && parseInt(sendAmount) > 0 && (
                  <div className="mt-2 p-2 bg-black/30 rounded-lg border border-white/5 space-y-1">
                    <div className="flex justify-between text-[11px] font-body">
                      <span className="text-gray-500">{lang === 'ar' ? 'مبلغ الإرسال' : 'Send amount'}</span>
                      <span className="text-white">{parseInt(sendAmount)} {lang === 'ar' ? 'توكنز' : 'tokens'}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-body">
                      <span className="text-gray-500">{lang === 'ar' ? 'الرسوم (10%)' : 'Fee (10%)'}</span>
                      <span className="text-red-400">+{Math.ceil(parseInt(sendAmount) * 0.1)} {lang === 'ar' ? 'توكنز' : 'tokens'}</span>
                    </div>
                    <div className="border-t border-white/10 pt-1 flex justify-between text-[11px] font-body">
                      <span className="text-gray-400">{lang === 'ar' ? 'الرصيد بعد' : 'Balance after'}</span>
                      <span className={`font-ninja ${(player.coins - Math.ceil(parseInt(sendAmount) * 1.1)) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {Math.floor(player.coins - Math.ceil(parseInt(sendAmount) * 1.1))} {lang === 'ar' ? 'توكنز' : 'tokens'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {!sendPinVerified && (
                <div className="mb-4">
                  <label className="text-gray-400 text-xs font-body mb-1.5 block">{lang === 'ar' ? 'أدخل رمز PIN للتأكيد' : 'Enter your PIN to confirm'}</label>
                  <NinjaInput
                    type="password"
                    value={sendPin}
                    onChange={(e) => setSendPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="• • • • • •"
                    maxLength={6}
                    onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSendCoinsQuick()}
                    className="text-2xl tracking-[0.5em] text-center"
                    icon={<Shield size={18} />}
                  />
                </div>
              )}

              {sendError && (
                <p className="text-red-400 font-body text-sm mb-3 flex items-center gap-1">
                  <AlertTriangle size={14} /> {sendError}
                </p>
              )}
              {sendSuccess && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-green-400 font-body text-sm mb-3 flex items-center gap-1"
                >
                  <Coins size={14} /> {sendSuccess}
                </motion.p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowSendCoinsModal(false); setSendError(''); setSendSuccess(''); setSendTarget(''); setSendAmount(''); setSendPin(''); setSendPinVerified(false); }}
                  className="ninja-btn ninja-btn-ghost flex-1"
                >
                  {t(lang, 'cancel')}
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSendCoinsQuick}
                  disabled={sendLoading}
                  className="ninja-btn ninja-btn-green-fill flex-1 flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {sendLoading ? t(lang, 'sending') : t(lang, 'send')}
                </motion.button>
              </div>
              </div>{/* end z-10 wrapper */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
