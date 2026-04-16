'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection, onSnapshot } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Timer, Gift, Star, Sparkles, Shield,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Loader2,
  Zap, Clock, Gem, Eye, ChevronRight, Award,
} from 'lucide-react';

interface Props {
  player: any;
}

// Gold color palette
const GOLD = '#FFD700';
const GOLD_LIGHT = '#FFE44D';
const GOLD_DARK = '#B8860B';
const AMBER = '#FF8C00';

export function VIPTab({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const isVIP = player.vip?.active === true && (player.vip?.expiresAt || 0) > Date.now();
  const vipExpiry: number | null = player.vip?.expiresAt ?? null;
  const isExpired = player.vip?.active && (player.vip?.expiresAt || 0) <= Date.now();
  const daysLeft = vipExpiry ? Math.max(0, Math.ceil((vipExpiry - Date.now()) / 86400000)) : null;

  const freePlayUntil = player.freePlayUntil || 0;
  const hasFreePlay = freePlayUntil > Date.now();
  const freePlayMinutes = hasFreePlay ? Math.ceil((freePlayUntil - Date.now()) / 60000) : 0;

  const [vipPlayers, setVipPlayers] = useState<any[]>([]);
  const [vipStats, setVipStats] = useState({ totalVip: 0, totalSpent: 0, avgPlaytime: 0 });

  // Load VIP players
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'players'), (snap) => {
      const now = Date.now();
      const vips = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((p: any) => p.vip?.active && (p.vip?.expiresAt || 0) > now)
        .sort((a: any, b: any) => (b.totalCoinsSpent || 0) - (a.totalCoinsSpent || 0));
      setVipPlayers(vips);
      setVipStats({
        totalVip: vips.length,
        totalSpent: vips.reduce((s: number, p: any) => s + (p.totalCoinsSpent || 0), 0),
        avgPlaytime: vips.length ? Math.round(vips.reduce((s: number, p: any) => s + (p.totalPlaytime || 0), 0) / vips.length / 60) : 0,
      });
    });
    return () => unsub();
  }, []);

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
      if (snap.empty) { setInviteMsg(ar ? 'اللاعب غير موجود' : 'Player not found'); setInviteLoading(false); return; }
      const target = snap.docs[0];
      if (target.id === player.uid) { setInviteMsg(ar ? 'لا يمكنك دعوة نفسك!' : "Can't invite yourself!"); setInviteLoading(false); return; }
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
    } catch { setInviteMsg(ar ? 'فشل الإرسال' : 'Failed to send'); }
    setInviteLoading(false);
  };

  // Perk cards
  const PERKS = [
    { icon: <Coffee size={20} />, title: `${VIP_CONFIG.cafeDiscountPercent}% OFF`, sub: 'Cafe Discount', desc: 'All food & drinks' },
    { icon: <Coins size={20} />, title: '+1 COIN', sub: 'Per Task', desc: 'Extra daily task reward' },
    { icon: <Palette size={20} />, title: 'SKINS', sub: 'Exclusive', desc: '3 VIP-only skins' },
    { icon: <Star size={20} />, title: 'BADGE', sub: 'VIP Flair', desc: 'Leaderboard crown' },
    { icon: <Gift size={20} />, title: 'DAILY', sub: 'Gift Power', desc: 'Free play or coins' },
    { icon: <Shield size={20} />, title: 'PRIORITY', sub: 'Support', desc: 'Help queue first' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative w-full h-full overflow-hidden">

      {/* ═══ Background — same as Buy Time ═══ */}
      <div className="absolute inset-0">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #080c12 0%, #0a1018 30%, #0c1420 60%, #081014 100%)' }} />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,215,0,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,140,0,0.05) 0%, transparent 50%)' }} />

        {/* PCB traces — gold themed */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 1200" preserveAspectRatio="none">
          <motion.path d="M0,60 L100,60 L120,80 L280,80 L300,60 L500,60 L520,80 L800,80" stroke={GOLD} strokeWidth="0.8" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.1 }} transition={{ duration: 2, delay: 0.2 }} />
          <motion.path d="M800,180 L650,180 L630,160 L450,160 L430,180 L250,180 L230,160 L0,160" stroke={AMBER} strokeWidth="0.8" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.08 }} transition={{ duration: 2, delay: 0.5 }} />
          <motion.path d="M0,350 L150,350 L170,370 L350,370 L370,350 L550,350 L570,370 L800,370" stroke={GOLD} strokeWidth="0.6" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.07 }} transition={{ duration: 2.5, delay: 0.7 }} />
          <motion.path d="M800,520 L600,520 L580,500 L400,500 L380,520 L200,520 L180,500 L0,500" stroke={AMBER} strokeWidth="0.6" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 0.9 }} />
          <motion.path d="M0,700 L120,700 L140,720 L320,720 L340,700 L500,700" stroke={GOLD} strokeWidth="0.5" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 2, delay: 1.1 }} />
          {/* Vertical traces */}
          <motion.path d="M120,60 L120,160 L140,180 L140,370" stroke={GOLD} strokeWidth="0.5" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.06 }} transition={{ duration: 1.8, delay: 0.8 }} />
          <motion.path d="M550,80 L550,180 L530,200 L530,350" stroke={AMBER} strokeWidth="0.5" fill="none"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.05 }} transition={{ duration: 1.8, delay: 1 }} />
          {/* Via holes */}
          <motion.circle cx="120" cy="80" r="2.5" fill={GOLD}
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.2, 0.08] }} transition={{ duration: 1.5, delay: 2, repeat: Infinity, repeatDelay: 4 }} />
          <motion.circle cx="550" cy="180" r="2.5" fill={AMBER}
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.18, 0.07] }} transition={{ duration: 1.5, delay: 2.5, repeat: Infinity, repeatDelay: 5 }} />
          <motion.circle cx="370" cy="350" r="2" fill={GOLD}
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.15, 0.06] }} transition={{ duration: 1.5, delay: 3, repeat: Infinity, repeatDelay: 4.5 }} />
          {/* IC chip pads */}
          <motion.rect x="116" y="76" width="8" height="8" rx="1" fill="none" stroke={GOLD} strokeWidth="0.8"
            initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ delay: 2 }} />
          <motion.rect x="546" y="176" width="8" height="8" rx="1" fill="none" stroke={AMBER} strokeWidth="0.8"
            initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ delay: 2.2 }} />
        </svg>
      </div>

      {/* ═══ Content ═══ */}
      <div className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'thin', scrollbarColor: `${GOLD}30 transparent` }}>
        <div className="max-w-[760px] mx-auto px-8 py-7 space-y-6">

          {/* ══ HEADER — like Buy Time header ══ */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
            className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ border: `2px solid ${GOLD}60`, background: `radial-gradient(circle, ${GOLD}20 0%, transparent 70%)`, boxShadow: `0 0 20px ${GOLD}15` }}>
                <Crown size={24} style={{ color: GOLD, filter: `drop-shadow(0 0 6px ${GOLD}80)` }} />
              </motion.div>
              <div>
                <motion.h2 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="font-ninja text-4xl tracking-wide"
                  style={{ background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD}, ${AMBER})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: 'none', filter: `drop-shadow(0 0 15px ${GOLD}40)` }}>
                  {ar ? 'منطقة VIP' : 'VIP ZONE'}
                </motion.h2>
                <p className="font-body text-gray-400 text-sm mt-1">
                  {isVIP ? (ar ? `متبقي ${daysLeft} يوم` : `${daysLeft} days remaining`) : isExpired ? (ar ? 'انتهت العضوية' : 'Membership expired') : (ar ? 'افتح العضوية النخبة' : 'Unlock elite membership')}
                </p>
              </div>
            </div>
          </motion.div>

          {/* ══ STATUS CARD — HUD framed like Buy Time cards ══ */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
            className="relative">
            <motion.div
              animate={isVIP ? { boxShadow: [`0 0 0px ${GOLD}00`, `0 0 25px ${GOLD}20`, `0 0 0px ${GOLD}00`] } : {}}
              transition={{ duration: 3, repeat: Infinity }}
              className="relative rounded-lg overflow-hidden"
              style={{ border: `1px solid ${isVIP ? `${GOLD}50` : 'rgba(255,255,255,0.08)'}` }}>

              {/* Changing gradient gold border for VIP */}
              {isVIP && (
                <motion.div className="absolute -inset-[2px] rounded-lg"
                  animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  style={{ background: `linear-gradient(135deg, ${GOLD}, ${AMBER}, ${GOLD_LIGHT}, ${GOLD})`, backgroundSize: '300% 300%' }} />
              )}

              <div className="relative rounded-lg px-6 py-5" style={{
                background: isVIP
                  ? `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT} 50%, ${AMBER})`
                  : 'rgba(255,255,255,0.02)',
              }}>
                {/* HUD corners */}
                {(() => {
                  const cc = isVIP ? '#000' : GOLD;
                  const ccDim = isVIP ? 'rgba(0,0,0,0.5)' : `${GOLD}60`;
                  return [
                    { pos: 'top-0 left-0', borders: { borderTop: `2px solid ${cc}`, borderLeft: `2px solid ${cc}` } },
                    { pos: 'top-0 right-0', borders: { borderTop: `2px solid ${ccDim}`, borderRight: `2px solid ${ccDim}` } },
                    { pos: 'bottom-0 left-0', borders: { borderBottom: `2px solid ${ccDim}`, borderLeft: `2px solid ${ccDim}` } },
                    { pos: 'bottom-0 right-0', borders: { borderBottom: `2px solid ${cc}`, borderRight: `2px solid ${cc}` } },
                  ];
                })().map((c, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.08 }}
                    className={`absolute ${c.pos} w-4 h-4`} style={c.borders} />
                ))}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Crown */}
                    <motion.div
                      animate={isVIP ? { rotate: [0, 3, -3, 0] } : {}}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-16 h-16 rounded-xl flex items-center justify-center"
                      style={{
                        background: isVIP ? 'rgba(0,0,0,0.15)' : `${GOLD}10`,
                        border: `2px solid ${isVIP ? 'rgba(0,0,0,0.3)' : `${GOLD}30`}`,
                      }}>
                      <Crown size={34} style={{ color: isVIP ? '#000' : GOLD, filter: isVIP ? 'none' : `drop-shadow(0 0 10px ${GOLD}80)` }} />
                    </motion.div>
                    <div>
                      <p className="font-ninja text-2xl tracking-wider" style={{
                        color: isVIP ? '#000' : isExpired ? '#ff4444' : '#666',
                        fontWeight: isVIP ? 900 : 'normal',
                      }}>
                        {isVIP ? (ar ? 'VIP مفعل' : 'VIP ACTIVE') : isExpired ? (ar ? 'منتهي' : 'EXPIRED') : (ar ? 'لست عضواً' : 'NOT A MEMBER')}
                      </p>
                      {isVIP && daysLeft !== null && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-36 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(daysLeft / 30) * 100}%` }}
                              transition={{ duration: 1.2, delay: 0.6 }}
                              className="h-full rounded-full"
                              style={{ background: daysLeft <= 5 ? 'linear-gradient(90deg, #ff4444, #ff6b00)' : '#000' }}
                            />
                          </div>
                          <span className="font-ninja text-sm" style={{ color: daysLeft <= 5 ? '#7a0000' : '#000', fontWeight: 900 }}>{daysLeft}D LEFT</span>
                        </div>
                      )}
                      {!isVIP && (
                        <p className="font-body text-sm text-gray-500 mt-1">{VIP_CONFIG.priceCoins.toLocaleString()} coins · 30 days</p>
                      )}
                    </div>
                  </div>

                  {/* CTA */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={goToStore}
                    className="px-6 py-3.5 rounded-xl font-ninja text-base flex items-center gap-2 relative overflow-hidden"
                    style={{
                      background: isVIP ? '#000' : `linear-gradient(135deg, ${GOLD}, ${AMBER})`,
                      color: isVIP ? GOLD : '#000',
                      boxShadow: isVIP ? '0 4px 15px rgba(0,0,0,0.3)' : `0 0 20px ${GOLD}30`,
                      fontWeight: 900,
                    }}>
                    {/* Metallic sweep */}
                    <motion.div className="absolute inset-0 pointer-events-none"
                      animate={{ x: ['-100%', '250%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                      style={{ background: `linear-gradient(105deg, transparent 30%, ${isVIP ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.4)'} 50%, transparent 70%)`, width: '40%' }} />
                    <ShoppingBag size={18} />
                    {isVIP ? (ar ? 'تجديد' : 'RENEW') : (ar ? 'اشترك في VIP' : 'GET VIP')}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* ══ QUICK STATS (VIP) — like Buy Time balance ══ */}
          {isVIP && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="grid grid-cols-3 gap-3">
              {[
                { icon: <Coffee size={16} />, text: `${VIP_CONFIG.cafeDiscountPercent}% CAFE OFF`, color: '#00C8FF' },
                { icon: <Coins size={16} />, text: '+1 PER TASK', color: GOLD },
                { icon: <Gift size={16} />, text: inviteUsedToday ? 'GIFT SENT' : 'SEND GIFT', color: inviteUsedToday ? '#444' : '#39FF14', onClick: () => !inviteUsedToday && setShowInviteModal(true) },
              ].map((s, i) => (
                <motion.button key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.08 }}
                  onClick={s.onClick}
                  disabled={!s.onClick}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-lg relative overflow-hidden transition-all hover:bg-white/[0.03]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${s.color}18` }}>
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: `1px solid ${s.color}40`, borderLeft: `1px solid ${s.color}40` }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: `1px solid ${s.color}40`, borderRight: `1px solid ${s.color}40` }} />
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span className="font-ninja text-xs tracking-wider" style={{ color: s.color }}>{s.text}</span>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* ══ FREE PLAY BANNER ══ */}
          {hasFreePlay && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
              className="rounded-lg px-5 py-3.5 flex items-center gap-4 relative overflow-hidden"
              style={{ background: 'rgba(57,255,20,0.03)', border: '1px solid rgba(57,255,20,0.15)' }}>
              <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
              <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                style={{ border: '2px solid rgba(57,255,20,0.3)', background: 'rgba(57,255,20,0.06)' }}>
                <span className="font-ninja text-lg text-[#39FF14]">{freePlayMinutes}</span>
              </motion.div>
              <div>
                <p className="font-ninja text-sm text-[#39FF14] flex items-center gap-1.5"><Sparkles size={13} /> FREE PLAY ACTIVE</p>
                <p className="font-body text-[10px] text-gray-500">{freePlayMinutes} minutes remaining</p>
              </div>
            </motion.div>
          )}

          {/* ══ PERKS — Buy Time card style with HUD corners ══ */}
          <div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="font-ninja text-xs tracking-[0.2em] mb-3 px-1" style={{ color: `${GOLD}60` }}>
              {ar ? 'مزايا العضو' : 'MEMBER PERKS'}
            </motion.p>
            <div className="grid grid-cols-3 gap-2.5">
              {PERKS.map((perk, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: isVIP ? 1 : 0.5, x: 0 }}
                  transition={{ delay: 0.55 + i * 0.08, type: 'spring', stiffness: 100 }}
                  className="relative rounded-lg overflow-hidden group cursor-default"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${isVIP ? `${GOLD}20` : 'rgba(255,255,255,0.05)'}` }}>
                  {/* HUD corners */}
                  <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.06 }}
                    className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${isVIP ? GOLD : '#444'}`, borderLeft: `2px solid ${isVIP ? GOLD : '#444'}` }} />
                  <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.75 + i * 0.06 }}
                    className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${isVIP ? `${GOLD}60` : '#333'}`, borderRight: `2px solid ${isVIP ? `${GOLD}60` : '#333'}` }} />

                  <div className="p-3.5 text-center relative">
                    {/* Hover glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `radial-gradient(circle, ${GOLD}08, transparent 70%)` }} />

                    <motion.div
                      animate={isVIP ? { y: [0, -2, 0] } : {}}
                      transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                      className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-2.5"
                      style={{ background: `${GOLD}08`, border: `1px solid ${isVIP ? `${GOLD}20` : '#333'}` }}>
                      <span style={{ color: isVIP ? GOLD : '#333' }}>{perk.icon}</span>
                    </motion.div>
                    <p className="font-ninja text-sm" style={{ color: isVIP ? GOLD : '#444' }}>{perk.title}</p>
                    <p className="font-body text-[11px] text-gray-400 mt-1">{perk.desc}</p>

                    {/* Lock / check */}
                    <div className="absolute top-2 right-2">
                      {isVIP ? <Check size={12} style={{ color: GOLD }} /> : <Lock size={10} className="text-gray-700" />}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ══ DAILY GIFT — card style with HUD frame ══ */}
          {isVIP && (
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, type: 'spring', stiffness: 100 }}
              className="relative rounded-lg overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${inviteUsedToday ? 'rgba(255,255,255,0.05)' : `${GOLD}20`}` }}>
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${inviteUsedToday ? '#333' : GOLD}`, borderLeft: `2px solid ${inviteUsedToday ? '#333' : GOLD}` }} />
              <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${inviteUsedToday ? '#333' : `${GOLD}60`}`, borderRight: `2px solid ${inviteUsedToday ? '#333' : `${GOLD}60`}` }} />

              <div className="flex items-center justify-between px-6 py-5">
                <div className="flex items-center gap-4">
                  <motion.div
                    animate={inviteUsedToday ? {} : { boxShadow: [`0 0 8px ${GOLD}20`, `0 0 18px ${GOLD}35`, `0 0 8px ${GOLD}20`] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-13 h-13 rounded-lg flex items-center justify-center"
                    style={{ background: inviteUsedToday ? 'rgba(60,60,60,0.05)' : `${GOLD}08`, border: `1px solid ${inviteUsedToday ? '#333' : `${GOLD}25`}`, width: 52, height: 52 }}>
                    <Gift size={24} style={{ color: inviteUsedToday ? '#444' : GOLD }} />
                  </motion.div>
                  <div>
                    <p className="font-ninja text-base flex items-center gap-2" style={{ color: inviteUsedToday ? '#555' : GOLD }}>
                      {ar ? 'الهدية اليومية' : 'DAILY GIFT'}
                      {inviteUsedToday && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-500">{ar ? 'مستخدم' : 'USED'}</span>}
                    </p>
                    <p className="font-body text-xs text-gray-400 mt-1">
                      Send <span style={{ color: inviteUsedToday ? '#555' : '#39FF14' }}>30 min</span> or <span style={{ color: inviteUsedToday ? '#555' : GOLD }}>50 coins</span>
                    </p>
                  </div>
                </div>
                <motion.button whileHover={inviteUsedToday ? {} : { scale: 1.05 }} whileTap={inviteUsedToday ? {} : { scale: 0.95 }}
                  onClick={() => !inviteUsedToday && setShowInviteModal(true)} disabled={inviteUsedToday}
                  className="px-6 py-3 rounded-lg font-ninja text-sm flex items-center gap-1.5 disabled:opacity-30 relative overflow-hidden"
                  style={inviteUsedToday ? { background: 'rgba(40,40,40,0.15)', color: '#444' } : {
                    background: `linear-gradient(135deg, ${GOLD}, ${AMBER})`, color: '#000', boxShadow: `0 0 15px ${GOLD}20`,
                  }}>
                  {!inviteUsedToday && (
                    <motion.div className="absolute inset-0 pointer-events-none"
                      animate={{ x: ['-100%', '250%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3 }}
                      style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)', width: '35%' }} />
                  )}
                  {inviteUsedToday ? <Check size={14} /> : <Send size={14} />}
                  {inviteUsedToday ? 'SENT' : 'SEND'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ══ HOW TO GET VIP — for non-VIP ══ */}
          {!isVIP && (
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, type: 'spring', stiffness: 100 }}>
              <p className="font-ninja text-xs tracking-[0.2em] mb-3 px-1" style={{ color: `${GOLD}50` }}>{ar ? 'كيف تصبح VIP' : 'HOW TO BECOME VIP'}</p>
              <div className="space-y-2.5">
                {[
                  { n: '01', icon: <ShoppingBag size={22} />, text: 'Buy VIP Pass from the Store' },
                  { n: '02', icon: <Gem size={22} />, text: 'It appears in your Inventory' },
                  { n: '03', icon: <Zap size={22} />, text: 'Click USE to activate 30 days!' },
                ].map((step, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.12, type: 'spring', stiffness: 100 }}
                    className="relative rounded-lg overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${GOLD}12` }}>
                    <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${GOLD}50`, borderLeft: `2px solid ${GOLD}50` }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${GOLD}30`, borderRight: `2px solid ${GOLD}30` }} />
                    <div className="px-5 py-4 flex items-center gap-4">
                      <span className="font-ninja text-2xl" style={{ color: `${GOLD}35` }}>{step.n}</span>
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}06`, border: `1px solid ${GOLD}12` }}>
                        <span style={{ color: `${GOLD}70` }}>{step.icon}</span>
                      </div>
                      <p className="font-body text-base text-gray-300">{step.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Big CTA button with metallic gold */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                whileHover={{ scale: 1.02, boxShadow: `0 0 35px ${GOLD}35` }}
                whileTap={{ scale: 0.98 }}
                onClick={goToStore}
                className="w-full mt-5 py-4 rounded-lg font-ninja text-base flex items-center justify-center gap-3 relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${AMBER})`, color: '#000', boxShadow: `0 0 25px ${GOLD}25` }}>
                {/* Metallic sweep */}
                <motion.div className="absolute inset-0 pointer-events-none"
                  animate={{ x: ['-100%', '300%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)', width: '30%' }} />
                <Crown size={20} /> BECOME VIP — {VIP_CONFIG.priceCoins.toLocaleString()} COINS
              </motion.button>
            </motion.div>
          )}

          {/* ══ VIP COMMUNITY STATS ══ */}
          <div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
              className="font-ninja text-xs tracking-[0.2em] mb-3 px-1" style={{ color: `${GOLD}50` }}>
              VIP COMMUNITY
            </motion.p>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: <Crown size={18} />, value: String(vipStats.totalVip), label: 'MEMBERS' },
                { icon: <Coins size={18} />, value: vipStats.totalSpent > 1000 ? `${(vipStats.totalSpent / 1000).toFixed(1)}K` : String(vipStats.totalSpent), label: 'SPENT' },
                { icon: <Clock size={18} />, value: `${vipStats.avgPlaytime}h`, label: 'AVG PLAY' },
              ].map((stat, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 + i * 0.1 }}
                  className="rounded-lg p-4 text-center relative"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${GOLD}12` }}>
                  <div className="absolute top-0 left-0 w-2.5 h-2.5" style={{ borderTop: `1px solid ${GOLD}40`, borderLeft: `1px solid ${GOLD}40` }} />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5" style={{ borderBottom: `1px solid ${GOLD}30`, borderRight: `1px solid ${GOLD}30` }} />
                  <span style={{ color: GOLD }}>{stat.icon}</span>
                  <p className="font-ninja text-2xl mt-1.5" style={{ color: GOLD }}>{stat.value}</p>
                  <p className="font-ninja text-[10px] tracking-wider text-gray-400 mt-0.5">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ══ VIP MEMBERS LIST ══ */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="rounded-lg overflow-hidden relative"
            style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${GOLD}10` }}>
            {/* HUD corners */}
            <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${GOLD}40`, borderLeft: `2px solid ${GOLD}40` }} />
            <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${GOLD}30`, borderRight: `2px solid ${GOLD}30` }} />

            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${GOLD}08` }}>
              <div className="flex items-center gap-2">
                <Crown size={16} style={{ color: GOLD }} />
                <span className="font-ninja text-sm tracking-wider" style={{ color: `${GOLD}90` }}>{ar ? 'أعضاء VIP' : 'VIP MEMBERS'}</span>
              </div>
              <span className="font-ninja text-xs" style={{ color: `${GOLD}50` }}>{vipPlayers.length} ACTIVE</span>
            </div>

            {vipPlayers.length === 0 ? (
              <div className="py-10 text-center">
                <Crown size={28} className="mx-auto mb-3" style={{ color: `${GOLD}20` }} />
                <p className="font-body text-sm text-gray-500">{ar ? 'لا يوجد أعضاء VIP بعد. كن الأول!' : 'No VIP members yet. Be the first!'}</p>
              </div>
            ) : (
              <div>
                {vipPlayers.slice(0, 6).map((vp: any, i) => {
                  const isMe = vp.uid === player.uid;
                  const vpDays = vp.vip?.expiresAt ? Math.max(0, Math.ceil((vp.vip.expiresAt - Date.now()) / 86400000)) : 0;
                  const rankColors = [GOLD, '#C0C0C0', '#CD7F32'];
                  return (
                    <motion.div key={vp.uid}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.2 + i * 0.06 }}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{ borderBottom: `1px solid ${GOLD}06`, background: isMe ? `${GOLD}04` : 'transparent' }}>
                      <span className="font-ninja text-sm w-6 text-center" style={{ color: i < 3 ? rankColors[i] : `${GOLD}40` }}>
                        {i + 1}
                      </span>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
                        style={{ background: `${GOLD}10`, border: `1.5px solid ${isMe ? GOLD : `${GOLD}20`}` }}>
                        {vp.profilePhoto
                          ? <img src={vp.profilePhoto} alt="" className="w-full h-full object-cover" />
                          : <span className="font-ninja text-sm" style={{ color: GOLD }}>{(vp.username || '?')[0]?.toUpperCase()}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-ninja text-sm truncate" style={{ color: isMe ? GOLD : '#ddd' }}>
                          {vp.username?.toUpperCase()}
                          {isMe && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${GOLD}15`, color: GOLD }}>YOU</span>}
                        </p>
                      </div>
                      <span className="font-ninja text-xs" style={{ color: `${GOLD}60` }}>{vpDays}D</span>
                    </motion.div>
                  );
                })}
                {vipPlayers.length > 6 && (
                  <div className="px-5 py-2.5 text-center">
                    <span className="font-body text-xs" style={{ color: `${GOLD}40` }}>+{vipPlayers.length - 6} more</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Footer */}
          <p className="font-body text-[8px] text-center py-2" style={{ color: `${GOLD}15` }}>
            {VIP_CONFIG.priceCoins.toLocaleString()} coins · 30 days · {VIP_CONFIG.cafeDiscountPercent}% cafe discount · exclusive skins · daily gifts
          </p>
        </div>
      </div>

      {/* ══ INVITE MODAL ══ */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}
            onClick={() => setShowInviteModal(false)}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="rounded-2xl p-6 w-[400px] max-w-[90%] relative overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #0c1020 0%, #080c14 100%)', border: `1px solid ${GOLD}18`, boxShadow: `0 30px 80px rgba(0,0,0,0.9), 0 0 30px ${GOLD}08` }}
              onClick={e => e.stopPropagation()}>

              {/* Top gold accent */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${GOLD}60, ${AMBER}40, transparent)` }} />
              {/* HUD corners */}
              <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${GOLD}`, borderLeft: `2px solid ${GOLD}` }} />
              <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${GOLD}60`, borderRight: `2px solid ${GOLD}60` }} />

              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-lg flex items-center gap-2" style={{ color: GOLD }}><Gift size={20} /> SEND GIFT</h3>
                <button onClick={() => setShowInviteModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"><X size={18} className="text-gray-500" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {([
                  { id: 'time' as const, icon: <Timer size={24} />, val: '30', unit: 'MIN', sub: 'Free Play', color: '#39FF14' },
                  { id: 'coins' as const, icon: <Coins size={24} />, val: '50', unit: 'COINS', sub: 'Bonus', color: GOLD },
                ]).map(opt => {
                  const sel = inviteChoice === opt.id;
                  return (
                    <motion.button key={opt.id} whileTap={{ scale: 0.97 }}
                      onClick={() => setInviteChoice(opt.id)}
                      className="rounded-lg p-4 text-center relative overflow-hidden"
                      style={{
                        background: sel ? `${opt.color}06` : 'rgba(255,255,255,0.01)',
                        border: sel ? `2px solid ${opt.color}40` : '2px solid rgba(255,255,255,0.05)',
                        boxShadow: sel ? `0 0 20px ${opt.color}10` : 'none',
                      }}>
                      {/* HUD corners on selected */}
                      {sel && <>
                        <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: `2px solid ${opt.color}`, borderLeft: `2px solid ${opt.color}` }} />
                        <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: `2px solid ${opt.color}60`, borderRight: `2px solid ${opt.color}60` }} />
                      </>}
                      {sel && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: opt.color }}><Check size={10} className="text-black" /></motion.div>
                      )}
                      <div className="w-12 h-12 rounded-lg mx-auto mb-2 flex items-center justify-center"
                        style={{ background: `${opt.color}08`, border: `1px solid ${opt.color}18` }}>
                        <span style={{ color: sel ? opt.color : '#444' }}>{opt.icon}</span>
                      </div>
                      <p className="font-ninja text-2xl" style={{ color: sel ? opt.color : '#444' }}>{opt.val}</p>
                      <p className="font-ninja text-[8px] tracking-wider" style={{ color: sel ? `${opt.color}70` : '#333' }}>{opt.unit}</p>
                    </motion.button>
                  );
                })}
              </div>

              <input type="text" value={inviteUsername} onChange={e => setInviteUsername(e.target.value)}
                placeholder={ar ? 'اسم الصديق' : "Friend's username"} onKeyDown={e => e.key === 'Enter' && handleDailyInvite()}
                className="w-full rounded-lg px-4 py-3 text-sm text-white font-body mb-3 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${GOLD}12`, colorScheme: 'dark' }} />

              {inviteMsg && <p className={`text-xs font-body mb-3 ${inviteMsg.includes('Sent') ? '' : 'text-red-400'}`} style={inviteMsg.includes('Sent') ? { color: '#39FF14' } : {}}>{inviteMsg}</p>}

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleDailyInvite} disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-3.5 rounded-lg font-ninja text-sm flex items-center justify-center gap-2 disabled:opacity-30 relative overflow-hidden"
                style={{
                  background: inviteChoice === 'time' ? 'linear-gradient(135deg, #39FF14, #00C8FF)' : `linear-gradient(135deg, ${GOLD}, ${AMBER})`,
                  color: '#000', boxShadow: `0 0 20px ${inviteChoice === 'time' ? '#39FF14' : GOLD}20`,
                }}>
                <motion.div className="absolute inset-0 pointer-events-none"
                  animate={{ x: ['-100%', '250%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                  style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)', width: '35%' }} />
                {inviteLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                SEND GIFT
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
