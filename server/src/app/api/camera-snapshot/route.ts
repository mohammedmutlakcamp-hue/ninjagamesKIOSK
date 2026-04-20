// Hikvision camera snapshot proxy.
//
// Browsers won't send `username:password@` basic auth for <img src>, and
// Hikvision cameras on a private LAN will also fail CORS. This route fetches
// the camera's JPEG snapshot server-side (with basic auth) and returns it as
// an <img>-friendly stream.
//
// Auth: the camera's username/password live ONLY in Firestore `cameras/{id}`.
// The admin panel queries this route with `?id={cameraId}` and the server
// loads credentials there — credentials never hit the client.
//
// Hikvision snapshot endpoint (ISAPI):
//   /ISAPI/Streaming/channels/{channel}/picture
// Example: http://192.168.1.64/ISAPI/Streaming/channels/101/picture

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

// Per-camera in-memory snapshot cache. Each snapshot is ~50-150 KB so this
// both rate-limits the camera and saves bandwidth for multiple viewers.
const snapshotCache = new Map<string, { ts: number; buf: Buffer; contentType: string }>();
const CACHE_TTL_MS = 1000;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new NextResponse('missing id', { status: 400 });

  const now = Date.now();
  const cached = snapshotCache.get(id);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return new NextResponse(new Uint8Array(cached.buf), {
      status: 200,
      headers: { 'Content-Type': cached.contentType, 'Cache-Control': 'no-store' },
    });
  }

  try {
    ensureApp();
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'cameras', id));
    if (!snap.exists()) return new NextResponse('camera not found', { status: 404 });
    const cam = snap.data() as any;

    const protocol = cam.https ? 'https' : 'http';
    const port = cam.port || (cam.https ? 443 : 80);
    const channel = cam.channel || 101;
    const url = `${protocol}://${cam.host}:${port}/ISAPI/Streaming/channels/${channel}/picture`;

    const credentials = Buffer
      .from(`${cam.user || 'admin'}:${cam.password || ''}`)
      .toString('base64');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return new NextResponse(`camera returned ${res.status}`, { status: 502 });
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    snapshotCache.set(id, { ts: now, buf, contentType });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[camera-snapshot] failed', err);
    return new NextResponse(`error: ${err.message}`, { status: 500 });
  }
}
