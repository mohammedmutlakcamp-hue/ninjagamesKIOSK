'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/shop/types';
import { getCategory } from '@/lib/shop/categories';
import ProductImage from './ProductImage';
import DeliveryBadge from './DeliveryBadge';
import { useCart } from '@/lib/shop/cart-store';
import { X, ShoppingCart, ArrowRight, Check, ShieldCheck, Truck, Wrench } from 'lucide-react';

const BADGE_STYLE: Record<string, { label: string; cls: string }> = {
  new:     { label: 'NEW',     cls: 'bg-blue-500 text-white' },
  hot:     { label: 'HOT',     cls: 'bg-red-500 text-white' },
  sale:    { label: 'SALE',    cls: 'bg-orange-500 text-white' },
  limited: { label: 'LIMITED', cls: 'bg-purple-500 text-white' },
  best:    { label: 'BEST',    cls: 'bg-[#39FF14] text-black' },
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
    <div className="fixed inset-0 z-[8000] flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
         onClick={onClose}>
      <div className="relative bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl grid md:grid-cols-2 animate-slideUp"
           onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur shadow-md hover:bg-white hover:scale-110 transition-all flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>

        {/* Image side */}
        <div className="relative bg-neutral-50 p-6 md:p-10 flex items-center justify-center">
          <div className="w-full max-w-sm">
            <ProductImage product={product} size="lg" className="!aspect-square" />
          </div>
          {product.badge && (
            <span className={`absolute top-4 left-4 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded ${BADGE_STYLE[product.badge].cls}`}>
              {BADGE_STYLE[product.badge].label}
            </span>
          )}
        </div>

        {/* Details side */}
        <div className="p-6 md:p-8 overflow-y-auto" style={{ maxHeight: '90vh' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-500">{product.brand}</span>
            <span className="text-[10px] text-neutral-300">·</span>
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: cat.color }}>
              {cat.icon} {cat.label}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold leading-tight mt-1">{product.name}</h2>
          <div className="text-[10px] font-mono text-neutral-400 mt-0.5">{product.model}</div>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-tight">{product.priceJod}</span>
            <span className="text-sm text-neutral-500">JOD</span>
            {product.msrpJod && product.msrpJod > product.priceJod && (
              <>
                <span className="text-sm text-neutral-400 line-through">{product.msrpJod} JOD</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded">−{discount}%</span>
              </>
            )}
          </div>

          <div className="mt-3"><DeliveryBadge productId={product.id} inStock={product.inStock} /></div>

          {product.inStock ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
              <Check className="w-3.5 h-3.5" /> In stock — {product.stockCount} units in Amman
            </div>
          ) : (
            <div className="mt-2 text-xs text-orange-600">Order from supplier · 5-7 working days</div>
          )}

          {/* Quick specs (top 4) */}
          {Object.keys(product.specs).length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-1.5">
              {Object.entries(product.specs).slice(0, 4).map(([k, v]) => (
                <div key={k} className="bg-neutral-50 rounded-lg p-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">{k.replace(/_/g, ' ')}</div>
                  <div className="text-xs font-semibold text-neutral-800 mt-0.5 line-clamp-1">{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Qty + Add */}
          <div className="mt-5 flex gap-2">
            <div className="flex items-center bg-neutral-100 rounded-xl">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-9 h-11 hover:bg-neutral-200 rounded-l-xl">−</button>
              <span className="w-8 text-center text-sm font-bold">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="w-9 h-11 hover:bg-neutral-200 rounded-r-xl">+</button>
            </div>
            <button onClick={handleAdd}
              className={`flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${added ? 'bg-green-500 text-white' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}>
              {added ? '✓ Added' : <><ShoppingCart className="w-4 h-4" /> Add · {(product.priceJod * qty).toLocaleString()} JOD</>}
            </button>
          </div>

          <Link href={`/ghanemshopidea/p/${product.id}`} onClick={onClose}
                className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-green-600 group">
            View full details <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Trust strip */}
          <div className="mt-5 grid grid-cols-3 gap-1.5 pt-4 border-t border-neutral-100">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-600"><ShieldCheck className="w-3 h-3 text-green-600 flex-shrink-0" /> 1-yr warranty</div>
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-600"><Wrench className="w-3 h-3 text-green-600 flex-shrink-0" /> Free assembly</div>
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-600"><Truck className="w-3 h-3 text-green-600 flex-shrink-0" /> Cash on delivery</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.25s ease-out; }
      `}</style>
    </div>
  );
}
