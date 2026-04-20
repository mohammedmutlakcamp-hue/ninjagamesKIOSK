// Server-side scheduled-task runner.
//
// Vercel Cron hits this endpoint every minute (see vercel.json). It reads
// `config/scheduled-tasks`, fires any task whose time/day matches the current
// minute, and writes the same execution log the client-side runner would.
//
// Without this, tasks only fire while an admin has the Scheduled Tasks page
// open in a browser. With it, tasks fire 24/7 from the Vercel infra regardless
// of who's watching.
//
// Auth: Vercel Cron attaches the CRON_SECRET env var as a Bearer token if set
// (optional). We enforce it when present so random curl hits can't trigger.

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const firebaseConfig = {
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  projectId: 'ninja-games-kiosk',
  storageBucket: 'ninja-games-kiosk.firebasestorage.app',
  messagingSenderId: '245461125914',
  appId: '1:245461125914:web:a0c0262040970f050cfaa3',
};

function ensureApp() {
  if (getApps().length === 0) initializeApp(firebaseConfig);
}

interface ScheduledTask {
  id: string;
  type: 'restart-all' | 'shutdown-all' | 'send-announcement' | 'run-campaign';
  time: string;
  days: boolean[];
  enabled: boolean;
  lastRun?: number;
  description: string;
  announcementTitle?: string;
  announcementType?: 'info' | 'warning' | 'urgent' | 'promo';
  announcementDuration?: number;
  executionLog?: Array<{ timestamp: number; result: 'success' | 'failed' | 'skipped'; message?: string }>;
}

export async function GET(req: NextRequest) {
  // Optional CRON_SECRET enforcement — Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }
  }

  try {
    ensureApp();
    const db = getFirestore();
    const cfgRef = doc(db, 'config', 'scheduled-tasks');
    const snap = await getDoc(cfgRef);
    if (!snap.exists()) return NextResponse.json({ ok: true, ran: 0, note: 'no task config' });

    const tasks: ScheduledTask[] = snap.data().tasks || [];
    if (!tasks.length) return NextResponse.json({ ok: true, ran: 0, note: 'no tasks' });

    const now = new Date();
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const fired: string[] = [];
    const updated = await Promise.all(tasks.map(async (task) => {
      if (!task.enabled) return task;
      if (!task.days[currentDay]) return task;

      const [sh, sm] = task.time.split(':').map(Number);
      const schedMinutes = sh * 60 + sm;

      // Drift-tolerant: fire if we're at/past scheduled time and within
      // 15 minutes after (catches the cron's 5-minute window + buffer).
      if (currentMinutes < schedMinutes) return task;
      if (currentMinutes - schedMinutes > 15) return task;

      // Already fired today at/after scheduled time? Skip.
      if (task.lastRun) {
        const lr = new Date(task.lastRun);
        const sameDay = lr.toDateString() === now.toDateString();
        const lrMinutes = lr.getHours() * 60 + lr.getMinutes();
        if (sameDay && lrMinutes >= schedMinutes) return task;
      }

      const log = { timestamp: Date.now(), result: 'success' as 'success' | 'failed' | 'skipped', message: `Server-cron executed ${task.type}` };

      try {
        switch (task.type) {
          case 'restart-all':
          case 'shutdown-all':
            await setDoc(doc(db, 'config', 'scheduled-command'), {
              type: task.type, triggeredAt: Date.now(), source: 'vercel-cron',
            });
            break;
          case 'send-announcement': {
            const title = (task.announcementTitle || 'Announcement').trim();
            const message = (task.description || '').trim();
            const annType = task.announcementType || 'info';
            const duration = task.announcementDuration || 60;
            if (!message) { log.result = 'skipped'; log.message = 'Empty announcement message'; break; }
            const nowTs = Date.now();
            await setDoc(doc(db, 'config', 'announcement'), {
              active: true, title, message, type: annType, duration,
              createdAt: nowTs, target: 'all', source: 'vercel-cron',
            });
            await addDoc(collection(db, 'announcements'), {
              title, message, type: annType, duration,
              createdAt: nowTs, sentBy: 'vercel-cron', target: 'all',
            });
            log.message = `Announcement "${title}" broadcast via cron`;
            break;
          }
          case 'run-campaign':
            await setDoc(doc(db, 'config', 'scheduled-command'), {
              type: 'run-campaign', description: task.description,
              triggeredAt: Date.now(), source: 'vercel-cron',
            });
            break;
        }
      } catch (err: any) {
        log.result = 'failed';
        log.message = `cron error: ${err?.message || 'unknown'}`;
      }

      fired.push(task.id);
      return {
        ...task,
        lastRun: Date.now(),
        executionLog: [log, ...(task.executionLog || [])].slice(0, 10),
      };
    }));

    if (fired.length) {
      await setDoc(cfgRef, { tasks: updated });
    }

    return NextResponse.json({ ok: true, ran: fired.length, firedIds: fired });
  } catch (err: any) {
    console.error('[cron/scheduled-tasks] failed', err);
    return NextResponse.json({ ok: false, error: err?.message || 'unknown' }, { status: 500 });
  }
}
