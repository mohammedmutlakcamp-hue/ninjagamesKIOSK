import type { Product } from '../types';

const make = (i: number, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `pb-${i}`, category: 'prebuilt', brand: 'Ninja Games Custom', name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*5)+1, badge,
  specs,
  description: `${name}. Hand-built by the Ninja Games workshop in Amman. 1-year warranty, free LAN delivery, lifetime tech support. ${specs.gpu || ''} + ${specs.cpu || ''}.`,
  tags: ['prebuilt', 'ninja games custom', specs.tier || '', specs.gpu || ''].filter(Boolean),
});

export const PREBUILTS: Product[] = [
  // Genin tier — entry esports
  make(1, '"GENIN" Esports Starter', 'NG-GENIN-1', 580, 720, {
    tier: 'Genin', cpu: 'Ryzen 5 5600', gpu: 'RX 7600 8GB', ram: '16GB DDR4 3200',
    storage: '500GB NVMe Gen4', psu: '550W 80+ Bronze', case: 'Mid Tower w/ ARGB',
    use: 'Valorant, CS2, Fortnite @ 1080p high 200+ FPS',
  }, 'best'),
  make(2, '"GENIN+" Esports Plus', 'NG-GENIN-2', 730, 880, {
    tier: 'Genin', cpu: 'Ryzen 5 7600', gpu: 'RX 7600 8GB', ram: '16GB DDR5 5200',
    storage: '1TB NVMe Gen4', psu: '650W Bronze', case: 'Mid Tower w/ ARGB',
    use: '1080p ultra 240+ FPS competitive',
  }, 'hot'),
  make(3, '"GENIN" Intel Build', 'NG-GENIN-INTEL', 690, 830, {
    tier: 'Genin', cpu: 'Intel i5-14400F', gpu: 'RTX 4060 8GB', ram: '16GB DDR5 5200',
    storage: '1TB NVMe Gen4', psu: '650W Gold', case: 'NZXT H6 Flow',
    use: '1080p high-refresh',
  }),
  // Chunin tier — 1080p ultra / 1440p high
  make(4, '"CHUNIN" 1440p Hero', 'NG-CHUNIN-1', 1100, 1320, {
    tier: 'Chunin', cpu: 'Ryzen 7 7700X', gpu: 'RTX 4070 SUPER 12GB', ram: '32GB DDR5 6000',
    storage: '2TB NVMe Gen4', psu: '750W Gold', cooling: '240mm AIO RGB', case: 'Lian Li Lancool 216',
    use: '1440p ultra 120+ FPS',
  }, 'best'),
  make(5, '"CHUNIN" Streamer', 'NG-CHUNIN-STREAM', 1280, 1500, {
    tier: 'Chunin', cpu: 'Intel i7-14700K', gpu: 'RTX 4070 SUPER 12GB', ram: '32GB DDR5 6000',
    storage: '2TB NVMe Gen4 + 4TB HDD', psu: '850W Gold', cooling: '360mm AIO',
    use: 'Stream + game, OBS, NVENC',
  }, 'hot'),
  make(6, '"CHUNIN" White Build', 'NG-CHUNIN-WHITE', 1180, 1400, {
    tier: 'Chunin', cpu: 'Ryzen 7 7700', gpu: 'RTX 4070 12GB', ram: '32GB DDR5 6000 White',
    storage: '2TB NVMe', psu: '850W Gold White', case: 'Lian Li O11 Vision Compact White', cooling: '360mm AIO White',
  }, 'new'),
  // Jonin tier — 1440p ultra / 4K high
  make(7, '"JONIN" 1440p Beast', 'NG-JONIN-1', 1750, 2050, {
    tier: 'Jonin', cpu: 'Ryzen 7 9800X3D', gpu: 'RTX 5070 Ti 16GB', ram: '32GB DDR5 6000 CL30',
    storage: '2TB NVMe Gen5', psu: '850W Gold', cooling: '360mm AIO RGB',
    use: '1440p ultra 240Hz / 4K high',
  }, 'best'),
  make(8, '"JONIN" RGB Showpiece', 'NG-JONIN-RGB', 2100, 2450, {
    tier: 'Jonin', cpu: 'Intel Core Ultra 7 265K', gpu: 'RTX 5080 16GB', ram: '32GB DDR5 7200 RGB',
    storage: '2TB NVMe Gen5', psu: '1000W Platinum', case: 'NZXT H9 Elite', cooling: '360mm AIO LCD',
  }, 'hot'),
  make(9, '"JONIN" Creator Edition', 'NG-JONIN-CREATE', 2280, 2650, {
    tier: 'Jonin', cpu: 'Ryzen 9 9950X', gpu: 'RTX 5070 Ti 16GB', ram: '64GB DDR5 6000',
    storage: '4TB NVMe Gen5', psu: '1000W Gold', cooling: '360mm AIO',
    use: '4K video editing, 3D rendering, dev work',
  }, 'new'),
  // Kage tier — 4K ultra / pro
  make(10, '"KAGE" 4K Ultra', 'NG-KAGE-1', 2950, 3450, {
    tier: 'Kage', cpu: 'Ryzen 9 9950X3D', gpu: 'RTX 5090 32GB', ram: '64GB DDR5 6400',
    storage: '4TB NVMe Gen5', psu: '1200W Platinum ATX 3.1', cooling: '420mm AIO LCD',
    case: 'Lian Li O11 Dynamic EVO XL',
  }, 'best'),
  make(11, '"KAGE" Apex Predator', 'NG-KAGE-APEX', 3450, 4100, {
    tier: 'Kage', cpu: 'Intel Core Ultra 9 285K', gpu: 'RTX 5090 OC 32GB', ram: '64GB DDR5 8000 CL36',
    storage: '4TB NVMe Gen5 + 4TB HDD', psu: '1500W Platinum', cooling: 'Custom hardline loop',
  }, 'limited'),
  make(12, '"KAGE" Workstation Pro', 'NG-KAGE-WORK', 4900, 5800, {
    tier: 'Kage', cpu: 'Threadripper 7970X 32C', gpu: 'RTX 4500 Ada', ram: '128GB DDR5 ECC',
    storage: '8TB NVMe Gen5 + 16TB HDD', psu: '1600W Titanium', use: 'Pro 3D / AI / video',
  }, 'limited'),
  // Compact / SFF
  make(13, '"SHADOW" Mini-ITX SFF', 'NG-SHADOW-SFF', 1880, 2200, {
    tier: 'Special', cpu: 'Ryzen 7 9800X3D', gpu: 'RTX 5070 Ti 16GB', ram: '32GB DDR5 6000',
    case: 'Cooler Master NR200P MAX', psu: '1100W SFX Platinum',
    use: 'Console-sized power',
  }, 'limited'),
  // Family / streaming setup
  make(14, '"GENIN" Living Room Console-Killer', 'NG-LIVING', 880, 1080, {
    tier: 'Genin', cpu: 'Ryzen 5 8400F', gpu: 'RTX 4060 8GB', ram: '16GB DDR5',
    case: 'Compact Mid-Tower', use: '1080p living room PC, plays everything',
  }),
  make(15, '"CHUNIN" VR Ready', 'NG-CHUNIN-VR', 1380, 1650, {
    tier: 'Chunin', cpu: 'Ryzen 7 7800X3D', gpu: 'RTX 4070 SUPER', ram: '32GB DDR5',
    use: 'Quest 3 / Index / Pico tethered VR',
  }),
  // Office / dev workstations
  make(16, 'Silent Office Pro', 'NG-OFFICE-PRO', 720, 880, {
    tier: 'Workstation', cpu: 'Ryzen 7 7700', gpu: 'Integrated', ram: '32GB DDR5', storage: '1TB NVMe',
    use: 'Silent business build, no GPU',
  }),
  make(17, '"SAGE" Dev Workstation', 'NG-SAGE-DEV', 1480, 1750, {
    tier: 'Workstation', cpu: 'Ryzen 9 7900X', gpu: 'RTX 4060 Ti', ram: '64GB DDR5', storage: '2TB NVMe',
    use: 'Compile, Docker, multiple VMs',
  }, 'hot'),
  // Themed builds
  make(18, '"VALORANT" Pro Loadout', 'NG-VAL-PRO', 1200, 1450, {
    cpu: 'Ryzen 7 9700X', gpu: 'RTX 4070 SUPER', ram: '32GB DDR5 6000',
    monitor: '+ Optional 360Hz monitor bundle', use: '500+ FPS Valorant',
  }, 'hot'),
  make(19, '"FORTNITE" Performance', 'NG-FORT-PERF', 1080, 1300, {
    cpu: 'Ryzen 5 7600X', gpu: 'RTX 4070', ram: '32GB DDR5', use: '240Hz 1440p',
  }),
  make(20, '"WARZONE" Ultra', 'NG-WZ-ULTRA', 1850, 2200, {
    cpu: 'Ryzen 7 9800X3D', gpu: 'RTX 5080', ram: '32GB DDR5 6400',
    use: 'Warzone 4K ultra, 144 FPS+',
  }),
];
