'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { getProduct, productsByCategory } from '@/lib/shop/catalog';
import { getCategory } from '@/lib/shop/categories';
import ProductImage from '@/components/shop/ProductImage';
import ProductCard from '@/components/shop/ProductCard';
import DeliveryBadge from '@/components/shop/DeliveryBadge';
import ProductTabs from '@/components/shop/ProductTabs';
import { useCart, SHOP_WHATSAPP } from '@/lib/shop/cart-store';
import {
  ShieldCheck, Wrench, Truck, ChevronRight,
  Plus, Minus, Check, MessageCircle, FlaskConical,
} from 'lucide-react';
import type { ProductCategory } from '@/lib/shop/types';

const HARDWARE_CATS: ProductCategory[] = [
  'gpu', 'cpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling', 'prebuilt',
];

const BADGE_MAP: Record<string, { label: string; bg: string; text: string }> = {
  new:     { label: 'NEW',     bg: '#dbeafe', text: '#1d4ed8' },
  hot:     { label: 'HOT',     bg: '#fee2e2', text: '#dc2626' },
  sale:    { label: 'SALE',    bg: '#fff7ed', text: '#ea580c' },
  limited: { label: 'LIMITED', bg: '#f3e8ff', text: '#9333ea' },
  best:    { label: 'BEST',    bg: '#39FF14', text: '#0a0a0a' },
};

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) notFound();

  const cat = getCategory(product.category)!;
  const add = useCart(s => s.add);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const related = useMemo(
    () => productsByCategory(product.category).filter(p => p.id !== product.id).slice(0, 4),
    [product]
  );

  // Show sticky bar after scrolling past the hero
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  const handleAdd = () => {
    add(product.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const discount = product.msrpJod && product.msrpJod > product.priceJod
    ? Math.round((1 - product.priceJod / product.msrpJod) * 100)
    : 0;

  const showTestedBadge = HARDWARE_CATS.includes(product.category);

  return (
    <>
      {/* Breadcrumb */}
      <div className="bg-white border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-1 text-xs text-[#a3a3a3] overflow-x-auto whitespace-nowrap">
          <Link href="/ghanemshopidea" className="hover:text-[#0a0a0a] transition-colors">Shop</Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <Link href={`/ghanemshopidea/c/${cat.slug}`} className="hover:text-[#0a0a0a] transition-colors">
            {cat.label}
          </Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-[#525252] truncate max-w-[200px]">{product.name}</span>
        </div>
      </div>

      {/* ─── Main product section ─── */}
      <div className="max-w-7xl mx-auto px-6 py-10 grid md:grid-cols-2 gap-12">

        {/* Image column */}
        <div ref={heroRef}>
          <div className="group">
            <ProductImage product={product} size="lg" className="!aspect-square" />
          </div>
          {/* Thumbnail row (decorative — all same image since we only have one) */}
          <div className="grid grid-cols-4 gap-2.5 mt-3">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-colors cursor-pointer ${
                  i === 0 ? 'border-[#39FF14]' : 'border-neutral-100 opacity-40 hover:opacity-70'
                }`}
              >
                <ProductImage product={product} size="sm" className="!rounded-none !border-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Details column */}
        <div className="flex flex-col gap-5">
          {/* Brand + category */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#a3a3a3]">
              {product.brand}
            </span>
            <span className="text-[#e5e5e5]">·</span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: `${cat.color}18`, color: cat.color }}
            >
              {cat.icon} {cat.label}
            </span>
            {product.badge && BADGE_MAP[product.badge] && (
              <>
                <span className="text-[#e5e5e5]">·</span>
                <span
                  className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-lg"
                  style={{ background: BADGE_MAP[product.badge].bg, color: BADGE_MAP[product.badge].text }}
                >
                  {BADGE_MAP[product.badge].label}
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold tracking-tight text-[#0a0a0a] leading-tight"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              {product.name}
            </h1>
            <div className="text-xs font-mono text-[#a3a3a3] mt-1">{product.model}</div>
          </div>

          {/* Tested ribbon */}
          {showTestedBadge && (
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-[#39FF14]/8 border border-[#39FF14]/20 rounded-xl self-start">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
              <span className="text-xs font-semibold text-emerald-700">Tested in our cafe</span>
            </div>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span
              className="text-4xl font-bold tracking-tight text-[#0a0a0a]"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              {product.priceJod}
            </span>
            <span className="text-base text-[#a3a3a3] font-medium">JOD</span>
            {product.msrpJod && product.msrpJod > product.priceJod && (
              <>
                <span className="text-lg text-[#a3a3a3] line-through">{product.msrpJod} JOD</span>
                <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-600 rounded-lg">
                  −{discount}%
                </span>
              </>
            )}
          </div>

          {/* Delivery + stock */}
          <div className="space-y-1.5">
            <DeliveryBadge productId={product.id} inStock={product.inStock} />
            {product.inStock ? (
              <div className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium">
                <Check className="w-4 h-4 flex-shrink-0" />
                In stock — {product.stockCount} units in Amman warehouse
              </div>
            ) : (
              <div className="text-sm text-amber-600 font-medium">
                Order from supplier · 5-7 working days
              </div>
            )}
          </div>

          {/* Quick specs */}
          {Object.keys(product.specs).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(product.specs).slice(0, 4).map(([k, v]) => (
                <div key={k} className="bg-[#f8f8f8] rounded-xl p-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#a3a3a3]">
                    {k.replace(/_/g, ' ')}
                  </div>
                  <div className="text-sm font-semibold text-[#0a0a0a] mt-0.5 line-clamp-1">{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Qty + Add to cart */}
          <div className="flex items-stretch gap-3">
            <div className="flex items-center bg-[#f5f5f5] rounded-xl overflow-hidden">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-11 h-12 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              >
                <Minus className="w-4 h-4 text-[#525252]" />
              </button>
              <span className="w-10 text-center font-bold text-[#0a0a0a]">{qty}</span>
              <button
                onClick={() => setQty(qty + 1)}
                className="w-11 h-12 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              >
                <Plus className="w-4 h-4 text-[#525252]" />
              </button>
            </div>
            <button
              onClick={handleAdd}
              className={`flex-1 h-12 rounded-xl font-semibold text-sm transition-all ${
                added
                  ? 'bg-[#39FF14] text-[#0a0a0a]'
                  : 'bg-[#0a0a0a] text-white hover:bg-neutral-800'
              }`}
            >
              {added
                ? <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Added to Cart</span>
                : `Add to Cart · ${(product.priceJod * qty).toLocaleString()} JOD`
              }
            </button>
          </div>

          {/* Buy now button */}
          <Link
            href="/ghanemshopidea/cart"
            className="w-full h-12 rounded-xl border-2 border-[#0a0a0a] text-[#0a0a0a] font-semibold text-sm flex items-center justify-center hover:bg-neutral-50 transition-colors"
          >
            Buy Now
          </Link>

          {/* WhatsApp inquiry */}
          <a
            href={`https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(`Hi, I'm interested in: ${product.name} (${product.model}) — ${product.priceJod} JOD`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Inquire on WhatsApp
          </a>

          {/* Trust icons */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: ShieldCheck, label: '1-year warranty' },
              { icon: Wrench,      label: 'Free assembly' },
              { icon: Truck,       label: 'Cash on delivery' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="bg-white border border-neutral-100 rounded-xl p-3 flex flex-col items-center text-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <Icon className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                <div className="text-[10px] font-semibold text-[#525252] leading-tight">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <ProductTabs product={product} />

      {/* ─── Related products ─── */}
      <section className="max-w-7xl mx-auto px-6 py-14">
        <h2
          className="text-2xl md:text-3xl font-bold tracking-tight text-[#0a0a0a] mb-7"
          style={{ fontFamily: 'var(--font-display, system-ui)' }}
        >
          More in {cat.label}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {related.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ─── Sticky bottom add-to-cart bar ─── */}
      <AnimatePresence>
        {stickyVisible && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[300] bg-white border-t border-neutral-100 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.12)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
          >
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
              {/* Product info */}
              <div className="hidden sm:block w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-[#fafafa] border border-neutral-100">
                <ProductImage product={product} size="sm" className="!rounded-none !border-0" />
              </div>
              <div className="flex-1 min-w-0 hidden sm:block">
                <div className="text-sm font-semibold text-[#0a0a0a] truncate">{product.name}</div>
                <div className="text-xs text-[#a3a3a3]">{product.brand}</div>
              </div>

              {/* Price */}
              <div className="flex-shrink-0 text-right hidden md:block">
                <div className="text-lg font-bold text-[#0a0a0a]">{product.priceJod * qty} JOD</div>
                {discount > 0 && (
                  <div className="text-[11px] text-red-500 font-medium">−{discount}% off</div>
                )}
              </div>

              {/* Qty stepper */}
              <div className="flex items-center bg-[#f5f5f5] rounded-xl overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-9 h-10 flex items-center justify-center hover:bg-neutral-200 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5 text-[#525252]" />
                </button>
                <span className="w-8 text-center text-sm font-bold text-[#0a0a0a]">{qty}</span>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-9 h-10 flex items-center justify-center hover:bg-neutral-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[#525252]" />
                </button>
              </div>

              {/* Add to cart */}
              <button
                onClick={handleAdd}
                className={`flex-shrink-0 px-6 h-11 rounded-xl font-semibold text-sm transition-all ${
                  added
                    ? 'bg-[#39FF14] text-[#0a0a0a]'
                    : 'bg-[#0a0a0a] text-white hover:bg-neutral-800'
                }`}
              >
                {added
                  ? <span className="flex items-center gap-1.5"><Check className="w-4 h-4" /> Added</span>
                  : 'Add to Cart'
                }
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom spacing so sticky bar doesn't overlap footer */}
      {stickyVisible && <div className="h-20" />}
    </>
  );
}
