import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `ctrl-${i}`, category: 'controller', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*20)+5, badge,
  specs,
  description: `${brand} ${name} controller. ${specs.platform || ''} ${specs.connection || ''}.`,
  tags: [brand.toLowerCase(), specs.platform || '', specs.connection || ''].filter(Boolean),
});

export const CONTROLLERS: Product[] = [
  // PS5
  make(1, 'Sony', 'DualSense Wireless Controller (Midnight Black)', 'CFI-ZCT1W-BK', 65, 80, { platform: 'PS5/PC', connection: 'Bluetooth/USB-C', features: 'Adaptive triggers, Haptic feedback' }, 'best'),
  make(2, 'Sony', 'DualSense (Cosmic Red)', 'CFI-ZCT1W-RED', 65, 80, { platform: 'PS5/PC', color: 'Cosmic Red' }),
  make(3, 'Sony', 'DualSense (Volcanic Red)', 'CFI-ZCT1W-VR', 65, 80, { platform: 'PS5/PC', color: 'Volcanic Red' }, 'new'),
  make(4, 'Sony', 'DualSense Edge (Pro)', 'CFI-ZCP1W', 195, 230, { platform: 'PS5/PC', features: 'Swappable sticks, Back paddles, Custom profiles' }, 'best'),
  make(5, 'Sony', 'DualSense Charging Station', 'CFI-ZDS1', 35, 50, { use: 'Charges 2 controllers' }),
  // Xbox
  make(6, 'Microsoft', 'Xbox Wireless Controller (Carbon Black)', 'QAT-00001', 50, 65, { platform: 'Xbox / PC', connection: 'Bluetooth / USB-C', battery: 'AA / Play & Charge' }, 'best'),
  make(7, 'Microsoft', 'Xbox Wireless Controller (Robot White)', 'QAS-00001', 50, 65, { platform: 'Xbox / PC' }),
  make(8, 'Microsoft', 'Xbox Wireless Controller (Pulse Red)', 'QAU-00012', 55, 70, { platform: 'Xbox / PC', color: 'Pulse Red' }),
  make(9, 'Microsoft', 'Xbox Elite Series 2', 'FST-00003', 145, 175, { platform: 'Xbox / PC', features: '4 paddles, hair triggers, 3 profile slots' }, 'hot'),
  make(10, 'Microsoft', 'Xbox Elite Series 2 Core', 'RFZ-00001', 110, 140, { platform: 'Xbox / PC' }),
  // Switch
  make(11, 'Nintendo', 'Switch Pro Controller', 'HACAFSSKA', 65, 85, { platform: 'Switch / PC', connection: 'Bluetooth / USB-C' }, 'best'),
  make(12, '8BitDo', 'Ultimate Bluetooth Controller', 'ULT-BT', 65, 85, { platform: 'Switch / PC', features: 'Hall Effect sticks, Charging dock' }, 'hot'),
  make(13, '8BitDo', 'SN30 Pro+', 'SN30-PRO-PLUS', 50, 65, { platform: 'Switch / PC / Android', design: 'SNES style' }),
  // Pro / Tournament
  make(14, 'Razer', 'Wolverine V3 Pro', 'RZ06-05210', 235, 280, { platform: 'Xbox / PC', features: 'Mecha-Tactile buttons, 6 mappable inputs' }, 'limited'),
  make(15, 'Scuf', 'Reflex Pro', 'SCUF-REFLEX-PRO', 215, 260, { platform: 'PS5 / PC', features: 'Custom paddles, instant trigger stops' }),
  make(16, 'Scuf', 'Envision Pro', 'SCUF-ENVISION-PRO', 245, 290, { platform: 'PC', features: 'PC-only with custom side buttons' }),
  make(17, 'Turtle Beach', 'Stealth Ultra', 'TBS-0710-01', 175, 210, { platform: 'Xbox / PC', features: 'Dock with screen, Bluetooth audio' }, 'new'),
  // Race wheels
  make(18, 'Logitech', 'G29 Driving Force', '941-000110', 280, 340, { platform: 'PS / PC', use: 'Race sim, force feedback' }, 'best'),
  make(19, 'Logitech', 'G923 TRUEFORCE', '941-000158', 380, 450, { platform: 'PS / Xbox / PC', features: 'TRUEFORCE feedback' }),
  make(20, 'Thrustmaster', 'T248', '4160781', 320, 380, { platform: 'PS / PC', features: 'Hybrid drive force feedback' }),
  // Flight stick
  make(21, 'Thrustmaster', 'T.Flight Hotas X', '2960703', 95, 120, { use: 'Flight sim', platform: 'PC / PS' }),
  make(22, 'Logitech', 'X56 H.O.T.A.S RGB', '945-000058', 290, 340, { use: 'Flight sim', platform: 'PC' }),
];
