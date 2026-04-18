import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `cpu-${i}`, category: 'cpu', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*10)+2, badge,
  specs,
  description: `${brand} ${name} desktop processor. ${specs.cores || ''}, ${specs.boost || ''} boost.`,
  tags: [brand.toLowerCase(), specs.socket || '', specs.cores || ''].filter(Boolean),
});

export const CPUS: Product[] = [
  // Intel Core Ultra Series 2 (Arrow Lake)
  make(1, 'Intel', 'Core Ultra 9 285K', 'BX80768285K', 530, 590, { cores: '24C (8P+16E)', threads: '24', boost: '5.7 GHz', socket: 'LGA1851', cache: '36MB', tdp: '125W', graphics: 'Arc Xe' }, 'new'),
  make(2, 'Intel', 'Core Ultra 7 265K', 'BX80768265K', 380, 430, { cores: '20C (8P+12E)', boost: '5.5 GHz', socket: 'LGA1851', cache: '30MB', tdp: '125W' }, 'hot'),
  make(3, 'Intel', 'Core Ultra 7 265KF', 'BX80768265KF', 360, 410, { cores: '20C (8P+12E)', boost: '5.5 GHz', socket: 'LGA1851', graphics: 'None' }),
  make(4, 'Intel', 'Core Ultra 5 245K', 'BX80768245K', 280, 320, { cores: '14C (6P+8E)', boost: '5.2 GHz', socket: 'LGA1851', cache: '24MB' }),
  make(5, 'Intel', 'Core Ultra 5 235', 'BX80768235', 220, 250, { cores: '14C (6P+8E)', boost: '5.0 GHz', socket: 'LGA1851' }),
  // Intel 14th Gen
  make(6, 'Intel', 'Core i9-14900K', 'BX8071514900K', 420, 510, { cores: '24C (8P+16E)', boost: '6.0 GHz', socket: 'LGA1700', cache: '36MB' }, 'sale'),
  make(7, 'Intel', 'Core i7-14700K', 'BX8071514700K', 320, 380, { cores: '20C (8P+12E)', boost: '5.6 GHz', socket: 'LGA1700' }, 'sale'),
  make(8, 'Intel', 'Core i5-14600K', 'BX8071514600K', 220, 270, { cores: '14C (6P+8E)', boost: '5.3 GHz', socket: 'LGA1700' }),
  make(9, 'Intel', 'Core i5-14400F', 'BX8071514400F', 150, 180, { cores: '10C (6P+4E)', boost: '4.7 GHz', socket: 'LGA1700' }),
  make(10, 'Intel', 'Core i3-14100F', 'BX8071514100F', 95, 115, { cores: '4C/8T', boost: '4.7 GHz', socket: 'LGA1700' }),
  // AMD Ryzen 9000 (Granite Ridge)
  make(11, 'AMD', 'Ryzen 9 9950X3D', '100-100001310WOF', 590, 650, { cores: '16C/32T', boost: '5.7 GHz', socket: 'AM5', cache: '144MB L3 (3D V-Cache)', tdp: '170W' }, 'best'),
  make(12, 'AMD', 'Ryzen 9 9950X', '100-100001277WOF', 480, 540, { cores: '16C/32T', boost: '5.7 GHz', socket: 'AM5', cache: '64MB' }),
  make(13, 'AMD', 'Ryzen 9 9900X', '100-100001271WOF', 380, 440, { cores: '12C/24T', boost: '5.6 GHz', socket: 'AM5' }, 'hot'),
  make(14, 'AMD', 'Ryzen 7 9800X3D', '100-100001084WOF', 420, 480, { cores: '8C/16T', boost: '5.2 GHz', socket: 'AM5', cache: '104MB L3 (3D V-Cache)' }, 'best'),
  make(15, 'AMD', 'Ryzen 7 9700X', '100-100001404WOF', 290, 340, { cores: '8C/16T', boost: '5.5 GHz', socket: 'AM5', tdp: '65W' }),
  make(16, 'AMD', 'Ryzen 5 9600X', '100-100001405WOF', 200, 240, { cores: '6C/12T', boost: '5.4 GHz', socket: 'AM5' }),
  // AMD Ryzen 7000
  make(17, 'AMD', 'Ryzen 9 7950X3D', '100-100000908WOF', 410, 510, { cores: '16C/32T', boost: '5.7 GHz', socket: 'AM5', cache: '128MB L3' }, 'sale'),
  make(18, 'AMD', 'Ryzen 9 7900X3D', '100-100000909WOF', 320, 410, { cores: '12C/24T', boost: '5.6 GHz', socket: 'AM5' }),
  make(19, 'AMD', 'Ryzen 7 7800X3D', '100-100000910WOF', 310, 380, { cores: '8C/16T', boost: '5.0 GHz', socket: 'AM5' }, 'hot'),
  make(20, 'AMD', 'Ryzen 7 7700X', '100-100000591WOF', 230, 290, { cores: '8C/16T', boost: '5.4 GHz', socket: 'AM5' }),
  make(21, 'AMD', 'Ryzen 5 7600X', '100-100000593WOF', 170, 220, { cores: '6C/12T', boost: '5.3 GHz', socket: 'AM5' }),
  make(22, 'AMD', 'Ryzen 5 7600', '100-100001015BOX', 140, 180, { cores: '6C/12T', boost: '5.1 GHz', socket: 'AM5' }),
  // AMD Ryzen 5000 (still selling for AM4 builds)
  make(23, 'AMD', 'Ryzen 7 5800X3D', '100-100000651WOF', 230, 310, { cores: '8C/16T', boost: '4.5 GHz', socket: 'AM4', cache: '96MB L3' }, 'sale'),
  make(24, 'AMD', 'Ryzen 7 5700X', '100-100000926WOF', 145, 190, { cores: '8C/16T', boost: '4.6 GHz', socket: 'AM4' }),
  make(25, 'AMD', 'Ryzen 5 5600', '100-100000927BOX', 95, 125, { cores: '6C/12T', boost: '4.4 GHz', socket: 'AM4' }),
  // Threadripper / HEDT
  make(26, 'AMD', 'Ryzen Threadripper 7980X', '100-100001350WOF', 3800, 4200, { cores: '64C/128T', boost: '5.1 GHz', socket: 'sTR5', cache: '320MB' }, 'limited'),
  make(27, 'AMD', 'Ryzen Threadripper 7970X', '100-100001351WOF', 2400, 2700, { cores: '32C/64T', boost: '5.3 GHz', socket: 'sTR5' }),
  make(28, 'AMD', 'Ryzen Threadripper PRO 7965WX', '100-100000885WOF', 2200, 2500, { cores: '24C/48T', socket: 'sWRX8' }),
  // Intel HEDT
  make(29, 'Intel', 'Xeon w7-3465X', 'BX807133465X', 2600, 2900, { cores: '28C/56T', boost: '4.8 GHz', socket: 'LGA4677' }),
  make(30, 'Intel', 'Xeon w5-2455X', 'BX807132455X', 1100, 1300, { cores: '12C/24T', boost: '4.6 GHz' }),
];
