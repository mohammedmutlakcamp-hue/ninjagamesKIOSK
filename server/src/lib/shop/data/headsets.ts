import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `hs-${i}`, category: 'headset', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*15)+4, badge,
  specs,
  description: `${brand} ${name} gaming headset. ${specs.driver || ''} ${specs.connection || ''}.`,
  tags: [brand.toLowerCase(), specs.connection || ''].filter(Boolean),
});

export const HEADSETS: Product[] = [
  make(1, 'Audeze', 'Maxwell Wireless', 'MAXWELL', 290, 340, { driver: '90mm planar magnetic', connection: 'Wireless / Bluetooth LE / USB-C', battery: '80h' }, 'best'),
  make(2, 'SteelSeries', 'Arctis Nova Pro Wireless', '61520', 290, 340, { driver: '40mm Neodymium', connection: 'Wireless / 2.4GHz / Bluetooth', features: 'Active noise cancelling' }, 'hot'),
  make(3, 'SteelSeries', 'Arctis Nova Pro (wired)', '61527', 195, 230, { driver: '40mm', connection: 'Wired USB' }),
  make(4, 'SteelSeries', 'Arctis Nova 7 Wireless', '61512', 145, 180, { driver: '40mm', connection: 'Wireless / 2.4GHz / Bluetooth' }, 'best'),
  make(5, 'HyperX', 'Cloud III Wireless', '77Z46AA', 110, 140, { driver: '53mm Angled', connection: 'Wireless / 2.4GHz', battery: '120h' }, 'best'),
  make(6, 'HyperX', 'Cloud III (wired)', '727A8AA', 70, 90, { driver: '53mm Angled', connection: 'Wired 3.5mm / USB-C' }, 'hot'),
  make(7, 'HyperX', 'Cloud Alpha Wireless', '4P5D4AA', 175, 210, { driver: '50mm Dual Chamber', connection: 'Wireless 2.4GHz', battery: '300h' }, 'limited'),
  make(8, 'Logitech', 'G Pro X 2 Lightspeed', '981-001268', 195, 230, { driver: '50mm Pro-G', connection: 'Lightspeed Wireless / Bluetooth' }),
  make(9, 'Logitech', 'G733 Lightspeed', '981-000863', 130, 165, { driver: '40mm Pro-G', connection: 'Lightspeed Wireless', color: 'Black/White/Blue/Lilac' }),
  make(10, 'Razer', 'BlackShark V2 Pro (2023)', 'RZ04-04530', 175, 210, { driver: '50mm TriForce', connection: 'Wireless 2.4GHz / Bluetooth' }, 'best'),
  make(11, 'Razer', 'BlackShark V2 X (wired)', 'RZ04-03240', 50, 70, { driver: '50mm TriForce', connection: 'Wired 3.5mm' }, 'sale'),
  make(12, 'Razer', 'Kraken V3 Pro', 'RZ04-03460', 195, 230, { driver: '50mm TriForce', connection: 'Wireless / HyperSense haptics' }),
  make(13, 'Sony', 'INZONE H9', 'WH-G900N', 245, 290, { driver: '40mm', connection: 'Wireless 2.4GHz / Bluetooth', features: 'ANC' }),
  make(14, 'Sony', 'INZONE H7', 'WH-G700', 165, 200, { driver: '40mm', connection: 'Wireless 2.4GHz / Bluetooth' }),
  make(15, 'Sony', 'PULSE Elite (PS5)', 'PULSE-ELITE-PS5', 145, 175, { driver: 'Planar magnetic', connection: 'PlayStation Link / USB-C / Bluetooth', use: 'PS5/PC' }, 'new'),
  make(16, 'Sony', 'PULSE Explore Wireless Earbuds', 'PULSE-EXPLORE', 195, 230, { driver: 'Planar magnetic', use: 'PS5/PC' }, 'new'),
  make(17, 'Corsair', 'HS80 MAX Wireless', 'CA-9011295-NA', 145, 175, { driver: '50mm Custom', connection: 'Wireless / Bluetooth' }),
  make(18, 'Corsair', 'Virtuoso Pro (open back)', 'CA-9011370-NA', 195, 230, { driver: '50mm Open back', connection: 'Wired 3.5mm/USB' }),
  make(19, 'Beyerdynamic', 'MMX 200 Wireless', '732845', 245, 290, { driver: 'Stellar.45', connection: 'Wireless / 3.5mm' }),
  make(20, 'EPOS', 'H6 Pro Closed', '1000932', 145, 175, { driver: '40mm', connection: 'Wired 3.5mm', design: 'Closed-back' }),
  make(21, 'EPOS', 'GTW 270 Hybrid Earbuds', '1000232', 130, 165, { connection: 'USB-C dongle / Bluetooth', use: 'Mobile/Switch/PC' }),
  make(22, 'Astro', 'A50 X Wireless', 'ASTRO-A50-X', 360, 420, { driver: '40mm', connection: 'PlayWarp wireless', features: 'Multi-platform HDMI base' }, 'limited'),
  // Studio mics + headphone combo (creators)
  make(23, 'Sennheiser', 'HD 660S2', '700240', 320, 380, { driver: 'Dynamic 38mm', connection: 'Wired 3.5mm / 6.3mm', design: 'Open-back', use: 'Audiophile' }),
  // Budget heroes
  make(24, 'Logitech', 'G335 Wired', '981-000977', 50, 65, { driver: '40mm', connection: 'Wired 3.5mm' }, 'sale'),
  make(25, 'HyperX', 'Cloud Stinger 2', '519T1AA', 35, 50, { driver: '50mm', connection: 'Wired 3.5mm' }, 'sale'),
];
