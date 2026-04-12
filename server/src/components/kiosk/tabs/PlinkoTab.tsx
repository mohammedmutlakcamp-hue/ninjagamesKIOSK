'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { Coins, Zap, Trophy, ChevronDown, Settings2, Minus, Plus, RotateCcw } from 'lucide-react';

// ─── Stake-style Multiplier Tables ──────────────────────────────────────────
// Format: MULTIPLIERS[rows][risk] = symmetric array of slot multipliers
// These match Stake.com / Roobet Plinko payouts
const MULTIPLIER_TABLES: Record<number, Record<string, number[]>> = {
  8: {
    low:    [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high:   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  9: {
    low:    [5.6, 2, 1.6, 1, 0.7, 0.7, 1, 1.6, 2, 5.6],
    medium: [18, 4, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4, 18],
    high:   [43, 7, 2, 0.6, 0.2, 0.2, 0.6, 2, 7, 43],
  },
  10: {
    low:    [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    medium: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    high:   [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
  },
  11: {
    low:    [8.4, 3, 1.9, 1.3, 1, 0.7, 0.7, 1, 1.3, 1.9, 3, 8.4],
    medium: [24, 6, 3, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3, 6, 24],
    high:   [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
  },
  12: {
    low:    [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high:   [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  13: {
    low:    [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3, 4, 8.1],
    medium: [43, 13, 6, 3, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3, 6, 13, 43],
    high:   [284, 37, 11, 4, 1, 0.2, 0.2, 0.2, 0.2, 1, 4, 11, 37, 284],
  },
  14: {
    low:    [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    medium: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2, 0.5, 1, 1.9, 4, 7, 15, 58],
    high:   [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
  },
  15: {
    low:    [15, 8, 3, 2, 1.5, 1.1, 1, 0.7, 0.7, 1, 1.1, 1.5, 2, 3, 8, 15],
    medium: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3, 5, 11, 18, 88],
    high:   [620, 83, 27, 8, 3, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3, 8, 27, 83, 620],
  },
  16: {
    low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

// ─── Physics Constants ───────────────────────────────────────────────────────
const GRAVITY = 0.35;
const FRICTION = 0.99;
const BOUNCE_DAMPING = 0.6;
const PEG_RADIUS = 5;
const BALL_RADIUS = 7;

// ─── Glow colors (hex only — needed for canvas alpha appending) ─────────────
const GLOW_COLORS = ['#FF6B35', '#FF2D55', '#FFD700', '#39FF14', '#00E5FF', '#A855F7', '#FF0040', '#00FF87'];

// ─── Slot color based on multiplier value ───────────────────────────────────
function getSlotColor(mult: number): string {
  if (mult >= 100) return '#FF0040';
  if (mult >= 25) return '#FF2D55';
  if (mult >= 10) return '#FF6B00';
  if (mult >= 5) return '#FF9500';
  if (mult >= 2) return '#FFCC00';
  if (mult >= 1) return '#39FF14';
  if (mult >= 0.5) return '#00E5FF';
  return '#00B0FF';
}

// ─── Ball & Peg types ───────────────────────────────────────────────────────
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  landed: boolean;
  slotIndex: number;
  trail: { x: number; y: number; age: number }[];
  glowColor: string;
  bet: number;
}

interface Peg {
  x: number;
  y: number;
  hitTimer: number;
}

interface PlinkoTabProps {
  player: any;
}

export function PlinkoTab({ player }: PlinkoTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const pegsRef = useRef<Peg[]>([]);
  const animFrameRef = useRef<number>(0);
  const slotsRef = useRef<{ x: number; width: number }[]>([]);
  const dimensionsRef = useRef({ width: 0, height: 0, offsetY: 0, pegSpacingX: 0, pegSpacingY: 0 });

  // ─── Game State ────────────────────────────────────────────────────────────
  const [betAmount, setBetAmount] = useState(10);
  const [customBet, setCustomBet] = useState('10');
  const [rows, setRows] = useState(16);
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [lastWins, setLastWins] = useState<{ mult: number; amount: number; profit: number; time: number }[]>([]);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalDrops, setTotalDrops] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const autoModeRef = useRef(false);
  const autoIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Admin State ───────────────────────────────────────────────────────────
  const [luckFactor, setLuckFactor] = useState(50);
  const [showAdmin, setShowAdmin] = useState(false);
  const luckRef = useRef(50);

  const playerCoins = player?.coins ?? 0;
  const pendingBetsRef = useRef(0);
  const effectiveCoins = playerCoins - pendingBetsRef.current;
  const isAdmin = player?.username === 'مالبورو' || player?.isAdmin;

  // Reset pending bets when Firestore updates coin balance
  useEffect(() => { pendingBetsRef.current = 0; }, [playerCoins]);

  // Keep luckRef in sync
  useEffect(() => { luckRef.current = luckFactor; }, [luckFactor]);

  // ─── Load admin luck factor from Firestore ─────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'game-settings', 'plinko'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.luckFactor === 'number') {
          setLuckFactor(data.luckFactor);
          luckRef.current = data.luckFactor;
        }
      }
    });
    return () => unsub();
  }, []);

  // Save luck factor to Firestore (admin only)
  const saveLuckFactor = useCallback(async (val: number) => {
    setLuckFactor(val);
    luckRef.current = val;
    try {
      await setDoc(doc(db, 'game-settings', 'plinko'), { luckFactor: val }, { merge: true });
    } catch (e) {
      console.error('Failed to save luck factor:', e);
    }
  }, []);

  // ─── Current multipliers ──────────────────────────────────────────────────
  const getMultipliers = useCallback(() => {
    return MULTIPLIER_TABLES[rows]?.[risk] ?? MULTIPLIER_TABLES[16].medium;
  }, [rows, risk]);

  // ─── Initialize Pegs & Slots ──────────────────────────────────────────────
  const initLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    const pegSpacingY = (H - 120) / (rows + 1);
    const pegSpacingX = pegSpacingY * 1.1;
    const offsetY = 50;

    const pegs: Peg[] = [];
    for (let row = 0; row < rows; row++) {
      const pegsInRow = row + 3;
      const rowWidth = (pegsInRow - 1) * pegSpacingX;
      const startX = (W - rowWidth) / 2;
      for (let col = 0; col < pegsInRow; col++) {
        pegs.push({
          x: startX + col * pegSpacingX,
          y: offsetY + row * pegSpacingY,
          hitTimer: 0,
        });
      }
    }
    pegsRef.current = pegs;

    const multipliers = getMultipliers();
    const numSlots = multipliers.length;
    const lastRow = rows - 1;
    const pegsInLastRow = lastRow + 3;
    const lastRowWidth = (pegsInLastRow - 1) * pegSpacingX;
    const slotWidth = lastRowWidth / numSlots;
    const slotsStartX = (W - lastRowWidth) / 2;

    const slots: { x: number; width: number }[] = [];
    for (let i = 0; i < numSlots; i++) {
      slots.push({ x: slotsStartX + i * slotWidth, width: slotWidth });
    }
    slotsRef.current = slots;
    dimensionsRef.current = { width: W, height: H, offsetY, pegSpacingX, pegSpacingY };
  }, [rows, getMultipliers]);

  // ─── Galton Board Bounce — proper bell curve with luck bias ────────────────
  // Each peg collision = biased coin flip (left or right).
  // luck 0 = house wins (balls forced to center), 50 = fair 50/50, 100 = player wins (balls forced to edges)
  const getBiasedBounce = useCallback((ball: Ball, peg: Peg): { vx: number; vy: number } => {
    const luck = luckRef.current / 100; // 0 to 1
    const W = dimensionsRef.current.width;
    const center = W / 2;
    const isRightOfCenter = ball.x > center;

    // Start with pure 50/50 random coin flip
    let goRight = Math.random() < 0.5;

    if (luck < 0.5) {
      // ── House edge: override random flip to push ball TOWARD center ──
      // strength: 0 at luck=50%, 1 at luck=0%
      const strength = (0.5 - luck) / 0.5;
      // Up to 75% chance to force the ball toward center
      const overrideChance = strength * 0.75;

      if (Math.random() < overrideChance) {
        // Force toward center: if right of center → go left, if left → go right
        goRight = !isRightOfCenter;
      }
    } else if (luck > 0.5) {
      // ── Player edge: override random flip to push ball TOWARD edges ──
      const strength = (luck - 0.5) / 0.5;
      const overrideChance = strength * 0.65;

      if (Math.random() < overrideChance) {
        // Force toward edges: if right of center → keep going right, if left → keep going left
        goRight = isRightOfCenter;
      }
    }
    // luck === 0.5: pure 50/50, natural bell curve

    // Bounce velocity — always downward, randomly left or right
    const speed = 2.2 + Math.random() * 1.2;
    const angle = goRight
      ? (Math.PI * 0.3 + Math.random() * 0.35)   // down-right
      : (Math.PI * 0.7 - Math.random() * 0.35);   // down-left

    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  }, []);

  // ─── Drop Ball ────────────────────────────────────────────────────────────
  const dropBall = useCallback(async () => {
    const available = playerCoins - pendingBetsRef.current;
    if (available < betAmount || betAmount <= 0) return;
    pendingBetsRef.current += betAmount;

    try {
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-betAmount) });
    } catch (e) {
      console.error('Failed to deduct coins:', e);
      pendingBetsRef.current = Math.max(0, pendingBetsRef.current - betAmount);
      return;
    }

    // Always drop from center with tiny random offset (bias happens at pegs)
    const W = dimensionsRef.current.width;
    const dropX = W / 2 + (Math.random() - 0.5) * dimensionsRef.current.pegSpacingX * 0.3;
    const newBall: Ball = {
      x: dropX,
      y: 20,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 0,
      radius: BALL_RADIUS,
      landed: false,
      slotIndex: -1,
      trail: [],
      glowColor: GLOW_COLORS[Math.floor(Math.random() * GLOW_COLORS.length)],
      bet: betAmount,
    };

    ballsRef.current.push(newBall);
    setTotalDrops(p => p + 1);
    // Notify shell that Plinko is busy (has balls in play)
    window.dispatchEvent(new CustomEvent('plinko-busy', { detail: { busy: true } }));
  }, [betAmount, playerCoins, player]);

  // ─── Physics Tick ─────────────────────────────────────────────────────────
  const physicsTick = useCallback(() => {
    const balls = ballsRef.current;
    const pegs = pegsRef.current;
    const slots = slotsRef.current;
    const { height } = dimensionsRef.current;
    const multipliers = getMultipliers();
    const slotY = height - 50;

    for (const ball of balls) {
      if (ball.landed) continue;

      ball.trail.push({ x: ball.x, y: ball.y, age: 0 });
      if (ball.trail.length > 10) ball.trail.shift();
      ball.trail.forEach(t => t.age++);

      // Apply gravity and friction
      ball.vy += GRAVITY;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Peg collisions — Galton board style
      for (const peg of pegs) {
        const dx = ball.x - peg.x;
        const dy = ball.y - peg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ball.radius + PEG_RADIUS;

        if (dist < minDist && dist > 0) {
          peg.hitTimer = 8;

          // Use biased coin flip for bounce direction
          const bounce = getBiasedBounce(ball, peg);
          ball.vx = bounce.vx;
          ball.vy = bounce.vy;

          // Ensure downward motion
          if (ball.vy < 0.8) ball.vy = 0.8;

          // Push ball outside peg
          const overlap = minDist - dist + 1;
          ball.x += (dx / dist) * overlap;
          ball.y += (dy / dist) * overlap;
        }
      }

      const wallLeft = slots[0]?.x ?? 50;
      const wallRight = (slots[slots.length - 1]?.x ?? 0) + (slots[slots.length - 1]?.width ?? 0);
      if (ball.x < wallLeft + ball.radius) {
        ball.x = wallLeft + ball.radius;
        ball.vx = Math.abs(ball.vx) * BOUNCE_DAMPING;
      }
      if (ball.x > wallRight - ball.radius) {
        ball.x = wallRight - ball.radius;
        ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMPING;
      }

      if (ball.y >= slotY) {
        ball.landed = true;
        ball.vy = 0;
        ball.vx = 0;
        ball.y = slotY;

        for (let i = 0; i < slots.length; i++) {
          if (ball.x >= slots[i].x && ball.x < slots[i].x + slots[i].width) {
            ball.slotIndex = i;
            break;
          }
        }
        if (ball.slotIndex === -1) {
          ball.slotIndex = ball.x < slots[0].x + slots[0].width / 2 ? 0 : slots.length - 1;
        }

        const mult = multipliers[ball.slotIndex] ?? 0;
        const winAmount = Math.floor(ball.bet * mult);
        const profit = winAmount - ball.bet;

        if (winAmount > 0) {
          updateDoc(doc(db, 'players', player.uid), { coins: increment(winAmount) }).catch(console.error);
        }

        setLastWins(prev => [{ mult, amount: winAmount, profit, time: Date.now() }, ...prev].slice(0, 25));
        setTotalProfit(prev => prev + profit);

        setTimeout(() => {
          ballsRef.current = ballsRef.current.filter(b => b !== ball);
          if (ballsRef.current.length === 0) {
            window.dispatchEvent(new CustomEvent('plinko-busy', { detail: { busy: false } }));
          }
        }, 1500);
      }
    }

    for (const peg of pegs) {
      if (peg.hitTimer > 0) peg.hitTimer--;
    }
  }, [getBiasedBounce, getMultipliers, player]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const multipliers = getMultipliers();
    const slots = slotsRef.current;
    const pegs = pegsRef.current;
    const balls = ballsRef.current;
    const slotY = H - 50;

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Pegs
    for (const peg of pegs) {
      const glow = peg.hitTimer > 0;
      const r = PEG_RADIUS + (glow ? 1.5 : 0);

      if (glow) {
        const g = ctx.createRadialGradient(peg.x, peg.y, 0, peg.x, peg.y, r * 3.5);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = glow ? '#ffffff' : '#2d333b';
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (!glow) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(peg.x - 1, peg.y - 1, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Slot backgrounds & labels
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const mult = multipliers[i];
      const color = getSlotColor(mult);

      // Rounded slot background
      const sx = slot.x + 1;
      const sw = slot.width - 2;
      const sh = 32;
      const sy = slotY;
      const br = 4;
      ctx.fillStyle = color + '30';
      ctx.beginPath();
      ctx.moveTo(sx + br, sy);
      ctx.lineTo(sx + sw - br, sy);
      ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + br);
      ctx.lineTo(sx + sw, sy + sh - br);
      ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - br, sy + sh);
      ctx.lineTo(sx + br, sy + sh);
      ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - br);
      ctx.lineTo(sx, sy + br);
      ctx.quadraticCurveTo(sx, sy, sx + br, sy);
      ctx.closePath();
      ctx.fill();

      // Multiplier text
      ctx.fillStyle = color;
      const fontSize = rows >= 14 ? 9 : rows >= 11 ? 10 : 11;
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = mult >= 1 ? `${mult}x` : `${mult}x`;
      ctx.fillText(label, slot.x + slot.width / 2, slotY + 16);
    }

    // Balls
    for (const ball of balls) {
      // Trail
      for (const t of ball.trail) {
        const alpha = Math.max(0, 1 - t.age / 10) * 0.35;
        const alphaHex = Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = ball.glowColor + alphaHex;
        ctx.beginPath();
        ctx.arc(t.x, t.y, ball.radius * (1 - t.age / 12), 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer glow
      const g1 = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius * 3);
      g1.addColorStop(0, ball.glowColor + '50');
      g1.addColorStop(1, ball.glowColor + '00');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius * 3, 0, Math.PI * 2);
      ctx.fill();

      // Ball body
      const g2 = ctx.createRadialGradient(ball.x - 1.5, ball.y - 1.5, 0, ball.x, ball.y, ball.radius);
      g2.addColorStop(0, '#ffffff');
      g2.addColorStop(0.35, ball.glowColor);
      g2.addColorStop(1, ball.glowColor + 'bb');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Landing flash on slot
      if (ball.landed && ball.slotIndex >= 0) {
        const mult = multipliers[ball.slotIndex];
        const color = getSlotColor(mult);
        const slot = slots[ball.slotIndex];
        if (slot) {
          ctx.fillStyle = color + '40';
          ctx.fillRect(slot.x, slotY, slot.width, 32);
        }
      }
    }
  }, [getMultipliers]);

  // ─── Game Loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    initLayout();

    const loop = () => {
      physicsTick();
      render();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      // Clear busy flag when leaving Plinko
      window.dispatchEvent(new CustomEvent('plinko-busy', { detail: { busy: false } }));
    };
  }, [initLayout, physicsTick, render]);

  // Re-init on settings change
  useEffect(() => { initLayout(); }, [rows, risk, initLayout]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
      initLayout();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initLayout]);

  // Auto mode
  useEffect(() => {
    autoModeRef.current = autoMode;
    if (autoMode) {
      autoIntervalRef.current = setInterval(() => {
        if (autoModeRef.current && ballsRef.current.length < 10) {
          dropBall();
        }
      }, 500);
    } else {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    }
    return () => { if (autoIntervalRef.current) clearInterval(autoIntervalRef.current); };
  }, [autoMode, dropBall]);

  // ─── Bet helpers ──────────────────────────────────────────────────────────
  const handleCustomBetChange = (val: string) => {
    setCustomBet(val);
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) setBetAmount(n);
  };
  const halfBet = () => { const v = Math.max(1, Math.floor(betAmount / 2)); setBetAmount(v); setCustomBet(String(v)); };
  const doubleBet = () => { const v = betAmount * 2; setBetAmount(v); setCustomBet(String(v)); };
  const setQuickBet = (v: number) => { setBetAmount(v); setCustomBet(String(v)); };

  const betOptions = [5, 10, 25, 50, 100, 250, 500, 1000];
  const rowOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16];
  const multipliers = getMultipliers();
  const maxMult = Math.max(...multipliers);

  return (
    <div className="w-full h-full flex gap-3 p-3" style={{ minHeight: 0 }}>
      {/* ═══ Left Panel — Controls ═══ */}
      <div className="w-[270px] flex-shrink-0 flex flex-col gap-2.5 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>

        {/* Bet Amount */}
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Bet Amount</div>

          {/* Custom input with half/double */}
          <div className="flex items-center gap-1.5 mb-2.5">
            <button onClick={halfBet} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 transition-all hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>½</button>
            <div className="flex-1 relative">
              <input
                type="number"
                value={customBet}
                onChange={e => handleCustomBetChange(e.target.value)}
                className="w-full text-center py-1.5 rounded-lg text-sm font-bold text-white bg-transparent outline-none"
                style={{ border: '1px solid rgba(57,255,20,0.3)', background: 'rgba(57,255,20,0.04)' }}
                min={1}
              />
              <Coins size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400" />
            </div>
            <button onClick={doubleBet} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 transition-all hover:text-white" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>2×</button>
          </div>

          {/* Quick bet grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {betOptions.map(amount => (
              <button
                key={amount}
                onClick={() => setQuickBet(amount)}
                className="py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: betAmount === amount ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${betAmount === amount ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  color: betAmount === amount ? '#39FF14' : '#666',
                }}
              >
                {amount}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <Coins size={12} className="text-yellow-400" />
            <span className="text-[11px] text-gray-500">Balance: <span className="text-white font-bold">{Math.floor(effectiveCoins).toLocaleString()}</span></span>
          </div>
        </div>

        {/* Risk Level */}
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Risk</div>
          <div className="flex gap-1.5">
            {(['low', 'medium', 'high'] as const).map(r => {
              const active = risk === r;
              const col = r === 'low' ? '#00E5FF' : r === 'medium' ? '#FFCC00' : '#FF0040';
              return (
                <button
                  key={r}
                  onClick={() => { if (ballsRef.current.length === 0) setRisk(r); }}
                  className="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase transition-all"
                  style={{
                    background: active ? col + '18' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? col + '60' : 'rgba(255,255,255,0.06)'}`,
                    color: active ? col : '#555',
                    opacity: ballsRef.current.length > 0 && !active ? 0.4 : 1,
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">Rows</div>
          <div className="flex gap-1 flex-wrap">
            {rowOptions.map(r => {
              const active = rows === r;
              return (
                <button
                  key={r}
                  onClick={() => { if (ballsRef.current.length === 0) setRows(r); }}
                  className="w-[28px] h-[28px] rounded-lg text-[11px] font-bold transition-all flex items-center justify-center"
                  style={{
                    background: active ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: active ? '#39FF14' : '#555',
                    opacity: ballsRef.current.length > 0 && !active ? 0.4 : 1,
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-gray-600 mt-1.5">Max: <span className="text-yellow-400 font-bold">{maxMult}×</span></div>
        </div>

        {/* Drop Button */}
        <button
          onClick={dropBall}
          disabled={effectiveCoins < betAmount || betAmount <= 0}
          className="w-full py-3.5 rounded-xl text-base font-black uppercase tracking-widest transition-all active:scale-[0.97]"
          style={{
            background: effectiveCoins >= betAmount && betAmount > 0
              ? 'linear-gradient(135deg, #39FF14, #00C853)'
              : 'rgba(255,255,255,0.04)',
            color: effectiveCoins >= betAmount && betAmount > 0 ? '#000' : '#444',
            boxShadow: effectiveCoins >= betAmount && betAmount > 0 ? '0 0 25px rgba(57,255,20,0.25)' : 'none',
          }}
        >
          Drop Ball
        </button>

        {/* Auto Mode */}
        <button
          onClick={() => setAutoMode(!autoMode)}
          className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          style={{
            background: autoMode ? 'rgba(255,0,64,0.12)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${autoMode ? 'rgba(255,0,64,0.35)' : 'rgba(255,255,255,0.06)'}`,
            color: autoMode ? '#FF0040' : '#666',
          }}
        >
          <Zap size={12} className="inline mr-1" />
          {autoMode ? 'Stop Auto' : 'Auto Bet'}
        </button>

        {/* Session Stats */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">Profit</span>
            <span className={`font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[11px] mt-1">
            <span className="text-gray-500">Total Bets</span>
            <span className="text-white font-bold">{totalDrops}</span>
          </div>
          <div className="flex justify-between text-[11px] mt-1">
            <span className="text-gray-500">Wins</span>
            <span className="text-white font-bold">{lastWins.filter(w => w.profit > 0).length}</span>
          </div>
        </div>

        {/* Admin Controls */}
        {isAdmin && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,0,64,0.04)', border: '1px solid rgba(255,0,64,0.15)' }}>
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className="flex items-center gap-2 text-[10px] text-red-400 font-mono uppercase w-full"
            >
              <Settings2 size={12} />
              House Edge Control
              <ChevronDown size={10} className={`ml-auto transition-transform ${showAdmin ? 'rotate-180' : ''}`} />
            </button>
            {showAdmin && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">Outcome Bias</span>
                    <span className="text-red-400 font-bold">{luckFactor}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={luckFactor}
                    onChange={e => saveLuckFactor(Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>House Wins</span>
                    <span>Fair (50)</span>
                    <span>Player Wins</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 30, 50, 65, 80, 95].map(v => (
                    <button
                      key={v}
                      onClick={() => saveLuckFactor(v)}
                      className="py-1 rounded text-[9px] font-bold transition-all"
                      style={{
                        background: luckFactor === v ? 'rgba(255,0,64,0.2)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${luckFactor === v ? 'rgba(255,0,64,0.5)' : 'rgba(255,255,255,0.06)'}`,
                        color: luckFactor === v ? '#FF0040' : '#666',
                      }}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-gray-600 leading-relaxed">
                  Controls ball trajectory bias. Lower = balls land center (house wins). Higher = balls land edges (player wins). Saved to server — affects all players.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Center — Plinko Board ═══ */}
      <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      </div>

      {/* ═══ Right Panel — History ═══ */}
      <div className="w-[180px] flex-shrink-0 flex flex-col gap-1.5">
        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Trophy size={10} className="text-yellow-400" /> All Bets
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}>
          {lastWins.length === 0 && (
            <div className="text-[10px] text-gray-700 text-center mt-8">No bets yet</div>
          )}
          {lastWins.map((win, i) => {
            const color = getSlotColor(win.mult);
            return (
              <motion.div
                key={win.time + i}
                initial={{ opacity: 0, x: 15, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className="rounded-lg px-2.5 py-1.5 flex items-center justify-between"
                style={{
                  background: color + '0c',
                  border: `1px solid ${color}20`,
                }}
              >
                <span className="text-[10px] font-bold" style={{ color }}>{win.mult}×</span>
                <span className={`text-[10px] font-bold ${win.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {win.profit >= 0 ? '+' : ''}{win.profit.toLocaleString()}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
