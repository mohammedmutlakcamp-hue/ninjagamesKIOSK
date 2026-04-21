'use client';
import Link from 'next/link';
import { useCart } from '@/lib/shop/cart-store';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { ShoppingCart, Search, MapPin, X, Menu, Phone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CATEGORIES } from '@/lib/shop/categories';
import CartDrawer from './CartDrawer';

export default function ShopHeader() {
  const items = useCart(s => s.items);
  const { city, reset } = useCity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const count = mounted ? items.reduce((n, i) => n + i.qty, 0) : 0;
  const cityMeta = JORDAN_CITIES.find(c => c.key === city);

  return (
    <>
      {/* Utility bar */}
      <div className="bg-[#0a0a0a] text-white text-[11px] font-medium">
        <div className="max-w-7xl mx-auto px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-5 text-neutral-400">
            <span className="hidden sm:flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> +962 XX XXX XXXX
            </span>
            <span className="hidden md:inline">
              Free delivery over 200 JOD · 30-day returns · 1-year warranty
            </span>
          </div>
          <Link
            href="https://www.ninjagamesjo.com"
            className="text-[#39FF14] hover:text-white transition-colors flex items-center gap-1"
          >
            ← Back to Gaming Center
          </Link>
        </div>
      </div>

      {/* Main header */}
      <header className="sticky top-0 z-[200] bg-white border-b border-neutral-100 shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-neutral-100 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-5 h-5 text-[#525252]" /> : <Menu className="w-5 h-5 text-[#525252]" />}
          </button>

          {/* Logo */}
          <Link href="/ghanemshopidea" className="flex items-center gap-2.5 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpeg"
              alt="Ninja Games"
              width={34}
              height={34}
              className="rounded-xl"
            />
            <div className="hidden sm:block">
              <div
                className="font-bold text-sm text-[#0a0a0a] leading-tight tracking-tight"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                NINJA GAMES
              </div>
              <div className="text-[9px] tracking-[0.2em] text-[#a3a3a3] uppercase leading-tight font-medium">
                PC & PS STORE
              </div>
            </div>
          </Link>

          {/* Search bar */}
          <form className="flex-1 max-w-xl mx-2 sm:mx-4 lg:mx-8" onSubmit={e => e.preventDefault()}>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a3a3] pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search RTX 5090, DualSense, Ryzen 9..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#f5f5f5] border-2 border-transparent rounded-xl text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] focus:bg-white focus:border-[#39FF14] outline-none transition-all"
              />
            </div>
          </form>

          {/* City selector */}
          <button
            onClick={reset}
            className="hidden sm:flex items-center gap-1.5 text-xs text-[#525252] hover:text-[#0a0a0a] transition-colors group flex-shrink-0"
            title="Change city"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-600 group-hover:text-emerald-700" />
            <span className="font-medium">{cityMeta?.en || 'Pick city'}</span>
          </button>

          {/* Cart icon */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2.5 rounded-xl hover:bg-neutral-100 transition-colors flex-shrink-0"
            aria-label={`Cart (${count} items)`}
          >
            <ShoppingCart className="w-5 h-5 text-[#0a0a0a]" />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#39FF14] text-[#0a0a0a] text-[10px] font-bold flex items-center justify-center leading-none">
                {count}
              </span>
            )}
          </button>
        </div>

        {/* Category nav strip — desktop */}
        <nav className="hidden lg:block border-t border-neutral-100">
          <div
            className="max-w-7xl mx-auto px-5 py-2 flex items-center gap-0.5 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            {CATEGORIES.map(c => (
              <Link
                key={c.slug}
                href={`/ghanemshopidea/c/${c.slug}`}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#525252] hover:text-[#0a0a0a] hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <span className="text-sm leading-none">{c.icon}</span>
                {c.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="lg:hidden border-t border-neutral-100 bg-white">
            <div className="px-4 py-3 grid grid-cols-2 gap-1">
              {CATEGORIES.map(c => (
                <Link
                  key={c.slug}
                  href={`/ghanemshopidea/c/${c.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#525252] hover:text-[#0a0a0a] hover:bg-neutral-50 rounded-xl transition-colors"
                >
                  <span>{c.icon}</span>
                  {c.label}
                </Link>
              ))}
            </div>

            {/* Mobile city + phone */}
            <div className="px-4 pb-3 flex items-center gap-4 border-t border-neutral-100 mt-1 pt-3">
              <button
                onClick={() => { reset(); setMenuOpen(false); }}
                className="flex items-center gap-1.5 text-xs text-[#525252]"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                {cityMeta?.en || 'Pick city'}
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Cart Drawer */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
