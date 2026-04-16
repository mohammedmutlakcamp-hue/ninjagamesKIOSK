'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, ExternalLink, Search } from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { launchOnPc } from '@/lib/launch';

interface Software {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  exePath: string;
}

const SOFTWARE_LIST: Software[] = [
  { id: 'chrome', name: 'Google Chrome', icon: '/software/chrome.png', category: 'Browser', description: 'Fast web browser', exePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { id: 'edge', name: 'Microsoft Edge', icon: '/software/edge.png', category: 'Browser', description: 'Built-in web browser', exePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { id: 'discord', name: 'Discord', icon: '/software/discord.png', category: 'Communication', description: 'Voice & text chat', exePath: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
  { id: 'hyperx', name: 'HyperX NGENUITY', icon: '/software/hyperx.png', category: 'Peripherals', description: 'HyperX device manager', exePath: 'C:\\Program Files\\HyperX\\HyperX NGENUITY\\HyperXNGENUITY.exe' },
  { id: 'geforce', name: 'GeForce Experience', icon: '/software/geforce.png', category: 'GPU', description: 'NVIDIA drivers & overlay', exePath: 'C:\\Program Files\\NVIDIA Corporation\\NVIDIA GeForce Experience\\NVIDIA GeForce Experience.exe' },
  { id: 'razer', name: 'Razer Synapse', icon: '/software/razer.png', category: 'Peripherals', description: 'Razer mouse & keyboard', exePath: 'C:\\Program Files (x86)\\Razer\\Synapse3\\UserProcess\\Razer Synapse 3.exe' },
  { id: 'streamlabs', name: 'Streamlabs', icon: '/software/streamlabs.png', category: 'Streaming', description: 'Stream to Twitch/YouTube', exePath: 'C:\\Program Files\\Streamlabs OBS\\Streamlabs OBS.exe' },
  { id: 'obs', name: 'OBS Studio', icon: '/software/obs.png', category: 'Streaming', description: 'Open source streaming', exePath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
];

const CATEGORIES = ['All', ...Array.from(new Set(SOFTWARE_LIST.map(s => s.category)))];

export function SoftwareTab() {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [softwareList, setSoftwareList] = useState<Software[]>(SOFTWARE_LIST);

  // Listen for admin software config from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'software'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          setSoftwareList(data.items);
        }
      }
    });
    return () => unsub();
  }, []);

  const categories = ['All', ...Array.from(new Set(softwareList.map(s => s.category)))];

  const filtered = softwareList.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || s.category === category;
    return matchSearch && matchCat;
  });

  const launchSoftware = (sw: Software) => {
    launchOnPc(sw.id, sw.exePath);
    // Bring kiosk back after a short delay so user can still use sidebar
    setTimeout(() => {
      const api = (window as any).electronAPI;
      if (api?.returnToKiosk) api.returnToKiosk();
    }, 2000);
  };

  return (
    <div className="py-6 pr-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-ninja text-3xl text-white tracking-wider">{ar ? 'البرامج' : 'SOFTWARE'}</h1>
          <p className="font-body text-gray-500 text-sm mt-1">{ar ? 'التطبيقات والأدوات المثبتة على هذا الجهاز' : 'Apps & utilities installed on this PC'}</p>
        </div>
        <NinjaInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ar ? 'ابحث عن برنامج...' : 'Search software...'}
          icon={<Search size={16} />}
          className="w-64"
        />
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`ninja-btn ninja-btn-sm ${
              category === cat
                ? 'ninja-btn-green'
                : 'ninja-btn-ghost'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Software Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((sw, i) => (
          <motion.div
            key={sw.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-5 border border-white/5 hover:border-ninja-green/20 transition-all group cursor-pointer"
            onClick={() => launchSoftware(sw)}
          >
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-ninja-green/10 transition-all overflow-hidden p-2">
              <img
                src={sw.icon}
                alt={sw.name}
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-2xl font-ninja text-ninja-green">${sw.name[0]}</span>`;
                }}
              />
            </div>
            <h3 className="font-ninja text-white text-sm mb-1">{sw.name}</h3>
            <p className="font-body text-gray-500 text-xs mb-3">{sw.description}</p>
            <span className="inline-block px-2 py-0.5 rounded bg-white/5 text-gray-500 font-body text-[10px]">{sw.category}</span>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="ninja-btn ninja-btn-green ninja-btn-full mt-3 flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={12} /> {ar ? 'فتح' : 'OPEN'}
            </motion.div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Download size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="font-ninja text-lg text-gray-600">{ar ? 'لا توجد برامج' : 'NO SOFTWARE FOUND'}</p>
        </div>
      )}
    </div>
  );
}
