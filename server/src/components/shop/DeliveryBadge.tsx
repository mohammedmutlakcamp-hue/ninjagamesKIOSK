'use client';
import { useCity } from '@/lib/shop/city-store';
import { estimateDelivery } from '@/lib/shop/delivery';
import { Truck, Zap } from 'lucide-react';

export default function DeliveryBadge({ productId, inStock, compact = false }: {
  productId: string;
  inStock: boolean;
  compact?: boolean;
}) {
  const city = useCity(s => s.city);
  const eta = estimateDelivery(productId, city, inStock);

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${eta.fast ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-600'}`}>
        {eta.fast ? <Zap className="w-2.5 h-2.5" /> : <Truck className="w-2.5 h-2.5" />}
        {eta.label}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${eta.fast ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-700'}`}>
        {eta.fast ? <Zap className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
        <span className="font-semibold">{eta.label}</span>
      </div>
      {eta.free && <span className="text-neutral-500">· Free delivery</span>}
      {!inStock && <span className="text-orange-600 font-medium">· Order from supplier</span>}
    </div>
  );
}
