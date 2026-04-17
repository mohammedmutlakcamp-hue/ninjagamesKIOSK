'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { MenuItem } from '@/types';
import { getMenuImage } from '@/lib/menu-images';
import {
  Plus, CupSoda, Cookie, Pizza, UtensilsCrossed, Pencil,
  Trash2, ToggleLeft, ToggleRight, Coins, X, Image as ImageIcon, Link2, Folder, AlertTriangle
} from 'lucide-react';

// Bundled stock images shipped in /public/img/menu — admin can pick one
// instead of pasting a URL. Add new files here when you drop them in the
// folder so the picker exposes them.
const BUNDLED_MENU_IMAGES = [
  '/img/menu/cola.jpg',
  '/img/menu/iced-coffee.jpg',
  '/img/menu/energy-drink.jpg',
  '/img/menu/juice.jpg',
  '/img/menu/hot-chocolate.jpg',
  '/img/menu/karak-tea.jpg',
  '/img/menu/tea.jpg',
  '/img/menu/coffee.jpg',
  '/img/menu/water.jpg',
  '/img/menu/lemon-mint.jpg',
  '/img/menu/cocktail.jpg',
  '/img/menu/molto.jpg',
  '/img/menu/chips.jpg',
  '/img/menu/chocolate.jpg',
  '/img/menu/biscuits.jpg',
  '/img/menu/fries.jpg',
  '/img/menu/sandwich.jpg',
  '/img/menu/burger.jpg',
  '/img/menu/chicken-burger.jpg',
  '/img/menu/hotdog.jpg',
  '/img/menu/kabab.jpg',
];

export function MenuManagement() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [category, setCategory] = useState<'all' | 'drinks' | 'snacks' | 'food'>('all');

  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<'drinks' | 'snacks' | 'food'>('drinks');
  const [formPrice, setFormPrice] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formPrepTime, setFormPrepTime] = useState('5');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menu'), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem)));
    });
    return () => unsub();
  }, []);

  const filtered = items.filter(i => category === 'all' || i.category === category);

  const resetForm = () => {
    setFormName(''); setFormCategory('drinks'); setFormPrice('');
    setFormDescription(''); setFormImage(''); setFormPrepTime('5');
  };

  const openEdit = (item: MenuItem) => {
    setEditItem(item);
    setFormName(item.name); setFormCategory(item.category);
    setFormPrice(item.price.toString()); setFormDescription(item.description);
    setFormImage(item.image); setFormPrepTime(item.preparationTime.toString());
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formName || !formPrice) return;
    const data = {
      name: formName, category: formCategory, price: parseInt(formPrice) || 0,
      description: formDescription, image: formImage, available: true,
      preparationTime: parseInt(formPrepTime) || 5,
    };
    if (editItem) {
      await updateDoc(doc(db, 'menu', editItem.id), data);
    } else {
      await addDoc(collection(db, 'menu'), data);
    }
    resetForm(); setEditItem(null); setShowAdd(false);
  };

  const toggleAvailable = async (item: MenuItem) => {
    await updateDoc(doc(db, 'menu', item.id), { available: !item.available });
  };

  const deleteItem = async (item: MenuItem) => {
    if (confirm(`Delete "${item.name}"?`)) {
      await deleteDoc(doc(db, 'menu', item.id));
    }
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    drinks: <CupSoda size={22} />,
    snacks: <Cookie size={22} />,
    food: <Pizza size={22} />,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Menu Management</h2>
          <p className="text-[#86868b] text-sm">{items.length} items · {items.filter(i => i.available).length} available</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { resetForm(); setEditItem(null); setShowAdd(true); }}
          className="px-6 py-2 bg-[#0071e3] text-white font-medium rounded-xl flex items-center gap-2 hover:bg-[#0077ED] transition-colors"
        >
          <Plus size={16} /> Add Item
        </motion.button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6">
        {(['all', 'drinks', 'snacks', 'food'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 ${
              category === cat ? 'bg-[#0071e3] text-white font-semibold' : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed] border border-[#d2d2d7]'
            }`}
          >
            {cat === 'all' ? <UtensilsCrossed size={16} /> : categoryIcons[cat]}
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            className={`bg-white rounded-2xl p-4 border transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${item.available ? 'border-[#e5e5ea]/60' : 'border-[#ff3b30]/30 opacity-60'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#86868b]">{categoryIcons[item.category]}</span>
              <button
                onClick={() => toggleAvailable(item)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  item.available ? 'text-[#34c759]' : 'text-[#ff3b30]'
                }`}
              >
                {item.available ? <ToggleRight size={16} className="text-[#34c759]" /> : <ToggleLeft size={16} className="text-[#ff3b30]" />}
                {item.available ? 'ON' : 'OFF'}
              </button>
            </div>

            <h3 className="text-sm font-semibold text-[#1d1d1f] mb-1">{item.name}</h3>
            <p className="text-xs text-[#86868b] mb-2 line-clamp-2">{item.description}</p>

            {/* Inline editable price + prep time */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[9px] text-[#86868b] font-medium uppercase">Price</label>
                <div className="flex items-center gap-1 mt-0.5">
                  <Coins size={12} className="text-[#0071e3] shrink-0" />
                  <input type="number" defaultValue={item.price}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0 && val !== item.price) updateDoc(doc(db, 'menu', item.id), { price: val });
                    }}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1 text-sm font-semibold text-[#0071e3] focus:border-[#0071e3] outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[9px] text-[#86868b] font-medium uppercase">Prep (min)</label>
                <input type="number" defaultValue={item.preparationTime}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (val >= 0 && val !== item.preparationTime) updateDoc(doc(db, 'menu', item.id), { preparationTime: val });
                  }}
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-2 py-1 text-sm text-[#1d1d1f] focus:border-[#0071e3] outline-none mt-0.5" />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => openEdit(item)}
                className="flex-1 py-1.5 bg-[#f5f5f7] rounded-xl text-[#86868b] text-xs font-medium hover:bg-[#e8e8ed] flex items-center justify-center gap-1 border border-[#d2d2d7]">
                <Pencil size={11} /> Edit
              </button>
              <button onClick={() => deleteItem(item)}
                className="flex-1 py-1.5 bg-white rounded-xl text-[#ff3b30] text-xs font-medium hover:bg-[#fff5f5] flex items-center justify-center gap-1 border border-[#d2d2d7]">
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-20 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
            <UtensilsCrossed size={48} className="text-[#d2d2d7] mx-auto mb-4" />
            <p className="text-xl font-semibold text-[#86868b]">No items yet</p>
            <p className="text-[#86868b] text-sm mt-2">Click &quot;+ Add Item&quot; to add drinks, snacks, and food</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => { setShowAdd(false); setEditItem(null); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl p-8 w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#e5e5ea]/60"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editItem ? 'Edit Item' : 'Add Menu Item'}
                </h3>
                <button onClick={() => { setShowAdd(false); setEditItem(null); }} className="text-[#86868b] hover:text-[#1d1d1f]"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[#86868b] text-sm font-medium mb-1 block">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Espresso Coffee"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[#86868b] text-sm font-medium mb-1 block">Category</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none">
                      <option value="drinks">Drinks</option>
                      <option value="snacks">Snacks</option>
                      <option value="food">Food</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm font-medium mb-1 block">Price (coins)</label>
                    <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="e.g., 30"
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[#86868b] text-sm font-medium mb-1 block">Description</label>
                  <input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Short description"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none" />
                </div>
                <div>
                  <label className="text-[#86868b] text-sm font-medium mb-1 block">Prep Time (minutes)</label>
                  <input type="number" value={formPrepTime} onChange={(e) => setFormPrepTime(e.target.value)}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none" />
                </div>

                {/* IMAGE — paste URL or pick a bundled photo. Preview is live. */}
                <div>
                  <label className="text-[#86868b] text-sm font-medium mb-1 block flex items-center gap-1.5">
                    <ImageIcon size={13} /> Image
                  </label>
                  <div className="flex items-stretch gap-3">
                    {/* Live preview — falls back to the smart auto-pick if the URL fails */}
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-[#f5f5f7] border border-[#d2d2d7] flex items-center justify-center flex-shrink-0">
                      <img
                        key={formImage}
                        src={formImage || getMenuImage({ name: formName, category: formCategory })}
                        alt="preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const t = e.currentTarget as HTMLImageElement;
                          const fb = getMenuImage({ name: formName, category: formCategory });
                          if (t.src !== window.location.origin + fb) t.src = fb;
                        }}
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="relative">
                        <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                        <input
                          value={formImage}
                          onChange={(e) => setFormImage(e.target.value)}
                          placeholder="Paste image URL or /img/menu/your-photo.jpg"
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                        />
                      </div>
                      <div className="relative">
                        <Folder size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
                        <select
                          value={BUNDLED_MENU_IMAGES.includes(formImage) ? formImage : ''}
                          onChange={(e) => { if (e.target.value) setFormImage(e.target.value); }}
                          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] outline-none appearance-none cursor-pointer"
                        >
                          <option value="">— Pick from bundled library —</option>
                          {BUNDLED_MENU_IMAGES.map((p) => (
                            <option key={p} value={p}>{p.replace('/img/menu/', '')}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#86868b] mt-2 leading-relaxed flex items-start gap-1">
                    <AlertTriangle size={11} className="text-[#ff9500] mt-0.5 flex-shrink-0" />
                    For real product photos, host the image (Imgur, Drive public link, your website) and paste the URL — or drop the file into <code className="px-1 py-0.5 rounded bg-[#f5f5f7] border border-[#e5e5ea] text-[10px]">server/public/img/menu/</code> and reference <code className="px-1 py-0.5 rounded bg-[#f5f5f7] border border-[#e5e5ea] text-[10px]">/img/menu/yourfile.jpg</code>.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowAdd(false); setEditItem(null); }}
                  className="flex-1 py-3 border border-[#d2d2d7] rounded-xl text-[#86868b] font-medium hover:bg-[#f5f5f7] transition-colors">Cancel</button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSave}
                  className="flex-1 bg-[#0071e3] text-white py-3 rounded-xl font-medium hover:bg-[#0077ED] transition-colors">
                  {editItem ? 'Save' : 'Add Item'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
