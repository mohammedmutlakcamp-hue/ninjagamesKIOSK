'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, updateDoc, doc, getDocs, query, orderBy, limit,
  where, onSnapshot, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { HelpTip } from './HelpTip';
import {
  Clock, DollarSign, User, LogIn, LogOut, RefreshCw, CalendarDays,
  Timer, Banknote, FileText, TrendingUp, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface ShiftDoc {
  id: string;
  staffName: string;
  startTime: Timestamp;
  endTime: Timestamp | null;
  cashStart: number;
  cashEnd: number | null;
  notes: string;
  date: string; // YYYY-MM-DD
}

// ── Helpers ───────────────────────────────────────────────────
function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDurationHours(ms: number): string {
  const hours = ms / 3600000;
  return `${hours.toFixed(1)}h`;
}

// ── Component ─────────────────────────────────────────────────
export function ShiftManagement() {
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [activeShift, setActiveShift] = useState<ShiftDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState('0m 0s');

  // Form state
  const [staffName, setStaffName] = useState('');
  const [cashStart, setCashStart] = useState('');
  const [cashEnd, setCashEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [endNotes, setEndNotes] = useState('');
  const [showEndForm, setShowEndForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Real-time listener for shifts ───────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'shifts'),
      orderBy('startTime', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs: ShiftDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ShiftDoc[];

      setShifts(docs);

      // Find active shift (no endTime)
      const active = docs.find((s) => !s.endTime);
      setActiveShift(active || null);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ── Elapsed time ticker ─────────────────────────────────────
  useEffect(() => {
    if (!activeShift) {
      setElapsed('0m 0s');
      return;
    }

    const tick = () => {
      const start = activeShift.startTime.toDate().getTime();
      const now = Date.now();
      setElapsed(formatDuration(now - start));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // ── Start Shift ─────────────────────────────────────────────
  const handleStartShift = async () => {
    if (!staffName.trim()) {
      setError('Enter staff name');
      return;
    }
    const cashVal = parseFloat(cashStart);
    if (isNaN(cashVal) || cashVal < 0) {
      setError('Enter valid starting cash amount');
      return;
    }
    if (activeShift) {
      setError('A shift is already active. End it first.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await addDoc(collection(db, 'shifts'), {
        staffName: staffName.trim(),
        startTime: Timestamp.now(),
        endTime: null,
        cashStart: cashVal,
        cashEnd: null,
        notes: notes.trim(),
        date: getTodayKey(),
      });
      setStaffName('');
      setCashStart('');
      setNotes('');
    } catch (err: any) {
      setError('Failed to start shift: ' + err.message);
    }
    setSubmitting(false);
  };

  // ── End Shift ───────────────────────────────────────────────
  const handleEndShift = async () => {
    if (!activeShift) return;
    const cashVal = parseFloat(cashEnd);
    if (isNaN(cashVal) || cashVal < 0) {
      setError('Enter valid ending cash amount');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await updateDoc(doc(db, 'shifts', activeShift.id), {
        endTime: Timestamp.now(),
        cashEnd: cashVal,
        notes: activeShift.notes
          ? activeShift.notes + (endNotes.trim() ? ' | End: ' + endNotes.trim() : '')
          : endNotes.trim(),
      });
      setCashEnd('');
      setEndNotes('');
      setShowEndForm(false);
    } catch (err: any) {
      setError('Failed to end shift: ' + err.message);
    }
    setSubmitting(false);
  };

  // ── Daily Summary ───────────────────────────────────────────
  const todayKey = getTodayKey();
  const todayShifts = shifts.filter((s) => s.date === todayKey);

  const totalHoursToday = todayShifts.reduce((acc, s) => {
    if (!s.startTime) return acc;
    const start = s.startTime.toDate().getTime();
    const end = s.endTime ? s.endTime.toDate().getTime() : Date.now();
    return acc + (end - start);
  }, 0);

  const totalCashToday = todayShifts.reduce((acc, s) => {
    if (s.cashStart != null && s.cashEnd != null) {
      return acc + (s.cashEnd - s.cashStart);
    }
    return acc;
  }, 0);

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={32} className="animate-spin text-[#0071e3]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center border border-[#0071e3]/20">
          <Clock size={22} className="text-[#0071e3]" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Shift Management
            <HelpTip title={{ en: 'Cashier Shifts', ar: 'مناوبات الكاشير' }}
              ar={<p>تتبّع مناوبات الكاشير: المبلغ الافتتاحي، مبلغ الإقفال، تسوية الصندوق. ضروري لحساب النقد اليومي.</p>}>
              <p>Cashier shift tracking: opening cash, closing cash, till reconciliation. Essential for daily cash accountability.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">Track staff shifts & cash register</p>
        </div>
      </div>

      {/* ── Daily Summary Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center gap-2 mb-1">
            <Timer size={16} className="text-[#0071e3]" />
            <span className="text-[#86868b] text-xs uppercase tracking-wider">Hours Today</span>
          </div>
          <p className="text-2xl font-semibold text-[#1d1d1f]">{formatDurationHours(totalHoursToday)}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center gap-2 mb-1">
            <Banknote size={16} className="text-[#34c759]" />
            <span className="text-[#86868b] text-xs uppercase tracking-wider">Cash Collected</span>
          </div>
          <p className={`text-2xl font-semibold ${totalCashToday >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
            {totalCashToday >= 0 ? '+' : ''}{totalCashToday.toFixed(2)} JOD
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={16} className="text-[#5856d6]" />
            <span className="text-[#86868b] text-xs uppercase tracking-wider">Shifts Today</span>
          </div>
          <p className="text-2xl font-semibold text-[#1d1d1f]">{todayShifts.length}</p>
        </motion.div>
      </div>

      {/* ── Active Shift Banner ─────────────────────────────── */}
      <AnimatePresence>
        {activeShift && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-2 border-[#34c759]/40 relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#34c759] animate-pulse" />
                  <span className="text-lg font-semibold text-[#34c759]">Active Shift</span>
                </div>
                <motion.span
                  key={elapsed}
                  className="text-2xl font-semibold text-[#1d1d1f] tabular-nums"
                >
                  {elapsed}
                </motion.span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[#86868b] text-xs uppercase">Staff</span>
                  <p className="text-[#1d1d1f] font-medium flex items-center gap-1.5">
                    <User size={14} className="text-[#0071e3]" />
                    {activeShift.staffName}
                  </p>
                </div>
                <div>
                  <span className="text-[#86868b] text-xs uppercase">Started</span>
                  <p className="text-[#1d1d1f] font-medium">
                    {formatTime(activeShift.startTime.toDate())}
                  </p>
                </div>
                <div>
                  <span className="text-[#86868b] text-xs uppercase">Starting Cash</span>
                  <p className="text-[#1d1d1f] font-medium flex items-center gap-1.5">
                    <DollarSign size={14} className="text-[#34c759]" />
                    {activeShift.cashStart.toFixed(2)} JOD
                  </p>
                </div>
                <div>
                  <span className="text-[#86868b] text-xs uppercase">Notes</span>
                  <p className="text-[#86868b] text-sm">{activeShift.notes || '—'}</p>
                </div>
              </div>

              {/* End Shift */}
              <div className="mt-4">
                {!showEndForm ? (
                  <button
                    onClick={() => setShowEndForm(true)}
                    className="text-[#ff3b30] border border-[#d2d2d7] hover:bg-[#fff5f5] flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  >
                    <LogOut size={16} />
                    End Shift
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3 pt-3 border-t border-[#e5e5ea]"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[#86868b] text-xs uppercase mb-1 block font-medium">Ending Cash (JOD)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cashEnd}
                          onChange={(e) => setCashEnd(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[#86868b] text-xs uppercase mb-1 block font-medium">End Notes (optional)</label>
                        <input
                          type="text"
                          value={endNotes}
                          onChange={(e) => setEndNotes(e.target.value)}
                          placeholder="Any notes..."
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleEndShift}
                        disabled={submitting}
                        className="text-[#ff3b30] border border-[#d2d2d7] hover:bg-[#fff5f5] flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        <LogOut size={14} />
                        {submitting ? 'Ending...' : 'Confirm End Shift'}
                      </button>
                      <button
                        onClick={() => { setShowEndForm(false); setError(''); }}
                        className="px-4 py-2 rounded-xl border border-[#d2d2d7] text-[#86868b] text-sm hover:bg-[#f5f5f7] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Start Shift Form ────────────────────────────────── */}
      {!activeShift && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <LogIn size={18} className="text-[#0071e3]" />
            Start New Shift
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[#86868b] text-xs uppercase mb-1 block font-medium">Staff Name</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-[#86868b] text-xs uppercase mb-1 block font-medium">Starting Cash (JOD)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashStart}
                  onChange={(e) => setCashStart(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-[#86868b] text-xs uppercase mb-1 block font-medium">Notes (optional)</label>
              <div className="relative">
                <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes..."
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleStartShift}
            disabled={submitting}
            className="bg-[#0071e3] text-white rounded-xl font-medium flex items-center gap-2 px-6 py-2.5 text-sm hover:bg-[#0077ED] disabled:opacity-50 transition-colors"
          >
            <LogIn size={16} />
            {submitting ? 'Starting...' : 'Start Shift'}
          </button>
        </motion.div>
      )}

      {/* ── Error ───────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/20 text-[#ff3b30] text-sm"
          >
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-[#ff3b30]/60 hover:text-[#ff3b30]">
              &times;
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shift History ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="p-4 border-b border-[#e5e5ea] flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1d1d1f] flex items-center gap-2">
            <CalendarDays size={18} className="text-[#0071e3]" />
            Shift History
          </h3>
          <span className="text-[#86868b] text-xs">Last 30 shifts</span>
        </div>

        {shifts.length === 0 ? (
          <div className="p-8 text-center text-[#86868b]">
            <Clock size={32} className="mx-auto mb-2 opacity-30" />
            <p>No shifts recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[#e5e5ea]/40">
            {shifts.map((shift, i) => {
              const start = shift.startTime?.toDate();
              const end = shift.endTime?.toDate();
              const duration = start
                ? end
                  ? end.getTime() - start.getTime()
                  : Date.now() - start.getTime()
                : 0;
              const cashDiff =
                shift.cashStart != null && shift.cashEnd != null
                  ? shift.cashEnd - shift.cashStart
                  : null;
              const isActive = !shift.endTime;

              return (
                <motion.div
                  key={shift.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className={`px-4 py-3 grid grid-cols-6 gap-3 items-center text-sm ${
                    isActive ? 'bg-[#34c759]/5' : 'hover:bg-[#f5f5f7]'
                  } transition-colors`}
                >
                  {/* Staff */}
                  <div className="flex items-center gap-2 col-span-1">
                    <User size={14} className={isActive ? 'text-[#34c759]' : 'text-[#86868b]'} />
                    <span className="text-[#1d1d1f] truncate">{shift.staffName}</span>
                    {isActive && (
                      <span className="text-[10px] bg-[#34c759]/10 text-[#34c759] px-1.5 py-0.5 rounded-full font-medium uppercase">
                        active
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <div className="text-[#86868b] col-span-1">
                    {start ? formatDate(start) : '—'}
                  </div>

                  {/* Time Range */}
                  <div className="text-[#1d1d1f] col-span-1">
                    {start ? formatTime(start) : '—'} — {end ? formatTime(end) : 'ongoing'}
                  </div>

                  {/* Duration */}
                  <div className="col-span-1">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                      isActive
                        ? 'bg-[#34c759]/10 text-[#34c759]'
                        : 'bg-[#f5f5f7] text-[#1d1d1f]'
                    }`}>
                      {formatDuration(duration)}
                    </span>
                  </div>

                  {/* Cash Diff */}
                  <div className="col-span-1">
                    {cashDiff !== null ? (
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        cashDiff >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'
                      }`}>
                        <TrendingUp size={12} />
                        {cashDiff >= 0 ? '+' : ''}{cashDiff.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[#d2d2d7] text-xs">—</span>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="text-[#86868b] text-xs truncate col-span-1" title={shift.notes || ''}>
                    {shift.notes || '—'}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
