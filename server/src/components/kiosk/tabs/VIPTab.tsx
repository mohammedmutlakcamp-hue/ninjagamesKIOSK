'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Timer, Gift, Star, Sparkles, Shield,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Loader2,
  Zap, Clock,
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
        updateData.freePlayUntil = Math.max(target.data().freePlayUntil || 0, freeUntil);
      } else {
        updateData.coins = increment(VIP_CONFIG.dailyInviteBonusCoins);
      }
      await updateDoc(doc(db, 'players', target.id), updateData);
      await updateDoc(doc(db, 'players', player.uid), { 'vip.lastDailyInvite': todayKey });
      setInviteMsg(`Sent ${inviteChoice === 'time' ? '30min free play' : '50 coins'} to ${inviteUsername.toUpperCase()}!`);
      setInviteUsername('');
      setTimeout(() => { setShowInviteModal(false); setInviteMsg(''); }, 2500);
    } catch { setInviteMsg('Failed to send'); }
    setInviteLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden">

      <div className="max-w-[700px] mx-auto px-6 py-6 space-y-5">

        {/* ══ HERO CARD ══ */}
        <div className="relative rounded-2xl overflow-hidden"
          style={{ background: isVIP
            ? 'linear-gradient(135deg, #1a1200 0%, #2a1f00 30%, #1a1500 60%, #0f0d00 100%)'
            : 'linear-gradient(135deg, #0a0a10 0%, #0f0f18 50%, #0a0a10 100%)',
            border: isVIP ? '2px solid rgba(255,215,0,0.25)' : '2px solid rgba(255,255,255,0.06)',
          }}>
          {/* Gold shimmer for VIP */}
          {isVIP && (
            <motion.div className="absolute inset-0 pointer-events-none"
              animate={{ backgroundPosition: ['0% 50%', '200% 50%'] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.04) 25%, rgba(255,215,0,0.08) 50%, rgba(255,215,0,0.04) 75%, transparent 100%)', backgroundSize: '200% 100%' }} />
          )}

          <div className="relative p-6">
            <div className="flex items-center gap-5">
              {/* Crown icon */}
              <motion.div
                animate={isVIP ? { rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 4, repeat: Infinity }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: isVIP ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${isVIP ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isVIP ? '0 0 30px rgba(255,215,0,0.15)' : 'none',
                }}>
                <Crown size={36} style={{ color: isVIP ? '#FFD700' : '#444', filter: isVIP ? 'drop-shadow(0 0 8px rgba(255,215,0,0.5))' : 'none' }} />
              </motion.div>

              <div className="flex-1">
                <h1 className="font-ninja text-2xl tracking-wider mb-1"
                  style={{ color: isVIP ? '#FFD700' : isExpired ? '#ff4444' : '#666' }}>
                  {isVIP ? 'VIP MEMBER' : isExpired ? 'VIP EXPIRED' : 'VIP MEMBERSHIP'}
                </h1>
                {isVIP && daysLeft !== null && (
                  <div className="flex items-center gap-3">
                    <span className="font-body text-sm text-gray-400">
                      {daysLeft} days remaining
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-ninja text-[9px] ${
                      daysLeft <= 5 ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                    }`}>{daysLeft <= 5 ? 'EXPIRING SOON' : 'ACTIVE'}</span>
                  </div>
                )}
                {!isVIP && !isExpired && (
                  <p className="font-body text-sm text-gray-500">Unlock exclusive perks for {VIP_CONFIG.priceCoins.toLocaleString()} coins</p>
                )}
                {isExpired && <p className="font-body text-sm text-gray-500">Renew to get your perks back</p>}
              </div>

              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={goToStore}
                className="px-6 py-3 rounded-xl font-ninja text-sm flex items-center gap-2 shrink-0"
                style={{
                  background: isVIP ? 'rgba(255,215,0,0.1)' : 'linear-gradient(135deg, #FFD700, #FF8C00)',
                  color: isVIP ? '#FFD700' : '#000',
                  border: isVIP ? '1px solid rgba(255,215,0,0.25)' : 'none',
                  boxShadow: isVIP ? 'none' : '0 0 20px rgba(255,215,0,0.25)',
                }}>
                <ShoppingBag size={15} /> {isVIP ? 'RENEW' : 'GET VIP'}
              </motion.button>
            </div>
          </div>

          {/* Quick stat bar */}
          {isVIP && (
            <div className="grid grid-cols-3 border-t border-yellow-500/10">
              <div className="flex items-center justify-center gap-2 py-3">
                <Coffee size={14} className="text-blue-400" />
                <span className="font-ninja text-[10px] text-blue-400">{VIP_CONFIG.cafeDiscountPercent}% CAFE OFF</span>
              </div>
              <div className="flex items-center justify-center gap-2 py-3 border-x border-yellow-500/10">
                <Coins size={14} className="text-yellow-400" />
                <span className="font-ninja text-[10px] text-yellow-400">+1 PER TASK</span>
              </div>
              <button onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
                className="flex items-center justify-center gap-2 py-3 hover:bg-white/[0.02] transition-all disabled:opacity-40">
                <Gift size={14} className={inviteUsedToday ? 'text-gray-600' : 'text-green-400'} />
                <span className={`font-ninja text-[10px] ${inviteUsedToday ? 'text-gray-600' : 'text-green-400'}`}>
                  {inviteUsedToday ? 'GIFT SENT' : 'SEND GIFT'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* ══ FREE PLAY ══ */}
        {hasFreePlay && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl px-5 py-3.5 flex items-center gap-4"
            style={{ background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.15)' }}>
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ border: '2px solid #39FF14', background: 'rgba(57,255,20,0.08)' }}>
              <span className="font-ninja text-lg text-[#39FF14]">{freePlayMinutes}</span>
            </motion.div>
            <div>
              <p className="font-ninja text-sm text-[#39FF14] flex items-center gap-1.5"><Sparkles size={13} /> FREE PLAY ACTIVE</p>
              <p className="font-body text-[10px] text-gray-500">{freePlayMinutes} minutes remaining</p>
            </div>
          </motion.div>
        )}

        {/* ══ PERKS ══ */}
        <div>
          <h3 className="font-ninja text-[10px] text-gray-600 tracking-widest mb-3 px-1">MEMBER PERKS</h3>
          <div className="grid grid-cols-5 gap-2">
            {([
              { icon: <Coffee size={20} />, color: '#00BFFF', title: `${VIP_CONFIG.cafeDiscountPercent}% OFF`, sub: 'Cafe' },
              { icon: <Coins size={20} />,  color: '#FFD700', title: '+1 COIN', sub: 'Per Task' },
              { icon: <Palette size={20} />,color: '#FF1493', title: 'SKINS', sub: 'Exclusive' },
              { icon: <Star size={20} />,   color: '#4ade80', title: 'BADGE', sub: 'VIP Flair' },
              { icon: <Gift size={20} />,   color: '#39FF14', title: 'GIFT', sub: 'Daily' },
            ]).map((perk, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="rounded-xl p-3 text-center relative"
                style={{
                  background: isVIP ? `${perk.color}06` : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${isVIP ? perk.color + '20' : 'rgba(255,255,255,0.04)'}`,
                }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2"
                  style={{ background: `${perk.color}10`, border: `1px solid ${perk.color}18` }}>
                  <span style={{ color: isVIP ? perk.color : '#333' }}>{perk.icon}</span>
                </div>
                <p className="font-ninja text-[9px] mb-0.5" style={{ color: isVIP ? '#ddd' : '#555' }}>{perk.title}</p>
                <p className="font-body text-[8px] text-gray-700">{perk.sub}</p>
                {isVIP && <div className="absolute top-1 right-1"><Check size={8} style={{ color: perk.color }} /></div>}
                {!isVIP && <div className="absolute top-1 right-1"><Lock size={7} className="text-gray-800" /></div>}
              </motion.div>
            ))}
          </div>
        </div>

        {/* ══ DAILY GIFT (VIP) ══ */}
        {isVIP && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${inviteUsedToday ? 'rgba(80,80,80,0.12)' : 'rgba(57,255,20,0.15)'}`,
              background: inviteUsedToday ? 'rgba(25,25,30,0.5)' : 'rgba(57,255,20,0.03)',
            }}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <motion.div animate={inviteUsedToday ? {} : { scale: [1, 1.1, 1] }} transition={{ duration: 2.5, repeat: Infinity }}
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: inviteUsedToday ? 'rgba(80,80,80,0.08)' : 'rgba(57,255,20,0.08)',
                    border: `1px solid ${inviteUsedToday ? 'rgba(80,80,80,0.12)' : 'rgba(57,255,20,0.2)'}`,
                  }}>
                  <Gift size={20} className={inviteUsedToday ? 'text-gray-600' : 'text-[#39FF14]'} />
                </motion.div>
                <div>
                  <p className="font-ninja text-xs flex items-center gap-2" style={{ color: inviteUsedToday ? '#555' : '#39FF14' }}>
                    DAILY GIFT
                    {inviteUsedToday && <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-500">USED</span>}
                  </p>
                  <p className="font-body text-[10px] text-gray-600">
                    Send <span className={inviteUsedToday ? '' : 'text-[#39FF14]'}>30 min</span> or <span className={inviteUsedToday ? '' : 'text-yellow-400'}>50 coins</span> to a friend
                  </p>
                </div>
              </div>
              <motion.button whileHover={inviteUsedToday ? {} : { scale: 1.05 }} whileTap={inviteUsedToday ? {} : { scale: 0.95 }}
                onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
                className="px-5 py-2.5 rounded-xl font-ninja text-[11px] flex items-center gap-1.5 disabled:opacity-35"
                style={inviteUsedToday ? { background: 'rgba(40,40,40,0.2)', color: '#444' } : {
                  background: 'linear-gradient(135deg, rgba(57,255,20,0.12), rgba(57,255,20,0.06))',
                  color: '#39FF14', border: '1px solid rgba(57,255,20,0.25)',
                }}>
                {inviteUsedToday ? <Check size={13} /> : <Send size={13} />}
                {inviteUsedToday ? 'SENT' : 'SEND GIFT'}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ══ HOW IT WORKS (non-VIP) ══ */}
        {!isVIP && (
          <div className="rounded-xl p-5" style={{ background: 'rgba(255,215,0,0.02)', border: '1px solid rgba(255,215,0,0.1)' }}>
            <p className="font-ninja text-[10px] text-gray-600 tracking-widest mb-3">HOW TO GET VIP</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: '1', icon: <ShoppingBag size={16} />, text: 'Buy VIP Pass from Store' },
                { n: '2', icon: <Star size={16} />, text: 'It goes to your Inventory' },
                { n: '3', icon: <Zap size={16} />, text: 'Click Use to activate!' },
              ].map((s, i) => (
                <div key={i} className="rounded-lg p-3 text-center"
                  style={{ background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.06)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.15)' }}>
                    <span className="font-ninja text-[10px] text-yellow-600">{s.n}</span>
                  </div>
                  <span className="text-yellow-500/40 block mb-1">{s.icon}</span>
                  <p className="font-body text-[9px] text-gray-500">{s.text}</p>
                </div>
              ))}
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={goToStore}
              className="w-full mt-4 py-3.5 rounded-xl font-ninja text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', boxShadow: '0 0 20px rgba(255,215,0,0.2)' }}>
              <Crown size={16} /> BECOME VIP — {VIP_CONFIG.priceCoins.toLocaleString()} COINS
            </motion.button>
          </div>
        )}

        {/* Footer */}
        <p className="font-body text-gray-700 text-[9px] text-center">
          {VIP_CONFIG.priceCoins.toLocaleString()} coins · 30 days · {VIP_CONFIG.cafeDiscountPercent}% cafe discount · daily gifts
        </p>
      </div>

      {/* ══ INVITE MODAL ══ */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowInviteModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl p-6 w-[380px] max-w-[90%] relative"
              style={{ background: 'linear-gradient(180deg, #0c0e14 0%, #080a10 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 25px 60px rgba(0,0,0,0.9)' }}
              onClick={e => e.stopPropagation()}>

              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-lg text-[#39FF14] flex items-center gap-2"><Gift size={18} /> SEND GIFT</h3>
                <button onClick={() => setShowInviteModal(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
              </div>

              <p className="font-body text-xs text-gray-500 mb-4">Pick a gift for your friend:</p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {([
                  { id: 'time' as const, icon: <Timer size={24} />, val: '30', unit: 'MIN', sub: 'Free Play', color: '#39FF14' },
                  { id: 'coins' as const, icon: <Coins size={24} />, val: '50', unit: 'COINS', sub: 'Bonus', color: '#FFD700' },
                ]).map(opt => {
                  const sel = inviteChoice === opt.id;
                  return (
                    <motion.button key={opt.id} whileTap={{ scale: 0.97 }}
                      onClick={() => setInviteChoice(opt.id)}
                      className="rounded-xl p-4 text-center relative"
                      style={{
                        background: sel ? `${opt.color}08` : 'rgba(255,255,255,0.02)',
                        border: sel ? `2px solid ${opt.color}45` : '2px solid rgba(255,255,255,0.05)',
                        boxShadow: sel ? `0 0 20px ${opt.color}12` : 'none',
                      }}>
                      {sel && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: opt.color }}>
                          <Check size={10} className="text-black" />
                        </div>
                      )}
                      <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center"
                        style={{ background: `${opt.color}10`, border: `1px solid ${opt.color}22` }}>
                        <span style={{ color: sel ? opt.color : '#555' }}>{opt.icon}</span>
                      </div>
                      <p className="font-ninja text-2xl" style={{ color: sel ? opt.color : '#555' }}>{opt.val}</p>
                      <p className="font-ninja text-[8px] tracking-wider" style={{ color: sel ? `${opt.color}88` : '#444' }}>{opt.unit}</p>
                      <p className="font-body text-[9px] text-gray-600 mt-0.5">{opt.sub}</p>
                    </motion.button>
                  );
                })}
              </div>

              <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Friend's username" onKeyDown={(e) => e.key === 'Enter' && handleDailyInvite()}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-body mb-3 focus:outline-none focus:border-[#39FF14]/30"
                style={{ colorScheme: 'dark' }} />

              {inviteMsg && <p className={`text-xs font-body mb-3 ${inviteMsg.includes('Sent') ? 'text-[#39FF14]' : 'text-red-400'}`}>{inviteMsg}</p>}

              <button onClick={handleDailyInvite} disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-3 rounded-xl font-ninja text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                style={{
                  background: inviteChoice === 'time' ? 'linear-gradient(135deg, #2ddb1a, #39FF14)' : 'linear-gradient(135deg, #FFD700, #FF8C00)',
                  color: '#000',
                  boxShadow: `0 0 20px ${inviteChoice === 'time' ? 'rgba(57,255,20,0.25)' : 'rgba(255,215,0,0.25)'}`,
                }}>
                {inviteLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                SEND GIFT
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
