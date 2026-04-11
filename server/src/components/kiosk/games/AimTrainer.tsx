'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props { onScore: (score: number) => void; onClose: () => void; }

interface Target {
  x: number; y: number; radius: number; maxRadius: number;
  ringRadius: number; ringSpeed: number; moving: boolean;
  vx: number; vy: number; points: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface MissFlash { x: number; y: number; life: number; }

const W = 800, H = 600;
const ROUND_TIME = 30 * 60; // 30 seconds at 60fps

export function AimTrainer({ onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let gameState: 'start' | 'playing' | 'gameover' = 'start';
    let mouse = { x: W / 2, y: H / 2 };
    let targets: Target[] = [];
    let particles: Particle[] = [];
    let missFlashes: MissFlash[] = [];
    let score = 0;
    let hits = 0;
    let misses = 0;
    let streak = 0;
    let bestStreak = 0;
    let timer = ROUND_TIME;
    let spawnTimer = 0;
    let animId = 0;
    let accuracyHistory: number[] = [];

    const spawnTarget = () => {
      const elapsed = ROUND_TIME - timer;
      const elapsedSec = elapsed / 60;
      const minR = elapsedSec > 20 ? 8 : elapsedSec > 10 ? 14 : 20;
      const maxR = elapsedSec > 20 ? 16 : elapsedSec > 10 ? 25 : 35;
      const r = minR + Math.random() * (maxR - minR);
      const shouldMove = elapsedSec > 10 && Math.random() > 0.4;
      const speed = shouldMove ? 1 + Math.random() * 2 : 0;
      const moveAngle = Math.random() * Math.PI * 2;

      targets.push({
        x: 60 + Math.random() * (W - 120),
        y: 80 + Math.random() * (H - 160),
        radius: r, maxRadius: r,
        ringRadius: r * 3, ringSpeed: r * 3 / 120, // Shrinks over 2 seconds
        moving: shouldMove,
        vx: Math.cos(moveAngle) * speed, vy: Math.sin(moveAngle) * speed,
        points: Math.round(100 / r * 10),
      });
    };

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 5;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 20 + Math.random() * 15, color, size: 2 + Math.random() * 3 });
      }
    };

    const onClick = (e: MouseEvent) => {
      if (gameState !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let hitAny = false;
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const d = Math.sqrt((mx - t.x) ** 2 + (my - t.y) ** 2);
        if (d <= t.radius) {
          hitAny = true;
          hits++;
          streak++;
          if (streak > bestStreak) bestStreak = streak;
          // Bonus for hitting before ring closes
          const ringBonus = t.ringRadius > t.radius ? Math.round(t.ringRadius / t.radius * 5) : 0;
          const streakBonus = Math.min(streak, 20);
          const points = t.points + ringBonus + streakBonus * 5;
          score += points;
          spawnParticles(t.x, t.y, '#39FF14', 12);
          targets.splice(i, 1);
          break;
        }
      }

      if (!hitAny) {
        misses++;
        streak = 0;
        missFlashes.push({ x: mx, y: my, life: 20 });
      }

      // Track accuracy
      const total = hits + misses;
      if (total > 0) accuracyHistory.push(hits / total * 100);
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        if (gameState === 'start') {
          gameState = 'playing'; timer = ROUND_TIME; score = 0; hits = 0; misses = 0;
          streak = 0; bestStreak = 0; targets = []; particles = []; missFlashes = [];
          accuracyHistory = []; spawnTimer = 0;
        } else if (gameState === 'gameover') {
          gameState = 'playing'; timer = ROUND_TIME; score = 0; hits = 0; misses = 0;
          streak = 0; bestStreak = 0; targets = []; particles = []; missFlashes = [];
          accuracyHistory = []; spawnTimer = 0;
        }
        e.preventDefault();
      }
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMouseMove);

    const update = () => {
      if (gameState !== 'playing') return;
      timer--;
      if (timer <= 0) {
        gameState = 'gameover';
        const accuracy = hits + misses > 0 ? hits / (hits + misses) : 0;
        const finalScore = Math.round(score * (0.5 + accuracy * 0.5));
        onScore(finalScore);
        return;
      }

      // Spawn targets
      spawnTimer--;
      if (spawnTimer <= 0) {
        spawnTarget();
        const elapsed = (ROUND_TIME - timer) / 60;
        spawnTimer = elapsed > 20 ? 20 : elapsed > 10 ? 30 : 40;
      }

      // Keep minimum targets
      if (targets.length < 2) spawnTarget();

      // Update targets
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.ringRadius -= t.ringSpeed;
        if (t.ringRadius <= t.radius) {
          // Target expired
          targets.splice(i, 1);
          misses++;
          streak = 0;
          continue;
        }
        if (t.moving) {
          t.x += t.vx; t.y += t.vy;
          if (t.x < 50 || t.x > W - 50) t.vx *= -1;
          if (t.y < 80 || t.y > H - 50) t.vy *= -1;
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        p.vx *= 0.92; p.vy *= 0.92;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Miss flashes
      for (let i = missFlashes.length - 1; i >= 0; i--) {
        missFlashes[i].life--;
        if (missFlashes[i].life <= 0) missFlashes.splice(i, 1);
      }
    };

    const render = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#131313';
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      if (gameState === 'start') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#F39C12';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('AIM TRAINER', W / 2, H / 3);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('Click targets before they shrink!', W / 2, H / 2 - 10);
        ctx.fillText('Build streaks for multipliers. 30 second rounds.', W / 2, H / 2 + 20);
        ctx.fillStyle = '#F39C12';
        ctx.font = '20px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.7);
        ctx.globalAlpha = 1;
        // Draw crosshair
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
        ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5);
        ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#39FF14';
        ctx.fill();
        return;
      }

      if (gameState === 'gameover') {
        const accuracy = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(1) : '0.0';
        const finalScore = Math.round(score * (0.5 + (parseFloat(accuracy) / 100) * 0.5));

        ctx.textAlign = 'center';
        ctx.fillStyle = '#F39C12';
        ctx.font = 'bold 40px Orbitron, monospace';
        ctx.fillText('ROUND COMPLETE', W / 2, H / 5);

        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText(`${finalScore}`, W / 2, H / 3 + 10);

        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        const stats = [
          `Accuracy: ${accuracy}%`,
          `Hits: ${hits} | Misses: ${misses}`,
          `Best Streak: x${bestStreak}`,
          `Raw Score: ${score}`,
        ];
        for (let i = 0; i < stats.length; i++) {
          ctx.fillText(stats[i], W / 2, H / 2 + 20 + i * 25);
        }

        // Mini accuracy chart
        if (accuracyHistory.length > 2) {
          const chartX = W / 2 - 100, chartY = H * 0.72, chartW = 200, chartH = 50;
          ctx.strokeStyle = '#333';
          ctx.strokeRect(chartX, chartY, chartW, chartH);
          ctx.strokeStyle = '#39FF14';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < accuracyHistory.length; i++) {
            const px = chartX + (i / (accuracyHistory.length - 1)) * chartW;
            const py = chartY + chartH - (accuracyHistory[i] / 100) * chartH;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.fillStyle = '#555';
          ctx.font = '10px monospace';
          ctx.fillText('Accuracy over time', W / 2, chartY + chartH + 15);
        }

        ctx.fillStyle = '#F39C12';
        ctx.font = '18px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('SPACE TO RETRY / ESC TO EXIT', W / 2, H * 0.93);
        ctx.globalAlpha = 1;
        return;
      }

      // Playing state
      // Targets
      for (const t of targets) {
        // Shrinking ring
        ctx.strokeStyle = '#F39C1266';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(t.x | 0, t.y | 0, t.ringRadius | 0, 0, Math.PI * 2);
        ctx.stroke();

        // Target circle
        ctx.fillStyle = '#FF444444';
        ctx.beginPath();
        ctx.arc(t.x | 0, t.y | 0, t.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner dot
        ctx.fillStyle = '#FF6666';
        ctx.beginPath();
        ctx.arc(t.x | 0, t.y | 0, Math.max(3, t.radius * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles
      for (const p of particles) {
        ctx.globalAlpha = p.life / 35;
        ctx.fillStyle = p.color;
        ctx.fillRect((p.x - p.size / 2) | 0, (p.y - p.size / 2) | 0, p.size | 0, p.size | 0);
      }
      ctx.globalAlpha = 1;

      // Miss flashes
      for (const m of missFlashes) {
        ctx.globalAlpha = m.life / 20;
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(m.x - 10, m.y - 10); ctx.lineTo(m.x + 10, m.y + 10);
        ctx.moveTo(m.x + 10, m.y - 10); ctx.lineTo(m.x - 10, m.y + 10);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // HUD
      const timeLeft = Math.ceil(timer / 60);
      ctx.textAlign = 'left';
      ctx.fillStyle = timeLeft <= 5 ? '#FF4444' : '#39FF14';
      ctx.font = 'bold 28px Orbitron, monospace';
      ctx.fillText(`${timeLeft}`, 20, 40);

      ctx.fillStyle = '#39FF14';
      ctx.font = 'bold 24px Orbitron, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${score}`, W - 20, 40);

      // Stats bar
      ctx.textAlign = 'left';
      ctx.font = '13px Orbitron, monospace';
      const accuracy = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(1) : '100.0';
      ctx.fillStyle = '#888';
      ctx.fillText(`Accuracy: ${accuracy}%`, 20, H - 50);
      ctx.fillText(`Hits: ${hits}/${hits + misses}`, 20, H - 30);

      ctx.textAlign = 'right';
      ctx.fillStyle = streak > 5 ? '#FF8800' : streak > 0 ? '#F39C12' : '#888';
      ctx.font = 'bold 16px Orbitron, monospace';
      ctx.fillText(`Streak: x${streak}`, W - 20, H - 50);
      ctx.fillStyle = '#555';
      ctx.font = '13px Orbitron, monospace';
      ctx.fillText(`Best: x${bestStreak}`, W - 20, H - 30);

      // Crosshair
      ctx.strokeStyle = '#39FF14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mouse.x - 18, mouse.y); ctx.lineTo(mouse.x - 6, mouse.y);
      ctx.moveTo(mouse.x + 6, mouse.y); ctx.lineTo(mouse.x + 18, mouse.y);
      ctx.moveTo(mouse.x, mouse.y - 18); ctx.lineTo(mouse.x, mouse.y - 6);
      ctx.moveTo(mouse.x, mouse.y + 6); ctx.lineTo(mouse.x, mouse.y + 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#39FF14';
      ctx.fill();
    };

    const loop = () => {
      update();
      render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMouseMove);
    };
  }, [onScore, onClose]);

  useEffect(() => {
    const cleanup = gameLoop();
    return cleanup;
  }, [gameLoop]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <canvas ref={canvasRef} width={W} height={H} style={{ border: '1px solid #F39C1233', cursor: 'none' }} />
    </div>
  );
}
