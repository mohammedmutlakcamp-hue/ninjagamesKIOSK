import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `mouse-${i}`, category: 'mouse', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*20)+5, badge,
  specs,
  description: `${brand} ${name} mouse. ${specs.sensor || ''} ${specs.weight || ''} ${specs.connection || ''}.`,
  tags: [brand.toLowerCase(), specs.connection || '', specs.use || ''].filter(Boolean),
});

export const MICE: Product[] = [
  // Wireless flagships
  make(1, 'Logitech', 'G Pro X Superlight 2 DEX', '910-007268', 165, 200, { sensor: 'HERO 2 32K DPI', weight: '60g', connection: 'Lightspeed Wireless', use: 'Esports' }, 'best'),
  make(2, 'Logitech', 'G Pro X Superlight 2', '910-006631', 145, 175, { sensor: 'HERO 2 32K DPI', weight: '60g', connection: 'Wireless' }, 'hot'),
  make(3, 'Razer', 'Viper V3 Pro', 'RZ01-05120', 145, 175, { sensor: 'Focus Pro 35K Gen-2', weight: '54g', connection: 'HyperSpeed Wireless' }, 'best'),
  make(4, 'Razer', 'DeathAdder V3 Pro', 'RZ01-04630', 145, 175, { sensor: 'Focus Pro 30K', weight: '63g', connection: 'Wireless' }, 'hot'),
  make(5, 'Logitech', 'MX Master 3S', '910-006557', 95, 120, { sensor: 'Darkfield 8000 DPI', weight: '141g', connection: 'Bolt / Bluetooth', use: 'Productivity' }, 'best'),
  make(6, 'Glorious', 'Model O 2 Wireless Pro', 'GLO-MS-OW2-PRO-B', 130, 160, { sensor: 'BAMF 2.0 26K', weight: '60g', connection: 'Wireless' }),
  make(7, 'Pulsar', 'X2H Wireless', 'PX2H-W', 110, 140, { sensor: 'PAW3395', weight: '58g', connection: 'Wireless' }),
  make(8, 'Endgame Gear', 'OP1 8k', 'OP1-8K', 95, 120, { sensor: 'PixArt 3395', weight: '50g', polling: '8000Hz', connection: 'Wired' }, 'limited'),
  // Wired competitive
  make(9, 'Razer', 'Viper 8KHz', 'RZ01-03580', 75, 95, { sensor: 'Focus+ 20K DPI', weight: '71g', polling: '8000Hz' }),
  make(10, 'Logitech', 'G502 X Plus Lightspeed', '910-006163', 110, 140, { sensor: 'HERO 25K', weight: '106g', connection: 'Wireless', rgb: 'Lightsync' }, 'sale'),
  make(11, 'Logitech', 'G502 HERO', '910-005550', 50, 70, { sensor: 'HERO 25K', weight: '121g', connection: 'Wired' }),
  make(12, 'SteelSeries', 'Aerox 5 Wireless', '62406', 110, 140, { sensor: 'TrueMove Air', weight: '74g', connection: 'Wireless' }),
  make(13, 'SteelSeries', 'Prime Mini Wireless', '62426', 90, 115, { sensor: 'TrueMove Air', weight: '61g', connection: 'Wireless' }),
  make(14, 'Corsair', 'M65 RGB Ultra Wireless', 'CH-9319411-NA', 95, 120, { sensor: 'Marksman 26K', weight: '102g', connection: 'Wireless' }),
  make(15, 'Corsair', 'Sabre RGB Pro Wireless', 'CH-9313211-NA', 90, 115, { sensor: 'Marksman 26K', weight: '79g' }),
  // Vertical / ergonomic
  make(16, 'Logitech', 'Lift Vertical', '910-006470', 65, 85, { use: 'Ergonomic vertical', connection: 'Bolt / Bluetooth' }, 'hot'),
  make(17, 'Logitech', 'MX Vertical', '910-005447', 95, 120, { use: 'Ergonomic vertical' }),
  // Mainstream wireless
  make(18, 'Logitech', 'M720 Triathlon', '910-004791', 45, 60, { connection: 'Wireless / Bluetooth' }),
  make(19, 'Apple', 'Magic Mouse', 'MK2E3AM/A', 90, 115, { connection: 'Bluetooth', surface: 'Multi-touch' }),
  // Budget gaming
  make(20, 'Razer', 'DeathAdder Essential', 'RZ01-03850', 25, 40, { sensor: '6400 DPI', weight: '96g' }),
  make(21, 'HyperX', 'Pulsefire Haste 2', '6N0A7AA', 45, 60, { sensor: 'HX-S1 26K', weight: '53g' }, 'sale'),
  make(22, 'Cooler Master', 'MM712 Hybrid', 'MM-712-KKOH1', 55, 75, { weight: '59g', connection: 'Wireless / 2.4GHz / Bluetooth' }),
];
