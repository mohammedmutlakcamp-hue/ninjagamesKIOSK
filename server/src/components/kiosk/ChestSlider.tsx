'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SkipForward } from 'lucide-react';

export interface SliderItem {
  id?: string;
  name: string;
  rarity: string;
  image?: string;
  icon?: React.ReactNode; // rendered if no image
  color?: string;          // override rarity color
}

interface Props {
  items: SliderItem[];         // all tiles (>= 40 recommended). One of these is the winner
  winIndex: number;            // index of the winning tile (should be around 33 for visual pacing)
  accentColor?: string;        // themeable accent (default green)
  title?: string;              // header label (e.g. chest name)
  onComplete: () => void;      // fires once spin lands
  rarityColor: (rarity: string) => string;
  duration?: number;           // ms, default 6000
}

const CARD_W = 200;

export function ChestSlider({ items, winIndex, accentColor = '#39FF14', title, onComplete, rarityColor, duration = 6000 }: Props) {
  const [spinOffset, setSpinOffset] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [landed, setLanded] = useState(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    startRef.current = Date.now();
    const targetOffset = winIndex * CARD_W + Math.random() * (CARD_W * 0.3);
    let lastCard = -1;
    const animate = () => {
      const progress = Math.min((Date.now() - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4); // quartic ease-out
      const offset = eased * targetOffset;
      setSpinOffset(offset);
      const ci = Math.floor(offset / CARD_W);
      if (ci !== lastCard) { lastCard = ci; setActiveIdx(ci); }
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setActiveIdx(winIndex);
        setLanded(true);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(onComplete, 500);
        }
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [winIndex, duration, onComplete]);

  const skip = () => {
    if (doneRef.current) return;
    cancelAnimationFrame(rafRef.current);
    setSpinOffset(winIndex * CARD_W);
    setActiveIdx(winIndex);
    setLanded(true);
    doneRef.current = true;
    setTimeout(onComplete, 200);
  };

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* BG grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 30%, ${accentColor}10, transparent 50%)` }} />

      {title && (
        <motion.p initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="font-ninja text-2xl mb-6 tracking-[0.2em] relative z-10"
          style={{ color: accentColor, textShadow: `0 0 30px ${accentColor}80` }}>
          {title.toUpperCase()}
        </motion.p>
      )}

      <div className="relative w-full max-w-[850px] z-10">
        {/* Center indicator */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center">
          <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent -mb-px"
            style={{ borderTopColor: accentColor, filter: `drop-shadow(0 0 4px ${accentColor})` }} />
          <div className="w-[2px] flex-1" style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}, 0 0 20px ${accentColor}50` }} />
          <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[12px] border-l-transparent border-r-transparent -mt-px"
            style={{ borderBottomColor: accentColor, filter: `drop-shadow(0 0 4px ${accentColor})` }} />
        </div>

        {/* Slider */}
        <div className="overflow-hidden h-[250px] relative rounded-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(4,6,8,0.95), rgba(5,8,14,0.95))',
            border: `1px solid ${accentColor}20`,
            boxShadow: `0 0 30px rgba(0,0,0,0.5), 0 0 60px ${accentColor}10`,
          }}>
          {/* HUD corners */}
          <div className="absolute top-0 left-0 w-4 h-4 z-20 pointer-events-none" style={{ borderTop: `2px solid ${accentColor}60`, borderLeft: `2px solid ${accentColor}60` }} />
          <div className="absolute top-0 right-0 w-4 h-4 z-20 pointer-events-none" style={{ borderTop: '2px solid rgba(0,200,255,0.35)', borderRight: '2px solid rgba(0,200,255,0.35)' }} />
          <div className="absolute bottom-0 left-0 w-4 h-4 z-20 pointer-events-none" style={{ borderBottom: '2px solid rgba(0,200,255,0.35)', borderLeft: '2px solid rgba(0,200,255,0.35)' }} />
          <div className="absolute bottom-0 right-0 w-4 h-4 z-20 pointer-events-none" style={{ borderBottom: `2px solid ${accentColor}60`, borderRight: `2px solid ${accentColor}60` }} />
          <div className="absolute top-0 left-0 right-0 h-[2px] z-20 pointer-events-none"
            style={{ background: `linear-gradient(90deg, ${accentColor}50, rgba(0,200,255,0.3), ${accentColor}50)`, boxShadow: `0 0 8px ${accentColor}30` }} />
          {/* Edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, #030508, transparent)' }} />
          <div className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, #030508, transparent)' }} />

          {/* Cards row */}
          <div className="flex items-stretch h-full" style={{ transform: `translateX(calc(50% - ${CARD_W / 2}px - ${spinOffset}px))` }}>
            {items.map((item, idx) => {
              const isCenter = idx === activeIdx;
              const rc = item.color || rarityColor(item.rarity);
              return (
                <div
                  key={idx}
                  className={`spin-card flex-shrink-0 ${isCenter ? 'active' : ''}`}
                  style={{ width: `${CARD_W}px`, height: '100%', '--spin-color': rc } as React.CSSProperties}
                >
                  <div className="spin-card-inner">
                    <div className="flex-1 flex items-center justify-center p-3">
                      {item.image
                        ? <img src={item.image} alt="" className="w-20 h-20 object-contain" style={{ filter: `drop-shadow(0 0 10px ${rc})` }} />
                        : <div style={{ color: rc }}>{item.icon}</div>}
                    </div>
                    <p className="font-body text-[11px] text-white text-center px-1 truncate w-full">{item.name}</p>
                    <div className="w-full h-[3px] mt-1" style={{ background: rc, boxShadow: isCenter ? `0 0 10px ${rc}` : 'none' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Skip */}
      {!landed && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ delay: 0.8 }}
          onClick={skip}
          className="relative mt-6 flex items-center gap-2 px-8 py-2.5 rounded-lg font-ninja text-sm text-gray-400 transition-all z-10 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${accentColor}10, ${accentColor}05)`,
            border: `1px solid ${accentColor}25`,
          }}
        >
          <div className="absolute top-0 left-0 w-2 h-2" style={{ borderTop: `1px solid ${accentColor}50`, borderLeft: `1px solid ${accentColor}50` }} />
          <div className="absolute bottom-0 right-0 w-2 h-2" style={{ borderBottom: `1px solid ${accentColor}50`, borderRight: `1px solid ${accentColor}50` }} />
          <SkipForward size={14} /> SKIP
        </motion.button>
      )}
    </div>
  );
}
