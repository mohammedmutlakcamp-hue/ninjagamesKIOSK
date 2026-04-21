import Link from 'next/link';
import { Mail, Phone, MapPin, Instagram, ExternalLink } from 'lucide-react';
import { CATEGORIES } from '@/lib/shop/categories';

const SHOP_LINKS = [
  { href: '/ghanemshopidea/c/prebuilt',    label: 'Pre-Built PCs' },
  { href: '/ghanemshopidea/c/laptop',      label: 'Gaming Laptops' },
  { href: '/ghanemshopidea/c/gpu',         label: 'Graphics Cards' },
  { href: '/ghanemshopidea/c/cpu',         label: 'Processors' },
  { href: '/ghanemshopidea/c/monitor',     label: 'Monitors' },
  { href: '/ghanemshopidea/c/keyboard',    label: 'Keyboards & Mice' },
  { href: '/ghanemshopidea/c/controller',  label: 'Controllers' },
];

const HELP_LINKS = [
  { label: 'Delivery & Returns' },
  { label: 'PC Build Service' },
  { label: 'Warranty Claims' },
  { label: 'Trade-in Program' },
  { label: 'WhatsApp Support' },
];

export default function ShopFooter() {
  return (
    <footer className="bg-[#0a0a0a] text-neutral-400 mt-24">
      {/* Trust bar */}
      <div className="border-b border-white/6">
        <div className="max-w-7xl mx-auto px-6 py-7 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { emoji: '🚚', heading: 'Fast Delivery', sub: 'Amman 12-24h · Jordan-wide ≤72h' },
            { emoji: '🛡️', heading: '1-Year Warranty', sub: 'Every product, no exceptions' },
            { emoji: '🔧', heading: 'PC Build Service', sub: 'Free on orders ≥ 800 JOD' },
            { emoji: '💬', heading: 'WhatsApp Support', sub: '7 days a week, real humans' },
          ].map(b => (
            <div key={b.heading} className="flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5">{b.emoji}</span>
              <div>
                <div className="text-white font-semibold text-sm">{b.heading}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer columns */}
      <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="md:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Ninja Games" width={36} height={36} className="rounded-xl" />
            <div>
              <div
                className="font-bold text-white text-sm leading-tight tracking-tight"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                NINJA GAMES
              </div>
              <div className="text-[9px] tracking-[0.2em] text-neutral-600 uppercase leading-tight">
                PC & PS STORE
              </div>
            </div>
          </div>
          <p className="text-[12px] text-neutral-500 leading-relaxed">
            From Amman&apos;s most-rated gaming cafe. We sell what we run — every piece of hardware
            tested in our own stations before it ships to you.
          </p>

          {/* Ninja Games categories mini-grid */}
          <div className="mt-5 flex flex-wrap gap-1">
            {CATEGORIES.slice(0, 8).map(c => (
              <Link
                key={c.slug}
                href={`/ghanemshopidea/c/${c.slug}`}
                className="text-[10px] px-2 py-1 rounded-lg border border-white/8 text-neutral-500 hover:text-white hover:border-white/20 transition-colors"
                title={c.label}
              >
                {c.icon}
              </Link>
            ))}
          </div>
        </div>

        {/* Shop links */}
        <div>
          <h3 className="text-white font-semibold text-xs uppercase tracking-[0.14em] mb-4">Shop</h3>
          <ul className="space-y-2">
            {SHOP_LINKS.map(l => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm text-neutral-500 hover:text-[#39FF14] transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Help */}
        <div>
          <h3 className="text-white font-semibold text-xs uppercase tracking-[0.14em] mb-4">Help</h3>
          <ul className="space-y-2">
            {HELP_LINKS.map(l => (
              <li key={l.label}>
                <span className="text-sm text-neutral-500 hover:text-white transition-colors cursor-pointer">
                  {l.label}
                </span>
              </li>
            ))}
            <li>
              <Link
                href="https://www.ninjagamesjo.com"
                className="text-sm text-neutral-500 hover:text-white transition-colors flex items-center gap-1"
                target="_blank"
                rel="noopener"
              >
                Visit the Cafe
                <ExternalLink className="w-3 h-3" />
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="text-white font-semibold text-xs uppercase tracking-[0.14em] mb-4">Contact</h3>
          <ul className="space-y-3">
            {[
              { icon: MapPin,    label: 'Amman, Jordan' },
              { icon: Phone,     label: '+962 XX XXX XXXX' },
              { icon: Mail,      label: 'shop@ninjagamesjo.com' },
              { icon: Instagram, label: '@ninjagamesjo' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm text-neutral-500">
                <Icon className="w-3.5 h-3.5 flex-shrink-0 text-neutral-600" />
                {label}
              </li>
            ))}
          </ul>

          {/* Tested-in-cafe callout */}
          <div className="mt-6 p-3 rounded-xl border border-[#39FF14]/20 bg-[#39FF14]/5">
            <div className="text-[11px] font-bold text-[#39FF14] mb-1">🧪 Tested in our cafe</div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Every GPU, CPU, and prebuilt we stock runs in our gaming stations first.
              If it crashes, we don&apos;t list it.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/6 py-5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-neutral-600">
          <span>© {new Date().getFullYear()} Ninja Games. All trademarks belong to their respective owners. Prices in JOD include VAT.</span>
          <span className="text-neutral-700">Internal proposal — not for public sharing</span>
        </div>
      </div>
    </footer>
  );
}
