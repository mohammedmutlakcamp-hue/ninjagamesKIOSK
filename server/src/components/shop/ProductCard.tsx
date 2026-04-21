'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Product, ProductCategory } from '@/lib/shop/types';
import ProductImage from './ProductImage';
import DeliveryBadge from './DeliveryBadge';
import { useCart } from '@/lib/shop/cart-store';
import { ShoppingCart, Eye, Check, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import QuickViewModal from './QuickViewModal';

// Categories where the "Tested in our cafe" badge shows
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

export default function ProductCard({ product }: { product: Product }) {
  const add = useCart(s => s.add);
  const [added, setAdded] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add(product.id, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const openQuick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setQuickOpen(true);
  };

  const discount = product.msrpJod && product.msrpJod > product.priceJod
    ? Math.round((1 - product.priceJod / product.msrpJod) * 100)
    : 0;

  const showTestedBadge = HARDWARE_CATS.includes(product.category);

  return (
    <>
      <Link
        href={`/ghanemshopidea/p/${product.id}`}
        className="group relative flex flex-col bg-white rounded-2xl overflow-hidden transition-all duration-300 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.10)] hover:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.18)] hover:-translate-y-1"
      >
        {/* Image container */}
        <div className="relative overflow-hidden">
          {/* ProductImage does its own aspect-ratio */}
          <div className="relative">
            <ProductImage product={product} size="md" />

            {/* Image hover scale is applied inside ProductImage via group-hover:scale-105 */}

            {/* Top badges */}
            {product.badge && BADGE_MAP[product.badge] && (
              <span
                className="absolute top-3 left-3 z-10 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-lg"
                style={{
                  background: BADGE_MAP[product.badge].bg,
                  color: BADGE_MAP[product.badge].text,
                }}
              >
                {BADGE_MAP[product.badge].label}
              </span>
            )}
            {discount > 0 && (
              <span className="absolute top-3 right-3 z-10 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-100 text-red-600">
                −{discount}%
              </span>
            )}

            {/* Hover action bar — slides up from bottom */}
            <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none group-hover:pointer-events-auto">
              <div className="p-2.5 pt-6 bg-gradient-to-t from-white/95 via-white/80 to-transparent flex items-center gap-2">
                <button
                  onClick={openQuick}
                  className="flex-1 h-9 bg-white border border-neutral-200 rounded-xl text-[11px] font-semibold text-[#0a0a0a] hover:border-[#39FF14] hover:bg-[#39FF14]/6 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Eye className="w-3.5 h-3.5" /> Quick View
                </button>
                <button
                  onClick={handleAdd}
                  aria-label="Add to cart"
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-sm transition-all flex-shrink-0 ${
                    added
                      ? 'bg-[#39FF14] text-[#0a0a0a] scale-105'
                      : 'bg-[#0a0a0a] text-white hover:bg-neutral-700'
                  }`}
                >
                  {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card body */}
        <div className="flex flex-col flex-1 p-4 gap-1">
          {/* Brand */}
          <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#a3a3a3]">
            {product.brand}
          </div>

          {/* Name */}
          <h3 className="text-sm font-semibold text-[#0a0a0a] line-clamp-2 leading-snug min-h-[2.6rem] group-hover:text-emerald-700 transition-colors">
            {product.name}
          </h3>

          {/* Tested-in-cafe trust badge */}
          {showTestedBadge && (
            <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 self-start mt-0.5">
              <FlaskConical className="w-2.5 h-2.5 flex-shrink-0" />
              <span>Tested in our cafe</span>
            </div>
          )}

          {/* Delivery */}
          <div className="mt-1">
            <DeliveryBadge productId={product.id} inStock={product.inStock} compact />
          </div>

          {/* Price row */}
          <div className="mt-auto pt-2 flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-[#0a0a0a]">{product.priceJod}</span>
                <span className="text-xs text-[#a3a3a3] font-medium">JOD</span>
              </div>
              {product.msrpJod && product.msrpJod > product.priceJod && (
                <div className="text-[11px] text-[#a3a3a3] line-through leading-none">
                  {product.msrpJod} JOD
                </div>
              )}
            </div>

            {/* Mobile add button (always visible on touch devices) */}
            <button
              onClick={handleAdd}
              aria-label="Add to cart"
              className={`md:hidden w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                added
                  ? 'bg-[#39FF14] text-[#0a0a0a] scale-105'
                  : 'bg-[#0a0a0a] text-white'
              }`}
            >
              {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </Link>

      {quickOpen && (
        <QuickViewModal product={product} onClose={() => setQuickOpen(false)} />
      )}
    </>
  );
}
