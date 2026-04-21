'use client';
import { useCart, SHOP_WHATSAPP } from '@/lib/shop/cart-store';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { getProduct } from '@/lib/shop/catalog';
import ProductImage from '@/components/shop/ProductImage';
import { Plus, Minus, Trash2, MessageCircle, ShoppingBag, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function CartPage() {
  const items = useCart(s => s.items);
  const setQty = useCart(s => s.setQty);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);
  const city = useCity(s => s.city);
  const cityMeta = JORDAN_CITIES.find(c => c.key === city);

  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => setMounted(true), []);

  const products = mounted
    ? items.map(i => ({ item: i, product: getProduct(i.productId)! })).filter(x => x.product)
    : [];

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center text-[#a3a3a3]">
        Loading cart...
      </div>
    );
  }

  const subtotal = products.reduce((s, x) => s + x.product.priceJod * x.item.qty, 0);
  const delivery = subtotal >= 200 ? 0 : 5;
  const total = subtotal + delivery;

  const sendWhatsApp = () => {
    if (!name || !phone) {
      alert('Please enter your name and phone number');
      return;
    }
    const lines = [
      `*New Order from Ninja Games Shop*`,
      ``,
      `*Customer:* ${name}`,
      `*Phone:* ${phone}`,
      `*City:* ${cityMeta?.en || 'Not set'}`,
      `*Address:* ${address || '—'}`,
      ``,
      `*Items:*`,
      ...products.map(({ product, item }) =>
        `• ${item.qty} × ${product.brand} ${product.name} (${product.model}) — ${product.priceJod * item.qty} JOD`
      ),
      ``,
      `*Subtotal:* ${subtotal} JOD`,
      `*Delivery:* ${delivery === 0 ? 'FREE' : delivery + ' JOD'}`,
      `*TOTAL:* ${total} JOD`,
      notes ? `\n*Notes:* ${notes}` : '',
    ].filter(Boolean).join('\n');
    const url = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(lines)}`;
    window.open(url, '_blank');
  };

  if (products.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <div className="w-20 h-20 rounded-3xl bg-neutral-100 flex items-center justify-center mx-auto mb-6">
          <ShoppingBag className="w-9 h-9 text-[#a3a3a3]" />
        </div>
        <h1
          className="text-2xl font-bold text-[#0a0a0a]"
          style={{ fontFamily: 'var(--font-display, system-ui)' }}
        >
          Your cart is empty
        </h1>
        <p className="text-[#525252] mt-2 text-sm">Browse our catalog and add some gear.</p>
        <Link
          href="/ghanemshopidea"
          className="inline-flex items-center gap-2 mt-6 px-6 py-3.5 rounded-xl bg-[#39FF14] text-[#0a0a0a] font-bold hover:bg-[#2ee010] transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/ghanemshopidea"
          className="w-9 h-9 rounded-xl border border-neutral-200 flex items-center justify-center hover:bg-neutral-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#525252]" />
        </Link>
        <h1
          className="text-3xl font-bold text-[#0a0a0a]"
          style={{ fontFamily: 'var(--font-display, system-ui)' }}
        >
          Cart
          <span className="ml-2 text-xl text-[#a3a3a3] font-medium">({products.length})</span>
        </h1>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
        {/* ─── Items list ─── */}
        <div className="space-y-3">
          {products.map(({ product, item }, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35, delay: i * 0.04 }}
              className="bg-white rounded-2xl border border-neutral-100 p-4 flex gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              {/* Image */}
              <div className="w-24 flex-shrink-0">
                <ProductImage product={product} size="sm" />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#a3a3a3]">
                  {product.brand}
                </div>
                <Link
                  href={`/ghanemshopidea/p/${product.id}`}
                  className="font-semibold text-sm text-[#0a0a0a] hover:text-emerald-700 line-clamp-2 leading-snug transition-colors"
                >
                  {product.name}
                </Link>
                <div className="text-[11px] text-[#a3a3a3] mt-0.5">{product.model}</div>

                <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                  {/* Qty stepper */}
                  <div className="flex items-center bg-[#f5f5f5] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setQty(product.id, item.qty - 1)}
                      className="w-9 h-9 flex items-center justify-center hover:bg-neutral-200 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5 text-[#525252]" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-[#0a0a0a]">{item.qty}</span>
                    <button
                      onClick={() => setQty(product.id, item.qty + 1)}
                      className="w-9 h-9 flex items-center justify-center hover:bg-neutral-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#525252]" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[#0a0a0a]">{product.priceJod * item.qty} JOD</span>
                    <button
                      onClick={() => remove(product.id)}
                      className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#a3a3a3] hover:text-red-500 transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          <button
            onClick={clear}
            className="text-xs text-[#a3a3a3] hover:text-red-500 transition-colors ml-1"
          >
            Clear cart
          </button>
        </div>

        {/* ─── Order summary + checkout ─── */}
        <div className="space-y-4 sticky top-20">
          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h3
              className="font-bold text-[#0a0a0a] mb-4"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              Order Summary
            </h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[#525252]">Subtotal ({products.reduce((n, x) => n + x.item.qty, 0)} items)</span>
                <span className="font-semibold text-[#0a0a0a]">{subtotal} JOD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525252]">
                  Delivery {cityMeta && <span className="text-[#a3a3a3]">· {cityMeta.en}</span>}
                </span>
                <span className="font-semibold text-[#0a0a0a]">
                  {delivery === 0
                    ? <span className="text-emerald-600">FREE</span>
                    : `${delivery} JOD`
                  }
                </span>
              </div>
              <div className="border-t border-neutral-100 pt-3 flex justify-between text-base font-bold text-[#0a0a0a]">
                <span>Total</span>
                <span>{total} JOD</span>
              </div>
            </div>
            {subtotal < 200 && (
              <div className="mt-3 text-[11px] bg-amber-50 text-amber-700 rounded-xl px-3 py-2.5 font-medium">
                Add {200 - subtotal} JOD more for free delivery.
              </div>
            )}
          </div>

          {/* Delivery details */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h3
              className="font-bold text-[#0a0a0a]"
              style={{ fontFamily: 'var(--font-display, system-ui)' }}
            >
              Delivery Details
            </h3>
            {[
              { value: name, setter: setName, placeholder: 'Full name *', type: 'text' },
              { value: phone, setter: setPhone, placeholder: 'Phone number * (e.g. 0790123456)', type: 'tel' },
              { value: address, setter: setAddress, placeholder: 'Street, building, floor', type: 'text' },
            ].map(({ value, setter, placeholder, type }) => (
              <input
                key={placeholder}
                type={type}
                value={value}
                onChange={e => setter(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-[#f5f5f5] rounded-xl text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none focus:bg-white focus:ring-2 focus:ring-[#39FF14] transition-all"
              />
            ))}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full px-4 py-3 bg-[#f5f5f5] rounded-xl text-sm text-[#0a0a0a] placeholder:text-[#a3a3a3] outline-none focus:bg-white focus:ring-2 focus:ring-[#39FF14] transition-all resize-none"
            />
            <button
              onClick={sendWhatsApp}
              className="w-full h-13 py-3.5 rounded-xl bg-[#39FF14] text-[#0a0a0a] font-bold flex items-center justify-center gap-2 hover:bg-[#2ee010] transition-colors text-sm"
            >
              <MessageCircle className="w-5 h-5" />
              Place Order via WhatsApp
            </button>

            {/* Trust micro-copy */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { icon: Check, label: 'Cash on delivery' },
                { icon: Check, label: '1-yr warranty' },
                { icon: Check, label: '30-day returns' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1 text-[10px] text-[#a3a3a3]">
                  <Icon className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
