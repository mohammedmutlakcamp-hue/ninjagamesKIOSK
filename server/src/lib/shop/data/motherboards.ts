import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `mb-${i}`, category: 'motherboard', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*8)+2, badge,
  specs,
  description: `${brand} ${name} motherboard. ${specs.chipset || ''} chipset, ${specs.socket || ''} socket. ${specs.formFactor || ''}.`,
  tags: [brand.toLowerCase(), specs.chipset || '', specs.socket || ''].filter(Boolean),
});

export const MOTHERBOARDS: Product[] = [
  // Z890 (Arrow Lake / Ultra 200)
  make(1, 'ASUS', 'ROG Maximus Z890 Hero', 'ROG-MAXIMUS-Z890-HERO', 540, 620, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'ATX', memory: 'DDR5 9200+ OC', wifi: 'WiFi 7' }, 'best'),
  make(2, 'MSI', 'MEG Z890 ACE', 'MEG-Z890-ACE', 580, 660, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'E-ATX', memory: 'DDR5 9466 OC' }),
  make(3, 'Gigabyte', 'AORUS Z890 Master', 'Z890-AORUS-MASTER', 480, 560, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'E-ATX', vrm: '24+1+2 phase' }, 'hot'),
  make(4, 'ASRock', 'Z890 Taichi OCF', 'Z890-TAICHI-OCF', 510, 590, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'ATX' }),
  make(5, 'ASUS', 'TUF Gaming Z890-Plus WiFi', 'TUF-GAMING-Z890-PLUS-WIFI', 320, 380, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'ATX', wifi: 'WiFi 7' }),
  make(6, 'MSI', 'PRO Z890-A WiFi', 'PRO-Z890-A-WIFI', 280, 330, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'ATX' }),
  // X870E / X870 (Ryzen 9000)
  make(7, 'ASUS', 'ROG Crosshair X870E Hero', 'ROG-CROSSHAIR-X870E-HERO', 580, 660, { socket: 'AM5', chipset: 'X870E', formFactor: 'ATX', wifi: 'WiFi 7', usb: 'USB4' }, 'best'),
  make(8, 'MSI', 'MEG X870E GODLIKE', 'MEG-X870E-GODLIKE', 950, 1100, { socket: 'AM5', chipset: 'X870E', formFactor: 'E-ATX' }, 'limited'),
  make(9, 'Gigabyte', 'X870E AORUS Master', 'X870E-AORUS-MASTER', 520, 600, { socket: 'AM5', chipset: 'X870E', formFactor: 'E-ATX' }, 'hot'),
  make(10, 'ASRock', 'X870E Taichi', 'X870E-TAICHI', 490, 570, { socket: 'AM5', chipset: 'X870E', formFactor: 'ATX' }),
  make(11, 'ASUS', 'TUF Gaming X870-Plus WiFi', 'TUF-GAMING-X870-PLUS-WIFI', 320, 380, { socket: 'AM5', chipset: 'X870', formFactor: 'ATX' }),
  make(12, 'MSI', 'X870 Tomahawk WiFi', 'X870-TOMAHAWK-WIFI', 290, 340, { socket: 'AM5', chipset: 'X870', formFactor: 'ATX' }),
  // X670E
  make(13, 'ASUS', 'ROG Crosshair X670E Hero', 'ROG-CROSSHAIR-X670E-HERO', 510, 620, { socket: 'AM5', chipset: 'X670E', formFactor: 'ATX' }, 'sale'),
  make(14, 'Gigabyte', 'X670E AORUS Xtreme', 'X670E-AORUS-XTREME', 760, 870, { socket: 'AM5', chipset: 'X670E', formFactor: 'E-ATX' }),
  // B850
  make(15, 'MSI', 'MAG B850 Tomahawk MAX WiFi', 'MAG-B850-TOMAHAWK-MAX-WIFI', 220, 260, { socket: 'AM5', chipset: 'B850', formFactor: 'ATX', wifi: 'WiFi 7' }, 'best'),
  make(16, 'ASUS', 'TUF Gaming B850-Plus WiFi', 'TUF-GAMING-B850-PLUS-WIFI', 215, 255, { socket: 'AM5', chipset: 'B850', formFactor: 'ATX' }),
  make(17, 'Gigabyte', 'B850 AORUS Elite WiFi7', 'B850-AORUS-ELITE-WIFI7', 235, 275, { socket: 'AM5', chipset: 'B850' }),
  make(18, 'ASRock', 'B850 Steel Legend WiFi', 'B850-STEEL-LEGEND-WIFI', 210, 250, { socket: 'AM5', chipset: 'B850' }),
  // B650
  make(19, 'MSI', 'MAG B650 Tomahawk WiFi', 'MAG-B650-TOMAHAWK-WIFI', 180, 215, { socket: 'AM5', chipset: 'B650', formFactor: 'ATX' }, 'hot'),
  make(20, 'ASUS', 'PRIME B650-PLUS', 'PRIME-B650-PLUS', 145, 175, { socket: 'AM5', chipset: 'B650' }),
  make(21, 'Gigabyte', 'B650 AORUS Elite AX', 'B650-AORUS-ELITE-AX', 175, 210, { socket: 'AM5', chipset: 'B650' }),
  // Intel B760 (LGA1700)
  make(22, 'MSI', 'PRO B760M-A WiFi DDR5', 'PRO-B760M-A-WIFI-DDR5', 145, 180, { socket: 'LGA1700', chipset: 'B760', formFactor: 'mATX' }),
  make(23, 'ASUS', 'TUF Gaming B760-Plus WiFi D4', 'TUF-GAMING-B760-PLUS-WIFI-D4', 165, 200, { socket: 'LGA1700', chipset: 'B760', memory: 'DDR4' }),
  make(24, 'Gigabyte', 'B760 AORUS Elite AX DDR5', 'B760-AORUS-ELITE-AX-DDR5', 175, 215, { socket: 'LGA1700', chipset: 'B760' }),
  // Mini-ITX
  make(25, 'ASUS', 'ROG Strix Z890-I Gaming WiFi', 'ROG-STRIX-Z890-I-GAMING', 460, 530, { socket: 'LGA1851', chipset: 'Z890', formFactor: 'Mini-ITX' }),
  make(26, 'ASRock', 'X870E Nova WiFi ITX', 'X870E-NOVA-WIFI-ITX', 380, 440, { socket: 'AM5', chipset: 'X870E', formFactor: 'Mini-ITX' }),
  make(27, 'MSI', 'MPG B650I Edge WiFi', 'MPG-B650I-EDGE-WIFI', 290, 340, { socket: 'AM5', chipset: 'B650', formFactor: 'Mini-ITX' }),
  // Workstation / TRX
  make(28, 'ASUS', 'Pro WS WRX90E-SAGE SE', 'WRX90E-SAGE-SE', 1900, 2200, { socket: 'sWRX8', chipset: 'WRX90', formFactor: 'EEB' }, 'limited'),
  make(29, 'ASRock', 'WRX90 WS EVO', 'WRX90-WS-EVO', 1700, 1950, { socket: 'sWRX8', chipset: 'WRX90' }),
  // Budget AM4 (still selling for upgrades)
  make(30, 'MSI', 'B550 Tomahawk MAX WiFi', 'B550-TOMAHAWK-MAX-WIFI', 145, 175, { socket: 'AM4', chipset: 'B550', formFactor: 'ATX' }, 'sale'),
];
