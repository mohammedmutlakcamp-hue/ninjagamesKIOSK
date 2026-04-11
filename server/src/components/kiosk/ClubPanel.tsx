'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, Crown, Shield, UserPlus, UserMinus, Plus, Trophy,
  Search, Loader2, Check, AlertTriangle, Swords, LogOut, Skull, ArrowLeft,
  Coins, ArrowUpRight, ArrowDownRight, Ticket,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import {
  Club, ClubInvite, CLUB_MAX_MEMBERS,
  createClub, inviteToClub, acceptClubInvite, declineClubInvite,
  leaveClub, disbandClub, kickMember,
  depositToClub, withdrawFromClub, depositVoucherToClub, withdrawVoucherFromClub,
  clubTotalBalance, clubShareOf,
} from '@/lib/clubs';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props {
  player: any;
  open: boolean;
  onClose: () => void;
}

type MemberInfo = {
  uid: string;
  username: string;
  ninjaType: string;
  profilePhoto?: string;
  isOnline?: boolean;
};

export function ClubPanel({ player, open, onClose }: Props) {
  const [club, setClub] = useState<Club | null>(null);
  const [clubLoaded, setClubLoaded] = useState(false);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [invites, setInvites] = useState<ClubInvite[]>([]);
  const [view, setView] = useState<'main' | 'create' | 'invite' | 'confirmLeave' | 'confirmDisband' | 'treasury'>('main');

  // Treasury state
  const [depositAmount, setDepositAmount] = useState('');
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryError, setTreasuryError] = useState('');

  // Create-club form
  const [createName, setCreateName] = useState('');
  const [createTag, setCreateTag] = useState('');
  const [createLogo, setCreateLogo] = useState('⚔️');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Invite form
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitingUid, setInvitingUid] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState('');

  // Action spinners
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [leavingClub, setLeavingClub] = useState(false);

  useEscapeKey(() => {
    if (view !== 'main') setView('main');
    else onClose();
  }, open);

  // Subscribe to the player's current club (if any)
  useEffect(() => {
    if (!open || !player?.uid) return;
    const clubId = player?.clubId;
    if (!clubId) { setClub(null); setClubLoaded(true); return; }
    setClubLoaded(false);
    const unsub = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) {
        setClub({ id: snap.id, ...(snap.data() as any) });
      } else {
        setClub(null);
      }
      setClubLoaded(true);
    });
    return () => unsub();
  }, [open, player?.uid, player?.clubId]);

  // Fetch member details whenever the member list changes. Uses direct getDoc
  // by doc ID (reliable) instead of the broken __name__ query.
  useEffect(() => {
    if (!club?.members?.length) { setMembers([]); return; }
    let cancelled = false;
    (async () => {
      const results: MemberInfo[] = [];
      for (const uid of club.members) {
        try {
          const snap = await getDoc(doc(db, 'players', uid));
          if (snap.exists()) {
            const data = snap.data() as any;
            results.push({
              uid: snap.id,
              username: data.username || 'Unknown',
              ninjaType: data.ninjaType || data.character?.ninjaType || 'neon',
              profilePhoto: data.profilePhoto,
              isOnline: data.onlineStatus?.isOnline || false,
            });
          } else {
            results.push({ uid, username: '(missing)', ninjaType: 'neon' });
          }
        } catch (err) { console.error('fetch member failed', uid, err); }
      }
      if (!cancelled) setMembers(results);
    })();
    return () => { cancelled = true; };
  }, [club?.members?.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to incoming club invites for this player
  useEffect(() => {
    if (!open || !player?.uid) return;
    const q = query(
      collection(db, 'club-invites'),
      where('to', '==', player.uid),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: ClubInvite[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setInvites(list);
    });
    return () => unsub();
  }, [open, player?.uid]);

  const isLeader = !!club && club.leaderUid === player?.uid;
  const clubFull = !!club && club.members.length >= CLUB_MAX_MEMBERS;

  // ── Actions ──
  const handleCreate = async () => {
    setCreateError('');
    if (!createName.trim() || createName.trim().length < 3) { setCreateError('Name must be at least 3 characters'); return; }
    if (!createTag.trim() || createTag.trim().length < 2) { setCreateError('Tag must be at least 2 characters'); return; }
    setCreating(true);
    try {
      await createClub({
        name: createName.trim(),
        tag: createTag.trim(),
        leaderUid: player.uid,
        leaderUsername: player.username,
        logo: createLogo,
      });
      setView('main');
      setCreateName(''); setCreateTag(''); setCreateLogo('⚔️');
    } catch (err) {
      console.error(err);
      setCreateError('Failed to create club. Try again.');
    }
    setCreating(false);
  };

  const handleSearchPlayers = async (term: string) => {
    setInviteSearch(term);
    if (!term.trim()) { setInviteResults([]); return; }
    setInviteLoading(true);
    try {
      const snap = await getDocs(collection(db, 'players'));
      const q = term.toLowerCase();
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() } as any))
        .filter((p: any) =>
          p.uid !== player.uid &&
          !p.clubId &&
          !p.isGuest &&
          p.username?.toLowerCase().includes(q)
        )
        .slice(0, 8);
      setInviteResults(results);
    } catch (err) { console.error(err); }
    setInviteLoading(false);
  };

  const handleSendInvite = async (targetUid: string) => {
    if (!club) return;
    setInvitingUid(targetUid);
    setInviteError('');
    try {
      const result = await inviteToClub({
        clubId: club.id,
        clubName: club.name,
        clubTag: club.tag,
        from: player.uid,
        fromUsername: player.username,
        to: targetUid,
      });
      if (result === 'already-in-club') setInviteError('That player is already in a club.');
      else if (result === 'already-pending') setInviteError('Invite already sent.');
      else {
        setInviteResults(prev => prev.map(p => p.uid === targetUid ? { ...p, invited: true } : p));
      }
    } catch (err) {
      console.error(err);
      setInviteError('Failed to send invite.');
    }
    setInvitingUid(null);
  };

  const handleAcceptInvite = async (invite: ClubInvite) => {
    setProcessingInvite(invite.id);
    try {
      const result = await acceptClubInvite(invite.id, player.uid);
      if (result === 'full') setInviteError('That club is full.');
      else if (result === 'already-in-club') setInviteError('You are already in a club.');
      else if (result === 'gone') setInviteError('That invite is no longer valid.');
      else if (result === 'ok') {
        // Optimistically flip the local view to the club we just joined so the
        // user sees the change immediately (the snapshot will arrive soon after).
        try {
          const clubSnap = await getDoc(doc(db, 'clubs', invite.clubId));
          if (clubSnap.exists()) {
            setClub({ id: clubSnap.id, ...(clubSnap.data() as any) });
            setClubLoaded(true);
            setView('main');
          }
        } catch (err) { console.error('post-accept refresh failed', err); }
      }
    } catch (err) {
      console.error('acceptClubInvite failed', err);
      setInviteError('Accept failed — check console for details.');
    }
    setProcessingInvite(null);
  };

  const handleDeclineInvite = async (invite: ClubInvite) => {
    setProcessingInvite(invite.id);
    try { await declineClubInvite(invite.id); } catch (err) { console.error(err); }
    setProcessingInvite(null);
  };

  const handleLeave = async () => {
    if (!club) return;
    setLeavingClub(true);
    try {
      await leaveClub(club.id, player.uid);
      setView('main');
    } catch (err) { console.error(err); }
    setLeavingClub(false);
  };

  const handleDisband = async () => {
    if (!club) return;
    setLeavingClub(true);
    try {
      await disbandClub(club.id, player.uid);
      setView('main');
    } catch (err) { console.error(err); }
    setLeavingClub(false);
  };

  const handleKick = async (memberUid: string) => {
    if (!club) return;
    try { await kickMember(club.id, memberUid, player.uid); } catch (err) { console.error(err); }
  };

  // ── Treasury ──
  const handleDeposit = async () => {
    if (!club) return;
    setTreasuryError('');
    const amount = parseInt(depositAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) { setTreasuryError('Enter a valid amount'); return; }
    if ((player.coins || 0) < amount) { setTreasuryError(`You only have ${player.coins || 0} tokens`); return; }
    setTreasuryLoading(true);
    try {
      const result = await depositToClub(club.id, player.uid, amount);
      if (result === 'ok') { setDepositAmount(''); }
      else if (result === 'insufficient') setTreasuryError(`You only have ${player.coins || 0} tokens`);
      else if (result === 'not-member') setTreasuryError('You are not a member of this club');
      else setTreasuryError('Deposit failed');
    } catch (err) {
      console.error(err);
      setTreasuryError('Deposit failed');
    }
    setTreasuryLoading(false);
  };

  const handleDepositVoucher = async () => {
    if (!club) return;
    setTreasuryError('');
    setTreasuryLoading(true);
    try {
      const result = await depositVoucherToClub(club.id, player.uid);
      if (result === 'no-voucher') setTreasuryError('You have no Tournament Entry Pass to deposit');
      else if (result === 'not-member') setTreasuryError('You are not a member of this club');
      else if (result !== 'ok') setTreasuryError('Deposit failed');
    } catch (err) {
      console.error(err);
      setTreasuryError('Deposit failed');
    }
    setTreasuryLoading(false);
  };

  const handleWithdrawVoucher = async () => {
    if (!club) return;
    setTreasuryError('');
    setTreasuryLoading(true);
    try {
      const result = await withdrawVoucherFromClub(club.id, player.uid);
      if (result === 'none-owned') setTreasuryError('You have no deposited vouchers to take back');
      else if (result === 'not-member') setTreasuryError('You are not a member of this club');
      else if (result !== 'ok') setTreasuryError('Withdraw failed');
    } catch (err) {
      console.error(err);
      setTreasuryError('Withdraw failed');
    }
    setTreasuryLoading(false);
  };

  const handleWithdraw = async () => {
    if (!club) return;
    setTreasuryError('');
    const amount = parseInt(depositAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) { setTreasuryError('Enter a valid amount'); return; }
    const myShare = clubShareOf(club, player.uid);
    if (myShare < amount) { setTreasuryError(`Your cut is only ${myShare} tokens`); return; }
    setTreasuryLoading(true);
    try {
      const result = await withdrawFromClub(club.id, player.uid, amount);
      if (result === 'ok') { setDepositAmount(''); }
      else if (result === 'insufficient-share') setTreasuryError(`Your cut is only ${myShare} tokens`);
      else if (result === 'not-member') setTreasuryError('You are not a member of this club');
      else setTreasuryError('Withdraw failed');
    } catch (err) {
      console.error(err);
      setTreasuryError('Withdraw failed');
    }
    setTreasuryLoading(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[720px] max-w-[95vw] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
            border: '1.5px solid rgba(168,85,247,0.4)',
            boxShadow: '0 0 40px rgba(168,85,247,0.2), inset 0 0 40px rgba(168,85,247,0.04)',
          }}
        >
          {/* ═══ Animated sidebar-style background ═══ */}
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
          <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
            backgroundImage: 'linear-gradient(rgba(168,85,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.06) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%23A855F7' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 52px',
          }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 720 700" preserveAspectRatio="none">
            <path d="M0,60 L120,60 L150,40 L380,40 L410,60 L720,60" stroke="#A855F7" strokeWidth="0.8" fill="none" opacity="0.12" />
            <path d="M720,180 L540,180 L510,200 L200,200 L170,180 L0,180" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
            <path d="M0,340 L160,340 L190,320 L440,320 L470,340 L720,340" stroke="#A855F7" strokeWidth="0.6" fill="none" opacity="0.08" />
            <path d="M720,480 L560,480 L530,500 L220,500 L190,480 L0,480" stroke="#39FF14" strokeWidth="0.5" fill="none" opacity="0.07" />
            <path d="M0,600 L180,600 L210,580 L460,580 L490,600 L720,600" stroke="#A855F7" strokeWidth="0.5" fill="none" opacity="0.06" />
            <path d="M380,0 L380,40 L350,60 L350,180" stroke="#A855F7" strokeWidth="0.7" fill="none" opacity="0.1" />
            <path d="M540,200 L540,320 L560,340 L560,480" stroke="#00c8ff" strokeWidth="0.6" fill="none" opacity="0.07" />
            <circle cx="380" cy="40" r="3" fill="#A855F7" opacity="0.25" className="pcb-node-flash" />
            <circle cx="170" cy="200" r="2.5" fill="#00c8ff" opacity="0.2" className="pcb-node-flash2" />
            <circle cx="440" cy="320" r="2.5" fill="#A855F7" opacity="0.18" className="pcb-node-flash3" />
            <circle cx="220" cy="500" r="2" fill="#39FF14" opacity="0.15" className="pcb-node-flash" />
          </svg>
          <div className="absolute top-[60px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#A855F7', boxShadow: '0 0 8px #A855F7, 0 0 15px #A855F7' }} />
          <div className="absolute top-[340px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
          <div className="absolute top-[600px] left-0 w-3 h-[2px] rounded-full pcb-pulse-hr z-0" style={{ background: '#A855F7', boxShadow: '0 0 6px #A855F7' }} />
          <div className="absolute top-0 left-[380px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#A855F7', boxShadow: '0 0 8px #A855F7' }} />
          <div className="absolute top-0 left-[540px] w-[2px] h-2 rounded-full pcb-pulse-v2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
          <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(168,85,247,0.15)' }} />
          <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
          <div className="absolute left-[10%] top-[18%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(168,85,247,0.4)' }} />
          <div className="absolute left-[72%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
          <div className="absolute left-[35%] top-[78%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(57,255,20,0.3)' }} />
          <div className="absolute inset-0 pointer-events-none z-0" style={{
            background: 'radial-gradient(ellipse at 50% 5%, rgba(168,85,247,0.1) 0%, transparent 42%), radial-gradient(ellipse at 20% 60%, rgba(0,200,255,0.05) 0%, transparent 45%), radial-gradient(ellipse at 80% 90%, rgba(57,255,20,0.04) 0%, transparent 45%)',
          }} />

          {/* HUD corners */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
            <div key={ci} className={`absolute ${pos} w-6 h-6 z-10 pointer-events-none`} style={{
              ...(pos.includes('top') ? { borderTop: '3px solid #A855F7' } : { borderBottom: '3px solid #A855F7' }),
              ...(pos.includes('left') ? { borderLeft: '3px solid #A855F7' } : { borderRight: '3px solid #A855F7' }),
              filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.6))',
            }} />
          ))}

          {/* Header */}
          <div className="relative z-[5] flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(168,85,247,0.2)' }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.08))', border: '1px solid rgba(168,85,247,0.5)', boxShadow: '0 0 15px rgba(168,85,247,0.2)' }}>
                <Shield size={22} className="text-purple-300" style={{ filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.7))' }} />
              </div>
              <div>
                <h2 className="font-ninja text-2xl text-white tracking-wider" style={{ textShadow: '0 0 15px rgba(168,85,247,0.35)' }}>
                  {view === 'create' ? 'CREATE CLUB' : view === 'invite' ? 'INVITE MEMBERS' : view === 'treasury' ? 'TREASURY' : 'CLUBS'}
                </h2>
                {club && view === 'main' && (
                  <p className="font-body text-xs text-gray-500">
                    {club.members.length}/{CLUB_MAX_MEMBERS} members
                    {isLeader && ' · Leader'}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/10 hover:rotate-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <X size={18} className="text-gray-400" />
            </button>
          </div>

          {/* Body */}
          <div className="relative z-[5] flex-1 overflow-y-auto p-6">
            {/* ═══ CREATE CLUB VIEW ═══ */}
            {view === 'create' && (
              <div className="space-y-5 max-w-md mx-auto">
                <div>
                  <label className="font-ninja text-xs text-purple-300 tracking-wider block mb-2">CLUB NAME</label>
                  <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={24}
                    placeholder="e.g. Shadow Ninjas"
                    className="w-full bg-white/5 border border-purple-500/30 rounded-lg px-4 py-3 font-body text-white outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="font-ninja text-xs text-purple-300 tracking-wider block mb-2">TAG (2-5 chars)</label>
                  <input type="text" value={createTag} onChange={(e) => setCreateTag(e.target.value.toUpperCase())} maxLength={5}
                    placeholder="e.g. SNJA"
                    className="w-full bg-white/5 border border-purple-500/30 rounded-lg px-4 py-3 font-ninja text-white tracking-wider outline-none focus:border-purple-400 uppercase" />
                </div>
                <div>
                  <label className="font-ninja text-xs text-purple-300 tracking-wider block mb-2">EMBLEM</label>
                  <div className="flex gap-2 flex-wrap">
                    {['⚔️','🥷','🐉','⚡','🔥','💀','👑','🛡️','⭐'].map(emoji => (
                      <button key={emoji} onClick={() => setCreateLogo(emoji)}
                        className={`w-12 h-12 rounded-lg text-2xl flex items-center justify-center transition-all ${createLogo === emoji ? 'ring-2 ring-purple-400 bg-purple-500/20' : 'bg-white/5 hover:bg-white/10'}`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                {createError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle size={14} /> {createError}
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setView('main')}
                    className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-gray-400 hover:text-white transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    CANCEL
                  </button>
                  <button onClick={handleCreate} disabled={creating}
                    className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-white flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', boxShadow: '0 0 15px rgba(168,85,247,0.35)' }}>
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    CREATE CLUB
                  </button>
                </div>
              </div>
            )}

            {/* ═══ INVITE VIEW ═══ */}
            {view === 'invite' && club && (
              <div className="space-y-4 max-w-md mx-auto">
                <button onClick={() => setView('main')}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ninja text-[10px] tracking-[0.15em] text-purple-300 hover:text-white transition-all overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.04))',
                    border: '1px solid rgba(168,85,247,0.35)',
                    boxShadow: '0 0 8px rgba(168,85,247,0.15)',
                  }}>
                  <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(168,85,247,0.7)', borderLeft: '1px solid rgba(168,85,247,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(168,85,247,0.7)', borderRight: '1px solid rgba(168,85,247,0.7)' }} />
                  <ArrowLeft size={12} /> BACK TO CLUB
                </button>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="text" value={inviteSearch} onChange={(e) => handleSearchPlayers(e.target.value)}
                    placeholder="Search players by username..."
                    className="w-full bg-white/5 border border-purple-500/30 rounded-lg pl-10 pr-4 py-3 font-body text-white outline-none focus:border-purple-400" />
                </div>
                {inviteError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle size={14} /> {inviteError}
                  </div>
                )}
                <div className="space-y-2">
                  {inviteLoading && <Loader2 size={18} className="animate-spin text-purple-400 mx-auto" />}
                  {!inviteLoading && inviteSearch && inviteResults.length === 0 && (
                    <p className="font-body text-xs text-gray-500 text-center py-4">No available players found</p>
                  )}
                  {inviteResults.map((p: any) => (
                    <div key={p.uid} className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <img src={p.profilePhoto || `/img/pfp-${p.ninjaType || 'neon'}.png`} alt={p.username}
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                      <div className="flex-1">
                        <p className="font-body text-sm text-white">{p.username}</p>
                        <p className="font-body text-[10px] text-gray-500">Lvl {p.level || 1}</p>
                      </div>
                      {clubFull ? (
                        <span className="font-body text-[10px] text-red-400">Club full</span>
                      ) : p.invited ? (
                        <span className="font-ninja text-[10px] text-green-400 tracking-wider flex items-center gap-1">
                          <Check size={12} /> INVITED
                        </span>
                      ) : (
                        <button onClick={() => handleSendInvite(p.uid)} disabled={invitingUid === p.uid}
                          className="px-3 py-1.5 rounded font-ninja text-[10px] tracking-wider text-white"
                          style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', boxShadow: '0 0 8px rgba(168,85,247,0.3)' }}>
                          {invitingUid === p.uid ? <Loader2 size={11} className="animate-spin" /> : 'INVITE'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ TREASURY VIEW ═══ */}
            {view === 'treasury' && club && (
              <div className="space-y-4 max-w-md mx-auto">
                <button onClick={() => setView('main')}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ninja text-[10px] tracking-[0.15em] text-purple-300 hover:text-white transition-all overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.04))',
                    border: '1px solid rgba(168,85,247,0.35)',
                    boxShadow: '0 0 8px rgba(168,85,247,0.15)',
                  }}>
                  <div className="absolute top-0 left-0 w-1.5 h-1.5" style={{ borderTop: '1px solid rgba(168,85,247,0.7)', borderLeft: '1px solid rgba(168,85,247,0.7)' }} />
                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5" style={{ borderBottom: '1px solid rgba(168,85,247,0.7)', borderRight: '1px solid rgba(168,85,247,0.7)' }} />
                  <ArrowLeft size={12} /> BACK TO CLUB
                </button>

                {/* Treasury total card */}
                <div className="relative rounded-xl p-5 text-center overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.03))',
                    border: '1.5px solid rgba(234,179,8,0.45)',
                    boxShadow: '0 0 24px rgba(234,179,8,0.18)',
                  }}>
                  {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                    <div key={ci} className={`absolute ${pos} w-3 h-3`} style={{
                      ...(pos.includes('top') ? { borderTop: '2px solid #EAB308' } : { borderBottom: '2px solid #EAB308' }),
                      ...(pos.includes('left') ? { borderLeft: '2px solid #EAB308' } : { borderRight: '2px solid #EAB308' }),
                      opacity: 0.85,
                    }} />
                  ))}
                  <div className="font-ninja text-[10px] tracking-[0.25em] text-yellow-300/80 mb-1.5">TOTAL TREASURY</div>
                  <div className="flex items-center justify-center gap-2">
                    <Coins size={26} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.7))' }} />
                    <span className="font-ninja text-4xl text-yellow-400" style={{ textShadow: '0 0 18px rgba(234,179,8,0.55)' }}>
                      {clubTotalBalance(club)}
                    </span>
                  </div>
                  <p className="font-body text-[10px] text-gray-500 mt-1.5">Deposits &amp; prizes split evenly across members.</p>
                </div>

                {/* Per-member shares grid */}
                <div>
                  <h4 className="font-ninja text-[10px] text-yellow-300/80 tracking-[0.2em] mb-2">MEMBER SHARES</h4>
                  <div className="space-y-1.5">
                    {club.members.map(uid => {
                      const m = members.find(x => x.uid === uid);
                      const share = clubShareOf(club, uid);
                      const isMe = uid === player.uid;
                      const isMemberLeader = uid === club.leaderUid;
                      return (
                        <div key={uid} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                          style={{
                            background: isMe ? 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.04))' : 'rgba(255,255,255,0.03)',
                            border: isMe ? '1px solid rgba(234,179,8,0.45)' : '1px solid rgba(255,255,255,0.06)',
                            boxShadow: isMe ? '0 0 8px rgba(234,179,8,0.12)' : 'none',
                          }}>
                          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
                            style={{ border: isMemberLeader ? '1.5px solid #EAB308' : '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={m?.profilePhoto || `/img/pfp-${m?.ninjaType || 'neon'}.png`} alt={m?.username}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-body text-[12px] text-white truncate">{m?.username || '...'}</span>
                              {isMemberLeader && <Crown size={9} className="text-yellow-400 flex-shrink-0" />}
                              {isMe && (
                                <span className="font-ninja text-[8px] tracking-wider px-1.5 py-0.5 rounded"
                                  style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', color: '#EAB308' }}>
                                  YOU
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Coins size={11} className="text-yellow-400" />
                            <span className="font-ninja text-sm text-yellow-400">{share}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Voucher pool card with per-member ownership */}
                {(() => {
                  const ownVouchers = (player.inventory || []).filter((it: any) => it && it.name === 'Tournament Entry Pass' && !it.used).length;
                  const byMember = club.vouchersByMember || {};
                  const myDeposited = byMember[player.uid] || 0;
                  const totalPool = club.vouchers || 0;
                  return (
                    <div className="relative rounded-xl p-4 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(0,191,255,0.12), rgba(0,191,255,0.03))',
                        border: '1.5px solid rgba(0,191,255,0.45)',
                        boxShadow: '0 0 18px rgba(0,191,255,0.15)',
                      }}>
                      {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
                        <div key={ci} className={`absolute ${pos} w-2.5 h-2.5`} style={{
                          ...(pos.includes('top') ? { borderTop: '1.5px solid #00BFFF' } : { borderBottom: '1.5px solid #00BFFF' }),
                          ...(pos.includes('left') ? { borderLeft: '1.5px solid #00BFFF' } : { borderRight: '1.5px solid #00BFFF' }),
                          opacity: 0.85,
                        }} />
                      ))}
                      <div className="relative z-[2] flex items-start gap-3 mb-3">
                        <Ticket size={22} className="text-cyan-300 flex-shrink-0 mt-0.5" style={{ filter: 'drop-shadow(0 0 6px rgba(0,191,255,0.7))' }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-ninja text-[10px] tracking-[0.2em] text-cyan-300/80">VOUCHER POOL</div>
                          <div className="font-ninja text-2xl text-cyan-300" style={{ textShadow: '0 0 10px rgba(0,191,255,0.5)' }}>
                            {totalPool}
                            <span className="text-[10px] text-gray-500 ml-2 tracking-wider">TOTAL</span>
                          </div>
                          <div className="font-body text-[10px] text-gray-500 mt-0.5">
                            Your deposits: <span className="text-cyan-300 font-ninja">{myDeposited}</span>
                            {' · '}
                            In inventory: <span className="text-cyan-300 font-ninja">{ownVouchers}</span>
                          </div>
                        </div>
                      </div>
                      {/* Per-member contribution grid */}
                      {club.members.length > 0 && Object.keys(byMember).length > 0 && (
                        <div className="relative z-[2] mb-3 flex flex-wrap gap-1.5">
                          {club.members.map(uid => {
                            const m = members.find(x => x.uid === uid);
                            const count = byMember[uid] || 0;
                            if (count === 0) return null;
                            const isMe = uid === player.uid;
                            return (
                              <div key={uid} className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px]"
                                style={{
                                  background: isMe ? 'rgba(0,191,255,0.15)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${isMe ? 'rgba(0,191,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                  color: isMe ? '#00BFFF' : '#9ca3af',
                                }}>
                                <Ticket size={9} />
                                <span className="font-body">{m?.username || '...'}</span>
                                <span className="font-ninja">×{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Deposit / Take-mine-back buttons */}
                      <div className="relative z-[2] flex gap-2">
                        <motion.button whileTap={{ scale: 0.94 }}
                          onClick={handleDepositVoucher}
                          disabled={treasuryLoading}
                          className="relative flex-1 py-2 rounded-md font-ninja text-[10px] tracking-wider overflow-hidden transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                          style={{
                            background: 'linear-gradient(135deg, rgba(0,191,255,0.22), rgba(0,191,255,0.06))',
                            border: '1.5px solid rgba(0,191,255,0.55)',
                            color: '#00BFFF',
                            boxShadow: '0 0 10px rgba(0,191,255,0.25)',
                            textShadow: '0 0 4px rgba(0,191,255,0.5)',
                          }}>
                          <Ticket size={12} /> DEPOSIT PASS
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.94 }}
                          onClick={handleWithdrawVoucher}
                          disabled={treasuryLoading || myDeposited === 0}
                          title={myDeposited === 0 ? 'You have no deposited vouchers' : 'Take back one of your own deposits'}
                          className="relative flex-1 py-2 rounded-md font-ninja text-[10px] tracking-wider overflow-hidden transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                          style={{
                            background: 'linear-gradient(135deg, rgba(168,85,247,0.22), rgba(168,85,247,0.06))',
                            border: '1.5px solid rgba(168,85,247,0.55)',
                            color: '#C084FC',
                            boxShadow: '0 0 10px rgba(168,85,247,0.25)',
                            textShadow: '0 0 4px rgba(168,85,247,0.5)',
                          }}>
                          <ArrowDownRight size={12} /> TAKE MINE
                        </motion.button>
                      </div>
                    </div>
                  );
                })()}

                {/* Your wallet reference */}
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-body text-gray-400">Your wallet</span>
                  <span className="font-ninja text-yellow-400 flex items-center gap-1"><Coins size={12} /> {player.coins || 0}</span>
                </div>

                {/* Amount input */}
                <div>
                  <label className="font-ninja text-xs text-yellow-300 tracking-wider block mb-2">AMOUNT</label>
                  <input type="number" min={1} step={50} value={depositAmount}
                    onChange={(e) => { setDepositAmount(e.target.value); setTreasuryError(''); }}
                    placeholder="Enter tokens"
                    className="w-full bg-white/5 border border-yellow-500/30 rounded-lg px-4 py-3 font-ninja text-lg text-white outline-none focus:border-yellow-400" />
                </div>

                {treasuryError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle size={14} /> {treasuryError}
                  </div>
                )}

                {/* Deposit / Withdraw buttons */}
                <div className="flex gap-3">
                  <button onClick={handleDeposit} disabled={treasuryLoading || !depositAmount}
                    className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(57,255,20,0.06))',
                      border: '1.5px solid rgba(57,255,20,0.55)',
                      color: '#39FF14',
                      boxShadow: '0 0 14px rgba(57,255,20,0.25)',
                      textShadow: '0 0 6px rgba(57,255,20,0.5)',
                    }}>
                    {treasuryLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
                    DEPOSIT
                  </button>
                  <button onClick={handleWithdraw} disabled={treasuryLoading || !depositAmount}
                    className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.06))',
                      border: '1.5px solid rgba(168,85,247,0.55)',
                      color: '#C084FC',
                      boxShadow: '0 0 14px rgba(168,85,247,0.25)',
                      textShadow: '0 0 6px rgba(168,85,247,0.5)',
                    }}>
                    {treasuryLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownRight size={14} />}
                    TAKE MY CUT
                  </button>
                </div>
                <p className="font-body text-[10px] text-gray-500 text-center">
                  Each member can withdraw only from their own cut.
                </p>
              </div>
            )}

            {/* ═══ CONFIRM LEAVE ═══ */}
            {view === 'confirmLeave' && club && (
              <div className="max-w-sm mx-auto text-center py-8">
                <LogOut size={48} className="text-red-400 mx-auto mb-4" />
                <h3 className="font-ninja text-2xl text-white mb-2">Leave {club.name}?</h3>
                <p className="font-body text-sm text-gray-400 mb-6">You will lose your spot and will need a new invite to rejoin.</p>
                <div className="flex gap-3">
                  <button onClick={() => setView('main')} className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-gray-400"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>CANCEL</button>
                  <button onClick={handleLeave} disabled={leavingClub} className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-white"
                    style={{ background: 'linear-gradient(135deg, #EF4444, #B91C1C)', boxShadow: '0 0 15px rgba(239,68,68,0.3)' }}>
                    {leavingClub ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'LEAVE CLUB'}
                  </button>
                </div>
              </div>
            )}

            {/* ═══ CONFIRM DISBAND ═══ */}
            {view === 'confirmDisband' && club && (
              <div className="max-w-sm mx-auto text-center py-8">
                <Skull size={48} className="text-red-400 mx-auto mb-4" />
                <h3 className="font-ninja text-2xl text-white mb-2">Disband {club.name}?</h3>
                <p className="font-body text-sm text-gray-400 mb-6">All {club.members.length} members will be removed. This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setView('main')} className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-gray-400"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>CANCEL</button>
                  <button onClick={handleDisband} disabled={leavingClub} className="flex-1 py-3 rounded-lg font-ninja text-sm tracking-wider text-white"
                    style={{ background: 'linear-gradient(135deg, #EF4444, #B91C1C)', boxShadow: '0 0 15px rgba(239,68,68,0.3)' }}>
                    {leavingClub ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'DISBAND'}
                  </button>
                </div>
              </div>
            )}

            {/* ═══ MAIN VIEW ═══ */}
            {view === 'main' && (
              <>
                {/* No club → show create + invites */}
                {!clubLoaded && <Loader2 size={22} className="animate-spin text-purple-400 mx-auto my-10" />}
                {clubLoaded && !club && (
                  <div className="space-y-5">
                    {/* Incoming invites */}
                    {invites.length > 0 && (
                      <div>
                        <h3 className="font-ninja text-sm text-purple-300 tracking-wider mb-3">INVITES ({invites.length})</h3>
                        <div className="space-y-2">
                          {invites.map(invite => (
                            <div key={invite.id} className="flex items-center gap-3 p-3 rounded-lg"
                              style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.02))', border: '1px solid rgba(168,85,247,0.25)' }}>
                              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                                🛡️
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-ninja text-sm text-white tracking-wider">[{invite.clubTag}] {invite.clubName}</p>
                                <p className="font-body text-[11px] text-gray-500">Invited by {invite.fromUsername}</p>
                              </div>
                              <button onClick={() => handleAcceptInvite(invite)} disabled={processingInvite === invite.id}
                                className="w-8 h-8 rounded flex items-center justify-center"
                                style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.4)' }}>
                                {processingInvite === invite.id ? <Loader2 size={12} className="animate-spin text-green-400" /> : <Check size={14} className="text-green-400" />}
                              </button>
                              <button onClick={() => handleDeclineInvite(invite)} disabled={processingInvite === invite.id}
                                className="w-8 h-8 rounded flex items-center justify-center"
                                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                                <X size={14} className="text-red-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Create CTA */}
                    <div className="text-center py-6">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))', border: '2px solid rgba(168,85,247,0.4)', boxShadow: '0 0 25px rgba(168,85,247,0.2)' }}>
                        <Shield size={36} className="text-purple-300" style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.6))' }} />
                      </div>
                      <h3 className="font-ninja text-xl text-white mb-2">YOU'RE NOT IN A CLUB</h3>
                      <p className="font-body text-sm text-gray-500 mb-5 max-w-sm mx-auto">
                        Form a club of up to {CLUB_MAX_MEMBERS} ninjas to compete in tournaments as a team.
                      </p>
                      <button onClick={() => { setView('create'); setCreateError(''); }}
                        className="px-8 py-3 rounded-xl font-ninja text-sm tracking-wider text-white inline-flex items-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', boxShadow: '0 0 18px rgba(168,85,247,0.4)' }}>
                        <Plus size={16} /> CREATE CLUB
                      </button>
                    </div>
                  </div>
                )}

                {/* In a club → show info + members + actions */}
                {clubLoaded && club && (
                  <div className="space-y-5">
                    {/* Club banner */}
                    <div className="relative rounded-xl p-5 overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.03) 50%, rgba(0,0,0,0.4))', border: '1px solid rgba(168,85,247,0.35)', boxShadow: '0 0 20px rgba(168,85,247,0.1)' }}>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-4xl flex-shrink-0"
                          style={{ background: 'rgba(168,85,247,0.2)', border: '2px solid rgba(168,85,247,0.5)', boxShadow: '0 0 15px rgba(168,85,247,0.3)' }}>
                          {club.logo || '⚔️'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-ninja text-xs text-purple-300 tracking-[0.2em]">[{club.tag}]</span>
                          </div>
                          <h3 className="font-ninja text-2xl text-white tracking-wide" style={{ textShadow: '0 0 12px rgba(168,85,247,0.4)' }}>{club.name}</h3>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Trophy size={11} className="text-yellow-400" /> {club.wins || 0}W
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Swords size={11} className="text-red-400" /> {club.losses || 0}L
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Users size={11} className="text-cyan-400" /> {club.members.length}/{CLUB_MAX_MEMBERS}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-yellow-400" title="Club treasury">
                              <Coins size={11} /> {club.balance || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex gap-2">
                      <button onClick={() => { setView('treasury'); setDepositAmount(''); setTreasuryError(''); }}
                        className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider text-yellow-300 flex items-center justify-center gap-1.5"
                        style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.18), rgba(234,179,8,0.06))', border: '1px solid rgba(234,179,8,0.4)' }}>
                        <Coins size={13} /> TREASURY
                      </button>
                      {isLeader && !clubFull && (
                        <button onClick={() => { setView('invite'); setInviteSearch(''); setInviteResults([]); setInviteError(''); }}
                          className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider text-white flex items-center justify-center gap-1.5"
                          style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(168,85,247,0.1))', border: '1px solid rgba(168,85,247,0.5)' }}>
                          <UserPlus size={13} /> INVITE
                        </button>
                      )}
                      {isLeader ? (
                        <button onClick={() => setView('confirmDisband')}
                          className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider text-red-400 flex items-center justify-center gap-1.5"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                          <Skull size={13} /> DISBAND
                        </button>
                      ) : (
                        <button onClick={() => setView('confirmLeave')}
                          className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider text-red-400 flex items-center justify-center gap-1.5"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                          <LogOut size={13} /> LEAVE
                        </button>
                      )}
                    </div>

                    {/* Members list */}
                    <div>
                      <h3 className="font-ninja text-xs text-purple-300 tracking-[0.2em] mb-3">MEMBERS</h3>
                      <div className="space-y-2">
                        {members.map(m => {
                          const isMemberLeader = m.uid === club.leaderUid;
                          return (
                            <div key={m.uid} className="flex items-center gap-3 p-3 rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isMemberLeader ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                              <div className="relative w-11 h-11 rounded-full overflow-hidden flex-shrink-0" style={{ border: isMemberLeader ? '2px solid #EAB308' : '1px solid rgba(255,255,255,0.1)' }}>
                                <img src={m.profilePhoto || `/img/pfp-${m.ninjaType}.png`} alt={m.username} className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                                {m.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-black" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-body text-sm text-white truncate">{m.username}</p>
                                  {isMemberLeader && (
                                    <span className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-ninja text-yellow-400 tracking-wider"
                                      style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                      <Crown size={9} /> LEADER
                                    </span>
                                  )}
                                </div>
                                <p className="font-body text-[10px] text-gray-500">{m.isOnline ? 'Online' : 'Offline'}</p>
                              </div>
                              {isLeader && !isMemberLeader && (
                                <button onClick={() => handleKick(m.uid)} title="Kick"
                                  className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/20 transition-all"
                                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                                  <UserMinus size={12} className="text-red-400" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Invites section (still pending for this player) */}
                    {invites.length > 0 && (
                      <div>
                        <h3 className="font-ninja text-xs text-gray-500 tracking-[0.2em] mb-2">PENDING INVITES</h3>
                        <p className="font-body text-[11px] text-gray-600">Leave your current club first to accept another invite.</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
