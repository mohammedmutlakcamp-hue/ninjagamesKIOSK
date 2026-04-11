// ═══════════════════════════════════════════════
// XP & LEVELING SYSTEM
// ═══════════════════════════════════════════════
// XP Sources:
//   - Playing time: 10 XP per minute
//   - Spending coins: 1 XP per coin
//   - Headshots: 50 XP each
//   - Kills: 25 XP each
//   - Wins: 100 XP each
//   - Opening chests: 30 XP each
//   - Completing daily tasks: 75 XP each
//   - Ordering food: 20 XP per order

export interface LevelInfo {
  level: number;
  title: string;
  xpRequired: number;   // total XP needed to reach this level
  xpForNext: number;     // XP needed from this level to next
  chestDiscount: number; // percentage discount on chests
  coinRateBonus: number; // percentage bonus on coin earning
  color: string;
}

// Curve: each level needs progressively more XP
// Formula: xpRequired = 500 * level^1.8
const calcXPForLevel = (level: number): number => {
  if (level <= 1) return 0;
  return Math.floor(500 * Math.pow(level, 1.8));
};

export const LEVELS: LevelInfo[] = [
  { level: 1,  title: 'Newcomer',       xpRequired: 0,       xpForNext: 500,    chestDiscount: 0,  coinRateBonus: 0,  color: '#9CA3AF' },
  { level: 2,  title: 'Apprentice',     xpRequired: 500,     xpForNext: 1200,   chestDiscount: 0,  coinRateBonus: 0,  color: '#9CA3AF' },
  { level: 3,  title: 'Initiate',       xpRequired: 1700,    xpForNext: 2000,   chestDiscount: 5,  coinRateBonus: 0,  color: '#6EE7B7' },
  { level: 4,  title: 'Warrior',        xpRequired: 3700,    xpForNext: 3000,   chestDiscount: 5,  coinRateBonus: 5,  color: '#6EE7B7' },
  { level: 5,  title: 'Fighter',        xpRequired: 6700,    xpForNext: 4500,   chestDiscount: 10, coinRateBonus: 5,  color: '#3B82F6' },
  { level: 6,  title: 'Skilled',        xpRequired: 11200,   xpForNext: 6000,   chestDiscount: 10, coinRateBonus: 10, color: '#3B82F6' },
  { level: 7,  title: 'Veteran',        xpRequired: 17200,   xpForNext: 8000,   chestDiscount: 15, coinRateBonus: 10, color: '#A855F7' },
  { level: 8,  title: 'Elite',          xpRequired: 25200,   xpForNext: 10000,  chestDiscount: 15, coinRateBonus: 15, color: '#A855F7' },
  { level: 9,  title: 'Master',         xpRequired: 35200,   xpForNext: 15000,  chestDiscount: 20, coinRateBonus: 20, color: '#F59E0B' },
  { level: 10, title: 'Grandmaster',    xpRequired: 50200,   xpForNext: 20000,  chestDiscount: 25, coinRateBonus: 25, color: '#F59E0B' },
  { level: 11, title: 'Legend',         xpRequired: 70200,   xpForNext: 30000,  chestDiscount: 30, coinRateBonus: 30, color: '#FF4500' },
  { level: 12, title: 'Ninja God',      xpRequired: 100200,  xpForNext: 50000,  chestDiscount: 35, coinRateBonus: 35, color: '#FF4500' },
  { level: 13, title: 'Immortal',       xpRequired: 150200,  xpForNext: 999999, chestDiscount: 40, coinRateBonus: 40, color: '#FFD700' },
];

export function getLevelInfo(totalXP: number): LevelInfo & { currentXP: number; progress: number } {
  let level = LEVELS[0];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].xpRequired) {
      level = LEVELS[i];
      break;
    }
  }
  const currentXP = totalXP - level.xpRequired;
  const progress = Math.min(currentXP / level.xpForNext, 1);
  return { ...level, currentXP, progress };
}

export function calculateTotalXP(player: any): number {
  const stats = player.stats || {};
  let xp = 0;

  // Playtime: 10 XP per minute
  xp += (player.totalPlaytime || 0) * 10;

  // Coins spent: 1 XP per coin
  xp += Math.floor(player.totalCoinsSpent || 0);

  // Headshots: 50 XP
  xp += (stats.totalHeadshots || 0) * 50;

  // Kills: 25 XP
  xp += (stats.totalKills || 0) * 25;

  // Wins: 100 XP
  xp += (stats.totalWins || 0) * 100;

  // Chests opened: 30 XP
  xp += (stats.chestsOpened || 0) * 30;

  // Food orders: 20 XP
  xp += (stats.foodOrdered || 0) * 20;

  // Games played: 15 XP
  xp += (stats.gamesPlayed || 0) * 15;

  return xp;
}

// XP event values for display
export const XP_VALUES = {
  perMinutePlaying: 10,
  perCoinSpent: 1,
  perHeadshot: 50,
  perKill: 25,
  perWin: 100,
  perChestOpened: 30,
  perDailyTask: 75,
  perFoodOrder: 20,
  perGamePlayed: 15,
};
