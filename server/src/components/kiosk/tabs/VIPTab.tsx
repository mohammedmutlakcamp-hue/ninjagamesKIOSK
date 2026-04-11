'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Timer, Gift, Star, Sparkles,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Loader2,
  Users, Percent, Zap,
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

      const giftLabel = inviteChoice === 'time' ? '30min free play' : '50 coins';
      setInviteMsg(`Sent ${giftLabel} to ${inviteUsername.toUpperCase()}!`);
      setInviteUsername('');
      setTimeout(() => { setShowInviteModal(false); setInviteMsg(''); }, 2500);
    } catch {
      setInviteMsg('Failed to send');
    }
    setInviteLoading(false);
  };

  const PERKS = [
    { icon: <Coffee size={16} />, color: '#00BFFF', title: `${VIP_CONFIG.cafeDiscountPercent}% Cafe Off`, desc: 'Food & drinks' },
    { icon: <Coins size={16} />,  color: '#FFD700', title: '+1 Per Task', desc: 'Daily bonus' },
    { icon: <Palette size={16} />,color: '#FF1493', title: 'VIP Skins', desc: 'Exclusive' },
    { icon: <Star size={16} />,   color: '#4ade80', title: 'VIP Badge', desc: 'Profile flair' },
    { icon: <Gift size={16} />,   color: '#39FF14', title: 'Daily Gift', desc: '30min or 50 coins' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden" style={{ maxHeight: '100%' }}>

      <div className="max-w-[780px] mx-auto p-5 pb-8 space-y-4">

        {/* ═══ HEADER ═══ */}
        <div className="text-center pt-2 pb-1">
          <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}
            className="inline-block mb-2">
            <Crown size={36} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.5))' }} />
          </motion.div>
          <h1 className="font-ninja text-2xl tracking-wider"
            style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            VIP MEMBERSHIP
          </h1>
          <p className="font-body text-xs text-gray-500 mt-1">Unlock exclusive perks & rewards</p>
        </div>

        {/* ═══ STATUS CARD ═══ */}
        <div className="rounded-xl overflow-hidden"
          style={{
            border: isVIP ? '1px solid rgba(255,215,0,0.3)' : isExpired ? '1px solid rgba(255,50,50,0.25)' : '1px solid rgba(255,255,255,0.06)',
            background: isVIP ? 'linear-gradient(135deg, rgba(255,215,0,0.06), rgba(10,10,15,0.95))' : 'rgba(255,255,255,0.02)',
          }}>
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{
                  background: isVIP ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isVIP ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                {isVIP ? <Crown size={20} className="text-yellow-400" /> : <Lock size={20} className="text-gray-600" />}
              </div>
              <div>
                <p className="font-ninja text-sm" style={{ color: isVIP ? '#FFD700' : isExpired ? '#ff4444' : '#666' }}>
                  {isVIP ? 'VIP ACTIVE' : isExpired ? 'VIP EXPIRED' : 'NOT A VIP'}
                </p>
                {isVIP && daysLeft !== null && (
                  <p className="font-body text-[10px] text-gray-500">
                    {daysLeft} days left — expires {new Date(vipExpiry!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                )}
                {isExpired && <p className="font-body text-[10px] text-gray-600">Your perks are no longer active</p>}
                {!isVIP && !isExpired && <p className="font-body text-[10px] text-gray-600">{VIP_CONFIG.priceCoins.toLocaleString()} coins for 30 days</p>}
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={goToStore}
              className="px-4 py-2 rounded-lg font-ninja text-xs flex items-center gap-1.5"
              style={{
                background: isVIP ? 'rgba(255,215,0,0.12)' : 'linear-gradient(135deg, #FFD700, #FF8C00)',
                color: isVIP ? '#FFD700' : '#000',
                border: isVIP ? '1px solid rgba(255,215,0,0.25)' : 'none',
              }}>
              <ShoppingBag size={13} /> {isVIP ? 'RENEW' : 'GET VIP'}
            </motion.button>
          </div>

          {/* Quick stats row for VIP */}
          {isVIP && (
            <div className="grid grid-cols-3 border-t border-white/5">
              <div className="flex items-center justify-center gap-1.5 py-2.5">
                <Percent size={12} className="text-blue-400" />
                <span className="font-ninja text-[10px] text-blue-400">{VIP_CONFIG.cafeDiscountPercent}% CAFE</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 py-2.5 border-x border-white/5">
                <Coins size={12} className="text-yellow-400" />
                <span className="font-ninja text-[10px] text-yellow-400">+1 TASK</span>
              </div>
              <button onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
                className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-white/[0.02] transition-all disabled:opacity-40">
                <Gift size={12} className={inviteUsedToday ? 'text-gray-600' : 'text-green-400'} />
                <span className={`font-ninja text-[10px] ${inviteUsedToday ? 'text-gray-600' : 'text-green-400'}`}>
                  {inviteUsedToday ? 'SENT' : 'GIFT'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* ═══ FREE PLAY BANNER ═══ */}
        {hasFreePlay && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-5 py-3.5 flex items-center gap-4"
            style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)' }}>
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-12 h-12 rounded-full flex flex-col items-center justify-center shrink-0"
              style={{ background: 'rgba(57,255,20,0.1)', border: '2px solid rgba(57,255,20,0.4)' }}>
              <span className="font-ninja text-lg text-[#39FF14]">{freePlayMinutes}</span>
              <span className="font-ninja text-[6px] text-[#39FF14]/60">MIN</span>
            </motion.div>
            <div>
              <p className="font-ninja text-sm text-[#39FF14] flex items-center gap-1.5">
                <Sparkles size={13} /> FREE PLAY ACTIVE
              </p>
              <p className="font-body text-[10px] text-[#39FF14]/50">{freePlayMinutes} minutes remaining — no coins deducted</p>
            </div>
          </motion.div>
        )}

        {/* ═══ PERKS GRID ═══ */}
        <div>
          <h3 className="font-ninja text-[10px] text-gray-600 tracking-widest mb-2.5">MEMBER PERKS</h3>
          <div className="grid grid-cols-5 gap-2.5">
            {PERKS.map((perk, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-3 flex flex-col items-center text-center relative"
                style={{
                  background: isVIP ? `${perk.color}08` : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${isVIP ? perk.color + '18' : 'rgba(255,255,255,0.04)'}`,
                }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
                  style={{ background: `${perk.color}10`, border: `1px solid ${perk.color}20` }}>
                  <span style={{ color: isVIP ? perk.color : '#444' }}>{perk.icon}</span>
                </div>
                <p className="font-ninja text-[9px] leading-tight mb-0.5" style={{ color: isVIP ? '#ddd' : '#666' }}>{perk.title}</p>
                <p className="font-body text-[8px] text-gray-700">{perk.desc}</p>
                {isVIP
                  ? <div className="absolute top-1.5 right-1.5"><Check size={9} className="text-[#39FF14]" /></div>
                  : <div className="absolute top-1.5 right-1.5"><Lock size={8} className="text-gray-800" /></div>
                }
              </motion.div>
            ))}
          </div>
        </div>

        {/* ═══ DAILY GIFT (VIP only) ═══ */}
        {isVIP && (
          <div className="rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${inviteUsedToday ? 'rgba(100,100,100,0.15)' : 'rgba(57,255,20,0.15)'}`,
              background: inviteUsedToday ? 'rgba(30,30,35,0.5)' : 'rgba(57,255,20,0.03)',
            }}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: inviteUsedToday ? 'rgba(100,100,100,0.1)' : 'rgba(57,255,20,0.1)',
                    border: `1px solid ${inviteUsedToday ? 'rgba(100,100,100,0.15)' : 'rgba(57,255,20,0.25)'}`,
                  }}>
                  <Gift size={18} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'} />
                </div>
                <div>
                  <p className="font-ninja text-xs" style={{ color: inviteUsedToday ? '#555' : '#39FF14' }}>
                    DAILY GIFT {inviteUsedToday && <span className="text-gray-600 ml-1">• USED</span>}
                  </p>
                  <p className="font-body text-[10px] text-gray-600">
                    Send <span className={inviteUsedToday ? 'text-gray-500' : 'text-[#39FF14]'}>30 min</span> or <span className={inviteUsedToday ? 'text-gray-500' : 'text-yellow-400'}>50 coins</span> to a friend
                  </p>
                </div>
              </div>
              <motion.button whileHover={inviteUsedToday ? {} : { scale: 1.05 }} whileTap={inviteUsedToday ? {} : { scale: 0.95 }}
                onClick={() => !inviteUsedToday && setShowInviteModal(true)}
                disabled={inviteUsedToday}
                className="px-4 py-2 rounded-lg font-ninja text-[11px] flex items-center gap-1.5 transition-all disabled:opacity-40"
                style={inviteUsedToday ? {
                  background: 'rgba(50,50,50,0.2)', color: '#555', border: '1px solid rgba(60,60,60,0.2)',
                } : {
                  background: 'rgba(57,255,20,0.1)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.25)',
                }}>
                {inviteUsedToday ? <Check size={13} /> : <Send size={13} />}
                {inviteUsedToday ? 'SENT' : 'SEND'}
              </motion.button>
            </div>
          </div>
        )}

        {/* ═══ HOW TO GET VIP (non-VIP) ═══ */}
        {!isVIP && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.12)' }}>
            <p className="font-ninja text-[10px] text-gray-600 tracking-widest mb-3">HOW TO GET VIP</p>
            <div className="flex gap-3">
              {[
                { step: '1', text: 'Buy VIP Pass from the Store', icon: <ShoppingBag size={14} /> },
                { step: '2', text: 'It goes to your Inventory', icon: <Star size={14} /> },
                { step: '3', text: 'Click Use to activate (or gift it!)', icon: <Zap size={14} /> },
              ].map((s, i) => (
                <div key={i} className="flex-1 flex items-start gap-2.5 p-3 rounded-lg"
                  style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.08)' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)' }}>
                    <span className="font-ninja text-[9px] text-yellow-600">{s.step}</span>
                  </div>
                  <div>
                    <span className="text-yellow-500/50">{s.icon}</span>
                    <p className="font-body text-[10px] text-gray-500 mt-1">{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={goToStore}
              className="w-full mt-3 py-3 rounded-xl font-ninja text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', boxShadow: '0 0 20px rgba(255,215,0,0.2)' }}>
              <Crown size={15} /> BECOME VIP — {VIP_CONFIG.priceCoins.toLocaleString()} COINS
            </motion.button>
          </div>
        )}

        {/* ═══ PRICE INFO ═══ */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="flex items-center gap-1.5 text-gray-700">
            <Crown size={11} />
            <span className="font-body text-[10px]">{VIP_CONFIG.priceCoins.toLocaleString()} coins / 30 days</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-gray-800" />
          <div className="flex items-center gap-1.5 text-gray-700">
            <Users size={11} />
            <span className="font-body text-[10px]">1 daily gift</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-gray-800" />
          <div className="flex items-center gap-1.5 text-gray-700">
            <Percent size={11} />
            <span className="font-body text-[10px]">{VIP_CONFIG.cafeDiscountPercent}% discount</span>
          </div>
        </div>
      </div>

      {/* ═══ DAILY INVITE MODAL ═══ */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowInviteModal(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl p-5 w-[360px] max-w-[90%]"
              style={{ background: '#0a0b10', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9)' }}
              onClick={e => e.stopPropagation()}>

              <div className="flex items-center justify-between mb-4">
                <h3 className="font-ninja text-sm text-[#39FF14] flex items-center gap-2">
                  <Gift size={16} /> CHOOSE GIFT
                </h3>
                <button onClick={() => setShowInviteModal(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>

              {/* Gift choice */}
              <div className="flex gap-2.5 mb-4">
                {([
                  { id: 'time' as const, icon: <Timer size={20} />, val: '30', label: 'FREE MIN', color: '#39FF14' },
                  { id: 'coins' as const, icon: <Coins size={20} />, val: '50', label: 'COINS', color: '#FFD700' },
                ]).map(opt => (
                  <motion.button key={opt.id} whileTap={{ scale: 0.97 }}
                    onClick={() => setInviteChoice(opt.id)}
                    className="flex-1 rounded-xl p-3.5 text-center relative"
                    style={{
                      background: inviteChoice === opt.id ? `${opt.color}10` : 'rgba(255,255,255,0.02)',
                      border: inviteChoice === opt.id ? `2px solid ${opt.color}50` : '2px solid rgba(255,255,255,0.05)',
                    }}>
                    {inviteChoice === opt.id && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: opt.color }}>
                        <Check size={9} className="text-black" />
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center"
                      style={{ background: `${opt.color}12`, border: `1px solid ${opt.color}25` }}>
                      <span style={{ color: inviteChoice === opt.id ? opt.color : '#555' }}>{opt.icon}</span>
                    </div>
                    <p className="font-ninja text-xl mb-0.5" style={{ color: inviteChoice === opt.id ? opt.color : '#555' }}>{opt.val}</p>
                    <p className="font-ninja text-[8px] tracking-wider" style={{ color: inviteChoice === opt.id ? `${opt.color}90` : '#444' }}>{opt.label}</p>
                  </motion.button>
                ))}
              </div>

              <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Friend's username" onKeyDown={(e) => e.key === 'Enter' && handleDailyInvite()}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-body mb-3 focus:outline-none focus:border-[#39FF14]/30"
                style={{ colorScheme: 'dark' }} />

              {inviteMsg && (
                <p className={`text-xs font-body mb-2.5 ${inviteMsg.includes('Sent') ? 'text-[#39FF14]' : 'text-red-400'}`}>{inviteMsg}</p>
              )}

              <motion.button whileTap={{ scale: 0.98 }}
                onClick={handleDailyInvite} disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-2.5 rounded-lg font-ninja text-xs flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: inviteChoice === 'time' ? 'rgba(57,255,20,0.1)' : 'rgba(255,215,0,0.1)',
                  color: inviteChoice === 'time' ? '#39FF14' : '#FFD700',
                  border: `1px solid ${inviteChoice === 'time' ? 'rgba(57,255,20,0.2)' : 'rgba(255,215,0,0.2)'}`,
                }}>
                {inviteLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                SEND {inviteChoice === 'time' ? '30 MIN FREE PLAY' : '50 COINS'}
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
