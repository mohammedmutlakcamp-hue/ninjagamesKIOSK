'use client';

// Unified Hubbly hub — merges Hubbly Menu (flavors/cigarettes editor)
// and Hubbly Bubbly (live orders) into one page with sub-tabs.

import { useState } from 'react';
import { ClipboardList, Flame } from 'lucide-react';
import { HubblyManagement } from './HubblyManagement';
import { OrdersPanel } from './OrdersPanel';

type Sub = 'orders' | 'menu';

export function HubblyHub() {
  const [sub, setSub] = useState<Sub>('orders');

  return (
    <div>
      <div className="px-6 pt-5">
        <div className="flex items-center gap-2 bg-[#f5f5f7] p-1 rounded-xl w-fit">
          {([
            { key: 'orders', label: 'Live Orders', icon: ClipboardList, accent: '#06B6D4' },
            { key: 'menu',   label: 'Menu Editor', icon: Flame,         accent: '#ef4444' },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setSub(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                sub === t.key ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
              style={sub === t.key ? { color: t.accent } : undefined}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {sub === 'orders' && <OrdersPanel kindFilter="shisha" />}
      {sub === 'menu' && <HubblyManagement />}
    </div>
  );
}
