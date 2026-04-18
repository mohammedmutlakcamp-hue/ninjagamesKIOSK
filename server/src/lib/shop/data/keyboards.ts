import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `kb-${i}`, category: 'keyboard', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*15)+5, badge,
  specs,
  description: `${brand} ${name} keyboard. ${specs.switch || ''} ${specs.layout || ''} ${specs.connection || ''}.`,
  tags: [brand.toLowerCase(), specs.switch || '', specs.layout || ''].filter(Boolean),
});

export const KEYBOARDS: Product[] = [
  // Hall Effect / magnetic switches (current trend)
  make(1, 'Wooting', 'Wooting 80HE', 'W80HE', 220, 260, { switch: 'Lekker Hall Effect', layout: 'TKL', connection: 'USB-C', features: 'Rapid Trigger' }, 'best'),
  make(2, 'Wooting', '60HE+', 'W60HE+', 195, 235, { switch: 'Lekker Hall Effect', layout: '60%', connection: 'USB-C' }),
  make(3, 'Razer', 'Huntsman V3 Pro TKL', 'RZ03-04980', 245, 290, { switch: 'Razer Analog Optical Gen-2', layout: 'TKL' }, 'hot'),
  make(4, 'SteelSeries', 'Apex Pro TKL Wireless (2023)', '64866', 290, 340, { switch: 'OmniPoint 2.0', layout: 'TKL', connection: 'Wireless / USB-C / 2.4GHz' }),
  make(5, 'Keychron', 'Q1 HE Wireless', 'Q1HE-Z1', 195, 230, { switch: 'Gateron Magnetic Jade', layout: '75%', connection: 'Wireless / Wired' }, 'new'),
  // Mechanical (still huge market)
  make(6, 'Logitech', 'G Pro X TKL Lightspeed', '920-012152', 195, 235, { switch: 'GX Brown Tactile', layout: 'TKL', connection: 'Lightspeed Wireless' }, 'best'),
  make(7, 'Logitech', 'G915 X Lightspeed TKL', 'G915-X-TKL', 290, 340, { switch: 'Linear / Tactile / Clicky', layout: 'TKL', connection: 'Wireless' }),
  make(8, 'Razer', 'BlackWidow V4 75%', 'RZ03-05050', 175, 210, { switch: 'Razer Orange Tactile', layout: '75%' }),
  make(9, 'Razer', 'BlackWidow V4 Pro', 'RZ03-04680', 245, 290, { switch: 'Razer Yellow', layout: 'Full', features: 'Command dial' }),
  make(10, 'Corsair', 'K70 MAX RGB Magnetic', 'CH-9128011-NA', 215, 260, { switch: 'MGX Magnetic', layout: 'Full' }),
  make(11, 'Corsair', 'K65 Plus Wireless 75%', 'CH-91D421A-NA', 145, 180, { switch: 'MLX Red Linear', layout: '75%' }),
  make(12, 'Keychron', 'Q3 Max Wireless TKL', 'Q3M-Z1', 165, 200, { switch: 'Gateron Jupiter Brown', layout: 'TKL' }),
  make(13, 'Keychron', 'V6 Max QMK', 'V6M-Z1', 130, 160, { switch: 'Gateron Jupiter Red', layout: 'Full' }),
  // Premium custom
  make(14, 'Mode Designs', 'Sonnet 75 R2', 'SONNET-R2', 590, 690, { switch: 'Customer choice', layout: '75%', material: 'Aluminum + brass' }, 'limited'),
  make(15, 'Glorious', 'GMMK Pro', 'GLO-GMMK-P75-RGB-B', 175, 210, { switch: 'Customer choice', layout: '75%', material: 'CNC aluminum' }),
  // Logitech mainstream
  make(16, 'Logitech', 'MX Keys S', '920-011568', 95, 120, { switch: 'Scissor low-profile', layout: 'Full', use: 'Productivity' }, 'hot'),
  make(17, 'Logitech', 'POP Keys', '920-010714', 60, 80, { switch: 'Mechanical Brown', layout: 'Compact', color: 'Daydream / Heartbreaker / Blast' }),
  // Razer compact
  make(18, 'Razer', 'Huntsman Mini Analog', 'RZ03-04340', 145, 180, { switch: 'Razer Analog Optical', layout: '60%' }),
  // Budget mechanical
  make(19, 'Redragon', 'K580 VATA RGB', 'K580-VATA', 50, 70, { switch: 'Outemu Brown', layout: 'Full' }, 'sale'),
  make(20, 'HyperX', 'Alloy Origins 65', '4P5D6AA', 95, 120, { switch: 'HyperX Red Linear', layout: '65%' }),
  // Membrane / office
  make(21, 'Logitech', 'K780 Multi-Device', '920-008149', 65, 85, { switch: 'Membrane', layout: 'Full', connection: 'Wireless / Bluetooth' }),
  make(22, 'Apple', 'Magic Keyboard with Touch ID & Numeric', 'MK2C3LL/A', 195, 230, { switch: 'Scissor', layout: 'Full' }),
];
