'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, X,
  Monitor, MessageSquare, Cpu, Tv, Globe, Package,
  GripVertical, Save, AlertTriangle
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface SoftwareItem {
  id: string;
  name: string;
  category: 'Browser' | 'Communication' | 'Peripherals' | 'GPU' | 'Streaming' | 'Other';
  exePath: string;
  description: string;
  icon: string;
}

const CATEGORIES = ['Browser', 'Communication', 'Peripherals', 'GPU', 'Streaming', 'Other'] as const;

const categoryIcons: Record<string, React.ReactNode> = {
  Browser: <Globe size={16} />,
  Communication: <MessageSquare size={16} />,
  Peripherals: <Cpu size={16} />,
  GPU: <Monitor size={16} />,
  Streaming: <Tv size={16} />,
  Other: <Package size={16} />,
};

const DEFAULT_SOFTWARE: SoftwareItem[] = [
  { id: 'chrome', name: 'Google Chrome', icon: '/software/chrome.png', category: 'Browser', description: 'Fast web browser', exePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { id: 'edge', name: 'Microsoft Edge', icon: '/software/edge.png', category: 'Browser', description: 'Built-in web browser', exePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { id: 'discord', name: 'Discord', icon: '/software/discord.png', category: 'Communication', description: 'Voice & text chat', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
  { id: 'hyperx', name: 'HyperX NGENUITY', icon: '/software/hyperx.png', category: 'Peripherals', description: 'HyperX device manager', exePath: 'C:\\Program Files\\HyperX\\HyperX NGENUITY\\HyperXNGENUITY.exe' },
  { id: 'geforce', name: 'GeForce Experience', icon: '/software/geforce.png', category: 'GPU', description: 'NVIDIA drivers & overlay', exePath: 'C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe' },
  { id: 'razer', name: 'Razer Synapse', icon: '/software/razer.png', category: 'Peripherals', description: 'Razer mouse & keyboard', exePath: 'C:\\Program Files (x86)\\Razer\\Synapse3\\UserProcess\\Razer Synapse 3.exe' },
  { id: 'streamlabs', name: 'Streamlabs', icon: '/software/streamlabs.png', category: 'Streaming', description: 'Stream to Twitch/YouTube', exePath: 'C:\\Program Files\\Streamlabs OBS\\Streamlabs OBS.exe' },
  { id: 'obs', name: 'OBS Studio', icon: '/software/obs.png', category: 'Streaming', description: 'Open source streaming', exePath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
];

export function SoftwareManagement() {
  const [items, setItems] = useState<SoftwareItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<SoftwareItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('all');

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<SoftwareItem['category']>('Browser');
  const [formExePath, setFormExePath] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('');

  // Listen to Firestore config/software doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'software'), (snap) => {
      if (snap.exists() && snap.data().items?.length > 0) {
        setItems(snap.data().items as SoftwareItem[]);
      } else {
        setItems(DEFAULT_SOFTWARE);
      }
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const saveToFirestore = async (newItems: SoftwareItem[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'software'), { items: newItems });
    } catch (err) {
      console.error('Failed to save software config:', err);
    }
    setSaving(false);
  };

  const resetForm = () => {
    setFormName('');
    setFormCategory('Browser');
    setFormExePath('');
    setFormDescription('');
    setFormIcon('');
  };

  const openEdit = (item: SoftwareItem) => {
    setEditItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormExePath(item.exePath);
    setFormDescription(item.description);
    setFormIcon(item.icon);
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!formName || !formExePath) return;

    const newItem: SoftwareItem = {
      id: editItem ? editItem.id : formName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now(),
      name: formName,
      category: formCategory,
      exePath: formExePath,
      description: formDescription,
      icon: formIcon || `/software/${formName.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`,
    };

    let newItems: SoftwareItem[];
    if (editItem) {
      newItems = items.map(i => i.id === editItem.id ? newItem : i);
    } else {
      newItems = [...items, newItem];
    }

    await saveToFirestore(newItems);
    resetForm();
    setEditItem(null);
    setShowAdd(false);
  };

  const handleDelete = async (id: string) => {
    const newItems = items.filter(i => i.id !== id);
    await saveToFirestore(newItems);
    setDeleteConfirm(null);
  };

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setItems(newItems);
    await saveToFirestore(newItems);
  };

  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Software Management
            <HelpTip title={{ en: 'Software Shortcuts', ar: 'اختصارات البرامج' }}
              ar={<p>البرامج التي تظهر كاختصارات في الكشك (كروم، ديسكورد، OBS...). عدّل الاسم، الأيقونة، ومسار التثبيت.</p>}>
              <p>Apps that show as shortcuts on the kiosk (Chrome, Discord, OBS, etc). Edit name, icon, and install path.</p>
            </HelpTip>
          </h2>
          <p className="text-sm text-[#86868b] mt-1">
            {items.length} apps configured
            {saving && <span className="ml-2 text-[#0071e3] animate-pulse">saving...</span>}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { resetForm(); setEditItem(null); setShowAdd(true); }}
          className="px-6 py-2.5 bg-[#0071e3] text-white font-medium rounded-xl flex items-center gap-2 hover:bg-[#0077ED] transition-colors"
        >
          <Plus size={16} /> Add Software
        </motion.button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilterCat('all')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            filterCat === 'all' ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] hover:bg-white'
          }`}
        >
          <Package size={16} /> All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              filterCat === cat ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] hover:bg-white'
            }`}
          >
            {categoryIcons[cat]} {cat}
          </button>
        ))}
      </div>

      {/* Software List */}
      <div className="space-y-2">
        {filtered.map((sw, i) => {
          const realIndex = items.indexOf(sw);
          return (
            <motion.div
              key={sw.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all flex items-center gap-4"
            >
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveItem(realIndex, 'up')}
                  disabled={realIndex === 0}
                  className="text-[#86868b] hover:text-[#0071e3] disabled:opacity-20 disabled:hover:text-[#86868b] transition-colors"
                >
                  <ChevronUp size={16} />
                </button>
                <GripVertical size={14} className="text-[#d2d2d7] mx-auto" />
                <button
                  onClick={() => moveItem(realIndex, 'down')}
                  disabled={realIndex === items.length - 1}
                  className="text-[#86868b] hover:text-[#0071e3] disabled:opacity-20 disabled:hover:text-[#86868b] transition-colors"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-[#f5f5f7] flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={sw.icon}
                  alt={sw.name}
                  className="w-7 h-7 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-lg font-semibold text-[#0071e3]">${sw.name[0]}</span>`;
                  }}
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm text-[#1d1d1f]">{sw.name}</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f5f5f7] text-[#86868b] text-[10px]">
                    {categoryIcons[sw.category]}
                    {sw.category}
                  </span>
                </div>
                <p className="text-xs text-[#86868b] mt-0.5 truncate">{sw.description}</p>
                <p className="text-[10px] text-[#86868b] mt-0.5 truncate">{sw.exePath}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(sw)}
                  className="p-2 bg-[#f5f5f7] rounded-xl text-[#86868b] hover:bg-[#e5e5ea] hover:text-[#1d1d1f] transition-all"
                >
                  <Pencil size={14} />
                </button>
                {deleteConfirm === sw.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(sw.id)}
                      className="px-3 py-1.5 bg-[#ff3b30] rounded-xl text-white text-xs font-medium hover:bg-[#ff453a] transition-all"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="p-1.5 bg-[#f5f5f7] rounded-xl text-[#86868b] hover:bg-[#e5e5ea] transition-all"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(sw.id)}
                    className="p-2 bg-[#fff5f5] rounded-xl text-[#ff3b30] hover:bg-[#ffe5e5] transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <Monitor size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-xl font-semibold text-[#86868b]">No software configured</p>
          <p className="text-[#86868b] text-sm mt-2">Click &quot;+ Add Software&quot; to add apps visible on the kiosk</p>
        </div>
      )}

      {/* Seed defaults button */}
      {items.length === 0 && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => saveToFirestore(DEFAULT_SOFTWARE)}
          className="mt-4 w-full py-3 border border-[#0071e3]/30 rounded-xl text-[#0071e3] font-medium flex items-center justify-center gap-2 hover:bg-[#0071e3]/5 transition-all"
        >
          <Save size={16} /> Load Default Software
        </motion.button>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAdd && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => { setShowAdd(false); setEditItem(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl p-8 w-[550px] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editItem ? 'Edit Software' : 'Add Software'}
                </h3>
                <button
                  onClick={() => { setShowAdd(false); setEditItem(null); }}
                  className="text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block">Name</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Google Chrome"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    autoFocus
                  />
                </div>

                {/* Category + Icon */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Category</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as SoftwareItem['category'])}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[#86868b] text-sm mb-1 block">Icon Path</label>
                    <input
                      value={formIcon}
                      onChange={(e) => setFormIcon(e.target.value)}
                      placeholder="/software/app.png"
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                    />
                  </div>
                </div>

                {/* Exe Path */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block">Exe Path</label>
                  <input
                    value={formExePath}
                    onChange={(e) => setFormExePath(e.target.value)}
                    placeholder="C:\Program Files\App\app.exe"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                  />
                  <p className="text-[10px] text-[#86868b] mt-1 flex items-center gap-1">
                    <AlertTriangle size={10} /> Full Windows path to the executable
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-[#86868b] text-sm mb-1 block">Description</label>
                  <input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Short description shown on kiosk"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowAdd(false); setEditItem(null); }}
                  className="flex-1 py-2.5 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] font-medium hover:bg-[#f5f5f7] transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  className="flex-1 bg-[#0071e3] text-white py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] transition-colors"
                >
                  <Save size={16} />
                  {editItem ? 'Save Changes' : 'Add Software'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
