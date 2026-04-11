'use client';

import { motion } from 'framer-motion';

interface Props {
  skinColor?: string;
  outfitColor?: string;
  size?: number;
  className?: string;
  animated?: boolean;
}

export function NinjaAvatar({ skinColor = '#8D6E63', outfitColor = '#333', size = 96, className = '', animated = true }: Props) {
  const Wrapper = animated ? motion.div : 'div';
  const animProps = animated ? { animate: { y: [0, -4, 0] }, transition: { duration: 3, repeat: Infinity } } : {};

  return (
    <Wrapper {...animProps} className={className} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`skinGrad-${outfitColor}`} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor={skinColor} stopOpacity="1" />
            <stop offset="100%" stopColor={skinColor} stopOpacity="0.7" />
          </radialGradient>
          <radialGradient id={`bodyGrad-${outfitColor}`} cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor={outfitColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#111" stopOpacity="0.9" />
          </radialGradient>
          <filter id="ninjaGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={outfitColor} floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="innerShadow">
            <feOffset dx="0" dy="2" />
            <feGaussianBlur stdDeviation="2" />
            <feComposite operator="out" in="SourceGraphic" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="normal" />
          </filter>
        </defs>

        {/* Body / Outfit */}
        <ellipse cx="60" cy="85" rx="28" ry="25" fill={`url(#bodyGrad-${outfitColor})`} filter="url(#innerShadow)" />
        
        {/* Neck */}
        <rect x="52" y="55" width="16" height="15" rx="4" fill={skinColor} opacity="0.8" />

        {/* Head */}
        <circle cx="60" cy="42" r="24" fill={`url(#skinGrad-${outfitColor})`} filter="url(#innerShadow)" />

        {/* Ninja mask / headband */}
        <rect x="36" y="32" width="48" height="14" rx="4" fill={outfitColor} opacity="0.95" />
        <rect x="36" y="32" width="48" height="14" rx="4" fill="black" opacity="0.3" />

        {/* Eyes */}
        <ellipse cx="50" cy="40" rx="5" ry="3.5" fill="white" opacity="0.95" />
        <ellipse cx="70" cy="40" rx="5" ry="3.5" fill="white" opacity="0.95" />
        <circle cx="51" cy="40" r="2" fill="#111" />
        <circle cx="71" cy="40" r="2" fill="#111" />
        <circle cx="51.5" cy="39.5" r="0.8" fill="white" />
        <circle cx="71.5" cy="39.5" r="0.8" fill="white" />

        {/* Headband tail */}
        <path d="M84 36 Q95 30 92 45 Q88 38 84 42" fill={outfitColor} opacity="0.8" />
        <path d="M84 39 Q93 34 91 47" stroke={outfitColor} strokeWidth="2" fill="none" opacity="0.6" />

        {/* Belt / sash */}
        <ellipse cx="60" cy="78" rx="26" ry="4" fill={outfitColor} opacity="0.7" />

        {/* Arms */}
        <ellipse cx="34" cy="80" rx="8" ry="14" fill={`url(#bodyGrad-${outfitColor})`} transform="rotate(10,34,80)" />
        <ellipse cx="86" cy="80" rx="8" ry="14" fill={`url(#bodyGrad-${outfitColor})`} transform="rotate(-10,86,80)" />

        {/* Outfit glow line */}
        <line x1="60" y1="70" x2="60" y2="100" stroke={outfitColor} strokeWidth="1" opacity="0.4" />
      </svg>
    </Wrapper>
  );
}
