'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import { COINS_PER_MINUTE } from '@/lib/constants';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import Image from 'next/image';
import {
  Search, Play, Star, X, Coins, Plus, Send, Gift,
  CheckSquare, Gamepad2, Tv, Video, Power, Timer,
  Settings, Globe, Monitor, ExternalLink, MessageSquare, Phone, Check,
  UtensilsCrossed, Trophy, ClipboardCheck, Package, Backpack, Users, Loader2, Clock, Calendar,
  Shield, Swords, UserPlus, UserMinus, Lock
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, getDocs, addDoc, collection, query, where, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { notifyFriendsGameStart } from '@/lib/notifications';
import { trackDailyTask } from '@/lib/daily-tasks';

interface FriendData {
  uid: string;
  username: string;
  isOnline: boolean;
  currentActivity?: string;
  ninjaType?: string;
  profilePhoto?: string;
}
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { Lang, t } from '@/lib/translations';
import { ProfileTab } from './ProfileTab';
import { InventoryTab } from './InventoryTab';
import { FoodTab } from './FoodTab';
import { LeaderboardTab } from './LeaderboardTab';
import { ChestsTab } from './ChestsTab';
import { ClubPanel } from '@/components/kiosk/ClubPanel';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props {
  player: any;
  lang?: Lang;
  onAddCredit?: () => void;
  onSendCoins?: (prefillUsername?: string) => void;
  onLogout?: () => void;
  disabledGames?: string[];
  onBecomeUser?: () => void;
}

const FEATURED_IDS = ['gtav', 'csgo', 'rocketleague', 'valorant', 'fortnite', 'lol', 'overwatch2', 'fivem', 'hogwarts'];
// All installed games (have an exe path)
const ALL_INSTALLED_GAMES = GAMES_CATALOG.filter(g => g.defaultExePath && g.genre !== 'App');
const SUGGESTED_IDS = ['csgo', 'valorant', 'dota2', 'fivem', 'rocketleague'];

const SOFTWARE_LIST = [
  { id: 'chrome', name: 'Google Chrome', icon: '/software/chrome.png', exePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { id: 'edge', name: 'Microsoft Edge', icon: '/software/edge.png', exePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { id: 'discord', name: 'Discord', icon: '/software/discord.png', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
  { id: 'obs', name: 'OBS Studio', icon: '/software/obs.png', exePath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
  { id: 'streamlabs', name: 'Streamlabs', icon: '/software/streamlabs.png', exePath: 'C:\\Program Files\\Streamlabs OBS\\Streamlabs OBS.exe' },
  { id: 'hyperx', name: 'HyperX NGENUITY', icon: '/software/hyperx.png', exePath: 'C:\\Program Files\\HyperX\\HyperX NGENUITY\\HyperXNGENUITY.exe' },
  { id: 'geforce', name: 'GeForce Experience', icon: '/software/geforce.png', exePath: 'C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe' },
  { id: 'razer', name: 'Razer Synapse', icon: '/software/razer.png', exePath: 'C:\\Program Files (x86)\\Razer\\Synapse3\\UserProcess\\Razer Synapse 3.exe' },
];

export function GamesTab({ player, lang = 'en', onAddCredit, onSendCoins, onLogout, disabledGames = [], onBecomeUser }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [rightTab, setRightTab] = useState<'friends' | 'credit' | 'rewards'>('friends');
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [showAllGames, setShowAllGames] = useState(false);
  const [suggestedPage, setSuggestedPage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showFood, setShowFood] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showChests, setShowChests] = useState(false);
  const [showClub, setShowClub] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGameDetails, setShowGameDetails] = useState(false);
  const [selectedRightFriend, setSelectedRightFriend] = useState<FriendData | null>(null);
  const [viewInfoFriend, setViewInfoFriend] = useState<any | null>(null);
  const [viewInfoLoading, setViewInfoLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<string | null>(null);
  // Outgoing pending friend requests — used to show "REQUESTED" state in the inline player search.
  const [outgoingReqUids, setOutgoingReqUids] = useState<Set<string>>(new Set());
  // Unread chat count, synced from ChatBubble via 'chat-unread-count' event.
  const [chatUnread, setChatUnread] = useState(0);
  // Pending club invites (used to show a notification badge on the CLUB button).
  const [clubInviteCount, setClubInviteCount] = useState(0);
  // Inline player search (non-friend results). Populated when friendSearch has text.
  const [playerSearchResults, setPlayerSearchResults] = useState<any[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const friendSearchRef = useRef<HTMLInputElement>(null);
  const [freeChestCooldown, setFreeChestCooldown] = useState(0);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<any | null>(null);
  const [launchStatus, setLaunchStatus] = useState<'launching' | 'success' | 'failed'>('launching');
  const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartXRef = useRef(0);
  const searchPlaceholders = ['Search CS2...', 'Search Valorant...', 'Search Fortnite...', 'Search Dota 2...', 'Find a game...'];

  // ESC closes inner modals (innermost first). Register outer → inner so the
  // last-mounted handler wins.
  useEscapeKey(() => setShowGameDetails(false), showGameDetails);
  useEscapeKey(() => setSelectedRightFriend(null), selectedRightFriend !== null);
  useEscapeKey(() => setViewInfoFriend(null), viewInfoFriend !== null);
  useEscapeKey(() => setConfirmRemoveFriend(null), confirmRemoveFriend !== null);

  const availableGames = useMemo(() =>
    ALL_INSTALLED_GAMES.filter(g => !disabledGames.includes(g.id)), [disabledGames]);

  const featured = useMemo(() =>
    FEATURED_IDS.map(id => GAMES_CATALOG.find(g => g.id === id)).filter(g => g && !disabledGames.includes(g.id)), [disabledGames]);

  const sidebarGames = useMemo(() => {
    if (!searchQuery) return availableGames;
    const q = searchQuery.toLowerCase();
    return GAMES_CATALOG.filter(g =>
      g.genre !== 'App' && g.name.toLowerCase().includes(q) && !disabledGames.includes(g.id)
    );
  }, [searchQuery, availableGames, disabledGames]);

  const allSuggested = useMemo(() =>
    availableGames.filter(g => g.defaultExePath), [availableGames]);
  const VISIBLE_CARDS = 5;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);
  const scrollPausedRef = useRef(false);

  useEffect(() => {
    if (selectedGame) return;
    // Video banners linger for 15s so the clip can play out; image banners rotate every 6s.
    const currentHasVideo = !!(featured[featuredIndex] as any)?.bannerVideo;
    const rotationDelay = currentHasVideo ? 15000 : 6000;
    const timer = setTimeout(() => setFeaturedIndex(i => (i + 1) % featured.length), rotationDelay);
    return () => clearTimeout(timer);
  }, [featured, featuredIndex, selectedGame]);


  // Listen for sidebar game selection
  useEffect(() => {
    const handler = (e: Event) => {
      const game = (e as CustomEvent).detail;
      if (game) setSelectedGame(game);
    };
    window.addEventListener('select-game', handler);
    return () => window.removeEventListener('select-game', handler);
  }, []);

  // Listen for `open-add-friend` — dispatched by the daily tasks shortcut.
  // The Add Friend UI now lives inline in the Friends & Club panel search box,
  // so this just focuses that input.
  useEffect(() => {
    const handler = () => {
      setFriendSearch('');
      // Focus on next tick so the daily-tasks popup has time to close.
      setTimeout(() => friendSearchRef.current?.focus(), 50);
    };
    window.addEventListener('open-add-friend', handler);
    return () => window.removeEventListener('open-add-friend', handler);
  }, []);

  // Keep the local chat-unread badge in sync with ChatBubble.
  useEffect(() => {
    const handler = (e: Event) => {
      const total = (e as CustomEvent).detail;
      if (typeof total === 'number') setChatUnread(total);
    };
    window.addEventListener('chat-unread-count', handler);
    return () => window.removeEventListener('chat-unread-count', handler);
  }, []);

  // Incoming club invites — count pending invites for this player and badge the CLUB button.
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'club-invites'),
      where('to', '==', player.uid),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setClubInviteCount(snap.size);
    });
    return () => unsub();
  }, [player?.uid]);

  // Subscribe to outgoing friend requests (to decorate the inline search).
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'friend-requests'),
      where('from', '==', player.uid),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.forEach((d) => { const data = d.data() as any; if (data.to) s.add(data.to); });
      setOutgoingReqUids(s);
    });
    return () => unsub();
  }, [player?.uid]);

  // Debounced player search: when friendSearch changes and is non-empty, look up
  // players who match and aren't already friends. Excludes self, guests, and current friends.
  useEffect(() => {
    const term = friendSearch.trim().toLowerCase();
    if (!term) { setPlayerSearchResults([]); setPlayerSearchLoading(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPlayerSearchLoading(true);
      try {
        const snap = await getDocs(collection(db, 'players'));
        if (cancelled) return;
        const friendUids = new Set((player?.friends || []) as string[]);
        const results = snap.docs
          .map(d => ({ uid: d.id, ...d.data() } as any))
          .filter((p: any) =>
            p.uid !== player?.uid &&
            !p.isGuest &&
            !friendUids.has(p.uid) &&
            p.username?.toLowerCase().includes(term)
          )
          .slice(0, 10);
        if (!cancelled) setPlayerSearchResults(results);
      } catch (err) { console.error('player search failed', err); }
      if (!cancelled) setPlayerSearchLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [friendSearch, player?.uid, player?.friends]);

  // Rotate search placeholder
  useEffect(() => {
    if (searchFocused || searchQuery) return;
    const timer = setInterval(() => setPlaceholderIndex(i => (i + 1) % searchPlaceholders.length), 3000);
    return () => clearInterval(timer);
  }, [searchFocused, searchQuery, searchPlaceholders.length]);

  // Continuous auto-scroll for suggested games
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || allSuggested.length <= VISIBLE_CARDS) return;
    let speed = 0.5; // px per frame
    const animate = () => {
      if (!scrollPausedRef.current) {
        el.scrollLeft += speed;
        // When we've scrolled past the first set (the duplicated items), reset seamlessly
        const halfScroll = el.scrollWidth / 2;
        if (el.scrollLeft >= halfScroll) {
          el.scrollLeft -= halfScroll;
        }
      }
      scrollAnimRef.current = requestAnimationFrame(animate);
    };
    scrollAnimRef.current = requestAnimationFrame(animate);
    return () => { if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current); };
  }, [allSuggested.length]);

  // Cleanup interaction timeout on unmount
  useEffect(() => {
    return () => { if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current); };
  }, []);

  // Listen for game launch results from C# kiosk client
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (launchTimeoutRef.current) { clearTimeout(launchTimeoutRef.current); launchTimeoutRef.current = null; }
      if (detail.success) {
        setLaunchStatus('success');
        setTimeout(() => setLaunchingGame(null), 1500);
      } else {
        setLaunchStatus('failed');
        setTimeout(() => setLaunchingGame(null), 4000);
      }
    };
    window.addEventListener('game-launch-result', handler);
    return () => window.removeEventListener('game-launch-result', handler);
  }, []);

  // Fetch friend data from Firestore
  useEffect(() => {
    const friendUids: string[] = player?.friends || [];
    if (friendUids.length === 0) { setFriends([]); return; }

    let cancelled = false;
    const fetchFriends = async () => {
      const results: FriendData[] = [];
      for (const uid of friendUids) {
        try {
          const snap = await getDoc(doc(db, 'players', uid));
          if (snap.exists()) {
            const data = snap.data();
            results.push({
              uid,
              username: data.username || 'Unknown',
              isOnline: data.onlineStatus?.isOnline || false,
              currentActivity: data.onlineStatus?.currentActivity || undefined,
              ninjaType: data.ninjaType || data.character?.ninjaType || 'neon',
              profilePhoto: data.profilePhoto || undefined,
            });
          }
        } catch (err) {
          console.error('Failed to fetch friend:', uid, err);
        }
      }
      if (!cancelled) setFriends(results);
    };
    fetchFriends();
    const interval = setInterval(fetchFriends, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [player?.friends]);

  // Listen for friend requests
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(collection(db, 'friend-requests'), where('to', '==', player.uid), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, async (snap) => {
      const reqs: any[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        try {
          const fromSnap = await getDoc(doc(db, 'players', data.from));
          if (fromSnap.exists()) {
            const fromData = fromSnap.data();
            reqs.push({ id: d.id, ...data, fromUsername: fromData.username, fromNinjaType: fromData.ninjaType || 'neon' });
          }
        } catch { /* ignore */ }
      }
      setFriendRequests(reqs);
    });
    return () => unsub();
  }, [player?.uid]);

  // Daily tasks unclaimed rewards count (notification bubble)
  const [unclaimedTaskCount, setUnclaimedTaskCount] = useState(0);

  useEffect(() => {
    if (!player?.uid) return;
    const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const docRef = doc(db, 'daily-tasks', `${player.uid}_${todayKey}`);
    const unsub = onSnapshot(docRef, (snap) => {
      if (!snap.exists()) {
        // No tasks doc yet — daily login is auto-completed on first open, so 1 unclaimed
        setUnclaimedTaskCount(1);
        return;
      }
      const data = snap.data();
      const tasks = data.tasks || {};
      let count = 0;
      // Check each task: completed (progress >= target) but not claimed
      const TASK_TARGETS: Record<string, number> = {
        daily_login: 1, play_game: 1, open_chest: 1, send_coins: 1,
        order_food: 1, add_friend: 1, play_30_min: 75,
      };
      let totalTasks = 0;
      let claimedTasks = 0;
      for (const [taskId, tp] of Object.entries(tasks) as [string, any][]) {
        const target = TASK_TARGETS[taskId] || 1;
        totalTasks++;
        if (tp.claimed) claimedTasks++;
        if (tp.progress >= target && !tp.claimed) count++;
      }
      // All tasks claimed but full-completion bonus not yet claimed → show another dot
      if (totalTasks > 0 && claimedTasks === totalTasks && !data.fullBonusClaimed) count++;
      // Also check free chest (daily chest not claimed yet)
      const FREE_CHEST_COOLDOWN = 24 * 60 * 60 * 1000;
      const lastClaim = player?.lastFreeChest || 0;
      if (Date.now() - lastClaim >= FREE_CHEST_COOLDOWN) count++;
      setUnclaimedTaskCount(count);
    });
    return () => unsub();
  }, [player?.uid, player?.lastFreeChest]);

  // Free chest cooldown timer (daily — 24 hours)
  const [claimingFreeChest, setClaimingFreeChest] = useState(false);
  const [freeChestClaimed, setFreeChestClaimed] = useState(false);

  useEffect(() => {
    const FREE_CHEST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours
    const lastClaim = player?.lastFreeChest || 0;
    const update = () => {
      const remaining = Math.max(0, (lastClaim + FREE_CHEST_COOLDOWN) - Date.now());
      setFreeChestCooldown(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [player?.lastFreeChest]);

  const formatCooldown = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const claimFreeChest = async () => {
    if (claimingFreeChest || freeChestCooldown > 0) return;
    setClaimingFreeChest(true);
    try {
      // Add an unopened Daily Chest to inventory
      const chestItem = {
        id: `daily_chest_${Date.now()}`,
        type: 'chest',
        name: 'Daily Chest',
        rarity: 'rare',
        value: 0,
        chestTier: 'daily',
        obtainedAt: Date.now(),
        used: false,
        tradeable: true,
      };

      await updateDoc(doc(db, 'players', player.uid), {
        lastFreeChest: Date.now(),
        inventory: arrayUnion(chestItem),
      });

      setFreeChestClaimed(true);
      setTimeout(() => setFreeChestClaimed(false), 3000);
    } catch (err) {
      console.error('Failed to claim free chest:', err);
    }
    setClaimingFreeChest(false);
  };

  const handleAcceptRequest = async (requestId: string, fromUid: string) => {
    try {
      await updateDoc(doc(db, 'friend-requests', requestId), { status: 'accepted' });
      await updateDoc(doc(db, 'players', player.uid), { friends: arrayUnion(fromUid) });
      await updateDoc(doc(db, 'players', fromUid), { friends: arrayUnion(player.uid) });
    } catch (err) { console.error('Accept failed', err); }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try { await updateDoc(doc(db, 'friend-requests', requestId), { status: 'declined' }); }
    catch (err) { console.error('Decline failed', err); }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    try {
      await updateDoc(doc(db, 'players', player.uid), { friends: arrayRemove(friendUid) });
      await updateDoc(doc(db, 'players', friendUid), { friends: arrayRemove(player.uid) });
      setConfirmRemoveFriend(null);
    } catch (err) { console.error('Remove friend failed', err); }
  };

  // Send friend request. Optimistic — the outgoingReqUids listener will
  // pick up the new doc on the next snapshot and the row will switch to
  // REQUESTED automatically.
  const sendFriendRequest = async (targetUid: string) => {
    setSendingRequest(targetUid);
    try {
      // Check if request already exists
      const existing = await getDocs(query(
        collection(db, 'friend-requests'),
        where('from', '==', player.uid),
        where('to', '==', targetUid),
        where('status', '==', 'pending')
      ));
      if (!existing.empty) { setSendingRequest(null); return; }
      await addDoc(collection(db, 'friend-requests'), {
        from: player.uid,
        to: targetUid,
        status: 'pending',
        createdAt: Date.now(),
      });
      trackDailyTask(player.uid, 'add_friend');
      // Optimistic local flip (real update comes from outgoingReqUids snapshot).
      setOutgoingReqUids(prev => { const n = new Set(prev); n.add(targetUid); return n; });
    } catch (err) { console.error('Send request failed', err); }
    setSendingRequest(null);
  };

  const launchApp = (id: string, exePath: string) => {
    if ((window as any).electronAPI) (window as any).electronAPI.launchGame(id, exePath);
  };

  const launchGame = (game: any) => {
    setLaunchingGame(game);
    setLaunchStatus('launching');
    // Clear any previous timeout
    if (launchTimeoutRef.current) clearTimeout(launchTimeoutRef.current);
    // Timeout: if no response from C# within 20s, show failure
    launchTimeoutRef.current = setTimeout(() => {
      setLaunchStatus('failed');
      setTimeout(() => setLaunchingGame(null), 4000);
    }, 20000);
    launchApp(game.id, game.defaultExePath);
    notifyFriendsGameStart(player, game);
    // Track daily task: launch game
    if (player?.uid) trackDailyTask(player.uid, 'launch_game');
    // Track per-game playtime (add 1 min per launch, real tracking via session)
    if (player?.uid) {
      updateDoc(doc(db, 'players', player.uid), {
        [`gamePlaytime.${game.id}`]: increment(1),
        'stats.gamesPlayed': increment(1),
      }).catch(() => {});
    }
  };

  const activeGame = selectedGame || featured[featuredIndex];
  const playerCoins = Math.floor(player?.coins || 0);
  const ninjaType = player.ninjaType || player.character?.ninjaType || 'neon';
  const totalXP = calculateTotalXP(player);
  const levelInfo = getLevelInfo(totalXP);
  const effectiveRate = COINS_PER_MINUTE * (1 - levelInfo.coinRateBonus / 100);
  const minutesLeft = effectiveRate > 0 ? Math.floor(playerCoins / effectiveRate) : 9999;

  return (
    <div className="h-screen flex overflow-hidden bg-[#060810]">

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <div className="flex-1 flex flex-col min-w-0 h-screen pt-1 pr-3 pb-2"
        onClick={(e) => {
          // Resume auto-scroll when clicking outside the suggested games strip
          if (scrollRef.current && !scrollRef.current.contains(e.target as Node)) {
            scrollPausedRef.current = false;
          }
        }}>

        {/* ── Two columns ── */}
        <div className="flex-1 flex min-h-0 gap-3">

        {/* ══ Left column: Hero + Suggested ══ */}
        <div className="flex-1 flex flex-col min-w-0 gap-2.5">

          {/* ── Hero Game ── */}
          <div className="min-h-0 pl-1" style={{ flex: '1 1 55%' }}>
            <div className="h-full relative rounded-2xl overflow-hidden border border-white/[0.08]">
              <AnimatePresence mode="wait">
                {activeGame && (
                  <motion.div key={activeGame.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }} className="absolute inset-0">
                    {activeGame.bannerVideo ? (
                      <video
                        key={activeGame.bannerVideo}
                        src={activeGame.bannerVideo}
                        poster={activeGame.bannerImage || activeGame.coverImage}
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        className="absolute inset-0 w-full h-full object-cover object-center"
                        onError={(e) => {
                          // If the video fails to load, hide it so the poster image shows through.
                          (e.currentTarget as HTMLVideoElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Image src={activeGame.bannerImage || activeGame.coverImage} alt={activeGame.name} fill className="object-cover object-top" priority quality={95} sizes="60vw" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />
                    <div className="absolute inset-0 bg-gradient-to-l from-black/40 to-transparent" />

                    <div className="absolute inset-0 flex flex-col justify-end p-7">
                      <h2 className="font-ninja text-4xl text-white mb-4 drop-shadow-lg tracking-wide"
                        style={{ textShadow: '0 0 30px rgba(0,0,0,0.5)' }}>
                        {activeGame.name.toUpperCase()}
                      </h2>
                      <div className="flex items-center gap-3">
                        {/* Cyberpunk PLAY NOW — primary */}
                        <motion.button
                          whileHover="hover"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => launchGame(activeGame)}
                          className="group relative h-[52px] px-7 rounded-xl font-bold text-[15px] tracking-wider flex items-center justify-center gap-2.5 overflow-hidden"
                          style={{
                            background: 'linear-gradient(180deg, #0d1f14 0%, #06120a 100%)',
                            border: '1px solid rgba(57,255,20,0.6)',
                            boxShadow: '0 0 0 1px rgba(57,255,20,0.18) inset, 0 12px 28px -8px rgba(57,255,20,0.7), 0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
                          }}
                        >
                          <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                          <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                            backgroundImage: 'linear-gradient(rgba(57,255,20,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.08) 1px, transparent 1px)',
                            backgroundSize: '12px 12px',
                          }} />
                          <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern opacity-40" style={{
                            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,200,255,0.22) 1px, transparent 0)',
                            backgroundSize: '10px 10px',
                          }} />
                          <div className="absolute top-[6px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
                          <div className="absolute bottom-[6px] right-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
                          <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5) 50%, transparent)', boxShadow: '0 0 12px rgba(57,255,20,0.25)' }} />
                          <div className="absolute left-[10%] top-[30%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.7) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(57,255,20,0.5)' }} />
                          <div className="absolute right-[10%] top-[55%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.6) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(0,200,255,0.4)' }} />
                          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #39FF14)' }} />
                          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #39FF14)' }} />
                          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                          <motion.div
                            variants={{ hover: { x: ['-120%', '220%'] } }}
                            transition={{ duration: 0.85, ease: 'easeInOut' }}
                            className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
                            style={{ background: 'linear-gradient(110deg, transparent 20%, rgba(57,255,20,0.45) 50%, transparent 80%)', filter: 'blur(6px)' }}
                          />
                          <Play size={16} className="relative z-10 text-ninja-green" fill="#39FF14" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.9))' }} />
                          <span className="relative z-10 font-ninja text-ninja-green uppercase" style={{ textShadow: '0 0 10px rgba(57,255,20,0.7)' }}>PLAY NOW</span>
                        </motion.button>

                        {/* Cyberpunk DETAILS — ghost */}
                        <motion.button
                          whileHover="hover"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setShowGameDetails(true)}
                          className="group relative h-[52px] px-6 rounded-xl font-bold text-[14px] tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                          style={{
                            background: 'linear-gradient(180deg, rgba(10,20,32,0.85) 0%, rgba(4,10,18,0.95) 100%)',
                            border: '1px solid rgba(0,200,255,0.45)',
                            boxShadow: '0 0 0 1px rgba(0,200,255,0.1) inset, 0 12px 28px -8px rgba(0,200,255,0.5), 0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                            backdropFilter: 'blur(8px)',
                          }}
                        >
                          <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                          <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                            backgroundImage: 'linear-gradient(rgba(0,200,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.08) 1px, transparent 1px)',
                            backgroundSize: '12px 12px',
                          }} />
                          <div className="absolute top-[6px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
                          <div className="absolute bottom-[6px] right-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#a855f7', boxShadow: '0 0 8px #a855f7' }} />
                          <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.5) 50%, transparent)', boxShadow: '0 0 10px rgba(0,200,255,0.3)' }} />
                          <div className="absolute left-[10%] top-[30%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.7) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(0,200,255,0.5)' }} />
                          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-purple-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #a855f7)' }} />
                          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-purple-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #a855f7)' }} />
                          <motion.div
                            variants={{ hover: { x: ['-120%', '220%'] } }}
                            transition={{ duration: 0.85, ease: 'easeInOut' }}
                            className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
                            style={{ background: 'linear-gradient(110deg, transparent 20%, rgba(0,200,255,0.4) 50%, transparent 80%)', filter: 'blur(6px)' }}
                          />
                          <span className="relative z-10 font-ninja text-cyan-300 uppercase" style={{ textShadow: '0 0 10px rgba(0,200,255,0.7)' }}>DETAILS</span>
                        </motion.button>
                      </div>
                    </div>

                    {!selectedGame && (
                      <div className="absolute bottom-4 right-5 flex items-center gap-1.5">
                        {featured.map((_, i) => (
                          <button key={i} onClick={() => setFeaturedIndex(i)}
                            className={`transition-all rounded-full ${i === featuredIndex ? 'w-5 h-1.5 bg-ninja-green' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/50'}`} />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Suggested Games (auto-scrolling) ── */}
          <div className="min-h-0 pl-1 flex flex-col" style={{ flex: '1 1 45%' }}>
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <Gamepad2 size={13} className="text-gray-500" />
              <span className="font-ninja text-[12px] text-gray-400 tracking-wider">Suggested Games</span>
              <div className="flex-1 border-t border-dashed border-white/10 ml-2" />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden relative">
              <div ref={scrollRef}
                className="h-full overflow-x-auto flex gap-2.5"
                style={{ userSelect: 'none', scrollbarWidth: 'thin', scrollbarColor: 'rgba(57,255,20,0.3) rgba(0,0,0,0.2)' }}
                onWheel={() => { scrollPausedRef.current = true; }}
                onMouseDown={() => { scrollPausedRef.current = true; }}
                onTouchStart={() => { scrollPausedRef.current = true; }}
              >
                {/* Duplicate the list for seamless looping */}
                {[...allSuggested, ...allSuggested].map((game, i) => (
                  <motion.div key={`${game.id}-${i}`}
                    onClick={() => setSelectedGame(game)}
                    className="rounded-xl overflow-hidden border border-white/[0.06] hover:border-ninja-green/30 cursor-pointer group transition-all relative flex-shrink-0"
                    style={{ background: 'rgba(8,8,12,0.9)', width: `calc((100% - ${(VISIBLE_CARDS - 1) * 10}px) / ${VISIBLE_CARDS})` }}
                    whileHover={{ y: -5, scale: 1.02, boxShadow: '0 10px 30px rgba(57,255,20,0.15)' }}>

                    {/* Full card image */}
                    <div className="absolute inset-0 overflow-hidden">
                      <Image src={game.coverImage} alt={game.name} fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
                        sizes="(max-width: 1200px) 18vw, 200px" quality={90} draggable={false} />
                    </div>
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

                    {/* Bottom overlay content */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex flex-col">
                      <p className="font-ninja text-[11px] text-white tracking-wider leading-tight mb-2"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,1)' }}>
                        {game.name.toUpperCase()}
                      </p>
                      {/* Cyberpunk sidebar-style PLAY NOW button */}
                      <motion.button
                        whileHover="hover"
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); launchGame(game); }}
                        className="group relative w-full h-[34px] rounded-lg font-bold text-[11px] tracking-wider flex items-center justify-center gap-1.5 overflow-hidden"
                        style={{
                          background: 'linear-gradient(180deg, #0d1f14 0%, #06120a 100%)',
                          border: '1px solid rgba(57,255,20,0.55)',
                          boxShadow: '0 0 0 1px rgba(57,255,20,0.15) inset, 0 6px 16px -6px rgba(57,255,20,0.6), 0 2px 6px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                      >
                        {/* Sidebar layers */}
                        <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                        <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                          backgroundImage: 'linear-gradient(rgba(57,255,20,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.08) 1px, transparent 1px)',
                          backgroundSize: '10px 10px',
                        }} />
                        {/* PCB pulses */}
                        <div className="absolute top-[3px] left-0 w-2 h-[1.5px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
                        <div className="absolute bottom-[3px] right-0 w-2 h-[1.5px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
                        {/* Scanline */}
                        <div className="absolute left-0 right-0 h-[1.5px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5) 50%, transparent)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />
                        {/* Energy orb */}
                        <div className="absolute left-[8%] top-[40%] w-1 h-1 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.7) 0%, transparent 70%)', boxShadow: '0 0 6px rgba(57,255,20,0.5)' }} />
                        {/* HUD corners */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 3px #39FF14)' }} />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 3px #39FF14)' }} />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 3px #00c8ff)' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 3px #00c8ff)' }} />
                        {/* Hover shine */}
                        <motion.div
                          variants={{ hover: { x: ['-120%', '220%'] } }}
                          transition={{ duration: 0.7, ease: 'easeInOut' }}
                          className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
                          style={{ background: 'linear-gradient(110deg, transparent 20%, rgba(57,255,20,0.5) 50%, transparent 80%)', filter: 'blur(4px)' }}
                        />
                        {/* Content */}
                        <Play size={10} className="relative z-10 text-ninja-green" fill="#39FF14" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.9))' }} />
                        <span className="relative z-10 font-ninja text-ninja-green uppercase" style={{ textShadow: '0 0 8px rgba(57,255,20,0.7)' }}>PLAY NOW</span>
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ Right Panel — Cyberpunk HUD with full animated sidebar bg ══ */}
        <div className={`relative w-[290px] flex-shrink-0 flex flex-col gap-2.5 overflow-hidden rounded-xl ${player.isGuest ? 'cursor-pointer' : ''}`}
          onClick={player.isGuest && onBecomeUser ? (e) => { e.stopPropagation(); onBecomeUser(); } : undefined}
          style={{
            background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
            border: '1px solid rgba(57,255,20,0.15)',
            boxShadow: '0 0 30px rgba(57,255,20,0.05), inset 0 0 30px rgba(0,0,0,0.4)',
          }}>
          {/* ═══ FULL Sidebar background: animated layers ═══ */}
          {/* Breathing glow */}
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
          {/* PCB grid */}
          <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
            backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
            backgroundSize: '35px 35px',
          }} />
          {/* Hex pattern */}
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 52px',
          }} />
          {/* PCB traces */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 290 1000" preserveAspectRatio="none">
            <path d="M0,50 L60,50 L80,30 L180,30 L200,50 L290,50" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.12" />
            <path d="M290,150 L210,150 L190,170 L80,170 L60,150 L0,150" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
            <path d="M0,300 L70,300 L90,280 L200,280 L220,300 L290,300" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
            <path d="M290,450 L210,450 L190,470 L90,470 L70,450 L0,450" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.07" />
            <path d="M0,600 L80,600 L100,580 L210,580 L230,600 L290,600" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.06" />
            <path d="M290,750 L200,750 L180,770 L80,770 L60,750 L0,750" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.06" />
            <path d="M0,900 L90,900 L110,880 L190,880 L210,900 L290,900" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.05" />
            {/* Vertical */}
            <path d="M150,0 L150,30 L130,50 L130,170" stroke="#39FF14" strokeWidth="0.7" fill="none" opacity="0.1" />
            <path d="M210,150 L210,280 L230,300 L230,450" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.07" />
            <path d="M80,450 L80,600 L60,620 L60,750" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.06" />
            {/* Nodes */}
            <circle cx="180" cy="30" r="3" fill="#39FF14" opacity="0.2" className="pcb-node-flash" />
            <circle cx="80" cy="170" r="2.5" fill="#00c8ff" opacity="0.15" className="pcb-node-flash2" />
            <circle cx="200" cy="280" r="2.5" fill="#39FF14" opacity="0.12" className="pcb-node-flash3" />
            <circle cx="90" cy="470" r="2" fill="#a855f7" opacity="0.1" className="pcb-node-flash" />
            <circle cx="210" cy="580" r="2" fill="#00c8ff" opacity="0.1" className="pcb-node-flash2" />
            <circle cx="80" cy="750" r="2" fill="#39FF14" opacity="0.1" className="pcb-node-flash3" />
          </svg>
          {/* Data pulses */}
          <div className="absolute top-[50px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 15px #39FF14' }} />
          <div className="absolute top-[300px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
          <div className="absolute top-[600px] left-0 w-3 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#39FF14', boxShadow: '0 0 6px #39FF14' }} />
          <div className="absolute top-0 left-[150px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
          <div className="absolute top-0 left-[210px] w-[2px] h-2 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
          {/* Scanline */}
          <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(57,255,20,0.15)' }} />
          <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
          {/* Energy orbs */}
          <div className="absolute left-[15%] top-[20%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.4)' }} />
          <div className="absolute left-[70%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
          <div className="absolute left-[40%] top-[75%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3)' }} />
          {/* Radial glows */}
          <div className="absolute inset-0 pointer-events-none z-0" style={{
            background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.08) 0%, transparent 40%), radial-gradient(ellipse at 30% 40%, rgba(0,200,255,0.05) 0%, transparent 30%), radial-gradient(ellipse at 70% 70%, rgba(168,85,247,0.04) 0%, transparent 30%), radial-gradient(ellipse at 50% 95%, rgba(57,255,20,0.06) 0%, transparent 40%)',
          }} />
          {/* Top neon edge */}
          <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 12px rgba(57,255,20,0.3)' }} />
          {/* Left neon edge */}
          <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />
          {/* Right neon edge */}
          <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)' }} />
          {/* Inner padding wrapper for content */}
          <div className="relative z-[2] flex flex-col gap-2.5 p-2.5 h-full overflow-hidden">
          {player.isGuest && (
            <div className="absolute inset-0 z-30 rounded-2xl" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-3">
                  <Lock size={24} className="text-purple-400" />
                </div>
                <p className="font-ninja text-purple-400 text-sm tracking-wider">MEMBERS ONLY</p>
                <p className="font-body text-gray-400 text-[11px] mt-1">Click to become a user</p>
              </div>
            </div>
          )}

          {/* 1. Free Daily Chest card — Cyberpunk HUD */}
          <div className="rounded-xl flex-shrink-0 relative overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(0,191,255,0.06) 0%, rgba(4,6,8,0.4) 40%, rgba(3,5,8,0.5) 100%)',
              border: '1px solid rgba(0,191,255,0.3)',
              backdropFilter: 'blur(2px)',
              boxShadow: '0 0 30px rgba(0,191,255,0.1), inset 0 0 30px rgba(0,191,255,0.04)',
            }}>
            {/* PCB grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(0,191,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,191,255,0.05) 1px, transparent 1px)',
              backgroundSize: '25px 25px', opacity: 0.5,
            }} />
            {/* PCB traces */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 290 280" preserveAspectRatio="none">
              <path d="M0,40 L60,40 L80,20 L200,20" stroke="#00BFFF" strokeWidth="0.5" fill="none" opacity="0.1" />
              <path d="M290,100 L210,100 L190,120 L80,120" stroke="#a855f7" strokeWidth="0.4" fill="none" opacity="0.07" />
              <path d="M0,200 L80,200 L100,180 L250,180" stroke="#39FF14" strokeWidth="0.4" fill="none" opacity="0.06" />
              <circle cx="200" cy="20" r="2" fill="#00BFFF" opacity="0.15" className="pcb-node-flash" />
              <circle cx="80" cy="120" r="1.5" fill="#a855f7" opacity="0.1" className="pcb-node-flash2" />
              <circle cx="250" cy="180" r="1.5" fill="#39FF14" opacity="0.08" className="pcb-node-flash3" />
            </svg>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-3.5 h-3.5 z-[2]" style={{ borderTop: '2px solid rgba(0,191,255,0.6)', borderLeft: '2px solid rgba(0,191,255,0.6)' }} />
            <div className="absolute top-0 right-0 w-3.5 h-3.5 z-[2]" style={{ borderTop: '2px solid rgba(168,85,247,0.4)', borderRight: '2px solid rgba(168,85,247,0.4)' }} />
            <div className="absolute bottom-0 left-0 w-3.5 h-3.5 z-[2]" style={{ borderBottom: '2px solid rgba(168,85,247,0.4)', borderLeft: '2px solid rgba(168,85,247,0.4)' }} />
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 z-[2]" style={{ borderBottom: '2px solid rgba(0,191,255,0.6)', borderRight: '2px solid rgba(0,191,255,0.6)' }} />
            {/* Top neon accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] z-[2]" style={{ background: 'linear-gradient(90deg, transparent, #00BFFF, #a855f7, transparent)', boxShadow: '0 0 10px rgba(0,191,255,0.5)' }} />
            {/* Left glow bar */}
            <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[2]" style={{ background: '#00BFFF', boxShadow: '0 0 8px #00BFFF', opacity: 0.4 }} />
            {/* Radial glows */}
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="absolute bottom-0 left-0 right-0 h-[70%]" style={{ background: 'radial-gradient(ellipse 130% 100% at 50% 100%, rgba(0,191,255,0.18), rgba(57,255,20,0.06) 50%, transparent 80%)' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(168,85,247,0.08), transparent 70%)' }} />
            </div>
            <div className="relative h-full flex flex-col items-center justify-between px-4 py-5">
              <div className="flex flex-col items-center">
                <p className="font-ninja text-[14px] tracking-[0.3em] mb-1" style={{ color: '#00BFFF', textShadow: '0 0 15px rgba(0,191,255,0.6)' }}>FREE DAILY CHEST</p>
                <p className="font-body text-[10px] text-gray-500">Claim once daily — gift it to a friend!</p>
              </div>
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} className="relative my-1">
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-36 h-10 rounded-full"
                  style={{ background: 'radial-gradient(ellipse, rgba(0,191,255,0.3), rgba(168,85,247,0.15) 50%, transparent 70%)', filter: 'blur(10px)' }} />
                <div className="w-36 h-36 relative">
                  <img src="/img/chest-free.png" alt="Free Chest" className="w-full h-full object-contain"
                    style={{ filter: 'drop-shadow(0 10px 25px rgba(0,191,255,0.4)) drop-shadow(0 0 40px rgba(168,85,247,0.15))' }} />
                </div>
              </motion.div>
              <div className="w-full space-y-2 overflow-visible">
                {freeChestClaimed ? (
                  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.3)' }}>
                    <CheckSquare size={14} className="text-ninja-green" />
                    <span className="font-ninja text-sm text-ninja-green">CLAIMED!</span>
                  </motion.div>
                ) : freeChestCooldown > 0 ? (
                  <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <Clock size={14} className="text-gray-500" />
                    <span className="font-ninja text-sm text-gray-400">{formatCooldown(freeChestCooldown)}</span>
                  </div>
                ) : (
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={claimFreeChest} disabled={claimingFreeChest}
                    className="relative w-full flex items-center justify-center gap-2 py-3 text-sm font-ninja tracking-[0.1em] rounded-md transition-all overflow-hidden disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, rgba(0,191,255,0.18), rgba(0,191,255,0.06))', border: '1px solid rgba(0,191,255,0.5)', color: '#00BFFF', boxShadow: '0 0 15px rgba(0,191,255,0.2), inset 0 0 12px rgba(0,191,255,0.05)' }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '2px solid #00BFFF', borderLeft: '2px solid #00BFFF' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '2px solid #00BFFF', borderRight: '2px solid #00BFFF' }} />
                    <div className="absolute top-0 left-[20%] right-[20%] h-[2px]" style={{ background: '#00BFFF', boxShadow: '0 0 6px #00BFFF' }} />
                    {claimingFreeChest ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(0,191,255,0.7))' }} />}
                    {claimingFreeChest ? 'OPENING...' : 'CLAIM FREE CHEST'}
                  </motion.button>
                )}
                <div className="relative" style={{ overflow: 'visible' }}>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'dailytasks' }))}
                    className="relative w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-ninja tracking-[0.1em] rounded-md transition-all overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.04))', border: '1px solid rgba(255,215,0,0.4)', color: '#FFD700', boxShadow: '0 0 12px rgba(255,215,0,0.15)' }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(255,215,0,0.6)', borderLeft: '1px solid rgba(255,215,0,0.6)' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(255,215,0,0.6)', borderRight: '1px solid rgba(255,215,0,0.6)' }} />
                    <CheckSquare size={13} style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.6))' }} /> DAILY TASKS
                  </motion.button>
                  {unclaimedTaskCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute -top-2 -right-2 z-[60] min-w-[22px] h-[22px] rounded-full bg-red-500 text-white font-ninja text-[11px] flex items-center justify-center px-1.5 pointer-events-none"
                      style={{ boxShadow: '0 0 12px rgba(239,68,68,0.7), 0 0 4px rgba(239,68,68,0.9)' }}
                    >
                      {unclaimedTaskCount}
                    </motion.span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Tournament + Leaderboard card — Cyberpunk HUD */}
          <div className="rounded-xl flex-shrink-0 relative overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(255,111,0,0.08) 0%, rgba(4,6,8,0.4) 40%, rgba(3,5,8,0.5) 100%)',
              border: '1px solid rgba(255,111,0,0.3)',
              backdropFilter: 'blur(2px)',
              boxShadow: '0 0 20px rgba(255,111,0,0.08), inset 0 0 20px rgba(255,111,0,0.03)',
            }}>
            {/* PCB grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(255,111,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,111,0,0.04) 1px, transparent 1px)',
              backgroundSize: '25px 25px', opacity: 0.5,
            }} />
            {/* PCB traces */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 290 90" preserveAspectRatio="none">
              <path d="M0,30 L60,30 L80,15 L200,15" stroke="#FF6F00" strokeWidth="0.5" fill="none" opacity="0.1" />
              <path d="M290,60 L210,60 L190,75 L80,75" stroke="#FFD700" strokeWidth="0.4" fill="none" opacity="0.07" />
              <circle cx="200" cy="15" r="2" fill="#FF6F00" opacity="0.15" className="pcb-node-flash" />
              <circle cx="80" cy="75" r="1.5" fill="#FFD700" opacity="0.1" className="pcb-node-flash2" />
            </svg>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-3 h-3 z-[2]" style={{ borderTop: '2px solid rgba(255,111,0,0.6)', borderLeft: '2px solid rgba(255,111,0,0.6)' }} />
            <div className="absolute top-0 right-0 w-3 h-3 z-[2]" style={{ borderTop: '2px solid rgba(255,215,0,0.4)', borderRight: '2px solid rgba(255,215,0,0.4)' }} />
            <div className="absolute bottom-0 left-0 w-3 h-3 z-[2]" style={{ borderBottom: '2px solid rgba(255,215,0,0.4)', borderLeft: '2px solid rgba(255,215,0,0.4)' }} />
            <div className="absolute bottom-0 right-0 w-3 h-3 z-[2]" style={{ borderBottom: '2px solid rgba(255,111,0,0.6)', borderRight: '2px solid rgba(255,111,0,0.6)' }} />
            {/* Top neon accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] z-[2]" style={{ background: 'linear-gradient(90deg, transparent, #FF6F00, #FFD700, transparent)', boxShadow: '0 0 10px rgba(255,111,0,0.5)' }} />
            {/* Left glow bar */}
            <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[2]" style={{ background: '#FF6F00', boxShadow: '0 0 8px #FF6F00', opacity: 0.4 }} />
            {/* Glow orb */}
            <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,111,0,0.15), transparent 70%)' }} />
            <div className="relative p-3.5 z-[3]">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,111,0,0.12)', border: '1px solid rgba(255,111,0,0.3)', boxShadow: '0 0 10px rgba(255,111,0,0.15)' }}>
                  <Trophy size={18} className="text-orange-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.6))' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-ninja text-sm tracking-[0.15em]" style={{ color: '#FF6F00', textShadow: '0 0 10px rgba(255,111,0,0.4)' }}>TOURNAMENTS</p>
                  <p className="font-body text-[9px] text-gray-500">Compete & win big prizes</p>
                </div>
              </div>
              <div className="flex gap-2">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'tournaments' }))}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md font-ninja text-[10px] tracking-wider transition-all overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, rgba(255,111,0,0.15), rgba(255,111,0,0.05))', border: '1px solid rgba(255,111,0,0.4)', color: '#FF6F00', boxShadow: '0 0 10px rgba(255,111,0,0.1)' }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(255,111,0,0.6)', borderLeft: '1px solid rgba(255,111,0,0.6)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(255,111,0,0.6)', borderRight: '1px solid rgba(255,111,0,0.6)' }} />
                  <Swords size={12} style={{ filter: 'drop-shadow(0 0 4px rgba(255,111,0,0.6))' }} /> COMPETE
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'leaderboard' }))}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md font-ninja text-[10px] tracking-wider transition-all overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,215,0,0.04))', border: '1px solid rgba(255,215,0,0.35)', color: '#FFD700', boxShadow: '0 0 10px rgba(255,215,0,0.1)' }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(255,215,0,0.6)', borderLeft: '1px solid rgba(255,215,0,0.6)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(255,215,0,0.6)', borderRight: '1px solid rgba(255,215,0,0.6)' }} />
                  <Trophy size={12} style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.6))' }} /> LEADERBOARD
                </motion.button>
              </div>
            </div>
          </div>

          {/* 4. Friends Panel — Cyberpunk HUD */}
          <div className="relative rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(57,255,20,0.06) 0%, rgba(4,6,8,0.4) 30%, rgba(3,5,8,0.5) 100%)',
              border: '1px solid rgba(57,255,20,0.25)',
              backdropFilter: 'blur(2px)',
              boxShadow: '0 0 25px rgba(57,255,20,0.06), inset 0 0 25px rgba(57,255,20,0.02)',
            }}>
            {/* PCB grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
              backgroundSize: '25px 25px', opacity: 0.5,
            }} />
            {/* PCB traces */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 290 400" preserveAspectRatio="none">
              <path d="M0,40 L60,40 L80,20 L200,20" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.08" />
              <path d="M290,150 L210,150 L190,170 L80,170" stroke="#00c8ff" strokeWidth="0.4" fill="none" opacity="0.06" />
              <path d="M0,300 L80,300 L100,280 L200,280" stroke="#39FF14" strokeWidth="0.4" fill="none" opacity="0.05" />
              <circle cx="200" cy="20" r="2" fill="#39FF14" opacity="0.15" className="pcb-node-flash" />
              <circle cx="80" cy="170" r="1.5" fill="#00c8ff" opacity="0.1" className="pcb-node-flash2" />
            </svg>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-3.5 h-3.5 z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.6)', borderLeft: '2px solid rgba(57,255,20,0.6)' }} />
            <div className="absolute top-0 right-0 w-3.5 h-3.5 z-[2]" style={{ borderTop: '2px solid rgba(0,200,255,0.4)', borderRight: '2px solid rgba(0,200,255,0.4)' }} />
            <div className="absolute bottom-0 left-0 w-3.5 h-3.5 z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.4)', borderLeft: '2px solid rgba(0,200,255,0.4)' }} />
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 z-[2]" style={{ borderBottom: '2px solid rgba(57,255,20,0.6)', borderRight: '2px solid rgba(57,255,20,0.6)' }} />
            {/* Top neon accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] z-[2]" style={{ background: 'linear-gradient(90deg, transparent, #39FF14, #00c8ff, transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.5)' }} />
            {/* Left glow bar */}
            <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] z-[2]" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14', opacity: 0.4 }} />
            {/* ── Title row ── */}
            <div className="relative z-[3] px-3 pt-3 pb-2 flex items-center gap-2 flex-shrink-0">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.3)', boxShadow: '0 0 8px rgba(57,255,20,0.15)' }}>
                <Users size={13} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
              </div>
              <h3 className="font-ninja text-sm tracking-[0.1em]" style={{ color: '#39FF14', textShadow: '0 0 8px rgba(57,255,20,0.4)' }}>
                FRIENDS &amp; CLUB
              </h3>
            </div>
            {/* ── Search bar + CLUB button row ── */}
            <div className="relative z-[3] px-3 pb-2 flex items-center gap-1.5 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <NinjaInput ref={friendSearchRef} type="text" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search players..." icon={<Search size={12} />} />
              </div>
              <button onClick={() => setShowClub(true)}
                className="relative h-9 px-2.5 rounded-md flex items-center gap-1 text-purple-300 hover:text-white transition-all flex-shrink-0 overflow-visible"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 6px rgba(168,85,247,0.15)' }}
                title={clubInviteCount > 0 ? `Club · ${clubInviteCount} invite${clubInviteCount === 1 ? '' : 's'}` : 'Club'}>
                <Shield size={12} />
                <span className="font-ninja text-[9px] tracking-[0.1em]">CLUB</span>
                {clubInviteCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ boxShadow: '0 0 8px rgba(239,68,68,0.8)' }}
                  >
                    {clubInviteCount > 9 ? '9+' : clubInviteCount}
                  </motion.span>
                )}
              </button>
            </div>
            {/* Friend request toasts */}
            {friendRequests.length > 0 && (
              <div className="relative z-[3] px-3 pb-2 flex-shrink-0 space-y-1.5">
                {friendRequests.slice(0, 2).map(req => (
                  <motion.div key={req.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className="relative flex items-center gap-2 p-2 rounded-lg overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.08), rgba(57,255,20,0.02))', border: '1px solid rgba(57,255,20,0.25)', boxShadow: '0 0 8px rgba(57,255,20,0.06)' }}>
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(57,255,20,0.5)', borderLeft: '1px solid rgba(57,255,20,0.5)' }} />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(57,255,20,0.5)', borderRight: '1px solid rgba(57,255,20,0.5)' }} />
                    <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#39FF14', boxShadow: '0 0 4px #39FF14' }} />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-ninja-green flex-shrink-0 relative z-[1]" style={{ boxShadow: '0 0 6px #39FF14' }} />
                    <img src={`/img/pfp-${req.fromNinjaType || 'neon'}.png`} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 relative z-[1]"
                      style={{ border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 6px rgba(57,255,20,0.3)' }}
                      onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                    <p className="font-body text-[10px] text-gray-400 flex-1 truncate relative z-[1]"><span className="text-white">{req.fromUsername}</span></p>
                    <button onClick={() => handleAcceptRequest(req.id, req.from)}
                      className="relative z-[1] w-6 h-6 rounded flex items-center justify-center transition-all"
                      style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 6px rgba(57,255,20,0.15)' }}>
                      <Check size={11} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 3px rgba(57,255,20,0.6))' }} />
                    </button>
                    <button onClick={() => handleDeclineRequest(req.id)}
                      className="relative z-[1] w-6 h-6 rounded flex items-center justify-center transition-all"
                      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', boxShadow: '0 0 6px rgba(239,68,68,0.12)' }}>
                      <X size={11} className="text-red-400" style={{ filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.6))' }} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="relative z-[3] flex-1 overflow-y-auto px-3 pb-2 min-h-0">
              {friends.length === 0 && !friendSearch ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-6">
                  <Users size={28} className="text-gray-700 mb-2" />
                  <p className="font-body text-xs text-gray-500">No friends yet</p>
                  <p className="font-body text-[10px] text-ninja-green mt-1">Type a name above to find players</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {(() => {
                    const filtered = [...friends].filter(f => !friendSearch || f.username.toLowerCase().includes(friendSearch.toLowerCase()));
                    const onlineFriends = filtered.filter(f => f.isOnline);
                    const offlineFriends = filtered.filter(f => !f.isOnline);
                    const renderFriend = (f: FriendData) => (
                      <div key={f.uid} className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all group overflow-hidden"
                        style={{
                          background: f.isOnline ? 'linear-gradient(135deg, rgba(57,255,20,0.04), transparent)' : 'linear-gradient(135deg, rgba(255,255,255,0.015), transparent)',
                          border: f.isOnline ? '1px solid rgba(57,255,20,0.1)' : '1px solid rgba(255,255,255,0.04)',
                        }}>
                        {/* Left glow bar */}
                        <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: f.isOnline ? '#39FF14' : '#666', boxShadow: f.isOnline ? '0 0 4px #39FF14' : 'none', opacity: f.isOnline ? 0.4 : 0.2 }} />
                        <div className="w-8 h-8 rounded-full relative flex-shrink-0 overflow-hidden"
                          style={{ background: 'rgba(0,0,0,0.4)', border: f.isOnline ? '1px solid rgba(57,255,20,0.4)' : '1px solid rgba(255,255,255,0.1)', boxShadow: f.isOnline ? '0 0 6px rgba(57,255,20,0.3)' : 'none' }}
                          onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: f.uid } }))}>
                          <img src={f.profilePhoto || `/img/pfp-${f.ninjaType || 'neon'}.png`} alt={f.username}
                            className={`w-full h-full ${f.profilePhoto ? 'object-cover' : 'object-contain'}`}
                            onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${f.ninjaType || 'neon'}.png`; }} />
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-black ${f.isOnline ? 'bg-green-500' : 'bg-gray-600'}`}
                            style={{ boxShadow: f.isOnline ? '0 0 6px #39FF14' : 'none' }} />
                        </div>
                        {confirmRemoveFriend === f.uid ? (
                          <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="font-body text-[10px] text-red-400 truncate">Remove?</span>
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(f.uid); }}
                              className="relative px-2 py-0.5 rounded font-ninja text-[9px] transition-all overflow-hidden"
                              style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)', color: '#FCA5A5', boxShadow: '0 0 6px rgba(239,68,68,0.2)' }}>
                              <div className="absolute top-0 left-0 w-1 h-1" style={{ borderTop: '1px solid #EF4444', borderLeft: '1px solid #EF4444' }} />
                              <div className="absolute bottom-0 right-0 w-1 h-1" style={{ borderBottom: '1px solid #EF4444', borderRight: '1px solid #EF4444' }} />
                              YES
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmRemoveFriend(null); }}
                              className="relative px-2 py-0.5 rounded font-ninja text-[9px] transition-all"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#888' }}>NO</button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0" onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: f.uid } }))}>
                              <p className="font-body text-[12px] text-white truncate" style={{ textShadow: '0 0 6px rgba(57,255,20,0.15)' }}>{f.username}</p>
                              {f.isOnline && f.currentActivity ? (
                                <p className="font-body text-[9px] text-ninja-green truncate">{f.currentActivity}</p>
                              ) : (
                                <p className="font-body text-[9px] text-gray-600">{f.isOnline ? 'Online' : 'Offline'}</p>
                              )}
                            </div>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('open-private-chat', { detail: { friendId: f.uid, friendName: f.username } })); }}
                                className="relative w-6 h-6 rounded flex items-center justify-center text-blue-400 transition-all overflow-hidden"
                                style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid rgba(0,191,255,0.25)', boxShadow: '0 0 4px rgba(0,191,255,0.1)' }}
                                title="Message">
                                <MessageSquare size={10} style={{ filter: 'drop-shadow(0 0 3px rgba(0,191,255,0.6))' }} />
                              </button>
                              {f.isOnline && (
                                <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('start-voice-call', { detail: { friendId: f.uid, friendName: f.username } })); }}
                                  className="relative w-6 h-6 rounded flex items-center justify-center text-green-400 transition-all overflow-hidden"
                                  style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.25)', boxShadow: '0 0 4px rgba(57,255,20,0.1)' }}
                                  title="Call">
                                  <Phone size={10} style={{ filter: 'drop-shadow(0 0 3px rgba(57,255,20,0.6))' }} />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); onSendCoins?.(f.username); }}
                                className="relative w-6 h-6 rounded flex items-center justify-center text-yellow-400 transition-all overflow-hidden"
                                style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', boxShadow: '0 0 4px rgba(234,179,8,0.1)' }}
                                title="Send Coins">
                                <Coins size={10} style={{ filter: 'drop-shadow(0 0 3px rgba(234,179,8,0.6))' }} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setConfirmRemoveFriend(f.uid); }}
                                className="relative w-6 h-6 rounded flex items-center justify-center text-red-400/40 hover:text-red-400 transition-all"
                                style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}
                                title="Remove Friend">
                                <UserMinus size={10} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                    return (
                      <>
                        {onlineFriends.length > 0 && (
                          <>
                            <div className="flex items-center gap-1.5 px-2 pt-1 pb-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" style={{ boxShadow: '0 0 6px #39FF14' }} />
                              <span className="font-ninja text-[9px] text-green-400 tracking-[0.15em]" style={{ textShadow: '0 0 6px rgba(57,255,20,0.4)' }}>ONLINE — {onlineFriends.length}</span>
                              <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent)' }} />
                            </div>
                            {onlineFriends.map(renderFriend)}
                          </>
                        )}
                        {offlineFriends.length > 0 && (
                          <>
                            <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                              <span className="font-ninja text-[9px] text-gray-500 tracking-[0.15em]">OFFLINE — {offlineFriends.length}</span>
                              <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
                            </div>
                            {offlineFriends.map(renderFriend)}
                          </>
                        )}
                        {/* ── Non-friend search results ── */}
                        {friendSearch && (
                          <>
                            <div className="flex items-center gap-1.5 px-2 pt-3 pb-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ boxShadow: '0 0 6px #A855F7' }} />
                              <span className="font-ninja text-[9px] text-purple-300 tracking-[0.15em]">
                                PLAYERS {playerSearchLoading ? '…' : `— ${playerSearchResults.length}`}
                              </span>
                              <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.3), transparent)' }} />
                            </div>
                            {playerSearchLoading && playerSearchResults.length === 0 && (
                              <div className="flex items-center justify-center py-3">
                                <Loader2 size={14} className="animate-spin text-purple-400" />
                              </div>
                            )}
                            {!playerSearchLoading && playerSearchResults.length === 0 && (
                              <p className="font-body text-[10px] text-gray-500 text-center py-3">No players found</p>
                            )}
                            {playerSearchResults.map((p: any) => {
                              const isRequested = outgoingReqUids.has(p.uid);
                              return (
                                <div key={p.uid} className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden"
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.04), transparent)',
                                    border: '1px solid rgba(168,85,247,0.12)',
                                  }}>
                                  <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: '#A855F7', boxShadow: '0 0 4px #A855F7', opacity: 0.35 }} />
                                  <div className="w-8 h-8 rounded-full relative flex-shrink-0 overflow-hidden"
                                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(168,85,247,0.35)' }}>
                                    <img src={p.profilePhoto || `/img/pfp-${p.ninjaType || p.character?.ninjaType || 'neon'}.png`} alt={p.username}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-body text-[12px] text-white truncate">{p.username}</p>
                                    <p className="font-body text-[9px] text-gray-500">Lvl {p.level || 1}</p>
                                  </div>
                                  {isRequested ? (
                                    <span className="font-ninja text-[9px] text-gray-400 tracking-wider px-2 py-1 rounded"
                                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                      REQUESTED
                                    </span>
                                  ) : (
                                    <button
                                      disabled={sendingRequest === p.uid}
                                      onClick={() => sendFriendRequest(p.uid)}
                                      className="relative px-2 py-1 rounded font-ninja text-[9px] tracking-wider text-ninja-green overflow-hidden transition-all hover:brightness-125 flex items-center gap-1"
                                      style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.04))', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 6px rgba(57,255,20,0.15)' }}>
                                      {sendingRequest === p.uid ? <Loader2 size={10} className="animate-spin" /> : <UserPlus size={10} />}
                                      ADD
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* 4. Chat button at bottom — Cyberpunk HUD with unread badge */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => window.dispatchEvent(new CustomEvent('open-chat-panel'))}
            className="relative flex items-center justify-center gap-1.5 py-2 rounded-md font-ninja text-[10px] tracking-[0.15em] flex-shrink-0 transition-all overflow-visible"
            style={{ background: 'linear-gradient(135deg, rgba(0,191,255,0.1), rgba(0,191,255,0.03))', border: '1px solid rgba(0,191,255,0.3)', color: '#00BFFF', boxShadow: '0 0 12px rgba(0,191,255,0.1)' }}>
            <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(0,191,255,0.6)', borderLeft: '1px solid rgba(0,191,255,0.6)' }} />
            <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(0,191,255,0.6)', borderRight: '1px solid rgba(0,191,255,0.6)' }} />
            <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,191,255,0.6), transparent)' }} />
            <MessageSquare size={12} style={{ filter: 'drop-shadow(0 0 4px rgba(0,191,255,0.6))' }} /> CHAT
            {chatUnread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
                style={{ boxShadow: '0 0 8px rgba(239,68,68,0.8)' }}
              >
                {chatUnread > 99 ? '99+' : chatUnread}
              </motion.span>
            )}
          </motion.button>
          </div>{/* end inner z-[2] wrapper */}
        </div>
        </div>
      </div>

      {/* Settings / Profile Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-[700px] max-w-[90vw] max-h-[85vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-lg text-white flex items-center gap-2">
                  <Settings size={18} className="text-ninja-green" /> Profile Settings
                </h2>
                <button onClick={() => setShowSettings(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6">
                <ProfileTab player={player} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inventory Popup */}
      <AnimatePresence>
        {showInventory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowInventory(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[750px] max-w-[90vw] max-h-[85vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-lg text-white flex items-center gap-2">
                  <Gift size={18} className="text-ninja-green" /> Inventory
                </h2>
                <button onClick={() => setShowInventory(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6"><InventoryTab player={player} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Food & Drinks Popup */}
      <AnimatePresence>
        {showFood && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowFood(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[750px] max-w-[90vw] max-h-[85vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-lg text-white flex items-center gap-2">
                  <UtensilsCrossed size={18} className="text-orange-400" /> Food & Drinks
                </h2>
                <button onClick={() => setShowFood(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6"><FoodTab player={player} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaderboard Popup */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowLeaderboard(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[650px] max-w-[90vw] max-h-[85vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-lg text-white flex items-center gap-2">
                  <Trophy size={18} className="text-yellow-400" /> Leaderboard
                </h2>
                <button onClick={() => setShowLeaderboard(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6"><LeaderboardTab /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open Chests Popup */}
      <AnimatePresence>
        {showChests && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowChests(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[1050px] max-w-[95vw] max-h-[90vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-xl text-white flex items-center gap-2">
                  <Package size={22} className="text-yellow-400" /> Open Chests
                </h2>
                <button onClick={() => setShowChests(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6"><ChestsTab player={player} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Profile/Settings overlay */}
      <AnimatePresence>
        {showGameDetails && activeGame && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowGameDetails(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[500px] max-w-[90vw] rounded-2xl border border-ninja-green/20 overflow-hidden"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              {/* Banner */}
              <div className="relative h-48 overflow-hidden">
                <Image src={activeGame.bannerImage || activeGame.coverImage} alt={activeGame.name} fill className="object-cover object-top" />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(11,12,16,0.97)] via-black/40 to-transparent" />
                <button onClick={() => setShowGameDetails(false)}
                  className="ninja-btn ninja-btn-ghost absolute top-3 right-3 w-9 h-9 flex items-center justify-center backdrop-blur-sm">
                  <X size={20} />
                </button>
                <div className="absolute bottom-4 left-5">
                  <h2 className="font-ninja text-2xl text-white tracking-wide" style={{ textShadow: '0 2px 15px rgba(0,0,0,0.8)' }}>
                    {activeGame.name.toUpperCase()}
                  </h2>
                </div>
              </div>
              {/* Info */}
              <div className="p-5 space-y-4">
                <p className="font-body text-sm text-gray-400">{activeGame.description}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.15)' }}>
                    <p className="font-body text-[10px] text-gray-500 mb-1">GENRE</p>
                    <p className="font-ninja text-xs text-ninja-green">{activeGame.genre}</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.15)' }}>
                    <p className="font-body text-[10px] text-gray-500 mb-1">PLAYERS</p>
                    <p className="font-ninja text-xs text-ninja-green">{activeGame.players}</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.15)' }}>
                    <p className="font-body text-[10px] text-gray-500 mb-1">RATING</p>
                    <p className="font-ninja text-xs text-yellow-400 flex items-center justify-center gap-1"><Star size={11} fill="#facc15" /> {activeGame.rating}</p>
                  </div>
                </div>
                {/* Cyberpunk PLAY NOW — modal */}
                <motion.button
                  whileHover="hover"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { launchGame(activeGame); setShowGameDetails(false); }}
                  className="group relative w-full h-[58px] rounded-xl font-bold text-[15px] tracking-wider flex items-center justify-center gap-2.5 overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, #0d1f14 0%, #06120a 100%)',
                    border: '1px solid rgba(57,255,20,0.6)',
                    boxShadow: '0 0 0 1px rgba(57,255,20,0.18) inset, 0 12px 28px -8px rgba(57,255,20,0.7), 0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
                  <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
                    backgroundImage: 'linear-gradient(rgba(57,255,20,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.08) 1px, transparent 1px)',
                    backgroundSize: '12px 12px',
                  }} />
                  <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern opacity-40" style={{
                    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,200,255,0.22) 1px, transparent 0)',
                    backgroundSize: '10px 10px',
                  }} />
                  <div className="absolute top-[6px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
                  <div className="absolute bottom-[6px] right-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
                  <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5) 50%, transparent)', boxShadow: '0 0 12px rgba(57,255,20,0.25)' }} />
                  <div className="absolute left-[10%] top-[30%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.7) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(57,255,20,0.5)' }} />
                  <div className="absolute right-[10%] top-[55%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.6) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(0,200,255,0.4)' }} />
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #39FF14)' }} />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-ninja-green pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #39FF14)' }} />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 pointer-events-none" style={{ filter: 'drop-shadow(0 0 4px #00c8ff)' }} />
                  <motion.div
                    variants={{ hover: { x: ['-120%', '220%'] } }}
                    transition={{ duration: 0.85, ease: 'easeInOut' }}
                    className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
                    style={{ background: 'linear-gradient(110deg, transparent 20%, rgba(57,255,20,0.45) 50%, transparent 80%)', filter: 'blur(6px)' }}
                  />
                  <Play size={18} className="relative z-10 text-ninja-green" fill="#39FF14" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.9))' }} />
                  <span className="relative z-10 font-ninja text-ninja-green uppercase" style={{ textShadow: '0 0 10px rgba(57,255,20,0.7)' }}>PLAY NOW</span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showProfile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setShowProfile(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[900px] max-w-[95vw] max-h-[90vh] rounded-2xl border border-ninja-green/20 overflow-y-auto"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h2 className="font-ninja text-xl text-white flex items-center gap-2">
                  <Settings size={22} className="text-ninja-green" /> Profile & Settings
                </h2>
                <button onClick={() => setShowProfile(false)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              <div className="p-6"><ProfileTab player={player} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Profile Modal */}
      <AnimatePresence>
        {selectedRightFriend && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setSelectedRightFriend(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-[400px] max-w-[90vw] rounded-2xl border border-ninja-green/20 overflow-hidden"
              style={{ background: 'rgba(11,12,16,0.97)', backdropFilter: 'blur(20px)' }}
              onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <h3 className="font-ninja text-sm text-white">PLAYER PROFILE</h3>
                <button onClick={() => setSelectedRightFriend(null)} className="ninja-btn ninja-btn-ghost w-11 h-11 flex items-center justify-center"><X size={28} /></button>
              </div>
              {/* Profile info */}
              <div className="p-5 text-center">
                <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-2 border-ninja-green/30 mb-3 bg-gray-800">
                  <img src={selectedRightFriend.profilePhoto || `/img/pfp-${selectedRightFriend.ninjaType || 'neon'}.png`} alt="" className={`w-full h-full ${selectedRightFriend.profilePhoto ? 'object-cover' : 'object-contain'}`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <p className="font-ninja text-xl text-white">{selectedRightFriend.username?.toUpperCase()}</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${selectedRightFriend.isOnline ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <span className={`font-body text-sm ${selectedRightFriend.isOnline ? 'text-green-400' : 'text-gray-500'}`}>
                    {selectedRightFriend.isOnline
                      ? selectedRightFriend.currentActivity || 'Online'
                      : 'Offline'}
                  </span>
                </div>
              </div>
              {/* Action buttons */}
              <div className="px-5 pb-5 flex flex-col gap-2">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    setViewInfoLoading(true);
                    try {
                      const snap = await getDoc(doc(db, 'players', selectedRightFriend.uid));
                      if (snap.exists()) {
                        setViewInfoFriend({ uid: snap.id, ...snap.data() });
                      }
                    } catch {}
                    setViewInfoLoading(false);
                    setSelectedRightFriend(null);
                  }}
                  className="ninja-btn ninja-btn-green ninja-btn-full flex items-center justify-center gap-2">
                  {viewInfoLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} VIEW INFO
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedRightFriend(null);
                    window.dispatchEvent(new CustomEvent('open-private-chat', { detail: { friendId: selectedRightFriend.uid, friendName: selectedRightFriend.username } }));
                  }}
                  className="ninja-btn ninja-btn-blue ninja-btn-full flex items-center justify-center gap-2">
                  <Send size={14} /> MESSAGE
                </motion.button>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const friendName = selectedRightFriend?.username || '';
                      setSelectedRightFriend(null);
                      onSendCoins?.(friendName);
                    }}
                    className="ninja-btn ninja-btn-yellow flex items-center justify-center gap-2">
                    <Coins size={14} /> TOKENS
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedRightFriend(null);
                      setShowInventory(true);
                    }}
                    className="ninja-btn ninja-btn-purple flex items-center justify-center gap-2">
                    <Gift size={14} /> GIFT
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Friend Info Modal */}
      <AnimatePresence>
        {viewInfoFriend && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80"
            onClick={() => setViewInfoFriend(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-[480px] max-w-[90vw] rounded-2xl border border-white/10 overflow-hidden"
              style={{ background: '#0a0a0e' }}
              onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <h3 className="font-ninja text-sm text-white tracking-wider">PLAYER INFO</h3>
                <button onClick={() => setViewInfoFriend(null)} className="ninja-btn ninja-btn-ghost w-9 h-9 flex items-center justify-center"><X size={20} /></button>
              </div>
              {/* Profile */}
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-ninja-green/30 bg-gray-800 flex-shrink-0">
                    <img src={viewInfoFriend.profilePhoto || `/img/pfp-${viewInfoFriend.ninjaType || viewInfoFriend.character?.ninjaType || 'neon'}.png`} alt="" className={`w-full h-full ${viewInfoFriend.profilePhoto ? 'object-cover' : 'object-contain'}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div>
                    <p className="font-ninja text-xl text-white">{viewInfoFriend.username?.toUpperCase()}</p>
                    <p className="font-body text-sm" style={{ color: getLevelInfo(calculateTotalXP(viewInfoFriend)).color }}>
                      {getLevelInfo(calculateTotalXP(viewInfoFriend)).title} — Level {getLevelInfo(calculateTotalXP(viewInfoFriend)).level}
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Coins size={10} /> TOKENS</p>
                    <p className="font-ninja text-lg text-yellow-400">{Math.floor(viewInfoFriend.coins || 0)}</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> PLAYTIME</p>
                    <p className="font-ninja text-lg text-white">{Math.floor((viewInfoFriend.totalPlaytime || 0) / 60)}h {(viewInfoFriend.totalPlaytime || 0) % 60}m</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Package size={10} /> INVENTORY</p>
                    <p className="font-ninja text-lg text-purple-400">{(viewInfoFriend.inventory || []).filter((i: any) => !i.used).length} items</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Swords size={10} /> SKINS</p>
                    <p className="font-ninja text-lg text-green-400">{(viewInfoFriend.ownedNinjas || []).length}</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Gamepad2 size={10} /> GAMES PLAYED</p>
                    <p className="font-ninja text-lg text-blue-400">{viewInfoFriend.stats?.gamesPlayed || 0}</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Trophy size={10} /> WINS</p>
                    <p className="font-ninja text-lg text-yellow-400">{viewInfoFriend.stats?.totalWins || 0}</p>
                  </div>
                  <div className="glass rounded-xl p-3 border border-white/5">
                    <p className="font-body text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Calendar size={10} /> MEMBER SINCE</p>
                    <p className="font-ninja text-lg text-gray-300">
                      {viewInfoFriend.createdAt ? new Date(viewInfoFriend.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* XP bar */}
                {(() => {
                  const info = getLevelInfo(calculateTotalXP(viewInfoFriend));
                  return (
                    <div className="mt-4 glass rounded-xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-body text-[10px] text-gray-500">XP PROGRESS</span>
                        <span className="font-body text-[10px]" style={{ color: info.color }}>{Math.floor(info.progress * 100)}%</span>
                      </div>
                      <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${info.progress * 100}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full rounded-full" style={{ background: info.color }} />
                      </div>
                      <p className="font-body text-[10px] text-gray-600 mt-1">{info.currentXP.toLocaleString()} / {info.xpForNext.toLocaleString()} XP</p>
                    </div>
                  );
                })()}

                {/* Inventory items */}
                {(() => {
                  const privacy = viewInfoFriend.privacySettings?.inventoryVisibility || 'public';
                  const items = (viewInfoFriend.inventory || []).filter((i: any) => !i.used);
                  if (privacy === 'hidden' || privacy === 'private') {
                    return (
                      <div className="mt-4 glass rounded-xl p-4 border border-white/5 flex items-center justify-center gap-2">
                        <Lock size={14} className="text-gray-600" />
                        <span className="font-body text-sm text-gray-600">Inventory is private</span>
                      </div>
                    );
                  }
                  return items.length > 0 ? (
                    <div className="mt-4 glass rounded-xl p-3 border border-white/5">
                      <p className="font-body text-[10px] text-gray-500 mb-2 flex items-center gap-1"><Package size={10} /> INVENTORY ({items.length})</p>
                      <div className="grid grid-cols-4 gap-2 max-h-[160px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(57,255,20,0.2) transparent' }}>
                        {items.map((item: any, idx: number) => (
                          <div key={item.id || idx} className="rounded-lg p-2 text-center border border-white/5"
                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-10 h-10 mx-auto object-contain mb-1" />
                            ) : (
                              <div className="w-10 h-10 mx-auto rounded bg-gray-800 flex items-center justify-center mb-1">
                                <Package size={14} className="text-gray-600" />
                              </div>
                            )}
                            <p className="font-body text-[8px] text-gray-400 truncate">{item.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ═══════════ LAUNCHING GAME POPUP ═══════════ */}
      <AnimatePresence>
        {launchingGame && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => { if (launchStatus === 'failed') setLaunchingGame(null); }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`flex flex-col items-center gap-5 px-12 py-10 rounded-2xl border ${
                launchStatus === 'failed' ? 'border-red-500/30' : launchStatus === 'success' ? 'border-ninja-green/50' : 'border-ninja-green/30'
              }`}
              style={{ background: launchStatus === 'failed'
                ? 'linear-gradient(135deg, rgba(20,5,5,0.95), rgba(15,5,5,0.98))'
                : 'linear-gradient(135deg, rgba(10,15,10,0.95), rgba(5,10,5,0.98))' }}>
              <div className="relative">
                <div className={`w-24 h-24 rounded-2xl overflow-hidden border-2 shadow-lg ${
                  launchStatus === 'failed' ? 'border-red-500/40 shadow-red-500/20' : 'border-ninja-green/40 shadow-ninja-green/20'
                }`}>
                  <Image src={launchingGame.coverImage} alt={launchingGame.name} fill className="object-cover" sizes="96px" />
                </div>
                {launchStatus === 'launching' && (
                  <motion.div className="absolute -inset-2 rounded-2xl border-2 border-ninja-green/50"
                    animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }} />
                )}
              </div>
              <div className="text-center">
                <p className={`font-ninja text-xl tracking-wider mb-1 ${
                  launchStatus === 'failed' ? 'text-red-400' : 'text-ninja-green'
                }`}>
                  {launchingGame.name.toUpperCase()}
                </p>
                <div className="flex items-center gap-2 justify-center">
                  {launchStatus === 'launching' && (
                    <>
                      <Loader2 size={14} className="text-ninja-green animate-spin" />
                      <p className="font-body text-sm text-gray-400">Opening game...</p>
                    </>
                  )}
                  {launchStatus === 'success' && (
                    <>
                      <Check size={14} className="text-ninja-green" />
                      <p className="font-body text-sm text-ninja-green">Game launched!</p>
                    </>
                  )}
                  {launchStatus === 'failed' && (
                    <>
                      <X size={14} className="text-red-400" />
                      <p className="font-body text-sm text-red-400">Failed to launch</p>
                    </>
                  )}
                </div>
                {launchStatus === 'failed' && (
                  <p className="font-body text-xs text-gray-500 mt-2">Tap to dismiss</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Club panel */}
      <ClubPanel player={player} open={showClub} onClose={() => setShowClub(false)} />
    </div>
  );
}
