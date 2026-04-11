'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props { onScore: (score: number) => void; onClose: () => void; }

interface Platform {
  x: number; y: number; w: number; type: 'normal' | 'crumbling' | 'bouncy' | 'moving';
  crumbleTimer: number; moveDir: number; originalY: number;
  hasSpike: boolean; hasCoin: boolean; hasLaser: boolean; laserOn: boolean; laserTimer: number;
}
interface Coin { x: number; y: number; collected: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }

const W = 800, H = 600;
const GRAVITY = 0.5;
const GROUND_Y = 500;

export function NinjaRunner({ onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let gameState: 'start' | 'playing' | 'gameover' = 'start';
    let player = {
      x: 150, y: GROUND_Y - 30, vy: 0, vx: 0,
      onGround: true, jumps: 0, maxJumps: 2,
      wallClinging: false, sliding: false,
      dashCooldown: 0, dashing: false, dashTimer: 0,
      alive: true,
    };
    let speed = 4;
    let distance = 0;
    let coinCount = 0;
    let platforms: Platform[] = [];
    let coins: Coin[] = [];
    let particles: Particle[] = [];
    let keys: Record<string, boolean> = {};
    let cameraX = 0;
    let spawnX = W + 100;
    let frameCount = 0;
    let animId = 0;
    let parallax = [0, 0, 0];
    let lastSpeedIncrease = 0;

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 15 + Math.random() * 20, color, size: 2 + Math.random() * 3 });
      }
    };

    const generatePlatforms = () => {
      while (spawnX < cameraX + W + 500) {
        const gap = 80 + Math.random() * 120;
        const platW = 60 + Math.random() * 150;
        const platY = GROUND_Y - 30 - Math.random() * 200;
        const typeRand = Math.random();
        const type: Platform['type'] = typeRand < 0.1 ? 'crumbling' : typeRand < 0.2 ? 'bouncy' : typeRand < 0.28 ? 'moving' : 'normal';

        // Sometimes have a gap in the ground
        const hasGroundGap = Math.random() < 0.15 && distance > 300;

        if (hasGroundGap) {
          // No ground segment - player must use platforms
          platforms.push({
            x: spawnX, y: platY, w: platW, type,
            crumbleTimer: 30, moveDir: 1, originalY: platY,
            hasSpike: false, hasCoin: Math.random() > 0.5,
            hasLaser: false, laserOn: false, laserTimer: 0,
          });
        } else {
          // Ground segment
          platforms.push({
            x: spawnX, y: GROUND_Y, w: platW + 50, type: 'normal',
            crumbleTimer: 30, moveDir: 1, originalY: GROUND_Y,
            hasSpike: Math.random() < 0.15 && distance > 200,
            hasCoin: false,
            hasLaser: Math.random() < 0.1 && distance > 500,
            laserOn: true, laserTimer: 0,
          });
          // Add floating platforms above ground
          if (Math.random() > 0.4) {
            platforms.push({
              x: spawnX + Math.random() * 80, y: platY, w: platW * 0.7, type,
              crumbleTimer: 30, moveDir: 1, originalY: platY,
              hasSpike: false, hasCoin: Math.random() > 0.3,
              hasLaser: false, laserOn: false, laserTimer: 0,
            });
          }
        }

        // Coins in patterns
        if (Math.random() > 0.3) {
          const coinY = platY - 40;
          for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
            coins.push({ x: spawnX + i * 25 + Math.random() * 10, y: coinY - Math.sin(i * 0.8) * 20, collected: false });
          }
        }

        // Wall obstacles
        if (Math.random() < 0.1 && distance > 400) {
          platforms.push({
            x: spawnX + platW + gap * 0.3, y: GROUND_Y - 100, w: 20, type: 'normal',
            crumbleTimer: 30, moveDir: 1, originalY: GROUND_Y - 100,
            hasSpike: false, hasCoin: false, hasLaser: false, laserOn: false, laserTimer: 0,
          });
        }

        spawnX += platW + gap;
      }
    };

    // Initial ground
    platforms.push({
      x: 0, y: GROUND_Y, w: W + 200, type: 'normal',
      crumbleTimer: 30, moveDir: 1, originalY: GROUND_Y,
      hasSpike: false, hasCoin: false, hasLaser: false, laserOn: false, laserTimer: 0,
    });

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      keys[e.code] = true;
      if (e.key === ' ' || e.code === 'Space') {
        if (gameState === 'start') {
          gameState = 'playing'; frameCount = 0;
        } else if (gameState === 'gameover') {
          // Reset
          player = { x: 150, y: GROUND_Y - 30, vy: 0, vx: 0, onGround: true, jumps: 0, maxJumps: 2, wallClinging: false, sliding: false, dashCooldown: 0, dashing: false, dashTimer: 0, alive: true };
          speed = 4; distance = 0; coinCount = 0; platforms = []; coins = []; particles = [];
          cameraX = 0; spawnX = W + 100; frameCount = 0; lastSpeedIncrease = 0;
          platforms.push({ x: 0, y: GROUND_Y, w: W + 200, type: 'normal', crumbleTimer: 30, moveDir: 1, originalY: GROUND_Y, hasSpike: false, hasCoin: false, hasLaser: false, laserOn: false, laserTimer: 0 });
          gameState = 'playing';
        }
        e.preventDefault();
      }
      // Jump
      if ((e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w') && gameState === 'playing') {
        if (player.wallClinging) {
          player.vy = -10;
          player.vx = 5;
          player.wallClinging = false;
          player.jumps = 1;
          spawnParticles(player.x - cameraX, player.y, '#39FF14', 5);
        } else if (player.jumps < player.maxJumps) {
          player.vy = player.jumps === 0 ? -11 : -9;
          player.jumps++;
          player.onGround = false;
          spawnParticles(player.x - cameraX, player.y + 15, '#39FF14', 4);
        }
        e.preventDefault();
      }
      // Dash
      if (e.key === 'Shift' && gameState === 'playing' && player.dashCooldown <= 0) {
        player.dashing = true;
        player.dashTimer = 10;
        player.dashCooldown = 180; // 3 seconds
        spawnParticles(player.x - cameraX, player.y, '#00FFFF', 8);
      }
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const update = () => {
      if (gameState !== 'playing') return;
      frameCount++;

      // Speed increase
      if (frameCount - lastSpeedIncrease > 1800) { // Every 30 seconds
        speed = Math.min(10, speed + 0.5);
        lastSpeedIncrease = frameCount;
      }

      // Scroll
      const actualSpeed = player.dashing ? speed * 2.5 : speed;
      cameraX += actualSpeed;
      distance += actualSpeed;
      player.x += actualSpeed;

      // Sliding
      player.sliding = (keys['arrowdown'] || keys['s']) && player.onGround;

      // Dash timer
      if (player.dashing) {
        player.dashTimer--;
        if (player.dashTimer <= 0) player.dashing = false;
      }
      if (player.dashCooldown > 0) player.dashCooldown--;

      // Apply horizontal velocity (from wall jumps)
      if (player.vx !== 0) {
        player.x += player.vx;
        player.vx *= 0.9;
        if (Math.abs(player.vx) < 0.1) player.vx = 0;
      }

      // Gravity
      if (!player.onGround && !player.wallClinging) {
        player.vy += GRAVITY;
        player.y += player.vy;
      }

      // Platform collision
      player.onGround = false;
      player.wallClinging = false;
      for (const plat of platforms) {
        if (plat.type === 'crumbling' && plat.crumbleTimer <= 0) continue;

        const relX = player.x - plat.x;
        const playerW = 16, playerH = player.sliding ? 15 : 28;

        // Top collision (landing)
        if (relX > -playerW && relX < plat.w + playerW &&
            player.y + playerH > plat.y && player.y + playerH < plat.y + 20 && player.vy >= 0) {
          player.y = plat.y - playerH;
          player.vy = 0;
          player.onGround = true;
          player.jumps = 0;

          if (plat.type === 'crumbling') plat.crumbleTimer--;
          if (plat.type === 'bouncy') {
            player.vy = -14;
            player.onGround = false;
            player.jumps = 0;
            spawnParticles(player.x - cameraX, player.y + playerH, '#00FF88', 6);
          }
        }

        // Wall collision (side) for wall clinging
        if (plat.w < 40) { // Narrow = wall
          if (Math.abs(player.x - plat.x) < 25 && player.y > plat.y - 10 && player.y < plat.y + 80 && !player.onGround) {
            if ((keys['w'] || keys['arrowup']) && player.vy > 0) {
              player.wallClinging = true;
              player.vy = 0.5; // Slow slide
              player.jumps = 0;
            }
          }
        }

        // Spikes
        if (plat.hasSpike && relX > 10 && relX < plat.w - 10 && Math.abs(player.y + playerH - plat.y) < 10) {
          if (!player.sliding) {
            die();
            return;
          }
        }

        // Laser
        if (plat.hasLaser) {
          plat.laserTimer++;
          plat.laserOn = Math.sin(plat.laserTimer * 0.03) > 0;
          if (plat.laserOn && relX > 20 && relX < plat.w - 20 && player.y > plat.y - 80 && player.y < plat.y) {
            if (!player.dashing) {
              die();
              return;
            }
          }
        }

        // Moving platforms
        if (plat.type === 'moving') {
          plat.y = plat.originalY + Math.sin(frameCount * 0.02) * 40;
        }

        // Crumbling
        if (plat.type === 'crumbling' && plat.crumbleTimer < 25 && plat.crumbleTimer > 0) {
          // Shake effect - handled in render
        }
      }

      // Fall death
      if (player.y > H + 50) {
        die();
        return;
      }

      // Coins
      for (const coin of coins) {
        if (coin.collected) continue;
        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        if (dx * dx + dy * dy < 625) { // 25^2
          coin.collected = true;
          coinCount++;
          spawnParticles(coin.x - cameraX, coin.y, '#39FF14', 6);
        }
      }

      // Running particles
      if (player.onGround && frameCount % 4 === 0) {
        particles.push({
          x: 150 - 10, y: player.y + 25 - (cameraX - player.x + 150),
          vx: -1 - Math.random() * 2, vy: -Math.random(),
          life: 10 + Math.random() * 10, color: '#39FF1466', size: 2 + Math.random() * 2,
        });
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Cleanup off-screen
      platforms = platforms.filter(p => p.x + p.w > cameraX - 100);
      coins = coins.filter(c => c.x > cameraX - 100);

      // Generate ahead
      generatePlatforms();

      // Parallax
      parallax[0] = cameraX * 0.1;
      parallax[1] = cameraX * 0.3;
      parallax[2] = cameraX * 0.6;
    };

    const die = () => {
      player.alive = false;
      spawnParticles(150, player.y, '#39FF14', 30);
      gameState = 'gameover';
      const finalScore = Math.floor(distance / 10) + coinCount * 10;
      onScore(finalScore);
    };

    const drawParallax = () => {
      // Layer 0: Far city silhouette
      ctx.fillStyle = '#0f0f12';
      for (let i = 0; i < 20; i++) {
        const bx = (i * 120 - parallax[0] % 120) | 0;
        const bh = 60 + (i * 37 % 80);
        ctx.fillRect(bx, H - bh - 100, 40, bh);
        ctx.fillRect(bx + 50, H - bh - 70, 30, bh - 30);
      }

      // Layer 1: Mid buildings
      ctx.fillStyle = '#141418';
      for (let i = 0; i < 15; i++) {
        const bx = (i * 150 - parallax[1] % 150) | 0;
        const bh = 80 + (i * 53 % 100);
        ctx.fillRect(bx, H - bh - 60, 60, bh);
        // Windows
        ctx.fillStyle = '#1a1a22';
        for (let wy = 0; wy < bh - 20; wy += 18) {
          for (let wx = 8; wx < 52; wx += 16) {
            ctx.fillRect(bx + wx, H - bh - 60 + wy + 8, 8, 10);
          }
        }
        ctx.fillStyle = '#141418';
      }

      // Layer 2: Near ground details
      ctx.fillStyle = '#1a1a1f';
      for (let i = 0; i < 30; i++) {
        const bx = (i * 80 - parallax[2] % 80) | 0;
        ctx.fillRect(bx, GROUND_Y + 20, 30, 80);
      }
    };

    const render = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      if (gameState === 'start') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('NINJA RUNNER', W / 2, H / 3);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('SPACE/UP = Jump | DOWN = Slide | SHIFT = Dash', W / 2, H / 2 - 10);
        ctx.fillText('Double jump, wall jump, dodge obstacles!', W / 2, H / 2 + 20);
        ctx.fillStyle = '#39FF14';
        ctx.font = '20px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.7);
        ctx.globalAlpha = 1;
        return;
      }

      // Parallax background
      drawParallax();

      // Draw world offset by camera
      ctx.save();
      ctx.translate((-cameraX + 150 - player.x + player.x) | 0, 0);
      // Actually need to offset by cameraX
      const offsetX = -cameraX;

      // Platforms
      for (const plat of platforms) {
        const px = (plat.x + offsetX) | 0;
        if (px > W + 50 || px + plat.w < -50) continue;

        let platColor = '#39FF14';
        if (plat.type === 'crumbling') {
          platColor = '#FF8800';
          if (plat.crumbleTimer < 25) {
            // Shake
            const shakeAmt = (25 - plat.crumbleTimer) * 0.5;
            ctx.fillStyle = platColor;
            ctx.fillRect((px + (Math.random() - 0.5) * shakeAmt) | 0, (plat.y + (Math.random() - 0.5) * shakeAmt) | 0, plat.w, 12);
            continue;
          }
        } else if (plat.type === 'bouncy') {
          platColor = '#00FF88';
        } else if (plat.type === 'moving') {
          platColor = '#8844FF';
        }

        ctx.fillStyle = plat.crumbleTimer <= 0 ? '#33333344' : platColor;
        ctx.fillRect(px, plat.y | 0, plat.w, 12);

        // Top line
        ctx.strokeStyle = platColor + '88';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, plat.y | 0);
        ctx.lineTo(px + plat.w, plat.y | 0);
        ctx.stroke();

        // Spikes
        if (plat.hasSpike) {
          ctx.fillStyle = '#FF4444';
          for (let sx = 15; sx < plat.w - 15; sx += 20) {
            ctx.beginPath();
            ctx.moveTo(px + sx - 6, plat.y);
            ctx.lineTo(px + sx, plat.y - 14);
            ctx.lineTo(px + sx + 6, plat.y);
            ctx.fill();
          }
        }

        // Lasers
        if (plat.hasLaser && plat.laserOn) {
          ctx.strokeStyle = '#FF0044';
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 50) * 0.3;
          ctx.beginPath();
          ctx.moveTo(px + 30, plat.y);
          ctx.lineTo(px + 30, plat.y - 80);
          ctx.stroke();
          ctx.moveTo(px + plat.w - 30, plat.y);
          ctx.lineTo(px + plat.w - 30, plat.y - 80);
          ctx.stroke();
          // Horizontal laser beam
          ctx.beginPath();
          ctx.moveTo(px + 30, plat.y - 40);
          ctx.lineTo(px + plat.w - 30, plat.y - 40);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Coins
      for (const coin of coins) {
        if (coin.collected) continue;
        const cx = (coin.x + offsetX) | 0;
        if (cx < -20 || cx > W + 20) continue;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(cx, coin.y | 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // Player (always at screen position ~150)
      if (player.alive) {
        const screenX = 150;
        const screenY = player.y | 0;
        ctx.fillStyle = '#39FF14';
        if (player.sliding) {
          ctx.fillRect((screenX - 12) | 0, (screenY + 10) | 0, 24, 15);
        } else {
          ctx.fillRect((screenX - 8) | 0, screenY | 0, 16, 28);
          // Head
          ctx.beginPath();
          ctx.arc(screenX, (screenY - 4) | 0, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dash effect
        if (player.dashing) {
          ctx.strokeStyle = '#00FFFF88';
          ctx.lineWidth = 2;
          for (let i = 1; i < 4; i++) {
            ctx.globalAlpha = 0.3 - i * 0.08;
            ctx.strokeRect((screenX - 8 - i * 8) | 0, screenY | 0, 16, 28);
          }
          ctx.globalAlpha = 1;
        }

        // Wall cling indicator
        if (player.wallClinging) {
          ctx.fillStyle = '#39FF1488';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('CLING', screenX, screenY - 15);
        }
      }

      // Particles (screen space)
      for (const p of particles) {
        ctx.globalAlpha = p.life / 30;
        ctx.fillStyle = p.color;
        ctx.fillRect((p.x - p.size / 2) | 0, (p.y - p.size / 2) | 0, p.size | 0, p.size | 0);
      }
      ctx.globalAlpha = 1;

      // HUD
      ctx.textAlign = 'left';
      ctx.fillStyle = '#39FF14';
      ctx.font = 'bold 24px Orbitron, monospace';
      ctx.fillText(`${Math.floor(distance / 10)}m`, 20, 35);

      ctx.fillStyle = '#FFD700';
      ctx.font = '18px Orbitron, monospace';
      ctx.fillText(`🪙 ${coinCount}`, 20, 60);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#888';
      ctx.font = '14px Orbitron, monospace';
      ctx.fillText(`Speed: ${speed.toFixed(1)}x`, W - 20, 35);

      // Dash cooldown bar
      const dashPct = Math.max(0, 1 - player.dashCooldown / 180);
      ctx.fillStyle = '#333';
      ctx.fillRect(W - 120, 45, 100, 8);
      ctx.fillStyle = dashPct >= 1 ? '#00FFFF' : '#00FFFF66';
      ctx.fillRect(W - 120, 45, (100 * dashPct) | 0, 8);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText('DASH', W - 20, 68);

      if (gameState === 'gameover') {
        const finalScore = Math.floor(distance / 10) + coinCount * 10;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('GAME OVER', W / 2, H / 3);
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText(`${finalScore}`, W / 2, H / 2 - 10);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText(`Distance: ${Math.floor(distance / 10)}m | Coins: ${coinCount}`, W / 2, H / 2 + 25);
        ctx.fillStyle = '#39FF14';
        ctx.font = '18px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('SPACE TO RETRY / ESC TO EXIT', W / 2, H * 0.75);
        ctx.globalAlpha = 1;
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
      <canvas ref={canvasRef} width={W} height={H} style={{ border: '1px solid #39FF1433' }} />
    </div>
  );
}
