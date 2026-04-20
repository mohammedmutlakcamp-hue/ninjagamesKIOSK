// POST /api/whatsapp/send
// Body: { to: string, message: string, adminSecret?: string }
//
// Sends a WhatsApp message via the provider configured in
// config/whatsapp (Twilio or Meta Cloud API). Admin UI calls this
// for ad-hoc sends. Other server-side integrations import
// `sendWhatsapp` from @/lib/whatsapp directly.

import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsapp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { to, message } = await req.json();
    if (!to || !message) {
      return NextResponse.json({ ok: false, error: 'missing to or message' }, { status: 400 });
    }
    const result = await sendWhatsapp(to, message);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'server error' }, { status: 500 });
  }
}
