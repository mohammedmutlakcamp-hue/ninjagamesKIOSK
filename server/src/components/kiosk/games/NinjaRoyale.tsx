'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props { onScore: (score: number) => void; onClose: () => void; }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface Weapon { type: 'sword' | 'shuriken' | 'katana'; x: number; y: number; damage: number; range: number; speed: number; }
interface Bot {
  x: number; y: number; hp: number; maxHp: number; angle: number;
  vx: number; vy: number; state: 'roam' | 'chase' | 'flee' | 'attack';
  weapon: Weapon | null; target: number; stateTimer: number; alive: boolean;
  name: string; attackCooldown: number; id: number;
}
interface KillFeedEntry { text: string; time: number; }
interface Shuriken { x: number; y: number; vx: number; vy: number; damage: number; owner: number; }

const MAP = 2000;
const W = 800, H = 600;

const WEAPONS: Omit<Weapon, 'x' | 'y'>[] = [
  { type: 'sword', damage: 25, range: 50, speed: 8 },
  { type: 'shuriken', damage: 15, range: 200, speed: 15 },
  { type: 'katana', damage: 40, range: 65, speed: 5 },
];

export function NinjaRoyale({ onScore, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<'start' | 'playing' | 'gameover'>('start');

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Game state
    let player = { x: MAP / 2, y: MAP / 2, hp: 100, maxHp: 100, angle: 0, weapon: null as Weapon | null, attackCooldown: 0, kills: 0 };
    let bots: Bot[] = [];
    let weapons: Weapon[] = [];
    let particles: Particle[] = [];
    let killFeed: KillFeedEntry[] = [];
    let shurikens: Shuriken[] = [];
    let zone = { x: MAP / 2, y: MAP / 2, radius: MAP / 2, targetRadius: MAP / 2, shrinkTimer: 0 };
    let keys: Record<string, boolean> = {};
    let mouse = { x: W / 2, y: H / 2, down: false };
    let camera = { x: 0, y: 0 };
    let shake = { x: 0, y: 0, intensity: 0 };
    let startTime = 0;
    let alive = 16;
    let animId = 0;
    let gameState = stateRef.current;

    // Init bots
    for (let i = 0; i < 15; i++) {
      bots.push({
        x: 100 + Math.random() * (MAP - 200), y: 100 + Math.random() * (MAP - 200),
        hp: 80, maxHp: 80, angle: Math.random() * Math.PI * 2,
        vx: 0, vy: 0, state: 'roam', weapon: null, target: -1, stateTimer: 0,
        alive: true, name: `Bot_${i + 1}`, attackCooldown: 0, id: i,
      });
    }

    // Spawn weapons
    for (let i = 0; i < 30; i++) {
      const wt = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      weapons.push({ ...wt, x: 50 + Math.random() * (MAP - 100), y: 50 + Math.random() * (MAP - 100) });
    }

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20, color, size: 2 + Math.random() * 3 });
      }
    };

    const addShake = (intensity: number) => { shake.intensity = Math.max(shake.intensity, intensity); };

    const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

    const tryAttack = (attacker: { x: number; y: number; angle: number; weapon: Weapon | null }, isPlayer: boolean, attackerId: number) => {
      if (!attacker.weapon) return;
      const w = attacker.weapon;
      if (w.type === 'shuriken') {
        shurikens.push({
          x: attacker.x, y: attacker.y,
          vx: Math.cos(attacker.angle) * w.speed, vy: Math.sin(attacker.angle) * w.speed,
          damage: w.damage, owner: isPlayer ? -1 : attackerId,
        });
        return;
      }
      // Melee
      const targets = isPlayer ? bots.filter(b => b.alive) : [{ x: player.x, y: player.y, hp: player.hp, alive: player.hp > 0 } as any, ...bots.filter(b => b.alive && b.id !== attackerId)];
      for (const t of targets) {
        if (!t.alive && t.hp !== undefined) continue;
        const d = dist(attacker.x, attacker.y, t.x, t.y);
        if (d > w.range) continue;
        const angleToTarget = Math.atan2(t.y - attacker.y, t.x - attacker.x);
        let angleDiff = Math.abs(attacker.angle - angleToTarget);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > Math.PI / 3) continue;
        t.hp -= w.damage;
        spawnParticles(t.x, t.y, isPlayer ? '#FF4444' : '#39FF14', 8);
        addShake(4);
        if (t.hp <= 0) {
          if (t.alive !== undefined) { t.alive = false; alive--; }
          spawnParticles(t.x, t.y, '#FF4444', 20);
          addShake(8);
          if (isPlayer) {
            player.kills++;
            killFeed.unshift({ text: `You eliminated ${t.name || 'Bot'}`, time: 180 });
          } else if (t === player || t.hp !== undefined && !('id' in t)) {
            // player got killed by bot
          } else {
            const killerName = isPlayer ? 'You' : `Bot_${attackerId + 1}`;
            const victimName = t.name || 'Player';
            killFeed.unshift({ text: `${killerName} eliminated ${victimName}`, time: 180 });
          }
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' && gameState !== 'playing') {
        if (gameState === 'start') { gameState = 'playing'; startTime = Date.now(); }
        else if (gameState === 'gameover') {
          // Reset
          player = { x: MAP / 2, y: MAP / 2, hp: 100, maxHp: 100, angle: 0, weapon: null, attackCooldown: 0, kills: 0 };
          bots = [];
          for (let i = 0; i < 15; i++) {
            bots.push({
              x: 100 + Math.random() * (MAP - 200), y: 100 + Math.random() * (MAP - 200),
              hp: 80, maxHp: 80, angle: Math.random() * Math.PI * 2,
              vx: 0, vy: 0, state: 'roam', weapon: null, target: -1, stateTimer: 0,
              alive: true, name: `Bot_${i + 1}`, attackCooldown: 0, id: i,
            });
          }
          weapons = [];
          for (let i = 0; i < 30; i++) {
            const wt = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
            weapons.push({ ...wt, x: 50 + Math.random() * (MAP - 100), y: 50 + Math.random() * (MAP - 100) });
          }
          particles = []; killFeed = []; shurikens = [];
          zone = { x: MAP / 2, y: MAP / 2, radius: MAP / 2, targetRadius: MAP / 2, shrinkTimer: 0 };
          alive = 16; gameState = 'playing'; startTime = Date.now();
        }
        e.preventDefault();
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
      if (gameState !== 'playing') return;
      const speed = 3;

      // Player movement
      let dx = 0, dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      if (dx || dy) {
        const len = Math.sqrt(dx * dx + dy * dy);
        player.x = Math.max(0, Math.min(MAP, player.x + (dx / len) * speed));
        player.y = Math.max(0, Math.min(MAP, player.y + (dy / len) * speed));
      }

      // Player aim
      const worldMouseX = mouse.x + camera.x;
      const worldMouseY = mouse.y + camera.y;
      player.angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);

      // Player attack
      if (player.attackCooldown > 0) player.attackCooldown--;
      if (mouse.down && player.attackCooldown <= 0 && player.weapon) {
        tryAttack(player, true, -1);
        player.attackCooldown = player.weapon.speed;
      }

      // Pickup weapons
      if (!player.weapon) {
        for (let i = weapons.length - 1; i >= 0; i--) {
          if (dist(player.x, player.y, weapons[i].x, weapons[i].y) < 30) {
            player.weapon = weapons[i]; weapons.splice(i, 1); break;
          }
        }
      }

      // Zone shrink
      zone.shrinkTimer++;
      if (zone.shrinkTimer >= 1200) { // every 20 seconds
        zone.targetRadius = Math.max(100, zone.targetRadius - 150);
        zone.shrinkTimer = 0;
      }
      zone.radius += (zone.targetRadius - zone.radius) * 0.01;

      // Zone damage
      if (dist(player.x, player.y, zone.x, zone.y) > zone.radius) {
        player.hp -= 0.5;
        if (player.hp <= 0) {
          gameState = 'gameover';
          const survivalSec = Math.floor((Date.now() - startTime) / 1000);
          onScore(player.kills * 100 + survivalSec);
        }
      }

      // Update bots
      for (const bot of bots) {
        if (!bot.alive) continue;

        // Zone damage
        if (dist(bot.x, bot.y, zone.x, zone.y) > zone.radius) {
          bot.hp -= 0.5;
          if (bot.hp <= 0) { bot.alive = false; alive--; spawnParticles(bot.x, bot.y, '#FF4444', 15); continue; }
        }

        // Pickup weapon
        if (!bot.weapon) {
          for (let i = weapons.length - 1; i >= 0; i--) {
            if (dist(bot.x, bot.y, weapons[i].x, weapons[i].y) < 30) {
              bot.weapon = weapons[i]; weapons.splice(i, 1); break;
            }
          }
        }

        bot.stateTimer--;
        if (bot.stateTimer <= 0) {
          // Decide state
          if (bot.hp < 25) { bot.state = 'flee'; bot.stateTimer = 120; }
          else {
            // Find nearest target
            let nearest = -1, nearDist = 300;
            const pd = dist(bot.x, bot.y, player.x, player.y);
            if (pd < nearDist && player.hp > 0) { nearest = -2; nearDist = pd; }
            for (const ob of bots) {
              if (ob.id === bot.id || !ob.alive) continue;
              const d = dist(bot.x, bot.y, ob.x, ob.y);
              if (d < nearDist) { nearest = ob.id; nearDist = d; }
            }
            if (nearest !== -1 && bot.weapon) {
              bot.state = nearDist < (bot.weapon.range + 10) ? 'attack' : 'chase';
              bot.target = nearest;
            } else {
              bot.state = 'roam';
            }
            bot.stateTimer = 60 + Math.floor(Math.random() * 60);
          }
        }

        const botSpeed = 2;
        switch (bot.state) {
          case 'roam': {
            bot.x += Math.cos(bot.angle) * botSpeed * 0.5;
            bot.y += Math.sin(bot.angle) * botSpeed * 0.5;
            if (Math.random() < 0.02) bot.angle += (Math.random() - 0.5) * 1;
            // Move toward zone center
            const toCenter = Math.atan2(zone.y - bot.y, zone.x - bot.x);
            if (dist(bot.x, bot.y, zone.x, zone.y) > zone.radius * 0.7) bot.angle = toCenter;
            break;
          }
          case 'chase': {
            const tx = bot.target === -2 ? player.x : bots.find(b => b.id === bot.target)?.x ?? bot.x;
            const ty = bot.target === -2 ? player.y : bots.find(b => b.id === bot.target)?.y ?? bot.y;
            bot.angle = Math.atan2(ty - bot.y, tx - bot.x);
            bot.x += Math.cos(bot.angle) * botSpeed;
            bot.y += Math.sin(bot.angle) * botSpeed;
            break;
          }
          case 'flee': {
            const fx = bot.target === -2 ? player.x : bots.find(b => b.id === bot.target)?.x ?? bot.x;
            const fy = bot.target === -2 ? player.y : bots.find(b => b.id === bot.target)?.y ?? bot.y;
            bot.angle = Math.atan2(bot.y - fy, bot.x - fx);
            bot.x += Math.cos(bot.angle) * botSpeed;
            bot.y += Math.sin(bot.angle) * botSpeed;
            break;
          }
          case 'attack': {
            const tx = bot.target === -2 ? player.x : bots.find(b => b.id === bot.target)?.x ?? bot.x;
            const ty = bot.target === -2 ? player.y : bots.find(b => b.id === bot.target)?.y ?? bot.y;
            bot.angle = Math.atan2(ty - bot.y, tx - bot.x);
            if (bot.attackCooldown <= 0 && bot.weapon) {
              // Bot attack
              if (bot.weapon.type === 'shuriken') {
                shurikens.push({ x: bot.x, y: bot.y, vx: Math.cos(bot.angle) * bot.weapon.speed, vy: Math.sin(bot.angle) * bot.weapon.speed, damage: bot.weapon.damage, owner: bot.id });
              } else {
                // Melee check
                const td = dist(bot.x, bot.y, tx, ty);
                if (td < bot.weapon.range) {
                  if (bot.target === -2) {
                    player.hp -= bot.weapon.damage;
                    spawnParticles(player.x, player.y, '#39FF14', 8);
                    addShake(4);
                    if (player.hp <= 0) {
                      gameState = 'gameover';
                      const survivalSec = Math.floor((Date.now() - startTime) / 1000);
                      onScore(player.kills * 100 + survivalSec);
                    }
                  } else {
                    const victim = bots.find(b => b.id === bot.target);
                    if (victim && victim.alive) {
                      victim.hp -= bot.weapon.damage;
                      spawnParticles(victim.x, victim.y, '#FF4444', 8);
                      if (victim.hp <= 0) {
                        victim.alive = false; alive--;
                        spawnParticles(victim.x, victim.y, '#FF4444', 20);
                        killFeed.unshift({ text: `${bot.name} eliminated ${victim.name}`, time: 180 });
                      }
                    }
                  }
                }
              }
              bot.attackCooldown = (bot.weapon.speed || 10) + Math.floor(Math.random() * 10);
            }
            break;
          }
        }
        bot.x = Math.max(0, Math.min(MAP, bot.x));
        bot.y = Math.max(0, Math.min(MAP, bot.y));
        if (bot.attackCooldown > 0) bot.attackCooldown--;
      }

      // Update shurikens
      for (let i = shurikens.length - 1; i >= 0; i--) {
        const s = shurikens[i];
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0 || s.x > MAP || s.y < 0 || s.y > MAP) { shurikens.splice(i, 1); continue; }
        // Hit check
        if (s.owner !== -1) { // not player's
          if (dist(s.x, s.y, player.x, player.y) < 15) {
            player.hp -= s.damage; spawnParticles(player.x, player.y, '#39FF14', 6); addShake(3);
            shurikens.splice(i, 1);
            if (player.hp <= 0) {
              gameState = 'gameover';
              const survivalSec = Math.floor((Date.now() - startTime) / 1000);
              onScore(player.kills * 100 + survivalSec);
            }
            continue;
          }
        }
        // Hit bots
        for (const bot of bots) {
          if (!bot.alive || bot.id === s.owner) continue;
          if (dist(s.x, s.y, bot.x, bot.y) < 15) {
            bot.hp -= s.damage; spawnParticles(bot.x, bot.y, '#FF4444', 6);
            if (bot.hp <= 0) {
              bot.alive = false; alive--;
              spawnParticles(bot.x, bot.y, '#FF4444', 20); addShake(6);
              if (s.owner === -1) {
                player.kills++;
                killFeed.unshift({ text: `You eliminated ${bot.name}`, time: 180 });
              } else {
                const killer = bots.find(b => b.id === s.owner);
                killFeed.unshift({ text: `${killer?.name || 'Bot'} eliminated ${bot.name}`, time: 180 });
              }
            }
            shurikens.splice(i, 1); break;
          }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--; p.vx *= 0.95; p.vy *= 0.95;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Kill feed timer
      for (let i = killFeed.length - 1; i >= 0; i--) {
        killFeed[i].time--;
        if (killFeed[i].time <= 0) killFeed.splice(i, 1);
      }
      if (killFeed.length > 5) killFeed.length = 5;

      // Shake decay
      shake.intensity *= 0.85;
      shake.x = (Math.random() - 0.5) * shake.intensity;
      shake.y = (Math.random() - 0.5) * shake.intensity;

      // Win check
      if (alive <= 1 && player.hp > 0) {
        gameState = 'gameover';
        const survivalSec = Math.floor((Date.now() - startTime) / 1000);
        onScore(player.kills * 100 + survivalSec);
      }

      // Camera
      camera.x = player.x - W / 2;
      camera.y = player.y - H / 2;
    };

    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      const startX = Math.floor(camera.x / 50) * 50;
      const startY = Math.floor(camera.y / 50) * 50;
      for (let x = startX; x < camera.x + W + 50; x += 50) {
        ctx.beginPath(); ctx.moveTo(x | 0, camera.y | 0); ctx.lineTo(x | 0, (camera.y + H) | 0); ctx.stroke();
      }
      for (let y = startY; y < camera.y + H + 50; y += 50) {
        ctx.beginPath(); ctx.moveTo(camera.x | 0, y | 0); ctx.lineTo((camera.x + W) | 0, y | 0); ctx.stroke();
      }
    };

    const drawHpBar = (ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number, color: string) => {
      const bw = 30, bh = 4;
      ctx.fillStyle = '#333'; ctx.fillRect((x - bw / 2) | 0, (y - 20) | 0, bw, bh);
      ctx.fillStyle = color; ctx.fillRect((x - bw / 2) | 0, (y - 20) | 0, (bw * Math.max(0, hp) / maxHp) | 0, bh);
    };

    const render = () => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      if (gameState === 'start') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText('NINJA ROYALE', W / 2, H / 3);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText('WASD to move | Mouse to aim | Click to attack', W / 2, H / 2 - 20);
        ctx.fillText('Pick up weapons | Survive the shrinking zone', W / 2, H / 2 + 10);
        ctx.fillStyle = '#39FF14';
        ctx.font = '20px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('PRESS SPACE TO START', W / 2, H * 0.7);
        ctx.globalAlpha = 1;
        return;
      }

      if (gameState === 'gameover') {
        ctx.textAlign = 'center';
        const survivalSec = Math.floor((Date.now() - startTime) / 1000);
        const score = player.kills * 100 + survivalSec;
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 48px Orbitron, monospace';
        ctx.fillText(player.hp > 0 ? 'VICTORY!' : 'ELIMINATED', W / 2, H / 4);
        ctx.fillStyle = '#39FF14';
        ctx.font = 'bold 36px Orbitron, monospace';
        ctx.fillText(`${score}`, W / 2, H / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '16px Orbitron, monospace';
        ctx.fillText(`Kills: ${player.kills} | Survived: ${survivalSec}s | Place: #${alive}`, W / 2, H / 2 + 20);
        ctx.fillStyle = '#39FF14';
        ctx.font = '18px Orbitron, monospace';
        const pulse = 0.5 + Math.sin(Date.now() / 300) * 0.5;
        ctx.globalAlpha = pulse;
        ctx.fillText('SPACE TO RETRY / ESC TO EXIT', W / 2, H * 0.75);
        ctx.globalAlpha = 1;
        return;
      }

      // Playing state - draw world
      ctx.save();
      ctx.translate((shake.x - camera.x) | 0, (shake.y - camera.y) | 0);

      drawGrid(ctx);

      // Draw zone
      ctx.beginPath();
      ctx.arc(zone.x | 0, zone.y | 0, zone.radius | 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#39FF1466';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Fill outside zone with danger
      ctx.save();
      ctx.beginPath();
      ctx.rect(camera.x - 10, camera.y - 10, W + 20, H + 20);
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2, true);
      ctx.fillStyle = '#FF000015';
      ctx.fill();
      ctx.restore();

      // Draw weapons on ground
      for (const w of weapons) {
        ctx.fillStyle = w.type === 'sword' ? '#AAAAFF' : w.type === 'shuriken' ? '#FFAA44' : '#FF44FF';
        ctx.beginPath();
        if (w.type === 'shuriken') {
          for (let p = 0; p < 4; p++) {
            const a = (p / 4) * Math.PI * 2 + Date.now() / 500;
            ctx.lineTo((w.x + Math.cos(a) * 8) | 0, (w.y + Math.sin(a) * 8) | 0);
          }
        } else {
          ctx.rect((w.x - 4) | 0, (w.y - 12) | 0, 8, 24);
        }
        ctx.fill();
      }

      // Draw shurikens in flight
      for (const s of shurikens) {
        ctx.fillStyle = '#FFAA44';
        ctx.save();
        ctx.translate(s.x | 0, s.y | 0);
        ctx.rotate(Date.now() / 100);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }

      // Draw bots
      for (const bot of bots) {
        if (!bot.alive) continue;
        ctx.fillStyle = '#FF4444';
        ctx.beginPath();
        ctx.arc(bot.x | 0, bot.y | 0, 12, 0, Math.PI * 2);
        ctx.fill();
        // Direction indicator
        ctx.strokeStyle = '#FF6666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bot.x | 0, bot.y | 0);
        ctx.lineTo((bot.x + Math.cos(bot.angle) * 18) | 0, (bot.y + Math.sin(bot.angle) * 18) | 0);
        ctx.stroke();
        drawHpBar(ctx, bot.x, bot.y, bot.hp, bot.maxHp, '#FF4444');
      }

      // Draw player
      if (player.hp > 0) {
        ctx.fillStyle = '#39FF14';
        ctx.beginPath();
        ctx.arc(player.x | 0, player.y | 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x | 0, player.y | 0);
        ctx.lineTo((player.x + Math.cos(player.angle) * 22) | 0, (player.y + Math.sin(player.angle) * 22) | 0);
        ctx.stroke();
        // Attack arc visualization
        if (player.attackCooldown > 0 && player.weapon && player.weapon.type !== 'shuriken') {
          ctx.strokeStyle = '#39FF1488';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.x | 0, player.y | 0, player.weapon.range, player.angle - Math.PI / 3, player.angle + Math.PI / 3);
          ctx.stroke();
        }
        drawHpBar(ctx, player.x, player.y, player.hp, player.maxHp, '#39FF14');
      }

      // Draw particles
      for (const p of particles) {
        ctx.globalAlpha = p.life / 50;
        ctx.fillStyle = p.color;
        ctx.fillRect((p.x - p.size / 2) | 0, (p.y - p.size / 2) | 0, p.size | 0, p.size | 0);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // UI overlay
      // HP bar
      ctx.fillStyle = '#333'; ctx.fillRect(20, 20, 200, 16);
      ctx.fillStyle = '#39FF14'; ctx.fillRect(20, 20, (200 * Math.max(0, player.hp) / player.maxHp) | 0, 16);
      ctx.strokeStyle = '#39FF14'; ctx.lineWidth = 1; ctx.strokeRect(20, 20, 200, 16);
      ctx.fillStyle = '#fff'; ctx.font = '11px Orbitron, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`HP: ${Math.ceil(Math.max(0, player.hp))}`, 25, 33);

      // Weapon
      ctx.fillStyle = '#888'; ctx.font = '14px Orbitron, monospace';
      ctx.fillText(`Weapon: ${player.weapon?.type || 'NONE'}`, 20, 55);

      // Alive count
      ctx.fillStyle = '#FF4444'; ctx.textAlign = 'left';
      ctx.fillText(`Alive: ${alive}`, 20, 75);

      // Kills
      ctx.fillStyle = '#39FF14';
      ctx.fillText(`Kills: ${player.kills}`, 20, 95);

      // Kill feed
      ctx.textAlign = 'right'; ctx.font = '12px Orbitron, monospace';
      for (let i = 0; i < killFeed.length; i++) {
        ctx.globalAlpha = Math.min(1, killFeed[i].time / 60);
        ctx.fillStyle = '#fff';
        ctx.fillText(killFeed[i].text, W - 20, 30 + i * 18);
      }
      ctx.globalAlpha = 1;

      // Minimap
      const mmSize = 120, mmX = W - mmSize - 15, mmY = H - mmSize - 15;
      ctx.fillStyle = '#00000088'; ctx.fillRect(mmX, mmY, mmSize, mmSize);
      ctx.strokeStyle = '#39FF1444'; ctx.strokeRect(mmX, mmY, mmSize, mmSize);
      const scale = mmSize / MAP;
      // Zone on minimap
      ctx.beginPath();
      ctx.arc((mmX + zone.x * scale) | 0, (mmY + zone.y * scale) | 0, (zone.radius * scale) | 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#39FF1466'; ctx.lineWidth = 1; ctx.stroke();
      // Bots
      for (const bot of bots) {
        if (!bot.alive) continue;
        ctx.fillStyle = '#FF4444';
        ctx.fillRect((mmX + bot.x * scale - 1) | 0, (mmY + bot.y * scale - 1) | 0, 3, 3);
      }
      // Player
      ctx.fillStyle = '#39FF14';
      ctx.fillRect((mmX + player.x * scale - 2) | 0, (mmY + player.y * scale - 2) | 0, 4, 4);
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
      <canvas ref={canvasRef} width={W} height={H} style={{ border: '1px solid #39FF1433', cursor: 'crosshair' }} />
    </div>
  );
}
