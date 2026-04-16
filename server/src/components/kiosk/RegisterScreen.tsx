'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, doc, onSnapshot, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { REFERRAL_CONFIG } from '@/lib/constants';
import {
  UserPlus, Phone, KeyRound, ArrowLeft, ArrowRight,
  ShieldCheck, Zap, Loader2, User as UserIcon, ChevronDown, Search
} from 'lucide-react';
import { Lang, t } from '@/lib/translations';
import Image from 'next/image';
import { notifyAdmin } from '@/lib/notify-admin';

interface Props {
  onBack: () => void;
  onRegistered: (player: any) => void;
  lang?: Lang;
}

// Generic phone formatter — works for any country dial code
const formatPhoneForCountry = (input: string, dialCode: string): string => {
  let digits = input.replace(/\D/g, '');
  const dialDigits = dialCode.replace(/\D/g, '');
  // Strip the dial code if user typed it (we add it back)
  if (digits.startsWith(dialDigits)) digits = digits.slice(dialDigits.length);
  // Strip a leading 0 (common local-format prefix)
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Cap at 12 digits after the dial code
  digits = digits.slice(0, 12);
  return digits;
};

const isValidLocalPhone = (localDigits: string): boolean => {
  // 7-12 digits is a reasonable mobile number
  return localDigits.length >= 7 && localDigits.length <= 12;
};

// Country = ninja profile + flag SVG + dial code
const COUNTRY_NINJAS = [
  { id: 'jordan',    name: 'Jordan',    flagCode: 'jo', dialCode: '+962', img: '/ninjas/profiles/jordan-ninja-profile-photo.png' },
  { id: 'saudi',     name: 'Saudi',     flagCode: 'sa', dialCode: '+966', img: '/ninjas/profiles/saudi-ninja-profile-photo.png' },
  { id: 'egypt',     name: 'Egypt',     flagCode: 'eg', dialCode: '+20',  img: '/ninjas/profiles/egypt-ninja-profile-photo.png' },
  { id: 'uae',       name: 'UAE',       flagCode: 'ae', dialCode: '+971', img: '/ninjas/profiles/uae-ninja-profile-photo.png' },
  { id: 'palestine', name: 'Palestine', flagCode: 'ps', dialCode: '+970', img: '/ninjas/profiles/palestine-ninja-profile-photo.png' },
  { id: 'iraq',      name: 'Iraq',      flagCode: 'iq', dialCode: '+964', img: '/ninjas/profiles/iraq-ninja-profile-photo.png' },
  { id: 'lebanon',   name: 'Lebanon',   flagCode: 'lb', dialCode: '+961', img: '/ninjas/profiles/lebanon-ninja-profile-photo.png' },
  { id: 'kuwait',    name: 'Kuwait',    flagCode: 'kw', dialCode: '+965', img: '/ninjas/profiles/kuwait-ninja-profile-picture.png' },
  { id: 'morroco',   name: 'Morocco',   flagCode: 'ma', dialCode: '+212', img: '/ninjas/profiles/morroco-ninja-profile-picture.png' },
  { id: 'qatar',     name: 'Qatar',     flagCode: 'qa', dialCode: '+974', img: '/ninjas/profiles/qatar-ninja-profile-photo.png' },
  { id: 'syrian',    name: 'Syria',     flagCode: 'sy', dialCode: '+963', img: '/ninjas/profiles/syrian-ninja-profile-photo.png' },
  { id: 'oman',      name: 'Oman',      flagCode: 'om', dialCode: '+968', img: '/ninjas/profiles/oman-ninja-profile-photo.png' },
  { id: 'libya',     name: 'Libya',     flagCode: 'ly', dialCode: '+218', img: '/ninjas/profiles/libya-ninja-profile-photo.png' },
  { id: 'yemen',     name: 'Yemen',     flagCode: 'ye', dialCode: '+967', img: '/ninjas/profiles/yemen-ninja-profile-photo.png' },
  { id: 'bahrain',   name: 'Bahrain',   flagCode: 'bh', dialCode: '+973', img: '/ninjas/profiles/bahrain-ninja-profile-photo.png' },
  { id: 'tunisia',   name: 'Tunisia',   flagCode: 'tn', dialCode: '+216', img: '/ninjas/profiles/tunisia-ninja-profile-photo.png' },
  { id: 'algerian',  name: 'Algeria',   flagCode: 'dz', dialCode: '+213', img: '/ninjas/profiles/algerian-ninja-profile-photo.png' },
];

const STARTER_NINJAS = [
  { id: 'neon',    name: 'Neon',    color: '#39FF14', img: '/ninjas/profiles/neon-ninja-profile-photo.png' },
  { id: 'fire',    name: 'Fire',    color: '#FF4500', img: '/ninjas/profiles/fire-ninja-profile-photo.png' },
  { id: 'ice',     name: 'Ice',     color: '#00BFFF', img: '/ninjas/profiles/ice-ninja-profile-photo.png' },
  { id: 'shadow',  name: 'Shadow',  color: '#8B00FF', img: '/ninjas/profiles/shadow-ninja-profile-photo.png' },
  { id: 'cyber',   name: 'Cyber',   color: '#9B59B6', img: '/ninjas/profiles/cyber-ninja-profile-photo.png' },
  { id: 'phantom', name: 'Phantom', color: '#708090', img: '/ninjas/profiles/phantom-ninja-profile-photo.png' },
  { id: 'storm',   name: 'Storm',   color: '#4169E1', img: '/ninjas/profiles/storm-ninja-profile-photo.png' },
  { id: 'sakura',  name: 'Sakura',  color: '#FF69B4', img: '/ninjas/profiles/sakura-ninja-profile-photo.png' },
];

// ═══════════════════════════════════════════════════════════════
// Cyberpunk card wrapper — matches the login card design 1:1
// ═══════════════════════════════════════════════════════════════
function CyberpunkCard({ width = 460, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width, maxWidth: '92vw' }}>
      <div className="relative z-10 rounded-2xl p-8 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #000000 0%, #010204 20%, #02050a 50%, #010204 80%, #000000 100%)',
          border: '1.5px solid rgba(57,255,20,0.3)',
          boxShadow: '0 0 40px rgba(57,255,20,0.12), 0 25px 60px rgba(0,0,0,0.95), inset 0 0 50px rgba(0,0,0,0.85)',
        }}>
        {/* ═══ Animated sidebar-style background layers ═══ */}
        <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
        <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
          backgroundImage: 'linear-gradient(rgba(57,255,20,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2339FF14' stroke-width='0.5' opacity='0.06'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 52px',
        }} />
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 460 760" preserveAspectRatio="none">
          <path d="M0,80 L100,80 L130,60 L280,60 L310,80 L460,80" stroke="#39FF14" strokeWidth="0.8" fill="none" opacity="0.12" />
          <path d="M460,220 L300,220 L270,240 L140,240 L110,220 L0,220" stroke="#00c8ff" strokeWidth="0.7" fill="none" opacity="0.1" />
          <path d="M0,400 L120,400 L150,380 L300,380 L330,400 L460,400" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.08" />
          <path d="M460,560 L320,560 L290,580 L140,580 L110,560 L0,560" stroke="#a855f7" strokeWidth="0.5" fill="none" opacity="0.07" />
          <path d="M230,0 L230,60 L200,80 L200,220" stroke="#39FF14" strokeWidth="0.6" fill="none" opacity="0.09" />
          <circle cx="280" cy="60" r="2.5" fill="#39FF14" opacity="0.25" className="pcb-node-flash" />
          <circle cx="110" cy="240" r="2" fill="#00c8ff" opacity="0.2" className="pcb-node-flash2" />
          <circle cx="300" cy="380" r="2" fill="#39FF14" opacity="0.18" className="pcb-node-flash3" />
          <circle cx="140" cy="580" r="2" fill="#a855f7" opacity="0.15" className="pcb-node-flash" />
        </svg>
        {/* Data pulses */}
        <div className="absolute top-[80px] left-0 w-4 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14, 0 0 14px #39FF14' }} />
        <div className="absolute top-[400px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: '#00c8ff', boxShadow: '0 0 8px #00c8ff' }} />
        <div className="absolute top-0 left-[230px] w-[2px] h-3 rounded-full pcb-pulse-v z-0" style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }} />
        {/* Scanlines */}
        <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(57,255,20,0.3) 30%, rgba(0,200,255,0.2) 70%, transparent 100%)', boxShadow: '0 0 15px rgba(57,255,20,0.15)' }} />
        <div className="absolute left-0 right-0 h-[1px] pointer-events-none z-0 sidebar-scanline2" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 40%, rgba(0,200,255,0.15) 60%, transparent 100%)' }} />
        {/* Energy orbs */}
        <div className="absolute left-[12%] top-[15%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.6) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(57,255,20,0.4)' }} />
        <div className="absolute left-[75%] top-[45%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(0,200,255,0.35)' }} />
        <div className="absolute left-[35%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(168,85,247,0.3)' }} />
        {/* Radial glows */}
        <div className="absolute inset-0 pointer-events-none z-0" style={{
          background: 'radial-gradient(ellipse at 50% 5%, rgba(57,255,20,0.1) 0%, transparent 42%), radial-gradient(ellipse at 30% 50%, rgba(0,200,255,0.05) 0%, transparent 40%), radial-gradient(ellipse at 70% 90%, rgba(168,85,247,0.05) 0%, transparent 40%)',
        }} />
        {/* Neon edges */}
        <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.6), rgba(0,200,255,0.3), rgba(168,85,247,0.2), transparent)', boxShadow: '0 0 14px rgba(57,255,20,0.4)' }} />
        <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, #39FF14, #00c8ff, #a855f7, #00c8ff, #39FF14)', boxShadow: '0 0 8px rgba(57,255,20,0.3)' }} />
        <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-[1]" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.35), rgba(168,85,247,0.2), transparent)' }} />
        {/* HUD corners */}
        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
          <div key={ci} className={`absolute ${pos} w-6 h-6 z-[2] pointer-events-none`} style={{
            ...(pos.includes('top') ? { borderTop: `3px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderBottom: `3px solid ${ci === 2 ? '#00c8ff' : '#a855f7'}` }),
            ...(pos.includes('left') ? { borderLeft: `3px solid ${ci === 0 ? '#39FF14' : '#00c8ff'}` } : { borderRight: `3px solid ${ci === 1 ? '#00c8ff' : '#a855f7'}` }),
            filter: 'drop-shadow(0 0 6px currentColor)',
          }} />
        ))}
        {/* Content */}
        <div className="relative z-[5]">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Cyberpunk button — same style as login primary button
// ═══════════════════════════════════════════════════════════════
function CyberBtn({
  onClick, disabled, children, loading, icon, variant = 'primary',
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  loading?: boolean;
  icon?: React.ReactNode;
  variant?: 'primary' | 'ghost';
}) {
  const isPrimary = variant === 'primary';
  const glowColor = isPrimary ? 'rgba(57,255,20,0.55)' : 'rgba(148,163,184,0.3)';
  const borderColor = isPrimary ? 'rgba(57,255,20,0.55)' : 'rgba(148,163,184,0.35)';
  const textColor = isPrimary ? '#39FF14' : '#e2e8f0';
  const traceA = isPrimary ? '#39FF14' : '#94a3b8';
  const traceB = isPrimary ? '#00c8ff' : '#64748b';
  return (
    <motion.button
      whileHover="hover"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="group relative flex-1 h-[58px] rounded-xl font-bold text-[15px] tracking-wide disabled:opacity-50 flex items-center justify-center gap-2.5 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #0d1f14 0%, #06120a 100%)',
        border: `1px solid ${borderColor}`,
        boxShadow: `0 0 0 1px rgba(57,255,20,${isPrimary ? 0.15 : 0.05}) inset, 0 10px 24px -10px ${glowColor}, 0 4px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`,
        color: textColor,
      }}
    >
      {/* Sidebar layers */}
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-glow-breathe" />
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: `linear-gradient(rgba(57,255,20,${isPrimary ? 0.08 : 0.04}) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,${isPrimary ? 0.08 : 0.04}) 1px, transparent 1px)`,
        backgroundSize: '12px 12px',
      }} />
      {/* PCB traces */}
      <div className="absolute top-[6px] left-0 w-3 h-[2px] rounded-full pcb-pulse-h z-0" style={{ background: traceA, boxShadow: `0 0 8px ${traceA}` }} />
      <div className="absolute bottom-[6px] right-0 w-3 h-[2px] rounded-full pcb-pulse-h2 z-0" style={{ background: traceB, boxShadow: `0 0 8px ${traceB}` }} />
      {/* Scanline */}
      <div className="absolute left-0 right-0 h-[2px] pointer-events-none z-0 sidebar-scanline" style={{ background: `linear-gradient(90deg, transparent, ${traceA}66 50%, transparent)`, boxShadow: `0 0 10px ${traceA}40` }} />
      {/* Energy orb */}
      <div className="absolute left-[10%] top-[30%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: `radial-gradient(circle, ${traceA}b3 0%, transparent 70%)`, boxShadow: `0 0 8px ${traceA}80` }} />
      <div className="absolute right-[10%] top-[55%] w-1.5 h-1.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: `radial-gradient(circle, ${traceB}99 0%, transparent 70%)`, boxShadow: `0 0 8px ${traceB}66` }} />
      {/* HUD corners */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 pointer-events-none" style={{ borderColor: traceA, filter: `drop-shadow(0 0 4px ${traceA})` }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 pointer-events-none" style={{ borderColor: traceA, filter: `drop-shadow(0 0 4px ${traceA})` }} />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 pointer-events-none" style={{ borderColor: traceB, filter: `drop-shadow(0 0 4px ${traceB})` }} />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 pointer-events-none" style={{ borderColor: traceB, filter: `drop-shadow(0 0 4px ${traceB})` }} />
      {/* Hover shine sweep */}
      <motion.div
        variants={{ hover: { x: ['-120%', '220%'] } }}
        transition={{ duration: 0.85, ease: 'easeInOut' }}
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none z-[1]"
        style={{
          background: `linear-gradient(110deg, transparent 20%, ${traceA}59 50%, transparent 80%)`,
          filter: 'blur(6px)',
        }}
      />
      {/* Content */}
      {loading ? (
        <Loader2 size={18} className="animate-spin relative z-10" strokeWidth={2.8} style={{ filter: `drop-shadow(0 0 6px ${textColor}cc)` }} />
      ) : icon ? (
        <span className="relative z-10" style={{ filter: `drop-shadow(0 0 6px ${textColor}cc)` }}>{icon}</span>
      ) : null}
      <span className="relative z-10 font-ninja uppercase" style={{ textShadow: `0 0 10px ${textColor}b3` }}>
        {children}
      </span>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Cyberpunk text input — same style as login glass input
// ═══════════════════════════════════════════════════════════════
function CyberInput({
  type = 'text', value, onChange, placeholder, icon, maxLength, autoFocus, label, className = '', center = false,
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  maxLength?: number;
  autoFocus?: boolean;
  label?: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="font-mono text-[10px] tracking-[0.18em] text-ninja-green/70 uppercase mb-1.5 flex items-center gap-1.5">
          {label}
        </label>
      )}
      <div className="relative group">
        <div className="relative">
          {icon && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ninja-green/70 z-[2] pointer-events-none group-focus-within:text-ninja-green transition-colors"
              style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }}>
              {icon}
            </span>
          )}
          <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus={autoFocus}
            className={`relative w-full rounded-lg ${icon ? 'pl-11' : 'pl-4'} pr-4 py-3.5 text-white font-mono text-base outline-none transition-all z-[1] ${center ? 'text-center tracking-[0.4em]' : 'tracking-wider'} ${className}`}
            style={{
              background: 'rgba(8,12,18,0.7)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(57,255,20,0.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
            }}
          />
          {/* Animated bottom bar — grows from center on focus */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 group-focus-within:w-full transition-all duration-300 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)', boxShadow: '0 0 8px #39FF14' }}
          />
        </div>
      </div>
    </div>
  );
}

function CountryDropdown({ countries, selected, onSelect }: {
  countries: typeof COUNTRY_NINJAS; selected: string; onSelect: (id: string) => void;
}) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = countries.find(c => c.id === selected);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 50); }
  }, [open]);

  const filtered = search
    ? countries.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.dialCode.includes(search))
    : countries;

  return (
    <div className="mt-4 relative" ref={dropdownRef}>
      <label className="text-gray-400 font-mono text-[11px] tracking-[0.15em] mb-2 block uppercase">
        {ar ? 'البلد' : 'Country'}
      </label>
      <button type="button" onClick={() => setOpen(!open)}
        className={`group relative w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-sm font-body transition-all`}
        style={{
          background: 'rgba(8,12,18,0.7)',
          backdropFilter: 'blur(8px)',
          border: open ? '1px solid rgba(57,255,20,0.55)' : '1px solid rgba(57,255,20,0.2)',
          boxShadow: open
            ? 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(57,255,20,0.15)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
        }}>
        <div className="flex items-center gap-3">
          {current ? (
            <>
              <img src={`/img/flags/${current.flagCode}.svg`} alt={current.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              <span className="text-white font-medium">{current.name}</span>
              <span className="text-ninja-green/80 font-mono text-xs">{current.dialCode}</span>
            </>
          ) : (
            <span className="text-gray-500">{ar ? 'اختر البلد...' : 'Select country...'}</span>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className={open ? 'text-ninja-green' : 'text-gray-500'} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 rounded-xl overflow-hidden"
            style={{
              background: 'rgba(4,7,14,0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(57,255,20,0.35)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.7), 0 0 30px rgba(57,255,20,0.12)',
            }}>
            {/* Search */}
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(57,255,20,0.15)' }}>
                <Search size={14} className="text-ninja-green/60 flex-shrink-0" />
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={ar ? 'ابحث عن بلد أو رمز...' : 'Search country or dial code...'}
                  className="bg-transparent text-sm text-white font-body outline-none w-full placeholder:text-gray-600" />
              </div>
            </div>
            {/* Options */}
            <div className="max-h-[260px] overflow-y-auto px-1.5 pb-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(57,255,20,0.25) transparent' }}>
              {filtered.length === 0 ? (
                <p className="text-center text-gray-600 text-xs py-4 font-body">{ar ? 'لا توجد نتائج' : 'No results'}</p>
              ) : filtered.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { onSelect(c.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all ${
                    selected === c.id
                      ? 'bg-ninja-green/10 text-ninja-green'
                      : 'text-gray-300 hover:bg-white/[0.04] hover:text-white'
                  }`}>
                  <img src={`/img/flags/${c.flagCode}.svg`} alt={c.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  <span className="flex-1 text-left">{c.name}</span>
                  <span className="font-mono text-xs text-gray-500">{c.dialCode}</span>
                  {selected === c.id && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <div className="w-2 h-2 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px rgba(57,255,20,0.6)' }} />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RegisterScreen({ onBack, onRegistered, lang = 'en' }: Props) {
  const [step, setStep] = useState(1); // 1=info+country, 2=ninja picker, 3=approval
  const [selectedCountryNinja, setSelectedCountryNinja] = useState('jordan');
  const [selectedStarterNinja, setSelectedStarterNinja] = useState('neon');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  // Phone is stored as LOCAL digits only — the dial code is added at submit time
  // based on the selected country.
  const [phone, setPhone] = useState('');
  const selectedCountry = COUNTRY_NINJAS.find(c => c.id === selectedCountryNinja) || COUNTRY_NINJAS[0];
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [approvalCode, setApprovalCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  const ninjaType = selectedStarterNinja;

  const handleNext = async () => {
    if (!firstName || !lastName || !username || !phone || !pin) {
      setError(t(currentLang, 'fill_all_fields'));
      return;
    }
    if (!isValidLocalPhone(phone)) {
      setError(currentLang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number');
      return;
    }
    if (pin.length !== 6) {
      setError(t(currentLang, 'pin_must_be_4'));
      return;
    }
    if (pin !== confirmPin) {
      setError(t(currentLang, 'pins_dont_match'));
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'players'), where('username', '==', username.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setError(t(currentLang, 'username_taken'));
        setLoading(false);
        return;
      }
      setStep(2);
    } catch (err) {
      setError(t(currentLang, 'connection_error'));
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      // Generate a 6-digit approval code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setApprovalCode(code);

      // Create a pending registration in Firestore
      const pendingData = {
        firstName,
        lastName,
        username: username.toLowerCase(),
        phone: `${selectedCountry.dialCode}${phone}`,
        pin,
        ninjaType,
        ninjaColor: STARTER_NINJAS.find(n => n.id === selectedStarterNinja)?.color || '#39FF14',
        approvalCode: code,
        status: 'pending',
        createdAt: Date.now(),
      };

      const pendingRef = await addDoc(collection(db, 'pending-registrations'), pendingData);
      setPendingId(pendingRef.id);
      notifyAdmin('registration', 'New Registration', `${pendingData.username} wants to register`);
      setStep(3);

      // Listen for admin approval
      const unsub = onSnapshot(doc(db, 'pending-registrations', pendingRef.id), (snap) => {
        if (snap.exists() && snap.data().status === 'approved') {
          setApproved(true);
          unsub();
        }
      });
    } catch (err) {
      setError(t(currentLang, 'registration_failed'));
    }
    setLoading(false);
  };

  const handleCodeSubmit = async () => {
    if (codeInput !== approvalCode) {
      setError(t(currentLang, 'invalid_approval_code'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Check if referral code is valid
      // New players start with 0 coins — they must top up before playing.
      // Referral bonus (if any) is the only credit on the new account.
      let referrerId: string | null = null;
      const startCoins = 0;
      let bonusCoins = 0;
      if (referralCode.trim()) {
        const refQ = query(collection(db, 'players'), where('referralCode', '==', referralCode.trim().toUpperCase()));
        const refSnap = await getDocs(refQ);
        if (!refSnap.empty) {
          referrerId = refSnap.docs[0].id;
          bonusCoins = REFERRAL_CONFIG.newUserBonus;
        } else {
          setError(lang === 'ar' ? 'كود الإحالة غير صحيح' : 'Invalid referral code');
          setLoading(false);
          return;
        }
      }

      const genRefCode = username.toUpperCase().slice(0, 4) + String(Date.now()).slice(-4);

      const playerData = {
        firstName,
        lastName,
        username: username.toLowerCase(),
        phone: `${selectedCountry.dialCode}${phone}`,
        pin,
        coins: startCoins + bonusCoins,
        totalCoinsSpent: 0,
        totalPlaytime: 0,
        ninjaType,
        character: {
          skinColor: STARTER_NINJAS.find(n => n.id === selectedStarterNinja)?.color || '#39FF14',
          outfitId: 'outfit_default',
          maskId: 'mask_default',
          accessoryId: 'none',
          equippedSkins: [],
          ninjaType,
        },
        ownedNinjas: [selectedCountryNinja, selectedStarterNinja],
        equippedNinja: selectedStarterNinja,
        vip: { active: false },
        inventory: [],
        friends: [],
        titles: ['Newcomer'],
        activeTitle: 'Newcomer',
        stats: {
          totalKills: 0, totalDeaths: 0, totalHeadshots: 0, totalWins: 0,
          gamesPlayed: 0, chestsOpened: 0, foodOrdered: 0, longestStreak: 0,
          favoriteGame: '', gameStats: {},
        },
        onlineStatus: { isOnline: false, currentActivity: '', lastSeen: Date.now() },
        createdAt: Date.now(),
        lastLogin: Date.now(),
        banned: false,
        referralCode: genRefCode,
        referredBy: referrerId || null,
        bio: '',
        socialLinks: {},
        privacySettings: { inventoryVisibility: 'public', profileVisibility: 'public' },
        totalGiftsReceived: 0,
        gamePlaytime: {},
        country: selectedCountryNinja || '',
      };

      const docRef = await addDoc(collection(db, 'players'), playerData);

      // Give referrer their bonus
      if (referrerId) {
        try {
          await updateDoc(doc(db, 'players', referrerId), {
            coins: increment(REFERRAL_CONFIG.referrerBonus),
          });
        } catch {}
      }

      // Clean up pending registration
      if (pendingId) {
        try { await deleteDoc(doc(db, 'pending-registrations', pendingId)); } catch {}
      }

      onRegistered({ uid: docRef.id, ...playerData });
    } catch (err) {
      setError(t(currentLang, 'registration_failed'));
    }
    setLoading(false);
  };


  // Keyboard navigation — Enter on step 2 triggers register
  useEffect(() => {
    if (step !== 2) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.code === 'NumpadEnter')) handleRegister();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  // Get carousel positions for each ninja

  const currentLang = lang;

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className="min-h-screen flex items-center justify-center relative z-10"
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
    >
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
          <CyberpunkCard width={500}>
            {/* Header — matches login "SYSTEM ONLINE" pattern */}
            <div className="text-center mb-6">
              <div className="relative inline-block mb-3">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.15, 0.35] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'radial-gradient(circle, rgba(57,255,20,0.3) 0%, transparent 65%)',
                    filter: 'blur(12px)',
                  }}
                />
                <div className="relative w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(0,200,255,0.08))',
                    border: '1.5px solid rgba(57,255,20,0.45)',
                    boxShadow: '0 0 22px rgba(57,255,20,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}>
                  <UserPlus size={28} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.8))' }} />
                </div>
              </div>
              <h2 className="font-ninja text-2xl tracking-wider text-ninja-green" style={{ textShadow: '0 0 12px rgba(57,255,20,0.6)' }}>
                {t(currentLang, 'create_account')}
              </h2>
              {/* Terminal-style subtitle */}
              <div className="flex items-center justify-center gap-2 mt-2">
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-ninja-green"
                  style={{ boxShadow: '0 0 6px #39FF14' }}
                />
                <p className="font-mono text-[11px] tracking-[0.3em] text-ninja-green/80 uppercase" style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
                  STEP 1 / 3 · IDENTITY
                </p>
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: 0.7 }}
                  className="w-1.5 h-1.5 rounded-full bg-ninja-green"
                  style={{ boxShadow: '0 0 6px #39FF14' }}
                />
              </div>
            </div>

            {/* Section label */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.4))' }} />
              <span className="font-mono text-[10px] tracking-[0.3em] text-ninja-green/70">&gt; REGISTER</span>
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), transparent)' }} />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CyberInput
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF ]/g, ''))}
                  icon={<UserIcon size={16} strokeWidth={2.2} />}
                  placeholder={t(currentLang, 'first_name_placeholder')}
                  autoFocus
                  label={<><UserIcon size={11} /> {t(currentLang, 'first_name')}</>}
                />
                <CyberInput
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF ]/g, ''))}
                  icon={<UserIcon size={16} strokeWidth={2.2} />}
                  placeholder={t(currentLang, 'last_name_placeholder')}
                  label={<><UserIcon size={11} /> {t(currentLang, 'last_name')}</>}
                />
              </div>

              <CyberInput
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, ''))}
                icon={<UserPlus size={16} strokeWidth={2.2} />}
                placeholder={t(currentLang, 'choose_username')}
                maxLength={20}
                label={<><UserPlus size={11} /> {t(currentLang, 'username')}</>}
              />

              {/* Phone — flag prefix + local digits, matching CyberInput style */}
              <div>
                <label className="font-mono text-[10px] tracking-[0.18em] text-ninja-green/70 uppercase mb-1.5 flex items-center gap-1.5">
                  <Phone size={11} /> {t(currentLang, 'phone')}
                </label>
                <div className="relative group">
                  <div className="relative flex items-stretch rounded-lg overflow-hidden"
                    style={{
                      background: 'rgba(8,12,18,0.7)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(57,255,20,0.2)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
                    }}>
                    {/* Flag + dial code prefix */}
                    <div className="flex items-center gap-2 px-3 border-r border-ninja-green/20 flex-shrink-0">
                      <img src={`/img/flags/${selectedCountry.flagCode}.svg`} alt={selectedCountry.name}
                        className="w-6 h-6 rounded-full object-cover" />
                      <span className="font-mono text-sm text-ninja-green" style={{ textShadow: '0 0 6px rgba(57,255,20,0.5)' }}>{selectedCountry.dialCode}</span>
                    </div>
                    {/* Local digits input */}
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneForCountry(e.target.value, selectedCountry.dialCode))}
                      placeholder="7X XXX XXXX"
                      className="flex-1 bg-transparent text-white font-mono text-base tracking-wider px-4 py-3.5 outline-none"
                    />
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 group-focus-within:w-full transition-all duration-300 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)', boxShadow: '0 0 8px #39FF14' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CyberInput
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  icon={<KeyRound size={16} strokeWidth={2.2} />}
                  placeholder="••••••"
                  maxLength={6}
                  center
                  label={<><KeyRound size={11} /> {t(currentLang, 'pin_4_digits')}</>}
                />
                <CyberInput
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  icon={<ShieldCheck size={16} strokeWidth={2.2} />}
                  placeholder="••••••"
                  maxLength={6}
                  center
                  label={<><ShieldCheck size={11} /> {t(currentLang, 'confirm_pin')}</>}
                />
              </div>

              {/* Referral Code (optional) */}
              <div>
                <CyberInput
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  icon={<UserPlus size={16} strokeWidth={2.2} className="text-yellow-400" />}
                  placeholder={currentLang === 'ar' ? 'كود صديقك لعملات مكافأة' : "Friend's code for bonus coins"}
                  maxLength={12}
                  label={<span className="text-yellow-400/80"><UserPlus size={11} className="inline mr-1" /> {currentLang === 'ar' ? 'كود الإحالة (اختياري)' : 'Referral Code (optional)'}</span>}
                />
                <p className="font-mono text-[10px] text-yellow-400/60 mt-1.5 tracking-wide">
                  &gt; {currentLang === 'ar' ? `كلاكما يحصل على ${REFERRAL_CONFIG.newUserBonus} عملة مكافأة` : `Both get ${REFERRAL_CONFIG.newUserBonus} bonus coins`}
                </p>
              </div>

              {/* Country Dropdown Selector */}
              <CountryDropdown
                countries={COUNTRY_NINJAS}
                selected={selectedCountryNinja}
                onSelect={setSelectedCountryNinja}
              />
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center mt-4 font-body">
                {error}
              </motion.p>
            )}

            <div className="flex gap-3 mt-6">
              <CyberBtn onClick={onBack} variant="ghost" icon={<ArrowLeft size={18} strokeWidth={2.8} />}>
                {t(currentLang, 'back')}
              </CyberBtn>
              <CyberBtn
                onClick={handleNext}
                disabled={loading}
                loading={loading}
                variant="primary"
                icon={<ArrowRight size={18} strokeWidth={2.8} />}
              >
                {loading ? t(currentLang, 'checking') : t(currentLang, 'next')}
              </CyberBtn>
            </div>
          </CyberpunkCard>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2-ninja-picker"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
          <CyberpunkCard width={620}>
            {/* Header */}
            <div className="text-center mb-6">
              <div className="relative inline-block mb-3">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.15, 0.35] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'radial-gradient(circle, rgba(57,255,20,0.3) 0%, transparent 65%)',
                    filter: 'blur(12px)',
                  }}
                />
                <div className="relative w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(0,200,255,0.08))',
                    border: '1.5px solid rgba(57,255,20,0.45)',
                    boxShadow: '0 0 22px rgba(57,255,20,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}>
                  <Zap size={28} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.8))' }} />
                </div>
              </div>
              <h2 className="font-ninja text-2xl tracking-wider text-ninja-green" style={{ textShadow: '0 0 12px rgba(57,255,20,0.6)' }}>
                {currentLang === 'ar' ? 'اختر النينجا' : 'CHOOSE YOUR NINJA'}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px #39FF14' }} />
                <p className="font-mono text-[11px] tracking-[0.3em] text-ninja-green/80 uppercase" style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
                  STEP 2 / 3 · CHARACTER
                </p>
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.7 }} className="w-1.5 h-1.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px #39FF14' }} />
              </div>
            </div>

            {/* Section label */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.4))' }} />
              <span className="font-mono text-[10px] tracking-[0.3em] text-ninja-green/70">&gt; SELECT_AVATAR</span>
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), transparent)' }} />
            </div>

            {/* Ninja profile photos in one row */}
            <div className="flex justify-center gap-2.5 mb-5 flex-wrap">
              {STARTER_NINJAS.map((ninja) => {
                const isSelected = selectedStarterNinja === ninja.id;
                return (
                  <motion.button
                    key={ninja.id}
                    whileHover={{ scale: 1.1, y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedStarterNinja(ninja.id)}
                    className="flex flex-col items-center gap-1.5 transition-all"
                  >
                    <div
                      className="relative w-[64px] h-[64px] rounded-full overflow-hidden transition-all"
                      style={{
                        borderWidth: '2.5px',
                        borderStyle: 'solid',
                        borderColor: isSelected ? ninja.color : 'rgba(255,255,255,0.12)',
                        boxShadow: isSelected ? `0 0 20px ${ninja.color}80, 0 0 40px ${ninja.color}30, inset 0 0 12px ${ninja.color}40` : 'none',
                        background: isSelected ? `${ninja.color}15` : 'rgba(0,0,0,0.3)',
                      }}
                    >
                      <img src={ninja.img} alt={ninja.name} className="w-full h-full object-cover" />
                    </div>
                    <span
                      className="font-ninja text-[10px] tracking-wider transition-all"
                      style={{ color: isSelected ? ninja.color : 'rgba(255,255,255,0.4)', textShadow: isSelected ? `0 0 6px ${ninja.color}80` : 'none' }}
                    >
                      {ninja.name.toUpperCase()}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Selected ninja preview */}
            {(() => {
              const sel = STARTER_NINJAS.find(n => n.id === selectedStarterNinja);
              return sel ? (
                <motion.div key={sel.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-6">
                  <p className="font-ninja text-xl tracking-wider" style={{ color: sel.color, textShadow: `0 0 20px ${sel.color}80` }}>
                    {currentLang === 'ar' ? `نينجا ${sel.name.toUpperCase()}` : `${sel.name.toUpperCase()} NINJA`}
                  </p>
                </motion.div>
              ) : null;
            })()}

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-center mb-3 font-body text-sm">
                {error}
              </motion.p>
            )}

            <div className="flex gap-3">
              <CyberBtn onClick={() => setStep(1)} variant="ghost" icon={<ArrowLeft size={18} strokeWidth={2.8} />}>
                {t(currentLang, 'back')}
              </CyberBtn>
              <CyberBtn
                onClick={handleRegister}
                disabled={loading}
                loading={loading}
                variant="primary"
                icon={<Zap size={18} strokeWidth={2.8} />}
              >
                {loading ? t(currentLang, 'creating') : t(currentLang, 'create_ninja')}
              </CyberBtn>
            </div>
          </CyberpunkCard>
          </motion.div>
        )}



        {step === 3 && (
          <motion.div
            key="step5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
          <CyberpunkCard width={480}>
            {/* Header */}
            <div className="text-center mb-6">
              <div className="relative inline-block mb-3">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'radial-gradient(circle, rgba(57,255,20,0.45) 0%, transparent 65%)',
                    filter: 'blur(16px)',
                  }}
                />
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="relative w-20 h-20 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(57,255,20,0.18), rgba(0,200,255,0.1))',
                    border: '1.5px solid rgba(57,255,20,0.5)',
                    boxShadow: '0 0 30px rgba(57,255,20,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}>
                  <ShieldCheck size={36} className="text-ninja-green" style={{ filter: 'drop-shadow(0 0 10px rgba(57,255,20,0.9))' }} />
                </motion.div>
              </div>
              <h2 className="font-ninja text-2xl tracking-wider text-ninja-green" style={{ textShadow: '0 0 12px rgba(57,255,20,0.6)' }}>
                {t(currentLang, 'waiting_approval')}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px #39FF14' }} />
                <p className="font-mono text-[11px] tracking-[0.3em] text-ninja-green/80 uppercase" style={{ textShadow: '0 0 8px rgba(57,255,20,0.5)' }}>
                  STEP 3 / 3 · VERIFICATION
                </p>
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.7 }} className="w-1.5 h-1.5 rounded-full bg-ninja-green" style={{ boxShadow: '0 0 6px #39FF14' }} />
              </div>
              <p className="font-body text-gray-400 text-sm mt-3">{t(currentLang, 'ask_admin_code')}</p>
            </div>

            {/* Section label */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.4))' }} />
              <span className="font-mono text-[10px] tracking-[0.3em] text-ninja-green/70">&gt; {t(currentLang, 'enter_approval_code').toUpperCase()}</span>
              <div className="h-[1px] flex-1" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), transparent)' }} />
            </div>

            {/* Approval code input — modern glass style like login */}
            <div className="relative group mb-2">
              <div className="relative">
                <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ninja-green/70 z-[2] pointer-events-none group-focus-within:text-ninja-green transition-colors" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.5))' }} />
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="relative w-full rounded-lg pl-11 pr-4 py-4 text-white font-mono text-2xl tracking-[0.5em] text-center outline-none transition-all z-[1]"
                  style={{
                    background: 'rgba(8,12,18,0.7)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(57,255,20,0.2)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.4)',
                    textShadow: '0 0 10px rgba(57,255,20,0.6)',
                  }}
                  placeholder="• • • • • •"
                  maxLength={6}
                  autoFocus
                  onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && codeInput.length === 6 && handleCodeSubmit()}
                />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 group-focus-within:w-full transition-all duration-300 pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, #39FF14, transparent)', boxShadow: '0 0 8px #39FF14' }}
                />
              </div>
              {/* 6 dot indicators */}
              <div className="flex items-center justify-center gap-2 mt-2">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: i < codeInput.length ? 1 : 0.7,
                      opacity: i < codeInput.length ? 1 : 0.3,
                    }}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: i < codeInput.length ? '#39FF14' : '#374151',
                      boxShadow: i < codeInput.length ? '0 0 6px #39FF14' : 'none',
                    }}
                  />
                ))}
              </div>
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 font-body text-sm text-center mb-3 mt-3">
                {error}
              </motion.p>
            )}

            <div className="flex gap-3 mt-5">
              <CyberBtn onClick={() => { setStep(2); setError(''); }} variant="ghost" icon={<ArrowLeft size={18} strokeWidth={2.8} />}>
                {t(currentLang, 'back')}
              </CyberBtn>
              <CyberBtn
                onClick={handleCodeSubmit}
                disabled={loading || codeInput.length !== 6}
                loading={loading}
                variant="primary"
                icon={<Zap size={18} strokeWidth={2.8} />}
              >
                {loading ? t(currentLang, 'creating') : t(currentLang, 'confirm')}
              </CyberBtn>
            </div>
          </CyberpunkCard>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
