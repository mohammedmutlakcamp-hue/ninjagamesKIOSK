'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, updateDoc, query, orderBy, limit, deleteDoc, writeBatch
} from 'firebase/firestore';
import {
  Trophy, BarChart3, Link, MessageCircle, Trash2, RefreshCw,
  Crown, Medal, Award, Clock, Coins, Package, AlertTriangle,
  ChevronDown, ChevronUp, Search, Users, X, Check
} from 'lucide-react';
import { REFERRAL_CONFIG } from '@/lib/constants';

type Tab = 'leaderboard' | 'referrals' | 'comments';
type LeaderboardType = 'playtime' | 'coins_spent' | 'chests_opened';

const leaderboardTypes: { id: LeaderboardType; label: string; icon: React.ReactNode }[] = [
  { id: 'playtime', label: 'Playtime', icon: <Clock size={16} /> },
  { id: 'coins_spent', label: 'Tokens Spent', icon: <Coins size={16} /> },
  { id: 'chests_opened', label: 'Chests Opened', icon: <Package size={16} /> },
];

const rankIcons = [
  <Crown size={18} className="text-[#ff9500]" key="1" />,
  <Medal size={18} className="text-[#86868b]" key="2" />,
  <Award size={18} className="text-[#c77800]" key="3" />,
];

export function LeaderboardManagement() {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Leaderboard state
  const [lbType, setLbType] = useState<LeaderboardType>('playtime');
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [globalResetConfirm, setGlobalResetConfirm] = useState(0);
  const [resetting, setResetting] = useState(false);

  // Comments state
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Load players
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, 'players'));
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
  }, []);

  // Load comments when tab switches
  useEffect(() => {
    if (tab !== 'comments') return;
    const loadComments = async () => {
      setCommentsLoading(true);
      try {
        const q = query(collection(db, 'profile-comments'), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load comments:', err);
      }
      setCommentsLoading(false);
    };
    loadComments();
  }, [tab]);

  // Helpers
  const getValue = (player: any): number => {
    const s = player.stats || {};
    switch (lbType) {
      case 'playtime': return player.totalPlaytime || 0;
      case 'coins_spent': return player.totalCoinsSpent || 0;
      case 'chests_opened': return s.chestsOpened || 0;
      default: return 0;
    }
  };

  const formatValue = (val: number, type: LeaderboardType): string => {
    if (type === 'playtime') return `${Math.floor(val / 60)}h ${val % 60}m`;
    if (type === 'chests_opened') return `${val.toLocaleString()} chests`;
    if (type === 'coins_spent') return `${val.toLocaleString()} tokens`;
    return val.toLocaleString();
  };

  const sorted = [...players]
    .sort((a, b) => getValue(b) - getValue(a))
    .slice(0, 20);

  // Reset single player stats
  const resetPlayerStats = async (uid: string) => {
    setResetting(true);
    try {
      await updateDoc(doc(db, 'players', uid), {
        totalPlaytime: 0,
        totalCoinsSpent: 0,
        'stats.chestsOpened': 0,
      });
      setPlayers(prev => prev.map(p =>
        p.uid === uid ? { ...p, totalPlaytime: 0, totalCoinsSpent: 0, stats: { ...p.stats, chestsOpened: 0 } } : p
      ));
      setResetTarget(null);
      setResetConfirm(false);
    } catch (err) {
      console.error('Failed to reset player stats:', err);
    }
    setResetting(false);
  };

  // Reset ALL players' stats
  const resetAllStats = async () => {
    setResetting(true);
    try {
      const batch = writeBatch(db);
      players.forEach(p => {
        batch.update(doc(db, 'players', p.uid), {
          totalPlaytime: 0,
          totalCoinsSpent: 0,
          'stats.chestsOpened': 0,
        });
      });
      await batch.commit();
      setPlayers(prev => prev.map(p => ({
        ...p, totalPlaytime: 0, totalCoinsSpent: 0, stats: { ...p.stats, chestsOpened: 0 }
      })));
      setGlobalResetConfirm(0);
    } catch (err) {
      console.error('Failed to reset all stats:', err);
    }
    setResetting(false);
  };

  // Delete comment
  const deleteComment = async (commentId: string) => {
    setDeletingComment(commentId);
    try {
      await deleteDoc(doc(db, 'profile-comments', commentId));
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
    setDeletingComment(null);
  };

  // Referral data
  const referralData = players
    .filter(p => p.referralCode)
    .map(p => {
      const referred = players.filter(r => r.referredBy === p.uid);
      return {
        ...p,
        referredPlayers: referred,
        totalReferred: referred.length,
        coinsAwarded: referred.length * REFERRAL_CONFIG.referrerBonus,
      };
    })
    .sort((a, b) => b.totalReferred - a.totalReferred);

  const filteredReferrals = referralData.filter(p =>
    !search || p.username?.toLowerCase().includes(search.toLowerCase())
  );

  // Get profile owner name for comments
  const getPlayerName = (uid: string) => {
    const p = players.find(pl => pl.uid === uid);
    return p?.username || uid;
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Tab header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
          <Trophy size={24} className="text-[#0071e3]" /> Leaderboard & Moderation
        </h2>
        <div className="flex gap-2">
          {([
            { id: 'leaderboard' as Tab, label: 'Leaderboard', icon: <BarChart3 size={16} /> },
            { id: 'referrals' as Tab, label: 'Referrals', icon: <Link size={16} /> },
            { id: 'comments' as Tab, label: 'Comments', icon: <MessageCircle size={16} /> },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-[#0071e3] text-white'
                  : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] hover:bg-white'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== LEADERBOARD TAB ===== */}
      {tab === 'leaderboard' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Controls row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              {leaderboardTypes.map(t => (
                <button
                  key={t.id}
                  onClick={() => setLbType(t.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    lbType === t.id
                      ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/30'
                      : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:text-[#1d1d1f]'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Global reset */}
            <div className="flex items-center gap-2">
              {globalResetConfirm === 0 && (
                <button
                  onClick={() => setGlobalResetConfirm(1)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-[#ff3b30] border border-[#d2d2d7] hover:bg-[#fff5f5] transition-all"
                >
                  <RefreshCw size={14} /> Reset All Stats
                </button>
              )}
              {globalResetConfirm === 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[#ff3b30] text-xs flex items-center gap-1">
                    <AlertTriangle size={14} /> This will reset ALL {players.length} players. Are you sure?
                  </span>
                  <button
                    onClick={() => setGlobalResetConfirm(2)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#ff3b30] border border-[#ff3b30]/30 hover:bg-[#fff5f5]"
                  >
                    Yes, I'm sure
                  </button>
                  <button
                    onClick={() => setGlobalResetConfirm(0)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
              {globalResetConfirm === 2 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[#ff3b30] font-semibold text-sm flex items-center gap-1 animate-pulse">
                    <AlertTriangle size={16} /> FINAL WARNING: THIS CANNOT BE UNDONE!
                  </span>
                  <button
                    onClick={resetAllStats}
                    disabled={resetting}
                    className="px-4 py-2 rounded-xl font-medium text-sm bg-[#ff3b30] text-white hover:bg-[#ff453a] disabled:opacity-50"
                  >
                    {resetting ? 'Resetting...' : 'Confirm Reset All'}
                  </button>
                  <button
                    onClick={() => setGlobalResetConfirm(0)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </div>
          </div>

          {/* Leaderboard list */}
          {loading ? (
            <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <RefreshCw size={24} className="text-[#0071e3] animate-spin mx-auto mb-2" />
              <p className="text-[#86868b] text-sm">Loading players...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map((player, i) => (
                <motion.div
                  key={player.uid}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`bg-white rounded-2xl p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border transition-all ${
                    i < 3 ? 'border-[#0071e3]/20' : 'border-[#e5e5ea]/60'
                  }`}
                >
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {i < 3 ? rankIcons[i] : (
                      <span className="font-semibold text-[#86868b]">{i + 1}</span>
                    )}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm truncate ${i < 3 ? 'text-[#0071e3]' : 'text-[#1d1d1f]'}`}>
                      {player.username?.toUpperCase() || 'Unknown'}
                    </p>
                    <p className="text-[10px] text-[#86868b] truncate">{player.phone || 'No phone'}</p>
                  </div>

                  {/* All stats */}
                  <div className="hidden md:flex items-center gap-4 text-xs text-[#86868b]">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {Math.floor((player.totalPlaytime || 0) / 60)}h
                    </span>
                    <span className="flex items-center gap-1">
                      <Coins size={12} /> {(player.totalCoinsSpent || 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package size={12} /> {(player.stats?.chestsOpened || 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Current metric value */}
                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className={`font-semibold text-sm ${i === 0 ? 'text-[#ff9500]' : i < 3 ? 'text-[#0071e3]' : 'text-[#1d1d1f]'}`}>
                      {formatValue(getValue(player), lbType)}
                    </p>
                  </div>

                  {/* Reset button */}
                  {resetTarget === player.uid ? (
                    <div className="flex items-center gap-1 shrink-0">
                      {resetConfirm ? (
                        <>
                          <button
                            onClick={() => resetPlayerStats(player.uid)}
                            disabled={resetting}
                            className="p-1.5 rounded-xl bg-[#fff5f5] text-[#ff3b30] hover:bg-[#ffe5e5] disabled:opacity-50"
                            title="Confirm reset"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => { setResetTarget(null); setResetConfirm(false); }}
                            className="p-1.5 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-[#ff3b30] mr-1">Reset stats?</span>
                          <button
                            onClick={() => setResetConfirm(true)}
                            className="p-1.5 rounded-xl bg-[#fff5f5] text-[#ff3b30] hover:bg-[#ffe5e5]"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setResetTarget(null)}
                            className="p-1.5 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setResetTarget(player.uid); setResetConfirm(false); }}
                      className="p-1.5 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#ff3b30] hover:bg-[#fff5f5] transition-all shrink-0"
                      title="Reset this player's stats"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </motion.div>
              ))}

              {sorted.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
                  <Trophy size={40} className="text-[#d2d2d7] mx-auto mb-3" />
                  <p className="font-medium text-[#86868b]">No players found</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ===== REFERRALS TAB ===== */}
      {tab === 'referrals' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Referrals', value: players.filter(p => p.referredBy).length, icon: <Users size={18} /> },
              { label: 'Active Codes', value: players.filter(p => p.referralCode).length, icon: <Link size={18} /> },
              {
                label: 'Coins Awarded',
                value: `${(players.filter(p => p.referredBy).length * (REFERRAL_CONFIG.referrerBonus + REFERRAL_CONFIG.newUserBonus)).toLocaleString()}`,
                icon: <Coins size={18} />,
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl p-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
              >
                <div className="text-[#0071e3] mb-1 flex justify-center">{stat.icon}</div>
                <p className="text-xl font-semibold text-[#1d1d1f]">{stat.value}</p>
                <p className="text-[10px] text-[#86868b] mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by username..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f5f5f7] rounded-xl text-sm text-[#1d1d1f] placeholder-[#86868b] border border-[#d2d2d7] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
            />
          </div>

          {/* Referrals list */}
          {loading ? (
            <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <RefreshCw size={24} className="text-[#0071e3] animate-spin mx-auto mb-2" />
              <p className="text-[#86868b] text-sm">Loading...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredReferrals.map((player, i) => (
                <motion.div
                  key={player.uid}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden"
                >
                  <div className="p-3 flex items-center gap-3">
                    {/* Player */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#1d1d1f] truncate">
                        {player.username?.toUpperCase() || 'Unknown'}
                      </p>
                      <p className="text-[10px] text-[#86868b]">
                        Code: <span className="text-[#0071e3] font-mono">{player.referralCode}</span>
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[#34c759] flex items-center gap-1">
                        <Users size={12} /> {player.totalReferred} referred
                      </span>
                      <span className="text-[#ff9500] flex items-center gap-1">
                        <Coins size={12} /> {player.coinsAwarded} earned
                      </span>
                    </div>
                  </div>

                  {/* Referred players */}
                  {player.referredPlayers.length > 0 && (
                    <div className="border-t border-[#e5e5ea]/40 px-3 py-2 bg-[#f5f5f7]/50">
                      <p className="text-[10px] text-[#86868b] mb-1">Referred players:</p>
                      <div className="flex flex-wrap gap-1">
                        {player.referredPlayers.map((rp: any) => (
                          <span
                            key={rp.uid}
                            className="px-2 py-0.5 rounded-full bg-[#0071e3]/5 text-[#0071e3] text-[10px] border border-[#0071e3]/15"
                          >
                            {rp.username || rp.uid}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {filteredReferrals.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
                  <Link size={40} className="text-[#d2d2d7] mx-auto mb-3" />
                  <p className="font-medium text-[#86868b]">
                    {search ? 'No matching players' : 'No referral data yet'}
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ===== COMMENTS TAB ===== */}
      {tab === 'comments' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#86868b]">
              Recent profile comments ({comments.length})
            </p>
            <button
              onClick={async () => {
                setCommentsLoading(true);
                const q = query(collection(db, 'profile-comments'), orderBy('createdAt', 'desc'), limit(50));
                const snap = await getDocs(q);
                setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setCommentsLoading(false);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#d2d2d7] text-[#86868b] hover:text-[#0071e3] text-xs font-medium transition-all"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {commentsLoading ? (
            <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <RefreshCw size={24} className="text-[#0071e3] animate-spin mx-auto mb-2" />
              <p className="text-[#86868b] text-sm">Loading comments...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {comments.map((comment, i) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="bg-white rounded-2xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 flex items-start gap-3"
                >
                  {/* Comment content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-xs text-[#0071e3]">
                        {comment.fromName?.toUpperCase() || 'Unknown'}
                      </span>
                      <span className="text-[#86868b] text-[10px]">on</span>
                      <span className="font-medium text-xs text-[#1d1d1f]">
                        {getPlayerName(comment.profileId)?.toUpperCase() || 'Unknown'}&apos;s profile
                      </span>
                      <span className="text-[#86868b] text-[10px] ml-auto shrink-0">
                        {comment.createdAt ? formatTime(comment.createdAt) : 'N/A'}
                      </span>
                    </div>
                    <p className="text-sm text-[#1d1d1f] break-words">
                      {comment.text}
                    </p>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteComment(comment.id)}
                    disabled={deletingComment === comment.id}
                    className="p-2 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#ff3b30] hover:bg-[#fff5f5] transition-all shrink-0 disabled:opacity-50"
                    title="Delete comment"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}

              {comments.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
                  <MessageCircle size={40} className="text-[#d2d2d7] mx-auto mb-3" />
                  <p className="font-medium text-[#86868b]">No comments yet</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
