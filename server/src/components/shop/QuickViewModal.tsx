'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product } from '@/lib/shop/types';
import { getCategory } from '@/lib/shop/categories';
import ProductImage from './ProductImage';
import DeliveryBadge from './DeliveryBadge';
import { useCart } from '@/lib/shop/cart-store';
import { X, ShoppingCart, ArrowRight, Check, ShieldCheck, Truck, Wrench, Minus, Plus } from 'lucide-react';

const BADGE_MAP: Record<string, { label: string; bg: string; text: string }> = {
  new:     { label: 'NEW',     bg: '#dbeafe', text: '#1d4ed8' },
  hot:     { label: 'HOT',     bg: '#fee2e2', text: '#dc2626' },
  sale:    { label: 'SALE',    bg: '#fff7ed', text: '#ea580c' },
  limited: { label: 'LIMITED', bg: '#f3e8ff', text: '#9333ea' },
  best:    { label: 'BEST',    bg: '#39FF14', text: '#0a0a0a' },
};

export default function QuickViewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const add = useCart(s => s.add);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const cat = getCategory(product.category)!;
  const handleAdd = () => {
    add(product.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };
  const discount = product.msrpJod && product.msrpJod > product.priceJod
    ? Math.round((1 - product.priceJod / product.msrpJod) * 100)
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[8000] flex items-center justify-center px-4 py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[#0a0a0a]/50 backdrop-blur-sm" />

        <motion.div
          className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.28)] grid md:grid-cols-2"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-neutral-50 hover:scale-105 transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#525252]" />
          </button>

          {/* Image side */}
          <div className="relative bg-[#fafafa] p-8 md:p-10 flex items-center justify-center rounded-l-3xl overflow-hidden">
            {/* Category color wash */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{ background: cat.color }}
            />
            <div className="relative w-full max-w-xs group">
              <ProductImage product={product} size="lg" className="!border-0" />
            </div>
            {product.badge && BADGE_MAP[product.badge] && (
              <span
                className="absolute top-4 left-4 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-lg"
                style={{ background: BADGE_MAP[product.badge].bg, color: BADGE_MAP[product.badge].text }}
              >
                {BADGE_MAP[product.badge].label}
              </span>
            )}
          </div>

          {/* Details side */}
          <div className="p-6 md:p-8 overflow-y-auto" style={{ maxHeight: '90vh' }}>
            {/* Brand + category row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#a3a3a3]">
                {product.brand}
              </span>
              <span className="text-[#a3a3a3]">·</span>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: `${cat.color}18`, color: cat.color }}
              >
                {cat.icon} {cat.label}
              </span>
            </div>

            <h2
              className="text-xl md:text-2xl font-bold leading-tight mt-1.5 text-[#0a0a0a]"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              {product.name}
            </h2>
            <div className="text-[10px] font-mono text-[#a3a3a3] mt-0.5">{product.model}</div>

            {/* Price */}
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-[#0a0a0a]">
                {product.priceJod}
              </span>
              <span className="text-sm text-[#a3a3a3] font-medium">JOD</span>
              {product.msrpJod && product.msrpJod > product.priceJod && (
                <>
                  <span className="text-base text-[#a3a3a3] line-through">{product.msrpJod} JOD</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded-lg">
                    −{discount}%
                  </span>
                </>
              )}
            </div>

            {/* Delivery + stock */}
            <div className="mt-3">
              <DeliveryBadge productId={product.id} inStock={product.inStock} />
            </div>
            {product.inStock ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" /> In stock — {product.stockCount} units in Amman
              </div>
            ) : (
              <div className="mt-1.5 text-xs text-amber-600 font-medium">
                Order from supplier · 5-7 working days
              </div>
            )}

            {/* Quick specs */}
            {Object.keys(product.specs).length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-1.5">
                {Object.entries(product.specs).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="bg-[#f8f8f8] rounded-xl p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#a3a3a3]">
                      {k.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs font-semibold text-[#0a0a0a] mt-0.5 line-clamp-1">{v}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Qty + Add */}
            <div className="mt-5 flex gap-2">
              <div className="flex items-center bg-[#f5f5f5] rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-10 h-12 hover:bg-neutral-200 flex items-center justify-center transition-colors"
                >
                  <Minus className="w-3.5 h-3.5 text-[#525252]" />
                </button>
                <span className="w-9 text-center text-sm font-bold text-[#0a0a0a]">{qty}</span>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-10 h-12 hover:bg-neutral-200 flex items-center justify-center transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[#525252]" />
                </button>
              </div>
              <button
                onClick={handleAdd}
                className={`flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  added
                    ? 'bg-[#39FF14] text-[#0a0a0a]'
                    : 'bg-[#0a0a0a] text-white hover:bg-neutral-800'
                }`}
              >
                {added ? (
                  <><Check className="w-4 h-4" /> Added</>
                ) : (
                  <><ShoppingCart className="w-4 h-4" /> Add · {(product.priceJod * qty).toLocaleString()} JOD</>
                )}
              </button>
            </div>

            <Link
              href={`/ghanemshopidea/p/${product.id}`}
              onClick={onClose}
              className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#525252] hover:text-[#0a0a0a] group transition-colors"
            >
              View full details
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Trust strip */}
            <div className="mt-5 grid grid-cols-3 gap-1.5 pt-4 border-t border-neutral-100">
              {[
                { icon: ShieldCheck, label: '1-yr warranty' },
                { icon: Wrench, label: 'Free assembly' },
                { icon: Truck, label: 'Cash on delivery' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] text-[#525252]">
                  <Icon className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
