// NINJA FIGHTERS - KOF Style - Phase 1
// Future: More characters, special moves, combos, ranked mode, tournaments

// ═══════════════════════════════════════════════════════════════════════════════
// NINJA FIGHTERS ENGINE — KOF-inspired canvas fighting game
// Canvas: 800×450, Ground: y=355, KOF-style HUD drawn on canvas
// Differences from NinjaArena: canvas HUD, trailing HP bars, sunset stage, best-of-1
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
  name: string;
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
  life: number; maxLife: number;
  r: number; g: number; b: number;
  size: number;
}

interface PopText {
  x: number; y: number;
  text: string;
  color: string;
  life: number; maxLife: number;
  vy: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CW = 800, CH = 450;
const GROUND_Y = 355;
const STAGE_LEFT = 60;
const STAGE_RIGHT = 740;
const GRAVITY = 1.0;
const JUMP_VY = -17.5;
const MOVE_SPEED = 4.6;
const AIR_SPEED = 4.0;
const MAX_FALL = 25;
const SPRITE_SCALE = 1.5;

const T_LIGHT   = 480;
const T_HEAVY   = 740;
const T_SPECIAL = 960;

const LIGHT_WIN   = [0.20, 0.55] as const;
const HEAVY_WIN   = [0.30, 0.70] as const;
const SPECIAL_WIN = [0.08, 0.88] as const;

const DMG: Record<string, number> = { light: 8, heavy: 18, special: 30 };
const BLOCK_MULT = 0.25;

const ANIM_FPS: Record<FighterState, number> = {
  idle: 8,  walk: 12, jump: 8,  fall: 8,
  light: 22, heavy: 18, special: 20,
  block: 10, hit: 18,  death: 8,
};

const ANIM_SPRITE: Record<FighterState, string> = {
  idle: 'idle',   walk: 'walk',   jump: 'idle',  fall: 'idle',
  light: 'attack', heavy: 'attack', special: 'attack',
  block: 'hit',   hit: 'hit',     death: 'death',
};

// HUD layout constants
const HUD_H = 56;
const BAR_X1 = 18, BAR_X2 = CW - 18;
const BAR_W = 330, BAR_H = 22;
const TIMER_W = 64;

// ══════════════════════════════════════════════════════════════════════════════

export class NinjaFightersEngine {
  private ctx: CanvasRenderingContext2D;
  private sprites: Record<string, Sprite> = {};
  private ready = false;

  private fighters!: [Fighter, Fighter];
  private particles: Particle[] = [];
  private popTexts: PopText[] = [];

  private phase: GamePhase = 'countdown';
  private round = 1;
  private maxRounds = 1;
  private wins: [number, number] = [0, 0];
  private timer = 99;
  private countdown = 3;
  private phaseTimer = 0;
  private roundWinner: -1 | 0 | 1 = -1;
  private gameWinner: -1 | 0 | 1 = -1;

  // KOF-style HP bar animation
  private displayHp: [number, number] = [100, 100];
  private trailHp: [number, number] = [100, 100];

  // Background animation
  private bgTime = 0;
  private stars: Array<{x: number; y: number; r: number; phase: number}> = [];

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
    this.initStars();
  }

  private initStars() {
    for (let i = 0; i < 55; i++) {
      this.stars.push({
        x: Math.random() * CW,
        y: Math.random() * (GROUND_Y - HUD_H - 20) + HUD_H + 10,
        r: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
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
            const oc = document.createElement('canvas');
            oc.width = 128; oc.height = 128;
            const oc2 = oc.getContext('2d')!;
            oc2.fillStyle = k === 'death' ? '#FF4422' : '#FFD700';
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
      name: f.name,
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
    this.displayHp = [100, 100];
    this.trailHp = [100, 100];
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
    if (this.wins[0] >= need || this.wins[1] >= need || this.round >= this.maxRounds) {
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
    this.bgTime += dt;
    this.update(dt);
    this.draw();
    this.animId = requestAnimationFrame(this.loop);
  };

  private lerpTo(current: number, target: number, speed: number, dt: number): number {
    const diff = target - current;
    if (Math.abs(diff) < 0.05) return target;
    return current + diff * Math.min(1, speed * dt / 1000);
  }

  private update(dt: number) {
    this.phaseTimer += dt;

    // Animate HP bars
    if (this.fighters) {
      for (let i = 0; i < 2; i++) {
        const hp = this.fighters[i as 0|1].hp;
        this.displayHp[i as 0|1] = this.lerpTo(this.displayHp[i as 0|1], hp, 9, dt);
        this.trailHp[i as 0|1]   = this.lerpTo(this.trailHp[i as 0|1], hp, 2.5, dt);
      }
    }

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
      if (this.phaseTimer > 3000) this.nextRound();
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

    // Push apart on body overlap
    this.resolvePush(f0, f1);

    if (f0.state !== 'death') this.checkHit(f0, f1);
    if (f1.state !== 'death') this.checkHit(f1, f0);

    if (f0.hp <= 0 && f0.state !== 'death') this.setState(f0, 'death');
    if (f1.hp <= 0 && f1.state !== 'death') this.setState(f1, 'death');

    if (f0.state === 'death' && this.deathDone(f0)) { this.endRound(1); return; }
    if (f1.state === 'death' && this.deathDone(f1)) { this.endRound(0); return; }

    this.updateParticles(dt);
    this.updatePopTexts(dt);
    this.shake *= 0.80;

    this.emitState();
  }

  private resolvePush(a: Fighter, b: Fighter) {
    if (a.state === 'death' || b.state === 'death') return;
    const aw = 42, bw = 42;
    const overlap = (aw + bw) / 2 - Math.abs(a.x - b.x);
    if (overlap > 0) {
      const push = overlap / 2;
      if (a.x < b.x) { a.x -= push; b.x += push; }
      else { a.x += push; b.x -= push; }
      a.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, a.x));
      b.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, b.x));
    }
  }

  private deathDone(f: Fighter): boolean {
    const sp = this.sprites['death'];
    if (!sp) return f.animTime > 1400;
    return f.animTime >= (sp.frameCount / ANIM_FPS.death) * 1000 + 400;
  }

  // ── Fighter update ────────────────────────────────────────────────────────

  private updateFighter(f: Fighter, inp: InputState, prev: InputState, dt: number) {
    const dtF = dt / 16.667;
    const dtS = dt / 1000;

    if (f.state === 'death') { f.animTime += dt; return; }

    if (f.hitstun > 0) {
      f.hitstun -= dt;
      if (f.hitstun <= 0) {
        f.hitstun = 0;
        if (f.state === 'hit') this.setState(f, f.onGround ? 'idle' : 'fall');
      }
    }

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

    if (f.state === 'hit') {
      f.animTime += dt;
      this.applyPhysics(f, dtF);
      return;
    }

    if (f.state === 'block') {
      f.animTime += dt;
      f.staminaRegenDelay = 600;
      if (!inp.block || f.stamina <= 3) this.setState(f, 'idle');
      else f.stamina = Math.max(0, f.stamina - 14 * dtS);
      return;
    }

    if (!f.onGround) {
      f.animTime += dt;
      if (f.vy <= 0 && f.state !== 'jump') this.setState(f, 'jump');
      if (f.vy > 1 && f.state !== 'fall') this.setState(f, 'fall');

      if (inp.left) f.vx = Math.max(-AIR_SPEED, f.vx - 0.6);
      else if (inp.right) f.vx = Math.min(AIR_SPEED, f.vx + 0.6);
      else f.vx *= 0.97;

      if (inp.light && !prev.light) this.setState(f, 'light');
      else if (inp.heavy && !prev.heavy) this.setState(f, 'heavy');
      else if (inp.special && !prev.special && f.special >= 100) {
        this.setState(f, 'special'); f.special = 0;
      }
      if (inp.up && !prev.up && f.jumpCount < 2) {
        f.vy = JUMP_VY * 0.82; f.jumpCount++;
        this.setState(f, 'jump');
        this.sparks(f.x, f.y - 20, 6, 180, 220, 255);
      }
      this.applyPhysics(f, dtF);
      return;
    }

    f.animTime += dt;

    if (f.staminaRegenDelay > 0) f.staminaRegenDelay -= dt;
    else f.stamina = Math.min(f.maxStamina, f.stamina + 20 * dtS);

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
    const range = f.state === 'light' ? 115 : f.state === 'heavy' ? 145 : 188;
    const h = f.state === 'light' ? 88 : f.state === 'heavy' ? 110 : 132;
    const x = f.facingRight ? f.x + 10 : f.x - 10 - range;
    return { x, y: f.y - 128, w: range, h };
  }

  private bodyBox(f: Fighter) {
    return { x: f.x - 38, y: f.y - 138, w: 76, h: 138 };
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

    const rawDmg = DMG[atk.state] ?? 8;
    const dmg = frontBlock ? Math.max(1, Math.ceil(rawDmg * BLOCK_MULT)) : rawDmg;

    def.hp = Math.max(0, def.hp - dmg);
    atk.special = Math.min(100, atk.special + rawDmg * 0.55);
    def.special = Math.min(100, def.special + rawDmg * 0.28);

    const cx = (atk.x + def.x) / 2;
    const cy = def.y - 90;

    if (frontBlock) {
      def.stamina = Math.max(0, def.stamina - rawDmg * 1.1);
      this.sparks(cx, cy, 8, 80, 140, 255);
      this.pop(def.x, def.y - 150, 'BLOCK!', '#88CCFF');
      this.playSound('block');
    } else {
      const isSpecial = atk.state === 'special';
      const isHeavy   = atk.state === 'heavy';
      this.sparks(cx, cy, isSpecial ? 24 : isHeavy ? 14 : 9,
        255, isHeavy ? 80 : 160, 0);
      this.pop(def.x, def.y - 148,
        isSpecial ? `★SPECIAL!! -${dmg}` : `-${dmg}`,
        isSpecial ? '#FF4400' : isHeavy ? '#FF2222' : '#FFBB00');
      this.shake = isSpecial ? 14 : isHeavy ? 8 : 4;
      this.playSound(isSpecial ? 'special' : isHeavy ? 'heavy' : 'light');

      if (def.hp > 0) {
        def.hitstun = isSpecial ? 700 : isHeavy ? 450 : 280;
        this.setState(def, 'hit');
        const kbDir = def.x > atk.x ? 1 : -1;
        def.vx = kbDir * (isHeavy ? 7.5 : isSpecial ? 5.5 : 3.5);
        if (isSpecial) { def.vy = -11; def.onGround = false; }
        if (isSpecial) this.burst(def.x, def.y - 80);
      } else {
        this.setState(def, 'death');
        this.shake = 18;
        this.burst(def.x, def.y - 70);
        this.playSound('ko');
      }
    }

    this.emit('hit', { attacker: atk.id, defender: def.id, damage: dmg, blocked: frontBlock });
  }

  // ── Particles ─────────────────────────────────────────────────────────────

  private sparks(x: number, y: number, n: number, r: number, g: number, b: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: 280 + Math.random() * 320, maxLife: 600,
        r, g, b, size: 2 + Math.random() * 3.5,
      });
    }
  }

  private burst(x: number, y: number) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const sp = 3.5 + Math.random() * 8;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 500 + Math.random() * 500, maxLife: 1000,
        r: 255, g: 80 + Math.random() * 100, b: 0,
        size: 3 + Math.random() * 5,
      });
    }
  }

  private pop(x: number, y: number, text: string, color: string) {
    this.popTexts.push({ x, y, text, color, life: 1000, maxLife: 1000, vy: -1.2 });
  }

  private updateParticles(dt: number) {
    const dtF = dt / 16.667;
    this.particles = this.particles.filter(p => {
      p.life -= dt; p.x += p.vx * dtF; p.y += p.vy * dtF;
      p.vy += 0.18 * dtF; p.vx *= 0.94;
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
      try { this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
      catch { return null; }
    }
    return this.audioCtx;
  }

  private playSound(type: 'light' | 'heavy' | 'special' | 'block' | 'ko') {
    const ctx = this.getAudio(); if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);

      if (type === 'light') {
        o.type = 'square';
        o.frequency.setValueAtTime(340, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        g.gain.setValueAtTime(0.20, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        o.start(now); o.stop(now + 0.14);
      } else if (type === 'heavy') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.26);
        g.gain.setValueAtTime(0.30, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        o.start(now); o.stop(now + 0.28);
      } else if (type === 'special') {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(550, now);
        o.frequency.exponentialRampToValueAtTime(50, now + 0.40);
        g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        o2.type = 'square';
        o2.frequency.setValueAtTime(275, now);
        o2.frequency.exponentialRampToValueAtTime(90, now + 0.36);
        g2.gain.setValueAtTime(0.25, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        o.start(now); o.stop(now + 0.42);
        o2.start(now); o2.stop(now + 0.38);
      } else if (type === 'block') {
        o.type = 'triangle';
        o.frequency.setValueAtTime(640, now);
        o.frequency.exponentialRampToValueAtTime(420, now + 0.10);
        g.gain.setValueAtTime(0.16, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
      } else if (type === 'ko') {
        // KO sound — low thud + reverb-like
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(100, now);
        o.frequency.exponentialRampToValueAtTime(25, now + 0.5);
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        o.start(now); o.stop(now + 0.55);
      }
    } catch {}
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private draw() {
    if (!this.ready) {
      const ctx = this.ctx;
      ctx.fillStyle = '#06000f';
      ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 22px monospace';
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
    this.drawHUD();
    this.drawPhaseOverlay();
    this.ctx.restore();
  }

  private drawBg() {
    const ctx = this.ctx;
    const t = this.bgTime / 1000;

    // Sunset sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#1a0530');
    sky.addColorStop(0.3, '#3d0d6b');
    sky.addColorStop(0.65, '#8b1a4a');
    sky.addColorStop(1, '#c73d2e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CW, GROUND_Y);

    // Glowing sun/moon on horizon
    ctx.save();
    const sunX = CW / 2, sunY = GROUND_Y - 10;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 100);
    sunGrad.addColorStop(0, 'rgba(255,200,50,0.35)');
    sunGrad.addColorStop(0.3, 'rgba(255,100,20,0.15)');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, CW, GROUND_Y);
    ctx.restore();

    // Twinkling stars
    ctx.save();
    for (const star of this.stars) {
      const bright = 0.3 + (Math.sin(t * 1.5 + star.phase) * 0.5 + 0.5) * 0.7;
      ctx.globalAlpha = bright * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Distant city silhouette
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#1a0040';
    const buildings: [number, number, number, number][] = [
      [0, 250, 60, GROUND_Y], [55, 230, 50, GROUND_Y], [100, 240, 40, GROUND_Y],
      [135, 210, 55, GROUND_Y], [185, 235, 45, GROUND_Y],
      [620, 225, 50, GROUND_Y], [665, 210, 55, GROUND_Y], [715, 240, 45, GROUND_Y],
      [755, 230, 50, GROUND_Y], [790, 245, 20, GROUND_Y],
      [300, 220, 30, GROUND_Y], [325, 200, 25, GROUND_Y], [345, 215, 28, GROUND_Y],
      [440, 205, 30, GROUND_Y], [465, 195, 25, GROUND_Y], [485, 218, 30, GROUND_Y],
    ];
    for (const [bx, by, bw, bh] of buildings) {
      ctx.fillRect(bx, by, bw, bh - by);
      // Rooftop
      ctx.fillRect(bx - 4, by, bw + 8, 6);
    }
    // Neon building lights
    ctx.globalAlpha = 0.5;
    const winColors = ['#ff4488','#44ffff','#ffff44','#ff6600'];
    for (let i = 0; i < 60; i++) {
      const wx = 20 + (i * 73 % (CW - 40));
      const wy = 215 + (i * 37 % 60);
      const lit = Math.sin(t * 0.8 + i * 0.7) > 0.3;
      if (lit) {
        ctx.fillStyle = winColors[i % winColors.length];
        ctx.fillRect(wx, wy, 4, 4);
      }
    }
    ctx.restore();

    // Ground platform
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CH);
    groundGrad.addColorStop(0, '#2d0050');
    groundGrad.addColorStop(0.3, '#1a0030');
    groundGrad.addColorStop(1, '#0a0018');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_Y, CW, CH - GROUND_Y);

    // Neon ground line
    ctx.save();
    ctx.shadowColor = '#ff44aa';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#ff66cc';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CW, GROUND_Y); ctx.stroke();
    ctx.restore();

    // Ground grid perspective
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#cc3388';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const gx = (i / 16) * CW;
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y);
      ctx.lineTo(CW / 2 + (gx - CW / 2) * 0.2, CH + 40);
      ctx.stroke();
    }
    for (let j = 1; j <= 4; j++) {
      const gy = GROUND_Y + (j / 4) * (CH - GROUND_Y);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CW, gy); ctx.stroke();
    }
    ctx.restore();

    // Stage boundary markers
    ctx.save();
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(STAGE_LEFT, GROUND_Y); ctx.lineTo(STAGE_LEFT, GROUND_Y + 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(STAGE_RIGHT, GROUND_Y); ctx.lineTo(STAGE_RIGHT, GROUND_Y + 28); ctx.stroke();
    ctx.restore();
  }

  // ── KOF-style HUD drawn on canvas ────────────────────────────────────────

  private drawHUD() {
    const ctx = this.ctx;
    const f0 = this.fighters[0], f1 = this.fighters[1];

    // Semi-transparent HUD background
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CW, HUD_H + 10);
    ctx.restore();

    // ── Player 1 HP bar (left side, fills left→right) ──────────────────────
    const p1BarX = BAR_X1;
    const p1BarY = 14;

    // Player label
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#88ff99';
    ctx.textAlign = 'left';
    ctx.fillText(f0.name.toUpperCase().substring(0, 14), p1BarX, p1BarY - 2);
    ctx.restore();

    // HP bar background (black)
    ctx.fillStyle = '#111';
    ctx.fillRect(p1BarX, p1BarY, BAR_W, BAR_H);

    // Trailing red bar (trail)
    const p1Trail = (this.trailHp[0] / 100) * BAR_W;
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(p1BarX, p1BarY, p1Trail, BAR_H);

    // Green HP bar
    const p1Disp = (this.displayHp[0] / 100) * BAR_W;
    const p1Grad = ctx.createLinearGradient(p1BarX, 0, p1BarX + BAR_W, 0);
    p1Grad.addColorStop(0, '#00ee44');
    p1Grad.addColorStop(0.6, '#88ff00');
    p1Grad.addColorStop(1, '#ffee00');
    ctx.fillStyle = f0.hp < 25 ? '#ff4400' : p1Grad;
    ctx.fillRect(p1BarX, p1BarY, p1Disp, BAR_H);

    // HP bar border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p1BarX, p1BarY, BAR_W, BAR_H);

    // Special meter (P1)
    ctx.fillStyle = '#111';
    ctx.fillRect(p1BarX, p1BarY + BAR_H + 3, BAR_W, 5);
    const p1Sp = (f0.special / 100) * BAR_W;
    const spGrad1 = ctx.createLinearGradient(p1BarX, 0, p1BarX + BAR_W, 0);
    spGrad1.addColorStop(0, '#ff6600'); spGrad1.addColorStop(1, '#ffaa00');
    ctx.fillStyle = spGrad1;
    ctx.fillRect(p1BarX, p1BarY + BAR_H + 3, p1Sp, 5);
    if (f0.special >= 100) {
      ctx.save();
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1;
      ctx.strokeRect(p1BarX, p1BarY + BAR_H + 3, BAR_W, 5);
      ctx.restore();
    }

    // ── Player 2 HP bar (right side, fills right→left) ─────────────────────
    const p2BarX = CW - BAR_X2;
    const p2BarY = 14;
    const p2BarRight = CW - 18;

    // Player 2 label
    ctx.save();
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#88bbff';
    ctx.textAlign = 'right';
    ctx.fillText(f1.name.toUpperCase().substring(0, 14), p2BarRight, p2BarY - 2);
    ctx.restore();

    // HP bar background
    ctx.fillStyle = '#111';
    ctx.fillRect(p2BarRight - BAR_W, p2BarY, BAR_W, BAR_H);

    // Trailing red (right-aligned)
    const p2Trail = (this.trailHp[1] / 100) * BAR_W;
    ctx.fillStyle = '#cc2200';
    ctx.fillRect(p2BarRight - p2Trail, p2BarY, p2Trail, BAR_H);

    // Green HP bar (right-aligned)
    const p2Disp = (this.displayHp[1] / 100) * BAR_W;
    const p2Grad = ctx.createLinearGradient(p2BarRight - BAR_W, 0, p2BarRight, 0);
    p2Grad.addColorStop(0, '#ffee00');
    p2Grad.addColorStop(0.4, '#88ff00');
    p2Grad.addColorStop(1, '#00ee44');
    ctx.fillStyle = f1.hp < 25 ? '#ff4400' : p2Grad;
    ctx.fillRect(p2BarRight - p2Disp, p2BarY, p2Disp, BAR_H);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p2BarRight - BAR_W, p2BarY, BAR_W, BAR_H);

    // Special meter (P2, right-aligned)
    ctx.fillStyle = '#111';
    ctx.fillRect(p2BarRight - BAR_W, p2BarY + BAR_H + 3, BAR_W, 5);
    const p2Sp = (f1.special / 100) * BAR_W;
    const spGrad2 = ctx.createLinearGradient(p2BarRight - BAR_W, 0, p2BarRight, 0);
    spGrad2.addColorStop(0, '#ffaa00'); spGrad2.addColorStop(1, '#ff6600');
    ctx.fillStyle = spGrad2;
    ctx.fillRect(p2BarRight - p2Sp, p2BarY + BAR_H + 3, p2Sp, 5);
    if (f1.special >= 100) {
      ctx.save();
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1;
      ctx.strokeRect(p2BarRight - BAR_W, p2BarY + BAR_H + 3, BAR_W, 5);
      ctx.restore();
    }

    // ── Timer (center) ──────────────────────────────────────────────────────
    const timerX = CW / 2;
    const timerY = 10;

    ctx.save();
    // Timer box
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(timerX - TIMER_W / 2, timerY, TIMER_W, 36);
    ctx.strokeStyle = this.timer < 10 ? '#ff4400' : 'rgba(255,200,50,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(timerX - TIMER_W / 2, timerY, TIMER_W, 36);

    // Timer number
    ctx.font = `bold 28px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timerColor = this.timer < 10 ? '#ff4400'
      : this.timer < 30 ? '#ffaa00' : '#ffffff';
    ctx.fillStyle = timerColor;
    if (this.timer < 10) {
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 12;
    }
    ctx.fillText(Math.ceil(this.timer).toString(), timerX, timerY + 4);
    ctx.restore();

    // ── Win dots (round indicator) ──────────────────────────────────────────
    if (this.maxRounds > 1) {
      const dotY = HUD_H - 4;
      // P1 wins (left)
      for (let i = 0; i < Math.ceil(this.maxRounds / 2); i++) {
        ctx.beginPath();
        ctx.arc(p1BarX + 10 + i * 14, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = i < this.wins[0] ? '#44ff88' : '#333';
        ctx.fill();
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
        ctx.stroke();
      }
      // P2 wins (right)
      for (let i = 0; i < Math.ceil(this.maxRounds / 2); i++) {
        ctx.beginPath();
        ctx.arc(p2BarRight - 10 - i * 14, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = i < this.wins[1] ? '#88bbff' : '#333';
        ctx.fill();
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // ── Phase overlay text ────────────────────────────────────────────────────

  private drawPhaseOverlay() {
    const ctx = this.ctx;
    const cx = CW / 2, cy = CH / 2;

    if (this.phase === 'countdown') {
      const t = this.phaseTimer / 1000;
      const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.05;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.countdown > 0) {
        // Flash bg
        ctx.fillStyle = `rgba(0,0,0,${0.35 + Math.sin(t * Math.PI * 2) * 0.1})`;
        ctx.fillRect(cx - 90, cy - 60, 180, 110);

        const numSize = Math.round(88 * pulse);
        ctx.font = `bold ${numSize}px "Courier New", monospace`;
        ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(this.countdown.toString(), cx, cy);

        ctx.font = 'bold 16px monospace';
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('ROUND ' + this.round, cx, cy + 48);
      } else {
        // "FIGHT!"
        const elapsed = this.phaseTimer - 3000;
        const scale = 1 + Math.max(0, 0.4 - elapsed / 600) * 0.5;
        const alpha = Math.min(1, elapsed / 80) * Math.max(0, 1 - (elapsed - 300) / 300);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(72 * scale)}px "Courier New", monospace`;
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 40;
        ctx.fillStyle = '#ff6600';
        ctx.fillText('FIGHT!', cx, cy);
      }
      ctx.restore();
    }

    if (this.phase === 'roundOver' || this.phase === 'gameOver') {
      const elapsed = this.phaseTimer;
      const alpha = Math.min(1, elapsed / 200);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, cy - 80, CW, 120);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (this.roundWinner === -1) {
        ctx.font = 'bold 64px "Courier New", monospace';
        ctx.shadowColor = '#aaaaaa'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#cccccc';
        ctx.fillText('DRAW', cx, cy - 10);
      } else {
        // KO flash
        const koScale = 1 + Math.max(0, 0.6 - elapsed / 400) * 1.0;
        ctx.font = `bold ${Math.round(80 * koScale)}px "Courier New", monospace`;
        ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 50;
        ctx.fillStyle = '#ff3300';
        ctx.fillText('K.O.!', cx, cy - 14);
      }

      // Winner name
      if (elapsed > 400 && this.roundWinner !== -1) {
        const winner = this.fighters[this.roundWinner];
        ctx.font = 'bold 18px monospace';
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.roundWinner === 0 ? '#88ff99' : '#88bbff';
        ctx.fillText(`${winner.name} WINS!`, cx, cy + 44);
      }

      ctx.restore();
    }
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

    // Ground shadow
    ctx.save();
    ctx.globalAlpha = f.onGround ? 0.35 : 0.15;
    ctx.fillStyle = '#000';
    const shadowW = f.onGround ? 36 : 26;
    ctx.beginPath(); ctx.ellipse(f.x, GROUND_Y + 5, shadowW, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Sprite with color tinting
    ctx.save();

    let filter = '';
    if (isP2) filter = 'hue-rotate(200deg) saturate(1.5) brightness(1.05) ';
    if (f.state === 'hit' && f.hitstun > 0) filter += 'brightness(3.5) saturate(0.05)';
    ctx.filter = filter || 'none';

    if (!f.facingRight) {
      ctx.translate(drawX + dw, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sp.img, sx, 0, sp.fw, sp.fh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(sp.img, sx, 0, sp.fw, sp.fh, drawX, drawY, dw, dh);
    }
    ctx.restore();

    // Special meter aura
    if (f.special >= 100) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(this.bgTime / 200) * 0.12;
      ctx.shadowColor = isP2 ? '#4488ff' : '#ff6600';
      ctx.shadowBlur = 28;
      ctx.strokeStyle = isP2 ? '#66aaff' : '#ff8800';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y - dh / 2, dw / 2 + 8, dh / 2 + 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Player indicator dot
    ctx.save();
    const dotColor = isP2 ? '#4499ff' : '#44ff88';
    ctx.fillStyle = dotColor;
    ctx.shadowColor = dotColor; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(f.x, drawY - 12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.5)));
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
      ctx.shadowColor = `rgb(${p.r},${p.g},${p.b})`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.4 + a * 0.6)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPopTexts() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.popTexts) {
      const a = Math.min(1, t.life / (t.maxLife * 0.4));
      ctx.globalAlpha = a;
      ctx.shadowBlur = 12; ctx.shadowColor = t.color; ctx.fillStyle = t.color;
      const size = t.text.includes('SPECIAL') ? 19 : t.text.includes('BLOCK') ? 15 : 14;
      ctx.font = `bold ${size}px "Courier New", monospace`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
