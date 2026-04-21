'use client';
import { useState, useMemo } from 'react';
import { notFound } from 'next/navigation';
import { motion } from 'framer-motion';
import { getCategory } from '@/lib/shop/categories';
import { productsByCategory } from '@/lib/shop/catalog';
import ProductCard from '@/components/shop/ProductCard';
import Filters, { defaultFilters, applyFilters, type FilterState } from '@/components/shop/Filters';
import { Filter as FilterIcon, X, SlidersHorizontal } from 'lucide-react';

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = getCategory(params.slug);
  if (!cat) notFound();

  const products = useMemo(() => productsByCategory(cat.slug), [cat.slug]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters());
  const [mobileOpen, setMobileOpen] = useState(false);

  const filtered = useMemo(() => applyFilters(products, filters), [products, filters]);
  const hasFilters = filters.brands.size > 0 || filters.inStockOnly || filters.minPrice > 0 || filters.maxPrice < Infinity;

  return (
    <>
      {/* Category hero */}
      <section
        className="border-b border-neutral-100 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${cat.color}12 0%, white 60%)` }}
      >
        {/* Subtle corner accent */}
        <div
          className="absolute top-0 right-0 w-64 h-64 opacity-[0.06] pointer-events-none"
          style={{ background: `radial-gradient(circle at top right, ${cat.color}, transparent 60%)` }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-10 md:py-14 flex items-center gap-5">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
            className="text-5xl md:text-7xl flex-shrink-0"
          >
            {cat.icon}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45, delay: 0.05 }}
          >
            <div
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-1.5"
              style={{ color: cat.color }}
            >
              Category
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              {cat.label}
            </h1>
            <p className="text-sm text-[#525252] mt-1.5">
              {cat.blurb}
              <span className="text-[#a3a3a3]"> · {products.length} products</span>
            </p>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-[260px_1fr] gap-8">

        {/* ─── Mobile filter bar ─── */}
        <div className="lg:hidden flex items-center justify-between gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-semibold text-[#0a0a0a] hover:border-neutral-400 transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#525252]" />
            Filters
            {hasFilters && (
              <span className="w-5 h-5 rounded-full bg-[#39FF14] text-[#0a0a0a] text-[10px] font-bold flex items-center justify-center">
                {filters.brands.size + (filters.inStockOnly ? 1 : 0)}
              </span>
            )}
          </button>
          <select
            value={filters.sort}
            onChange={e => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}
            className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-[#0a0a0a] outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        {/* ─── Desktop sidebar ─── */}
        <motion.div
          className="hidden lg:block"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
        >
          <div className="sticky top-[72px] bg-white rounded-2xl border border-neutral-100 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.06)]">
            <Filters products={products} filters={filters} onChange={setFilters} />
          </div>
        </motion.div>

        {/* ─── Mobile filter sheet ─── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute top-0 left-0 bottom-0 w-[300px] max-w-[85%] bg-white shadow-2xl overflow-y-auto"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
            >
              <div className="flex items-center justify-between p-5 border-b border-neutral-100">
                <h3 className="font-bold text-[#0a0a0a]" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                  Filters
                </h3>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-[#525252]" />
                </button>
              </div>
              <div className="p-5">
                <Filters products={products} filters={filters} onChange={setFilters} />
              </div>
              <div className="p-5 border-t border-neutral-100">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-full py-3 rounded-xl bg-[#0a0a0a] text-white font-semibold text-sm"
                >
                  Show {filtered.length} results
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ─── Product grid ─── */}
        <div>
          {/* Sort + count bar — desktop */}
          <div className="hidden lg:flex items-center justify-between mb-6">
            <p className="text-sm text-[#525252]">
              <span className="font-semibold text-[#0a0a0a]">{filtered.length}</span> of {products.length} products
            </p>
            <select
              value={filters.sort}
              onChange={e => setFilters({ ...filters, sort: e.target.value as FilterState['sort'] })}
              className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-[#0a0a0a] outline-none hover:border-neutral-300 transition-colors"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name">Name: A-Z</option>
            </select>
          </div>

          {/* Active filters pill list */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mb-5">
              {Array.from(filters.brands).map(b => (
                <button
                  key={b}
                  onClick={() => {
                    const next = new Set(filters.brands);
                    next.delete(b);
                    setFilters({ ...filters, brands: next });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[#0a0a0a] text-white text-xs rounded-full font-medium"
                >
                  {b} <X className="w-3 h-3" />
                </button>
              ))}
              {filters.inStockOnly && (
                <button
                  onClick={() => setFilters({ ...filters, inStockOnly: false })}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[#0a0a0a] text-white text-xs rounded-full font-medium"
                >
                  In stock <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-100 p-14 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="text-5xl mb-4">🔍</div>
              <h3
                className="font-bold text-lg text-[#0a0a0a]"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                No products match these filters
              </h3>
              <p className="text-sm text-[#525252] mt-1.5">
                Try widening your price range or clearing brand filters.
              </p>
              <button
                onClick={() => setFilters(defaultFilters())}
                className="mt-5 px-5 py-2.5 bg-[#0a0a0a] text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <ProductCard product={p} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
