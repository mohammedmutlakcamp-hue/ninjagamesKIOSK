import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge'], inStock = true): Product => ({
  id: `gpu-${i}`, category: 'gpu', brand, name, model, priceJod, msrpJod, inStock,
  stockCount: inStock ? Math.floor(Math.random()*8)+1 : 0,
  badge,
  specs,
  description: `${brand} ${name} graphics card. ${specs.memory || ''} ${specs.bus || ''}. Built for high-refresh gaming and content creation.`,
  tags: [brand.toLowerCase(), specs.memory || '', specs.architecture || ''].filter(Boolean),
});

export const GPUS: Product[] = [
  // NVIDIA RTX 50 series
  make(1, 'NVIDIA', 'GeForce RTX 5090 Founders Edition', 'RTX5090-FE', 1850, 1990, { memory: '32GB GDDR7', bus: '512-bit', cores: '21,760 CUDA', boost: '2.41 GHz', tdp: '575W', architecture: 'Blackwell' }, 'limited'),
  make(2, 'ASUS', 'ROG Astral GeForce RTX 5090 OC', 'ROG-ASTRAL-RTX5090-O32G', 2050, 2200, { memory: '32GB GDDR7', bus: '512-bit', boost: '2.62 GHz', tdp: '600W' }, 'best'),
  make(3, 'MSI', 'GeForce RTX 5090 Suprim Liquid SOC', 'RTX5090-SUPRIM-LIQUID', 2100, 2250, { memory: '32GB GDDR7', cooling: '360mm AIO', boost: '2.55 GHz' }, 'limited'),
  make(4, 'Gigabyte', 'AORUS GeForce RTX 5090 Master ICE', 'GV-N5090AORUS-M-32GD', 1980, 2150, { memory: '32GB GDDR7', boost: '2.50 GHz', color: 'White' }, 'new'),
  make(5, 'NVIDIA', 'GeForce RTX 5080 Founders Edition', 'RTX5080-FE', 950, 1050, { memory: '16GB GDDR7', bus: '256-bit', cores: '10,752 CUDA', tdp: '360W' }, 'hot'),
  make(6, 'ASUS', 'TUF Gaming GeForce RTX 5080 OC', 'TUF-RTX5080-O16G-GAMING', 1020, 1100, { memory: '16GB GDDR7', boost: '2.78 GHz', cooling: 'Triple Axial Fan' }),
  make(7, 'MSI', 'GeForce RTX 5080 Gaming Trio OC', 'RTX5080-GAMING-TRIO', 1050, 1150, { memory: '16GB GDDR7', cooling: 'Tri Frozr 4', boost: '2.72 GHz' }),
  make(8, 'Zotac', 'GeForce RTX 5080 AMP Extreme INFINITY', 'ZT-B50800B-10P', 990, 1090, { memory: '16GB GDDR7', boost: '2.70 GHz' }),
  make(9, 'NVIDIA', 'GeForce RTX 5070 Ti Founders Edition', 'RTX5070TI-FE', 620, 680, { memory: '16GB GDDR7', cores: '8,960 CUDA', tdp: '300W' }, 'hot'),
  make(10, 'PNY', 'GeForce RTX 5070 Ti OC Triple Fan', 'VCG5070T16TFXPB1-O', 640, 700, { memory: '16GB GDDR7', boost: '2.55 GHz' }),
  make(11, 'NVIDIA', 'GeForce RTX 5070 Founders Edition', 'RTX5070-FE', 410, 450, { memory: '12GB GDDR7', cores: '6,144 CUDA', tdp: '250W' }, 'best'),
  make(12, 'Gigabyte', 'GeForce RTX 5070 WINDFORCE OC', 'GV-N5070WF3OC-12GD', 425, 480, { memory: '12GB GDDR7', cooling: 'WINDFORCE 3X' }),
  make(13, 'NVIDIA', 'GeForce RTX 5060 Ti 16GB', 'RTX5060TI-16G', 320, 360, { memory: '16GB GDDR7', cores: '4,608 CUDA', tdp: '180W' }, 'new'),
  make(14, 'NVIDIA', 'GeForce RTX 5060 8GB', 'RTX5060-8G', 230, 260, { memory: '8GB GDDR7', cores: '3,840 CUDA', tdp: '150W' }),
  // RTX 40 series (still in market)
  make(15, 'ASUS', 'ROG Strix GeForce RTX 4090 OC', 'ROG-STRIX-RTX4090-O24G', 1600, 1850, { memory: '24GB GDDR6X', boost: '2.64 GHz' }, 'sale'),
  make(16, 'MSI', 'GeForce RTX 4080 SUPER Gaming X Slim', 'RTX4080-SUPER-GAMING-X', 880, 990, { memory: '16GB GDDR6X', boost: '2.61 GHz' }, 'sale'),
  make(17, 'Gigabyte', 'GeForce RTX 4070 SUPER Gaming OC', 'GV-N407SGAMING-OC-12GD', 530, 600, { memory: '12GB GDDR6X', boost: '2.51 GHz' }),
  make(18, 'NVIDIA', 'GeForce RTX 4060 Ti 8GB', 'RTX4060TI-8G', 300, 340, { memory: '8GB GDDR6', cores: '4,352 CUDA' }),
  make(19, 'NVIDIA', 'GeForce RTX 4060 8GB', 'RTX4060-8G', 220, 250, { memory: '8GB GDDR6', cores: '3,072 CUDA' }),
  // AMD RX 9000 series
  make(20, 'AMD', 'Radeon RX 9070 XT', 'RX9070XT', 540, 600, { memory: '16GB GDDR6', architecture: 'RDNA 4', cores: '4,096 stream', tdp: '304W' }, 'new'),
  make(21, 'Sapphire', 'NITRO+ Radeon RX 9070 XT', 'NITRO-RX9070XT-16G', 580, 640, { memory: '16GB GDDR6', boost: '2.97 GHz' }),
  make(22, 'PowerColor', 'Red Devil Radeon RX 9070 XT', 'AXRX-9070XT-16GBD7', 575, 630, { memory: '16GB GDDR6' }),
  make(23, 'AMD', 'Radeon RX 9070', 'RX9070', 440, 500, { memory: '16GB GDDR6', architecture: 'RDNA 4', tdp: '220W' }),
  make(24, 'AMD', 'Radeon RX 9060 XT 16GB', 'RX9060XT-16G', 320, 360, { memory: '16GB GDDR6', architecture: 'RDNA 4' }, 'new'),
  make(25, 'AMD', 'Radeon RX 9060', 'RX9060', 250, 290, { memory: '8GB GDDR6', architecture: 'RDNA 4' }),
  make(26, 'AMD', 'Radeon RX 7900 XTX', 'RX7900XTX', 720, 850, { memory: '24GB GDDR6', architecture: 'RDNA 3', tdp: '355W' }, 'sale'),
  make(27, 'Sapphire', 'PULSE Radeon RX 7900 XT', 'PULSE-RX7900XT-20G', 620, 720, { memory: '20GB GDDR6' }),
  make(28, 'XFX', 'Speedster QICK 319 Radeon RX 7800 XT', 'RX-78TQICKB9', 460, 520, { memory: '16GB GDDR6' }),
  make(29, 'AMD', 'Radeon RX 7700 XT', 'RX7700XT', 380, 440, { memory: '12GB GDDR6' }),
  make(30, 'AMD', 'Radeon RX 7600', 'RX7600', 220, 260, { memory: '8GB GDDR6' }),
  // Intel Arc Battlemage
  make(31, 'Intel', 'Arc B580 Limited Edition', 'ARC-B580-LE', 200, 230, { memory: '12GB GDDR6', architecture: 'Xe2 Battlemage', tdp: '190W' }, 'new'),
  make(32, 'Intel', 'Arc B570', 'ARC-B570', 175, 200, { memory: '10GB GDDR6', architecture: 'Xe2 Battlemage' }),
  make(33, 'ASRock', 'Arc B580 Steel Legend OC', 'B580-SL-12GO', 215, 245, { memory: '12GB GDDR6' }),
  // Workstation / professional
  make(34, 'NVIDIA', 'RTX 5000 Ada Generation', 'RTX-5000-ADA', 3200, 3500, { memory: '32GB GDDR6 ECC', use: 'Workstation / AI / Rendering' }, 'limited', false),
  make(35, 'NVIDIA', 'RTX 4500 Ada Generation', 'RTX-4500-ADA', 2200, 2450, { memory: '24GB GDDR6 ECC', use: 'Workstation' }, 'limited'),
];
