'use client';
import Link from 'next/link';
import type { Product } from '@/lib/shop/types';
import ProductImage from './ProductImage';
import DeliveryBadge from './DeliveryBadge';
import { useCart } from '@/lib/shop/cart-store';
import { Plus, Eye, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import QuickViewModal from './QuickViewModal';

const BADGE_STYLE: Record<string, { label: string; cls: string }> = {
  new:     { label: 'NEW',     cls: 'bg-blue-500 text-white' },
  hot:     { label: 'HOT',     cls: 'bg-red-500 text-white' },
  sale:    { label: 'SALE',    cls: 'bg-orange-500 text-white' },
  limited: { label: 'LIMITED', cls: 'bg-purple-500 text-white' },
  best:    { label: 'BEST',    cls: 'bg-[#39FF14] text-black' },
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

  return (
    <>
      <Link href={`/ghanemshopidea/p/${product.id}`}
            className="group relative block bg-white rounded-2xl border border-neutral-200 overflow-hidden transition-all duration-300 hover:border-neutral-300 hover:shadow-[0_12px_36px_-8px_rgba(0,0,0,0.15)] hover:-translate-y-1">
        <div className="relative">
          <ProductImage product={product} size="md" />

          {/* Badges */}
          {product.badge && (
            <span className={`absolute top-3 left-3 text-[10px] font-bold tracking-wider px-2 py-1 rounded ${BADGE_STYLE[product.badge].cls}`}>
              {BADGE_STYLE[product.badge].label}
            </span>
          )}
          {discount > 0 && (
            <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded bg-red-500 text-white">−{discount}%</span>
          )}

          {/* Hover overlay — iGeek-style action buttons that fade in */}
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto">
            <button onClick={openQuick}
                    className="flex-1 h-10 bg-white/95 backdrop-blur border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 hover:bg-white hover:border-green-400 transition-colors flex items-center justify-center gap-1.5 shadow-lg">
              <Eye className="w-3.5 h-3.5" /> Quick View
            </button>
            <button onClick={handleAdd}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-lg transition-all flex-shrink-0 ${added ? 'bg-green-500 text-white scale-110' : 'bg-neutral-900 text-white hover:bg-green-500'}`}
                    aria-label="Add to cart">
              {added ? '✓' : <ShoppingCart className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="text-[11px] font-bold tracking-wider uppercase text-neutral-500 mb-1">{product.brand}</div>
          <h3 className="text-sm font-semibold text-neutral-900 line-clamp-2 leading-tight min-h-[2.5rem] group-hover:text-green-700 transition-colors">{product.name}</h3>
          <div className="mt-2"><DeliveryBadge productId={product.id} inStock={product.inStock} compact /></div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-neutral-900">{product.priceJod}</span>
                <span className="text-xs text-neutral-500">JOD</span>
              </div>
              {product.msrpJod && product.msrpJod > product.priceJod && (
                <div className="text-[11px] text-neutral-400 line-through">{product.msrpJod} JOD</div>
              )}
            </div>
            {/* Mobile-only add button (always visible, since hover doesn't work on touch) */}
            <button onClick={handleAdd}
              className={`md:hidden flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${added ? 'bg-green-500 text-white scale-110' : 'bg-neutral-900 text-white'}`}
              aria-label="Add to cart">
              {added ? '✓' : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </Link>

      {quickOpen && <QuickViewModal product={product} onClose={() => setQuickOpen(false)} />}
    </>
  );
}
