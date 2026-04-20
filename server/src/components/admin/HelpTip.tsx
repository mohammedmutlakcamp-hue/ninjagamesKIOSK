'use client';

// ════════════════════════════════════════════════════════════════════
//  <HelpTip /> — inline "what is this?" explainer
// ────────────────────────────────────────────────────────────────────
//  Reusable little (?) button for admin-panel sections. Click it to
//  open a popover with a plain-language explanation.
//
//  Usage:
//    <HelpTip title="Luck Slider">
//      Boosts the chance of rare+ chest drops by the selected %.
//      Negative values tilt odds toward the house.
//    </HelpTip>
//
//  Or for a single-line blurb:
//    <HelpTip>Stuff</HelpTip>
//
//  Visual: neutral-gray (?) that turns orange on hover. Popover floats
//  below-right of the button by default; sizes/positions flip when
//  there's no room.
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';

interface Props {
  title?: string;
  children: ReactNode;
  // Default tint is orange; override per-section if you like.
  color?: string;
  // Optional tiny label shown next to the ? icon (e.g. "Explain").
  label?: string;
  // Override icon size.
  size?: number;
}

export function HelpTip({ title, children, color = '#ff9500', label, size = 14 }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current || !btnRef.current) return;
      if (popRef.current.contains(e.target as Node)) return;
      if (btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Pick placement (below-start is the happy default; flip when near edge)
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const belowSpace = window.innerHeight - rect.bottom;
    const rightSpace = window.innerWidth - rect.left;
    setPlacement(belowSpace < 260 ? 'above' : 'below');
    setAlign(rightSpace < 320 ? 'end' : 'start');
  }, [open]);

  return (
    <span className="relative inline-flex items-center align-middle" style={{ zIndex: open ? 60 : 'auto' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 text-[#86868b] hover:text-[color:var(--hc)] transition-colors rounded-full outline-none focus:ring-2 focus:ring-[color:var(--hc)]/40"
        style={{ ['--hc' as any]: color }}
        aria-label="Explain this"
        title={title ? `What is ${title}?` : 'What is this?'}
      >
        <HelpCircle size={size} />
        {label && <span className="text-[10px] font-medium tracking-wide">{label}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            initial={{ opacity: 0, scale: 0.96, y: placement === 'below' ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: placement === 'below' ? -4 : 4 }}
            transition={{ duration: 0.14 }}
            className="absolute w-[280px] max-w-[calc(100vw-32px)] rounded-xl bg-white text-[#1d1d1f] border border-[#e5e5ea] shadow-[0_12px_40px_rgba(0,0,0,0.14)] p-3.5"
            style={{
              top: placement === 'below' ? 'calc(100% + 8px)' : 'auto',
              bottom: placement === 'above' ? 'calc(100% + 8px)' : 'auto',
              left: align === 'start' ? 0 : 'auto',
              right: align === 'end' ? 0 : 'auto',
            }}
          >
            {/* Arrow */}
            <div
              className="absolute w-3 h-3 rotate-45 bg-white border"
              style={{
                top: placement === 'below' ? -6 : 'auto',
                bottom: placement === 'above' ? -6 : 'auto',
                left: align === 'start' ? 14 : 'auto',
                right: align === 'end' ? 14 : 'auto',
                borderColor: placement === 'below'
                  ? '#e5e5ea #e5e5ea transparent transparent'
                  : 'transparent transparent #e5e5ea #e5e5ea',
                borderWidth: 1,
                transform: 'rotate(45deg)',
              }}
            />

            <div className="flex items-start gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: `${color}18`, color }}>
                <HelpCircle size={13} />
              </div>
              <div className="flex-1 min-w-0">
                {title && <div className="font-semibold text-sm text-[#1d1d1f] leading-tight">{title}</div>}
              </div>
              <button onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-md hover:bg-[#f5f5f7] flex items-center justify-center text-[#86868b]">
                <X size={12} />
              </button>
            </div>

            <div className="text-[13px] leading-relaxed text-[#424245]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
