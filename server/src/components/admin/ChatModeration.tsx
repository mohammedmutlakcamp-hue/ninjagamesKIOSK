'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, query, orderBy, where, deleteDoc, doc, getDocs, limit,
  Timestamp
} from 'firebase/firestore';
import {
  MessageSquare, Search, Trash2, Users, Shield, Hash, Lock, BarChart3,
  ChevronLeft, AlertTriangle, X, Loader2, MessagesSquare
} from 'lucide-react';

type Channel = 'public' | 'dms' | 'groups';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderNinjaType?: string;
  text: string;
  channelId: string;
  createdAt: any;
  type?: string;
  imageUrl?: string;
  imageBase64?: string;
}

interface GroupChat {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberNames: Record<string, string>;
  createdAt: any;
}

interface PlayerStat {
  senderId: string;
  senderName: string;
  count: number;
}

export function ChatModeration() {
  const [activeChannel, setActiveChannel] = useState<Channel>('public');
  const [messages, setMessages] = useState<Message[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupChat | null>(null);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [dmMessages, setDmMessages] = useState<Message[]>([]);
  const [loadingDms, setLoadingDms] = useState(true);
  const [dmConversations, setDmConversations] = useState<{ channelId: string; participants: string[]; lastMsg: Message; count: number }[]>([]);
  const [selectedDm, setSelectedDm] = useState<string | null>(null);
  const [selectedDmMessages, setSelectedDmMessages] = useState<Message[]>([]);

  // Real-time public messages
  useEffect(() => {
    if (activeChannel !== 'public') return;
    setLoadingPublic(true);
    const q = query(
      collection(db, 'messages'),
      where('channelId', '==', 'public'),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      msgs.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || a.createdAt || 0;
        const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || b.createdAt || 0;
        return tb - ta;
      });
      setMessages(msgs);
      setLoadingPublic(false);
    }, (err) => {
      console.error('Public chat query error:', err);
      setLoadingPublic(false);
    });
    return () => unsub();
  }, [activeChannel]);

  // Load DM messages
  useEffect(() => {
    if (activeChannel !== 'dms') return;
    setLoadingDms(true);
    const q = query(collection(db, 'messages'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      const dms = all.filter(m => m.channelId && m.channelId !== 'public' && !m.channelId.startsWith('group_'));
      dms.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || a.createdAt || 0;
        const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || b.createdAt || 0;
        return tb - ta;
      });
      setDmMessages(dms);
      const convMap = new Map<string, { channelId: string; participants: string[]; lastMsg: Message; count: number }>();
      dms.forEach(m => {
        const existing = convMap.get(m.channelId);
        if (existing) {
          existing.count++;
          if (!existing.participants.includes(m.senderName)) existing.participants.push(m.senderName);
        } else {
          convMap.set(m.channelId, { channelId: m.channelId, participants: [m.senderName], lastMsg: m, count: 1 });
        }
      });
      setDmConversations(Array.from(convMap.values()));
      setLoadingDms(false);
    }, (err) => {
      console.error('DM query error:', err);
      setLoadingDms(false);
    });
    return () => unsub();
  }, [activeChannel]);

  // Load group chats
  useEffect(() => {
    if (activeChannel !== 'groups') return;
    setLoadingGroups(true);
    const unsub = onSnapshot(collection(db, 'group-chats'), (snap) => {
      setGroupChats(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupChat)));
      setLoadingGroups(false);
    });
    return () => unsub();
  }, [activeChannel]);

  // Load messages for selected group
  useEffect(() => {
    if (!selectedGroup) return;
    const q = query(
      collection(db, 'messages'),
      where('channelId', '==', `group_${selectedGroup.id}`),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setGroupMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    });
    return () => unsub();
  }, [selectedGroup]);

  // Search messages
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(500));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      const lower = searchQuery.toLowerCase();
      const filtered = all.filter(m =>
        m.text?.toLowerCase().includes(lower) ||
        m.senderName?.toLowerCase().includes(lower)
      );
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search error:', err);
    }
    setSearching(false);
  };

  // Load stats
  const loadStats = async () => {
    setShowStats(true);
    setLoadingStats(true);
    try {
      const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(1000));
      const snap = await getDocs(q);
      setAllMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoadingStats(false);
  };

  const playerStats: PlayerStat[] = useMemo(() => {
    const map = new Map<string, { senderId: string; senderName: string; count: number }>();
    allMessages.forEach(m => {
      if (!m.senderId) return;
      const existing = map.get(m.senderId);
      if (existing) {
        existing.count++;
      } else {
        map.set(m.senderId, { senderId: m.senderId, senderName: m.senderName || 'Unknown', count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allMessages]);

  // Delete message
  const handleDelete = async (msgId: string) => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'messages', msgId));
      setDeleteConfirm(null);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      setGroupMessages(prev => prev.filter(m => m.id !== msgId));
      setSearchResults(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeleting(false);
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const channelLabel = (channelId: string) => {
    if (channelId === 'public') return 'Public';
    if (channelId.startsWith('group_')) return 'Group';
    return 'DM';
  };

  const tabs: { key: Channel; label: string; icon: React.ReactNode }[] = [
    { key: 'public', label: 'Public Chat', icon: <Hash size={16} /> },
    { key: 'dms', label: 'Private DMs', icon: <Lock size={16} /> },
    { key: 'groups', label: 'Group Chats', icon: <Users size={16} /> },
  ];

  // Render a message row
  const renderMessage = (msg: Message, showChannel = false) => (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]/60 hover:border-[#0071e3]/20 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-[#0071e3] text-sm">{msg.senderName}</span>
          {showChannel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#e5e5ea]/60 text-[#86868b]">
              {channelLabel(msg.channelId)}
            </span>
          )}
          <span className="text-[10px] text-[#86868b]">{formatTime(msg.createdAt)}</span>
          {msg.type && msg.type !== 'text' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#af52de]/10 text-[#af52de]">
              {msg.type}
            </span>
          )}
        </div>
        {msg.text && <p className="text-[#1d1d1f] text-sm break-words">{msg.text}</p>}
        {(msg.imageUrl || msg.imageBase64) && (
          <div className="mt-2">
            <img
              src={msg.imageUrl || msg.imageBase64}
              alt="Shared image"
              className="max-w-[300px] max-h-[200px] rounded-lg border border-[#e5e5ea]/60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(msg.imageUrl || msg.imageBase64, '_blank')}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        {msg.type === 'image' && !msg.imageUrl && !msg.imageBase64 && (
          <p className="text-[#86868b] text-xs italic mt-1">[ Image message ]</p>
        )}
      </div>

      {deleteConfirm === msg.id ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleDelete(msg.id)}
            disabled={deleting}
            className="px-2 py-1 rounded-lg bg-[#ff3b30] text-white text-xs font-medium hover:bg-[#ff453a] transition-colors"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
          </button>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-2 py-1 rounded-lg bg-[#f5f5f7] border border-[#d2d2d7] text-[#86868b] text-xs font-medium hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setDeleteConfirm(msg.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-all shrink-0"
          title="Delete message"
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
          <Shield size={24} className="text-[#0071e3]" /> Chat Moderation
        </h1>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0071e3]/10 border border-[#0071e3]/20 text-[#0071e3] text-sm font-medium hover:bg-[#0071e3]/15 transition-colors"
        >
          <BarChart3 size={14} /> Player Stats
        </button>
      </div>

      {/* Channel Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveChannel(tab.key); setSelectedGroup(null); setSearchResults([]); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
              activeChannel === tab.key
                ? 'bg-[#0071e3] text-white'
                : 'bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] hover:bg-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <input
            type="text"
            placeholder="Search messages by text or sender name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-[#1d1d1f] text-sm placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2.5 rounded-xl bg-[#0071e3] text-white text-sm font-medium hover:bg-[#0077ED] transition-colors disabled:opacity-40"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
        </button>
        {searchResults.length > 0 && (
          <button
            onClick={() => { setSearchResults([]); setSearchQuery(''); }}
            className="px-3 py-2.5 rounded-xl border border-[#d2d2d7] text-[#86868b] text-sm hover:bg-[#f5f5f7] transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm text-[#86868b] mb-2 flex items-center gap-2">
            <Search size={14} /> {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &quot;{searchQuery}&quot;
          </h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {searchResults.map(msg => renderMessage(msg, true))}
          </div>
        </div>
      )}

      {/* Public Chat */}
      {activeChannel === 'public' && searchResults.length === 0 && (
        <div>
          <h2 className="text-sm text-[#86868b] mb-3 flex items-center gap-2">
            <MessageSquare size={14} className="text-[#0071e3]" /> Public Messages
            <span className="text-[#86868b]">({messages.length})</span>
          </h2>
          {loadingPublic ? (
            <div className="flex items-center justify-center py-12 text-[#86868b]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-[#86868b] text-sm">No public messages yet.</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {messages.map(msg => renderMessage(msg))}
            </div>
          )}
        </div>
      )}

      {/* Private DMs */}
      {activeChannel === 'dms' && searchResults.length === 0 && (
        <div>
          {selectedDm ? (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-[#fff8f0] border border-[#ff9500]/20">
                <button
                  onClick={() => { setSelectedDm(null); setSelectedDmMessages([]); }}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] active:bg-[#e5e5ea] transition-all shrink-0"
                >
                  <ChevronLeft size={20} className="text-[#1d1d1f]" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-[#ff9500]/10 flex items-center justify-center shrink-0">
                  <Lock size={18} className="text-[#ff9500]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[#1d1d1f] text-sm truncate">
                    {dmConversations.find(c => c.channelId === selectedDm)?.participants.join(' & ') || 'DM'}
                  </h3>
                  <p className="text-[#86868b] text-xs">
                    {selectedDmMessages.length} messages
                  </p>
                </div>
              </div>
              {selectedDmMessages.length === 0 ? (
                <div className="text-center py-8 text-[#86868b] text-sm">No messages.</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {selectedDmMessages.map(msg => renderMessage(msg))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-sm text-[#86868b] mb-3 flex items-center gap-2">
                <Lock size={14} className="text-[#ff9500]" /> Private DMs
                <span className="text-[#86868b]">({dmConversations.length} conversations)</span>
              </h2>
              {loadingDms ? (
                <div className="flex items-center justify-center py-12 text-[#86868b]">
                  <Loader2 size={20} className="animate-spin mr-2" /> Loading DMs...
                </div>
              ) : dmConversations.length === 0 ? (
                <div className="text-center py-12 text-[#86868b] text-sm">No private conversations found.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dmConversations.map(conv => (
                    <motion.button
                      key={conv.channelId}
                      onClick={() => {
                        setSelectedDm(conv.channelId);
                        setSelectedDmMessages(dmMessages.filter(m => m.channelId === conv.channelId));
                      }}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#e5e5ea]/60 hover:border-[#ff9500]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#ff9500]/10 flex items-center justify-center shrink-0">
                        <Lock size={18} className="text-[#ff9500]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-[#1d1d1f] text-sm truncate">{conv.participants.join(' & ')}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[#86868b] text-xs">{conv.count} messages</span>
                          <span className="text-[#86868b] text-xs">{formatTime(conv.lastMsg.createdAt)}</span>
                        </div>
                        <p className="text-[#86868b] text-[10px] mt-0.5 truncate">
                          {conv.lastMsg.senderName}: {conv.lastMsg.text}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Group Chats */}
      {activeChannel === 'groups' && searchResults.length === 0 && (
        <div>
          {selectedGroup ? (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-[#f5f0ff] border border-[#af52de]/20">
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] active:bg-[#e5e5ea] transition-all shrink-0"
                >
                  <ChevronLeft size={20} className="text-[#1d1d1f]" />
                </button>
                <div className="w-10 h-10 rounded-xl bg-[#af52de]/10 flex items-center justify-center shrink-0">
                  <MessagesSquare size={18} className="text-[#af52de]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[#1d1d1f] text-sm truncate">{selectedGroup.name}</h3>
                  <p className="text-[#86868b] text-xs">
                    {selectedGroup.members?.length || 0} members
                  </p>
                </div>
              </div>
              {groupMessages.length === 0 ? (
                <div className="text-center py-8 text-[#86868b] text-sm">No messages in this group.</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {groupMessages.map(msg => renderMessage(msg))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-sm text-[#86868b] mb-3 flex items-center gap-2">
                <Users size={14} className="text-[#af52de]" /> Group Chats
                <span className="text-[#86868b]">({groupChats.length})</span>
              </h2>
              {loadingGroups ? (
                <div className="flex items-center justify-center py-12 text-[#86868b]">
                  <Loader2 size={20} className="animate-spin mr-2" /> Loading groups...
                </div>
              ) : groupChats.length === 0 ? (
                <div className="text-center py-12 text-[#86868b] text-sm">No group chats created yet.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupChats.map(group => (
                    <motion.button
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#e5e5ea]/60 hover:border-[#af52de]/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#af52de]/10 flex items-center justify-center shrink-0">
                        <MessagesSquare size={18} className="text-[#af52de]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-[#1d1d1f] text-sm truncate">{group.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[#86868b] text-xs">
                            {group.members?.length || 0} members
                          </span>
                          <span className="text-[#86868b] text-xs">
                            {formatTime(group.createdAt)}
                          </span>
                        </div>
                        {group.memberNames && (
                          <p className="text-[#86868b] text-[10px] mt-0.5 truncate">
                            Creator: {group.memberNames[group.createdBy] || group.createdBy}
                          </p>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Player Stats Modal */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowStats(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg max-h-[80vh] rounded-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#e5e5ea]/60">
                <h2 className="font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <BarChart3 size={18} className="text-[#0071e3]" /> Player Message Stats
                </h2>
                <button
                  onClick={() => setShowStats(false)}
                  className="p-1 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {loadingStats ? (
                  <div className="flex items-center justify-center py-12 text-[#86868b]">
                    <Loader2 size={20} className="animate-spin mr-2" /> Calculating stats...
                  </div>
                ) : playerStats.length === 0 ? (
                  <div className="text-center py-12 text-[#86868b] text-sm">No message data found.</div>
                ) : (
                  <div className="space-y-2">
                    {playerStats.map((stat, i) => (
                      <div
                        key={stat.senderId}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]/60"
                      >
                        <span className={`w-6 text-center font-semibold text-sm ${
                          i === 0 ? 'text-[#ff9500]' : i === 1 ? 'text-[#86868b]' : i === 2 ? 'text-[#c77800]' : 'text-[#86868b]'
                        }`}>
                          #{i + 1}
                        </span>
                        <span className="flex-1 font-medium text-[#1d1d1f] text-sm truncate">{stat.senderName}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#0071e3] font-semibold text-sm">{stat.count}</span>
                          <span className="text-[#86868b] text-xs">msgs</span>
                        </div>
                        {/* Bar visualization */}
                        <div className="w-24 h-2 rounded-full bg-[#e5e5ea]/60 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(stat.count / (playerStats[0]?.count || 1)) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.03 }}
                            className="h-full rounded-full bg-[#0071e3]/30"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-[#e5e5ea]/60 text-center">
                <span className="text-[#86868b] text-xs">
                  Based on last {allMessages.length} messages
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
