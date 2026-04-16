#!/usr/bin/env node
/**
 * Monte Carlo simulation for NinjaKiosk chest economy.
 *
 * Usage:
 *   node scripts/monte-carlo-chests.js              # default 100k opens across all chests
 *   node scripts/monte-carlo-chests.js --opens 50000 --chest rare
 *
 * What it does:
 *   Simulates N chest opens under three admin configs:
 *     1. PURE RNG          (biasEnabled = false)
 *     2. NEUTRAL BIAS      (threshold 3000, boost 1.8, dampen 0.5 — current default)
 *     3. HOUSE-AGGRESSIVE  (threshold 5000, boost 1.2, dampen 0.3 — more margin)
 *
 *   For each config, it prints:
 *     - total paid (player spend)
 *     - total awarded (coin value out)
 *     - house margin % = (paid − awarded) / paid
 *     - reward distribution by rarity
 *     - skin-dup conversion count
 */

// Stub out the Firestore bits so we can import the catalog cleanly.
// We only need CHESTS + ChestReward shape.
const CHESTS = [
  { id: 'common', tier: 'common', cost: 25, rewards: [
    { id: 'c_coins_5',  type: 'coins', name: '5 Tokens', rarity: 'common', value: 5, dropRate: 0.35 },
    { id: 'c_coins_10', type: 'coins', name: '10 Tokens', rarity: 'common', value: 10, dropRate: 0.25 },
    { id: 'c_coins_15', type: 'coins', name: '15 Tokens', rarity: 'uncommon', value: 15, dropRate: 0.18 },
    { id: 'c_drink',    type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30, dropRate: 0.10 },
    { id: 'c_coins_25', type: 'coins', name: '25 Tokens', rarity: 'rare', value: 25, dropRate: 0.07 },
    { id: 'c_snack',    type: 'voucher', name: 'Free Snack', rarity: 'rare', value: 25, dropRate: 0.03 },
    { id: 'c_coins_50', type: 'coins', name: '50 Tokens', rarity: 'rare', value: 50, dropRate: 0.02 },
  ]},
  { id: 'rare', tier: 'rare', cost: 75, rewards: [
    { id: 'r_coins_15', type: 'coins', name: '15 Tokens', rarity: 'common', value: 15, dropRate: 0.25 },
    { id: 'r_coins_25', type: 'coins', name: '25 Tokens', rarity: 'common', value: 25, dropRate: 0.22 },
    { id: 'r_coins_50', type: 'coins', name: '50 Tokens', rarity: 'uncommon', value: 50, dropRate: 0.18 },
    { id: 'r_drink',    type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30, dropRate: 0.10 },
    { id: 'r_coins_75', type: 'coins', name: '75 Tokens', rarity: 'rare', value: 75, dropRate: 0.08 },
    { id: 'r_snack',    type: 'voucher', name: 'Free Snack', rarity: 'rare', value: 25, dropRate: 0.05 },
    { id: 'r_time_30m', type: 'voucher', name: '30 Min Free', rarity: 'rare', value: 100, dropRate: 0.04 },
    { id: 'r_skin_storm', type: 'skin', name: 'Storm Ninja', rarity: 'rare', skinId: 'storm', value: 500, dropRate: 0.03 },
    { id: 'r_skin_sakura', type: 'skin', name: 'Sakura Ninja', rarity: 'rare', skinId: 'sakura', value: 500, dropRate: 0.03 },
    { id: 'r_coins_150', type: 'coins', name: '150 Tokens', rarity: 'legendary', value: 150, dropRate: 0.02 },
  ]},
  { id: 'legendary', tier: 'legendary', cost: 200, rewards: [
    { id: 'l_coins_25',    type: 'coins', name: '25 Tokens', rarity: 'common', value: 25, dropRate: 0.28 },
    { id: 'l_coins_50',    type: 'coins', name: '50 Tokens', rarity: 'uncommon', value: 50, dropRate: 0.22 },
    { id: 'l_coins_100',   type: 'coins', name: '100 Tokens', rarity: 'uncommon', value: 100, dropRate: 0.15 },
    { id: 'l_drink',       type: 'voucher', name: 'Free Drink', rarity: 'uncommon', value: 30, dropRate: 0.10 },
    { id: 'l_coins_150',   type: 'coins', name: '150 Tokens', rarity: 'rare', value: 150, dropRate: 0.10 },
    { id: 'l_food',        type: 'voucher', name: 'Free Food', rarity: 'rare', value: 50, dropRate: 0.05 },
    { id: 'l_time_1h',     type: 'voucher', name: '1 Hour Free', rarity: 'rare', value: 200, dropRate: 0.04 },
    { id: 'l_coins_250',   type: 'coins', name: '250 Tokens', rarity: 'legendary', value: 250, dropRate: 0.03 },
    { id: 'l_tournament',  type: 'voucher', name: 'Tournament Pass', rarity: 'legendary', value: 500, dropRate: 0.02 },
    { id: 'l_skin_void',   type: 'skin', name: 'Void Ninja', rarity: 'legendary', skinId: 'void', value: 2000, dropRate: 0.010 },
    { id: 'l_skin_dragon', type: 'skin', name: 'Dragon Ninja', rarity: 'legendary', skinId: 'dragon', value: 2000, dropRate: 0.010 },
    { id: 'l_coins_500',   type: 'coins', name: '500 Tokens', rarity: 'mythical', value: 500, dropRate: 0.015 },
    { id: 'l_skin_eclipse', type: 'skin', name: 'Eclipse Ninja', rarity: 'mythical', skinId: 'eclipse', value: 5000, dropRate: 0.003 },
    { id: 'l_coins_1000',  type: 'coins', name: '1000 Tokens', rarity: 'immortal', value: 1000, dropRate: 0.002 },
  ]},
  { id: 'mythical', tier: 'mythical', cost: 400, rewards: [
    { id: 'm_coins_50',     type: 'coins', name: '50 Tokens', rarity: 'common', value: 50, dropRate: 0.14 },
    { id: 'm_coins_100',    type: 'coins', name: '100 Tokens', rarity: 'uncommon', value: 100, dropRate: 0.17 },
    { id: 'm_coins_150',    type: 'coins', name: '150 Tokens', rarity: 'uncommon', value: 150, dropRate: 0.14 },
    { id: 'm_food',         type: 'voucher', name: 'Free Food', rarity: 'rare', value: 50, dropRate: 0.06 },
    { id: 'm_coins_250',    type: 'coins', name: '250 Tokens', rarity: 'rare', value: 250, dropRate: 0.11 },
    { id: 'm_time_1h',      type: 'voucher', name: '1 Hour Free', rarity: 'rare', value: 200, dropRate: 0.06 },
    { id: 'm_tournament',   type: 'voucher', name: 'Tournament Pass', rarity: 'legendary', value: 500, dropRate: 0.04 },
    { id: 'm_coins_500',    type: 'coins', name: '500 Tokens', rarity: 'legendary', value: 500, dropRate: 0.06 },
    { id: 'm_skin_void',    type: 'skin', name: 'Void Ninja', rarity: 'legendary', skinId: 'void', value: 2000, dropRate: 0.04 },
    { id: 'm_skin_dragon',  type: 'skin', name: 'Dragon Ninja', rarity: 'legendary', skinId: 'dragon', value: 2000, dropRate: 0.04 },
    { id: 'm_coins_1000',   type: 'coins', name: '1000 Tokens', rarity: 'mythical', value: 1000, dropRate: 0.04 },
    { id: 'm_skin_eclipse', type: 'skin', name: 'Eclipse Ninja', rarity: 'mythical', skinId: 'eclipse', value: 5000, dropRate: 0.035 },
    { id: 'm_skin_diamond', type: 'skin', name: 'Diamond Ninja', rarity: 'mythical', skinId: 'diamond', value: 5000, dropRate: 0.03 },
    { id: 'm_skin_god',     type: 'skin', name: 'God Ninja', rarity: 'immortal', skinId: 'god-ninja', value: 10000, dropRate: 0.005 },
    { id: 'm_coins_2000',   type: 'coins', name: '2000 Tokens', rarity: 'immortal', value: 2000, dropRate: 0.01 },
  ]},
];

const SKIN_DUP_COIN_VALUE = {
  common: 20, uncommon: 30, rare: 75, epic: 150,
  legendary: 300, mythical: 600, mythic: 600, immortal: 1000,
};

// ─── Biased roll (mirrors lib/chest-economy.ts) ─────────────────────
function rollReward(chest, ownedSkins, cfg, ledger) {
  const profit = ledger.paid - ledger.awarded;
  const ownedSet = new Set(ownedSkins);

  const weighted = chest.rewards.map(r => {
    let w = r.dropRate;
    if (cfg.biasEnabled) {
      const isHighValue = r.type === 'skin' || (r.value || 0) >= cfg.highValueThreshold;
      if (isHighValue) {
        if (profit >= cfg.profitThreshold) w *= cfg.boostFactor;
        else if (profit <= -cfg.lossThreshold) w *= cfg.dampenFactor;
      } else {
        if (profit >= cfg.profitThreshold) w *= (1 / Math.sqrt(cfg.boostFactor));
        else if (profit <= -cfg.lossThreshold) w *= Math.sqrt(1 / cfg.dampenFactor);
      }
    }
    return { r, w: Math.max(0.0001, w) };
  });

  const total = weighted.reduce((s, x) => s + x.w, 0);
  let roll = Math.random() * total;
  let chosen = chest.rewards[chest.rewards.length - 1];
  for (const { r, w } of weighted) {
    roll -= w;
    if (roll <= 0) { chosen = r; break; }
  }

  if (chosen.type === 'skin' && chosen.skinId && ownedSet.has(chosen.skinId)) {
    const coinValue = SKIN_DUP_COIN_VALUE[chosen.rarity] || 50;
    return { reward: { ...chosen, type: 'coins', value: coinValue, name: `${coinValue} Tokens (dup)`, skinId: undefined }, wasDup: true };
  }
  return { reward: chosen, wasDup: false };
}

// ─── Run one simulation ─────────────────────────────────────────────
function simulate(opens, chestId, cfg) {
  const chest = CHESTS.find(c => c.id === chestId) || CHESTS[0];
  const ledger = { paid: 0, awarded: 0 };
  // Model 100 different players, each slowly building a skin collection
  const NUM_PLAYERS = 100;
  const playerSkins = Array.from({ length: NUM_PLAYERS }, () => new Set());
  const byRarity = {};
  let dupConversions = 0;

  for (let i = 0; i < opens; i++) {
    ledger.paid += chest.cost;
    const player = i % NUM_PLAYERS;
    const { reward, wasDup } = rollReward(chest, Array.from(playerSkins[player]), cfg, ledger);
    ledger.awarded += reward.value || 0;
    if (reward.type === 'skin' && reward.skinId) playerSkins[player].add(reward.skinId);
    if (wasDup) dupConversions++;
    byRarity[reward.rarity] = (byRarity[reward.rarity] || 0) + 1;
  }

  return {
    opens,
    chest: chest.id,
    paid: ledger.paid,
    awarded: ledger.awarded,
    houseMargin: ((ledger.paid - ledger.awarded) / ledger.paid * 100).toFixed(2) + '%',
    profit: ledger.paid - ledger.awarded,
    dupConversions,
    byRarity,
  };
}

// ─── Configs to compare ─────────────────────────────────────────────
const configs = {
  'PURE RNG':          { biasEnabled: false, profitThreshold: 3000, lossThreshold: 1000, boostFactor: 1,   dampenFactor: 1,   highValueThreshold: 100 },
  'NEUTRAL BIAS':      { biasEnabled: true,  profitThreshold: 3000, lossThreshold: 1000, boostFactor: 1.8, dampenFactor: 0.5, highValueThreshold: 100 },
  'HOUSE-AGGRESSIVE':  { biasEnabled: true,  profitThreshold: 5000, lossThreshold:  500, boostFactor: 1.2, dampenFactor: 0.3, highValueThreshold: 100 },
};

// ─── CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opensIdx = args.indexOf('--opens');
const opens = opensIdx >= 0 && args[opensIdx + 1] ? parseInt(args[opensIdx + 1]) : 100000;
const chestIdx = args.indexOf('--chest');
const chestArg = chestIdx >= 0 ? args[chestIdx + 1] : null;
const chestsToRun = chestArg ? [chestArg] : CHESTS.map(c => c.id);

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`  NinjaKiosk — Chest Economy Monte Carlo`);
console.log(`  Opens per config: ${opens.toLocaleString()}`);
console.log(`═══════════════════════════════════════════════════════════`);

for (const chestId of chestsToRun) {
  console.log(`\n■ ${chestId.toUpperCase()} CHEST`);
  console.log('─'.repeat(60));
  for (const [name, cfg] of Object.entries(configs)) {
    const r = simulate(opens, chestId, cfg);
    console.log(`  ${name.padEnd(20)} paid ${r.paid.toLocaleString().padStart(10)}` +
      `   awarded ${r.awarded.toLocaleString().padStart(10)}` +
      `   margin ${r.houseMargin.padStart(8)}` +
      `   dup→coin ${r.dupConversions.toString().padStart(5)}`);
  }
}

console.log(`\n═══════════════════════════════════════════════════════════`);
console.log(`  DONE. Higher margin = better for the house.`);
console.log(`  Duplicate-skin conversions protect value without drops feeling`);
console.log(`  bad. Adjust config/chest-economy in Firestore to tune live.`);
console.log(`═══════════════════════════════════════════════════════════\n`);
