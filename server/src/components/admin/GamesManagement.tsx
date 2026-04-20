'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import {
  Search, Gamepad2, Star, Eye, EyeOff, FolderOpen, BarChart3,
  Save, CheckCircle2, X, Filter, StarOff, Monitor, ChevronDown,
  ChevronUp, Loader2
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface GamesConfig {
  disabledGames: string[];
  featuredGames: string[];
  pathOverrides: Record<string, string>;
}

interface GameStats {
  [gameId: string]: number;
}

export function GamesManagement() {
  const [config, setConfig] = useState<GamesConfig>({
    disabledGames: [],
    featuredGames: [],
    pathOverrides: {},
  });
  const [gameStats, setGameStats] = useState<GameStats>({});
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState('');
  const [showStats, setShowStats] = useState(false);

  // Load config from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'games'));
        if (snap.exists()) {
          const data = snap.data();
          setConfig({
            disabledGames: data.disabledGames || [],
            featuredGames: data.featuredGames || [],
            pathOverrides: data.pathOverrides || {},
          });
        }

        // Load game launch stats from players collection
        const playersSnap = await getDocs(collection(db, 'players'));
        const stats: GameStats = {};
        playersSnap.forEach((playerDoc) => {
          const data = playerDoc.data();
          const gameLaunches = data.gameLaunches as Record<string, number> | undefined;
          if (gameLaunches) {
            Object.entries(gameLaunches).forEach(([gameId, count]) => {
              stats[gameId] = (stats[gameId] || 0) + (typeof count === 'number' ? count : 0);
            });
          }
        });
        setGameStats(stats);
      } catch (err) {
        console.error('Failed to load games config:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Save config to Firestore
  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'games'), config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save games config:', err);
    } finally {
      setSaving(false);
    }
  };

  // Toggle game availability
  const toggleGame = (gameId: string) => {
    setConfig(prev => {
      const disabled = prev.disabledGames.includes(gameId)
        ? prev.disabledGames.filter(id => id !== gameId)
        : [...prev.disabledGames, gameId];
      return { ...prev, disabledGames: disabled };
    });
  };

  // Toggle featured game
  const toggleFeatured = (gameId: string) => {
    setConfig(prev => {
      const featured = prev.featuredGames.includes(gameId)
        ? prev.featuredGames.filter(id => id !== gameId)
        : [...prev.featuredGames, gameId];
      return { ...prev, featuredGames: featured };
    });
  };

  // Save path override
  const savePathOverride = (gameId: string) => {
    setConfig(prev => {
      const overrides = { ...prev.pathOverrides };
      if (pathDraft.trim()) {
        overrides[gameId] = pathDraft.trim();
      } else {
        delete overrides[gameId];
      }
      return { ...prev, pathOverrides: overrides };
    });
    setEditingPath(null);
    setPathDraft('');
  };

  // Get unique genres
  const genres = useMemo(() => {
    const set = new Set(GAMES_CATALOG.map(g => g.genre));
    return ['all', ...Array.from(set).sort()];
  }, []);

  // Filter games
  const filtered = useMemo(() => {
    return GAMES_CATALOG.filter(game => {
      const matchesSearch = game.name.toLowerCase().includes(search.toLowerCase()) ||
        game.id.toLowerCase().includes(search.toLowerCase());
      const matchesGenre = genreFilter === 'all' || game.genre === genreFilter;
      const isDisabled = config.disabledGames.includes(game.id);
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'enabled' && !isDisabled) ||
        (statusFilter === 'disabled' && isDisabled);
      return matchesSearch && matchesGenre && matchesStatus;
    });
  }, [search, genreFilter, statusFilter, config.disabledGames]);

  // Stats summary
  const enabledCount = GAMES_CATALOG.length - config.disabledGames.length;
  const featuredCount = config.featuredGames.length;
  const totalLaunches = Object.values(gameStats).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-[#0071e3] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
            <Gamepad2 size={24} className="text-[#0071e3]" /> Games Management
            <HelpTip title={{ en: 'Games Catalog', ar: 'قائمة الألعاب' }}
              ar={<p>الألعاب التي تظهر للاعبين في الكشك. فعّل/ألغِ، اجعلها مميزة (Featured)، أو علّم ألعاب تحت الصيانة.</p>}>
              <p>The game catalog players see on the kiosk. Enable/disable individual titles, mark as Featured, or flag for maintenance.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm mt-1">
            {GAMES_CATALOG.length} games · {enabledCount} enabled · {featuredCount} featured
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowStats(!showStats)}
            className={`px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 transition-colors ${
              showStats ? 'bg-[#0071e3] text-white' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'
            }`}
          >
            <BarChart3 size={16} /> Stats
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={saveConfig}
            disabled={saving}
            className="px-6 py-2 bg-[#0071e3] text-white font-medium rounded-xl flex items-center gap-2 disabled:opacity-50 hover:bg-[#0077ED] transition-colors"
          >
            {saved ? (
              <><CheckCircle2 size={16} /> Saved!</>
            ) : saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving...</>
            ) : (
              <><Save size={16} /> Save Changes</>
            )}
          </motion.button>
        </div>
      </div>

      {/* Stats Banner */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <h3 className="font-semibold text-[#0071e3] mb-4 flex items-center gap-2">
                <BarChart3 size={16} /> Launch Statistics
              </h3>
              {totalLaunches === 0 ? (
                <p className="text-[#86868b] text-sm">No launch data available yet. Stats will appear as players launch games.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(gameStats)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 12)
                    .map(([gameId, count]) => {
                      const game = GAMES_CATALOG.find(g => g.id === gameId);
                      return (
                        <div key={gameId} className="bg-[#f5f5f7] rounded-xl p-3 text-center">
                          <p className="text-[#1d1d1f] text-sm truncate">{game?.name || gameId}</p>
                          <p className="font-semibold text-[#0071e3] text-lg">{count}</p>
                          <p className="text-[#86868b] text-xs">launches</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search games..."
            className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-10 pr-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none placeholder:text-[#86868b]"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
            <select
              value={genreFilter}
              onChange={e => setGenreFilter(e.target.value)}
              className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-8 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] outline-none appearance-none cursor-pointer"
            >
              {genres.map(g => (
                <option key={g} value={g}>{g === 'all' ? 'All Genres' : g}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Eye size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
              className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-8 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Featured Games Section */}
      {config.featuredGames.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-[#0071e3]/20 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2">
            <Star size={14} /> Featured in Hero Banner ({config.featuredGames.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {config.featuredGames.map(gameId => {
              const game = GAMES_CATALOG.find(g => g.id === gameId);
              if (!game) return null;
              return (
                <motion.div
                  key={gameId}
                  layout
                  className="flex items-center gap-2 bg-[#0071e3]/5 border border-[#0071e3]/20 rounded-xl px-3 py-1.5"
                >
                  <img src={game.coverImage} alt="" className="w-6 h-6 rounded object-cover" />
                  <span className="text-[#1d1d1f] text-sm">{game.name}</span>
                  <button
                    onClick={() => toggleFeatured(gameId)}
                    className="text-[#86868b] hover:text-[#ff3b30] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Games Grid */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Gamepad2 size={48} className="text-[#d2d2d7] mx-auto mb-3" />
            <p className="text-[#86868b]">No games match your filters</p>
          </div>
        ) : (
          filtered.map((game) => {
            const isDisabled = config.disabledGames.includes(game.id);
            const isFeatured = config.featuredGames.includes(game.id);
            const isExpanded = expandedGame === game.id;
            const hasOverride = !!config.pathOverrides[game.id];
            const launches = gameStats[game.id] || 0;
            const effectivePath = config.pathOverrides[game.id] || game.defaultExePath;

            return (
              <motion.div
                key={game.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl border transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                  isDisabled
                    ? 'border-[#ff3b30]/20 opacity-60'
                    : isFeatured
                    ? 'border-[#0071e3]/30'
                    : 'border-[#e5e5ea]/60'
                }`}
              >
                {/* Main Row */}
                <div className="flex items-center gap-4 p-4">
                  {/* Cover Image */}
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                    <img
                      src={game.coverImage}
                      alt={game.name}
                      className="w-full h-full object-cover"
                    />
                    {isDisabled && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <EyeOff size={18} className="text-[#ff3b30]" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[#1d1d1f] text-sm truncate">{game.name}</h3>
                      {isFeatured && (
                        <Star size={12} className="text-[#ff9500] fill-[#ff9500] flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[#86868b] text-xs">{game.genre}</span>
                      {launches > 0 && (
                        <span className="text-[#86868b] text-xs">{launches} launches</span>
                      )}
                      {hasOverride && (
                        <span className="text-[#0071e3]/60 text-xs flex items-center gap-1">
                          <Monitor size={10} /> custom path
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Featured Toggle */}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => toggleFeatured(game.id)}
                      title={isFeatured ? 'Remove from featured' : 'Add to featured'}
                      className={`p-2 rounded-xl transition-colors ${
                        isFeatured
                          ? 'bg-[#ff9500]/10 text-[#ff9500]'
                          : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#ff9500]'
                      }`}
                    >
                      {isFeatured ? <Star size={16} className="fill-[#ff9500]" /> : <StarOff size={16} />}
                    </motion.button>

                    {/* Availability Toggle */}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => toggleGame(game.id)}
                      title={isDisabled ? 'Enable game' : 'Disable game'}
                      className={`p-2 rounded-xl transition-colors ${
                        isDisabled
                          ? 'bg-[#ff3b30]/10 text-[#ff3b30]'
                          : 'bg-[#34c759]/10 text-[#34c759]'
                      }`}
                    >
                      {isDisabled ? <EyeOff size={16} /> : <Eye size={16} />}
                    </motion.button>

                    {/* Expand */}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setExpandedGame(isExpanded ? null : game.id)}
                      className="p-2 rounded-xl bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </motion.button>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-1 border-t border-[#e5e5ea] space-y-3">
                        {/* Game details row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-[#86868b] text-xs block">Genre</span>
                            <span className="text-[#1d1d1f]">{game.genre}</span>
                          </div>
                          <div>
                            <span className="text-[#86868b] text-xs block">Players</span>
                            <span className="text-[#1d1d1f]">{game.players}</span>
                          </div>
                          <div>
                            <span className="text-[#86868b] text-xs block">Rating</span>
                            <span className="text-[#1d1d1f]">{game.rating}/10</span>
                          </div>
                          <div>
                            <span className="text-[#86868b] text-xs block">Launches</span>
                            <span className="text-[#0071e3]">{launches}</span>
                          </div>
                        </div>

                        {/* Exe Path */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[#86868b] text-xs flex items-center gap-1">
                              <FolderOpen size={12} /> Exe Path {hasOverride && <span className="text-[#0071e3]">(overridden)</span>}
                            </span>
                            {editingPath !== game.id && (
                              <button
                                onClick={() => {
                                  setEditingPath(game.id);
                                  setPathDraft(config.pathOverrides[game.id] || game.defaultExePath);
                                }}
                                className="text-[#0071e3] text-xs hover:underline"
                              >
                                Edit Path
                              </button>
                            )}
                          </div>

                          {editingPath === game.id ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={pathDraft}
                                onChange={e => setPathDraft(e.target.value)}
                                placeholder="Enter exe path or leave empty for default..."
                                className="flex-1 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] outline-none placeholder:text-[#86868b]"
                              />
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => savePathOverride(game.id)}
                                className="px-3 py-2 bg-[#0071e3] text-white rounded-xl font-medium text-xs hover:bg-[#0077ED]"
                              >
                                Set
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setEditingPath(null); setPathDraft(''); }}
                                className="px-3 py-2 bg-[#f5f5f7] text-[#1d1d1f] rounded-xl font-medium text-xs border border-[#d2d2d7]"
                              >
                                Cancel
                              </motion.button>
                            </div>
                          ) : (
                            <p className="text-[#1d1d1f] text-xs bg-[#f5f5f7] rounded-xl px-3 py-2 break-all">
                              {effectivePath || <span className="text-[#86868b] italic">No path set</span>}
                            </p>
                          )}

                          {hasOverride && editingPath !== game.id && (
                            <p className="text-[#86868b] text-xs mt-1">
                              Default: {game.defaultExePath || 'none'}
                            </p>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-[#86868b] text-sm">{game.description}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Results count */}
      <p className="text-[#86868b] text-sm mt-4 text-center">
        Showing {filtered.length} of {GAMES_CATALOG.length} games
      </p>
    </div>
  );
}
