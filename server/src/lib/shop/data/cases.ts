import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `case-${i}`, category: 'case', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*8)+2, badge,
  specs,
  description: `${brand} ${name} PC case. ${specs.formFactor || ''} ${specs.color || ''}.`,
  tags: [brand.toLowerCase(), specs.formFactor || '', specs.color || ''].filter(Boolean),
});

export const CASES: Product[] = [
  make(1, 'Lian Li', 'O11 Dynamic EVO XL', 'G99.O11DEXL-W.00', 280, 330, { formFactor: 'Full Tower', color: 'White', material: 'Steel + tempered glass' }, 'best'),
  make(2, 'Lian Li', 'O11 Dynamic EVO', 'G99.O11DE-X.00', 215, 260, { formFactor: 'Mid Tower', color: 'Black' }, 'hot'),
  make(3, 'Lian Li', 'O11 Vision Compact', 'G99.O11VCW.00', 195, 235, { formFactor: 'Mid Tower', color: 'White' }, 'new'),
  make(4, 'NZXT', 'H7 Flow (2024)', 'CM-H72FB-01', 165, 200, { formFactor: 'Mid Tower', color: 'Black', airflow: 'High' }, 'best'),
  make(5, 'NZXT', 'H9 Elite (2024)', 'CM-H91EW-01', 245, 290, { formFactor: 'Mid Tower', color: 'White', glass: 'Dual chamber' }),
  make(6, 'NZXT', 'H6 Flow', 'CM-H61FB-01', 145, 175, { formFactor: 'Mid Tower', color: 'Black' }),
  make(7, 'Fractal Design', 'North XL', 'FD-C-NOR1X-01', 230, 280, { formFactor: 'Mid Tower', color: 'Charcoal Black + walnut' }, 'limited'),
  make(8, 'Fractal Design', 'North', 'FD-C-NOR1C-01', 175, 215, { formFactor: 'Mid Tower', color: 'Chalk White + oak' }, 'hot'),
  make(9, 'Fractal Design', 'Meshify 2 XL', 'FD-C-MES2X-01A', 245, 290, { formFactor: 'Full Tower', color: 'Black' }),
  make(10, 'Fractal Design', 'Torrent', 'FD-C-TOR1A-01', 215, 260, { formFactor: 'Mid Tower', color: 'Black', airflow: 'Extreme' }),
  make(11, 'Corsair', '7000D AIRFLOW', 'CC-9011218-WW', 285, 340, { formFactor: 'Full Tower', color: 'Black' }),
  make(12, 'Corsair', '5000D AIRFLOW', 'CC-9011211-WW', 195, 235, { formFactor: 'Mid Tower', color: 'Black' }, 'sale'),
  make(13, 'Corsair', 'iCUE 6500X RGB', 'CC-9011273-WW', 245, 290, { formFactor: 'Mid Tower', color: 'White', rgb: 'Yes' }),
  make(14, 'Corsair', '4000D AIRFLOW', 'CC-9011200-WW', 130, 165, { formFactor: 'Mid Tower', color: 'Black' }),
  make(15, 'Be Quiet!', 'Dark Base Pro 901', 'BGW61', 360, 420, { formFactor: 'Full Tower', color: 'Black', sound: 'Dampened' }, 'limited'),
  make(16, 'Be Quiet!', 'Pure Base 501 LX', 'BGW74', 130, 165, { formFactor: 'Mid Tower' }),
  make(17, 'Cooler Master', 'HAF 700 EVO', 'H700E-IGNN-S00', 480, 560, { formFactor: 'Full Tower', color: 'Titanium gray', screen: 'Front display' }, 'limited'),
  make(18, 'Cooler Master', 'MasterFrame 600', 'MF600-WGNN-S00', 195, 235, { formFactor: 'Mid Tower' }),
  make(19, 'Hyte', 'Y70 Touch', 'CS-HYTE-Y70-BB-L', 410, 480, { formFactor: 'Mid Tower', color: 'Black', screen: 'Touch LCD' }, 'new'),
  make(20, 'Hyte', 'Y40', 'CS-HYTE-Y40-BR', 175, 215, { formFactor: 'Mid Tower', color: 'Black + red' }),
  make(21, 'Phanteks', 'NV9', 'PH-NV923TG_DBK01', 320, 380, { formFactor: 'Full Tower', color: 'Satin black' }, 'new'),
  make(22, 'Cooler Master', 'NR200P MAX', 'NR200P-MCNN85-SL0', 285, 340, { formFactor: 'Mini-ITX SFF', color: 'Black' }, 'limited'),
];
