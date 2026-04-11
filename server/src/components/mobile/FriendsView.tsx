'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, doc, query, where, getDocs, updateDoc, onSnapshot, getDoc, addDoc
} from 'firebase/firestore';
import { Lang, t } from '@/lib/translations';
import {
  Users, Search, UserPlus, UserMinus, MessageCircle, Send, Coins, Loader2,
  X, ChevronRight, Gamepad2, Circle, Check, Phone
} from 'lucide-react';
import { useVoiceCall } from '@/components/VoiceCallProvider';
import { trackDailyTask } from '@/lib/daily-tasks';

// ─── Types ───────────────────────────────────────────────────
interface Friend {
  uid: string;
  username: string;
  ninjaType: string;
  isOnline: boolean;
  currentGame?: string;
  coins?: number;
  lastSeen?: number;
}

// ─── Config ──────────────────────────────────────────────────
const NINJA_COLORS: Record<string, string> = {
  neon: '#39FF14', fire: '#FF4500', ice: '#00BFFF', shadow: '#8B00FF', cyber: '#9B59B6',
};

// ─── Animation variants ─────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

const listItem = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0, transition: { type: 'spring', damping: 20, stiffness: 300 } },
  exit: { opacity: 0, x: 12, transition: { duration: 0.15 } },
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export function FriendsView({
  player,
  lang,
  onNavigateToChat,
}: {
  player: any;
  lang: Lang;
  onNavigateToChat?: (friendUid: string) => void;
}) {
  const { startCall } = useVoiceCall();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [sendingCoinsTo, setSendingCoinsTo] = useState<string | null>(null);
  const [coinAmount, setCoinAmount] = useState('');
  const [sendingCoins, setSendingCoins] = useState(false);
  const [removingFriend, setRemovingFriend] = useState<string | null>(null);
  const [addedFriends, setAddedFriends] = useState<Set<string>>(new Set());
  const [coinsSent, setCoinsSent] = useState<string | null>(null);

  // ─── Fetch friends data ────────────────────────────────────
  useEffect(() => {
    const friendIds: string[] = player?.friends || [];
    if (friendIds.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // Real-time listener on each friend
    const unsubs: (() => void)[] = [];

    for (const fid of friendIds) {
      const unsub = onSnapshot(doc(db, 'players', fid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const friend: Friend = {
            uid: fid,
            username: data.username || 'Unknown',
            ninjaType: data.ninjaType || 'neon',
            isOnline: data.isOnline || false,
            currentGame: data.currentGame || undefined,
            coins: data.coins || 0,
            lastSeen: data.lastSeen || 0,
          };
          setFriends((prev) => {
            const filtered = prev.filter((f) => f.uid !== fid);
            return [...filtered, friend];
          });
        }
        setLoading(false);
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach((u) => u());
  }, [player?.friends]);

  // ─── Sort friends: online first ────────────────────────────
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [friends]);

  // ─── Filter by search ─────────────────────────────────────
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return sortedFriends;
    return sortedFriends.filter((f) =>
      f.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sortedFriends, searchQuery]);

  const onlineCount = friends.filter((f) => f.isOnline).length;

  // ─── Add friend search ────────────────────────────────────
  const handleAddSearch = useCallback(async () => {
    if (!addSearch.trim()) return;
    setSearching(true);
    try {
      const q = query(collection(db, 'players'), where('username', '==', addSearch.trim()));
      const snap = await getDocs(q);
      const results = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((p: any) => p.uid !== player.uid);
      setAddResults(results);
    } catch {}
    setSearching(false);
  }, [addSearch, player?.uid]);

  // ─── Add friend (sends request, doesn't instant-add) ─────
  const handleAddFriend = useCallback(async (friendUid: string) => {
    const currentFriends: string[] = player.friends || [];
    if (currentFriends.includes(friendUid)) return;
    try {
      // Check if request already exists
      const existing = await getDocs(query(
        collection(db, 'friend-requests'),
        where('from', '==', player.uid),
        where('to', '==', friendUid),
        where('status', '==', 'pending')
      ));
      if (existing.empty) {
        await addDoc(collection(db, 'friend-requests'), {
          from: player.uid,
          to: friendUid,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
      setAddedFriends((prev) => new Set(prev).add(friendUid));
    } catch (err) {
      console.error('Send friend request error:', err);
    }
  }, [player]);

  // ─── Remove friend ────────────────────────────────────────
  const handleRemoveFriend = useCallback(async (friendUid: string) => {
    setRemovingFriend(friendUid);
    const currentFriends: string[] = player.friends || [];
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        friends: currentFriends.filter((id: string) => id !== friendUid),
      });
      // Also remove from friend's list
      const friendSnap = await getDoc(doc(db, 'players', friendUid));
      if (friendSnap.exists()) {
        const friendData = friendSnap.data();
        const friendFriends: string[] = friendData.friends || [];
        await updateDoc(doc(db, 'players', friendUid), {
          friends: friendFriends.filter((id: string) => id !== player.uid),
        });
      }
      setFriends((prev) => prev.filter((f) => f.uid !== friendUid));
    } catch (err) {
      console.error('Remove friend error:', err);
    }
    setRemovingFriend(null);
  }, [player]);

  // ─── Send coins ───────────────────────────────────────────
  const handleSendCoins = useCallback(async (friendUid: string) => {
    const amount = parseInt(coinAmount);
    const playerCoins = player.coins || 0;
    if (!amount || amount <= 0 || amount > playerCoins) return;

    setSendingCoins(true);
    try {
      await updateDoc(doc(db, 'players', player.uid), { coins: playerCoins - amount });
      const friendSnap = await getDoc(doc(db, 'players', friendUid));
      if (friendSnap.exists()) {
        const friendCoins = friendSnap.data().coins || 0;
        await updateDoc(doc(db, 'players', friendUid), { coins: friendCoins + amount });
      }
      // Notify
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Tokens Received!`,
          message: `${player.username} sent you ${amount} tokens`,
          targetUids: [friendUid],
          data: { type: 'coins_received', sender: player.username, amount: String(amount) },
        }),
      }).catch(() => {});

      setCoinsSent(friendUid);
      trackDailyTask(player.uid, 'send_coins').catch(() => {});
      setTimeout(() => setCoinsSent(null), 2000);
      setSendingCoinsTo(null);
      setCoinAmount('');
    } catch (err) {
      console.error('Send coins error:', err);
    }
    setSendingCoins(false);
  }, [coinAmount, player]);

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" exit="exit" className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">
            <Users size={20} className="inline mr-2" style={{ color: '#39FF14' }} />
            {t(lang, 'friends') || (lang === 'ar' ? 'الأصدقاء' : 'Friends')}
            <span className="text-white/30 text-sm font-normal ml-2">
              ({friends.length})
            </span>
          </h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="p-2 rounded-full transition-colors"
            style={{
              background: showAddPanel ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.06)',
            }}
          >
            {showAddPanel ? <X size={18} color="#39FF14" /> : <UserPlus size={18} color="#39FF14" />}
          </motion.button>
        </div>

        {/* Online count */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" style={{ boxShadow: '0 0 6px rgba(57,255,20,0.5)' }} />
          <span className="text-white/40 text-xs">
            {onlineCount} {lang === 'ar' ? 'متصل' : 'online'}
          </span>
        </div>
      </div>

      {/* Add friend panel */}
      <AnimatePresence>
        {showAddPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleAddSearch()}
                  placeholder={lang === 'ar' ? 'اسم المستخدم...' : 'Search username...'}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#39FF14]/30 transition-colors"
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAddSearch}
                  disabled={searching}
                  className="px-4 rounded-xl text-sm font-medium"
                  style={{ background: '#39FF14', color: '#0a0a0a' }}
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </motion.button>
              </div>

              {/* Search results */}
              {addResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {addResults.map((r: any) => {
                    const alreadyFriend = (player.friends || []).includes(r.uid);
                    const justAdded = addedFriends.has(r.uid);

                    return (
                      <div
                        key={r.uid}
                        className="flex items-center gap-3 p-2.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${NINJA_COLORS[r.ninjaType || 'neon']}30, transparent)`,
                            border: `1.5px solid ${NINJA_COLORS[r.ninjaType || 'neon']}40`,
                          }}
                        >
                          <img
                            src={`/img/pfp-${r.ninjaType || 'neon'}.png`}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                        <p className="text-white text-sm font-medium flex-1">{r.username}</p>
                        {alreadyFriend ? (
                          <span className="text-[#39FF14] text-xs flex items-center gap-1">
                            <Check size={12} /> {lang === 'ar' ? 'صديق' : 'Friend'}
                          </span>
                        ) : justAdded ? (
                          <span className="text-[#39FF14] text-xs flex items-center gap-1">
                            <Check size={12} /> {lang === 'ar' ? 'تم الإرسال' : 'Sent'}
                          </span>
                        ) : (
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleAddFriend(r.uid)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ background: 'rgba(57,255,20,0.12)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.2)' }}
                          >
                            <UserPlus size={12} className="inline mr-1" />
                            {t(lang, 'add_friend') || (lang === 'ar' ? 'إضافة' : 'Add')}
                          </motion.button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {addResults.length === 0 && addSearch && !searching && (
                <p className="text-white/30 text-xs text-center mt-3">
                  {lang === 'ar' ? 'لم يتم العثور على لاعبين' : 'No players found'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search existing friends */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="#666" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث في الأصدقاء...' : 'Search friends...'}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#39FF14]/30 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={14} color="#666" />
            </button>
          )}
        </div>
      </div>

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ overscrollBehavior: 'contain' }}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin" color="#39FF14" />
          </div>
        )}

        {!loading && filteredFriends.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 opacity-40">
            <Users size={48} color="#39FF14" />
            <p className="text-white/50 text-sm mt-4 text-center px-8">
              {friends.length === 0
                ? (lang === 'ar' ? 'لا أصدقاء بعد. ابحث عن لاعبين لإضافتهم!' : 'No friends yet. Search for players to add!')
                : (lang === 'ar' ? 'لم يتم العثور على نتائج' : 'No results found')}
            </p>
          </div>
        )}

        <AnimatePresence>
          {filteredFriends.map((friend, i) => {
            const ninjaColor = NINJA_COLORS[friend.ninjaType] || '#39FF14';
            const isExpanded = sendingCoinsTo === friend.uid;
            const wasSent = coinsSent === friend.uid;

            return (
              <motion.div
                key={friend.uid}
                variants={listItem}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ delay: i * 0.03 }}
                className="mb-2 rounded-2xl border overflow-hidden"
                style={{
                  background: friend.isOnline ? 'rgba(57,255,20,0.03)' : 'rgba(255,255,255,0.02)',
                  borderColor: friend.isOnline ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.05)',
                }}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${ninjaColor}30, transparent)`,
                        border: `2px solid ${ninjaColor}40`,
                      }}
                    >
                      <img
                        src={`/img/pfp-${friend.ninjaType || 'neon'}.png`}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0a0a0a]"
                      style={{
                        background: friend.isOnline ? '#39FF14' : '#444',
                        boxShadow: friend.isOnline ? '0 0 6px rgba(57,255,20,0.5)' : 'none',
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{friend.username}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {friend.isOnline && friend.currentGame ? (
                        <>
                          <Gamepad2 size={11} color="#39FF14" />
                          <span className="text-[11px] text-[#39FF14] truncate">{friend.currentGame}</span>
                        </>
                      ) : (
                        <span className="text-[11px]" style={{ color: friend.isOnline ? '#39FF14' : '#555' }}>
                          {friend.isOnline
                            ? (t(lang, 'online') || 'Online')
                            : (t(lang, 'offline') || 'Offline')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Voice Call (online friends only) */}
                    {friend.isOnline && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => startCall(friend.uid, friend.username)}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(57,255,20,0.08)' }}
                        title="Voice call"
                      >
                        <Phone size={15} color="#39FF14" />
                      </motion.button>
                    )}

                    {/* Chat */}
                    {onNavigateToChat && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onNavigateToChat(friend.uid)}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(57,255,20,0.08)' }}
                      >
                        <MessageCircle size={15} color="#39FF14" />
                      </motion.button>
                    )}

                    {/* Send coins */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        if (isExpanded) {
                          setSendingCoinsTo(null);
                          setCoinAmount('');
                        } else {
                          setSendingCoinsTo(friend.uid);
                        }
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: wasSent ? 'rgba(57,255,20,0.15)' : 'rgba(255,215,0,0.08)',
                      }}
                    >
                      {wasSent ? (
                        <Check size={15} color="#39FF14" />
                      ) : (
                        <Coins size={15} color="#FFD700" />
                      )}
                    </motion.button>

                    {/* Remove */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleRemoveFriend(friend.uid)}
                      disabled={removingFriend === friend.uid}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255,68,68,0.06)' }}
                    >
                      {removingFriend === friend.uid ? (
                        <Loader2 size={14} className="animate-spin" color="#FF4444" />
                      ) : (
                        <UserMinus size={15} color="#FF4444" />
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Send coins panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1, transition: { duration: 0.2 } }}
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 pb-3">
                        <Coins size={14} color="#FFD700" />
                        <input
                          type="number"
                          value={coinAmount}
                          onChange={(e) => setCoinAmount(e.target.value)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSendCoins(friend.uid)}
                          placeholder={lang === 'ar' ? 'المبلغ...' : 'Amount...'}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#FFD700]/30 transition-colors"
                          style={{ fontSize: '16px' }}
                          min={1}
                          max={player.coins || 0}
                        />
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSendCoins(friend.uid)}
                          disabled={sendingCoins || !coinAmount || parseInt(coinAmount) <= 0}
                          className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                          style={{ background: '#FFD700', color: '#0a0a0a' }}
                        >
                          {sendingCoins ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Send size={12} />
                              {t(lang, 'send_coins') || (lang === 'ar' ? 'إرسال' : 'Send')}
                            </>
                          )}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
