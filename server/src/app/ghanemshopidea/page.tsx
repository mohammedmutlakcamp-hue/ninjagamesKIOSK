'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CATEGORIES } from '@/lib/shop/categories';
import { ALL_PRODUCTS, featuredProducts, productsByCategory, PRODUCT_COUNT } from '@/lib/shop/catalog';
import ProductCard from '@/components/shop/ProductCard';
import { ArrowRight, Truck, ShieldCheck, Headphones, Wrench, Star, Cpu, Zap, FlaskConical } from 'lucide-react';

// Fade-up reveal helper
const FadeUp = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-60px' }}
    transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.55, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

// Build configurator budget cards
const BUILD_BUDGETS = [
  {
    budget: 500,
    label: 'Entry Build',
    desc: 'Runs Valorant, Fortnite, and CS2 at high settings.',
    gradient: 'from-slate-800 to-slate-900',
    accent: '#94a3b8',
    icon: '🎮',
  },
  {
    budget: 1000,
    label: 'Mid-Range Rig',
    desc: 'RTX 4060 territory. 1080p ultra in any title.',
    gradient: 'from-blue-900 to-indigo-950',
    accent: '#60a5fa',
    icon: '⚡',
  },
  {
    budget: 2000,
    label: 'High-End Machine',
    desc: 'RTX 4070 or RX 7800. 1440p ultra, content creation.',
    gradient: 'from-violet-900 to-purple-950',
    accent: '#a78bfa',
    icon: '🔥',
  },
  {
    budget: 4000,
    label: 'Dream Build',
    desc: 'RTX 5090 class. 4K max. No compromises.',
    gradient: 'from-amber-800 to-orange-950',
    accent: '#fbbf24',
    icon: '🥷',
  },
];

export default function ShopHome() {
  const featured = featuredProducts(8);
  const prebuilts = productsByCategory('prebuilt').slice(0, 4);
  const gpus = productsByCategory('gpu').filter(p => p.badge === 'best' || p.badge === 'hot' || p.badge === 'new').slice(0, 4);
  const monitors = productsByCategory('monitor').slice(0, 4);
  const peripherals = [
    ...productsByCategory('controller').slice(0, 2),
    ...productsByCategory('headset').slice(0, 2),
    ...productsByCategory('keyboard').slice(0, 2),
    ...productsByCategory('mouse').slice(0, 2),
  ];

  return (
    <>
      {/* ─── Hero ─── */}
      <section className="relative bg-[#0a0a0a] text-white overflow-hidden">
        {/* Subtle radial accents */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[600px] h-[600px] opacity-[0.08]"
            style={{ background: 'radial-gradient(circle at top left, #39FF14, transparent 60%)' }} />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] opacity-[0.06]"
            style={{ background: 'radial-gradient(circle at bottom right, #3b82f6, transparent 60%)' }} />
          {/* Dot-grid texture */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(#39FF14 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28 lg:py-32 grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.65 }}
          >
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/12 bg-white/5 backdrop-blur text-xs font-mono tracking-[0.16em] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
              NEW · NINJA GAMES PC STORE
            </div>

            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              The same gear we run{' '}
              <span className="text-[#39FF14]">in the cafe</span>{' '}
              — now at your door.
            </h1>

            <p className="mt-5 text-neutral-400 max-w-lg text-base leading-relaxed">
              {PRODUCT_COUNT}+ real products. RTX 50 series, Ryzen 9000, PS5 controllers, monitors,
              custom-built PCs. Shipped across Jordan in 24–72 hours.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/ghanemshopidea/c/prebuilt"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#39FF14] text-[#0a0a0a] font-bold hover:bg-[#2ee010] transition-colors"
              >
                Shop Pre-Built PCs
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/ghanemshopidea/c/gpu"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/8 transition-colors"
              >
                Browse Components
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-8 flex items-center gap-2 text-sm text-neutral-500">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span>Trusted by 10,000+ Ninja Games customers</span>
            </div>
          </motion.div>

          {/* Hero product cards */}
          <motion.div
            className="relative hidden md:grid grid-cols-2 gap-3"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.65, delay: 0.1 }}
          >
            {featured.slice(0, 4).map((p, i) => {
              const cat = CATEGORIES.find(c => c.slug === p.category);
              return (
                <Link
                  key={p.id}
                  href={`/ghanemshopidea/p/${p.id}`}
                  className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-4 hover:bg-white/10 hover:border-white/20 transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="text-3xl mb-2.5">{cat?.icon}</div>
                  <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-neutral-500 mb-0.5">
                    {p.brand}
                  </div>
                  <div className="text-sm font-semibold text-white line-clamp-2 leading-snug">{p.name}</div>
                  <div className="mt-2 text-[#39FF14] font-bold text-sm">{p.priceJod} JOD</div>
                </Link>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ─── Trust bar ─── */}
      <FadeUp>
        <section className="bg-white border-b border-neutral-100">
          <div className="max-w-7xl mx-auto px-6 py-7 grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Truck,       label: 'Fast Delivery',   sub: 'Amman 12-24h · Jordan-wide ≤72h' },
              { icon: ShieldCheck, label: '1-Year Warranty', sub: 'On every component we sell' },
              { icon: Wrench,      label: 'PC Build Service',sub: 'Free assembly on orders ≥ 800 JOD' },
              { icon: Headphones,  label: 'Tech Support',    sub: 'WhatsApp + in-store, 7 days a week' },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <div className="font-semibold text-sm text-[#0a0a0a]">{label}</div>
                  <div className="text-[11px] text-[#a3a3a3] mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </FadeUp>

      {/* ─── Category grid ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <FadeUp>
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#a3a3a3] mb-1.5">Browse</p>
              <h2
                className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                Shop by Category
              </h2>
            </div>
            <span className="text-sm text-[#a3a3a3] hidden md:block">
              {CATEGORIES.length} categories · {PRODUCT_COUNT} products
            </span>
          </div>
        </FadeUp>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {CATEGORIES.map((c, i) => (
            <FadeUp key={c.slug} delay={i * 0.025}>
              <Link
                href={`/ghanemshopidea/c/${c.slug}`}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-neutral-100 hover:border-neutral-200 transition-all duration-300 bg-white hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] hover:-translate-y-1"
              >
                <div
                  className="absolute inset-0 transition-opacity duration-300 opacity-60 group-hover:opacity-100"
                  style={{ background: `linear-gradient(135deg, ${c.color}18 0%, transparent 65%)` }}
                />
                <div className="relative h-full flex flex-col items-center justify-center p-3 text-center gap-1">
                  <div className="text-3xl transition-transform duration-300 group-hover:scale-110">
                    {c.icon}
                  </div>
                  <div className="text-[11px] font-bold text-[#0a0a0a] leading-tight">{c.label}</div>
                  <div className="text-[10px] text-[#a3a3a3]">
                    {ALL_PRODUCTS.filter(p => p.category === c.slug).length}
                  </div>
                </div>
              </Link>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ─── Tested-in-cafe ribbon ─── */}
      <FadeUp>
        <section className="bg-[#39FF14]/6 border-y border-[#39FF14]/20 py-5">
          <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 justify-center text-center sm:text-left">
            <div className="w-11 h-11 rounded-2xl bg-[#39FF14]/20 flex items-center justify-center flex-shrink-0">
              <FlaskConical className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="font-bold text-[#0a0a0a] text-sm" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                Tested in our cafe before it ships to you
              </div>
              <p className="text-[12px] text-[#525252] mt-0.5">
                Every GPU, CPU, and prebuilt we list runs in our actual gaming stations. If it crashes under load, we don&apos;t sell it.
              </p>
            </div>
            <Link
              href="/ghanemshopidea/c/prebuilt"
              className="flex-shrink-0 text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              See our builds <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </FadeUp>

      {/* ─── Pre-Built PCs ─── */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <FadeUp className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#39FF14] mb-1.5">🥷 Ninja Games Custom</p>
              <h2
                className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                Pre-Built PCs · Built in Amman
              </h2>
              <p className="text-[#525252] text-sm mt-1.5">
                Hand-built and stress-tested in our shop. Delivered ready to game.
              </p>
            </div>
            <Link
              href="/ghanemshopidea/c/prebuilt"
              className="hidden sm:flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </FadeUp>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {prebuilts.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.06}>
              <ProductCard product={p} />
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ─── Build Configurator Strip ─── */}
      <FadeUp>
        <section className="max-w-7xl mx-auto px-6 pb-20">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#a3a3a3] mb-1.5">
                <Cpu className="inline w-3.5 h-3.5 mr-1" />Build Configurator
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                What&apos;s your budget?
              </h2>
              <p className="text-[#525252] text-sm mt-1.5">
                Tell us how much you want to spend. We&apos;ll show you what we build.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BUILD_BUDGETS.map((b, i) => (
              <motion.div
                key={b.budget}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5, delay: i * 0.07 }}
              >
                <Link
                  href={`/ghanemshopidea/c/prebuilt?budget=${b.budget}`}
                  className={`group relative flex flex-col h-full min-h-[180px] rounded-3xl bg-gradient-to-br overflow-hidden p-6 hover:-translate-y-1.5 hover:shadow-[0_24px_60px_-16px_rgba(0,0,0,0.35)] transition-all duration-300 ${b.gradient}`}
                >
                  {/* Subtle corner radial */}
                  <div
                    className="absolute top-0 right-0 w-40 h-40 opacity-20 pointer-events-none"
                    style={{ background: `radial-gradient(circle at top right, ${b.accent}, transparent 60%)` }}
                  />

                  <div className="relative flex flex-col flex-1 gap-3">
                    <div className="text-3xl">{b.icon}</div>
                    <div>
                      <div
                        className="text-[11px] font-bold tracking-[0.16em] uppercase mb-1"
                        style={{ color: b.accent }}
                      >
                        {b.label}
                      </div>
                      <div className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                        {b.budget} <span className="text-lg font-bold">JOD</span>
                      </div>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed flex-1">{b.desc}</p>
                    <div
                      className="inline-flex items-center gap-1 text-xs font-bold mt-auto"
                      style={{ color: b.accent }}
                    >
                      See builds <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </FadeUp>

      {/* ─── Featured GPUs ─── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <FadeUp className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#a3a3a3] mb-1.5">
                <Zap className="inline w-3.5 h-3.5 mr-1" />Hot right now
              </p>
              <h2
                className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
                style={{ fontFamily: 'var(--font-display, system-ui)' }}
              >
                Featured Graphics Cards
              </h2>
            </div>
            <Link
              href="/ghanemshopidea/c/gpu"
              className="hidden sm:flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              All GPUs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </FadeUp>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {gpus.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.06}>
              <ProductCard product={p} />
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ─── Monitors ─── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <FadeUp className="mb-8">
          <div className="flex items-end justify-between">
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              Monitors
            </h2>
            <Link
              href="/ghanemshopidea/c/monitor"
              className="hidden sm:flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              All monitors <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </FadeUp>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {monitors.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.06}>
              <ProductCard product={p} />
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ─── Peripherals ─── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <FadeUp className="mb-8">
          <h2
            className="text-3xl md:text-4xl font-bold tracking-tight text-[#0a0a0a]"
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            Peripherals Customers Buy Most
          </h2>
        </FadeUp>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {peripherals.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.04}>
              <ProductCard product={p} />
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ─── CTA banner ─── */}
      <FadeUp>
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <div className="rounded-3xl bg-[#0a0a0a] text-white overflow-hidden relative">
            {/* Background texture */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-20 -left-20 w-80 h-80 opacity-10"
                style={{ background: 'radial-gradient(circle, #39FF14, transparent 60%)' }} />
              <div className="absolute -bottom-20 -right-20 w-80 h-80 opacity-6"
                style={{ background: 'radial-gradient(circle, #60a5fa, transparent 60%)' }} />
              <div className="absolute inset-0 opacity-[0.02]"
                style={{ backgroundImage: 'radial-gradient(#39FF14 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            </div>

            <div className="relative p-8 md:p-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/12 bg-white/5 text-[11px] font-mono tracking-wider text-neutral-400 mb-4">
                  🔧 Custom Build Service
                </div>
                <h3
                  className="text-3xl md:text-4xl font-bold tracking-tight leading-tight"
                  style={{ fontFamily: 'var(--font-display, system-ui)' }}
                >
                  Need a custom build?
                </h3>
                <p className="mt-3 text-neutral-400 max-w-xl text-sm leading-relaxed">
                  Tell us your budget and what you play. Our techs will spec out a build, source the parts, assemble,
                  stress-test, and deliver — fixed price, no surprises.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                <Link
                  href="/ghanemshopidea/cart"
                  className="px-6 py-3.5 rounded-xl bg-[#39FF14] text-[#0a0a0a] font-bold text-sm hover:bg-[#2ee010] transition-colors whitespace-nowrap"
                >
                  Request a Build →
                </Link>
                <Link
                  href="/ghanemshopidea/c/prebuilt"
                  className="px-6 py-3.5 rounded-xl border border-white/20 text-white font-semibold text-sm hover:bg-white/8 transition-colors whitespace-nowrap text-center"
                >
                  See pre-builts
                </Link>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>
    </>
  );
}
