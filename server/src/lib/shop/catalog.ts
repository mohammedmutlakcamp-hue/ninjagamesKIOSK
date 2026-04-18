import type { Product, ProductCategory } from './types';
import igeekCache from './data/igeek-cache.json';
import { PREBUILTS } from './data/prebuilts';

// Real product catalog: 410+ items scraped from iGeek Jordan (igeekjo.com)
// via scripts/scrape-igeek.js. JOD prices, real Shopify CDN images, real SKUs.
// Re-run the scraper to refresh: `node scripts/scrape-igeek.js`
//
// Pre-builts are kept synthetic on purpose — they represent Ninja Games' OWN
// custom builds (Genin/Chunin/Jonin/Kage tiers) that aren't sold by iGeek.

const igeekProducts: Product[] = Object.values(igeekCache as unknown as Record<string, Product[]>).flat();

// Deterministic stock count override based on product id, so SSR + CSR
// agree (the scraped inStock flag is preserved; this only sets the unit count).
const stockOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return (Math.abs(h) % 12) + 2;
};

export const ALL_PRODUCTS: Product[] = [
  ...igeekProducts,
  ...PREBUILTS,
].map(p => ({ ...p, stockCount: p.inStock ? stockOf(p.id) : 0 }));

export const productsByCategory = (cat: ProductCategory): Product[] =>
  ALL_PRODUCTS.filter(p => p.category === cat);

export const getProduct = (id: string): Product | undefined =>
  ALL_PRODUCTS.find(p => p.id === id);

export const featuredProducts = (n = 12): Product[] => {
  // Mix of high-margin categories that look good in the hero
  const picks = [
    ...productsByCategory('gpu').slice(0, 3),
    ...productsByCategory('laptop').slice(0, 3),
    ...productsByCategory('controller').slice(0, 2),
    ...productsByCategory('headset').slice(0, 2),
    ...productsByCategory('monitor').slice(0, 2),
  ];
  return picks.slice(0, n);
};

export const PRODUCT_COUNT = ALL_PRODUCTS.length;
