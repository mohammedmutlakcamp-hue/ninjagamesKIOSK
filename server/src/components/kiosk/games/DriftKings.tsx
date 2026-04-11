'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props { onScore: (score: number) => void; onClose: () => void; }

interface TireMark { x: number; y: number; alpha: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }

const W = 800, H = 600;

// Track defined as center-line waypoints forming an oval-ish circuit
const TRACK_POINTS = [
  { x: 400, y: 100 }, { x: 600, y: 100 }, { x: 720, y: 160 },
  { x: 750, y: 300 }, { x: 720, y: 440 }, { x: 600, y: 500 },
  { x: 400, y: 520 }, { x: 200, y: 500 }, { x: 80, y: 440 },
  { x: 50, y: 300 }, { x: 80, y: 160 }, { x: 200, y: 100 },
];

const TRACK_WIDTH = 80;
const TOTAL_LAPS = 3;

// Boost pad locations (index into track segments)
const BOOST_PADS = [2, 6, 10];

export function DriftKings({ onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let gameState: 'start' | 'playing' | 'gameover' = 'start';
    let car = { x: 400, y: 130, angle: 0, speed: 0, angularVel: 0, drifting: false };
    let keys: Record<string, boolean> = {};
    let tireMarks: TireMark[] = [];
    let particles: Particle[] = [];
    let lap = 0;
    let lastCheckpoint = -1;
    let checkpointsHit = 0;
    let raceTime = 0;
    let bestLapTime = Infinity;
    let lapStartTime = 0;
    let bestTotalTime = Infinity;
    let ghostPositions: { x: number; y: number; angle: number }[] = [];
    let currentGhost: { x: number; y: number; angle: number }[] = [];
    let ghostFrame = 0;
    let frameCount = 0;
    let animId = 0;

    const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

    // Get nearest track segment and distance from center
    const getTrackInfo = (px: number, py: number) => {
      let minDist = Infinity;
      let nearestSeg = 0;
      for (let i = 0; i < TRACK_POINTS.length; i++) {
        const p = TRACK_POINTS[i];
        const d = dist(px, py, p.x, p.y);
        if (d < minDist) { minDist = d; nearestSeg = i; }
      }
      return { dist: minDist, segment: nearestSeg };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      keys[e.code] = true;
      if (e.key === ' ' || e.code === 'Space') {
        if (gameState === 'start') {
          gameState = 'playing'; raceTime = 0; lapStartTime = 0;
          car = { x: 400, y: 130, angle: 0, speed: 0, angularVel: 0, drifting: false };
          lap = 0; lastCheckpoint = -1; checkpointsHit = 0; frameCount = 0;
          currentGhost = []; ghostFrame = 0;
        } else if (gameState === 'gameover') {
          gameState = 'playing'; raceTime = 0; lapStartTime = 0;
          car = { x: 400, y: 130, angle: 0, speed: 0, angularVel: 0, drifting: false };
          lap = 0; lastCheckpoint = -1; checkpointsHit = 0; tireMarks = [];
          frameCount = 0; currentGhost = []; ghostFrame = 0;
        }
        e.preventDefault();
      }
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const update = () => {
      if (gameState !== 'playing') return;
      raceTime++;
      frameCount++;

      const accel = keys['arrowup'] ? 0.15 : 0;
      const brake = keys['arrowdown'] ? 0.1 : 0;
      const steerInput = (keys['arrowleft'] ? -1 : 0) + (keys['arrowright'] ? 1 : 0);

      // Acceleration and braking
      car.speed += accel;
      car.speed -= brake;
      car.speed *= 0.985; // friction
      car.speed = Math.max(-2, Math.min(8, car.speed));

      // Steering - more responsive at speed
      const steerAmount = steerInput * 0.04 * Math.min(1, Math.abs(car.speed) / 3);
      car.angularVel += steerAmount;
      car.angularVel *= 0.85;
      car.angle += car.angularVel;

      // Drift detection
      const lateralSpeed = Math.abs(car.angularVel * car.speed);
      car.drifting = lateralSpeed > 0.15 && Math.abs(car.speed) > 2;

      // Traction model
      const traction = car.drifting ? 0.92 : 0.97;
      const moveAngle = car.angle;
      car.x += Math.cos(moveAngle) * car.speed * traction;
      car.y += Math.sin(moveAngle) * car.speed * traction;

      // Drift side-slide
      if (car.drifting) {
        const slideAngle = car.angle + Math.PI / 2;
        car.x += Math.cos(slideAngle) * car.angularVel * car.speed * 0.3;
        car.y += Math.sin(slideAngle) * car.angularVel * car.speed * 0.3;
        // Leave tire marks
        if (frameCount % 2 === 0) {
          tireMarks.push({ x: car.x, y: car.y, alpha: 1 });
          if (tireMarks.length > 500) tireMarks.shift();
        }
        // Drift particles
        if (frameCount % 3 === 0) {
          const a = car.angle + Math.PI + (Math.random() - 0.5);
          particles.push({ x: car.x, y: car.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 20, color: '#39FF14' });
        }
      }

      // Track boundary check
      const info = getTrackInfo(car.x, car.y);
      if (info.dist > TRACK_WIDTH) {
        car.speed *= 0.9; // Kill speed when off track
        // Push back toward track
        const tp = TRACK_POINTS[info.segment];
        const pushAngle = Math.atan2(tp.y - car.y, tp.x - car.x);
        car.x += Math.cos(pushAngle) * 2;
        car.y += Math.sin(pushAngle) * 2;
      }

      // Boost pads
      for (const bi of BOOST_PADS) {
        const bp = TRACK_POINTS[bi];
        if (dist(car.x, car.y, bp.x, bp.y) < 30) {
          car.speed = Math.min(10, car.speed + 0.5);
          if (frameCount % 4 === 0) {
            particles.push({ x: car.x, y: car.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 15, color: '#00FF88' });
          }
        }
      }

      // Checkpoint / Lap detection
      const currentSeg = info.segment;
      if (currentSeg !== lastCheckpoint) {
        // Must pass through checkpoints in order
        const expectedNext = (lastCheckpoint + 1) % TRACK_POINTS.length;
        if (currentSeg === expectedNext || (lastCheckpoint === -1 && currentSeg <= 1)) {
          lastCheckpoint = currentSeg;
          checkpointsHit++;
          // Lap completed when hitting all checkpoints and returning to start
          if (checkpointsHit >= TRACK_POINTS.length && currentSeg <= 1) {
            lap++;
            const lapTime = raceTime - lapStartTime;
            if (lapTime < bestLapTime) bestLapTime = lapTime;
            lapStartTime = raceTime;
            checkpointsHit = 0;
            if (lap >= TOTAL_LAPS) {
              gameState = 'gameover';
              const totalMs = Math.floor(raceTime * 1000 / 60);
              if (raceTime < bestTotalTime) {
                bestTotalTime = raceTime;
                ghostPositions = [...currentGhost];
              }
              onScore(totalMs);
            }
          }
        }
      }

      // Record ghost
      if (frameCount % 3 === 0) {
        currentGhost.push({ x: car.x, y: car.y, angle: car.angle });
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Tire mark fade
      for (const tm of tireMarks) { tm.alpha *= 0.998; }
    };

    const drawTrack = () => {
      // Draw track outline
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = TRACK_WIDTH * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(TRACK_POINTS[0].x | 0, TRACK_POINTS[0].y | 0);
      for (let i = 1; i < TRACK_POINTS.length; i++) {
        ctx.lineTo(TRACK_POINTS[i].x | 0, TRACK_POINTS[i].y | 0);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Track border lines
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(TRACK_POINTS[0].x | 0, TRACK_POINTS[0].y | 0);
      for (let i = 1; i < TRACK_POINTS.length; i++) {
        ctx.lineTo(TRACK_POINTS[i].x | 0, TRACK_POINTS[i].y | 0);
      }
      ctx.closePath();
      ctx.stroke();

      // Start/finish line
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(400, 80); ctx.lineTo(400, 160);
      ctx.stroke();

      // Boost pads
      for (const bi of BOOST_PADS) {
        const bp = TRACK_POINTS[bi];
        ctx.fillStyle = '#00FF8844';
        ctx.beginPath();
        ctx.arc(bp.x | 0, bp.y | 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#00FF88';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▲', bp.x | 0, (bp.y + 5) | 0);
      }
    };

    const drawCar = (x: number, y: number, angle: number, color: string, alpha: number = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x | 0, y | 0);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.fillRect(-15, -8, 30, 16);
      // Windshield
      ctx.fillStyle = color === '#39FF14' ? '#2BC90F' : '#88888844';
      ctx.fillRect(8, -5, 5, 10);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const render = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#151515';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      if (gameState === 'start') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00FFFF';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('DRIFT KINGS', W / 2, H / 3);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('UP=Accelerate | DOWN=Brake | LEFT/RIGHT=Steer', W / 2, H / 2 - 10);
        ctx.fillText(`Complete ${TOTAL_LAPS} laps. Drift for style!`, W / 2, H / 2 + 20);
        ctx.fillStyle = '#00FFFF';
        ctx.font = '20px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.7);
        ctx.globalAlpha = 1;
        return;
      }

      // Draw track
      drawTrack();

      // Tire marks
      for (const tm of tireMarks) {
        if (tm.alpha < 0.05) continue;
        ctx.globalAlpha = tm.alpha * 0.6;
        ctx.fillStyle = '#333';
        ctx.fillRect((tm.x - 2) | 0, (tm.y - 2) | 0, 4, 4);
      }
      ctx.globalAlpha = 1;

      // Ghost car
      if (ghostPositions.length > 0 && gameState === 'playing') {
        const gi = Math.min(ghostFrame, ghostPositions.length - 1);
        const gp = ghostPositions[gi];
        if (gp) drawCar(gp.x, gp.y, gp.angle, '#00FFFF', 0.25);
        if (frameCount % 3 === 0 && ghostFrame < ghostPositions.length - 1) ghostFrame++;
      }

      // Particles
      for (const p of particles) {
        ctx.globalAlpha = p.life / 20;
        ctx.fillStyle = p.color;
        ctx.fillRect((p.x - 2) | 0, (p.y - 2) | 0, 4, 4);
      }
      ctx.globalAlpha = 1;

      // Speed lines when fast
      if (car.speed > 4) {
        const intensity = (car.speed - 4) / 4;
        ctx.strokeStyle = `rgba(57, 255, 20, ${intensity * 0.3})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const ly = Math.random() * H;
          ctx.beginPath();
          ctx.moveTo(0, ly);
          ctx.lineTo(30 + Math.random() * 40, ly);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(W, ly);
          ctx.lineTo(W - 30 - Math.random() * 40, ly);
          ctx.stroke();
        }
      }

      // Draw car
      drawCar(car.x, car.y, car.angle, '#39FF14');

      if (gameState === 'gameover') {
        ctx.textAlign = 'center';
        const totalMs = Math.floor(raceTime * 1000 / 60);
        const totalSec = (totalMs / 1000).toFixed(2);
        const bestLapSec = bestLapTime === Infinity ? '--' : (bestLapTime * 1000 / 60 / 1000).toFixed(2);
        ctx.fillStyle = '#00FFFF';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('RACE COMPLETE', W / 2, H / 4);
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText(`${totalSec}s`, W / 2, H / 2 - 10);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText(`Best Lap: ${bestLapSec}s`, W / 2, H / 2 + 25);
        ctx.fillStyle = '#00FFFF';
        ctx.font = '18px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('SPACE TO RETRY / ESC TO EXIT', W / 2, H * 0.75);
        ctx.globalAlpha = 1;
        return;
      }

      // HUD
      ctx.textAlign = 'left';
      ctx.fillStyle = '#39FF14';
      ctx.font = 'bold 28px Orbitron, monospace';
      ctx.fillText(`${Math.abs(car.speed * 30).toFixed(0)} km/h`, 20, 40);

      ctx.fillStyle = '#00FFFF';
      ctx.font = '16px Orbitron, monospace';
      ctx.fillText(`Lap: ${lap + 1}/${TOTAL_LAPS}`, 20, 65);

      const elapsed = (raceTime / 60).toFixed(1);
      ctx.fillText(`Time: ${elapsed}s`, 20, 85);

      if (bestLapTime < Infinity) {
        ctx.fillStyle = '#888';
        ctx.fillText(`Best Lap: ${(bestLapTime / 60).toFixed(1)}s`, 20, 105);
      }

      if (car.drifting) {
        ctx.fillStyle = '#FF6600';
        ctx.font = 'bold 20px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DRIFT!', W / 2, 40);
      }
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
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onScore, onClose]);

  useEffect(() => {
    const cleanup = gameLoop();
    return cleanup;
  }, [gameLoop]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <canvas ref={canvasRef} width={W} height={H} style={{ border: '1px solid #00FFFF33' }} />
    </div>
  );
}
