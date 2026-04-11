'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA UI — All React overlays: Menu, HUD, Round banners, Results
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PublicGameState } from './NinjaArenaEngine';
import { Swords, Trophy, Wifi, Bot, ChevronLeft, RotateCcw, Star, Zap, Shield, Sword } from 'lucide-react';

// ── Menu ──────────────────────────────────────────────────────────────────────

interface MenuProps {
  onSolo:     (difficulty: 1 | 2 | 3) => void;
  onOnline:   () => void;
  onPractice: () => void;
  onClose:    () => void;
  isMobile:   boolean;
}

export function ArenaMenu({ onSolo, onOnline, onPractice, onClose, isMobile }: MenuProps) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #060010 0%, #0f0022 50%, #060010 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
    >
      {/* Animated particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i * 13 + 7) % 100}%`,
              top: `${(i * 17 + 11) % 100}%`,
              width: 2, height: 2,
              background: i % 3 === 0 ? '#ff4400' : i % 3 === 1 ? '#9933ff' : '#44aaff',
              borderRadius: '50%',
            }}
            animate={{ y: [0, -600], opacity: [0.8, 0] }}
            transition={{ duration: 3 + (i % 4), delay: i * 0.3, repeat: Infinity, repeatDelay: 1 }}
          />
        ))}
      </div>

      {/* Logo */}
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 100 }}
        style={{ textAlign: 'center', marginBottom: 32 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 8 }}>
          <Swords size={36} color="#ff4400" />
          <h1 style={{
            fontSize: isMobile ? 32 : 48, fontWeight: 900,
            fontFamily: '"Courier New", monospace',
            background: 'linear-gradient(135deg, #ff6600, #ff0044)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            textShadow: 'none', letterSpacing: 4,
          }}>
            NINJA ARENA
          </h1>
          <Swords size={36} color="#ff4400" style={{ transform: 'scaleX(-1)' }} />
        </div>
        <p style={{ color: '#9966cc', fontSize: 12, letterSpacing: 2, fontFamily: 'monospace' }}>
          1v1 FIGHTING · BEST OF 3 ROUNDS
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {!showDiff ? (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14, width: isMobile ? 280 : 340 }}
          >
            <MenuButton icon={<Bot size={20} />} label="VS AI" sub="Fight the computer" color="#FF6600"
              onClick={() => setShowDiff(true)} />
            <MenuButton icon={<Wifi size={20} />} label="ONLINE" sub="Challenge a real player" color="#44AAFF"
              onClick={onOnline} />
            <MenuButton icon={<Sword size={20} />} label="PRACTICE" sub="No stakes — just fight" color="#44FF88"
              onClick={onPractice} />
            <div style={{ height: 8 }} />
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#666', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
            >
              <ChevronLeft size={16} /> BACK
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="diff"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12, width: isMobile ? 280 : 340 }}
          >
            <p style={{ color: '#aaa', fontSize: 12, textAlign: 'center', marginBottom: 4, fontFamily: 'monospace' }}>
              SELECT DIFFICULTY
            </p>
            <MenuButton icon="🟢" label="EASY" sub="Slow AI, rarely blocks" color="#44FF88" onClick={() => onSolo(1)} />
            <MenuButton icon="🟡" label="MEDIUM" sub="Balanced — reacts fast" color="#FFAA00" onClick={() => onSolo(2)} />
            <MenuButton icon="🔴" label="HARD" sub="Aggressive combos, reads you" color="#FF3333" onClick={() => onSolo(3)} />
            <button
              onClick={() => setShowDiff(false)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#666', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 }}
            >
              <ChevronLeft size={16} /> BACK
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls hint */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
        style={{ position: 'absolute', bottom: 20, color: '#444', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 1 }}
      >
        {isMobile
          ? 'Joystick = move  ·  Buttons = attack'
          : 'WASD/Arrows = move  ·  J=Light  K=Heavy  L=Block  Space=Jump  Q=Special'}
      </motion.div>
    </motion.div>
  );
}

function MenuButton({ icon, label, sub, color, onClick }: { icon: any; label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        background: `${color}18`,
        border: `2px solid ${color}55`,
        borderRadius: 12, padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', width: '100%', textAlign: 'left',
        boxShadow: `0 0 18px ${color}22`,
      }}
    >
      <span style={{ color, fontSize: 22 }}>{icon}</span>
      <div>
        <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, letterSpacing: 2 }}>{label}</div>
        <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>{sub}</div>
      </div>
    </motion.button>
  );
}

// ── Waiting for opponent ──────────────────────────────────────────────────────

export function ArenaWaiting({ onCancel }: { onCancel: () => void }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 60,
      }}
    >
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
        <Wifi size={48} color="#44AAFF" />
      </motion.div>
      <p style={{ color: '#44AAFF', fontFamily: 'monospace', fontSize: 18, marginTop: 20, letterSpacing: 3 }}>
        SEARCHING FOR OPPONENT{dots}
      </p>
      <p style={{ color: '#555', fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}>
        Waiting in lobby...
      </p>
      <button
        onClick={onCancel}
        style={{ marginTop: 32, background: 'none', border: '1px solid #444', color: '#666', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontFamily: 'monospace' }}
      >
        CANCEL
      </button>
    </motion.div>
  );
}

// ── HUD (fight overlay) ───────────────────────────────────────────────────────

interface HUDProps {
  gs: PublicGameState;
  p1Name: string;
  p2Name: string;
}

export function ArenaHUD({ gs, p1Name, p2Name }: HUDProps) {
  const f0 = gs.fighters[0];
  const f1 = gs.fighters[1];

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 16px', pointerEvents: 'none', zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

        {/* P1 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ color: '#44ff88', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
              {p1Name.toUpperCase()}
            </span>
            <RoundDots wins={gs.wins[0]} max={Math.ceil(gs.maxRounds / 2)} color="#44ff88" />
          </div>
          <HealthBar current={f0.hp} max={f0.maxHp} color="#44ff88" reverse={false} />
          <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
            <StaminaBar current={f0.stamina} max={f0.maxStamina} reverse={false} />
            <SpecialBar current={f0.special} reverse={false} />
          </div>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', minWidth: 52 }}>
          <div style={{
            color: gs.timer <= 10 ? '#FF4444' : '#fff',
            fontFamily: 'monospace', fontWeight: 900, fontSize: 28,
            lineHeight: 1,
            textShadow: gs.timer <= 10 ? '0 0 15px #FF4444' : '0 0 10px rgba(255,255,255,0.4)',
          }}>
            {gs.timer.toString().padStart(2, '0')}
          </div>
          <div style={{ color: '#555', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
            ROUND {gs.round}
          </div>
        </div>

        {/* P2 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 3 }}>
            <RoundDots wins={gs.wins[1]} max={Math.ceil(gs.maxRounds / 2)} color="#4499ff" />
            <span style={{ color: '#4499ff', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
              {p2Name.toUpperCase()}
            </span>
          </div>
          <HealthBar current={f1.hp} max={f1.maxHp} color="#4499ff" reverse={true} />
          <div style={{ display: 'flex', gap: 6, marginTop: 3, justifyContent: 'flex-end' }}>
            <SpecialBar current={f1.special} reverse={true} />
            <StaminaBar current={f1.stamina} max={f1.maxStamina} reverse={true} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthBar({ current, max, color, reverse }: { current: number; max: number; color: string; reverse: boolean }) {
  const pct = Math.max(0, current / max) * 100;
  const barColor = pct > 50 ? color : pct > 25 ? '#FFAA00' : '#FF3333';
  return (
    <div style={{
      height: 14, background: 'rgba(0,0,0,0.6)',
      borderRadius: 3, border: '1px solid rgba(255,255,255,0.15)',
      overflow: 'hidden', position: 'relative',
    }}>
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ type: 'tween', duration: 0.12 }}
        style={{
          position: 'absolute',
          [reverse ? 'right' : 'left']: 0,
          top: 0, bottom: 0, width: `${pct}%`,
          background: `linear-gradient(90deg, ${barColor}bb, ${barColor})`,
          boxShadow: `0 0 8px ${barColor}88`,
        }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: reverse ? 'flex-end' : 'flex-start',
        paddingLeft: reverse ? 0 : 5, paddingRight: reverse ? 5 : 0,
        fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontWeight: 700,
      }}>
        {current}
      </div>
    </div>
  );
}

function StaminaBar({ current, max, reverse }: { current: number; max: number; reverse: boolean }) {
  const pct = Math.max(0, current / max) * 100;
  return (
    <div title="Stamina (blocking)" style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.5)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <div style={{
        [reverse ? 'marginLeft' : 'marginRight']: `${100 - pct}%`,
        height: '100%',
        background: 'linear-gradient(90deg, #4488cc, #66aaff)',
        transition: 'all 0.15s',
      }} />
    </div>
  );
}

function SpecialBar({ current, reverse }: { current: number; reverse: boolean }) {
  const full = current >= 100;
  return (
    <div
      title="Special meter (★)"
      style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.5)', borderRadius: 3, border: `1px solid ${full ? '#ff880088' : 'rgba(255,255,255,0.1)'}`, overflow: 'hidden', boxShadow: full ? '0 0 8px #ff880066' : 'none' }}>
      <motion.div
        animate={{ width: `${Math.min(100, current)}%` }}
        style={{ height: '100%', background: 'linear-gradient(90deg, #ff6600, #ffaa00)', float: reverse ? 'right' : 'left' }}
      />
    </div>
  );
}

function RoundDots({ wins, max, color }: { wins: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i < wins ? color : 'rgba(255,255,255,0.15)',
          boxShadow: i < wins ? `0 0 6px ${color}` : 'none',
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  );
}

// ── Round banners ─────────────────────────────────────────────────────────────

interface BannerProps {
  gs: PublicGameState;
  p1Name: string;
  p2Name: string;
}

export function ArenaBanner({ gs, p1Name, p2Name }: BannerProps) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [sub, setSub] = useState('');
  const [color, setColor] = useState('#fff');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (gs.phase === 'countdown' && gs.countdown > 0) {
      setText(gs.countdown.toString());
      setSub('');
      setColor('#FFAA00');
      setShow(true);
    } else if (gs.phase === 'fight' && gs.timer > 98) {
      setText('FIGHT!');
      setSub(`ROUND ${gs.round}`);
      setColor('#44FF88');
      setShow(true);
      timerRef.current = setTimeout(() => setShow(false), 900);
    } else if (gs.phase === 'roundOver') {
      const w = gs.roundWinner;
      setText(w === -1 ? 'DRAW' : 'K.O.!');
      setSub(w >= 0 ? `${w === 0 ? p1Name : p2Name} WINS!` : '');
      setColor(w === 0 ? '#44FF88' : w === 1 ? '#4499FF' : '#FFAA00');
      setShow(true);
    } else if (gs.phase === 'gameOver') {
      setShow(false);
    } else {
      if (gs.phase === 'fight') setShow(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [gs.phase, gs.countdown, gs.round, gs.timer, gs.roundWinner, p1Name, p2Name]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 1.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 20,
          }}
        >
          <div style={{
            textAlign: 'center',
            textShadow: `0 0 40px ${color}, 0 0 80px ${color}66`,
          }}>
            <div style={{
              fontSize: 72, fontWeight: 900, fontFamily: '"Courier New", monospace',
              color, letterSpacing: 8, lineHeight: 1,
            }}>
              {text}
            </div>
            {sub && (
              <div style={{ fontSize: 20, color: '#fff', fontFamily: 'monospace', letterSpacing: 4, marginTop: 8, opacity: 0.9 }}>
                {sub}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Results screen ────────────────────────────────────────────────────────────

interface ResultsProps {
  gs: PublicGameState;
  p1Name: string;
  p2Name: string;
  isSolo: boolean;
  coinsEarned: number;
  xpEarned: number;
  onRematch: () => void;
  onMenu: () => void;
}

export function ArenaResults({ gs, p1Name, p2Name, isSolo, coinsEarned, xpEarned, onRematch, onMenu }: ResultsProps) {
  const w = gs.gameWinner;
  const winner = w === 0 ? p1Name : w === 1 ? p2Name : null;
  const color = w === 0 ? '#44FF88' : w === 1 ? '#4499FF' : '#FFAA00';
  const isP1Win = w === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #080014 0%, #12002a 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
    >
      {/* Winner announcement */}
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, delay: 0.1 }}
        style={{ textAlign: 'center', marginBottom: 28 }}
      >
        {winner ? (
          <>
            <div style={{ fontSize: 14, color: '#aaa', fontFamily: 'monospace', letterSpacing: 3, marginBottom: 8 }}>
              WINNER
            </div>
            <div style={{
              fontSize: 48, fontWeight: 900, color, fontFamily: 'monospace', letterSpacing: 6,
              textShadow: `0 0 30px ${color}, 0 0 60px ${color}55`,
            }}>
              {winner.toUpperCase()}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 48, fontWeight: 900, color: '#FFAA00', fontFamily: 'monospace', letterSpacing: 6 }}>
            DRAW
          </div>
        )}
      </motion.div>

      {/* Round score */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        style={{ display: 'flex', gap: 40, marginBottom: 24 }}
      >
        <ScoreBox name={p1Name} wins={gs.wins[0]} color="#44FF88" />
        <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 24, alignSelf: 'center' }}>—</div>
        <ScoreBox name={p2Name} wins={gs.wins[1]} color="#4499FF" />
      </motion.div>

      {/* Rewards */}
      {(coinsEarned > 0 || xpEarned > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, padding: '12px 28px',
            display: 'flex', gap: 28, marginBottom: 28,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#FFD700', fontSize: 22, fontWeight: 700, fontFamily: 'monospace' }}>+{coinsEarned}</div>
            <div style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>COINS</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#44ff88', fontSize: 22, fontWeight: 700, fontFamily: 'monospace' }}>+{xpEarned}</div>
            <div style={{ color: '#888', fontSize: 10, fontFamily: 'monospace' }}>XP</div>
          </div>
        </motion.div>
      )}

      {/* Buttons */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}
      >
        {isSolo && (
          <ResultBtn icon={<RotateCcw size={16} />} label="REMATCH" color="#FF6600" onClick={onRematch} />
        )}
        <ResultBtn icon={<ChevronLeft size={16} />} label="MENU" color="#888" onClick={onMenu} />
      </motion.div>
    </motion.div>
  );
}

function ScoreBox({ name, wins, color }: { name: string; wins: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 42, fontWeight: 900, color, fontFamily: 'monospace' }}>{wins}</div>
    </div>
  );
}

function ResultBtn({ icon, label, color, onClick }: { icon: any; label: string; color: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        background: `${color}22`,
        border: `2px solid ${color}66`,
        borderRadius: 10, padding: '12px 24px',
        color: '#fff', fontFamily: 'monospace', fontWeight: 700,
        fontSize: 14, letterSpacing: 2, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: `0 0 16px ${color}33`,
      }}
    >
      {icon} {label}
    </motion.button>
  );
}
