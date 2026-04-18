import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `lap-${i}`, category: 'laptop', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*5)+1, badge,
  specs,
  description: `${brand} ${name} gaming laptop. ${specs.cpu || ''} + ${specs.gpu || ''}, ${specs.display || ''}.`,
  tags: [brand.toLowerCase(), specs.cpu || '', specs.gpu || ''].filter(Boolean),
});

export const LAPTOPS: Product[] = [
  // Razer
  make(1, 'Razer', 'Blade 18 (2024) RTX 4090', 'RZ09-0484', 3500, 4200, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4090 16GB', ram: '32GB DDR5', storage: '2TB NVMe', display: '18" QHD+ 240Hz' }, 'best'),
  make(2, 'Razer', 'Blade 16 (2024) OLED', 'RZ09-0483', 2700, 3200, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4080', ram: '32GB DDR5', display: '16" QHD+ 240Hz OLED' }, 'hot'),
  make(3, 'Razer', 'Blade 14 (2024)', 'RZ09-0482', 2150, 2550, { cpu: 'Ryzen 9 8945HS', gpu: 'RTX 4070', ram: '32GB DDR5', display: '14" QHD+ 240Hz' }),
  // ASUS ROG
  make(4, 'ASUS', 'ROG Strix SCAR 18 RTX 4090', 'G834JZR-N6109', 3200, 3800, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4090', ram: '32GB DDR5', display: '18" QHD+ 240Hz Mini-LED' }, 'best'),
  make(5, 'ASUS', 'ROG Zephyrus G16 OLED', 'GA605WV', 2400, 2850, { cpu: 'Ryzen AI 9 HX 370', gpu: 'RTX 4070', ram: '32GB LPDDR5X', display: '16" 2.5K 240Hz OLED' }, 'hot'),
  make(6, 'ASUS', 'ROG Zephyrus G14 OLED', 'GA403UV', 2050, 2450, { cpu: 'Ryzen AI 9 HX 370', gpu: 'RTX 4060', ram: '32GB LPDDR5X', display: '14" QHD+ 120Hz OLED' }, 'best'),
  make(7, 'ASUS', 'ROG Strix G16 (2024)', 'G614JVR', 1850, 2200, { cpu: 'Intel i7-14700HX', gpu: 'RTX 4070', ram: '16GB DDR5', display: '16" QHD+ 240Hz' }),
  make(8, 'ASUS', 'TUF Gaming A15 (2024)', 'FA507NV', 1180, 1400, { cpu: 'Ryzen 7 7735HS', gpu: 'RTX 4060', ram: '16GB DDR5', display: '15.6" FHD 144Hz' }, 'sale'),
  // MSI
  make(9, 'MSI', 'Titan 18 HX A14V RTX 4090', 'TITAN-18-HX-A14V', 3700, 4400, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4090', ram: '64GB DDR5', display: '18" UHD+ 120Hz Mini-LED' }, 'limited'),
  make(10, 'MSI', 'Raider GE78 HX', 'GE78-HX-14VHG', 2700, 3200, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4080', ram: '32GB DDR5', display: '17" QHD+ 240Hz' }),
  make(11, 'MSI', 'Stealth 16 AI Studio', 'STEALTH-16-AI-A1V', 2280, 2700, { cpu: 'Intel Core Ultra 9 185H', gpu: 'RTX 4070', ram: '32GB LPDDR5X', display: '16" QHD+ 240Hz OLED' }),
  make(12, 'MSI', 'Vector 16 HX A14V', 'VECTOR-16-HX-A14V', 1900, 2280, { cpu: 'Intel i7-14700HX', gpu: 'RTX 4070', ram: '16GB DDR5' }),
  // Lenovo Legion
  make(13, 'Lenovo', 'Legion 9i Gen 9 (2024)', '83G00007US', 3650, 4350, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4090', ram: '64GB DDR5', display: '16" 3.2K 165Hz Mini-LED' }, 'best'),
  make(14, 'Lenovo', 'Legion Pro 7i Gen 9', '83DE0011US', 2700, 3200, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4080', ram: '32GB DDR5', display: '16" WQXGA 240Hz' }, 'hot'),
  make(15, 'Lenovo', 'Legion Pro 5i Gen 9', '83DF002CUS', 1850, 2200, { cpu: 'Intel i7-14700HX', gpu: 'RTX 4070', ram: '32GB DDR5' }),
  make(16, 'Lenovo', 'LOQ 15 Gen 9', '83DV002BUS', 1080, 1300, { cpu: 'Intel i7-13650HX', gpu: 'RTX 4060', ram: '16GB DDR5', display: '15.6" FHD 144Hz' }, 'sale'),
  // Alienware
  make(17, 'Alienware', 'm18 R2 RTX 4090', 'AWM18R2-9988', 3400, 4000, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4090', ram: '64GB DDR5', display: '18" QHD+ 165Hz' }),
  make(18, 'Alienware', 'x16 R2', 'AWX16R2-7958', 2700, 3200, { cpu: 'Intel Core Ultra 9 185H', gpu: 'RTX 4080', ram: '32GB LPDDR5X', display: '16" QHD+ 240Hz' }, 'best'),
  make(19, 'Alienware', 'm16 R2', 'AWM16R2-7780', 2050, 2450, { cpu: 'Intel Core Ultra 7 155H', gpu: 'RTX 4070', ram: '32GB LPDDR5X' }),
  // HP Omen
  make(20, 'HP', 'OMEN 17 (2024)', 'cm2018ng', 1980, 2350, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4080', ram: '32GB DDR5', display: '17.3" QHD 240Hz' }),
  make(21, 'HP', 'OMEN 16 (2024)', 'wf2092ng', 1480, 1750, { cpu: 'Intel i7-14700HX', gpu: 'RTX 4070', ram: '16GB DDR5' }),
  // Acer Predator
  make(22, 'Acer', 'Predator Helios 18 (2024)', 'PH18-72-91W7', 2580, 3050, { cpu: 'Intel i9-14900HX', gpu: 'RTX 4080', ram: '32GB DDR5', display: '18" QHD+ 240Hz Mini-LED' }, 'hot'),
  make(23, 'Acer', 'Predator Helios Neo 16', 'PHN16-72-77AB', 1450, 1750, { cpu: 'Intel i7-14700HX', gpu: 'RTX 4060' }),
  // Studio / creator (MacBook for completeness)
  make(24, 'Apple', 'MacBook Pro 16" M4 Max', 'MX2K3LL/A', 3500, 4150, { cpu: 'Apple M4 Max 16-core CPU', gpu: '40-core GPU', ram: '48GB unified', storage: '1TB SSD', display: '16.2" Liquid Retina XDR' }, 'best'),
  make(25, 'Apple', 'MacBook Pro 14" M4 Pro', 'MX2H3LL/A', 2150, 2550, { cpu: 'Apple M4 Pro 12-core', gpu: '16-core GPU', ram: '24GB', display: '14.2" Liquid Retina XDR' }),
];
