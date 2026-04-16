#!/usr/bin/env node
/**
 * NinjaKiosk — Daily revenue / P&L Monte Carlo.
 *
 * Models a realistic day at the gaming center:
 *   - 30 customers/day
 *   - Each tops up 1–5 JOD (uniform random)
 *   - Converts their tokens into chest opens (mixed tiers)
 *   - We track REAL cash flow:
 *       + JOD revenue from top-ups
 *       − JOD cost of voucher drops (free food, drinks, snacks, 1h free play)
 *       − token rewards that loop back as "coins" are NOT counted as loss
 *         (they're virtual — player re-spends them inside the kiosk)
 *
 * Runs 1000 simulated days and reports the distribution: best/worst day,
 * median, standard deviation.
 *
 * Usage:  node scripts/monte-carlo-daily.js
 */

// ─── Customer behavior assumptions (can override via CLI args) ────
// Usage: node monte-carlo-daily.js --customers 50 --min 1 --max 7 --days 1000
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? parseFloat(args[i + 1]) : def;
}
const DAILY_CUSTOMERS  = arg('customers', 30);
const DAYS_TO_SIMULATE = arg('days', 1000);
const TOPUP_JOD_MIN    = arg('min', 1);
const TOPUP_JOD_MAX    = arg('max', 5);
// Promo: fraction off chest costs (0 = none, 0.25 = 25% off). Players open MORE when discounted.
const CHEST_DISCOUNT   = arg('discount', 0);
// VIP: how many of the daily customers are VIP. Each VIP costs extra due to:
//  - daily free-play gift (30 min = 0.50 JOD opportunity cost)
//  - 20% cafe discount on voucher redemption (we add 20% to their voucher cost)
const VIP_CUSTOMERS    = arg('vip', 0);

// Token (coin) exchange rates from constants.ts
// Player picks the best package that fits their budget.
const COIN_PACKAGES = [
  { jod: 1,    coins: 100  },
  { jod: 2.25, coins: 250  },
  { jod: 5,    coins: 575  },
];

// How customers split their chest opens (weighted average):
// 60% common, 30% rare, 8% legendary, 2% mythical
const CHEST_MIX = [
  { tier: 'common',    weight: 0.60, cost: 25 },
  { tier: 'rare',      weight: 0.30, cost: 75 },
  { tier: 'legendary', weight: 0.08, cost: 200 },
  { tier: 'mythical',  weight: 0.02, cost: 400 },
];

// ─── Voucher → real JOD cost lookup ───────────────────────────────
// Only vouchers bleed real money from the house. Coin drops are virtual —
// the player just re-spends them, so for the daily P&L they are a wash.
//
// Calibrate these to your real wholesale cost:
const VOUCHER_COST_JOD = {
  'Free Drink':     0.40,  // ~40 piastres wholesale
  'Free Snack':     0.40,
  'Free Food':      1.50,  // full meal
  '30 Min Free':    0.50,  // opportunity cost if the PC would have been used
  '1 Hour Free':    1.00,
  'Tournament Pass': 0.50, // admin time + small prize pool contribution
};

// Skins: virtual cosmetics, no real cost. Duplicate → coins (virtual). Zero JOD.

// ─── Chest reward tables (same as main MC, post-rebalance) ────────
const CHESTS = {
  common: [
    { type: 'coins',   name: '5 Tokens',   rarity: 'common',   value: 5,   dropRate: 0.35 },
    { type: 'coins',   name: '10 Tokens',  rarity: 'common',   value: 10,  dropRate: 0.25 },
    { type: 'coins',   name: '15 Tokens',  rarity: 'uncommon', value: 15,  dropRate: 0.18 },
    { type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30,  dropRate: 0.10 },
    { type: 'coins',   name: '25 Tokens',  rarity: 'rare',     value: 25,  dropRate: 0.07 },
    { type: 'voucher', name: 'Free Snack', rarity: 'rare',     value: 25,  dropRate: 0.03 },
    { type: 'coins',   name: '50 Tokens',  rarity: 'rare',     value: 50,  dropRate: 0.02 },
  ],
  rare: [
    { type: 'coins',   name: '15 Tokens',  rarity: 'common',   value: 15,  dropRate: 0.25 },
    { type: 'coins',   name: '25 Tokens',  rarity: 'common',   value: 25,  dropRate: 0.22 },
    { type: 'coins',   name: '50 Tokens',  rarity: 'uncommon', value: 50,  dropRate: 0.18 },
    { type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30,  dropRate: 0.10 },
    { type: 'coins',   name: '75 Tokens',  rarity: 'rare',     value: 75,  dropRate: 0.08 },
    { type: 'voucher', name: 'Free Snack', rarity: 'rare',     value: 25,  dropRate: 0.05 },
    { type: 'voucher', name: '30 Min Free', rarity: 'rare',    value: 100, dropRate: 0.04 },
    { type: 'skin',    name: 'Storm Ninja', rarity: 'rare',    value: 500, dropRate: 0.03 },
    { type: 'skin',    name: 'Sakura Ninja', rarity: 'rare',   value: 500, dropRate: 0.03 },
    { type: 'coins',   name: '150 Tokens', rarity: 'legendary', value: 150, dropRate: 0.02 },
  ],
  legendary: [
    { type: 'coins',   name: '25 Tokens',  rarity: 'common',   value: 25,  dropRate: 0.28 },
    { type: 'coins',   name: '50 Tokens',  rarity: 'uncommon', value: 50,  dropRate: 0.22 },
    { type: 'coins',   name: '100 Tokens', rarity: 'uncommon', value: 100, dropRate: 0.15 },
    { type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30,  dropRate: 0.10 },
    { type: 'coins',   name: '150 Tokens', rarity: 'rare',     value: 150, dropRate: 0.10 },
    { type: 'voucher', name: 'Free Food',  rarity: 'rare',     value: 50,  dropRate: 0.05 },
    { type: 'voucher', name: '1 Hour Free', rarity: 'rare',    value: 200, dropRate: 0.04 },
    { type: 'coins',   name: '250 Tokens', rarity: 'legendary', value: 250, dropRate: 0.03 },
    { type: 'voucher', name: 'Tournament Pass', rarity: 'legendary', value: 500, dropRate: 0.02 },
    { type: 'skin',    name: 'Void Ninja', rarity: 'legendary', value: 2000, dropRate: 0.010 },
    { type: 'skin',    name: 'Dragon Ninja', rarity: 'legendary', value: 2000, dropRate: 0.010 },
    { type: 'coins',   name: '500 Tokens', rarity: 'mythical', value: 500, dropRate: 0.015 },
    { type: 'skin',    name: 'Eclipse Ninja', rarity: 'mythical', value: 5000, dropRate: 0.003 },
    { type: 'coins',   name: '1000 Tokens', rarity: 'immortal', value: 1000, dropRate: 0.002 },
  ],
  mythical: [
    { type: 'coins',   name: '50 Tokens',  rarity: 'common',   value: 50,   dropRate: 0.14 },
    { type: 'coins',   name: '100 Tokens', rarity: 'uncommon', value: 100,  dropRate: 0.17 },
    { type: 'coins',   name: '150 Tokens', rarity: 'uncommon', value: 150,  dropRate: 0.14 },
    { type: 'voucher', name: 'Free Food',  rarity: 'rare',     value: 50,   dropRate: 0.06 },
    { type: 'coins',   name: '250 Tokens', rarity: 'rare',     value: 250,  dropRate: 0.11 },
    { type: 'voucher', name: '1 Hour Free', rarity: 'rare',    value: 200,  dropRate: 0.06 },
    { type: 'voucher', name: 'Tournament Pass', rarity: 'legendary', value: 500, dropRate: 0.04 },
    { type: 'coins',   name: '500 Tokens', rarity: 'legendary', value: 500, dropRate: 0.06 },
    { type: 'skin',    name: 'Void Ninja', rarity: 'legendary', value: 2000, dropRate: 0.04 },
    { type: 'skin',    name: 'Dragon Ninja', rarity: 'legendary', value: 2000, dropRate: 0.04 },
    { type: 'coins',   name: '1000 Tokens', rarity: 'mythical', value: 1000, dropRate: 0.04 },
    { type: 'skin',    name: 'Eclipse Ninja', rarity: 'mythical', value: 5000, dropRate: 0.035 },
    { type: 'skin',    name: 'Diamond Ninja', rarity: 'mythical', value: 5000, dropRate: 0.03 },
    { type: 'skin',    name: 'God Ninja', rarity: 'immortal',   value: 10000, dropRate: 0.005 },
    { type: 'coins',   name: '2000 Tokens', rarity: 'immortal', value: 2000, dropRate: 0.01 },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────
function pickCoinPackage(jodBudget) {
  // Player picks the best package <= their budget
  const affordable = COIN_PACKAGES.filter(p => p.jod <= jodBudget);
  return affordable.length ? affordable[affordable.length - 1] : COIN_PACKAGES[0];
}

function pickChestTier() {
  const r = Math.random();
  let acc = 0;
  for (const c of CHEST_MIX) { acc += c.weight; if (r <= acc) return c; }
  return CHEST_MIX[0];
}

function rollReward(pool) {
  const total = pool.reduce((s, r) => s + r.dropRate, 0);
  let r = Math.random() * total;
  for (const rew of pool) { r -= rew.dropRate; if (r <= 0) return rew; }
  return pool[pool.length - 1];
}

// ─── Single day simulation ────────────────────────────────────────
function simulateOneDay() {
  let jodIn = 0;
  let voucherCostJod = 0;
  let vouchersOut = 0;
  let chestsOpened = 0;
  let playerTokens = 0;
  let vipFreePlayCost = 0;

  for (let c = 0; c < DAILY_CUSTOMERS; c++) {
    const isVip = c < VIP_CUSTOMERS;
    const jodBudget = TOPUP_JOD_MIN + Math.random() * (TOPUP_JOD_MAX - TOPUP_JOD_MIN);
    const pack = pickCoinPackage(jodBudget);
    jodIn += pack.jod;
    let tokens = pack.coins;

    // VIP perk: 30min free play daily = ~0.50 JOD opportunity cost
    if (isVip) vipFreePlayCost += 0.50;

    const chestEngagement = 0.6;
    let chestBudget = tokens * chestEngagement;
    let loops = 0;
    const minCost = Math.max(5, Math.floor(25 * (1 - CHEST_DISCOUNT))); // cheapest chest (common) after discount
    while (chestBudget >= minCost && loops < 200) {
      let chest = pickChestTier();
      let effectiveCost = Math.max(5, Math.floor(chest.cost * (1 - CHEST_DISCOUNT)));
      // If they can't afford this tier, fall back to common (which they always can at this budget)
      if (chestBudget < effectiveCost) {
        chest = CHEST_MIX[0];
        effectiveCost = minCost;
      }
      chestBudget -= effectiveCost;
      chestsOpened++;
      const reward = rollReward(CHESTS[chest.tier] || CHESTS.common);
      if (reward.type === 'voucher') {
        vouchersOut++;
        let cost = VOUCHER_COST_JOD[reward.name] || 0.5;
        // VIP perk: 20% extra discount on cafe items (so the house eats more)
        if (isVip && (reward.name === 'Free Drink' || reward.name === 'Free Snack' || reward.name === 'Free Food')) {
          cost *= 1.20;
        }
        voucherCostJod += cost;
      } else if (reward.type === 'coins') {
        chestBudget += reward.value;
      }
      loops++;
    }
    playerTokens += tokens;
  }

  const totalCost = voucherCostJod + vipFreePlayCost;
  const netJod = jodIn - totalCost;
  return { jodIn, voucherCostJod: totalCost, netJod, chestsOpened, vouchersOut, playerTokens };
}

// ─── Run N days ──────────────────────────────────────────────────
const results = [];
for (let d = 0; d < DAYS_TO_SIMULATE; d++) {
  results.push(simulateOneDay());
}

// Aggregate
const jodIns = results.map(r => r.jodIn);
const nets   = results.map(r => r.netJod);
const costs  = results.map(r => r.voucherCostJod);
const opens  = results.map(r => r.chestsOpened);

const avg    = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
const median = arr => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
const stddev = arr => { const m = avg(arr); return Math.sqrt(avg(arr.map(x => (x - m) ** 2))); };
const p5     = arr => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length * 0.05)]; };
const p95    = arr => { const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length * 0.95)]; };

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  NinjaKiosk — Daily P&L Simulation`);
console.log(`  Customers: ${DAILY_CUSTOMERS}/day · Top-up: ${TOPUP_JOD_MIN}–${TOPUP_JOD_MAX} JOD`);
console.log(`  Simulated: ${DAYS_TO_SIMULATE} days`);
console.log(`═══════════════════════════════════════════════════════════════`);

console.log(`\n  📈 REVENUE (JOD in from top-ups)`);
console.log(`     Average day:       ${avg(jodIns).toFixed(2)} JOD`);
console.log(`     Median day:        ${median(jodIns).toFixed(2)} JOD`);
console.log(`     5% worst day:      ${p5(jodIns).toFixed(2)} JOD`);
console.log(`     5% best day:       ${p95(jodIns).toFixed(2)} JOD`);

console.log(`\n  💸 COSTS (vouchers redeemed, real wholesale)`);
console.log(`     Average day:       ${avg(costs).toFixed(2)} JOD`);
console.log(`     Median day:        ${median(costs).toFixed(2)} JOD`);
console.log(`     Worst day (high):  ${p95(costs).toFixed(2)} JOD`);

console.log(`\n  💰 NET P&L (revenue − voucher cost)`);
console.log(`     Average day:       ${avg(nets).toFixed(2)} JOD   ${avg(nets) > 0 ? '✅ PROFIT' : '🚨 LOSS'}`);
console.log(`     Median day:        ${median(nets).toFixed(2)} JOD`);
console.log(`     5% worst day:      ${p5(nets).toFixed(2)} JOD`);
console.log(`     5% best day:       ${p95(nets).toFixed(2)} JOD`);
console.log(`     Standard dev:      ±${stddev(nets).toFixed(2)} JOD`);

console.log(`\n  📊 ACTIVITY`);
console.log(`     Chests/day (avg):  ${avg(opens).toFixed(0)}`);
console.log(`     Vouchers/day (avg): ${avg(results.map(r => r.vouchersOut)).toFixed(1)}`);

const lossDays = nets.filter(n => n < 0).length;
console.log(`\n  🎲 RISK`);
console.log(`     Days in loss:      ${lossDays} / ${DAYS_TO_SIMULATE}  (${(lossDays / DAYS_TO_SIMULATE * 100).toFixed(1)}%)`);

// Monthly + yearly projection
const avgNet = avg(nets);
console.log(`\n  🗓  PROJECTIONS (based on average)`);
console.log(`     Per week:          ${(avgNet * 7).toFixed(0)} JOD`);
console.log(`     Per month (30d):   ${(avgNet * 30).toFixed(0)} JOD`);
console.log(`     Per year:          ${(avgNet * 365).toFixed(0)} JOD`);

console.log(`\n═══════════════════════════════════════════════════════════════\n`);
