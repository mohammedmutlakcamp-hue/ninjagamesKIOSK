import type { CategoryMeta } from './types';

export const CATEGORIES: CategoryMeta[] = [
  { slug: 'gpu',         label: 'Graphics Cards',  labelAr: 'كروت الشاشة',     icon: '🎮', blurb: 'NVIDIA RTX 50 / AMD RX 9000 / Intel Arc Battlemage', color: '#76b900' },
  { slug: 'cpu',         label: 'Processors',      labelAr: 'المعالجات',       icon: '⚡',  blurb: 'Intel Core Ultra 200 · AMD Ryzen 9000', color: '#0071c5' },
  { slug: 'motherboard', label: 'Motherboards',    labelAr: 'اللوحات الأم',    icon: '🧬', blurb: 'Z890 · X870E · B850 · B650', color: '#e91e63' },
  { slug: 'ram',         label: 'Memory (RAM)',    labelAr: 'الذاكرة',         icon: '💎', blurb: 'DDR5 6000-8000 MHz · CL30 / CL36', color: '#9c27b0' },
  { slug: 'storage',     label: 'SSD & Storage',   labelAr: 'التخزين',         icon: '💾', blurb: 'PCIe Gen5 NVMe · 2TB-8TB · External', color: '#3f51b5' },
  { slug: 'psu',         label: 'Power Supplies',  labelAr: 'مصادر الطاقة',    icon: '🔌', blurb: '750W · 1000W · 1200W · 80+ Gold/Platinum', color: '#ff5722' },
  { slug: 'case',        label: 'PC Cases',        labelAr: 'كيسات الحاسوب',   icon: '📦', blurb: 'NZXT · Lian Li · Fractal · Corsair', color: '#607d8b' },
  { slug: 'cooling',     label: 'Cooling',         labelAr: 'التبريد',         icon: '❄️',  blurb: 'AIO 240/360 · Air · Thermal paste', color: '#00bcd4' },
  { slug: 'monitor',     label: 'Monitors',        labelAr: 'الشاشات',         icon: '🖥️', blurb: '240Hz · OLED · 4K · UltraWide', color: '#673ab7' },
  { slug: 'keyboard',    label: 'Keyboards',       labelAr: 'لوحات المفاتيح',  icon: '⌨️',  blurb: 'Mechanical · Hall Effect · Wireless', color: '#ff9800' },
  { slug: 'mouse',       label: 'Mice',            labelAr: 'الفأرات',         icon: '🖱️', blurb: 'Logitech · Razer · SteelSeries', color: '#f44336' },
  { slug: 'headset',     label: 'Headsets',        labelAr: 'سماعات الرأس',    icon: '🎧', blurb: 'HyperX · SteelSeries · Razer · Sony', color: '#4caf50' },
  { slug: 'controller',  label: 'Controllers',     labelAr: 'أيدي التحكم',     icon: '🎮', blurb: 'PS5 · Xbox · 8BitDo · Scuf · Race wheels', color: '#2196f3' },
  { slug: 'prebuilt',    label: 'Pre-Built PCs',   labelAr: 'أجهزة جاهزة',     icon: '🥷', blurb: 'Ninja Games custom builds — Genin to Kage tier', color: '#39FF14' },
  { slug: 'laptop',      label: 'Gaming Laptops',  labelAr: 'لابتوبات',        icon: '💻', blurb: 'Lenovo Legion · ASUS ROG · MSI · Razer · Alienware', color: '#795548' },
  { slug: 'audio',       label: 'Speakers & Audio',labelAr: 'السماعات',        icon: '🔊', blurb: 'Logitech G · Razer · Edifier · JBL', color: '#ff4081' },
];

export const getCategory = (slug: string) => CATEGORIES.find(c => c.slug === slug);
