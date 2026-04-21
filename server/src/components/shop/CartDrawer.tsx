'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Minus, Plus, Trash2, MessageCircle, ArrowRight } from 'lucide-react';
import { useCart, SHOP_WHATSAPP } from '@/lib/shop/cart-store';
import { getProduct } from '@/lib/shop/catalog';
import ProductImage from './ProductImage';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';

export default function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const items = useCart(s => s.items);
  const setQty = useCart(s => s.setQty);
  const remove = useCart(s => s.remove);
  const city = useCity(s => s.city);
  const cityMeta = JORDAN_CITIES.find(c => c.key === city);
  const focusRef = useRef<HTMLButtonElement>(null);

  // Lock scroll + handle Escape
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Move focus into drawer
    setTimeout(() => focusRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Resolve products from cart items (only after mount)
  const cartLines = items
    .map(i => ({ item: i, product: getProduct(i.productId) }))
    .filter((x): x is { item: typeof items[0]; product: NonNullable<ReturnType<typeof getProduct>> } => !!x.product);

  const subtotal = cartLines.reduce((s, x) => s + x.product.priceJod * x.item.qty, 0);
  const deliveryFee = subtotal >= 200 ? 0 : 5;

  const buildWhatsAppMessage = () => {
    const lines = [
      `*New Order from Ninja Games Shop*`,
      ``,
      `*City:* ${cityMeta?.en || 'Not set'}`,
      ``,
      `*Items:*`,
      ...cartLines.map(({ product, item }) =>
        `• ${item.qty} × ${product.brand} ${product.name} (${product.model}) — ${product.priceJod * item.qty} JOD`
      ),
      ``,
      `*Subtotal:* ${subtotal} JOD`,
      `*Delivery:* ${deliveryFee === 0 ? 'FREE' : deliveryFee + ' JOD'}`,
      `*TOTAL:* ${subtotal + deliveryFee} JOD`,
    ].join('\n');
    return `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(lines)}`;
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9500] bg-[#0a0a0a]/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />

          {/* Drawer panel */}
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-[9600] w-full sm:w-[480px] bg-white flex flex-col shadow-[−32px_0_80px_rgba(0,0,0,0.12)]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.38 }}
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#0a0a0a]" />
                <span className="font-bold text-[#0a0a0a]" style={{ fontFamily: 'var(--font-display, system-ui)' }}>
                  Cart
                </span>
                {cartLines.length > 0 && (
                  <span className="ml-0.5 w-5 h-5 rounded-full bg-[#39FF14] text-[#0a0a0a] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {cartLines.reduce((n, x) => n + x.item.qty, 0)}
                  </span>
                )}
              </div>
              <button
                ref={focusRef}
                onClick={onClose}
                className="w-9 h-9 rounded-xl hover:bg-neutral-100 flex items-center justify-center transition-colors"
                aria-label="Close cart"
              >
                <X className="w-4 h-4 text-[#525252]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cartLines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-neutral-100 flex items-center justify-center mb-5">
                    <ShoppingBag className="w-9 h-9 text-[#a3a3a3]" />
                  </div>
                  <p className="font-semibold text-[#0a0a0a] text-lg">Your cart is empty</p>
                  <p className="text-sm text-[#525252] mt-1">Browse our catalog and add some gear.</p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-5 py-3 rounded-xl bg-[#0a0a0a] text-white font-semibold text-sm hover:bg-neutral-800 transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cartLines.map(({ product, item }) => (
                    <li
                      key={product.id}
                      className="flex gap-3 bg-[#fafafa] rounded-2xl p-3"
                    >
                      {/* Thumbnail */}
                      <div className="w-20 flex-shrink-0">
                        <ProductImage product={product} size="sm" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] font-bold tracking-wider text-[#a3a3a3] uppercase">
                            {product.brand}
                          </div>
                          <Link
                            href={`/ghanemshopidea/p/${product.id}`}
                            onClick={onClose}
                            className="text-sm font-semibold text-[#0a0a0a] line-clamp-2 hover:text-emerald-700 transition-colors leading-snug"
                          >
                            {product.name}
                          </Link>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          {/* Qty stepper */}
                          <div className="flex items-center bg-white rounded-xl border border-neutral-200">
                            <button
                              onClick={() => setQty(product.id, item.qty - 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 rounded-l-xl transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3 text-[#525252]" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold text-[#0a0a0a]">
                              {item.qty}
                            </span>
                            <button
                              onClick={() => setQty(product.id, item.qty + 1)}
                              className="w-8 h-8 flex items-center justify-center hover:bg-neutral-50 rounded-r-xl transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3 text-[#525252]" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#0a0a0a]">
                              {product.priceJod * item.qty} JOD
                            </span>
                            <button
                              onClick={() => remove(product.id)}
                              className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                              aria-label="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#a3a3a3] hover:text-red-500 transition-colors" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer — only show when cart has items */}
            {cartLines.length > 0 && (
              <div className="border-t border-neutral-100 px-6 pt-5 pb-6 space-y-3">
                {/* Subtotal */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#525252]">Subtotal</span>
                    <span className="font-semibold text-[#0a0a0a]">{subtotal} JOD</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#525252]">Delivery {cityMeta && `· ${cityMeta.en}`}</span>
                    <span className="font-semibold text-[#0a0a0a]">
                      {deliveryFee === 0
                        ? <span className="text-emerald-600">FREE</span>
                        : `${deliveryFee} JOD`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-[#0a0a0a] pt-1.5 border-t border-neutral-100">
                    <span>Total</span>
                    <span>{subtotal + deliveryFee} JOD</span>
                  </div>
                </div>

                {subtotal < 200 && (
                  <div className="text-[11px] bg-amber-50 text-amber-700 rounded-xl px-3 py-2 text-center">
                    Add {200 - subtotal} JOD more for free delivery
                  </div>
                )}

                {/* CTA buttons */}
                <a
                  href={buildWhatsAppMessage()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-12 rounded-xl bg-[#39FF14] text-[#0a0a0a] font-bold flex items-center justify-center gap-2 hover:bg-[#2ee010] transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  Checkout on WhatsApp
                </a>

                <Link
                  href="/ghanemshopidea/cart"
                  onClick={onClose}
                  className="w-full h-11 rounded-xl border-2 border-neutral-200 text-[#0a0a0a] font-semibold text-sm flex items-center justify-center gap-1.5 hover:border-neutral-400 transition-colors"
                >
                  View full cart
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
