'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, query, where, limit,
  onSnapshot, doc, updateDoc, getDocs, deleteDoc, arrayUnion, arrayRemove, getDoc
} from 'firebase/firestore';
import {
  MessageCircle, X, Minus, Send, Smile, Image as ImageIcon,
  Phone, Hash, Lock, Users, UserPlus, Plus, Shield
} from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { notifyAdmin } from '@/lib/notify-admin';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderNinjaType: string;
  text: string;
  imageUrl?: string;
  channelId: string;
  createdAt: number;
  type: 'text' | 'image' | 'emoji' | 'system';
}

interface ChatTab {
  id: string;
  name: string;
  unread: number;
  isGroup?: boolean;
  isClub?: boolean;
  pinned?: boolean;  // pinned tabs (public, club) cannot be closed
}

interface GroupChat {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberNames: Record<string, string>;
  createdAt: number;
}

interface Props {
  player: any;
  hideBubble?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EMOJIS = [
  '😀', '😂', '🤣', '😍', '🥰', '😎', '🤩', '🥳',
  '😤', '😡', '🤬', '😱', '🥵', '🥶', '🔥', '💯',
  '🎮', '🏆', '⚔️', '🎯', '💀', '👑', '🤝', '👊',
  '✌️', '🎉', '🎊', '💰', '🪙', '🎁', '🍕', '🍔',
  '🥤', '☕', '🍩', '🐱', '🐶', '💚', '🖤', '🫡',
];

const NINJA_COLORS: Record<string, string> = {
  neon: '#39ff14', fire: '#ff4500', ice: '#00bfff',
  shadow: '#8b00ff', gold: '#ffd700', default: '#39ff14',
};

function getNinjaColor(ninjaType?: string): string {
  return NINJA_COLORS[ninjaType || 'default'] || NINJA_COLORS.default;
}

function getPrivateChannelId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ChatBubble({ player, hideBubble = false }: Props) {
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('public');
  const [tabs, setTabs] = useState<ChatTab[]>([{ id: 'public', name: 'Public', unread: 0, pinned: true }]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);

  // Group chat state
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [friendsList, setFriendsList] = useState<{ uid: string; username: string; ninjaType: string }[]>([]);
  const [showAddToGroup, setShowAddToGroup] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showNewChatPicker, setShowNewChatPicker] = useState(false);
  const [groupStep, setGroupStep] = useState<'members' | 'name'>('members');

  // Bubble drag state
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);
  const dragMovedRef = useRef(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const activeChannelId = useMemo(() => {
    if (activeTab === 'public') return 'public';
    if (activeTab === 'club') return player.clubId ? `club_${player.clubId}` : 'public';
    const groupChat = groupChats.find(g => g.id === activeTab);
    if (groupChat) return `group_${activeTab}`;
    return getPrivateChannelId(player.uid, activeTab);
  }, [activeTab, player.uid, player.clubId, groupChats]);

  // Add/remove the pinned Club chat tab based on the player's clubId.
  useEffect(() => {
    setTabs(prev => {
      const hasClub = prev.some(t => t.id === 'club');
      if (player?.clubId) {
        if (hasClub) return prev;
        // Insert right after public
        const publicIdx = prev.findIndex(t => t.id === 'public');
        const newTabs = [...prev];
        newTabs.splice(publicIdx + 1, 0, { id: 'club', name: 'Club', unread: 0, isClub: true, pinned: true });
        return newTabs;
      } else {
        if (!hasClub) return prev;
        return prev.filter(t => t.id !== 'club');
      }
    });
    // If we were on the club tab and the player left the club, fall back to public.
    if (!player?.clubId && activeTab === 'club') setActiveTab('public');
  }, [player?.clubId, activeTab]);

  const currentMessages = useMemo(() => {
    return messages[activeChannelId] || [];
  }, [messages, activeChannelId]);

  const activeTabIsGroup = useMemo(() => {
    return tabs.find(t => t.id === activeTab)?.isGroup || false;
  }, [tabs, activeTab]);

  // ─── Firestore Listeners ──────────────────────────────────────────────────

  // Load friends list for group creation
  useEffect(() => {
    const friendIds: string[] = player.friends || [];
    if (friendIds.length === 0) return;
    const unsubs = friendIds.map(fid =>
      onSnapshot(doc(db, 'players', fid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFriendsList(prev => {
            const idx = prev.findIndex(f => f.uid === fid);
            const fd = { uid: fid, username: data.username, ninjaType: data.ninjaType || 'neon' };
            if (idx >= 0) { const u = [...prev]; u[idx] = fd; return u; }
            return [...prev, fd];
          });
        }
      })
    );
    return () => unsubs.forEach(u => u());
  }, [player.friends]);

  // Load group chats
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'group-chats'),
      where('members', 'array-contains', player.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const groups: GroupChat[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupChat));
      setGroupChats(groups);
      setTabs(prev => {
        const newTabs = [...prev];
        groups.forEach(g => {
          if (!newTabs.find(t => t.id === g.id)) {
            newTabs.push({ id: g.id, name: g.name, unread: 0, isGroup: true });
          }
        });
        return newTabs.map(t => {
          const group = groups.find(g => g.id === t.id);
          if (group) return { ...t, name: group.name };
          return t;
        });
      });
    });
    return () => unsub();
  }, [player?.uid]);

  // Listen to public channel messages
  useEffect(() => {
    const q = query(collection(db, 'messages'), where('channelId', '==', 'public'), limit(200));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const trimmed = msgs.slice(-100);
      setMessages(prev => {
        const prevMsgs = prev['public'] || [];
        const newCount = trimmed.length - prevMsgs.length;
        if (newCount > 0 && activeTab !== 'public') {
          setTabs(t => t.map(tab => tab.id === 'public' ? { ...tab, unread: tab.unread + newCount } : tab));
        }
        return { ...prev, public: trimmed };
      });
    });
    return () => unsub();
  }, [activeTab]);

  // Listen to private + group + club channel messages
  useEffect(() => {
    const nonPublicTabs = tabs.filter(t => t.id !== 'public');
    if (nonPublicTabs.length === 0) return;

    const unsubs: (() => void)[] = [];
    for (const tab of nonPublicTabs) {
      let channelId: string;
      if (tab.isClub) {
        if (!player.clubId) continue; // Can't subscribe without a clubId
        channelId = `club_${player.clubId}`;
      } else if (tab.isGroup) {
        channelId = `group_${tab.id}`;
      } else {
        channelId = getPrivateChannelId(player.uid, tab.id);
      }
      const q = query(collection(db, 'messages'), where('channelId', '==', channelId), limit(200));
      const unsub = onSnapshot(q, (snapshot) => {
        const msgs: Message[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const trimmed = msgs.slice(-100);
        setMessages(prev => {
          const prevMsgs = prev[channelId] || [];
          const newCount = trimmed.length - prevMsgs.length;
          if (newCount > 0 && activeTab !== tab.id) {
            setTabs(t => t.map(tb => tb.id === tab.id ? { ...tb, unread: tb.unread + newCount } : tb));
          }
          return { ...prev, [channelId]: trimmed };
        });
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u => u());
  }, [tabs.map(t => t.id).join(','), player.uid, player.clubId, activeTab]);

  // Update total unread + broadcast to other components (GamesTab chat button badge).
  useEffect(() => {
    const total = tabs.reduce((sum, t) => sum + t.unread, 0);
    setUnreadTotal(total);
    window.dispatchEvent(new CustomEvent('chat-unread-count', { detail: total }));
  }, [tabs]);

  // Auto-scroll — scroll only the messages container, NOT the page.
  // Using scrollIntoView() on a fixed-position panel can bubble up and scroll
  // the document, which is what caused the chat to "fly up" on click/scroll.
  useEffect(() => {
    const c = messagesContainerRef.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [currentMessages]);

  // Clear unread on tab switch
  useEffect(() => {
    setTabs(t => t.map(tab => tab.id === activeTab ? { ...tab, unread: 0 } : tab));
    setShowEmojiPicker(false);
  }, [activeTab]);

  // ─── Custom Event Listeners ───────────────────────────────────────────────

  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const { friendId, friendName } = (e as CustomEvent).detail;
      setTabs(prev => {
        if (prev.find(t => t.id === friendId)) return prev;
        return [...prev, { id: friendId, name: friendName, unread: 0 }];
      });
      setActiveTab(friendId);
      setIsOpen(true);
    };

    const handleStartCall = (e: Event) => {
      const { friendId, friendName } = (e as CustomEvent).detail;
      // Open chat tab for this friend (call UI is handled by KioskVoiceCall)
      setTabs(prev => {
        if (prev.find(t => t.id === friendId)) return prev;
        return [...prev, { id: friendId, name: friendName, unread: 0 }];
      });
      setActiveTab(friendId);
      setIsOpen(true);
    };

    const handleOpenPanel = () => { setIsOpen(true); };

    window.addEventListener('open-private-chat', handleOpenChat);
    window.addEventListener('start-voice-call', handleStartCall);
    window.addEventListener('open-chat-panel', handleOpenPanel);
    return () => {
      window.removeEventListener('open-private-chat', handleOpenChat);
      window.removeEventListener('start-voice-call', handleStartCall);
      window.removeEventListener('open-chat-panel', handleOpenPanel);
    };
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (type: 'text' | 'emoji' | 'image' = 'text', content?: string, imageUrl?: string) => {
      const text = content || inputText.trim();
      if (!text && !imageUrl) return;
      try {
        await addDoc(collection(db, 'messages'), {
          senderId: player.uid,
          senderName: player.username || player.name || 'Anonymous',
          senderNinjaType: player.ninjaType || 'neon',
          text: text || '',
          ...(imageUrl ? { imageUrl } : {}),
          channelId: activeChannelId,
          createdAt: Date.now(),
          type,
        });
        if (activeChannelId !== 'public' && !activeTabIsGroup) {
          fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${player.username || 'Someone'}`,
              message: (text || '').slice(0, 100) || 'Image',
              targetUids: [activeTab],
            }),
          }).catch(() => {});
        }
        if (activeTabIsGroup) {
          const group = groupChats.find(g => g.id === activeTab);
          if (group) {
            const otherMembers = group.members.filter(m => m !== player.uid);
            fetch('/api/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: `${group.name}`,
                message: `${player.username}: ${(text || '').slice(0, 80) || 'Image'}`,
                targetUids: otherMembers,
              }),
            }).catch(() => {});
          }
        }
        // Notify admin of all chat messages
        notifyAdmin('chat', `Chat: ${player.username || 'Player'}`, (text || '').slice(0, 120) || 'Sent an image');
        if (type === 'text') setInputText('');
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [inputText, activeChannelId, player, activeTab, activeTabIsGroup, groupChats]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleEmojiClick = useCallback((emoji: string) => {
    sendMessage('emoji', emoji);
    setShowEmojiPicker(false);
  }, [sendMessage]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('Image must be under 10MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => sendMessage('image', '', ev.target?.result as string);
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [sendMessage]);

  const openPrivateChat = useCallback((friendUid: string, friendName: string) => {
    setTabs(prev => {
      if (prev.find(t => t.id === friendUid)) return prev;
      return [...prev, { id: friendUid, name: friendName, unread: 0 }];
    });
    setActiveTab(friendUid);
    if (!isOpen) setIsOpen(true);
  }, [isOpen]);

  const closeTab = useCallback((tabId: string) => {
    if (tabId === 'public') return;
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTab === tabId) setActiveTab('public');
  }, [activeTab]);

  // ─── Group Chat CRUD ──────────────────────────────────────────────────────

  const createGroup = useCallback(async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;
    try {
      const members = [player.uid, ...selectedMembers];
      const memberNames: Record<string, string> = { [player.uid]: player.username || 'Anonymous' };
      selectedMembers.forEach(uid => {
        const f = friendsList.find(fr => fr.uid === uid);
        if (f) memberNames[uid] = f.username;
      });
      const docRef = await addDoc(collection(db, 'group-chats'), {
        name: newGroupName.trim(),
        createdBy: player.uid,
        members,
        memberNames,
        createdAt: Date.now(),
      });
      await addDoc(collection(db, 'messages'), {
        senderId: 'system',
        senderName: 'System',
        senderNinjaType: 'neon',
        text: `${player.username} created the group "${newGroupName.trim()}"`,
        channelId: `group_${docRef.id}`,
        createdAt: Date.now(),
        type: 'system',
      });
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
      setActiveTab(docRef.id);
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  }, [newGroupName, selectedMembers, player, friendsList]);

  const addMemberToGroup = useCallback(async (groupId: string, memberId: string) => {
    try {
      const friend = friendsList.find(f => f.uid === memberId);
      await updateDoc(doc(db, 'group-chats', groupId), {
        members: arrayUnion(memberId),
        [`memberNames.${memberId}`]: friend?.username || 'Unknown',
      });
      await addDoc(collection(db, 'messages'), {
        senderId: 'system',
        senderName: 'System',
        senderNinjaType: 'neon',
        text: `${player.username} added ${friend?.username || 'someone'} to the group`,
        channelId: `group_${groupId}`,
        createdAt: Date.now(),
        type: 'system',
      });
      setShowAddToGroup(null);
    } catch (err) {
      console.error('Failed to add member:', err);
    }
  }, [friendsList, player]);

  const leaveGroup = useCallback(async (groupId: string) => {
    try {
      await updateDoc(doc(db, 'group-chats', groupId), {
        members: arrayRemove(player.uid),
      });
      await addDoc(collection(db, 'messages'), {
        senderId: 'system',
        senderName: 'System',
        senderNinjaType: 'neon',
        text: `${player.username} left the group`,
        channelId: `group_${groupId}`,
        createdAt: Date.now(),
        type: 'system',
      });
      closeTab(groupId);
    } catch (err) {
      console.error('Failed to leave group:', err);
    }
  }, [player, closeTab]);

  // ─── Bubble Drag ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    dragStartRef.current = { x: clientX, y: clientY, bx: bubblePos.x, by: bubblePos.y };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, [bubblePos]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMovedRef.current = true;
    setBubblePos({ x: dragStartRef.current.bx + dx, y: dragStartRef.current.by + dy });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) handleDragMove(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchEnd = () => handleDragEnd();
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  // Hacker-terminal style message renderer
  const renderMessage = (msg: Message) => {
    const isOwn = msg.senderId === player.uid;
    const isSystem = msg.type === 'system';
    const color = getNinjaColor(msg.senderNinjaType);

    if (isSystem) {
      return (
        <div key={msg.id} className="flex items-center gap-2 my-1.5 text-gray-500 font-mono text-[11px]">
          <span className="text-yellow-500/60">[SYSTEM]</span>
          <span className="italic opacity-70">{msg.text}</span>
        </div>
      );
    }

    // Terminal-style log line:  >  [HH:MM]  <username>  message
    const ownColor = '#39FF14';
    const textColor = isOwn ? ownColor : color;
    return (
      <div key={msg.id} className="mb-1" style={{ color: 'rgba(220,230,210,0.92)' }}>
        {/* Meta line — timestamp, username, and any text content */}
        <div className="font-mono text-[12px] leading-relaxed flex items-start gap-1.5 break-words">
          <span className="text-ninja-green/60 flex-shrink-0 select-none" style={{ color: textColor, opacity: 0.7 }}>&gt;</span>
          <span className="text-gray-600 flex-shrink-0">[{formatTime(msg.createdAt)}]</span>
          <span className="flex-shrink-0 font-bold" style={{ color: textColor, textShadow: `0 0 6px ${textColor}55` }}>
            &lt;{msg.senderName}&gt;
          </span>
          <span className="flex-1 min-w-0">
            {msg.type === 'image' && msg.imageUrl && <span className="text-cyan-400">[IMG]</span>}
            {msg.type === 'emoji' ? <span className="text-2xl ml-1">{msg.text}</span> : msg.text && <span className="ml-1">{msg.text}</span>}
          </span>
        </div>
        {/* Image — own row, flush LEFT to the chat column (no indent under the username) */}
        {msg.type === 'image' && msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="shared"
            className="block mt-1 max-w-[220px] max-h-[180px] rounded cursor-pointer self-start"
            style={{ marginLeft: 0 }}
            onClick={() => window.open(msg.imageUrl, '_blank')}
          />
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const accentColor = getNinjaColor(player.ninjaType);
  const currentGroup = groupChats.find(g => g.id === activeTab);

  return (
    <>
      {/* ── Floating Bubble ──────────────────────────────────────────── */}
      <AnimatePresence>
        {!isOpen && !hideBubble && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed z-[180] cursor-pointer select-none"
            style={{ bottom: 24 - bubblePos.y, right: 24 - bubblePos.x }}
            onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
            onTouchStart={(e) => { if (e.touches[0]) handleDragStart(e.touches[0].clientX, e.touches[0].clientY); }}
            onClick={() => { if (!dragMovedRef.current) setIsOpen(true); }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-black/40 transition-transform hover:scale-110"
              style={{ background: 'linear-gradient(135deg, #1a1e28, #0f1015)', border: `2px solid ${accentColor}44`, boxShadow: `0 0 20px ${accentColor}22, 0 4px 16px rgba(0,0,0,0.5)` }}
            >
              <MessageCircle size={24} style={{ color: accentColor }} />
            </div>
            {unreadTotal > 0 && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg">
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </motion.div>
            )}
            {unreadTotal > 0 && (
              <motion.div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${accentColor}` }}
                animate={{ scale: [1, 1.4], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={chatPanelRef}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="fixed bottom-6 right-6 z-[180] flex flex-col overflow-hidden"
            style={{
              width: 400, height: 540,
              background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              border: `1.5px solid ${accentColor}44`, borderRadius: 16,
              boxShadow: `0 0 40px ${accentColor}22, 0 8px 32px rgba(0,0,0,0.6)`,
            }}
          >
            {/* ═══ Animated hacker-terminal background ═══ */}
            {/* Breathing glow */}
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
            {/* PCB grid */}
            <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
              backgroundImage: `linear-gradient(rgba(57,255,20,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.1) 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }} />
            {/* Hex pattern */}
            <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.05'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 52px',
            }} />
            {/* Radial glows */}
            <div className="absolute inset-0 pointer-events-none z-0" style={{
              background: 'radial-gradient(ellipse at 50% 0%, rgba(57,255,20,0.1) 0%, transparent 45%), radial-gradient(ellipse at 20% 60%, rgba(0,200,255,0.05) 0%, transparent 45%), radial-gradient(ellipse at 80% 90%, rgba(168,85,247,0.05) 0%, transparent 45%)',
            }} />
            {/* Energy orbs — low-intensity so no scroll repaint fighting */}
            <div className="absolute left-[10%] top-[15%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.55) 0%, transparent 70%)', boxShadow: '0 0 9px rgba(57,255,20,0.35)' }} />
            <div className="absolute right-[12%] top-[48%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 9px rgba(0,200,255,0.3)' }} />
            <div className="absolute left-[40%] bottom-[12%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 9px rgba(168,85,247,0.3)' }} />
            {/* Top neon edge */}
            <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}bb, rgba(0,200,255,0.35), transparent)`,
              boxShadow: `0 0 14px ${accentColor}66`,
            }} />
            {/* Left neon bar */}
            <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{
              background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #39FF14)',
              boxShadow: '0 0 8px rgba(57,255,20,0.3)',
            }} />
            {/* HUD corners */}
            {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
              <div key={ci} className={`absolute ${pos} w-4 h-4 z-[2] pointer-events-none`} style={{
                ...(pos.includes('top') ? { borderTop: `2px solid ${accentColor}` } : { borderBottom: `2px solid ${accentColor}` }),
                ...(pos.includes('left') ? { borderLeft: `2px solid ${accentColor}` } : { borderRight: `2px solid ${accentColor}` }),
                opacity: 0.85,
                filter: `drop-shadow(0 0 5px ${accentColor})`,
              }} />
            ))}

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="relative z-[5] flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: `1px solid ${accentColor}25`, background: `linear-gradient(180deg, ${accentColor}0c 0%, transparent 100%)` }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={16} style={{ color: accentColor, filter: `drop-shadow(0 0 4px ${accentColor})` }} />
                <span className="font-mono text-[13px] tracking-wide font-bold" style={{ color: accentColor, textShadow: `0 0 6px ${accentColor}88` }}>
                  &gt; NINJA_CHAT
                </span>
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="font-mono text-[13px] font-bold -ml-1"
                  style={{ color: accentColor }}
                >
                  _
                </motion.span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Add member to group */}
                {activeTabIsGroup && currentGroup && (
                  <button onClick={() => setShowAddToGroup(currentGroup.id)}
                    className="relative w-8 h-8 rounded-md flex items-center justify-center transition-all hover:brightness-125"
                    style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.4)', color: '#C084FC', boxShadow: '0 0 6px rgba(168,85,247,0.18)' }}
                    title="Add member">
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid #A855F7', borderLeft: '1px solid #A855F7' }} />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid #A855F7', borderRight: '1px solid #A855F7' }} />
                    <UserPlus size={14} />
                  </button>
                )}
                {/* 1:1 call button — dispatches event, handled by KioskVoiceCall */}
                {activeTab !== 'public' && activeTab !== 'club' && !activeTabIsGroup && (
                  <button onClick={() => {
                    const tab = tabs.find(t => t.id === activeTab);
                    if (tab) {
                      window.dispatchEvent(new CustomEvent('start-voice-call', { detail: { friendId: activeTab, friendName: tab.name } }));
                    }
                  }}
                  className="relative w-8 h-8 rounded-md flex items-center justify-center transition-all hover:brightness-125"
                  style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.4)', color: '#39FF14', boxShadow: '0 0 6px rgba(57,255,20,0.18)' }}
                  title="Voice call">
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid #39FF14', borderLeft: '1px solid #39FF14' }} />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid #39FF14', borderRight: '1px solid #39FF14' }} />
                    <Phone size={14} />
                  </button>
                )}
                {/* NEW CHAT button → dropdown menu (same behavior as before, just text label) */}
                <div className="relative">
                  <button onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className="relative h-8 px-2.5 rounded-md flex items-center gap-1 font-ninja text-[10px] tracking-wider transition-all hover:brightness-125"
                    style={{ background: 'rgba(0,191,255,0.1)', border: '1px solid rgba(0,191,255,0.4)', color: '#00BFFF', boxShadow: '0 0 6px rgba(0,191,255,0.18)', textShadow: '0 0 4px rgba(0,191,255,0.5)' }}
                    title="New chat">
                    <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid #00BFFF', borderLeft: '1px solid #00BFFF' }} />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid #00BFFF', borderRight: '1px solid #00BFFF' }} />
                    NEW CHAT
                  </button>
                  <AnimatePresence>
                    {showPlusMenu && !showNewChatPicker && (
                      <motion.div initial={{ opacity: 0, y: -5, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        className="absolute top-full right-0 mt-1 w-48 rounded-xl overflow-hidden z-30"
                        style={{ background: 'rgba(12,14,18,0.97)', border: `1px solid ${accentColor}20`, backdropFilter: 'blur(16px)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <button onClick={() => setShowNewChatPicker(true)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-all">
                          <MessageCircle size={14} className="text-blue-400" />
                          <span className="font-ninja text-[11px] text-white tracking-wider">NEW CHAT</span>
                        </button>
                        <div className="h-px mx-2" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        <button onClick={() => {
                          setShowPlusMenu(false);
                          setShowCreateGroup(true);
                          setGroupStep('members');
                          setSelectedMembers([]);
                          setNewGroupName('');
                        }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-all">
                          <Users size={14} className="text-purple-400" />
                          <span className="font-ninja text-[11px] text-white tracking-wider">NEW GROUP</span>
                        </button>
                      </motion.div>
                    )}
                    {showPlusMenu && showNewChatPicker && (
                      <motion.div initial={{ opacity: 0, y: -5, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        className="absolute top-full right-0 mt-1 w-56 rounded-xl overflow-hidden z-30"
                        style={{ background: 'rgba(12,14,18,0.97)', border: `1px solid ${accentColor}20`, backdropFilter: 'blur(16px)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
                          <span className="font-ninja text-[10px] text-gray-400 tracking-wider">SELECT FRIEND</span>
                          <button onClick={() => { setShowNewChatPicker(false); setShowPlusMenu(false); }}
                            className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-gray-500"><X size={10} /></button>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto">
                          {friendsList.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-4">No friends yet</p>
                          ) : friendsList.map(f => (
                            <button key={f.uid} onClick={() => {
                              setShowPlusMenu(false);
                              setShowNewChatPicker(false);
                              openPrivateChat(f.uid, f.username);
                            }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05] transition-all">
                              <img src={`/img/pfp-${f.ninjaType}.png`} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                              <span className="font-body text-xs text-gray-300">{f.username}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button onClick={() => setIsOpen(false)}
                  className="relative w-8 h-8 rounded-md flex items-center justify-center transition-all hover:brightness-125"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af' }}
                  title="Minimize">
                  <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.3)' }} />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.3)', borderRight: '1px solid rgba(255,255,255,0.3)' }} />
                  <Minus size={14} />
                </button>
              </div>
            </div>

            {/* ── Tab Bar ────────────────────────────────────────────── */}
            <div className="relative z-[5] flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto flex-shrink-0 scrollbar-hide"
              style={{ borderBottom: `1px solid ${accentColor}20` }}>
              {tabs.map(tab => {
                const isActive = tab.id === activeTab;
                const isPublic = tab.id === 'public';
                const isClub = tab.id === 'club';
                const isPinned = tab.pinned || isPublic || isClub;
                const tabColor = isClub ? '#A855F7' : accentColor;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                    style={isActive ? { background: `${tabColor}15`, borderBottom: `2px solid ${tabColor}` } : {}}>
                    {isPublic ? <Hash size={12} style={{ color: isActive ? tabColor : undefined }} />
                      : isClub ? <Shield size={12} style={{ color: isActive ? tabColor : undefined }} />
                      : tab.isGroup ? <Users size={12} style={{ color: isActive ? tabColor : undefined }} />
                      : <Lock size={10} style={{ color: isActive ? tabColor : undefined }} />}
                    <span className="max-w-[70px] truncate">{tab.name}</span>
                    {tab.unread > 0 && (
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] text-white font-bold flex items-center justify-center">
                        {tab.unread}
                      </span>
                    )}
                    {!isPinned && (
                      <span onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                        className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/10 text-gray-500 hover:text-gray-300">
                        <X size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Create Group Modal ─────────────────────────────────── */}
            <AnimatePresence>
              {showCreateGroup && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="flex-shrink-0 overflow-hidden border-b border-white/5" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-ninja text-xs text-white tracking-wider">
                        {groupStep === 'members' ? 'SELECT MEMBERS' : 'NAME YOUR GROUP'}
                      </span>
                      <button onClick={() => { setShowCreateGroup(false); setSelectedMembers([]); setGroupStep('members'); setNewGroupName(''); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 text-gray-500">
                        <X size={12} />
                      </button>
                    </div>
                    {groupStep === 'members' ? (
                      <>
                        <p className="font-body text-[10px] text-gray-500">Choose who to add:</p>
                        <div className="max-h-[140px] overflow-y-auto space-y-1">
                          {friendsList.map(f => {
                            const selected = selectedMembers.includes(f.uid);
                            return (
                              <button key={f.uid} onClick={() => setSelectedMembers(prev =>
                                selected ? prev.filter(id => id !== f.uid) : [...prev, f.uid]
                              )} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all ${
                                selected ? 'bg-purple-500/10 border border-purple-500/20' : 'hover:bg-white/5 border border-transparent'
                              }`}>
                                <img src={`/img/pfp-${f.ninjaType}.png`} alt="" className="w-7 h-7 rounded-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                                <span className="text-xs text-gray-300 flex-1">{f.username}</span>
                                {selected && <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                                  <span className="text-[9px] text-white font-bold">✓</span>
                                </div>}
                              </button>
                            );
                          })}
                        </div>
                        {selectedMembers.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {selectedMembers.map(uid => {
                              const f = friendsList.find(fr => fr.uid === uid);
                              return f ? (
                                <span key={uid} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/20 text-[9px] text-purple-300">
                                  {f.username}
                                  <button onClick={() => setSelectedMembers(prev => prev.filter(id => id !== uid))} className="text-purple-400 hover:text-white"><X size={8} /></button>
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                        <button onClick={() => setGroupStep('name')} disabled={selectedMembers.length === 0}
                          className="w-full ninja-btn ninja-btn-purple ninja-btn-sm font-ninja text-xs tracking-wider py-2">
                          NEXT — {selectedMembers.length} selected
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                          {selectedMembers.map(uid => {
                            const f = friendsList.find(fr => fr.uid === uid);
                            return f ? (
                              <span key={uid} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-[9px] text-purple-300">
                                <img src={`/img/pfp-${f.ninjaType}.png`} alt="" className="w-4 h-4 rounded-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                                {f.username}
                              </span>
                            ) : null;
                          })}
                        </div>
                        <NinjaInput icon={<Users size={14} />} type="text" value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)} placeholder="Enter group name..." maxLength={30} autoFocus />
                        <div className="flex gap-2">
                          <button onClick={() => setGroupStep('members')}
                            className="flex-1 ninja-btn ninja-btn-ghost ninja-btn-sm font-ninja text-xs py-2">BACK</button>
                          <button onClick={createGroup} disabled={!newGroupName.trim()}
                            className="flex-1 ninja-btn ninja-btn-green-fill ninja-btn-sm font-ninja text-xs tracking-wider py-2">
                            CREATE
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Add to Group Modal ──────────────────────────────────── */}
            <AnimatePresence>
              {showAddToGroup && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="flex-shrink-0 overflow-hidden border-b border-white/5" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-ninja text-xs text-white tracking-wider">ADD MEMBER</span>
                      <button onClick={() => setShowAddToGroup(null)}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 text-gray-500">
                        <X size={12} />
                      </button>
                    </div>
                    <div className="max-h-[150px] overflow-y-auto space-y-1">
                      {friendsList.filter(f => {
                        const group = groupChats.find(g => g.id === showAddToGroup);
                        return group ? !group.members.includes(f.uid) : true;
                      }).map(f => (
                        <button key={f.uid} onClick={() => {
                          addMemberToGroup(showAddToGroup!, f.uid);
                        }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/5 transition-all">
                          <img src={`/img/pfp-${f.ninjaType}.png`} alt="" className="w-6 h-6 rounded-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                          <span className="text-xs text-gray-300 flex-1">{f.username}</span>
                          <UserPlus size={12} className="text-ninja-green" />
                        </button>
                      ))}
                      {friendsList.filter(f => {
                        const group = groupChats.find(g => g.id === showAddToGroup);
                        return group ? !group.members.includes(f.uid) : true;
                      }).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-3">No friends to add</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Group Info Bar ──────────────────────────────────────── */}
            {activeTabIsGroup && currentGroup && (
              <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
                style={{ borderBottom: `1px solid ${accentColor}08`, background: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center gap-1.5">
                  <Users size={11} className="text-gray-500" />
                  <span className="text-[10px] text-gray-500">{currentGroup.members.length} members</span>
                </div>
                <button onClick={() => leaveGroup(currentGroup.id)}
                  className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors">Leave</button>
              </div>
            )}

            {/* ── Messages Area ──────────────────────────────────────── */}
            <div ref={messagesContainerRef} className="relative z-[5] flex-1 overflow-y-auto px-3 py-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {currentMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <MessageCircle size={32} className="mb-2 opacity-30" />
                  <span className="text-sm opacity-50">No messages yet</span>
                  <span className="text-xs opacity-30 mt-1">Be the first to say something!</span>
                </div>
              ) : (
                currentMessages.map(renderMessage)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Emoji Picker ────────────────────────────────────────── */}
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="flex-shrink-0 overflow-hidden" style={{ borderTop: `1px solid ${accentColor}10` }}>
                  <div className="grid grid-cols-8 gap-1 p-3 max-h-[140px] overflow-y-auto">
                    {EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => handleEmojiClick(emoji)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-xl hover:bg-white/10 active:scale-90 transition-all">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Input Area ──────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
              style={{ borderTop: `1px solid ${accentColor}12`, background: `linear-gradient(0deg, ${accentColor}05 0%, transparent 100%)` }}>
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showEmojiPicker ? 'bg-white/10 text-yellow-400' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                title="Emojis">
                <Smile size={18} />
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors" title="Upload Image">
                <ImageIcon size={18} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <NinjaInput ref={inputRef} type="text" value={inputText}
                onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={activeTabIsGroup ? `Message ${currentGroup?.name || 'group'}...` : activeTab === 'public' ? 'Message public chat...' : 'Type a message...'}
                icon={<MessageCircle size={14} />} maxLength={500} />
              <button onClick={() => sendMessage()} disabled={!inputText.trim()}
                className="ninja-btn ninja-btn-green-fill ninja-btn-sm ninja-btn-icon">
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export type ChatBubbleRef = {
  openPrivateChat: (friendUid: string, friendName: string) => void;
};
