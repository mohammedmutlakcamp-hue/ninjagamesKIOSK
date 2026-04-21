'use client';
import { useState } from 'react';
import type { Product } from '@/lib/shop/types';
import { getCategory } from '@/lib/shop/categories';

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
      <div
        className={`relative overflow-hidden rounded-2xl bg-[#fafafa] ${className}`}
        style={{ aspectRatio: '1/1' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  // Branded SVG placeholder — used for Ninja Games prebuilts
  const sizeMap = { sm: 'text-3xl', md: 'text-5xl', lg: 'text-7xl' };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        aspectRatio: '1/1',
        background: `linear-gradient(145deg, ${color}12 0%, ${color}06 50%, #f8f8f8 100%)`,
      }}
    >
      {/* Corner accent */}
      <div
        className="absolute top-0 right-0 w-20 h-20 opacity-20 rounded-bl-full"
        style={{ background: color }}
      />
      {/* Bottom stripe */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5 opacity-30"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center gap-1.5">
        <div className={`${sizeMap[size]} opacity-85 transition-transform duration-500 group-hover:scale-110`}>
          {cat?.icon || '📦'}
        </div>
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-70" style={{ color }}>
          {product.brand}
        </div>
        <div className="text-sm font-semibold text-[#0a0a0a] leading-tight line-clamp-2 px-2">
          {product.name}
        </div>
      </div>
      <div className="absolute bottom-2.5 right-2.5 text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/80 text-[#a3a3a3] border border-neutral-200">
        {product.model}
      </div>
    </div>
  );
}
