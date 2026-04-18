'use client';
import { useState, useMemo } from 'react';
import { notFound } from 'next/navigation';
import { getCategory } from '@/lib/shop/categories';
import { productsByCategory } from '@/lib/shop/catalog';
import ProductCard from '@/components/shop/ProductCard';
import Filters, { defaultFilters, applyFilters, type FilterState } from '@/components/shop/Filters';
import { Filter as FilterIcon, X } from 'lucide-react';

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = getCategory(params.slug);
  if (!cat) notFound();

  const products = useMemo(() => productsByCategory(cat.slug), [cat.slug]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters());
  const [mobileOpen, setMobileOpen] = useState(false);

  const filtered = useMemo(() => applyFilters(products, filters), [products, filters]);

  return (
    <>
      {/* Category hero */}
      <section className="border-b border-neutral-200" style={{ background: `linear-gradient(135deg, ${cat.color}15, white)` }}>
        <div className="max-w-7xl mx-auto px-6 py-10 flex items-end gap-5">
          <div className="text-6xl">{cat.icon}</div>
          <div>
            <div className="text-xs font-bold tracking-widest uppercase" style={{ color: cat.color }}>Category</div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">{cat.label}</h1>
            <p className="text-sm text-neutral-600 mt-1">{cat.blurb} · {products.length} products</p>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-[240px_1fr] gap-8">
        {/* Mobile filter button */}
        <div className="lg:hidden flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-semibold">
            <FilterIcon className="w-4 h-4" /> Filters
          </button>
          <select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}
            className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm">
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="name">Name</option>
          </select>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block">
          <Filters products={products} filters={filters} onChange={setFilters} />
        </div>

        {/* Mobile filter sheet */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute top-0 left-0 bottom-0 w-80 max-w-[85%] bg-white p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Filters</h3>
                <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5" /></button>
              </div>
              <Filters products={products} filters={filters} onChange={setFilters} />
            </div>
          </div>
        )}

        {/* Product grid */}
        <div>
          <div className="hidden lg:flex items-center justify-between mb-4">
            <div className="text-sm text-neutral-600">{filtered.length} of {products.length} products</div>
            <select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}
              className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium">
              <option value="relevance">Sort: Relevance</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name">Name: A-Z</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
              <div className="text-5xl mb-3">🔍</div>
              <h3 className="font-bold text-lg">No products match these filters</h3>
              <p className="text-sm text-neutral-500 mt-1">Try widening your price range or clearing brand filters.</p>
              <button onClick={() => setFilters(defaultFilters())} className="mt-4 px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-medium">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
