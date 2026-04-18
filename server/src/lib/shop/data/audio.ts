import type { Product } from '../types';

const make = (i: number, brand: string, name: string, model: string, priceJod: number, msrpJod: number, specs: Record<string,string>, badge?: Product['badge']): Product => ({
  id: `audio-${i}`, category: 'audio', brand, name, model, priceJod, msrpJod,
  inStock: true, stockCount: Math.floor(Math.random()*15)+4, badge,
  specs,
  description: `${brand} ${name}. ${specs.power || ''} ${specs.connection || ''}.`,
  tags: [brand.toLowerCase(), specs.type || ''].filter(Boolean),
});

export const AUDIO: Product[] = [
  // Studio monitors
  make(1, 'Logitech', 'G560 LIGHTSYNC PC Speakers', '980-001300', 175, 215, { type: '2.1 Speakers', power: '120W RMS', connection: 'USB / Bluetooth / 3.5mm', features: 'RGB' }, 'best'),
  make(2, 'Razer', 'Leviathan V2 Pro', 'RC30-04790', 380, 450, { type: 'Soundbar', features: 'Beamforming, head-tracking 3D audio' }, 'hot'),
  make(3, 'Razer', 'Leviathan V2', 'RC30-04280', 245, 290, { type: 'Soundbar + sub', power: '60W' }),
  make(4, 'Razer', 'Nommo V2 Pro', 'RC30-04760', 450, 530, { type: '2.1 Speakers + sub', features: 'THX Spatial' }),
  make(5, 'Edifier', 'S2000MKIII Bluetooth', 'S2000MKIII', 380, 450, { type: 'Bookshelf 2.0', power: '124W RMS', connection: 'Bluetooth 5.0 / Optical' }, 'best'),
  make(6, 'Edifier', 'R1280T Powered Bookshelf', 'R1280T', 95, 125, { type: 'Bookshelf 2.0', power: '42W RMS' }, 'sale'),
  make(7, 'Edifier', 'R1700BT Bluetooth', 'R1700BT', 130, 165, { type: 'Bookshelf 2.0', connection: 'Bluetooth' }, 'hot'),
  make(8, 'Audioengine', 'A2+ Wireless', 'A2+W-BLK', 290, 340, { type: 'Desktop 2.0', features: 'Hi-Res 24-bit DAC, Bluetooth' }),
  make(9, 'KEF', 'LSX II Wireless', 'LSX-II', 1280, 1500, { type: 'Wireless HiFi 2.0', features: 'Streaming, AirPlay, Roon' }, 'limited'),
  // Gaming sound bars / 5.1
  make(10, 'Logitech', 'Z906 5.1 THX', '980-000467', 290, 340, { type: '5.1 Surround', power: '500W RMS' }),
  make(11, 'Logitech', 'Z625 2.1 THX', '980-001268', 145, 175, { type: '2.1 Speakers', power: '200W' }),
  // Studio production
  make(12, 'Yamaha', 'HS5 Powered Studio Monitor (each)', 'HS5', 215, 250, { type: 'Studio Monitor', power: '70W bi-amp', use: 'Mixing/mastering' }),
  make(13, 'KRK', 'ROKIT 5 G4', 'RP5G4', 175, 210, { type: 'Studio Monitor', use: 'Music production' }),
  // Portable Bluetooth
  make(14, 'JBL', 'Charge 5', 'JBLCHARGE5BLK', 130, 165, { type: 'Portable Bluetooth', battery: '20h', waterproof: 'IP67' }, 'hot'),
  make(15, 'JBL', 'Xtreme 4', 'JBLXTREME4BLK', 280, 340, { type: 'Portable Bluetooth', power: '100W' }, 'new'),
  make(16, 'Bose', 'SoundLink Flex', '865983-0100', 130, 165, { type: 'Portable Bluetooth' }),
  // Microphones (creators)
  make(17, 'Shure', 'SM7B Dynamic Microphone', 'SM7B', 320, 380, { type: 'Dynamic XLR Mic', use: 'Streaming/podcasting' }, 'best'),
  make(18, 'Elgato', 'Wave:3 Premium USB Mic', '10MAB9901', 130, 165, { type: 'USB Condenser Mic', features: 'Software mixer' }, 'hot'),
  make(19, 'Shure', 'MV7+', 'MV7-PLUS', 245, 290, { type: 'Hybrid USB/XLR Mic', features: 'Real-time denoiser' }),
  make(20, 'HyperX', 'QuadCast S RGB', '4P5P7AA', 130, 165, { type: 'USB Condenser Mic', features: 'RGB, anti-vibration mount' }),
];
