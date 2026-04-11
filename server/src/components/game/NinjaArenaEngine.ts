// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA ENGINE — Core game engine, no React dependencies
// Canvas: 800×450, Ground: y=360, Sprites: 128px frames auto-detected
// ═══════════════════════════════════════════════════════════════════════════════

export type FighterState =
  | 'idle' | 'walk' | 'jump' | 'fall'
  | 'light' | 'heavy' | 'special'
  | 'block' | 'hit' | 'death';

export type GamePhase = 'countdown' | 'fight' | 'roundOver' | 'gameOver';

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  light: boolean;
  heavy: boolean;
  block: boolean;
  special: boolean;
}

export const emptyInput = (): InputState => ({
  left: false, right: false, up: false,
  light: false, heavy: false, block: false, special: false,
});

export interface PublicFighterState {
  hp: number; maxHp: number;
  stamina: number; maxStamina: number;
  special: number;
  state: FighterState;
  x: number; y: number;
  onGround: boolean;
  facingRight: boolean;
}

export interface PublicGameState {
  phase: GamePhase;
  round: number; maxRounds: number;
  wins: [number, number];
  timer: number;
  countdown: number;
  roundWinner: -1 | 0 | 1;
  gameWinner: -1 | 0 | 1;
  fighters: [PublicFighterState, PublicFighterState];
}

// ── Internal types ────────────────────────────────────────────────────────────

interface Sprite {
  img: HTMLImageElement;
  frameCount: number;
  fw: number; fh: number;
}

interface Fighter {
  id: 0 | 1;
  x: number; y: number;
  vx: number; vy: number;
  facingRight: boolean;
  hp: number; maxHp: number;
  stamina: number; maxStamina: number;
  special: number;
  state: FighterState;
  animTime: number;
  hitThisSwing: boolean;
  onGround: boolean;
  jumpCount: number;
  hitstun: number;
  staminaRegenDelay: number;
  name: string;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  r: number; g: number; b: number;
  size: number;
}

interface PopText {
  x: number; y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CW = 800, CH = 450;
const GROUND_Y = 362;
const STAGE_LEFT = 80;
const STAGE_RIGHT = 720;
const GRAVITY = 1.0;
const JUMP_VY = -18;
const MOVE_SPEED = 4.6;
const AIR_SPEED = 4.0;
const MAX_FALL = 26;
const SPRITE_SCALE = 1.52;

const T_LIGHT   = 460;
const T_HEAVY   = 720;
const T_SPECIAL = 920;

// Attack active window [start, end] as fraction of animation
const LIGHT_WIN   = [0.18, 0.52] as const;
const HEAVY_WIN   = [0.28, 0.68] as const;
const SPECIAL_WIN = [0.06, 0.90] as const;

const DMG: Record<string, number> = { light: 7, heavy: 18, special: 35 };
const BLOCK_MULT = 0.12; // 88% damage reduction on block

const ANIM_FPS: Record<FighterState, number> = {
  idle: 8,  walk: 12, jump: 8,  fall: 8,
  light: 24, heavy: 18, special: 22,
  block: 10, hit: 20,  death: 9,
};

const ANIM_SPRITE: Record<FighterState, string> = {
  idle: 'idle',   walk: 'walk',   jump: 'idle',  fall: 'idle',
  light: 'attack', heavy: 'attack', special: 'attack',
  block: 'hit',   hit: 'hit',     death: 'death',
};

// ══════════════════════════════════════════════════════════════════════════════

export class NinjaArenaEngine {
  private ctx: CanvasRenderingContext2D;
  private sprites: Record<string, Sprite> = {};
  private ready = false;

  private fighters!: [Fighter, Fighter];
  private particles: Particle[] = [];
  private popTexts: PopText[] = [];

  private phase: GamePhase = 'countdown';
  private round = 1;
  private maxRounds = 3;
  private wins: [number, number] = [0, 0];
  private timer = 99;
  private countdown = 3;
  private phaseTimer = 0;
  private roundWinner: -1 | 0 | 1 = -1;
  private gameWinner: -1 | 0 | 1 = -1;

  private inputs: [InputState, InputState] = [emptyInput(), emptyInput()];
  private prevInputs: [InputState, InputState] = [emptyInput(), emptyInput()];

  private shake = 0;
  private running = false;
  private animId = 0;
  private lastTime = 0;
  private handlers: Record<string, Array<(...a: any[]) => void>> = {};
  private audioCtx: AudioContext | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = CW;
    canvas.height = CH;
    this.ctx = canvas.getContext('2d')!;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  on(ev: string, h: (...a: any[]) => void): () => void {
    (this.handlers[ev] ??= []).push(h);
    return () => { this.handlers[ev] = this.handlers[ev]?.filter(x => x !== h); };
  }

  private emit(ev: string, ...args: any[]) {
    this.handlers[ev]?.forEach(h => h(...args));
  }

  // ── Sprite loading ────────────────────────────────────────────────────────

  async loadSprites(): Promise<void> {
    const paths: Record<string, string> = {
      idle:   '/game-assets/YellowNinja/yellowNinja - idle.png',
      walk:   '/game-assets/YellowNinja/yellowNinja - walk.png',
      attack: '/game-assets/YellowNinja/yellowNinja - attack.png',
      hit:    '/game-assets/YellowNinja/yellowNinja - hit.png',
      death:  '/game-assets/YellowNinja/yellowNinja - Death.png',
    };

    await Promise.all(
      Object.entries(paths).map(([k, src]) =>
        new Promise<void>(res => {
          const img = new Image();
          img.onload = () => {
            const fc = Math.max(1, Math.round(img.width / img.height));
            this.sprites[k] = { img, frameCount: fc, fw: img.height, fh: img.height };
            res();
          };
          img.onerror = () => {
            // Fallback: procedural colored rectangle as placeholder
            const oc = document.createElement('canvas');
            oc.width = 128; oc.height = 128;
            const oc2 = oc.getContext('2d')!;
            oc2.fillStyle = '#FFD700';
            oc2.fillRect(20, 10, 88, 108);
            oc2.fillStyle = '#000';
            oc2.fillRect(40, 20, 48, 30);
            const fi = new Image(); fi.src = oc.toDataURL();
            this.sprites[k] = { img: fi, frameCount: 1, fw: 128, fh: 128 };
            res();
          };
          img.src = src;
        })
      )
    );
    this.ready = true;
  }

  // ── Game lifecycle ────────────────────────────────────────────────────────

  start(p1 = 'Player 1', p2 = 'Player 2') {
    this.stop();
    this.round = 1;
    this.wins = [0, 0];
    this.gameWinner = -1;
    this.fighters = [this.mkFighter(0, p1), this.mkFighter(1, p2)];
    this.beginRound();
    this.running = true;
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }

  setInput(idx: 0 | 1, inp: InputState) {
    this.prevInputs[idx] = { ...this.inputs[idx] };
    this.inputs[idx] = { ...inp };
  }

  getState(): PublicGameState {
    const mapF = (f: Fighter): PublicFighterState => ({
      hp: f.hp, maxHp: f.maxHp,
      stamina: f.stamina, maxStamina: f.maxStamina,
      special: f.special, state: f.state,
      x: f.x, y: f.y, onGround: f.onGround, facingRight: f.facingRight,
    });
    return {
      phase: this.phase, round: this.round, maxRounds: this.maxRounds,
      wins: [this.wins[0], this.wins[1]],
      timer: Math.ceil(this.timer), countdown: this.countdown,
      roundWinner: this.roundWinner, gameWinner: this.gameWinner,
      fighters: [mapF(this.fighters[0]), mapF(this.fighters[1])],
    };
  }

  // ── Fighter factory ───────────────────────────────────────────────────────

  private mkFighter(id: 0 | 1, name: string): Fighter {
    return {
      id, name,
      x: id === 0 ? 200 : 600, y: GROUND_Y,
      vx: 0, vy: 0,
      facingRight: id === 0,
      hp: 100, maxHp: 100,
      stamina: 100, maxStamina: 100,
      special: 0,
      state: 'idle', animTime: 0,
      hitThisSwing: false,
      onGround: true, jumpCount: 0,
      hitstun: 0, staminaRegenDelay: 0,
    };
  }

  private resetFighter(f: Fighter) {
    f.x = f.id === 0 ? 200 : 600; f.y = GROUND_Y;
    f.vx = 0; f.vy = 0;
    f.facingRight = f.id === 0;
    f.hp = 100; f.stamina = 100; f.special = 0;
    f.state = 'idle'; f.animTime = 0;
    f.hitThisSwing = false;
    f.onGround = true; f.jumpCount = 0;
    f.hitstun = 0; f.staminaRegenDelay = 0;
  }

  // ── Round management ──────────────────────────────────────────────────────

  private beginRound() {
    this.roundWinner = -1;
    this.timer = 99;
    this.particles = [];
    this.popTexts = [];
    this.phase = 'countdown';
    this.countdown = 3;
    this.phaseTimer = 0;
    this.resetFighter(this.fighters[0]);
    this.resetFighter(this.fighters[1]);
    this.emit('roundStart', { round: this.round });
  }

  private endRound(winner: -1 | 0 | 1) {
    if (this.phase !== 'fight') return;
    this.roundWinner = winner;
    this.phase = 'roundOver';
    this.phaseTimer = 0;
    if (winner >= 0) this.wins[winner as 0 | 1]++;
    this.emit('roundEnd', { round: this.round, winner, wins: [...this.wins] });
    this.emitState();
  }

  private nextRound() {
    const need = Math.ceil(this.maxRounds / 2);
    if (this.wins[0] >= need || this.wins[1] >= need) {
      this.gameWinner = this.wins[0] > this.wins[1] ? 0
        : this.wins[1] > this.wins[0] ? 1 : -1;
      this.phase = 'gameOver';
      this.emit('gameEnd', { winner: this.gameWinner, wins: [...this.wins] });
      this.emitState();
      return;
    }
    this.round++;
    this.beginRound();
  }

  private emitState() { this.emit('stateUpdate', this.getState()); }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private loop = (ts: number) => {
    if (!this.running) return;
    const dt = Math.min(ts - this.lastTime, 50);
    this.lastTime = ts;
    this.update(dt);
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.phaseTimer += dt;

    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, 3 - Math.floor(this.phaseTimer / 1000));
      if (this.phaseTimer >= 3600) {
        this.phase = 'fight'; this.phaseTimer = 0;
        this.emit('fight');
      }
      this.emitState();
      return;
    }

    if (this.phase === 'roundOver') {
      if (this.phaseTimer > 2800) this.nextRound();
      this.emitState();
      return;
    }

    if (this.phase === 'gameOver') { this.emitState(); return; }

    // ── Fight tick ────────────────────────────────────────────────────────
    this.timer = Math.max(0, this.timer - dt / 1000);
    if (this.timer <= 0) {
      const w = this.fighters[0].hp > this.fighters[1].hp ? 0
        : this.fighters[1].hp > this.fighters[0].hp ? 1 : -1 as -1 | 0 | 1;
      this.endRound(w as -1 | 0 | 1);
      return;
    }

    const [f0, f1] = this.fighters;

    // Auto-face
    if (f0.state !== 'death') f0.facingRight = f0.x < f1.x;
    if (f1.state !== 'death') f1.facingRight = f1.x < f0.x;

    this.updateFighter(f0, this.inputs[0], this.prevInputs[0], dt);
    this.updateFighter(f1, this.inputs[1], this.prevInputs[1], dt);

    if (f0.state !== 'death') this.checkHit(f0, f1);
    if (f1.state !== 'death') this.checkHit(f1, f0);

    // Trigger death
    if (f0.hp <= 0 && f0.state !== 'death') this.setState(f0, 'death');
    if (f1.hp <= 0 && f1.state !== 'death') this.setState(f1, 'death');

    if (f0.state === 'death' && this.deathDone(f0)) { this.endRound(1); return; }
    if (f1.state === 'death' && this.deathDone(f1)) { this.endRound(0); return; }

    this.updateParticles(dt);
    this.updatePopTexts(dt);
    this.shake *= 0.80;

    this.emitState();
  }

  private deathDone(f: Fighter): boolean {
    const sp = this.sprites['death'];
    if (!sp) return f.animTime > 1400;
    return f.animTime >= (sp.frameCount / ANIM_FPS.death) * 1000 + 300;
  }

  // ── Fighter update ────────────────────────────────────────────────────────

  private updateFighter(f: Fighter, inp: InputState, prev: InputState, dt: number) {
    const dtF = dt / 16.667;
    const dtS = dt / 1000;

    if (f.state === 'death') { f.animTime += dt; return; }

    // Hitstun countdown
    if (f.hitstun > 0) {
      f.hitstun -= dt;
      if (f.hitstun <= 0) {
        f.hitstun = 0;
        if (f.state === 'hit') this.setState(f, f.onGround ? 'idle' : 'fall');
      }
    }

    // Attack states — consume timer, minimal movement
    if (f.state === 'light' || f.state === 'heavy' || f.state === 'special') {
      f.animTime += dt;
      const dur = f.state === 'light' ? T_LIGHT : f.state === 'heavy' ? T_HEAVY : T_SPECIAL;
      if (f.animTime >= dur) {
        f.hitThisSwing = false;
        this.setState(f, f.onGround ? 'idle' : 'fall');
      }
      if (!f.onGround) {
        if (inp.left) f.vx = Math.max(-AIR_SPEED, f.vx - 0.45);
        if (inp.right) f.vx = Math.min(AIR_SPEED, f.vx + 0.45);
      }
      this.applyPhysics(f, dtF);
      return;
    }

    // Hit knockback state
    if (f.state === 'hit') {
      f.animTime += dt;
      this.applyPhysics(f, dtF);
      return;
    }

    // Block
    if (f.state === 'block') {
      f.animTime += dt;
      f.staminaRegenDelay = 600;
      if (!inp.block || f.stamina <= 3) this.setState(f, 'idle');
      else f.stamina = Math.max(0, f.stamina - 14 * dtS);
      return;
    }

    // Airborne
    if (!f.onGround) {
      f.animTime += dt;
      if (f.vy <= 0 && f.state !== 'jump') this.setState(f, 'jump');
      if (f.vy > 1 && f.state !== 'fall') this.setState(f, 'fall');

      if (inp.left) f.vx = Math.max(-AIR_SPEED, f.vx - 0.6);
      else if (inp.right) f.vx = Math.min(AIR_SPEED, f.vx + 0.6);
      else f.vx *= 0.97;

      // Air attacks
      if (inp.light && !prev.light) this.setState(f, 'light');
      else if (inp.heavy && !prev.heavy) this.setState(f, 'heavy');
      else if (inp.special && !prev.special && f.special >= 100) {
        this.setState(f, 'special'); f.special = 0;
      }
      // Double jump
      if (inp.up && !prev.up && f.jumpCount < 2) {
        f.vy = JUMP_VY * 0.82; f.jumpCount++;
        this.setState(f, 'jump');
        this.sparks(f.x, f.y - 20, 6, 180, 220, 255);
      }
      this.applyPhysics(f, dtF);
      return;
    }

    // ── Grounded ──────────────────────────────────────────────────────────
    f.animTime += dt;

    // Stamina regen
    if (f.staminaRegenDelay > 0) f.staminaRegenDelay -= dt;
    else f.stamina = Math.min(f.maxStamina, f.stamina + 20 * dtS);

    // Input priority: special > heavy > light > block > jump > move
    if (inp.special && !prev.special && f.special >= 100) {
      this.setState(f, 'special'); f.special = 0;
      this.burst(f.x, f.y - 100);
    } else if (inp.heavy && !prev.heavy) {
      this.setState(f, 'heavy');
    } else if (inp.light && !prev.light) {
      this.setState(f, 'light');
    } else if (inp.block && f.stamina > 3) {
      this.setState(f, 'block');
      f.stamina = Math.max(0, f.stamina - 14 * dtS);
    } else if (inp.up && !prev.up) {
      f.vy = JUMP_VY; f.onGround = false; f.jumpCount = 1;
      this.setState(f, 'jump');
    } else if (inp.left) {
      f.vx = -MOVE_SPEED;
      if (f.state !== 'walk') this.setState(f, 'walk');
    } else if (inp.right) {
      f.vx = MOVE_SPEED;
      if (f.state !== 'walk') this.setState(f, 'walk');
    } else {
      f.vx *= 0.70;
      if (Math.abs(f.vx) < 0.4) f.vx = 0;
      if (f.state === 'walk') this.setState(f, 'idle');
    }

    this.applyPhysics(f, dtF);
  }

  private applyPhysics(f: Fighter, dtF: number) {
    if (!f.onGround) f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * dtF);
    f.x += f.vx * dtF;
    f.y += f.vy * dtF;

    if (f.y >= GROUND_Y) {
      f.y = GROUND_Y; f.vy = 0; f.onGround = true; f.jumpCount = 0;
      if (f.state === 'fall' || (f.state === 'jump' && f.vy >= 0)) this.setState(f, 'idle');
    }
    f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, f.x));
  }

  private setState(f: Fighter, s: FighterState) {
    if (f.state === s) return;
    f.state = s; f.animTime = 0;
    if (s === 'light' || s === 'heavy' || s === 'special') f.hitThisSwing = false;
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  private attackBox(f: Fighter) {
    if (f.state !== 'light' && f.state !== 'heavy' && f.state !== 'special') return null;
    const dur = f.state === 'light' ? T_LIGHT : f.state === 'heavy' ? T_HEAVY : T_SPECIAL;
    const frac = Math.min(1, f.animTime / dur);
    const win = f.state === 'light' ? LIGHT_WIN : f.state === 'heavy' ? HEAVY_WIN : SPECIAL_WIN;
    if (frac < win[0] || frac > win[1]) return null;
    const range = f.state === 'light' ? 118 : f.state === 'heavy' ? 148 : 190;
    const h = f.state === 'light' ? 90 : f.state === 'heavy' ? 112 : 135;
    const x = f.facingRight ? f.x + 12 : f.x - 12 - range;
    return { x, y: f.y - 130, w: range, h };
  }

  private bodyBox(f: Fighter) {
    return { x: f.x - 38, y: f.y - 140, w: 76, h: 140 };
  }

  private overlaps(a: {x:number;y:number;w:number;h:number}, b: {x:number;y:number;w:number;h:number}) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  private checkHit(atk: Fighter, def: Fighter) {
    if (atk.hitThisSwing || def.state === 'death') return;
    const ab = this.attackBox(atk); if (!ab) return;
    const db = this.bodyBox(def); if (!this.overlaps(ab, db)) return;

    atk.hitThisSwing = true;

    const frontBlock = def.state === 'block' && def.stamina > 3 &&
      ((def.facingRight && atk.x < def.x) || (!def.facingRight && atk.x > def.x));

    const rawDmg = DMG[atk.state] ?? 7;
    const dmg = frontBlock ? Math.max(1, Math.ceil(rawDmg * BLOCK_MULT)) : rawDmg;

    def.hp = Math.max(0, def.hp - dmg);
    atk.special = Math.min(100, atk.special + rawDmg * 0.55);
    def.special = Math.min(100, def.special + rawDmg * 0.28);

    const cx = (atk.x + def.x) / 2;
    const cy = def.y - 90;

    if (frontBlock) {
      def.stamina = Math.max(0, def.stamina - rawDmg * 1.1);
      this.sparks(cx, cy, 8, 100, 160, 255);
      this.pop(def.x, def.y - 152, 'BLOCK!', '#88BBFF');
      this.playSound('block');
    } else {
      const isSpecial = atk.state === 'special';
      const isHeavy   = atk.state === 'heavy';
      this.sparks(cx, cy, isSpecial ? 22 : isHeavy ? 14 : 9,
        255, isHeavy ? 80 : 160, 0);
      this.pop(def.x, def.y - 148,
        isSpecial ? `★SPECIAL!! -${dmg}` : `-${dmg}`,
        isSpecial ? '#FF4400' : isHeavy ? '#FF2222' : '#FFBB00');
      this.shake = isSpecial ? 13 : isHeavy ? 7 : 4;
      this.playSound(isSpecial ? 'special' : isHeavy ? 'heavy' : 'light');

      if (def.hp > 0) {
        def.hitstun = isSpecial ? 680 : isHeavy ? 430 : 270;
        this.setState(def, 'hit');
        const kbDir = def.x > atk.x ? 1 : -1;
        def.vx = kbDir * (isHeavy ? 7.5 : isSpecial ? 5.5 : 3.5);
        if (isSpecial) { def.vy = -11; def.onGround = false; }
        if (isSpecial) this.burst(def.x, def.y - 80);
      } else {
        this.setState(def, 'death');
        this.shake = 18;
        this.burst(def.x, def.y - 70);
      }
    }

    this.emit('hit', { attacker: atk.id, defender: def.id, damage: dmg, blocked: frontBlock });
  }

  // ── Particles & effects ───────────────────────────────────────────────────

  private sparks(x: number, y: number, n: number, r: number, g: number, b: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: 280 + Math.random() * 320,
        r, g, b, size: 2 + Math.random() * 3.5,
      });
    }
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const sp = 3.5 + Math.random() * 7;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 480 + Math.random() * 520,
        r: 255, g: 80 + Math.random() * 90, b: 0,
        size: 3 + Math.random() * 5,
      });
    }
  }

  private pop(x: number, y: number, text: string, color: string) {
    this.popTexts.push({ x, y, text, color, life: 980, vy: -1.3 });
  }

  private updateParticles(dt: number) {
    const dtF = dt / 16.667;
    this.particles = this.particles.filter(p => {
      p.life -= dt; p.x += p.vx * dtF; p.y += p.vy * dtF;
      p.vy += 0.20 * dtF; p.vx *= 0.94;
      return p.life > 0;
    });
  }

  private updatePopTexts(dt: number) {
    const dtF = dt / 16.667;
    this.popTexts = this.popTexts.filter(t => {
      t.life -= dt; t.y += t.vy * dtF;
      return t.life > 0;
    });
  }

  // ── Procedural sound ──────────────────────────────────────────────────────

  private getAudio(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { return null; }
    }
    return this.audioCtx;
  }

  private playSound(type: 'light' | 'heavy' | 'special' | 'block') {
    const ctx = this.getAudio(); if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);

      if (type === 'light') {
        o.type = 'square';
        o.frequency.setValueAtTime(320, now);
        o.frequency.exponentialRampToValueAtTime(75, now + 0.12);
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        o.start(now); o.stop(now + 0.14);
      } else if (type === 'heavy') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(190, now);
        o.frequency.exponentialRampToValueAtTime(38, now + 0.24);
        g.gain.setValueAtTime(0.32, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        o.start(now); o.stop(now + 0.26);
      } else if (type === 'special') {
        // Two-tone hit
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, now);
        o.frequency.exponentialRampToValueAtTime(45, now + 0.38);
        g.gain.setValueAtTime(0.38, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
        o2.type = 'square';
        o2.frequency.setValueAtTime(260, now);
        o2.frequency.exponentialRampToValueAtTime(85, now + 0.35);
        g2.gain.setValueAtTime(0.28, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        o.start(now); o.stop(now + 0.40);
        o2.start(now); o2.stop(now + 0.38);
      } else {
        o.type = 'triangle';
        o.frequency.setValueAtTime(620, now);
        o.frequency.exponentialRampToValueAtTime(400, now + 0.10);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
      }
    } catch {}
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private draw() {
    if (!this.ready) {
      const ctx = this.ctx;
      ctx.fillStyle = '#06000f';
      ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = '#44ff88';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading...', CW / 2, CH / 2);
      return;
    }

    const sx = this.shake > 0.5 ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const sy = this.shake > 0.5 ? (Math.random() - 0.5) * this.shake * 2 : 0;

    this.ctx.save();
    this.ctx.translate(sx, sy);
    this.drawBg();
    this.drawParticles();
    this.drawFighters();
    this.drawPopTexts();
    this.ctx.restore();
  }

  private drawBg() {
    const ctx = this.ctx;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, CH);
    sky.addColorStop(0, '#050010');
    sky.addColorStop(0.55, '#0d001e');
    sky.addColorStop(1, '#180032');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, CH);

    // Central glow
    ctx.save(); ctx.globalAlpha = 0.10;
    const cg = ctx.createRadialGradient(CW/2, CH*0.38, 30, CW/2, CH*0.38, 280);
    cg.addColorStop(0, '#aa00ff'); cg.addColorStop(1, 'transparent');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, CW, CH);
    ctx.restore();

    // Pagoda silhouettes
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#04000c';
    const towers: [number, number, number, number][] = [
      [60, 195, 28, 165], [110, 175, 22, 185],
      [670, 185, 25, 175], [720, 160, 22, 200],
      [340, 168, 16, 192], [460, 155, 16, 205],
    ];
    for (const [tx, ty, tw, th] of towers) {
      ctx.fillRect(tx, ty, tw, th);
      ctx.beginPath();
      ctx.moveTo(tx - 16, ty); ctx.lineTo(tx + tw/2, ty - 28); ctx.lineTo(tx + tw + 16, ty);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - 8, ty - 12); ctx.lineTo(tx + tw/2, ty - 40); ctx.lineTo(tx + tw + 8, ty - 12);
      ctx.fill();
    }
    ctx.restore();

    // Stars
    ctx.save(); ctx.globalAlpha = 0.5;
    for (let i = 0; i < 40; i++) {
      const sx2 = ((i * 97 + 31) % CW);
      const sy2 = ((i * 61 + 17) % (GROUND_Y - 60));
      const br = 0.4 + (Math.sin(Date.now() / 800 + i) * 0.5 + 0.5) * 0.6;
      ctx.globalAlpha = br * 0.5;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx2, sy2, 1.5, 1.5);
    }
    ctx.restore();

    // Ground
    const gd = ctx.createLinearGradient(0, GROUND_Y, 0, CH);
    gd.addColorStop(0, '#1e0040'); gd.addColorStop(1, '#0a001e');
    ctx.fillStyle = gd; ctx.fillRect(0, GROUND_Y, CW, CH - GROUND_Y);

    // Neon ground line
    ctx.save();
    ctx.shadowColor = '#9933ff'; ctx.shadowBlur = 28;
    ctx.strokeStyle = '#cc44ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CW, GROUND_Y); ctx.stroke();
    ctx.restore();

    // Grid (perspective)
    ctx.save(); ctx.globalAlpha = 0.11; ctx.strokeStyle = '#8822cc'; ctx.lineWidth = 1;
    for (let i = 0; i <= 14; i++) {
      const gx = (i / 14) * CW;
      ctx.beginPath(); ctx.moveTo(gx, GROUND_Y);
      ctx.lineTo(CW/2 + (gx - CW/2) * 0.22, CH + 40); ctx.stroke();
    }
    for (let j = 1; j <= 5; j++) {
      const gy = GROUND_Y + (j / 5) * (CH - GROUND_Y);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CW, gy); ctx.stroke();
    }
    ctx.restore();

    // Stage edge indicators
    ctx.save();
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(STAGE_LEFT, GROUND_Y); ctx.lineTo(STAGE_LEFT, GROUND_Y + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(STAGE_RIGHT, GROUND_Y); ctx.lineTo(STAGE_RIGHT, GROUND_Y + 30); ctx.stroke();
    ctx.restore();
  }

  private drawFighters() {
    this.drawFighter(this.fighters[0], false);
    this.drawFighter(this.fighters[1], true);
  }

  private drawFighter(f: Fighter, isP2: boolean) {
    const ctx = this.ctx;
    const spName = ANIM_SPRITE[f.state];
    const sp = this.sprites[spName] || this.sprites['idle'];
    if (!sp) return;

    // Frame
    let frame: number;
    if (f.state === 'light' || f.state === 'heavy' || f.state === 'special') {
      const dur = f.state === 'light' ? T_LIGHT : f.state === 'heavy' ? T_HEAVY : T_SPECIAL;
      frame = Math.min(sp.frameCount - 1, Math.floor((f.animTime / dur) * sp.frameCount));
    } else if (f.state === 'death') {
      const maxMs = (sp.frameCount / ANIM_FPS.death) * 1000;
      frame = Math.min(sp.frameCount - 1, Math.floor((f.animTime / maxMs) * sp.frameCount));
    } else {
      frame = Math.floor((f.animTime / 1000) * ANIM_FPS[f.state]) % sp.frameCount;
    }

    const dw = sp.fw * SPRITE_SCALE;
    const dh = sp.fh * SPRITE_SCALE;
    const drawX = f.x - dw / 2;
    const drawY = f.y - dh;
    const sx = frame * sp.fw;

    // Shadow
    ctx.save();
    ctx.globalAlpha = f.onGround ? 0.38 : 0.18;
    ctx.fillStyle = '#000';
    const shadowW = f.onGround ? 38 : 28;
    ctx.beginPath(); ctx.ellipse(f.x, GROUND_Y + 5, shadowW, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Sprite
    ctx.save();

    let filter = '';
    if (isP2) filter = 'hue-rotate(180deg) saturate(1.4) ';
    if (f.state === 'hit' && f.hitstun > 0) filter += 'brightness(3) saturate(0.1)';
    ctx.filter = filter || 'none';

    if (!f.facingRight) {
      ctx.translate(drawX + dw, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sp.img, sx, 0, sp.fw, sp.fh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(sp.img, sx, 0, sp.fw, sp.fh, drawX, drawY, dw, dh);
    }
    ctx.restore();

    // Special meter glow aura
    if (f.special >= 100) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 180) * 0.12;
      ctx.shadowColor = isP2 ? '#4488ff' : '#ff6600';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = isP2 ? '#4488ff' : '#ff8800';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - dh/2, dw/2 + 8, dh/2 + 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Player indicator dot
    ctx.save();
    const dotColor = isP2 ? '#4499ff' : '#44ff88';
    ctx.fillStyle = dotColor;
    ctx.shadowColor = dotColor; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(f.x, drawY - 14, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / 600));
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.shadowColor = `rgb(${p.r},${p.g},${p.b})`;
      ctx.shadowBlur = 7;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.5 + a * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPopTexts() {
    const ctx = this.ctx;
    ctx.save(); ctx.textAlign = 'center';
    for (const t of this.popTexts) {
      const a = Math.min(1, t.life / 350);
      ctx.globalAlpha = a;
      ctx.shadowBlur = 14; ctx.shadowColor = t.color; ctx.fillStyle = t.color;
      const size = t.text.includes('SPECIAL') ? 20 : t.text.includes('BLOCK') ? 16 : 15;
      ctx.font = `bold ${size}px "Courier New", monospace`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
