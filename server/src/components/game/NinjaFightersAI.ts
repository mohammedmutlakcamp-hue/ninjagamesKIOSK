// NINJA FIGHTERS - KOF Style - Phase 1
// ═══════════════════════════════════════════════════════════════════════════════
// NINJA FIGHTERS AI — Three difficulty levels
// Easy: slow/predictable   Medium: balanced   Hard: fast/aggressive
// ═══════════════════════════════════════════════════════════════════════════════

import type { InputState, PublicGameState } from './NinjaFightersEngine';
import { emptyInput } from './NinjaFightersEngine';

export type AIDifficulty = 1 | 2 | 3;

interface AICfg {
  reactionMs: number;
  attackChance: number;
  blockChance: number;
  jumpChance: number;
  retreatHp: number;
  comboHeavy: number;
  useSpecial: number;
  aggroRange: number;
}

const CONFIGS: Record<AIDifficulty, AICfg> = {
  1: {
    reactionMs: 480,
    attackChance: 0.30,
    blockChance: 0.12,
    jumpChance: 0.10,
    retreatHp: 15,
    comboHeavy: 0.06,
    useSpecial: 0.35,
    aggroRange: 135,
  },
  2: {
    reactionMs: 210,
    attackChance: 0.55,
    blockChance: 0.40,
    jumpChance: 0.22,
    retreatHp: 30,
    comboHeavy: 0.32,
    useSpecial: 0.62,
    aggroRange: 158,
  },
  3: {
    reactionMs: 70,
    attackChance: 0.78,
    blockChance: 0.65,
    jumpChance: 0.38,
    retreatHp: 48,
    comboHeavy: 0.60,
    useSpecial: 0.88,
    aggroRange: 180,
  },
};

export class NinjaFightersAI {
  private cfg: AICfg;
  private reactionTimer = 0;
  private decision: InputState = emptyInput();
  private jumpCooldown = 0;
  private blockDuration = 0;
  private attackCooldown = 0;

  constructor(difficulty: AIDifficulty = 2) {
    this.cfg = CONFIGS[difficulty];
  }

  compute(aiIdx: 0 | 1, gs: PublicGameState): InputState {
    if (gs.phase !== 'fight') return emptyInput();

    const me = gs.fighters[aiIdx];
    const opp = gs.fighters[1 - aiIdx as 0 | 1];
    const dt = 16.667;

    this.reactionTimer += dt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.blockDuration = Math.max(0, this.blockDuration - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.reactionTimer < this.cfg.reactionMs) {
      return { ...this.decision };
    }
    this.reactionTimer = 0;

    const dist = Math.abs(me.x - opp.x);
    const oppAttacking = opp.state === 'light' || opp.state === 'heavy' || opp.state === 'special';
    const facingOpp = me.x < opp.x;
    const closeRange = dist < this.cfg.aggroRange;
    const strikeRange = dist < 130;

    const inp = emptyInput();

    // Block incoming attacks
    if (oppAttacking && strikeRange && me.stamina > 10 && this.blockDuration <= 0) {
      if (Math.random() < this.cfg.blockChance) {
        this.blockDuration = 300 + Math.random() * 200;
        this.decision = { ...emptyInput(), block: true };
        return { ...this.decision };
      }
    }

    if (this.blockDuration > 0) {
      this.decision = { ...emptyInput(), block: true };
      return { ...this.decision };
    }

    // Retreat when low HP
    if (me.hp < this.cfg.retreatHp && closeRange) {
      inp.left  = facingOpp;
      inp.right = !facingOpp;
      if (me.onGround && Math.random() < 0.35) inp.up = true;
      this.decision = inp;
      return { ...this.decision };
    }

    // Approach if out of range
    if (!closeRange) {
      inp.left  = !facingOpp;
      inp.right = facingOpp;
      if (me.onGround && dist < 300 && Math.random() < this.cfg.jumpChance * 0.35) {
        inp.up = true;
      }
      this.decision = inp;
      return { ...this.decision };
    }

    // Jump pressure
    if (me.onGround && this.jumpCooldown <= 0 && Math.random() < this.cfg.jumpChance / 14) {
      inp.up = true;
      inp.left  = !facingOpp && Math.random() < 0.3;
      inp.right = facingOpp && Math.random() < 0.3;
      this.jumpCooldown = 900 + Math.random() * 700;
    }

    // Attack decisions
    const canAttack = strikeRange && !inp.up && this.attackCooldown <= 0 &&
      (me.state === 'idle' || me.state === 'walk');
    if (canAttack) {
      const r = Math.random();
      if (me.special >= 100 && r < this.cfg.useSpecial) {
        inp.special = true;
        this.attackCooldown = 820;
      } else if (r < this.cfg.attackChance) {
        if (Math.random() < this.cfg.comboHeavy) {
          inp.heavy = true;
        } else {
          inp.light = true;
        }
        this.attackCooldown = 300 + Math.random() * 200;
      }
    }

    // Footsies movement
    if (!inp.light && !inp.heavy && !inp.special && !inp.up) {
      if (dist < 75) {
        inp.left  = facingOpp;
        inp.right = !facingOpp;
      } else if (dist > 115) {
        inp.left  = !facingOpp;
        inp.right = facingOpp;
      }
    }

    this.decision = inp;
    return { ...this.decision };
  }
}
