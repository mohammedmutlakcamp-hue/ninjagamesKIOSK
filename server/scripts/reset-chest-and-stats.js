#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  RESET chest economy + all player stats to zero.
//
//  Wipes (ALL DATA):
//   - chest-drops              — entire collection (every drop ever)
//   - config/chest-ledger-*    — per-tier profit-locked budget state
//     (common / rare / legendary / mythical)
//
//  Resets on every player doc:
//   - stats                    → {} (chestsOpened, foodOrdered, gamesPlayed, etc)
//   - totalCoinsSpent          → 0
//   - totalPlaytime            → 0
//
//  PRESERVES (admin setup + live state):
//   - config/chest-config.settings  (luck slider, promo config)
//   - config/chest-content-overrides (admin-added rewards / disabled rewards)
//   - player coin balances, ownedNinjas, inventory, friends, VIP, etc.
//
//  Usage:
//    node scripts/reset-chest-and-stats.js --dry-run   (lists counts only)
//    node scripts/reset-chest-and-stats.js --confirm   (actually wipes)
//
//  Auth: anonymous Firebase Auth + public web SDK keys. Works because the
//  Firestore rules for this project are wide-open.
// ═══════════════════════════════════════════════════════════════════════════

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore, collection, getDocs, writeBatch, doc, deleteDoc, deleteField,
  updateDoc,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  databaseURL: 'https://ninja-games-kiosk-default-rtdb.firebaseio.com',
  projectId: 'ninja-games-kiosk',
  storageBucket: 'ninja-games-kiosk.firebasestorage.app',
  messagingSenderId: '245461125914',
  appId: '1:245461125914:web:a0c0262040970f050cfaa3',
};

const TIERS = ['common', 'rare', 'legendary', 'mythical'];
const BATCH_SIZE = 400;

const args = process.argv.slice(2);
const isDry = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');

if (!isDry && !isConfirmed) {
  console.error('\nUsage:');
  console.error('  node scripts/reset-chest-and-stats.js --dry-run');
  console.error('  node scripts/reset-chest-and-stats.js --confirm\n');
  process.exit(1);
}

async function wipeChestDrops(db) {
  const snap = await getDocs(collection(db, 'chest-drops'));
  if (snap.empty) return 0;
  if (isDry) return snap.size;
  let deleted = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, docs.length - i);
  }
  return deleted;
}

async function wipeChestLedgers(db) {
  let deleted = 0;
  for (const tier of TIERS) {
    if (isDry) { deleted += 1; continue; }
    try {
      await deleteDoc(doc(db, 'config', `chest-ledger-${tier}`));
      deleted += 1;
    } catch { /* may not exist */ }
  }
  return deleted;
}

async function resetPlayerStats(db) {
  const snap = await getDocs(collection(db, 'players'));
  if (snap.empty) return 0;
  if (isDry) return snap.size;
  let updated = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((d) => {
      batch.update(d.ref, {
        stats: {},
        totalCoinsSpent: 0,
        totalPlaytime: 0,
      });
    });
    await batch.commit();
    updated += Math.min(BATCH_SIZE, docs.length - i);
  }
  return updated;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`[reset] mode: ${isDry ? 'DRY-RUN (no deletes)' : 'CONFIRMED — DELETING'}`);
  console.log('[reset] signing in anonymously...');
  await signInAnonymously(auth);

  process.stdout.write('[reset] wiping chest-drops ... ');
  const drops = await wipeChestDrops(db);
  console.log(isDry ? `would delete ${drops}` : `deleted ${drops}`);

  process.stdout.write('[reset] wiping chest-ledgers ... ');
  const ledgers = await wipeChestLedgers(db);
  console.log(isDry ? `would delete ${ledgers}` : `deleted ${ledgers}`);

  process.stdout.write('[reset] resetting player stats ... ');
  const players = await resetPlayerStats(db);
  console.log(isDry ? `would update ${players} players` : `updated ${players} players`);

  console.log('\n[reset] ─────────────────────────────────────────────');
  console.log('[reset] PRESERVED:');
  console.log('  · config/chest-config.settings (luck slider, promo)');
  console.log('  · config/chest-content-overrides (custom rewards)');
  console.log('  · player coin balances, ownedNinjas, inventory, VIP, friends');
  console.log(`[reset] ${isDry ? 'preview done' : 'done'}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[reset] FAILED:', err);
  process.exit(1);
});
