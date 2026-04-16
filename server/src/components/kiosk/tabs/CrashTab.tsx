'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, onSnapshot, setDoc } from 'firebase/firestore';
import { Coins, Zap, Trophy, ChevronDown, Settings2, TrendingUp, Rocket } from 'lucide-react';

// ─── Crash Point Generator ──────────────────────────────────────────────────
// bias: 0 = house always wins (crash early), 50 = fair, 100 = player always wins (crash late)
function generateCrashPoint(bias: number): number {
  const r = Math.random();

  // House edge based on bias
  // bias 0 → 20% edge, bias 50 → 3% edge, bias 100 → 0.2% edge
  let houseEdge: number;
  if (bias <= 50) {
    houseEdge = 0.03 + ((50 - bias) / 50) * 0.17;
  } else {
    houseEdge = 0.03 - ((bias - 50) / 50) * 0.028;
  }

  // Standard crash formula: exponential distribution
  let crashPoint = (1 - houseEdge) / (1 - r);

  // Extra house advantage for low bias: cap maximum crash point
  if (bias < 25) {
    const maxCap = 1.5 + (bias / 25) * 8.5; // 1.5x to 10x
    crashPoint = Math.min(crashPoint, maxCap);
  } else if (bias < 40) {
    const maxCap = 10 + ((bias - 25) / 15) * 40; // 10x to 50x
    crashPoint = Math.min(crashPoint, maxCap);
  }

  // Extra player advantage for high bias: boost crash point
  if (bias > 70) {
    const boost = 1 + ((bias - 70) / 30) * 2.5; // 1x to 3.5x multiplier
    crashPoint *= boost;
  }

  return Math.max(1, Math.round(crashPoint * 100) / 100);
}

// ─── Multiplier growth curve ────────────────────────────────────────────────
// Exponential growth: starts slow, accelerates
const GROWTH_RATE = 0.00008; // per ms — reaches ~2x in ~9s, ~5x in ~20s, ~20x in ~37s

function getMultiplierAtTime(elapsedMs: number): number {
  return Math.round(Math.exp(GROWTH_RATE * elapsedMs) * 100) / 100;
}

function getTimeForMultiplier(mult: number): number {
  return Math.log(mult) / GROWTH_RATE;
}

type GameState = 'waiting' | 'running' | 'crashed';

interface CrashTabProps {
  player: any;
}

export function CrashTab({ player }: CrashTabProps) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // ─── Game State ────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [betAmount, setBetAmount] = useState(10);
  const [customBet, setCustomBet] = useState('10');
  const [autoCashout, setAutoCashout] = useState('');
  const [currentMult, setCurrentMult] = useState(1);
  const [crashPoint, setCrashPoint] = useState(0);
  const [cashedOut, setCashedOut] = useState(false);
  const [cashoutMult, setCashoutMult] = useState(0);
  const [lastWins, setLastWins] = useState<{ crash: number; bet: number; cashout: number; profit: number; time: number }[]>([]);
  const [totalProfit, setTotalProfit] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);

  // Refs for animation loop
  const gameStateRef = useRef<GameState>('waiting');
  const startTimeRef = useRef(0);
  const crashPointRef = useRef(0);
  const betRef = useRef(10);
  const cashedOutRef = useRef(false);
  const cashoutMultRef = useRef(0);
  const autoCashoutRef = useRef(0);
  const graphPointsRef = useRef<{ t: number; m: number }[]>([]);

  // ─── Admin Bias ────────────────────────────────────────────────────────
  const [bias, setBias] = useState(50);
  const [showAdmin, setShowAdmin] = useState(false);
  const biasRef = useRef(50);

  const playerCoins = player?.coins ?? 0;
  const isAdmin = player?.username === 'مالبورو' || player?.isAdmin;

  useEffect(() => { biasRef.current = bias; }, [bias]);

  // Load bias from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'game-settings', 'crash'), (snap) => {
      if (snap.exists() && typeof snap.data().bias === 'number') {
        setBias(snap.data().bias);
        biasRef.current = snap.data().bias;
      }
    });
    return () => unsub();
  }, []);

  const saveBias = useCallback(async (val: number) => {
    setBias(val);
    biasRef.current = val;
    try {
      await setDoc(doc(db, 'game-settings', 'crash'), { bias: val }, { merge: true });
    } catch (e) {
      console.error('Failed to save crash bias:', e);
    }
  }, []);

  // ─── Start Round ───────────────────────────────────────────────────────
  const startRound = useCallback(async () => {
    if (playerCoins < betAmount || betAmount <= 0 || gameStateRef.current !== 'waiting') return;

    // Deduct bet
    try {
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-betAmount) });
    } catch (e) {
      console.error('Failed to deduct coins:', e);
      return;
    }

    // Generate crash point
    const cp = generateCrashPoint(biasRef.current);
    crashPointRef.current = cp;
    setCrashPoint(cp);
    betRef.current = betAmount;
    cashedOutRef.current = false;
    setCashedOut(false);
    cashoutMultRef.current = 0;
    setCashoutMult(0);
    graphPointsRef.current = [];

    // Parse auto-cashout
    const ac = parseFloat(autoCashout);
    autoCashoutRef.current = (!isNaN(ac) && ac > 1) ? ac : 0;

    // Start
    startTimeRef.current = performance.now();
    gameStateRef.current = 'running';
    setGameState('running');
    setCurrentMult(1);
    setTotalRounds(p => p + 1);
  }, [playerCoins, betAmount, player, autoCashout]);

  // ─── Cash Out ──────────────────────────────────────────────────────────
  const cashOut = useCallback((mult: number) => {
    if (cashedOutRef.current || gameStateRef.current !== 'running') return;

    cashedOutRef.current = true;
    cashoutMultRef.current = mult;
    setCashedOut(true);
    setCashoutMult(mult);

    const winAmount = Math.floor(betRef.current * mult);
    const profit = winAmount - betRef.current;

    // Credit winnings
    if (winAmount > 0) {
      updateDoc(doc(db, 'players', player.uid), { coins: increment(winAmount) }).catch(console.error);
    }

    setTotalProfit(p => p + profit);
  }, [player]);

  // ─── Handle crash ─────────────────────────────────────────────────────
  const handleCrash = useCallback((cp: number) => {
    gameStateRef.current = 'crashed';
    setGameState('crashed');

    const didCashout = cashedOutRef.current;
    const coMult = cashoutMultRef.current;
    const bet = betRef.current;
    const profit = didCashout ? Math.floor(bet * coMult) - bet : -bet;

    setLastWins(prev => [{
      crash: cp,
      bet,
      cashout: didCashout ? coMult : 0,
      profit,
      time: Date.now(),
    }, ...prev].slice(0, 30));

    if (!didCashout) {
      setTotalProfit(p => p - bet);
    }

    // Reset after delay
    setTimeout(() => {
      gameStateRef.current = 'waiting';
      setGameState('waiting');
      setCurrentMult(1);
      setCrashPoint(0);
      setCashedOut(false);
      setCashoutMult(0);
      graphPointsRef.current = [];
    }, 2500);
  }, []);

  // ─── Render Loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    const loop = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(loop); return; }

      const W = canvas.width;
      const H = canvas.height;

      // ── Update game state ──
      if (gameStateRef.current === 'running') {
        const elapsed = performance.now() - startTimeRef.current;
        const mult = getMultiplierAtTime(elapsed);
        setCurrentMult(mult);

        // Record graph point
        if (graphPointsRef.current.length === 0 || elapsed - graphPointsRef.current[graphPointsRef.current.length - 1].t > 30) {
          graphPointsRef.current.push({ t: elapsed, m: mult });
        }

        // Auto-cashout check
        if (!cashedOutRef.current && autoCashoutRef.current > 0 && mult >= autoCashoutRef.current) {
          cashOut(autoCashoutRef.current);
        }

        // Crash check
        if (mult >= crashPointRef.current) {
          handleCrash(crashPointRef.current);
        }
      }

      // ── Render ──
      // Background
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const state = gameStateRef.current;
      const points = graphPointsRef.current;

      if (state === 'waiting') {
        // ── Waiting state ──
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PLACE YOUR BET', W / 2, H / 2 - 15);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.font = '13px monospace';
        ctx.fillText('Set amount and click BET to start', W / 2, H / 2 + 15);

      } else if (state === 'running' || state === 'crashed') {
        const isCrashed = state === 'crashed';
        const cp = crashPointRef.current;

        // Graph area
        const graphPadL = 60;
        const graphPadR = 30;
        const graphPadT = 80;
        const graphPadB = 50;
        const gW = W - graphPadL - graphPadR;
        const gH = H - graphPadT - graphPadB;

        // Determine Y axis range
        const maxMult = isCrashed ? cp : Math.max(2, (points[points.length - 1]?.m ?? 1) * 1.3);
        const maxTime = isCrashed
          ? getTimeForMultiplier(cp)
          : (points[points.length - 1]?.t ?? 1000);

        // Y axis labels
        const ySteps = 5;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= ySteps; i++) {
          const val = 1 + ((maxMult - 1) * i / ySteps);
          const y = graphPadT + gH - (i / ySteps) * gH;
          ctx.fillText(`${val.toFixed(1)}x`, graphPadL - 8, y);
          // Grid line
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.beginPath(); ctx.moveTo(graphPadL, y); ctx.lineTo(W - graphPadR, y); ctx.stroke();
        }

        // Draw curve
        if (points.length > 1) {
          const lineColor = isCrashed
            ? (cashedOutRef.current ? '#39FF14' : '#FF0040')
            : '#39FF14';

          // Gradient fill under curve
          const grad = ctx.createLinearGradient(0, graphPadT, 0, graphPadT + gH);
          grad.addColorStop(0, (isCrashed && !cashedOutRef.current ? '#FF004025' : '#39FF1418'));
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(graphPadL, graphPadT + gH);
          for (const p of points) {
            const px = graphPadL + (p.t / maxTime) * gW;
            const py = graphPadT + gH - ((p.m - 1) / (maxMult - 1)) * gH;
            ctx.lineTo(px, Math.max(graphPadT, py));
          }
          // Close at bottom
          const lastPx = graphPadL + (points[points.length - 1].t / maxTime) * gW;
          ctx.lineTo(lastPx, graphPadT + gH);
          ctx.closePath();
          ctx.fill();

          // Line
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = lineColor;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          for (let i = 0; i < points.length; i++) {
            const px = graphPadL + (points[i].t / maxTime) * gW;
            const py = graphPadT + gH - ((points[i].m - 1) / (maxMult - 1)) * gH;
            if (i === 0) ctx.moveTo(px, Math.max(graphPadT, py));
            else ctx.lineTo(px, Math.max(graphPadT, py));
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Dot at tip
          if (!isCrashed && points.length > 0) {
            const last = points[points.length - 1];
            const px = graphPadL + (last.t / maxTime) * gW;
            const py = graphPadT + gH - ((last.m - 1) / (maxMult - 1)) * gH;
            ctx.fillStyle = '#39FF14';
            ctx.shadowColor = '#39FF14';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(px, Math.max(graphPadT, py), 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        // Big multiplier text
        const displayMult = isCrashed ? cp : (points[points.length - 1]?.m ?? 1);
        const multColor = isCrashed
          ? (cashedOutRef.current ? '#39FF14' : '#FF0040')
          : '#ffffff';

        ctx.fillStyle = multColor;
        ctx.shadowColor = multColor;
        ctx.shadowBlur = isCrashed ? 25 : 10;
        ctx.font = `bold ${isCrashed ? 56 : 48}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${displayMult.toFixed(2)}×`, W / 2, graphPadT / 2 + 5);
        ctx.shadowBlur = 0;

        // Status text
        if (isCrashed && !cashedOutRef.current) {
          ctx.fillStyle = '#FF0040';
          ctx.font = 'bold 20px monospace';
          ctx.fillText('CRASHED', W / 2, H - 20);
        } else if (isCrashed && cashedOutRef.current) {
          const winAmt = Math.floor(betRef.current * cashoutMultRef.current);
          ctx.fillStyle = '#39FF14';
          ctx.font = 'bold 18px monospace';
          ctx.fillText(`CASHED OUT +${(winAmt - betRef.current).toLocaleString()}`, W / 2, H - 20);
        }

        // Cashout marker on graph
        if (cashedOutRef.current && cashoutMultRef.current > 1 && points.length > 0) {
          const coTime = getTimeForMultiplier(cashoutMultRef.current);
          const px = graphPadL + (coTime / maxTime) * gW;
          const py = graphPadT + gH - ((cashoutMultRef.current - 1) / (maxMult - 1)) * gH;
          // Dashed horizontal line
          ctx.strokeStyle = '#39FF1460';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(graphPadL, Math.max(graphPadT, py));
          ctx.lineTo(W - graphPadR, Math.max(graphPadT, py));
          ctx.stroke();
          ctx.setLineDash([]);
          // Label
          ctx.fillStyle = '#39FF14';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${cashoutMultRef.current.toFixed(2)}×`, W - graphPadR + 4, Math.max(graphPadT, py));
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [cashOut, handleCrash]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ─── Bet helpers ──────────────────────────────────────────────────────
  const handleCustomBetChange = (val: string) => {
    setCustomBet(val);
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) setBetAmount(n);
  };
  const halfBet = () => { const v = Math.max(1, Math.floor(betAmount / 2)); setBetAmount(v); setCustomBet(String(v)); };
  const doubleBet = () => { const v = betAmount * 2; setBetAmount(v); setCustomBet(String(v)); };
  const setQuickBet = (v: number) => { setBetAmount(v); setCustomBet(String(v)); };

  const betOptions = [5, 10, 25, 50, 100, 250, 500, 1000];
  const isWaiting = gameState === 'waiting';
  const isRunning = gameState === 'running';
  const isCrashed = gameState === 'crashed';

  return (
    <div className="w-full h-full flex gap-3 p-3" style={{ minHeight: 0 }}>
      {/* ═══ Left Panel — Controls ═══ */}
      <div className="w-[270px] flex-shrink-0 flex flex-col gap-2.5 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>

        {/* Bet Amount */}
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">{ar ? 'قيمة الرهان' : 'Bet Amount'}</div>

          <div className="flex items-center gap-1.5 mb-2.5">
            <button onClick={halfBet} disabled={!isWaiting} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 transition-all hover:text-white disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>½</button>
            <div className="flex-1 relative">
              <input
                type="number"
                value={customBet}
                onChange={e => handleCustomBetChange(e.target.value)}
                disabled={!isWaiting}
                className="w-full text-center py-1.5 rounded-lg text-sm font-bold text-white bg-transparent outline-none disabled:opacity-50"
                style={{ border: '1px solid rgba(57,255,20,0.3)', background: 'rgba(57,255,20,0.04)' }}
                min={1}
              />
              <Coins size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400" />
            </div>
            <button onClick={doubleBet} disabled={!isWaiting} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-400 transition-all hover:text-white disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>2×</button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {betOptions.map(amount => (
              <button
                key={amount}
                onClick={() => setQuickBet(amount)}
                disabled={!isWaiting}
                className="py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
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
            <span className="text-[11px] text-gray-500">{ar ? 'الرصيد:' : 'Balance:'} <span className="text-white font-bold">{Math.floor(playerCoins).toLocaleString()}</span></span>
          </div>
        </div>

        {/* Auto Cashout */}
        <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-gray-500 mb-2 font-mono uppercase tracking-wider">{ar ? 'سحب تلقائي' : 'Auto Cashout'}</div>
          <div className="relative">
            <input
              type="number"
              value={autoCashout}
              onChange={e => setAutoCashout(e.target.value)}
              placeholder="e.g. 2.00"
              disabled={!isWaiting}
              className="w-full text-center py-2 rounded-lg text-sm font-bold text-white bg-transparent outline-none placeholder-gray-700 disabled:opacity-50"
              style={{ border: '1px solid rgba(255,204,0,0.2)', background: 'rgba(255,204,0,0.03)' }}
              min={1.01}
              step={0.1}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">×</span>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-2">
            {[1.5, 2, 3, 5, 10, 20, 50, 100].map(v => (
              <button
                key={v}
                onClick={() => setAutoCashout(String(v))}
                disabled={!isWaiting}
                className="py-1 rounded text-[10px] font-bold transition-all disabled:opacity-30"
                style={{
                  background: autoCashout === String(v) ? 'rgba(255,204,0,0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${autoCashout === String(v) ? 'rgba(255,204,0,0.4)' : 'rgba(255,255,255,0.05)'}`,
                  color: autoCashout === String(v) ? '#FFCC00' : '#555',
                }}
              >
                {v}×
              </button>
            ))}
          </div>
          <div className="text-[9px] text-gray-600 mt-1.5">{ar ? 'اتركها فارغة للسحب اليدوي فقط' : 'Leave empty for manual cashout only'}</div>
        </div>

        {/* Action Button */}
        {isWaiting && (
          <button
            onClick={startRound}
            disabled={playerCoins < betAmount || betAmount <= 0}
            className="w-full py-4 rounded-xl text-base font-black uppercase tracking-widest transition-all active:scale-[0.97]"
            style={{
              background: playerCoins >= betAmount && betAmount > 0
                ? 'linear-gradient(135deg, #39FF14, #00C853)'
                : 'rgba(255,255,255,0.04)',
              color: playerCoins >= betAmount && betAmount > 0 ? '#000' : '#444',
              boxShadow: playerCoins >= betAmount && betAmount > 0 ? '0 0 25px rgba(57,255,20,0.25)' : 'none',
            }}
          >
            <Rocket size={16} className="inline mr-2" />
            {ar ? 'راهن' : 'Bet'}
          </button>
        )}

        {isRunning && !cashedOut && (
          <button
            onClick={() => cashOut(currentMult)}
            className="w-full py-4 rounded-xl text-base font-black uppercase tracking-widest transition-all active:scale-[0.97] animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #FF6B00, #FF0040)',
              color: '#fff',
              boxShadow: '0 0 30px rgba(255,107,0,0.35)',
            }}
          >
            {ar ? 'اسحب' : 'Cash Out'} {currentMult.toFixed(2)}×
          </button>
        )}

        {isRunning && cashedOut && (
          <div className="w-full py-4 rounded-xl text-center text-sm font-bold uppercase tracking-wider"
            style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.3)', color: '#39FF14' }}>
            {ar ? 'تم السحب @' : 'Cashed Out @'} {cashoutMult.toFixed(2)}×
            <div className="text-xs mt-1 text-green-400/70">+{(Math.floor(betAmount * cashoutMult) - betAmount).toLocaleString()} {ar ? 'ربح' : 'profit'}</div>
          </div>
        )}

        {isCrashed && (
          <div className="w-full py-4 rounded-xl text-center text-sm font-bold uppercase tracking-wider"
            style={{
              background: cashedOut ? 'rgba(57,255,20,0.08)' : 'rgba(255,0,64,0.08)',
              border: `1px solid ${cashedOut ? 'rgba(57,255,20,0.3)' : 'rgba(255,0,64,0.3)'}`,
              color: cashedOut ? '#39FF14' : '#FF0040',
            }}>
            {cashedOut ? `${ar ? 'فزت +' : 'Won +'}${(Math.floor(betAmount * cashoutMult) - betAmount).toLocaleString()}` : `${ar ? 'تحطم @' : 'Crashed @'} ${crashPoint.toFixed(2)}×`}
            <div className="text-[10px] mt-1 text-gray-500">{ar ? 'الجولة التالية تبدأ...' : 'Next round starting...'}</div>
          </div>
        )}

        {/* Session Stats */}
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex justify-between text-[11px]">
            <span className="text-gray-500">{ar ? 'الربح' : 'Profit'}</span>
            <span className={`font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[11px] mt-1">
            <span className="text-gray-500">{ar ? 'الجولات' : 'Rounds'}</span>
            <span className="text-white font-bold">{totalRounds}</span>
          </div>
          <div className="flex justify-between text-[11px] mt-1">
            <span className="text-gray-500">{ar ? 'الانتصارات' : 'Wins'}</span>
            <span className="text-white font-bold">{lastWins.filter(w => w.profit > 0).length}</span>
          </div>
        </div>

        {/* Admin Controls */}
        {isAdmin && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,0,64,0.04)', border: '1px solid rgba(255,0,64,0.15)' }}>
            <button onClick={() => setShowAdmin(!showAdmin)} className="flex items-center gap-2 text-[10px] text-red-400 font-mono uppercase w-full">
              <Settings2 size={12} /> House Edge Control
              <ChevronDown size={10} className={`ml-auto transition-transform ${showAdmin ? 'rotate-180' : ''}`} />
            </button>
            {showAdmin && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">Crash Bias</span>
                    <span className="text-red-400 font-bold">{bias}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={bias} onChange={e => saveBias(Number(e.target.value))} className="w-full accent-red-500" />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                    <span>Early Crash</span>
                    <span>Fair (50)</span>
                    <span>Late Crash</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 30, 50, 65, 80, 95].map(v => (
                    <button key={v} onClick={() => saveBias(v)}
                      className="py-1 rounded text-[9px] font-bold transition-all"
                      style={{
                        background: bias === v ? 'rgba(255,0,64,0.2)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${bias === v ? 'rgba(255,0,64,0.5)' : 'rgba(255,255,255,0.06)'}`,
                        color: bias === v ? '#FF0040' : '#666',
                      }}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-gray-600 leading-relaxed">
                  Low = games crash early (house wins). High = games last longer (player wins). Saved to server.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Center — Crash Graph ═══ */}
      <div className="flex-1 rounded-xl overflow-hidden relative" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      </div>

      {/* ═══ Right Panel — History ═══ */}
      <div className="w-[180px] flex-shrink-0 flex flex-col gap-1.5">
        <div className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Trophy size={10} className="text-yellow-400" /> {ar ? 'سجل الجولات' : 'Round History'}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}>
          {lastWins.length === 0 && (
            <div className="text-[10px] text-gray-700 text-center mt-8">{ar ? 'لا توجد جولات بعد' : 'No rounds yet'}</div>
          )}
          {lastWins.map((win, i) => {
            const won = win.profit > 0;
            const color = won ? '#39FF14' : '#FF0040';
            return (
              <motion.div
                key={win.time + i}
                initial={{ opacity: 0, x: 15, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className="rounded-lg px-2.5 py-1.5"
                style={{ background: color + '0a', border: `1px solid ${color}18` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color: win.crash >= 2 ? '#39FF14' : '#FF0040' }}>
                    {win.crash.toFixed(2)}×
                  </span>
                  <span className={`text-[10px] font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>
                    {won ? '+' : ''}{win.profit.toLocaleString()}
                  </span>
                </div>
                {win.cashout > 0 && (
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    {ar ? 'سُحب @' : 'Cashed @'} {win.cashout.toFixed(2)}×
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
