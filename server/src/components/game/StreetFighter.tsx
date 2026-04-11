'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { ArrowLeft, Volume2, VolumeX, Zap, Trophy, Target } from 'lucide-react';

interface Props {
  player: any;
  onClose: () => void;
  onScore?: (coins: number) => void;
}

interface Fighter {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'left' | 'right';
  state: 'idle' | 'walk' | 'attack' | 'hit' | 'block' | 'special' | 'ko';
  sprite: string;
  frameIndex: number;
  frameTimer: number;
  comboCount: number;
  specialMeter: number;
  blockStun: number;
  hitStun: number;
  attackCooldown: number;
}

const SPRITE_FRAMES = {
  idle: 4,
  walk: 6,
  attack: 5,
  hit: 3,
  block: 2,
  special: 6,
  ko: 4,
};

export function StreetFighter({ player, onClose, onScore }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'playing' | 'paused' | 'gameOver'>('playing');
  const [winner, setWinner] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(99);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Fighters
  const [player1, setPlayer1] = useState<Fighter>({
    id: 'player',
    name: 'Yellow Ninja',
    health: 100,
    maxHealth: 100,
    x: 150,
    y: 300,
    vx: 0,
    vy: 0,
    facing: 'right',
    state: 'idle',
    sprite: 'yellowNinja',
    frameIndex: 0,
    frameTimer: 0,
    comboCount: 0,
    specialMeter: 0,
    blockStun: 0,
    hitStun: 0,
    attackCooldown: 0,
  });

  const [player2, setPlayer2] = useState<Fighter>({
    id: 'ai',
    name: 'Shadow Fighter',
    health: 100,
    maxHealth: 100,
    x: 650,
    y: 300,
    vx: 0,
    vy: 0,
    facing: 'left',
    state: 'idle',
    sprite: 'shadow',
    frameIndex: 0,
    frameTimer: 0,
    comboCount: 0,
    specialMeter: 0,
    blockStun: 0,
    hitStun: 0,
    attackCooldown: 0,
  });

  const [keys, setKeys] = useState<Set<string>>(new Set());
  const animationFrameRef = useRef<number>();

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => new Set(prev).add(e.key.toLowerCase()));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(e.key.toLowerCase());
        return newKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game timer
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameState('gameOver');
          // Time's up - determine winner by health
          if (player1.health > player2.health) {
            setWinner('Player');
          } else if (player2.health > player1.health) {
            setWinner('AI');
          } else {
            setWinner('Draw');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, player1.health, player2.health]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const gameLoop = () => {
      updateGame();
      render();
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  const updateGame = useCallback(() => {
    // Update player 1 based on input
    setPlayer1(prev => {
      let newState = { ...prev };
      
      // Reduce timers
      if (newState.hitStun > 0) newState.hitStun--;
      if (newState.blockStun > 0) newState.blockStun--;
      if (newState.attackCooldown > 0) newState.attackCooldown--;

      // Handle input if not stunned
      if (newState.hitStun === 0 && newState.blockStun === 0) {
        newState.vx = 0;
        
        // Movement
        if (keys.has('a') || keys.has('arrowleft')) {
          newState.vx = -5;
          newState.facing = 'left';
          if (newState.state === 'idle') newState.state = 'walk';
        } else if (keys.has('d') || keys.has('arrowright')) {
          newState.vx = 5;
          newState.facing = 'right';
          if (newState.state === 'idle') newState.state = 'walk';
        } else if (newState.state === 'walk') {
          newState.state = 'idle';
        }

        // Block
        if (keys.has('s') || keys.has('arrowdown')) {
          newState.state = 'block';
          newState.vx = 0;
        }

        // Attack
        if ((keys.has(' ') || keys.has('enter')) && newState.attackCooldown === 0) {
          newState.state = 'attack';
          newState.attackCooldown = 30;
          newState.vx = 0;
          
          // Check for hit on player 2
          const distance = Math.abs(newState.x - player2.x);
          if (distance < 80) {
            setPlayer2(p2 => {
              if (p2.state === 'block') {
                // Blocked attack
                return {
                  ...p2,
                  blockStun: 15,
                  specialMeter: Math.min(100, p2.specialMeter + 5),
                };
              } else {
                // Hit!
                return {
                  ...p2,
                  health: Math.max(0, p2.health - 15),
                  state: 'hit',
                  hitStun: 20,
                  specialMeter: Math.min(100, p2.specialMeter + 10),
                };
              }
            });
            
            newState.comboCount++;
            newState.specialMeter = Math.min(100, newState.specialMeter + 15);
            setScore(s => s + 10 * newState.comboCount);
          }
        }

        // Special attack
        if (keys.has('q') && newState.specialMeter >= 50 && newState.attackCooldown === 0) {
          newState.state = 'special';
          newState.specialMeter -= 50;
          newState.attackCooldown = 60;
          
          const distance = Math.abs(newState.x - player2.x);
          if (distance < 120) {
            setPlayer2(p2 => ({
              ...p2,
              health: Math.max(0, p2.health - 30),
              state: 'hit',
              hitStun: 40,
            }));
            setScore(s => s + 50);
          }
        }
      }

      // Apply movement
      newState.x = Math.max(50, Math.min(750, newState.x + newState.vx));

      // Update animation frame
      newState.frameTimer++;
      if (newState.frameTimer >= 6) {
        newState.frameTimer = 0;
        const maxFrames = SPRITE_FRAMES[newState.state] || 4;
        newState.frameIndex = (newState.frameIndex + 1) % maxFrames;
        
        // Reset to idle after attack/hit animations
        if ((newState.state === 'attack' || newState.state === 'hit' || newState.state === 'special') && 
            newState.frameIndex === 0) {
          newState.state = 'idle';
        }
      }

      return newState;
    });

    // Simple AI for player 2
    setPlayer2(prev => {
      let newState = { ...prev };
      
      if (newState.hitStun > 0) newState.hitStun--;
      if (newState.blockStun > 0) newState.blockStun--;
      if (newState.attackCooldown > 0) newState.attackCooldown--;

      if (newState.hitStun === 0 && newState.blockStun === 0) {
        const distance = Math.abs(newState.x - player1.x);
        
        // AI behavior
        if (distance > 100) {
          // Move closer
          if (newState.x > player1.x) {
            newState.vx = -3;
            newState.facing = 'left';
          } else {
            newState.vx = 3;
            newState.facing = 'right';
          }
          newState.state = 'walk';
        } else if (distance < 80 && Math.random() < 0.02) {
          // Attack
          newState.state = 'attack';
          newState.attackCooldown = 30;
          newState.vx = 0;
          
          // Check hit on player 1
          if (distance < 80) {
            setPlayer1(p1 => {
              if (p1.state === 'block') {
                return { ...p1, blockStun: 15 };
              } else {
                return {
                  ...p1,
                  health: Math.max(0, p1.health - 12),
                  state: 'hit',
                  hitStun: 20,
                };
              }
            });
          }
        } else if (Math.random() < 0.01) {
          // Block occasionally
          newState.state = 'block';
          newState.vx = 0;
        } else {
          newState.state = 'idle';
          newState.vx = 0;
        }
      }

      // Apply movement
      newState.x = Math.max(50, Math.min(750, newState.x + newState.vx));

      // Animation
      newState.frameTimer++;
      if (newState.frameTimer >= 6) {
        newState.frameTimer = 0;
        const maxFrames = SPRITE_FRAMES[newState.state] || 4;
        newState.frameIndex = (newState.frameIndex + 1) % maxFrames;
        
        if ((newState.state === 'attack' || newState.state === 'hit') && newState.frameIndex === 0) {
          newState.state = 'idle';
        }
      }

      return newState;
    });

    // Check for KO
    if (player1.health <= 0 && winner === null) {
      setWinner('AI');
      setGameState('gameOver');
    } else if (player2.health <= 0 && winner === null) {
      setWinner('Player');
      setGameState('gameOver');
      
      // Award coins for winning
      const coinsWon = 50 + Math.floor(score / 100);
      onScore?.(coinsWon);
      
      // Update player stats
      updateDoc(doc(db, 'players', player.uid), {
        coins: increment(coinsWon),
        'stats.gamesPlayed': increment(1),
        'stats.totalWins': increment(1),
      });
    }
  }, [keys, player1, player2, winner, score, player.uid, onScore]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stage background
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

    // Draw fighters (simplified rectangles for now)
    const drawFighter = (fighter: Fighter) => {
      ctx.fillStyle = fighter.sprite === 'yellowNinja' ? '#FFD700' : '#4A5568';
      
      // Fighter body
      ctx.fillRect(fighter.x - 25, fighter.y - 60, 50, 80);
      
      // Health bar background
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(fighter.x - 40, fighter.y - 80, 80, 8);
      
      // Health bar
      const healthPercent = fighter.health / fighter.maxHealth;
      ctx.fillStyle = healthPercent > 0.3 ? '#4CAF50' : '#F44336';
      ctx.fillRect(fighter.x - 40, fighter.y - 80, 80 * healthPercent, 8);
      
      // Special meter
      if (fighter.specialMeter > 0) {
        ctx.fillStyle = 'rgba(0,0,255,0.3)';
        ctx.fillRect(fighter.x - 40, fighter.y - 90, 80, 4);
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(fighter.x - 40, fighter.y - 90, 80 * (fighter.specialMeter / 100), 4);
      }
      
      // State indicator
      if (fighter.state !== 'idle' && fighter.state !== 'walk') {
        ctx.fillStyle = '#FFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(fighter.state.toUpperCase(), fighter.x, fighter.y - 100);
      }
    };

    drawFighter(player1);
    drawFighter(player2);

  }, [player1, player2]);

  const handleRestart = () => {
    setPlayer1(prev => ({ ...prev, health: 100, x: 150, state: 'idle' }));
    setPlayer2(prev => ({ ...prev, health: 100, x: 650, state: 'idle' }));
    setTimeLeft(99);
    setScore(0);
    setWinner(null);
    setGameState('playing');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* HUD */}
      <div className="flex justify-between items-center p-4 bg-black/50">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Exit</span>
        </button>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-yellow-400 font-ninja text-lg">SCORE</div>
            <div className="text-white font-ninja text-xl">{score.toLocaleString()}</div>
          </div>
          
          <div className="text-center">
            <div className="text-red-400 font-ninja text-4xl">{timeLeft}</div>
            <div className="text-gray-400 text-xs">TIME</div>
          </div>
        </div>

        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>

      {/* Game Canvas */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-purple-900/20 to-blue-900/20">
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="border border-white/20 rounded-lg"
        />
      </div>

      {/* Controls */}
      <div className="p-4 bg-black/50 text-center">
        <div className="text-white/60 text-sm">
          <span className="font-ninja text-yellow-400">CONTROLS:</span> A/D - Move | S - Block | SPACE - Attack | Q - Special (50 meter)
        </div>
      </div>

      {/* Game Over Modal */}
      <AnimatePresence>
        {gameState === 'gameOver' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-900 rounded-2xl p-8 text-center max-w-md mx-4"
            >
              <div className="mb-6">
                {winner === 'Player' ? (
                  <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
                ) : winner === 'AI' ? (
                  <Target size={64} className="mx-auto text-red-400 mb-4" />
                ) : (
                  <Zap size={64} className="mx-auto text-blue-400 mb-4" />
                )}
                
                <h2 className="font-ninja text-3xl mb-2" style={{ 
                  color: winner === 'Player' ? '#FFD700' : winner === 'AI' ? '#F44336' : '#2196F3'
                }}>
                  {winner === 'Player' ? 'VICTORY!' : winner === 'AI' ? 'DEFEAT' : 'DRAW!'}
                </h2>
                
                <p className="text-gray-400">Final Score: {score.toLocaleString()}</p>
                
                {winner === 'Player' && (
                  <p className="text-green-400 mt-2">
                    +{50 + Math.floor(score / 100)} coins earned!
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRestart}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-ninja transition-colors"
                >
                  FIGHT AGAIN
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 rounded-xl font-ninja transition-colors"
                >
                  EXIT
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}