#!/usr/bin/env node
/**
 * Daily Firestore backup. Exports every collection to:
 *   server/backups/YYYY-MM-DD/<collection>.json
 *
 * Run manually:                   node scripts/backup-firestore.js
 * Schedule daily on the server PC: open Task Scheduler -> Create Task ->
 *   Trigger: daily 03:00, Action: program `node`, args:
 *     "C:\Users\vip-2\Desktop\Ninja Games Kiosk Final 2026\server\scripts\backup-firestore.js"
 *
 * Uses the same client-SDK / hardcoded keys as the migration scripts so no
 * service-account JSON is required. Anonymous auth provides the token for
 * Firestore reads.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const COLLECTIONS = [
  'players', 'pcs', 'sessions', 'orders', 'shisha-orders', 'menu',
  'tournaments', 'chest-drops', 'chests', 'reservations', 'config',
  'topup-requests', 'expenses', 'admin-roles', 'admin-users',
  'admin-activity-log', 'pending-registrations', 'guest-requests',
  'friend-requests', 'clubs', 'group-messages', 'groups',
];

initializeApp({
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  projectId: 'ninja-games-kiosk',
});

async function main() {
  const auth = getAuth();
  await signInAnonymously(auth);
  const db = getFirestore();

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, '..', 'backups', today);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Backing up to ${outDir}\n`);

  let totalDocs = 0;
  for (const name of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, name));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2));
      console.log(`  ${name.padEnd(28)} ${docs.length} docs`);
      totalDocs += docs.length;
    } catch (e) {
      console.log(`  ${name.padEnd(28)} FAILED: ${e.message}`);
    }
  }
  console.log(`\nDone. ${totalDocs} docs across ${COLLECTIONS.length} collections.`);

  // Optional cleanup: keep last 30 days of backups
  try {
    const backupsRoot = path.join(__dirname, '..', 'backups');
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const dir of fs.readdirSync(backupsRoot)) {
      const full = path.join(backupsRoot, dir);
      if (fs.statSync(full).isDirectory() && fs.statSync(full).mtimeMs < cutoff) {
        fs.rmSync(full, { recursive: true, force: true });
        console.log(`Pruned old backup: ${dir}`);
      }
    }
  } catch {}
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
