'use client';
import { useMemo, useState } from 'react';
import type { Product } from '@/lib/shop/types';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

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

  const hasActive = filters.brands.size > 0 || filters.inStockOnly || filters.minPrice > 0 || filters.maxPrice < Infinity;

  return (
    <aside className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100">
        <div className="flex items-center gap-2 text-[#0a0a0a]">
          <SlidersHorizontal className="w-4 h-4 text-[#a3a3a3]" />
          <span className="text-sm font-semibold">Filters</span>
          {hasActive && (
            <span className="w-5 h-5 rounded-full bg-[#39FF14] text-[#0a0a0a] text-[10px] font-bold flex items-center justify-center">
              {filters.brands.size + (filters.inStockOnly ? 1 : 0) + (filters.minPrice > 0 || filters.maxPrice < Infinity ? 1 : 0)}
            </span>
          )}
        </div>
        {hasActive && (
          <button
            onClick={() => onChange(defaultFilters())}
            className="text-[11px] text-[#525252] hover:text-[#0a0a0a] font-medium transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* In stock toggle */}
      <label className="flex items-center justify-between gap-2 cursor-pointer py-2.5 px-3 rounded-xl hover:bg-neutral-50 transition-colors group">
        <span className="text-sm font-medium text-[#525252] group-hover:text-[#0a0a0a] transition-colors">
          In stock only
        </span>
        {/* Toggle switch */}
        <div
          className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${
            filters.inStockOnly ? 'bg-[#39FF14]' : 'bg-neutral-200'
          }`}
          style={{ height: '22px' }}
        >
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={e => onChange({ ...filters, inStockOnly: e.target.checked })}
            className="sr-only"
          />
          <div
            className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
              filters.inStockOnly ? 'translate-x-[21px]' : 'translate-x-0.5'
            }`}
          />
        </div>
      </label>

      {/* Price range */}
      <div className="py-3 px-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a3a3a3] mb-3">
          Price (JOD)
        </h4>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Min"
              value={filters.minPrice || ''}
              onChange={e => onChange({ ...filters, minPrice: Number(e.target.value) || 0 })}
              className="w-full px-3 py-2.5 bg-[#f5f5f5] rounded-xl text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none focus:bg-white focus:ring-2 focus:ring-[#39FF14] transition-all"
            />
          </div>
          <div className="flex items-center text-[#a3a3a3] text-xs font-medium">–</div>
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Max"
              value={filters.maxPrice === Infinity ? '' : filters.maxPrice}
              onChange={e => onChange({ ...filters, maxPrice: Number(e.target.value) || Infinity })}
              className="w-full px-3 py-2.5 bg-[#f5f5f5] rounded-xl text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none focus:bg-white focus:ring-2 focus:ring-[#39FF14] transition-all"
            />
          </div>
        </div>
        <p className="text-[10px] text-[#a3a3a3] mt-1.5">Up to {maxPrice} JOD in this category</p>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-100 mx-3" />

      {/* Brand list */}
      <div className="py-3 px-3">
        <button
          onClick={() => setOpenBrands(!openBrands)}
          className="flex items-center justify-between w-full mb-2"
        >
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a3a3a3]">Brand</h4>
          <ChevronDown
            className={`w-4 h-4 text-[#a3a3a3] transition-transform duration-200 ${openBrands ? '' : '-rotate-90'}`}
          />
        </button>
        {openBrands && (
          <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1 -mr-1">
            {brands.map(b => {
              const checked = filters.brands.has(b);
              return (
                <label
                  key={b}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-[#39FF14]/8' : 'hover:bg-neutral-50'
                  }`}
                >
                  {/* Custom checkbox */}
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                      checked
                        ? 'bg-[#0a0a0a] border-[#0a0a0a]'
                        : 'border-neutral-300'
                    }`}
                  >
                    {checked && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="#39FF14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBrand(b)}
                    className="sr-only"
                  />
                  <span className="text-sm text-[#525252] flex-1 leading-none">{b}</span>
                  <span className="text-[10px] text-[#a3a3a3]">
                    {products.filter(p => p.brand === b).length}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
