'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CityKey } from './delivery';

type CityState = {
  city: CityKey | null;
  hasPicked: boolean;
  setCity: (c: CityKey) => void;
  reset: () => void;
};

export const useCity = create<CityState>()(
  persist(
    (set) => ({
      city: null,
      hasPicked: false,
      setCity: (c) => set({ city: c, hasPicked: true }),
      reset: () => set({ city: null, hasPicked: false }),
    }),
    { name: 'ghanem-shop-city' }
  )
);
