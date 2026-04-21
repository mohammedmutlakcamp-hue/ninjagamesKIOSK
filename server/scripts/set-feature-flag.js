#!/usr/bin/env node
// Flip a feature flag on/off in Firestore (config/feature-flags).
// Usage: node scripts/set-feature-flag.js <flagName> <true|false>

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  databaseURL: 'https://ninja-games-kiosk-default-rtdb.firebaseio.com',
  projectId: 'ninja-games-kiosk',
  storageBucket: 'ninja-games-kiosk.firebasestorage.app',
  messagingSenderId: '245461125914',
  appId: '1:245461125914:web:a0c0262040970f050cfaa3',
};

const [, , flagName, flagValue] = process.argv;
if (!flagName || (flagValue !== 'true' && flagValue !== 'false')) {
  console.error('Usage: node scripts/set-feature-flag.js <flagName> <true|false>');
  process.exit(1);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  await setDoc(doc(db, 'config', 'feature-flags'), { [flagName]: flagValue === 'true' }, { merge: true });
  console.log(`[flag] config/feature-flags.${flagName} = ${flagValue}`);
  process.exit(0);
}

main().catch((err) => { console.error('[flag] FAILED:', err); process.exit(1); });
