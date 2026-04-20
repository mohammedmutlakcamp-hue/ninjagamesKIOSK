'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { HelpTip } from './HelpTip';
import {
  Megaphone,
  AlertTriangle,
  Wrench,
  Clock,
  Send,
  X,
  Info,
  Flame,
  Tag,
  Monitor,
  Power,
  History,
  ChevronDown,
  Loader2,
  CheckCircle,
  Volume2,
} from 'lucide-react';

// ─── Type colors ────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  info:    { color: '#0071e3', bg: 'rgba(0,113,227,0.08)',   label: 'INFO',    icon: Info },
  warning: { color: '#ff9500', bg: 'rgba(255,149,0,0.08)',   label: 'WARNING', icon: AlertTriangle },
  urgent:  { color: '#ff3b30', bg: 'rgba(255,59,48,0.08)',   label: 'URGENT',  icon: Flame },
  promo:   { color: '#34c759', bg: 'rgba(52,199,89,0.08)',   label: 'PROMO',   icon: Tag },
};

const DURATION_OPTIONS = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute',   value: 60 },
  { label: '5 minutes',  value: 300 },
  { label: '10 minutes', value: 600 },
  { label: 'Permanent',  value: 0 },
];

// ─── Helpers ────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function elapsedStr(startTs: number): string {
  const diff = Date.now() - startTs;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

// ─── Component ──────────────────────────────────────────────────────
export function AnnouncementsPanel() {
  // Active announcement
  const [activeAnnouncement, setActiveAnnouncement] = useState<any>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<string>('info');
  const [duration, setDuration] = useState<number>(60);
  const [target, setTarget] = useState<'all' | string>('all');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Maintenance
  const [maintenance, setMaintenance] = useState<any>(null);
  const [maintMsg, setMaintMsg] = useState("We'll be back soon!");
  const [togglingMaint, setTogglingMaint] = useState(false);
  const [maintElapsed, setMaintElapsed] = useState('');

  // PCs
  const [pcs, setPcs] = useState<any[]>([]);

  // History
  const [history, setHistory] = useState<any[]>([]);

  // ─── Real-time listeners ──────────────────────────────────────────
  useEffect(() => {
    // Listen to active announcement
    const unsubAnnouncement = onSnapshot(doc(db, 'config', 'announcement'), (snap) => {
      if (snap.exists()) {
        setActiveAnnouncement(snap.data());
      } else {
        setActiveAnnouncement(null);
      }
    });

    // Listen to maintenance
    const unsubMaint = onSnapshot(doc(db, 'config', 'maintenance'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenance(data);
        if (data.message) setMaintMsg(data.message);
      } else {
        setMaintenance(null);
      }
    });

    // Load PCs
    getDocs(collection(db, 'pcs')).then((snap) => {
      setPcs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Load history (last 20)
    const histQ = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(20));
    const unsubHistory = onSnapshot(histQ, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAnnouncement();
      unsubMaint();
      unsubHistory();
    };
  }, []);

  // Maintenance elapsed timer
  useEffect(() => {
    if (!maintenance?.active || !maintenance?.startedAt) {
      setMaintElapsed('');
      return;
    }
    const tick = () => setMaintElapsed(elapsedStr(maintenance.startedAt));
    tick();
    const iv = setInterval(tick, 10000);
    return () => clearInterval(iv);
  }, [maintenance?.active, maintenance?.startedAt]);

  // ─── Actions ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!title.trim() || !message.trim()) {
      setSendResult({ ok: false, msg: 'Title and message are required.' });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const now = Date.now();
      const announcementData = {
        active: true,
        title: title.trim(),
        message: message.trim(),
        type,
        duration,
        createdAt: now,
        target,
      };

      // Set as current live announcement
      await setDoc(doc(db, 'config', 'announcement'), announcementData);

      // Add to history
      await addDoc(collection(db, 'announcements'), {
        title: title.trim(),
        message: message.trim(),
        type,
        duration,
        createdAt: now,
        sentBy: 'admin',
        target,
      });

      setSendResult({ ok: true, msg: 'Announcement sent!' });
      setTitle('');
      setMessage('');
      setType('info');
      setDuration(60);
      setTarget('all');
      setTimeout(() => setSendResult(null), 3000);
    } catch (err: any) {
      setSendResult({ ok: false, msg: err.message || 'Failed to send' });
    }
    setSending(false);
  }, [title, message, type, duration, target]);

  const handleDismiss = useCallback(async () => {
    await setDoc(doc(db, 'config', 'announcement'), { active: false });
  }, []);

  const handleToggleMaintenance = useCallback(async () => {
    setTogglingMaint(true);
    try {
      const isCurrentlyActive = maintenance?.active;
      if (isCurrentlyActive) {
        await setDoc(doc(db, 'config', 'maintenance'), { active: false, message: '', startedAt: 0 });
      } else {
        await setDoc(doc(db, 'config', 'maintenance'), {
          active: true,
          message: maintMsg.trim() || "We'll be back soon!",
          startedAt: Date.now(),
        });
      }
    } catch (err) {
      console.error('Failed to toggle maintenance:', err);
    }
    setTogglingMaint(false);
  }, [maintenance, maintMsg]);

  // ─── Current type style ───────────────────────────────────────────
  const currentType = TYPE_COLORS[type] || TYPE_COLORS.info;

  return (
    <div>
      {/* Header */}
      <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-6 flex items-center gap-3">
        <Megaphone size={24} className="text-[#0071e3]" /> Announcements & Maintenance
        <HelpTip title={{ en: 'Announcements & Maintenance', ar: 'الإعلانات والصيانة' }}
          ar={(
            <>
              <p className="mb-2"><strong>الإعلانات:</strong> رسالة تظهر كبانر في أعلى كل الأجهزة — مفيدة لـ"البطولة 8 مساءً" أو "خصم 20% الليلة".</p>
              <p className="mb-1.5">اختر العنوان، الرسالة، الستايل (معلومات/تحذير/عاجل/عرض)، ومدة الظهور. احفظ → يظهر فوراً.</p>
              <p className="mb-2"><strong>وضع الصيانة:</strong> عند التفعيل، كل الأجهزة تظهر شاشة "الصيانة" مع رسالتك. مفيد وقت التحديثات أو الإغلاق الطارئ.</p>
              <p className="text-[#86868b]">للإعلانات المجدولة (بأوقات معينة)، استخدم تبويب Scheduled Tasks.</p>
            </>
          )}>
          <p className="mb-2"><strong>Announcements:</strong> banner message shown at the top of every kiosk — "Tournament 8pm" or "20% off tonight".</p>
          <p className="mb-1.5">Pick title, message, style (info/warning/urgent/promo), duration. Save → appears instantly.</p>
          <p className="mb-2"><strong>Maintenance mode:</strong> when ON, every kiosk shows your maintenance screen. Use during updates or emergency close.</p>
          <p className="text-[#86868b]">For scheduled announcements (fire at specific times), use Scheduled Tasks.</p>
        </HelpTip>
      </h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ─── LEFT COLUMN ─────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Active Announcement */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <Volume2 size={18} className="text-[#0071e3]" /> Active Announcement
            </h2>

            {activeAnnouncement?.active ? (
              <div className="space-y-3">
                {(() => {
                  const t = TYPE_COLORS[activeAnnouncement.type] || TYPE_COLORS.info;
                  const TypeIcon = t.icon;
                  return (
                    <div
                      className="rounded-xl p-4 border"
                      style={{ background: t.bg, borderColor: t.color + '30' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <TypeIcon size={16} style={{ color: t.color }} />
                            <span
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ background: t.color + '15', color: t.color }}
                            >
                              {t.label}
                            </span>
                            <span className="text-xs text-[#86868b] flex items-center gap-1">
                              <Clock size={12} /> {timeAgo(activeAnnouncement.createdAt)}
                            </span>
                          </div>
                          <h3 className="text-[#1d1d1f] font-semibold text-base mb-1">{activeAnnouncement.title}</h3>
                          <p className="text-[#86868b] text-sm">{activeAnnouncement.message}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#86868b]">
                            <span>Target: {activeAnnouncement.target === 'all' ? 'All PCs' : activeAnnouncement.target}</span>
                            <span>Duration: {activeAnnouncement.duration === 0 ? 'Permanent' : `${activeAnnouncement.duration}s`}</span>
                          </div>
                        </div>
                        <button
                          onClick={handleDismiss}
                          className="flex-shrink-0 p-2 rounded-xl bg-[#ff3b30]/10 hover:bg-[#ff3b30]/20 text-[#ff3b30] transition-all"
                          title="Dismiss announcement"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-6 text-[#86868b] text-sm">
                No active announcement
              </div>
            )}
          </motion.div>

          {/* Create Announcement */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <Send size={18} className="text-[#0071e3]" /> Create Announcement
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-[#86868b] text-xs mb-1 block uppercase tracking-wider font-medium">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  placeholder="Announcement title..."
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-[#86868b] text-xs mb-1 block uppercase tracking-wider font-medium">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all resize-none"
                  placeholder="Announcement message..."
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="text-[#86868b] text-xs mb-2 block uppercase tracking-wider font-medium">Type</label>
                <div className="flex gap-2">
                  {Object.entries(TYPE_COLORS).map(([key, val]) => {
                    const Icon = val.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setType(key)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all border"
                        style={{
                          background: type === key ? val.bg : '#f5f5f7',
                          borderColor: type === key ? val.color + '40' : '#d2d2d7',
                          color: type === key ? val.color : '#86868b',
                        }}
                      >
                        <Icon size={14} />
                        {val.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-[#86868b] text-xs mb-2 block uppercase tracking-wider font-medium">Duration</label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDuration(opt.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                        duration === opt.value
                          ? 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/30'
                          : 'bg-[#f5f5f7] text-[#86868b] border-[#d2d2d7] hover:bg-[#e5e5ea]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target */}
              <div>
                <label className="text-[#86868b] text-xs mb-2 block uppercase tracking-wider font-medium">Target</label>
                <div className="relative">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="all">All PCs</option>
                    {pcs.map((pc) => (
                      <option key={pc.id} value={pc.id}>
                        {pc.name || pc.id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
                </div>
              </div>

              {/* Send Result */}
              <AnimatePresence>
                {sendResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                      sendResult.ok
                        ? 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20'
                        : 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20'
                    }`}
                  >
                    {sendResult.ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                    {sendResult.msg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSend}
                disabled={sending || !title.trim() || !message.trim()}
                className="w-full py-3 rounded-xl font-medium text-base text-white tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#0071e3] hover:bg-[#0077ED]"
              >
                {sending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    Send Now
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* ─── RIGHT COLUMN ────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Maintenance Mode */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border transition-all ${
              maintenance?.active
                ? 'border-[#ff3b30]/40'
                : 'border-[#e5e5ea]/60'
            }`}
          >
            <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <Wrench size={18} className="text-[#0071e3]" /> Maintenance Mode
            </h2>

            <div className="space-y-4">
              {/* Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#1d1d1f] text-sm font-medium">
                    {maintenance?.active ? 'Maintenance is ACTIVE' : 'Maintenance is OFF'}
                  </p>
                  {maintenance?.active && maintElapsed && (
                    <p className="text-[#ff3b30] text-xs mt-1 flex items-center gap-1">
                      <Clock size={12} /> Active for {maintElapsed}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleToggleMaintenance}
                  disabled={togglingMaint}
                  className="relative w-14 h-7 rounded-full transition-all"
                  style={{
                    background: maintenance?.active
                      ? '#ff3b30'
                      : '#d2d2d7',
                  }}
                >
                  {togglingMaint ? (
                    <Loader2 size={14} className="animate-spin text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  ) : (
                    <motion.div
                      layout
                      className="w-5 h-5 rounded-full bg-white absolute top-1"
                      style={{ left: maintenance?.active ? '32px' : '4px' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              </div>

              {/* Maintenance message */}
              <div>
                <label className="text-[#86868b] text-xs mb-1 block uppercase tracking-wider font-medium">
                  Maintenance Message
                </label>
                <input
                  type="text"
                  value={maintMsg}
                  onChange={(e) => setMaintMsg(e.target.value)}
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  placeholder="We'll be back soon!"
                  disabled={maintenance?.active}
                />
              </div>

              {/* Status indicator */}
              {maintenance?.active && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/20"
                >
                  <div className="w-3 h-3 rounded-full bg-[#ff3b30] animate-pulse" />
                  <div>
                    <p className="text-[#ff3b30] font-semibold text-sm">All kiosks showing maintenance screen</p>
                    <p className="text-[#86868b] text-xs mt-0.5">
                      Message: &quot;{maintenance.message}&quot;
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Announcement History */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <History size={18} className="text-[#0071e3]" /> Announcement History
            </h2>

            {history.length === 0 ? (
              <div className="text-center py-8 text-[#86868b] text-sm">
                No announcements sent yet
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {history.map((item, i) => {
                  const t = TYPE_COLORS[item.type] || TYPE_COLORS.info;
                  const TypeIcon = t.icon;
                  return (
                    <motion.div
                      key={item.id || i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="p-3 rounded-xl border transition-all hover:bg-[#f5f5f7]"
                      style={{ borderColor: t.color + '15', background: t.bg.replace('0.08', '0.03') }}
                    >
                      <div className="flex items-start gap-2">
                        <TypeIcon size={14} style={{ color: t.color }} className="mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[#1d1d1f] font-medium text-sm truncate">{item.title}</span>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: t.color + '12', color: t.color }}
                            >
                              {t.label}
                            </span>
                          </div>
                          <p className="text-[#86868b] text-xs truncate">{item.message}</p>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#86868b]">
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> {timeAgo(item.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Monitor size={10} /> {item.target === 'all' ? 'All PCs' : item.target}
                            </span>
                            {item.sentBy && (
                              <span>by {item.sentBy}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
