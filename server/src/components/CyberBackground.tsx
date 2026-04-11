'use client';

import { useEffect, useRef } from 'react';

export function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    let mouseX = w / 2;
    let mouseY = h / 2;
    let time = 0;

    const handleMouse = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    window.addEventListener('mousemove', handleMouse);

    // Particles — two layers: fast bright + slow dim
    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; baseAlpha: number; hue: number; life: number;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 1.5 + 0.5, baseAlpha: Math.random() * 0.6 + 0.2,
        hue: Math.random() > 0.7 ? 195 : 120, // green or cyan
        life: Math.random() * Math.PI * 2,
      });
    }

    // Floating rings
    interface Ring {
      x: number; y: number; radius: number; maxRadius: number;
      alpha: number; speed: number; hue: number;
    }
    const rings: Ring[] = [];
    function spawnRing() {
      rings.push({
        x: Math.random() * w, y: Math.random() * h,
        radius: 0, maxRadius: Math.random() * 150 + 80,
        alpha: 0.12, speed: Math.random() * 0.4 + 0.2,
        hue: Math.random() > 0.5 ? 120 : 195,
      });
    }
    for (let i = 0; i < 3; i++) spawnRing();

    function animate() {
      time += 1;
      ctx.fillStyle = '#0B0C10';
      ctx.fillRect(0, 0, w, h);

      // Large ambient gradients (very subtle, slow moving)
      const g1x = w * 0.3 + Math.sin(time * 0.003) * 100;
      const g1y = h * 0.4 + Math.cos(time * 0.002) * 80;
      const grad1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, 350);
      grad1.addColorStop(0, 'rgba(57, 255, 20, 0.035)');
      grad1.addColorStop(1, 'transparent');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const g2x = w * 0.7 + Math.cos(time * 0.0025) * 120;
      const g2y = h * 0.6 + Math.sin(time * 0.003) * 60;
      const grad2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, 300);
      grad2.addColorStop(0, 'rgba(0, 191, 255, 0.02)');
      grad2.addColorStop(1, 'transparent');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      // Mouse glow
      const mg = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 250);
      mg.addColorStop(0, 'rgba(57, 255, 20, 0.025)');
      mg.addColorStop(1, 'transparent');
      ctx.fillStyle = mg;
      ctx.fillRect(mouseX - 250, mouseY - 250, 500, 500);

      // Expanding rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.radius += r.speed;
        const progress = r.radius / r.maxRadius;
        const alpha = r.alpha * (1 - progress);
        if (alpha <= 0.001) {
          rings.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${r.hue}, 100%, 60%, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (rings.length < 3 && Math.random() < 0.005) spawnRing();

      // Particles
      for (const p of particles) {
        p.life += 0.015;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // Mouse repulsion (gentle)
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150 && dist > 0) {
          const force = (150 - dist) / 150 * 0.15;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Damping
        p.vx *= 0.995;
        p.vy *= 0.995;

        const alpha = p.baseAlpha * (0.6 + 0.4 * Math.sin(p.life));

        // Glow
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        glowGrad.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${alpha * 0.3})`);
        glowGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(p.x - p.size * 4, p.y - p.size * 4, p.size * 8, p.size * 8);

        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.fill();
      }

      // Connections between close particles
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = dx * dx + dy * dy;
          if (d < 15000) { // ~122px
            const alpha = (1 - d / 15000) * 0.08;
            ctx.strokeStyle = `rgba(57, 255, 20, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Subtle noise/grain overlay
      if (time % 3 === 0) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 16) {
          const noise = (Math.random() - 0.5) * 6;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);
      }

      animId = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
    />
  );
}
