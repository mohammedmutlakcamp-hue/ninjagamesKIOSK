// Per-city delivery estimates. Hash(productId+city) → consistent ETA so the
// same product shows the same time on every reload. Pure UX flavor, no real
// fulfillment logic behind it.

export type CityKey =
  | 'amman' | 'zarqa' | 'irbid' | 'aqaba' | 'salt' | 'madaba'
  | 'mafraq' | 'jerash' | 'ajloun' | 'karak' | 'tafilah' | 'maan';

export const JORDAN_CITIES: { key: CityKey; en: string; ar: string; baseHours: number }[] = [
  { key: 'amman',   en: 'Amman',     ar: 'عمّان',   baseHours: 12 },
  { key: 'zarqa',   en: 'Zarqa',     ar: 'الزرقاء', baseHours: 18 },
  { key: 'salt',    en: 'As-Salt',   ar: 'السلط',   baseHours: 18 },
  { key: 'madaba',  en: 'Madaba',    ar: 'مادبا',   baseHours: 24 },
  { key: 'jerash',  en: 'Jerash',    ar: 'جرش',     baseHours: 24 },
  { key: 'irbid',   en: 'Irbid',     ar: 'إربد',    baseHours: 36 },
  { key: 'ajloun',  en: 'Ajloun',    ar: 'عجلون',   baseHours: 36 },
  { key: 'mafraq',  en: 'Mafraq',    ar: 'المفرق',  baseHours: 48 },
  { key: 'karak',   en: 'Karak',     ar: 'الكرك',   baseHours: 60 },
  { key: 'tafilah', en: 'Tafilah',   ar: 'الطفيلة', baseHours: 60 },
  { key: 'maan',    en: "Ma'an",     ar: 'معان',    baseHours: 72 },
  { key: 'aqaba',   en: 'Aqaba',     ar: 'العقبة',  baseHours: 72 },
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
};

export type DeliveryEstimate = {
  hours: number;
  label: string;       // e.g. "Tomorrow by 6 PM" or "In 48-72h"
  fast: boolean;       // true if < 36h
  free: boolean;       // free shipping flag
};

export const estimateDelivery = (productId: string, cityKey: CityKey | null, inStock: boolean, lang: 'en' | 'ar' = 'en'): DeliveryEstimate => {
  const city = JORDAN_CITIES.find(c => c.key === cityKey) || JORDAN_CITIES[0];
  const bump = (hash(productId) % 12) - 4;            // -4..+7 hour jitter
  const stockPenalty = inStock ? 0 : 96;              // out-of-stock = supplier order
  const totalHours = Math.max(6, city.baseHours + bump + stockPenalty);

  const fast = totalHours <= 36 && inStock;
  const free = totalHours <= 48;

  let label: string;
  if (totalHours <= 12) label = lang === 'ar' ? 'اليوم' : 'Today';
  else if (totalHours <= 24) label = lang === 'ar' ? 'خلال 24 ساعة' : 'Within 24h';
  else if (totalHours <= 48) label = lang === 'ar' ? `خلال ${Math.round(totalHours)} ساعة` : `Within ${Math.round(totalHours)}h`;
  else if (totalHours <= 96) {
    const days = Math.ceil(totalHours / 24);
    label = lang === 'ar' ? `${days} أيام` : `${days} days`;
  } else {
    const days = Math.ceil(totalHours / 24);
    label = lang === 'ar' ? `${days}-${days+2} أيام` : `${days}-${days+2} days`;
  }
  return { hours: totalHours, label, fast, free };
};
