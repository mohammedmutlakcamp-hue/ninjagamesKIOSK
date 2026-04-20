#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  FRESH-START WIPE — deletes EVERY player-data collection in Firestore.
//
//  Keeps `config/*` (feature flags, chest economy, loyalty, etc.) so the app
//  still has its admin-tunable settings after the wipe.
//
//  Usage:
//    node scripts/wipe-firestore-fresh.js --dry-run   (lists counts, no delete)
//    node scripts/wipe-firestore-fresh.js --confirm   (actually wipes)
//
//  Auth: anonymous Firebase Auth + public web SDK keys. Works because the
//  Firestore rules in this project are wide-open (per source/CLAUDE.md).
// ═══════════════════════════════════════════════════════════════════════════

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  databaseURL: 'https://ninja-games-kiosk-default-rtdb.firebaseio.com',
  projectId: 'ninja-games-kiosk',
  storageBucket: 'ninja-games-kiosk.firebasestorage.app',
  messagingSenderId: '245461125914',
  appId: '1:245461125914:web:a0c0262040970f050cfaa3',
};

// All player-data collections enumerated from the codebase. `config` is
// intentionally excluded — keeping admin settings (feature flags, chest
// economy, etc.) after the wipe.
const COLLECTIONS_TO_WIPE = [
  'players',
  'orders',
  'shisha-orders',
  'chest-drops',
  'topup-requests',
  'topup_requests',
  'vip_requests',
  'guest-requests',
  'guest-register-requests',
  'guest-reg-topups',
  'guest-approval-codes',
  'pending-registrations',
  'pin-reset-requests',
  'social-verification-requests',
  'friend-requests',
  'coin-transfers',
  'giftcard-requests',
  'discount-codes',
  'announcements',
  'campaigns',
  'menu',
  'messages',
  'group-chats',
  'support-chats',
  'support-messages',
  'calls',
  'voice-calls',
  'daily-tasks',
  'mini-game-scores',
  'ninja-arena-matches',
  'tournaments',
  'reservations',
  'receipts',
  'sessions',
  'shifts',
  'pcs',
  'clubs',
  'club-invites',
  'profile-comments',
  'player-reports',
  'command-history',
  'debug-logs',
];

const BATCH_SIZE = 400; // Firestore batch limit is 500, leave headroom.

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');

if (!isDryRun && !isConfirmed) {
  console.error('\n[wipe] No mode passed. Use one of:');
  console.error('  node scripts/wipe-firestore-fresh.js --dry-run');
  console.error('  node scripts/wipe-firestore-fresh.js --confirm\n');
  process.exit(1);
}

async function wipeCollection(db, name) {
  const snap = await getDocs(collection(db, name));
  const docs = snap.docs;
  if (docs.length === 0) return 0;
  if (isDryRun) return docs.length;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`[wipe] mode: ${isDryRun ? 'DRY-RUN (no deletes)' : 'CONFIRMED — DELETING'}`);
  console.log('[wipe] signing in anonymously...');
  await signInAnonymously(auth);

  let total = 0;
  const summary = [];
  for (const name of COLLECTIONS_TO_WIPE) {
    process.stdout.write(`[wipe] ${name.padEnd(32)} ... `);
    try {
      const n = await wipeCollection(db, name);
      total += n;
      summary.push({ name, count: n });
      console.log(isDryRun ? `would delete ${n}` : `deleted ${n}`);
    } catch (err) {
      console.log(`SKIPPED (${err.message})`);
      summary.push({ name, count: 0, error: err.message });
    }
  }

  console.log('\n[wipe] ─────────────────────────────────────────────');
  console.log(`[wipe] TOTAL ${isDryRun ? 'would delete' : 'deleted'}: ${total} docs`);
  console.log('[wipe] config/* preserved (feature flags, settings, etc.)');
  console.log('[wipe] done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[wipe] FAILED:', err);
  process.exit(1);
});
