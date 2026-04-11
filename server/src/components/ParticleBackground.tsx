'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    particlesJS: any;
  }
}

export function ParticleBackground() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js';
    script.onload = () => {
      if (!window.particlesJS) return;

      // Main layer — mouse interactive, repulse + grab
      window.particlesJS('particles-main', {
        particles: {
          number: { value: 130, density: { enable: true, value_area: 800 } },
          color: { value: ['#39FF14', '#39FF14', '#2dd610', '#00FF41'] },
          shape: { type: 'circle', stroke: { width: 0, color: '#000' } },
          opacity: { value: 0.7, random: true, anim: { enable: false } },
          size: { value: 4, random: true, anim: { enable: false } },
          line_linked: { enable: true, distance: 150, color: '#39FF14', opacity: 0.4, width: 1.5 },
          move: { enable: true, speed: 3.5, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false },
        },
        interactivity: {
          detect_on: 'window',
          events: {
            onhover: { enable: true, mode: 'repulse' },
            onclick: { enable: true, mode: 'push' },
            resize: true,
          },
          modes: {
            repulse: { distance: 150, duration: 0.4 },
            push: { particles_nb: 3 },
          },
        },
        retina_detect: true,
      });

      // Background layer — dim, slower
      window.particlesJS('particles-bg', {
        particles: {
          number: { value: 85, density: { enable: true, value_area: 1000 } },
          color: { value: ['#39FF14', '#2dd610'] },
          shape: { type: 'circle', stroke: { width: 0, color: '#000' } },
          opacity: { value: 0.2, random: true, anim: { enable: true, speed: 0.5, opacity_min: 0.05, sync: false } },
          size: { value: 2.5, random: true, anim: { enable: false } },
          line_linked: { enable: true, distance: 120, color: '#39FF14', opacity: 0.1, width: 0.5 },
          move: { enable: true, speed: 1.2, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false },
        },
        interactivity: {
          detect_on: 'window',
          events: { onhover: { enable: false }, onclick: { enable: false }, resize: true },
        },
        retina_detect: true,
      });
    };
    document.head.appendChild(script);

    return () => {
      ['particles-main', 'particles-bg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { const c = el.querySelector('canvas'); if (c) c.remove(); }
      });
    };
  }, []);

  return (
    <>
      {/* Animated ocean gradient base */}
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 0,
          background: '#0B0C10',
          overflow: 'hidden',
        }}
      >
        {/* Dark green ocean waves */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 120%, rgba(57,255,20,0.06) 0%, transparent 60%)',
          animation: 'oceanPulse 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 80%, rgba(0,255,65,0.04) 0%, transparent 50%)',
          animation: 'oceanDrift 12s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 70% 90%, rgba(45,214,16,0.05) 0%, transparent 55%)',
          animation: 'oceanDrift 10s ease-in-out infinite reverse',
        }} />
        <style>{`
          @keyframes oceanPulse {
            0%, 100% { opacity: 0.6; transform: scale(1) translateY(0); }
            50% { opacity: 1; transform: scale(1.05) translateY(-15px); }
          }
          @keyframes oceanDrift {
            0%, 100% { transform: translateX(0) translateY(0); opacity: 0.5; }
            33% { transform: translateX(30px) translateY(-10px); opacity: 0.8; }
            66% { transform: translateX(-20px) translateY(5px); opacity: 0.6; }
          }
        `}</style>
      </div>
      {/* Background dim layer — 30% */}
      <div
        id="particles-bg"
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 1,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      />
      {/* Main layer — full opacity, mouse interactive */}
      <div
        id="particles-main"
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 2,
          background: 'transparent',
          pointerEvents: 'auto',
        }}
      />
    </>
  );
}
