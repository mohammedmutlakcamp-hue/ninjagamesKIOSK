'use client';
import Link from 'next/link';
import Image from 'next/image';
import { CATEGORIES } from '@/lib/shop/categories';
import { ALL_PRODUCTS, featuredProducts, productsByCategory, PRODUCT_COUNT } from '@/lib/shop/catalog';
import ProductCard from '@/components/shop/ProductCard';
import { ArrowRight, Truck, ShieldCheck, Headphones, Wrench, Star } from 'lucide-react';

export default function ShopHome() {
  const featured = featuredProducts(8);
  const prebuilts = productsByCategory('prebuilt').slice(0, 4);
  const gpus = productsByCategory('gpu').filter(p => p.badge === 'best' || p.badge === 'hot' || p.badge === 'new').slice(0, 4);
  const peripherals = [
    ...productsByCategory('controller').slice(0, 2),
    ...productsByCategory('headset').slice(0, 2),
    ...productsByCategory('keyboard').slice(0, 2),
    ...productsByCategory('mouse').slice(0, 2),
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(57,255,20,0.2), transparent 40%), radial-gradient(circle at 80% 70%, rgba(34,211,238,0.15), transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-mono tracking-widest mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" /> NEW · NINJA GAMES PC STORE
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
              The same gear we run<br /><span className="text-[#39FF14]">in the cafe</span> — now at your door.
            </h1>
            <p className="mt-5 text-neutral-300 max-w-lg">
              {PRODUCT_COUNT}+ real products. RTX 50, Ryzen 9000, PS5 controllers, monitors, custom-built PCs. Shipped across Jordan in 24-72 hours.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/ghanemshopidea/c/prebuilt" className="px-6 py-3 rounded-xl bg-[#39FF14] text-black font-bold hover:bg-[#2ee010] transition-colors flex items-center gap-2">
                Shop Pre-Built PCs <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/ghanemshopidea/c/gpu" className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur text-white font-semibold hover:bg-white/15 border border-white/20">
                Browse Components
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-1 text-sm text-neutral-400">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="ml-2">Trusted by 10,000+ Ninja Games customers</span>
            </div>
          </div>

          {/* Hero card stack */}
          <div className="relative hidden md:block">
            <div className="absolute -top-8 right-0 w-72 h-96 bg-gradient-to-br from-purple-600/40 to-pink-500/30 rounded-3xl blur-2xl" />
            <div className="absolute top-12 left-0 w-72 h-96 bg-gradient-to-br from-green-500/30 to-cyan-500/20 rounded-3xl blur-2xl" />
            <div className="relative grid grid-cols-2 gap-4">
              {featured.slice(0, 4).map(p => (
                <Link key={p.id} href={`/ghanemshopidea/p/${p.id}`} className="bg-white text-black rounded-2xl p-3 hover:scale-105 transition-transform shadow-2xl">
                  <div className="text-3xl mb-2">{CATEGORIES.find(c => c.slug === p.category)?.icon}</div>
                  <div className="text-[10px] font-bold tracking-wider text-neutral-500">{p.brand}</div>
                  <div className="text-xs font-semibold line-clamp-2">{p.name}</div>
                  <div className="mt-1 text-sm font-bold text-green-600">{p.priceJod} JOD</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { icon: Truck, t: 'Fast Delivery', s: 'Amman 12-24h, Jordan-wide ≤72h' },
            { icon: ShieldCheck, t: '1-Year Warranty', s: 'On every component' },
            { icon: Wrench, t: 'PC Build Service', s: 'Free on orders ≥ 800 JOD' },
            { icon: Headphones, t: 'Tech Support', s: 'WhatsApp + in-store, 7 days a week' },
          ].map((b, i) => (
            <div key={i} className="flex flex-col items-center">
              <b.icon className="w-6 h-6 text-green-600 mb-2" />
              <div className="font-bold text-sm text-neutral-900">{b.t}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{b.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories grid */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Shop by Category</h2>
          <span className="text-sm text-neutral-500">{CATEGORIES.length} categories · {PRODUCT_COUNT} products</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {CATEGORIES.map(c => (
            <Link key={c.slug} href={`/ghanemshopidea/c/${c.slug}`}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-neutral-200 hover:border-neutral-300 hover:shadow-md transition-all bg-white">
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c.color}25 0%, ${c.color}05 60%, transparent 100%)` }} />
              <div className="relative h-full flex flex-col items-center justify-center p-3 text-center">
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{c.icon}</div>
                <div className="text-xs font-bold text-neutral-900 leading-tight">{c.label}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">{ALL_PRODUCTS.filter(p => p.category === c.slug).length} items</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pre-built PCs */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs font-bold tracking-wider text-green-600 mb-1">🥷 NINJA GAMES CUSTOM</div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Pre-Built PCs · Built in Amman</h2>
            <p className="text-neutral-600 text-sm mt-1">Hand-built and stress-tested in our shop. Delivered ready to game.</p>
          </div>
          <Link href="/ghanemshopidea/c/prebuilt" className="text-sm font-semibold text-green-600 hover:underline flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {prebuilts.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Featured GPUs */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Featured Graphics Cards</h2>
          <Link href="/ghanemshopidea/c/gpu" className="text-sm font-semibold text-green-600 hover:underline flex items-center gap-1">All GPUs <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {gpus.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Peripherals strip */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Peripherals Customers Buy Most</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {peripherals.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="rounded-3xl overflow-hidden bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white p-8 md:p-12 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <h3 className="text-2xl md:text-4xl font-black tracking-tight">Need a custom build?</h3>
            <p className="mt-2 text-green-50 max-w-xl">Tell us your budget and what you play. Our techs will spec out a build, source the parts, assemble, stress-test, and deliver — fixed price, no surprises.</p>
          </div>
          <Link href="/ghanemshopidea/cart" className="px-6 py-3 rounded-xl bg-white text-green-700 font-bold hover:scale-105 transition-transform">
            Request a Build →
          </Link>
        </div>
      </section>
    </>
  );
}
