'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Lang, t } from '@/lib/translations';
import {
  ArrowLeft, UserPlus, Phone, KeyRound, ShieldCheck,
  Loader2, Zap, ChevronLeft, ChevronRight, User as UserIcon
} from 'lucide-react';
import Image from 'next/image';

interface Props {
  lang: Lang;
  onBack: () => void;
  onRegistered: (player: any) => void;
}

const NINJA_OPTIONS = [
  { id: 'neon', name: 'Neon', color: '#39FF14' },
  { id: 'fire', name: 'Fire', color: '#FF4500' },
  { id: 'ice', name: 'Ice', color: '#00BFFF' },
  { id: 'shadow', name: 'Shadow', color: '#1a1a2e' },
  { id: 'cyber', name: 'Cyber', color: '#9B59B6' },
] as const;

const COUNTRY_NINJAS = [
  { id: 'jordan',    name: 'Jordan',    flag: '🇯🇴', img: '/ninjas/profiles/jordan-ninja-profile-photo.png' },
  { id: 'saudi',     name: 'Saudi',     flag: '🇸🇦', img: '/ninjas/profiles/saudi-ninja-profile-photo.png' },
  { id: 'egypt',     name: 'Egypt',     flag: '🇪🇬', img: '/ninjas/profiles/egypt-ninja-profile-photo.png' },
  { id: 'uae',       name: 'UAE',       flag: '🇦🇪', img: '/ninjas/profiles/uae-ninja-profile-photo.png' },
  { id: 'palestine', name: 'Palestine', flag: '🇵🇸', img: '/ninjas/profiles/palestine-ninja-profile-photo.png' },
  { id: 'iraq',      name: 'Iraq',      flag: '🇮🇶', img: '/ninjas/profiles/iraq-ninja-profile-photo.png' },
  { id: 'lebanon',   name: 'Lebanon',   flag: '🇱🇧', img: '/ninjas/profiles/lebanon-ninja-profile-photo.png' },
  { id: 'kuwait',    name: 'Kuwait',    flag: '🇰🇼', img: '/ninjas/profiles/kuwait-ninja-profile-picture.png' },
  { id: 'morroco',   name: 'Morocco',   flag: '🇲🇦', img: '/ninjas/profiles/morroco-ninja-profile-picture.png' },
  { id: 'qatar',     name: 'Qatar',     flag: '🇶🇦', img: '/ninjas/profiles/qatar-ninja-profile-photo.png' },
  { id: 'syrian',    name: 'Syria',     flag: '🇸🇾', img: '/ninjas/profiles/syrian-ninja-profile-photo.png' },
  { id: 'oman',      name: 'Oman',      flag: '🇴🇲', img: '/ninjas/profiles/oman-ninja-profile-photo.png' },
  { id: 'libya',     name: 'Libya',     flag: '🇱🇾', img: '/ninjas/profiles/libya-ninja-profile-photo.png' },
  { id: 'yemen',     name: 'Yemen',     flag: '🇾🇪', img: '/ninjas/profiles/yemen-ninja-profile-photo.png' },
  { id: 'bahrain',   name: 'Bahrain',   flag: '🇧🇭', img: '/ninjas/profiles/bahrain-ninja-profile-photo.png' },
  { id: 'tunisia',   name: 'Tunisia',   flag: '🇹🇳', img: '/ninjas/profiles/tunisia-ninja-profile-photo.png' },
  { id: 'algerian',  name: 'Algeria',   flag: '🇩🇿', img: '/ninjas/profiles/algerian-ninja-profile-photo.png' },
];

const STARTER_NINJAS_MOBILE = [
  { id: 'neon',    name: 'Neon',    color: '#39FF14', img: '/ninjas/profiles/neon-ninja-profile-photo.png' },
  { id: 'fire',    name: 'Fire',    color: '#FF4500', img: '/ninjas/profiles/fire-ninja-profile-photo.png' },
  { id: 'ice',     name: 'Ice',     color: '#00BFFF', img: '/ninjas/profiles/ice-ninja-profile-photo.png' },
  { id: 'shadow',  name: 'Shadow',  color: '#8B00FF', img: '/ninjas/profiles/shadow-ninja-profile-photo.png' },
  { id: 'cyber',   name: 'Cyber',   color: '#9B59B6', img: '/ninjas/profiles/cyber-ninja-profile-photo.png' },
  { id: 'phantom', name: 'Phantom', color: '#708090', img: '/ninjas/profiles/phantom-ninja-profile-photo.png' },
  { id: 'storm',   name: 'Storm',   color: '#4169E1', img: '/ninjas/profiles/storm-ninja-profile-photo.png' },
  { id: 'sakura',  name: 'Sakura',  color: '#FF69B4', img: '/ninjas/profiles/sakura-ninja-profile-photo.png' },
];

type NinjaId = (typeof NINJA_OPTIONS)[number]['id'];

// Jordan phone validation
const formatJordanPhone = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('962')) digits = digits;
  else if (digits.startsWith('0')) digits = '962' + digits.slice(1);
  else if (digits.startsWith('7')) digits = '962' + digits;
  digits = digits.slice(0, 12);
  if (digits.length <= 3) return '+' + digits;
  if (digits.length <= 4) return '+' + digits.slice(0, 3) + ' ' + digits.slice(3);
  if (digits.length <= 7) return '+' + digits.slice(0, 3) + ' ' + digits.slice(3, 4) + ' ' + digits.slice(4);
  return '+' + digits.slice(0, 3) + ' ' + digits.slice(3, 4) + ' ' + digits.slice(4, 8) + ' ' + digits.slice(8);
};

export function MobileRegister({ lang, onBack, onRegistered }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedCountryNinja, setSelectedCountryNinja] = useState('jordan');
  const [selectedStarterNinja, setSelectedStarterNinja] = useState('neon');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('+962 ');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedNinja, setSelectedNinja] = useState<NinjaId>('neon');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedIdx = NINJA_OPTIONS.findIndex((n) => n.id === selectedNinja);

  const handleNext = async () => {
    setError('');
    if (!username || !phone || !pin || !confirmPin) {
      setError(t(lang, 'fill_all') || 'Please fill all fields');
      return;
    }
    if (pin.length < 1 || pin.length > 400) {
      setError(lang === 'ar' ? 'الرمز يجب أن يكون من 1 إلى 400 حرف' : 'PIN must be 1-400 characters');
      return;
    }
    if (pin !== confirmPin) {
      setError(t(lang, 'pin_mismatch') || 'PINs do not match');
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'players'), where('username', '==', username.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError(t(lang, 'username_taken') || 'Username already taken');
        setLoading(false);
        return;
      }
      setStep(2);
    } catch {
      setError(t(lang, 'connection_error') || 'Connection error');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const playerData = {
        username: username.toLowerCase(),
        phone: phone.replace(/\s/g, ''),
        pin,
        ninjaType: selectedNinja,
        coins: 100,
        totalPlaytime: 0,
        xp: 0,
        level: 1,
        activeTitle: 'Newcomer',
        inventory: [] as string[],
        friends: [] as string[],
        banned: false,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        ownedNinjas: [selectedCountryNinja, selectedStarterNinja],
        equippedNinja: selectedStarterNinja,
        vip: {
          active: true,
          startedAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          trialUsed: true,
          tier: 'basic',
        },
      };

      const docRef = await addDoc(collection(db, 'players'), playerData);
      onRegistered({ uid: docRef.id, ...playerData });
    } catch {
      setError(t(lang, 'registration_failed') || 'Registration failed. Try again.');
    }
    setLoading(false);
  };

  const cycleNinja = (dir: number) => {
    const next = (selectedIdx + dir + NINJA_OPTIONS.length) % NINJA_OPTIONS.length;
    setSelectedNinja(NINJA_OPTIONS[next].id);
  };

  const currentNinja = NINJA_OPTIONS[selectedIdx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-[100dvh] flex flex-col bg-black/80 px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={step === 1 ? onBack : step === 2 ? () => setStep(1) : step === 3 ? () => setStep(2) : () => setStep(3)}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-white/70" />
        </motion.button>
        <div>
          <h1 className="font-ninja text-xl tracking-wider bg-gradient-to-r from-[#39FF14] to-cyan-400 bg-clip-text text-transparent">
            {t(lang, 'create_account') || 'CREATE ACCOUNT'}
          </h1>
          <p className="font-body text-[11px] text-gray-500">
            {lang === 'ar'
              ? (step === 1 ? 'الخطوة 1 من 4 — معلوماتك' : step === 2 ? 'الخطوة 2 من 4 — نينجا الدولة' : step === 3 ? 'الخطوة 3 من 4 — نينجا البداية' : 'الخطوة 4 من 4 — نوع النينجا')
              : (step === 1 ? 'Step 1 of 4 — Your Info' : step === 2 ? 'Step 2 of 4 — Country Ninja' : step === 3 ? 'Step 3 of 4 — Starter Ninja' : 'Step 4 of 4 — Ninja Type')}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-5">
        <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-[#39FF14]' : 'bg-white/10'}`} />
        <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-[#39FF14]' : 'bg-white/10'}`} />
        <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 3 ? 'bg-[#39FF14]' : 'bg-white/10'}`} />
        <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 4 ? 'bg-[#39FF14]' : 'bg-white/10'}`} />
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="flex-1 flex flex-col"
          >
            {/* Form card */}
            <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] p-5 space-y-4">
              {/* Username */}
              <div>
                <label className="text-gray-400 text-xs font-body mb-1.5 flex items-center gap-1.5">
                  <UserIcon size={11} className="text-[#39FF14]" />
                  {t(lang, 'username') || 'USERNAME'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, ''))}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-body text-base focus:border-[#39FF14]/50 outline-none transition-all focus:shadow-[0_0_15px_rgba(57,255,20,0.1)]"
                  placeholder={t(lang, 'choose_username') || 'Choose a username'}
                  maxLength={20}
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="text-gray-400 text-xs font-body mb-1.5 flex items-center gap-1.5">
                  <Phone size={11} className="text-[#39FF14]" />
                  {t(lang, 'phone') || 'PHONE NUMBER'}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatJordanPhone(e.target.value))}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-body text-base focus:border-[#39FF14]/50 outline-none transition-all focus:shadow-[0_0_15px_rgba(57,255,20,0.1)]"
                  placeholder="+962 7X XXXX XXX"
                />
              </div>

              {/* PIN fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs font-body mb-1.5 flex items-center gap-1.5">
                    <KeyRound size={11} className="text-[#39FF14]" />
                    {t(lang, 'create_pin') || 'PIN (6 digits)'}
                  </label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.slice(0, 400))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-body text-base tracking-[0.2em] text-center focus:border-[#39FF14]/50 outline-none transition-all"
                    placeholder={lang === 'ar' ? 'رمز PIN' : 'PIN'}
                    maxLength={400}
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs font-body mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck size={11} className="text-[#39FF14]" />
                    {t(lang, 'confirm_pin') || 'CONFIRM PIN'}
                  </label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.slice(0, 400))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-white font-body text-base tracking-[0.2em] text-center focus:border-[#39FF14]/50 outline-none transition-all"
                    placeholder={lang === 'ar' ? 'تأكيد' : 'Confirm'}
                    maxLength={400}
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-400 text-center text-sm font-body mt-3"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Next button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-ninja font-bold text-base bg-[#39FF14] text-black disabled:opacity-50 flex items-center justify-center gap-2 mb-6 mt-4"
              style={{ boxShadow: '0 0 30px rgba(57,255,20,0.2)' }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>{t(lang, 'next') || 'NEXT'}</>
              )}
            </motion.button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2-country"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="flex-1 flex flex-col"
          >
            <p className="font-ninja text-sm text-white/60 mb-4 text-center tracking-wider">{lang === 'ar' ? 'اختر نينجا دولتك' : 'CHOOSE YOUR COUNTRY NINJA'}</p>
            <div className="grid grid-cols-3 gap-3 overflow-y-auto flex-1 pb-2">
              {COUNTRY_NINJAS.map((ninja) => {
                const isSelected = selectedCountryNinja === ninja.id;
                return (
                  <button
                    key={ninja.id}
                    onClick={() => setSelectedCountryNinja(ninja.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95"
                    style={isSelected
                      ? { borderColor: '#39FF14', background: 'rgba(57,255,20,0.08)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }
                    }
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2" style={{ borderColor: isSelected ? '#39FF14' : 'rgba(255,255,255,0.1)' }}>
                      <img src={ninja.img} alt={ninja.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-lg">{ninja.flag}</span>
                    <span className={`font-body text-[10px] ${isSelected ? 'text-[#39FF14]' : 'text-white/50'}`}>{ninja.name}</span>
                  </button>
                );
              })}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setStep(3)}
              className="w-full py-3.5 rounded-2xl font-ninja font-bold text-base bg-[#39FF14] text-black mt-4 mb-6"
              style={{ boxShadow: '0 0 30px rgba(57,255,20,0.2)' }}
            >
              {lang === 'ar' ? '→ التالي' : 'NEXT →'}
            </motion.button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3-starter"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="flex-1 flex flex-col"
          >
            <p className="font-ninja text-sm text-white/60 mb-4 text-center tracking-wider">{lang === 'ar' ? 'اختر نينجا البداية' : 'CHOOSE YOUR STARTER NINJA'}</p>
            <div className="grid grid-cols-2 gap-3 flex-1">
              {STARTER_NINJAS_MOBILE.map((ninja) => {
                const isSelected = selectedStarterNinja === ninja.id;
                return (
                  <button
                    key={ninja.id}
                    onClick={() => setSelectedStarterNinja(ninja.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95"
                    style={isSelected
                      ? { borderColor: ninja.color, background: `${ninja.color}10` }
                      : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }
                    }
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2" style={{ borderColor: isSelected ? ninja.color : 'rgba(255,255,255,0.1)' }}>
                      <img src={ninja.img} alt={ninja.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="font-ninja text-sm" style={{ color: isSelected ? ninja.color : 'rgba(255,255,255,0.5)' }}>{ninja.name.toUpperCase()}</span>
                    {isSelected && <span className="text-[9px] font-ninja text-black px-2 py-0.5 rounded-full" style={{ background: ninja.color }}>{lang === 'ar' ? 'مختار' : 'SELECTED'}</span>}
                  </button>
                );
              })}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setStep(4)}
              className="w-full py-3.5 rounded-2xl font-ninja font-bold text-base text-black mt-4 mb-6"
              style={{
                background: `linear-gradient(135deg, ${STARTER_NINJAS_MOBILE.find(n => n.id === selectedStarterNinja)?.color || '#39FF14'}, ${STARTER_NINJAS_MOBILE.find(n => n.id === selectedStarterNinja)?.color || '#39FF14'}CC)`,
                boxShadow: `0 0 30px ${STARTER_NINJAS_MOBILE.find(n => n.id === selectedStarterNinja)?.color || '#39FF14'}30`,
              }}
            >
              {lang === 'ar' ? '→ التالي' : 'NEXT →'}
            </motion.button>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="flex-1 flex flex-col"
          >
            {/* Ninja selector card */}
            <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] p-5 flex-1 flex flex-col items-center">
              <p className="font-ninja text-lg tracking-wider text-white/80 mb-4">
                {t(lang, 'choose_ninja') || 'Choose Your Ninja'}
              </p>

              {/* Ninja display */}
              <div className="relative flex items-center justify-center w-full my-4">
                {/* Left arrow */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => cycleNinja(-1)}
                  className="absolute left-0 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
                >
                  <ChevronLeft size={20} className="text-white/60" />
                </motion.button>

                {/* Ninja image */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedNinja}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="relative w-44 h-44"
                  >
                    {/* Glow behind */}
                    <div
                      className="absolute inset-0 rounded-full blur-3xl opacity-30"
                      style={{ background: currentNinja.color }}
                    />
                    <Image
                      src={`/img/pfp-${selectedNinja}.png`}
                      alt={currentNinja.name}
                      width={176}
                      height={176}
                      className="relative z-10 w-full h-full object-contain drop-shadow-2xl"
                      style={{ filter: `drop-shadow(0 0 20px ${currentNinja.color}60)` }}
                    />
                  </motion.div>
                </AnimatePresence>

                {/* Right arrow */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => cycleNinja(1)}
                  className="absolute right-0 z-10 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
                >
                  <ChevronRight size={20} className="text-white/60" />
                </motion.button>
              </div>

              {/* Ninja name */}
              <AnimatePresence mode="wait">
                <motion.h2
                  key={selectedNinja}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="font-ninja text-2xl tracking-widest mb-2"
                  style={{
                    color: currentNinja.color,
                    textShadow: `0 0 15px ${currentNinja.color}80`,
                  }}
                >
                  {currentNinja.name.toUpperCase()}
                </motion.h2>
              </AnimatePresence>

              {/* Dot indicators */}
              <div className="flex gap-2.5 mt-2">
                {NINJA_OPTIONS.map((ninja) => (
                  <motion.button
                    key={ninja.id}
                    onClick={() => setSelectedNinja(ninja.id)}
                    className="w-3 h-3 rounded-full border border-white/10"
                    animate={{
                      backgroundColor: ninja.id === selectedNinja ? ninja.color : 'rgba(255,255,255,0.1)',
                      scale: ninja.id === selectedNinja ? 1.3 : 1,
                      boxShadow: ninja.id === selectedNinja ? `0 0 8px ${ninja.color}80` : '0 0 0 transparent',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  />
                ))}
              </div>

              {/* Ninja thumbnails row */}
              <div className="flex gap-3 mt-5">
                {NINJA_OPTIONS.map((ninja) => (
                  <motion.button
                    key={ninja.id}
                    onClick={() => setSelectedNinja(ninja.id)}
                    whileTap={{ scale: 0.9 }}
                    className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                      ninja.id === selectedNinja
                        ? 'border-[#39FF14] bg-white/10'
                        : 'border-white/5 bg-white/[0.02] opacity-50'
                    }`}
                  >
                    <Image
                      src={`/img/pfp-${ninja.id}.png`}
                      alt={ninja.name}
                      width={56}
                      height={56}
                      className="w-full h-full object-contain"
                    />
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-red-400 text-center text-sm font-body mt-3"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Register button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRegister}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-ninja font-bold text-base text-black disabled:opacity-50 flex items-center justify-center gap-2 mb-6 mt-4"
              style={{
                background: `linear-gradient(135deg, ${currentNinja.color}, ${currentNinja.color}CC)`,
                boxShadow: `0 0 30px ${currentNinja.color}30`,
                color: selectedNinja === 'shadow' ? '#fff' : '#000',
              }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Zap size={16} />
                  {t(lang, 'register_btn') || 'REGISTER'}
                </>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
