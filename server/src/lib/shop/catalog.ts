import type { Product, ProductCategory } from './types';
import { GPUS } from './data/gpus';
import { CPUS } from './data/cpus';
import { MOTHERBOARDS } from './data/motherboards';
import { RAM } from './data/ram';
import { STORAGE } from './data/storage';
import { PSUS } from './data/psus';
import { CASES } from './data/cases';
import { COOLING } from './data/cooling';
import { MONITORS } from './data/monitors';
import { KEYBOARDS } from './data/keyboards';
import { MICE } from './data/mice';
import { HEADSETS } from './data/headsets';
import { CONTROLLERS } from './data/controllers';
import { PREBUILTS } from './data/prebuilts';
import { LAPTOPS } from './data/laptops';
import { AUDIO } from './data/audio';

// Deterministic stock based on product id — prevents SSR/CSR hydration
// mismatch from the Math.random() calls in the data files.
const stockOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return (Math.abs(h) % 12) + 2;
};

export const ALL_PRODUCTS: Product[] = [
  ...GPUS, ...CPUS, ...MOTHERBOARDS, ...RAM, ...STORAGE, ...PSUS,
  ...CASES, ...COOLING, ...MONITORS, ...KEYBOARDS, ...MICE,
  ...HEADSETS, ...CONTROLLERS, ...PREBUILTS, ...LAPTOPS, ...AUDIO,
].map(p => ({ ...p, stockCount: p.inStock ? stockOf(p.id) : 0 }));

export const productsByCategory = (cat: ProductCategory): Product[] =>
  ALL_PRODUCTS.filter(p => p.category === cat);

export const getProduct = (id: string): Product | undefined =>
  ALL_PRODUCTS.find(p => p.id === id);

export const featuredProducts = (n = 12): Product[] =>
  ALL_PRODUCTS.filter(p => p.badge === 'best' || p.badge === 'hot' || p.badge === 'new').slice(0, n);

export const PRODUCT_COUNT = ALL_PRODUCTS.length;
