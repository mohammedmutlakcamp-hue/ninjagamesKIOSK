'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  doc, onSnapshot, updateDoc, arrayUnion, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAvatarSrcFromFields } from '@/lib/avatar';
import { Raffle, RaffleEntrant } from '@/lib/raffle';
import { ChestSlider, SliderItem } from './ChestSlider';
import {
  Ticket, Users, Coins, Trophy, X, Loader2, Gift, Clock, Star,
} from 'lucide-react';

interface Props {
  player: any;
  onClose: () => void;
}

type Phase = 'idle' | 'spinning' | 'reveal';

export function RafflePopup({ player, onClose }: Props) {
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sliderItems, setSliderItems] = useState<SliderItem[]>([]);
  const [sliderWinIdx, setSliderWinIdx] = useState(33);
  const lang: 'en' | 'ar' = typeof window !== 'undefined'
    ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en')
    : 'en';
  const ar = lang === 'ar';

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'raffles', 'current'), (snap) => {
      if (snap.exists()) {
        setRaffle(snap.data() as Raffle);
      } else {
        setRaffle(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const entrants = raffle?.entrants || [];
  const alreadyJoined = !!raffle && !!player?.uid && entrants.some((e) => e.uid === player.uid);
  const canAfford = (player?.coins || 0) >= (raffle?.entryCost || 0);

  // Detect draw transition → play roulette for everyone.
  useEffect(() => {
    if (!raffle || raffle.status !== 'drawn') {
      if (phase !== 'idle') setPhase('idle');
      return;
    }
    if (typeof raffle.winnerIndex !== 'number') return;
    if (phase === 'spinning' || phase === 'reveal') return;
    const items = buildPlayerSlider(entrants, raffle.winnerIndex);
    setSliderItems(items.items);
    setSliderWinIdx(items.index);
    setPhase('spinning');
  }, [raffle?.status, raffle?.winnerIndex, raffle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    if (!raffle || !player?.uid) return;
    if (joining) return;
    if (!raffle.active || raffle.status !== 'open') {
      setError(ar ? 'اليانصيب مغلق' : 'Raffle is closed');
      return;
    }
    if (alreadyJoined) {
      setError(ar ? 'أنت مشارك بالفعل' : 'You already joined');
      return;
    }
    if (!canAfford) {
      setError(ar ? 'توكنز غير كافية' : 'Not enough tokens');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      // Firestore rejects `undefined` inside arrayUnion payloads — the old
      // `profilePhoto: player.profilePhoto || undefined` shape caused every
      // join to fail with "invalid data" on accounts without a custom photo.
      // Build the entrant with only the fields that actually have values.
      const entrant: RaffleEntrant = {
        uid: player.uid,
        username: player.username || 'Player',
        joinedAt: Date.now(),
      };
      if (player.profilePhoto) entrant.profilePhoto = player.profilePhoto;
      if (player.ninjaType) entrant.ninjaType = player.ninjaType;

      // Deduct entry cost from player, then add to entrants.
      await updateDoc(doc(db, 'players', player.uid), {
        coins: increment(-raffle.entryCost),
        totalCoinsSpent: increment(raffle.entryCost),
      });
      await updateDoc(doc(db, 'raffles', 'current'), {
        entrants: arrayUnion(entrant),
      });
    } catch (err: any) {
      console.error('raffle join failed', err);
      setError(ar ? `فشل الانضمام: ${err?.message || ''}` : `Join failed: ${err?.message || 'unknown error'}`);
    }
    setJoining(false);
  };

  const playerWon = raffle?.status === 'drawn' && raffle.winnerUid === player?.uid;
  const winner: RaffleEntrant | null = (raffle && typeof raffle.winnerIndex === 'number')
    ? entrants[raffle.winnerIndex] || null
    : null;

  const handleSliderComplete = () => {
    setPhase('reveal');
  };

  const close = () => {
    if (phase === 'spinning') return; // don't let them close mid-spin
    onClose();
  };

  const rewardLabel = useMemo(() => {
    if (!raffle) return '';
    const r = raffle.reward;
    if (ar && r.nameAr) return r.nameAr;
    return r.name;
  }, [raffle, ar]);

  // ─────────────── Render ───────────────

  if (loading) {
    return (
      <Shell close={close}>
        <div className="py-20 flex items-center justify-center">
          <Loader2 size={28} className="text-yellow-400 animate-spin" />
        </div>
      </Shell>
    );
  }

  if (!raffle || !raffle.active) {
    return (
      <Shell close={close}>
        <div className="py-12 text-center px-6">
          <Ticket size={48} className="text-yellow-400/70 mx-auto mb-4" />
          <p className="font-ninja text-xl tracking-wider text-yellow-400 mb-2">
            {ar ? 'لا يوجد يانصيب الآن' : 'NO ACTIVE RAFFLE'}
          </p>
          <p className="font-body text-sm text-gray-400 mb-6">
            {ar ? 'تابع الشاشة — سيبدأ قريباً!' : 'Keep an eye out — the next one starts soon!'}
          </p>
          <button onClick={close}
            className="px-6 py-2.5 rounded-xl bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-ninja text-sm hover:bg-yellow-500/25">
            {ar ? 'إغلاق' : 'CLOSE'}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell close={close} wide={phase === 'spinning'}>
      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="text-center mb-5">
          <motion.div
            animate={{ rotate: phase === 'spinning' ? [0, 360] : 0 }}
            transition={{ duration: 1.4, repeat: phase === 'spinning' ? Infinity : 0, ease: 'linear' }}
            className="w-20 h-20 mx-auto mb-3 rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle, rgba(255,215,0,0.28) 0%, transparent 70%)',
              border: '2px solid rgba(255,215,0,0.55)',
              boxShadow: '0 0 30px rgba(255,215,0,0.35)',
            }}>
            <Trophy size={38} className="text-yellow-400" />
          </motion.div>
          <h2 className="font-ninja text-3xl tracking-widest"
            style={{
              background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
            {ar ? 'صندوق اليانصيب' : 'LOTTERY CHEST'}
          </h2>
          <p className="font-body text-xs text-gray-400 mt-1">
            {ar
              ? `الفائز واحد — الجائزة ${rewardLabel}`
              : `One winner takes — ${rewardLabel}`}
          </p>
        </div>

        {/* SPINNING — full-width roulette over player photos */}
        {phase === 'spinning' && sliderItems.length > 0 && (
          <div className="py-6">
            <ChestSlider
              items={sliderItems}
              winIndex={sliderWinIdx}
              accentColor="#FFD700"
              title={ar ? 'اختيار الفائز' : 'PICKING WINNER'}
              onComplete={handleSliderComplete}
              rarityColor={() => '#FFD700'}
              duration={6500}
            />
          </div>
        )}

        {/* REVEAL */}
        {phase === 'reveal' && winner && raffle && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            className="py-4 text-center"
          >
            <div className="relative w-36 h-36 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,215,0,0.5), transparent 70%)',
                }} />
              <img
                src={getAvatarSrcFromFields(winner.profilePhoto, winner.ninjaType)}
                alt={winner.username}
                className="relative w-36 h-36 rounded-full object-cover"
                style={{
                  border: '4px solid #FFD700',
                  boxShadow: '0 0 40px rgba(255,215,0,0.7)',
                }}
              />
              <motion.div
                className="absolute -top-2 -right-2 w-12 h-12 rounded-full flex items-center justify-center"
                animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ background: '#FFD700', boxShadow: '0 0 20px #FFD700' }}
              >
                <Trophy size={22} className="text-black" />
              </motion.div>
            </div>
            <p className="font-ninja text-3xl text-yellow-400 tracking-widest mb-1">
              {playerWon
                ? (ar ? 'لقد فزت! 🎉' : 'YOU WON! 🎉')
                : (ar ? `الفائز: ${winner.username}` : `WINNER: ${winner.username}`)}
            </p>
            <p className="font-body text-lg text-white mt-2">{rewardLabel}</p>
            {playerWon && (
              <p className="font-body text-xs text-yellow-300 mt-2">
                {ar ? 'أُضيفت الجائزة إلى حسابك.' : 'Reward has been credited to your account.'}
              </p>
            )}
            <button
              onClick={close}
              className="mt-6 px-8 py-3 rounded-xl font-ninja text-sm tracking-widest"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #B8860B)',
                color: '#000',
                boxShadow: '0 0 22px rgba(255,215,0,0.55)',
              }}
            >
              {ar ? 'إغلاق' : 'CLOSE'}
            </button>
          </motion.div>
        )}

        {/* IDLE — info, entrants list, join button */}
        {phase === 'idle' && (
          <>
            {/* Reward + entry cost + progress */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatCard
                label={ar ? 'الجائزة' : 'PRIZE'}
                value={rewardLabel}
                icon={<Gift size={16} />}
                accent="#FFD700"
              />
              <StatCard
                label={ar ? 'رسوم الدخول' : 'ENTRY'}
                value={`${raffle.entryCost} ${ar ? 'توكن' : 'T'}`}
                icon={<Coins size={16} />}
                accent="#fbbf24"
              />
              <StatCard
                label={ar ? 'اللاعبون' : 'PLAYERS'}
                value={`${entrants.length} / ${raffle.minPlayers}+`}
                icon={<Users size={16} />}
                accent={entrants.length >= raffle.minPlayers ? '#22c55e' : '#60a5fa'}
              />
            </div>

            {/* Entrants live grid */}
            <div className="bg-black/40 rounded-xl p-3 mb-4 border border-yellow-500/15">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-ninja text-yellow-500/80 tracking-widest">
                  {ar ? 'المشاركون' : 'ENTRANTS'}
                </p>
                {entrants.length >= raffle.minPlayers && (
                  <span className="text-[10px] font-ninja text-green-400 tracking-widest flex items-center gap-1">
                    <Star size={10} /> {ar ? 'جاهز للسحب' : 'READY TO DRAW'}
                  </span>
                )}
              </div>
              {entrants.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-6">
                  {ar ? 'لا يوجد مشاركون بعد — كن الأول!' : 'No entries yet — be first!'}
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto">
                  <AnimatePresence>
                    {entrants.map((e) => (
                      <motion.div
                        key={e.uid}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div
                          className="w-11 h-11 rounded-full overflow-hidden"
                          style={{
                            border: e.uid === player?.uid
                              ? '2px solid #FFD700'
                              : '2px solid rgba(255,215,0,0.3)',
                            boxShadow: e.uid === player?.uid
                              ? '0 0 12px rgba(255,215,0,0.5)' : 'none',
                          }}
                        >
                          <img
                            src={getAvatarSrcFromFields(e.profilePhoto, e.ninjaType)}
                            alt={e.username}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[9px] text-gray-300 font-body truncate w-full text-center">
                          {e.uid === player?.uid
                            ? (ar ? 'أنت' : 'YOU')
                            : e.username}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-3 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center">
                {error}
              </div>
            )}

            <motion.button
              whileHover={{ scale: alreadyJoined ? 1 : 1.02 }}
              whileTap={{ scale: alreadyJoined ? 1 : 0.98 }}
              onClick={join}
              disabled={joining || alreadyJoined || !canAfford}
              className="w-full py-4 rounded-xl font-ninja text-lg tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
              style={{
                background: alreadyJoined
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(22,163,74,0.15))'
                  : 'linear-gradient(135deg, #FFD700, #B8860B, #FFD700)',
                color: alreadyJoined ? '#4ade80' : '#000',
                border: alreadyJoined ? '1px solid rgba(34,197,94,0.4)' : 'none',
                boxShadow: alreadyJoined ? 'none' : '0 0 24px rgba(255,215,0,0.55)',
              }}
            >
              {joining ? (
                <Loader2 size={18} className="animate-spin" />
              ) : alreadyJoined ? (
                <>
                  <Star size={18} /> {ar ? 'أنت مشارك — بالتوفيق!' : "YOU'RE IN — GOOD LUCK!"}
                </>
              ) : (
                <>
                  <Ticket size={18} />{' '}
                  {ar ? `ادخل اليانصيب — ${raffle.entryCost} توكن` : `ENTER LOTTERY — ${raffle.entryCost} COINS`}
                </>
              )}
            </motion.button>
            <p className="text-[10px] text-gray-500 text-center mt-2">
              {ar
                ? `سيتم السحب عندما يشارك ${raffle.minPlayers} لاعب على الأقل.`
                : `Draw happens once ${raffle.minPlayers}+ players have joined.`}
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}

// ─── tiny helpers kept local so this file stays portable ───

function buildPlayerSlider(entrants: RaffleEntrant[], winnerIndex: number): { items: SliderItem[]; index: number } {
  if (entrants.length === 0) return { items: [], index: 0 };
  const TILES = 45;
  const WIN_AT = 33;
  const winner = entrants[winnerIndex] || entrants[0];
  const items: SliderItem[] = [];
  for (let i = 0; i < TILES; i++) {
    const pick = i === WIN_AT
      ? winner
      : entrants[Math.floor(Math.random() * entrants.length)];
    items.push(entrantToSlide(pick));
  }
  return { items, index: WIN_AT };
}

function entrantToSlide(e: RaffleEntrant): SliderItem {
  return {
    id: e.uid,
    name: e.username,
    rarity: 'legendary',
    color: '#FFD700',
    image: getAvatarSrcFromFields(e.profilePhoto, e.ninjaType),
  };
}

function StatCard({ label, value, icon, accent }: {
  label: string; value: string; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-center"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${accent}30`,
      }}>
      <div className="flex items-center justify-center gap-1.5 mb-0.5" style={{ color: accent }}>
        {icon}
        <p className="text-[9px] font-ninja tracking-widest" style={{ color: accent }}>{label}</p>
      </div>
      <p className="text-sm text-white font-body truncate">{value}</p>
    </div>
  );
}

function Shell({ children, close, wide }: { children: React.ReactNode; close: () => void; wide?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className={`relative ${wide ? 'w-[900px]' : 'w-[560px]'} max-w-[95vw] rounded-2xl overflow-hidden transition-[width] duration-300`}
        style={{
          background: 'linear-gradient(180deg, #0c0810 0%, #0a0a18 30%, #0c0810 100%)',
          border: '2px solid rgba(234,179,8,0.4)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.9), 0 0 40px rgba(234,179,8,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-4 h-4 z-10" style={{ borderTop: '2px solid #FFD700', borderLeft: '2px solid #FFD700' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 z-10" style={{ borderBottom: '2px solid #FFD700', borderRight: '2px solid #FFD700' }} />
        <div className="popup-close-shield gold" />
        <button onClick={close}
          className="absolute top-4 right-4 z-[95] w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ background: 'rgba(18,14,4,0.96)', border: '1px solid rgba(255,215,0,0.4)' }}>
          <X size={18} className="text-gray-300" />
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
