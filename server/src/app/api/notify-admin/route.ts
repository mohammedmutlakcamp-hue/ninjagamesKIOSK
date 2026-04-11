import { NextRequest, NextResponse } from 'next/server';

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '236a3577-a482-4cb5-a810-8daccc0272ff';
const REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || '';
const AUTH_PREFIX = REST_KEY.startsWith('os_v2_') ? 'Key' : 'Basic';

export async function POST(req: NextRequest) {
  try {
    const { type, title, message, data } = await req.json();

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message required' }, { status: 400 });
    }

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
