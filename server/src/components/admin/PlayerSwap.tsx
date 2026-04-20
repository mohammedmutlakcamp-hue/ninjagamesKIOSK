'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { PC, PCStatus, KioskCommand } from '@/types';
import {
  ArrowLeftRight, Monitor, User, Coins, Clock, X, AlertTriangle,
  CheckCircle, Loader2
} from 'lucide-react';
import { HelpTip } from './HelpTip';

function formatDuration(startTime: number): string {
  const diff = Date.now() - startTime;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function PlayerSwap() {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [sourcePC, setSourcePC] = useState<string | null>(null);
  const [targetPC, setTargetPC] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const updated = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PC))
        .sort((a, b) => a.name.localeCompare(b.name));
      setPcs(updated);
    });
    return () => unsub();
  }, []);

  const occupiedPCs = pcs.filter(p => p.status === 'occupied' && p.currentPlayer);
  const freePCs = pcs.filter(p =>
    (p.status === 'free' || p.status === 'locked') && !p.currentPlayer
  );

  const source = sourcePC ? pcs.find(p => p.id === sourcePC) : null;
  const target = targetPC ? pcs.find(p => p.id === targetPC) : null;

  const sendCommand = async (pcId: string, command: KioskCommand, data?: string) => {
    const cmdString = data ? `${command}:${data}` : command;
    await updateDoc(doc(db, 'pcs', pcId), {
      pendingCommand: { command, data: data || null, timestamp: Date.now(), executed: false },
      command: cmdString,
    });
  };

  const handleSwap = async () => {
    if (!source || !target) return;
    setSwapping(true);
    setResult(null);

    try {
      // 1. Copy session data from source to target
      await updateDoc(doc(db, 'pcs', target.id), {
        currentPlayer: source.currentPlayer,
        currentPlayerName: source.currentPlayerName,
        sessionStart: source.sessionStart,
        coinsRemaining: source.coinsRemaining,
        minutesRemaining: source.minutesRemaining,
        status: 'occupied' as PCStatus,
      });

      // 2. Clear source PC
      await updateDoc(doc(db, 'pcs', source.id), {
        currentPlayer: null,
        currentPlayerName: null,
        sessionStart: null,
        coinsRemaining: null,
        minutesRemaining: null,
        status: 'free' as PCStatus,
      });

      // 3. Update active session doc if exists
      // Sessions collection uses pcId — update it to point to new PC
      // (This is a best-effort update; the session doc may not exist)

      // 4. Send commands to C# clients
      await sendCommand(source.id, 'force-logout');
      await sendCommand(target.id, 'unlock');

      setResult({
        ok: true,
        msg: `Swapped ${source.currentPlayerName} from ${source.name} to ${target.name}`,
      });
      setSourcePC(null);
      setTargetPC(null);
      setShowConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setResult({ ok: false, msg: `Swap failed: ${msg}` });
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#af52de]/10 flex items-center justify-center">
          <ArrowLeftRight size={20} className="text-[#af52de]" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Player Swap
            <HelpTip title={{ en: 'Player Swap', ar: 'نقل اللاعب' }}
              ar={<p>انقل جلسة اللاعب من جهاز إلى جهاز آخر بدون ما يخسر التوكنز أو الوقت. مفيد لو كان جهازه معطّل.</p>}>
              <p>Move a player's active session from one PC to another without them losing tokens or time left. Useful when a PC needs maintenance.</p>
            </HelpTip>
          </h2>
          <p className="text-sm text-[#86868b]">
            Move a player&apos;s session from one PC to another
          </p>
        </div>
      </div>

      {/* Result toast */}
      {result && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
          result.ok
            ? 'bg-[#34c759]/5 border-[#34c759]/20 text-[#34c759]'
            : 'bg-[#ff3b30]/5 border-[#ff3b30]/20 text-[#ff3b30]'
        }`}>
          {result.ok ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm">{result.msg}</span>
          <button onClick={() => setResult(null)} className="ml-auto text-[#86868b] hover:text-[#1d1d1f]">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source: Occupied PCs */}
        <div>
          <h3 className="text-sm font-medium text-[#af52de] mb-3 flex items-center gap-2">
            <Monitor size={14} />
            Source -- Occupied PCs
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {occupiedPCs.length === 0 && (
              <div className="text-center py-8 text-[#86868b] text-sm">
                No occupied PCs
              </div>
            )}
            {occupiedPCs.map(pc => (
              <button
                key={pc.id}
                onClick={() => { setSourcePC(pc.id); setResult(null); }}
                className={`w-full p-3 rounded-2xl border transition-all text-left flex items-center gap-3 ${
                  sourcePC === pc.id
                    ? 'bg-[#af52de]/5 border-[#af52de]/30 ring-1 ring-[#af52de]/20'
                    : 'bg-white border-[#e5e5ea]/60 hover:border-[#d2d2d7] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  sourcePC === pc.id ? 'bg-[#af52de]/15 text-[#af52de]' : 'bg-[#f5f5f7] text-[#86868b]'
                }`}>
                  {(pc.name || '').replace('PC-', '')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1d1d1f] truncate">{pc.name}</div>
                  <div className="text-xs text-[#86868b] flex items-center gap-2">
                    <User size={10} />
                    <span className="truncate">{pc.currentPlayerName || 'Unknown'}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-[#ff9500] text-xs">
                    <Coins size={10} />
                    {pc.coinsRemaining ?? 0}
                  </div>
                  {pc.sessionStart && (
                    <div className="flex items-center gap-1 text-[#86868b] text-[10px]">
                      <Clock size={9} />
                      {formatDuration(pc.sessionStart)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Target: Free PCs */}
        <div>
          <h3 className="text-sm font-medium text-[#34c759] mb-3 flex items-center gap-2">
            <Monitor size={14} />
            Target -- Free PCs
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {freePCs.length === 0 && (
              <div className="text-center py-8 text-[#86868b] text-sm">
                No free PCs available
              </div>
            )}
            {freePCs.map(pc => (
              <button
                key={pc.id}
                onClick={() => { setTargetPC(pc.id); setResult(null); }}
                className={`w-full p-3 rounded-2xl border transition-all text-left flex items-center gap-3 ${
                  targetPC === pc.id
                    ? 'bg-[#34c759]/5 border-[#34c759]/30 ring-1 ring-[#34c759]/20'
                    : 'bg-white border-[#e5e5ea]/60 hover:border-[#d2d2d7] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${
                  targetPC === pc.id ? 'bg-[#34c759]/15 text-[#34c759]' : 'bg-[#f5f5f7] text-[#86868b]'
                }`}>
                  {(pc.name || '').replace('PC-', '')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1d1d1f] truncate">{pc.name}</div>
                  <div className="text-xs text-[#86868b]">
                    {pc.status === 'locked' ? 'Locked' : 'Free'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Swap Summary & Button */}
      {source && target && (
        <div className="bg-white border border-[#e5e5ea]/60 rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-4">
            {/* Source summary */}
            <div className="flex-1 text-center">
              <div className="text-[#af52de] text-xs font-medium mb-1">FROM</div>
              <div className="font-semibold text-[#1d1d1f] text-lg">{source.name}</div>
              <div className="text-[#86868b] text-sm truncate">
                {source.currentPlayerName}
              </div>
              <div className="text-[#ff9500] text-xs mt-1">
                {source.coinsRemaining ?? 0} coins
              </div>
            </div>

            {/* Arrow */}
            <div className="shrink-0">
              <div className="w-12 h-12 rounded-full bg-[#af52de]/10 border border-[#af52de]/20 flex items-center justify-center">
                <ArrowLeftRight size={20} className="text-[#af52de]" />
              </div>
            </div>

            {/* Target summary */}
            <div className="flex-1 text-center">
              <div className="text-[#34c759] text-xs font-medium mb-1">TO</div>
              <div className="font-semibold text-[#1d1d1f] text-lg">{target.name}</div>
              <div className="text-[#86868b] text-sm">Empty</div>
            </div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={swapping}
            className="w-full mt-4 py-3 rounded-xl font-medium text-sm bg-[#0071e3] hover:bg-[#0077ED] text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ArrowLeftRight size={16} />
            Swap Player
          </button>
        </div>
      )}

      {!source && !target && (
        <div className="text-center py-6 text-[#86868b] text-sm border border-dashed border-[#d2d2d7] rounded-2xl">
          Select a source PC (occupied) and a target PC (free) to swap
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && source && target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white border border-[#e5e5ea] rounded-2xl p-6 max-w-md w-full mx-4 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#ff9500]/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-[#ff9500]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1d1d1f]">Confirm Swap</h3>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-[#f5f5f7] rounded-xl p-3">
                <div className="text-xs text-[#86868b] mb-1">Player</div>
                <div className="font-medium text-[#1d1d1f]">{source.currentPlayerName}</div>
              </div>
              <div className="bg-[#f5f5f7] rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-xs text-[#af52de] mb-1">From</div>
                  <div className="font-medium text-[#1d1d1f]">{source.name}</div>
                </div>
                <ArrowLeftRight size={16} className="text-[#86868b] shrink-0" />
                <div className="flex-1 text-right">
                  <div className="text-xs text-[#34c759] mb-1">To</div>
                  <div className="font-medium text-[#1d1d1f]">{target.name}</div>
                </div>
              </div>
              <div className="bg-[#f5f5f7] rounded-xl p-3 flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[#ff9500] text-sm">
                  <Coins size={14} />
                  {source.coinsRemaining ?? 0} coins
                </div>
                {source.sessionStart && (
                  <div className="flex items-center gap-1.5 text-[#86868b] text-sm">
                    <Clock size={14} />
                    {formatDuration(source.sessionStart)} played
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-[#86868b] mb-4">
              This will force-logout {source.name} and unlock {target.name} with the player&apos;s session.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={swapping}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSwap}
                disabled={swapping}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-[#0071e3] hover:bg-[#0077ED] text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {swapping ? (
                  <><Loader2 size={14} className="animate-spin" /> Swapping...</>
                ) : (
                  <><ArrowLeftRight size={14} /> Confirm Swap</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
