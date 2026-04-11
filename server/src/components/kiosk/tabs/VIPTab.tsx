'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, query, where, getDocs, collection, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { VIP_CONFIG } from '@/lib/constants';
import {
  Crown, Check, X, Timer, Gift, Star, Sparkles, Shield,
  Coffee, Coins, Lock, Send, Palette, ShoppingBag, Loader2,
  Zap, Clock, Gem, Flame, Eye, ChevronRight, Award,
} from 'lucide-react';

interface Props {
  player: any;
}

// ── Animated particles ─────────────────────────────────────────
function FloatingParticles({ color, count = 20 }: { color: string; count?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 1,
            height: Math.random() * 4 + 1,
            background: color,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            opacity: 0,
          }}
          animate={{
            y: [0, -(Math.random() * 200 + 100)],
            x: [0, (Math.random() - 0.5) * 60],
            opacity: [0, 0.6, 0],
            scale: [0, 1, 0.5],
          }}
          transition={{
            duration: Math.random() * 4 + 3,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

// ── Glowing orb decoration ─────────────────────────────────────
function GlowOrb({ color, size, x, y, delay = 0 }: { color: string; size: number; x: string; y: string; delay?: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, left: x, top: y, background: `radial-gradient(circle, ${color}30, transparent 70%)`, filter: `blur(${size / 3}px)` }}
      animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 4, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  );
}

// No loading intro — direct content reveal

export function VIPTab({ player }: Props) {
  const isVIP = player.vip?.active === true && (player.vip?.expiresAt || 0) > Date.now();
  const vipExpiry: number | null = player.vip?.expiresAt ?? null;
  const isExpired = player.vip?.active && (player.vip?.expiresAt || 0) <= Date.now();
  const daysLeft = vipExpiry ? Math.max(0, Math.ceil((vipExpiry - Date.now()) / 86400000)) : null;

  const freePlayUntil = player.freePlayUntil || 0;
  const hasFreePlay = freePlayUntil > Date.now();
  const freePlayMinutes = hasFreePlay ? Math.ceil((freePlayUntil - Date.now()) / 60000) : 0;

  // No loading gate — content shows immediately
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

  // ── Color scheme from the logo ───────────────────────────────
  const GREEN = '#39FF14';
  const PURPLE = '#7B50FF';
  const BLUE = '#00C8FF';
  const DARK_BG = '#050a14';
  const GOLD = '#FFD700';

  // Perk definitions
  const PERKS = [
    { icon: <Coffee size={22} />, color: BLUE, title: `${VIP_CONFIG.cafeDiscountPercent}%`, sub: 'CAFE DISCOUNT', desc: 'Save on all food & drinks' },
    { icon: <Coins size={22} />, color: GOLD, title: '+1', sub: 'BONUS COIN', desc: 'Extra coin per daily task' },
    { icon: <Palette size={22} />, color: '#FF1493', title: '3', sub: 'EXCLUSIVE SKINS', desc: 'Gold, Diamond & Platinum' },
    { icon: <Star size={22} />, color: GREEN, title: 'VIP', sub: 'BADGE & FLAIR', desc: 'Stand out in leaderboard' },
    { icon: <Gift size={22} />, color: PURPLE, title: 'DAILY', sub: 'GIFT POWER', desc: 'Send free play or coins' },
    { icon: <Shield size={22} />, color: BLUE, title: 'PRIORITY', sub: 'SUPPORT', desc: 'Get help first' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative w-full h-full overflow-hidden"
      style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(57,255,20,0.03) 0%, ${DARK_BG} 60%)` }}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <GlowOrb color={GREEN} size={300} x="-5%" y="-10%" delay={0} />
        <GlowOrb color={PURPLE} size={250} x="70%" y="60%" delay={1.5} />
        <GlowOrb color={BLUE} size={200} x="80%" y="-5%" delay={0.8} />
        <FloatingParticles color={`${GREEN}60`} count={12} />
      </div>

      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-[1px] pointer-events-none z-[5]"
        style={{ background: `linear-gradient(90deg, transparent, ${GREEN}40, transparent)`, boxShadow: `0 0 15px ${GREEN}20` }}
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />

      {/* Main content */}
      <div className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'thin', scrollbarColor: `${GREEN}30 transparent` }}
      >
            <div className="max-w-[780px] mx-auto px-6 py-6 space-y-5">

              {/* ══════════════════ HERO CARD ══════════════════ */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="relative rounded-2xl overflow-hidden"
                style={{
                  background: isVIP
                    ? `linear-gradient(135deg, ${DARK_BG}, rgba(57,255,20,0.04) 30%, rgba(120,80,255,0.03) 70%, ${DARK_BG})`
                    : `linear-gradient(135deg, ${DARK_BG}, rgba(100,100,100,0.03) 50%, ${DARK_BG})`,
                  border: `2px solid ${isVIP ? `${GREEN}35` : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: isVIP ? `0 0 40px ${GREEN}10, inset 0 0 60px ${GREEN}03` : 'none',
                }}
              >
                {/* Animated border shimmer */}
                {isVIP && (
                  <motion.div
                    className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ border: `1px solid transparent`, background: `linear-gradient(${DARK_BG}, ${DARK_BG}) padding-box, linear-gradient(90deg, transparent, ${GREEN}60, ${PURPLE}40, transparent) border-box` }}
                    animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                <div className="relative p-7">
                  <div className="flex items-center gap-6">
                    {/* Animated crown with shield */}
                    <motion.div
                      animate={isVIP ? { rotate: [0, 2, -2, 0] } : {}}
                      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                      className="relative w-24 h-24 flex-shrink-0"
                    >
                      {/* Outer glow ring */}
                      {isVIP && (
                        <motion.div
                          className="absolute inset-[-4px] rounded-2xl"
                          animate={{ boxShadow: [`0 0 20px ${GREEN}25`, `0 0 40px ${GREEN}40`, `0 0 20px ${GREEN}25`] }}
                          transition={{ duration: 2.5, repeat: Infinity }}
                          style={{ border: `2px solid ${GREEN}40`, borderRadius: '18px' }}
                        />
                      )}
                      <div className="w-full h-full rounded-2xl flex items-center justify-center relative overflow-hidden"
                        style={{
                          background: isVIP
                            ? `linear-gradient(135deg, ${GREEN}15, ${PURPLE}10)`
                            : 'rgba(255,255,255,0.02)',
                          border: `2px solid ${isVIP ? `${GREEN}40` : 'rgba(255,255,255,0.06)'}`,
                        }}>
                        {/* Inner radial glow */}
                        {isVIP && <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, ${GREEN}15, transparent 70%)` }} />}
                        <Crown size={40} style={{
                          color: isVIP ? GREEN : '#333',
                          filter: isVIP ? `drop-shadow(0 0 12px ${GREEN}90)` : 'none',
                        }} />
                      </div>
                    </motion.div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <motion.h1
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="font-ninja text-3xl tracking-wider"
                        style={{
                          color: isVIP ? GREEN : isExpired ? '#ff4444' : '#555',
                          textShadow: isVIP ? `0 0 30px ${GREEN}60` : 'none',
                        }}
                      >
                        {isVIP ? 'VIP MEMBER' : isExpired ? 'VIP EXPIRED' : 'VIP ZONE'}
                      </motion.h1>

                      {isVIP && daysLeft !== null && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="flex items-center gap-3 mt-2"
                        >
                          {/* Progress bar for days remaining */}
                          <div className="flex-1 h-2 rounded-full overflow-hidden max-w-[200px]"
                            style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(daysLeft / 30) * 100}%` }}
                              transition={{ duration: 1.5, delay: 0.6 }}
                              className="h-full rounded-full"
                              style={{
                                background: daysLeft <= 5
                                  ? 'linear-gradient(90deg, #ff4444, #ff6b00)'
                                  : `linear-gradient(90deg, ${GREEN}, ${BLUE})`,
                                boxShadow: daysLeft <= 5 ? '0 0 10px rgba(255,68,68,0.5)' : `0 0 10px ${GREEN}40`,
                              }}
                            />
                          </div>
                          <span className="font-ninja text-xs" style={{ color: daysLeft <= 5 ? '#ff6b00' : GREEN }}>
                            {daysLeft}D LEFT
                          </span>
                          {daysLeft <= 5 && (
                            <motion.span
                              animate={{ opacity: [1, 0.4, 1] }}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="px-2 py-0.5 rounded font-ninja text-[9px] text-red-400"
                              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)' }}
                            >
                              EXPIRING
                            </motion.span>
                          )}
                        </motion.div>
                      )}

                      {!isVIP && !isExpired && (
                        <p className="font-body text-sm text-gray-500 mt-1">
                          Unlock elite perks for <span style={{ color: GOLD }}>{VIP_CONFIG.priceCoins.toLocaleString()}</span> coins
                        </p>
                      )}
                      {isExpired && <p className="font-body text-sm text-gray-500 mt-1">Renew to restore your powers</p>}
                    </div>

                    {/* CTA button */}
                    <motion.button
                      whileHover={{ scale: 1.05, boxShadow: `0 0 30px ${isVIP ? GREEN + '30' : GOLD + '40'}` }}
                      whileTap={{ scale: 0.95 }}
                      onClick={goToStore}
                      className="px-7 py-3.5 rounded-xl font-ninja text-sm flex items-center gap-2 shrink-0 relative overflow-hidden"
                      style={{
                        background: isVIP
                          ? `linear-gradient(135deg, ${GREEN}12, ${PURPLE}08)`
                          : `linear-gradient(135deg, ${GREEN}, ${BLUE})`,
                        color: isVIP ? GREEN : '#000',
                        border: isVIP ? `1px solid ${GREEN}30` : 'none',
                        boxShadow: isVIP ? 'none' : `0 0 25px ${GREEN}30`,
                      }}
                    >
                      {/* Button shimmer */}
                      {!isVIP && (
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
                          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', width: '50%' }}
                        />
                      )}
                      <ShoppingBag size={16} />
                      {isVIP ? 'RENEW' : 'GET VIP'}
                    </motion.button>
                  </div>
                </div>

                {/* Quick stats bar (VIP only) */}
                {isVIP && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="grid grid-cols-3"
                    style={{ borderTop: `1px solid ${GREEN}12` }}
                  >
                    {[
                      { icon: <Coffee size={14} />, color: BLUE, text: `${VIP_CONFIG.cafeDiscountPercent}% CAFE OFF` },
                      { icon: <Coins size={14} />, color: GOLD, text: '+1 PER TASK' },
                      {
                        icon: <Gift size={14} />,
                        color: inviteUsedToday ? '#444' : GREEN,
                        text: inviteUsedToday ? 'GIFT SENT' : 'SEND GIFT',
                        onClick: () => !inviteUsedToday && setShowInviteModal(true),
                        disabled: inviteUsedToday,
                      },
                    ].map((stat, i) => (
                      <button
                        key={i}
                        onClick={stat.onClick}
                        disabled={stat.disabled}
                        className="flex items-center justify-center gap-2 py-3.5 transition-all hover:bg-white/[0.02] disabled:opacity-40"
                        style={i === 1 ? { borderLeft: `1px solid ${GREEN}08`, borderRight: `1px solid ${GREEN}08` } : {}}
                      >
                        <span style={{ color: stat.color }}>{stat.icon}</span>
                        <span className="font-ninja text-[10px] tracking-wider" style={{ color: stat.color }}>{stat.text}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {/* ══════════════════ FREE PLAY BANNER ══════════════════ */}
              {hasFreePlay && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-xl px-5 py-4 flex items-center gap-4 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${GREEN}06, ${BLUE}04)`,
                    border: `1px solid ${GREEN}20`,
                    boxShadow: `0 0 20px ${GREEN}08`,
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], boxShadow: [`0 0 15px ${GREEN}30`, `0 0 25px ${GREEN}50`, `0 0 15px ${GREEN}30`] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ border: `2px solid ${GREEN}40`, background: `${GREEN}10` }}
                  >
                    <span className="font-ninja text-xl" style={{ color: GREEN, textShadow: `0 0 10px ${GREEN}60` }}>{freePlayMinutes}</span>
                  </motion.div>
                  <div>
                    <p className="font-ninja text-sm flex items-center gap-2" style={{ color: GREEN, textShadow: `0 0 15px ${GREEN}40` }}>
                      <Sparkles size={14} /> FREE PLAY ACTIVE
                    </p>
                    <p className="font-body text-[11px] text-gray-500">{freePlayMinutes} minutes remaining</p>
                  </div>
                </motion.div>
              )}

              {/* ══════════════════ PERKS GRID ══════════════════ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h3 className="font-ninja text-[10px] tracking-[0.25em] mb-4 px-1" style={{ color: `${GREEN}60` }}>
                  ELITE PERKS
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {PERKS.map((perk, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.08 }}
                      whileHover={isVIP ? { scale: 1.03, y: -2 } : {}}
                      className="rounded-xl p-4 text-center relative group overflow-hidden"
                      style={{
                        background: isVIP ? `${perk.color}06` : 'rgba(255,255,255,0.01)',
                        border: `1px solid ${isVIP ? `${perk.color}20` : 'rgba(255,255,255,0.04)'}`,
                        boxShadow: isVIP ? `0 4px 20px ${perk.color}08` : 'none',
                      }}
                    >
                      {/* Hover glow */}
                      {isVIP && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                          style={{ background: `radial-gradient(circle at 50% 50%, ${perk.color}12, transparent 70%)` }} />
                      )}

                      <motion.div
                        animate={isVIP ? { y: [0, -3, 0] } : {}}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
                        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 relative"
                        style={{
                          background: `${perk.color}10`,
                          border: `1px solid ${perk.color}${isVIP ? '25' : '08'}`,
                          boxShadow: isVIP ? `0 0 15px ${perk.color}15` : 'none',
                        }}
                      >
                        <span style={{ color: isVIP ? perk.color : '#333' }}>{perk.icon}</span>
                      </motion.div>
                      <p className="font-ninja text-lg mb-0.5" style={{ color: isVIP ? perk.color : '#333' }}>{perk.title}</p>
                      <p className="font-ninja text-[8px] tracking-wider" style={{ color: isVIP ? `${perk.color}80` : '#333' }}>{perk.sub}</p>
                      <p className="font-body text-[9px] text-gray-600 mt-1">{perk.desc}</p>

                      {/* Status badge */}
                      <div className="absolute top-2 right-2">
                        {isVIP ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: `${perk.color}20`, border: `1px solid ${perk.color}30` }}>
                            <Check size={10} style={{ color: perk.color }} />
                          </div>
                        ) : (
                          <Lock size={10} className="text-gray-800" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* ══════════════════ DAILY GIFT (VIP) ══════════════════ */}
              {isVIP && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="rounded-xl overflow-hidden relative"
                  style={{
                    border: `1px solid ${inviteUsedToday ? 'rgba(80,80,80,0.1)' : `${GREEN}18`}`,
                    background: inviteUsedToday ? 'rgba(20,20,25,0.5)' : `linear-gradient(135deg, ${GREEN}03, ${PURPLE}02)`,
                  }}
                >
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={inviteUsedToday ? {} : { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{
                          background: inviteUsedToday ? 'rgba(80,80,80,0.05)' : `${GREEN}08`,
                          border: `1px solid ${inviteUsedToday ? 'rgba(80,80,80,0.1)' : `${GREEN}22`}`,
                          boxShadow: inviteUsedToday ? 'none' : `0 0 15px ${GREEN}10`,
                        }}
                      >
                        <Gift size={22} style={{ color: inviteUsedToday ? '#444' : GREEN }} />
                      </motion.div>
                      <div>
                        <p className="font-ninja text-sm flex items-center gap-2" style={{ color: inviteUsedToday ? '#555' : GREEN }}>
                          DAILY GIFT
                          {inviteUsedToday && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(80,80,80,0.2)', color: '#555' }}>USED</span>
                          )}
                        </p>
                        <p className="font-body text-[10px] text-gray-600">
                          Send <span style={{ color: inviteUsedToday ? '#555' : GREEN }}>30 min</span> or <span style={{ color: inviteUsedToday ? '#555' : GOLD }}>50 coins</span> to a friend
                        </p>
                      </div>
                    </div>
                    <motion.button
                      whileHover={inviteUsedToday ? {} : { scale: 1.05 }}
                      whileTap={inviteUsedToday ? {} : { scale: 0.95 }}
                      onClick={() => !inviteUsedToday && setShowInviteModal(true)}
                      disabled={inviteUsedToday}
                      className="px-5 py-2.5 rounded-xl font-ninja text-[11px] flex items-center gap-1.5 disabled:opacity-30"
                      style={inviteUsedToday ? { background: 'rgba(40,40,40,0.2)', color: '#444' } : {
                        background: `linear-gradient(135deg, ${GREEN}12, ${GREEN}06)`,
                        color: GREEN,
                        border: `1px solid ${GREEN}25`,
                        boxShadow: `0 0 15px ${GREEN}10`,
                      }}
                    >
                      {inviteUsedToday ? <Check size={14} /> : <Send size={14} />}
                      {inviteUsedToday ? 'SENT' : 'SEND'}
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* ══════════════════ HOW TO GET VIP (non-VIP) ══════════════════ */}
              {!isVIP && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="rounded-xl p-6 relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${GREEN}03, ${PURPLE}02)`, border: `1px solid ${GREEN}12` }}
                >
                  <FloatingParticles color={`${GREEN}40`} count={8} />

                  <p className="font-ninja text-[10px] tracking-[0.2em] mb-5 relative z-10" style={{ color: `${GREEN}60` }}>HOW TO BECOME VIP</p>

                  <div className="grid grid-cols-3 gap-4 relative z-10">
                    {[
                      { n: '01', icon: <ShoppingBag size={20} />, text: 'Buy VIP Pass from Store', color: GREEN },
                      { n: '02', icon: <Gem size={20} />, text: 'It appears in your Inventory', color: BLUE },
                      { n: '03', icon: <Zap size={20} />, text: 'Activate and unleash power!', color: PURPLE },
                    ].map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 + i * 0.15 }}
                        className="rounded-xl p-4 text-center relative"
                        style={{
                          background: `${step.color}04`,
                          border: `1px solid ${step.color}12`,
                        }}
                      >
                        {/* Step number */}
                        <div className="absolute top-2 left-2">
                          <span className="font-ninja text-[10px]" style={{ color: `${step.color}30` }}>{step.n}</span>
                        </div>
                        {/* Connecting arrow */}
                        {i < 2 && (
                          <div className="absolute top-1/2 -right-3 z-10">
                            <ChevronRight size={14} style={{ color: `${GREEN}30` }} />
                          </div>
                        )}
                        <motion.div
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                          style={{ background: `${step.color}10`, border: `1px solid ${step.color}18` }}
                        >
                          <span style={{ color: `${step.color}70` }}>{step.icon}</span>
                        </motion.div>
                        <p className="font-body text-[10px] text-gray-500 leading-tight">{step.text}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Big CTA */}
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: `0 0 40px ${GREEN}30` }}
                    whileTap={{ scale: 0.98 }}
                    onClick={goToStore}
                    className="w-full mt-6 py-4 rounded-xl font-ninja text-base flex items-center justify-center gap-3 relative overflow-hidden z-10"
                    style={{
                      background: `linear-gradient(135deg, ${GREEN}, ${BLUE})`,
                      color: '#000',
                      boxShadow: `0 0 30px ${GREEN}25`,
                    }}
                  >
                    {/* Sweep shimmer */}
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      animate={{ x: ['-100%', '300%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', width: '30%' }}
                    />
                    <Crown size={20} />
                    BECOME VIP — {VIP_CONFIG.priceCoins.toLocaleString()} COINS
                  </motion.button>
                </motion.div>
              )}

              {/* ══════════════════ VIP STATS ══════════════════ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <h3 className="font-ninja text-[10px] tracking-[0.25em] mb-4 px-1" style={{ color: `${GREEN}60` }}>
                  VIP COMMUNITY
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: <Crown size={18} />, value: String(vipStats.totalVip), label: 'VIP MEMBERS', color: GREEN },
                    { icon: <Coins size={18} />, value: vipStats.totalSpent > 1000 ? `${(vipStats.totalSpent / 1000).toFixed(1)}K` : String(vipStats.totalSpent), label: 'TOTAL SPENT', color: GOLD },
                    { icon: <Clock size={18} />, value: `${vipStats.avgPlaytime}h`, label: 'AVG PLAYTIME', color: BLUE },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + i * 0.1 }}
                      className="rounded-xl p-4 text-center relative overflow-hidden"
                      style={{
                        background: `${stat.color}04`,
                        border: `1px solid ${stat.color}15`,
                      }}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-2"
                        style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}18` }}>
                        <span style={{ color: stat.color }}>{stat.icon}</span>
                      </div>
                      <p className="font-ninja text-xl" style={{ color: stat.color, textShadow: `0 0 15px ${stat.color}30` }}>{stat.value}</p>
                      <p className="font-ninja text-[7px] tracking-wider text-gray-600 mt-0.5">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* ══════════════════ VIP PLAYERS LIST ══════════════════ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="rounded-xl overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${GREEN}03, transparent)`,
                  border: `1px solid ${GREEN}10`,
                }}
              >
                <div className="px-5 py-3 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${GREEN}08` }}>
                  <div className="flex items-center gap-2">
                    <Crown size={14} style={{ color: GREEN }} />
                    <span className="font-ninja text-[10px] tracking-wider" style={{ color: `${GREEN}80` }}>VIP MEMBERS</span>
                  </div>
                  <span className="font-ninja text-[9px]" style={{ color: `${GREEN}40` }}>{vipPlayers.length} ACTIVE</span>
                </div>

                {vipPlayers.length === 0 ? (
                  <div className="py-8 text-center">
                    <Crown size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.06)' }} />
                    <p className="font-body text-[10px] text-gray-700">No VIP members yet</p>
                    <p className="font-body text-[9px] text-gray-800 mt-0.5">Be the first!</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: `${GREEN}06` }}>
                    {vipPlayers.slice(0, 8).map((vp: any, i) => {
                      const isCurrentPlayer = vp.uid === player.uid;
                      const vpDaysLeft = vp.vip?.expiresAt ? Math.max(0, Math.ceil((vp.vip.expiresAt - Date.now()) / 86400000)) : 0;
                      return (
                        <motion.div
                          key={vp.uid}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 1 + i * 0.06 }}
                          className="flex items-center gap-3 px-5 py-3 relative"
                          style={{
                            background: isCurrentPlayer ? `${GREEN}05` : 'transparent',
                          }}
                        >
                          {/* Rank */}
                          <span className="font-ninja text-[10px] w-5 text-center" style={{ color: i === 0 ? GOLD : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : `${GREEN}30` }}>
                            {i < 3 ? ['1', '2', '3'][i] : `${i + 1}`}
                          </span>

                          {/* Avatar circle */}
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${GREEN}15, ${PURPLE}10)`,
                              border: `1.5px solid ${isCurrentPlayer ? GREEN : GREEN + '25'}`,
                              boxShadow: isCurrentPlayer ? `0 0 8px ${GREEN}25` : 'none',
                            }}>
                            {vp.profilePhoto ? (
                              <img src={vp.profilePhoto} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-ninja text-[10px]" style={{ color: GREEN }}>{(vp.username || '?')[0]?.toUpperCase()}</span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-ninja text-[11px] truncate" style={{ color: isCurrentPlayer ? GREEN : '#ccc' }}>
                                {vp.username?.toUpperCase()}
                              </p>
                              {isCurrentPlayer && (
                                <span className="px-1 py-0.5 rounded text-[7px] font-ninja" style={{ background: `${GREEN}15`, color: GREEN, border: `1px solid ${GREEN}20` }}>YOU</span>
                              )}
                              {i === 0 && (
                                <Award size={10} style={{ color: GOLD }} />
                              )}
                            </div>
                            <p className="font-body text-[9px] text-gray-600">
                              Lvl {vp.level || 1} · {Math.round((vp.totalPlaytime || 0) / 60)}h played
                            </p>
                          </div>

                          {/* Days left */}
                          <div className="text-right flex-shrink-0">
                            <p className="font-ninja text-[9px]" style={{ color: vpDaysLeft <= 5 ? '#ff6b00' : `${GREEN}60` }}>
                              {vpDaysLeft}D
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                    {vipPlayers.length > 8 && (
                      <div className="px-5 py-2 text-center">
                        <span className="font-body text-[9px]" style={{ color: `${GREEN}30` }}>+{vipPlayers.length - 8} more VIP members</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>

              {/* ══════════════════ VIP EXCLUSIVE SKINS PREVIEW ══════════════════ */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="rounded-xl p-5 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${PURPLE}05, ${GREEN}03)`,
                  border: `1px solid ${PURPLE}15`,
                }}
              >
                <h3 className="font-ninja text-[10px] tracking-[0.25em] mb-4" style={{ color: `${PURPLE}90` }}>
                  VIP EXCLUSIVE SKINS
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'GOLD NINJA', tier: 'RARE', color: GOLD, gradient: `linear-gradient(135deg, ${GOLD}20, ${GOLD}08)` },
                    { name: 'DIAMOND NINJA', tier: 'EPIC', color: BLUE, gradient: `linear-gradient(135deg, ${BLUE}20, ${BLUE}08)` },
                    { name: 'PLATINUM NINJA', tier: 'LEGENDARY', color: '#E5E4E2', gradient: `linear-gradient(135deg, #E5E4E220, #E5E4E208)` },
                  ].map((skin, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 1.2 + i * 0.1 }}
                      whileHover={{ scale: 1.05, y: -3 }}
                      className="rounded-xl p-4 text-center relative group cursor-pointer"
                      style={{
                        background: skin.gradient,
                        border: `1px solid ${skin.color}20`,
                        boxShadow: `0 4px 15px ${skin.color}08`,
                      }}
                    >
                      {/* Glow on hover */}
                      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: `radial-gradient(circle, ${skin.color}15, transparent 70%)` }} />

                      <motion.div
                        animate={{ y: [0, -3, 0] }}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                        className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-2 relative"
                        style={{ background: `${skin.color}10`, border: `2px solid ${skin.color}25` }}
                      >
                        <Eye size={22} style={{ color: skin.color, filter: `drop-shadow(0 0 6px ${skin.color}50)` }} />
                        {!isVIP && (
                          <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                            <Lock size={14} style={{ color: skin.color }} />
                          </div>
                        )}
                      </motion.div>
                      <p className="font-ninja text-[10px] relative z-10" style={{ color: skin.color }}>{skin.name}</p>
                      <p className="font-ninja text-[7px] tracking-wider mt-0.5 relative z-10" style={{ color: `${skin.color}60` }}>{skin.tier}</p>
                    </motion.div>
                  ))}
                </div>
                {!isVIP && (
                  <p className="font-body text-[9px] text-gray-600 text-center mt-3">
                    Get VIP to unlock these exclusive skins
                  </p>
                )}
              </motion.div>

              {/* Footer */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3 }}
                className="font-body text-[9px] text-center py-2"
                style={{ color: 'rgba(255,255,255,0.15)' }}
              >
                {VIP_CONFIG.priceCoins.toLocaleString()} coins · 30 days · {VIP_CONFIG.cafeDiscountPercent}% cafe discount · exclusive skins · daily gifts
              </motion.p>
            </div>
      </div>

      {/* ══════════════════ INVITE MODAL ══════════════════ */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)' }}
            onClick={() => setShowInviteModal(false)}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="rounded-2xl p-6 w-[400px] max-w-[90%] relative overflow-hidden"
              style={{
                background: `linear-gradient(180deg, #0c1020 0%, ${DARK_BG} 100%)`,
                border: `1px solid ${GREEN}18`,
                boxShadow: `0 30px 80px rgba(0,0,0,0.9), 0 0 40px ${GREEN}08`,
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${GREEN}60, ${BLUE}40, transparent)` }} />

              <div className="flex items-center justify-between mb-5">
                <h3 className="font-ninja text-lg flex items-center gap-2" style={{ color: GREEN, textShadow: `0 0 20px ${GREEN}40` }}>
                  <Gift size={20} /> SEND GIFT
                </h3>
                <button onClick={() => setShowInviteModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <p className="font-body text-xs text-gray-500 mb-4">Choose a gift for your friend:</p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {([
                  { id: 'time' as const, icon: <Timer size={26} />, val: '30', unit: 'MIN', sub: 'Free Play', color: GREEN },
                  { id: 'coins' as const, icon: <Coins size={26} />, val: '50', unit: 'COINS', sub: 'Bonus', color: GOLD },
                ]).map(opt => {
                  const sel = inviteChoice === opt.id;
                  return (
                    <motion.button key={opt.id} whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
                      onClick={() => setInviteChoice(opt.id)}
                      className="rounded-xl p-5 text-center relative overflow-hidden"
                      style={{
                        background: sel ? `${opt.color}08` : 'rgba(255,255,255,0.01)',
                        border: sel ? `2px solid ${opt.color}40` : '2px solid rgba(255,255,255,0.05)',
                        boxShadow: sel ? `0 0 25px ${opt.color}15` : 'none',
                      }}
                    >
                      {sel && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: opt.color }}
                        >
                          <Check size={10} className="text-black" />
                        </motion.div>
                      )}
                      <motion.div
                        animate={sel ? { y: [0, -3, 0] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-14 h-14 rounded-xl mx-auto mb-3 flex items-center justify-center"
                        style={{ background: `${opt.color}10`, border: `1px solid ${opt.color}20` }}
                      >
                        <span style={{ color: sel ? opt.color : '#444' }}>{opt.icon}</span>
                      </motion.div>
                      <p className="font-ninja text-3xl" style={{ color: sel ? opt.color : '#444' }}>{opt.val}</p>
                      <p className="font-ninja text-[8px] tracking-wider" style={{ color: sel ? `${opt.color}70` : '#333' }}>{opt.unit}</p>
                      <p className="font-body text-[9px] text-gray-600 mt-0.5">{opt.sub}</p>
                    </motion.button>
                  );
                })}
              </div>

              <input type="text" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="Friend's username" onKeyDown={(e) => e.key === 'Enter' && handleDailyInvite()}
                className="w-full rounded-xl px-4 py-3.5 text-sm text-white font-body mb-3 focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${GREEN}15`,
                  colorScheme: 'dark',
                }}
              />

              {inviteMsg && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`text-xs font-body mb-3 ${inviteMsg.includes('Sent') ? '' : 'text-red-400'}`}
                  style={inviteMsg.includes('Sent') ? { color: GREEN } : {}}
                >{inviteMsg}</motion.p>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDailyInvite}
                disabled={inviteLoading || !inviteUsername.trim()}
                className="w-full py-3.5 rounded-xl font-ninja text-sm flex items-center justify-center gap-2 disabled:opacity-30 relative overflow-hidden"
                style={{
                  background: inviteChoice === 'time'
                    ? `linear-gradient(135deg, ${GREEN}, ${BLUE})`
                    : `linear-gradient(135deg, ${GOLD}, #FF8C00)`,
                  color: '#000',
                  boxShadow: `0 0 20px ${inviteChoice === 'time' ? GREEN : GOLD}25`,
                }}
              >
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
