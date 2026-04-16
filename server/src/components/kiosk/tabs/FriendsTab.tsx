'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, addDoc, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, onSnapshot, increment
} from 'firebase/firestore';
import {
  Users, UserPlus, Search, Send, Coins, Swords, Clock,
  Check, X, Gamepad2, User, ChevronRight, Loader2,
  MessageSquare, AlertTriangle, CheckCircle2, Circle,
  Gift, Trophy, Timer, Package, Phone, PhoneCall,
  Hash, Plus, Crown, Settings
} from 'lucide-react';
import Image from 'next/image';
import { NinjaAvatar } from '@/components/NinjaAvatar';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { trackDailyTask } from '@/lib/daily-tasks';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';

interface Props {
  player: any;
}

type FriendsView = 'friends' | 'messages' | 'groups' | 'requests' | 'add';

interface FriendData {
  uid: string;
  username: string;
  ninjaType: string;
  activeTitle: string;
  coins: number;
  stats: any;
  onlineStatus?: {
    isOnline: boolean;
    currentActivity: string;
    lastSeen: number;
  };
  character?: any;
  xp?: number;
  totalPlaytime?: number;
  profilePhoto?: string;
}

interface GroupChat {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberNames: Record<string, string>;
  createdAt: number;
}

interface GiftToast {
  id: string;
  senderName: string;
  timestamp: number;
}

const NAV_BUTTONS: { id: FriendsView; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'friends',  label: 'FRIENDS',  icon: <Users size={18} />,         color: '#39FF14' },
  { id: 'messages', label: 'MESSAGES', icon: <MessageSquare size={18} />, color: '#00BFFF' },
  { id: 'groups',   label: 'GROUPS',   icon: <Hash size={18} />,          color: '#A855F7' },
];

export function FriendsTab({ player }: Props) {
  const [view, setView] = useState<FriendsView>('friends');
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [recentMessages, setRecentMessages] = useState<{ friendId: string; friendName: string; lastMessage: string; time: number }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendData | null>(null);
  const [friendProfileData, setFriendProfileData] = useState<any>(null);
  const [friendProfileLoading, setFriendProfileLoading] = useState(false);
  const [showGiftMessage, setShowGiftMessage] = useState(false);
  const [sendCoinsTo, setSendCoinsTo] = useState<FriendData | null>(null);
  const [actionFriend, setActionFriend] = useState<FriendData | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestLoading, setRequestLoading] = useState<string | null>(null);
  const [giftToasts, setGiftToasts] = useState<GiftToast[]>([]);
  const prevInventoryRef = useRef<any[]|null>(null);
  const [friendFilter, setFriendFilter] = useState('');

  // Create group state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Load friends
  useEffect(() => {
    const friendIds: string[] = player.friends || [];
    if (friendIds.length === 0) { setFriends([]); setLoading(false); return; }
    const unsubs = friendIds.map(fid =>
      onSnapshot(doc(db, 'players', fid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFriends(prev => {
            const idx = prev.findIndex(f => f.uid === fid);
            const fd: FriendData = {
              uid: fid, username: data.username, ninjaType: data.ninjaType || 'neon',
              activeTitle: data.activeTitle || 'Newcomer', coins: data.coins || 0,
              stats: data.stats || {}, onlineStatus: data.onlineStatus, character: data.character,
              profilePhoto: data.profilePhoto || undefined,
            };
            if (idx >= 0) { const u = [...prev]; u[idx] = fd; return u; }
            return [...prev, fd];
          });
        }
      })
    );
    setLoading(false);
    return () => unsubs.forEach(u => u());
  }, [player.friends]);

  // Load friend requests
  useEffect(() => {
    const q = query(collection(db, 'friend-requests'), where('to', '==', player.uid), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, async (snap) => {
      const reqs = [];
      for (const d of snap.docs) {
        const data = d.data();
        const fromSnap = await getDoc(doc(db, 'players', data.from));
        if (fromSnap.exists()) {
          reqs.push({ id: d.id, ...data, fromPlayer: { uid: data.from, ...fromSnap.data() } });
        }
      }
      setRequests(reqs);
    });
    return () => unsub();
  }, [player.uid]);

  // Load group chats
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(collection(db, 'group-chats'), where('members', 'array-contains', player.uid));
    const unsub = onSnapshot(q, (snap) => {
      setGroupChats(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupChat)));
    });
    return () => unsub();
  }, [player?.uid]);

  // Load recent private messages for the messages tab
  useEffect(() => {
    const friendIds: string[] = player.friends || [];
    if (friendIds.length === 0) return;
    const unsubs = friendIds.map(fid => {
      const channelId = [player.uid, fid].sort().join('_');
      const q = query(collection(db, 'messages'), where('channelId', '==', channelId));
      return onSnapshot(q, (snap) => {
        if (snap.docs.length === 0) return;
        const msgs = snap.docs.map(d => d.data());
        msgs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const latest = msgs[0];
        if (latest) {
          setRecentMessages(prev => {
            const idx = prev.findIndex(m => m.friendId === fid);
            const entry = {
              friendId: fid,
              friendName: latest.senderId === player.uid ? '' : latest.senderName,
              lastMessage: latest.type === 'image' ? '📷 Image' : latest.type === 'emoji' ? latest.text : (latest.text || '').slice(0, 50),
              time: latest.createdAt,
            };
            if (idx >= 0) { const u = [...prev]; u[idx] = entry; return u; }
            return [...prev, entry];
          });
        }
      });
    });
    return () => unsubs.forEach(u => u());
  }, [player.friends, player.uid]);

  // Gift received notifications
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'players', player.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const currentInventory: any[] = data.inventory || [];
      if (prevInventoryRef.current !== null) {
        const prevIds = new Set(prevInventoryRef.current.map((item: any) => item.id));
        const newGifts = currentInventory.filter((item: any) => item.sentBy && !prevIds.has(item.id));
        newGifts.forEach((gift: any) => {
          const toastId = `gift-${gift.id}-${Date.now()}`;
          setGiftToasts(prev => [...prev, { id: toastId, senderName: gift.sentBy, timestamp: Date.now() }]);
          setTimeout(() => setGiftToasts(prev => prev.filter(t => t.id !== toastId)), 5000);
        });
      }
      prevInventoryRef.current = currentInventory;
    });
    return () => unsub();
  }, [player.uid]);

  const openFriendProfile = useCallback(async (friend: FriendData) => {
    setSelectedFriend(friend);
    setFriendProfileLoading(true);
    setFriendProfileData(null);
    setShowGiftMessage(false);
    try {
      const snap = await getDoc(doc(db, 'players', friend.uid));
      if (snap.exists()) setFriendProfileData(snap.data());
    } catch (err) { console.error('Failed to fetch friend profile', err); }
    setFriendProfileLoading(false);
  }, []);

  const dismissGiftToast = useCallback((id: string) => {
    setGiftToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const q = query(collection(db, 'players'), where('username', '==', searchQuery.toLowerCase()));
      const snap = await getDocs(q);
      setSearchResults(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter((p: any) => p.uid !== player.uid));
    } catch (err) { console.error('Search failed', err); }
    setSearching(false);
  };

  const handleSendRequest = async (toUid: string) => {
    try {
      const q = query(collection(db, 'friend-requests'), where('from', '==', player.uid), where('to', '==', toUid));
      const existing = await getDocs(q);
      if (!existing.empty) return;
      await addDoc(collection(db, 'friend-requests'), { from: player.uid, to: toUid, status: 'pending', timestamp: Date.now() });
      setSearchResults(prev => prev.map((r: any) => r.uid === toUid ? { ...r, requestSent: true } : r));
    } catch (err) { console.error('Send request failed', err); }
  };

  const handleAccept = async (requestId: string, fromUid: string) => {
    setRequestLoading(requestId);
    try {
      await updateDoc(doc(db, 'friend-requests', requestId), { status: 'accepted' });
      await updateDoc(doc(db, 'players', player.uid), { friends: arrayUnion(fromUid) });
      await updateDoc(doc(db, 'players', fromUid), { friends: arrayUnion(player.uid) });
    } catch (err) { console.error('Accept failed', err); }
    setRequestLoading(null);
  };

  const handleDecline = async (requestId: string) => {
    setRequestLoading(requestId);
    try {
      await updateDoc(doc(db, 'friend-requests', requestId), { status: 'declined' });
    } catch (err) { console.error('Decline failed', err); }
    setRequestLoading(null);
  };

  const handleSendCoins = async () => {
    if (!sendCoinsTo || !sendAmount || sendLoading) return;
    const amount = parseInt(sendAmount);
    if (isNaN(amount) || amount <= 0) { setSendError('Enter a valid amount'); return; }
    if (Math.ceil(amount * 1.1) > (player.coins || 0)) { setSendError('Not enough tokens (includes 10% fee)'); return; }
    setSendLoading(true);
    setSendError('');
    try {
      const fee = Math.ceil(amount * 0.1);
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-(amount + fee)) });
      await updateDoc(doc(db, 'players', sendCoinsTo.uid), { coins: increment(amount) });
      trackDailyTask(player.uid, 'send_coins');
      fetch('/api/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Tokens Received!', message: `${player.username} sent you ${amount} tokens`, targetUids: [sendCoinsTo.uid] }),
      }).catch(() => {});
      setSendSuccess(`Sent ${amount} tokens to ${sendCoinsTo.username}! (${fee} fee burned)`);
      setSendAmount('');
      setTimeout(() => { setSendSuccess(''); setSendCoinsTo(null); }, 2000);
    } catch { setSendError('Failed to send tokens'); }
    setSendLoading(false);
  };

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;
    try {
      const members = [player.uid, ...selectedMembers];
      const memberNames: Record<string, string> = { [player.uid]: player.username || 'Anonymous' };
      selectedMembers.forEach(uid => {
        const f = friends.find(fr => fr.uid === uid);
        if (f) memberNames[uid] = f.username;
      });
      await addDoc(collection(db, 'group-chats'), {
        name: newGroupName.trim(), createdBy: player.uid, members, memberNames, createdAt: Date.now(),
      });
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
    } catch (err) { console.error('Failed to create group:', err); }
  }, [newGroupName, selectedMembers, player, friends]);

  const formatLastSeen = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatTimeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const onlineFriends = friends.filter(f => f.onlineStatus?.isOnline);
  const offlineFriends = friends.filter(f => !f.onlineStatus?.isOnline);
  const filteredFriends = friendFilter
    ? friends.filter(f => f.username.toLowerCase().includes(friendFilter.toLowerCase()))
    : null;

  const sortedRecentMessages = [...recentMessages].sort((a, b) => b.time - a.time);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="relative h-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}
    >
      {/* ═══════════ Cyberpunk Background Layers ═══════════ */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'52\' viewBox=\'0 0 60 52\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 0l25.98 15v30L30 60 4.02 45V15z\' fill=\'none\' stroke=\'%2339FF14\' stroke-width=\'0.5\' opacity=\'0.04\'/%3E%3C/svg%3E")', backgroundSize: '60px 52px' }} />
      <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'radial-gradient(ellipse at 15% 10%, rgba(57,255,20,0.06) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(0,200,255,0.05) 0%, transparent 35%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.03) 0%, transparent 45%)' }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.3), rgba(0,200,255,0.2), rgba(168,85,247,0.15), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.15)' }} />

      <div className="relative z-10 p-5 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      {/* Header */}
      <div className="relative flex items-center justify-between mb-5 p-4 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(57,255,20,0.04) 0%, #040608 40%, #030508 100%)',
          border: '1px solid rgba(57,255,20,0.15)',
          boxShadow: '0 0 25px rgba(57,255,20,0.04)',
        }}>
        <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent 60%)' }} />
        <div className="absolute top-0 left-0 w-3 h-3 pointer-events-none" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
        <div className="absolute bottom-0 right-0 w-3 h-3 pointer-events-none" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 0 12px rgba(57,255,20,0.15)' }}>
            <Users className="text-ninja-green" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} />
          </div>
          <div>
            <h1 className="font-ninja text-3xl tracking-wider bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">
              SOCIAL HUB
            </h1>
            <p className="text-gray-500 font-body mt-1 text-xs tracking-wider">
              {friends.length} FRIENDS {onlineFriends.length > 0 && `· ${onlineFriends.length} ONLINE`}
              {groupChats.length > 0 && ` · ${groupChats.length} GROUPS`}
            </p>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => setView(view === 'add' ? 'friends' : 'add')}
          className="relative px-4 py-2.5 rounded-xl font-ninja text-xs tracking-wider flex items-center gap-2 overflow-hidden"
          style={{
            background: view === 'add' ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.02)',
            border: view === 'add' ? '1px solid rgba(57,255,20,0.4)' : '1px solid rgba(57,255,20,0.15)',
            boxShadow: view === 'add' ? '0 0 20px rgba(57,255,20,0.2)' : 'none',
            color: view === 'add' ? '#39FF14' : '#9ca3af',
          }}>
          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.5)', borderLeft: '1.5px solid rgba(57,255,20,0.5)' }} />
          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.3)', borderRight: '1.5px solid rgba(0,200,255,0.3)' }} />
          <UserPlus size={16} style={{ filter: view === 'add' ? 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' : 'none' }} /> ADD FRIEND
        </motion.button>
      </div>

      {/* Navigation Buttons — Cyberpunk HUD Nav Style */}
      <div className="flex gap-3 mb-6">
        {NAV_BUTTONS.map(item => {
          const isActive = view === item.id;
          const unreadCount = item.id === 'messages' ? recentMessages.filter(m => m.time > Date.now() - 300000).length : 0;
          return (
            <motion.button key={item.id} onClick={() => setView(item.id)}
              whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
              className="flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl font-ninja text-sm tracking-wider transition-all relative overflow-hidden"
              style={{
                background: isActive
                  ? `linear-gradient(180deg, ${item.color}18 0%, #040608 60%, #030508 100%)`
                  : 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, #030508 100%)',
                border: `1px solid ${isActive ? `${item.color}55` : 'rgba(255,255,255,0.06)'}`,
                color: isActive ? item.color : '#666',
                boxShadow: isActive ? `0 0 25px ${item.color}25, inset 0 0 15px ${item.color}08` : 'none',
              }}>
              {/* Left glow accent bar */}
              {isActive && (
                <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}, 0 0 15px ${item.color}` }} />
              )}
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${isActive ? item.color + '66' : 'rgba(255,255,255,0.08)'}, transparent 60%)` }} />
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: `1.5px solid ${isActive ? item.color + 'aa' : 'rgba(57,255,20,0.25)'}`, borderLeft: `1.5px solid ${isActive ? item.color + 'aa' : 'rgba(57,255,20,0.25)'}` }} />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.3)', borderRight: '1.5px solid rgba(0,200,255,0.3)' }} />
              <span className="relative z-10" style={{ color: isActive ? item.color : '#555', filter: isActive ? `drop-shadow(0 0 4px ${item.color})` : 'none' }}>{item.icon}</span>
              <span className="relative z-10">{item.label}</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] text-white font-bold flex items-center justify-center z-20"
                  style={{
                    background: 'linear-gradient(180deg, #ff3333, #cc0000)',
                    border: '1px solid rgba(255,80,80,0.6)',
                    boxShadow: '0 0 12px rgba(255,0,0,0.6), inset 0 0 4px rgba(255,255,255,0.2)',
                  }}>{unreadCount}</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Friend Request Toast Bubbles — float at top of content */}
      <AnimatePresence>
        {requests.length > 0 && view !== 'add' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 space-y-2">
            {requests.map((req, i) => (
              <motion.div key={req.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3 p-3 pl-4 rounded-xl relative overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(57,255,20,0.06) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(57,255,20,0.2)',
                  boxShadow: '0 0 20px rgba(57,255,20,0.06)',
                }}>
                {/* Left glow bar */}
                <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(57,255,20,0.6)', boxShadow: '0 0 8px rgba(57,255,20,0.8), 0 0 15px rgba(57,255,20,0.4)' }} />
                {/* Top accent line */}
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), transparent 60%)' }} />
                {/* HUD corners */}
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
                {/* Pulse indicator */}
                <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-ninja-green flex-shrink-0 relative z-10"
                  style={{ boxShadow: '0 0 8px rgba(57,255,20,0.8)' }} />
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative z-10"
                  style={{ border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }}>
                  <Image src={`/img/pfp-${req.fromPlayer?.ninjaType || 'neon'}.png`} alt="" width={40} height={40} className="object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 relative z-10">
                  <p className="font-ninja text-xs text-white truncate tracking-wider">{req.fromPlayer?.username || 'Someone'}</p>
                  <p className="font-body text-[10px] text-gray-500">wants to be your friend</p>
                </div>
                {/* Accept / Decline */}
                <div className="flex gap-1.5 flex-shrink-0 relative z-10">
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={() => handleAccept(req.id, req.from)} disabled={requestLoading === req.id}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-all relative overflow-hidden"
                    style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.45)', boxShadow: '0 0 12px rgba(57,255,20,0.2)' }}>
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(57,255,20,0.6)', borderLeft: '1px solid rgba(57,255,20,0.6)' }} />
                    {requestLoading === req.id ? <Loader2 size={14} className="animate-spin text-ninja-green" /> : <Check size={16} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} />}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={() => handleDecline(req.id)} disabled={requestLoading === req.id}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-all relative overflow-hidden"
                    style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.35)', boxShadow: '0 0 10px rgba(255,0,0,0.15)' }}>
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(255,80,80,0.5)', borderLeft: '1px solid rgba(255,80,80,0.5)' }} />
                    <X size={16} className="text-red-400" style={{ filter: 'drop-shadow(0 0 4px rgba(255,50,50,0.6))' }} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* ════════ ADD FRIEND ════════ */}
        {view === 'add' && (
          <motion.div key="add" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="relative p-4 rounded-2xl mb-6 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(57,255,20,0.04) 0%, #040608 40%, #030508 100%)',
                border: '1px solid rgba(57,255,20,0.15)',
                boxShadow: '0 0 25px rgba(57,255,20,0.04)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent 60%)' }} />
              <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="relative flex gap-3">
                <div className="flex-1">
                  <NinjaInput icon={<Search size={16} />} type="text" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSearch()}
                    placeholder="Search by username..." autoFocus />
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={handleSearch} disabled={searching}
                  className="relative px-6 py-3 rounded-xl font-ninja text-sm tracking-wider overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(57,255,20,0.2) 0%, rgba(57,255,20,0.08) 100%)',
                    border: '1px solid rgba(57,255,20,0.5)',
                    color: '#39FF14',
                    boxShadow: '0 0 20px rgba(57,255,20,0.25), inset 0 0 10px rgba(57,255,20,0.1)',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.7)', borderLeft: '1.5px solid rgba(57,255,20,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                  {searching ? <Loader2 size={18} className="animate-spin" /> : <span style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }}>SEARCH</span>}
                </motion.button>
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result: any) => {
                  const alreadyFriend = (player.friends || []).includes(result.uid);
                  return (
                    <motion.div key={result.uid} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="relative flex items-center gap-4 p-4 pl-5 rounded-2xl overflow-hidden"
                      style={{
                        background: 'linear-gradient(180deg, rgba(57,255,20,0.03) 0%, #040608 40%, #030508 100%)',
                        border: '1px solid rgba(57,255,20,0.12)',
                        boxShadow: '0 0 15px rgba(57,255,20,0.03)',
                      }}>
                      <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(57,255,20,0.4)', boxShadow: '0 0 6px rgba(57,255,20,0.5)' }} />
                      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.25), transparent 60%)' }} />
                      <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.35)', borderLeft: '2px solid rgba(57,255,20,0.35)' }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.22)', borderRight: '2px solid rgba(0,200,255,0.22)' }} />
                      <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0 z-10"
                        style={{ border: '1px solid rgba(57,255,20,0.35)', boxShadow: '0 0 10px rgba(57,255,20,0.25)' }}>
                        <Image src={`/img/pfp-${result.ninjaType || 'neon'}.png`} alt={result.username} width={48} height={48} className="object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <NinjaAvatar skinColor={result.character?.skinColor || '#39FF14'} outfitColor={result.character?.skinColor || '#333'} size={40} animated={false} />
                        </div>
                      </div>
                      <div className="flex-1 relative z-10">
                        <p className="font-ninja text-sm text-white tracking-wider">{result.username}</p>
                        <p className="text-gray-500 font-body text-xs">{result.activeTitle || 'Newcomer'}</p>
                      </div>
                      {alreadyFriend ? (
                        <span className="text-gray-500 font-body text-xs flex items-center gap-1 relative z-10 px-3 py-1.5 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <CheckCircle2 size={14} /> Already friends
                        </span>
                      ) : result.requestSent ? (
                        <span className="text-ninja-green font-body text-xs flex items-center gap-1 relative z-10 px-3 py-1.5 rounded-lg"
                          style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.25)', boxShadow: '0 0 10px rgba(57,255,20,0.12)' }}>
                          <Check size={14} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} /> Request sent
                        </span>
                      ) : (
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => handleSendRequest(result.uid)}
                          className="relative z-10 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden"
                          style={{ background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 12px rgba(57,255,20,0.18)' }}>
                          <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(57,255,20,0.6)', borderLeft: '1px solid rgba(57,255,20,0.6)' }} />
                          <UserPlus size={14} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} />
                        </motion.button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
            {searchResults.length === 0 && searchQuery && !searching && (
              <div className="relative text-center py-12 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(57,255,20,0.02) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(57,255,20,0.1)',
                }}>
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.2), transparent 60%)' }} />
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.3)', borderLeft: '2px solid rgba(57,255,20,0.3)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.2)', borderRight: '2px solid rgba(0,200,255,0.2)' }} />
                <Search size={40} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-body">No players found with that username</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ════════ MESSAGES (Recent DMs) ════════ */}
        {view === 'messages' && (
          <motion.div key="messages" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {sortedRecentMessages.length === 0 && friends.length === 0 ? (
              <div className="relative text-center py-16 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(0,200,255,0.03) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  boxShadow: '0 0 25px rgba(0,200,255,0.03)',
                }}>
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(0,200,255,0.3), transparent 60%)' }} />
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(0,200,255,0.4)', borderLeft: '2px solid rgba(0,200,255,0.4)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.25)', borderRight: '2px solid rgba(57,255,20,0.25)' }} />
                <MessageSquare size={48} className="text-cyan-400/40 mx-auto mb-4" style={{ filter: 'drop-shadow(0 0 8px rgba(0,200,255,0.3))' }} />
                <p className="font-ninja text-gray-400 tracking-wider">NO MESSAGES YET</p>
                <p className="text-gray-600 font-body text-sm mt-1">Add friends and start chatting!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Show all friends as potential message targets, sorted by recent message */}
                {(() => {
                  const friendsWithMessages = friends.map(f => {
                    const recent = sortedRecentMessages.find(m => m.friendId === f.uid);
                    return { ...f, lastMessage: recent?.lastMessage || '', lastTime: recent?.time || 0 };
                  }).sort((a, b) => b.lastTime - a.lastTime);

                  return friendsWithMessages.map((friend, i) => (
                    <motion.div key={friend.uid} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-private-chat', {
                          detail: { friendId: friend.uid, friendName: friend.username }
                        }));
                      }}
                      className="relative flex items-center gap-3 p-3 pl-4 rounded-xl cursor-pointer transition-all group overflow-hidden"
                      style={{
                        background: 'linear-gradient(180deg, rgba(0,200,255,0.03) 0%, #040608 40%, #030508 100%)',
                        border: '1px solid rgba(0,200,255,0.1)',
                        boxShadow: '0 0 15px rgba(0,200,255,0.02)',
                      }}>
                      <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: friend.onlineStatus?.isOnline ? 'rgba(57,255,20,0.5)' : 'rgba(0,200,255,0.35)', boxShadow: friend.onlineStatus?.isOnline ? '0 0 6px rgba(57,255,20,0.7)' : '0 0 6px rgba(0,200,255,0.5)' }} />
                      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(0,200,255,0.25), transparent 60%)' }} />
                      <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(0,200,255,0.3)', borderLeft: '2px solid rgba(0,200,255,0.3)' }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(57,255,20,0.2)', borderRight: '2px solid rgba(57,255,20,0.2)' }} />
                      <div className="relative flex-shrink-0 z-10">
                        <img src={friend.profilePhoto || `/img/pfp-${friend.ninjaType}.png`} alt={friend.username}
                          className={`w-11 h-11 rounded-full ${friend.profilePhoto ? 'object-cover' : 'object-cover'}`}
                          style={{ border: '1px solid rgba(0,200,255,0.3)', boxShadow: '0 0 8px rgba(0,200,255,0.2)' }}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                        {friend.onlineStatus?.isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-black"
                            style={{ boxShadow: '0 0 6px rgba(57,255,20,0.8)' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 relative z-10">
                        <div className="flex items-center justify-between">
                          <p className="font-ninja text-sm text-white truncate tracking-wider">{friend.username}</p>
                          {friend.lastTime > 0 && (
                            <span className="text-[10px] text-cyan-400/70 font-body flex-shrink-0 ml-2 px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.15)' }}>{formatTimeAgo(friend.lastTime)}</span>
                          )}
                        </div>
                        <p className="text-gray-500 font-body text-xs truncate">
                          {friend.lastMessage || (friend.onlineStatus?.isOnline ? 'Online' : 'Start a conversation')}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-cyan-400/40 group-hover:text-cyan-400 flex-shrink-0 relative z-10 transition-colors" />
                    </motion.div>
                  ));
                })()}
              </div>
            )}
          </motion.div>
        )}

        {/* ════════ GROUPS ════════ */}
        {view === 'groups' && (
          <motion.div key="groups" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Create group button — HUD style */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateGroup(!showCreateGroup)}
              className="relative w-full flex items-center justify-center gap-2 p-3.5 rounded-xl font-ninja text-xs tracking-wider transition-all mb-4 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(168,85,247,0.05) 0%, #040608 40%, #030508 100%)',
                border: '1px dashed rgba(168,85,247,0.35)',
                color: '#A855F7',
                boxShadow: '0 0 20px rgba(168,85,247,0.08)',
              }}>
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.35), transparent 60%)' }} />
              <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(168,85,247,0.4)', borderLeft: '2px solid rgba(168,85,247,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              <Plus size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.6))' }} /> CREATE NEW GROUP
            </motion.button>

            {/* Create group form */}
            <AnimatePresence>
              {showCreateGroup && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-4">
                  <div className="relative p-4 rounded-xl space-y-3 overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(168,85,247,0.05) 0%, #040608 40%, #030508 100%)',
                      border: '1px solid rgba(168,85,247,0.2)',
                      boxShadow: '0 0 25px rgba(168,85,247,0.05)',
                    }}>
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.4), transparent 60%)' }} />
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(168,85,247,0.45)', borderLeft: '2px solid rgba(168,85,247,0.45)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
                    <NinjaInput icon={<Hash size={14} />} type="text" value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)} placeholder="Group name..." maxLength={30} autoFocus />
                    <p className="text-purple-400/70 font-body text-xs tracking-wider flex items-center gap-2 relative z-10">
                      <span className="w-1 h-1 rounded-full bg-purple-400" style={{ boxShadow: '0 0 4px rgba(168,85,247,0.8)' }} />
                      SELECT MEMBERS
                    </p>
                    <div className="max-h-[180px] overflow-y-auto space-y-1.5 relative z-10 scrollbar-thin scrollbar-thumb-white/10">
                      {friends.map(f => {
                        const selected = selectedMembers.includes(f.uid);
                        return (
                          <button key={f.uid} onClick={() => setSelectedMembers(prev =>
                            selected ? prev.filter(id => id !== f.uid) : [...prev, f.uid]
                          )} className="relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all overflow-hidden"
                            style={{
                              background: selected ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)',
                              border: selected ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
                              boxShadow: selected ? '0 0 12px rgba(168,85,247,0.15)' : 'none',
                            }}>
                            {selected && <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(168,85,247,0.7)', boxShadow: '0 0 6px rgba(168,85,247,0.8)' }} />}
                            <img src={`/img/pfp-${f.ninjaType}.png`} alt="" className="w-8 h-8 rounded-full object-cover"
                              style={{ border: selected ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)' }}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                            <span className="text-sm text-gray-300 flex-1 font-ninja tracking-wider">{f.username}</span>
                            {selected && <div className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: 'rgba(168,85,247,0.3)', border: '1px solid rgba(168,85,247,0.6)', boxShadow: '0 0 8px rgba(168,85,247,0.4)' }}>
                              <Check size={10} className="text-purple-200" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 relative z-10">
                      <button onClick={() => { setShowCreateGroup(false); setSelectedMembers([]); }}
                        className="relative flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider overflow-hidden"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#888',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(255,255,255,0.15)', borderLeft: '1.5px solid rgba(255,255,255,0.15)' }} />
                        CANCEL
                      </button>
                      <button onClick={createGroup} disabled={!newGroupName.trim() || selectedMembers.length === 0}
                        className="relative flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider overflow-hidden disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(180deg, rgba(168,85,247,0.25) 0%, rgba(168,85,247,0.1) 100%)',
                          border: '1px solid rgba(168,85,247,0.55)',
                          color: '#C084FC',
                          boxShadow: '0 0 18px rgba(168,85,247,0.2), inset 0 0 10px rgba(168,85,247,0.08)',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(168,85,247,0.7)', borderLeft: '1.5px solid rgba(168,85,247,0.7)' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                        <span style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.6))' }}>CREATE ({selectedMembers.length})</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {groupChats.length === 0 && !showCreateGroup ? (
              <div className="relative text-center py-12 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(168,85,247,0.03) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(168,85,247,0.12)',
                }}>
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.3), transparent 60%)' }} />
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(168,85,247,0.35)', borderLeft: '2px solid rgba(168,85,247,0.35)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
                <Users size={48} className="text-purple-400/40 mx-auto mb-4" style={{ filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.3))' }} />
                <p className="font-ninja text-gray-400 tracking-wider">NO GROUPS YET</p>
                <p className="text-gray-600 font-body text-sm mt-1">Create a group to chat with multiple friends</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groupChats.map((group, i) => (
                  <motion.div key={group.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    onClick={() => {
                      // Open the group in the chat bubble
                      window.dispatchEvent(new CustomEvent('open-private-chat', {
                        detail: { friendId: group.id, friendName: group.name, isGroup: true }
                      }));
                    }}
                    className="relative flex items-center gap-4 p-4 pl-5 rounded-2xl cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(168,85,247,0.04) 0%, #040608 40%, #030508 100%)',
                      border: '1px solid rgba(168,85,247,0.15)',
                      boxShadow: '0 0 20px rgba(168,85,247,0.04)',
                    }}>
                    <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(168,85,247,0.5)', boxShadow: '0 0 8px rgba(168,85,247,0.7), 0 0 15px rgba(168,85,247,0.3)' }} />
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.3), transparent 60%)' }} />
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(168,85,247,0.4)', borderLeft: '2px solid rgba(168,85,247,0.4)' }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 relative z-10"
                      style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(0,200,255,0.1))', border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 12px rgba(168,85,247,0.2)' }}>
                      <Users size={20} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.7))' }} />
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <p className="font-ninja text-sm text-white tracking-wider">{group.name}</p>
                      <p className="text-gray-500 font-body text-xs flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded flex items-center gap-1"
                          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}>
                          <Users size={10} className="text-purple-400" /> <span className="text-purple-300">{group.members.length} members</span>
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 relative z-10">
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(new CustomEvent('start-voice-call', {
                            detail: { friendId: group.id, friendName: group.name, isGroup: true, members: group.members },
                          }));
                        }}
                        className="relative w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden" title="Group call"
                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 10px rgba(168,85,247,0.12)' }}>
                        <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(168,85,247,0.5)', borderLeft: '1px solid rgba(168,85,247,0.5)' }} />
                        <Phone size={14} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.6))' }} />
                      </motion.button>
                    </div>
                    <ChevronRight size={16} className="text-purple-400/40 relative z-10" />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ════════ FRIENDS LIST ════════ */}
        {view === 'friends' && (
          <motion.div key="friends" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Search filter */}
            {friends.length > 5 && (
              <div className="relative p-3 rounded-xl mb-4 overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(57,255,20,0.03) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(57,255,20,0.12)',
                }}>
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.25), transparent 60%)' }} />
                <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '1.5px solid rgba(57,255,20,0.35)', borderLeft: '1.5px solid rgba(57,255,20,0.35)' }} />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.25)', borderRight: '1.5px solid rgba(0,200,255,0.25)' }} />
                <NinjaInput icon={<Search size={14} />} type="text" value={friendFilter}
                  onChange={(e) => setFriendFilter(e.target.value)} placeholder="Filter friends..." />
              </div>
            )}

            {friends.length === 0 ? (
              <div className="relative text-center py-16 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(57,255,20,0.03) 0%, #040608 40%, #030508 100%)',
                  border: '1px solid rgba(57,255,20,0.12)',
                  boxShadow: '0 0 25px rgba(57,255,20,0.03)',
                }}>
                <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent 60%)' }} />
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
                <Users size={56} className="text-ninja-green/40 mx-auto mb-4" style={{ filter: 'drop-shadow(0 0 10px rgba(57,255,20,0.4))' }} />
                <p className="font-ninja text-lg text-gray-400 tracking-wider">NO FRIENDS YET</p>
                <p className="text-gray-600 font-body text-sm mt-1 mb-4">Add friends to see them here</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setView('add')}
                  className="relative px-6 py-3 rounded-xl font-ninja text-sm tracking-wider inline-flex items-center gap-2 overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(57,255,20,0.2) 0%, rgba(57,255,20,0.08) 100%)',
                    border: '1px solid rgba(57,255,20,0.5)',
                    color: '#39FF14',
                    boxShadow: '0 0 20px rgba(57,255,20,0.25), inset 0 0 10px rgba(57,255,20,0.08)',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.7)', borderLeft: '1.5px solid rgba(57,255,20,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                  <UserPlus size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.6))' }} /> ADD FRIEND
                </motion.button>
              </div>
            ) : (
              <>
                {/* Online friends */}
                {(() => {
                  const list = filteredFriends || onlineFriends;
                  const showOnline = !filteredFriends && onlineFriends.length > 0;
                  return showOnline || filteredFriends ? (
                    <div className="mb-6">
                      {!filteredFriends && (
                        <div className="flex items-center gap-2 mb-3 pl-1">
                          <div className="w-2 h-2 rounded-full bg-green-500" style={{ boxShadow: '0 0 8px rgba(57,255,20,0.8), 0 0 15px rgba(57,255,20,0.4)' }} />
                          <p className="font-ninja text-xs text-ninja-green tracking-wider" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.4))' }}>ONLINE — {onlineFriends.length}</p>
                          <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.3), transparent)' }} />
                        </div>
                      )}
                      <div className="space-y-2">
                        {(filteredFriends || onlineFriends).map((friend, i) => (
                          <motion.div key={friend.uid} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                            onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: friend.uid } }))}
                            className="relative flex items-center gap-4 p-4 pl-5 rounded-2xl cursor-pointer overflow-hidden hover:scale-[1.01] transition-transform"
                            style={{
                              background: 'linear-gradient(180deg, rgba(57,255,20,0.05) 0%, #040608 40%, #030508 100%)',
                              border: '1px solid rgba(57,255,20,0.18)',
                              boxShadow: '0 0 20px rgba(57,255,20,0.05)',
                            }}>
                            {/* Left glow bar */}
                            <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(57,255,20,0.6)', boxShadow: '0 0 8px rgba(57,255,20,0.8), 0 0 15px rgba(57,255,20,0.4)' }} />
                            {/* Top accent */}
                            <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.35), transparent 60%)' }} />
                            {/* HUD corners */}
                            <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
                            <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
                            <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0 z-10"
                              style={{ border: '1px solid rgba(57,255,20,0.45)', boxShadow: '0 0 12px rgba(57,255,20,0.3)' }}>
                              <img src={friend.profilePhoto || `/img/pfp-${friend.ninjaType}.png`} alt={friend.username}
                                className={`w-12 h-12 ${friend.profilePhoto ? 'object-cover' : 'object-cover'}`}
                                onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <NinjaAvatar skinColor={friend.character?.skinColor || '#39FF14'} outfitColor={friend.character?.skinColor || '#333'} size={40} animated={false} />
                              </div>
                              {friend.onlineStatus?.isOnline && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-black"
                                  style={{ boxShadow: '0 0 6px rgba(57,255,20,0.8)' }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 relative z-10">
                              <p className="font-ninja text-xl text-white tracking-wider truncate">{friend.username}</p>
                              <p className={`font-body text-xs flex items-center gap-1.5 mt-1 ${friend.onlineStatus?.isOnline ? 'text-ninja-green' : 'text-gray-600'}`}>
                                {friend.onlineStatus?.isOnline ? (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.2)' }}>
                                    <Gamepad2 size={10} /> {friend.onlineStatus?.currentActivity || 'In lobby'}
                                  </span>
                                ) : (
                                  <><Clock size={12} /> {friend.onlineStatus?.lastSeen ? formatLastSeen(friend.onlineStatus.lastSeen) : 'Offline'}</>
                                )}
                              </p>
                            </div>
                            <ChevronRight size={18} className="text-ninja-green/60 flex-shrink-0 relative z-10" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Offline friends (only when not filtering) */}
                {!filteredFriends && offlineFriends.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3 pl-1">
                      <div className="w-2 h-2 rounded-full bg-gray-600" />
                      <p className="font-ninja text-xs text-gray-500 tracking-wider">OFFLINE — {offlineFriends.length}</p>
                      <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
                    </div>
                    <div className="space-y-2">
                      {offlineFriends.map((friend, i) => (
                        <motion.div key={friend.uid} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (onlineFriends.length + i) * 0.05 }}
                          onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: friend.uid } }))}
                          className="relative flex items-center gap-4 p-4 pl-5 rounded-2xl cursor-pointer opacity-75 hover:opacity-100 transition-opacity overflow-hidden"
                          style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, #040608 40%, #030508 100%)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 0 15px rgba(255,255,255,0.02)',
                          }}>
                          <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(255,255,255,0.15)' }} />
                          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.15), transparent 60%)' }} />
                          <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(255,255,255,0.15)', borderLeft: '2px solid rgba(255,255,255,0.15)' }} />
                          <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(255,255,255,0.1)', borderRight: '2px solid rgba(255,255,255,0.1)' }} />
                          <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0 z-10"
                            style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                            <img src={friend.profilePhoto || `/img/pfp-${friend.ninjaType}.png`} alt={friend.username}
                              className={`w-12 h-12 object-cover grayscale`}
                              onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <NinjaAvatar skinColor={friend.character?.skinColor || '#39FF14'} outfitColor={friend.character?.skinColor || '#333'} size={40} animated={false} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 relative z-10">
                            <p className="font-ninja text-xl text-gray-300 tracking-wider truncate">{friend.username}</p>
                            <p className="text-gray-600 font-body text-xs flex items-center gap-1 mt-1">
                              <Clock size={12} />
                              {friend.onlineStatus?.lastSeen ? `Last seen ${formatLastSeen(friend.onlineStatus.lastSeen)}` : 'Offline'}
                            </p>
                          </div>
                          <ChevronRight size={18} className="text-gray-500 flex-shrink-0 relative z-10" />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      </div>

      {/* Friend action popup — opens when a friend row is clicked */}
      <AnimatePresence>
        {actionFriend && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[105] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => setActionFriend(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 w-[420px] max-w-[92vw] relative overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
                border: '1px solid rgba(57,255,20,0.25)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.1)',
              }}>
              {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                <div key={ci} className={`absolute ${pos} w-4 h-4 pointer-events-none z-[2]`} style={{
                  ...(pos.includes('top') ? { borderTop: '2px solid rgba(57,255,20,0.5)' } : { borderBottom: '2px solid rgba(0,200,255,0.3)' }),
                  ...(pos.includes('left') ? { borderLeft: '2px solid rgba(57,255,20,0.5)' } : { borderRight: '2px solid rgba(0,200,255,0.3)' }),
                }} />
              ))}
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }} />

              <button onClick={() => setActionFriend(null)}
                className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-ninja-green transition-all z-[10]"
                style={{ background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)' }}>
                <X size={16} />
              </button>

              <div className="relative z-[3]">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0"
                    style={{ border: '2px solid rgba(57,255,20,0.45)', boxShadow: '0 0 14px rgba(57,255,20,0.3)' }}>
                    <img src={actionFriend.profilePhoto || `/img/pfp-${actionFriend.ninjaType}.png`} alt={actionFriend.username}
                      className="w-16 h-16 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-ninja text-2xl text-white tracking-wider truncate" style={{ textShadow: '0 0 12px rgba(57,255,20,0.3)' }}>
                      {actionFriend.username}
                    </p>
                    <p className={`font-body text-xs flex items-center gap-1.5 mt-1 ${actionFriend.onlineStatus?.isOnline ? 'text-ninja-green' : 'text-gray-600'}`}>
                      {actionFriend.onlineStatus?.isOnline ? (
                        <span className="flex items-center gap-1"><Gamepad2 size={10} /> {actionFriend.onlineStatus?.currentActivity || 'In lobby'}</span>
                      ) : (
                        <><Clock size={12} /> {actionFriend.onlineStatus?.lastSeen ? formatLastSeen(actionFriend.onlineStatus.lastSeen) : 'Offline'}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open-private-chat', {
                        detail: { friendId: actionFriend.uid, friendName: actionFriend.username },
                      }));
                      setActionFriend(null);
                    }}
                    className="relative py-4 rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                    style={{ background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.35)', boxShadow: '0 0 14px rgba(0,200,255,0.15)' }}>
                    <MessageSquare size={22} className="text-cyan-400" style={{ filter: 'drop-shadow(0 0 6px rgba(0,200,255,0.7))' }} />
                    <span className="font-ninja text-xs text-cyan-300 tracking-wider">MESSAGE</span>
                  </motion.button>
                  {actionFriend.onlineStatus?.isOnline && (
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('start-voice-call', {
                          detail: { friendId: actionFriend.uid, friendName: actionFriend.username },
                        }));
                        setActionFriend(null);
                      }}
                      className="relative py-4 rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 14px rgba(168,85,247,0.15)' }}>
                      <Phone size={22} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.7))' }} />
                      <span className="font-ninja text-xs text-purple-300 tracking-wider">VOICE CALL</span>
                    </motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      const f = actionFriend;
                      setActionFriend(null);
                      setSendCoinsTo(f);
                    }}
                    className="relative py-4 rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                    style={{ background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.4)', boxShadow: '0 0 14px rgba(57,255,20,0.18)' }}>
                    <Send size={22} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.8))' }} />
                    <span className="font-ninja text-xs text-ninja-green tracking-wider">SEND COINS</span>
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      const uid = actionFriend.uid;
                      setActionFriend(null);
                      window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid } }));
                    }}
                    className="relative py-4 rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <User size={22} className="text-gray-300" />
                    <span className="font-ninja text-xs text-gray-300 tracking-wider">VIEW PROFILE</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Send Coins Modal */}
      <AnimatePresence>
        {sendCoinsTo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { setSendCoinsTo(null); setSendError(''); setSendSuccess(''); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 w-[380px] max-w-[90vw] relative overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.08)' }}>
              {/* HUD background layers */}
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(57,255,20,0.08) 0%, transparent 45%), radial-gradient(ellipse at 80% 100%, rgba(0,200,255,0.05) 0%, transparent 45%)' }} />
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderRight: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderLeft: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }} />
              <div className="relative z-[3]">
                <div className="text-center mb-5">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-3 relative"
                    style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.35)', boxShadow: '0 0 18px rgba(57,255,20,0.25), inset 0 0 10px rgba(57,255,20,0.08)' }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.7)', borderLeft: '1.5px solid rgba(57,255,20,0.7)' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                    <Send size={24} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.8))' }} />
                  </div>
                  <h3 className="font-ninja text-lg text-white tracking-wider">SEND COINS</h3>
                  <p className="text-gray-500 font-body text-sm mt-1">To: <span className="text-ninja-green font-ninja tracking-wider" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }}>{sendCoinsTo?.username}</span></p>
                </div>
                <div className="mb-4">
                  <label className="text-ninja-green text-[10px] font-ninja tracking-widest mb-1.5 block flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 4px rgba(57,255,20,0.8)' }} />
                    AMOUNT
                  </label>
                  <NinjaInput icon={<Coins size={16} />} type="number" value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSendCoins()}
                    className="font-ninja text-lg" placeholder="0" min={1} autoFocus />
                  <p className="text-gray-600 font-body text-xs mt-1.5 flex items-center gap-1.5">
                    <span>Your balance:</span>
                    <span className="text-yellow-400 font-ninja px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>{Math.floor(player.coins || 0)} coins</span>
                  </p>
                  {sendAmount && parseInt(sendAmount) > 0 && (
                    <div className="relative mt-2 p-3 rounded-lg space-y-1 overflow-hidden"
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(57,255,20,0.12)' }}>
                      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.25), transparent 60%)' }} />
                      <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1px solid rgba(57,255,20,0.3)', borderLeft: '1px solid rgba(57,255,20,0.3)' }} />
                      <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(0,200,255,0.25)', borderRight: '1px solid rgba(0,200,255,0.25)' }} />
                      <div className="flex justify-between text-[11px] font-body relative z-10">
                        <span className="text-gray-500">Send amount</span>
                        <span className="text-white font-ninja">{parseInt(sendAmount)} tokens</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-body relative z-10">
                        <span className="text-gray-500">Fee (10%)</span>
                        <span className="text-red-400 font-ninja">+{Math.ceil(parseInt(sendAmount) * 0.1)} tokens</span>
                      </div>
                      <div className="border-t border-ninja-green/15 pt-1 flex justify-between text-[11px] font-body relative z-10">
                        <span className="text-gray-400">Balance after</span>
                        <span className={`font-ninja ${(player.coins - Math.ceil(parseInt(sendAmount) * 1.1)) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                          {Math.floor(player.coins - Math.ceil(parseInt(sendAmount) * 1.1))} tokens
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {sendError && (
                  <div className="relative p-2.5 rounded-lg mb-3 overflow-hidden"
                    style={{ background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.3)' }}>
                    <div className="absolute top-0 left-0 bottom-0 w-[2px]" style={{ background: 'rgba(255,80,80,0.7)', boxShadow: '0 0 6px rgba(255,50,50,0.8)' }} />
                    <p className="text-red-400 font-body text-sm flex items-center gap-2 pl-2">
                      <AlertTriangle size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(255,50,50,0.6))' }} /> {sendError}
                    </p>
                  </div>
                )}
                {sendSuccess && (
                  <div className="relative p-2.5 rounded-lg mb-3 overflow-hidden"
                    style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.35)' }}>
                    <div className="absolute top-0 left-0 bottom-0 w-[2px]" style={{ background: 'rgba(57,255,20,0.7)', boxShadow: '0 0 6px rgba(57,255,20,0.8)' }} />
                    <p className="text-green-400 font-body text-sm flex items-center gap-2 pl-2">
                      <CheckCircle2 size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(57,255,20,0.6))' }} /> {sendSuccess}
                    </p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setSendCoinsTo(null); setSendError(''); setSendSuccess(''); }}
                    className="relative flex-1 py-3 rounded-xl font-ninja text-sm tracking-wider overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#888',
                    }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(255,255,255,0.2)', borderLeft: '1.5px solid rgba(255,255,255,0.2)' }} />
                    CANCEL
                  </button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={handleSendCoins} disabled={sendLoading}
                    className="relative flex-1 py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(57,255,20,0.25) 0%, rgba(57,255,20,0.1) 100%)',
                      border: '1px solid rgba(57,255,20,0.55)',
                      color: '#39FF14',
                      boxShadow: '0 0 22px rgba(57,255,20,0.28), inset 0 0 12px rgba(57,255,20,0.1)',
                    }}>
                    <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.7)', borderLeft: '1.5px solid rgba(57,255,20,0.7)' }} />
                    <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                    {sendLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} />} SEND
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Profile Modal */}
      <AnimatePresence>
        {selectedFriend && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { setSelectedFriend(null); setFriendProfileData(null); setShowGiftMessage(false); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 w-[500px] min-w-[500px] max-w-[90vw] max-h-[85vh] overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 relative"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.2)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.08)' }}>
              {/* HUD background layers */}
              <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden" style={{ backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
              <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(57,255,20,0.08) 0%, transparent 45%), radial-gradient(ellipse at 80% 100%, rgba(0,200,255,0.05) 0%, transparent 45%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.03) 0%, transparent 60%)' }} />
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute top-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderRight: '2px solid rgba(57,255,20,0.5)' }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderLeft: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }} />
              <button onClick={() => { setSelectedFriend(null); setFriendProfileData(null); setShowGiftMessage(false); }}
                className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center z-30 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.25)', borderLeft: '1px solid rgba(255,255,255,0.25)' }} />
                <X size={22} className="text-gray-400" />
              </button>
              <div className="relative z-[3]">
              <div className="flex flex-col items-center mb-6 pt-2">
                <div className="w-24 h-24 rounded-full overflow-hidden relative mb-3"
                  style={{ border: '2px solid rgba(57,255,20,0.4)', boxShadow: '0 0 30px rgba(57,255,20,0.25), inset 0 0 15px rgba(57,255,20,0.08)' }}>
                  <Image src={`/img/ninja-${selectedFriend.ninjaType}.png`} alt={selectedFriend.username} width={96} height={96} className="object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <NinjaAvatar skinColor={selectedFriend.character?.skinColor || '#39FF14'} outfitColor={selectedFriend.character?.skinColor || '#333'} size={80} animated />
                  </div>
                </div>
                <h2 className="font-ninja text-xl text-white tracking-wider bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent">{selectedFriend.username}</h2>
                <p className="text-gray-500 font-body text-xs tracking-wider mt-0.5">{selectedFriend.activeTitle}</p>
                <div className={`flex items-center gap-2 mt-2 px-2.5 py-1 rounded-full ${selectedFriend.onlineStatus?.isOnline ? 'text-green-400' : 'text-gray-500'}`}
                  style={{
                    background: selectedFriend.onlineStatus?.isOnline ? 'rgba(57,255,20,0.08)' : 'rgba(255,255,255,0.03)',
                    border: selectedFriend.onlineStatus?.isOnline ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: selectedFriend.onlineStatus?.isOnline ? '0 0 10px rgba(57,255,20,0.15)' : 'none',
                  }}>
                  <Circle size={8} className={selectedFriend.onlineStatus?.isOnline ? 'fill-green-400' : 'fill-gray-600'}
                    style={{ filter: selectedFriend.onlineStatus?.isOnline ? 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' : 'none' }} />
                  <span className="font-body text-xs">{selectedFriend.onlineStatus?.isOnline ? selectedFriend.onlineStatus.currentActivity || 'Online' : 'Offline'}</span>
                </div>
              </div>
              {friendProfileLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-ninja-green" style={{ filter: 'drop-shadow(0 0 6px rgba(57,255,20,0.6))' }} /></div>
              ) : friendProfileData ? (
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {(() => {
                    const stats = friendProfileData.stats || {};
                    const totalXP = calculateTotalXP(friendProfileData);
                    const levelInfo = getLevelInfo(totalXP);
                    const hoursPlayed = Math.floor((friendProfileData.totalPlaytime || 0) / 60);
                    return [
                      { label: 'Games', value: stats.gamesPlayed || 0, color: 'text-blue-400', icon: <Gamepad2 size={14} />, glow: 'rgba(0,200,255,0.5)', bg: 'rgba(0,200,255,0.06)', border: 'rgba(0,200,255,0.25)' },
                      { label: 'Level', value: levelInfo.level, color: 'text-ninja-green', icon: <Trophy size={14} />, glow: 'rgba(57,255,20,0.6)', bg: 'rgba(57,255,20,0.06)', border: 'rgba(57,255,20,0.25)' },
                      { label: 'Hours', value: hoursPlayed, color: 'text-yellow-400', icon: <Timer size={14} />, glow: 'rgba(250,204,21,0.5)', bg: 'rgba(250,204,21,0.06)', border: 'rgba(250,204,21,0.25)' },
                      { label: 'Chests', value: stats.chestsOpened || 0, color: 'text-purple-400', icon: <Package size={14} />, glow: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.25)' },
                    ];
                  })().map(stat => (
                    <div key={stat.label} className="relative text-center p-3 rounded-xl overflow-hidden"
                      style={{
                        background: stat.bg,
                        border: `1px solid ${stat.border}`,
                        boxShadow: `0 0 12px ${stat.glow.replace('0.5', '0.1').replace('0.6', '0.12')}`,
                      }}>
                      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, ${stat.border}, transparent 60%)` }} />
                      <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${stat.border}`, borderLeft: `1px solid ${stat.border}` }} />
                      <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1px solid rgba(0,200,255,0.2)', borderRight: '1px solid rgba(0,200,255,0.2)' }} />
                      <div className={`flex items-center justify-center mb-1 ${stat.color} relative z-10`} style={{ filter: `drop-shadow(0 0 4px ${stat.glow})` }}>{stat.icon}</div>
                      <p className={`font-ninja text-lg ${stat.color} relative z-10`}>{stat.value}</p>
                      <p className="text-gray-500 font-body text-[10px] tracking-wider relative z-10">{stat.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const f = selectedFriend;
                    setSelectedFriend(null); setFriendProfileData(null); setShowGiftMessage(false);
                    window.dispatchEvent(new CustomEvent('open-private-chat', { detail: { friendId: f.uid, friendName: f.username } }));
                  }}
                  className="relative py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(0,200,255,0.18) 0%, rgba(0,200,255,0.06) 100%)',
                    border: '1px solid rgba(0,200,255,0.45)',
                    color: '#00BFFF',
                    boxShadow: '0 0 18px rgba(0,200,255,0.2), inset 0 0 10px rgba(0,200,255,0.08)',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(0,200,255,0.6)', borderLeft: '1.5px solid rgba(0,200,255,0.6)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(57,255,20,0.35)', borderRight: '1.5px solid rgba(57,255,20,0.35)' }} />
                  <MessageSquare size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(0,200,255,0.7))' }} /> MESSAGE
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const f = selectedFriend;
                    setSelectedFriend(null); setFriendProfileData(null);
                    window.dispatchEvent(new CustomEvent('start-voice-call', { detail: { friendId: f.uid, friendName: f.username } }));
                  }}
                  className="relative py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#9ca3af',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(255,255,255,0.2)', borderLeft: '1.5px solid rgba(255,255,255,0.2)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(255,255,255,0.15)', borderRight: '1.5px solid rgba(255,255,255,0.15)' }} />
                  <Phone size={16} /> CALL
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setSendCoinsTo(selectedFriend)}
                  className="relative py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(57,255,20,0.22) 0%, rgba(57,255,20,0.08) 100%)',
                    border: '1px solid rgba(57,255,20,0.5)',
                    color: '#39FF14',
                    boxShadow: '0 0 20px rgba(57,255,20,0.22), inset 0 0 10px rgba(57,255,20,0.08)',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(57,255,20,0.7)', borderLeft: '1.5px solid rgba(57,255,20,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                  <Coins size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.8))' }} /> SEND TOKENS
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedFriend(null); window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'inventory' } })); }}
                  className="relative py-3 rounded-xl font-ninja text-sm tracking-wider flex items-center justify-center gap-2 overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(168,85,247,0.22) 0%, rgba(168,85,247,0.08) 100%)',
                    border: '1px solid rgba(168,85,247,0.5)',
                    color: '#C084FC',
                    boxShadow: '0 0 18px rgba(168,85,247,0.2), inset 0 0 10px rgba(168,85,247,0.08)',
                  }}>
                  <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid rgba(168,85,247,0.7)', borderLeft: '1.5px solid rgba(168,85,247,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid rgba(0,200,255,0.4)', borderRight: '1.5px solid rgba(0,200,255,0.4)' }} />
                  <Gift size={16} style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.8))' }} /> SEND GIFT
                </motion.button>
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gift Toasts */}
      <div className="fixed bottom-6 right-6 z-[150] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {giftToasts.map(toast => (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 100, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 100, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative pointer-events-auto flex items-center gap-3 px-4 py-3 pl-5 rounded-xl min-w-[280px] max-w-[360px] overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(10,10,10,0.92) 40%, rgba(5,5,8,0.95) 100%)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(168,85,247,0.4)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 25px rgba(168,85,247,0.25)',
              }}>
              <div className="absolute top-0 bottom-0 left-0 w-[2px]" style={{ background: 'rgba(168,85,247,0.7)', boxShadow: '0 0 8px rgba(168,85,247,0.8), 0 0 15px rgba(168,85,247,0.4)' }} />
              <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(168,85,247,0.4), transparent 60%)' }} />
              <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid rgba(168,85,247,0.5)', borderLeft: '2px solid rgba(168,85,247,0.5)' }} />
              <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 relative z-10"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.45)', boxShadow: '0 0 12px rgba(168,85,247,0.3)' }}>
                <Gift size={18} className="text-purple-400" style={{ filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.8))' }} />
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <p className="font-ninja text-xs text-purple-400 truncate tracking-wider" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.5))' }}>GIFT RECEIVED</p>
                <p className="text-gray-400 font-body text-xs truncate">from <span className="text-white">{toast.senderName}</span></p>
              </div>
              <button onClick={() => dismissGiftToast(toast.id)}
                className="relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center z-10"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <X size={14} className="text-gray-400" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
