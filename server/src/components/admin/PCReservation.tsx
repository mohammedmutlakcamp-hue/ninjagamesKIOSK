'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, addDoc, deleteDoc, updateDoc,
  query, where, getDocs, orderBy, Timestamp
} from 'firebase/firestore';
import {
  Monitor, User, Clock, Search, Plus, Trash2, X,
  CalendarClock, CheckCircle2, AlertCircle, XCircle,
  ChevronDown, Loader2, RefreshCw
} from 'lucide-react';

interface PC {
  id: string;
  name: string;
  status: string;
  currentPlayer?: string;
  currentPlayerName?: string;
}

interface Reservation {
  id: string;
  pcId: string;
  pcName: string;
  playerId: string;
  playerName: string;
  startTime: number;
  expiresAt: number;
  status: 'upcoming' | 'active' | 'expired';
  createdAt: number;
}

interface Player {
  uid: string;
  username: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${formatTime(ts)}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatTime(ts)}`;
}

function getReservationStatus(r: Omit<Reservation, 'status'>): 'upcoming' | 'active' | 'expired' {
  const now = Date.now();
  if (now >= r.expiresAt) return 'expired';
  if (now >= r.startTime) return 'active';
  return 'upcoming';
}

export function PCReservation() {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create form state
  const [selectedPcId, setSelectedPcId] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // Load PCs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const list: PC[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as PC));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setPcs(list);
    });
    return () => unsub();
  }, []);

  // Load reservations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reservations'), (snap) => {
      const list: Reservation[] = snap.docs.map(d => {
        const data = d.data();
        const base = {
          id: d.id,
          pcId: data.pcId,
          pcName: data.pcName,
          playerId: data.playerId,
          playerName: data.playerName,
          startTime: data.startTime,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
        };
        const r: Reservation = { ...base, status: getReservationStatus(base) };
        return r;
      });
      // Sort: active first, then upcoming, then expired
      list.sort((a, b) => {
        const order = { active: 0, upcoming: 1, expired: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return a.startTime - b.startTime;
      });
      setReservations(list);
    });
    return () => unsub();
  }, []);

  // Auto-expire reservations (check every 30s)
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      for (const r of reservations) {
        if (r.status !== 'expired' && now >= r.expiresAt) {
          try {
            await updateDoc(doc(db, 'reservations', r.id), { status: 'expired' });
          } catch {}
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [reservations]);

  // Search players by username
  const searchPlayers = async (term: string) => {
    if (term.length < 2) {
      setPlayerResults([]);
      return;
    }
    setSearching(true);
    try {
      const q = query(collection(db, 'players'), orderBy('username'), where('username', '>=', term.toLowerCase()), where('username', '<=', term.toLowerCase() + '\uf8ff'));
      const snap = await getDocs(q);
      setPlayerResults(snap.docs.map(d => ({ uid: d.id, username: d.data().username })));
    } catch {
      setPlayerResults([]);
    }
    setSearching(false);
  };

  // Get PC status info
  const getPcReservationStatus = (pcId: string) => {
    const activeRes = reservations.find(r => r.pcId === pcId && (r.status === 'active' || r.status === 'upcoming'));
    const pc = pcs.find(p => p.id === pcId);
    if (pc?.status === 'occupied') return { label: 'Occupied', color: 'text-[#ff3b30]', bg: 'bg-[#ff3b30]/5 border-[#ff3b30]/15' };
    if (activeRes?.status === 'active') return { label: 'Reserved (Active)', color: 'text-[#ff9500]', bg: 'bg-[#ff9500]/5 border-[#ff9500]/15' };
    if (activeRes?.status === 'upcoming') return { label: 'Reserved', color: 'text-[#0071e3]', bg: 'bg-[#0071e3]/5 border-[#0071e3]/15' };
    return { label: 'Available', color: 'text-[#34c759]', bg: 'bg-[#34c759]/5 border-[#34c759]/15' };
  };

  // Create reservation
  const handleCreate = async () => {
    if (!selectedPcId || !selectedPlayer || !startTimeInput) {
      setError('Please fill all fields');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const pc = pcs.find(p => p.id === selectedPcId);
      const startTime = new Date(startTimeInput).getTime();
      if (isNaN(startTime)) {
        setError('Invalid start time');
        setCreating(false);
        return;
      }
      const expiresAt = startTime + 30 * 60 * 1000; // 30 minutes after start

      await addDoc(collection(db, 'reservations'), {
        pcId: selectedPcId,
        pcName: pc?.name || 'Unknown',
        playerId: selectedPlayer.uid,
        playerName: selectedPlayer.username,
        startTime,
        expiresAt,
        status: startTime <= Date.now() ? 'active' : 'upcoming',
        createdAt: Date.now(),
      });

      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      setError('Failed to create reservation');
    }
    setCreating(false);
  };

  // Cancel reservation
  const handleCancel = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reservations', id));
    } catch {}
    setConfirmDelete(null);
  };

  const resetForm = () => {
    setSelectedPcId('');
    setPlayerSearch('');
    setPlayerResults([]);
    setSelectedPlayer(null);
    setStartTimeInput('');
    setError('');
  };

  const statusColors = {
    upcoming: { text: 'text-[#0071e3]', bg: 'bg-[#0071e3]/8', border: 'border-[#0071e3]/15', icon: <CalendarClock size={14} /> },
    active: { text: 'text-[#34c759]', bg: 'bg-[#34c759]/8', border: 'border-[#34c759]/15', icon: <CheckCircle2 size={14} /> },
    expired: { text: 'text-[#86868b]', bg: 'bg-[#86868b]/8', border: 'border-[#86868b]/15', icon: <XCircle size={14} /> },
  };

  const activeCount = reservations.filter(r => r.status === 'active').length;
  const upcomingCount = reservations.filter(r => r.status === 'upcoming').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">PC Reservations</h2>
          <p className="text-[#86868b] text-sm mt-1">
            {activeCount} active, {upcomingCount} upcoming
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); resetForm(); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED] transition-all"
        >
          <Plus size={16} /> New Reservation
        </button>
      </div>

      {/* PC Status Grid */}
      <div>
        <h3 className="text-sm font-medium text-[#86868b] tracking-wide mb-3">PC Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {pcs.map(pc => {
            const st = getPcReservationStatus(pc.id);
            return (
              <div
                key={pc.id}
                className={`bg-white rounded-2xl p-3 border shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${st.bg} cursor-default`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Monitor size={14} className={st.color} />
                  <span className="text-xs font-medium text-[#1d1d1f]">{pc.name || pc.id}</span>
                </div>
                <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                {pc.currentPlayerName && (
                  <div className="flex items-center gap-1 mt-1">
                    <User size={10} className="text-[#86868b]" />
                    <span className="text-[10px] text-[#86868b] truncate">{pc.currentPlayerName}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Reservations */}
      <div>
        <h3 className="text-sm font-medium text-[#86868b] tracking-wide mb-3">Reservations</h3>
        {reservations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-[#e5e5ea]/60 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <CalendarClock size={32} className="text-[#d2d2d7] mx-auto mb-3" />
            <p className="text-[#86868b]">No reservations yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reservations.map(r => {
              const sc = statusColors[r.status];
              const timeLeft = r.status === 'active' ? Math.max(0, Math.floor((r.expiresAt - Date.now()) / 60000)) : null;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-2xl p-4 border ${sc.border} flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}
                >
                  <div className="flex items-center gap-4">
                    {/* Status badge */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${sc.bg} border ${sc.border}`}>
                      {sc.icon}
                      <span className={`text-[10px] uppercase tracking-wider font-medium ${sc.text}`}>{r.status}</span>
                    </div>

                    {/* PC */}
                    <div className="flex items-center gap-1.5">
                      <Monitor size={14} className="text-[#0071e3]" />
                      <span className="text-sm font-medium text-[#1d1d1f]">{r.pcName}</span>
                    </div>

                    {/* Player */}
                    <div className="flex items-center gap-1.5">
                      <User size={14} className="text-[#af52de]" />
                      <span className="text-sm text-[#86868b]">{r.playerName}</span>
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-[#86868b]" />
                      <span className="text-xs text-[#86868b]">
                        {formatDate(r.startTime)}
                        {r.status === 'active' && timeLeft !== null && (
                          <span className="text-[#34c759] ml-2">({timeLeft}m left)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {r.status !== 'expired' && (
                      confirmDelete === r.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#ff3b30]">Cancel?</span>
                          <button
                            onClick={() => handleCancel(r.id)}
                            className="px-3 py-1 bg-[#ff3b30]/10 border border-[#ff3b30]/20 rounded-lg text-[#ff3b30] text-xs hover:bg-[#ff3b30]/15 transition-all"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-3 py-1 border border-[#d2d2d7] rounded-lg text-[#86868b] text-xs hover:bg-[#f5f5f7] transition-all"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(r.id)}
                          className="p-2 rounded-lg text-[#86868b] hover:text-[#ff3b30] hover:bg-[#fff5f5] transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                    {r.status === 'expired' && (
                      <button
                        onClick={() => handleCancel(r.id)}
                        className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Reservation Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-8 w-[480px] max-w-[90vw] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">New Reservation</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-[#86868b] hover:text-[#1d1d1f] transition-all">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Select PC */}
                <div>
                  <label className="text-sm text-[#86868b] mb-2 block">Select PC</label>
                  <select
                    value={selectedPcId}
                    onChange={(e) => setSelectedPcId(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">-- Choose a PC --</option>
                    {pcs.map(pc => {
                      const st = getPcReservationStatus(pc.id);
                      return (
                        <option key={pc.id} value={pc.id}>
                          {pc.name || pc.id} ({st.label})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Search Player */}
                <div>
                  <label className="text-sm text-[#86868b] mb-2 block">Player</label>
                  {selectedPlayer ? (
                    <div className="flex items-center justify-between bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-[#0071e3]" />
                        <span className="text-[#1d1d1f]">{selectedPlayer.username}</span>
                      </div>
                      <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(''); setPlayerResults([]); }} className="text-[#86868b] hover:text-[#1d1d1f]">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                        <input
                          type="text"
                          value={playerSearch}
                          onChange={(e) => {
                            setPlayerSearch(e.target.value);
                            searchPlayers(e.target.value);
                          }}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                          placeholder="Search by username..."
                        />
                        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0071e3] animate-spin" />}
                      </div>
                      {playerResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e5e5ea] rounded-xl max-h-40 overflow-y-auto z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                          {playerResults.map(p => (
                            <button
                              key={p.uid}
                              onClick={() => { setSelectedPlayer(p); setPlayerResults([]); setPlayerSearch(p.username); }}
                              className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-[#f5f5f7] transition-all"
                            >
                              <User size={12} className="text-[#86868b]" />
                              <span className="text-sm text-[#1d1d1f]">{p.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Start Time */}
                <div>
                  <label className="text-sm text-[#86868b] mb-2 block">Start Time</label>
                  <input
                    type="datetime-local"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                  <p className="text-[10px] text-[#86868b] mt-1">Reservation expires 30 minutes after start time</p>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-[#ff3b30] text-sm">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-3 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex-1 py-3 bg-[#0071e3] text-white rounded-xl text-sm font-medium hover:bg-[#0077ED] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
