'use client';
import { useState } from 'react';
import type { Product } from '@/lib/shop/types';
import { getCategory } from '@/lib/shop/categories';

// Real product photo from Shopify CDN when available; branded SVG placeholder
// otherwise (e.g. for the synthetic Ninja Games pre-built PCs).
export default function ProductImage({ product, size = 'md', className = '' }: {
  product: Product;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const cat = getCategory(product.category);
  const color = cat?.color || '#39FF14';
  const [errored, setErrored] = useState(false);
  const useReal = product.image && !errored;

  if (useReal) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className}`} style={{ aspectRatio: '1/1' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-contain p-3"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  // SVG placeholder fallback
  const bgGrad = `linear-gradient(135deg, ${color}15 0%, ${color}05 50%, #ffffff 100%)`;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className}`} style={{ background: bgGrad, aspectRatio: '1/1' }}>
      <div className="absolute top-0 right-0 w-1/2 h-1/2 opacity-10" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl md:text-6xl mb-2 opacity-90">{cat?.icon || '📦'}</div>
        <div className="text-xs font-bold tracking-widest uppercase opacity-60" style={{ color }}>{product.brand}</div>
        <div className="mt-1 text-sm font-semibold text-neutral-700 leading-tight line-clamp-2 px-2">{product.name}</div>
      </div>
      <div className="absolute bottom-2 right-2 text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/80 text-neutral-500 border border-neutral-200">{product.model}</div>
    </div>
  );
}
