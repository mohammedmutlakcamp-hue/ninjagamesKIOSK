'use client';

import { motion } from 'framer-motion';

interface Props {
  color: string;
  glowColor: string;
  size?: number;
  tier: string;
  animated?: boolean;
}

export function ChestSVG({ color, glowColor, size = 80, tier, animated = true }: Props) {
  const tierColors: Record<string, { accent: string; inner: string; lock: string }> = {
    bronze: { accent: '#CD7F32', inner: '#8B5A2B', lock: '#A0522D' },
    silver: { accent: '#C0C0C0', inner: '#808080', lock: '#A8A8A8' },
    gold: { accent: '#FFD700', inner: '#DAA520', lock: '#FFB800' },
    legendary: { accent: '#9B59B6', inner: '#6C3483', lock: '#BB8FCE' },
  };

  const t = tierColors[tier] || tierColors.bronze;
  const Wrapper = animated ? motion.div : 'div';
  const animProps = animated ? { animate: { y: [0, -6, 0] }, transition: { duration: 3, repeat: Infinity } } : {};

  return (
    <Wrapper {...animProps} style={{ width: size, height: size, display: 'inline-block' }}>
      <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`chestGrad-${tier}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={t.accent} stopOpacity="1" />
            <stop offset="50%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={t.inner} stopOpacity="1" />
          </linearGradient>
          <linearGradient id={`lidGrad-${tier}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={t.accent} stopOpacity="1" />
            <stop offset="100%" stopColor={t.inner} stopOpacity="0.9" />
          </linearGradient>
          <filter id={`chestGlow-${tier}`}>
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`innerLight-${tier}`}>
            <feSpecularLighting surfaceScale="5" specularConstant="0.75" specularExponent="20" result="spec">
              <fePointLight x="50" y="20" z="60" />
            </feSpecularLighting>
            <feComposite in="SourceGraphic" in2="spec" operator="arithmetic" k1="0" k2="1" k3="0.3" k4="0" />
          </filter>
        </defs>

        {/* Glow behind chest */}
        <ellipse cx="50" cy="80" rx="40" ry="12" fill={color} opacity="0.15" />

        {/* Chest body */}
        <rect x="15" y="45" width="70" height="40" rx="5" ry="5"
          fill={`url(#chestGrad-${tier})`}
          stroke={t.accent}
          strokeWidth="2"
        />

        {/* Chest body darker bottom */}
        <rect x="15" y="65" width="70" height="20" rx="0" ry="5" fill={t.inner} opacity="0.5" />

        {/* Horizontal band */}
        <rect x="15" y="55" width="70" height="8" fill={t.accent} opacity="0.6" />

        {/* Chest lid */}
        <path d="M12 48 Q12 28 50 25 Q88 28 88 48 L85 48 L15 48 Z"
          fill={`url(#lidGrad-${tier})`}
          stroke={t.accent}
          strokeWidth="1.5"
        />

        {/* Lid highlight */}
        <path d="M20 45 Q20 32 50 30 Q80 32 80 45"
          fill="white" opacity="0.1"
        />

        {/* Metal clasp */}
        <rect x="42" y="50" width="16" height="14" rx="3" fill="#222" stroke={t.accent} strokeWidth="1.5" />

        {/* Keyhole */}
        <circle cx="50" cy="55" r="3" fill={t.lock} opacity="0.9" />
        <rect x="48.5" y="55" width="3" height="5" rx="1" fill={t.lock} opacity="0.9" />

        {/* Corner reinforcements */}
        <circle cx="20" cy="50" r="3" fill={t.accent} opacity="0.5" />
        <circle cx="80" cy="50" r="3" fill={t.accent} opacity="0.5" />
        <circle cx="20" cy="80" r="3" fill={t.accent} opacity="0.5" />
        <circle cx="80" cy="80" r="3" fill={t.accent} opacity="0.5" />

        {/* Shine/highlight */}
        <path d="M20 35 Q20 30 30 28" stroke="white" strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round" />

        {/* Tier-specific glow dots for legendary */}
        {tier === 'legendary' && (
          <>
            <circle cx="30" cy="60" r="1.5" fill="#BB8FCE" opacity="0.8">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="70" cy="60" r="1.5" fill="#BB8FCE" opacity="0.8">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin="0.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="50" cy="70" r="1.5" fill="#BB8FCE" opacity="0.8">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin="1s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        {tier === 'gold' && (
          <>
            <circle cx="35" cy="65" r="1" fill="#FFD700" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="65" cy="65" r="1" fill="#FFD700" opacity="0.7">
              <animate attributeName="opacity" values="0.4;1;0.4" dur="3s" begin="1s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
    </Wrapper>
  );
}
