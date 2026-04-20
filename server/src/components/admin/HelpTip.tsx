'use client';

// ════════════════════════════════════════════════════════════════════
//  <HelpTip /> — inline "what is this?" explainer (bilingual EN + AR)
// ────────────────────────────────────────────────────────────────────
//  Reusable little (?) button for admin-panel sections.
//  Opens on hover (after ~180ms) or on click, closes on mouseleave +
//  click-outside + Escape.
//
//  Usage (English-only, legacy):
//    <HelpTip title="Luck Slider">Boosts rare drop chance by X%.</HelpTip>
//
//  Usage (bilingual):
//    <HelpTip
//      title={{ en: 'Luck Slider', ar: 'منزلق الحظ' }}
//      ar={<>يزيد احتمالية الدروب النادرة بنسبة X%.</>}
//    >
//      Boosts rare drop chance by X%.
//    </HelpTip>
//
//  Language pref is persisted to localStorage('admin-help-lang'), default
//  English. Users toggle EN/AR via the 🇬🇧/🇸🇦 chip at the top of the popover.
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';

type BilingualText = string | { en: string; ar?: string };

interface Props {
  /** Popover header. Accepts string (legacy) or { en, ar }. */
  title?: BilingualText;
  /** English body (legacy `children` prop). */
  children?: ReactNode;
  /** Arabic body. When set, adds a language toggle inside the popover. */
  ar?: ReactNode;
  /** Explicit English override — use together with `ar` instead of children for new code. */
  en?: ReactNode;
  color?: string;
  label?: string;
  size?: number;
}

const LANG_KEY = 'admin-help-lang';
function readLang(): 'en' | 'ar' {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANG_KEY);
  return stored === 'ar' ? 'ar' : 'en';
}

export function HelpTip({
  title,
  children,
  ar,
  en,
  color = '#ff9500',
  label,
  size = 14,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // click pins it, hover alone doesn't
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLang(readLang()); }, []);

  // Close on outside click + Escape (when pinned)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current || !btnRef.current) return;
      if (popRef.current.contains(e.target as Node)) return;
      if (btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setPinned(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPinned(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const belowSpace = window.innerHeight - rect.bottom;
    const rightSpace = window.innerWidth - rect.left;
    setPlacement(belowSpace < 260 ? 'above' : 'below');
    setAlign(rightSpace < 320 ? 'end' : 'start');
  }, [open]);

  const scheduleOpen = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setOpen(true), 180);
  }, []);

  const scheduleClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (pinned) return; // click-opened — don't auto-close on mouseleave
    hoverTimerRef.current = setTimeout(() => setOpen(false), 120);
  }, [pinned]);

  const toggleLang = () => {
    const next: 'en' | 'ar' = lang === 'en' ? 'ar' : 'en';
    setLang(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* non-fatal */ }
  };

  // Resolve title / body for the active language, with graceful fallbacks.
  const titleStr =
    typeof title === 'string' ? title
    : title ? (lang === 'ar' ? (title.ar || title.en) : title.en)
    : undefined;
  const hasAr = !!ar;
  const bodyEN = en ?? children;
  const body = lang === 'ar' && hasAr ? ar : bodyEN;
  const bodyDir = lang === 'ar' && hasAr ? 'rtl' : 'ltr';
  const bodyAlign = lang === 'ar' && hasAr ? 'text-right' : 'text-left';

  return (
    <span className="relative inline-flex items-center align-middle" style={{ zIndex: open ? 60 : 'auto' }}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Click toggles "pinned" (stays open) vs auto-dismissable.
          setOpen((o) => !o || !pinned);
          setPinned((p) => !open || !p);
        }}
        className="inline-flex items-center gap-1 text-[#86868b] hover:text-[color:var(--hc)] transition-colors rounded-full outline-none focus:ring-2 focus:ring-[color:var(--hc)]/40"
        style={{ ['--hc' as any]: color }}
        aria-label="Explain this"
        title={titleStr ? `What is ${titleStr}?` : 'What is this?'}
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
            className="absolute w-[300px] max-w-[calc(100vw-32px)] rounded-xl bg-white text-[#1d1d1f] border border-[#e5e5ea] shadow-[0_12px_40px_rgba(0,0,0,0.14)] p-3.5"
            style={{
              top: placement === 'below' ? 'calc(100% + 8px)' : 'auto',
              bottom: placement === 'above' ? 'calc(100% + 8px)' : 'auto',
              left: align === 'start' ? 0 : 'auto',
              right: align === 'end' ? 0 : 'auto',
            }}
            // Hovering the popover keeps it open.
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
          >
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
              }}
            />

            <div className="flex items-start gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: `${color}18`, color }}>
                <HelpCircle size={13} />
              </div>
              <div className="flex-1 min-w-0">
                {titleStr && <div className="font-semibold text-sm text-[#1d1d1f] leading-tight" dir={bodyDir}>{titleStr}</div>}
              </div>

              {hasAr && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleLang(); }}
                  className="h-6 px-2 rounded-md border border-[#e5e5ea] hover:bg-[#f5f5f7] text-[10px] font-semibold tracking-wider text-[#86868b] hover:text-[#1d1d1f] flex items-center gap-1"
                  title={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
                >
                  {lang === 'en' ? 'EN · عربي' : 'عربي · EN'}
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); setPinned(false); }}
                className="w-6 h-6 rounded-md hover:bg-[#f5f5f7] flex items-center justify-center text-[#86868b]">
                <X size={12} />
              </button>
            </div>

            <div className={`text-[13px] leading-relaxed text-[#424245] ${bodyAlign}`} dir={bodyDir}>
              {body}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
