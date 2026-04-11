'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { ArrowLeft, Volume2, VolumeX, Trophy, Target, Zap, Shield } from 'lucide-react';

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
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: 'left' | 'right';
  state: 'idle' | 'walk' | 'punch' | 'kick' | 'guard' | 'grab' | 'hit' | 'juggle' | 'rage' | 'ko';
  frameIndex: number;
  frameTimer: number;
  comboCount: number;
  rageMeter: number;
  guardStun: number;
  hitStun: number;
  attackCooldown: number;
  inAir: boolean;
}

const SPRITE_FRAMES = {
  idle: 4,
  walk: 6,
  punch: 4,
  kick: 5,
  guard: 2,
  grab: 6,
  hit: 3,
  juggle: 4,
  rage: 8,
  ko: 6,
};

export function Tekken8({ player, onClose, onScore }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'playing' | 'paused' | 'gameOver'>('playing');
  const [winner, setWinner] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [playerWins, setPlayerWins] = useState(0);
  const [aiWins, setAiWins] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Fighters with 3D positioning for Tekken-style movement
  const [player1, setPlayer1] = useState<Fighter>({
    id: 'player',
    name: 'Jin Kazama',
    health: 100,
    maxHealth: 100,
    x: 200,
    y: 300,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 'right',
    state: 'idle',
    frameIndex: 0,
    frameTimer: 0,
    comboCount: 0,
    rageMeter: 0,
    guardStun: 0,
    hitStun: 0,
    attackCooldown: 0,
    inAir: false,
  });

  const [player2, setPlayer2] = useState<Fighter>({
    id: 'ai',
    name: 'Kazuya',
    health: 100,
    maxHealth: 100,
    x: 600,
    y: 300,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 'left',
    state: 'idle',
    frameIndex: 0,
    frameTimer: 0,
    comboCount: 0,
    rageMeter: 0,
    guardStun: 0,
    hitStun: 0,
    attackCooldown: 0,
    inAir: false,
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
    // Update player 1 based on input (Tekken controls)
    setPlayer1(prev => {
      let newState = { ...prev };
      
      // Reduce timers
      if (newState.hitStun > 0) newState.hitStun--;
      if (newState.guardStun > 0) newState.guardStun--;
      if (newState.attackCooldown > 0) newState.attackCooldown--;

      // Handle input if not stunned
      if (newState.hitStun === 0 && newState.guardStun === 0) {
        newState.vx = 0;
        newState.vz = 0;
        
        // Movement (8-directional like Tekken)
        if (keys.has('a') || keys.has('arrowleft')) {
          newState.vx = -4;
          newState.facing = 'left';
          if (newState.state === 'idle') newState.state = 'walk';
        } else if (keys.has('d') || keys.has('arrowright')) {
          newState.vx = 4;
          newState.facing = 'right';
          if (newState.state === 'idle') newState.state = 'walk';
        }

        // Sidestep (3D movement)
        if (keys.has('w') || keys.has('arrowup')) {
          newState.vz = -3;
          if (newState.state === 'idle') newState.state = 'walk';
        } else if (keys.has('s') || keys.has('arrowdown')) {
          newState.vz = 3;
          if (newState.state === 'idle') newState.state = 'walk';
        }

        // Reset to idle if no movement
        if (newState.vx === 0 && newState.vz === 0 && newState.state === 'walk') {
          newState.state = 'idle';
        }

        // Guard
        if (keys.has('shift')) {
          newState.state = 'guard';
          newState.vx = 0;
          newState.vz = 0;
        }

        // Attacks (Tekken style - multiple attack buttons)
        if ((keys.has(' ') || keys.has('j')) && newState.attackCooldown === 0) {
          // Left punch
          newState.state = 'punch';
          newState.attackCooldown = 20;
          newState.vx = 0;
          newState.vz = 0;
          
          const distance = Math.sqrt(Math.pow(newState.x - player2.x, 2) + Math.pow(newState.z - player2.z, 2));
          if (distance < 70) {
            setPlayer2(p2 => {
              if (p2.state === 'guard') {
                return {
                  ...p2,
                  guardStun: 10,
                  rageMeter: Math.min(100, p2.rageMeter + 3),
                };
              } else {
                return {
                  ...p2,
                  health: Math.max(0, p2.health - 8),
                  state: 'hit',
                  hitStun: 15,
                  rageMeter: Math.min(100, p2.rageMeter + 8),
                };
              }
            });
            
            newState.comboCount++;
            newState.rageMeter = Math.min(100, newState.rageMeter + 5);
            setScore(s => s + 5 * newState.comboCount);
          }
        }

        if ((keys.has('k')) && newState.attackCooldown === 0) {
          // Right kick
          newState.state = 'kick';
          newState.attackCooldown = 25;
          
          const distance = Math.sqrt(Math.pow(newState.x - player2.x, 2) + Math.pow(newState.z - player2.z, 2));
          if (distance < 80) {
            setPlayer2(p2 => {
              if (p2.state === 'guard') {
                return {
                  ...p2,
                  guardStun: 15,
                  rageMeter: Math.min(100, p2.rageMeter + 5),
                };
              } else {
                return {
                  ...p2,
                  health: Math.max(0, p2.health - 12),
                  state: 'hit',
                  hitStun: 25,
                  rageMeter: Math.min(100, p2.rageMeter + 12),
                };
              }
            });
            
            newState.comboCount++;
            setScore(s => s + 8 * newState.comboCount);
          }
        }

        // Grab
        if (keys.has('g') && newState.attackCooldown === 0) {
          newState.state = 'grab';
          newState.attackCooldown = 40;
          
          const distance = Math.sqrt(Math.pow(newState.x - player2.x, 2) + Math.pow(newState.z - player2.z, 2));
          if (distance < 60 && player2.state !== 'guard') {
            setPlayer2(p2 => ({
              ...p2,
              health: Math.max(0, p2.health - 20),
              state: 'hit',
              hitStun: 30,
            }));
            setScore(s => s + 25);
          }
        }

        // Rage Art (when rage meter is full)
        if (keys.has('r') && newState.rageMeter >= 100 && newState.attackCooldown === 0) {
          newState.state = 'rage';
          newState.rageMeter = 0;
          newState.attackCooldown = 80;
          
          const distance = Math.sqrt(Math.pow(newState.x - player2.x, 2) + Math.pow(newState.z - player2.z, 2));
          if (distance < 150) {
            setPlayer2(p2 => ({
              ...p2,
              health: Math.max(0, p2.health - 35),
              state: 'hit',
              hitStun: 50,
            }));
            setScore(s => s + 100);
          }
        }
      }

      // Apply movement with bounds
      newState.x = Math.max(50, Math.min(750, newState.x + newState.vx));
      newState.z = Math.max(-100, Math.min(100, newState.z + newState.vz));

      // Update animation frame
      newState.frameTimer++;
      if (newState.frameTimer >= 5) {
        newState.frameTimer = 0;
        const maxFrames = SPRITE_FRAMES[newState.state] || 4;
        newState.frameIndex = (newState.frameIndex + 1) % maxFrames;
        
        // Reset to idle after attack animations
        if ((newState.state === 'punch' || newState.state === 'kick' || newState.state === 'grab' || 
             newState.state === 'hit' || newState.state === 'rage') && 
            newState.frameIndex === 0) {
          newState.state = 'idle';
        }
      }

      return newState;
    });

    // Advanced AI for Tekken-style gameplay
    setPlayer2(prev => {
      let newState = { ...prev };
      
      if (newState.hitStun > 0) newState.hitStun--;
      if (newState.guardStun > 0) newState.guardStun--;
      if (newState.attackCooldown > 0) newState.attackCooldown--;

      if (newState.hitStun === 0 && newState.guardStun === 0) {
        const distance = Math.sqrt(Math.pow(newState.x - player1.x, 2) + Math.pow(newState.z - player1.z, 2));
        
        // AI decision making
        if (distance > 120) {
          // Move closer (including sidestep)
          if (newState.x > player1.x) {
            newState.vx = -3;
            newState.facing = 'left';
          } else {
            newState.vx = 3;
            newState.facing = 'right';
          }
          
          // Occasional sidestep
          if (Math.random() < 0.1) {
            newState.vz = Math.random() < 0.5 ? -2 : 2;
          }
          
          newState.state = 'walk';
        } else if (distance < 70 && Math.random() < 0.03) {
          // Choose attack based on distance and AI state
          const attackChoice = Math.random();
          if (attackChoice < 0.4) {
            // Punch
            newState.state = 'punch';
            newState.attackCooldown = 20;
            newState.vx = 0;
            newState.vz = 0;
            
            if (distance < 70) {
              setPlayer1(p1 => {
                if (p1.state === 'guard') {
                  return { ...p1, guardStun: 10 };
                } else {
                  return {
                    ...p1,
                    health: Math.max(0, p1.health - 7),
                    state: 'hit',
                    hitStun: 15,
                  };
                }
              });
            }
          } else if (attackChoice < 0.7) {
            // Kick
            newState.state = 'kick';
            newState.attackCooldown = 25;
            
            if (distance < 80) {
              setPlayer1(p1 => {
                if (p1.state === 'guard') {
                  return { ...p1, guardStun: 15 };
                } else {
                  return {
                    ...p1,
                    health: Math.max(0, p1.health - 10),
                    state: 'hit',
                    hitStun: 25,
                  };
                }
              });
            }
          } else if (distance < 60) {
            // Grab
            newState.state = 'grab';
            newState.attackCooldown = 40;
            
            if (player1.state !== 'guard') {
              setPlayer1(p1 => ({
                ...p1,
                health: Math.max(0, p1.health - 18),
                state: 'hit',
                hitStun: 30,
              }));
            }
          }
        } else if (player1.state === 'punch' || player1.state === 'kick') {
          // Guard against attacks
          newState.state = 'guard';
          newState.vx = 0;
          newState.vz = 0;
        } else {
          newState.state = 'idle';
          newState.vx = 0;
          newState.vz = 0;
        }

        // Use Rage Art when low health and meter full
        if (newState.health < 30 && newState.rageMeter >= 100 && Math.random() < 0.05) {
          newState.state = 'rage';
          newState.rageMeter = 0;
          newState.attackCooldown = 80;
          
          if (distance < 150) {
            setPlayer1(p1 => ({
              ...p1,
              health: Math.max(0, p1.health - 30),
              state: 'hit',
              hitStun: 50,
            }));
          }
        }
      }

      // Apply movement
      newState.x = Math.max(50, Math.min(750, newState.x + newState.vx));
      newState.z = Math.max(-100, Math.min(100, newState.z + newState.vz));

      // Animation
      newState.frameTimer++;
      if (newState.frameTimer >= 5) {
        newState.frameTimer = 0;
        const maxFrames = SPRITE_FRAMES[newState.state] || 4;
        newState.frameIndex = (newState.frameIndex + 1) % maxFrames;
        
        if ((newState.state === 'punch' || newState.state === 'kick' || newState.state === 'grab' || 
             newState.state === 'hit' || newState.state === 'rage') && newState.frameIndex === 0) {
          newState.state = 'idle';
        }
      }

      return newState;
    });

    // Check for round end
    if (player1.health <= 0 && winner === null) {
      setAiWins(prev => prev + 1);
      if (aiWins + 1 >= 2) {
        setWinner('AI');
        setGameState('gameOver');
      } else {
        // Next round
        setTimeout(() => {
          setPlayer1(prev => ({ ...prev, health: 100, x: 200, state: 'idle' }));
          setPlayer2(prev => ({ ...prev, health: 100, x: 600, state: 'idle' }));
          setRound(prev => prev + 1);
        }, 2000);
      }
    } else if (player2.health <= 0 && winner === null) {
      setPlayerWins(prev => prev + 1);
      if (playerWins + 1 >= 2) {
        setWinner('Player');
        setGameState('gameOver');
        
        // Award coins for winning
        const coinsWon = 75 + Math.floor(score / 150);
        onScore?.(coinsWon);
        
        // Update player stats
        updateDoc(doc(db, 'players', player.uid), {
          coins: increment(coinsWon),
          'stats.gamesPlayed': increment(1),
          'stats.totalWins': increment(1),
        });
      } else {
        // Next round
        setTimeout(() => {
          setPlayer1(prev => ({ ...prev, health: 100, x: 200, state: 'idle' }));
          setPlayer2(prev => ({ ...prev, health: 100, x: 600, state: 'idle' }));
          setRound(prev => prev + 1);
        }, 2000);
      }
    }
  }, [keys, player1, player2, winner, score, playerWins, aiWins, player.uid, onScore]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with Tekken-style background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2D3748');
    gradient.addColorStop(1, '#1A202C');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw 3D stage effect
    ctx.fillStyle = '#4A5568';
    ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
    
    // Stage depth lines
    for (let i = -2; i <= 2; i++) {
      const z = i * 40;
      ctx.strokeStyle = '#718096';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 320 + z * 0.5);
      ctx.lineTo(canvas.width, 320 + z * 0.5);
      ctx.stroke();
    }

    // Draw fighters with 3D perspective
    const drawFighter = (fighter: Fighter) => {
      const perspectiveY = fighter.y + fighter.z * 0.3;
      const size = 1 + fighter.z * 0.002; // Slight size variation for depth
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.ellipse(fighter.x, canvas.height - 20, 30 * size, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Fighter body with color based on character
      ctx.fillStyle = fighter.id === 'player' ? '#FFD700' : '#8B4513';
      ctx.fillRect(fighter.x - 25 * size, perspectiveY - 60 * size, 50 * size, 80 * size);
      
      // Health bar background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(fighter.x - 50, perspectiveY - 90, 100, 12);
      
      // Health bar
      const healthPercent = fighter.health / fighter.maxHealth;
      ctx.fillStyle = healthPercent > 0.3 ? '#4CAF50' : '#F44336';
      ctx.fillRect(fighter.x - 50, perspectiveY - 90, 100 * healthPercent, 12);
      
      // Rage meter
      if (fighter.rageMeter > 0) {
        ctx.fillStyle = 'rgba(255,0,0,0.3)';
        ctx.fillRect(fighter.x - 50, perspectiveY - 100, 100, 6);
        ctx.fillStyle = '#FF4500';
        ctx.fillRect(fighter.x - 50, perspectiveY - 100, 100 * (fighter.rageMeter / 100), 6);
      }
      
      // State indicator
      if (fighter.state !== 'idle' && fighter.state !== 'walk') {
        ctx.fillStyle = '#FFF';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(fighter.state.toUpperCase(), fighter.x, perspectiveY - 110);
      }
      
      // Combo counter for player
      if (fighter.id === 'player' && fighter.comboCount > 1) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${fighter.comboCount} HITS!`, fighter.x, perspectiveY - 120);
      }
    };

    // Draw fighters (back to front based on Z)
    const fighters = [player1, player2].sort((a, b) => b.z - a.z);
    fighters.forEach(drawFighter);

  }, [player1, player2]);

  const handleRestart = () => {
    setPlayer1(prev => ({ ...prev, health: 100, x: 200, state: 'idle', rageMeter: 0 }));
    setPlayer2(prev => ({ ...prev, health: 100, x: 600, state: 'idle', rageMeter: 0 }));
    setRound(1);
    setPlayerWins(0);
    setAiWins(0);
    setScore(0);
    setWinner(null);
    setGameState('playing');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* HUD */}
      <div className="flex justify-between items-center p-4 bg-black/70">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Exit</span>
        </button>

        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className="text-yellow-400 font-ninja text-lg">SCORE</div>
            <div className="text-white font-ninja text-xl">{score.toLocaleString()}</div>
          </div>
          
          <div className="text-center">
            <div className="text-orange-400 font-ninja text-2xl">ROUND {round}</div>
            <div className="flex gap-4 mt-1">
              <span className="text-blue-400">P1: {playerWins}</span>
              <span className="text-red-400">AI: {aiWins}</span>
            </div>
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
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="border border-orange-500/30 rounded-lg shadow-2xl"
        />
      </div>

      {/* Controls */}
      <div className="p-4 bg-black/70 text-center">
        <div className="text-white/60 text-sm">
          <span className="font-ninja text-orange-400">TEKKEN CONTROLS:</span> 
          WASD - Move/Sidestep | SHIFT - Guard | J - Punch | K - Kick | G - Grab | R - Rage Art (100 meter)
        </div>
      </div>

      {/* Game Over Modal */}
      <AnimatePresence>
        {gameState === 'gameOver' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-900 rounded-2xl p-8 text-center max-w-md mx-4 border border-orange-500/30"
            >
              <div className="mb-6">
                {winner === 'Player' ? (
                  <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
                ) : winner === 'AI' ? (
                  <Target size={64} className="mx-auto text-red-400 mb-4" />
                ) : (
                  <Shield size={64} className="mx-auto text-orange-400 mb-4" />
                )}
                
                <h2 className="font-ninja text-3xl mb-2" style={{ 
                  color: winner === 'Player' ? '#FFD700' : winner === 'AI' ? '#F44336' : '#FF8C00'
                }}>
                  {winner === 'Player' ? 'PERFECT!' : winner === 'AI' ? 'GAME OVER' : 'DRAW!'}
                </h2>
                
                <p className="text-gray-400">Final Score: {score.toLocaleString()}</p>
                <p className="text-gray-400">Rounds: {playerWins}-{aiWins}</p>
                
                {winner === 'Player' && (
                  <p className="text-green-400 mt-2">
                    +{75 + Math.floor(score / 150)} coins earned!
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRestart}
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 rounded-xl font-ninja transition-colors"
                >
                  REMATCH
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