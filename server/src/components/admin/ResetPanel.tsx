'use client';

// ═══════════════════════════════════════════════════════════════════
//  Admin Reset Panel — per-category wipes with confirmation.
//
//  Every button:
//   - Asks for typed confirmation ("RESET" or "DELETE")
//   - Dry-run preview count first
//   - Shows progress + result
//
//  Scope: collections + fields on players, not admin config.
// ═══════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, writeBatch, doc, deleteDoc, setDoc,
} from 'firebase/firestore';
import {
  RefreshCw, AlertTriangle, Loader2, CheckCircle2, Trash2, X,
  Package, Users, Coins, Clock, ClipboardList, Flame, Gift, MessageCircle,
  Activity, Megaphone, Star, Swords, ShieldAlert, TrendingUp,
  Database, Zap,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

const BATCH = 400;

type ResetKind =
  | 'collection'                        // delete every doc in a collection
  | 'player-field'                      // set a field to defaultValue on every player
  | 'chest-ledgers'                     // delete config/chest-ledger-{tier}
  | 'everything';                       // nuclear

interface ResetDef {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: React.ComponentType<any>;
  color: string;
  kind: ResetKind;
  collection?: string;                  // for kind='collection'
  playerField?: string;                 // for kind='player-field' (supports dotted paths)
  defaultValue?: any;                   // for kind='player-field'
  extraCollections?: string[];          // for kind='everything'
  destructive?: 'normal' | 'danger' | 'nuclear';
}

const RESETS: ResetDef[] = [
  // ── Chest ──────────────────────────────────────────────────────────
  {
    id: 'chest-drops',
    title: 'Chest Drop History',
    titleAr: 'سجل درّوبات الصناديق',
    description: 'Deletes every chest-drop record. "Last Opened" and "Lucky Players" reset to empty.',
    descriptionAr: 'يحذف كل سجلات درّوبات الصناديق. "آخر فتح" و"اللاعبين المحظوظين" يرجعوا فارغين.',
    icon: Package, color: '#0071e3', kind: 'collection', collection: 'chest-drops',
  },
  {
    id: 'chest-ledgers',
    title: 'Chest Ledgers (house margin)',
    titleAr: 'دفاتر الصناديق (هامش المحل)',
    description: 'Resets the deterministic profit-locked budget per tier. Next open starts fresh. Keeps luck slider and custom rewards.',
    descriptionAr: 'يصفّر ميزانية الأرباح المغلقة لكل تير. الفتحة القادمة تبدأ من جديد. يحتفظ بمنزلق الحظ والمكافآت المخصصة.',
    icon: Zap, color: '#ff9500', kind: 'chest-ledgers',
  },
  // ── Player stats ───────────────────────────────────────────────────
  {
    id: 'player-stats',
    title: 'All Player Stats',
    titleAr: 'إحصائيات كل اللاعبين',
    description: 'Zeros stats field on every player (chestsOpened, foodOrdered, gamesPlayed, friends-invited, etc).',
    descriptionAr: 'يصفّر حقل stats لكل لاعب (عدد الصناديق المفتوحة، الطلبات، الألعاب، الخ).',
    icon: TrendingUp, color: '#34c759', kind: 'player-field', playerField: 'stats', defaultValue: {},
  },
  {
    id: 'player-coins',
    title: 'All Player Coins (tokens)',
    titleAr: 'كل توكنز اللاعبين',
    description: 'Sets every player coin balance to 0. effectiveRate + coinsFromPurchases also reset.',
    descriptionAr: 'يرجع رصيد توكنز كل اللاعبين إلى 0. يصفّر معدل الشراء أيضاً.',
    icon: Coins, color: '#eab308', kind: 'player-field', playerField: 'coins', defaultValue: 0, destructive: 'danger',
  },
  {
    id: 'player-totalCoinsSpent',
    title: 'Lifetime Coins Spent',
    titleAr: 'مجموع التوكنز المُنفقة',
    description: 'Zeros totalCoinsSpent counter on every player.',
    descriptionAr: 'يصفّر عدّاد مجموع التوكنز المُنفقة لكل لاعب.',
    icon: TrendingUp, color: '#34c759', kind: 'player-field', playerField: 'totalCoinsSpent', defaultValue: 0,
  },
  {
    id: 'player-playtime',
    title: 'All Player Playtime',
    titleAr: 'وقت لعب اللاعبين',
    description: 'Zeros remainingPlaytime + totalPlaytime. Every active session loses its minutes.',
    descriptionAr: 'يصفّر الوقت المتبقي + مجموع وقت اللعب. كل الجلسات الحالية تفقد دقائقها.',
    icon: Clock, color: '#ff9500', kind: 'player-field', playerField: 'remainingPlaytime', defaultValue: 0, destructive: 'danger',
  },
  {
    id: 'player-xp',
    title: 'All XP / Levels',
    titleAr: 'كل النقاط والمستويات',
    description: 'Zeros xp field. Players drop back to level 1 immediately.',
    descriptionAr: 'يصفّر حقل XP. اللاعبون يرجعوا لمستوى 1 فوراً.',
    icon: Star, color: '#af52de', kind: 'player-field', playerField: 'xp', defaultValue: 0, destructive: 'danger',
  },
  {
    id: 'player-inventory',
    title: 'All Inventories',
    titleAr: 'كل محتويات الحقائب',
    description: 'Empties every player inventory (vouchers, skins, gifts).',
    descriptionAr: 'يُفرّغ حقائب كل اللاعبين (فواتير، شخصيات، هدايا).',
    icon: Package, color: '#E879F9', kind: 'player-field', playerField: 'inventory', defaultValue: [], destructive: 'danger',
  },
  {
    id: 'player-ownedNinjas',
    title: 'Owned Ninjas (skin unlocks)',
    titleAr: 'الشخصيات المملوكة',
    description: 'Clears every player ownedNinjas array. Only free starters remain accessible.',
    descriptionAr: 'يفرّغ قائمة الشخصيات المملوكة لكل اللاعبين. تبقى الشخصيات المجانية فقط.',
    icon: Users, color: '#af52de', kind: 'player-field', playerField: 'ownedNinjas', defaultValue: [], destructive: 'danger',
  },
  // ── Orders / cash ─────────────────────────────────────────────────
  {
    id: 'food-orders',
    title: 'Food Orders',
    titleAr: 'طلبات الطعام',
    description: 'Deletes the entire orders collection (cafeteria history).',
    descriptionAr: 'يحذف كل سجل طلبات الكافيه.',
    icon: ClipboardList, color: '#ff6f00', kind: 'collection', collection: 'orders',
  },
  {
    id: 'shisha-orders',
    title: 'Hubbly Orders (shisha + tobacco)',
    titleAr: 'طلبات الأرجيلة',
    description: 'Deletes the shisha-orders collection.',
    descriptionAr: 'يحذف سجل طلبات الأرجيلة والسجائر.',
    icon: Flame, color: '#06B6D4', kind: 'collection', collection: 'shisha-orders',
  },
  {
    id: 'promo-orders',
    title: 'Promo Bundle Orders',
    titleAr: 'طلبات العروض',
    description: 'Deletes the promo-orders collection.',
    descriptionAr: 'يحذف سجل طلبات العروض الترويجية.',
    icon: Gift, color: '#34c759', kind: 'collection', collection: 'promo-orders',
  },
  {
    id: 'topup-requests',
    title: 'Top-Up Requests',
    titleAr: 'طلبات الشحن',
    description: 'Deletes the topup-requests collection (pending + approved + rejected).',
    descriptionAr: 'يحذف كل طلبات الشحن (معلقة ومقبولة ومرفوضة).',
    icon: Coins, color: '#eab308', kind: 'collection', collection: 'topup-requests',
  },
  {
    id: 'coin-transfers',
    title: 'Coin Transfers (player-to-player)',
    titleAr: 'تحويلات التوكنز',
    description: 'Deletes the coin-transfers audit log.',
    descriptionAr: 'يحذف سجل تحويلات التوكنز بين اللاعبين.',
    icon: Coins, color: '#eab308', kind: 'collection', collection: 'coin-transfers',
  },
  // ── Social / engagement ───────────────────────────────────────────
  {
    id: 'ratings',
    title: 'Session Ratings',
    titleAr: 'تقييمات الجلسات',
    description: 'Deletes every post-session star rating.',
    descriptionAr: 'يحذف كل تقييمات الجلسات بالنجوم.',
    icon: Star, color: '#FFD700', kind: 'collection', collection: 'ratings',
  },
  {
    id: 'daily-tasks',
    title: 'Daily Task Progress',
    titleAr: 'تقدّم المهام اليومية',
    description: 'Resets all daily-tasks progress docs. Players start today\'s tasks from zero.',
    descriptionAr: 'يصفّر تقدّم المهام اليومية لكل اللاعبين.',
    icon: Activity, color: '#34c759', kind: 'collection', collection: 'daily-tasks',
  },
  {
    id: 'messages',
    title: 'Chat Messages',
    titleAr: 'رسائل الشات',
    description: 'Deletes every in-kiosk chat message (messages, group-chats, support-chats, support-messages).',
    descriptionAr: 'يحذف كل رسائل الشات داخل الكشك.',
    icon: MessageCircle, color: '#0071e3', kind: 'collection', collection: 'messages',
    extraCollections: ['group-chats', 'support-chats', 'support-messages'],
  },
  {
    id: 'sessions',
    title: 'Play Sessions',
    titleAr: 'جلسات اللعب',
    description: 'Deletes the sessions collection (session log).',
    descriptionAr: 'يحذف سجل جلسات اللعب.',
    icon: Clock, color: '#ff9500', kind: 'collection', collection: 'sessions',
  },
  {
    id: 'tournaments',
    title: 'Tournament History',
    titleAr: 'سجل البطولات',
    description: 'Deletes the tournaments collection (past + active brackets).',
    descriptionAr: 'يحذف سجل البطولات (السابقة والحالية).',
    icon: Swords, color: '#A855F7', kind: 'collection', collection: 'tournaments', destructive: 'danger',
  },
  {
    id: 'announcements',
    title: 'Announcement History',
    titleAr: 'سجل الإعلانات',
    description: 'Deletes announcement log. Live banner (config/announcement) also cleared.',
    descriptionAr: 'يحذف سجل الإعلانات. البانر الحي يُفرّغ أيضاً.',
    icon: Megaphone, color: '#0071e3', kind: 'collection', collection: 'announcements',
  },
  {
    id: 'player-reports',
    title: 'Player Reports',
    titleAr: 'بلاغات اللاعبين',
    description: 'Deletes every player-vs-player report.',
    descriptionAr: 'يحذف كل بلاغات اللاعبين ضد بعضهم.',
    icon: ShieldAlert, color: '#ff3b30', kind: 'collection', collection: 'player-reports',
  },
  {
    id: 'debug-logs',
    title: 'Debug Logs',
    titleAr: 'سجلات التصحيح',
    description: 'Deletes all kiosk diagnostic sessions.',
    descriptionAr: 'يحذف كل سجلات التصحيح من الكشك.',
    icon: Activity, color: '#86868b', kind: 'collection', collection: 'debug-logs',
  },
  // ── Nuclear ───────────────────────────────────────────────────────
  {
    id: 'everything',
    title: '☢️ RESET EVERYTHING (except admin config)',
    titleAr: '☢️ إعادة تعيين كل شيء (ما عدا إعدادات الأدمن)',
    description: 'Runs every reset above in sequence. Players survive — only their stats/coins/time/inventory/history are wiped. Admin config (pricing, luck slider, custom rewards, cameras, whatsapp, etc.) stays.',
    descriptionAr: 'يشغّل كل عمليات الإعادة بالترتيب. حسابات اللاعبين تبقى — فقط الإحصائيات والتوكنز والوقت والحقيبة والسجلات تُحذف. إعدادات الأدمن تبقى.',
    icon: Database, color: '#ff3b30', kind: 'everything', destructive: 'nuclear',
  },
];

async function wipeCollection(name: string): Promise<number> {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return 0;
  let deleted = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(BATCH, docs.length - i);
  }
  return deleted;
}

async function resetPlayerField(fieldPath: string, defaultValue: any): Promise<number> {
  const snap = await getDocs(collection(db, 'players'));
  if (snap.empty) return 0;
  let updated = 0;
  const docs = snap.docs;
  // Extra resets when coins get zeroed — nuke derived fields too.
  const extras: Record<string, any> = {};
  if (fieldPath === 'coins') {
    extras.effectiveRate = 0.01;
    extras.coinsFromPurchases = 0;
  }
  if (fieldPath === 'remainingPlaytime') {
    extras.totalPlaytime = 0;
    extras.freePlayUntil = null;
  }
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH).forEach((d) => {
      batch.update(d.ref, { [fieldPath]: defaultValue, ...extras });
    });
    await batch.commit();
    updated += Math.min(BATCH, docs.length - i);
  }
  return updated;
}

async function resetChestLedgers(): Promise<number> {
  let deleted = 0;
  for (const tier of ['common', 'rare', 'legendary', 'mythical']) {
    try {
      await deleteDoc(doc(db, 'config', `chest-ledger-${tier}`));
      deleted += 1;
    } catch { /* ok if missing */ }
  }
  return deleted;
}

async function clearLiveAnnouncement() {
  try {
    await setDoc(doc(db, 'config', 'announcement'), { active: false }, { merge: true });
  } catch { /* non-fatal */ }
}

async function runReset(def: ResetDef): Promise<{ ok: boolean; count: number; detail?: string }> {
  try {
    if (def.kind === 'collection') {
      let total = 0;
      if (def.collection) total += await wipeCollection(def.collection);
      if (def.extraCollections) for (const c of def.extraCollections) total += await wipeCollection(c);
      if (def.id === 'announcements') await clearLiveAnnouncement();
      return { ok: true, count: total };
    }
    if (def.kind === 'player-field' && def.playerField !== undefined) {
      const n = await resetPlayerField(def.playerField, def.defaultValue);
      return { ok: true, count: n, detail: 'players updated' };
    }
    if (def.kind === 'chest-ledgers') {
      const n = await resetChestLedgers();
      return { ok: true, count: n, detail: 'ledgers cleared' };
    }
    if (def.kind === 'everything') {
      let total = 0;
      for (const r of RESETS) {
        if (r.kind === 'everything') continue;
        const res = await runReset(r);
        total += res.count;
      }
      return { ok: true, count: total };
    }
    return { ok: false, count: 0, detail: 'unknown kind' };
  } catch (err: any) {
    return { ok: false, count: 0, detail: err?.message || 'unknown error' };
  }
}

export function ResetPanel() {
  const [pending, setPending] = useState<ResetDef | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; ok: boolean; count: number; detail?: string } | null>(null);

  const need = pending?.destructive === 'nuclear' ? 'NUKE EVERYTHING' : pending?.destructive === 'danger' ? 'DELETE' : 'RESET';

  const execute = async () => {
    if (!pending) return;
    setBusy(true);
    setResult(null);
    const res = await runReset(pending);
    setResult({ id: pending.id, ...res });
    setBusy(false);
    setPending(null);
    setConfirmText('');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)' }}>
          <RefreshCw size={22} className="text-[#ff3b30]" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Reset & Wipe
            <HelpTip title={{ en: 'Reset & Wipe', ar: 'إعادة تعيين وحذف' }}
              ar={(
                <>
                  <p className="mb-2">كل زر يحذف فئة محددة من البيانات. تأكيد بالكتابة مطلوب قبل التنفيذ.</p>
                  <p className="mb-1.5"><strong>العادي (أزرق):</strong> سجلات وإحصائيات فقط.</p>
                  <p className="mb-1.5"><strong>خطر (أحمر):</strong> توكنز اللاعبين، وقتهم، حقيبتهم — يؤثر فوراً.</p>
                  <p className="text-[#86868b]"><strong>نووي:</strong> يشغّل كل الإعادات بالترتيب. حسابات اللاعبين تبقى.</p>
                </>
              )}>
              <p className="mb-2">Each button wipes a specific category. Typed confirmation required before execution.</p>
              <p className="mb-1.5"><strong>Normal (blue):</strong> logs and stats only.</p>
              <p className="mb-1.5"><strong>Danger (red):</strong> player tokens, time, inventory — affects players instantly.</p>
              <p className="text-[#86868b]"><strong>Nuclear:</strong> runs every reset. Player accounts themselves stay intact.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">Granular resets — use when starting a fresh cycle.</p>
        </div>
      </div>

      {/* Live result banner */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mb-5 rounded-xl p-4 flex items-start gap-3 ${
              result.ok
                ? 'bg-[#34c759]/10 text-[#15803d] border border-[#34c759]/30'
                : 'bg-[#ff3b30]/10 text-[#991b1b] border border-[#ff3b30]/30'
            }`}
          >
            {result.ok ? <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />}
            <div className="flex-1 text-sm">
              <strong>{result.ok ? 'Reset complete' : 'Reset failed'}</strong> — {result.count} {result.detail || 'records'}
            </div>
            <button onClick={() => setResult(null)} className="text-current opacity-60 hover:opacity-100">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {RESETS.map((r) => {
          const Icon = r.icon;
          const tone = r.destructive === 'nuclear' ? '#ff3b30'
            : r.destructive === 'danger' ? '#ff9500'
            : r.color;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-4 border bg-white hover:shadow-md transition-shadow
                ${r.destructive === 'nuclear' ? 'md:col-span-2 lg:col-span-3' : ''}`}
              style={{
                borderColor: r.destructive === 'nuclear'
                  ? 'rgba(255,59,48,0.4)'
                  : r.destructive === 'danger'
                  ? 'rgba(255,149,0,0.3)'
                  : '#e5e5ea',
                background: r.destructive === 'nuclear'
                  ? 'linear-gradient(135deg, rgba(255,59,48,0.05), white)'
                  : undefined,
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${tone}15`, color: tone }}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="font-semibold text-[#1d1d1f] text-sm">{r.title}</div>
                    {r.destructive === 'danger' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff9500]/15 text-[#ff9500]">DANGER</span>
                    )}
                    {r.destructive === 'nuclear' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#ff3b30]/15 text-[#ff3b30]">NUCLEAR</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#86868b] mt-1 leading-relaxed">{r.description}</p>
                </div>
              </div>
              <button
                onClick={() => { setPending(r); setConfirmText(''); }}
                className={`w-full py-2 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors
                  ${r.destructive === 'nuclear' ? 'bg-[#ff3b30] text-white hover:bg-[#dc2626]'
                   : r.destructive === 'danger' ? 'bg-[#ff9500] text-white hover:bg-[#e68600]'
                   : 'bg-[#0071e3] text-white hover:bg-[#0077ED]'}`}
              >
                <Trash2 size={12} /> Reset
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
            onClick={() => !busy && setPending(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl w-[500px] max-w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#ff3b30]/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-[#ff3b30]" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Confirm: {pending.title}</h3>
                  <p className="text-sm text-[#86868b] mt-1">{pending.description}</p>
                </div>
              </div>

              <div className="bg-[#fff5f5] border border-[#ff3b30]/25 rounded-xl p-3 mb-4 text-xs text-[#991b1b] leading-relaxed">
                This action is permanent. There is no undo. Type <strong className="font-mono bg-white px-1.5 py-0.5 rounded">{need}</strong> below to confirm.
              </div>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Type ${need}`}
                autoFocus
                className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2.5 text-sm mb-4 font-mono focus:border-[#ff3b30] outline-none"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setPending(null)}
                  disabled={busy}
                  className="flex-1 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] font-medium text-sm hover:bg-[#f5f5f7] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={execute}
                  disabled={busy || confirmText.trim() !== need}
                  className="flex-1 py-3 rounded-xl bg-[#ff3b30] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#dc2626] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {busy ? 'Wiping...' : 'Wipe'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
