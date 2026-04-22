'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, updateDoc, increment, arrayUnion, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ticket, Coins, Clock, Gift, Sparkles, X, Trophy, Loader2 } from 'lucide-react';
import { loadLotteryConfig, pickLotteryReward, LotteryConfig, LotteryReward } from '@/lib/lottery';
import { ChestSlider, SliderItem } from './ChestSlider';

interface Props {
  player: any;
  onClose: () => void;
}

type Phase = 'idle' | 'spinning' | 'reveal';

export function LotteryPopup({ player, onClose }: Props) {
  const [config, setConfig] = useState<LotteryConfig | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<LotteryReward | null>(null);
  const [sliderItems, setSliderItems] = useState<SliderItem[]>([]);
  const [winIndex, setWinIndex] = useState(33);
  const [error, setError] = useState<string | null>(null);
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';

  useEffect(() => {
    loadLotteryConfig().then(setConfig);
  }, []);

  const totalWeight = config ? config.rewards.reduce((s, r) => s + Math.max(0, r.probability || 0), 0) : 0;

  const applyReward = async (r: LotteryReward) => {
    try {
      if (r.type === 'coins') {
        await updateDoc(doc(db, 'players', player.uid), { coins: increment(r.amount) });
      } else if (r.type === 'time_minutes') {
        await updateDoc(doc(db, 'players', player.uid), { remainingPlaytime: increment(r.amount) });
      } else if (r.type === 'voucher') {
        const voucher = {
          id: `voucher_lottery_${Date.now()}`,
          type: 'voucher',
          name: r.name,
          rarity: r.rarity || 'epic',
          obtainedAt: Date.now(),
          used: false,
        };
        const inventory = [...(player.inventory || []), voucher];
        await updateDoc(doc(db, 'players', player.uid), { inventory });
      } else if (r.type === 'skin' && r.skinPool && r.skinPool.length) {
        const pick = r.skinPool[Math.floor(Math.random() * r.skinPool.length)];
        await updateDoc(doc(db, 'players', player.uid), { ownedNinjas: arrayUnion(pick) });
      }
      // Audit: log every lottery spin so admin can see activity + average payouts.
      await addDoc(collection(db, 'lottery-spins'), {
        playerId: player.uid,
        playerName: player.username,
        rewardId: r.id,
        rewardName: r.name,
        rewardType: r.type,
        rewardAmount: r.amount,
        rarity: r.rarity || 'common',
        entryCost: config?.entryCost || 0,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('lottery reward apply failed', err);
    }
  };

  const rewardToSliderItem = (r: LotteryReward): SliderItem => ({
    id: r.id,
    name: r.name,
    rarity: r.rarity || 'common',
    color: r.color || rarityColor(r.rarity),
    icon:
      r.rarity === 'jackpot' ? <Trophy size={56} /> :
      r.type === 'coins' ? <Coins size={56} /> :
      r.type === 'time_minutes' ? <Clock size={56} /> :
      r.type === 'voucher' ? <Gift size={56} /> :
      <Sparkles size={56} />,
  });

  const buildSliderItems = (winner: LotteryReward): { items: SliderItem[]; index: number } => {
    const pool = config?.rewards || [];
    const TILES = 45;
    const WIN_AT = 33;
    const items: SliderItem[] = [];
    for (let i = 0; i < TILES; i++) {
      if (i === WIN_AT) {
        items.push(rewardToSliderItem(winner));
      } else {
        // Weighted-random padding so the strip looks honest.
        const pad = pickLotteryReward(pool) || winner;
        items.push(rewardToSliderItem(pad));
      }
    }
    return { items, index: WIN_AT };
  };

  const spin = async () => {
    if (!config || spinning || phase !== 'idle') return;
    if ((player.coins || 0) < config.entryCost) {
      setError(ar ? 'توكنز غير كافية!' : 'Not enough tokens!');
      return;
    }
    setError(null);
    setSpinning(true);

    // Deduct entry cost up front
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-config.entryCost),
        totalCoinsSpent: increment(config.entryCost),
      });
    } catch (err) {
      console.error('lottery entry cost deduct failed', err);
      setError(ar ? 'فشل الخصم.' : 'Deduction failed.');
      setSpinning(false);
      return;
    }

    const picked = pickLotteryReward(config.rewards);
    if (!picked) {
      setSpinning(false);
      return;
    }
    const { items, index } = buildSliderItems(picked);
    setResult(picked);
    setSliderItems(items);
    setWinIndex(index);
    setPhase('spinning');
  };

  const handleSliderComplete = async () => {
    if (result) await applyReward(result);
    setPhase('reveal');
    setSpinning(false);
  };

  const close = () => {
    if (spinning) return;
    onClose();
  };

  const rarityColor = (rarity?: string) => {
    switch (rarity) {
      case 'jackpot': return '#FFD700';
      case 'legendary': return '#ec4899';
      case 'epic': return '#a855f7';
      case 'rare': return '#3b82f6';
      default: return '#9ca3af';
    }
  };

  if (!config) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
        <Loader2 size={28} className="text-yellow-400 animate-spin" />
      </motion.div>
    );
  }

  if (!config.enabled) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={close}>
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-black border border-yellow-500/30 rounded-2xl p-8 max-w-md text-center" onClick={(e) => e.stopPropagation()}>
          <Ticket size={48} className="text-yellow-400 mx-auto mb-4" />
          <p className="font-ninja text-lg text-yellow-400 mb-2">{ar ? 'اليانصيب مغلق' : 'LOTTERY CLOSED'}</p>
          <p className="font-body text-sm text-gray-400">{ar ? 'عد لاحقاً!' : 'Check back later!'}</p>
          <button onClick={close} className="mt-5 px-6 py-2 rounded-xl bg-yellow-500 text-black font-ninja">{ar ? 'إغلاق' : 'CLOSE'}</button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className={`relative ${phase === 'spinning' ? 'w-[900px]' : 'w-[560px]'} max-w-[95vw] rounded-2xl overflow-hidden transition-[width] duration-300`}
        style={{
          background: 'linear-gradient(180deg, #0c0810 0%, #0a0a18 30%, #0c0810 100%)',
          border: '2px solid rgba(234,179,8,0.4)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(234,179,8,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HUD corners */}
        <div className="absolute top-0 left-0 w-4 h-4 z-10" style={{ borderTop: '2px solid #FFD700', borderLeft: '2px solid #FFD700' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 z-10" style={{ borderBottom: '2px solid #FFD700', borderRight: '2px solid #FFD700' }} />

        {/* Close */}
        {!spinning && (
          <><div className="popup-close-shield gold" />
          <button onClick={close}
            className="absolute top-4 right-4 z-[100] w-11 h-11 rounded-full flex items-center justify-center text-gray-400 hover:text-yellow-400 transition-all hover:rotate-90"
            style={{ background: 'transparent' }}>
            <X size={22} strokeWidth={2.6} />
          </button></>
        )}

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              animate={{ rotate: phase === 'spinning' ? [0, 360] : 0 }}
              transition={{ duration: phase === 'spinning' ? 1.5 : 0.6, repeat: phase === 'spinning' ? Infinity : 0, ease: 'linear' }}
              className="w-20 h-20 mx-auto mb-3 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(255,215,0,0.25) 0%, transparent 70%)',
                border: '2px solid rgba(255,215,0,0.5)',
                boxShadow: '0 0 30px rgba(255,215,0,0.3)',
              }}>
              <Ticket size={40} className="text-yellow-400" />
            </motion.div>
            <h2 className="font-ninja text-3xl tracking-widest mb-1"
              style={{
                background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
              {ar ? 'صندوق اليانصيب' : 'LOTTERY CHEST'}
            </h2>
            <p className="font-body text-xs text-gray-400">
              {ar ? `${config.entryCost} توكن للفة واحدة` : `${config.entryCost} tokens per spin`}
            </p>
          </div>

          {/* IDLE — show reward pool preview + spin button */}
          {phase === 'idle' && (
            <>
              <div className="bg-black/40 rounded-xl p-4 mb-5 border border-yellow-500/15 max-h-60 overflow-y-auto">
                <p className="text-[10px] font-ninja text-yellow-500/70 tracking-widest mb-2">{ar ? 'جدول المكافآت' : 'REWARD TABLE'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {config.rewards.map(r => {
                    const pct = totalWeight > 0 ? (r.probability / totalWeight) * 100 : 0;
                    return (
                      <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${rarityColor(r.rarity)}20` }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: rarityColor(r.rarity) }} />
                        <span className="text-xs text-gray-300 flex-1 truncate">{r.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
                  {error}
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={spin}
                disabled={(player.coins || 0) < config.entryCost}
                className="w-full py-4 rounded-xl font-ninja text-lg tracking-widest flex items-center justify-center gap-3 disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #FFD700, #B8860B, #FFD700)',
                  color: '#000',
                  boxShadow: '0 0 24px rgba(255,215,0,0.55)',
                }}
              >
                <Ticket size={20} /> {ar ? `لف بـ ${config.entryCost} توكن` : `SPIN FOR ${config.entryCost} COINS`}
              </motion.button>
            </>
          )}

          {/* SPINNING — CS:GO-style roulette */}
          {phase === 'spinning' && sliderItems.length > 0 && (
            <div className="py-6">
              <ChestSlider
                items={sliderItems}
                winIndex={winIndex}
                accentColor="#FFD700"
                title={ar ? 'يتم اللف' : 'LOTTERY SPIN'}
                onComplete={handleSliderComplete}
                rarityColor={rarityColor}
                duration={6000}
              />
            </div>
          )}

          {/* REVEAL */}
          {phase === 'reveal' && result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 14 }}
              className="py-6 text-center"
            >
              <motion.div
                className="w-28 h-28 mx-auto mb-4 rounded-2xl flex items-center justify-center relative"
                style={{
                  background: `radial-gradient(circle, ${rarityColor(result.rarity)}44 0%, transparent 70%)`,
                  border: `3px solid ${rarityColor(result.rarity)}`,
                  boxShadow: `0 0 40px ${rarityColor(result.rarity)}88`,
                }}
                animate={result.rarity === 'jackpot' ? { rotate: [0, -6, 6, 0] } : {}}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                {result.rarity === 'jackpot' ? <Trophy size={52} style={{ color: rarityColor(result.rarity) }} /> :
                 result.type === 'coins' ? <Coins size={48} style={{ color: rarityColor(result.rarity) }} /> :
                 result.type === 'time_minutes' ? <Clock size={48} style={{ color: rarityColor(result.rarity) }} /> :
                 result.type === 'voucher' ? <Gift size={48} style={{ color: rarityColor(result.rarity) }} /> :
                 <Sparkles size={48} style={{ color: rarityColor(result.rarity) }} />}
              </motion.div>
              <p className="font-ninja text-2xl tracking-wider mb-2" style={{ color: rarityColor(result.rarity) }}>
                {result.rarity === 'jackpot'
                  ? (ar ? '🎉 جاكبوت! 🎉' : '🎉 JACKPOT! 🎉')
                  : (ar ? 'لقد ربحت!' : 'YOU WON!')}
              </p>
              <p className="font-body text-3xl text-white font-semibold mb-2">
                {result.name}
              </p>
              {result.type === 'coins' && (
                <p className="font-ninja text-sm text-gray-400">
                  +{result.amount.toLocaleString()} {ar ? 'توكن' : 'coins'} {ar ? 'أضيفت إلى حسابك' : 'added to your balance'}
                </p>
              )}
              {result.type === 'time_minutes' && (
                <p className="font-ninja text-sm text-gray-400">
                  +{result.amount} {ar ? 'دقيقة لعب' : 'playtime minutes'}
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setPhase('idle'); setResult(null); }}
                  className="flex-1 py-3 rounded-xl bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-ninja text-sm hover:bg-yellow-500/25"
                >
                  {ar ? 'لف مرة أخرى' : 'SPIN AGAIN'}
                </button>
                <button
                  onClick={close}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-gray-300 border border-white/10 font-ninja text-sm hover:bg-white/10"
                >
                  {ar ? 'إغلاق' : 'CLOSE'}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
