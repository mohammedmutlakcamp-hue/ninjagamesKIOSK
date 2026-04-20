'use client';

// Unified PC hub — merges three previously separate sidebar entries
// (Live PCs, PCs, PC Zones) into one page with sub-tabs.

import { useState } from 'react';
import { Activity, Monitor, MapPin } from 'lucide-react';
import { LivePCsDashboard } from './LivePCsDashboard';
import { PCManagement } from './PCManagement';
import { PCZones } from './PCZones';

type Sub = 'live' | 'manage' | 'zones';

export function PCsHub() {
  const [sub, setSub] = useState<Sub>('live');

  return (
    <div>
      <div className="px-6 pt-5">
        <div className="flex items-center gap-2 bg-[#f5f5f7] p-1 rounded-xl w-fit">
          {([
            { key: 'live',   label: 'Live PCs',      icon: Activity,  accent: '#34c759' },
            { key: 'manage', label: 'Manage PCs',    icon: Monitor,   accent: '#0071e3' },
            { key: 'zones',  label: 'PC Zones',      icon: MapPin,    accent: '#ff9500' },
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

      {sub === 'live' && <LivePCsDashboard />}
      {sub === 'manage' && <PCManagement />}
      {sub === 'zones' && <PCZones />}
    </div>
  );
}
