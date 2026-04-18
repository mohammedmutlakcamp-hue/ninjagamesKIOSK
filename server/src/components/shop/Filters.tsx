'use client';
import { useMemo, useState } from 'react';
import type { Product } from '@/lib/shop/types';
import { ChevronDown } from 'lucide-react';

export type FilterState = {
  brands: Set<string>;
  inStockOnly: boolean;
  minPrice: number;
  maxPrice: number;
  badges: Set<string>;
  sort: 'relevance' | 'price-asc' | 'price-desc' | 'name';
};

export const defaultFilters = (): FilterState => ({
  brands: new Set(),
  inStockOnly: false,
  minPrice: 0,
  maxPrice: Infinity,
  badges: new Set(),
  sort: 'relevance',
});

export const applyFilters = (products: Product[], f: FilterState): Product[] => {
  let r = products.filter(p => {
    if (f.brands.size > 0 && !f.brands.has(p.brand)) return false;
    if (f.inStockOnly && !p.inStock) return false;
    if (p.priceJod < f.minPrice || p.priceJod > f.maxPrice) return false;
    if (f.badges.size > 0 && (!p.badge || !f.badges.has(p.badge))) return false;
    return true;
  });
  if (f.sort === 'price-asc')  r = [...r].sort((a, b) => a.priceJod - b.priceJod);
  if (f.sort === 'price-desc') r = [...r].sort((a, b) => b.priceJod - a.priceJod);
  if (f.sort === 'name')       r = [...r].sort((a, b) => a.name.localeCompare(b.name));
  return r;
};

export default function Filters({ products, filters, onChange }: {
  products: Product[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
}) {
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand))).sort(), [products]);
  const maxPrice = useMemo(() => Math.max(...products.map(p => p.priceJod), 100), [products]);

  const [openBrands, setOpenBrands] = useState(true);

  const toggleBrand = (b: string) => {
    const next = new Set(filters.brands);
    next.has(b) ? next.delete(b) : next.add(b);
    onChange({ ...filters, brands: next });
  };

  return (
    <aside className="space-y-6">
      {/* In stock */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={filters.inStockOnly} onChange={e => onChange({ ...filters, inStockOnly: e.target.checked })} className="w-4 h-4 rounded accent-green-500" />
        <span className="text-sm font-medium text-neutral-700">In stock only</span>
      </label>

      {/* Price range */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Price (JOD)</h4>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.minPrice || ''}
            onChange={e => onChange({ ...filters, minPrice: Number(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-neutral-100 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPrice === Infinity ? '' : filters.maxPrice}
            onChange={e => onChange({ ...filters, maxPrice: Number(e.target.value) || Infinity })}
            className="w-full px-3 py-2 bg-neutral-100 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="text-[10px] text-neutral-400 mt-1">Up to {maxPrice} JOD in this category</div>
      </div>

      {/* Brand list */}
      <div>
        <button onClick={() => setOpenBrands(!openBrands)} className="flex items-center justify-between w-full mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Brand</h4>
          <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${openBrands ? '' : '-rotate-90'}`} />
        </button>
        {openBrands && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {brands.map(b => (
              <label key={b} className="flex items-center gap-2 cursor-pointer hover:text-green-700">
                <input type="checkbox" checked={filters.brands.has(b)} onChange={() => toggleBrand(b)} className="w-4 h-4 rounded accent-green-500" />
                <span className="text-sm text-neutral-700">{b}</span>
                <span className="text-[10px] text-neutral-400 ml-auto">{products.filter(p => p.brand === b).length}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
