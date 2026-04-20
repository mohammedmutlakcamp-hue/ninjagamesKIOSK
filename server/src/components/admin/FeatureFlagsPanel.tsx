'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ToggleLeft, ToggleRight, UtensilsCrossed, CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import { useFeatureFlags, setFeatureFlag, type FeatureFlags } from '@/lib/feature-flags';
import { HelpTip } from './HelpTip';

interface FlagDef {
  key: keyof FeatureFlags;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  whereItShows: string;
}

const FLAG_DEFS: FlagDef[] = [
  {
    key: 'foodMenu',
    title: 'Food Menu (Sandwiches)',
    subtitle: 'Kitchen tab in Food & Snacks. When OFF, players see a "coming soon" banner and only Drinks + Snacks.',
    icon: <UtensilsCrossed size={18} />,
    color: '#ef4444',
    whereItShows: 'Kiosk → Food & Snacks tab',
  },
  {
    key: 'giftCards',
    title: 'Gift Cards Store',
    subtitle: 'PSN / Xbox / Roblox / Steam digital gift card brands. When OFF, sidebar shows "SOON" pill and grid hidden behind a banner.',
    icon: <CreditCard size={18} />,
    color: '#FF1493',
    whereItShows: 'Kiosk → Store → Gift Cards',
  },
];

export function FeatureFlagsPanel() {
  const flags = useFeatureFlags();
  const [busyKey, setBusyKey] = useState<keyof FeatureFlags | null>(null);
  const [savedKey, setSavedKey] = useState<keyof FeatureFlags | null>(null);

  const toggle = async (key: keyof FeatureFlags) => {
    if (busyKey) return;
    setBusyKey(key);
    setSavedKey(null);
    try {
      await setFeatureFlag(key, !flags[key]);
      setSavedKey(key);
      setTimeout(() => setSavedKey((s) => (s === key ? null : s)), 1500);
    } catch (err) {
      console.error('toggle failed', err);
    }
    setBusyKey(null);
  };

  const enabledCount = FLAG_DEFS.filter((d) => flags[d.key]).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)' }}>
          <ToggleRight size={22} className="text-[#39FF14]" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Feature Flags
            <HelpTip title={{ en: 'Feature Flags', ar: 'مفاتيح الميزات' }}
              ar={(
                <>
                  <p className="mb-2">مفاتيح تشغيل/إيقاف للميزات الكبيرة بدون إعادة نشر — تعمل على كل الأجهزة خلال ثانيتين.</p>
                  <p className="text-[#86868b]">كل مفتاح يشرح نفسه أسفله (أين يظهر وماذا يحدث عند التفعيل).</p>
                </>
              )}>
              <p className="mb-2">ON/OFF switches for big features, no redeploy needed — propagates to every kiosk in &lt;2s.</p>
              <p className="text-[#86868b]">Each flag has its own description below (where it shows up, what it controls).</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">
            Live toggles — changes hit every kiosk in &lt; 2 seconds. {enabledCount}/{FLAG_DEFS.length} features enabled.
          </p>
        </div>
      </div>

      {/* Flag list */}
      <div className="space-y-3 max-w-3xl">
        {FLAG_DEFS.map((def) => {
          const on = flags[def.key];
          const busy = busyKey === def.key;
          const saved = savedKey === def.key;
          return (
            <motion.div
              key={def.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-[#e5e5ea] p-5 flex items-start gap-4 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${def.color}15`, color: def.color, border: `1px solid ${def.color}25` }}>
                {def.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-[#1d1d1f] text-base">{def.title}</h3>
                  {saved && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="flex items-center gap-1 text-xs text-[#34c759] font-medium">
                      <CheckCircle2 size={12} /> saved
                    </motion.span>
                  )}
                </div>
                <p className="text-sm text-[#86868b] leading-relaxed">{def.subtitle}</p>
                <p className="text-[11px] text-[#86868b] mt-2 italic">→ {def.whereItShows}</p>
              </div>

              <button
                onClick={() => toggle(def.key)}
                disabled={busy}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-60"
                style={{
                  background: on ? '#34c759' : '#e5e5ea',
                  color: on ? 'white' : '#86868b',
                  minWidth: 110,
                  justifyContent: 'center',
                }}
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : on ? (
                  <><ToggleRight size={16} /> ON</>
                ) : (
                  <><ToggleLeft size={16} /> OFF</>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-6 max-w-3xl rounded-xl p-4 bg-[#f5f5f7] border border-[#e5e5ea]">
        <p className="text-xs text-[#86868b] leading-relaxed">
          <span className="font-medium text-[#1d1d1f]">How this works:</span> flags live in
          <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-[#e5e5ea] text-[#1d1d1f]">config/feature-flags</code>
          on Firestore. Every kiosk subscribes to that doc with onSnapshot, so flipping a switch
          here propagates instantly without a redeploy. Defaults: every flag is OFF.
        </p>
      </div>
    </div>
  );
}
