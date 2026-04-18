import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `storage-${i}`, category: 'storage', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*15)+3, badge,
  specs,
  description: `${brand} ${name} storage. ${specs.capacity || ''} ${specs.type || ''} ${specs.read || ''}.`,
  tags: [brand.toLowerCase(), specs.type || '', specs.capacity || ''].filter(Boolean),
});

export const STORAGE: Product[] = [
  // PCIe Gen5 NVMe
  make(1, 'Crucial', 'T705 PCIe Gen5 NVMe SSD 2TB', 'CT2000T705SSD3', 245, 290, { capacity: '2TB', type: 'M.2 NVMe Gen5', read: '14,500 MB/s', write: '12,700 MB/s' }, 'best'),
  make(2, 'Crucial', 'T705 PCIe Gen5 NVMe SSD 4TB', 'CT4000T705SSD3', 480, 560, { capacity: '4TB', type: 'M.2 NVMe Gen5', read: '14,100 MB/s' }, 'hot'),
  make(3, 'Samsung', '9100 PRO PCIe Gen5 NVMe SSD 2TB', 'MZ-VAP2T0BW', 230, 280, { capacity: '2TB', type: 'M.2 NVMe Gen5', read: '14,800 MB/s' }, 'new'),
  make(4, 'Samsung', '9100 PRO 4TB', 'MZ-VAP4T0BW', 470, 550, { capacity: '4TB', type: 'M.2 NVMe Gen5' }, 'new'),
  make(5, 'WD', 'Black SN8100 NVMe Gen5 2TB', 'WDS200T1XHE', 220, 270, { capacity: '2TB', type: 'M.2 NVMe Gen5', read: '14,500 MB/s' }, 'new'),
  make(6, 'Seagate', 'FireCuda 540 4TB', 'ZP4000GM3A024', 410, 480, { capacity: '4TB', type: 'M.2 NVMe Gen5' }),
  // PCIe Gen4 NVMe (most popular)
  make(7, 'Samsung', '990 PRO 2TB', 'MZ-V9P2T0BW', 145, 180, { capacity: '2TB', type: 'M.2 NVMe Gen4', read: '7,450 MB/s' }, 'best'),
  make(8, 'Samsung', '990 PRO 4TB', 'MZ-V9P4T0BW', 290, 350, { capacity: '4TB', type: 'M.2 NVMe Gen4' }),
  make(9, 'Samsung', '990 PRO Heatsink 2TB', 'MZ-V9P2T0CW', 165, 200, { capacity: '2TB', type: 'M.2 NVMe Gen4', heatsink: 'Yes (PS5 ready)' }, 'hot'),
  make(10, 'WD', 'Black SN850X 2TB w/ Heatsink', 'WDS200T2XHE', 140, 175, { capacity: '2TB', type: 'M.2 NVMe Gen4', heatsink: 'Yes' }),
  make(11, 'WD', 'Black SN850X 4TB', 'WDS400T2X0E', 280, 340, { capacity: '4TB', type: 'M.2 NVMe Gen4' }),
  make(12, 'Crucial', 'T500 2TB w/ Heatsink', 'CT2000T500SSD5', 120, 155, { capacity: '2TB', type: 'M.2 NVMe Gen4' }),
  make(13, 'Kingston', 'KC3000 2TB', 'SKC3000D/2048G', 130, 165, { capacity: '2TB', type: 'M.2 NVMe Gen4', read: '7,000 MB/s' }),
  make(14, 'Sabrent', 'Rocket 4 Plus 2TB', 'SB-RKT4P-2TB', 125, 160, { capacity: '2TB', type: 'M.2 NVMe Gen4' }),
  make(15, 'Lexar', 'NM790 4TB', 'LNM790X004T-RNNNG', 235, 285, { capacity: '4TB', type: 'M.2 NVMe Gen4' }, 'sale'),
  // 1TB NVMe (volume sellers)
  make(16, 'Samsung', '990 EVO Plus 1TB', 'MZ-V9E1T0BW', 75, 95, { capacity: '1TB', type: 'M.2 NVMe Gen4' }),
  make(17, 'WD', 'Black SN770 1TB', 'WDS100T3X0E', 65, 85, { capacity: '1TB', type: 'M.2 NVMe Gen4' }),
  make(18, 'Crucial', 'P3 Plus 1TB', 'CT1000P3PSSD8', 55, 75, { capacity: '1TB', type: 'M.2 NVMe Gen4' }),
  // SATA SSDs
  make(19, 'Samsung', '870 EVO 1TB', 'MZ-77E1T0B/AM', 70, 90, { capacity: '1TB', type: '2.5" SATA SSD' }),
  make(20, 'Samsung', '870 EVO 2TB', 'MZ-77E2T0B/AM', 130, 160, { capacity: '2TB', type: '2.5" SATA SSD' }),
  make(21, 'Crucial', 'MX500 1TB', 'CT1000MX500SSD1', 60, 80, { capacity: '1TB', type: '2.5" SATA SSD' }, 'sale'),
  // HDDs
  make(22, 'Seagate', 'Barracuda 4TB', 'ST4000DM004', 85, 110, { capacity: '4TB', type: '3.5" HDD 5400 RPM' }),
  make(23, 'WD', 'Blue 8TB', 'WD80EAAZ', 175, 215, { capacity: '8TB', type: '3.5" HDD 5640 RPM' }),
  make(24, 'WD', 'Black 4TB', 'WD4005FZBX', 145, 180, { capacity: '4TB', type: '3.5" HDD 7200 RPM' }, 'hot'),
  make(25, 'Seagate', 'IronWolf Pro 12TB', 'ST12000NT001', 280, 340, { capacity: '12TB', type: 'NAS HDD 7200 RPM' }),
  make(26, 'WD', 'Red Pro NAS 16TB', 'WD161KFGX', 380, 460, { capacity: '16TB', type: 'NAS HDD' }, 'limited'),
  // External
  make(27, 'Samsung', 'T9 Portable SSD 2TB', 'MU-PG2T0B/AM', 145, 180, { capacity: '2TB', type: 'External SSD USB 3.2 Gen 2x2', read: '2,000 MB/s' }, 'best'),
  make(28, 'WD', 'My Passport 4TB', 'WDBPKJ0040BBK', 95, 125, { capacity: '4TB', type: 'External HDD USB 3.0' }),
  make(29, 'Sandisk', 'Extreme Pro Portable SSD 2TB', 'SDSSDE81-2T00-G25', 165, 200, { capacity: '2TB', type: 'External SSD USB 3.2 Gen 2x2' }),
  make(30, 'Seagate', 'Game Drive Hub for Xbox 8TB', 'STKW8000400', 145, 180, { capacity: '8TB', type: 'External HDD', use: 'Xbox' }),
];
