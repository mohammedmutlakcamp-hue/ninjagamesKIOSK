'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Timer, Gift, Star, Sparkles, Shield,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Loader2,
  Users, Percent, Zap, Clock,
} from 'lucide-react';

interface Props {
  player: any;
}

export function VIPTab({ player }: Props) {
  const isVIP = player.vip?.active === true && (player.vip?.expiresAt || 0) > Date.now();
  const vipExpiry: number | null = player.vip?.expiresAt ?? null;
  const isExpired = player.vip?.active && (player.vip?.expiresAt || 0) <= Date.now();
  const daysLeft = vipExpiry ? Math.max(0, Math.ceil((vipExpiry - Date.now()) / 86400000)) : null;

  const freePlayUntil = player.freePlayUntil || 0;
  const hasFreePlay = freePlayUntil > Date.now();
  const freePlayMinutes = hasFreePlay ? Math.ceil((freePlayUntil - Date.now()) / 60000) : 0;

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
      if (target.id === player.uid) { setInviteMsg("Can't invite yourself!"); setInviteLoading(false); return; }

      const updateData: any = { totalGiftsReceived: increment(1) };
      if (inviteChoice === 'time') {
        const freeUntil = Date.now() + VIP_CONFIG.dailyInviteFreeMinutes * 60 * 1000;
        const currentFreePlay = target.data().freePlayUntil || 0;
        updateData.freePlayUntil = Math.max(currentFreePlay, freeUntil);
      } else {
        updateData.coins = increment(VIP_CONFIG.dailyInviteBonusCoins);
      }

      await updateDoc(doc(db, 'players', target.id), updateData);
      await updateDoc(doc(db, 'players', player.uid), { 'vip.lastDailyInvite': todayKey });

      setInviteMsg(`Sent ${inviteChoice === 'time' ? '30min free play' : '50 coins'} to ${inviteUsername.toUpperCase()}!`);
      setInviteUsername('');
      setTimeout(() => { setShowInviteModal(false); setInviteMsg(''); }, 2500);
    } catch {
      setInviteMsg('Failed to send');
    }
    setInviteLoading(false);
  };

  const PERKS = [
    { icon: <Coffee size={16} />, color: '#00BFFF', title: `${VIP_CONFIG.cafeDiscountPercent}% Cafe Discount`, desc: 'All food & drinks' },
    { icon: <Coins size={16} />,  color: '#FFD700', title: '+1 Coin Per Task', desc: 'Daily task bonus' },
    { icon: <Palette size={16} />,color: '#FF1493', title: 'Exclusive Skins', desc: 'Gold, Diamond, Platinum' },
    { icon: <Star size={16} />,   color: '#4ade80', title: 'VIP Badge', desc: 'Profile flair' },
    { icon: <Gift size={16} />,   color: '#39FF14', title: 'Daily Gift', desc: '30min or 50 coins/day' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative w-full h-full overflow-hidden flex items-center justify-center">

      {/* PCB background — same as Buy Time */}
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #080c12 0%, #0a1018 30%, #0c1420 60%, #081014 100%)' }} />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,215,0,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,215,0,0.05) 0%, transparent 50%)' }} />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 700" preserveAspectRatio="none">
          <motion.path d="M0,50 L120,50 L150,80 L300,80 L330,50 L500,50 L530,80 L800,80" stroke="#FFD700" strokeWidth="0.8" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.08 }} transition={{ duration: 2, delay: 0.2 }} />
          <motion.path d="M800,200 L600,200 L570,230 L400,230 L370,200 L200,200 L170,230 L0,230" stroke="#FF8C00" strokeWidth="0.6" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 0.5 }} />
          <motion.path d="M0,400 L180,400 L210,370 L380,370 L410,400 L600,400 L630,370 L800,370" stroke="#FFD700" strokeWidth="0.6" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 0.8 }} />
          <motion.path d="M150,0 L150,80 L180,110 L180,230" stroke="#FFD700" strokeWidth="0.5" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 1.5, delay: 0.6 }} />
          <motion.path d="M500,80 L500,200 L470,230 L470,370" stroke="#FF8C00" strokeWidth="0.5" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.05 }} transition={{ duration: 1.5, delay: 0.9 }} />
          <motion.circle cx="150" cy="80" r="2.5" fill="#FFD700"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.2, 0.08] }} transition={{ duration: 1, delay: 2.5, repeat: Infinity, repeatDelay: 4 }} />
          <motion.circle cx="500" cy="200" r="2.5" fill="#FF8C00"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.18, 0.07] }} transition={{ duration: 1, delay: 3, repeat: Infinity, repeatDelay: 5 }} />
        </svg>
      </div>

      {/* Content — centered card like Buy Time */}
      <div className="relative z-10 w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
          className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ border: '2px solid rgba(255,215,0,0.4)', background: 'radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%)', boxShadow: '0 0 15px rgba(255,215,0,0.1)' }}>
              <Crown size={20} className="text-yellow-400" />
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="font-ninja text-3xl text-white tracking-wide"
              style={{ textShadow: '0 0 20px rgba(255,215,0,0.15)' }}>VIP</motion.h2>
          </div>
        </motion.div>

        {/* Status */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="font-body text-gray-400 mb-5">
          Status: <span className="font-ninja text-lg" style={{ color: isVIP ? '#FFD700' : isExpired ? '#ff4444' : '#666' }}>
            {isVIP ? `ACTIVE — ${daysLeft}d left` : isExpired ? 'EXPIRED' : 'NOT VIP'}
          </span>
        </motion.p>

        {/* Free play banner */}
        {hasFreePlay && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-lg px-5 py-3 mb-5 flex items-center gap-3"
            style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)' }}>
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: '2px solid #39FF14', background: 'rgba(57,255,20,0.1)' }}>
              <span className="font-ninja text-sm text-[#39FF14]">{freePlayMinutes}</span>
            </motion.div>
            <div>
              <span className="font-ninja text-xs text-[#39FF14]">FREE PLAY</span>
              <p className="font-body text-[10px] text-gray-500">{freePlayMinutes}m remaining</p>
            </div>
          </motion.div>
        )}

        {/* Perks — radio-button style cards like Buy Time */}
        <div className="space-y-3 mb-6">
          {PERKS.map((perk, idx) => (
            <motion.div key={idx}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + idx * 0.08, type: 'spring', stiffness: 100 }}>
              <div className="relative rounded-lg overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isVIP ? perk.color + '30' : 'rgba(255,255,255,0.06)'}` }}>
                {/* HUD corners */}
                <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${isVIP ? perk.color : 'rgba(255,255,255,0.1)'}`, borderLeft: `2px solid ${isVIP ? perk.color : 'rgba(255,255,255,0.1)'}` }} />
                <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${isVIP ? perk.color : 'rgba(255,255,255,0.1)'}`, borderRight: `2px solid ${isVIP ? perk.color : 'rgba(255,255,255,0.1)'}` }} />

                <div className="px-5 py-3.5 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${perk.color}12`, border: `1px solid ${perk.color}20` }}>
                    <span style={{ color: isVIP ? perk.color : '#444' }}>{perk.icon}</span>
                  </div>
                  {/* Text */}
                  <div className="flex-1">
                    <p className="font-ninja text-sm" style={{ color: isVIP ? '#fff' : '#666' }}>{perk.title}</p>
                    <p className="font-body text-[10px] text-gray-600">{perk.desc}</p>
                  </div>
                  {/* Status */}
                  {isVIP ? (
                    <motion.div animate={{ boxShadow: [`0 0 6px ${perk.color}30`, `0 0 12px ${perk.color}50`, `0 0 6px ${perk.color}30`] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${perk.color}20`, border: `2px solid ${perk.color}` }}>
                      <Check size={12} style={{ color: perk.color }} />
                    </motion.div>
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ border: '2px solid rgba(100,100,100,0.3)' }}>
                      <Lock size={10} className="text-gray-700" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Daily gift row (VIP only) */}
        {isVIP && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
            className="rounded-lg px-5 py-3.5 mb-6 flex items-center gap-4"
            style={{
              background: inviteUsedToday ? 'rgba(40,40,45,0.5)' : 'rgba(57,255,20,0.04)',
              border: `1px solid ${inviteUsedToday ? 'rgba(80,80,80,0.15)' : 'rgba(57,255,20,0.2)'}`,
            }}>
            <Gift size={20} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'} />
            <div className="flex-1">
              <p className="font-ninja text-xs" style={{ color: inviteUsedToday ? '#555' : '#39FF14' }}>
                DAILY GIFT {inviteUsedToday && '— SENT'}
              </p>
              <p className="font-body text-[10px] text-gray-600">Send 30min or 50 coins to a friend</p>
            </div>
            <button onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
              className="px-4 py-2 rounded-lg font-ninja text-[10px] transition-all disabled:opacity-35"
              style={inviteUsedToday ? { background: 'rgba(50,50,50,0.2)', color: '#555' } : { background: 'rgba(57,255,20,0.1)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.2)' }}>
              {inviteUsedToday ? 'DONE' : 'SEND'}
            </button>
          </motion.div>
        )}

        {/* CTA Button — same style as Buy Time bubble button */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          <button onClick={goToStore}
            className="w-full py-4 rounded-xl font-ninja text-xl tracking-wider flex items-center justify-center gap-3 cursor-pointer"
            style={{
              background: isVIP ? 'rgba(255,215,0,0.12)' : 'linear-gradient(135deg, #FFD700, #FF8C00)',
              color: isVIP ? '#FFD700' : '#000',
              border: isVIP ? '1px solid rgba(255,215,0,0.3)' : 'none',
              boxShadow: isVIP ? '0 0 20px rgba(255,215,0,0.1)' : '0 0 30px rgba(255,215,0,0.3)',
            }}>
            <Crown size={22} />
            {isVIP ? 'RENEW VIP' : `BECOME VIP — ${VIP_CONFIG.priceCoins.toLocaleString()} COINS`}
          </button>
        </motion.div>

        <p className="font-body text-gray-700 text-[10px] text-center mt-3">
          {VIP_CONFIG.priceCoins.toLocaleString()} coins · 30 days · {VIP_CONFIG.cafeDiscountPercent}% discount · daily gifts
        </p>
      </div>

      {/* Daily invite modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowInviteModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl p-5 w-[360px] max-w-[90%]"
              style={{ background: '#0a0b10', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9)' }}
              onClick={e => e.stopPropagation()}>
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />

              <div className="flex items-center justify-between mb-4">
                <h3 className="font-ninja text-sm text-[#39FF14] flex items-center gap-2"><Gift size={16} /> CHOOSE GIFT</h3>
                <button onClick={() => setShowInviteModal(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>

              {/* Radio-style gift choice */}
              <div className="space-y-2 mb-4">
                {([
                  { id: 'time' as const, icon: <Timer size={18} />, label: '30 MIN FREE PLAY', color: '#39FF14' },
                  { id: 'coins' as const, icon: <Coins size={18} />, label: '50 BONUS COINS', color: '#FFD700' },
                ]).map(opt => {
                  const sel = inviteChoice === opt.id;
                  return (
                    <button key={opt.id} onClick={() => setInviteChoice(opt.id)}
                      className="w-full rounded-lg px-4 py-3 flex items-center gap-3 text-left transition-all relative"
                      style={{
                        background: sel ? `${opt.color}10` : 'rgba(255,255,255,0.02)',
                        border: sel ? `1.5px solid ${opt.color}50` : '1.5px solid rgba(255,255,255,0.05)',
                      }}>
                      <motion.div
                        animate={sel ? { boxShadow: [`0 0 6px ${opt.color}30`, `0 0 12px ${opt.color}50`, `0 0 6px ${opt.color}30`] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ border: `2px solid ${sel ? opt.color : 'rgba(150,150,150,0.3)'}` }}>
                        {sel && <div className="w-2.5 h-2.5 rounded-full" style={{ background: opt.color, boxShadow: `0 0 6px ${opt.color}` }} />}
                      </motion.div>
                      <span style={{ color: sel ? opt.color : '#555' }}>{opt.icon}</span>
                      <span className="font-ninja text-xs" style={{ color: sel ? opt.color : '#666' }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Friend's username" onKeyDown={(e) => e.key === 'Enter' && handleDailyInvite()}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-body mb-3 focus:outline-none focus:border-[#39FF14]/30"
                style={{ colorScheme: 'dark' }} />

              {inviteMsg && <p className={`text-xs font-body mb-2 ${inviteMsg.includes('Sent') ? 'text-[#39FF14]' : 'text-red-400'}`}>{inviteMsg}</p>}

              <button onClick={handleDailyInvite} disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-2.5 rounded-lg font-ninja text-xs flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: inviteChoice === 'time' ? 'linear-gradient(135deg, #2ddb1a, #39FF14)' : 'linear-gradient(135deg, #FFD700, #FF8C00)',
                  color: '#000',
                }}>
                {inviteLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                SEND GIFT
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
