'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCity } from '@/lib/shop/city-store';
import { JORDAN_CITIES } from '@/lib/shop/delivery';
import { MapPin, ChevronRight } from 'lucide-react';

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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9000] flex items-center justify-center px-4 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#0a0a0a]/40 backdrop-blur-sm" />

          <motion.div
            className="relative bg-white rounded-3xl max-w-2xl w-full shadow-[0_32px_80px_-16px_rgba(0,0,0,0.22)] overflow-hidden"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
          >
            {/* Top accent bar */}
            <div className="h-1 bg-[#39FF14]" />

            <div className="p-7 md:p-8">
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-11 h-11 rounded-2xl bg-[#39FF14]/12 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h2
                    className="text-2xl font-bold text-[#0a0a0a] tracking-tight"
                    style={{ fontFamily: 'var(--font-display, system-ui)' }}
                  >
                    Where do we deliver?
                  </h2>
                  <p className="text-[#525252] text-sm mt-1 leading-relaxed">
                    Select your city to see accurate delivery estimates.
                    Free delivery on orders over 200 JOD.
                  </p>
                </div>
              </div>

              {/* City grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {JORDAN_CITIES.map(c => {
                  const isSelected = city === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => { setCity(c.key); setOpen(false); }}
                      className={`group relative px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-200 ${
                        isSelected
                          ? 'border-[#39FF14] bg-[#39FF14]/8'
                          : 'border-neutral-100 hover:border-[#39FF14]/50 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm text-[#0a0a0a]">{c.en}</div>
                          <div className="text-[11px] text-[#a3a3a3] mt-0.5" dir="rtl">{c.ar}</div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 text-[#a3a3a3] group-hover:text-emerald-600 transition-all group-hover:translate-x-0.5 ${
                            isSelected ? 'text-emerald-600' : ''
                          }`}
                        />
                      </div>
                      <div
                        className={`text-[10px] font-semibold mt-1.5 ${
                          c.baseHours <= 12 ? 'text-emerald-600' : c.baseHours <= 48 ? 'text-amber-600' : 'text-[#a3a3a3]'
                        }`}
                      >
                        ~{c.baseHours}h
                        {c.baseHours <= 12 && ' · Express'}
                        {c.baseHours <= 48 && c.baseHours > 12 && ' · Free delivery'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-[11px] text-[#a3a3a3] text-center">
                You can change your city later from the header.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
