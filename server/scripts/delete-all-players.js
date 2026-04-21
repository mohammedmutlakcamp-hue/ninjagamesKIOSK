#!/usr/bin/env node
// One-shot: delete EVERY doc in the `players` collection on the
// ninja-games-kiosk Firestore. No filter. No recovery.
//
// Run from source/server/:   node scripts/delete-all-players.js

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

const BATCH_SIZE = 400; // Firestore batch limit is 500

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('[players-wipe] signing in anonymously...');
  await signInAnonymously(auth);

  console.log('[players-wipe] fetching players...');
  const snap = await getDocs(collection(db, 'players'));
  const docs = snap.docs;
  console.log(`[players-wipe] found ${docs.length} players. deleting all.`);

  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const slice = docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    slice.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += slice.length;
    console.log(`[players-wipe] deleted ${deleted}/${docs.length}`);
  }

  console.log(`[players-wipe] done. deleted ${deleted} players.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[players-wipe] FAILED:', err);
  process.exit(1);
});
