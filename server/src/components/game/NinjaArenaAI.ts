// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA AI — Three difficulty levels with distinct behavior patterns
// Easy: slow/predictable   Medium: balanced   Hard: fast/combo/reads player
// ═══════════════════════════════════════════════════════════════════════════════

import type { InputState, PublicGameState } from './NinjaArenaEngine';
import { emptyInput } from './NinjaArenaEngine';

export type AIDifficulty = 1 | 2 | 3;

interface AICfg {
  reactionMs: number;    // ms before AI reacts to new info
  attackChance: number;  // chance to initiate attack when close (per decision)
  blockChance: number;   // chance to block incoming attack
  jumpChance: number;    // chance to jump when in close range
  retreatHp: number;     // HP threshold for retreat behavior
  comboHeavy: number;    // chance to follow light with heavy
  useSpecial: number;    // chance to use special when meter is full
  aggroRange: number;    // pixel range where AI wants to fight
  approachSpeed: number; // multiplier on approach eagerness
}

const CONFIGS: Record<AIDifficulty, AICfg> = {
  1: { // Easy — sluggish, simple patterns
    reactionMs: 440,
    attackChance: 0.35,
    blockChance: 0.15,
    jumpChance: 0.12,
    retreatHp: 18,
    comboHeavy: 0.08,
    useSpecial: 0.40,
    aggroRange: 140,
    approachSpeed: 0.8,
  },
  2: { // Medium — balanced, reads obvious patterns
    reactionMs: 200,
    attackChance: 0.55,
    blockChance: 0.42,
    jumpChance: 0.25,
    retreatHp: 32,
    comboHeavy: 0.35,
    useSpecial: 0.65,
    aggroRange: 160,
    approachSpeed: 1.0,
  },
  3: { // Hard — fast, combos, uses all moves
    reactionMs: 75,
    attackChance: 0.75,
    blockChance: 0.68,
    jumpChance: 0.40,
    retreatHp: 50,
    comboHeavy: 0.62,
    useSpecial: 0.88,
    aggroRange: 180,
    approachSpeed: 1.2,
  },
};

// ══════════════════════════════════════════════════════════════════════════════

export class NinjaArenaAI {
  private cfg: AICfg;
  private reactionTimer = 0;
  private decisionTimer = 0; // how often to re-evaluate strategy
  private decision: InputState = emptyInput();
  private jumpCooldown = 0;
  private blockDuration = 0;
  private retreating = false;
  private lastPlayerState = '';
  private consecutiveBlocks = 0;
  private attackCooldown = 0;

  constructor(difficulty: AIDifficulty = 2) {
    this.cfg = CONFIGS[difficulty];
  }

  /**
   * Compute next frame's input for the AI fighter.
   * Call this every game frame (60fps).
   */
  compute(
    aiIdx: 0 | 1,
    gs: PublicGameState,
  ): InputState {
    if (gs.phase !== 'fight') return emptyInput();

    const me = gs.fighters[aiIdx];
    const opp = gs.fighters[1 - aiIdx as 0 | 1];
    const dt = 16.667; // assume 60fps

    this.reactionTimer += dt;
    this.decisionTimer += dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.blockDuration = Math.max(0, this.blockDuration - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Only re-evaluate after reaction delay
    if (this.reactionTimer < this.cfg.reactionMs) {
      return { ...this.decision };
    }
    this.reactionTimer = 0;

    const dist = Math.abs(me.x - opp.x);
    const oppAttacking = opp.state === 'light' || opp.state === 'heavy' || opp.state === 'special';
    const facingOpp = me.x < opp.x;
    const closeRange = dist < this.cfg.aggroRange;
    const strikeRange = dist < 135;

    const inp = emptyInput();

    // ── Panic block when being attacked ───────────────────────────────────
    if (oppAttacking && strikeRange && me.stamina > 10 && this.blockDuration <= 0) {
      if (Math.random() < this.cfg.blockChance) {
        this.blockDuration = 280 + Math.random() * 180;
        this.decision = { ...emptyInput(), block: true };
        return { ...this.decision };
      }
    }

    // Continue blocking if in block duration
    if (this.blockDuration > 0) {
      this.decision = { ...emptyInput(), block: true };
      return { ...this.decision };
    }

    // ── Retreat when low HP ────────────────────────────────────────────────
    if (me.hp < this.cfg.retreatHp && closeRange) {
      this.retreating = true;
      inp.left  = facingOpp;    // move away from opponent
      inp.right = !facingOpp;
      // Jump to escape corner pressure
      if (me.onGround && Math.random() < 0.4) inp.up = true;
      this.decision = inp;
      return { ...this.decision };
    }
    this.retreating = false;

    // ── Approach if out of range ───────────────────────────────────────────
    if (!closeRange) {
      inp.left  = !facingOpp;
      inp.right = facingOpp;
      // Occasionally jump toward opponent
      if (me.onGround && dist < 300 && Math.random() < this.cfg.jumpChance * 0.4) {
        inp.up = true;
      }
      this.decision = inp;
      return { ...this.decision };
    }

    // ── In range — combat decisions ────────────────────────────────────────

    // Jump pressure or escape
    if (me.onGround && this.jumpCooldown <= 0 && Math.random() < this.cfg.jumpChance / 15) {
      inp.up = true;
      inp.left  = !facingOpp && Math.random() < 0.3;
      inp.right = facingOpp && Math.random() < 0.3;
      this.jumpCooldown = 900 + Math.random() * 600;
    }

    // Attack decision
    if (strikeRange && !inp.up && this.attackCooldown <= 0 && me.state === 'idle' || me.state === 'walk') {
      const r = Math.random();

      if (me.special >= 100 && r < this.cfg.useSpecial) {
        inp.special = true;
        this.attackCooldown = 800;
      } else if (r < this.cfg.attackChance * 0.45) {
        // Heavy attack
        if (Math.random() < this.cfg.comboHeavy) {
          inp.heavy = true;
        } else {
          inp.light = true;
        }
        this.attackCooldown = 350 + Math.random() * 200;
      } else if (r < this.cfg.attackChance) {
        inp.light = true;
        this.attackCooldown = 250 + Math.random() * 150;
      }
    }

    // Slight sidestep / footsies when not attacking
    if (!inp.light && !inp.heavy && !inp.special && !inp.up) {
      if (dist < 80) {
        // Too close — slight back-step
        inp.left  = facingOpp;
        inp.right = !facingOpp;
      } else if (dist > 110) {
        // Creep in
        inp.left  = !facingOpp;
        inp.right = facingOpp;
      }
    }

    this.decision = inp;
    return { ...this.decision };
  }
}
