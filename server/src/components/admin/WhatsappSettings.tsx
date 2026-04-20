'use client';

// WhatsApp integration admin panel.
//
// Handles two jobs:
//  1. CONFIG — provider (Twilio or Meta), credentials, enabled toggle,
//     default country code, sender name
//  2. SEND  — ad-hoc admin broadcast (pick players or type a number)
//
// Credentials persist in Firestore config/whatsapp. Never fetched by the
// client SDK on the kiosk — only /api/whatsapp/send server-side reads them.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  doc, onSnapshot, setDoc, collection, getDocs, addDoc,
} from 'firebase/firestore';
import {
  MessageCircle, Send, Settings, CheckCircle2, AlertTriangle,
  Loader2, Eye, EyeOff, Users, User, Radio,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface WhatsappConfig {
  provider: 'twilio' | 'meta' | '';
  enabled: boolean;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
  metaBusinessAccountId?: string;
  defaultCountryCode?: string;
  senderName?: string;
  // Admin phone(s) that receive ALL kiosk events (orders, top-ups, buy-time,
  // shisha, chat, registrations, etc). Comma-separate for multiple owners.
  adminPhone?: string;
}

const input = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] text-sm';

export function WhatsappSettings() {
  const [tab, setTab] = useState<'config' | 'send'>('config');
  const [cfg, setCfg] = useState<WhatsappConfig>({ provider: '', enabled: false, defaultCountryCode: '962', senderName: 'Ninja Games' });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // Send-panel state
  const [recipient, setRecipient] = useState<'custom' | 'player'>('custom');
  const [phone, setPhone] = useState('');
  const [pickedPlayerUid, setPickedPlayerUid] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Live config listener
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'whatsapp'), (snap) => {
      if (snap.exists()) setCfg((c) => ({ ...c, ...(snap.data() as WhatsappConfig) }));
    });
    return () => unsub();
  }, []);

  // ── Load players for the picker (on demand)
  useEffect(() => {
    if (tab !== 'send') return;
    getDocs(collection(db, 'players')).then((snap) => {
      setPlayers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
  }, [tab]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'whatsapp'), cfg, { merge: true });
      setSavedAt(Date.now());
    } catch (err) {
      console.error('[whatsapp] save config', err);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    setSending(true);
    setSendResult(null);
    try {
      let to = phone;
      if (recipient === 'player') {
        const p = players.find((x) => x.uid === pickedPlayerUid);
        to = p?.phone || p?.whatsapp || '';
        if (!to) {
          setSendResult({ ok: false, text: 'That player has no phone number on file.' });
          setSending(false);
          return;
        }
      }
      if (!to || !message.trim()) {
        setSendResult({ ok: false, text: 'Missing recipient or message.' });
        setSending(false);
        return;
      }
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: message.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setSendResult({ ok: true, text: `Sent via ${data.provider}. Message ID: ${data.messageId}` });
        // Log to history
        await addDoc(collection(db, 'whatsapp-log'), {
          to, message: message.trim(), provider: data.provider, messageId: data.messageId,
          sentBy: 'admin', createdAt: Date.now(),
        });
      } else {
        setSendResult({ ok: false, text: data.error || data.skipped || 'send failed' });
      }
    } catch (err: any) {
      setSendResult({ ok: false, text: err?.message || 'server error' });
    } finally {
      setSending(false);
    }
  };

  const rev = (k: string) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const justSaved = savedAt && Date.now() - savedAt < 2000;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)' }}>
            <MessageCircle size={22} className="text-[#25D366]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
              WhatsApp — Admin Notifications
              <HelpTip title={{ en: 'WhatsApp Admin Notifications', ar: 'تنبيهات واتساب للأدمن' }}
                ar={(
                  <>
                    <p className="mb-2">كل حركة تصير في المحل (طلب طعام، شحن توكنز، شراء وقت، أرجيلة، تسجيل، شات) تصل إلى واتساب الأدمن مباشرة — بدون ما تفضل تطل على الشاشة.</p>
                    <p className="mb-1.5"><strong>مزودان:</strong></p>
                    <ul className="list-disc pr-5 mb-1.5">
                      <li><strong>Twilio Sandbox</strong> — تشغيل مجاني خلال 5 دقائق. يحتاج الأدمن يرسل كود انضمام مرة وحدة.</li>
                      <li><strong>Meta Cloud API</strong> — للإنتاج. 1000 محادثة مجانية شهرياً بدون أي تعقيد.</li>
                    </ul>
                    <p className="mb-1.5"><strong>أرقام الأدمن:</strong> الرقم الذي يستقبل كل الأحداث. افصل بين الأرقام بفاصلة لأكثر من شخص.</p>
                    <p className="text-[#86868b]"><strong>اختبر:</strong> اضغط "Send test" للتأكد من وصول الرسالة.</p>
                  </>
                )}>
                <p className="mb-2">Mirror every kiosk event to your phone via WhatsApp.</p>
                <p className="mb-1.5"><strong>Providers:</strong></p>
                <ul className="list-disc pl-5 mb-1.5">
                  <li><strong>Twilio Sandbox</strong> — free, 5-min setup, opt-in code required once.</li>
                  <li><strong>Meta Cloud API</strong> — production, 1000 free convos/month, no opt-in.</li>
                </ul>
                <p className="mb-1.5"><strong>Admin phone(s):</strong> comma-separate multiple owners.</p>
                <p className="text-[#86868b]"><strong>Test</strong> button verifies end-to-end.</p>
              </HelpTip>
            </h2>
            <p className="text-[#86868b] text-sm">
              {cfg.enabled ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" /> Live via <strong>{cfg.provider || '(none)'}</strong> →
                  <span className="font-mono text-[#1d1d1f]">{cfg.adminPhone || '(no admin phone set)'}</span>
                </span>
              ) : (
                <span className="text-[#ff9500]">Disabled — every order / top-up / buy-time / chat will be mirrored to your phone once enabled</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex bg-[#f5f5f7] p-1 rounded-xl">
          <button onClick={() => setTab('config')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${tab === 'config' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b]'}`}>
            <Settings size={13} /> Configuration
          </button>
          <button onClick={() => setTab('send')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${tab === 'send' ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b]'}`}>
            <Send size={13} /> Send Message
          </button>
        </div>
      </div>

      {/* ───────────── CONFIG ───────────── */}
      {tab === 'config' && (
        <div className="max-w-3xl space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-[#e5e5ea]/60 space-y-4">
            {/* Provider picker */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Provider</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'twilio', label: 'Twilio', hint: 'Simplest, sandbox for free' },
                  { key: 'meta',   label: 'Meta Cloud API', hint: 'Official, no per-message cost' },
                ] as const).map((p) => {
                  const on = cfg.provider === p.key;
                  return (
                    <button key={p.key}
                      onClick={() => setCfg({ ...cfg, provider: p.key })}
                      className={`text-left rounded-xl p-3 border transition-all ${on ? 'border-[#25D366] bg-[#25D366]/5' : 'border-[#e5e5ea] bg-[#f5f5f7] hover:border-[#0071e3]/40'}`}>
                      <div className="flex items-center gap-2 font-medium text-[#1d1d1f]">
                        <Radio size={14} className={on ? 'text-[#25D366]' : 'text-[#86868b]'} />
                        {p.label}
                      </div>
                      <p className="text-[11px] text-[#86868b] mt-0.5">{p.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Twilio fields */}
            {cfg.provider === 'twilio' && (
              <div className="space-y-3 border-t border-[#e5e5ea] pt-4">
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Account SID</label>
                  <input type={reveal.sid ? 'text' : 'password'} value={cfg.twilioAccountSid || ''}
                    onChange={(e) => setCfg({ ...cfg, twilioAccountSid: e.target.value })}
                    placeholder="AC..." className={input} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block flex items-center justify-between">
                    Auth Token
                    <button onClick={() => rev('token')} className="text-[10px] text-[#0071e3]">
                      {reveal.token ? <EyeOff size={12} className="inline" /> : <Eye size={12} className="inline" />} {reveal.token ? 'hide' : 'show'}
                    </button>
                  </label>
                  <input type={reveal.token ? 'text' : 'password'} value={cfg.twilioAuthToken || ''}
                    onChange={(e) => setCfg({ ...cfg, twilioAuthToken: e.target.value })}
                    placeholder="32-char hex" className={input} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">From Number</label>
                  <input type="text" value={cfg.twilioFromNumber || ''}
                    onChange={(e) => setCfg({ ...cfg, twilioFromNumber: e.target.value })}
                    placeholder="whatsapp:+14155238886 (Twilio sandbox)" className={input} />
                  <p className="text-[10px] text-[#86868b] mt-1">For sandbox, use <code className="bg-[#f5f5f7] px-1 rounded">whatsapp:+14155238886</code>. Recipients must opt in first by messaging Twilio's sandbox code.</p>
                </div>
              </div>
            )}

            {/* Meta fields */}
            {cfg.provider === 'meta' && (
              <div className="space-y-3 border-t border-[#e5e5ea] pt-4">
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Phone Number ID</label>
                  <input type="text" value={cfg.metaPhoneNumberId || ''}
                    onChange={(e) => setCfg({ ...cfg, metaPhoneNumberId: e.target.value })}
                    placeholder="15-digit ID from Meta dashboard" className={input} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block flex items-center justify-between">
                    Permanent Access Token
                    <button onClick={() => rev('metaTok')} className="text-[10px] text-[#0071e3]">
                      {reveal.metaTok ? 'hide' : 'show'}
                    </button>
                  </label>
                  <input type={reveal.metaTok ? 'text' : 'password'} value={cfg.metaAccessToken || ''}
                    onChange={(e) => setCfg({ ...cfg, metaAccessToken: e.target.value })}
                    placeholder="EAAG..." className={input} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Business Account ID (optional)</label>
                  <input type="text" value={cfg.metaBusinessAccountId || ''}
                    onChange={(e) => setCfg({ ...cfg, metaBusinessAccountId: e.target.value })}
                    placeholder="for template management later" className={input} />
                </div>
              </div>
            )}

            {/* Common settings */}
            <div className="grid grid-cols-2 gap-3 border-t border-[#e5e5ea] pt-4">
              <div>
                <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Default Country Code</label>
                <input type="text" value={cfg.defaultCountryCode || ''}
                  onChange={(e) => setCfg({ ...cfg, defaultCountryCode: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="962 (Jordan)" className={input} />
                <p className="text-[10px] text-[#86868b] mt-1">Prepended to numbers that start with 0. Jordan = 962.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Sender Name (footer)</label>
                <input type="text" value={cfg.senderName || ''}
                  onChange={(e) => setCfg({ ...cfg, senderName: e.target.value })}
                  placeholder="e.g. Ninja Games" className={input} />
              </div>
            </div>

            {/* ⭐ Admin recipient — THIS is where all kiosk events get routed */}
            <div className="border-t border-[#e5e5ea] pt-4">
              <label className="text-xs font-medium text-[#25D366] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Radio size={12} /> Admin phone(s) — receives every kiosk event
              </label>
              <input type="text" value={cfg.adminPhone || ''}
                onChange={(e) => setCfg({ ...cfg, adminPhone: e.target.value })}
                placeholder="0791234567  (comma-separate multiple owners)"
                className={`${input} font-mono`} />
              <p className="text-[11px] text-[#86868b] mt-1.5">
                Every order, top-up request, time purchase, hubbly/food order, guest
                registration, chat message, and PIN reset gets mirrored to this
                number via WhatsApp. Comma-separate for multiple owners:
                <code className="bg-[#f5f5f7] px-1 rounded mx-1">0791111111, 0799999999</code>
              </p>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between pt-4 border-t border-[#e5e5ea]">
              <div>
                <p className="font-medium text-[#1d1d1f] text-sm">WhatsApp integration enabled</p>
                <p className="text-[11px] text-[#86868b]">When OFF, top-up receipts + scheduled sends are skipped silently.</p>
              </div>
              <button onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
                className={`relative w-14 h-7 rounded-full transition-all ${cfg.enabled ? 'bg-[#25D366]' : 'bg-[#d2d2d7]'}`}>
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${cfg.enabled ? 'left-8' : 'left-1'}`} />
              </button>
            </div>

            {/* Save + Test */}
            <div className="pt-4 border-t border-[#e5e5ea] flex items-center gap-2 flex-wrap">
              <button onClick={saveConfig} disabled={saving}
                className="px-5 py-2.5 bg-[#25D366] text-white rounded-xl font-medium text-sm hover:bg-[#20c05c] disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Save Configuration
              </button>
              <button
                onClick={async () => {
                  if (!cfg.adminPhone) { alert('Enter admin phone first + save.'); return; }
                  setSaving(true);
                  try {
                    await fetch('/api/notify-admin', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'default',
                        title: 'Test — Ninja Admin',
                        message: `If you see this on WhatsApp, the pipeline works. Sent at ${new Date().toLocaleTimeString()}.`,
                      }),
                    });
                    setSendResult({ ok: true, text: 'Test dispatched. Check your phone within a few seconds.' });
                  } catch (err: any) {
                    setSendResult({ ok: false, text: err?.message || 'failed' });
                  }
                  setSaving(false);
                }}
                disabled={saving || !cfg.enabled}
                className="px-5 py-2.5 bg-white border border-[#25D366] text-[#25D366] rounded-xl font-medium text-sm hover:bg-[#25D366]/5 disabled:opacity-50 flex items-center gap-2">
                <Send size={14} /> Send test to admin phone
              </button>
              {justSaved && (
                <span className="text-[#34c759] text-xs flex items-center gap-1">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>
            {sendResult && tab === 'config' && (
              <div className={`rounded-xl p-3 text-xs ${sendResult.ok ? 'bg-[#34c759]/10 text-[#15803d]' : 'bg-[#ff3b30]/10 text-[#991b1b]'}`}>
                {sendResult.text}
              </div>
            )}

            {/* Security callout */}
            <div className="bg-[#fff3cd] border border-[#ffeaa7] rounded-xl p-3 text-[11px] text-[#8a6d3b] flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                Credentials are stored in Firestore <code className="bg-white px-1 rounded">config/whatsapp</code>.
                Only the <code className="bg-white px-1 rounded">/api/whatsapp/send</code> route reads them (server-side).
                For production, tighten Firestore rules to only let admin emails read this doc.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────── SEND ───────────── */}
      {tab === 'send' && (
        <div className="max-w-3xl space-y-5">
          <div className="bg-white rounded-2xl p-6 border border-[#e5e5ea]/60 space-y-4">
            {/* Recipient mode */}
            <div>
              <label className="text-xs font-medium text-[#86868b] uppercase block mb-2">Recipient</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRecipient('custom')}
                  className={`rounded-xl p-3 border flex items-center gap-2 font-medium transition-all ${recipient === 'custom' ? 'border-[#25D366] bg-[#25D366]/5 text-[#1d1d1f]' : 'border-[#e5e5ea] bg-[#f5f5f7] text-[#86868b]'}`}>
                  <User size={14} /> Custom number
                </button>
                <button onClick={() => setRecipient('player')}
                  className={`rounded-xl p-3 border flex items-center gap-2 font-medium transition-all ${recipient === 'player' ? 'border-[#25D366] bg-[#25D366]/5 text-[#1d1d1f]' : 'border-[#e5e5ea] bg-[#f5f5f7] text-[#86868b]'}`}>
                  <Users size={14} /> Pick a player
                </button>
              </div>
            </div>

            {recipient === 'custom' ? (
              <div>
                <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Phone number</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="0791234567 or +962791234567" className={input} />
                <p className="text-[10px] text-[#86868b] mt-1">Leading 0 is auto-replaced with the country code set in Configuration.</p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Player</label>
                <select value={pickedPlayerUid} onChange={(e) => setPickedPlayerUid(e.target.value)}
                  className={input}>
                  <option value="">— Select a player —</option>
                  {players
                    .filter((p) => p.phone || p.whatsapp)
                    .sort((a, b) => (a.username || '').localeCompare(b.username || ''))
                    .map((p) => (
                      <option key={p.uid} value={p.uid}>{p.username} — {p.phone || p.whatsapp}</option>
                    ))}
                </select>
                <p className="text-[10px] text-[#86868b] mt-1">Only players with a phone number on their profile are listed.</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                placeholder="Type your message…"
                className={`${input} resize-none`} />
              <p className="text-[10px] text-[#86868b] mt-1">
                {message.length} chars · a "— {cfg.senderName || 'Ninja Games'}" footer is auto-appended
              </p>
            </div>

            <button onClick={send} disabled={sending || !cfg.enabled}
              className="w-full py-3 bg-[#25D366] text-white rounded-xl font-medium text-sm hover:bg-[#20c05c] disabled:opacity-50 flex items-center justify-center gap-2">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {cfg.enabled ? 'Send via WhatsApp' : 'Enable WhatsApp in Configuration first'}
            </button>

            <AnimatePresence>
              {sendResult && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`rounded-xl p-3 text-sm flex items-start gap-2 ${sendResult.ok ? 'bg-[#34c759]/10 text-[#15803d] border border-[#34c759]/30' : 'bg-[#ff3b30]/10 text-[#991b1b] border border-[#ff3b30]/30'}`}>
                  {sendResult.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 text-xs leading-relaxed">{sendResult.text}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
