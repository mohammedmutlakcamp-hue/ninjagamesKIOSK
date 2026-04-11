import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ninja: {
          green: '#39FF14',
          dark: '#0a0a0a',
          darker: '#050505',
          purple: '#1a1a2e',
          accent: '#2d5016',
          glow: 'rgba(57, 255, 20, 0.3)',
        },
        chest: {
          bronze: '#CD7F32',
          silver: '#C0C0C0',
          gold: '#FFD700',
          legendary: '#9B59B6',
        },
      },
      fontFamily: {
        ninja: ['Orbitron', 'sans-serif'],
        body: ['Rajdhani', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'ninja-slide': 'ninja-slide 0.5s ease-out',
        'chest-shake': 'chest-shake 0.5s ease-in-out',
        'coin-spin': 'coin-spin 1s linear infinite',
        'particle-rise': 'particle-rise 2s ease-out forwards',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(57, 255, 20, 0.6), 0 0 80px rgba(57, 255, 20, 0.2)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'ninja-slide': {
          '0%': { transform: 'translateX(-100%) scale(0.8)', opacity: '0' },
          '100%': { transform: 'translateX(0) scale(1)', opacity: '1' },
        },
        'chest-shake': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(5deg)' },
        },
        'coin-spin': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(360deg)' },
        },
        'particle-rise': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-100px) scale(0)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
