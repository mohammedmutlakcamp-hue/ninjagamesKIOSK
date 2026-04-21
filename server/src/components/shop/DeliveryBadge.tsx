'use client';
import { useCity } from '@/lib/shop/city-store';
import { estimateDelivery } from '@/lib/shop/delivery';
import { Zap, Truck } from 'lucide-react';

export default function DeliveryBadge({
  productId,
  inStock,
  compact = false,
}: {
  productId: string;
  inStock: boolean;
  compact?: boolean;
}) {
  const city = useCity(s => s.city);
  const eta = estimateDelivery(productId, city, inStock);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          eta.fast
            ? 'bg-[#39FF14]/12 text-emerald-700'
            : 'bg-neutral-100 text-[#525252]'
        }`}
      >
        {eta.fast
          ? <Zap className="w-2.5 h-2.5 flex-shrink-0" />
          : <Truck className="w-2.5 h-2.5 flex-shrink-0" />
        }
        {eta.label}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${
          eta.fast
            ? 'bg-[#39FF14]/10 text-emerald-700'
            : 'bg-neutral-100 text-[#525252]'
        }`}
      >
        {eta.fast
          ? <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          : <Truck className="w-3.5 h-3.5 flex-shrink-0" />
        }
        <span className="font-semibold">{eta.label}</span>
      </div>
      {eta.free && (
        <span className="text-emerald-600 font-medium">· Free delivery</span>
      )}
      {!inStock && (
        <span className="text-amber-600 font-medium">· Order from supplier</span>
      )}
    </div>
  );
}
