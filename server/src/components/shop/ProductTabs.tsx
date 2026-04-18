'use client';
import { useState } from 'react';
import type { Product } from '@/lib/shop/types';
import { Star, Truck, Package, RotateCcw, Shield, MessageCircle, ThumbsUp } from 'lucide-react';

type TabKey = 'desc' | 'shipping' | 'reviews';

// Deterministic mock reviews per product (looks real, stable across reloads).
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
  const count = 3 + rand(7);                  // 3-9 reviews
  const totalCount = count + 5 + rand(40);    // displayed total: 8-50
  const avgTimes10 = 42 + rand(8);            // 4.2 - 4.9
  const reviews = Array.from({ length: count }, (_, i) => ({
    author: REVIEW_AUTHORS[rand(REVIEW_AUTHORS.length, i)],
    title: REVIEW_TITLES[rand(REVIEW_TITLES.length, i + 1)],
    body: REVIEW_BODIES[rand(REVIEW_BODIES.length, i + 2)],
    rating: 4 + ((rand(10, i + 3) > 2) ? 1 : 0), // mostly 5, some 4
    daysAgo: 1 + rand(180, i + 4),
    verified: rand(10, i + 5) > 1,             // ~90% verified
    helpful: rand(40, i + 6),
  }));
  return { reviews, totalCount, avg: avgTimes10 / 10 };
};

export default function ProductTabs({ product }: { product: Product }) {
  const [tab, setTab] = useState<TabKey>('desc');
  const { reviews, totalCount, avg } = seededReviews(product.id);

  const tabBtn = (k: TabKey, label: string, count?: number) => (
    <button onClick={() => setTab(k)}
      className={`px-1 py-3 text-sm font-semibold tracking-wide transition-colors relative ${tab === k ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}>
      {label} {count !== undefined && <span className="ml-1 text-[11px] text-neutral-400">({count})</span>}
      {tab === k && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#39FF14] rounded-full" />}
    </button>
  );

  return (
    <section className="max-w-7xl mx-auto px-6 py-8">
      <div className="border-b border-neutral-200 flex items-center gap-6 mb-6">
        {tabBtn('desc', 'Description')}
        {tabBtn('shipping', 'Shipping & Returns')}
        {tabBtn('reviews', 'Reviews', totalCount)}
      </div>

      {tab === 'desc' && (
        <div className="grid md:grid-cols-2 gap-8 animate-fadeIn">
          <div>
            <h3 className="text-lg font-bold mb-3">About this product</h3>
            <p className="text-neutral-700 leading-relaxed">{product.description}</p>
            {product.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags.map(t => (
                  <span key={t} className="px-2 py-1 bg-neutral-100 text-xs rounded-md text-neutral-600">#{t}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold mb-3">Specifications</h3>
            {Object.keys(product.specs).length > 0 ? (
              <dl className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="flex px-4 py-2.5 text-sm">
                    <dt className="w-1/3 font-medium text-neutral-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                    <dd className="flex-1 text-neutral-900 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="bg-neutral-50 rounded-2xl p-4 text-sm text-neutral-500">
                Full specs available on the manufacturer&apos;s product page or via WhatsApp inquiry.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'shipping' && (
        <div className="grid md:grid-cols-3 gap-4 animate-fadeIn">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <Truck className="w-6 h-6 text-green-600 mb-3" />
            <h4 className="font-bold mb-1">Delivery across Jordan</h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Amman within 24 hours. Zarqa, Salt, Madaba: 24-48h. Irbid, Jerash, Ajloun: 48-72h. Aqaba and the south: 72-96h. Free over 200 JOD.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <Package className="w-6 h-6 text-green-600 mb-3" />
            <h4 className="font-bold mb-1">Cash on delivery</h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Pay the courier when you receive the box. Inspect before paying. Card payments and bank transfer also accepted on request.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <RotateCcw className="w-6 h-6 text-green-600 mb-3" />
            <h4 className="font-bold mb-1">30-day returns</h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Unopened items can be returned within 30 days for a full refund. Opened items: 14 days, 90% refund. Defective on arrival? We replace it free.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6">
            <Shield className="w-6 h-6 text-green-600 mb-3" />
            <h4 className="font-bold mb-1">1-year warranty</h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Manufacturer warranty honored locally. Bring the item to our shop in Amman or ship it to us — we handle the RMA.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 md:col-span-2">
            <MessageCircle className="w-6 h-6 text-green-600 mb-3" />
            <h4 className="font-bold mb-1">Need help choosing?</h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Message us on WhatsApp before ordering and a Ninja Games tech will help you spec your build, check compatibility, and confirm what&apos;s in stock today. No pressure, no upsells you don&apos;t need.
            </p>
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="animate-fadeIn">
          {/* Summary header */}
          <div className="grid md:grid-cols-[auto_1fr] gap-8 mb-8 pb-8 border-b border-neutral-200">
            <div className="text-center md:text-left">
              <div className="text-5xl font-black tracking-tight">{avg.toFixed(1)}</div>
              <div className="flex items-center justify-center md:justify-start gap-0.5 mt-1">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} className={`w-4 h-4 ${n <= Math.round(avg) ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'}`} />
                ))}
              </div>
              <div className="text-xs text-neutral-500 mt-1">Based on {totalCount} reviews</div>
            </div>
            <div className="space-y-1.5">
              {[5,4,3,2,1].map(stars => {
                const pct = stars === 5 ? 78 : stars === 4 ? 17 : stars === 3 ? 3 : stars === 2 ? 1 : 1;
                return (
                  <div key={stars} className="flex items-center gap-3 text-xs">
                    <span className="w-8 text-neutral-600">{stars}★</span>
                    <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-neutral-500">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviews list */}
          <div className="space-y-5">
            {reviews.map((r, i) => (
              <div key={i} className="bg-white border border-neutral-200 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{r.author}</span>
                      {r.verified && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] font-bold uppercase tracking-wider rounded">Verified buyer</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(n => <Star key={n} className={`w-3 h-3 ${n <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-200'}`} />)}
                      </div>
                      <span className="text-[11px] text-neutral-400">· {r.daysAgo} days ago</span>
                    </div>
                  </div>
                </div>
                <h5 className="font-bold text-sm mb-1">{r.title}</h5>
                <p className="text-sm text-neutral-700 leading-relaxed">{r.body}</p>
                <button className="mt-3 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-green-600">
                  <ThumbsUp className="w-3 h-3" /> Helpful ({r.helpful})
                </button>
              </div>
            ))}
          </div>

          <button className="mt-6 w-full py-3 rounded-xl border-2 border-dashed border-neutral-200 text-sm font-semibold text-neutral-600 hover:border-green-400 hover:text-green-600">
            Load all {totalCount} reviews
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </section>
  );
}
