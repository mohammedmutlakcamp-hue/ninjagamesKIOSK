'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { GAMES_CATALOG } from '@/lib/games-catalog';
import { Crosshair, Skull, Target, Trophy, X, CheckCircle2, Send } from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';

interface Props {
  player: any;
  onClose: () => void;
}

export function MatchReportModal({ player, onClose }: Props) {
  const [gameId, setGameId] = useState('');
  const [kills, setKills] = useState('');
  const [deaths, setDeaths] = useState('');
  const [headshots, setHeadshots] = useState('');
  const [won, setWon] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!gameId) return;

    const k = parseInt(kills) || 0;
    const d = parseInt(deaths) || 0;
    const h = parseInt(headshots) || 0;

    try {
      const updates: any = {
        'stats.totalKills': increment(k),
        'stats.totalDeaths': increment(d),
        'stats.totalHeadshots': increment(h),
        'stats.gamesPlayed': increment(1),
        ...(won ? { 'stats.totalWins': increment(1) } : {}),
        [`stats.gameStats.${gameId}.kills`]: increment(k),
        [`stats.gameStats.${gameId}.deaths`]: increment(d),
        [`stats.gameStats.${gameId}.headshots`]: increment(h),
        [`stats.gameStats.${gameId}.lastPlayed`]: Date.now(),
        ...(won ? { [`stats.gameStats.${gameId}.wins`]: increment(1) } : {}),
      };

      await updateDoc(doc(db, 'players', player.uid), updates);
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Failed to submit match report:', err);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="relative overflow-hidden rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
            border: '1px solid rgba(57,255,20,0.15)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)',
          }}
        >
          <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
          <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
          <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
          <CheckCircle2 size={56} className="text-ninja-green mx-auto mb-4" />
          <p className="font-ninja text-xl text-ninja-green">MATCH RECORDED!</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-8 w-[450px] max-w-[90vw]"
        style={{
          background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
          border: '1px solid rgba(57,255,20,0.15)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HUD corners + accent */}
        <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
        <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-ninja text-2xl text-ninja-green">REPORT MATCH</h2>
          <button onClick={onClose} className="ninja-btn ninja-btn-ghost ninja-btn-icon">
            <X size={28} />
          </button>
        </div>

        {/* Game Select */}
        <div className="mb-4">
          <label className="text-gray-400 text-sm font-body mb-1 block">GAME</label>
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className="w-full bg-black/50 border-2 border-ninja-green/30 rounded-lg px-4 py-3 text-white font-body focus:border-ninja-green outline-none"
          >
            <option value="">Select game...</option>
            {GAMES_CATALOG.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-gray-400 text-xs font-body mb-1 flex items-center justify-center gap-1">
              <Crosshair size={12} /> KILLS
            </label>
            <NinjaInput
              type="number"
              value={kills}
              onChange={(e) => setKills(e.target.value)}
              icon={<Crosshair size={14} />}
              className="text-center"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-body mb-1 flex items-center justify-center gap-1">
              <Skull size={12} /> DEATHS
            </label>
            <NinjaInput
              type="number"
              value={deaths}
              onChange={(e) => setDeaths(e.target.value)}
              icon={<Skull size={14} />}
              className="text-center"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs font-body mb-1 flex items-center justify-center gap-1">
              <Target size={12} /> HEADSHOTS
            </label>
            <NinjaInput
              type="number"
              value={headshots}
              onChange={(e) => setHeadshots(e.target.value)}
              icon={<Target size={14} />}
              className="text-center"
              placeholder="0"
              min="0"
            />
          </div>
        </div>

        {/* Won? */}
        <div className="mb-6">
          <button
            onClick={() => setWon(!won)}
            className={`ninja-btn ninja-btn-full flex items-center justify-center gap-2 ${
              won
                ? 'ninja-btn-green-fill'
                : 'ninja-btn-ghost'
            }`}
          >
            <Trophy size={18} />
            {won ? 'WON!' : 'Did you win?'}
          </button>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="ninja-btn ninja-btn-ghost flex-1"
          >
            CANCEL
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!gameId}
            className="ninja-btn ninja-btn-green-fill flex-1 flex items-center justify-center gap-2"
          >
            <Send size={16} /> SUBMIT
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
