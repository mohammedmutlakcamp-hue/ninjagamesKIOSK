'use client';
import { useEffect, useState } from 'react';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { MapPin } from 'lucide-react';

export default function CityPicker() {
  const { city, hasPicked, setCity } = useCity();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!hasPicked) setOpen(true);
  }, [hasPicked]);

  if (!hydrated) return null;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9000] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Where do we deliver?</h2>
            <p className="text-neutral-600 text-sm mt-1">Pick your city to see accurate delivery times for every product. Free delivery on orders over 200 JOD.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {JORDAN_CITIES.map(c => (
            <button
              key={c.key}
              onClick={() => { setCity(c.key); setOpen(false); }}
              className={`px-4 py-3 rounded-xl border text-left transition-all ${city === c.key ? 'border-green-500 bg-green-50' : 'border-neutral-200 hover:border-green-300 hover:bg-green-50/30'}`}
            >
              <div className="font-semibold text-neutral-900">{c.en}</div>
              <div className="text-xs text-neutral-500" dir="rtl">{c.ar}</div>
              <div className="text-[10px] text-green-600 font-medium mt-1">~{c.baseHours}h</div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-neutral-400 text-center">You can change your city later from the header.</p>
      </div>
    </div>
  );
}
