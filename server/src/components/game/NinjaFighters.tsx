// NINJA FIGHTERS - KOF Style - Phase 1
// Future: More characters, special moves, combos, ranked mode, tournaments

'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// NINJA FIGHTERS — KOF-style 2D fighting game
// Modes: Solo vs AI (3 difficulties), Local 2P, Online P2P
// Rewards: Win=75 coins+150 XP, Lose=15 coins+30 XP
// Mobile: D-pad left + attack buttons right, multi-touch
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';

import { NinjaFightersEngine, emptyInput } from './NinjaFightersEngine';
import type { InputState, PublicGameState } from './NinjaFightersEngine';
import { NinjaFightersAI } from './NinjaFightersAI';
import type { AIDifficulty } from './NinjaFightersAI';
import { NinjaFightersMultiplayer } from './NinjaFightersMultiplayer';
import { NinjaFightersMobileControls } from './NinjaFightersMobileControls';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onScore?: (score: number) => void;
  onClose?: () => void;
  player?: {
    uid: string;
    username: string;
    coins?: number;
    stats?: Record<string, any>;
  };
}

type Screen = 'menu' | 'waiting' | 'fighting' | 'results';
type GameMode = 'solo' | 'local2p' | 'online';

const REWARDS = {
  win:  { coins: 75,  xp: 150 },
  lose: { coins: 15,  xp: 30  },
  draw: { coins: 25,  xp: 50  },
};

const DIFF_LABELS: Record<AIDifficulty, string> = {
  1: 'EASY', 2: 'MEDIUM', 3: 'HARD',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Player 1: WASD + Space/J/K/L/Q
// Player 2 (local): Arrow keys + Enter/U/I/O/P
function keysToInputP1(keys: Record<string, boolean>): InputState {
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

function keysToInputP2(keys: Record<string, boolean>): InputState {
  return {
    left:    !!(keys['Numpad4'] || keys['KeyH']),
    right:   !!(keys['Numpad6'] || keys['Semicolon']),
    up:      !!(keys['Numpad8'] || keys['KeyU'] || keys['Enter']),
    light:   !!(keys['Numpad1'] || keys['KeyN']),
    heavy:   !!(keys['Numpad2'] || keys['KeyM']),
    block:   !!(keys['Numpad3'] || keys['Comma']),
    special: !!(keys['Numpad0'] || keys['KeyP']),
  };
}

// ══════════════════════════════════════════════════════════════════════════════

export function NinjaFighters({ onScore, onClose, player }: Props) {
  const [screen, setScreen]           = useState<Screen>('menu');
  const [gameMode, setGameMode]       = useState<GameMode>('solo');
  const [aiDiff, setAiDiff]           = useState<AIDifficulty>(2);
  const [gameState, setGameState]     = useState<PublicGameState | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [xpEarned, setXpEarned]       = useState(0);
  const [opponentName, setOpponentName] = useState('CPU');
  const [isMobile, setIsMobile]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [winnerName, setWinnerName]   = useState('');

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const engineRef   = useRef<NinjaFightersEngine | null>(null);
  const aiRef       = useRef<NinjaFightersAI | null>(null);
  const multiRef    = useRef<NinjaFightersMultiplayer | null>(null);
  const keyRef      = useRef<Record<string, boolean>>({});
  const inputRef    = useRef<InputState>(emptyInput());
  const aiLoopRef   = useRef<number>(0);
  const isHostRef   = useRef(false);
  const multiIntRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef    = useRef(false);
  const lastGsRef   = useRef<PublicGameState | null>(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ESC to menu
  useEffect(() => {
    if (screen !== 'fighting') return;
    const h = (e: KeyboardEvent) => { if (e.code === 'Escape') goMenu(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [screen]);

  // Keyboard input
  useEffect(() => {
    if (screen !== 'fighting') return;

    const onDown = (e: KeyboardEvent) => {
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      keyRef.current[e.code] = true;
      const inp = keysToInputP1(keyRef.current);
      inputRef.current = inp;
      engineRef.current?.setInput(0, inp);
      if (gameMode === 'local2p') engineRef.current?.setInput(1, keysToInputP2(keyRef.current));
      if (gameMode === 'online') multiRef.current?.sendInput(inp);
    };

    const onUp = (e: KeyboardEvent) => {
      keyRef.current[e.code] = false;
      const inp = keysToInputP1(keyRef.current);
      inputRef.current = inp;
      engineRef.current?.setInput(0, inp);
      if (gameMode === 'local2p') engineRef.current?.setInput(1, keysToInputP2(keyRef.current));
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

  // Mobile input (P1 only)
  const handleMobileInput = useCallback((inp: InputState) => {
    inputRef.current = inp;
    engineRef.current?.setInput(0, inp);
    if (gameMode === 'online') multiRef.current?.sendInput(inp);
  }, [gameMode]);

  // ── Start fight ───────────────────────────────────────────────────────────

  const startFight = useCallback(async (
    mode: GameMode,
    diff: AIDifficulty = 2,
    p1: string = player?.username ?? 'Player 1',
    p2: string = 'CPU',
  ) => {
    if (!canvasRef.current) return;
    endedRef.current = false;

    engineRef.current?.stop();
    cancelAnimationFrame(aiLoopRef.current);
    aiRef.current = null;

    const engine = new NinjaFightersEngine(canvasRef.current);
    engineRef.current = engine;

    engine.on('stateUpdate', (gs: PublicGameState) => {
      setGameState(gs);
      lastGsRef.current = gs;
    });

    engine.on('gameEnd', ({ winner }: { winner: -1 | 0 | 1 }) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const wName = winner === 0 ? p1 : winner === 1 ? p2 : '';
      setWinnerName(wName);
      handleGameEnd(winner, mode, p1, p2);
    });

    setLoading(true);
    await engine.loadSprites();
    setLoading(false);

    engine.start(p1, p2);

    if (mode === 'solo') {
      const ai = new NinjaFightersAI(diff);
      aiRef.current = ai;
      const tick = () => {
        const gs = engine.getState();
        if (gs.phase === 'fight') engine.setInput(1, ai.compute(1, gs));
        aiLoopRef.current = requestAnimationFrame(tick);
      };
      aiLoopRef.current = requestAnimationFrame(tick);
    }
  }, [player]);

  // ── Game end ──────────────────────────────────────────────────────────────

  const handleGameEnd = useCallback(async (
    winner: -1 | 0 | 1, mode: GameMode, p1Name: string, _p2Name: string
  ) => {
    const isWin  = (mode === 'online' ? (isHostRef.current ? 0 : 1) : 0) === winner;
    const isDraw = winner === -1;
    const r = isWin ? REWARDS.win : isDraw ? REWARDS.draw : REWARDS.lose;

    setCoinsEarned(r.coins);
    setXpEarned(r.xp);

    if (player?.uid) {
      try {
        await updateDoc(doc(db, 'players', player.uid), {
          coins:                              increment(r.coins),
          'stats.gameStats.ninja-fighters.wins':   increment(winner === 0 ? 1 : 0),
          'stats.gameStats.ninja-fighters.losses': increment(!isWin && !isDraw ? 1 : 0),
          'stats.totalWins':                  increment(isWin ? 1 : 0),
        });
      } catch {}
    }

    onScore?.(r.coins);
    setTimeout(() => setScreen('results'), 900);
  }, [player, onScore]);

  // ── Menu handlers ─────────────────────────────────────────────────────────

  const handleSolo = useCallback(async (diff: AIDifficulty) => {
    setAiDiff(diff);
    const p2Name = `CPU (${DIFF_LABELS[diff]})`;
    setOpponentName(p2Name);
    setGameMode('solo');
    setScreen('fighting');
    await startFight('solo', diff, player?.username ?? 'Player 1', p2Name);
  }, [player, startFight]);

  const handleLocal2P = useCallback(async () => {
    setOpponentName('Player 2');
    setGameMode('local2p');
    setScreen('fighting');
    await startFight('local2p', 2, player?.username ?? 'Player 1', 'Player 2');
  }, [player, startFight]);

  const handleOnline = useCallback(async () => {
    if (!player?.uid) { handleSolo(2); return; }
    setGameMode('online');
    setScreen('waiting');

    const multi = new NinjaFightersMultiplayer(async (ev) => {
      if (ev.type === 'matched') {
        isHostRef.current = ev.isHost;
        setOpponentName(ev.opponentName);
        setScreen('fighting');
        const p1 = ev.isHost ? (player.username ?? 'Player 1') : ev.opponentName;
        const p2 = ev.isHost ? ev.opponentName : (player.username ?? 'Player 1');
        await startFight('online', 2, p1, p2);
        multiIntRef.current = setInterval(() => {
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
        setScreen('menu');
      }
    });

    multiRef.current = multi;
    multi.findMatch(player.uid, player.username ?? 'Player 1').catch(() => setScreen('menu'));
  }, [player, startFight, handleSolo]);

  const handleRematch = useCallback(async () => {
    endedRef.current = false;
    setScreen('fighting');
    const p2Name = `CPU (${DIFF_LABELS[aiDiff]})`;
    await startFight('solo', aiDiff, player?.username ?? 'Player 1', p2Name);
  }, [aiDiff, player, startFight]);

  const goMenu = useCallback(async () => {
    engineRef.current?.stop();
    cancelAnimationFrame(aiLoopRef.current);
    if (multiIntRef.current) clearInterval(multiIntRef.current);
    await multiRef.current?.cleanup();
    multiRef.current = null;
    keyRef.current = {};
    setScreen('menu');
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      cancelAnimationFrame(aiLoopRef.current);
      if (multiIntRef.current) clearInterval(multiIntRef.current);
      multiRef.current?.cleanup();
    };
  }, []);

  const p1Name = player?.username ?? 'Player 1';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: '#000', overflow: 'hidden', userSelect: 'none',
    }}>
      {/* Canvas */}
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

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.8)',
          color: '#FFD700', fontFamily: 'monospace', fontSize: 20, letterSpacing: 4,
        }}>
          LOADING FIGHTERS...
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── MENU ── */}
        {screen === 'menu' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #1a0530 0%, #3d0d6b 40%, #8b1a4a 80%, #c73d2e 100%)',
            }}
          >
            {/* Title */}
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              style={{ textAlign: 'center', marginBottom: 36 }}
            >
              <div style={{
                fontFamily: '"Courier New", monospace', fontWeight: 900,
                fontSize: isMobile ? 32 : 52,
                color: '#FFD700',
                textShadow: '0 0 30px #FF6600, 0 0 60px #FF3300',
                letterSpacing: 4,
                lineHeight: 1.1,
              }}>
                NINJA FIGHTERS
              </div>
              <div style={{
                fontFamily: 'monospace', fontSize: 12,
                color: 'rgba(255,200,50,0.6)', letterSpacing: 6,
                marginTop: 6,
              }}>
                KOF STYLE • 2D FIGHTING
              </div>
            </motion.div>

            {/* Buttons */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12, width: isMobile ? 260 : 320 }}
            >
              {/* Difficulty selector */}
              <div style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,200,50,0.3)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <div style={{
                  color: 'rgba(255,255,255,0.5)', fontSize: 10,
                  fontFamily: 'monospace', letterSpacing: 2, marginBottom: 8,
                }}>
                  AI DIFFICULTY
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([1,2,3] as AIDifficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setAiDiff(d)}
                      style={{
                        flex: 1, padding: '7px 0',
                        background: aiDiff === d ? 'rgba(255,200,50,0.25)' : 'transparent',
                        border: `1.5px solid ${aiDiff === d ? 'rgba(255,200,50,0.8)' : 'rgba(255,255,255,0.2)'}`,
                        borderRadius: 7, cursor: 'pointer',
                        color: aiDiff === d ? '#FFD700' : 'rgba(255,255,255,0.5)',
                        fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                        letterSpacing: 1,
                      }}
                    >
                      {DIFF_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              {/* VS CPU */}
              <MenuBtn
                label="⚔ VS CPU"
                sub={`Difficulty: ${DIFF_LABELS[aiDiff]}`}
                color="255,150,0"
                onClick={() => handleSolo(aiDiff)}
              />

              {/* Local 2P */}
              {!isMobile && (
                <MenuBtn
                  label="👥 LOCAL 2P"
                  sub="Split keyboard — same device"
                  color="100,200,255"
                  onClick={handleLocal2P}
                />
              )}

              {/* Online */}
              <MenuBtn
                label="🌐 ONLINE"
                sub="P2P matchmaking"
                color="150,255,150"
                onClick={handleOnline}
              />

              {/* Close */}
              <button
                onClick={onClose ?? (() => {})}
                style={{
                  marginTop: 4, padding: '10px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, cursor: 'pointer',
                  color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 11,
                }}
              >
                ← BACK
              </button>
            </motion.div>

            {/* Controls hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{
                marginTop: 28, textAlign: 'center',
                color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 10,
                letterSpacing: 1, lineHeight: 1.8,
              }}
            >
              {isMobile ? (
                'D-PAD: MOVE   BUTTONS: ATTACK'
              ) : (
                <>
                  P1: WASD=MOVE · J=LIGHT · K=HEAVY · L=BLOCK · Q=SPECIAL<br/>
                  P2: H/;=MOVE · N=LIGHT · M=HEAVY · ,=BLOCK · P=SPECIAL
                </>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* ── WAITING ── */}
        {screen === 'waiting' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.92)',
            }}
          >
            <Spinner />
            <div style={{
              color: '#FFD700', fontFamily: 'monospace', fontSize: 18,
              letterSpacing: 3, marginTop: 20,
            }}>
              FINDING OPPONENT...
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 11,
              marginTop: 8,
            }}>
              Searching for players online
            </div>
            <button
              onClick={() => { multiRef.current?.cleanup(); setScreen('menu'); }}
              style={{
                marginTop: 28, padding: '10px 24px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 12,
              }}
            >
              CANCEL
            </button>
          </motion.div>
        )}

        {/* ── RESULTS ── */}
        {screen === 'results' && (lastGsRef.current ?? gameState) && (
          <motion.div
            key="results"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.88)',
            }}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              style={{ textAlign: 'center', marginBottom: 24 }}
            >
              {winnerName ? (
                <>
                  <div style={{
                    fontFamily: 'monospace', fontWeight: 900,
                    fontSize: isMobile ? 32 : 52,
                    color: winnerName === p1Name ? '#44ff88' : '#ff4444',
                    textShadow: `0 0 30px ${winnerName === p1Name ? '#00ff44' : '#ff0000'}`,
                    letterSpacing: 3,
                  }}>
                    {winnerName === p1Name ? 'VICTORY!' : 'DEFEAT'}
                  </div>
                  <div style={{
                    color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 13,
                    marginTop: 8, letterSpacing: 2,
                  }}>
                    {winnerName.toUpperCase()} WINS
                  </div>
                </>
              ) : (
                <div style={{
                  fontFamily: 'monospace', fontWeight: 900,
                  fontSize: isMobile ? 32 : 48,
                  color: '#aaaaaa', letterSpacing: 3,
                }}>
                  DRAW
                </div>
              )}
            </motion.div>

            {/* Rewards */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{
                display: 'flex', gap: 20, marginBottom: 28,
              }}
            >
              <RewardBox label="COINS" value={`+${coinsEarned}`} color="#FFD700" />
              <RewardBox label="XP" value={`+${xpEarned}`} color="#88ff99" />
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}
            >
              {gameMode === 'solo' && (
                <button
                  onClick={handleRematch}
                  style={actionBtnStyle('#FF8800')}
                >
                  ⚔ REMATCH
                </button>
              )}
              <button onClick={goMenu} style={actionBtnStyle('#888888')}>
                ← MENU
              </button>
              {onClose && (
                <button onClick={onClose} style={actionBtnStyle('#444444')}>
                  EXIT
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fight HUD + mobile controls */}
      {screen === 'fighting' && (
        <>
          {isMobile && <NinjaFightersMobileControls onInput={handleMobileInput} />}
          {!isMobile && (
            <div style={{
              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.16)', fontSize: 9, fontFamily: 'monospace',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              P1: WASD=move · J=light · K=heavy · L=block · Q=special · ESC=quit
              {gameMode === 'local2p' && ' │ P2: H/;=move · N=light · M=heavy · ,=block · P=special'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MenuBtn({ label, sub, color, onClick }: {
  label: string; sub: string; color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        padding: '14px 20px',
        background: `rgba(${color},0.15)`,
        border: `2px solid rgba(${color},0.5)`,
        borderRadius: 10, cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{
        color: `rgb(${color})`, fontFamily: 'monospace',
        fontSize: 15, fontWeight: 700, letterSpacing: 1.5,
      }}>
        {label}
      </div>
      <div style={{
        color: `rgba(${color},0.55)`, fontFamily: 'monospace',
        fontSize: 10, marginTop: 2, letterSpacing: 0.5,
      }}>
        {sub}
      </div>
    </motion.button>
  );
}

function RewardBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: `rgba(0,0,0,0.5)`,
      border: `1.5px solid ${color}44`,
      borderRadius: 10, padding: '12px 24px', textAlign: 'center',
    }}>
      <div style={{ color, fontFamily: 'monospace', fontWeight: 900, fontSize: 26 }}>
        {value}
      </div>
      <div style={{
        color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace',
        fontSize: 10, letterSpacing: 2, marginTop: 2,
      }}>
        {label}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 44, height: 44, border: '3px solid rgba(255,200,50,0.2)',
      borderTopColor: '#FFD700', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function actionBtnStyle(borderColor: string): React.CSSProperties {
  return {
    padding: '12px 24px',
    background: 'transparent',
    border: `2px solid ${borderColor}`,
    borderRadius: 8, cursor: 'pointer',
    color: borderColor, fontFamily: 'monospace',
    fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
  };
}

export default NinjaFighters;
