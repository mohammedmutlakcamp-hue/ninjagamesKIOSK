'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  PartyPopper, Plus, Trash2, Save, Loader2, CheckCircle2, Clock,
  Percent, CalendarDays, Zap, Timer,
} from 'lucide-react';

interface Schedule {
  startHour: number;
  endHour: number;
  discountPercent: number;
  days: boolean[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  active: boolean;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isScheduleActiveNow(s: Schedule): boolean {
  if (!s.active) return false;
  const now = new Date();
  // JS: 0=Sun, 1=Mon ... 6=Sat → map to our array [Mon=0 ... Sun=6]
  const jsDay = now.getDay();
  const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
  if (!s.days[dayIdx]) return false;
  const hour = now.getHours();
  if (s.startHour < s.endHour) {
    return hour >= s.startHour && hour < s.endHour;
  }
  // overnight (e.g. 22-02)
  return hour >= s.startHour || hour < s.endHour;
}

function getTimeUntilEnd(s: Schedule): string {
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  let endHour = s.endHour;
  if (s.startHour >= s.endHour && hour >= s.startHour) {
    endHour += 24;
  }
  const currentMinutes = hour * 60 + min;
  let endMinutes = endHour * 60;
  if (endMinutes <= currentMinutes) endMinutes += 24 * 60;
  const diff = endMinutes - currentMinutes;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

export function HappyHourPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick every minute for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'config', 'happy-hours'));
      if (snap.exists()) {
        const data = snap.data();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Failed to fetch happy hours:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const saveSchedules = async (updated: Schedule[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'happy-hours'), { schedules: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save happy hours:', err);
    }
    setSaving(false);
  };

  const addSchedule = () => {
    const newSchedule: Schedule = {
      startHour: 14,
      endHour: 17,
      discountPercent: 50,
      days: [true, true, true, true, true, false, false], // weekdays
      active: true,
    };
    const updated = [...schedules, newSchedule];
    setSchedules(updated);
    saveSchedules(updated);
  };

  const updateSchedule = (index: number, partial: Partial<Schedule>) => {
    const updated = schedules.map((s, i) => i === index ? { ...s, ...partial } : s);
    setSchedules(updated);
  };

  const toggleDay = (schedIdx: number, dayIdx: number) => {
    const updated = schedules.map((s, i) => {
      if (i !== schedIdx) return s;
      const newDays = [...s.days];
      newDays[dayIdx] = !newDays[dayIdx];
      return { ...s, days: newDays };
    });
    setSchedules(updated);
  };

  const deleteSchedule = (index: number) => {
    const updated = schedules.filter((_, i) => i !== index);
    setSchedules(updated);
    saveSchedules(updated);
  };

  const handleSave = () => saveSchedules(schedules);

  // Check if any schedule is active right now
  const anyActive = schedules.some(s => isScheduleActiveNow(s));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
          <PartyPopper size={24} className="text-[#0071e3]" /> Happy Hour
        </h1>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#0071e3] text-white rounded-xl font-medium px-4 py-2 text-sm flex items-center gap-2 hover:bg-[#0077ED] disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Save All'}
          </button>
          <button onClick={addSchedule} className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] flex items-center gap-2 transition-colors">
            <Plus size={14} /> Add Schedule
          </button>
        </div>
      </div>

      {/* Active Now Banner */}
      <AnimatePresence>
        {anyActive && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 rounded-2xl p-4 border border-[#34c759]/30 bg-[#34c759]/5"
          >
            <div className="flex items-center gap-3">
              <Zap size={24} className="text-[#34c759] animate-pulse" />
              <div>
                <p className="font-semibold text-[#34c759] text-lg">Happy Hour is Active Now!</p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {schedules.filter(s => isScheduleActiveNow(s)).map((s, i) => (
                    <span key={i} className="text-sm text-[#34c759] flex items-center gap-1">
                      <Timer size={12} /> {s.discountPercent}% off &mdash; {getTimeUntilEnd(s)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-[#0071e3]" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <PartyPopper size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-[#86868b]">No happy hour schedules. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule, idx) => {
            const activeNow = isScheduleActiveNow(schedule);
            return (
              <motion.div
                key={idx}
                layout
                className={`bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border transition-colors ${activeNow ? 'border-[#34c759]/40' : 'border-[#e5e5ea]/60'}`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[#1d1d1f]">Schedule #{idx + 1}</span>
                    {activeNow && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#34c759]/10 text-[#34c759] animate-pulse">
                        Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Active toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-[#86868b]">{schedule.active ? 'Enabled' : 'Disabled'}</span>
                      <input
                        type="checkbox"
                        checked={schedule.active}
                        onChange={e => updateSchedule(idx, { active: e.target.checked })}
                        className="w-5 h-5 accent-[#0071e3]"
                      />
                    </label>
                    <button
                      onClick={() => deleteSchedule(idx)}
                      className="text-[#86868b] hover:text-[#ff3b30] transition-colors p-1.5"
                      title="Delete schedule"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  {/* Start Hour */}
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block flex items-center gap-1 font-medium">
                      <Clock size={12} /> Start Hour
                    </label>
                    <select
                      value={schedule.startHour}
                      onChange={e => updateSchedule(idx, { startHour: parseInt(e.target.value) })}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{formatHour(i)}</option>
                      ))}
                    </select>
                  </div>
                  {/* End Hour */}
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block flex items-center gap-1 font-medium">
                      <Clock size={12} /> End Hour
                    </label>
                    <select
                      value={schedule.endHour}
                      onChange={e => updateSchedule(idx, { endHour: parseInt(e.target.value) })}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{formatHour(i)}</option>
                      ))}
                    </select>
                  </div>
                  {/* Discount % */}
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block flex items-center gap-1 font-medium">
                      <Percent size={12} /> Discount %
                    </label>
                    <input
                      type="number"
                      value={schedule.discountPercent}
                      onChange={e => updateSchedule(idx, { discountPercent: Math.min(100, Math.max(1, parseInt(e.target.value) || 0)) })}
                      min={1}
                      max={100}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Days of week */}
                <div>
                  <label className="text-[#86868b] text-sm mb-2 block flex items-center gap-1 font-medium">
                    <CalendarDays size={12} /> Days
                  </label>
                  <div className="flex gap-2">
                    {DAY_LABELS.map((day, dayIdx) => (
                      <button
                        key={day}
                        onClick={() => toggleDay(idx, dayIdx)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                          schedule.days[dayIdx]
                            ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/30'
                            : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:bg-[#e5e5ea]'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-4 pt-3 border-t border-[#e5e5ea]">
                  <p className="text-sm text-[#86868b]">
                    {schedule.discountPercent}% off from {formatHour(schedule.startHour)} to {formatHour(schedule.endHour)} on{' '}
                    {schedule.days.map((d, i) => d ? DAY_LABELS[i] : null).filter(Boolean).join(', ') || 'no days selected'}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
