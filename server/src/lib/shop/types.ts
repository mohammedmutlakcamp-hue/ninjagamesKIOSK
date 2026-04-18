export type ProductCategory =
  | 'gpu' | 'cpu' | 'motherboard' | 'ram' | 'storage' | 'psu'
  | 'case' | 'cooling' | 'monitor' | 'keyboard' | 'mouse'
  | 'headset' | 'controller' | 'prebuilt' | 'laptop' | 'audio';

export type Product = {
  id: string;
  category: ProductCategory;
  brand: string;
  name: string;
  model: string;
  priceJod: number;
  msrpJod?: number | null;
  inStock: boolean;
  stockCount?: number;
  image?: string;
  badge?: 'new' | 'hot' | 'sale' | 'limited' | 'best';
  specs: Record<string, string>;
  description: string;
  tags: string[];
};

export type CategoryMeta = {
  slug: ProductCategory;
  label: string;
  labelAr: string;
  icon: string;
  blurb: string;
  color: string;
};

export type CartItem = {
  productId: string;
  qty: number;
};
