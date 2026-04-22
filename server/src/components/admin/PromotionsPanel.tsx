'use client';

// Promotions admin — time-window bundles shown in the kiosk announcement bar.
//
// Shape of a promo:
//   {
//     id, name, description,
//     active,                   // master toggle
//     startHour: 'HH:MM', endHour: 'HH:MM',   // local time window
//     days: [Sun, Mon, Tue, Wed, Thu, Fri, Sat],
//     bundle: [{ name, qty }...],   // what's included in the deal
//     priceJOD, priceTokens,        // dual payment — either works
//     bannerText,                   // shows in the kiosk announcement bar
//     bannerStyle: 'promo' | 'info' | 'urgent',
//     ctaLabel: 'BUY NOW',          // button text on the banner
//   }
//
// Firestore: collection `promotions/*`.
// Kiosk reads and renders the currently-active one (if any) in the
// announcement bar; clicking BUY NOW opens the promo order popup in the
// kiosk (players pay cash or tokens).

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, getDocs } from 'firebase/firestore';
import {
  Gift, Plus, Trash2, Save, X, CheckCircle2, Loader2, Clock,
  Coffee, Sandwich, Flame, Pill,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface BundleItem {
  name: string;
  qty: number;
}

interface Promotion {
  id: string;
  name: string;
  description: string;
  active: boolean;
  startHour: string;
  endHour: string;
  days: boolean[];
  bundle: BundleItem[];
  priceJOD: number;
  priceTokens: number;
  bannerText: string;
  bannerStyle: 'promo' | 'info' | 'urgent';
  ctaLabel: string;
  createdAt?: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const input = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] text-sm';

function emptyPromo(): Promotion {
  return {
    id: '',
    name: '',
    description: '',
    active: true,
    startHour: '18:00',
    endHour: '21:00',
    days: [false, true, true, true, true, true, false], // Mon-Fri by default
    bundle: [{ name: '', qty: 1 }],
    priceJOD: 3,
    priceTokens: 300,
    bannerText: '',
    bannerStyle: 'promo',
    ctaLabel: 'BUY NOW',
  };
}

function isActiveNow(p: Promotion): boolean {
  if (!p.active) return false;
  const now = new Date();
  if (!p.days[now.getDay()]) return false;
  const [sh, sm] = p.startHour.split(':').map(Number);
  const [eh, em] = p.endHour.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= startMin && nowMin < endMin;
}

// Preset bundle options admin can click to add without typing.
const PRESET_ITEMS: { label: string; examples: string }[] = [
  { label: '1 Hour Play Time', examples: '1 hour session on any PC' },
  { label: '3 Hour Play Time', examples: '3 hour session on any PC' },
  { label: 'Cola (large)', examples: 'Food menu item' },
  { label: 'Energy Drink', examples: 'Food menu item' },
  { label: 'Burger', examples: 'Food menu item' },
  { label: 'Pizza Slice', examples: 'Food menu item' },
  { label: 'Shisha (any flavor)', examples: 'Hubbly Bubbly menu' },
  { label: 'Marlboro Red', examples: 'Tobacco' },
  { label: 'Common Chest', examples: 'Free chest reward' },
  { label: '100 Bonus Tokens', examples: 'Tokens added on top' },
  { label: 'Tournament Entry', examples: 'Free entry to any active tournament' },
];

export function PromotionsPanel() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Menu items pulled from Firestore — used as a quick-pick list in the bundle editor.
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; priceJOD: number; category?: string }[]>([]);
  const [hubblyFlavors, setHubblyFlavors] = useState<{ id: string; name: string; price: number }[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'promotions'), orderBy('createdAt', 'desc')), (snap) => {
      setPromos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Promotion)));
    });
    return () => unsub();
  }, []);

  // Load menu + hubbly flavors once when the editor opens.
  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const [menuSnap, shishaSnap] = await Promise.all([
          getDocs(collection(db, 'menu')),
          getDocs(collection(db, 'shisha-flavors')),
        ]);
        setMenuItems(menuSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setHubblyFlavors(shishaSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      } catch { /* non-fatal */ }
    })();
  }, [editing]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    try {
      const id = editing.id || editing.name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
      await setDoc(doc(db, 'promotions', id), {
        ...editing,
        bundle: editing.bundle.filter((b) => b.name.trim()),
        createdAt: editing.createdAt || Date.now(),
      }, { merge: true });
      setEditing(null);
    } catch (err) {
      console.error('save promo', err);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!id) { alert('Cannot delete: this promotion has no id yet. Close and reopen the page.'); return; }
    if (!confirm('Delete this promotion permanently?')) return;
    // Optimistic: drop from local list immediately so the UI reflects the action even
    // before the Firestore snapshot catches up. If the delete fails we restore it.
    const snapshot = promos;
    setDeletingIds((s) => new Set(s).add(id));
    setPromos((list) => list.filter((p) => p.id !== id));
    try {
      await deleteDoc(doc(db, 'promotions', id));
    } catch (err) {
      console.error('delete promotion failed', err);
      alert(`Delete failed: ${(err as Error).message || 'unknown error'}`);
      setPromos(snapshot);
    } finally {
      setDeletingIds((s) => { const next = new Set(s); next.delete(id); return next; });
    }
  };

  const toggleActive = async (p: Promotion) => {
    if (!p.id) return;
    // Optimistic local flip — listener will reconcile when Firestore confirms.
    setPromos((list) => list.map((x) => x.id === p.id ? { ...x, active: !p.active } : x));
    try {
      await setDoc(doc(db, 'promotions', p.id), { active: !p.active }, { merge: true });
    } catch (err) {
      console.error('toggle active failed', err);
      alert(`Toggle failed: ${(err as Error).message || 'unknown error'}`);
      setPromos((list) => list.map((x) => x.id === p.id ? { ...x, active: p.active } : x));
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.25)' }}>
            <Gift size={22} className="text-[#ff9500]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
              Promotions & Bundles
              <HelpTip title={{ en: 'Promotions & Bundles', ar: 'العروض والباقات' }}
                ar={(
                  <>
                    <p className="mb-2">عروض في وقت محدد — مثل "هابي هاور 6-9 مساءً: كولا + برغر + ساعة لعب = 5 دينار".</p>
                    <p className="mb-1.5"><strong>ماذا يرى اللاعب:</strong> خلال النافذة المحدّدة، بانر أخضر أعلى الكشك فيه زر "اشترِ الآن". الضغط يفتح نافذة طلب يدفع فيها كاش (يجمعه الأدمن) أو توكنز (تُخصم فوراً).</p>
                    <p className="mb-1.5"><strong>الطلبات بالكاش</strong> تُحفظ بحالة غير مدفوع — الأدمن يعلّمها مدفوعة عند الدفع، تماماً مثل طلبات الكافيه.</p>
                    <p className="mb-1.5"><strong>الطلبات بالتوكنز</strong> فورية: تُخصم وتُعلَم مدفوعة.</p>
                    <p className="text-[#86868b]"><strong>نصيحة:</strong> اجعل نص البانر قصيرًا ولافتًا. "🔥 هابي هاور · كولا + برغر + 1h = 5 دينار" مثالي.</p>
                  </>
                )}>
                <p className="mb-2">Time-window deals — like "Happy Hour 6–9pm Mon–Fri: Cola + Burger + 1h play for 5 JOD".</p>
                <p className="mb-1.5"><strong>Player view:</strong> green banner at top of every kiosk with BUY NOW, opens cash/tokens order popup.</p>
                <p className="mb-1.5"><strong>Cash:</strong> saved as unpaid, admin marks paid at counter.</p>
                <p className="mb-1.5"><strong>Tokens:</strong> deducted instantly.</p>
                <p className="text-[#86868b]"><strong>Tip:</strong> short + loud banner text. Emojis help.</p>
              </HelpTip>
            </h2>
            <p className="text-[#86868b] text-sm">
              Time-window deals shown as kiosk banners with a BUY NOW button.
              {promos.some(isActiveNow) && <span className="ml-2 text-[#34c759] font-medium">● Live now</span>}
            </p>
          </div>
        </div>
        <button onClick={() => setEditing(emptyPromo())}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#ff9500] text-white rounded-xl font-medium text-sm hover:bg-[#ff8800]">
          <Plus size={16} /> New Promotion
        </button>
      </div>

      {/* Empty state */}
      {promos.length === 0 && (
        <div className="text-center py-16 bg-[#f5f5f7] rounded-2xl border border-dashed border-[#d2d2d7]">
          <Gift size={40} className="mx-auto mb-3 text-[#86868b] opacity-40" />
          <p className="text-[#1d1d1f] font-medium">No promotions yet</p>
          <p className="text-[#86868b] text-sm mt-1 max-w-md mx-auto">
            Create your first bundle — e.g. "Cola + Burger + 1h play · 5 JOD · 6-9pm".
            Kiosks will show it as a banner with a BUY NOW button during the window.
          </p>
          <button onClick={() => setEditing(emptyPromo())}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#ff9500] text-white rounded-xl font-medium text-sm">
            <Plus size={14} /> Create first promotion
          </button>
        </div>
      )}

      {/* Promo cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {promos.map((p) => {
          const live = isActiveNow(p);
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-5 border ${live ? 'border-[#34c759]/50 bg-[#34c759]/5' : 'border-[#e5e5ea] bg-white'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-[#1d1d1f] truncate">{p.name}</h3>
                    {live && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#34c759]/15 text-[#15803d] px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" /> LIVE NOW
                      </span>
                    )}
                    {!p.active && (
                      <span className="text-[10px] font-bold bg-[#86868b]/15 text-[#86868b] px-2 py-0.5 rounded-full">DISABLED</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#86868b]">{p.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold tracking-wider ${p.active ? 'text-[#34c759]' : 'text-[#86868b]'}`}>
                    {p.active ? 'ON' : 'OFF'}
                  </span>
                  {/* Real click-to-toggle iOS switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.active}
                    onClick={() => toggleActive(p)}
                    title={p.active ? 'Click to disable' : 'Click to enable'}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${p.active ? 'bg-[#34c759]' : 'bg-[#d1d1d6]'}`}>
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${p.active ? 'left-[22px]' : 'left-0.5'}`}
                    />
                  </button>
                </div>
              </div>

              {/* Window */}
              <div className="text-xs text-[#86868b] flex items-center gap-1.5 mb-3">
                <Clock size={11} />
                <span>{p.startHour} – {p.endHour}</span>
                <span>·</span>
                <span>{p.days.map((d, i) => d ? DAY_LABELS[i] : null).filter(Boolean).join(' ')}</span>
              </div>

              {/* Bundle */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {p.bundle.map((item, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-[#f5f5f7] border border-[#e5e5ea] text-[#1d1d1f]">
                    {item.qty > 1 && <span className="text-[#ff9500] font-semibold">{item.qty}× </span>}
                    {item.name}
                  </span>
                ))}
              </div>

              {/* Prices */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 bg-[#f5f5f7] rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-[#86868b]">CASH</div>
                  <div className="font-ninja text-lg text-[#ff9500]">{p.priceJOD.toFixed(2)} JOD</div>
                </div>
                <div className="flex-1 bg-[#f5f5f7] rounded-xl px-3 py-2 text-center">
                  <div className="text-[10px] text-[#86868b]">TOKENS</div>
                  <div className="font-ninja text-lg text-[#eab308]">{p.priceTokens.toLocaleString()}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setEditing(p)}
                  className="flex-1 py-2 bg-[#f5f5f7] hover:bg-[#e5e5ea] rounded-xl text-xs font-medium text-[#1d1d1f]">
                  Edit
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={deletingIds.has(p.id)}
                  className="px-4 py-2 bg-[#ff3b30]/10 hover:bg-[#ff3b30]/20 rounded-xl text-xs font-medium text-[#ff3b30] disabled:opacity-40 disabled:cursor-wait">
                  {deletingIds.has(p.id) ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ───────────── EDIT MODAL ───────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
            onClick={() => !saving && setEditing(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl w-[720px] max-w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-[#e5e5ea] px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">{editing.id ? 'Edit Promotion' : 'New Promotion'}</h3>
                <button onClick={() => setEditing(null)} className="w-9 h-9 rounded-lg hover:bg-[#f5f5f7]"><X size={18} /></button>
              </div>

              <div className="p-6 space-y-4">
                {/* Name / description */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name</label>
                    <input type="text" value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Happy Hour Combo" className={input} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Description</label>
                    <input type="text" value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      placeholder="Internal note for staff" className={input} />
                  </div>
                </div>

                {/* Time window */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Start time</label>
                    <input type="time" value={editing.startHour}
                      onChange={(e) => setEditing({ ...editing, startHour: e.target.value })} className={input} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">End time</label>
                    <input type="time" value={editing.endHour}
                      onChange={(e) => setEditing({ ...editing, endHour: e.target.value })} className={input} />
                  </div>
                </div>

                {/* Days */}
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Days of the week</label>
                  <div className="grid grid-cols-7 gap-2">
                    {DAY_LABELS.map((label, i) => {
                      const on = editing.days[i];
                      return (
                        <button key={label}
                          onClick={() => setEditing({ ...editing, days: editing.days.map((d, idx) => idx === i ? !d : d) })}
                          className={`py-2.5 rounded-xl text-xs font-medium transition-all ${on ? 'bg-[#ff9500] text-white' : 'bg-[#f5f5f7] text-[#86868b] border border-[#e5e5ea]'}`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bundle items — with quick-pick from menu + presets */}
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block flex items-center gap-2">
                    What's in the bundle?
                    <span className="text-[10px] text-[#ff9500] font-normal">Each row = one thing the customer gets</span>
                  </label>

                  {/* Selected items */}
                  <div className="space-y-2 mb-3">
                    {editing.bundle.length === 0 && (
                      <div className="text-center py-4 bg-[#f5f5f7] rounded-xl border border-dashed border-[#d2d2d7] text-xs text-[#86868b]">
                        No items yet. Click a preset below or type a custom row.
                      </div>
                    )}
                    {editing.bundle.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-12 flex items-center gap-1">
                          <input type="number" min={1} value={item.qty}
                            onChange={(e) => setEditing({
                              ...editing,
                              bundle: editing.bundle.map((b, idx) => idx === i ? { ...b, qty: Number(e.target.value) || 1 } : b),
                            })}
                            className={`${input} w-12 text-center px-1`} />
                          <span className="text-[#86868b] text-xs">×</span>
                        </div>
                        <input type="text" value={item.name}
                          onChange={(e) => setEditing({
                            ...editing,
                            bundle: editing.bundle.map((b, idx) => idx === i ? { ...b, name: e.target.value } : b),
                          })}
                          placeholder="Item name (e.g. Cola Large, 1 Hour Play, Common Chest)"
                          className={`${input} flex-1`} />
                        <button onClick={() => setEditing({
                          ...editing,
                          bundle: editing.bundle.filter((_, idx) => idx !== i),
                        })}
                          className="w-9 h-9 rounded-lg bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20 flex items-center justify-center">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => setEditing({ ...editing, bundle: [...editing.bundle, { name: '', qty: 1 }] })}
                    className="text-xs text-[#0071e3] hover:underline flex items-center gap-1 mb-3">
                    <Plus size={12} /> Add blank row
                  </button>

                  {/* Quick-pick presets */}
                  <div className="bg-[#f5f5f7] rounded-xl p-3 mb-2">
                    <div className="text-[10px] text-[#86868b] uppercase tracking-wider mb-2 font-medium">
                      Quick pick — click to add
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_ITEMS.map((p) => (
                        <button key={p.label}
                          onClick={() => setEditing({ ...editing, bundle: [...editing.bundle, { name: p.label, qty: 1 }] })}
                          title={p.examples}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#d2d2d7] hover:border-[#ff9500] hover:bg-[#ff9500]/5 text-[11px] text-[#1d1d1f] transition-all flex items-center gap-1">
                          <Plus size={10} className="text-[#ff9500]" /> {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pick from live menu */}
                  {menuItems.length > 0 && (
                    <div className="bg-[#f5f5f7] rounded-xl p-3 mb-2">
                      <div className="text-[10px] text-[#86868b] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
                        <Coffee size={10} /> From your Food Menu ({menuItems.length} items)
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {menuItems.map((m) => (
                          <button key={m.id}
                            onClick={() => setEditing({ ...editing, bundle: [...editing.bundle, { name: m.name, qty: 1 }] })}
                            title={`${(m.priceJOD || 0).toFixed(2)} JOD`}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#d2d2d7] hover:border-[#ff6f00] hover:bg-[#ff6f00]/5 text-[11px] text-[#1d1d1f] transition-all flex items-center gap-1">
                            <Plus size={10} className="text-[#ff6f00]" /> {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {hubblyFlavors.length > 0 && (
                    <div className="bg-[#f5f5f7] rounded-xl p-3">
                      <div className="text-[10px] text-[#86868b] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
                        <Flame size={10} /> From your Hubbly Menu ({hubblyFlavors.length} flavors)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {hubblyFlavors.map((f) => (
                          <button key={f.id}
                            onClick={() => setEditing({ ...editing, bundle: [...editing.bundle, { name: `${f.name} Shisha`, qty: 1 }] })}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#d2d2d7] hover:border-[#06B6D4] hover:bg-[#06B6D4]/5 text-[11px] text-[#1d1d1f] transition-all flex items-center gap-1">
                            <Plus size={10} className="text-[#06B6D4]" /> {f.name} Shisha
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 text-[11px] text-[#86868b] leading-relaxed">
                    <strong>Tip:</strong> the bundle list is what players see on the order popup — keep names short and clear.
                    The prices below are what you charge; the items in the bundle are just the <em>description</em> of what they get.
                  </div>
                </div>

                {/* Prices */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Price (JOD cash)</label>
                    <input type="number" step="0.25" min={0} value={editing.priceJOD}
                      onChange={(e) => setEditing({ ...editing, priceJOD: Number(e.target.value) || 0 })}
                      className={input} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Price (tokens)</label>
                    <input type="number" step={10} min={0} value={editing.priceTokens}
                      onChange={(e) => setEditing({ ...editing, priceTokens: Number(e.target.value) || 0 })}
                      className={input} />
                  </div>
                </div>

                {/* Banner */}
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Banner Text (shown on kiosk)</label>
                  <input type="text" value={editing.bannerText}
                    onChange={(e) => setEditing({ ...editing, bannerText: e.target.value })}
                    placeholder="🔥 Happy Hour — Cola + Burger + 1h for 5 JOD"
                    className={input} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Banner Style</label>
                    <select value={editing.bannerStyle}
                      onChange={(e) => setEditing({ ...editing, bannerStyle: e.target.value as any })}
                      className={input}>
                      <option value="promo">Promo (green)</option>
                      <option value="info">Info (blue)</option>
                      <option value="urgent">Urgent (red)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Button Label</label>
                    <input type="text" value={editing.ctaLabel}
                      onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })}
                      placeholder="BUY NOW" className={input} />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                  <input type="checkbox" checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                  Active (visible to players during its window)
                </label>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-[#e5e5ea]">
                  <button onClick={save} disabled={saving}
                    className="flex-1 py-3 bg-[#ff9500] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#ff8800] disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                  {editing.id && (
                    <button onClick={() => { remove(editing.id); setEditing(null); }}
                      className="px-5 py-3 bg-[#ff3b30]/10 text-[#ff3b30] rounded-xl hover:bg-[#ff3b30]/20">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
