// Hikvision camera snapshot proxy.
//
// Browsers won't send `username:password@` basic auth for <img src>, and
// Hikvision cameras on a private LAN will also fail CORS. This route fetches
// the camera's JPEG snapshot server-side (with Basic or Digest auth — newer
// Hik firmwares default to Digest) and streams it back as <img>-friendly
// bytes.
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
import { hikFetch } from '@/lib/hik-fetch';

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

    const channel = cam.channel || 101;
    const result = await hikFetch({
      host: cam.host,
      port: cam.port || (cam.https ? 443 : 80),
      https: !!cam.https,
      user: cam.user || 'admin',
      password: cam.password || '',
      pathWithQuery: `/ISAPI/Streaming/channels/${channel}/picture`,
    });

    if (!result.ok || !result.body) {
      return new NextResponse(`camera: ${result.reason}`, { status: result.status || 502 });
    }

    const buf = Buffer.from(result.body);
    const contentType = result.contentType || 'image/jpeg';
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
