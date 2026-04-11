'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, query, where, orderBy, limit,
  onSnapshot, doc, updateDoc, getDoc
} from 'firebase/firestore';
import { Headphones, X, Send, Minus, GripVertical } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SupportMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'player' | 'admin';
  text: string;
  createdAt: number;
}

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

interface Props {
  player: any;
  pcName?: string;
  isMobile?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SupportBubble({ player, pcName, isMobile = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [showDragTip, setShowDragTip] = useState(false);
  const [hasShownTip, setHasShownTip] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bubble position for dragging
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const dragConstraintsRef = useRef<HTMLDivElement>(null);

  // Find or create support chat for this player
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'support-chats'),
      where('playerId', '==', player.uid),
      where('status', '==', 'open'),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.docs.length > 0) {
        const chatDoc = snap.docs[0];
        const data = chatDoc.data() as SupportChat;
        setChatId(chatDoc.id);
        setUnread(data.unreadPlayer || 0);
      } else {
        setChatId(null);
      }
    });
    return () => unsub();
  }, [player?.uid]);

  // Listen for messages when chat is open
  useEffect(() => {
    if (!chatId) return;
    // Simple query without orderBy to avoid needing composite index
    const q = query(
      collection(db, 'support-messages'),
      where('chatId', '==', chatId),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SupportMessage))
        .sort((a, b) => a.createdAt - b.createdAt);
      setMessages(msgs);
      if (isOpen) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });
    return () => unsub();
  }, [chatId, isOpen]);

  // Clear unread when opening
  useEffect(() => {
    if (isOpen && chatId && unread > 0) {
      updateDoc(doc(db, 'support-chats', chatId), { unreadPlayer: 0 }).catch(() => {});
      setUnread(0);
    }
  }, [isOpen, chatId, unread]);

  const openChat = async () => {
    setIsOpen(true);
    setMinimized(false);

    // Show drag tip on first open
    if (!hasShownTip) {
      setShowDragTip(true);
      setHasShownTip(true);
      setTimeout(() => setShowDragTip(false), 4000);
    }

    // If no open chat exists, create one
    if (!chatId) {
      try {
        const newChat = {
          playerId: player.uid,
          playerName: player.username || 'Player',
          playerNinjaType: player.ninjaType || 'neon',
          pcName: pcName || '',
          status: 'open',
          lastMessage: '',
          lastMessageAt: Date.now(),
          unreadPlayer: 0,
          unreadAdmin: 0,
          createdAt: Date.now(),
        };
        const docRef = await addDoc(collection(db, 'support-chats'), newChat);
        setChatId(docRef.id);
      } catch (err) {
        console.error('Failed to create support chat:', err);
      }
    }

    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !chatId || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      // Add message
      await addDoc(collection(db, 'support-messages'), {
        chatId,
        senderId: player.uid,
        senderName: player.username || 'Player',
        senderRole: 'player',
        text,
        createdAt: Date.now(),
      });

      // Update chat metadata + increment unreadAdmin
      const chatSnap = await getDoc(doc(db, 'support-chats', chatId));
      const currentUnread = chatSnap.exists() ? (chatSnap.data().unreadAdmin || 0) : 0;
      await updateDoc(doc(db, 'support-chats', chatId), {
        lastMessage: text,
        lastMessageAt: Date.now(),
        unreadAdmin: currentUnread + 1,
      });

      // Notify admin via push
      fetch('/api/admin-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new-support-chat', playerName: player.username, details: text.slice(0, 60) }),
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to send support message:', err);
    }
    setSending(false);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const bubbleSize = isMobile ? 'w-12 h-12' : 'w-14 h-14';
  const panelWidth = isMobile ? 'w-[90vw]' : 'w-[380px]';
  const panelHeight = isMobile ? 'h-[70vh]' : 'h-[500px]';

  return (
    <>
      {/* Full-screen drag constraint area */}
      <div ref={dragConstraintsRef} className="fixed inset-0 pointer-events-none z-[89]" />

      {/* Floating Bubble (Draggable) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onTap={openChat}
            className={`fixed ${isMobile ? 'bottom-20 left-4' : 'bottom-6 left-6'} ${bubbleSize} z-[90] rounded-full flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing`}
            style={{
              background: 'linear-gradient(135deg, #39ff14 0%, #00cc44 100%)',
              boxShadow: '0 0 20px rgba(57,255,20,0.4), 0 4px 15px rgba(0,0,0,0.3)',
              touchAction: 'none',
            }}
          >
            <Headphones size={isMobile ? 22 : 26} className="text-black pointer-events-none" />
            {/* Unread badge */}
            {unread > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center pointer-events-none"
              >
                <span className="text-white text-[10px] font-bold">{unread}</span>
              </motion.div>
            )}
            {/* Pulse ring */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-ninja-green pointer-events-none"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag tip */}
      <AnimatePresence>
        {showDragTip && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`fixed ${isMobile ? 'bottom-[88px] left-16' : 'bottom-[72px] left-20'} z-[90] px-3 py-1.5 rounded-lg bg-black/90 border border-ninja-green/20`}
          >
            <p className="font-body text-[10px] text-ninja-green flex items-center gap-1">
              <GripVertical size={10} /> Drag me anywhere!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && !minimized && (
          <motion.div
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.05}
            dragMomentum={false}
            dragListener={false}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className={`fixed ${isMobile ? 'bottom-20 left-4' : 'bottom-6 left-6'} ${panelWidth} ${panelHeight} z-[91] rounded-2xl overflow-hidden flex flex-col`}
            style={{
              background: 'rgba(10,10,10,0.97)',
              border: '1px solid rgba(57,255,20,0.2)',
              boxShadow: '0 0 30px rgba(0,0,0,0.5), 0 0 15px rgba(57,255,20,0.1)',
              backdropFilter: 'blur(20px)',
              touchAction: 'none',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.08) 0%, rgba(0,0,0,0) 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-ninja-green/20 flex items-center justify-center border border-ninja-green/30">
                  <Headphones size={16} className="text-ninja-green" />
                </div>
                <div>
                  <p className="font-ninja text-sm text-ninja-green">NINJA SUPPORT</p>
                  <p className="font-body text-[10px] text-gray-500">We&apos;re here to help</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMinimized(true)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                >
                  <Minus size={14} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin" style={{ touchAction: 'pan-y' }}>
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-16 h-16 rounded-full bg-ninja-green/10 flex items-center justify-center mb-4 border border-ninja-green/20">
                    <Headphones size={28} className="text-ninja-green/60" />
                  </div>
                  <p className="font-ninja text-lg text-ninja-green/80 mb-1">Need Help?</p>
                  <p className="font-body text-xs text-gray-500 leading-relaxed">
                    Send a message and our team will reply as soon as possible.
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isPlayer = msg.senderRole === 'player';
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isPlayer ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%]`}>
                      {!isPlayer && (
                        <p className="text-[9px] font-body text-ninja-green/60 mb-0.5 ml-1">Admin</p>
                      )}
                      <div
                        className={`px-3 py-2 rounded-xl ${
                          isPlayer
                            ? 'bg-ninja-green/15 border border-ninja-green/20 rounded-br-sm'
                            : 'bg-white/5 border border-white/10 rounded-bl-sm'
                        }`}
                      >
                        <p className="font-body text-sm text-white/90 break-words">{msg.text}</p>
                      </div>
                      <p className={`text-[9px] font-body text-gray-600 mt-0.5 ${isPlayer ? 'text-right mr-1' : 'ml-1'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-white/10" style={{ touchAction: 'manipulation' }}>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-body placeholder-gray-600 focus:border-ninja-green/30 outline-none transition-all"
                  autoComplete="off"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={sendMessage}
                  disabled={!inputText.trim() || sending}
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-ninja-green/20 border border-ninja-green/30 text-ninja-green active:bg-ninja-green/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized bar */}
      <AnimatePresence>
        {isOpen && minimized && (
          <motion.button
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onTap={() => setMinimized(false)}
            className={`fixed ${isMobile ? 'bottom-20 left-4' : 'bottom-6 left-6'} z-[91] px-4 py-2.5 rounded-full flex items-center gap-2 cursor-grab active:cursor-grabbing`}
            style={{
              background: 'rgba(10,10,10,0.95)',
              border: '1px solid rgba(57,255,20,0.2)',
              boxShadow: '0 0 15px rgba(0,0,0,0.4)',
              touchAction: 'none',
            }}
          >
            <Headphones size={16} className="text-ninja-green" />
            <span className="font-ninja text-xs text-ninja-green">SUPPORT</span>
            {unread > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] text-white font-bold">
                {unread}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
