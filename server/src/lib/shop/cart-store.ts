'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from './types';

type CartState = {
  items: CartItem[];
  add: (productId: string, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (productId, qty = 1) =>
        set(s => {
          const existing = s.items.find(i => i.productId === productId);
          if (existing) {
            return { items: s.items.map(i => i.productId === productId ? { ...i, qty: i.qty + qty } : i) };
          }
          return { items: [...s.items, { productId, qty }] };
        }),
      remove: productId => set(s => ({ items: s.items.filter(i => i.productId !== productId) })),
      setQty: (productId, qty) => {
        if (qty <= 0) { get().remove(productId); return; }
        set(s => ({ items: s.items.map(i => i.productId === productId ? { ...i, qty } : i) }));
      },
      clear: () => set({ items: [] }),
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
    }),
    { name: 'ghanem-shop-cart' }
  )
);

export const SHOP_WHATSAPP = '962799999999'; // TODO: replace with Ghanem's real WhatsApp
