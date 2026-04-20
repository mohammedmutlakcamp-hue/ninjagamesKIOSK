'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, increment } from 'firebase/firestore';
import { Tournament, TournamentFormat, PrizeSlot, TournamentBracket } from '@/types/tournament';
import {
  Trophy, Plus, Coins, Users, Calendar, Swords, X, Edit, Trash2,
  Play, Ban, Award, DollarSign, ChevronDown, Check, AlertTriangle
} from 'lucide-react';
import { HelpTip } from './HelpTip';

export function TournamentManagement() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // When non-null, the create modal is in edit mode and saves via updateDoc.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [game, setGame] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('bracket');
  const [entryFee, setEntryFee] = useState(100);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [minPlayers, setMinPlayers] = useState(4);
  const [startTime, setStartTime] = useState('');
  const [rules, setRules] = useState('');
  const [prizes, setPrizes] = useState<PrizeSlot[]>([
    { position: 1, percentage: 50, coins: 0 },
    { position: 2, percentage: 30, coins: 0 },
    { position: 3, percentage: 20, coins: 0 },
  ]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tournaments'), (snap) => {
      setTournaments(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament))
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    });
    return () => unsub();
  }, []);

  const totalPrizePool = maxPlayers * entryFee * (prizes.reduce((s, p) => s + p.percentage, 0) / 100);
  const adminProfit = maxPlayers * entryFee - totalPrizePool;

  const createTournament = async () => {
    if (!name || !game || !startTime) return;

    const prizePool = maxPlayers * entryFee * (prizes.reduce((s, p) => s + p.percentage, 0) / 100);
    const calculatedPrizes = prizes.map(p => ({
      ...p,
      coins: Math.floor(maxPlayers * entryFee * p.percentage / 100),
    }));

    if (editingId) {
      // Edit mode — update existing tournament. Leaves participants, brackets,
      // results, and status intact so an in-progress tournament isn't reset.
      await updateDoc(doc(db, 'tournaments', editingId), {
        name, game, description, format,
        entryFee, maxPlayers, minPlayers,
        prizePool,
        prizeDistribution: calculatedPrizes,
        adminProfit: maxPlayers * entryFee - prizePool,
        registrationEnd: new Date(startTime).getTime(),
        startTime: new Date(startTime).getTime(),
        rules,
        updatedAt: Date.now(),
      });
      setEditingId(null);
    } else {
      await addDoc(collection(db, 'tournaments'), {
        name, game, description, format,
        entryFee, maxPlayers, minPlayers,
        prizePool,
        prizeDistribution: calculatedPrizes,
        adminProfit: maxPlayers * entryFee - prizePool,
        registrationStart: Date.now(),
        registrationEnd: new Date(startTime).getTime(),
        startTime: new Date(startTime).getTime(),
        endTime: null,
        status: 'registration',
        participants: [], brackets: [], results: [],
        rules, termsAndConditions: '',
        createdBy: 'admin',
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    }

    setShowCreate(false);
    resetForm();
  };

  const openEditTournament = (t: Tournament) => {
    setEditingId(t.id);
    setName(t.name || '');
    setGame(t.game || '');
    setDescription(t.description || '');
    setFormat(t.format || 'bracket');
    setEntryFee(t.entryFee || 100);
    setMaxPlayers(t.maxPlayers || 16);
    setMinPlayers(t.minPlayers || 4);
    setStartTime(t.startTime ? new Date(t.startTime).toISOString().slice(0, 16) : '');
    setRules(t.rules || '');
    setPrizes((t.prizeDistribution && t.prizeDistribution.length)
      ? t.prizeDistribution.map(p => ({ position: p.position, percentage: p.percentage, coins: p.coins || 0 }))
      : [
          { position: 1, percentage: 50, coins: 0 },
          { position: 2, percentage: 30, coins: 0 },
          { position: 3, percentage: 20, coins: 0 },
        ]);
    setShowCreate(true);
  };

  const resetForm = () => {
    setName(''); setGame(''); setDescription(''); setFormat('bracket');
    setEntryFee(100); setMaxPlayers(16); setMinPlayers(4);
    setStartTime(''); setRules('');
    setPrizes([
      { position: 1, percentage: 50, coins: 0 },
      { position: 2, percentage: 30, coins: 0 },
      { position: 3, percentage: 20, coins: 0 },
    ]);
  };

  const updateStatus = async (t: Tournament, status: string) => {
    await updateDoc(doc(db, 'tournaments', t.id), { status, updatedAt: Date.now() });
  };

  const generateBrackets = async (t: Tournament) => {
    const participants = [...(t.participants || [])];
    // Shuffle
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }

    const brackets: TournamentBracket[] = [];
    for (let i = 0; i < participants.length; i += 2) {
      brackets.push({
        round: 1,
        matchIndex: Math.floor(i / 2),
        player1: participants[i]?.playerName || null,
        player2: participants[i + 1]?.playerName || null,
        winner: null, score1: 0, score2: 0, status: 'pending',
      });
    }

    await updateDoc(doc(db, 'tournaments', t.id), {
      brackets, status: 'active', updatedAt: Date.now(),
    });
  };

  const declareWinner = async (t: Tournament, bracketIdx: number, winner: string) => {
    const brackets = [...(t.brackets || [])];
    brackets[bracketIdx] = { ...brackets[bracketIdx], winner, status: 'completed' };
    await updateDoc(doc(db, 'tournaments', t.id), { brackets, updatedAt: Date.now() });
  };

  const completeTournament = async (t: Tournament) => {
    // Distribute prizes to winners
    const results = (t.prizeDistribution || []).map((p, i) => ({
      playerId: '', playerName: `Winner #${p.position}`, position: p.position, prizeClaimed: p.coins,
    }));
    await updateDoc(doc(db, 'tournaments', t.id), {
      status: 'completed', endTime: Date.now(), results, updatedAt: Date.now(),
    });
  };

  const cancelTournament = async (t: Tournament) => {
    // Refund participants
    for (const p of (t.participants || [])) {
      try {
        await updateDoc(doc(db, 'players', p.playerId), { coins: increment(t.entryFee) });
      } catch { /* skip */ }
    }
    await updateDoc(doc(db, 'tournaments', t.id), {
      status: 'cancelled', updatedAt: Date.now(),
    });
  };

  const deleteTournament = async (id: string) => {
    await deleteDoc(doc(db, 'tournaments', id));
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      registration: 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/20',
      upcoming: 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20',
      active: 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/20',
      completed: 'bg-[#f5f5f7] text-[#86868b] border-[#e5e5ea]',
      cancelled: 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/20',
    };
    return colors[status] || colors.upcoming;
  };

  // Revenue stats
  const totalRevenue = tournaments
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + (t.adminProfit || 0), 0);

  const inputClass = "w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Tournament Management
            <HelpTip title={{ en: 'Tournaments', ar: 'البطولات' }}
              ar={<p>أنشئ بطولات برسوم دخول وتواريخ. اللاعبون ينضمون من الكشك، أنت تحدد الفائزين، والجوائز تُوزَّع تلقائياً.</p>}>
              <p>Create tournaments with entry fees and dates. Players join from the kiosk, you mark winners, prizes distribute automatically.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">
            {tournaments.filter(t => t.status === 'active').length} active · {tournaments.filter(t => t.status === 'registration').length} registration · Total revenue: {totalRevenue} coins
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowCreate(true)}
          className="px-6 py-2 bg-[#0071e3] text-white font-medium rounded-xl flex items-center gap-2 hover:bg-[#0077ED] transition-colors"
        >
          <Plus size={16} /> Create Tournament
        </motion.button>
      </div>

      {/* Tournament List */}
      <div className="space-y-3">
        {tournaments.map((t) => (
          <div key={t.id} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden">
            <div
              className="p-5 cursor-pointer hover:bg-[#f5f5f7]/50 transition-all"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Trophy size={20} className="text-[#0071e3]" />
                  <div>
                    <h3 className="text-lg font-semibold text-[#1d1d1f]">{t.name}</h3>
                    <p className="text-[#86868b] text-sm">{t.game} · {t.format.toUpperCase()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(t.status)}`}>
                    {t.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-[#86868b] text-sm">
                  <span className="flex items-center gap-1"><Users size={14} /> {t.participants?.length || 0}/{t.maxPlayers}</span>
                  <span className="flex items-center gap-1"><Coins size={14} className="text-[#ff9500]" /> {t.entryFee}</span>
                  <span className="flex items-center gap-1"><DollarSign size={14} className="text-[#34c759]" /> +{t.adminProfit || 0}</span>
                  <ChevronDown size={16} className={`transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expandedId === t.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-[#e5e5ea]"
                >
                  <div className="p-5 space-y-4">
                    {/* Details */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-[#f5f5f7] rounded-xl p-3">
                        <p className="text-[#86868b] text-xs">Prize Pool</p>
                        <p className="text-[#0071e3] font-semibold text-lg">{t.prizePool} coins</p>
                      </div>
                      <div className="bg-[#f5f5f7] rounded-xl p-3">
                        <p className="text-[#86868b] text-xs">Admin Profit</p>
                        <p className="text-[#34c759] font-semibold text-lg">{t.adminProfit} coins</p>
                      </div>
                      <div className="bg-[#f5f5f7] rounded-xl p-3">
                        <p className="text-[#86868b] text-xs">Start Time</p>
                        <p className="text-[#1d1d1f] text-sm">{new Date(t.startTime).toLocaleString()}</p>
                      </div>
                      <div className="bg-[#f5f5f7] rounded-xl p-3">
                        <p className="text-[#86868b] text-xs">Players</p>
                        <p className="text-[#1d1d1f] font-semibold text-lg">{t.participants?.length || 0}/{t.maxPlayers}</p>
                      </div>
                    </div>

                    {/* Participants */}
                    {t.participants?.length > 0 && (
                      <div className="bg-[#f5f5f7] rounded-xl p-4">
                        <p className="text-[#86868b] text-xs mb-2">PARTICIPANTS</p>
                        <div className="flex flex-wrap gap-2">
                          {t.participants.map((p, i) => (
                            <span key={i} className="px-2 py-1 bg-white border border-[#e5e5ea] rounded-lg text-xs text-[#1d1d1f]">
                              {p.playerName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Brackets */}
                    {t.brackets?.length > 0 && (
                      <div className="bg-[#f5f5f7] rounded-xl p-4">
                        <p className="text-[#86868b] text-xs mb-2">BRACKETS</p>
                        <div className="space-y-2">
                          {t.brackets.map((b, i) => (
                            <div key={i} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-[#e5e5ea]/60">
                              <span className="text-[#86868b] text-xs w-16">R{b.round} M{b.matchIndex + 1}</span>
                              <button
                                onClick={() => b.player1 && declareWinner(t, i, b.player1)}
                                className={`flex-1 py-1 px-2 rounded-lg text-sm text-left transition-colors ${
                                  b.winner === b.player1 ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                                }`}
                              >
                                {b.player1 || 'TBD'}
                              </button>
                              <span className="text-[#86868b] text-xs">vs</span>
                              <button
                                onClick={() => b.player2 && declareWinner(t, i, b.player2)}
                                className={`flex-1 py-1 px-2 rounded-lg text-sm text-left transition-colors ${
                                  b.winner === b.player2 ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                                }`}
                              >
                                {b.player2 || 'TBD'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Edit — available on every tournament regardless of status
                          so admins can fix typos, adjust prize pool mid-event, etc. */}
                      <button onClick={() => openEditTournament(t)}
                        className="px-4 py-2 bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20 rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#0071e3]/15 transition-colors">
                        <Edit size={14} /> Edit
                      </button>
                      {t.status === 'registration' && (
                        <>
                          <button onClick={() => generateBrackets(t)}
                            className="px-4 py-2 bg-[#ff9500]/10 text-[#ff9500] border border-[#ff9500]/20 rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#ff9500]/15 transition-colors">
                            <Play size={14} /> Start (Generate Brackets)
                          </button>
                          <button onClick={() => cancelTournament(t)}
                            className="px-4 py-2 text-[#ff3b30] border border-[#d2d2d7] rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#fff5f5] transition-colors">
                            <Ban size={14} /> Cancel & Refund
                          </button>
                        </>
                      )}
                      {t.status === 'active' && (
                        <>
                          <button onClick={() => completeTournament(t)}
                            className="px-4 py-2 bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20 rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#34c759]/15 transition-colors">
                            <Check size={14} /> Complete Tournament
                          </button>
                          <button onClick={() => cancelTournament(t)}
                            className="px-4 py-2 text-[#ff3b30] border border-[#d2d2d7] rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#fff5f5] transition-colors">
                            <Ban size={14} /> Cancel & Refund
                          </button>
                        </>
                      )}
                      {(t.status === 'completed' || t.status === 'cancelled') && (
                        <button onClick={() => deleteTournament(t.id)}
                          className="px-4 py-2 text-[#ff3b30] border border-[#d2d2d7] rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-[#fff5f5] transition-colors">
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {tournaments.length === 0 && (
        <div className="text-center py-20">
          <Trophy size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-xl font-semibold text-[#86868b]">No Tournaments</p>
          <p className="text-[#86868b] mt-2">Create your first tournament!</p>
        </div>
      )}

      {/* Create Tournament Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-8 w-[700px] max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Trophy size={24} className="text-[#0071e3]" /> {editingId ? 'Edit Tournament' : 'Create Tournament'}
                </h3>
                <button onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Name</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Tournament name"
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Game</label>
                    <input value={game} onChange={e => setGame(e.target.value)} placeholder="e.g., Fortnite, Valorant"
                      className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className="text-[#86868b] text-sm mb-1 block">Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tournament description"
                    className={`${inputClass} h-20 resize-none`} />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Format</label>
                    <select value={format} onChange={e => setFormat(e.target.value as TournamentFormat)}
                      className={inputClass}>
                      <option value="bracket">Bracket</option>
                      <option value="1v1">1v1</option>
                      <option value="ffa">FFA</option>
                      <option value="2v2">2v2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Entry Fee</label>
                    <input type="number" value={entryFee} onChange={e => setEntryFee(Number(e.target.value))}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Max Players</label>
                    <input type="number" value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Start Time</label>
                    <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className={inputClass} />
                  </div>
                </div>

                {/* Prize Distribution */}
                <div>
                  <label className="text-[#86868b] text-sm mb-2 block">Prize Distribution</label>
                  <div className="space-y-2">
                    {prizes.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[#86868b] text-sm w-16">{p.position === 1 ? '1st' : p.position === 2 ? '2nd' : `${p.position}th`}</span>
                        <input type="number" value={p.percentage} onChange={e => {
                          const np = [...prizes]; np[i] = { ...np[i], percentage: Number(e.target.value) }; setPrizes(np);
                        }} className="w-20 bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1 text-[#1d1d1f] text-sm outline-none focus:border-[#0071e3]" />
                        <span className="text-[#86868b] text-sm">% = {Math.floor(maxPlayers * entryFee * p.percentage / 100)} coins</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[#86868b] text-sm mb-1 block">Rules</label>
                  <textarea value={rules} onChange={e => setRules(e.target.value)} placeholder="Tournament rules..."
                    className={`${inputClass} h-20 resize-none`} />
                </div>

                {/* Profit Preview */}
                <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#34c759]/20">
                  <h4 className="font-semibold text-[#34c759] mb-2 flex items-center gap-2">
                    <DollarSign size={16} /> Profit Preview
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[#86868b]">Total Entry Fees</p>
                      <p className="text-[#1d1d1f] font-semibold">{maxPlayers * entryFee} coins</p>
                    </div>
                    <div>
                      <p className="text-[#86868b]">Prize Pool</p>
                      <p className="text-[#ff9500] font-semibold">{Math.floor(totalPrizePool)} coins</p>
                    </div>
                    <div>
                      <p className="text-[#86868b]">Admin Profit</p>
                      <p className="text-[#34c759] font-semibold text-lg">{Math.floor(adminProfit)} coins</p>
                    </div>
                  </div>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={createTournament}
                className="w-full mt-6 py-3 bg-[#0071e3] text-white font-medium text-lg rounded-xl flex items-center justify-center gap-2 hover:bg-[#0077ED] transition-colors"
              >
                <Trophy size={20} /> {editingId ? 'Save Changes' : 'Create Tournament'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
