'use client';
import { useState, useMemo } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProduct, productsByCategory } from '@/lib/shop/catalog';
import { getCategory } from '@/lib/shop/categories';
import ProductImage from '@/components/shop/ProductImage';
import ProductCard from '@/components/shop/ProductCard';
import DeliveryBadge from '@/components/shop/DeliveryBadge';
import { useCart } from '@/lib/shop/cart-store';
import { ShieldCheck, Wrench, Truck, ChevronRight, Plus, Minus, Check, MessageCircle } from 'lucide-react';

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) notFound();

  const cat = getCategory(product.category)!;
  const add = useCart(s => s.add);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const related = useMemo(() => productsByCategory(product.category).filter(p => p.id !== product.id).slice(0, 4), [product]);

  const handleAdd = () => {
    add(product.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const discount = product.msrpJod && product.msrpJod > product.priceJod
    ? Math.round((1 - product.priceJod / product.msrpJod) * 100)
    : 0;

  return (
    <>
      {/* Breadcrumb */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-1 text-xs text-neutral-500">
          <Link href="/ghanemshopidea" className="hover:text-green-600">Shop</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/ghanemshopidea/c/${cat.slug}`} className="hover:text-green-600">{cat.label}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-neutral-700 truncate">{product.name}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-10">
        {/* Image column */}
        <div>
          <ProductImage product={product} size="lg" className="!aspect-square" />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[0,1,2,3].map(i => (
              <div key={i} className={`aspect-square rounded-xl border ${i === 0 ? 'border-green-500' : 'border-neutral-200 opacity-50'} bg-white`}>
                <ProductImage product={product} size="sm" className="!border-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Details column */}
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-neutral-500">{product.brand}</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1 leading-tight">{product.name}</h1>
          <div className="text-xs font-mono text-neutral-400 mt-1">{product.model}</div>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-bold">{product.priceJod} <span className="text-base text-neutral-500">JOD</span></span>
            {product.msrpJod && product.msrpJod > product.priceJod && (
              <>
                <span className="text-lg text-neutral-400 line-through">{product.msrpJod} JOD</span>
                <span className="px-2 py-0.5 rounded bg-red-500 text-white text-xs font-bold">−{discount}%</span>
              </>
            )}
          </div>

          <div className="mt-4">
            <DeliveryBadge productId={product.id} inStock={product.inStock} />
          </div>

          {product.inStock ? (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-green-700"><Check className="w-4 h-4" /> In stock — {product.stockCount} units in Amman warehouse</div>
          ) : (
            <div className="mt-2 text-sm text-orange-600">Order from supplier · 5-7 working days</div>
          )}

          {/* Qty + buttons */}
          <div className="mt-6 flex items-stretch gap-3">
            <div className="flex items-center bg-neutral-100 rounded-xl">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-12 flex items-center justify-center hover:bg-neutral-200 rounded-l-xl"><Minus className="w-4 h-4" /></button>
              <span className="w-10 text-center font-bold">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="w-10 h-12 flex items-center justify-center hover:bg-neutral-200 rounded-r-xl"><Plus className="w-4 h-4" /></button>
            </div>
            <button onClick={handleAdd}
              className={`flex-1 h-12 rounded-xl font-bold transition-all ${added ? 'bg-green-500 text-white' : 'bg-neutral-900 text-white hover:bg-green-600'}`}>
              {added ? '✓ Added to Cart' : `Add to Cart · ${(product.priceJod * qty).toLocaleString()} JOD`}
            </button>
          </div>

          <Link href="/ghanemshopidea/cart" className="mt-2 w-full h-12 rounded-xl bg-[#39FF14] text-black font-bold flex items-center justify-center hover:bg-[#2ee010]">
            Buy Now
          </Link>

          <a href={`https://wa.me/962799999999?text=${encodeURIComponent(`Hi, I'm interested in: ${product.name} (${product.model}) — ${product.priceJod} JOD`)}`}
             target="_blank" rel="noopener"
             className="mt-3 w-full h-11 rounded-xl border-2 border-green-600 text-green-700 font-semibold flex items-center justify-center gap-2 hover:bg-green-50">
            <MessageCircle className="w-4 h-4" /> Inquire on WhatsApp
          </a>

          {/* Trust line */}
          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <ShieldCheck className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-neutral-700">1-year warranty</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <Wrench className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-neutral-700">Free assembly</div>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-3">
              <Truck className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <div className="text-[10px] font-semibold text-neutral-700">Cash on delivery</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Specs + Description */}
      <section className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-bold mb-3">Specifications</h2>
          <dl className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100">
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className="flex px-4 py-2.5 text-sm">
                <dt className="w-1/3 font-medium text-neutral-500 capitalize">{k}</dt>
                <dd className="flex-1 text-neutral-900 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="text-lg font-bold mb-3">About this product</h2>
          <p className="text-neutral-700 leading-relaxed">{product.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {product.tags.map(t => (
              <span key={t} className="px-2 py-1 bg-neutral-100 text-xs rounded-md text-neutral-600">#{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="max-w-7xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold mb-6">More in {cat.label}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {related.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </>
  );
}
