// NINJA ARENA - Phase 1
// Future phases: Clans, Maps, Attacking other players, Skin abilities,
// Ranked matchmaking, Tournaments, Spectator mode, Replay system

'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA — Main game wrapper
// Supports: VS AI (3 difficulties), Online P2P, Practice (1P sandbox)
// Works on: Desktop (keyboard) + Mobile (touch controls)
// Rewards:  Win=50 coins+100 XP, Lose=10 coins+25 XP
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

import { NinjaArenaEngine, emptyInput } from './NinjaArenaEngine';
import type { InputState, PublicGameState } from './NinjaArenaEngine';
import { NinjaArenaAI } from './NinjaArenaAI';
import type { AIDifficulty } from './NinjaArenaAI';
import { NinjaArenaMultiplayer } from './NinjaArenaMultiplayer';
import { NinjaArenaMobileControls } from './NinjaArenaMobileControls';
import {
  ArenaMenu, ArenaWaiting, ArenaHUD, ArenaBanner, ArenaResults,
} from './NinjaArenaUI';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onScore?: (score: number) => void;
  onClose?: () => void;
  player?: {
    uid: string;
    username: string;
    coins?: number;
    stats?: Record<string, number>;
  };
}

type Screen = 'menu' | 'waiting' | 'fighting' | 'results';
type GameMode = 'solo' | 'online' | 'practice';

const REWARDS = {
  win:  { coins: 50, xp: 100 },
  lose: { coins: 10, xp: 25  },
  draw: { coins: 20, xp: 50  },
};

// ══════════════════════════════════════════════════════════════════════════════

export function NinjaArena({ onScore, onClose, player }: Props) {
  const [screen, setScreen]         = useState<Screen>('menu');
  const [gameMode, setGameMode]     = useState<GameMode>('solo');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(2);
  const [gameState, setGameState]   = useState<PublicGameState | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [xpEarned, setXpEarned]     = useState(0);
  const [opponentName, setOpponentName] = useState('CPU');
  const [isMobile, setIsMobile]     = useState(false);
  const [spritesLoading, setSpritesLoading] = useState(false);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const engineRef    = useRef<NinjaArenaEngine | null>(null);
  const aiRef        = useRef<NinjaArenaAI | null>(null);
  const multiRef     = useRef<NinjaArenaMultiplayer | null>(null);
  const inputRef     = useRef<InputState>(emptyInput());
  const keyRef       = useRef<Record<string, boolean>>({});
  const aiLoopRef    = useRef<number>(0);
  const isHostRef    = useRef(false);
  const multiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameEndedRef = useRef(false);
  const lastGsRef    = useRef<PublicGameState | null>(null);

  // ── Mobile detection ────────────────────────────────────────────────────

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── ESC to menu ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'fighting') return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') handleMenu();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen]);

  // ── Keyboard input ───────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'fighting') return;

    const onDown = (e: KeyboardEvent) => {
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keyRef.current[e.code] = true;
      const inp = keysToInput(keyRef.current);
      inputRef.current = inp;
      engineRef.current?.setInput(0, inp);
      if (gameMode === 'online') multiRef.current?.sendInput(inp);
    };

    const onUp = (e: KeyboardEvent) => {
      keyRef.current[e.code] = false;
      const inp = keysToInput(keyRef.current);
      inputRef.current = inp;
      engineRef.current?.setInput(0, inp);
      if (gameMode === 'online') multiRef.current?.sendInput(inp);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      keyRef.current = {};
    };
  }, [screen, gameMode]);

  // ── Mobile input ─────────────────────────────────────────────────────────

  const handleMobileInput = useCallback((inp: InputState) => {
    inputRef.current = inp;
    engineRef.current?.setInput(0, inp);
    if (gameMode === 'online') multiRef.current?.sendInput(inp);
  }, [gameMode]);

  // ── Core: start a fight ──────────────────────────────────────────────────

  const startFight = useCallback(async (
    mode: GameMode,
    difficulty: AIDifficulty = 2,
    p1: string = player?.username ?? 'Player 1',
    p2: string = 'CPU',
  ) => {
    if (!canvasRef.current) return;
    gameEndedRef.current = false;

    // Stop old session
    engineRef.current?.stop();
    cancelAnimationFrame(aiLoopRef.current);
    aiRef.current = null;

    const engine = new NinjaArenaEngine(canvasRef.current);
    engineRef.current = engine;

    engine.on('stateUpdate', (gs: PublicGameState) => {
      setGameState(gs);
      lastGsRef.current = gs;
    });

    engine.on('gameEnd', ({ winner }: { winner: -1 | 0 | 1 }) => {
      if (gameEndedRef.current) return;
      gameEndedRef.current = true;
      handleGameEnd(winner, mode);
    });

    setSpritesLoading(true);
    await engine.loadSprites();
    setSpritesLoading(false);

    engine.start(p1, p2);

    // AI for solo/practice
    if (mode === 'solo' || mode === 'practice') {
      const ai = new NinjaArenaAI(mode === 'practice' ? 1 : difficulty);
      aiRef.current = ai;

      const aiTick = () => {
        const gs = engine.getState();
        if (gs.phase === 'fight') {
          engine.setInput(1, ai.compute(1, gs));
        }
        aiLoopRef.current = requestAnimationFrame(aiTick);
      };
      aiLoopRef.current = requestAnimationFrame(aiTick);
    }
  }, [player]);

  // ── Handle game end ──────────────────────────────────────────────────────

  const handleGameEnd = useCallback(async (winner: -1 | 0 | 1, mode: GameMode) => {
    const isWin  = winner === 0;
    const isDraw = winner === -1;
    const r = isWin ? REWARDS.win : isDraw ? REWARDS.draw : REWARDS.lose;

    setCoinsEarned(r.coins);
    setXpEarned(r.xp);

    if (player?.uid) {
      try {
        await updateDoc(doc(db, 'players', player.uid), {
          coins:                increment(r.coins),
          'stats.arenaWins':   increment(isWin ? 1 : 0),
          'stats.arenaLosses': increment(!isWin && !isDraw ? 1 : 0),
          'stats.totalWins':   increment(isWin ? 1 : 0),
        });
      } catch {}
    }

    onScore?.(r.coins);

    // Small delay so KO animation finishes
    setTimeout(() => setScreen('results'), 800);
  }, [player, onScore]);

  // ── Menu action handlers ──────────────────────────────────────────────────

  const handleSolo = useCallback(async (diff: AIDifficulty) => {
    setAiDifficulty(diff);
    const names: Record<AIDifficulty, string> = {
      1: 'CPU (Easy)', 2: 'CPU (Medium)', 3: 'CPU (Hard)',
    };
    setOpponentName(names[diff]);
    setScreen('fighting');
    await startFight('solo', diff, player?.username ?? 'Player 1', names[diff]);
  }, [player, startFight]);

  const handlePractice = useCallback(async () => {
    setOpponentName('CPU (Training)');
    setScreen('fighting');
    await startFight('practice', 1, player?.username ?? 'Player 1', 'CPU (Training)');
  }, [player, startFight]);

  const handleOnline = useCallback(async () => {
    if (!player?.uid) {
      // No player — fall back to solo
      handleSolo(2);
      return;
    }
    setScreen('waiting');

    const multi = new NinjaArenaMultiplayer(async (ev) => {
      if (ev.type === 'matched') {
        isHostRef.current = ev.isHost;
        setOpponentName(ev.opponentName);
        setScreen('fighting');

        const p1 = ev.isHost ? (player.username ?? 'Player 1') : ev.opponentName;
        const p2 = ev.isHost ? ev.opponentName : (player.username ?? 'Player 1');
        await startFight('online', 2, p1, p2);

        // Send input at 20fps
        multiIntervalRef.current = setInterval(() => {
          multiRef.current?.sendInput(inputRef.current);
        }, 50);
      } else if (ev.type === 'remoteInput') {
        const remoteIdx: 0 | 1 = isHostRef.current ? 1 : 0;
        engineRef.current?.setInput(remoteIdx, ev.input);
      } else if (ev.type === 'opponentLeft') {
        engineRef.current?.stop();
        setCoinsEarned(15); setXpEarned(30);
        setScreen('results');
      } else if (ev.type === 'error') {
        console.warn('Arena online error:', ev.message);
        setScreen('menu');
      }
    });

    multiRef.current = multi;
    multi.findMatch(player.uid, player.username ?? 'Player 1').catch(() => setScreen('menu'));
  }, [player, startFight, handleSolo]);

  const handleCancelWait = useCallback(async () => {
    await multiRef.current?.cleanup();
    multiRef.current = null;
    setScreen('menu');
  }, []);

  const handleRematch = useCallback(async () => {
    gameEndedRef.current = false;
    setScreen('fighting');
    const names: Record<AIDifficulty, string> = {
      1: 'CPU (Easy)', 2: 'CPU (Medium)', 3: 'CPU (Hard)',
    };
    await startFight('solo', aiDifficulty, player?.username ?? 'Player 1', names[aiDifficulty]);
  }, [aiDifficulty, player, startFight]);

  const handleMenu = useCallback(async () => {
    engineRef.current?.stop();
    cancelAnimationFrame(aiLoopRef.current);
    if (multiIntervalRef.current) clearInterval(multiIntervalRef.current);
    await multiRef.current?.cleanup();
    multiRef.current = null;
    setScreen('menu');
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      cancelAnimationFrame(aiLoopRef.current);
      if (multiIntervalRef.current) clearInterval(multiIntervalRef.current);
      multiRef.current?.cleanup();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const p1Name = player?.username ?? 'Player 1';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: '#000', overflow: 'hidden', userSelect: 'none',
    }}>

      {/* Canvas — always mounted, engine draws into it */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain', display: 'block',
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Loading overlay */}
      {spritesLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)',
          color: '#44ff88', fontFamily: 'monospace', fontSize: 18, letterSpacing: 3,
        }}>
          LOADING...
        </div>
      )}

      {/* React overlays */}
      <AnimatePresence mode="wait">
        {screen === 'menu' && (
          <ArenaMenu
            key="menu"
            onSolo={handleSolo}
            onOnline={handleOnline}
            onPractice={handlePractice}
            onClose={onClose ?? (() => {})}
            isMobile={isMobile}
          />
        )}

        {screen === 'waiting' && (
          <ArenaWaiting key="waiting" onCancel={handleCancelWait} />
        )}

        {screen === 'results' && (lastGsRef.current ?? gameState) && (
          <ArenaResults
            key="results"
            gs={(lastGsRef.current ?? gameState)!}
            p1Name={p1Name}
            p2Name={opponentName}
            isSolo={gameMode !== 'online'}
            coinsEarned={coinsEarned}
            xpEarned={xpEarned}
            onRematch={handleRematch}
            onMenu={handleMenu}
          />
        )}
      </AnimatePresence>

      {/* Fight HUD */}
      {screen === 'fighting' && gameState && (
        <>
          <ArenaHUD gs={gameState} p1Name={p1Name} p2Name={opponentName} />
          <ArenaBanner gs={gameState} p1Name={p1Name} p2Name={opponentName} />
          {isMobile && <NinjaArenaMobileControls onInput={handleMobileInput} />}

          {!isMobile && (
            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.18)', fontSize: 9, fontFamily: 'monospace',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              WASD=move · Space=jump · J=light · K=heavy · L=block · Q=special · ESC=quit
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Keyboard → InputState ─────────────────────────────────────────────────────

function keysToInput(keys: Record<string, boolean>): InputState {
  return {
    left:    !!(keys['KeyA'] || keys['ArrowLeft']),
    right:   !!(keys['KeyD'] || keys['ArrowRight']),
    up:      !!(keys['Space'] || keys['KeyW'] || keys['ArrowUp']),
    light:   !!(keys['KeyJ'] || keys['KeyZ']),
    heavy:   !!(keys['KeyK'] || keys['KeyX']),
    block:   !!(keys['KeyL'] || keys['KeyC']),
    special: !!(keys['KeyQ']),
  };
}

export default NinjaArena;
