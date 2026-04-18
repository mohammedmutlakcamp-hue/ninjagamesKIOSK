'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/shop/cart-store';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { ShoppingCart, Search, MapPin, Menu, Phone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CATEGORIES } from '@/lib/shop/categories';

export default function ShopHeader() {
  const items = useCart(s => s.items);
  const { city, reset } = useCity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const count = mounted ? items.reduce((n, i) => n + i.qty, 0) : 0;
  const cityMeta = JORDAN_CITIES.find(c => c.key === city);

  return (
    <>
      {/* Top utility bar */}
      <div className="bg-black text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-1.5"><Phone className="w-3 h-3" /> +962 XX XXX XXXX</span>
            <span className="hidden md:inline text-neutral-400">Free delivery over 200 JOD · 30-day returns · 1-year warranty</span>
          </div>
          <Link href="https://www.ninjagamesjo.com" className="text-[#39FF14] hover:underline">← Back to Gaming Center</Link>
        </div>
      </div>

      {/* Main header */}
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 -ml-2 text-neutral-700">
            <Menu className="w-6 h-6" />
          </button>

          <Link href="/ghanemshopidea" className="flex items-center gap-2 flex-shrink-0">
            <Image src="/logo.jpeg" alt="Ninja Games" width={36} height={36} className="rounded-lg" />
            <div className="hidden sm:block">
              <div className="font-bold text-sm text-neutral-900 leading-tight">NINJA GAMES</div>
              <div className="text-[10px] text-neutral-500 tracking-widest leading-tight">PC & PS STORE</div>
            </div>
          </Link>

          <form className="flex-1 max-w-2xl mx-2 sm:mx-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search RTX 5090, DualSense, Ryzen 9..."
                className="w-full pl-11 pr-4 py-2.5 bg-neutral-100 border border-transparent rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:border-neutral-300 outline-none"
              />
            </div>
          </form>

          <button onClick={reset} className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-600 hover:text-green-600 transition-colors">
            <MapPin className="w-3.5 h-3.5" />
            <span className="font-medium">{cityMeta?.en || 'Pick city'}</span>
          </button>

          <Link href="/ghanemshopidea/cart" className="relative p-2.5 rounded-xl hover:bg-neutral-100 transition-colors">
            <ShoppingCart className="w-5 h-5 text-neutral-700" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#39FF14] text-black text-[11px] font-bold flex items-center justify-center">{count}</span>
            )}
          </Link>
        </div>

        {/* Category strip — desktop */}
        <nav className="hidden lg:block border-t border-neutral-100">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            {CATEGORIES.map(c => (
              <Link key={c.slug} href={`/ghanemshopidea/c/${c.slug}`} className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                <span className="mr-1.5">{c.icon}</span>{c.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="lg:hidden border-t border-neutral-100 bg-white">
            <div className="px-4 py-2 grid grid-cols-2 gap-1">
              {CATEGORIES.map(c => (
                <Link key={c.slug} href={`/ghanemshopidea/c/${c.slug}`} onClick={() => setMenuOpen(false)} className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 rounded-lg">
                  <span className="mr-2">{c.icon}</span>{c.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
