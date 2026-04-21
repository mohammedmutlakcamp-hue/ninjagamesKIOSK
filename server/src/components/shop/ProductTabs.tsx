'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Product } from '@/lib/shop/types';
import { Star, Truck, Package, RotateCcw, Shield, MessageCircle, ThumbsUp, Check } from 'lucide-react';

type TabKey = 'desc' | 'shipping' | 'reviews';

// Deterministic mock reviews per product — seeded on product.id for stability
const REVIEW_AUTHORS = ['Mohammad A.', 'Lara K.', 'Yousef R.', 'Sara H.', 'Khalid M.', 'Noor S.', 'Ahmad B.', 'Tala F.', 'Omar D.', 'Rana Z.'];
const REVIEW_TITLES = [
  'Worth every JOD', 'Came faster than expected', 'Exactly as described', 'Best price in Amman',
  'Built into my new rig', 'Solid build quality', 'Performance is insane', 'Great support from the team',
  'No complaints', 'Plug and play', 'Friend recommended, glad I listened',
];
const REVIEW_BODIES = [
  'Ordered Tuesday, delivered Wednesday morning to Khalda. Sealed retail box, free invoice. Will buy from them again.',
  'I was hesitating between this and the same model from another shop. Their team answered every question on WhatsApp before I bought.',
  'Stress-tested for 24 hours, zero issues. Comes with the original manufacturer warranty card stamped.',
  'Honestly the unboxing was professional. They even threw in a small thermal paste tube as a freebie.',
  'I bought a second one for my brother after this. Same experience. Recommended.',
  'No drama. Item arrived sealed, scanned the warranty QR, registered with the brand. Clean.',
  'Compared prices in 4 stores in Sweifieh — this was the best by ~25 JOD.',
];

const seededReviews = (productId: string) => {
  let h = 0;
  for (let i = 0; i < productId.length; i++) h = ((h << 5) - h) + productId.charCodeAt(i);
  const seed = Math.abs(h);
  const rand = (n: number, salt = 0) => (seed * (salt + 1) * 9973) % n;
  const count = 3 + rand(7);
  const totalCount = count + 5 + rand(40);
  const avgTimes10 = 42 + rand(8);
  const reviews = Array.from({ length: count }, (_, i) => ({
    author: REVIEW_AUTHORS[rand(REVIEW_AUTHORS.length, i)],
    title:  REVIEW_TITLES[rand(REVIEW_TITLES.length, i + 1)],
    body:   REVIEW_BODIES[rand(REVIEW_BODIES.length, i + 2)],
    rating: 4 + ((rand(10, i + 3) > 2) ? 1 : 0),
    daysAgo: 1 + rand(180, i + 4),
    verified: rand(10, i + 5) > 1,
    helpful: rand(40, i + 6),
  }));
  return { reviews, totalCount, avg: avgTimes10 / 10 };
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'desc',     label: 'Description' },
  { key: 'shipping', label: 'Shipping & Returns' },
  { key: 'reviews',  label: 'Reviews' },
];

export default function ProductTabs({ product }: { product: Product }) {
  const [tab, setTab] = useState<TabKey>('desc');
  const { reviews, totalCount, avg } = seededReviews(product.id);

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-6 py-10">
      {/* Tab bar */}
      <div className="border-b border-neutral-100 flex items-end gap-0.5 overflow-x-auto mb-8">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-shrink-0 px-4 py-3.5 text-sm font-semibold transition-colors ${
              tab === t.key ? 'text-[#0a0a0a]' : 'text-[#a3a3a3] hover:text-[#525252]'
            }`}
            style={{ fontFamily: 'var(--font-display, system-ui)' }}
          >
            {t.label}
            {t.key === 'reviews' && (
              <span className="ml-1.5 text-[11px] text-[#a3a3a3]">({totalCount})</span>
            )}
            {tab === t.key && (
              <motion.span
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#39FF14] rounded-full"
                layoutId="tab-indicator"
                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
        >
          {/* ─── Description ─── */}
          {tab === 'desc' && (
            <div className="grid md:grid-cols-2 gap-10">
              <div>
                <h3
                  className="text-lg font-bold text-[#0a0a0a] mb-3"
                  style={{ fontFamily: 'var(--font-display, system-ui)' }}
                >
                  About this product
                </h3>
                <p className="text-[#525252] leading-relaxed text-sm">{product.description}</p>
                {product.tags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {product.tags.map(t => (
                      <span
                        key={t}
                        className="px-2.5 py-1 bg-neutral-100 text-[11px] rounded-lg text-[#525252]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Specs table */}
              <div>
                <h3
                  className="text-lg font-bold text-[#0a0a0a] mb-3"
                  style={{ fontFamily: 'var(--font-display, system-ui)' }}
                >
                  Specifications
                </h3>
                {Object.keys(product.specs).length > 0 ? (
                  <dl className="bg-white rounded-2xl border border-neutral-100 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    {Object.entries(product.specs).map(([k, v], idx) => (
                      <div
                        key={k}
                        className={`flex px-5 py-3 text-sm ${idx > 0 ? 'border-t border-neutral-50' : ''}`}
                      >
                        <dt className="w-2/5 font-medium text-[#a3a3a3] capitalize text-xs tracking-wide">
                          {k.replace(/_/g, ' ')}
                        </dt>
                        <dd className="flex-1 font-semibold text-[#0a0a0a] text-xs">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="bg-neutral-50 rounded-2xl p-5 text-sm text-[#525252]">
                    Full specs available on the manufacturer&apos;s product page or via WhatsApp inquiry.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Shipping & Returns ─── */}
          {tab === 'shipping' && (
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  icon: Truck,
                  title: 'Delivery across Jordan',
                  body: 'Amman within 24 hours. Zarqa, Salt, Madaba: 24–48h. Irbid, Jerash, Ajloun: 48–72h. Aqaba and the south: 72–96h. Free over 200 JOD.',
                },
                {
                  icon: Package,
                  title: 'Cash on delivery',
                  body: 'Pay the courier when you receive the box. Inspect before paying. Card payments and bank transfer also accepted on request.',
                },
                {
                  icon: RotateCcw,
                  title: '30-day returns',
                  body: 'Unopened items: 30-day full refund. Opened items: 14 days, 90% refund. Defective on arrival? We replace it free.',
                },
                {
                  icon: Shield,
                  title: '1-year warranty',
                  body: 'Manufacturer warranty honored locally. Bring the item to our shop in Amman or ship it to us — we handle the RMA.',
                },
                {
                  icon: MessageCircle,
                  title: 'Need help choosing?',
                  body: 'Message us on WhatsApp before ordering. A Ninja Games tech will help you spec your build, check compatibility, and confirm what\'s in stock today. No pressure.',
                  wide: true,
                },
              ].map(({ icon: Icon, title, body, wide }) => (
                <div
                  key={title}
                  className={`bg-white rounded-2xl border border-neutral-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${wide ? 'md:col-span-2' : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h4
                    className="font-bold text-[#0a0a0a] mb-2"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {title}
                  </h4>
                  <p className="text-sm text-[#525252] leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          )}

          {/* ─── Reviews ─── */}
          {tab === 'reviews' && (
            <div>
              {/* Summary */}
              <div className="grid md:grid-cols-[160px_1fr] gap-8 mb-8 pb-8 border-b border-neutral-100">
                <div className="flex flex-col items-center justify-center bg-[#fafafa] rounded-2xl p-5">
                  <div
                    className="text-5xl font-black tracking-tight text-[#0a0a0a]"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    {avg.toFixed(1)}
                  </div>
                  <div className="flex items-center gap-0.5 mt-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${n <= Math.round(avg) ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'}`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-[#a3a3a3] mt-1.5">{totalCount} reviews</div>
                </div>

                {/* Bar chart */}
                <div className="flex flex-col justify-center space-y-2">
                  {[5, 4, 3, 2, 1].map(stars => {
                    const pct = stars === 5 ? 78 : stars === 4 ? 17 : stars === 3 ? 3 : stars === 2 ? 1 : 1;
                    return (
                      <div key={stars} className="flex items-center gap-3 text-xs">
                        <span className="w-6 text-[#525252] text-right">{stars}</span>
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                        <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[#a3a3a3]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Review cards */}
              <div className="space-y-4">
                {reviews.map((r, i) => (
                  <div
                    key={i}
                    className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#0a0a0a]">{r.author}</span>
                          {r.verified && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider rounded-full">
                              <Check className="w-2.5 h-2.5" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(n => (
                              <Star
                                key={n}
                                className={`w-3 h-3 ${n <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'}`}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-[#a3a3a3]">{r.daysAgo} days ago</span>
                        </div>
                      </div>
                    </div>
                    <h5 className="font-semibold text-sm text-[#0a0a0a] mb-1">{r.title}</h5>
                    <p className="text-sm text-[#525252] leading-relaxed">{r.body}</p>
                    <button className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-[#a3a3a3] hover:text-[#525252] transition-colors">
                      <ThumbsUp className="w-3 h-3" /> Helpful ({r.helpful})
                    </button>
                  </div>
                ))}
              </div>

              <button className="mt-6 w-full py-3.5 rounded-xl border-2 border-dashed border-neutral-200 text-sm font-semibold text-[#525252] hover:border-[#39FF14] hover:text-[#0a0a0a] transition-colors">
                Load all {totalCount} reviews
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
