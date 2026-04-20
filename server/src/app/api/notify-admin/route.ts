import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsapp } from '@/lib/whatsapp';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '236a3577-a482-4cb5-a810-8daccc0272ff';
const REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || '';
const AUTH_PREFIX = REST_KEY.startsWith('os_v2_') ? 'Key' : 'Basic';

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

// Map notification types to a leading emoji so admin's WhatsApp feed is scannable.
const EMOJI: Record<string, string> = {
  order: '🍔',
  shisha_order: '💨',
  tobacco_order: '🚬',
  top_up: '💰',
  topup: '💰',
  guest: '👋',
  guest_register: '🆕',
  pin_reset: '🔑',
  social: '⭐',
  vip: '👑',
  alert: '⚠️',
  warning: '⚠️',
  default: '🔔',
};

async function fanOutToWhatsApp(type: string, title: string, message: string) {
  try {
    ensureApp();
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'config', 'whatsapp'));
    if (!snap.exists()) return;
    const cfg = snap.data() as any;
    if (!cfg.enabled) return;

    // Admin phone may be a string OR comma-separated list (for multi-owner shops).
    const raw: string = cfg.adminPhone || cfg.adminPhones || '';
    if (!raw.trim()) return;
    const phones = raw.split(/[,\s;]+/).map((p) => p.trim()).filter(Boolean);

    const emoji = EMOJI[type] || EMOJI.default;
    const body = `${emoji} *${title}*\n${message}`;

    // Fire all sends in parallel, swallow individual failures.
    await Promise.all(phones.map((p) => sendWhatsapp(p, body).catch(() => null)));
  } catch (err) {
    console.error('[notify-admin] whatsapp fanout failed', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { type, title, message, data } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message required' }, { status: 400 });
    }

    // Fire-and-forget WhatsApp mirror so the admin sees every event in
    // their phone, not just OneSignal web pushes. Won't block the response.
    fanOutToWhatsApp(type, title, message);

    const body: any = {
      app_id: APP_ID,
      headings: { en: title },
      contents: { en: message },
      url: 'https://www.ninjagamesjo.com/ghanimadmin',
      data: { type, ...(data || {}) },
      chrome_web_icon: 'https://www.ninjagamesjo.com/img/icon-192.png',
      // Target users with role=admin tag
      filters: [
        { field: 'tag', key: 'role', relation: '=', value: 'admin' },
      ],
    };

    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${AUTH_PREFIX} ${REST_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('Admin push notification error:', JSON.stringify(result));
    }
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('notify-admin error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
