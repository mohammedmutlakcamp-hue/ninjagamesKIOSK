'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Clock, Plus, Edit3, Trash2, X, Save, Power, RotateCcw,
  Megaphone, Zap, ToggleLeft, ToggleRight, Calendar,
  CheckCircle2, XCircle, AlertCircle, Timer, PlayCircle
} from 'lucide-react';

interface ScheduledTask {
  id: string;
  type: 'restart-all' | 'shutdown-all' | 'send-announcement' | 'run-campaign';
  time: string; // HH:MM
  days: boolean[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  enabled: boolean;
  lastRun?: number;
  description: string;
  // send-announcement fields — used when type === 'send-announcement'
  announcementTitle?: string;
  announcementType?: 'info' | 'warning' | 'urgent' | 'promo';
  announcementDuration?: number; // seconds the banner stays visible
  executionLog?: ExecutionEntry[];
}

interface ExecutionEntry {
  timestamp: number;
  result: 'success' | 'failed' | 'skipped';
  message?: string;
}

const TASK_TYPES = [
  { value: 'restart-all' as const, label: 'Restart All PCs', icon: RotateCcw, color: '#0071e3' },
  { value: 'shutdown-all' as const, label: 'Shutdown All PCs', icon: Power, color: '#ff3b30' },
  { value: 'send-announcement' as const, label: 'Send Announcement', icon: Megaphone, color: '#ff9500' },
  { value: 'run-campaign' as const, label: 'Run Campaign', icon: Zap, color: '#A855F7' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getNextRun(task: ScheduledTask): string {
  if (!task.enabled) return 'Disabled';
  const now = new Date();
  const [hours, minutes] = task.time.split(':').map(Number);

  // Check today and next 7 days
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    const dayOfWeek = candidate.getDay();
    if (!task.days[dayOfWeek]) continue;
    if (candidate.getTime() <= now.getTime()) continue;

    // Format
    const isToday = offset === 0;
    const isTomorrow = offset === 1;
    const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : DAY_LABELS[dayOfWeek];
    return `${dayLabel} at ${task.time}`;
  }
  return 'No upcoming run';
}

function formatTimestamp(ts: number): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

export function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [formType, setFormType] = useState<ScheduledTask['type']>('restart-all');
  const [formTime, setFormTime] = useState('00:00');
  const [formDays, setFormDays] = useState<boolean[]>([false, true, true, true, true, true, false]);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formDescription, setFormDescription] = useState('');
  // Announcement-only form fields
  const [formAnnouncementTitle, setFormAnnouncementTitle] = useState('');
  const [formAnnouncementType, setFormAnnouncementType] = useState<'info' | 'warning' | 'urgent' | 'promo'>('info');
  const [formAnnouncementDuration, setFormAnnouncementDuration] = useState(60);

  // Load tasks
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'scheduled-tasks'), (snap) => {
      if (snap.exists()) {
        setTasks(snap.data().tasks || []);
      } else {
        setDoc(doc(db, 'config', 'scheduled-tasks'), { tasks: [] });
        setTasks([]);
      }
    });
    return () => unsub();
  }, []);

  // Client-side execution check every 60 seconds.
  //
  // NOTE: this only fires while this page is open in a browser. The same
  // logic runs server-side via /api/cron/scheduled-tasks (Vercel Cron, 1 min)
  // so tasks fire even when no admin is watching. The two checks share the
  // `lastRun` field so a task can't fire twice in the same minute.
  useEffect(() => {
    const checkTasks = async () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.getDay();

      let changed = false;
      const updatedTasks = await Promise.all(tasks.map(async (task) => {
        if (!task.enabled) return task;
        if (task.time !== currentTime) return task;
        if (!task.days[currentDay]) return task;

        // Don't re-execute within same minute
        if (task.lastRun) {
          const lastRunDate = new Date(task.lastRun);
          if (lastRunDate.getHours() === now.getHours() &&
              lastRunDate.getMinutes() === now.getMinutes() &&
              lastRunDate.toDateString() === now.toDateString()) {
            return task;
          }
        }

        // Execute task
        changed = true;
        const log: ExecutionEntry = {
          timestamp: Date.now(),
          result: 'success',
          message: `Executed ${TASK_TYPES.find(t => t.value === task.type)?.label}`,
        };

        try {
          switch (task.type) {
            case 'restart-all':
              await setDoc(doc(db, 'config', 'scheduled-command'), {
                type: 'restart-all', triggeredAt: Date.now(), source: 'scheduled-task',
              });
              break;
            case 'shutdown-all':
              await setDoc(doc(db, 'config', 'scheduled-command'), {
                type: 'shutdown-all', triggeredAt: Date.now(), source: 'scheduled-task',
              });
              break;
            case 'send-announcement': {
              // The kiosk listens to config/announcement and shows a banner.
              // Pull announcement fields off the task; fall back to description.
              const title = (task.announcementTitle || 'Announcement').trim();
              const message = (task.description || '').trim();
              const annType = task.announcementType || 'info';
              const duration = task.announcementDuration || 60;
              if (!message) { log.result = 'skipped'; log.message = 'No announcement message set on task'; break; }
              const nowTs = Date.now();
              await setDoc(doc(db, 'config', 'announcement'), {
                active: true, title, message, type: annType, duration,
                createdAt: nowTs, target: 'all', source: 'scheduled-task',
              });
              await addDoc(collection(db, 'announcements'), {
                title, message, type: annType, duration,
                createdAt: nowTs, sentBy: 'scheduled-task', target: 'all',
              });
              log.message = `Announcement sent: "${title}"`;
              break;
            }
            case 'run-campaign':
              await setDoc(doc(db, 'config', 'scheduled-command'), {
                type: 'run-campaign', description: task.description,
                triggeredAt: Date.now(), source: 'scheduled-task',
              });
              break;
          }
        } catch (err: any) {
          log.result = 'failed';
          log.message = `Execution error: ${err?.message || 'unknown'}`;
        }

        const existingLog = task.executionLog || [];
        return {
          ...task,
          lastRun: Date.now(),
          executionLog: [log, ...existingLog].slice(0, 10),
        };
      }));

      if (changed) {
        await setDoc(doc(db, 'config', 'scheduled-tasks'), { tasks: updatedTasks });
      }
    };

    checkIntervalRef.current = setInterval(checkTasks, 60000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [tasks]);

  const saveTasks = async (newTasks: ScheduledTask[]) => {
    await setDoc(doc(db, 'config', 'scheduled-tasks'), { tasks: newTasks });
  };

  const openCreateForm = () => {
    setEditingTask(null);
    setFormType('restart-all');
    setFormTime('00:00');
    setFormDays([false, true, true, true, true, true, false]);
    setFormEnabled(true);
    setFormDescription('');
    setFormAnnouncementTitle('');
    setFormAnnouncementType('info');
    setFormAnnouncementDuration(60);
    setShowForm(true);
  };

  const openEditForm = (task: ScheduledTask) => {
    setEditingTask(task);
    setFormType(task.type);
    setFormTime(task.time);
    setFormDays([...task.days]);
    setFormEnabled(task.enabled);
    setFormDescription(task.description);
    setFormAnnouncementTitle(task.announcementTitle || '');
    setFormAnnouncementType(task.announcementType || 'info');
    setFormAnnouncementDuration(task.announcementDuration || 60);
    setShowForm(true);
  };

  const handleSave = async () => {
    const commonFields = {
      type: formType,
      time: formTime,
      days: formDays,
      enabled: formEnabled,
      description: formDescription.trim(),
      ...(formType === 'send-announcement' ? {
        announcementTitle: formAnnouncementTitle.trim() || 'Announcement',
        announcementType: formAnnouncementType,
        announcementDuration: formAnnouncementDuration,
      } : {}),
    };
    if (editingTask) {
      const updated = tasks.map(t =>
        t.id === editingTask.id ? { ...t, ...commonFields } : t
      );
      await saveTasks(updated);
    } else {
      const id = 'task-' + Date.now().toString(36);
      const newTask: ScheduledTask = {
        id,
        ...commonFields,
        executionLog: [],
      };
      await saveTasks([...tasks, newTask]);
    }
    setShowForm(false);
  };

  const handleDelete = async (taskId: string) => {
    await saveTasks(tasks.filter(t => t.id !== taskId));
    setDeleteConfirm(null);
  };

  const toggleTask = async (taskId: string) => {
    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, enabled: !t.enabled } : t
    );
    await saveTasks(updated);
  };

  const getTaskMeta = (type: ScheduledTask['type']) => TASK_TYPES.find(t => t.value === type)!;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1 flex items-center gap-3">
            <Timer size={28} className="text-[#0071e3]" />
            Scheduled Tasks
          </h2>
          <p className="text-[#86868b] text-sm">Automate recurring actions across your gaming center</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all"
        >
          <Plus size={16} /> Create Task
        </button>
      </div>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
          <Clock size={48} className="mx-auto text-[#d2d2d7] mb-4" />
          <h3 className="text-xl font-semibold text-[#86868b] mb-2">No Scheduled Tasks</h3>
          <p className="text-[#86868b] text-sm">Create automated tasks to run at specific times</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task, i) => {
            const meta = getTaskMeta(task.type);
            const Icon = meta.icon;
            const nextRun = getNextRun(task);
            const isExpanded = expandedLog === task.id;

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-white rounded-2xl border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden transition-all ${
                  task.enabled ? 'border-[#e5e5ea]/60' : 'border-[#e5e5ea]/40 opacity-60'
                }`}
              >
                {/* Task row */}
                <div className="px-5 py-4 flex items-center gap-4">
                  {/* Type icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${meta.color}10`,
                    }}
                  >
                    <Icon size={20} style={{ color: meta.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-[#1d1d1f] text-sm">{meta.label}</span>
                      {task.description && (
                        <span className="text-[#86868b] text-xs truncate">-- {task.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      {/* Time */}
                      <span className="text-[#0071e3] flex items-center gap-1">
                        <Clock size={12} />
                        {task.time}
                      </span>
                      {/* Days */}
                      <div className="flex gap-0.5">
                        {DAY_LABELS.map((d, idx) => (
                          <span
                            key={d}
                            className={`w-6 h-5 flex items-center justify-center rounded text-[10px] ${
                              task.days[idx]
                                ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                                : 'bg-[#f5f5f7] text-[#d2d2d7] border border-[#e5e5ea]/40'
                            }`}
                          >
                            {d[0]}
                          </span>
                        ))}
                      </div>
                      {/* Next run */}
                      <span className="text-[#86868b] flex items-center gap-1">
                        <PlayCircle size={12} />
                        Next: {nextRun}
                      </span>
                      {/* Last run */}
                      {task.lastRun && (
                        <span className="text-[#86868b] flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Last: {formatTimestamp(task.lastRun)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Log toggle */}
                    {(task.executionLog?.length || 0) > 0 && (
                      <button
                        onClick={() => setExpandedLog(isExpanded ? null : task.id)}
                        className={`p-1.5 rounded-lg transition-all ${
                          isExpanded ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
                        }`}
                        title="Execution log"
                      >
                        <Calendar size={16} />
                      </button>
                    )}
                    {/* Toggle */}
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="p-1.5 rounded-lg hover:bg-[#f5f5f7] transition-all"
                      title={task.enabled ? 'Disable' : 'Enable'}
                    >
                      {task.enabled ? (
                        <ToggleRight size={22} className="text-[#34c759]" />
                      ) : (
                        <ToggleLeft size={22} className="text-[#d2d2d7]" />
                      )}
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => openEditForm(task)}
                      className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all"
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirm(task.id)}
                      className="p-1.5 rounded-lg hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-all"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Execution log (expandable) */}
                <AnimatePresence>
                  {isExpanded && task.executionLog && task.executionLog.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 py-3 border-t border-[#e5e5ea]/40 bg-[#f5f5f7]">
                        <p className="text-xs text-[#86868b] mb-2 font-medium">Execution Log (Last 10)</p>
                        <div className="space-y-1.5">
                          {task.executionLog.map((entry, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-xs">
                              {entry.result === 'success' ? (
                                <CheckCircle2 size={14} className="text-[#34c759] shrink-0" />
                              ) : entry.result === 'failed' ? (
                                <XCircle size={14} className="text-[#ff3b30] shrink-0" />
                              ) : (
                                <AlertCircle size={14} className="text-[#ff9500] shrink-0" />
                              )}
                              <span className="text-[#86868b] w-36 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                              <span className={`${
                                entry.result === 'success' ? 'text-[#34c759]' :
                                entry.result === 'failed' ? 'text-[#ff3b30]' : 'text-[#ff9500]'
                              }`}>
                                {entry.message || entry.result}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Task Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[520px] max-w-[90vw]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editingTask ? 'Edit Task' : 'Create Task'}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Task Type */}
                <div>
                  <label className="text-sm text-[#86868b] mb-2 block">Task Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TASK_TYPES.map(tt => {
                      const TIcon = tt.icon;
                      const selected = formType === tt.value;
                      return (
                        <button
                          key={tt.value}
                          onClick={() => setFormType(tt.value)}
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-all ${
                            selected
                              ? 'border-[#0071e3]/50 bg-[#0071e3]/5'
                              : 'border-[#d2d2d7] bg-white hover:border-[#86868b]'
                          }`}
                        >
                          <TIcon size={18} style={{ color: selected ? tt.color : '#86868b' }} />
                          <span className={`text-sm ${selected ? 'text-[#1d1d1f]' : 'text-[#86868b]'}`}>
                            {tt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block flex items-center gap-2">
                    <Clock size={14} className="text-[#0071e3]" /> Time
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="w-40 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                </div>

                {/* Days of week */}
                <div>
                  <label className="text-sm text-[#86868b] mb-2 block flex items-center gap-2">
                    <Calendar size={14} className="text-[#0071e3]" /> Days of Week
                  </label>
                  <div className="flex gap-2">
                    {DAY_LABELS.map((d, idx) => (
                      <button
                        key={d}
                        onClick={() => {
                          const updated = [...formDays];
                          updated[idx] = !updated[idx];
                          setFormDays(updated);
                        }}
                        className={`w-11 h-11 rounded-xl border text-sm transition-all ${
                          formDays[idx]
                            ? 'border-[#0071e3]/50 bg-[#0071e3]/10 text-[#0071e3]'
                            : 'border-[#d2d2d7] bg-white text-[#d2d2d7] hover:text-[#86868b]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setFormDays([true, true, true, true, true, true, true])}
                      className="text-xs text-[#86868b] hover:text-[#0071e3] transition-all px-2 py-1 rounded-lg border border-[#e5e5ea]/60 hover:border-[#0071e3]/30"
                    >
                      Every day
                    </button>
                    <button
                      onClick={() => setFormDays([false, true, true, true, true, true, false])}
                      className="text-xs text-[#86868b] hover:text-[#0071e3] transition-all px-2 py-1 rounded-lg border border-[#e5e5ea]/60 hover:border-[#0071e3]/30"
                    >
                      Weekdays
                    </button>
                    <button
                      onClick={() => setFormDays([true, false, false, false, false, false, true])}
                      className="text-xs text-[#86868b] hover:text-[#0071e3] transition-all px-2 py-1 rounded-lg border border-[#e5e5ea]/60 hover:border-[#0071e3]/30"
                    >
                      Weekends
                    </button>
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center justify-between py-2">
                  <label className="text-sm text-[#86868b]">Enabled</label>
                  <button
                    onClick={() => setFormEnabled(!formEnabled)}
                    className="transition-all"
                  >
                    {formEnabled ? (
                      <ToggleRight size={28} className="text-[#34c759]" />
                    ) : (
                      <ToggleLeft size={28} className="text-[#d2d2d7]" />
                    )}
                  </button>
                </div>

                {/* Description / Announcement message */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block">
                    {formType === 'send-announcement' ? 'Announcement Message' : 'Description (optional)'}
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder={formType === 'send-announcement'
                      ? 'e.g. Shop closing in 30 minutes'
                      : 'e.g. Nightly restart for updates'}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                  {formType === 'send-announcement' && (
                    <p className="text-[11px] text-[#ff9500] mt-1.5">
                      This text shows on every kiosk when the task fires.
                    </p>
                  )}
                </div>

                {/* Announcement-only extra fields */}
                {formType === 'send-announcement' && (
                  <>
                    <div>
                      <label className="text-sm text-[#86868b] mb-1.5 block">Announcement Title</label>
                      <input
                        type="text"
                        value={formAnnouncementTitle}
                        onChange={(e) => setFormAnnouncementTitle(e.target.value)}
                        placeholder="e.g. Notice, Event, Closing Time"
                        className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-[#86868b] mb-1.5 block">Banner Style</label>
                        <select
                          value={formAnnouncementType}
                          onChange={(e) => setFormAnnouncementType(e.target.value as any)}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-3 text-[#1d1d1f] focus:border-[#0071e3] outline-none"
                        >
                          <option value="info">Info (blue)</option>
                          <option value="warning">Warning (yellow)</option>
                          <option value="urgent">Urgent (red)</option>
                          <option value="promo">Promo (green)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-[#86868b] mb-1.5 block">Duration (seconds)</label>
                        <input
                          type="number"
                          value={formAnnouncementDuration}
                          onChange={(e) => setFormAnnouncementDuration(Number(e.target.value) || 60)}
                          min={5}
                          max={3600}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm hover:bg-[#f5f5f7] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  {editingTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[400px] max-w-[90vw]"
            >
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#fff5f5] flex items-center justify-center border border-[#ff3b30]/20">
                  <Trash2 size={24} className="text-[#ff3b30]" />
                </div>
                <h3 className="text-xl font-semibold text-[#1d1d1f] mb-1">Delete Task</h3>
                <p className="text-[#86868b] text-sm">
                  This scheduled task will be permanently removed.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm hover:bg-[#f5f5f7] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3 rounded-xl bg-[#ff3b30] text-white font-medium text-sm hover:bg-[#ff3b30]/90 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
