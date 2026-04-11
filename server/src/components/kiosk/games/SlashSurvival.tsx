'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props { onScore: (score: number) => void; onClose: () => void; }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface Coin { x: number; y: number; magnet: boolean; }
interface Projectile { x: number; y: number; vx: number; vy: number; }
interface Enemy {
  x: number; y: number; hp: number; maxHp: number; type: 'runner' | 'tank' | 'shooter' | 'boss';
  speed: number; angle: number; shootCooldown: number; size: number; damage: number;
  bossAttackTimer: number; bossPattern: number;
}
interface PowerUp { name: string; desc: string; icon: string; }

const W = 800, H = 600;
const ARENA = { x: 50, y: 50, w: W - 100, h: H - 100 };

const ALL_POWERUPS: PowerUp[] = [
  { name: 'Speed Boost', desc: '+25% move speed', icon: '⚡' },
  { name: 'Damage Up', desc: '+15 damage', icon: '⚔️' },
  { name: 'Health Regen', desc: 'Regen 1HP/sec', icon: '❤️' },
  { name: 'Shield', desc: 'Block next 3 hits', icon: '🛡️' },
  { name: 'Wide Slash', desc: 'Wider attack arc', icon: '🌀' },
  { name: 'Magnet', desc: 'Auto-collect coins', icon: '🧲' },
];

export function SlashSurvival({ onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let gameState: 'start' | 'playing' | 'waveBreak' | 'gameover' = 'start';
    let player = {
      x: W / 2, y: H / 2, hp: 100, maxHp: 100, angle: 0,
      speed: 3, damage: 30, slashArc: Math.PI / 2.5, slashCooldown: 0,
      shield: 0, regen: false, magnet: false,
    };
    let enemies: Enemy[] = [];
    let particles: Particle[] = [];
    let coins: Coin[] = [];
    let projectiles: Projectile[] = [];
    let keys: Record<string, boolean> = {};
    let mouse = { x: W / 2, y: H / 2, down: false };
    let wave = 0;
    let score = 0;
    let combo = 0;
    let comboTimer = 0;
    let maxCombo = 0;
    let totalKills = 0;
    let shake = { x: 0, y: 0, intensity: 0 };
    let waveBreakTimer = 0;
    let powerUpChoices: PowerUp[] = [];
    let boss: Enemy | null = null;
    let animId = 0;
    let slashVisual = 0;

    const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    const addShake = (i: number) => { shake.intensity = Math.max(shake.intensity, i); };

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 5;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 20 + Math.random() * 20, color, size: 2 + Math.random() * 4 });
      }
    };

    const spawnWave = () => {
      wave++;
      const isBossWave = wave % 5 === 0;
      const count = 5 + (wave - 1) * 3;

      if (isBossWave) {
        const bossHp = 200 + wave * 30;
        boss = {
          x: W / 2, y: 60, hp: bossHp, maxHp: bossHp, type: 'boss',
          speed: 1, angle: 0, shootCooldown: 60, size: 30, damage: 20,
          bossAttackTimer: 120, bossPattern: 0,
        };
        enemies.push(boss);
      }

      for (let i = 0; i < count; i++) {
        const types: ('runner' | 'tank' | 'shooter')[] = ['runner', 'runner', 'tank', 'shooter'];
        const type = types[Math.floor(Math.random() * types.length)];
        let edge = Math.floor(Math.random() * 4);
        let ex = 0, ey = 0;
        if (edge === 0) { ex = Math.random() * W; ey = -20; }
        else if (edge === 1) { ex = W + 20; ey = Math.random() * H; }
        else if (edge === 2) { ex = Math.random() * W; ey = H + 20; }
        else { ex = -20; ey = Math.random() * H; }

        const e: Enemy = {
          x: ex, y: ey, type,
          hp: type === 'runner' ? 20 + wave * 2 : type === 'tank' ? 60 + wave * 5 : 30 + wave * 3,
          maxHp: type === 'runner' ? 20 + wave * 2 : type === 'tank' ? 60 + wave * 5 : 30 + wave * 3,
          speed: type === 'runner' ? 2.5 : type === 'tank' ? 1 : 1.5,
          angle: 0, shootCooldown: type === 'shooter' ? 90 + Math.random() * 60 : 0,
          size: type === 'tank' ? 18 : 12, damage: type === 'tank' ? 15 : 8,
          bossAttackTimer: 0, bossPattern: 0,
        };
        enemies.push(e);
      }
    };

    const showPowerUps = () => {
      const shuffled = [...ALL_POWERUPS].sort(() => Math.random() - 0.5);
      powerUpChoices = shuffled.slice(0, 3);
      waveBreakTimer = 300; // 5 seconds
      gameState = 'waveBreak';
    };

    const applyPowerUp = (pu: PowerUp) => {
      switch (pu.name) {
        case 'Speed Boost': player.speed *= 1.25; break;
        case 'Damage Up': player.damage += 15; break;
        case 'Health Regen': player.regen = true; break;
        case 'Shield': player.shield += 3; break;
        case 'Wide Slash': player.slashArc = Math.min(Math.PI, player.slashArc + Math.PI / 6); break;
        case 'Magnet': player.magnet = true; break;
      }
      gameState = 'playing';
      spawnWave();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        if (gameState === 'start') { gameState = 'playing'; spawnWave(); }
        else if (gameState === 'gameover') {
          // Reset everything
          player = { x: W / 2, y: H / 2, hp: 100, maxHp: 100, angle: 0, speed: 3, damage: 30, slashArc: Math.PI / 2.5, slashCooldown: 0, shield: 0, regen: false, magnet: false };
          enemies = []; particles = []; coins = []; projectiles = [];
          wave = 0; score = 0; combo = 0; comboTimer = 0; maxCombo = 0; totalKills = 0; boss = null;
          gameState = 'playing'; spawnWave();
        }
        e.preventDefault();
      }
      if (e.key >= '1' && e.key <= '3' && gameState === 'waveBreak') {
        const idx = parseInt(e.key) - 1;
        if (powerUpChoices[idx]) applyPowerUp(powerUpChoices[idx]);
      }
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    };
    const onMouseDown = () => { mouse.down = true; };
    const onMouseUp = () => { mouse.down = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);

    const update = () => {
      if (gameState === 'waveBreak') {
        waveBreakTimer--;
        if (waveBreakTimer <= 0) {
          // Auto pick first
          applyPowerUp(powerUpChoices[0]);
        }
        return;
      }
      if (gameState !== 'playing') return;

      // Player movement
      let dx = 0, dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      if (dx || dy) {
        const len = Math.sqrt(dx * dx + dy * dy);
        player.x = Math.max(ARENA.x + 10, Math.min(ARENA.x + ARENA.w - 10, player.x + (dx / len) * player.speed));
        player.y = Math.max(ARENA.y + 10, Math.min(ARENA.y + ARENA.h - 10, player.y + (dy / len) * player.speed));
      }

      player.angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

      // Regen
      if (player.regen && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 1 / 60);

      // Slash
      if (player.slashCooldown > 0) player.slashCooldown--;
      if (slashVisual > 0) slashVisual--;
      if (mouse.down && player.slashCooldown <= 0) {
        player.slashCooldown = 12;
        slashVisual = 8;
        // Check hits
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          const d = dist(player.x, player.y, e.x, e.y);
          if (d > 70) continue;
          const angleToE = Math.atan2(e.y - player.y, e.x - player.x);
          let angleDiff = Math.abs(player.angle - angleToE);
          if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
          if (angleDiff > player.slashArc / 2) continue;

          e.hp -= player.damage;
          const eColor = e.type === 'runner' ? '#FF4444' : e.type === 'tank' ? '#FF8800' : e.type === 'shooter' ? '#AA44FF' : '#FF0066';
          spawnParticles(e.x, e.y, eColor, 6);
          addShake(3);

          if (e.hp <= 0) {
            spawnParticles(e.x, e.y, eColor, 20);
            addShake(6);
            totalKills++;
            // Combo
            comboTimer = 120; // 2 seconds
            combo++;
            if (combo > maxCombo) maxCombo = combo;
            const points = 10 * combo;
            score += points;
            // Milestone shakes
            if (combo === 5 || combo === 10 || combo === 20) addShake(12);
            // Drop coin
            coins.push({ x: e.x, y: e.y, magnet: false });
            if (e === boss) boss = null;
            enemies.splice(i, 1);
          }
        }
      }

      // Combo timer
      if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) combo = 0; }

      // Enemy AI
      for (const e of enemies) {
        const angleToPlayer = Math.atan2(player.y - e.y, player.x - e.x);
        e.angle = angleToPlayer;

        if (e.type === 'boss') {
          // Boss movement
          e.bossAttackTimer--;
          const dToPlayer = dist(e.x, e.y, player.x, player.y);
          if (dToPlayer > 150) {
            e.x += Math.cos(angleToPlayer) * e.speed;
            e.y += Math.sin(angleToPlayer) * e.speed;
          }
          // Boss attacks
          if (e.bossAttackTimer <= 0) {
            e.bossPattern = (e.bossPattern + 1) % 3;
            e.bossAttackTimer = 90;
            if (e.bossPattern === 0) {
              // Radial burst
              for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 });
              }
            } else if (e.bossPattern === 1) {
              // Aimed triple shot
              for (let off = -0.2; off <= 0.2; off += 0.2) {
                projectiles.push({ x: e.x, y: e.y, vx: Math.cos(angleToPlayer + off) * 4, vy: Math.sin(angleToPlayer + off) * 4 });
              }
            } else {
              // Charge toward player
              e.speed = 4;
              setTimeout(() => { if (e) e.speed = 1; }, 500);
            }
          }
        } else {
          e.x += Math.cos(angleToPlayer) * e.speed;
          e.y += Math.sin(angleToPlayer) * e.speed;

          if (e.type === 'shooter') {
            e.shootCooldown--;
            if (e.shootCooldown <= 0) {
              e.shootCooldown = 90;
              projectiles.push({ x: e.x, y: e.y, vx: Math.cos(angleToPlayer) * 3, vy: Math.sin(angleToPlayer) * 3 });
            }
          }
        }

        // Collision with player
        if (dist(e.x, e.y, player.x, player.y) < e.size + 12) {
          if (player.shield > 0) {
            player.shield--;
            spawnParticles(player.x, player.y, '#4488FF', 10);
          } else {
            player.hp -= e.damage * 0.1; // Damage per frame of contact
          }
          // Push apart
          const pushA = Math.atan2(player.y - e.y, player.x - e.x);
          e.x -= Math.cos(pushA) * 2;
          e.y -= Math.sin(pushA) * 2;
        }
      }

      // Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) { projectiles.splice(i, 1); continue; }
        if (dist(p.x, p.y, player.x, player.y) < 14) {
          if (player.shield > 0) { player.shield--; spawnParticles(player.x, player.y, '#4488FF', 6); }
          else { player.hp -= 10; spawnParticles(player.x, player.y, '#FF4444', 6); addShake(3); }
          projectiles.splice(i, 1);
        }
      }

      // Coins
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (player.magnet) {
          const a = Math.atan2(player.y - c.y, player.x - c.x);
          c.x += Math.cos(a) * 4; c.y += Math.sin(a) * 4;
        }
        if (dist(c.x, c.y, player.x, player.y) < 25) {
          score += 5;
          spawnParticles(c.x, c.y, '#39FF14', 4);
          coins.splice(i, 1);
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--; p.vx *= 0.93; p.vy *= 0.93;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Shake
      shake.intensity *= 0.85;
      shake.x = (Math.random() - 0.5) * shake.intensity;
      shake.y = (Math.random() - 0.5) * shake.intensity;

      // Death check
      if (player.hp <= 0) {
        gameState = 'gameover';
        onScore(score);
      }

      // Wave clear check
      if (enemies.length === 0 && gameState === 'playing') {
        showPowerUps();
      }
    };

    const render = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#151515';
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      if (gameState === 'start') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF6B35';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('SLASH SURVIVAL', W / 2, H / 3);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('WASD to move | Click to slash | Build combos!', W / 2, H / 2 - 10);
        ctx.fillText('Survive waves, get power-ups, fight bosses!', W / 2, H / 2 + 20);
        ctx.fillStyle = '#FF6B35';
        ctx.font = '20px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.7);
        ctx.globalAlpha = 1;
        return;
      }

      if (gameState === 'waveBreak') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 28px Orbitron, monospace';
        ctx.fillText(`WAVE ${wave} CLEARED!`, W / 2, H / 4);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('Choose a power-up (press 1, 2, or 3):', W / 2, H / 3);

        for (let i = 0; i < powerUpChoices.length; i++) {
          const pu = powerUpChoices[i];
          const bx = W / 2 - 250 + i * 200;
          const by = H / 2 - 40;
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(bx | 0, by | 0, 160, 100);
          ctx.strokeStyle = '#39FF14';
          ctx.strokeRect(bx | 0, by | 0, 160, 100);
          ctx.fillStyle = '#fff';
          ctx.font = '24px monospace';
          ctx.fillText(pu.icon, (bx + 80) | 0, (by + 35) | 0);
          ctx.font = '14px Orbitron, monospace';
          ctx.fillStyle = '#39FF14';
          ctx.fillText(pu.name, (bx + 80) | 0, (by + 60) | 0);
          ctx.fillStyle = '#888';
          ctx.font = '11px monospace';
          ctx.fillText(pu.desc, (bx + 80) | 0, (by + 80) | 0);
          ctx.fillStyle = '#555';
          ctx.font = '12px monospace';
          ctx.fillText(`[${i + 1}]`, (bx + 80) | 0, (by + 95) | 0);
        }

        ctx.fillStyle = '#555';
        ctx.font = '14px monospace';
        ctx.fillText(`Auto-pick in ${Math.ceil(waveBreakTimer / 60)}s`, W / 2, H * 0.8);
        return;
      }

      if (gameState === 'gameover') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('GAME OVER', W / 2, H / 4);
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText(`${score}`, W / 2, H / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText(`Wave: ${wave} | Kills: ${totalKills} | Max Combo: x${maxCombo}`, W / 2, H / 2 + 20);
        ctx.fillStyle = '#FF6B35';
        ctx.font = '18px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('SPACE TO RETRY / ESC TO EXIT', W / 2, H * 0.75);
        ctx.globalAlpha = 1;
        return;
      }

      // Playing - draw world with shake
      ctx.save();
      ctx.translate(shake.x | 0, shake.y | 0);

      // Arena border
      ctx.strokeStyle = '#39FF1433';
      ctx.lineWidth = 2;
      ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);

      // Coins
      for (const c of coins) {
        ctx.fillStyle = '#39FF14';
        ctx.beginPath();
        ctx.arc(c.x | 0, c.y | 0, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Projectiles
      ctx.fillStyle = '#FF44FF';
      for (const p of projectiles) {
        ctx.beginPath();
        ctx.arc(p.x | 0, p.y | 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Enemies
      for (const e of enemies) {
        const color = e.type === 'runner' ? '#FF4444' : e.type === 'tank' ? '#FF8800' : e.type === 'shooter' ? '#AA44FF' : '#FF0066';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(e.x | 0, e.y | 0, e.size, 0, Math.PI * 2);
        ctx.fill();
        // HP bar for non-runner
        if (e.type !== 'runner' || e.hp < e.maxHp) {
          const bw = e.size * 2;
          ctx.fillStyle = '#333';
          ctx.fillRect((e.x - bw / 2) | 0, (e.y - e.size - 8) | 0, bw, 3);
          ctx.fillStyle = color;
          ctx.fillRect((e.x - bw / 2) | 0, (e.y - e.size - 8) | 0, (bw * e.hp / e.maxHp) | 0, 3);
        }
      }

      // Player
      ctx.fillStyle = '#39FF14';
      ctx.beginPath();
      ctx.arc(player.x | 0, player.y | 0, 14, 0, Math.PI * 2);
      ctx.fill();

      // Slash visual
      if (slashVisual > 0) {
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 3;
        ctx.globalAlpha = slashVisual / 8;
        ctx.beginPath();
        ctx.arc(player.x | 0, player.y | 0, 60, player.angle - player.slashArc / 2, player.angle + player.slashArc / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Shield indicator
      if (player.shield > 0) {
        ctx.strokeStyle = '#4488FF66';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x | 0, player.y | 0, 20, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Particles
      for (const p of particles) {
        ctx.globalAlpha = p.life / 40;
        ctx.fillStyle = p.color;
        ctx.fillRect((p.x - p.size / 2) | 0, (p.y - p.size / 2) | 0, p.size | 0, p.size | 0);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // Boss HP bar
      if (boss && boss.hp > 0) {
        ctx.fillStyle = '#333';
        ctx.fillRect(W / 2 - 150, 15, 300, 14);
        ctx.fillStyle = '#FF0066';
        ctx.fillRect(W / 2 - 150, 15, (300 * boss.hp / boss.maxHp) | 0, 14);
        ctx.strokeStyle = '#FF0066';
        ctx.strokeRect(W / 2 - 150, 15, 300, 14);
        ctx.fillStyle = '#fff';
        ctx.font = '10px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', W / 2, 26);
      }

      // HUD
      // HP
      ctx.fillStyle = '#333'; ctx.fillRect(20, 20, 160, 12);
      ctx.fillStyle = '#39FF14'; ctx.fillRect(20, 20, (160 * Math.max(0, player.hp) / player.maxHp) | 0, 12);
      ctx.strokeStyle = '#39FF14'; ctx.strokeRect(20, 20, 160, 12);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#888'; ctx.font = '14px Orbitron, monospace';
      ctx.fillText(`Wave: ${wave}`, 20, 52);

      ctx.fillStyle = '#39FF14'; ctx.font = 'bold 20px Orbitron, monospace';
      ctx.fillText(`${score}`, 20, 75);

      // Combo
      if (combo > 1) {
        ctx.textAlign = 'center';
        ctx.fillStyle = combo >= 10 ? '#FF4444' : combo >= 5 ? '#FF8800' : '#FFFF00';
        ctx.font = `bold ${20 + Math.min(combo, 20)}px Orbitron, monospace`;
        ctx.fillText(`x${combo} COMBO!`, W / 2, H - 30);
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
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
    };
  }, [onScore, onClose]);

  useEffect(() => {
    const cleanup = gameLoop();
    return cleanup;
  }, [gameLoop]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <canvas ref={canvasRef} width={W} height={H} style={{ border: '1px solid #FF6B3533', cursor: 'crosshair' }} />
    </div>
  );
}
