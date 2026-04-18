'use client';
import { useCart, SHOP_WHATSAPP } from '@/lib/shop/cart-store';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { getProduct } from '@/lib/shop/catalog';
import ProductImage from '@/components/shop/ProductImage';
import { Plus, Minus, Trash2, MessageCircle, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function CartPage() {
  const items = useCart(s => s.items);
  const setQty = useCart(s => s.setQty);
  const remove = useCart(s => s.remove);
  const clear = useCart(s => s.clear);
  const city = useCity(s => s.city);
  const cityMeta = JORDAN_CITIES.find(c => c.key === city);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const products = mounted ? items.map(i => ({ item: i, product: getProduct(i.productId)! })).filter(x => x.product) : [];

  if (!mounted) {
    return <div className="max-w-3xl mx-auto px-6 py-20 text-center text-neutral-400">Loading cart...</div>;
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
      `*New Order from Ghanem Shop*`,
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
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <ShoppingBag className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="text-neutral-500 mt-2">Browse our catalog and add some gear.</p>
        <Link href="/ghanemshopidea" className="inline-block mt-6 px-6 py-3 rounded-xl bg-[#39FF14] text-black font-bold">Continue Shopping</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Cart ({products.length})</h1>

      <div className="grid lg:grid-cols-[1fr_400px] gap-8">
        {/* Items */}
        <div className="space-y-3">
          {products.map(({ product, item }) => (
            <div key={product.id} className="bg-white rounded-2xl border border-neutral-200 p-4 flex gap-4">
              <div className="w-24 flex-shrink-0">
                <ProductImage product={product} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold tracking-wider text-neutral-500">{product.brand}</div>
                <Link href={`/ghanemshopidea/p/${product.id}`} className="font-semibold text-neutral-900 hover:text-green-700 line-clamp-2">{product.name}</Link>
                <div className="text-xs text-neutral-400 mt-0.5">{product.model}</div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center bg-neutral-100 rounded-lg">
                    <button onClick={() => setQty(product.id, item.qty - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-neutral-200 rounded-l-lg"><Minus className="w-3 h-3" /></button>
                    <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                    <button onClick={() => setQty(product.id, item.qty + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-neutral-200 rounded-r-lg"><Plus className="w-3 h-3" /></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{product.priceJod * item.qty} JOD</span>
                    <button onClick={() => remove(product.id)} className="p-1 text-neutral-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={clear} className="text-xs text-neutral-500 hover:text-red-600">Clear cart</button>
        </div>

        {/* Summary + checkout */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5">
            <h3 className="font-bold mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-600">Subtotal</span><span className="font-medium">{subtotal} JOD</span></div>
              <div className="flex justify-between"><span className="text-neutral-600">Delivery {cityMeta && `· ${cityMeta.en}`}</span><span className="font-medium">{delivery === 0 ? <span className="text-green-600">FREE</span> : `${delivery} JOD`}</span></div>
              <div className="border-t border-neutral-100 pt-2 flex justify-between text-base"><span className="font-bold">Total</span><span className="font-bold">{total} JOD</span></div>
            </div>
            {subtotal < 200 && (
              <div className="mt-3 text-xs bg-orange-50 text-orange-700 rounded-lg px-3 py-2">
                Add {200 - subtotal} JOD more for free delivery.
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-3">
            <h3 className="font-bold">Delivery Details</h3>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name *" className="w-full px-4 py-2.5 bg-neutral-100 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number * (e.g. 0790123456)" className="w-full px-4 py-2.5 bg-neutral-100 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500" />
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, building, floor" className="w-full px-4 py-2.5 bg-neutral-100 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500" />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full px-4 py-2.5 bg-neutral-100 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-green-500 resize-none" />
            <button onClick={sendWhatsApp} className="w-full py-3.5 rounded-xl bg-green-500 text-white font-bold hover:bg-green-600 flex items-center justify-center gap-2">
              <MessageCircle className="w-5 h-5" /> Place Order via WhatsApp
            </button>
            <p className="text-[11px] text-neutral-500 text-center">Cash on delivery · 1-year warranty · 30-day returns</p>
          </div>
        </div>
      </div>
    </div>
  );
}
