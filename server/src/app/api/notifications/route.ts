import { NextRequest, NextResponse } from 'next/server';
import { sendNotification } from '@/lib/onesignal';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '236a3577-a482-4cb5-a810-8daccc0272ff';
const REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || '';
const AUTH_PREFIX = REST_KEY.startsWith('os_v2_') ? 'Key' : 'Basic';

export async function POST(req: NextRequest) {
  try {
    const { title, message, targetUids } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message required' }, { status: 400 });
    }

    const result = await sendNotification({ title, message, targetUids });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Debug: check config + subscriber count + list users
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');

  // List subscribers (v1 API)
  if (action === 'subscribers') {
    try {
      const res = await fetch(`https://onesignal.com/api/v1/players?app_id=${APP_ID}&limit=50`, {
        headers: { 'Authorization': `${AUTH_PREFIX} ${REST_KEY}` },
      });
      const data = await res.json();
      // Simplify output
      const players = (data.players || []).map((p: any) => ({
        id: p.id,
        device_type: p.device_type, // 5=web, 7=safari, 13=ios_web
        created_at: p.created_at,
        last_active: p.last_active,
        external_user_id: p.external_user_id,
        tags: p.tags,
        notification_types: p.notification_types, // 1=subscribed, -2=unsubscribed
        invalid_identifier: p.invalid_identifier,
      }));
      return NextResponse.json({ total: data.total_count, players });
    } catch (err: any) {
      return NextResponse.json({ error: err.message });
    }
  }

  // Check app info
  if (action === 'appinfo') {
    try {
      const res = await fetch(`https://api.onesignal.com/apps/${APP_ID}`, {
        headers: { 'Authorization': `${AUTH_PREFIX} ${REST_KEY}` },
      });
      const data = await res.json();
      return NextResponse.json({
        name: data.name,
        players: data.players,
        messageable_players: data.messageable_players,
        gcm_key: !!data.gcm_key,
        chrome_web_origin: data.chrome_web_origin,
        safari_site_origin: data.safari_site_origin,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message });
    }
  }

  // Default: config check
  return NextResponse.json({
    appIdSet: !!APP_ID,
    appIdPrefix: APP_ID.slice(0, 8) + '...',
    restKeySet: !!REST_KEY,
    restKeyPrefix: REST_KEY.slice(0, 10) + '...',
    authFormat: AUTH_PREFIX,
    serviceWorker: 'https://www.ninjagamesjo.com/OneSignalSDKWorker.js',
  });
}
