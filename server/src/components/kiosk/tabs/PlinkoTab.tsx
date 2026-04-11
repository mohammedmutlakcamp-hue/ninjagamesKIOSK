'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, addDoc, collection, getDoc, runTransaction } from 'firebase/firestore';
import { Coins, Zap, TrendingUp, Trophy, CircleDot, ChevronDown, X, BarChart3 } from 'lucide-react';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props { player: any; onClose?: () => void; }

// ─── Plinko Config ─────────────────────────────────────────────
const ROWS = 12;
const COLS = ROWS + 3; // pegs per widest row
const PEG_SPACING = 40;
const PEG_RADIUS = 4;
const BALL_RADIUS = 8;

// Multipliers at the bottom slots (13 slots for 12 rows)
// Weighted toward 0x-0.5x for ~55% house edge
const MULTIPLIERS = [0, 0.1, 0.2, 0.3, 0.5, 1.0, 3.0, 1.0, 0.5, 0.3, 0.2, 0.1, 0];
const MULTIPLIER_COLORS: Record<number, string> = {
  0: '#EF4444',
  0.1: '#EF4444',
  0.2: '#F97316',
  0.3: '#F97316',
  0.5: '#EAB308',
  1.0: '#22C55E',
  3.0: '#A855F7',
};

const BET_OPTIONS = [10, 25, 50, 100];

// Expected value calculation:
// With 12 rows, each ball goes L/R 12 times (binomial distribution)
// The slot probabilities follow a binomial(12, 0.5) distribution.
// Slots 0-12 have probabilities: C(12,k)/4096
// EV = sum of (prob * multiplier) for each slot
// With these multipliers, EV per 1 coin bet ≈ 0.44 coins
// House edge ≈ 56%

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  slot: number;
  path: { x: number; y: number }[];
}

export function PlinkoTab({ player, onClose }: Props) {
  const [bet, setBet] = useState(25);
  const [dropping, setDropping] = useState(false);
  const [balls, setBalls] = useState<BallState[]>([]);
  const [lastWin, setLastWin] = useState<{ amount: number; multiplier: number } | null>(null);
  const [totalBet, setTotalBet] = useState(0);
  const [totalWon, setTotalWon] = useState(0);
  const [history, setHistory] = useState<{ bet: number; multiplier: number; won: number }[]>([]);
  const [showStats, setShowStats] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const ballRef = useRef<BallState | null>(null);
  const droppingRef = useRef(false); // immediate lock — prevents spam clicks

  useEscapeKey(() => onClose?.(), !!onClose);

  // Board dimensions
  const boardWidth = (COLS + 1) * PEG_SPACING;
  const boardHeight = (ROWS + 3) * PEG_SPACING;

  // Get peg positions
  const getPegs = useCallback(() => {
    const pegs: { x: number; y: number; row: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      const pegsInRow = row + 3;
      const rowWidth = (pegsInRow - 1) * PEG_SPACING;
      const startX = (boardWidth - rowWidth) / 2;
      for (let col = 0; col < pegsInRow; col++) {
        pegs.push({
          x: startX + col * PEG_SPACING,
          y: (row + 1.5) * PEG_SPACING,
          row,
        });
      }
    }
    return pegs;
  }, [boardWidth]);

  // Simulate ball path (pre-calculated, not physics)
  const simulateBall = useCallback((): { path: { x: number; y: number }[]; slot: number } => {
    const path: { x: number; y: number }[] = [];
    let x = boardWidth / 2 + (Math.random() - 0.5) * 10;
    let y = PEG_SPACING * 0.5;
    path.push({ x, y });

    for (let row = 0; row < ROWS; row++) {
      const pegsInRow = row + 3;
      const rowWidth = (pegsInRow - 1) * PEG_SPACING;
      const startX = (boardWidth - rowWidth) / 2;

      // Ball goes left or right at each row
      const goRight = Math.random() > 0.5;
      const bounce = (Math.random() * 0.3 + 0.7) * PEG_SPACING * 0.5;
      x += goRight ? bounce : -bounce;

      // Clamp to board
      const minX = PEG_SPACING;
      const maxX = boardWidth - PEG_SPACING;
      x = Math.max(minX, Math.min(maxX, x));

      y = (row + 2) * PEG_SPACING;
      path.push({ x, y });
    }

    // Final position → determine slot
    const slotWidth = boardWidth / MULTIPLIERS.length;
    let slot = Math.floor(x / slotWidth);
    slot = Math.max(0, Math.min(MULTIPLIERS.length - 1, slot));

    // Drop to bottom
    const slotX = (slot + 0.5) * slotWidth;
    path.push({ x: slotX, y: boardHeight - PEG_SPACING * 0.5 });

    return { path, slot };
  }, [boardWidth, boardHeight]);

  // Draw the board
  const draw = useCallback((activeBall?: { x: number; y: number } | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = boardWidth * dpr;
    canvas.height = boardHeight * dpr;
    canvas.style.width = `${boardWidth}px`;
    canvas.style.height = `${boardHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, boardWidth, boardHeight);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, boardHeight);
    bg.addColorStop(0, '#0a0a1a');
    bg.addColorStop(1, '#111128');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, boardWidth, boardHeight);

    // Draw pegs
    const pegs = getPegs();
    pegs.forEach(peg => {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, PEG_RADIUS, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(peg.x, peg.y, 0, peg.x, peg.y, PEG_RADIUS);
      gradient.addColorStop(0, '#666');
      gradient.addColorStop(1, '#333');
      ctx.fillStyle = gradient;
      ctx.fill();
    });

    // Draw multiplier slots at bottom
    const slotWidth = boardWidth / MULTIPLIERS.length;
    MULTIPLIERS.forEach((mult, i) => {
      const x = i * slotWidth;
      const y = boardHeight - PEG_SPACING;
      const color = MULTIPLIER_COLORS[mult] || '#22C55E';

      ctx.fillStyle = color + '30';
      ctx.fillRect(x + 2, y, slotWidth - 4, PEG_SPACING - 4);

      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y, slotWidth - 4, PEG_SPACING - 4);

      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${mult}x`, x + slotWidth / 2, y + (PEG_SPACING - 4) / 2);
    });

    // Draw active ball
    if (activeBall) {
      ctx.beginPath();
      ctx.arc(activeBall.x, activeBall.y, BALL_RADIUS, 0, Math.PI * 2);
      const ballGrad = ctx.createRadialGradient(activeBall.x - 2, activeBall.y - 2, 0, activeBall.x, activeBall.y, BALL_RADIUS);
      ballGrad.addColorStop(0, '#FFD700');
      ballGrad.addColorStop(1, '#FF8C00');
      ctx.fillStyle = ballGrad;
      ctx.fill();

      // Glow
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(activeBall.x, activeBall.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [boardWidth, boardHeight, getPegs]);

  // Initial draw
  useEffect(() => { draw(); }, [draw]);

  // Drop ball — uses ref lock + Firestore transaction to prevent negative balance
  const dropBall = async () => {
    // Ref-based lock: blocks immediately, before React re-renders
    if (droppingRef.current) return;
    if ((player.coins || 0) < bet) return;
    droppingRef.current = true;
    setDropping(true);
    setLastWin(null);

    // Deduct bet via transaction — atomic check-and-deduct prevents going negative
    const playerRef = doc(db, 'players', player.uid);
    try {
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(playerRef);
        if (!snap.exists()) throw new Error('Player not found');
        const currentCoins = snap.data().coins || 0;
        if (currentCoins < bet) throw new Error('Insufficient coins');
        txn.update(playerRef, {
          coins: increment(-bet),
          totalCoinsSpent: increment(bet),
        });
      });
    } catch {
      droppingRef.current = false;
      setDropping(false);
      return;
    }

    setTotalBet(prev => prev + bet);

    // Simulate path
    const { path, slot } = simulateBall();
    const multiplier = MULTIPLIERS[slot];
    const winAmount = Math.floor(bet * multiplier);

    // Animate ball along path
    let step = 0;
    const totalSteps = path.length;
    const STEP_DURATION = 120; // ms per step

    const animate = () => {
      if (step < totalSteps) {
        const pos = path[step];
        draw(pos);
        step++;
        animRef.current = window.setTimeout(animate, STEP_DURATION) as unknown as number;
      } else {
        finishDrop(winAmount, multiplier, slot);
      }
    };

    animate();
  };

  const finishDrop = async (winAmount: number, multiplier: number, slot: number) => {
    if (winAmount > 0) {
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(winAmount) });
    }

    addDoc(collection(db, 'plinko-drops'), {
      playerId: player.uid,
      playerName: player.username || 'Anonymous',
      bet,
      multiplier,
      won: winAmount,
      slot,
      timestamp: Date.now(),
    }).catch(() => {});

    setLastWin({ amount: winAmount, multiplier });
    setTotalWon(prev => prev + winAmount);
    setHistory(prev => [{ bet, multiplier, won: winAmount }, ...prev.slice(0, 19)]);
    draw(null);
    droppingRef.current = false;
    setDropping(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, []);

  const sessionProfit = totalWon - totalBet;

  return (
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #111128 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <CircleDot size={22} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">Plinko</h2>
            <p className="text-gray-500 text-xs">Drop the ball, win coins!</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowStats(!showStats)}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10">
            <BarChart3 size={16} className="text-gray-400" />
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 bg-white/5 rounded-lg hover:bg-white/10">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Controls */}
        <div className="w-[220px] p-4 border-r border-white/5 flex flex-col gap-4">
          {/* Balance */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/5">
            <div className="text-gray-500 text-[10px] uppercase">Balance</div>
            <div className="text-yellow-400 font-bold text-xl flex items-center gap-1">
              <Coins size={18} /> {Math.floor(player.coins || 0)}
            </div>
          </div>

          {/* Bet selection */}
          <div>
            <div className="text-gray-400 text-xs mb-2 font-medium">Bet Amount</div>
            <div className="grid grid-cols-2 gap-2">
              {BET_OPTIONS.map(b => (
                <button key={b} onClick={() => !dropping && setBet(b)}
                  className={`py-2.5 rounded-lg text-sm font-bold transition-all ${
                    bet === b
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shadow-lg shadow-yellow-500/10'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Drop button */}
          <button onClick={dropBall} disabled={dropping || (player.coins || 0) < bet}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              dropping
                ? 'bg-gray-700 text-gray-500 cursor-wait'
                : (player.coins || 0) < bet
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black hover:from-yellow-400 hover:to-orange-400 shadow-lg shadow-yellow-500/20'
            }`}>
            {dropping ? (
              <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Dropping...</>
            ) : (
              <><ChevronDown size={18} /> DROP — {bet} coins</>
            )}
          </button>

          {/* Last win */}
          <AnimatePresence>
            {lastWin && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className={`rounded-xl p-3 border text-center ${
                  lastWin.multiplier >= 1
                    ? 'bg-green-500/10 border-green-500/20'
                    : lastWin.multiplier > 0
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                }`}>
                <div className={`text-2xl font-bold ${
                  lastWin.multiplier >= 1 ? 'text-green-400' : lastWin.multiplier > 0 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {lastWin.multiplier}x
                </div>
                <div className={`text-sm font-bold ${lastWin.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {lastWin.amount > 0 ? `+${lastWin.amount}` : '0'} coins
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Session stats */}
          <div className="bg-black/30 rounded-xl p-3 border border-white/5 space-y-2">
            <div className="text-gray-500 text-[10px] uppercase">Session</div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Bet total</span>
              <span className="text-white">{totalBet}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Won total</span>
              <span className="text-white">{totalWon}</span>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-gray-400">Profit</span>
              <span className={sessionProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                {sessionProfit >= 0 ? '+' : ''}{sessionProfit}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Board */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>
        </div>

        {/* Right: History */}
        {showStats && (
          <div className="w-[180px] p-4 border-l border-white/5 overflow-y-auto">
            <div className="text-gray-400 text-xs font-medium mb-2">Drop History</div>
            {history.length === 0 && <p className="text-gray-600 text-xs">No drops yet</p>}
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="bg-black/30 rounded-lg p-2 border border-white/5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bet {h.bet}</span>
                    <span className={`font-bold ${
                      h.multiplier >= 1 ? 'text-green-400' : h.multiplier > 0 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{h.multiplier}x</span>
                  </div>
                  <div className={`font-bold ${h.won > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {h.won > 0 ? `+${h.won}` : '0'} coins
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
