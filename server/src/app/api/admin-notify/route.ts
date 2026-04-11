import { NextRequest, NextResponse } from 'next/server';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '236a3577-a482-4cb5-a810-8daccc0272ff';
const REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || '';
const AUTH_PREFIX = REST_KEY.startsWith('os_v2_') ? 'Key' : 'Basic';

// Send push notification to all users tagged as admin
async function notifyAdmin(title: string, message: string, data?: Record<string, string>) {
  if (!REST_KEY) {
    console.warn('OneSignal REST key not set, skipping admin notification');
    return { warning: 'No REST key' };
  }

  const body: any = {
    app_id: APP_ID,
    headings: { en: title },
    contents: { en: message },
    url: 'https://www.ninjagamesjo.com/adminchat',
    data: { ...data, type: 'admin_notification' },
    chrome_web_icon: 'https://www.ninjagamesjo.com/img/icon-192.png',
    // Target users tagged as admin role
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

  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { type, playerName, details } = await req.json();

    const notifications: Record<string, { title: string; message: string }> = {
      'new-order': {
        title: 'New Food Order!',
        message: `${playerName || 'A player'} placed a food order${details ? ': ' + details : ''}`,
      },
      'new-shisha': {
        title: 'New Shisha Order!',
        message: `${playerName || 'A player'} ordered shisha${details ? ': ' + details : ''}`,
      },
      'new-topup': {
        title: 'Top-Up Request!',
        message: `${playerName || 'A player'} requested a top-up${details ? ' - ' + details : ''}`,
      },
      'new-vip': {
        title: 'VIP Request!',
        message: `${playerName || 'A player'} requested VIP access`,
      },
      'new-guest': {
        title: 'Guest Play Request!',
        message: `Guest wants to play${details ? ' on ' + details : ''}`,
      },
      'new-registration': {
        title: 'New Registration!',
        message: `${playerName || 'A player'} wants to register`,
      },
      'new-support-chat': {
        title: 'Support Message!',
        message: `${playerName || 'A player'} sent a support message${details ? ': ' + details : ''}`,
      },
    };

    const notif = notifications[type];
    if (!notif) {
      return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 });
    }

    const result = await notifyAdmin(notif.title, notif.message, { notifType: type });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
