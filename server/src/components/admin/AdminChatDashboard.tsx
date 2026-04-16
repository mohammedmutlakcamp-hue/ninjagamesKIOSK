'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, limit, where, getDoc, getDocs
} from 'firebase/firestore';
import {
  MessageCircle, ShoppingBag, Coins, Crown, UserPlus, Flame,
  Send, X, Check, Clock, ChefHat, CheckCircle2, Package, XCircle,
  LogOut, Bell, ArrowLeft, User, Monitor, Headphones, Wind,
  AlertTriangle, Loader2, Timer, Shield, TrendingUp,
  History, DollarSign, ChevronRight, BarChart3, Receipt, KeyRound
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SupportChat {
  id: string;
  playerId: string;
  playerName: string;
  playerNinjaType: string;
  pcName?: string;
  status: 'open' | 'resolved';
  lastMessage: string;
  lastMessageAt: number;
  unreadPlayer: number;
  unreadAdmin: number;
  createdAt: number;
}

interface SupportMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'player' | 'admin';
  text: string;
  createdAt: number;
}

interface FoodOrder {
  id: string;
  playerId: string;
  playerName: string;
  pcId?: string;
  pcName?: string;
  items: { menuItemId: string; name: string; quantity: number; price: number }[];
  totalCoins: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  createdAt: number;
  updatedAt?: number;
}

interface ShishaOrder {
  id: string;
  playerId: string;
  playerName: string;
  flavor: string;
  quantity: number;
  totalCoins: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  createdAt: number;
  pcName?: string;
}

interface TopUpRequest {
  id: string;
  playerId: string;
  playerName: string;
  packageId?: string;
  coins: number;
  priceJOD: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

interface VIPRequest {
  id: string;
  playerId: string;
  playerName: string;
  price: number;
  trial: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

interface GuestRequest {
  id: string;
  pcName: string;
  pcDocId?: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
  approvedMinutes?: number;
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

interface PinResetRequest {
  id: string;
  username: string;
  pcName?: string | null;
  pcId?: string | null;
  status: string;
  createdAt: number;
}

type MainTab = 'chat' | 'orders' | 'requests' | 'profit';

interface Props {
  admin: any;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const NINJA_COLORS: Record<string, string> = {
  neon: '#39ff14', fire: '#ff4500', ice: '#00bfff',
  shadow: '#8b00ff', gold: '#ffd700', default: '#39ff14',
};

function getNinjaColor(t?: string) {
  return NINJA_COLORS[t || 'default'] || NINJA_COLORS.default;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month} ${formatTime(ts)}`;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const playTone = (freq: number, delay: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + delay + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + dur);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + dur);
    };
    playTone(880, 0, 0.12);
    playTone(1100, 0.12, 0.12);
    playTone(1320, 0.24, 0.25);
  } catch { /* ignore */ }
}

const GUEST_TIME_OPTIONS = [15, 30, 45, 60, 90, 120];

// ─── Admin OneSignal Registration ───────────────────────────────────────────

async function registerAdminOneSignal() {
  if (typeof window === 'undefined') return;

  // Wait for OneSignal to be ready (loaded via onesignal-init.js in root layout)
  await new Promise<void>((resolve) => {
    if ((window as any).OneSignal) { resolve(); return; }
    const check = setInterval(() => {
      if ((window as any).OneSignal) { clearInterval(check); resolve(); }
    }, 200);
    setTimeout(() => { clearInterval(check); resolve(); }, 15000);
  });

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) return;

  try {
    // OneSignal is already initialized globally — just login as admin and tag
    await OneSignal.login('admin');
    await OneSignal.User.addTags({ role: 'admin', username: 'admin' });
    // Request notification permission if not already granted
    const permission = await OneSignal.Notifications.permission;
    if (!permission) {
      await OneSignal.Notifications.requestPermission();
    }
  } catch (err) {
    console.error('Admin OneSignal register error:', err);
  }
}

// Notify admin API helper (called from player side when something happens)
async function notifyAdminAPI(type: string, playerName?: string, details?: string) {
  try {
    await fetch('/api/admin-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, playerName, details }),
    });
  } catch { /* ignore */ }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminChatDashboard({ admin }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('orders');
  const [showMenu, setShowMenu] = useState(false);

  // Chat
  const [chats, setChats] = useState<SupportChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<SupportMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Orders
  const [foodOrders, setFoodOrders] = useState<FoodOrder[]>([]);
  const [shishaOrders, setShishaOrders] = useState<ShishaOrder[]>([]);
  const [orderFilter, setOrderFilter] = useState<'active' | 'history'>('active');

  // Requests
  const [topUpRequests, setTopUpRequests] = useState<TopUpRequest[]>([]);
  const [vipRequests, setVipRequests] = useState<VIPRequest[]>([]);
  const [guestRequests, setGuestRequests] = useState<GuestRequest[]>([]);
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [pinResetRequests, setPinResetRequests] = useState<PinResetRequest[]>([]);
  const [pinResetToast, setPinResetToast] = useState<PinResetRequest | null>(null);
  const [pinResetActioning, setPinResetActioning] = useState<string | null>(null);
  // Manual PIN reset (admin searches any player by username, resets immediately)
  const [manualResetUsername, setManualResetUsername] = useState('');
  const [manualResetLoading, setManualResetLoading] = useState(false);
  const [manualResetMsg, setManualResetMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const pinResetSeenIds = useRef<Set<string>>(new Set());
  const [requestFilter, setRequestFilter] = useState<'topups' | 'vip' | 'guests' | 'regs' | 'pins'>('topups');

  // Guest time
  const [guestTimeSelection, setGuestTimeSelection] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  // Add coins
  const [addCoinsUsername, setAddCoinsUsername] = useState('');
  const [addCoinsAmount, setAddCoinsAmount] = useState('');
  const [addCoinsLoading, setAddCoinsLoading] = useState(false);
  const [addCoinsMsg, setAddCoinsMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // New alert
  const [alertText, setAlertText] = useState<string | null>(null);
  const prevFoodRef = useRef(0);
  const prevShishaRef = useRef(0);
  const prevChatRef = useRef(0);

  // Register admin for push notifications
  useEffect(() => {
    registerAdminOneSignal();
  }, []);

  // ─── Data Listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'support-chats'), orderBy('lastMessageAt', 'desc'), limit(100)),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportChat));
        const unreadCount = data.filter(c => c.status === 'open' && c.unreadAdmin > 0).length;
        if (unreadCount > prevChatRef.current && prevChatRef.current >= 0) {
          playNotificationSound();
          showAlert('New support message!');
        }
        prevChatRef.current = unreadCount;
        setChats(data);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeChatId) { setChatMessages([]); return; }
    // Simple query — sort client-side to avoid needing composite index
    const q = query(
      collection(db, 'support-messages'),
      where('chatId', '==', activeChatId),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportMessage)).sort((a, b) => a.createdAt - b.createdAt));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    updateDoc(doc(db, 'support-chats', activeChatId), { unreadAdmin: 0 }).catch(() => {});
    return () => unsub();
  }, [activeChatId]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as FoodOrder));
        const pc = all.filter(o => o.status === 'pending').length;
        if (pc > prevFoodRef.current && prevFoodRef.current > 0) {
          playNotificationSound();
          showAlert('New food order!');
        }
        prevFoodRef.current = pc;
        setFoodOrders(all);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'shisha-orders'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShishaOrder));
        const pc = all.filter(o => o.status === 'pending').length;
        if (pc > prevShishaRef.current && prevShishaRef.current > 0) {
          playNotificationSound();
          showAlert('New shisha order!');
        }
        prevShishaRef.current = pc;
        setShishaOrders(all);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'topup-requests'), (snap) => {
      setTopUpRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as TopUpRequest)).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vip_requests'), (snap) => {
      setVipRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as VIPRequest)).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'guest-requests'), (snap) => {
      setGuestRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as GuestRequest)).sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pending-registrations'), (snap) => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingRegistration)).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, []);

  // ── PIN reset requests (player tapped "Forgot PIN" on the kiosk login) ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pin-reset-requests'), (snap) => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PinResetRequest))
        .sort((a, b) => b.createdAt - a.createdAt);
      setPinResetRequests(all);
      // Pop the toast for the newest unseen pending request
      const pending = all.filter(r => r.status === 'pending');
      const unseen = pending.find(r => !pinResetSeenIds.current.has(r.id));
      if (unseen) {
        setPinResetToast(unseen);
        playNotificationSound();
        showAlert(`Forgot PIN request from ${(unseen.username || '').toUpperCase()}`);
      }
    });
    return () => unsub();
  }, []);

  const approvePinResetRequest = async (req: PinResetRequest) => {
    if (pinResetActioning) return;
    setPinResetActioning(req.id);
    try {
      const qRef = query(collection(db, 'players'), where('username', '==', (req.username || '').toLowerCase()));
      const playerSnap = await getDocs(qRef);
      if (!playerSnap.empty) {
        await updateDoc(doc(db, 'players', playerSnap.docs[0].id), {
          pin: '',
          isLegacyUser: true,
          legacyPassword: '000000',
        });
      }
      await updateDoc(doc(db, 'pin-reset-requests', req.id), { status: 'approved', approvedAt: Date.now() });
    } catch (err) {
      console.error('PIN reset approve failed', err);
    }
    pinResetSeenIds.current.add(req.id);
    setPinResetToast(t => (t?.id === req.id ? null : t));
    setPinResetActioning(null);
  };

  const rejectPinResetRequest = async (req: PinResetRequest) => {
    if (pinResetActioning) return;
    setPinResetActioning(req.id);
    try {
      await updateDoc(doc(db, 'pin-reset-requests', req.id), { status: 'rejected', rejectedAt: Date.now() });
    } catch {}
    pinResetSeenIds.current.add(req.id);
    setPinResetToast(t => (t?.id === req.id ? null : t));
    setPinResetActioning(null);
  };

  // Admin-initiated PIN reset — staff types a username and hits Reset. No player request needed.
  const manualPinReset = async () => {
    const u = manualResetUsername.trim().toLowerCase();
    if (!u) { setManualResetMsg({ text: 'Enter a username', ok: false }); return; }
    setManualResetLoading(true);
    setManualResetMsg(null);
    try {
      const qRef = query(collection(db, 'players'), where('username', '==', u));
      const playerSnap = await getDocs(qRef);
      if (playerSnap.empty) {
        setManualResetMsg({ text: `No player named "${u}"`, ok: false });
      } else {
        await updateDoc(doc(db, 'players', playerSnap.docs[0].id), {
          pin: '',
          isLegacyUser: true,
          legacyPassword: '000000',
        });
        setManualResetMsg({ text: `PIN reset → tell ${u} to log in with temp password 000000`, ok: true });
        setManualResetUsername('');
      }
    } catch (err: any) {
      setManualResetMsg({ text: 'Failed: ' + (err?.message || 'Unknown'), ok: false });
    }
    setManualResetLoading(false);
  };

  // ─── Alert ────────────────────────────────────────────────────────────────

  const showAlert = useCallback((text: string) => {
    setAlertText(text);
    setTimeout(() => setAlertText(null), 3000);
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeChatId || chatSending) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    try {
      await addDoc(collection(db, 'support-messages'), {
        chatId: activeChatId,
        senderId: 'admin',
        senderName: 'Admin',
        senderRole: 'admin',
        text,
        createdAt: Date.now(),
      });
      const chatSnap = await getDoc(doc(db, 'support-chats', activeChatId));
      const currentUnread = chatSnap.exists() ? (chatSnap.data().unreadPlayer || 0) : 0;
      await updateDoc(doc(db, 'support-chats', activeChatId), {
        lastMessage: text,
        lastMessageAt: Date.now(),
        unreadPlayer: currentUnread + 1,
      });
    } catch (err) {
      console.error('Failed to send:', err);
    }
    setChatSending(false);
  };

  const resolveChat = async (chatId: string) => {
    await updateDoc(doc(db, 'support-chats', chatId), { status: 'resolved' });
    if (activeChatId === chatId) setActiveChatId(null);
  };

  const reopenChat = async (chatId: string) => {
    await updateDoc(doc(db, 'support-chats', chatId), { status: 'open' });
  };

  const updateOrderStatus = async (col: string, id: string, status: string) => {
    setProcessing(id);
    await updateDoc(doc(db, col, id), { status, updatedAt: Date.now() });
    setProcessing(null);
  };

  const approveTopUp = async (req: TopUpRequest) => {
    setProcessing(req.id);
    try {
      const playerSnap = await getDoc(doc(db, 'players', req.playerId));
      if (playerSnap.exists()) {
        await updateDoc(doc(db, 'players', req.playerId), { coins: (playerSnap.data().coins || 0) + req.coins });
      }
      await updateDoc(doc(db, 'topup-requests', req.id), { status: 'approved', approvedAt: Date.now() });
    } catch (err) { console.error(err); }
    setProcessing(null);
  };

  const rejectTopUp = async (id: string) => {
    setProcessing(id);
    await updateDoc(doc(db, 'topup-requests', id), { status: 'rejected', rejectedAt: Date.now() });
    setProcessing(null);
  };

  const addCoinsToPlayer = async () => {
    const username = addCoinsUsername.trim().toLowerCase();
    const amount = parseInt(addCoinsAmount);
    if (!username || !amount || amount <= 0) {
      setAddCoinsMsg({ text: 'Enter username and valid amount', ok: false });
      return;
    }
    setAddCoinsLoading(true);
    setAddCoinsMsg(null);
    try {
      const q = query(collection(db, 'players'), where('username', '==', username));
      const snap = await getDocs(q);
      if (snap.empty) {
        setAddCoinsMsg({ text: 'Player not found', ok: false });
        setAddCoinsLoading(false);
        return;
      }
      const playerDoc = snap.docs[0];
      const currentCoins = playerDoc.data().coins || 0;
      await updateDoc(doc(db, 'players', playerDoc.id), { coins: currentCoins + amount });
      setAddCoinsMsg({ text: `Added ${amount} coins to ${username.toUpperCase()}`, ok: true });
      setAddCoinsUsername('');
      setAddCoinsAmount('');
      setTimeout(() => setAddCoinsMsg(null), 4000);
    } catch (err) {
      console.error(err);
      setAddCoinsMsg({ text: 'Failed to add coins', ok: false });
    }
    setAddCoinsLoading(false);
  };

  const approveVIP = async (req: VIPRequest) => {
    setProcessing(req.id);
    try {
      const days = req.trial ? 3 : 30;
      const now = Date.now();
      const playerSnap = await getDoc(doc(db, 'players', req.playerId));
      const vip = playerSnap.exists() ? playerSnap.data().vip : null;
      let exp = now + days * 86400000;
      if (vip?.active && vip.expiresAt > now) exp = vip.expiresAt + days * 86400000;
      await updateDoc(doc(db, 'players', req.playerId), {
        vip: { active: true, expiresAt: exp, startedAt: now, tier: 'basic', trialUsed: req.trial || vip?.trialUsed || false },
      });
      await updateDoc(doc(db, 'vip_requests', req.id), { status: 'approved', approvedAt: now });
    } catch (err) { console.error(err); }
    setProcessing(null);
  };

  const rejectVIP = async (id: string) => {
    setProcessing(id);
    await updateDoc(doc(db, 'vip_requests', id), { status: 'rejected', rejectedAt: Date.now() });
    setProcessing(null);
  };

  const approveGuest = async (id: string, minutes: number) => {
    setProcessing(id);
    await updateDoc(doc(db, 'guest-requests', id), { status: 'approved', approvedMinutes: minutes, approvedAt: Date.now() });
    setProcessing(null);
  };

  const rejectGuest = async (id: string) => {
    setProcessing(id);
    await updateDoc(doc(db, 'guest-requests', id), { status: 'rejected', rejectedAt: Date.now() });
    setProcessing(null);
  };

  const approveReg = async (reg: PendingRegistration) => {
    setProcessing(reg.id);
    await updateDoc(doc(db, 'pending-registrations', reg.id), { status: 'approved' });
    setProcessing(null);
  };

  const rejectReg = async (id: string) => {
    setProcessing(id);
    await updateDoc(doc(db, 'pending-registrations', id), { status: 'rejected' });
    setProcessing(null);
  };

  // ─── Counts ───────────────────────────────────────────────────────────────

  const unreadChats = chats.filter(c => c.status === 'open' && c.unreadAdmin > 0).length;
  const activeFood = foodOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
  const activeShisha = shishaOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status));
  const pendingTopUps = topUpRequests.filter(r => r.status === 'pending').length;
  const pendingVIP = vipRequests.filter(r => r.status === 'pending').length;
  const pendingGuests = guestRequests.filter(r => r.status === 'pending').length;
  const pendingRegs = registrations.filter(r => r.status === 'pending').length;
  const pendingPins = pinResetRequests.filter(r => r.status === 'pending').length;
  const totalOrders = activeFood.length + activeShisha.length;
  const totalRequests = pendingTopUps + pendingVIP + pendingGuests + pendingRegs + pendingPins;

  // Profit calculations
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const todayFoodRevenue = foodOrders.filter(o => o.createdAt >= todayTs && o.status !== 'cancelled').reduce((s, o) => s + (o.totalCoins || 0), 0);
  const todayShishaRevenue = shishaOrders.filter(o => o.createdAt >= todayTs && o.status !== 'cancelled').reduce((s, o) => s + (o.totalCoins || 0), 0);
  const todayTopUps = topUpRequests.filter(r => r.createdAt >= todayTs && r.status === 'approved');
  const todayTopUpJOD = todayTopUps.reduce((s, r) => s + (r.priceJOD || 0), 0);
  const todayTopUpCoins = todayTopUps.reduce((s, r) => s + (r.coins || 0), 0);

  // ─── Active Chat View (Full screen on mobile) ────────────────────────────

  if (activeChatId) {
    const activeChat = chats.find(c => c.id === activeChatId);
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col" style={{ height: '100dvh' }}>
        {/* Header — pushed below iPhone status bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0"
          style={{ background: 'rgba(10,10,10,0.98)', paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}>
          <button onClick={() => setActiveChatId(null)} className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 active:bg-white/10 transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${getNinjaColor(activeChat?.playerNinjaType)}15`, border: `1px solid ${getNinjaColor(activeChat?.playerNinjaType)}30` }}>
            <User size={16} style={{ color: getNinjaColor(activeChat?.playerNinjaType) }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-ninja text-sm text-white truncate">{activeChat?.playerName}</p>
            <div className="flex items-center gap-2">
              {activeChat?.pcName && <span className="font-body text-[10px] text-gray-500">{activeChat.pcName}</span>}
              <span className={`font-body text-[10px] ${activeChat?.status === 'open' ? 'text-ninja-green' : 'text-gray-600'}`}>
                {activeChat?.status === 'open' ? 'Open' : 'Resolved'}
              </span>
            </div>
          </div>
          {activeChat?.status === 'open' ? (
            <button onClick={() => resolveChat(activeChatId)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-ninja bg-green-500/10 text-green-400 border border-green-500/20 active:bg-green-500/30 transition-all">
              RESOLVE
            </button>
          ) : (
            <button onClick={() => reopenChat(activeChatId)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-ninja bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 active:bg-yellow-500/30 transition-all">
              REOPEN
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {chatMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="font-body text-gray-600 text-sm">No messages yet</p>
            </div>
          )}
          {chatMessages.map((msg) => {
            const isAdmin = msg.senderRole === 'admin';
            return (
              <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  {!isAdmin && <p className="text-[9px] font-body text-gray-500 ml-1 mb-0.5">{msg.senderName}</p>}
                  <div className={`px-3 py-2 rounded-2xl ${
                    isAdmin
                      ? 'bg-blue-500/15 border border-blue-500/15 rounded-br-md'
                      : 'bg-white/5 border border-white/10 rounded-bl-md'
                  }`}>
                    <p className="font-body text-[13px] text-white/90 break-words">{msg.text}</p>
                  </div>
                  <p className={`text-[9px] font-body text-gray-600 mt-0.5 ${isAdmin ? 'text-right mr-1' : 'ml-1'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-white/5 shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              placeholder="Reply..."
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white font-body placeholder-gray-600 focus:border-blue-500/30 outline-none transition-all"
              autoComplete="off"
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || chatSending}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500/20 border border-blue-500/20 text-blue-400 active:bg-blue-500/40 transition-all disabled:opacity-30"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Layout (Mobile-first) ──────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col" style={{ height: '100dvh' }}>
      {/* Top header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0"
        style={{ background: 'rgba(10,10,10,0.98)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-ninja-green/10 flex items-center justify-center border border-ninja-green/20">
            <Headphones size={16} className="text-ninja-green" />
          </div>
          <div>
            <p className="font-ninja text-sm text-ninja-green">NINJA OPS</p>
            <p className="font-body text-[9px] text-gray-600">{admin?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { window.location.href = '/ghanimadmin'; }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-ninja-green active:bg-ninja-green/10 transition-all"
            title="Admin Panel">
            <Shield size={16} />
          </button>
          <button onClick={async () => { await signOut(auth); window.location.href = '/kiosk'; }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 active:bg-red-500/10 transition-all">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── CHAT TAB ──── */}
        {mainTab === 'chat' && (
          <div>
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <Headphones size={40} className="text-gray-700 mb-3" />
                <p className="font-ninja text-gray-600">No conversations</p>
                <p className="font-body text-xs text-gray-700 mt-1">Support chats will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {chats.map((chat) => (
                  <button key={chat.id} onClick={() => setActiveChatId(chat.id)}
                    className="w-full px-4 py-3.5 text-left flex items-start gap-3 active:bg-white/[0.03] transition-all">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${getNinjaColor(chat.playerNinjaType)}12`, border: `1px solid ${getNinjaColor(chat.playerNinjaType)}25` }}>
                      <User size={16} style={{ color: getNinjaColor(chat.playerNinjaType) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-ninja text-sm text-white truncate">{chat.playerName}</p>
                        <span className="text-[10px] font-body text-gray-600 shrink-0 ml-2">{timeAgo(chat.lastMessageAt)}</span>
                      </div>
                      <p className="font-body text-xs text-gray-500 truncate mt-0.5">{chat.lastMessage || 'New conversation'}</p>
                      {chat.status === 'resolved' && (
                        <span className="text-[9px] font-body text-green-600 bg-green-500/10 px-1.5 rounded mt-1 inline-block">resolved</span>
                      )}
                    </div>
                    {chat.unreadAdmin > 0 && (
                      <span className="w-5 h-5 rounded-full bg-ninja-green flex items-center justify-center text-[9px] text-black font-bold shrink-0 mt-2">
                        {chat.unreadAdmin}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ORDERS TAB ──── */}
        {mainTab === 'orders' && (
          <div>
            {/* Active / History toggle */}
            <div className="flex gap-2 px-4 pt-3 pb-2 sticky top-0 z-10" style={{ background: '#0a0a0a' }}>
              <button onClick={() => setOrderFilter('active')}
                className={`flex-1 py-2 rounded-xl text-xs font-ninja transition-all ${
                  orderFilter === 'active' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'bg-white/5 text-gray-500 border border-white/5'
                }`}>
                ACTIVE {totalOrders > 0 && `(${totalOrders})`}
              </button>
              <button onClick={() => setOrderFilter('history')}
                className={`flex-1 py-2 rounded-xl text-xs font-ninja transition-all ${
                  orderFilter === 'history' ? 'bg-gray-500/15 text-gray-300 border border-gray-500/20' : 'bg-white/5 text-gray-500 border border-white/5'
                }`}>
                HISTORY
              </button>
            </div>

            {orderFilter === 'active' ? (
              <div className="px-4 pb-4 space-y-3">
                {activeFood.length === 0 && activeShisha.length === 0 && (
                  <div className="text-center py-12">
                    <ShoppingBag size={32} className="mx-auto text-gray-700 mb-2" />
                    <p className="font-body text-gray-600 text-sm">No active orders</p>
                  </div>
                )}
                {/* Food orders */}
                {activeFood.map((order) => (
                  <OrderCard key={order.id} type="food"
                    name={order.playerName} time={order.createdAt} coins={order.totalCoins}
                    detail={order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || ''}
                    status={order.status} processing={processing === order.id}
                    onNext={() => {
                      const next = order.status === 'pending' ? 'preparing' : order.status === 'preparing' ? 'ready' : 'delivered';
                      updateOrderStatus('orders', order.id, next);
                    }}
                    onCancel={order.status === 'pending' ? () => updateOrderStatus('orders', order.id, 'cancelled') : undefined}
                  />
                ))}
                {/* Shisha orders */}
                {activeShisha.map((order) => (
                  <OrderCard key={order.id} type="shisha"
                    name={order.playerName} time={order.createdAt} coins={order.totalCoins}
                    detail={`${order.quantity}x ${order.flavor}`}
                    status={order.status} processing={processing === order.id}
                    onNext={() => {
                      const next = order.status === 'pending' ? 'preparing' : order.status === 'preparing' ? 'ready' : 'delivered';
                      updateOrderStatus('shisha-orders', order.id, next);
                    }}
                    onCancel={order.status === 'pending' ? () => updateOrderStatus('shisha-orders', order.id, 'cancelled') : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-2">
                {[...foodOrders.filter(o => ['delivered', 'cancelled'].includes(o.status)).map(o => ({ ...o, _type: 'food' as const })),
                  ...shishaOrders.filter(o => ['delivered', 'cancelled'].includes(o.status)).map(o => ({ ...o, _type: 'shisha' as const, items: [{ name: o.flavor, quantity: o.quantity, price: 0, menuItemId: '' }] })),
                ].sort((a, b) => b.createdAt - a.createdAt).map((order) => (
                  <div key={order.id} className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {order._type === 'food' ? <ShoppingBag size={12} className="text-orange-400/50" /> : <Wind size={12} className="text-purple-400/50" />}
                        <span className="font-ninja text-xs text-gray-400">{order.playerName}</span>
                      </div>
                      <span className="text-[9px] font-body text-gray-600">{formatDate(order.createdAt)}</span>
                    </div>
                    <p className="font-body text-[11px] text-gray-500 mt-1">
                      {order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-[9px] font-ninja ${order.status === 'delivered' ? 'text-green-600' : 'text-red-500'}`}>
                        {order.status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-yellow-500/60 flex items-center gap-0.5"><Coins size={9} />{order.totalCoins}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── REQUESTS TAB ──── */}
        {mainTab === 'requests' && (
          <div>
            {/* Sub-filter pills */}
            <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto sticky top-0 z-10" style={{ background: '#0a0a0a' }}>
              {([
                { id: 'topups' as const, label: 'Top Ups', count: pendingTopUps, color: 'yellow' },
                { id: 'vip' as const, label: 'VIP', count: pendingVIP, color: 'amber' },
                { id: 'guests' as const, label: 'Guests', count: pendingGuests, color: 'blue' },
                { id: 'regs' as const, label: 'Register', count: pendingRegs, color: 'green' },
                { id: 'pins' as const, label: 'Reset PIN', count: pendingPins, color: 'red' },
              ]).map((f) => (
                <button key={f.id} onClick={() => setRequestFilter(f.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-ninja transition-all flex items-center gap-1.5 ${
                    requestFilter === f.id
                      ? `bg-${f.color}-500/15 text-${f.color}-400 border border-${f.color}-500/20`
                      : 'bg-white/5 text-gray-500 border border-white/5'
                  }`}>
                  {f.label}
                  {f.count > 0 && <span className="w-4 h-4 rounded-full bg-red-500 text-[8px] text-white flex items-center justify-center">{f.count}</span>}
                </button>
              ))}
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* ADD COINS — always visible */}
              <div className="rounded-xl border border-yellow-500/15 p-3.5" style={{ background: 'rgba(255,215,0,0.03)' }}>
                <p className="font-ninja text-xs text-yellow-400 mb-2.5 flex items-center gap-1.5">
                  <Coins size={13} /> ADD COINS TO PLAYER
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addCoinsUsername}
                    onChange={(e) => setAddCoinsUsername(e.target.value)}
                    placeholder="Username"
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-body placeholder-gray-600 focus:border-yellow-500/30 outline-none"
                  />
                  <input
                    type="number"
                    value={addCoinsAmount}
                    onChange={(e) => setAddCoinsAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-24 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-body placeholder-gray-600 focus:border-yellow-500/30 outline-none"
                  />
                  <button
                    onClick={addCoinsToPlayer}
                    disabled={addCoinsLoading || !addCoinsUsername.trim() || !addCoinsAmount}
                    className="px-4 py-2 rounded-lg font-ninja text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 active:bg-yellow-500/30 transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {addCoinsLoading ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />}
                    ADD
                  </button>
                </div>
                {addCoinsMsg && (
                  <p className={`font-body text-xs mt-2 ${addCoinsMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {addCoinsMsg.text}
                  </p>
                )}
              </div>

              {/* TOP-UPS */}
              {requestFilter === 'topups' && (
                topUpRequests.length === 0 ? (
                  <EmptyState icon={<Coins size={32} />} text="No top-up requests" />
                ) : topUpRequests.map((req) => (
                  <div key={req.id} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-ninja text-sm text-white">{req.playerName}</p>
                      <span className="text-[10px] font-body text-gray-600">{timeAgo(req.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-body text-yellow-400 flex items-center gap-1"><Coins size={11} /> {req.coins}</span>
                      <span className="text-xs font-body text-green-400">{req.priceJOD} JOD</span>
                    </div>
                    <StatusBadge status={req.status} />
                    {req.status === 'pending' && (
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => approveTopUp(req)} disabled={processing === req.id}
                          className="flex-1 py-2 rounded-xl text-xs font-ninja bg-green-500/10 text-green-400 border border-green-500/20 active:bg-green-500/30 transition-all flex items-center justify-center gap-1">
                          {processing === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} APPROVE
                        </button>
                        <button onClick={() => rejectTopUp(req.id)} disabled={processing === req.id}
                          className="py-2 px-4 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all">
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* VIP */}
              {requestFilter === 'vip' && (
                vipRequests.length === 0 ? (
                  <EmptyState icon={<Crown size={32} />} text="No VIP requests" />
                ) : vipRequests.map((req) => (
                  <div key={req.id} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-ninja text-sm text-white">{req.playerName}</p>
                      <span className="text-[10px] font-body text-gray-600">{timeAgo(req.createdAt)}</span>
                    </div>
                    <p className="text-xs font-body text-amber-400 mb-2">{req.trial ? 'Trial (3 days)' : `${req.price} coins`}</p>
                    <StatusBadge status={req.status} />
                    {req.status === 'pending' && (
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => approveVIP(req)} disabled={processing === req.id}
                          className="flex-1 py-2 rounded-xl text-xs font-ninja bg-amber-500/10 text-amber-400 border border-amber-500/20 active:bg-amber-500/30 transition-all flex items-center justify-center gap-1">
                          {processing === req.id ? <Loader2 size={12} className="animate-spin" /> : <Crown size={12} />} APPROVE
                        </button>
                        <button onClick={() => rejectVIP(req.id)} disabled={processing === req.id}
                          className="py-2 px-4 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all">
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* GUESTS */}
              {requestFilter === 'guests' && (
                guestRequests.length === 0 ? (
                  <EmptyState icon={<User size={32} />} text="No guest requests" />
                ) : guestRequests.map((req) => (
                  <div key={req.id} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-ninja text-sm text-white flex items-center gap-1"><Monitor size={12} /> {req.pcName}</p>
                      <span className="text-[10px] font-body text-gray-600">{timeAgo(req.timestamp)}</span>
                    </div>
                    <StatusBadge status={req.status} extra={req.status === 'approved' && req.approvedMinutes ? `${req.approvedMinutes}m` : undefined} />
                    {req.status === 'pending' && (
                      <div className="mt-2.5">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {GUEST_TIME_OPTIONS.map((m) => (
                            <button key={m} onClick={() => setGuestTimeSelection(prev => ({ ...prev, [req.id]: m }))}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-ninja transition-all ${
                                (guestTimeSelection[req.id] || 30) === m
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-white/5 text-gray-500 border border-white/10 active:bg-white/10'
                              }`}>
                              {m}m
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => approveGuest(req.id, guestTimeSelection[req.id] || 30)}
                            disabled={processing === req.id}
                            className="flex-1 py-2 rounded-xl text-xs font-ninja bg-blue-500/10 text-blue-400 border border-blue-500/20 active:bg-blue-500/30 transition-all flex items-center justify-center gap-1">
                            {processing === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} APPROVE
                          </button>
                          <button onClick={() => rejectGuest(req.id)} disabled={processing === req.id}
                            className="py-2 px-4 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* REGISTRATIONS */}
              {requestFilter === 'regs' && (
                registrations.length === 0 ? (
                  <EmptyState icon={<UserPlus size={32} />} text="No registrations" />
                ) : registrations.map((reg) => (
                  <div key={reg.id} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-ninja text-sm text-white">{reg.username}</p>
                      <span className="text-[10px] font-body text-gray-600">{timeAgo(reg.createdAt)}</span>
                    </div>
                    <p className="font-body text-xs text-gray-400">{reg.firstName} {reg.lastName} - {reg.phone}</p>
                    <p className="font-body text-[10px] text-gray-500 capitalize mt-0.5">{reg.ninjaType}</p>
                    {reg.approvalCode && (
                      <p className="font-ninja text-xl text-ninja-green tracking-widest mt-1.5 mb-1"
                        style={{ textShadow: '0 0 10px rgba(57,255,20,0.3)' }}>
                        {reg.approvalCode}
                      </p>
                    )}
                    <StatusBadge status={reg.status} />
                    {reg.status === 'pending' && (
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => approveReg(reg)} disabled={processing === reg.id}
                          className="flex-1 py-2 rounded-xl text-xs font-ninja bg-green-500/10 text-green-400 border border-green-500/20 active:bg-green-500/30 transition-all flex items-center justify-center gap-1">
                          {processing === reg.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} APPROVE
                        </button>
                        <button onClick={() => rejectReg(reg.id)} disabled={processing === reg.id}
                          className="py-2 px-4 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all">
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* PIN RESET */}
              {requestFilter === 'pins' && (
                <>
                  {/* Manual reset card — admin resets any player's PIN directly */}
                  <div className="rounded-xl border border-red-500/15 p-3.5 mb-3" style={{ background: 'rgba(239,68,68,0.03)' }}>
                    <p className="font-ninja text-xs text-red-400 mb-2.5 flex items-center gap-1.5">
                      <KeyRound size={14} /> MANUAL PIN RESET
                    </p>
                    <p className="font-body text-[10px] text-gray-500 mb-2">
                      Type a username to reset their PIN — player logs in with temp password <span className="font-mono text-gray-300">000000</span> and is forced to pick a new 6-digit PIN.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualResetUsername}
                        onChange={(e) => setManualResetUsername(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && manualPinReset()}
                        placeholder="username"
                        className="flex-1 bg-black/30 border border-red-500/15 rounded-lg px-3 py-2 text-sm text-white font-body focus:border-red-500/40 outline-none"
                      />
                      <button
                        onClick={manualPinReset}
                        disabled={manualResetLoading || !manualResetUsername.trim()}
                        className="px-4 py-2 rounded-lg text-xs font-ninja bg-red-500/15 text-red-400 border border-red-500/30 active:bg-red-500/30 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {manualResetLoading ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                        RESET
                      </button>
                    </div>
                    {manualResetMsg && (
                      <p className={`mt-2 font-body text-[11px] ${manualResetMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{manualResetMsg.text}</p>
                    )}
                  </div>

                  {/* Incoming reset-pin requests from players */}
                  {pinResetRequests.length === 0 ? (
                    <EmptyState icon={<KeyRound size={32} />} text="No reset-PIN requests" />
                  ) : pinResetRequests.map((req) => (
                    <div key={req.id} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-ninja text-sm text-white">{(req.username || '').toUpperCase()}</p>
                        <span className="text-[10px] font-body text-gray-600">{timeAgo(req.createdAt)}</span>
                      </div>
                      {req.pcName && <p className="font-body text-[11px] text-gray-500">From PC: <span className="text-gray-300">{req.pcName}</span></p>}
                      <StatusBadge status={req.status} />
                      {req.status === 'pending' && (
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={() => approvePinResetRequest(req)} disabled={pinResetActioning === req.id}
                            className="flex-1 py-2 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all flex items-center justify-center gap-1">
                            {pinResetActioning === req.id ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} RESET PIN
                          </button>
                          <button onClick={() => rejectPinResetRequest(req)} disabled={pinResetActioning === req.id}
                            className="py-2 px-4 rounded-xl text-xs font-ninja bg-white/5 text-gray-400 border border-white/10 active:bg-white/10 transition-all">
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── PIN-RESET TOAST (fires on new player request) ─── */}
        <AnimatePresence>
          {pinResetToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] w-[92vw] max-w-[420px] rounded-2xl p-4 shadow-2xl"
              style={{ background: 'linear-gradient(180deg, #120509, #0a0306)', border: '1.5px solid rgba(239,68,68,0.45)', boxShadow: '0 0 30px rgba(239,68,68,0.2)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center"><KeyRound size={16} className="text-red-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-ninja text-sm text-white">FORGOT PIN</p>
                  <p className="font-body text-[11px] text-gray-400 truncate">{(pinResetToast.username || '').toUpperCase()}{pinResetToast.pcName ? ` · ${pinResetToast.pcName}` : ''}</p>
                </div>
                <button onClick={() => { if (pinResetToast) pinResetSeenIds.current.add(pinResetToast.id); setPinResetToast(null); }} className="w-7 h-7 rounded-full bg-white/5 text-gray-400 flex items-center justify-center"><X size={14} /></button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => pinResetToast && rejectPinResetRequest(pinResetToast)}
                  disabled={!!pinResetActioning}
                  className="flex-1 py-2.5 rounded-xl text-xs font-ninja bg-white/5 text-gray-300 border border-white/10 active:bg-white/10"
                >Dismiss</button>
                <button
                  onClick={() => pinResetToast && approvePinResetRequest(pinResetToast)}
                  disabled={!!pinResetActioning}
                  className="flex-[2] py-2.5 rounded-xl text-xs font-ninja bg-red-500/20 text-red-400 border border-red-500/40 active:bg-red-500/30 flex items-center justify-center gap-1.5"
                >
                  {pinResetActioning ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} RESET PIN
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── PROFIT TAB ──── */}
        {mainTab === 'profit' && (
          <div className="px-4 py-3 space-y-4">
            {/* Today's summary cards */}
            <div>
              <p className="font-ninja text-xs text-gray-500 mb-2">TODAY&apos;S SUMMARY</p>
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Food Revenue" value={`${todayFoodRevenue}`} sub="coins" icon={<ShoppingBag size={16} />} color="orange" />
                <StatCard label="Shisha Revenue" value={`${todayShishaRevenue}`} sub="coins" icon={<Wind size={16} />} color="purple" />
                <StatCard label="Top-Up Income" value={`${todayTopUpJOD}`} sub="JOD" icon={<DollarSign size={16} />} color="green" />
                <StatCard label="Coins Sold" value={`${todayTopUpCoins}`} sub="coins" icon={<Coins size={16} />} color="yellow" />
              </div>
            </div>

            {/* Order counts today */}
            <div>
              <p className="font-ninja text-xs text-gray-500 mb-2">TODAY&apos;S ORDERS</p>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Food" value={foodOrders.filter(o => o.createdAt >= todayTs).length} color="text-orange-400" />
                <MiniStat label="Shisha" value={shishaOrders.filter(o => o.createdAt >= todayTs).length} color="text-purple-400" />
                <MiniStat label="Top Ups" value={topUpRequests.filter(r => r.createdAt >= todayTs).length} color="text-yellow-400" />
              </div>
            </div>

            {/* Top-Up History */}
            <div>
              <p className="font-ninja text-xs text-gray-500 mb-2">TOP-UP HISTORY (RECENT)</p>
              <div className="space-y-1.5">
                {topUpRequests.filter(r => r.status === 'approved').slice(0, 20).map((req) => (
                  <div key={req.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <div>
                      <p className="font-ninja text-xs text-white">{req.playerName}</p>
                      <p className="font-body text-[9px] text-gray-600">{formatDate(req.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-ninja text-xs text-green-400">{req.priceJOD} JOD</p>
                      <p className="font-body text-[9px] text-yellow-500">{req.coins} coins</p>
                    </div>
                  </div>
                ))}
                {topUpRequests.filter(r => r.status === 'approved').length === 0 && (
                  <p className="font-body text-xs text-gray-600 text-center py-4">No approved top-ups yet</p>
                )}
              </div>
            </div>

            {/* Revenue by completed orders */}
            <div>
              <p className="font-ninja text-xs text-gray-500 mb-2">ORDER REVENUE (ALL TIME)</p>
              <div className="space-y-1.5">
                {(() => {
                  const allCompleted = [
                    ...foodOrders.filter(o => o.status === 'delivered').map(o => ({ name: o.playerName, coins: o.totalCoins, time: o.createdAt, type: 'Food' })),
                    ...shishaOrders.filter(o => o.status === 'delivered').map(o => ({ name: o.playerName, coins: o.totalCoins, time: o.createdAt, type: 'Shisha' })),
                  ].sort((a, b) => b.time - a.time).slice(0, 20);

                  if (allCompleted.length === 0) return <p className="font-body text-xs text-gray-600 text-center py-4">No delivered orders yet</p>;

                  return allCompleted.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-2">
                        {item.type === 'Food' ? <ShoppingBag size={11} className="text-orange-400/50" /> : <Wind size={11} className="text-purple-400/50" />}
                        <div>
                          <p className="font-ninja text-xs text-white">{item.name}</p>
                          <p className="font-body text-[9px] text-gray-600">{formatDate(item.time)}</p>
                        </div>
                      </div>
                      <span className="font-ninja text-xs text-yellow-400 flex items-center gap-1"><Coins size={10} />{item.coins}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tab Bar (Mobile-first) */}
      <div className="shrink-0 border-t border-white/5 flex items-center justify-around"
        style={{
          background: 'rgba(10,10,10,0.98)',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          backdropFilter: 'blur(20px)',
        }}>
        {([
          { id: 'chat' as const, label: 'Chat', icon: <Headphones size={20} />, count: unreadChats },
          { id: 'orders' as const, label: 'Orders', icon: <ShoppingBag size={20} />, count: totalOrders },
          { id: 'requests' as const, label: 'Requests', icon: <Bell size={20} />, count: totalRequests },
          { id: 'profit' as const, label: 'Profit', icon: <TrendingUp size={20} />, count: 0 },
        ]).map((tab) => (
          <button key={tab.id} onClick={() => setMainTab(tab.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2.5 px-4 transition-all ${
              mainTab === tab.id ? 'text-ninja-green' : 'text-gray-600'
            }`}>
            <div className="relative">
              {tab.icon}
              {tab.count > 0 && (
                <span className="absolute -top-1.5 -right-2 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[8px] text-white font-bold">
                  {tab.count > 9 ? '9+' : tab.count}
                </span>
              )}
            </div>
            <span className="font-body text-[10px]">{tab.label}</span>
            {mainTab === tab.id && (
              <motion.div layoutId="adminchat-bottom-tab"
                className="absolute top-0 left-2 right-2 h-[2px] rounded-full bg-ninja-green" />
            )}
          </button>
        ))}
      </div>

      {/* Alert toast */}
      <AnimatePresence>
        {alertText && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-4 right-4 z-[100] px-4 py-3 rounded-xl bg-ninja-green/10 border border-ninja-green/20 flex items-center gap-2"
            style={{ boxShadow: '0 0 20px rgba(57,255,20,0.15)' }}>
            <Bell size={16} className="text-ninja-green shrink-0" />
            <span className="font-ninja text-sm text-ninja-green">{alertText}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function OrderCard({ type, name, time, coins, detail, status, processing, onNext, onCancel }: {
  type: 'food' | 'shisha';
  name: string; time: number; coins: number; detail: string; status: string;
  processing: boolean;
  onNext: () => void; onCancel?: () => void;
}) {
  const isFood = type === 'food';
  const statusLabels: Record<string, { label: string; color: string; nextLabel: string; nextIcon: React.ReactNode }> = {
    pending: { label: 'PENDING', color: 'text-yellow-400', nextLabel: 'PREPARE', nextIcon: <ChefHat size={12} /> },
    preparing: { label: 'PREPARING', color: 'text-orange-400', nextLabel: 'READY', nextIcon: <CheckCircle2 size={12} /> },
    ready: { label: 'READY', color: 'text-green-400', nextLabel: 'DELIVERED', nextIcon: <Package size={12} /> },
  };
  const s = statusLabels[status];

  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {isFood ? <ShoppingBag size={14} className="text-orange-400" /> : <Wind size={14} className="text-purple-400" />}
          <p className="font-ninja text-sm text-white">{name}</p>
        </div>
        <span className="text-[10px] font-body text-gray-600 shrink-0">{timeAgo(time)}</span>
      </div>
      <p className="font-body text-xs text-gray-400 mb-2 ml-6">{detail}</p>
      <div className="flex items-center justify-between ml-6">
        <span className={`text-[11px] font-ninja ${s?.color}`}>{s?.label}</span>
        <span className="text-xs text-yellow-400/70 flex items-center gap-1"><Coins size={10} />{coins}</span>
      </div>
      <div className="flex gap-2 mt-2.5 ml-6">
        <button onClick={onNext} disabled={processing}
          className={`flex-1 py-2 rounded-xl text-xs font-ninja transition-all flex items-center justify-center gap-1.5 active:scale-[0.97] ${
            status === 'pending' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
            status === 'preparing' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          }`}>
          {processing ? <Loader2 size={12} className="animate-spin" /> : s?.nextIcon} {s?.nextLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={processing}
            className="py-2 px-4 rounded-xl text-xs font-ninja bg-red-500/10 text-red-400 border border-red-500/20 active:bg-red-500/30 transition-all">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, extra }: { status: string; extra?: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400',
    approved: 'bg-green-500/10 text-green-400',
    rejected: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-ninja px-2 py-0.5 rounded ${colors[status] || 'bg-gray-500/10 text-gray-400'}`}>
      {status.toUpperCase()}{extra ? ` (${extra})` : ''}
    </span>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto text-gray-700 mb-2 flex justify-center">{icon}</div>
      <p className="font-body text-gray-600 text-sm">{text}</p>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl p-3.5 bg-${color}-500/5 border border-${color}-500/10`}>
      <div className={`text-${color}-400 mb-1.5`}>{icon}</div>
      <p className="font-ninja text-xl text-white">{value} <span className="text-xs text-gray-500 font-body">{sub}</span></p>
      <p className="font-body text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-3 bg-white/[0.02] border border-white/5 text-center">
      <p className={`font-ninja text-lg ${color}`}>{value}</p>
      <p className="font-body text-[9px] text-gray-500">{label}</p>
    </div>
  );
}

// Export the notify helper so other components can call it
export { notifyAdminAPI };
