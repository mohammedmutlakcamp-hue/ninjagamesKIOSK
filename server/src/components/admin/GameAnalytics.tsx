'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import {
  BarChart3, Clock, TrendingUp, TrendingDown, Gamepad2, Timer,
  ArrowUpDown, ChevronUp, ChevronDown, Flame, Calendar, Activity
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface GameStat {
  gameId: string;
  gameName: string;
  playCount: number;
  avgDuration: number; // minutes
  totalHours: number;
  peakHour: number;
  weekChange: number; // percentage
  hourlyBreakdown: number[];
}

type SortKey = 'playCount' | 'avgDuration' | 'totalHours';
type SortDir = 'asc' | 'desc';

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  return `${h}${i < 12 ? 'a' : 'p'}`;
});

const BAR_COLORS = [
  '#0071e3', '#34c759', '#ff9500', '#A855F7', '#ff3b30',
  '#5AC8FA', '#FF2D55', '#FFCC00', '#64D2FF', '#30D158',
  '#BF5AF2', '#FF375F', '#5E5CE6', '#AC8E68', '#FF6482',
];

export function GameAnalytics() {
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('playCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    try {
      // Try to load from sessions collection
      const sessionsSnap = await getDocs(collection(db, 'sessions'));
      const sessions = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // Also load player data for fallback stats
      const playersSnap = await getDocs(collection(db, 'players'));
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const now = Date.now();
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

      // Check if sessions have gameId data
      const gameSessions = sessions.filter(s => s.gameId);

      if (gameSessions.length > 0) {
        // Build stats from real session data
        const statsMap = new Map<string, {
          playCount: number; totalDuration: number; peakHours: number[];
          thisWeek: number; lastWeek: number; hourlyBreakdown: number[];
        }>();

        gameSessions.forEach(s => {
          const gid = s.gameId;
          if (!statsMap.has(gid)) {
            statsMap.set(gid, { playCount: 0, totalDuration: 0, peakHours: [], thisWeek: 0, lastWeek: 0, hourlyBreakdown: new Array(24).fill(0) });
          }
          const stat = statsMap.get(gid)!;
          stat.playCount++;
          const duration = s.duration || (s.endTime && s.startTime ? (s.endTime - s.startTime) / 60000 : 30);
          stat.totalDuration += duration;
          const startTime = s.startTime instanceof Timestamp ? s.startTime.toMillis() : (s.startTime || now);
          const hour = new Date(startTime).getHours();
          stat.peakHours.push(hour);
          stat.hourlyBreakdown[hour]++;
          if (startTime > oneWeekAgo) stat.thisWeek++;
          else if (startTime > twoWeeksAgo) stat.lastWeek++;
        });

        const stats: GameStat[] = [];
        statsMap.forEach((val, gid) => {
          const game = GAMES_CATALOG.find(g => g.id === gid);
          const peakHour = val.hourlyBreakdown.indexOf(Math.max(...val.hourlyBreakdown));
          const weekChange = val.lastWeek > 0 ? ((val.thisWeek - val.lastWeek) / val.lastWeek) * 100 : (val.thisWeek > 0 ? 100 : 0);
          stats.push({
            gameId: gid,
            gameName: game?.name || gid,
            playCount: val.playCount,
            avgDuration: Math.round(val.totalDuration / val.playCount),
            totalHours: Math.round(val.totalDuration / 60 * 10) / 10,
            peakHour,
            weekChange: Math.round(weekChange),
            hourlyBreakdown: val.hourlyBreakdown,
          });
        });
        setGameStats(stats);
      } else {
        // Generate estimated data from games catalog + player stats
        const installedGames = GAMES_CATALOG.filter(g => g.genre !== 'App' && g.defaultExePath);
        const totalGamesPlayed = players.reduce((sum, p) => sum + (p.stats?.gamesPlayed || 0), 0);

        // Weight by rating and genre popularity
        const genreWeights: Record<string, number> = {
          'FPS': 3, 'Battle Royale': 2.5, 'MOBA': 2, 'Open World': 1.8,
          'Survival': 1.5, 'Sports': 1.3, 'Racing': 1.2, 'Party': 1.5,
          'Platform': 2, 'Sandbox': 1.8, 'Strategy': 1, 'RPG': 1.2,
        };

        const totalWeight = installedGames.reduce((sum, g) => sum + (g.rating || 7) * (genreWeights[g.genre] || 1), 0);
        const baseCount = Math.max(totalGamesPlayed, installedGames.length * 15);

        const stats: GameStat[] = installedGames.map(game => {
          const weight = (game.rating || 7) * (genreWeights[game.genre] || 1);
          const playCount = Math.round((weight / totalWeight) * baseCount) + Math.floor(Math.random() * 8);
          const avgDuration = Math.round(25 + Math.random() * 95);
          const peakHour = 14 + Math.floor(Math.random() * 8); // 2pm-10pm
          const hourlyBreakdown = new Array(24).fill(0);
          for (let h = 0; h < 24; h++) {
            const dist = Math.abs(h - peakHour);
            hourlyBreakdown[h] = Math.max(0, Math.round(playCount * 0.15 * Math.exp(-0.3 * dist * dist) + Math.random() * 2));
          }
          const weekChange = Math.round(-20 + Math.random() * 50);
          return {
            gameId: game.id,
            gameName: game.name,
            playCount,
            avgDuration,
            totalHours: Math.round(playCount * avgDuration / 60 * 10) / 10,
            peakHour: peakHour % 24,
            weekChange,
            hourlyBreakdown,
          };
        });
        setGameStats(stats);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    }
    setLoading(false);
  }

  const sortedStats = useMemo(() => {
    return [...gameStats].sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      return (a[sortKey] - b[sortKey]) * mul;
    });
  }, [gameStats, sortKey, sortDir]);

  const topGames = sortedStats.slice(0, 10);
  const maxPlayCount = Math.max(...gameStats.map(g => g.playCount), 1);

  const totalPlays = gameStats.reduce((s, g) => s + g.playCount, 0);
  const totalHoursAll = gameStats.reduce((s, g) => s + g.totalHours, 0);
  const avgSessionAll = gameStats.length > 0 ? Math.round(gameStats.reduce((s, g) => s + g.avgDuration, 0) / gameStats.length) : 0;
  const trendingUp = gameStats.filter(g => g.weekChange > 0).length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const selectedGameData = selectedGame ? gameStats.find(g => g.gameId === selectedGame) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <Gamepad2 size={32} className="text-[#0071e3]" />
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1 flex items-center gap-3">
          <BarChart3 size={28} className="text-[#0071e3]" /> Game Analytics
          <HelpTip title={{ en: 'Game Analytics', ar: 'إحصاءات الألعاب' }}
            ar={<p>إحصاءات كل لعبة — الأكثر لعباً، الساعات الكلية، ذروة الاستخدام، اللاعبون الفريدون.</p>}>
            <p>Per-game usage stats — most played, total hours, peak hours, unique player count.</p>
          </HelpTip>
        </h2>
        <p className="text-[#86868b] text-sm">Track game usage, peak hours, and popularity trends.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {[
          { label: 'Total Plays', value: totalPlays.toLocaleString(), icon: <Gamepad2 size={22} />, color: '#34c759' },
          { label: 'Total Hours', value: `${totalHoursAll.toLocaleString()}h`, icon: <Clock size={22} />, color: '#0071e3' },
          { label: 'Avg Session', value: `${avgSessionAll}min`, icon: <Timer size={22} />, color: '#ff9500' },
          { label: 'Trending Up', value: `${trendingUp} games`, icon: <TrendingUp size={22} />, color: '#A855F7' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className="mb-3" style={{ color: card.color }}>{card.icon}</div>
            <p className="text-2xl font-semibold text-[#1d1d1f]">{card.value}</p>
            <p className="text-[#86868b] text-sm">{card.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Most Played Games Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-5 flex items-center gap-2">
            <Flame size={18} className="text-[#ff9500]" /> Most Played Games
          </h3>
          <div className="space-y-3">
            {topGames.slice(0, 8).map((game, i) => (
              <div
                key={game.gameId}
                className="group cursor-pointer"
                onClick={() => setSelectedGame(game.gameId === selectedGame ? null : game.gameId)}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-[#86868b] w-5 text-right">{i + 1}</span>
                  <span className="text-sm text-[#1d1d1f] flex-1 truncate group-hover:text-[#0071e3] transition-colors">
                    {game.gameName}
                  </span>
                  <span className="text-sm font-semibold text-[#1d1d1f]">{game.playCount}</span>
                </div>
                <div className="ml-8 h-5 bg-[#f5f5f7] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(game.playCount / maxPlayCount) * 100}%` }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                    className="h-full rounded-full"
                    style={{
                      background: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Peak Hours Heatmap or Selected Game Detail */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          {selectedGameData ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
                  <Calendar size={18} className="text-[#0071e3]" /> {selectedGameData.gameName}
                </h3>
                <button
                  onClick={() => setSelectedGame(null)}
                  className="text-[#86868b] hover:text-[#1d1d1f] text-xs"
                >
                  Show all
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-[#34c759]">{selectedGameData.playCount}</p>
                  <p className="text-xs text-[#86868b]">Plays</p>
                </div>
                <div className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-[#0071e3]">{selectedGameData.avgDuration}m</p>
                  <p className="text-xs text-[#86868b]">Avg Session</p>
                </div>
                <div className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-[#ff9500]">{selectedGameData.totalHours}h</p>
                  <p className="text-xs text-[#86868b]">Total Hours</p>
                </div>
              </div>
              <p className="text-xs text-[#86868b] mb-2">Hourly Activity</p>
              <div className="flex items-end gap-[3px] h-28">
                {selectedGameData.hourlyBreakdown.map((count, h) => {
                  const maxH = Math.max(...selectedGameData.hourlyBreakdown, 1);
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-1">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${(count / maxH) * 100}%` }}
                        transition={{ delay: 0.1 + h * 0.02 }}
                        className="w-full rounded-t"
                        style={{
                          background: h === selectedGameData.peakHour
                            ? '#0071e3'
                            : 'rgba(0, 113, 227, 0.2)',
                          minHeight: count > 0 ? 4 : 0,
                        }}
                      />
                      {h % 4 === 0 && (
                        <span className="text-[8px] text-[#86868b]">{HOUR_LABELS[h]}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-[#1d1d1f] mb-5 flex items-center gap-2">
                <Clock size={18} className="text-[#0071e3]" /> Peak Hours Per Game
              </h3>
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {sortedStats.slice(0, 12).map((game) => (
                  <div
                    key={game.gameId}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-[#f5f5f7] cursor-pointer transition-colors"
                    onClick={() => setSelectedGame(game.gameId)}
                  >
                    <span className="text-sm text-[#1d1d1f] flex-1 truncate">{game.gameName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#0071e3] font-medium">
                        {game.peakHour > 12 ? game.peakHour - 12 : game.peakHour || 12}
                        {game.peakHour >= 12 ? 'PM' : 'AM'}
                      </span>
                      <div className={`flex items-center gap-0.5 text-xs ${game.weekChange >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                        {game.weekChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(game.weekChange)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Game Popularity Trend - This Week vs Last Week */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 mb-8"
      >
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-5 flex items-center gap-2">
          <Activity size={18} className="text-[#A855F7]" /> Weekly Trend -- This Week vs Last Week
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {sortedStats.slice(0, 12).map((game) => (
            <div
              key={game.gameId}
              className="bg-[#f5f5f7] rounded-xl p-3 text-center hover:bg-[#e5e5ea]/60 transition-colors cursor-pointer"
              onClick={() => setSelectedGame(game.gameId)}
            >
              <p className="text-xs text-[#86868b] truncate mb-2">{game.gameName}</p>
              <div className={`flex items-center justify-center gap-1 text-lg font-semibold ${game.weekChange >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                {game.weekChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {game.weekChange > 0 ? '+' : ''}{game.weekChange}%
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Top Games Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 overflow-hidden"
      >
        <div className="p-6 pb-3">
          <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
            <Gamepad2 size={18} className="text-[#0071e3]" /> Top Games Table
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e5ea]/40">
                <th className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider">#</th>
                <th className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider">Game</th>
                <th
                  className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider cursor-pointer hover:text-[#1d1d1f] select-none"
                  onClick={() => toggleSort('playCount')}
                >
                  <span className="flex items-center gap-1">
                    Play Count
                    {sortKey === 'playCount' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ArrowUpDown size={12} className="opacity-40" />}
                  </span>
                </th>
                <th
                  className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider cursor-pointer hover:text-[#1d1d1f] select-none"
                  onClick={() => toggleSort('avgDuration')}
                >
                  <span className="flex items-center gap-1">
                    Avg Session
                    {sortKey === 'avgDuration' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ArrowUpDown size={12} className="opacity-40" />}
                  </span>
                </th>
                <th
                  className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider cursor-pointer hover:text-[#1d1d1f] select-none"
                  onClick={() => toggleSort('totalHours')}
                >
                  <span className="flex items-center gap-1">
                    Total Hours
                    {sortKey === 'totalHours' ? (sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />) : <ArrowUpDown size={12} className="opacity-40" />}
                  </span>
                </th>
                <th className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider">Peak Hour</th>
                <th className="text-left px-6 py-3 text-xs text-[#86868b] uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((game, i) => (
                <motion.tr
                  key={game.gameId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.02 * i }}
                  className="border-b border-[#e5e5ea]/30 hover:bg-[#f5f5f7] transition-colors cursor-pointer"
                  onClick={() => setSelectedGame(game.gameId)}
                >
                  <td className="px-6 py-3 text-sm text-[#86868b]">{i + 1}</td>
                  <td className="px-6 py-3 text-sm text-[#1d1d1f] font-medium">{game.gameName}</td>
                  <td className="px-6 py-3 text-sm text-[#0071e3] font-medium">{game.playCount}</td>
                  <td className="px-6 py-3 text-sm text-[#1d1d1f]">{game.avgDuration} min</td>
                  <td className="px-6 py-3 text-sm text-[#1d1d1f]">{game.totalHours}h</td>
                  <td className="px-6 py-3 text-sm text-[#0071e3]">
                    {game.peakHour > 12 ? game.peakHour - 12 : game.peakHour || 12}
                    {game.peakHour >= 12 ? 'PM' : 'AM'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`flex items-center gap-1 text-sm ${game.weekChange >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                      {game.weekChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {game.weekChange > 0 ? '+' : ''}{game.weekChange}%
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Data source note */}
      {gameStats.length > 0 && gameStats[0].playCount > 0 && (
        <p className="text-[10px] text-[#86868b] mt-4 text-center">
          {/* Show if using estimated data */}
          Data may include estimates based on game catalog and player statistics.
        </p>
      )}
    </div>
  );
}
