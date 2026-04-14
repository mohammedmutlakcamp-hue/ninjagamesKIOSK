'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Instagram, CheckCircle2, Search, Loader2, Coins, User } from 'lucide-react';

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  admin: any;
}

interface Row {
  docId: string;
  playerId: string;
  username: string;
  progress: number;
  claimed: boolean;
  verifiedBy?: string;
  verifiedAt?: number;
}

export function SocialTasksVerification({ admin }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adminName, setAdminName] = useState(admin?.email?.split('@')[0] || 'admin');

  const todayKey = getTodayKey();

  useEffect(() => {
    const q = query(collection(db, 'daily-tasks'), where('date', '==', todayKey));
    const unsub = onSnapshot(q, async (snap) => {
      const out: Row[] = [];
      for (const d of snap.docs) {
        const data = d.data() as any;
        const social = data.tasks?.check_socials;
        if (!social) continue;
        const playerSnap = await getDoc(doc(db, 'players', data.playerId));
        const username = playerSnap.exists() ? (playerSnap.data() as any).username : data.playerId;
        out.push({
          docId: d.id,
          playerId: data.playerId,
          username,
          progress: social.progress || 0,
          claimed: !!social.claimed,
          verifiedBy: social.verifiedBy,
          verifiedAt: social.verifiedAt,
        });
      }
      setRows(out);
    });
    return () => unsub();
  }, [todayKey]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows
      .filter((r) => showDone || r.progress < 1)
      .filter((r) => !s || r.username.toLowerCase().includes(s))
      .sort((a, b) => (a.progress - b.progress) || a.username.localeCompare(b.username));
  }, [rows, search, showDone]);

  const markDone = async (row: Row) => {
    if (!adminName.trim()) {
      alert('Please enter your admin name first.');
      return;
    }
    setVerifying(row.docId);
    try {
      const taskRef = doc(db, 'daily-tasks', row.docId);
      const snap = await getDoc(taskRef);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const tasks = { ...(data.tasks || {}) };
      tasks.check_socials = {
        ...(tasks.check_socials || { progress: 0, claimed: false }),
        progress: 1,
        verifiedBy: adminName.trim(),
        verifiedAt: Date.now(),
      };
      await updateDoc(taskRef, { tasks });
    } catch (err) {
      console.error('Failed to verify social task:', err);
    }
    setVerifying(null);
  };

  const pendingCount = rows.filter((r) => r.progress < 1).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
            <Instagram size={28} className="text-pink-500" />
            Social Task Verification
          </h1>
          <p className="text-[#86868b] text-sm mt-1">
            Players earn 25 coins after you manually confirm they watched the story, followed, and liked 3 posts. ({pendingCount} pending today)
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <User size={16} className="text-[#86868b]" />
          <label className="text-xs text-[#86868b] font-medium">Admin name</label>
          <input
            type="text"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-[#e5e5e7] text-sm focus:border-[#0071e3] outline-none"
            placeholder="Your name"
          />
        </div>
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-[#f5f5f7] rounded-lg px-3 py-2">
          <Search size={14} className="text-[#86868b]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1d1d1f] cursor-pointer">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show already verified
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-[#86868b]">
            <Instagram size={36} className="mx-auto mb-3 text-[#d2d2d7]" />
            <p>No pending social verifications.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f7]">
            {filtered.map((row) => {
              const isDone = row.progress >= 1;
              return (
                <div key={row.docId} className="flex items-center gap-4 px-5 py-4 hover:bg-[#fafafa]">
                  <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center">
                    <Instagram size={18} className="text-pink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1d1d1f]">{row.username}</p>
                    <p className="text-xs text-[#86868b]">
                      {isDone
                        ? `Verified by ${row.verifiedBy || 'admin'}${row.verifiedAt ? ` · ${new Date(row.verifiedAt).toLocaleTimeString()}` : ''}`
                        : 'Awaiting admin verification'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#ff9500]">
                    <Coins size={14} />
                    <span className="text-sm font-semibold">+25</span>
                  </div>
                  {isDone ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#34c759]/10 text-[#34c759] text-xs font-semibold">
                      <CheckCircle2 size={14} />
                      {row.claimed ? 'CLAIMED' : 'DONE'}
                    </span>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => markDone(row)}
                      disabled={verifying === row.docId}
                      className="px-4 py-2 rounded-lg bg-[#34c759] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {verifying === row.docId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      DONE
                    </motion.button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
