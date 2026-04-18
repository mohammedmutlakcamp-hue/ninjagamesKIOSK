import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `ram-${i}`, category: 'ram', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*15)+5, badge,
  specs,
  description: `${brand} ${name} desktop memory. ${specs.capacity || ''} ${specs.speed || ''} ${specs.timing || ''}.`,
  tags: [brand.toLowerCase(), specs.type || '', specs.capacity || '', specs.speed || ''].filter(Boolean),
});

export const RAM: Product[] = [
  // DDR5 high-end
  make(1, 'G.Skill', 'Trident Z5 RGB', 'F5-8000J3848H16GX2-TZ5RK', 240, 280, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '8000 MT/s', timing: 'CL38' }, 'best'),
  make(2, 'G.Skill', 'Trident Z5 Royal Neo', 'F5-6400J3239G16GX2-TR5N', 215, 250, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6400 MT/s', timing: 'CL32', rgb: 'Yes' }, 'hot'),
  make(3, 'Corsair', 'Vengeance RGB DDR5', 'CMH32GX5M2B6000C30', 165, 195, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6000 MT/s', timing: 'CL30' }, 'best'),
  make(4, 'Corsair', 'Dominator Titanium RGB', 'CMP32GX5M2B7200C34', 245, 285, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '7200 MT/s', timing: 'CL34' }),
  make(5, 'Kingston', 'Fury Beast DDR5 RGB', 'KF560C30BBEAK2-32', 145, 175, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6000 MT/s', timing: 'CL30' }),
  make(6, 'Kingston', 'Fury Renegade DDR5', 'KF580C38RSAK2-32', 235, 275, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '8000 MT/s', timing: 'CL38' }),
  make(7, 'Crucial', 'Pro DDR5', 'CP2K16G60C36U5W', 130, 160, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6000 MT/s', timing: 'CL36' }),
  make(8, 'TeamGroup', 'T-Force Delta RGB DDR5', 'FF3D532G6400HC32ADC01', 155, 185, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6400 MT/s' }),
  make(9, 'G.Skill', 'Ripjaws S5 DDR5', 'F5-6000J3036F16GX2-RS5K', 135, 165, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6000 MT/s', timing: 'CL30' }),
  make(10, 'ADATA', 'XPG Lancer RGB DDR5', 'AX5U6000C3016G-DCLARBK', 145, 175, { capacity: '32GB (2x16GB)', type: 'DDR5', speed: '6000 MT/s' }),
  // DDR5 64GB kits
  make(11, 'Corsair', 'Vengeance DDR5 64GB', 'CMK64GX5M2B6000Z30', 290, 340, { capacity: '64GB (2x32GB)', type: 'DDR5', speed: '6000 MT/s', timing: 'CL30' }, 'hot'),
  make(12, 'G.Skill', 'Trident Z5 RGB 64GB', 'F5-6400J3239G32GX2-TZ5RK', 320, 380, { capacity: '64GB (2x32GB)', type: 'DDR5', speed: '6400 MT/s' }),
  make(13, 'Kingston', 'Fury Beast 96GB DDR5', 'KF564C30BBEAK2-96', 480, 560, { capacity: '96GB (2x48GB)', type: 'DDR5', speed: '6400 MT/s' }, 'limited'),
  make(14, 'G.Skill', 'Trident Z5 RGB 192GB', 'F5-5600J4040D48GX4-TZ5RK', 1100, 1280, { capacity: '192GB (4x48GB)', type: 'DDR5', speed: '5600 MT/s' }, 'limited'),
  // DDR5 16GB kits (entry)
  make(15, 'Corsair', 'Vengeance DDR5 16GB', 'CMK16GX5M2B5200C40', 75, 95, { capacity: '16GB (2x8GB)', type: 'DDR5', speed: '5200 MT/s' }),
  make(16, 'Crucial', 'DDR5 16GB Single', 'CT16G56C46U5', 60, 75, { capacity: '16GB', type: 'DDR5', speed: '5600 MT/s' }),
  // DDR4 (still huge market)
  make(17, 'Corsair', 'Vengeance LPX DDR4 32GB', 'CMK32GX4M2E3200C16', 90, 115, { capacity: '32GB (2x16GB)', type: 'DDR4', speed: '3200 MT/s', timing: 'CL16' }, 'sale'),
  make(18, 'G.Skill', 'Trident Z RGB DDR4 32GB', 'F4-3600C18D-32GTZR', 110, 140, { capacity: '32GB (2x16GB)', type: 'DDR4', speed: '3600 MT/s' }),
  make(19, 'Kingston', 'Fury Beast DDR4 16GB', 'KF432C16BBK2/16', 50, 65, { capacity: '16GB (2x8GB)', type: 'DDR4', speed: '3200 MT/s' }),
  make(20, 'Crucial', 'Ballistix DDR4 32GB', 'BL2K16G36C16U4B', 95, 120, { capacity: '32GB (2x16GB)', type: 'DDR4', speed: '3600 MT/s' }),
  // Laptop SO-DIMM
  make(21, 'Crucial', 'DDR5 SODIMM 32GB', 'CT2K16G56C46S5', 120, 150, { capacity: '32GB (2x16GB)', type: 'DDR5 SODIMM', speed: '5600 MT/s', use: 'Laptop' }),
  make(22, 'Corsair', 'Vengeance DDR5 SODIMM 64GB', 'CMSX64GX5M2A5200C44', 260, 310, { capacity: '64GB (2x32GB)', type: 'DDR5 SODIMM' }),
  make(23, 'Kingston', 'Fury Impact DDR5 SODIMM', 'KF548S38IBK2-32', 145, 175, { capacity: '32GB (2x16GB)', type: 'DDR5 SODIMM', speed: '4800 MT/s' }),
  make(24, 'Crucial', 'DDR4 SODIMM 16GB', 'CT2K8G4SFRA32A', 50, 65, { capacity: '16GB (2x8GB)', type: 'DDR4 SODIMM' }),
  // CAMM2 (newest form factor)
  make(25, 'Crucial', 'DDR5 CAMM2 32GB', 'CT32G64C40CT', 195, 230, { capacity: '32GB', type: 'DDR5 CAMM2', use: 'Premium laptops' }, 'new'),
];
