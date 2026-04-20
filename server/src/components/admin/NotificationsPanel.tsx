'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Bell, Send, Users, User, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { HelpTip } from './HelpTip';

export function NotificationsPanel() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [targetUsername, setTargetUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [history, setHistory] = useState<{ title: string; message: string; target: string; time: number }[]>([]);

  // Load players for autocomplete
  useEffect(() => {
    getDocs(collection(db, 'players')).then(snap => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
    // Load notification history from localStorage
    const saved = localStorage.getItem('admin-notif-history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const handleSend = async () => {
    if (!title || !message) { setResult({ success: false, message: 'Title and message required' }); return; }

    setSending(true);
    setResult(null);

    try {
      let targetUids: string[] | undefined;

      if (targetType === 'specific') {
        const player = players.find(p => p.username?.toLowerCase() === targetUsername.toLowerCase());
        if (!player) { setResult({ success: false, message: 'Player not found' }); setSending(false); return; }
        targetUids = [player.uid];
      }

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, targetUids }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ success: true, message: `Notification sent to ${targetType === 'all' ? 'all players' : targetUsername}` });
        const newHistory = [{ title, message, target: targetType === 'all' ? 'All Players' : targetUsername, time: Date.now() }, ...history.slice(0, 19)];
        setHistory(newHistory);
        localStorage.setItem('admin-notif-history', JSON.stringify(newHistory));
        setTitle('');
        setMessage('');
        setTargetUsername('');
      } else {
        setResult({ success: false, message: data.error || 'Failed to send' });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message });
    }
    setSending(false);
  };

  const filteredPlayers = targetUsername
    ? players.filter(p => p.username?.toLowerCase().includes(targetUsername.toLowerCase())).slice(0, 5)
    : [];

  const inputClass = "w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none text-sm";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-6 flex items-center gap-3">
        <Bell size={24} className="text-[#0071e3]" /> Push Notifications
        <HelpTip title={{ en: 'Push Notifications', ar: 'الإشعارات' }}
          ar={<p>أرسل إشعار Push مباشر لكل اللاعبين أو لاعب محدد (بشرط فتحه للإشعارات من الـPWA). مفيد لإعلانات فورية.</p>}>
          <p>Send a push notification to all players or a specific one (they must have enabled notifications in the PWA). Use for instant alerts.</p>
        </HelpTip>
      </h1>

      <div className="grid grid-cols-2 gap-6">
        {/* Send Form */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4">Send Notification</h2>

          {/* Target */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTargetType('all')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${targetType === 'all' ? 'bg-[#0071e3]/10 border border-[#0071e3]/30 text-[#0071e3]' : 'border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}>
              <Users size={16} /> All Players
            </button>
            <button onClick={() => setTargetType('specific')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${targetType === 'specific' ? 'bg-[#0071e3]/10 border border-[#0071e3]/30 text-[#0071e3]' : 'border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'}`}>
              <User size={16} /> Specific Player
            </button>
          </div>

          {/* Player search */}
          {targetType === 'specific' && (
            <div className="mb-4 relative">
              <input type="text" value={targetUsername} onChange={(e) => setTargetUsername(e.target.value)}
                className={inputClass}
                placeholder="Search player username..." />
              {filteredPlayers.length > 0 && targetUsername && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-[#e5e5ea] overflow-hidden z-10 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                  {filteredPlayers.map(p => (
                    <button key={p.uid} onClick={() => setTargetUsername(p.username)}
                      className="w-full px-4 py-2 text-left text-sm text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors">
                      {p.username}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} mb-3`}
            placeholder="Notification title..." />

          {/* Message */}
          <textarea value={message} onChange={(e) => setMessage(e.target.value)}
            className={`${inputClass} mb-4 resize-none`}
            placeholder="Notification message..." rows={3} />

          {/* Result */}
          {result && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 mb-4 px-4 py-2 rounded-xl text-sm ${result.success ? 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20' : 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20'}`}>
              {result.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {result.message}
            </motion.div>
          )}

          {/* Send */}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleSend} disabled={sending}
            className="w-full py-3 bg-[#0071e3] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#0077ED] transition-colors">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Sending...' : 'Send Notification'}
          </motion.button>

          {/* Quick Templates */}
          <div className="mt-4 pt-4 border-t border-[#e5e5ea]">
            <p className="text-xs text-[#86868b] mb-2">Quick Templates:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { t: 'Tournament Starting!', m: 'A new tournament is starting soon. Join now!' },
                { t: 'Happy Hour!', m: 'Double XP for the next hour! Come play now!' },
                { t: 'New Games Added!', m: 'Check out the new games available at Ninja Games!' },
                { t: 'Weekend Special', m: 'Special weekend offer - Top up and get bonus coins!' },
              ].map((tmpl, i) => (
                <button key={i} onClick={() => { setTitle(tmpl.t); setMessage(tmpl.m); }}
                  className="px-3 py-1.5 rounded-xl border border-[#d2d2d7] text-[#86868b] text-[11px] font-medium hover:text-[#0071e3] hover:border-[#0071e3]/30 transition-colors">
                  {tmpl.t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h2 className="text-lg font-semibold text-[#1d1d1f] mb-4">Recent Notifications</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-[#86868b] text-sm text-center py-8">No notifications sent yet</p>
            ) : history.map((h, i) => (
              <div key={i} className="p-3 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]/60">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[#0071e3]">{h.title}</span>
                  <span className="text-[10px] text-[#86868b]">
                    {new Date(h.time).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-[#86868b]">{h.message}</p>
                <p className="text-[10px] text-[#86868b] mt-1">To: {h.target}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
