// ═══════════════════════════════════════════════════════════════════
//  WhatsApp send helper — provider-agnostic
// ───────────────────────────────────────────────────────────────────
//  Supports two providers:
//    - 'twilio'   : Twilio WhatsApp (sandbox or approved sender)
//    - 'meta'     : Meta WhatsApp Business Cloud API (graph.facebook.com)
//
//  Admin enters credentials in /ghanimadmin → Settings → WhatsApp.
//  Credentials live in Firestore config/whatsapp so the admin can rotate
//  them without redeploying.
//
//  This module only runs server-side (API routes). Never import from
//  client components — secrets would leak into the bundle.
// ═══════════════════════════════════════════════════════════════════

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

export interface WhatsappConfig {
  provider: 'twilio' | 'meta' | '';
  enabled: boolean;
  // Twilio
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string; // 'whatsapp:+14155238886'
  // Meta (WhatsApp Cloud API)
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
  metaBusinessAccountId?: string;
  // Defaults
  defaultCountryCode?: string; // '962' for Jordan — prepended when a number has no country prefix
  senderName?: string;         // shop name included in message footer
}

async function loadConfig(): Promise<WhatsappConfig | null> {
  ensureApp();
  const db = getFirestore();
  const snap = await getDoc(doc(db, 'config', 'whatsapp'));
  if (!snap.exists()) return null;
  return snap.data() as WhatsappConfig;
}

// Normalize a raw phone string into E.164 WITHOUT the leading +.
// Examples:
//   '0791234567' + defaultCountry '962' → '962791234567'
//   '+962 79 123 4567'                  → '962791234567'
//   '962791234567'                      → '962791234567'
export function normalizePhone(raw: string, defaultCountryCode = '962'): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  // Already looks international
  if (digits.length >= 10 && !digits.startsWith('0')) return digits;
  // Strip leading zero and prepend country code
  const stripped = digits.replace(/^0+/, '');
  return `${defaultCountryCode}${stripped}`;
}

export interface SendResult {
  ok: boolean;
  provider?: string;
  messageId?: string;
  error?: string;
  skipped?: string;
}

// ══ TWILIO ══
async function sendViaTwilio(cfg: WhatsappConfig, to: string, message: string): Promise<SendResult> {
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioFromNumber) {
    return { ok: false, error: 'Twilio not configured (missing accountSid / authToken / fromNumber)' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: cfg.twilioFromNumber.startsWith('whatsapp:') ? cfg.twilioFromNumber : `whatsapp:+${cfg.twilioFromNumber.replace(/^\+/, '')}`,
    To: `whatsapp:+${to}`,
    Body: message,
  });
  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, provider: 'twilio', error: data?.message || `HTTP ${res.status}` };
  return { ok: true, provider: 'twilio', messageId: data.sid };
}

// ══ META WhatsApp Business Cloud API ══
async function sendViaMeta(cfg: WhatsappConfig, to: string, message: string): Promise<SendResult> {
  if (!cfg.metaPhoneNumberId || !cfg.metaAccessToken) {
    return { ok: false, error: 'Meta not configured (missing phoneNumberId / accessToken)' };
  }
  const url = `https://graph.facebook.com/v20.0/${cfg.metaPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.metaAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, provider: 'meta', error: data?.error?.message || `HTTP ${res.status}` };
  const messageId = data?.messages?.[0]?.id;
  return { ok: true, provider: 'meta', messageId };
}

// Main entry point.
export async function sendWhatsapp(to: string, message: string): Promise<SendResult> {
  if (!to || !message) return { ok: false, skipped: 'missing to or message' };
  const cfg = await loadConfig();
  if (!cfg) return { ok: false, skipped: 'config/whatsapp not set' };
  if (!cfg.enabled) return { ok: false, skipped: 'whatsapp disabled in settings' };
  const normalized = normalizePhone(to, cfg.defaultCountryCode || '962');
  if (!normalized) return { ok: false, skipped: 'invalid phone number' };

  const footer = cfg.senderName ? `\n\n— ${cfg.senderName}` : '';
  const finalMessage = message + footer;

  try {
    if (cfg.provider === 'twilio') return await sendViaTwilio(cfg, normalized, finalMessage);
    if (cfg.provider === 'meta')   return await sendViaMeta(cfg, normalized, finalMessage);
    return { ok: false, error: `unknown provider: ${cfg.provider || '(blank)'}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'send failed' };
  }
}
