'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, increment,
  collection, addDoc, query, where, getDocs, getDoc,
} from 'firebase/firestore';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { trackDailyTask } from '@/lib/daily-tasks';
import {
  X, MessageSquare, Phone, Coins, UserPlus, UserMinus,
  Clock, Gift, Gamepad2, Package, Shield, Eye, EyeOff,
  Send, Loader2, Check, Lock, Backpack,
} from 'lucide-react';
import { COUNTRY_FLAGS, RARITY_COLORS } from '@/lib/constants';
import Image from 'next/image';
import { NinjaInput } from '@/components/kiosk/NinjaInput';

interface Props {
  targetUid: string;
  currentPlayer: any;
  onClose: () => void;
  onStartCall?: (uid: string, name: string) => void;
  lang?: 'en' | 'ar';
}

export function PlayerProfileCard({ targetUid, currentPlayer, onClose, onStartCall, lang: langProp }: Props) {
  const lang: 'en' | 'ar' = langProp || (typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en');
  const ar = lang === 'ar';
  const [targetPlayer, setTargetPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [targetClub, setTargetClub] = useState<{ name: string; tag: string; logo?: string; memberCount: number } | null>(null);
  const [sendCoinsOpen, setSendCoinsOpen] = useState(false);
  const [sendAmount, setSendAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendPin, setSendPin] = useState('');
  const [sendPinVerified, setSendPinVerified] = useState(false);
  const [sendCountdown, setSendCountdown] = useState(0);
  const sendCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const sendConfirmedRef = useRef(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Comments
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  const isFriend = (currentPlayer?.friends || []).includes(targetUid) || (targetPlayer?.friends || []).includes(currentPlayer?.uid);
  const isSelf = currentPlayer?.uid === targetUid;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'players', targetUid), (snap) => {
      if (snap.exists()) setTargetPlayer({ uid: snap.id, ...snap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [targetUid]);

  // Check for existing pending friend request so the button shows "REQUEST SENT" after reopen
  useEffect(() => {
    if (!currentPlayer?.uid || !targetUid || currentPlayer.uid === targetUid) return;
    const q = query(
      collection(db, 'friend-requests'),
      where('from', '==', currentPlayer.uid),
      where('to', '==', targetUid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      setRequestSent(!snap.empty);
    });
    return () => unsub();
  }, [currentPlayer?.uid, targetUid]);

  // Load profile comments
  useEffect(() => {
    const q = query(
      collection(db, 'profile-comments'),
      where('profileId', '==', targetUid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      setComments(docs.slice(0, 20));
    }, (err) => { console.error('Comments query failed:', err); });
    return () => unsub();
  }, [targetUid]);

  const postComment = async () => {
    if (!commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      await addDoc(collection(db, 'profile-comments'), {
        profileId: targetUid,
        fromId: currentPlayer.uid,
        fromName: currentPlayer.username,
        fromNinjaType: currentPlayer.ninjaType,
        text: commentText.trim().slice(0, 300),
        createdAt: Date.now(),
      });
      setCommentText('');
    } catch { }
    setCommentSaving(false);
  };

  // Fetch the player's club (if any)
  useEffect(() => {
    const clubId = targetPlayer?.clubId;
    if (!clubId) { setTargetClub(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'clubs', clubId));
        if (!cancelled && snap.exists()) {
          const c = snap.data() as any;
          setTargetClub({
            name: c.name || 'Unknown',
            tag: c.tag || '?',
            logo: c.logo,
            memberCount: (c.members || []).length,
          });
        } else if (!cancelled) {
          setTargetClub(null);
        }
      } catch (err) { console.error('fetch club failed', err); }
    })();
    return () => { cancelled = true; };
  }, [targetPlayer?.clubId]);

  const totalXP = targetPlayer ? calculateTotalXP(targetPlayer) : 0;
  const levelInfo = getLevelInfo(totalXP);
  const stats = targetPlayer?.stats || {};
  const isOnline = targetPlayer?.onlineStatus?.isOnline || false;
  const ninjaType = targetPlayer?.ninjaType || 'neon';
  const privacy = targetPlayer?.privacySettings || { profileVisibility: 'public', inventoryVisibility: 'public' };
  const isProfilePrivate = !isSelf && privacy.profileVisibility === 'private';
  const isProfileFriendsOnly = !isSelf && privacy.profileVisibility === 'friends' && !isFriend;
  const showFullProfile = isSelf || (!isProfilePrivate && !isProfileFriendsOnly);
  const isInventoryVisible = isSelf || privacy.inventoryVisibility === 'public' || (privacy.inventoryVisibility === 'friends' && isFriend);
  const countryFlag = COUNTRY_FLAGS.find(c => c.id === targetPlayer?.country);

  const handleAddFriend = async () => {
    setActionLoading(true);
    try {
      // Check if request already exists
      const existing = await getDocs(query(
        collection(db, 'friend-requests'),
        where('from', '==', currentPlayer.uid),
        where('to', '==', targetUid),
        where('status', '==', 'pending')
      ));
      if (existing.empty) {
        await addDoc(collection(db, 'friend-requests'), {
          from: currentPlayer.uid,
          to: targetUid,
          status: 'pending',
          createdAt: Date.now(),
        });
      }
      setRequestSent(true);
    } catch {}
    setActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'players', currentPlayer.uid), { friends: arrayRemove(targetUid) });
      await updateDoc(doc(db, 'players', targetUid), { friends: arrayRemove(currentPlayer.uid) });
      onClose();
    } catch {}
    setActionLoading(false);
  };

  const handleSendCoins = async () => {
    if (sendLoading) return;
    if (!sendPinVerified) {
      if (!sendPin || sendPin.length < 1) { setSendResult(ar ? 'أدخل رمز PIN' : 'Enter your PIN'); return; }
      if (sendPin !== String(currentPlayer.pin)) { setSendResult(ar ? 'رمز PIN غير صحيح' : 'Wrong PIN'); setSendPin(''); return; }
      setSendPinVerified(true);
      setSendResult(null);
      return;
    }
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) { setSendResult(ar ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount'); return; }
    const fee = Math.ceil(amount * 0.1);
    if (amount + fee > (currentPlayer?.coins || 0)) { setSendResult(ar ? 'العملات غير كافية' : 'Not enough coins'); return; }
    setSendLoading(true);
    try {
      await updateDoc(doc(db, 'players', currentPlayer.uid), { coins: increment(-(amount + fee)) });
      await updateDoc(doc(db, 'players', targetUid), { coins: increment(amount) });
      setSendResult(`Sent ${amount} coins!`);
      setSendAmount('');
      setSendPin(''); setSendPinVerified(false);
      trackDailyTask(currentPlayer.uid, 'send_coins').catch(() => {});
      setTimeout(() => { setSendCoinsOpen(false); setSendResult(null); }, 1500);
    } catch { setSendResult(ar ? 'فشل' : 'Failed'); }
    setSendLoading(false);
  };

  const handleCall = () => {
    if (onStartCall && targetPlayer) {
      onStartCall(targetUid, targetPlayer.username || '');
      onClose();
    }
  };

  const handleMessage = () => {
    window.dispatchEvent(new CustomEvent('open-private-chat', {
      detail: { friendId: targetUid, friendName: targetPlayer?.username || '' },
    }));
    onClose();
  };

  return (
    <motion.div
      className="absolute inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 w-[420px] max-w-[92vw] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #030508 0%, #040710 30%, #050a14 60%, #030508 100%)',
          border: '1.5px solid rgba(57,255,20,0.28)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 45px rgba(57,255,20,0.12), inset 0 0 40px rgba(57,255,20,0.02)',
        }}
      >
        {/* ═══ Cyberpunk background layers (match sidebar style, fully animated) ═══ */}
        {/* Breathing glow */}
        <div className="absolute inset-0 pointer-events-none sidebar-glow-breathe" />
        {/* Radial glows */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.1) 0%, transparent 42%), radial-gradient(ellipse at 20% 60%, rgba(0,200,255,0.06) 0%, transparent 45%), radial-gradient(ellipse at 80% 90%, rgba(168,85,247,0.05) 0%, transparent 45%)',
        }} />
        {/* PCB grid (animated fade) */}
        <div className="absolute inset-0 pointer-events-none pcb-grid-fade" style={{
          backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        {/* Hex pattern (animated pulse) */}
        <div className="absolute inset-0 pointer-events-none sidebar-hex-pattern" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 52px',
        }} />
        {/* PCB traces */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 720" preserveAspectRatio="none">
          <path d="M0,60 L80,60 L100,40 L250,40 L270,60 L420,60" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.12" />
          <path d="M420,180 L300,180 L280,200 L120,200 L100,180 L0,180" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
          <path d="M0,340 L100,340 L120,320 L300,320 L320,340 L420,340" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
          <path d="M420,500 L320,500 L300,520 L120,520 L100,500 L0,500" stroke="#A855F7" strokeWidth="0.5" fill="none" opacity="0.07" />
          <path d="M210,0 L210,40 L190,60 L190,180" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.09" />
          <path d="M320,200 L320,320 L300,340 L300,500" stroke="#00c8ff" strokeWidth="0.5" fill="none" opacity="0.07" />
          <circle cx="250" cy="40" r="2.5" fill="#39FF14" opacity="0.25" className="pcb-node-flash" />
          <circle cx="100" cy="180" r="2" fill="#00c8ff" opacity="0.2" className="pcb-node-flash2" />
          <circle cx="300" cy="320" r="2" fill="#39FF14" opacity="0.18" className="pcb-node-flash3" />
          <circle cx="120" cy="520" r="2" fill="#A855F7" opacity="0.15" className="pcb-node-flash" />
        </svg>
        {/* Neon edges */}
        <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{
          background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.6), rgba(0,200,255,0.35), rgba(168,85,247,0.2), transparent)',
          boxShadow: '0 0 14px rgba(57,255,20,0.35)',
        }} />
        <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-[2]" style={{
          background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)',
        }} />
        <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[2]" style={{
          background: 'linear-gradient(180deg, #39FF14, #00c8ff, #A855F7, #00c8ff, #39FF14)',
          boxShadow: '0 0 8px rgba(57,255,20,0.3)',
        }} />
        <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[2]" style={{
          background: 'linear-gradient(180deg, rgba(0,200,255,0.35), rgba(168,85,247,0.2), transparent)',
        }} />
        {/* Data pulses — animated dots traveling along the traces */}
        <div className="absolute top-[60px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 14px #39FF14' }} />
        <div className="absolute top-[340px] left-0 w-2.5 h-[2px] rounded-full pcb-pulse-h2" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
        <div className="absolute top-[500px] left-0 w-2.5 h-[2px] rounded-full pcb-pulse-hr" style={{ background: '#A855F7', boxShadow: '0 0 6px #A855F7' }} />
        <div className="absolute top-0 left-[210px] w-[2px] h-3 rounded-full pcb-pulse-v" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
        <div className="absolute top-0 left-[320px] w-[2px] h-2 rounded-full pcb-pulse-v2" style={{ background: '#00c8ff', boxShadow: '0 0 6px #00c8ff' }} />
        {/* Second scanline */}
        <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-[2] sidebar-scanline2" style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)',
        }} />
        {/* Floating orbs */}
        <div className="absolute left-[12%] top-[18%] w-2.5 h-2.5 rounded-full pointer-events-none sidebar-energy-orb" style={{
          background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 70%)',
          boxShadow: '0 0 12px rgba(57,255,20,0.45)',
        }} />
        <div className="absolute right-[15%] top-[50%] w-2 h-2 rounded-full pointer-events-none sidebar-energy-orb2" style={{
          background: 'radial-gradient(circle, rgba(0,200,255,0.55) 0%, transparent 70%)',
          boxShadow: '0 0 10px rgba(0,200,255,0.4)',
        }} />
        <div className="absolute left-[45%] bottom-[18%] w-2 h-2 rounded-full pointer-events-none sidebar-energy-orb3" style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)',
          boxShadow: '0 0 10px rgba(168,85,247,0.35)',
        }} />
        {/* Scanline */}
        <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-[2] sidebar-scanline" style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)',
          boxShadow: '0 0 15px rgba(57,255,20,0.18)',
        }} />
        {/* Corner brackets — prominent */}
        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
          <div key={ci} className={`absolute ${pos} w-5 h-5 pointer-events-none z-[3]`} style={{
            ...(pos.includes('top') ? { borderTop: `2.5px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderBottom: `2.5px solid ${ci === 2 ? '#00c8ff' : '#A855F7'}` }),
            ...(pos.includes('left') ? { borderLeft: `2.5px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderRight: `2.5px solid ${ci === 1 ? '#00c8ff' : '#A855F7'}` }),
            filter: 'drop-shadow(0 0 6px currentColor)',
          }} />
        ))}

        {/* Close */}
        <button onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:rotate-90 transition-all"
          style={{
            background: 'rgba(57,255,20,0.06)',
            border: '1px solid rgba(57,255,20,0.25)',
            boxShadow: '0 0 8px rgba(57,255,20,0.1)',
          }}>
          <X size={16} />
        </button>

        {/* Content wrapper above background layers */}
        <div className="relative z-[5]">

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="text-[#39FF14] animate-spin" />
          </div>
        ) : !targetPlayer ? (
          <div className="text-center py-24 text-gray-500 font-body">{ar ? 'اللاعب غير موجود' : 'Player not found'}</div>
        ) : (
          <>
            {/* ── Top Section: Avatar + Name ── */}
            <div className="pt-8 pb-5 px-6 text-center"
              style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.04) 0%, transparent 100%)' }}>

              {/* Octagonal sci-fi avatar frame — sidebar style */}
              <div className="relative inline-block mb-4">
                <div className="w-[98px] h-[98px] relative mx-auto">
                  {/* Outer octagon border with glow */}
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{
                      clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                      background: `linear-gradient(135deg, rgba(150,150,150,0.45), ${targetPlayer.vip?.active ? 'rgba(255,215,0,0.35)' : 'rgba(57,255,20,0.35)'}, rgba(150,150,150,0.45))`,
                      boxShadow: targetPlayer.vip?.active ? '0 0 22px rgba(255,215,0,0.35)' : '0 0 22px rgba(57,255,20,0.3)',
                    }} />
                  {/* Inner octagon with avatar */}
                  <div className="absolute inset-[3px] flex items-center justify-center overflow-hidden"
                    style={{
                      clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                      background: '#0a0a0a',
                    }}>
                    {targetPlayer.profilePhoto ? (
                      <img src={targetPlayer.profilePhoto} alt="" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = `/img/pfp-${ninjaType}.png`; }} />
                    ) : (
                      <Image src={`/img/pfp-${ninjaType}.png`} alt="" width={92} height={92}
                        className="object-contain w-full h-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                  </div>
                </div>
                {/* Online dot */}
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px] border-[#0a0a0a] ${isOnline ? 'bg-[#39FF14]' : 'bg-gray-600'} z-10`}
                  style={isOnline ? { boxShadow: '0 0 8px #39FF14' } : {}} />
                {/* Level shield badge (hexagonal, sidebar-style) */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
                  <div className="w-9 h-10 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(180deg, ${targetPlayer.vip?.active ? '#FFD700' : levelInfo.color}, ${targetPlayer.vip?.active ? '#B8860B' : levelInfo.color}AA)`,
                      clipPath: 'polygon(50% 0%, 100% 15%, 100% 70%, 50% 100%, 0% 70%, 0% 15%)',
                      boxShadow: `0 2px 10px ${targetPlayer.vip?.active ? 'rgba(255,215,0,0.5)' : `${levelInfo.color}60`}`,
                    }}>
                    <span className="font-ninja text-[12px] text-black font-bold mt-0.5">{levelInfo.level}</span>
                  </div>
                </div>
              </div>

              {/* Name + VIP */}
              <div className="flex items-center justify-center gap-2 mb-2">
                <h2 className="font-ninja text-3xl text-white tracking-wide" style={{ textShadow: '0 0 14px rgba(57,255,20,0.25)' }}>
                  {targetPlayer.username?.toUpperCase()}
                </h2>
                {targetPlayer.vip?.active && (
                  <span className="px-2 py-0.5 rounded font-ninja text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">VIP</span>
                )}
              </div>
              {/* Country pill (text-based — Windows flag emojis render as letters) */}
              {countryFlag && (
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full mb-2"
                  style={{
                    background: 'rgba(57,255,20,0.08)',
                    border: '1px solid rgba(57,255,20,0.3)',
                  }}>
                  <span className="font-ninja text-[10px] tracking-[0.15em] text-ninja-green">{countryFlag.name.toUpperCase()}</span>
                </div>
              )}
              <p className="text-gray-400 text-sm font-body mb-2">
                {targetPlayer.activeTitle || 'Newcomer'} · <span style={{ color: levelInfo.color }}>Lv.{levelInfo.level} {levelInfo.title}</span>
              </p>

              {/* Live activity — what the player is currently doing */}
              {isOnline && targetPlayer?.onlineStatus?.currentActivity && targetPlayer.onlineStatus.currentActivity !== 'In lobby' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-2"
                  style={{
                    background: 'rgba(57,255,20,0.08)',
                    border: '1px solid rgba(57,255,20,0.35)',
                    boxShadow: '0 0 10px rgba(57,255,20,0.15)',
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 4px #39FF14' }} />
                  <Gamepad2 size={11} className="text-ninja-green" />
                  <span className="font-ninja text-[11px] text-ninja-green tracking-wider">
                    {ar
                      ? `يلعب ${(targetPlayer.onlineStatus.currentActivity as string).replace(/^Playing\s+/i, '')}`
                      : targetPlayer.onlineStatus.currentActivity}
                  </span>
                </div>
              )}

              {/* Club badge — click to view club details */}
              {targetClub ? (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('view-club-profile', { detail: { clubId: targetPlayer.clubId } }))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-2 hover:brightness-125 transition-all cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.04))',
                    border: '1px solid rgba(168,85,247,0.5)',
                    boxShadow: '0 0 12px rgba(168,85,247,0.2)',
                  }}>
                  <Shield size={12} className="text-purple-300" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.6))' }} />
                  <span className="font-ninja text-[9px] text-purple-300/80 tracking-[0.2em]">{ar ? 'النادي:' : 'CLUB:'}</span>
                  <span className="text-base">{targetClub.logo || '⚔️'}</span>
                  <span className="font-ninja text-[10px] text-purple-300 tracking-[0.15em]">[{targetClub.tag}]</span>
                  <span className="font-ninja text-[11px] text-white">{targetClub.name}</span>
                  <span className="font-body text-[9px] text-gray-500">· {targetClub.memberCount}/5</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-2"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <Shield size={12} className="text-gray-500" />
                  <span className="font-ninja text-[9px] text-gray-500 tracking-[0.2em]">{ar ? 'النادي:' : 'CLUB:'}</span>
                  <span className="font-body text-[10px] text-gray-500">{ar ? 'لا يوجد نادي' : 'No club'}</span>
                </div>
              )}

              {/* Bio */}
              {targetPlayer.bio && (
                <p className="text-gray-400 text-xs font-body italic mb-3 max-w-[280px] mx-auto">&ldquo;{targetPlayer.bio}&rdquo;</p>
              )}

              {/* XP bar */}
              <div className="max-w-[200px] mx-auto">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: levelInfo.color }}
                    initial={{ width: 0 }} animate={{ width: `${levelInfo.progress * 100}%` }}
                    transition={{ duration: 0.6 }} />
                </div>
              </div>
            </div>

            {/* ── Action Buttons Row (sidebar HUD style) ── */}
            {!isSelf && (
              <div className="px-6 pb-4">
                {isFriend ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} onClick={handleMessage}
                        className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-ninja text-xs tracking-wider overflow-hidden transition-all"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0,191,255,0.15), rgba(0,191,255,0.05))',
                          border: '1px solid rgba(0,191,255,0.5)',
                          color: '#00BFFF',
                          boxShadow: '0 0 12px rgba(0,191,255,0.2)',
                          textShadow: '0 0 6px rgba(0,191,255,0.5)',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid #00BFFF', borderLeft: '1.5px solid #00BFFF' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid #00BFFF', borderRight: '1.5px solid #00BFFF' }} />
                        <MessageSquare size={14} /> {ar ? 'رسالة' : 'MESSAGE'}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }} onClick={handleCall}
                        className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-ninja text-xs tracking-wider overflow-hidden transition-all"
                        style={{
                          background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.05))',
                          border: '1px solid rgba(57,255,20,0.5)',
                          color: '#39FF14',
                          boxShadow: '0 0 12px rgba(57,255,20,0.2)',
                          textShadow: '0 0 6px rgba(57,255,20,0.5)',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid #39FF14', borderLeft: '1.5px solid #39FF14' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid #39FF14', borderRight: '1.5px solid #39FF14' }} />
                        <Phone size={14} /> {ar ? 'اتصال' : 'CALL'}
                      </motion.button>
                    </div>
                    <div className="flex gap-2">
                      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}
                        onClick={() => { setSendResult(null); setSendCoinsOpen(true); }}
                        className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-ninja text-xs tracking-wider overflow-hidden transition-all"
                        style={{
                          background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))',
                          border: '1px solid rgba(251,191,36,0.5)',
                          color: '#FBBF24',
                          boxShadow: '0 0 12px rgba(251,191,36,0.2)',
                          textShadow: '0 0 6px rgba(251,191,36,0.5)',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid #FBBF24', borderLeft: '1.5px solid #FBBF24' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid #FBBF24', borderRight: '1.5px solid #FBBF24' }} />
                        <Coins size={14} /> {ar ? 'إرسال عملات' : 'SEND COINS'}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}
                        onClick={() => setConfirmRemove(true)}
                        className="relative flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-ninja text-xs tracking-wider overflow-hidden transition-all"
                        style={{
                          background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                          border: '1px solid rgba(239,68,68,0.5)',
                          color: '#EF4444',
                          boxShadow: '0 0 12px rgba(239,68,68,0.2)',
                          textShadow: '0 0 6px rgba(239,68,68,0.5)',
                        }}>
                        <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: '1.5px solid #EF4444', borderLeft: '1.5px solid #EF4444' }} />
                        <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: '1.5px solid #EF4444', borderRight: '1.5px solid #EF4444' }} />
                        <UserMinus size={14} /> {ar ? 'إزالة' : 'REMOVE'}
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.02 }} onClick={handleAddFriend}
                    disabled={actionLoading || requestSent}
                    className="relative w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-ninja text-sm tracking-wider overflow-hidden transition-all disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, rgba(57,255,20,0.22), rgba(57,255,20,0.06))',
                      border: '1.5px solid rgba(57,255,20,0.55)',
                      color: '#39FF14',
                      boxShadow: '0 0 16px rgba(57,255,20,0.25)',
                      textShadow: '0 0 8px rgba(57,255,20,0.5)',
                    }}>
                    <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
                    <div className="absolute top-0 right-0 w-2.5 h-2.5" style={{ borderTop: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
                    <div className="absolute bottom-0 left-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
                    {actionLoading ? <Loader2 size={16} className="animate-spin" /> :
                      requestSent ? <><Check size={16} /> {ar ? 'تم إرسال الطلب' : 'REQUEST SENT'}</> :
                      <><UserPlus size={16} /> {ar ? 'إضافة صديق' : 'ADD FRIEND'}</>}
                  </motion.button>
                )}
              </div>
            )}

            {/* ── Stats Grid (privacy-aware) ── */}
            <div className="px-6 pb-4">
              {showFullProfile ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: ar ? 'وقت اللعب' : 'Playtime', val: `${Math.floor((targetPlayer?.totalPlaytime || 0) / 60)}h`, icon: <Clock size={16} />, color: '#39FF14' },
                    { label: ar ? 'الألعاب' : 'Games', val: String(stats.gamesPlayed || 0), icon: <Gamepad2 size={16} />, color: '#3B82F6' },
                    { label: ar ? 'الهدايا' : 'Gifts', val: String(targetPlayer?.totalGiftsReceived || 0), icon: <Gift size={16} />, color: '#F59E0B' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg py-3 px-2 text-center"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${s.color}30`,
                        boxShadow: `0 0 10px ${s.color}12`,
                      }}>
                      <div className="flex justify-center mb-1" style={{ color: s.color, filter: `drop-shadow(0 0 4px ${s.color}88)` }}>{s.icon}</div>
                      <p className="font-ninja text-lg text-white" style={{ textShadow: `0 0 6px ${s.color}60` }}>{s.val}</p>
                      <p className="font-body text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <EyeOff size={20} className="text-gray-600 mx-auto mb-2" />
                  <p className="font-body text-xs text-gray-500">
                    {ar
                      ? (isProfilePrivate ? 'هذا الملف الشخصي خاص' : 'الأصدقاء فقط')
                      : (isProfilePrivate ? 'This profile is private' : 'Friends only')}
                  </p>
                </div>
              )}
            </div>

            {/* ── Inventory Section (privacy-aware) ── */}
            <div className="px-6 pb-4">
              {isInventoryVisible ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Backpack size={13} className="text-purple-400" />
                    <span className="font-ninja text-[10px] text-gray-400 tracking-wider">
                      {ar ? `الحقيبة (${(targetPlayer?.inventory || []).length})` : `INVENTORY (${(targetPlayer?.inventory || []).length})`}
                    </span>
                  </div>
                  {(targetPlayer?.inventory || []).length === 0 ? (
                    <p className="text-gray-600 font-body text-xs py-2">{ar ? 'لا توجد عناصر بعد' : 'No items yet'}</p>
                  ) : (
                    <div className="max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 space-y-1">
                      {(targetPlayer?.inventory || []).slice(0, 20).map((item: any, i: number) => {
                        const rarityKey = item.rarity as keyof typeof RARITY_COLORS;
                        const itemColor = RARITY_COLORS[rarityKey]?.bg || '#666';
                        return (
                          <div key={i} className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: itemColor, boxShadow: `0 0 4px ${itemColor}60` }} />
                            <span className="font-body text-[11px] text-gray-300 flex-1 truncate">{item.name}</span>
                            {item.sentBy && (
                              <span className="font-body text-[8px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">from {item.sentBy}</span>
                            )}
                            <span className="font-body text-[9px] uppercase flex-shrink-0" style={{ color: itemColor }}>{item.rarity}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <Lock size={12} className="text-gray-600" />
                  <span className="font-body text-xs text-gray-600">{ar ? `الحقيبة ${privacy.inventoryVisibility === 'private' ? 'خاصة' : privacy.inventoryVisibility === 'friends' ? 'للأصدقاء فقط' : 'مخفية'}` : `Inventory is ${privacy.inventoryVisibility}`}</span>
                </div>
              )}
            </div>

          </>
        )}

        {/* ═══ Send Coins Modal ═══ */}
        <AnimatePresence>
          {sendCoinsOpen && targetPlayer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[210] flex items-center justify-center"
              onClick={() => { if (!sendLoading) { setSendCoinsOpen(false); setSendPin(''); setSendPinVerified(false); setSendAmount(''); setSendResult(null); } }}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} />
              <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-[360px] max-w-[92vw] rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(180deg, #050a14 0%, #030508 100%)',
                  border: '1.5px solid rgba(251,191,36,0.4)',
                  boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(251,191,36,0.2)',
                }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Coins size={18} className="text-yellow-400" />
                    <h3 className="font-ninja text-base text-white tracking-wider">{ar ? 'إرسال عملات' : 'SEND COINS'}</h3>
                  </div>
                  <button onClick={() => { setSendCoinsOpen(false); setSendPin(''); setSendPinVerified(false); setSendAmount(''); setSendResult(null); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <X size={14} />
                  </button>
                </div>
                <p className="font-body text-xs text-gray-400 mb-1">{ar ? 'إلى' : 'To'}</p>
                <p className="font-ninja text-sm text-white mb-4">{targetPlayer.username?.toUpperCase()}</p>

                {!sendPinVerified ? (
                  <>
                    <p className="font-body text-[11px] text-gray-500 mb-2 tracking-wider">{ar ? 'تحقق من رمز PIN' : 'VERIFY YOUR PIN'}</p>
                    <input type="password" value={sendPin}
                      onChange={(e) => setSendPin(e.target.value.slice(0, 400))}
                      placeholder={ar ? 'رمز PIN' : 'PIN'}
                      maxLength={400}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendCoins()}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-3 text-center font-ninja text-lg tracking-[0.2em] text-white focus:outline-none focus:border-yellow-400/50" />
                  </>
                ) : (
                  <>
                    <p className="font-body text-[11px] text-gray-500 mb-2 tracking-wider">{ar ? 'المبلغ (عملات)' : 'AMOUNT (COINS)'}</p>
                    <input type="number" value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                      placeholder="0"
                      onKeyDown={(e) => e.key === 'Enter' && handleSendCoins()}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-3 font-ninja text-lg text-white focus:outline-none focus:border-yellow-400/50" />
                    {sendAmount && parseInt(sendAmount) > 0 && (
                      <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex justify-between text-[11px] text-gray-400 font-body mb-1">
                          <span>{ar ? 'المبلغ' : 'Amount'}</span><span className="text-white">{parseInt(sendAmount)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-gray-400 font-body mb-1">
                          <span>{ar ? 'الرسوم (10%)' : 'Fee (10%)'}</span><span className="text-orange-400">{Math.ceil(parseInt(sendAmount) * 0.1)}</span>
                        </div>
                        <div className="flex justify-between text-[12px] font-ninja pt-1 border-t border-white/5 mt-1">
                          <span className="text-gray-300">{ar ? 'الإجمالي' : 'Total'}</span>
                          <span className="text-yellow-400">{parseInt(sendAmount) + Math.ceil(parseInt(sendAmount) * 0.1)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {sendResult && (
                  <p className={`mt-3 text-center font-body text-xs ${sendResult.includes('Sent') ? 'text-green-400' : 'text-red-400'}`}>{sendResult}</p>
                )}

                <button onClick={handleSendCoins} disabled={sendLoading}
                  className="w-full mt-4 py-3 rounded-lg font-ninja text-sm tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(251,191,36,0.08))',
                    border: '1.5px solid rgba(251,191,36,0.6)',
                    color: '#FBBF24',
                    boxShadow: '0 0 14px rgba(251,191,36,0.25)',
                  }}>
                  {sendLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendPinVerified ? (ar ? 'إرسال' : 'SEND') : (ar ? 'تحقق من PIN' : 'VERIFY PIN')}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ Confirm Remove Friend Modal ═══ */}
        <AnimatePresence>
          {confirmRemove && targetPlayer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-[210] flex items-center justify-center"
              onClick={() => !actionLoading && setConfirmRemove(false)}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-[340px] max-w-[92vw] rounded-2xl p-5 text-center"
                style={{
                  background: 'linear-gradient(180deg, #0a0406 0%, #050203 100%)',
                  border: '1.5px solid rgba(239,68,68,0.4)',
                  boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(239,68,68,0.2)',
                }}>
                <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }}>
                  <UserMinus size={22} className="text-red-400" />
                </div>
                <h3 className="font-ninja text-base text-white mb-1 tracking-wider">{ar ? 'إزالة الصديق؟' : 'REMOVE FRIEND?'}</h3>
                <p className="font-body text-xs text-gray-400 mb-5">
                  {ar
                    ? `سيتم إزالة ${targetPlayer.username?.toUpperCase()} من قائمة أصدقائك.`
                    : `${targetPlayer.username?.toUpperCase()} will be removed from your friends list.`}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmRemove(false)} disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider text-gray-300"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {ar ? 'إلغاء' : 'CANCEL'}
                  </button>
                  <button onClick={handleRemoveFriend} disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-lg font-ninja text-xs tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.08))',
                      border: '1px solid rgba(239,68,68,0.6)',
                      color: '#EF4444',
                    }}>
                    {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                    {ar ? 'إزالة' : 'REMOVE'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ═══ Profile Comments ═══ */}
        {targetPlayer && (
          <div className="mt-4 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="p-4">
              <h4 className="font-ninja text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                <MessageSquare size={12} /> {ar ? 'التعليقات' : 'COMMENTS'}
              </h4>
              {/* Write comment */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={ar
                    ? (isSelf ? 'ثبّت رسالة على ملفك الشخصي...' : `اكتب على جدار ${targetPlayer.username?.toUpperCase()}...`)
                    : (isSelf ? 'Pin a message on your profile...' : `Write on ${targetPlayer.username?.toUpperCase()}'s wall...`)}
                  maxLength={300}
                  onKeyDown={(e) => e.key === 'Enter' && postComment()}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-body focus:outline-none focus:border-ninja-green/40"
                />
                <button onClick={postComment} disabled={commentSaving || !commentText.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
                  style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.3)', color: '#39FF14' }}>
                  {commentSaving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
              </div>
              {/* Comment list */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
                {comments.length === 0 ? (
                  <p className="text-gray-600 font-body text-[11px] text-center py-2">{ar ? 'لا توجد تعليقات بعد' : 'No comments yet'}</p>
                ) : (
                  comments.map((c: any) => (
                    <div key={c.id} className="flex gap-2 p-2 rounded-lg bg-black/20 border border-white/5">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
                        {c.fromNinjaType && <img src={`/img/pfp-${c.fromNinjaType}.png`} alt="" className="w-full h-full object-contain" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-ninja text-[10px] text-cyan-400">{c.fromName?.toUpperCase()}</span>
                          <span className="font-body text-[8px] text-gray-600">
                            {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                        <p className="font-body text-[11px] text-gray-300 mt-0.5">{c.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        </div>{/* end cyberpunk z-[5] content wrapper */}
      </motion.div>
    </motion.div>
  );
}

export default PlayerProfileCard;
