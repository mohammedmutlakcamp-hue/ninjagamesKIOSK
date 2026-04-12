'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import {
  X, Shield, Crown, Trophy, Swords, Users, Coins, Ticket, Loader2,
} from 'lucide-react';
import { Club, CLUB_MAX_MEMBERS, clubTotalBalance } from '@/lib/clubs';
import { useEscapeKey } from '@/lib/useEscapeKey';

interface Props {
  clubId: string;
  onClose: () => void;
}

type MemberInfo = {
  uid: string;
  username: string;
  ninjaType: string;
  profilePhoto?: string;
};

export function ClubInfoCard({ clubId, onClose }: Props) {
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEscapeKey(onClose, true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'clubs', clubId), (snap) => {
      if (snap.exists()) setClub({ id: snap.id, ...(snap.data() as any) });
      else setClub(null);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId]);

  useEffect(() => {
    if (!club?.members?.length) { setMembers([]); return; }
    let cancelled = false;
    (async () => {
      const results: MemberInfo[] = [];
      for (const uid of club.members) {
        try {
          const snap = await getDoc(doc(db, 'players', uid));
          if (snap.exists()) {
            const data = snap.data() as any;
            results.push({
              uid: snap.id,
              username: data.username || 'Unknown',
              ninjaType: data.ninjaType || data.character?.ninjaType || 'neon',
              profilePhoto: data.profilePhoto,
            });
          }
        } catch (err) { console.error('fetch club member failed', uid, err); }
      }
      if (!cancelled) setMembers(results);
    })();
    return () => { cancelled = true; };
  }, [club?.members?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBalance = club ? clubTotalBalance(club) : 0;
  const wins = club?.wins || 0;
  const losses = club?.losses || 0;
  const vouchers = club?.vouchers || 0;

  return (
    <motion.div
      className="fixed inset-0 z-[250] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative z-10 w-[460px] max-w-[92vw] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)',
          border: '1.5px solid rgba(168,85,247,0.4)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 45px rgba(168,85,247,0.15)',
        }}
      >
        {/* ═══ Background layers ═══ */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(168,85,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.06) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.12) 0%, transparent 45%), radial-gradient(ellipse at 80% 100%, rgba(0,200,255,0.05) 0%, transparent 45%)',
        }} />
        {/* Top edge */}
        <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[1]" style={{
          background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.7), rgba(0,200,255,0.3), transparent)',
          boxShadow: '0 0 14px rgba(168,85,247,0.4)',
        }} />
        {/* HUD corners */}
        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, ci) => (
          <div key={ci} className={`absolute ${pos} w-5 h-5 pointer-events-none z-[3]`} style={{
            ...(pos.includes('top') ? { borderTop: '2.5px solid #A855F7' } : { borderBottom: '2.5px solid #A855F7' }),
            ...(pos.includes('left') ? { borderLeft: '2.5px solid #A855F7' } : { borderRight: '2.5px solid #A855F7' }),
            filter: 'drop-shadow(0 0 5px rgba(168,85,247,0.7))',
          }} />
        ))}

        {/* Close */}
        <button onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:rotate-90 transition-all"
          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)' }}>
          <X size={16} />
        </button>

        {/* Content */}
        <div className="relative z-[5]">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="text-purple-400 animate-spin" />
            </div>
          ) : !club ? (
            <div className="text-center py-24 text-gray-500 font-body">Club not found</div>
          ) : (
            <>
              {/* Header */}
              <div className="pt-8 pb-4 px-6 text-center">
                <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-5xl mb-3 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(168,85,247,0.08))',
                    border: '2px solid rgba(168,85,247,0.6)',
                    boxShadow: '0 0 24px rgba(168,85,247,0.35)',
                  }}>
                  {club.logo?.startsWith?.('data:image/')
                    ? <img src={club.logo} alt="Club logo" className="w-full h-full object-cover" />
                    : (club.logo || '⚔️')}
                </div>
                <div className="font-ninja text-[11px] text-purple-300/80 tracking-[0.25em] mb-1">[{club.tag}]</div>
                <h2 className="font-ninja text-3xl text-white tracking-wide mb-1" style={{ textShadow: '0 0 14px rgba(168,85,247,0.45)' }}>
                  {club.name}
                </h2>
                <p className="font-body text-xs text-gray-500">Club of {club.members?.length || 0} / {CLUB_MAX_MEMBERS}</p>
              </div>

              {/* Stats grid */}
              <div className="px-6 pb-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg py-3 px-2 text-center"
                  style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.35)', boxShadow: '0 0 10px rgba(234,179,8,0.1)' }}>
                  <Coins size={18} className="text-yellow-400 mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.7))' }} />
                  <p className="font-ninja text-lg text-yellow-400" style={{ textShadow: '0 0 6px rgba(234,179,8,0.5)' }}>{totalBalance}</p>
                  <p className="font-body text-[10px] text-gray-500 uppercase tracking-wider">Treasury</p>
                </div>
                <div className="rounded-lg py-3 px-2 text-center"
                  style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.35)', boxShadow: '0 0 10px rgba(57,255,20,0.1)' }}>
                  <Trophy size={18} className="text-green-400 mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(57,255,20,0.7))' }} />
                  <p className="font-ninja text-lg text-green-400" style={{ textShadow: '0 0 6px rgba(57,255,20,0.5)' }}>{wins}</p>
                  <p className="font-body text-[10px] text-gray-500 uppercase tracking-wider">Wins</p>
                </div>
                <div className="rounded-lg py-3 px-2 text-center"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', boxShadow: '0 0 10px rgba(239,68,68,0.1)' }}>
                  <Swords size={18} className="text-red-400 mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.7))' }} />
                  <p className="font-ninja text-lg text-red-400" style={{ textShadow: '0 0 6px rgba(239,68,68,0.5)' }}>{losses}</p>
                  <p className="font-body text-[10px] text-gray-500 uppercase tracking-wider">Losses</p>
                </div>
              </div>

              {/* Voucher pool row */}
              <div className="px-6 pb-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.3)' }}>
                  <Ticket size={14} className="text-cyan-300" style={{ filter: 'drop-shadow(0 0 3px rgba(0,191,255,0.6))' }} />
                  <span className="font-ninja text-[11px] text-cyan-300 tracking-wider flex-1">VOUCHER POOL</span>
                  <span className="font-ninja text-sm text-cyan-300">{vouchers}</span>
                </div>
              </div>

              {/* Members */}
              <div className="px-6 pb-6">
                <h4 className="font-ninja text-[10px] text-purple-300/80 tracking-[0.2em] mb-2">ROSTER</h4>
                <div className="space-y-1.5">
                  {members.map(m => {
                    const isLeader = m.uid === club.leaderUid;
                    return (
                      <div key={m.uid} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:brightness-125 transition-all"
                        onClick={() => window.dispatchEvent(new CustomEvent('view-player-profile', { detail: { uid: m.uid } }))}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isLeader ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
                          style={{ border: isLeader ? '1.5px solid #EAB308' : '1px solid rgba(255,255,255,0.1)' }}>
                          <img src={m.profilePhoto || `/img/pfp-${m.ninjaType}.png`} alt={m.username} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/img/pfp-neon.png'; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-body text-[13px] text-white truncate">{m.username}</span>
                            {isLeader && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-ninja text-yellow-400 tracking-wider"
                                style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                <Crown size={8} /> LEADER
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ClubInfoCard;
