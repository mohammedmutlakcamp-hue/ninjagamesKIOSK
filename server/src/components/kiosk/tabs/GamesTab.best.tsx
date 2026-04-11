'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import Image from 'next/image';
import {
  Search, Play, Star, BarChart3, Users, X,
  Sparkles, ChevronRight, Coins, CheckSquare, ChevronLeft,
  Plus, Send, Gift, Gamepad2
} from 'lucide-react';
import { notifyFriendsGameStart } from '@/lib/notifications';
import { Lang, t } from '@/lib/translations';

interface Props {
  player: any;
  lang?: Lang;
}

const genreColors: Record<string, string> = {
  'FPS': '#FF4444', 'Battle Royale': '#FF8C00', 'MOBA': '#4488FF',
  'MOBA Shooter': '#00CCFF', 'Open World': '#00CC88', 'RPG': '#AA44FF',
  'Action RPG': '#CC44FF', 'Racing': '#00AAFF', 'Sports': '#44CC44',
  'Fighting': '#FF4488', 'Sandbox': '#88CC44', 'Platform': '#FFAA00',
  'Co-op': '#44CCAA', 'Party': '#FF66CC', 'Horror Co-op': '#8888AA',
  'Survival': '#AA8844', 'Looter Shooter': '#FFAA44', 'Strategy': '#DDAA00',
  'Action': '#FF5533', 'App': '#4488CC',
};

const FEATURED_IDS = ['csgo', 'valorant', 'fortnite', 'lol', 'overwatch2', 'rocketleague', 'fivem', 'hogwarts'];
const SUGGESTED_IDS = ['csgo', 'valorant', 'dota2', 'fivem', 'rocketleague'];

export function GamesTab({ player, lang = 'en' }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [rightTab, setRightTab] = useState<'coins' | 'credit' | 'rewards'>('coins');

  const featured = useMemo(() =>
    FEATURED_IDS.map(id => GAMES_CATALOG.find(g => g.id === id)).filter(Boolean),
  []);

  const suggested = useMemo(() =>
    SUGGESTED_IDS.map(id => GAMES_CATALOG.find(g => g.id === id)).filter(Boolean),
  []);

  useEffect(() => {
    if (selectedGame) return;
    const timer = setInterval(() => setFeaturedIndex(i => (i + 1) % featured.length), 6000);
    return () => clearInterval(timer);
  }, [featured.length, selectedGame]);

  const launchGame = (game: any) => {
    if ((window as any).electronAPI) (window as any).electronAPI.launchGame(game.id, game.defaultExePath);
    notifyFriendsGameStart(player, game);
  };

  const activeGame = selectedGame || featured[featuredIndex];
  const playerCoins = Math.floor(player?.coins || 0);

  return (
    <div className="h-screen flex flex-col overflow-hidden -mt-4 -mb-8">

      {/* ── TOP: Banner + Search ── */}
      <div className="flex items-center gap-4 mx-3 mt-3 mb-3 flex-shrink-0">
        <div className="flex-1 relative rounded-2xl overflow-hidden" style={{ height: 70 }}>
          <Image src="/img/banner.png" alt="Ninja Games" fill className="object-cover" priority />
          <div className="absolute inset-0 border border-ninja-green/15 rounded-2xl" />
        </div>
        <div className="relative w-[200px] flex-shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(lang, 'search_games')}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-white font-body text-xs focus:border-ninja-green/40 outline-none transition-all placeholder:text-gray-600"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={12} /></button>
          )}
        </div>
      </div>

      {/* ── MAIN: Hero + Right Panel ── */}
      <div className="flex gap-3 mx-3 flex-shrink-0" style={{ height: '52%' }}>

        {/* CENTER: Featured game hero */}
        <div className="flex-1 min-w-0 relative rounded-2xl overflow-hidden border border-white/[0.06]">
          <AnimatePresence mode="wait">
            {activeGame && (
              <motion.div key={activeGame.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }} className="absolute inset-0">
                <Image src={activeGame.coverImage} alt={activeGame.name} fill className="object-cover" priority />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

                <div className="absolute inset-0 flex flex-col justify-end p-7">
                  <h2 className="font-ninja text-4xl text-white mb-3 drop-shadow-lg tracking-wide">
                    {activeGame.name.toUpperCase()}
                  </h2>
                  <div className="flex items-center gap-3">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => launchGame(activeGame)}
                      className="px-7 py-2.5 rounded-xl bg-ninja-green text-black font-ninja text-sm flex items-center gap-2 hover:bg-green-400 transition-all"
                      style={{ boxShadow: '0 0 25px rgba(57,255,20,0.4)' }}>
                      <Play size={14} fill="black" /> PLAY NOW
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-ninja text-xs hover:bg-white/20 transition-all backdrop-blur-sm">
                      DETAILS
                    </motion.button>
                  </div>
                </div>

                {!selectedGame && (
                  <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
                    {featured.map((_, i) => (
                      <button key={i} onClick={() => setFeaturedIndex(i)}
                        className={`transition-all rounded-full ${i === featuredIndex ? 'w-5 h-1.5 bg-ninja-green' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/50'}`} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT: Coins/Balance/Rewards panel */}
        <div className="w-[200px] flex-shrink-0 flex flex-col gap-2.5">

          {/* Tabs: Coins | Add Credit | Rewards */}
          <div className="rounded-2xl border border-white/[0.06] p-2 flex items-center justify-around"
            style={{ background: 'rgba(8,8,12,0.9)' }}>
            {[
              { id: 'coins' as const, icon: <Coins size={14} />, label: 'Coins' },
              { id: 'credit' as const, icon: <Plus size={14} />, label: 'Add Credit' },
              { id: 'rewards' as const, icon: <Gift size={14} />, label: 'Rewards' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setRightTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                  rightTab === tab.id ? 'text-ninja-green' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {tab.icon}
                <span className="font-body text-[8px]">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Balance card */}
          <div className="rounded-2xl border border-ninja-green/15 p-4 text-center"
            style={{ background: 'rgba(8,12,8,0.9)' }}>
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <span className="font-ninja text-3xl text-ninja-green">{playerCoins.toLocaleString()}</span>
              <span className="font-body text-[10px] text-gray-400 self-start mt-2">Coins</span>
            </div>
            <p className="font-ninja text-[10px] text-ninja-green/70 tracking-widest mb-3">BALANCE</p>

            {/* Add Credit button */}
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-xl font-ninja text-sm flex items-center justify-center gap-2 mb-2 transition-all"
              style={{ background: '#39FF14', color: '#000' }}>
              <Plus size={14} strokeWidth={3} /> Add Credit
            </motion.button>

            {/* Send Coins button */}
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="w-full py-2.5 rounded-xl font-ninja text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.3)', color: '#39FF14' }}>
              <Send size={13} /> Send Coins
            </motion.button>
          </div>

          {/* Rewards / Chest card */}
          <div className="rounded-2xl flex-1 relative overflow-hidden"
            style={{ border: '1px solid rgba(120,70,0,0.25)' }}>
            {/* Dark to fire gradient */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to bottom, rgba(8,6,3,0.98) 0%, rgba(30,15,5,0.95) 35%, rgba(80,35,5,0.6) 65%, rgba(160,70,0,0.45) 85%, rgba(200,90,0,0.35) 100%)',
            }} />
            <div className="absolute bottom-0 left-0 right-0 h-2/3" style={{
              background: 'radial-gradient(ellipse 130% 60% at 50% 100%, rgba(255,130,0,0.3), rgba(200,80,0,0.12) 50%, transparent 80%)',
            }} />

            <div className="relative h-full flex flex-col items-center justify-center p-4">
              {/* REWARDS label */}
              <p className="font-ninja text-[10px] text-yellow-400/80 tracking-[0.2em] mb-1">REWARDS</p>
              <div className="flex gap-0.5 mb-3">
                {[0,1,2,3].map(n => (
                  <motion.div key={n} animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity, delay: n * 0.2 }}>
                    <Star size={12} fill="#facc15" className="text-yellow-400 drop-shadow-[0_0_4px_rgba(255,200,0,0.5)]" />
                  </motion.div>
                ))}
              </div>

              {/* Chest */}
              <motion.div animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} className="mb-4">
                <div className="w-24 h-24 relative">
                  <Image src="/img/chest-gold.png" alt="Chest" fill
                    className="object-contain drop-shadow-[0_8px_25px_rgba(255,130,0,0.5)]" />
                </div>
              </motion.div>

              {/* Claim Reward — orange/gold button */}
              <motion.button whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(255,150,0,0.3)' }}
                whileTap={{ scale: 0.95 }}
                className="w-full py-2.5 rounded-xl font-ninja text-xs tracking-wider flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,160,0,0.4), rgba(200,100,0,0.3))',
                  border: '1px solid rgba(255,160,0,0.5)',
                  color: '#FFD700',
                }}>
                <Gift size={13} /> Claim Reward
              </motion.button>
            </div>
          </div>

          {/* View All Tasks */}
          <motion.button whileHover={{ scale: 1.02 }}
            className="rounded-2xl py-2.5 font-ninja text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all"
            style={{ background: 'rgba(8,8,12,0.8)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(200,200,200,0.6)' }}>
            <CheckSquare size={11} /> View All Tasks
          </motion.button>
        </div>
      </div>

      {/* ── BOTTOM: Suggested Games ── */}
      <div className="flex-1 min-h-0 mx-3 mt-3 flex flex-col">
        <div className="flex items-center gap-2 mb-2.5 flex-shrink-0">
          <Gamepad2 size={13} className="text-gray-500" />
          <span className="font-ninja text-xs text-gray-400 tracking-widest">Suggested Game</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2" />
        </div>

        <div className="flex-1 flex gap-3 min-h-0">
          {suggested.map((game, i) => {
            if (!game) return null;
            return (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setSelectedGame(game)}
                className="flex-1 rounded-2xl overflow-hidden border border-white/[0.06] hover:border-ninja-green/30 cursor-pointer group transition-all relative flex flex-col"
                style={{ background: 'rgba(8,8,12,0.9)' }}
              >
                {/* Game art — top portion */}
                <div className="relative flex-1 min-h-0 overflow-hidden">
                  <Image src={game.coverImage} alt={game.name} fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500" sizes="250px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,8,12,0.95)] via-transparent to-transparent" />
                  {/* Game title overlay on image */}
                  <div className="absolute top-2 left-2 right-2">
                    <p className="font-ninja text-[11px] text-white drop-shadow-lg tracking-wider truncate"
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                      {game.name.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Bottom: Game name + Play Now */}
                <div className="p-2.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center overflow-hidden relative flex-shrink-0">
                      <Image src={game.coverImage} alt="" fill className="object-cover" sizes="20px" />
                    </div>
                    <p className="font-ninja text-[10px] text-white truncate">{game.name.toUpperCase()}</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={(e) => { e.stopPropagation(); launchGame(game); }}
                    className="w-full py-1.5 rounded-lg bg-ninja-green/15 border border-ninja-green/25 text-ninja-green font-ninja text-[10px] flex items-center justify-center gap-1.5 hover:bg-ninja-green/25 transition-all">
                    <Play size={10} fill="#39FF14" /> PLAY NOW
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
