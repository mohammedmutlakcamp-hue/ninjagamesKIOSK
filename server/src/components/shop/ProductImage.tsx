'use client';
import type { Product } from '@/lib/shop/types';
import { getCategory } from '@/lib/shop/categories';

// Branded SVG placeholder. Consistent category-colored card with brand + model.
// Looks like a real product tile without needing 400 image files.
export default function ProductImage({ product, size = 'md', className = '' }: {
  product: Product;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const cat = getCategory(product.category);
  const color = cat?.color || '#39FF14';
  const sizes = { sm: { w: 200, h: 200, brand: 14, name: 12, icon: 28 }, md: { w: 320, h: 320, brand: 18, name: 14, icon: 44 }, lg: { w: 600, h: 600, brand: 28, name: 22, icon: 88 } }[size];

  // Two contrasting colors derived from category color
  const bgGrad = `linear-gradient(135deg, ${color}15 0%, ${color}05 50%, #ffffff 100%)`;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className}`} style={{ background: bgGrad, aspectRatio: '1/1' }}>
      {/* Geometric corner accent */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 opacity-10" style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }} />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 opacity-5" style={{ background: `radial-gradient(circle at bottom left, ${color}, transparent 60%)` }} />

      {/* Category icon, large + centered */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl md:text-6xl mb-2 opacity-90">{cat?.icon || '📦'}</div>
        <div className="text-xs font-bold tracking-widest uppercase opacity-60" style={{ color }}>{product.brand}</div>
        <div className="mt-1 text-sm font-semibold text-neutral-700 leading-tight line-clamp-2 px-2">{product.name}</div>
      </div>

      {/* Model code badge */}
      <div className="absolute bottom-2 right-2 text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/80 text-neutral-500 border border-neutral-200">{product.model}</div>
    </div>
  );
}
