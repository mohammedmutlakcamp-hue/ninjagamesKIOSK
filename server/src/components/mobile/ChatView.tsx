'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, doc, query, where, orderBy, onSnapshot, addDoc,
  getDoc, limit as fbLimit,
} from 'firebase/firestore';
import { Lang, t } from '@/lib/translations';
import {
  ArrowLeft, Send, MessageCircle, Hash, Users, Search, X, Phone,
} from 'lucide-react';
import { useVoiceCall } from '@/components/VoiceCallProvider';

// ─── Types ───────────────────────────────────────────────────
interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderNinjaType: string;
  text: string;
  channelId: string;
  createdAt: number;
  type: 'text' | 'image' | 'emoji' | 'system';
}

interface FriendInfo {
  uid: string;
  username: string;
  ninjaType: string;
  isOnline: boolean;
  lastMessage: string;
  lastTimestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────
function getPrivateChannelId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Ninja colors ───────────────────────────────────────────
const NINJA_COLORS: Record<string, string> = {
  neon: '#39FF14', fire: '#FF4500', ice: '#00BFFF', shadow: '#8B00FF',
  cyber: '#9B59B6', gold: '#FFD700', default: '#39FF14',
};

function getNinjaColor(ninjaType?: string): string {
  return NINJA_COLORS[ninjaType || 'default'] || NINJA_COLORS.default;
}

// ─── Animation variants ─────────────────────────────────────
const slideIn = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.12 } },
};

const bubblePop = {
  initial: { opacity: 0, scale: 0.8, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 20, stiffness: 400 } },
};

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════
export function ChatView({ player, lang }: { player: any; lang: Lang }) {
  const { startCall } = useVoiceCall();

  // Tab state: 'public' or 'friends'
  const [activeTopTab, setActiveTopTab] = useState<'public' | 'friends'>('public');

  // State
  const [publicMessages, setPublicMessages] = useState<Message[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Message[]>([]);
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFriend, setActiveFriend] = useState<FriendInfo | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Listen to public messages ─────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('channelId', '==', 'public'),
      fbLimit(200)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setPublicMessages(msgs.slice(-100));
    });

    return () => unsub();
  }, []);

  // ─── Load friends list ─────────────────────────────────────
  useEffect(() => {
    if (!player?.uid) return;
    const friendIds: string[] = player.friends || [];
    if (friendIds.length === 0) { setFriends([]); return; }

    let cancelled = false;

    (async () => {
      const loaded: FriendInfo[] = [];
      for (const fid of friendIds) {
        try {
          const snap = await getDoc(doc(db, 'players', fid));
          if (snap.exists()) {
            const data = snap.data();
            loaded.push({
              uid: fid,
              username: data.username || 'Unknown',
              ninjaType: data.ninjaType || 'neon',
              isOnline: data.isOnline || false,
              lastMessage: '',
              lastTimestamp: 0,
            });
          }
        } catch {}
      }
      if (!cancelled) setFriends(loaded);
    })();

    return () => { cancelled = true; };
  }, [player?.uid, player?.friends]);

  // ─── Listen to last message for each friend (for preview) ──
  useEffect(() => {
    if (!player?.uid || friends.length === 0) return;

    const unsubs: (() => void)[] = [];

    for (const friend of friends) {
      const channelId = getPrivateChannelId(player.uid, friend.uid);
      const q = query(
        collection(db, 'messages'),
        where('channelId', '==', channelId),
        fbLimit(1)
      );

      const unsub = onSnapshot(q, (snapshot) => {
        if (snapshot.docs.length > 0) {
          const msgs = snapshot.docs.map(d => d.data());
          // Get the latest by createdAt
          msgs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          const latest = msgs[0];
          setFriends(prev => prev.map(f =>
            f.uid === friend.uid
              ? { ...f, lastMessage: latest.text || '', lastTimestamp: latest.createdAt || 0 }
              : f
          ));
        }
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach(u => u());
  }, [player?.uid, friends.length]);

  // ─── Listen to private messages when a friend chat is open ─
  useEffect(() => {
    if (!activeFriend || !player?.uid) { setPrivateMessages([]); return; }

    const channelId = getPrivateChannelId(player.uid, activeFriend.uid);
    const q = query(
      collection(db, 'messages'),
      where('channelId', '==', channelId),
      fbLimit(200)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Message[];
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setPrivateMessages(msgs.slice(-100));
    });

    return () => unsub();
  }, [activeFriend?.uid, player?.uid]);

  // ─── Auto-scroll on new messages ───────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [publicMessages, privateMessages]);

  // ─── Send message (public or private) ──────────────────────
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    // Determine channelId
    const channelId = activeFriend
      ? getPrivateChannelId(player.uid, activeFriend.uid)
      : 'public';

    try {
      await addDoc(collection(db, 'messages'), {
        senderId: player.uid,
        senderName: player.username || player.name || 'Anonymous',
        senderNinjaType: player.ninjaType || 'neon',
        text,
        channelId,
        createdAt: Date.now(),
        type: 'text',
      });

      // Send push notification for private messages
      if (activeFriend) {
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Message from ${player.username || 'Someone'}`,
            message: text.slice(0, 100),
            targetUids: [activeFriend.uid],
            data: { type: 'chat_message', senderId: player.uid },
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Send message error:', err);
    }

    setSending(false);
    inputRef.current?.focus();
  }, [inputText, sending, player, activeFriend]);

  // ─── Filtered friends ──────────────────────────────────────
  const filteredFriends = friends
    .filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Online first, then by last message time
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return b.lastTimestamp - a.lastTimestamp;
    });

  // ─── Render a message bubble ───────────────────────────────
  const renderMessage = (msg: Message, i: number, allMsgs: Message[]) => {
    const isMine = msg.senderId === player.uid;
    const showTimestamp = i === 0 || msg.createdAt - allMsgs[i - 1].createdAt > 5 * 60 * 1000;
    const showSenderName = !isMine && (i === 0 || allMsgs[i - 1].senderId !== msg.senderId);
    const color = getNinjaColor(msg.senderNinjaType);

    return (
      <div key={msg.id}>
        {showTimestamp && (
          <div className="text-center my-3">
            <span className="text-[10px] text-white/30 bg-white/5 px-2.5 py-1 rounded-full">
              {formatTime(msg.createdAt)}
            </span>
          </div>
        )}
        <motion.div
          variants={bubblePop}
          initial="initial"
          animate="animate"
          className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5`}
        >
          <div
            className="max-w-[78%] px-3 py-2 rounded-2xl"
            style={{
              background: isMine
                ? 'linear-gradient(135deg, #39FF14, #2BBF10)'
                : 'rgba(255,255,255,0.08)',
              borderBottomRightRadius: isMine ? 4 : 16,
              borderBottomLeftRadius: isMine ? 16 : 4,
            }}
          >
            {showSenderName && (
              <p className="text-[11px] font-semibold mb-0.5" style={{ color }}>
                {msg.senderName}
              </p>
            )}
            <p
              className="text-sm leading-relaxed break-words"
              style={{ color: isMine ? '#0a0a0a' : '#e5e5e5' }}
            >
              {msg.text}
            </p>
            <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
              <span
                className="text-[10px]"
                style={{ color: isMine ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.3)' }}
              >
                {formatMessageTime(msg.createdAt)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  // ─── Input bar component ───────────────────────────────────
  const renderInputBar = () => (
    <div
      className="flex items-center gap-2 px-3 py-2 border-t border-white/10"
      style={{
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && handleSend()}
        placeholder={lang === 'ar' ? 'اكتب رسالة...' : 'Type a message...'}
        className="flex-1 bg-white/8 border border-white/10 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#39FF14]/40 transition-colors"
        style={{ fontSize: '16px' }}
      />
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleSend}
        disabled={!inputText.trim() || sending}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: inputText.trim() ? '#39FF14' : 'rgba(255,255,255,0.08)',
        }}
      >
        <Send size={18} color={inputText.trim() ? '#0a0a0a' : '#666'} />
      </motion.button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  //  PRIVATE CONVERSATION VIEW (full screen overlay)
  // ═══════════════════════════════════════════════════════════
  if (activeFriend) {
    const friendColor = getNinjaColor(activeFriend.ninjaType);

    return (
      <motion.div
        variants={slideIn}
        initial="initial"
        animate="animate"
        exit="exit"
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: '#0a0a0a' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-white/10"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 12px) + 8px)',
            background: 'rgba(10,10,10,0.95)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <button
            onClick={() => { setActiveFriend(null); setInputText(''); }}
            className="p-1 rounded-full active:bg-white/10 transition-colors"
          >
            <ArrowLeft size={22} color="#39FF14" />
          </button>

          {/* Friend avatar */}
          <div className="relative">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                background: `linear-gradient(135deg, ${friendColor}40, ${friendColor}15)`,
                border: `2px solid ${friendColor}60`,
              }}
            >
              <img
                src={`/img/pfp-${activeFriend.ninjaType || 'neon'}.png`}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            {activeFriend.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0a0a0a]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{activeFriend.username}</p>
            <p className="text-xs" style={{ color: activeFriend.isOnline ? '#39FF14' : '#666' }}>
              {activeFriend.isOnline
                ? (t(lang, 'online') || 'Online')
                : (t(lang, 'offline') || 'Offline')}
            </p>
          </div>

          {/* Voice call button */}
          {activeFriend.isOnline && (
            <button
              onClick={() => startCall(activeFriend.uid, activeFriend.username)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:bg-white/10 flex-shrink-0"
              style={{ background: 'rgba(57,255,20,0.08)' }}
              title="Voice call"
            >
              <Phone size={18} color="#39FF14" />
            </button>
          )}

        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1" style={{ overscrollBehavior: 'contain' }}>
          {privateMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-40">
              <MessageCircle size={48} color="#39FF14" />
              <p className="text-white/50 text-sm mt-3">
                {lang === 'ar' ? 'ابدأ المحادثة!' : 'Start the conversation!'}
              </p>
            </div>
          )}
          {privateMessages.map((msg, i) => renderMessage(msg, i, privateMessages))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 8px)' }}>
          {renderInputBar()}
        </div>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  MAIN VIEW (Tabs: Public / Friends)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Tab bar */}
      <div className="flex px-4 pt-2 pb-0 gap-2">
        <button
          onClick={() => setActiveTopTab('public')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: activeTopTab === 'public'
              ? 'rgba(57,255,20,0.15)'
              : 'rgba(255,255,255,0.04)',
            border: `1.5px solid ${activeTopTab === 'public' ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: activeTopTab === 'public' ? '#39FF14' : 'rgba(255,255,255,0.5)',
          }}
        >
          <Hash size={16} />
          {lang === 'ar' ? 'العام' : 'Public'}
        </button>
        <button
          onClick={() => setActiveTopTab('friends')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: activeTopTab === 'friends'
              ? 'rgba(57,255,20,0.15)'
              : 'rgba(255,255,255,0.04)',
            border: `1.5px solid ${activeTopTab === 'friends' ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: activeTopTab === 'friends' ? '#39FF14' : 'rgba(255,255,255,0.5)',
          }}
        >
          <Users size={16} />
          {t(lang, 'friends') || 'Friends'}
        </button>
      </div>

      {/* ═══ PUBLIC TAB ═══ */}
      {activeTopTab === 'public' && (
        <div className="flex-1 flex flex-col min-h-0 mt-2">
          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-2 space-y-1"
            style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as any}
          >
            {publicMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-40">
                <Hash size={48} color="#39FF14" />
                <p className="text-white/50 text-sm mt-3">
                  {lang === 'ar' ? 'لا توجد رسائل بعد. كن أول من يرسل!' : 'No messages yet. Be the first!'}
                </p>
              </div>
            )}
            {publicMessages.map((msg, i) => renderMessage(msg, i, publicMessages))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar — at bottom of chat container */}
          {renderInputBar()}
        </div>
      )}

      {/* ═══ FRIENDS TAB ═══ */}
      {activeTopTab === 'friends' && (
        <div className="flex-1 flex flex-col min-h-0 mt-2">
          {/* Search */}
          <div className="px-4 pb-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" color="#666" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'ar' ? 'بحث...' : 'Search friends...'}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#39FF14]/30 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X size={14} color="#666" />
                </button>
              )}
            </div>
          </div>

          {/* Friends list */}
          <div
            className="flex-1 overflow-y-auto px-4 pb-[80px]"
            style={{ overscrollBehavior: 'contain' }}
          >
            {filteredFriends.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 opacity-40">
                <Users size={48} color="#39FF14" />
                <p className="text-white/50 text-sm mt-4 text-center px-8">
                  {friends.length === 0
                    ? (lang === 'ar'
                        ? 'لا يوجد أصدقاء بعد. أضف أصدقاء لبدء المحادثة!'
                        : 'No friends yet. Add friends to start chatting!')
                    : (lang === 'ar' ? 'لا توجد نتائج' : 'No results found')}
                </p>
              </div>
            )}

            <AnimatePresence>
              {filteredFriends.map((friend, i) => {
                const friendColor = getNinjaColor(friend.ninjaType);
                return (
                  <motion.button
                    key={friend.uid}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                    exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setActiveFriend(friend); setInputText(''); }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl mb-1.5 text-left transition-colors active:bg-white/5"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${friendColor}30, transparent)`,
                          border: `2px solid ${friendColor}40`,
                        }}
                      >
                        <img
                          src={`/img/pfp-${friend.ninjaType || 'neon'}.png`}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      {friend.isOnline && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-[#0a0a0a]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-white font-semibold truncate">
                          {friend.username}
                        </p>
                        {friend.lastTimestamp > 0 && (
                          <span className="text-[11px] text-white/30 flex-shrink-0 ml-2">
                            {formatTime(friend.lastTimestamp)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-white/30 truncate">
                          {friend.lastMessage || (lang === 'ar' ? 'اضغط لبدء المحادثة' : 'Tap to start chatting')}
                        </p>
                        {friend.isOnline && (
                          <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: '#39FF14' }}>
                            {t(lang, 'online') || 'Online'}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
