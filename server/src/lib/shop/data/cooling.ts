import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `cool-${i}`, category: 'cooling', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*10)+3, badge,
  specs,
  description: `${brand} ${name} CPU cooler. ${specs.type || ''} ${specs.size || ''}.`,
  tags: [brand.toLowerCase(), specs.type || '', specs.size || ''].filter(Boolean),
});

export const COOLING: Product[] = [
  // AIO 360
  make(1, 'NZXT', 'Kraken Elite 360 RGB (2024)', 'RL-KR36E-W1', 290, 340, { type: 'AIO Liquid', size: '360mm', display: '2.36" LCD', color: 'White' }, 'best'),
  make(2, 'NZXT', 'Kraken 360 (2024)', 'RL-KR360-B1', 215, 260, { type: 'AIO Liquid', size: '360mm', color: 'Black' }, 'hot'),
  make(3, 'Corsair', 'iCUE LINK H170i LCD XT', 'CW-9061008-WW', 380, 440, { type: 'AIO Liquid', size: '420mm', display: '2.1" IPS' }, 'limited'),
  make(4, 'Corsair', 'iCUE LINK H150i LCD XT', 'CW-9061007-WW', 320, 380, { type: 'AIO Liquid', size: '360mm', display: 'IPS' }),
  make(5, 'Corsair', 'iCUE H150i ELITE LCD XT', 'CW-9060075-WW', 245, 290, { type: 'AIO Liquid', size: '360mm' }),
  make(6, 'Lian Li', 'Galahad II Trinity 360 SL-INF', 'GA-IIT36INW', 245, 290, { type: 'AIO Liquid', size: '360mm', color: 'White' }),
  make(7, 'Arctic', 'Liquid Freezer III 360 A-RGB', 'ACFRE00149A', 145, 180, { type: 'AIO Liquid', size: '360mm' }, 'best'),
  make(8, 'be quiet!', 'Silent Loop 2 360mm', 'BW012', 215, 260, { type: 'AIO Liquid', size: '360mm' }),
  make(9, 'DeepCool', 'LT720 360mm', 'R-LT720-BKAMNF-G-1', 145, 180, { type: 'AIO Liquid', size: '360mm', color: 'Black' }, 'hot'),
  // AIO 240/280
  make(10, 'NZXT', 'Kraken 240 (2024)', 'RL-KR240-B1', 175, 215, { type: 'AIO Liquid', size: '240mm' }),
  make(11, 'Corsair', 'iCUE H100i ELITE CAPELLIX XT', 'CW-9060066-WW', 195, 235, { type: 'AIO Liquid', size: '240mm' }),
  make(12, 'Arctic', 'Liquid Freezer III 280 A-RGB', 'ACFRE00148A', 130, 165, { type: 'AIO Liquid', size: '280mm' }, 'sale'),
  // Air coolers (premium)
  make(13, 'Noctua', 'NH-D15 G2', 'NH-D15-G2', 195, 235, { type: 'Air', height: '168mm', fans: 'Dual NF-A14x25 G2' }, 'best'),
  make(14, 'Noctua', 'NH-D15 G2 LBC (Low Base Convexity)', 'NH-D15-G2-LBC', 195, 235, { type: 'Air' }),
  make(15, 'Noctua', 'NH-U12A', 'NH-U12A', 145, 180, { type: 'Air', height: '158mm' }),
  make(16, 'Be Quiet!', 'Dark Rock Pro 5', 'BK036', 130, 165, { type: 'Air', height: '168mm', color: 'Black' }, 'hot'),
  make(17, 'Thermalright', 'Phantom Spirit 120 EVO', 'PS120-EVO', 60, 80, { type: 'Air', height: '157mm' }, 'best'),
  make(18, 'DeepCool', 'AK620 Digital', 'R-AK620-BKADMN-G', 90, 115, { type: 'Air', display: 'Yes' }),
  // Case fans
  make(19, 'Noctua', 'NF-A12x25 PWM (3-pack)', 'NF-A12X25-PWM-3', 135, 165, { type: 'Case Fan', size: '120mm', count: '3' }, 'limited'),
  make(20, 'Lian Li', 'UNI FAN SL-INF 120 (3-pack)', 'UF-SLIN120-3W', 145, 180, { type: 'Case Fan', size: '120mm', rgb: 'Infinity mirror' }),
  // Thermal paste
  make(21, 'Thermal Grizzly', 'Kryonaut Extreme 2g', 'TG-KE-002-RS', 25, 35, { type: 'Thermal Paste', amount: '2g', conductivity: '14.2 W/mK' }),
  make(22, 'Arctic', 'MX-6 8g', 'ACTCP00081A', 18, 25, { type: 'Thermal Paste', amount: '8g' }),
];
