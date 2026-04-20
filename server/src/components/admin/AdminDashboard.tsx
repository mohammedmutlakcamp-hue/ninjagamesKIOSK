'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, onSnapshot, getDocs, doc, updateDoc, deleteDoc, addDoc, increment, query, where } from 'firebase/firestore';
import { PCManagement } from './PCManagement';
import { PlayerManagement } from './PlayerManagement';
import { MenuManagement } from './MenuManagement';
import { OrdersPanel } from './OrdersPanel';
import { RevenuePanel } from './RevenuePanel';
import { SettingsPanel } from './SettingsPanel';
import { TournamentManagement } from './TournamentManagement';
import { TopUpRequests } from './TopUpRequests';
import { NotificationsPanel } from './NotificationsPanel';
import { VIPRequests } from './VIPRequests';
import { GamesManagement } from './GamesManagement';
import { ChestManagement } from './ChestManagement';
import { SkinsManagement } from './SkinsManagement';
import { DailyTasksManagement } from './DailyTasksManagement';
import { SocialTasksVerification } from './SocialTasksVerification';
import { ChatModeration } from './ChatModeration';
import { SoftwareManagement } from './SoftwareManagement';
import { LeaderboardManagement } from './LeaderboardManagement';
import { PricingManagement } from './PricingManagement';
import { ProfitDashboard } from './ProfitDashboard';
import { AnnouncementsPanel } from './AnnouncementsPanel';
import { CoinTransferLog } from './CoinTransferLog';
import { ShiftManagement } from './ShiftManagement';
import { DiscountCodes } from './DiscountCodes';
import { LoyaltyProgram } from './LoyaltyProgram';
import { RewardCampaigns } from './RewardCampaigns';
import { InvoiceGenerator } from './InvoiceGenerator';
import { PCZones } from './PCZones';
import { ScheduledTasks } from './ScheduledTasks';
import { GameAnalytics } from './GameAnalytics';
import { PlayerReports } from './PlayerReports';
import { AchievementsManager } from './AchievementsManager';
import { PCReservation } from './PCReservation';
import { PlayerSwap } from './PlayerSwap';
import { GameUpdatePusher } from './GameUpdatePusher';
import { DebugLogsPanel } from './DebugLogsPanel';
import { FeatureFlagsPanel } from './FeatureFlagsPanel';
import { RemoteInstallPanel } from './RemoteInstallPanel';
import { GameReportPanel } from './GameReportPanel';
import { HubblyManagement } from './HubblyManagement';
import { CameraPanel } from './CameraPanel';
import {
  LayoutDashboard, Monitor, Users, UtensilsCrossed, ClipboardList,
  DollarSign, Settings, LogOut, Activity, ShoppingBag, Coins, UserCheck, Swords,
  UserPlus, ShieldCheck, X as XIcon, Phone, Bell, Crown, Gamepad2, Package,
  Palette, ClipboardCheck, MessageSquare, Wrench, Trophy, Tag, TrendingUp, Megaphone,
  ArrowLeftRight, Clock, Ticket, Sunset, Heart, Gift, Receipt, MapPin, CalendarClock,
  BarChart3, Flag, Award, BookmarkCheck, Repeat, Download, Loader2, ChevronRight, Instagram, Key, Check,
  ToggleRight, HardDriveDownload, ListChecks, Flame, Video
} from 'lucide-react';

type Tab = 'dashboard' | 'pcs' | 'players' | 'topups' | 'menu' | 'hubblymenu' | 'orders' | 'hubbly' | 'cameras' | 'tournaments' | 'revenue' | 'notifications' | 'settings' | 'vip' | 'games' | 'chests' | 'skins' | 'dailytasks' | 'socialtasks' | 'chat' | 'software' | 'leaderboard' | 'pricing' | 'profit' | 'announcements' | 'transfers' | 'shifts' | 'discounts' | 'happyhour' | 'loyalty' | 'campaigns' | 'invoices' | 'zones' | 'scheduled' | 'analytics' | 'reports' | 'achievements' | 'reservations' | 'swap' | 'updates' | 'debuglogs' | 'flags' | 'remoteinstall' | 'gamereport';

interface Props {
  admin: any;
}

function DashboardOverview() {
  const [stats, setStats] = useState({
    activePCs: 0,
    totalPCs: 0,
    revenueToday: 0,
    activePlayers: 0,
    pendingOrders: 0,
    totalPlayers: 0,
  });

  useEffect(() => {
    const unsubPCs = onSnapshot(collection(db, 'pcs'), (snap) => {
      const pcs = snap.docs.map(d => d.data());
      setStats(prev => ({
        ...prev,
        totalPCs: pcs.length,
        activePCs: pcs.filter(p => p.status === 'occupied').length,
      }));
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      const orders = snap.docs.map(d => d.data());
      const pending = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length;
      const today = new Date().setHours(0, 0, 0, 0);
      const todayRevenue = orders
        .filter(o => o.createdAt > today && o.status !== 'cancelled')
        .reduce((sum, o) => sum + (o.totalCoins || 0), 0);
      setStats(prev => ({ ...prev, pendingOrders: pending, revenueToday: todayRevenue }));
    });

    const loadPlayers = async () => {
      const snap = await getDocs(collection(db, 'players'));
      const today = new Date().setHours(0, 0, 0, 0);
      const active = snap.docs.filter(d => (d.data().lastLogin || 0) > today).length;
      setStats(prev => ({ ...prev, totalPlayers: snap.size, activePlayers: active }));
    };
    loadPlayers();

    return () => { unsubPCs(); unsubOrders(); };
  }, []);

  const cards = [
    { label: 'Active PCs', value: `${stats.activePCs}/${stats.totalPCs}`, icon: <Monitor size={22} />, color: '#34c759', bg: '#f0faf3' },
    { label: 'Revenue Today', value: `${stats.revenueToday.toLocaleString()} coins`, icon: <Coins size={22} />, color: '#ff9500', bg: '#fff8f0' },
    { label: 'Active Players', value: `${stats.activePlayers}`, icon: <UserCheck size={22} />, color: '#007aff', bg: '#f0f5ff' },
    { label: 'Pending Orders', value: `${stats.pendingOrders}`, icon: <ShoppingBag size={22} />, color: '#ff3b30', bg: '#fff5f5' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-[#1d1d1f] tracking-tight">Dashboard</h2>
        <p className="text-[#86868b] text-sm mt-1">Welcome back. Here&apos;s your overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.bg }}>
                <span style={{ color: card.color }}>{card.icon}</span>
              </div>
            </div>
            <p className="text-3xl font-semibold text-[#1d1d1f] tracking-tight mb-1">{card.value}</p>
            <p className="text-[#86868b] text-sm">{card.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Users size={18} className="text-[#86868b]" /> Player Overview
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#f5f5f7]">
              <span className="text-[#86868b] text-sm">Total Registered</span>
              <span className="text-[#1d1d1f] font-semibold">{stats.totalPlayers}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-[#86868b] text-sm">Active Today</span>
              <span className="text-[#34c759] font-semibold">{stats.activePlayers}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Monitor size={18} className="text-[#86868b]" /> PC Status
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[#f5f5f7]">
              <span className="text-[#86868b] text-sm">Total PCs</span>
              <span className="text-[#1d1d1f] font-semibold">{stats.totalPCs}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#f5f5f7]">
              <span className="text-[#86868b] text-sm">Occupied</span>
              <span className="text-[#ff3b30] font-semibold">{stats.activePCs}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-[#86868b] text-sm">Available</span>
              <span className="text-[#34c759] font-semibold">{stats.totalPCs - stats.activePCs}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PendingRegistration {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  ninjaType: string;
  approvalCode: string;
  status: string;
  createdAt: number;
}

export function AdminDashboard({ admin }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingRegs, setPendingRegs] = useState<PendingRegistration[]>([]);
  const [activeNotification, setActiveNotification] = useState<PendingRegistration | null>(null);
  const [guestNotification, setGuestNotification] = useState<{ id: string; pcName: string; timestamp: number } | null>(null);
  const [guestTimeChoice, setGuestTimeChoice] = useState(30);
  const [guestApproving, setGuestApproving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [regNotification, setRegNotification] = useState<{ id: string; pcName: string; timestamp: number } | null>(null);
  const [topUpNotification, setTopUpNotification] = useState<{ id: string; playerName: string; coins: number; priceJOD: number; playerId: string } | null>(null);
  const [topUpApproving, setTopUpApproving] = useState(false);
  const topUpSeenIds = useRef<Set<string>>(new Set());
  // PIN reset requests (player tapped "Forgot PIN" on the kiosk login)
  const [pinResetNotification, setPinResetNotification] = useState<{ id: string; username: string; pcName?: string | null; playerId?: string } | null>(null);
  const [pinResetActioning, setPinResetActioning] = useState(false);
  const pinResetSeenIds = useRef<Set<string>>(new Set());
  // Social-task verification requests (player did IG/Google/Bio task)
  const [socialVerifNotification, setSocialVerifNotification] = useState<{ id: string; playerId: string; playerName: string; bonusId: string; bonusTitle: string; reward: number } | null>(null);
  const [socialVerifActioning, setSocialVerifActioning] = useState(false);
  const socialVerifSeenIds = useRef<Set<string>>(new Set());
  const [guestRegTopUp, setGuestRegTopUp] = useState<{ id: string; playerName: string; coins: number; priceJOD: number } | null>(null);
  const [guestRegApproving, setGuestRegApproving] = useState(false);
  const [notifQueue, setNotifQueue] = useState<any[]>([]);
  const notifAudioRef = useRef<HTMLAudioElement | null>(null);

  // Play notification sound
  const playNotifSound = () => {
    try {
      if (!notifAudioRef.current) {
        notifAudioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHj2LysijYDEbPYbGxaJiMx5BisjIpmY2IEKLysmobDsjRo3Ky6pvPC1Lj87NrHVDOFKT0tCue0tBXpzW1bi/UkZnpd3Y1sXJV1d4r+Tj2czJV1Z3rePh18rIVlR0rN7e1MfGVVBuqNvZ0sXDUk1potTTzcK+UEljnM3MycC7TURYlcfFxby3SkBSjcG/wLmyRjxMhru5u7WtQTlGfbWzsrCqPTU/d6+sraqmOTE5cKmlpqShNS00aaCfoJ2cMSkvYpmYmpmWLiYqW5KRkpKQLyQmVIyKi4yKLCEjTYWDhIWDKx4fRn57fH17KRscP3h2dnZ0Jxgb');
      }
      notifAudioRef.current.currentTime = 0;
      notifAudioRef.current.play().catch(() => {});
    } catch {}
  };

  // Listen for new pending registrations
  useEffect(() => {
    const seenRegIds = new Set<string>();
    const unsub = onSnapshot(collection(db, 'pending-registrations'), (snap) => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PendingRegistration))
        .filter(r => r.status === 'pending')
        .sort((a, b) => b.createdAt - a.createdAt);
      setPendingRegs(pending);
      const newest = pending.find(r => !seenRegIds.has(r.id));
      if (newest) {
        seenRegIds.add(newest.id);
        setActiveNotification(newest);
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  // Listen for guest play requests
  useEffect(() => {
    const seenGuestIds = new Set<string>();
    const unsub = onSnapshot(collection(db, 'guest-requests'), (snap) => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(r => r.status === 'pending')
        .sort((a: any, b: any) => b.timestamp - a.timestamp);
      const newest = pending.find((r: any) => !seenGuestIds.has(r.id));
      if (newest) {
        seenGuestIds.add(newest.id);
        setGuestNotification({ id: newest.id, pcName: newest.pcName || 'Unknown PC', timestamp: newest.timestamp });
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  const approveGuestFromPopup = async () => {
    if (!guestNotification) return;
    setGuestApproving(true);
    await updateDoc(doc(db, 'guest-requests', guestNotification.id), {
      status: 'approved',
      approvedMinutes: guestTimeChoice,
      approvedAt: Date.now(),
    });
    setGuestApproving(false);
    setGuestNotification(null);
  };

  const rejectGuestFromPopup = async () => {
    if (!guestNotification) return;
    await updateDoc(doc(db, 'guest-requests', guestNotification.id), {
      status: 'rejected',
      rejectedAt: Date.now(),
    });
    setGuestNotification(null);
  };

  // Listen for new top-up requests
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'topup-requests'), (snap) => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((r: any) => r.status === 'pending')
        .sort((a: any, b: any) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
      const unseen = pending.find((r: any) => !topUpSeenIds.current.has(r.id));
      if (unseen) {
        setTopUpNotification({
          id: unseen.id,
          playerName: unseen.playerName || 'Unknown',
          coins: unseen.coins || 0,
          priceJOD: unseen.priceJOD || unseen.price || 0,
          playerId: unseen.playerId || '',
        });
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  const approveTopUpFromPopup = async () => {
    if (!topUpNotification) return;
    setTopUpApproving(true);
    try {
      const { getDoc } = await import('firebase/firestore');
      const playerSnap = await getDoc(doc(db, 'players', topUpNotification.playerId));
      if (playerSnap.exists()) {
        const currentCoins = playerSnap.data().coins || 0;
        await updateDoc(doc(db, 'players', topUpNotification.playerId), {
          coins: currentCoins + topUpNotification.coins,
        });
      }
      await updateDoc(doc(db, 'topup-requests', topUpNotification.id), {
        status: 'approved',
        approvedAt: Date.now(),
      });
    } catch (err) {
      console.error('Failed to approve top-up:', err);
    }
    topUpSeenIds.current.add(topUpNotification.id);
    setTopUpApproving(false);
    setTopUpNotification(null);
  };

  const rejectTopUpFromPopup = async () => {
    if (!topUpNotification) return;
    setTopUpApproving(true);
    try {
      await updateDoc(doc(db, 'topup-requests', topUpNotification.id), {
        status: 'rejected',
        rejectedAt: Date.now(),
      });
    } catch (err) {
      console.error('Failed to reject top-up:', err);
    }
    topUpSeenIds.current.add(topUpNotification.id);
    setTopUpApproving(false);
    setTopUpNotification(null);
  };

  // Listen for PIN reset requests (player tapped "Forgot PIN" on login)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pin-reset-requests'), (snap) => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((r: any) => r.status === 'pending')
        .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      const unseen = pending.find((r: any) => !pinResetSeenIds.current.has(r.id));
      if (unseen) {
        setPinResetNotification({
          id: unseen.id,
          username: unseen.username || 'unknown',
          pcName: unseen.pcName,
        });
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  const approvePinReset = async () => {
    if (!pinResetNotification) return;
    setPinResetActioning(true);
    try {
      // Find the player by username (lowercase) and apply the legacy reset
      const { getDocs, query, where } = await import('firebase/firestore');
      const q = query(collection(db, 'players'), where('username', '==', pinResetNotification.username));
      const playerSnap = await getDocs(q);
      if (!playerSnap.empty) {
        await updateDoc(doc(db, 'players', playerSnap.docs[0].id), {
          pin: '',
          isLegacyUser: true,
          legacyPassword: '000000',
        });
      }
      // Mark the request as approved so the player's kiosk can flip to the
      // PIN-picker popup. DO NOT delete — the kiosk listens to this doc.
      await updateDoc(doc(db, 'pin-reset-requests', pinResetNotification.id), {
        status: 'approved',
        approvedAt: Date.now(),
      });
    } catch (err) {
      console.error('PIN reset failed:', err);
    }
    pinResetSeenIds.current.add(pinResetNotification.id);
    setPinResetActioning(false);
    setPinResetNotification(null);
  };

  const dismissPinResetPopup = async () => {
    if (!pinResetNotification) return;
    pinResetSeenIds.current.add(pinResetNotification.id);
    try {
      // Mark as rejected so the player's kiosk can show the rejected state.
      await updateDoc(doc(db, 'pin-reset-requests', pinResetNotification.id), {
        status: 'rejected',
        rejectedAt: Date.now(),
      });
    } catch {}
    setPinResetNotification(null);
  };

  // Listen for social-verification requests (IG / Google review / Bio task).
  // Once on mount we also clean up any stale request docs > 24 h old —
  // those are leftovers from the legacy timestamped-id scheme that never
  // got cleared after approve/reject and would re-pop the popup forever.
  useEffect(() => {
    let cleanedStale = false;
    const unsub = onSnapshot(collection(db, 'social-verification-requests'), (snap) => {
      // First-pass: nuke anything older than 24 h. One shot per session.
      if (!cleanedStale) {
        cleanedStale = true;
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        snap.docs.forEach((d) => {
          const ts = (d.data() as any).createdAt || 0;
          if (ts && ts < cutoff) deleteDoc(d.ref).catch(() => {});
        });
      }
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((r: any) => r.status === 'pending')
        .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      // Dedupe by playerId+bonusId so a single player with multiple legacy
      // pending docs only fires the popup once (the most recent one wins).
      const seenKey = new Set<string>();
      const dedup = pending.filter((r: any) => {
        const key = `${r.playerId}::${r.bonusId}`;
        if (seenKey.has(key)) return false;
        seenKey.add(key);
        return true;
      });
      const unseen = dedup.find((r: any) => !socialVerifSeenIds.current.has(r.id));
      if (unseen) {
        setSocialVerifNotification({
          id: unseen.id,
          playerId: unseen.playerId,
          playerName: unseen.playerName || 'unknown',
          bonusId: unseen.bonusId,
          bonusTitle: unseen.bonusTitle || 'Social Task',
          reward: unseen.reward || 10,
        });
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  // Wipe every pending request for this player + bonus combo.
  // submitSocialRequest in DailyTasksTab uses a timestamped doc id, so
  // a player who tapped "Request verification" three times has THREE
  // pending docs. Without this fan-out, approving one would leave the
  // other two, and the popup would re-fire on the next admin reload.
  const clearAllSocialRequestsFor = async (playerId: string, bonusId: string) => {
    try {
      const q = query(
        collection(db, 'social-verification-requests'),
        where('playerId', '==', playerId),
        where('bonusId', '==', bonusId),
      );
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
      // Mark every one we just deleted as "seen" so the in-session listener
      // can't re-pop them while the snapshot is still in flight.
      snap.docs.forEach((d) => socialVerifSeenIds.current.add(d.id));
    } catch (err) {
      console.error('clearAllSocialRequestsFor failed', err);
    }
  };

  const approveSocialVerif = async () => {
    if (!socialVerifNotification) return;
    setSocialVerifActioning(true);
    try {
      // Credit coins + mark claimed with timestamp (so kiosk cooldown logic works)
      await updateDoc(doc(db, 'players', socialVerifNotification.playerId), {
        coins: increment(socialVerifNotification.reward),
        [`socialBonus.${socialVerifNotification.bonusId}.claimed`]: true,
        [`socialBonus.${socialVerifNotification.bonusId}.claimedAt`]: Date.now(),
        [`socialBonus.${socialVerifNotification.bonusId}.requested`]: false,
      });
      await clearAllSocialRequestsFor(socialVerifNotification.playerId, socialVerifNotification.bonusId);
    } catch (err) {
      console.error('Social verif approve failed:', err);
    }
    socialVerifSeenIds.current.add(socialVerifNotification.id);
    setSocialVerifActioning(false);
    setSocialVerifNotification(null);
  };

  const rejectSocialVerif = async () => {
    if (!socialVerifNotification) return;
    setSocialVerifActioning(true);
    try {
      // Clear the pending flag so player can re-request
      await updateDoc(doc(db, 'players', socialVerifNotification.playerId), {
        [`socialBonus.${socialVerifNotification.bonusId}.requested`]: false,
      });
      await clearAllSocialRequestsFor(socialVerifNotification.playerId, socialVerifNotification.bonusId);
    } catch {}
    socialVerifSeenIds.current.add(socialVerifNotification.id);
    setSocialVerifActioning(false);
    setSocialVerifNotification(null);
  };

  const dismissTopUpPopup = () => {
    if (topUpNotification) topUpSeenIds.current.add(topUpNotification.id);
    setTopUpNotification(null);
  };

  // Listen for guest registration + top-up requests
  useEffect(() => {
    const seenGrtIds = new Set<string>();
    const unsub = onSnapshot(collection(db, 'guest-reg-topups'), (snap) => {
      const pending = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((r: any) => r.status === 'pending')
        .sort((a: any, b: any) => b.createdAt - a.createdAt);
      const newest = pending.find((r: any) => !seenGrtIds.has(r.id));
      if (newest) {
        seenGrtIds.add(newest.id);
        setGuestRegTopUp({
          id: newest.id,
          playerName: newest.playerName || 'Unknown',
          coins: newest.coins || 0,
          priceJOD: newest.priceJOD || 0,
        });
        playNotifSound();
      }
    });
    return () => unsub();
  }, []);

  const approveGuestRegTopUp = async () => {
    if (!guestRegTopUp) return;
    setGuestRegApproving(true);
    await updateDoc(doc(db, 'guest-reg-topups', guestRegTopUp.id), {
      status: 'approved',
      approvedAt: Date.now(),
    });
    setGuestRegApproving(false);
    setGuestRegTopUp(null);
  };

  const rejectGuestRegTopUp = async () => {
    if (!guestRegTopUp) return;
    await updateDoc(doc(db, 'guest-reg-topups', guestRegTopUp.id), {
      status: 'rejected',
      rejectedAt: Date.now(),
    });
    setGuestRegTopUp(null);
  };

  // Listen for guest registration requests.
  // Also auto-closes the current popup once the corresponding request leaves
  // 'pending' state (customer finished registering, or another admin handled it).
  useEffect(() => {
    const seenRegReqIds = new Set<string>();
    const unsub = onSnapshot(collection(db, 'guest-register-requests'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const pending = all
        .filter(r => r.status === 'pending')
        .sort((a: any, b: any) => b.timestamp - a.timestamp);
      const newest = pending.find((r: any) => !seenRegReqIds.has(r.id));
      if (newest) {
        seenRegReqIds.add(newest.id);
        setRegNotification({ id: newest.id, pcName: newest.pcName || 'Unknown PC', timestamp: newest.timestamp });
        playNotifSound();
      }
      // Auto-dismiss: if the currently-shown request has reached a terminal
      // state (customer finished registering, or another admin closed it out),
      // clear the popup so the admin isn't stranded on a stale code screen.
      // Note: intentionally excludes 'pending' and 'handled' so the popup stays
      // open while the admin is reading the code to the customer.
      const TERMINAL = new Set(['approved', 'rejected', 'dismissed', 'completed', 'used']);
      setRegNotification((cur) => {
        if (!cur) return cur;
        const match = all.find(r => r.id === cur.id);
        if (match && TERMINAL.has(match.status)) {
          setGeneratedCode(null);
          return null;
        }
        return cur;
      });
    });
    return () => unsub();
  }, []);

  const handleRegCodeGenerated = async () => {
    if (!regNotification) return;
    await updateDoc(doc(db, 'guest-register-requests', regNotification.id), { status: 'handled', handledAt: Date.now() });
  };

  const dismissRegNotification = async () => {
    if (!regNotification) return;
    await updateDoc(doc(db, 'guest-register-requests', regNotification.id), { status: 'dismissed', dismissedAt: Date.now() });
    setRegNotification(null);
    setGeneratedCode(null);
  };

  const generateRegistrationCode = async () => {
    setGeneratingCode(true);
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await addDoc(collection(db, 'guest-approval-codes'), {
        code,
        used: false,
        createdAt: Date.now(),
        createdBy: admin?.email || 'admin',
        requestId: regNotification?.id || null,
      });
      setGeneratedCode(code);
    } catch (err) {
      console.error('[admin] generate reg code failed:', err);
      alert('Failed to generate code. Check your connection and try again.');
    } finally {
      // ALWAYS release the spinner so the button never sticks, even on failure.
      setGeneratingCode(false);
    }
  };

  const approveRegistration = async (reg: PendingRegistration) => {
    try {
      await updateDoc(doc(db, 'pending-registrations', reg.id), { status: 'approved' });
      setActiveNotification(null);
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const rejectRegistration = async (reg: PendingRegistration) => {
    try {
      await updateDoc(doc(db, 'pending-registrations', reg.id), { status: 'rejected' });
      setActiveNotification(null);
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const navSections: { title?: string; items: { id: Tab; label: string; icon: React.ReactNode }[] }[] = [
    {
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      ]
    },
    {
      title: 'Operations',
      items: [
        { id: 'pcs', label: 'PCs', icon: <Monitor size={18} /> },
        { id: 'zones', label: 'PC Zones', icon: <MapPin size={18} /> },
        { id: 'reservations', label: 'Reservations', icon: <BookmarkCheck size={18} /> },
        { id: 'swap', label: 'Player Swap', icon: <Repeat size={18} /> },
        { id: 'players', label: 'Players', icon: <Users size={18} /> },
        { id: 'reports', label: 'Reports', icon: <Flag size={18} /> },
        { id: 'topups', label: 'Top Ups', icon: <Coins size={18} /> },
        { id: 'transfers', label: 'Transfers', icon: <ArrowLeftRight size={18} /> },
        { id: 'menu', label: 'Food Menu', icon: <UtensilsCrossed size={18} /> },
        { id: 'hubblymenu', label: 'Hubbly Menu', icon: <Flame size={18} /> },
        { id: 'orders', label: 'Orders', icon: <ClipboardList size={18} /> },
        { id: 'hubbly', label: 'Hubbly Bubbly', icon: <Flame size={18} /> },
        { id: 'cameras', label: 'Cameras', icon: <Video size={18} /> },
        { id: 'tournaments', label: 'Tournaments', icon: <Swords size={18} /> },
        { id: 'vip', label: 'VIP', icon: <Crown size={18} /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
        { id: 'announcements', label: 'Announcements', icon: <Megaphone size={18} /> },
      ]
    },
    {
      title: 'Business',
      items: [
        { id: 'revenue', label: 'Revenue', icon: <DollarSign size={18} /> },
        { id: 'profit', label: 'Profit & Loss', icon: <TrendingUp size={18} /> },
        { id: 'invoices', label: 'Invoices', icon: <Receipt size={18} /> },
        { id: 'shifts', label: 'Shifts', icon: <Clock size={18} /> },
        { id: 'analytics', label: 'Game Stats', icon: <BarChart3 size={18} /> },
      ]
    },
    {
      title: 'Content',
      items: [
        { id: 'games', label: 'Games', icon: <Gamepad2 size={18} /> },
        { id: 'chests', label: 'Chests', icon: <Package size={18} /> },
        { id: 'skins', label: 'Skins', icon: <Palette size={18} /> },
        { id: 'achievements', label: 'Achievements', icon: <Award size={18} /> },
        { id: 'dailytasks', label: 'Daily Tasks', icon: <ClipboardCheck size={18} /> },
        { id: 'socialtasks', label: 'Social Verify', icon: <Instagram size={18} /> },
        { id: 'chat', label: 'Chat', icon: <MessageSquare size={18} /> },
        { id: 'software', label: 'Software', icon: <Wrench size={18} /> },
        { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={18} /> },
      ]
    },
    {
      title: 'Marketing',
      items: [
        { id: 'discounts', label: 'Promo Codes', icon: <Ticket size={18} /> },
        { id: 'loyalty', label: 'Loyalty', icon: <Heart size={18} /> },
        { id: 'campaigns', label: 'Campaigns', icon: <Gift size={18} /> },
      ]
    },
    {
      title: 'System',
      items: [
        { id: 'pricing', label: 'Pricing', icon: <Tag size={18} /> },
        { id: 'updates', label: 'PC Updates', icon: <Download size={18} /> },
        { id: 'gamereport', label: 'Game Report', icon: <ListChecks size={18} /> },
        { id: 'remoteinstall', label: 'Install Games', icon: <HardDriveDownload size={18} /> },
        { id: 'flags', label: 'Feature Flags', icon: <ToggleRight size={18} /> },
        { id: 'scheduled', label: 'Scheduled', icon: <CalendarClock size={18} /> },
        { id: 'debuglogs', label: 'Debug Logs', icon: <Activity size={18} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
      ]
    },
  ];

  // Apple-style modal wrapper
  const ModalOverlay = ({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );

  return (
    <div className="admin-apple min-h-screen bg-[#f5f5f7] flex">
      {/* Mobile Header Bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3 bg-white/90 border-b border-[#e5e5ea] md:hidden"
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-[#f5f5f7] transition-all">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <h1 className="text-sm font-semibold text-[#1d1d1f]">Ninja Games Admin</h1>
        <div className="w-8" />
      </div>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[70] bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 bottom-0 w-[250px] z-[80] flex flex-col bg-white/95 border-r border-[#e5e5ea] transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* Brand header */}
        <div className="p-5 pb-4 border-b border-[#e5e5ea] flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#1d1d1f] tracking-tight">Ninja Games</h1>
            <p className="text-[11px] text-[#86868b] mt-0.5">Admin Panel</p>
            <p className="text-[10px] text-[#aeaeb2] mt-0.5 truncate">{admin.email}</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-all md:hidden">
            <XIcon size={18} className="text-[#86868b]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto px-2">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.title && (
                <p className="px-3 pb-1 text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">{section.title}</p>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-left rounded-lg transition-all text-[13px] ${
                    tab === item.id
                      ? 'bg-[#0071e3] text-white font-medium'
                      : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                  }`}
                >
                  <span className={tab === item.id ? 'text-white' : 'text-[#86868b]'}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-[#e5e5ea]">
          <button
            onClick={async () => { await signOut(auth); window.location.href = '/kiosk'; }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[#ff3b30] text-sm font-medium hover:bg-[#fff5f5] transition-all"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:ml-[250px] flex-1 p-4 md:p-8 min-h-screen pt-[72px] md:pt-8">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {tab === 'dashboard' && <DashboardOverview />}
          {tab === 'pcs' && <PCManagement />}
          {tab === 'players' && <PlayerManagement />}
          {tab === 'topups' && <TopUpRequests />}
          {tab === 'menu' && <MenuManagement />}
          {tab === 'orders' && <OrdersPanel />}
          {tab === 'hubbly' && <OrdersPanel kindFilter="shisha" />}
          {tab === 'hubblymenu' && <HubblyManagement />}
          {tab === 'cameras' && <CameraPanel />}
          {tab === 'tournaments' && <TournamentManagement />}
          {tab === 'revenue' && <RevenuePanel />}
          {tab === 'notifications' && <NotificationsPanel />}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'vip' && <VIPRequests />}
          {tab === 'games' && <GamesManagement />}
          {tab === 'chests' && <ChestManagement />}
          {tab === 'skins' && <SkinsManagement />}
          {tab === 'dailytasks' && <DailyTasksManagement />}
          {tab === 'socialtasks' && <SocialTasksVerification admin={admin} />}
          {tab === 'chat' && <ChatModeration />}
          {tab === 'software' && <SoftwareManagement />}
          {tab === 'leaderboard' && <LeaderboardManagement />}
          {tab === 'pricing' && <PricingManagement />}
          {tab === 'profit' && <ProfitDashboard />}
          {tab === 'announcements' && <AnnouncementsPanel />}
          {tab === 'transfers' && <CoinTransferLog />}
          {tab === 'shifts' && <ShiftManagement />}
          {tab === 'discounts' && <DiscountCodes />}
          {tab === 'loyalty' && <LoyaltyProgram />}
          {tab === 'campaigns' && <RewardCampaigns />}
          {tab === 'invoices' && <InvoiceGenerator />}
          {tab === 'zones' && <PCZones />}
          {tab === 'scheduled' && <ScheduledTasks />}
          {tab === 'analytics' && <GameAnalytics />}
          {tab === 'reports' && <PlayerReports />}
          {tab === 'achievements' && <AchievementsManager />}
          {tab === 'reservations' && <PCReservation />}
          {tab === 'swap' && <PlayerSwap />}
          {tab === 'updates' && <GameUpdatePusher />}
          {tab === 'debuglogs' && <DebugLogsPanel />}
          {tab === 'flags' && <FeatureFlagsPanel />}
          {tab === 'remoteinstall' && <RemoteInstallPanel />}
          {tab === 'gamereport' && <GameReportPanel />}
        </motion.div>
      </div>

      {/* New User Registration Notification */}
      <AnimatePresence>
        {activeNotification && (
          <ModalOverlay>
            <div className="w-[480px] max-w-[92vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#34c759]/10 flex items-center justify-center">
                <UserPlus size={28} className="text-[#34c759]" />
              </div>

              <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">New Registration</h1>
              <p className="text-[#86868b] text-sm mb-6">A new player is waiting for approval</p>

              <div className="bg-[#f5f5f7] rounded-xl p-5 mb-5 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Name</span>
                  <span className="text-[#1d1d1f] font-medium">{activeNotification.firstName} {activeNotification.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Username</span>
                  <span className="text-[#0071e3] font-semibold">{activeNotification.username?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Phone</span>
                  <span className="text-[#1d1d1f] flex items-center gap-1"><Phone size={12} className="text-[#86868b]" /> {activeNotification.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Ninja Type</span>
                  <span className="text-[#1d1d1f] capitalize font-medium">{activeNotification.ninjaType}</span>
                </div>
              </div>

              {/* Approval Code */}
              <div className="mb-6">
                <p className="text-[#86868b] text-xs uppercase tracking-wider mb-2 font-medium">Approval Code</p>
                <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl py-4 px-6">
                  <p className="text-4xl font-bold text-[#1d1d1f] tracking-[0.3em] font-mono">
                    {activeNotification.approvalCode}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => rejectRegistration(activeNotification)}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#ff3b30] font-medium hover:bg-[#fff5f5] transition-all flex items-center justify-center gap-2"
                >
                  <XIcon size={18} /> Reject
                </button>
                <button
                  onClick={() => approveRegistration(activeNotification)}
                  className="flex-1 py-3.5 bg-[#34c759] text-white rounded-xl font-medium hover:bg-[#2db84e] transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={18} /> Approve
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* Guest Play Request */}
      <AnimatePresence>
        {guestNotification && !activeNotification && (
          <ModalOverlay>
            <div className="w-[440px] max-w-[92vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#af52de]/10 flex items-center justify-center">
                <Gamepad2 size={28} className="text-[#af52de]" />
              </div>

              <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">Guest Play Request</h1>
              <p className="text-[#86868b] text-sm mb-5">Someone wants to play as guest</p>

              <div className="bg-[#f5f5f7] rounded-xl p-4 mb-5 text-left">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">PC</span>
                  <span className="text-[#1d1d1f] font-medium">{guestNotification.pcName}</span>
                </div>
              </div>

              {/* Time selection */}
              <div className="mb-5">
                <p className="text-[#86868b] text-xs uppercase tracking-wider mb-3 font-medium">Set Guest Play Time</p>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 45, 60, 90, 120].map(m => (
                    <button
                      key={m}
                      onClick={() => setGuestTimeChoice(m)}
                      className={`py-3 rounded-xl font-semibold transition-all ${
                        guestTimeChoice === m
                          ? 'bg-[#af52de] text-white'
                          : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#e5e5ea] hover:border-[#af52de]'
                      }`}
                    >
                      {m >= 60 ? `${m / 60}h` : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={rejectGuestFromPopup}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#ff3b30] font-medium hover:bg-[#fff5f5] transition-all flex items-center justify-center gap-2"
                >
                  <XIcon size={18} /> Reject
                </button>
                <button
                  onClick={approveGuestFromPopup}
                  disabled={guestApproving}
                  className="flex-1 py-3.5 bg-[#af52de] text-white rounded-xl font-medium hover:bg-[#a347d4] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {guestApproving ? <Loader2 size={18} className="animate-spin" /> : <Gamepad2 size={18} />} Approve {guestTimeChoice}m
                </button>
              </div>

              {/* Generate registration code */}
              <div className="mt-4 pt-4 border-t border-[#e5e5ea]">
                {generatedCode ? (
                  <div className="text-center">
                    <p className="text-[#86868b] text-xs uppercase tracking-wider mb-2 font-medium">Registration Code</p>
                    <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl py-3 px-6">
                      <p className="text-3xl font-bold text-[#1d1d1f] tracking-[0.3em] font-mono">{generatedCode}</p>
                    </div>
                    <button onClick={() => { setGeneratedCode(null); setGuestNotification(null); }}
                      className="mt-3 text-[#86868b] text-sm hover:text-[#1d1d1f] transition-all">
                      Done
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={generateRegistrationCode}
                    disabled={generatingCode}
                    className="w-full py-3 border border-[#d2d2d7] rounded-xl text-[#0071e3] font-medium text-sm hover:bg-[#f0f5ff] transition-all flex items-center justify-center gap-2"
                  >
                    {generatingCode ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    Generate Registration Code
                  </button>
                )}
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* Guest Registration Request */}
      <AnimatePresence>
        {regNotification && !activeNotification && !guestNotification && (
          <ModalOverlay>
            <div className="w-[440px] max-w-[92vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#34c759]/10 flex items-center justify-center">
                <UserPlus size={28} className="text-[#34c759]" />
              </div>

              <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">Guest Registration</h1>
              <p className="text-[#86868b] text-sm mb-4">A guest wants to create an account</p>

              <div className="bg-[#f5f5f7] rounded-xl p-4 mb-5 text-left">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">PC</span>
                  <span className="text-[#1d1d1f] font-medium">{regNotification.pcName}</span>
                </div>
              </div>

              {generatedCode ? (
                <div className="mb-5">
                  <p className="text-[#86868b] text-xs uppercase tracking-wider mb-2 font-medium">Registration Code</p>
                  <div className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl py-4 px-6">
                    <p className="text-4xl font-bold text-[#1d1d1f] tracking-[0.3em] font-mono">{generatedCode}</p>
                  </div>
                  <button onClick={() => { handleRegCodeGenerated(); setRegNotification(null); setGeneratedCode(null); }}
                    className="mt-4 px-8 py-3 bg-[#0071e3] text-white rounded-xl font-medium hover:bg-[#0077ED] transition-all">
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={dismissRegNotification}
                    className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#86868b] font-medium hover:bg-[#f5f5f7] transition-all flex items-center justify-center gap-2"
                  >
                    <XIcon size={18} /> Dismiss
                  </button>
                  <button
                    onClick={generateRegistrationCode}
                    disabled={generatingCode}
                    className="flex-1 py-3.5 bg-[#34c759] text-white rounded-xl font-medium hover:bg-[#2db84e] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {generatingCode ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} Generate Code
                  </button>
                </div>
              )}
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* PIN Reset Request — player tapped "Forgot PIN" on the kiosk login */}
      <AnimatePresence>
        {pinResetNotification && !activeNotification && !guestNotification && !regNotification && (
          <ModalOverlay>
            <div className="w-[420px] max-w-[90vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#fbbf24]/10 flex items-center justify-center text-2xl">🔑</div>

              <h1 className="text-xl md:text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">PIN Reset Request</h1>
              <p className="text-[#86868b] text-sm mb-5">A player forgot their PIN — verify them before resetting</p>

              <div className="bg-[#f5f5f7] rounded-xl p-5 mb-5 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Username</span>
                  <span className="text-[#1d1d1f] font-semibold">{(pinResetNotification.username || '').toUpperCase()}</span>
                </div>
                {pinResetNotification.pcName && (
                  <div className="flex justify-between">
                    <span className="text-[#86868b] text-sm">From PC</span>
                    <span className="text-[#1d1d1f] font-semibold">{pinResetNotification.pcName}</span>
                  </div>
                )}
              </div>

              <div className="bg-[#fff8e1] border border-[#fbbf24]/30 rounded-xl p-3 mb-5 text-left">
                <p className="text-[#86868b] text-xs leading-relaxed">
                  Resetting will set a temporary password <span className="font-mono font-bold text-[#1d1d1f]">000000</span>.
                  Tell the player to type their username and <span className="font-mono font-bold">000000</span> — the kiosk will then ask them to pick a new 6-digit PIN.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={dismissPinResetPopup}
                  disabled={pinResetActioning}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#86868b] font-medium hover:bg-[#fafafa] transition-all flex items-center justify-center gap-2"
                >
                  Close
                </button>
                <button
                  onClick={approvePinReset}
                  disabled={pinResetActioning}
                  className="flex-1 py-3.5 bg-[#fbbf24] text-[#1d1d1f] rounded-xl font-medium hover:bg-[#f59e0b] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {pinResetActioning ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />} Reset PIN
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* Social-task Verification Request — player did IG/Google/Bio task */}
      <AnimatePresence>
        {socialVerifNotification && !activeNotification && !guestNotification && !regNotification && !pinResetNotification && (
          <ModalOverlay>
            <div className="w-[440px] max-w-[90vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#e879f9]/10 flex items-center justify-center text-2xl">📸</div>
              <h1 className="text-xl md:text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">Social Task Verification</h1>
              <p className="text-[#86868b] text-sm mb-5">A player completed a social task — verify it visually before paying out</p>
              <div className="bg-[#f5f5f7] rounded-xl p-5 mb-4 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Player</span>
                  <span className="text-[#1d1d1f] font-semibold">{socialVerifNotification.playerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Task</span>
                  <span className="text-[#1d1d1f] font-semibold">{socialVerifNotification.bonusTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Reward</span>
                  <span className="text-[#e879f9] font-bold flex items-center gap-1">+{socialVerifNotification.reward} <span className="text-xs font-normal">tokens</span></span>
                </div>
              </div>
              <div className="bg-[#fdf4ff] border border-[#e879f9]/30 rounded-xl p-3 mb-5 text-left">
                <p className="text-[#86868b] text-xs leading-relaxed">
                  Check the player's phone or screenshot, then approve. If this is a repeatable task (Instagram / Google review), they can claim again in <span className="font-bold text-[#1d1d1f]">10 days</span>.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={rejectSocialVerif}
                  disabled={socialVerifActioning}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#86868b] font-medium hover:bg-[#fafafa] transition-all flex items-center justify-center gap-2"
                >
                  Reject
                </button>
                <button
                  onClick={approveSocialVerif}
                  disabled={socialVerifActioning}
                  className="flex-1 py-3.5 bg-[#e879f9] text-white rounded-xl font-medium hover:bg-[#d946ef] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {socialVerifActioning ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Approve & Pay
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* Top-Up Request */}
      <AnimatePresence>
        {topUpNotification && !activeNotification && !guestNotification && !regNotification && (
          <ModalOverlay>
            <div className="w-[440px] max-w-[90vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#ff9500]/10 flex items-center justify-center">
                <Coins size={28} className="text-[#ff9500]" />
              </div>

              <h1 className="text-xl md:text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1">Top-Up Request</h1>
              <p className="text-[#86868b] text-sm mb-5">A player wants to add coins</p>

              <div className="bg-[#f5f5f7] rounded-xl p-5 mb-5 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Player</span>
                  <span className="text-[#1d1d1f] font-semibold">{topUpNotification.playerName?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Amount</span>
                  <span className="text-[#ff9500] font-semibold">{topUpNotification.coins.toLocaleString()} coins</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Price</span>
                  <span className="text-[#1d1d1f] font-semibold text-lg">{topUpNotification.priceJOD} JOD</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={rejectTopUpFromPopup}
                  disabled={topUpApproving}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#ff3b30] font-medium hover:bg-[#fff5f5] transition-all flex items-center justify-center gap-2"
                >
                  <XIcon size={18} /> Reject
                </button>
                <button
                  onClick={approveTopUpFromPopup}
                  disabled={topUpApproving}
                  className="flex-1 py-3.5 bg-[#ff9500] text-white rounded-xl font-medium hover:bg-[#e88b00] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {topUpApproving ? <Loader2 size={18} className="animate-spin" /> : <Coins size={18} />} Approve
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* Guest Registration + Top-Up */}
      <AnimatePresence>
        {guestRegTopUp && !activeNotification && !guestNotification && !regNotification && !topUpNotification && (
          <ModalOverlay>
            <div className="w-[440px] max-w-[92vw] bg-white rounded-2xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#af52de]/10 flex items-center justify-center">
                <UserPlus size={28} className="text-[#af52de]" />
              </div>

              <h1 className="text-xl font-semibold text-[#1d1d1f] tracking-tight mb-1">New Account + Top-Up</h1>
              <p className="text-[#86868b] text-sm mb-5">A guest wants to register and buy coins</p>

              <div className="bg-[#f5f5f7] rounded-xl p-5 mb-5 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Username</span>
                  <span className="text-[#0071e3] font-semibold">{guestRegTopUp.playerName?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Package</span>
                  <span className="text-[#ff9500] font-semibold">{guestRegTopUp.coins.toLocaleString()} coins</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#86868b] text-sm">Payment</span>
                  <span className="text-[#1d1d1f] font-semibold text-lg">{guestRegTopUp.priceJOD} JOD</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={rejectGuestRegTopUp}
                  className="flex-1 py-3.5 border border-[#d2d2d7] rounded-xl text-[#ff3b30] font-medium hover:bg-[#fff5f5] transition-all flex items-center justify-center gap-2"
                >
                  <XIcon size={18} /> Reject
                </button>
                <button
                  onClick={approveGuestRegTopUp}
                  disabled={guestRegApproving}
                  className="flex-1 py-3.5 bg-[#af52de] text-white rounded-xl font-medium hover:bg-[#a347d4] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {guestRegApproving ? <Loader2 size={18} className="animate-spin" /> : <Coins size={18} />} Approve
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </AnimatePresence>
    </div>
  );
}
