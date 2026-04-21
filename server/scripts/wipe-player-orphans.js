#!/usr/bin/env node
// One-shot: wipe every Firestore collection whose docs only have meaning in
// the context of existing players. Run this AFTER delete-all-players.js.
//
// Leaves untouched: menu, pcs, tournaments, campaigns, discount-codes,
// announcements, shifts, debug-logs, config (system/shop-level data).
//
// Run from source/server/:   node scripts/wipe-player-orphans.js

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
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

// Every collection keyed on / referencing player UIDs.
const COLLECTIONS = [
  'sessions',
  'friend-requests',
  'messages',
  'group-chats',
  'chest-drops',
  'orders',
  'shisha-orders',
  'topup-requests',
  'topup_requests',
  'pin-reset-requests',
  'social-verification-requests',
  'guest-requests',
  'guest-register-requests',
  'guest-reg-topups',
  'guest-approval-codes',
  'daily-tasks',
  'calls',
  'voice-calls',
  'coin-transfers',
  'player-reports',
  'profile-comments',
  'receipts',
  'giftcard-requests',
  'mini-game-scores',
  'ninja-arena-matches',
  'command-history',
  'pending-registrations',
  'support-chats',
  'support-messages',
  'clubs',
  'club-invites',
  'vip_requests',
  'reservations',
];

const BATCH_SIZE = 400;

async function wipe(db, name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) {
    console.log(`[${name}] empty, skipped`);
    return 0;
  }
  const docs = snap.docs;
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += slice.length;
  }
  console.log(`[${name}] deleted ${deleted}`);
  return deleted;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('[orphan-wipe] signing in anonymously...');
  await signInAnonymously(auth);

  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      total += await wipe(db, name);
    } catch (err) {
      console.error(`[${name}] FAILED:`, err.message);
    }
  }

  console.log(`\n[orphan-wipe] done. deleted ${total} docs across ${COLLECTIONS.length} collections.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[orphan-wipe] FATAL:', err);
  process.exit(1);
});
