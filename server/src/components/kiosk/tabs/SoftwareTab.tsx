'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Download, ExternalLink, Search, Bluetooth, Monitor, Volume2, Wifi,
  Keyboard, Mouse, Settings as SettingsIcon, Gamepad2, Printer, Sun,
} from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { launchOnPc } from '@/lib/launch';
import { t, translations } from '@/lib/translations';

const CATEGORY_KEYS: Record<string, string> = {
  All: 'cat_all',
  Browser: 'cat_browser',
  Communication: 'cat_communication',
  Peripherals: 'cat_peripherals',
  GPU: 'cat_gpu',
  Streaming: 'cat_streaming',
  Other: 'cat_other',
};

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

// ── System Settings cards ───────────────────────────────────────────
// Each card opens a Windows Settings page via its ms-settings: deep
// link. Works without explorer.exe / taskbar — equivalent to Win+I but
// scoped to the right page (Bluetooth pairing for PS controllers, etc).
//
// Why we ship this in the kiosk: the kiosk replaces the Windows shell,
// so there is no Start menu / taskbar for players to open Settings
// from. The cards make it discoverable.
const SYSTEM_SETTINGS = [
  { id: 'bluetooth',  uri: 'ms-settings:bluetooth',     iconKey: 'bluetooth',  nameEn: 'Bluetooth',           nameAr: 'البلوتوث',            descEn: 'Pair PS / Xbox controller, headphones', descAr: 'اقران ذراع التحكم أو سماعات' },
  { id: 'devices',    uri: 'ms-settings:connecteddevices', iconKey: 'gamepad', nameEn: 'Devices',             nameAr: 'الأجهزة',             descEn: 'All connected devices',                  descAr: 'جميع الأجهزة المتصلة' },
  { id: 'sound',      uri: 'ms-settings:sound',         iconKey: 'volume',     nameEn: 'Sound',               nameAr: 'الصوت',               descEn: 'Speakers, mic, default device',          descAr: 'السماعات، الميكروفون، الجهاز الافتراضي' },
  { id: 'display',    uri: 'ms-settings:display',       iconKey: 'monitor',    nameEn: 'Display',             nameAr: 'الشاشة',              descEn: 'Resolution, scaling, refresh rate',      descAr: 'الدقة، الحجم، معدل التحديث' },
  { id: 'wifi',       uri: 'ms-settings:network-wifi',  iconKey: 'wifi',       nameEn: 'Wi-Fi',               nameAr: 'الواي فاي',           descEn: 'Connect to a network',                   descAr: 'الاتصال بشبكة' },
  { id: 'mouse',      uri: 'ms-settings:mousetouchpad', iconKey: 'mouse',      nameEn: 'Mouse',               nameAr: 'الفأرة',              descEn: 'Sensitivity, buttons, pointer',          descAr: 'الحساسية، الأزرار، المؤشر' },
  { id: 'keyboard',   uri: 'ms-settings:keyboard',      iconKey: 'keyboard',   nameEn: 'Keyboard',            nameAr: 'لوحة المفاتيح',       descEn: 'Layout, shortcuts, language',            descAr: 'التخطيط، الاختصارات، اللغة' },
  { id: 'brightness', uri: 'ms-settings:display',       iconKey: 'sun',        nameEn: 'Brightness',          nameAr: 'السطوع',              descEn: 'Adjust screen brightness',               descAr: 'ضبط سطوع الشاشة' },
  { id: 'all',        uri: 'ms-settings:',              iconKey: 'settings',   nameEn: 'All Settings',        nameAr: 'كل الإعدادات',        descEn: 'Open Windows Settings (Win+I)',          descAr: 'فتح إعدادات ويندوز' },
];

// Lucide icon map — keyed off the iconKey above so the JSX stays simple
const SETTING_ICON: Record<string, React.ComponentType<any>> = {
  bluetooth: Bluetooth, gamepad: Gamepad2, volume: Volume2, monitor: Monitor,
  wifi: Wifi, mouse: Mouse, keyboard: Keyboard, sun: Sun, settings: SettingsIcon,
};

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
            {CATEGORY_KEYS[cat] ? t(lang, CATEGORY_KEYS[cat]) : cat}
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
            <p className="font-body text-gray-500 text-xs mb-3">
              {ar && translations.ar[`desc_${sw.id}`] ? translations.ar[`desc_${sw.id}`] : sw.description}
            </p>
            <span className="inline-block px-2 py-0.5 rounded bg-white/5 text-gray-500 font-body text-[10px]">
              {CATEGORY_KEYS[sw.category] ? t(lang, CATEGORY_KEYS[sw.category]) : sw.category}
            </span>
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

      {/* ═══════════ SYSTEM SETTINGS ═══════════
          Below the software grid so it doesn't compete with launchers.
          Each card opens a Windows Settings page (Bluetooth, Display,
          Sound...) via electronAPI.openUri('ms-settings:*'). Equivalent
          to Win+I but discoverable — there's no taskbar in kiosk mode. */}
      <div className="mt-10 pt-6 border-t border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <SettingsIcon size={20} className="text-cyan-400" />
          <h2 className="font-ninja text-2xl text-white tracking-wider">
            {ar ? 'إعدادات النظام' : 'SYSTEM SETTINGS'}
          </h2>
        </div>
        <p className="font-body text-gray-500 text-sm mb-4">
          {ar
            ? 'افتح إعدادات ويندوز مباشرة — مثل اقتران ذراع PlayStation أو ضبط الصوت. (يعادل Win+I)'
            : 'Open Windows settings directly — pair PS controllers, adjust sound, etc. (Same as Win+I)'}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {SYSTEM_SETTINGS.map((s, i) => {
            const Icon = SETTING_ICON[s.iconKey] || SettingsIcon;
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const api = (window as any).electronAPI;
                  if (api?.openUri) api.openUri(s.uri);
                  // Bring kiosk back so the player still sees the right panel
                  setTimeout(() => api?.returnToKiosk?.(), 1500);
                }}
                className="glass rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/10 text-left transition-all flex flex-col gap-2 group"
              >
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-all">
                  <Icon size={20} className="text-cyan-300" />
                </div>
                <h3 className="font-ninja text-white text-sm">
                  {ar ? s.nameAr : s.nameEn}
                </h3>
                <p className="font-body text-gray-500 text-[11px] leading-snug">
                  {ar ? s.descAr : s.descEn}
                </p>
              </motion.button>
            );
          })}
        </div>

        {/* Friendly hint about Win+I */}
        <div className="mt-4 px-4 py-2.5 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/15 flex items-center gap-2">
          <Keyboard size={14} className="text-cyan-400/80 flex-shrink-0" />
          <p className="font-body text-gray-400 text-xs leading-snug">
            {ar
              ? 'نصيحة: يمكنك أيضاً الضغط على'
              : 'Tip: you can also press'}
            <kbd className="mx-1.5 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-cyan-300 font-mono text-[10px]">Win + I</kbd>
            {ar
              ? 'في أي وقت لفتح إعدادات ويندوز.'
              : 'anytime to open Windows Settings.'}
          </p>
        </div>
      </div>
    </div>
  );
}
