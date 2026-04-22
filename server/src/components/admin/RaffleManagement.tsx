'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  doc, onSnapshot, setDoc, updateDoc, increment, addDoc, collection, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAvatarSrcFromFields } from '@/lib/avatar';
import {
  Ticket, Trophy, Coins, Gift, Clock, Users, Play, Square, Dices,
  AlertTriangle, Loader2, RotateCcw, X,
} from 'lucide-react';
import {
  Raffle, RaffleEntrant, RaffleReward, RaffleRewardType, DEFAULT_RAFFLE_DRAFT,
} from '@/lib/raffle';

const RAFFLE_DOC = doc(db, 'raffles', 'current');

export function RaffleManagement() {
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Draft — what admin is currently typing. Starts from defaults and is
  // replaced with the live raffle whenever one is active.
  const [draft, setDraft] = useState(DEFAULT_RAFFLE_DRAFT);

  useEffect(() => {
    const unsub = onSnapshot(RAFFLE_DOC, (snap) => {
      if (snap.exists()) {
        const r = snap.data() as Raffle;
        setRaffle(r);
        if (r.active) {
          setDraft({
            entryCost: r.entryCost,
            minPlayers: r.minPlayers,
            reward: r.reward,
          });
        }
      } else {
        setRaffle(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const entrants: RaffleEntrant[] = raffle?.entrants || [];
  const isOpen = !!raffle && raffle.active && raffle.status === 'open';
  const isDrawn = !!raffle && raffle.status === 'drawn';

  // ─── Admin actions ───

  const startRaffle = async () => {
    setErr(null);
    if (!draft.reward.name.trim()) {
      setErr('Reward name is required'); return;
    }
    if (draft.entryCost < 0 || draft.minPlayers < 2) {
      setErr('Entry cost must be ≥ 0 and min players ≥ 2'); return;
    }
    setBusy('start');
    try {
      const id = `raffle_${Date.now()}`;
      const fresh: Raffle = {
        id,
        active: true,
        status: 'open',
        reward: { ...draft.reward },
        entryCost: draft.entryCost,
        minPlayers: draft.minPlayers,
        entrants: [],
        startedAt: Date.now(),
      };
      await setDoc(RAFFLE_DOC, fresh);
    } catch (e: any) {
      setErr(e?.message || 'Failed to start raffle');
    }
    setBusy(null);
  };

  const drawWinner = async () => {
    if (!raffle || !isOpen) return;
    if (entrants.length < raffle.minPlayers) {
      setErr(`Need at least ${raffle.minPlayers} players — only ${entrants.length} joined`);
      return;
    }
    setErr(null);
    setBusy('draw');
    try {
      const winnerIndex = Math.floor(Math.random() * entrants.length);
      const winner = entrants[winnerIndex];

      // Credit the reward first so the kiosk reveal can promise the coins are in.
      await applyReward(winner.uid, raffle.reward);

      const drawnAt = Date.now();
      // Flip active=false immediately so the sidebar stops glowing on every
      // kiosk the moment the draw fires. The RafflePopup keeps showing the
      // winner reveal based on `status === 'drawn'`, and the global winner
      // banner fires for everyone from the same snapshot.
      await updateDoc(RAFFLE_DOC, {
        active: false,
        status: 'drawn',
        winnerUid: winner.uid,
        winnerIndex,
        drawnAt,
      });

      // Archive a copy.
      await addDoc(collection(db, 'raffle-history'), {
        ...raffle,
        active: false,
        status: 'drawn',
        winnerUid: winner.uid,
        winnerIndex,
        drawnAt,
      });
    } catch (e: any) {
      setErr(e?.message || 'Draw failed');
    }
    setBusy(null);
  };

  const endRaffle = async () => {
    if (!raffle) return;
    const confirmed = confirm(
      isDrawn
        ? 'End this raffle? A new one can be started afterwards.'
        : 'Cancel this raffle? Entry fees will NOT be auto-refunded — do so manually if needed.'
    );
    if (!confirmed) return;
    setBusy('end');
    try {
      if (!isDrawn) {
        // Archive cancelled.
        await addDoc(collection(db, 'raffle-history'), {
          ...raffle,
          status: 'cancelled',
          endedAt: Date.now(),
        });
      }
      await updateDoc(RAFFLE_DOC, { active: false });
    } catch (e: any) {
      setErr(e?.message || 'End failed');
    }
    setBusy(null);
  };

  const refundAll = async () => {
    if (!raffle) return;
    if (!confirm(`Refund ${raffle.entryCost} tokens to every entrant? (${entrants.length} players)`)) return;
    setBusy('refund');
    try {
      for (const e of entrants) {
        try {
          await updateDoc(doc(db, 'players', e.uid), {
            coins: increment(raffle.entryCost),
          });
        } catch (err) {
          console.error('refund failed for', e.uid, err);
        }
      }
      alert(`Refunded ${raffle.entryCost} tokens to ${entrants.length} players.`);
    } catch (e: any) {
      setErr(e?.message || 'Refund failed');
    }
    setBusy(null);
  };

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[#0071e3]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Ticket size={24} className="text-[#0071e3]" /> Raffle Chest
          </h2>
          <p className="text-[#86868b] text-sm">
            A single-winner group raffle — one reward, many entrants, live drawn.
          </p>
        </div>
        {raffle && (raffle.active || isDrawn) && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
            style={{
              background: isDrawn ? 'rgba(34,197,94,0.1)' : 'rgba(255,153,0,0.1)',
              borderColor: isDrawn ? 'rgba(34,197,94,0.3)' : 'rgba(255,153,0,0.3)',
              color: isDrawn ? '#22c55e' : '#ff9500',
            }}
          >
            <motion.span
              animate={{ opacity: isDrawn ? 1 : [1, 0.4, 1] }}
              transition={{ duration: 1.4, repeat: isDrawn ? 0 : Infinity }}
              className="w-2 h-2 rounded-full"
              style={{ background: isDrawn ? '#22c55e' : '#ff9500' }}
            />
            <span className="text-xs font-medium tracking-wider">
              {isDrawn ? 'DRAWN — RAFFLE ENDED' : 'LIVE'}
            </span>
          </div>
        )}
      </div>

      {err && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#ff3b30] text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {err}
        </div>
      )}

      {/* ───── Config (editable when no live raffle) ───── */}
      <section className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 mb-5">
        <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-4">
          {raffle?.active ? 'Current Raffle' : 'Configure Next Raffle'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Field label="Reward Name (EN)">
            <input
              type="text"
              value={draft.reward.name}
              onChange={(e) => setDraft({ ...draft, reward: { ...draft.reward, name: e.target.value } })}
              disabled={!!raffle?.active}
              className={inputCls}
              placeholder="e.g. 1,000 Tokens"
            />
          </Field>
          <Field label="Reward Name (AR, optional)">
            <input
              type="text"
              value={draft.reward.nameAr || ''}
              onChange={(e) => setDraft({ ...draft, reward: { ...draft.reward, nameAr: e.target.value } })}
              disabled={!!raffle?.active}
              className={inputCls}
              placeholder="مثال: 1,000 توكن"
              dir="rtl"
            />
          </Field>
          <Field label="Reward Type">
            <select
              value={draft.reward.type}
              onChange={(e) => setDraft({ ...draft, reward: { ...draft.reward, type: e.target.value as RaffleRewardType } })}
              disabled={!!raffle?.active}
              className={inputCls}
            >
              <option value="coins">Tokens (auto-credited)</option>
              <option value="time_minutes">Free playtime minutes (auto-credited)</option>
              <option value="voucher">Voucher (added to inventory)</option>
              <option value="custom">Custom (admin fulfills manually)</option>
            </select>
          </Field>
          <Field label="Reward Amount">
            <input
              type="number"
              value={draft.reward.amount}
              onChange={(e) => setDraft({ ...draft, reward: { ...draft.reward, amount: Number(e.target.value) || 0 } })}
              disabled={!!raffle?.active}
              className={inputCls}
              placeholder="1000"
            />
          </Field>
          <Field label="Entry Cost (tokens)">
            <input
              type="number"
              value={draft.entryCost}
              onChange={(e) => setDraft({ ...draft, entryCost: Number(e.target.value) || 0 })}
              disabled={!!raffle?.active}
              className={inputCls}
              placeholder="200"
            />
          </Field>
          <Field label="Minimum Players to Draw">
            <input
              type="number"
              min={2}
              value={draft.minPlayers}
              onChange={(e) => setDraft({ ...draft, minPlayers: Math.max(2, Number(e.target.value) || 2) })}
              disabled={!!raffle?.active}
              className={inputCls}
              placeholder="6"
            />
          </Field>
        </div>

        {/* Economics preview */}
        <div className="p-3 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]/60 text-xs text-[#1d1d1f] flex flex-wrap gap-x-6 gap-y-1">
          <span>Pool at min ({draft.minPlayers} × {draft.entryCost}): <strong>{draft.minPlayers * draft.entryCost}</strong> tokens</span>
          <span>Prize: <strong>{draft.reward.type === 'coins' ? `${draft.reward.amount} tokens` : draft.reward.name}</strong></span>
          {draft.reward.type === 'coins' && (
            <span style={{ color: draft.minPlayers * draft.entryCost - draft.reward.amount >= 0 ? '#22c55e' : '#ff3b30' }}>
              House at min: <strong>{(draft.minPlayers * draft.entryCost - draft.reward.amount).toLocaleString()} tokens</strong>
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4">
          {!raffle?.active && (
            <button
              onClick={startRaffle}
              disabled={busy === 'start'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff9500] text-white text-sm font-medium hover:bg-[#e68600] disabled:opacity-50"
            >
              {busy === 'start' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Start Raffle (Make it LIVE)
            </button>
          )}

          {isOpen && (
            <>
              <button
                onClick={drawWinner}
                disabled={busy === 'draw' || entrants.length < (raffle?.minPlayers || 0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0071e3] text-white text-sm font-medium hover:bg-[#0077ED] disabled:opacity-50"
              >
                {busy === 'draw' ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
                Draw Winner Now ({entrants.length}/{raffle?.minPlayers})
              </button>
              <button
                onClick={refundAll}
                disabled={busy === 'refund' || entrants.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] text-sm font-medium hover:bg-[#e5e5ea] disabled:opacity-50"
              >
                <RotateCcw size={14} /> Refund All Entrants
              </button>
            </>
          )}

          {raffle?.active && !isDrawn && (
            <button
              onClick={endRaffle}
              disabled={busy === 'end'}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/25 text-sm font-medium hover:bg-[#ff3b30]/20 disabled:opacity-50"
            >
              {busy === 'end' ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
              Cancel Raffle
            </button>
          )}
        </div>
      </section>

      {/* ───── Live Entrants ───── (show for active OR recently drawn raffles) */}
      {raffle && (raffle.active || isDrawn) && (
        <section className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider flex items-center gap-2">
              <Users size={14} /> Live Entrants — {entrants.length}
            </h3>
            {isDrawn && raffle.winnerUid && (
              <span className="text-xs font-medium text-[#22c55e] flex items-center gap-1.5">
                <Trophy size={12} />
                Winner: {entrants.find((e) => e.uid === raffle.winnerUid)?.username || '?'}
              </span>
            )}
          </div>

          {entrants.length === 0 ? (
            <p className="text-center text-sm text-[#86868b] py-6">
              No entries yet. Players can join from their kiosk sidebar.
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {entrants.map((e, i) => {
                const isWinner = isDrawn && e.uid === raffle.winnerUid;
                return (
                  <div key={e.uid} className="flex flex-col items-center gap-1 text-center"
                    style={{ opacity: isDrawn && !isWinner ? 0.35 : 1 }}
                  >
                    <div
                      className="w-14 h-14 rounded-full overflow-hidden"
                      style={{
                        border: isWinner ? '3px solid #FFD700' : '2px solid #e5e5ea',
                        boxShadow: isWinner ? '0 0 16px rgba(255,215,0,0.6)' : 'none',
                      }}
                    >
                      <img
                        src={getAvatarSrcFromFields(e.profilePhoto, e.ninjaType)}
                        alt={e.username}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[10px] text-[#1d1d1f] font-medium truncate w-full">
                      {e.username}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── helpers ───

const inputCls =
  'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none disabled:opacity-60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[#86868b] uppercase tracking-wider block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

async function applyReward(winnerUid: string, reward: RaffleReward) {
  const ref = doc(db, 'players', winnerUid);
  if (reward.type === 'coins') {
    await updateDoc(ref, { coins: increment(reward.amount) });
  } else if (reward.type === 'time_minutes') {
    await updateDoc(ref, { remainingPlaytime: increment(reward.amount) });
  } else if (reward.type === 'voucher') {
    const voucher = {
      id: `voucher_raffle_${Date.now()}`,
      type: 'voucher',
      name: reward.name,
      rarity: 'legendary',
      obtainedAt: Date.now(),
      used: false,
    };
    await updateDoc(ref, { inventory: arrayUnion(voucher) });
  }
  // 'custom' — admin fulfills manually, no auto-apply.
}
