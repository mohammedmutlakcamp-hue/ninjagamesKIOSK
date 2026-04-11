'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Zap, Timer,
  Gift, Star, Shield, Sparkles, Calendar,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Clock, Loader2,
  Users, Percent, ChevronRight,
} from 'lucide-react';

interface Props {
  player: any;
}

export function VIPTab({ player }: Props) {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const isVIP: boolean = player.vip?.active === true && (player.vip?.expiresAt || 0) > Date.now();
  const vipExpiry: number | null = player.vip?.expiresAt ?? null;
  const isExpired = player.vip?.active && (player.vip?.expiresAt || 0) <= Date.now();

  // Free play state
  const freePlayUntil = player.freePlayUntil || 0;
  const hasFreePlay = freePlayUntil > Date.now();
  const freePlayMinutes = hasFreePlay ? Math.ceil((freePlayUntil - Date.now()) / 60000) : 0;

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const goToStore = () => {
    window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'store', subTab: 'vip' } }));
  };

  // Daily invite
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteChoice, setInviteChoice] = useState<'time' | 'coins'>('time');

  const todayKey = new Date().toISOString().slice(0, 10);
  const inviteUsedToday = player.vip?.lastDailyInvite === todayKey;

  const handleDailyInvite = async () => {
    if (!isVIP || inviteUsedToday || inviteLoading || !inviteUsername.trim()) return;
    setInviteLoading(true);
    setInviteMsg('');
    try {
      const q = query(collection(db, 'players'), where('username', '==', inviteUsername.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (snap.empty) { setInviteMsg('Player not found'); setInviteLoading(false); return; }
      const target = snap.docs[0];
      if (target.id === player.uid) { setInviteMsg("You can't invite yourself!"); setInviteLoading(false); return; }

      const updateData: any = { totalGiftsReceived: increment(1) };

      if (inviteChoice === 'time') {
        const freeUntil = Date.now() + VIP_CONFIG.dailyInviteFreeMinutes * 60 * 1000;
        const targetData = target.data();
        const currentFreePlay = targetData.freePlayUntil || 0;
        updateData.freePlayUntil = Math.max(currentFreePlay, freeUntil);
      } else {
        updateData.coins = increment(VIP_CONFIG.dailyInviteBonusCoins);
      }

      await updateDoc(doc(db, 'players', target.id), updateData);
      await updateDoc(doc(db, 'players', player.uid), {
        'vip.lastDailyInvite': todayKey,
      });

      const giftLabel = inviteChoice === 'time' ? '30min free play' : '50 coins';
      setInviteMsg(`Sent ${giftLabel} to ${inviteUsername.toUpperCase()}!`);
      setInviteUsername('');
      setTimeout(() => { setShowInviteModal(false); setInviteMsg(''); }, 2500);
    } catch {
      setInviteMsg('Failed to send');
    }
    setInviteLoading(false);
  };

  const daysLeft = vipExpiry ? Math.max(0, Math.ceil((vipExpiry - Date.now()) / 86400000)) : null;
  const formatExpiry = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Perks data
  const PERKS = [
    { icon: <Coffee size={18} />, color: '#00BFFF', title: `${VIP_CONFIG.cafeDiscountPercent}% Cafe Discount`, desc: 'Off all food & drinks' },
    { icon: <Coins size={18} />,  color: '#FFD700', title: '+1 Coin Per Task', desc: 'Bonus on every daily task' },
    { icon: <Palette size={18} />,color: '#FF1493', title: 'Exclusive Skins', desc: 'Gold, Diamond, Platinum' },
    { icon: <Star size={18} />,   color: '#4ade80', title: 'VIP Badge', desc: 'Shown next to your name' },
    { icon: <Gift size={18} />,   color: '#39FF14', title: 'Daily Gift', desc: 'Send 30min OR 50 coins to a friend' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative w-full h-full overflow-y-auto overflow-x-hidden p-6 pb-10" style={{ maxHeight: '100%' }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-xl font-body text-sm font-semibold flex items-center gap-2"
            style={{ background: toast.ok ? 'rgba(57,255,20,0.15)' : 'rgba(255,50,50,0.15)', border: `1px solid ${toast.ok ? '#39FF14' : '#FF4444'}60`, color: toast.ok ? '#39FF14' : '#FF6666', backdropFilter: 'blur(10px)' }}>
            {toast.ok ? <Check size={16} /> : <X size={16} />} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  FREE PLAY BANNER — Big prominent banner when active      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {hasFreePlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-2xl mb-6 overflow-hidden"
          >
            {/* Animated background */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #001a00 0%, #003300 50%, #001a00 100%)' }} />
            <motion.div className="absolute inset-0 pointer-events-none"
              animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
              transition={{ duration: 4, repeat: Infinity, repeatType: 'reverse' }}
              style={{ background: 'radial-gradient(circle at 30% 50%, rgba(57,255,20,0.2) 0%, transparent 60%)', backgroundSize: '200% 200%' }} />

            {/* Pulsing border */}
            <motion.div className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ border: '2px solid #39FF14', boxShadow: '0 0 30px rgba(57,255,20,0.3), inset 0 0 30px rgba(57,255,20,0.05)' }} />

            <div className="relative flex items-center gap-4 px-6 py-4">
              {/* Timer circle */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full flex flex-col items-center justify-center shrink-0"
                style={{ background: 'rgba(57,255,20,0.1)', border: '2px solid #39FF14', boxShadow: '0 0 30px rgba(57,255,20,0.4)' }}
              >
                <span className="font-ninja text-xl text-[#39FF14]" style={{ textShadow: '0 0 15px rgba(57,255,20,0.8)' }}>
                  {freePlayMinutes}
                </span>
                <span className="font-ninja text-[7px] text-[#39FF14]/70 tracking-wider">MIN</span>
              </motion.div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2 }}>
                    <Sparkles size={18} className="text-[#39FF14]" />
                  </motion.div>
                  <span className="font-ninja text-2xl tracking-wider" style={{ color: '#39FF14', textShadow: '0 0 20px rgba(57,255,20,0.6)' }}>
                    FREE PLAY ACTIVE
                  </span>
                </div>
                <p className="font-body text-sm text-[#39FF14]/60">
                  You have <span className="text-[#39FF14] font-bold">{freePlayMinutes} minutes</span> of free play remaining. No coins deducted!
                </p>
              </div>

              <div className="shrink-0 flex flex-col items-center gap-1">
                <Clock size={16} className="text-[#39FF14]/50" />
                <span className="font-body text-[10px] text-[#39FF14]/40">VIP GIFT</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  VIP ACTIVE — Status + Quick Actions                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {isVIP && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          {/* Status bar */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid rgba(255,215,0,0.3)', boxShadow: '0 0 40px rgba(255,215,0,0.08)' }}>
            {/* Gold gradient header */}
            <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(255,140,0,0.1) 100%)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,215,0,0.2)', border: '2px solid rgba(255,215,0,0.5)', boxShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                    <Crown size={24} className="text-yellow-400" />
                  </motion.div>
                  <div>
                    <p className="font-ninja text-xl text-yellow-400 tracking-wider">VIP MEMBER</p>
                    <p className="font-body text-xs text-gray-400 flex items-center gap-1.5">
                      <Calendar size={11} /> Expires {formatExpiry(vipExpiry!)}
                      <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        daysLeft! <= 5 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25'
                      }`}>{daysLeft}d left</span>
                    </p>
                  </div>
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={goToStore}
                  className="px-5 py-2.5 rounded-xl font-ninja text-sm flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', boxShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                  <Crown size={14} />
                  RENEW
                </motion.button>
              </div>
            </div>

            {/* Quick actions row */}
            <div className="grid grid-cols-3 divide-x divide-white/5" style={{ background: 'rgba(255,215,0,0.03)' }}>
              {/* Daily Invite */}
              <button onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
                className="flex items-center justify-center gap-2 py-4 hover:bg-white/[0.03] transition-all disabled:opacity-40">
                <Gift size={16} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'} />
                <span className={`font-ninja text-xs ${inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'}`}>
                  {inviteUsedToday ? 'INVITE SENT' : 'SEND INVITE'}
                </span>
              </button>
              {/* Cafe Discount */}
              <div className="flex items-center justify-center gap-2 py-4">
                <Percent size={16} className="text-blue-400" />
                <span className="font-ninja text-xs text-blue-400">{VIP_CONFIG.cafeDiscountPercent}% CAFE OFF</span>
              </div>
              {/* Task Bonus */}
              <div className="flex items-center justify-center gap-2 py-4">
                <Coins size={16} className="text-yellow-400" />
                <span className="font-ninja text-xs text-yellow-400">+1 PER TASK</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  DAILY INVITE — WOW section (VIP only)                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {isVIP && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
          <div className="rounded-2xl overflow-hidden relative"
            style={{ border: `2px solid ${inviteUsedToday ? 'rgba(100,100,100,0.2)' : 'rgba(57,255,20,0.25)'}`, boxShadow: inviteUsedToday ? 'none' : '0 0 40px rgba(57,255,20,0.08)' }}>

            {/* Background */}
            <div className="absolute inset-0" style={{ background: inviteUsedToday
              ? 'linear-gradient(135deg, rgba(30,30,35,0.95), rgba(20,20,25,0.95))'
              : 'linear-gradient(135deg, rgba(0,20,0,0.95) 0%, rgba(0,40,10,0.6) 50%, rgba(0,15,5,0.95) 100%)'
            }} />

            {/* Animated glow orbs (only when not used) */}
            {!inviteUsedToday && (
              <>
                <motion.div className="absolute w-40 h-40 rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.15), transparent 70%)', left: '10%', top: '-20%' }}
                  animate={{ x: [0, 30, 0], y: [0, 15, 0] }} transition={{ duration: 6, repeat: Infinity }} />
                <motion.div className="absolute w-32 h-32 rounded-full pointer-events-none"
                  style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.1), transparent 70%)', right: '15%', bottom: '-10%' }}
                  animate={{ x: [0, -20, 0], y: [0, -10, 0] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} />
              </>
            )}

            <div className="relative flex items-center gap-4 px-5 py-4">

              {/* Left: Gift icon with animated ring */}
              <div className="shrink-0">
                <motion.div
                  animate={inviteUsedToday ? {} : { scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="relative w-[70px] h-[70px] flex items-center justify-center"
                >
                  {/* Outer ring */}
                  {!inviteUsedToday && (
                    <motion.div className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: '2px solid rgba(57,255,20,0.3)' }}
                      animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }} />
                  )}
                  <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center"
                    style={{
                      background: inviteUsedToday ? 'rgba(100,100,100,0.1)' : 'rgba(57,255,20,0.1)',
                      border: `2px solid ${inviteUsedToday ? 'rgba(100,100,100,0.2)' : 'rgba(57,255,20,0.4)'}`,
                      boxShadow: inviteUsedToday ? 'none' : '0 0 30px rgba(57,255,20,0.25)',
                    }}>
                    <Gift size={24} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'}
                      style={inviteUsedToday ? {} : { filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.6))' }} />
                  </div>
                </motion.div>
              </div>

              {/* Center: Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-ninja text-xl tracking-wider" style={{ color: inviteUsedToday ? '#666' : '#39FF14', textShadow: inviteUsedToday ? 'none' : '0 0 15px rgba(57,255,20,0.4)' }}>
                    DAILY INVITE
                  </h3>
                  {inviteUsedToday && (
                    <span className="px-2.5 py-1 rounded-full font-ninja text-[9px] bg-gray-700/50 text-gray-500 border border-gray-600/30">
                      USED TODAY
                    </span>
                  )}
                </div>
                <p className="font-body text-sm mb-3" style={{ color: inviteUsedToday ? '#555' : '#8aff8a' }}>
                  Choose a gift for a friend: <span className={inviteUsedToday ? 'text-gray-500' : 'text-[#39FF14] font-bold'}>30 min free play</span> or <span className={inviteUsedToday ? 'text-gray-500' : 'text-yellow-400 font-bold'}>50 bonus coins</span>.
                  {!inviteUsedToday && <span className="text-gray-500 text-xs block mt-0.5">Pick one per day. Resets at midnight.</span>}
                </p>

                {/* Stat pills */}
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(57,255,20,0.08)', border: `1px solid ${inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(57,255,20,0.15)'}` }}>
                    <Timer size={13} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'} />
                    <span className={`font-ninja text-xs ${inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'}`}>30 MIN</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(255,215,0,0.08)', border: `1px solid ${inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(255,215,0,0.15)'}` }}>
                    <Coins size={13} className={inviteUsedToday ? 'text-gray-600' : 'text-yellow-400'} />
                    <span className={`font-ninja text-xs ${inviteUsedToday ? 'text-gray-600' : 'text-yellow-400'}`}>50 COINS</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(139,92,246,0.08)', border: `1px solid ${inviteUsedToday ? 'rgba(60,60,60,0.2)' : 'rgba(139,92,246,0.15)'}` }}>
                    <Users size={13} className={inviteUsedToday ? 'text-gray-600' : 'text-purple-400'} />
                    <span className={`font-ninja text-xs ${inviteUsedToday ? 'text-gray-600' : 'text-purple-400'}`}>1x DAILY</span>
                  </div>
                </div>
              </div>

              {/* Right: CTA button */}
              <div className="shrink-0">
                <motion.button
                  whileHover={inviteUsedToday ? {} : { scale: 1.05 }}
                  whileTap={inviteUsedToday ? {} : { scale: 0.95 }}
                  onClick={() => !inviteUsedToday && setShowInviteModal(true)}
                  disabled={inviteUsedToday}
                  className="relative px-6 py-3.5 rounded-xl font-ninja text-sm flex items-center gap-2 transition-all overflow-hidden"
                  style={inviteUsedToday ? {
                    background: 'rgba(50,50,50,0.3)', color: '#555', border: '1px solid rgba(80,80,80,0.3)',
                  } : {
                    background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.08))',
                    color: '#39FF14', border: '1px solid rgba(57,255,20,0.35)',
                    boxShadow: '0 0 20px rgba(57,255,20,0.15)',
                  }}>
                  {/* Shimmer effect */}
                  {!inviteUsedToday && (
                    <motion.div className="absolute inset-0 pointer-events-none"
                      style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.08) 50%, transparent 100%)' }}
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }} />
                  )}
                  {inviteUsedToday ? <Check size={16} /> : <Send size={16} />}
                  {inviteUsedToday ? 'SENT TODAY' : 'SEND GIFT'}
                  {!inviteUsedToday && <ChevronRight size={14} />}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  EXPIRED BANNER                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {isExpired && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl p-5 mb-6 flex items-center gap-4"
          style={{ background: 'rgba(255,50,50,0.08)', border: '1px solid rgba(255,50,50,0.25)' }}>
          <Shield size={24} className="text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="font-ninja text-sm text-red-400">VIP EXPIRED</p>
            <p className="font-body text-xs text-gray-500">Your perks are no longer active. Renew to get them back!</p>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={goToStore}
            className="px-4 py-2 rounded-xl font-ninja text-xs bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25">
            RENEW NOW
          </motion.button>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  PERKS GRID + PRICING                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-12 gap-5 max-w-[850px] mx-auto">

        {/* ── Left: Perks (7 cols) ───────────────────────────────── */}
        <div className="col-span-7">
          <h3 className="font-ninja text-sm text-gray-500 tracking-wider mb-3">VIP PERKS</h3>
          <div className="grid grid-cols-3 gap-3">
            {PERKS.map((perk, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-4 flex flex-col items-center text-center relative group"
                style={{
                  background: isVIP ? `linear-gradient(180deg, ${perk.color}08 0%, transparent 100%)` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isVIP ? perk.color + '20' : 'rgba(255,255,255,0.05)'}`,
                }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${perk.color}12`, border: `1px solid ${perk.color}25` }}>
                  <span style={{ color: isVIP ? perk.color : '#444' }}>{perk.icon}</span>
                </div>
                <p className="font-ninja text-[11px] mb-1" style={{ color: isVIP ? '#fff' : '#777' }}>{perk.title}</p>
                <p className="font-body text-[10px] text-gray-600 leading-relaxed">{perk.desc}</p>
                {isVIP
                  ? <div className="absolute top-2 right-2"><Check size={12} className="text-[#39FF14]" /></div>
                  : <div className="absolute top-2 right-2"><Lock size={10} className="text-gray-700" /></div>
                }
              </motion.div>
            ))}
          </div>

          {/* Buy VIP banner for non-VIP players */}
          {!isVIP && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="mt-4 rounded-xl p-4 flex items-center gap-4"
              style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,140,0,0.05))', border: '1px solid rgba(255,215,0,0.2)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)' }}>
                <ShoppingBag size={20} className="text-yellow-400" />
              </div>
              <div className="flex-1">
                <p className="font-ninja text-sm text-yellow-400">GET VIP FROM STORE</p>
                <p className="font-body text-xs text-gray-500">Buy a VIP Pass for {VIP_CONFIG.priceCoins.toLocaleString()} coins. Activate or gift it!</p>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={goToStore}
                className="px-5 py-2.5 rounded-xl font-ninja text-sm flex items-center gap-2 shrink-0"
                style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', boxShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                <ShoppingBag size={14} /> BECOME VIP
              </motion.button>
            </motion.div>
          )}
        </div>

        {/* ── Right: Pricing card (5 cols) ───────────────────────── */}
        <div className="col-span-5 space-y-4">
          {/* Price card */}
          <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(170deg, rgba(255,215,0,0.1) 0%, rgba(10,10,15,0.95) 40%)', border: '2px solid rgba(255,215,0,0.25)', boxShadow: '0 0 40px rgba(255,215,0,0.08)' }}>

            {/* Header */}
            <div className="text-center pt-6 pb-4 relative">
              {[...Array(6)].map((_, i) => (
                <motion.div key={i} className="absolute pointer-events-none"
                  style={{ left: `${10 + i * 16}%`, top: `${20 + (i % 2) * 30}%`, color: '#FFD700' }}
                  animate={{ y: [0, -6, 0], opacity: [0.1, 0.4, 0.1] }}
                  transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}>
                  <Sparkles size={8} />
                </motion.div>
              ))}
              <Crown size={28} className="text-yellow-400 mx-auto mb-2" style={{ filter: 'drop-shadow(0 0 10px rgba(255,215,0,0.5))' }} />
              <p className="font-ninja text-3xl text-yellow-400">{VIP_CONFIG.priceCoins.toLocaleString()}</p>
              <p className="font-ninja text-sm text-yellow-500/70">coins / 30 days</p>
            </div>

            {/* Features list */}
            <div className="px-4 pb-4 space-y-2">
              {['15% Cafe Discount', '+1 Coin Per Task', 'Exclusive Skins', 'VIP Badge', '30min Daily Gift', '50 Coins Gift/Day'].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check size={12} className="text-yellow-400/70 shrink-0" />
                  <span className="font-body text-[11px] text-gray-400">{item}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-4 pb-5">
              {isVIP ? (
                <div className="flex items-center justify-center gap-2 py-3 rounded-xl border border-yellow-400/25 bg-yellow-400/5">
                  <Crown size={15} className="text-yellow-400" />
                  <span className="font-ninja text-xs text-yellow-400">ACTIVE</span>
                </div>
              ) : (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={goToStore}
                  className="w-full py-3 rounded-xl font-ninja text-sm flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', boxShadow: '0 0 25px rgba(255,215,0,0.3)' }}>
                  <ShoppingBag size={14} /> BECOME VIP
                </motion.button>
              )}
            </div>
          </motion.div>

          {/* How it works */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="font-ninja text-[10px] text-gray-600 tracking-wider mb-2.5">HOW IT WORKS</p>
            {['Buy VIP Pass from the Store', 'It goes to your Inventory', 'Click Use to activate, or gift it!'].map((step, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)' }}>
                  <span className="font-ninja text-[8px] text-yellow-600">{i + 1}</span>
                </div>
                <span className="font-body text-[10px] text-gray-600">{step}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  DAILY INVITE MODAL                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={() => setShowInviteModal(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative overflow-hidden rounded-2xl p-6 w-[380px]"
              style={{ background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)' }}
              onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />

              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-lg text-[#39FF14] flex items-center gap-2">
                  <Gift size={18} /> CHOOSE YOUR GIFT
                </h3>
                <button onClick={() => setShowInviteModal(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
              </div>

              <p className="font-body text-xs text-gray-500 mb-3">Pick one gift to send to a friend:</p>

              {/* Gift choice cards */}
              <div className="flex gap-3 mb-5">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setInviteChoice('time')}
                  className="flex-1 rounded-xl p-4 text-center cursor-pointer transition-all relative overflow-hidden"
                  style={{
                    background: inviteChoice === 'time' ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.02)',
                    border: inviteChoice === 'time' ? '2px solid rgba(57,255,20,0.5)' : '2px solid rgba(255,255,255,0.06)',
                    boxShadow: inviteChoice === 'time' ? '0 0 20px rgba(57,255,20,0.15)' : 'none',
                  }}>
                  {inviteChoice === 'time' && (
                    <div className="absolute top-2 right-2">
                      <div className="w-5 h-5 rounded-full bg-[#39FF14] flex items-center justify-center">
                        <Check size={10} className="text-black" />
                      </div>
                    </div>
                  )}
                  <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center"
                    style={{ background: inviteChoice === 'time' ? 'rgba(57,255,20,0.15)' : 'rgba(100,100,100,0.1)', border: `1px solid ${inviteChoice === 'time' ? 'rgba(57,255,20,0.3)' : 'rgba(100,100,100,0.15)'}` }}>
                    <Timer size={22} className={inviteChoice === 'time' ? 'text-[#39FF14]' : 'text-gray-600'} />
                  </div>
                  <p className={`font-ninja text-2xl mb-0.5 ${inviteChoice === 'time' ? 'text-[#39FF14]' : 'text-gray-600'}`}>30</p>
                  <p className={`font-ninja text-[10px] tracking-wider ${inviteChoice === 'time' ? 'text-[#39FF14]/70' : 'text-gray-700'}`}>FREE MINUTES</p>
                  <p className="font-body text-[9px] text-gray-600 mt-1">Free play time</p>
                </motion.button>

                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setInviteChoice('coins')}
                  className="flex-1 rounded-xl p-4 text-center cursor-pointer transition-all relative overflow-hidden"
                  style={{
                    background: inviteChoice === 'coins' ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.02)',
                    border: inviteChoice === 'coins' ? '2px solid rgba(255,215,0,0.5)' : '2px solid rgba(255,255,255,0.06)',
                    boxShadow: inviteChoice === 'coins' ? '0 0 20px rgba(255,215,0,0.15)' : 'none',
                  }}>
                  {inviteChoice === 'coins' && (
                    <div className="absolute top-2 right-2">
                      <div className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center">
                        <Check size={10} className="text-black" />
                      </div>
                    </div>
                  )}
                  <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center"
                    style={{ background: inviteChoice === 'coins' ? 'rgba(255,215,0,0.15)' : 'rgba(100,100,100,0.1)', border: `1px solid ${inviteChoice === 'coins' ? 'rgba(255,215,0,0.3)' : 'rgba(100,100,100,0.15)'}` }}>
                    <Coins size={22} className={inviteChoice === 'coins' ? 'text-yellow-400' : 'text-gray-600'} />
                  </div>
                  <p className={`font-ninja text-2xl mb-0.5 ${inviteChoice === 'coins' ? 'text-yellow-400' : 'text-gray-600'}`}>50</p>
                  <p className={`font-ninja text-[10px] tracking-wider ${inviteChoice === 'coins' ? 'text-yellow-400/70' : 'text-gray-700'}`}>BONUS COINS</p>
                  <p className="font-body text-[9px] text-gray-600 mt-1">Transfer-only coins</p>
                </motion.button>
              </div>

              <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Friend's username" onKeyDown={(e) => e.key === 'Enter' && handleDailyInvite()}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-body mb-3 focus:outline-none focus:border-[#39FF14]/40" />

              {inviteMsg && (
                <p className={`text-sm font-body mb-3 ${inviteMsg.includes('Sent') || inviteMsg.includes('sent') ? 'text-[#39FF14]' : 'text-red-400'}`}>{inviteMsg}</p>
              )}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleDailyInvite} disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-3 rounded-xl font-ninja text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: inviteChoice === 'time' ? 'rgba(57,255,20,0.12)' : 'rgba(255,215,0,0.12)',
                  color: inviteChoice === 'time' ? '#39FF14' : '#FFD700',
                  border: `1px solid ${inviteChoice === 'time' ? 'rgba(57,255,20,0.25)' : 'rgba(255,215,0,0.25)'}`,
                }}>
                {inviteLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                SEND {inviteChoice === 'time' ? '30 MIN FREE PLAY' : '50 COINS'}
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
