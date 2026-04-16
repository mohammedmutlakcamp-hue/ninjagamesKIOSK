'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Crown, Sparkles, Gift } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { RARITY_COLORS } from '@/lib/constants';

interface ChestDrop {
  id: string;
  playerId: string;
  playerName: string;
  rewardName: string;
  rewardRarity: string;
  rewardType: string;
  rewardImage?: string;
  rewardSkinId?: string;
  rewardValue?: number;
  chestTier: string;
  timestamp: number;
}

function formatTime(ts: number, ar = false) {
  const diff = Date.now() - ts;
  if (diff < 60000) return ar ? 'الآن' : 'Just now';
  if (diff < 3600000) return ar ? `منذ ${Math.floor(diff / 60000)}د` : `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return ar ? `منذ ${Math.floor(diff / 3600000)}س` : `${Math.floor(diff / 3600000)}h ago`;
  return ar ? `منذ ${Math.floor(diff / 86400000)}ي` : `${Math.floor(diff / 86400000)}d ago`;
}

export function ChestDropsPanels() {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [recentDrops, setRecentDrops] = useState<ChestDrop[]>([]);
  const [luckyDrops, setLuckyDrops] = useState<ChestDrop[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'chest-drops'), orderBy('timestamp', 'desc'), limit(20));
    const unsub = onSnapshot(q, snap => {
      const drops = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChestDrop));
      setRecentDrops(drops);
      setLuckyDrops(drops.filter(d => ['rare', 'legendary', 'mythical', 'immortal'].includes(d.rewardRarity)));
    });
    return () => unsub();
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 mb-5">
      {/* ── Last Opened ── */}
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.04) 0%, #040608 40%, #030508 100%)', border: '1px solid rgba(57,255,20,0.15)', boxShadow: '0 0 25px rgba(57,255,20,0.04)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(57,255,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.04) 1px, transparent 1px)',
          backgroundSize: '25px 25px', opacity: 0.5,
        }} />
        <div className="absolute top-0 left-0 w-4 h-4 z-[1]" style={{ borderTop: '2px solid rgba(57,255,20,0.5)', borderLeft: '2px solid rgba(57,255,20,0.5)' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 z-[1]" style={{ borderBottom: '2px solid rgba(0,200,255,0.3)', borderRight: '2px solid rgba(0,200,255,0.3)' }} />
        <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.5), rgba(0,200,255,0.2), transparent)' }} />

        <div className="relative z-[2] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)' }}>
              <Clock size={12} className="text-ninja-green" />
            </div>
            <span className="font-ninja text-xs text-gray-200 tracking-wider">{ar ? 'آخر ما تم فتحه' : 'LAST OPENED'}</span>
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-ninja-green animate-pulse" style={{ boxShadow: '0 0 6px rgba(57,255,20,0.5)' }} />
          </div>
          <div className="space-y-1">
            {recentDrops.length === 0 ? (
              <p className="font-body text-[11px] text-gray-600 text-center py-2">{ar ? 'لا يوجد جوائز بعد — كن الأول!' : 'No drops yet — be the first!'}</p>
            ) : (
              recentDrops.slice(0, 5).map((drop, idx) => {
                const rc = RARITY_COLORS[drop.rewardRarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                return (
                  <motion.div key={drop.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${rc}08, transparent)`, border: `1px solid ${rc}12` }}>
                    <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: rc, opacity: 0.3 }} />
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${rc}12`, border: `1px solid ${rc}20` }}>
                      {drop.rewardImage ? <img src={drop.rewardImage} alt="" className="w-6 h-6 object-contain" /> : <Gift size={16} style={{ color: rc }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-xs text-white truncate">{drop.playerName}</p>
                      <p className="font-body text-[10px] truncate" style={{ color: rc }}>{drop.rewardName}</p>
                    </div>
                    <span className="font-body text-[10px] text-gray-600 flex-shrink-0">{formatTime(drop.timestamp, ar)}</span>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Lucky Players ── */}
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(255,215,0,0.04) 0%, #040608 40%, #030508 100%)', border: '1px solid rgba(255,215,0,0.15)', boxShadow: '0 0 25px rgba(255,215,0,0.04)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,215,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.03) 1px, transparent 1px)',
          backgroundSize: '25px 25px', opacity: 0.5,
        }} />
        <div className="absolute top-0 left-0 w-4 h-4 z-[1]" style={{ borderTop: '2px solid rgba(255,215,0,0.5)', borderLeft: '2px solid rgba(255,215,0,0.5)' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 z-[1]" style={{ borderBottom: '2px solid rgba(168,85,247,0.3)', borderRight: '2px solid rgba(168,85,247,0.3)' }} />
        <div className="absolute top-0 left-0 right-0 h-[2px] z-[1]" style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.5), rgba(168,85,247,0.2), transparent)' }} />

        <div className="relative z-[2] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)' }}>
              <Crown size={12} className="text-yellow-400" />
            </div>
            <span className="font-ninja text-xs text-yellow-300/90 tracking-wider">{ar ? 'اللاعبون المحظوظون' : 'LUCKY PLAYERS'}</span>
            <Sparkles size={10} className="text-yellow-400/40 ml-auto" />
          </div>
          <div className="space-y-1">
            {luckyDrops.length === 0 ? (
              <p className="font-body text-[11px] text-gray-600 text-center py-2">{ar ? 'لا توجد جوائز كبيرة بعد — جرب حظك!' : 'No big wins yet — try your luck!'}</p>
            ) : (
              luckyDrops.slice(0, 5).map((drop, idx) => {
                const rc = RARITY_COLORS[drop.rewardRarity as keyof typeof RARITY_COLORS]?.bg || '#666';
                return (
                  <motion.div key={drop.id}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg relative overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${rc}0A, transparent)`, border: `1px solid ${rc}15` }}>
                    <div className="absolute left-0 top-[20%] bottom-[20%] w-[2px]" style={{ background: rc, opacity: 0.3 }} />
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${rc}15`, border: `1px solid ${rc}20` }}>
                      {drop.rewardImage ? <img src={drop.rewardImage} alt="" className="w-6 h-6 object-contain" /> : <Sparkles size={16} style={{ color: rc }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-xs text-white truncate">
                        <span className="font-ninja" style={{ color: rc }}>{drop.playerName}</span>
                      </p>
                      <p className="font-body text-[10px] text-gray-400 truncate">
                        {ar ? 'ربح ' : 'won '}<span style={{ color: rc }}>{drop.rewardName}</span> {ar ? 'من ' : 'from '}{drop.chestTier}
                      </p>
                    </div>
                    <span className="font-ninja text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                      style={{ color: rc, background: `${rc}12`, border: `1px solid ${rc}20` }}>
                      {drop.rewardRarity?.toUpperCase()}
                    </span>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
