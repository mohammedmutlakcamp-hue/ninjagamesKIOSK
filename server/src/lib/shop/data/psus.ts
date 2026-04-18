import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `psu-${i}`, category: 'psu', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*10)+3, badge,
  specs,
  description: `${brand} ${name} power supply. ${specs.wattage || ''} ${specs.rating || ''} ${specs.modular || ''}.`,
  tags: [brand.toLowerCase(), specs.wattage || '', specs.rating || ''].filter(Boolean),
});

export const PSUS: Product[] = [
  make(1, 'Corsair', 'RM1200x SHIFT', 'CP-9020253-NA', 250, 290, { wattage: '1200W', rating: '80+ Gold', modular: 'Fully modular', atx: 'ATX 3.1 / PCIe 5.1' }, 'best'),
  make(2, 'Corsair', 'HX1500i', 'CP-9020261-NA', 380, 440, { wattage: '1500W', rating: '80+ Platinum', modular: 'Fully modular' }, 'hot'),
  make(3, 'Corsair', 'RM1000x', 'CP-9020201-NA', 195, 230, { wattage: '1000W', rating: '80+ Gold', modular: 'Fully modular' }),
  make(4, 'Corsair', 'RM850x', 'CP-9020200-NA', 165, 195, { wattage: '850W', rating: '80+ Gold', modular: 'Fully modular' }, 'best'),
  make(5, 'Corsair', 'RM750e', 'CP-9020262-NA', 115, 140, { wattage: '750W', rating: '80+ Gold' }),
  make(6, 'Seasonic', 'PRIME TX-1300 ATX 3.1', 'PRIME-TX-1300', 410, 470, { wattage: '1300W', rating: '80+ Titanium' }, 'limited'),
  make(7, 'Seasonic', 'Focus GX-1000 ATX 3.0', 'FOCUS-GX-1000', 175, 210, { wattage: '1000W', rating: '80+ Gold' }),
  make(8, 'Seasonic', 'Focus GX-850', 'FOCUS-GX-850', 145, 175, { wattage: '850W', rating: '80+ Gold' }),
  make(9, 'be quiet!', 'Dark Power Pro 13 1300W', 'BN331', 360, 420, { wattage: '1300W', rating: '80+ Titanium' }),
  make(10, 'be quiet!', 'Pure Power 12 M 850W', 'BN343', 130, 160, { wattage: '850W', rating: '80+ Gold' }),
  make(11, 'MSI', 'MEG Ai1300P PCIE5', 'MEG-AI1300P-PCIE5', 290, 340, { wattage: '1300W', rating: '80+ Platinum' }, 'hot'),
  make(12, 'MSI', 'MPG A1000G PCIE5', 'MPG-A1000G-PCIE5', 175, 210, { wattage: '1000W', rating: '80+ Gold' }),
  make(13, 'NZXT', 'C1500 Platinum ATX 3.1', 'PA-1501C-EU', 320, 380, { wattage: '1500W', rating: '80+ Platinum' }),
  make(14, 'NZXT', 'C850 Gold', 'PA-8G1BB-EU', 130, 160, { wattage: '850W', rating: '80+ Gold' }),
  make(15, 'EVGA', 'SuperNOVA 1000 G7', '220-G7-1000-X1', 195, 240, { wattage: '1000W', rating: '80+ Gold' }),
  make(16, 'Thermaltake', 'Toughpower GF3 1200W', 'PS-TPD-1200FNFAGU-4', 245, 290, { wattage: '1200W', rating: '80+ Gold' }),
  make(17, 'Cooler Master', 'V SFX Platinum 1100', 'MPZ-B001-SFAP-BUS', 290, 340, { wattage: '1100W', rating: '80+ Platinum', formFactor: 'SFX' }, 'limited'),
  make(18, 'Corsair', 'SF1000L SFX-L', 'CP-9020246-NA', 240, 285, { wattage: '1000W', rating: '80+ Gold', formFactor: 'SFX-L' }),
  make(19, 'ASUS', 'ROG Loki 1000P SFX-L', 'ROG-LOKI-1000P-SFX-L', 280, 330, { wattage: '1000W', rating: '80+ Platinum' }),
  make(20, 'ASUS', 'ROG Thor 1600T Gaming', 'ROG-THOR-1600T', 580, 660, { wattage: '1600W', rating: '80+ Titanium' }, 'limited'),
  make(21, 'Corsair', 'CV550 80+ Bronze', 'CP-9020210-NA', 65, 80, { wattage: '550W', rating: '80+ Bronze' }),
  make(22, 'Cooler Master', 'MWE 750 White Bronze V2', 'MPE-7501-ACABW-BEU', 75, 95, { wattage: '750W', rating: '80+ Bronze' }, 'sale'),
];
