'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, orderBy, limit } from 'firebase/firestore';
import { MINI_GAMES, getWeekId, getTimeUntilReset, WEEKLY_PRIZES } from '@/lib/mini-games';
import { MiniGameId } from '@/types/tournament';
import { trackDailyTask } from '@/lib/daily-tasks';
import {
  Swords, Car, Sword, Target, Zap,
  Trophy, Crown, Gamepad2, Clock, Medal, Timer
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

import { NinjaRoyale } from '../games/NinjaRoyale';
import { DriftKings } from '../games/DriftKings';
import { SlashSurvival } from '../games/SlashSurvival';
import { AimTrainer } from '../games/AimTrainer';
import { NinjaRunner } from '../games/NinjaRunner';

interface Props {
  player: any;
}

const iconMap: Record<string, React.ReactNode> = {
  Swords: <Swords size={28} />,
  Car: <Car size={28} />,
  Sword: <Sword size={28} />,
  Target: <Target size={28} />,
  Zap: <Zap size={28} />,
};

const gameComponents: Record<MiniGameId, React.ComponentType<{ onScore: (s: number) => void; onClose: () => void }>> = {
  'ninja-royale': NinjaRoyale,
  'drift-kings': DriftKings,
  'slash-survival': SlashSurvival,
  'aim-trainer': AimTrainer,
  'ninja-runner': NinjaRunner,
};

const medalColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
const medalIcons = [Crown, Medal, Medal];

type LeaderboardEntry = { playerName: string; score: number; playerId: string };

export function MiniGamesTab({ player }: Props) {
  const { t, isRTL } = useTranslation();
  const [playingGame, setPlayingGame] = useState<MiniGameId | null>(null);
  const [leaderboards, setLeaderboards] = useState<Record<string, LeaderboardEntry[]>>({});
  const [timeLeft, setTimeLeft] = useState(getTimeUntilReset());
  const weekId = getWeekId();

  useEffect(() => {
    loadLeaderboards();
    const timer = setInterval(() => setTimeLeft(getTimeUntilReset()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadLeaderboards = async () => {
    const boards: Record<string, LeaderboardEntry[]> = {};
    for (const game of MINI_GAMES) {
      try {
        const q = query(
          collection(db, 'mini-game-scores'),
          where('gameId', '==', game.id),
          where('weekId', '==', weekId),
          orderBy('score', game.higherIsBetter ? 'desc' : 'asc'),
          limit(3)
        );
        const snap = await getDocs(q);
        boards[game.id] = snap.docs.map(d => ({
          playerName: d.data().playerName,
          score: d.data().score,
          playerId: d.data().playerId,
        }));
      } catch {
        boards[game.id] = [];
      }
    }
    setLeaderboards(boards);
  };

  const handleScore = async (gameId: MiniGameId, score: number) => {
    try {
      await addDoc(collection(db, 'mini-game-scores'), {
        gameId,
        playerId: player.uid,
        playerName: player.username,
        score,
        timestamp: Date.now(),
        weekId,
      });
      // Track daily tasks
      trackDailyTask(player.uid, 'play_minigame');
      if (gameId === 'aim-trainer' && score > 0) {
        trackDailyTask(player.uid, 'get_headshot', Math.max(1, Math.floor(score / 10)));
      }
      if (score > 0) {
        trackDailyTask(player.uid, 'earn_coins', score);
      }
    } catch (err) {
      console.error('Failed to save score:', err);
    }
    setPlayingGame(null);
    loadLeaderboards();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="font-ninja text-3xl text-ninja-green text-glow mb-2">{t('mini_games')}</h2>
        <p className="font-body text-gray-400">{t('mini_games_subtitle')}</p>
      </div>

      {/* Reset Timer + Prizes Banner */}
      <div className="glass rounded-xl p-4 mb-6 border border-ninja-green/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Timer size={20} className="text-ninja-green" />
          <div>
            <p className="font-ninja text-sm text-white">{t('leaderboard_resets')}</p>
            <p className="font-body text-xs text-gray-400">{t('every_friday_noon')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-ninja-green/10 px-4 py-2 rounded-lg border border-ninja-green/20">
          <Clock size={16} className="text-ninja-green" />
          <span className="font-ninja text-ninja-green">{timeLeft}</span>
          <span className="font-body text-xs text-gray-400">{t('remaining')}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Crown size={14} className="text-yellow-400" />
            <span className="font-body text-xs text-yellow-400">{t('first_place')}: {WEEKLY_PRIZES[1].label}</span>
          </div>
          <div className="flex items-center gap-1">
            <Medal size={14} className="text-gray-300" />
            <span className="font-body text-xs text-gray-300">{t('second_place')}: {WEEKLY_PRIZES[2].label}</span>
          </div>
          <div className="flex items-center gap-1">
            <Medal size={14} className="text-amber-600" />
            <span className="font-body text-xs text-amber-600">{t('third_place')}: {WEEKLY_PRIZES[3].label}</span>
          </div>
        </div>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
        {MINI_GAMES.map((game, i) => {
          const board = leaderboards[game.id] || [];
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-xl overflow-hidden border border-white/10 hover:border-ninja-green/30 transition-all"
              style={{
                background: `linear-gradient(135deg, ${game.color}15 0%, transparent 60%)`,
              }}
            >
              {/* Game Card Top - Clickable */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                onClick={() => setPlayingGame(game.id)}
                className="p-5 cursor-pointer relative"
              >
                <div className="absolute inset-0 opacity-5"
                  style={{ background: `radial-gradient(circle at 80% 20%, ${game.color} 0%, transparent 60%)` }}
                />
                <div className="relative z-10">
                  <div className="mb-3" style={{ color: game.color }}>
                    {iconMap[game.icon] || <Gamepad2 size={28} />}
                  </div>
                  <h3 className="font-ninja text-sm text-white mb-1">{game.name.toUpperCase()}</h3>
                  <p className="font-body text-[11px] text-gray-500 mb-3 line-clamp-2">{game.description}</p>
                  
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="bg-ninja-green/20 border border-ninja-green/30 rounded-lg py-2 text-center"
                  >
                    <span className="font-ninja text-xs text-ninja-green">{t('play_now')}</span>
                  </motion.div>
                </div>
              </motion.div>

              {/* Leaderboard Bottom */}
              <div className="border-t border-white/5 bg-black/30 px-4 py-3">
                <div className="flex items-center gap-1 mb-2">
                  <Trophy size={12} className="text-yellow-400" />
                  <span className="font-ninja text-[10px] text-gray-400">{t('top_3_this_week')}</span>
                </div>
                {board.length === 0 ? (
                  <p className="font-body text-[10px] text-gray-600 italic">{t('no_scores_yet')}</p>
                ) : (
                  <div className="space-y-1">
                    {board.map((entry, j) => {
                      const MedalIcon = medalIcons[j] || Medal;
                      const isMe = entry.playerId === player.uid;
                      return (
                        <div
                          key={j}
                          className={`flex items-center gap-2 ${isMe ? 'bg-ninja-green/10 rounded px-1 -mx-1' : ''}`}
                        >
                          <MedalIcon size={12} className={medalColors[j]} />
                          <span className={`font-body text-[11px] flex-1 truncate ${isMe ? 'text-ninja-green font-bold' : 'text-gray-400'}`}>
                            {entry.playerName}
                          </span>
                          <span className="font-ninja text-[10px] text-gray-500">
                            {entry.score.toLocaleString()} {game.scoreUnit}
                          </span>
                          <span className="font-body text-[9px] text-yellow-400/70">
                            +{WEEKLY_PRIZES[(j + 1) as 1 | 2 | 3]?.coins || 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Full-screen game overlay */}
      <AnimatePresence>
        {playingGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[300]"
          >
            {(() => {
              const GameComponent = gameComponents[playingGame];
              return (
                <GameComponent
                  onScore={(score) => handleScore(playingGame, score)}
                  onClose={() => setPlayingGame(null)}
                />
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
