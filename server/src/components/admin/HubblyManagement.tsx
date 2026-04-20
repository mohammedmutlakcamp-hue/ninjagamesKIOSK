'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import {
  Flame, Cigarette, Plus, Trash2, Save, X, CheckCircle2, Loader2, Star, Download,
} from 'lucide-react';

// Editable versions live in Firestore. When these collections are empty the
// HubblyTab falls back to its hardcoded defaults.
interface ShishaFlavor {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  color: string;
  price: number;       // tokens
  popular?: boolean;
  available?: boolean;
}

interface CigaretteItem {
  id: string;
  name: string;
  nameAr?: string;
  color: string;
  price: number;       // tokens
  badge?: string;
  available?: boolean;
}

// Defaults that mirror the kiosk's hardcoded fallback list — so importing
// these into Firestore makes the admin's editor match exactly what the
// kiosk is already displaying to customers.
const DEFAULT_FLAVORS: Omit<ShishaFlavor, 'id'>[] = [
  { name: 'Grape',        nameAr: 'عنب',           icon: '🍇', color: '#8B5CF6', price: 250, popular: true,  available: true },
  { name: 'Mint',         nameAr: 'نعناع',         icon: '🌿', color: '#10B981', price: 250, available: true },
  { name: 'Double Apple', nameAr: 'تفاحتين',       icon: '🍎', color: '#EF4444', price: 250, popular: true,  available: true },
  { name: 'Watermelon',   nameAr: 'بطيخ',          icon: '🍉', color: '#F472B6', price: 250, available: true },
  { name: 'Blueberry',    nameAr: 'توت أزرق',      icon: '🫐', color: '#6366F1', price: 250, available: true },
  { name: 'Peach',        nameAr: 'خوخ',           icon: '🍑', color: '#FB923C', price: 250, available: true },
  { name: 'Lemon Mint',   nameAr: 'ليمون نعناع',   icon: '🍋', color: '#FACC15', price: 250, available: true },
  { name: 'Strawberry',   nameAr: 'فراولة',        icon: '🍓', color: '#F43F5E', price: 250, available: true },
  { name: 'Mango',        nameAr: 'مانجو',         icon: '🥭', color: '#F59E0B', price: 250, available: true },
  { name: 'Mixed Fruits', nameAr: 'فواكه مشكلة',   icon: '🍹', color: '#EC4899', price: 300, popular: true,  available: true },
  { name: 'Rose',         nameAr: 'ورد',           icon: '🌹', color: '#FB7185', price: 275, available: true },
  { name: 'Gum',          nameAr: 'علكة',          icon: '🫧', color: '#38BDF8', price: 250, available: true },
];
const DEFAULT_CIGS: Omit<CigaretteItem, 'id'>[] = [
  { name: 'Marlboro Red',  nameAr: 'مارلبورو أحمر',  color: '#DC2626', price: 200, badge: 'CLASSIC', available: true },
  { name: 'Marlboro Gold', nameAr: 'مارلبورو ذهبي',   color: '#D4A017', price: 200, badge: 'SMOOTH',  available: true },
  { name: 'Winston',       nameAr: 'وينستون',        color: '#3B82F6', price: 180, available: true },
];

const EMOJI_SWATCHES = ['🍇','🍉','🍎','🍓','🫐','🍋','🥭','🍑','🌿','🌹','🍹','🫧','🍊','🍍','💨','☕','🍫','❄️','🔥'];
const COLOR_SWATCHES = ['#8B5CF6','#10B981','#EF4444','#F472B6','#6366F1','#FB923C','#FACC15','#F43F5E','#F59E0B','#EC4899','#FB7185','#38BDF8','#DC2626','#D4A017','#3B82F6','#06B6D4','#22C55E','#A855F7','#14B8A6'];

const inputClass = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] transition-colors text-sm';

export function HubblyManagement() {
  const [activeSection, setActiveSection] = useState<'flavors' | 'cigarettes'>('flavors');
  const [flavors, setFlavors] = useState<ShishaFlavor[]>([]);
  const [cigarettes, setCigarettes] = useState<CigaretteItem[]>([]);
  const [editingFlavor, setEditingFlavor] = useState<ShishaFlavor | null>(null);
  const [editingCig, setEditingCig] = useState<CigaretteItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  // Tracks whether we've done the initial snapshot read — prevents the
  // "Import defaults" button from flashing in before listeners settle.
  const [loaded, setLoaded] = useState({ flavors: false, cigs: false });
  // One-shot auto-seed: when the admin visits this panel for the FIRST time
  // and both collections are empty, pull in the default menu so they don't
  // stare at a blank editor that disagrees with what players see on the kiosk.
  const autoSeedAttempted = useRef(false);

  // Real-time listeners
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'shisha-flavors'), orderBy('name')),
      (snap) => {
        setFlavors(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShishaFlavor)));
        setLoaded((s) => ({ ...s, flavors: true }));
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'cigarettes'), orderBy('name')),
      (snap) => {
        setCigarettes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CigaretteItem)));
        setLoaded((s) => ({ ...s, cigs: true }));
      },
    );
    return () => unsub();
  }, []);

  // Seed Firestore with the 12 default flavors + 3 default cigarettes in one
  // batch. Idempotent at the id level — calling twice won't create duplicates
  // because we derive the doc id from the name.
  const seedDefaults = async (scope: 'flavors' | 'cigs' | 'both' = 'both') => {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      if (scope === 'flavors' || scope === 'both') {
        for (const f of DEFAULT_FLAVORS) {
          const id = f.name.toLowerCase().replace(/\s+/g, '-');
          batch.set(doc(db, 'shisha-flavors', id), f, { merge: true });
        }
      }
      if (scope === 'cigs' || scope === 'both') {
        for (const c of DEFAULT_CIGS) {
          const id = c.name.toLowerCase().replace(/\s+/g, '-');
          batch.set(doc(db, 'cigarettes', id), c, { merge: true });
        }
      }
      await batch.commit();
    } catch (err) {
      console.error('seed defaults failed', err);
      alert('Import failed — check your connection.');
    } finally {
      setSeeding(false);
    }
  };

  // Auto-seed once when both collections are confirmed empty on first load.
  useEffect(() => {
    if (autoSeedAttempted.current) return;
    if (!loaded.flavors || !loaded.cigs) return;
    if (flavors.length > 0 || cigarettes.length > 0) {
      autoSeedAttempted.current = true;
      return;
    }
    autoSeedAttempted.current = true;
    // Fire-and-forget auto import — mirrors what the kiosk already shows.
    seedDefaults('both');
  }, [loaded.flavors, loaded.cigs, flavors.length, cigarettes.length]);

  // Save flavor
  const saveFlavor = async () => {
    if (!editingFlavor) return;
    setSaving(true);
    try {
      const id = editingFlavor.id || editingFlavor.name.trim().toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'shisha-flavors', id), {
        name: editingFlavor.name.trim(),
        nameAr: editingFlavor.nameAr?.trim() || '',
        icon: editingFlavor.icon || '💨',
        color: editingFlavor.color || '#8B5CF6',
        price: Number(editingFlavor.price) || 250,
        popular: !!editingFlavor.popular,
        available: editingFlavor.available !== false,
      });
      setJustSavedId(id);
      setTimeout(() => setJustSavedId(null), 1500);
      setEditingFlavor(null);
    } catch (err) {
      console.error('save flavor failed', err);
      alert('Save failed. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const deleteFlavor = async (id: string) => {
    if (!confirm('Delete this flavor permanently?')) return;
    await deleteDoc(doc(db, 'shisha-flavors', id));
  };

  // Save cigarette
  const saveCig = async () => {
    if (!editingCig) return;
    setSaving(true);
    try {
      const id = editingCig.id || editingCig.name.trim().toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'cigarettes', id), {
        name: editingCig.name.trim(),
        nameAr: editingCig.nameAr?.trim() || '',
        color: editingCig.color || '#DC2626',
        price: Number(editingCig.price) || 200,
        badge: editingCig.badge?.trim() || '',
        available: editingCig.available !== false,
      });
      setJustSavedId(id);
      setTimeout(() => setJustSavedId(null), 1500);
      setEditingCig(null);
    } catch (err) {
      console.error('save cig failed', err);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCig = async (id: string) => {
    if (!confirm('Delete this cigarette brand permanently?')) return;
    await deleteDoc(doc(db, 'cigarettes', id));
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)' }}>
            <Flame size={22} className="text-[#06B6D4]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Hubbly Menu</h2>
            <p className="text-[#86868b] text-sm">
              {activeSection === 'flavors' ? `${flavors.length} shisha flavors` : `${cigarettes.length} cigarette brands`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => seedDefaults(activeSection === 'flavors' ? 'flavors' : 'cigs')}
            disabled={seeding}
            title="Import the default menu items that the kiosk ships with"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium text-sm hover:bg-[#f5f5f7] transition-colors disabled:opacity-50"
          >
            {seeding ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Import Defaults
          </button>
          <button
            onClick={() => {
              if (activeSection === 'flavors') {
                setEditingFlavor({ id: '', name: '', icon: '💨', color: '#8B5CF6', price: 250, popular: false, available: true });
              } else {
                setEditingCig({ id: '', name: '', color: '#DC2626', price: 200, badge: '', available: true });
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#06B6D4] text-white rounded-xl font-medium text-sm hover:bg-[#0891b2] transition-colors"
          >
            <Plus size={16} /> Add {activeSection === 'flavors' ? 'Flavor' : 'Cigarette'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-6 bg-[#f5f5f7] p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveSection('flavors')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeSection === 'flavors' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          <Flame size={14} /> Shisha Flavors
        </button>
        <button
          onClick={() => setActiveSection('cigarettes')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeSection === 'cigarettes' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          <Cigarette size={14} /> Cigarettes
        </button>
      </div>

      {/* Content grid */}
      {activeSection === 'flavors' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {flavors.length === 0 && (
            <div className="col-span-full text-center py-12 text-[#86868b] bg-[#f5f5f7] rounded-2xl border border-dashed border-[#d2d2d7]">
              <Flame size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm text-[#1d1d1f] font-medium">No flavors in the editor yet</p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                The kiosk currently shows the 12 built-in defaults. Import them here so you can
                edit prices, remove items, mark unavailable, add Arabic names — whatever you need.
              </p>
              <button onClick={() => seedDefaults('flavors')} disabled={seeding}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#06B6D4] text-white rounded-xl font-medium text-sm hover:bg-[#0891b2] transition-colors disabled:opacity-50">
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Import default flavors
              </button>
            </div>
          )}
          {flavors.map((f) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-4 border relative overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                f.available === false ? 'opacity-60' : ''
              }`}
              style={{ background: `linear-gradient(135deg, ${f.color}15, ${f.color}05)`, borderColor: `${f.color}40` }}
              onClick={() => setEditingFlavor(f)}
            >
              {f.popular && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-yellow-500/15 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Star size={9} /> POPULAR
                </div>
              )}
              {justSavedId === f.id && (
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-500/15 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} /> SAVED
                </div>
              )}
              <div className="text-5xl text-center mb-3">{f.icon}</div>
              <div className="text-center">
                <h4 className="font-semibold text-[#1d1d1f]">{f.name}</h4>
                {f.nameAr && <p className="text-xs text-[#86868b] mt-0.5">{f.nameAr}</p>}
                <p className="text-sm font-bold mt-2" style={{ color: f.color }}>
                  {f.price} <span className="text-xs text-[#86868b] font-normal">tokens</span>
                </p>
                <p className="text-[11px] text-[#86868b] mt-0.5">{(f.price / 100).toFixed(2)} JOD</p>
              </div>
              {f.available === false && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
                  <span className="text-white text-xs font-bold tracking-wider">UNAVAILABLE</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cigarettes.length === 0 && (
            <div className="col-span-full text-center py-12 text-[#86868b] bg-[#f5f5f7] rounded-2xl border border-dashed border-[#d2d2d7]">
              <Cigarette size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm text-[#1d1d1f] font-medium">No cigarettes in the editor yet</p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                The kiosk currently shows Marlboro Red, Marlboro Gold, and Winston as built-in defaults.
                Import them to edit prices or add more brands.
              </p>
              <button onClick={() => seedDefaults('cigs')} disabled={seeding}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#06B6D4] text-white rounded-xl font-medium text-sm hover:bg-[#0891b2] transition-colors disabled:opacity-50">
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Import default cigarettes
              </button>
            </div>
          )}
          {cigarettes.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-5 border relative overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                c.available === false ? 'opacity-60' : ''
              }`}
              style={{ background: `linear-gradient(135deg, ${c.color}20, ${c.color}05)`, borderColor: `${c.color}50` }}
              onClick={() => setEditingCig(c)}
            >
              {c.badge && (
                <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: c.color, color: '#fff' }}>
                  {c.badge}
                </div>
              )}
              {justSavedId === c.id && (
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-green-500/15 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} /> SAVED
                </div>
              )}
              <Cigarette size={32} style={{ color: c.color }} className="mb-3" />
              <h4 className="font-semibold text-[#1d1d1f] text-lg">{c.name}</h4>
              {c.nameAr && <p className="text-xs text-[#86868b] mt-0.5">{c.nameAr}</p>}
              <p className="text-base font-bold mt-3" style={{ color: c.color }}>
                {c.price} <span className="text-xs text-[#86868b] font-normal">tokens</span>
              </p>
              <p className="text-[11px] text-[#86868b]">{(c.price / 100).toFixed(2)} JOD</p>
              {c.available === false && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-2xl">
                  <span className="text-white text-xs font-bold tracking-wider">UNAVAILABLE</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ───────────────── EDIT FLAVOR MODAL ───────────────── */}
      <AnimatePresence>
        {editingFlavor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
            onClick={() => !saving && setEditingFlavor(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-[560px] max-w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editingFlavor.id ? 'Edit Flavor' : 'New Flavor'}
                </h3>
                <button onClick={() => setEditingFlavor(null)}
                  className="w-8 h-8 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center">
                  <X size={18} className="text-[#86868b]" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name (EN)</label>
                    <input type="text" value={editingFlavor.name}
                      onChange={(e) => setEditingFlavor({ ...editingFlavor, name: e.target.value })}
                      placeholder="e.g. Double Apple" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name (AR)</label>
                    <input type="text" value={editingFlavor.nameAr || ''}
                      onChange={(e) => setEditingFlavor({ ...editingFlavor, nameAr: e.target.value })}
                      placeholder="مثلا تفاحتين" className={inputClass} dir="rtl" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Icon (emoji)</label>
                  <div className="flex items-center gap-3">
                    <input type="text" value={editingFlavor.icon}
                      onChange={(e) => setEditingFlavor({ ...editingFlavor, icon: e.target.value })}
                      className={`${inputClass} w-20 text-center text-2xl`} maxLength={4} />
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_SWATCHES.map((e) => (
                        <button key={e} type="button" onClick={() => setEditingFlavor({ ...editingFlavor, icon: e })}
                          className={`w-8 h-8 rounded-lg text-lg hover:bg-[#f5f5f7] transition-colors ${editingFlavor.icon === e ? 'ring-2 ring-[#0071e3]' : ''}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button key={c} type="button" onClick={() => setEditingFlavor({ ...editingFlavor, color: c })}
                        className={`w-8 h-8 rounded-lg border-2 transition-transform ${editingFlavor.color === c ? 'scale-110 border-[#1d1d1f]' : 'border-transparent'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Price (tokens)</label>
                  <input type="number" value={editingFlavor.price}
                    onChange={(e) => setEditingFlavor({ ...editingFlavor, price: Number(e.target.value) })}
                    className={`${inputClass} w-40`} step={10} />
                  <p className="text-[11px] text-[#86868b] mt-1">
                    = {(editingFlavor.price / 100).toFixed(2)} JOD (cash payment at counter)
                  </p>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                    <input type="checkbox" checked={!!editingFlavor.popular}
                      onChange={(e) => setEditingFlavor({ ...editingFlavor, popular: e.target.checked })} />
                    Popular (shows star badge)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                    <input type="checkbox" checked={editingFlavor.available !== false}
                      onChange={(e) => setEditingFlavor({ ...editingFlavor, available: e.target.checked })} />
                    Available now
                  </label>
                </div>

                <div className="flex gap-3 pt-4 border-t border-[#e5e5ea]">
                  <button onClick={saveFlavor} disabled={saving || !editingFlavor.name.trim()}
                    className="flex-1 py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                  {editingFlavor.id && (
                    <button onClick={() => { deleteFlavor(editingFlavor.id); setEditingFlavor(null); }}
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

      {/* ───────────────── EDIT CIGARETTE MODAL ───────────────── */}
      <AnimatePresence>
        {editingCig && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
            onClick={() => !saving && setEditingCig(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-[560px] max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editingCig.id ? 'Edit Cigarette' : 'New Cigarette'}
                </h3>
                <button onClick={() => setEditingCig(null)}
                  className="w-8 h-8 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center">
                  <X size={18} className="text-[#86868b]" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name (EN)</label>
                    <input type="text" value={editingCig.name}
                      onChange={(e) => setEditingCig({ ...editingCig, name: e.target.value })}
                      placeholder="e.g. Marlboro Red" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name (AR)</label>
                    <input type="text" value={editingCig.nameAr || ''}
                      onChange={(e) => setEditingCig({ ...editingCig, nameAr: e.target.value })}
                      placeholder="مارلبورو أحمر" className={inputClass} dir="rtl" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_SWATCHES.map((c) => (
                      <button key={c} type="button" onClick={() => setEditingCig({ ...editingCig, color: c })}
                        className={`w-8 h-8 rounded-lg border-2 transition-transform ${editingCig.color === c ? 'scale-110 border-[#1d1d1f]' : 'border-transparent'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Price (tokens)</label>
                    <input type="number" value={editingCig.price}
                      onChange={(e) => setEditingCig({ ...editingCig, price: Number(e.target.value) })}
                      className={inputClass} step={10} />
                    <p className="text-[11px] text-[#86868b] mt-1">
                      = {(editingCig.price / 100).toFixed(2)} JOD
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Badge (optional)</label>
                    <input type="text" value={editingCig.badge || ''}
                      onChange={(e) => setEditingCig({ ...editingCig, badge: e.target.value })}
                      placeholder="e.g. CLASSIC, SMOOTH" className={inputClass} maxLength={10} />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                  <input type="checkbox" checked={editingCig.available !== false}
                    onChange={(e) => setEditingCig({ ...editingCig, available: e.target.checked })} />
                  Available now
                </label>

                <div className="flex gap-3 pt-4 border-t border-[#e5e5ea]">
                  <button onClick={saveCig} disabled={saving || !editingCig.name.trim()}
                    className="flex-1 py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                  {editingCig.id && (
                    <button onClick={() => { deleteCig(editingCig.id); setEditingCig(null); }}
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
