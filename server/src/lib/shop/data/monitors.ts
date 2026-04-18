import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `mon-${i}`, category: 'monitor', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*8)+2, badge,
  specs,
  description: `${brand} ${name} ${specs.size || ''} monitor. ${specs.resolution || ''} @ ${specs.refresh || ''}, ${specs.panel || ''}.`,
  tags: [brand.toLowerCase(), specs.size || '', specs.refresh || '', specs.panel || ''].filter(Boolean),
});

export const MONITORS: Product[] = [
  // OLED flagships
  make(1, 'Samsung', 'Odyssey OLED G9 49" 240Hz', 'LS49CG954EUXEN', 880, 1050, { size: '49"', resolution: '5120x1440 Dual QHD', refresh: '240Hz', panel: 'QD-OLED', curve: '1800R' }, 'best'),
  make(2, 'Samsung', 'Odyssey OLED G8 32" 4K 240Hz', 'LS32DG800SUXEN', 720, 850, { size: '32"', resolution: '4K UHD', refresh: '240Hz', panel: 'QD-OLED' }, 'hot'),
  make(3, 'LG', 'UltraGear 27GS95QE-B 27" 240Hz OLED', '27GS95QE-B', 580, 700, { size: '27"', resolution: '2560x1440 QHD', refresh: '240Hz', panel: 'OLED', responseTime: '0.03ms' }),
  make(4, 'LG', 'UltraGear 32GS95UE-B 32" 4K OLED', '32GS95UE-B', 680, 820, { size: '32"', resolution: '4K UHD', refresh: '240Hz', panel: 'WOLED' }, 'new'),
  make(5, 'ASUS', 'ROG Swift PG34WCDM 34" UW OLED', 'PG34WCDM', 730, 880, { size: '34"', resolution: '3440x1440 UWQHD', refresh: '240Hz', panel: 'QD-OLED', curve: '1800R' }, 'limited'),
  make(6, 'Alienware', 'AW3225QF 32" 4K QD-OLED', 'AW3225QF', 750, 900, { size: '32"', resolution: '4K UHD', refresh: '240Hz', panel: 'QD-OLED', curve: '1700R' }, 'best'),
  make(7, 'MSI', 'MPG 271QRX QD-OLED 27" 360Hz', 'MPG-271QRX-QD-OLED', 590, 700, { size: '27"', resolution: 'QHD', refresh: '360Hz', panel: 'QD-OLED' }, 'hot'),
  // 4K IPS
  make(8, 'LG', 'UltraGear 27GR93U-B 27" 4K 144Hz', '27GR93U-B', 380, 460, { size: '27"', resolution: '4K UHD', refresh: '144Hz', panel: 'IPS' }),
  make(9, 'Gigabyte', 'M28U 28" 4K 144Hz', 'M28U', 320, 380, { size: '28"', resolution: '4K UHD', refresh: '144Hz', panel: 'IPS' }),
  make(10, 'ASUS', 'ProArt PA32UCXR 32" 4K Mini-LED', 'PA32UCXR', 1200, 1450, { size: '32"', resolution: '4K UHD', panel: 'Mini-LED IPS', use: 'Color critical' }, 'limited'),
  // QHD high-refresh
  make(11, 'ASUS', 'ROG Swift PG279QM 27" 240Hz', 'PG279QM', 380, 460, { size: '27"', resolution: 'QHD', refresh: '240Hz', panel: 'IPS' }),
  make(12, 'Gigabyte', 'M27Q X 27" 240Hz', 'M27Q-X', 290, 350, { size: '27"', resolution: 'QHD', refresh: '240Hz', panel: 'SS IPS' }, 'sale'),
  make(13, 'LG', 'UltraGear 27GP850-B 27" 180Hz', '27GP850-B', 215, 260, { size: '27"', resolution: 'QHD', refresh: '180Hz', panel: 'Nano IPS' }),
  make(14, 'Samsung', 'Odyssey G7 27" QHD 240Hz', 'LC27G75TQSPXEN', 285, 340, { size: '27"', resolution: 'QHD', refresh: '240Hz', curve: '1000R' }),
  // UltraWide
  make(15, 'LG', 'UltraGear 34GS95QE 34" UW OLED', '34GS95QE', 720, 870, { size: '34"', resolution: 'UWQHD', refresh: '240Hz', panel: 'WOLED' }),
  make(16, 'Samsung', 'Odyssey OLED G9 G93SC 49"', 'LS49CG934SUXEN', 1100, 1320, { size: '49"', resolution: 'Dual UHD', refresh: '240Hz', panel: 'QD-OLED' }, 'limited'),
  make(17, 'LG', '40WP95XP-W 40" 5K2K UW IPS', '40WP95XP-W', 1050, 1250, { size: '40"', resolution: '5120x2160', panel: 'IPS', use: 'Productivity' }),
  // 1080p competitive
  make(18, 'BenQ', 'Zowie XL2566K 24.5" 360Hz', 'XL2566K', 380, 460, { size: '24.5"', resolution: '1080p', refresh: '360Hz', panel: 'TN', use: 'Esports' }, 'hot'),
  make(19, 'ASUS', 'ROG Swift PG259QN 24.5" 360Hz', 'PG259QN', 350, 420, { size: '24.5"', resolution: '1080p', refresh: '360Hz' }),
  make(20, 'AOC', '24G2SP 24" 165Hz', '24G2SPU/BK', 145, 175, { size: '24"', resolution: '1080p', refresh: '165Hz', panel: 'IPS' }, 'best'),
  make(21, 'Samsung', 'Odyssey G3 24" 165Hz', 'LS24AG320NEXXY', 130, 165, { size: '24"', resolution: '1080p', refresh: '165Hz' }),
  // Productivity / pro
  make(22, 'Dell', 'UltraSharp U3225QE 32" 4K', 'U3225QE', 615, 730, { size: '32"', resolution: '4K UHD', panel: 'IPS Black' }),
  make(23, 'BenQ', 'PD3225U 32" 4K Designer', 'PD3225U', 520, 620, { size: '32"', resolution: '4K UHD', panel: 'IPS' }),
  // Curved gaming
  make(24, 'MSI', 'Optix MAG342CQR 34" UW', 'MAG-342CQR', 290, 350, { size: '34"', resolution: 'UWQHD', refresh: '144Hz', curve: '1500R' }),
  make(25, 'Gigabyte', 'M34WQ 34" UW IPS', 'M34WQ', 295, 360, { size: '34"', resolution: 'UWQHD', refresh: '144Hz', panel: 'IPS' }),
  // Portable
  make(26, 'ASUS', 'ZenScreen MB249C 23.8" Portable', 'MB249C', 175, 215, { size: '23.8"', resolution: '1080p', portable: 'USB-C' }),
  make(27, 'LG', 'gram +view 16" Portable', '16MR70', 245, 290, { size: '16"', resolution: 'WQXGA', portable: 'USB-C' }),
  // 27" 4K mid
  make(28, 'Acer', 'Predator XB283K 28" 4K 144Hz', 'XB283K', 390, 470, { size: '28"', resolution: '4K UHD', refresh: '144Hz' }),
  make(29, 'ViewSonic', 'XG2431 24" 240Hz', 'XG2431', 290, 350, { size: '24"', resolution: '1080p', refresh: '240Hz' }),
  // 32" 4K
  make(30, 'LG', '32UN880-B Ergo 32" 4K', '32UN880-B', 510, 610, { size: '32"', resolution: '4K UHD', stand: 'Ergonomic clamp arm' }),
];
