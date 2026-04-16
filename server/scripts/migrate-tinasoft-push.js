#!/usr/bin/env node
/**
 * Unified migration: clean test users, reset all tokens, push Tinasoft users.
 * Uses the Firebase CLIENT SDK (same hardcoded keys as src/lib/firebase.ts).
 * Firestore rules already permit unauthenticated player writes (registration uses them).
 *
 * Usage:
 *   node scripts/migrate-tinasoft-push.js              DRY RUN — show plan, write nothing
 *   node scripts/migrate-tinasoft-push.js --execute    do all 3 phases for real
 */
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, getDocs, doc, addDoc, deleteDoc,
  writeBatch, query, where,
} = require('firebase/firestore');

const EXECUTE = process.argv.includes('--execute');
const USERS_FILE = path.join(__dirname, 'migration-data', 'tinasoft-users.json');

const firebaseConfig = {
  apiKey: 'AIzaSyBZc2a9hjuk4m1p1h2JiePqHRGTS7qhf74',
  authDomain: 'ninja-games-kiosk.firebaseapp.com',
  databaseURL: 'https://ninja-games-kiosk-default-rtdb.firebaseio.com',
  projectId: 'ninja-games-kiosk',
  storageBucket: 'ninja-games-kiosk.firebasestorage.app',
  messagingSenderId: '245461125914',
  appId: '1:245461125914:web:a0c0262040970f050cfaa3',
};

initializeApp(firebaseConfig);
const db = getFirestore();

// Patterns that mark obvious test / dev / junk player accounts
const isTestUser = (u, name) => {
  const x = (u || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (!x) return true;
  if (x === 'zzzz' || x.startsWith('zzz')) return true;
  if (x === 'zeid' || x.startsWith('zeid')) return true;
  if (n === 'zeid' || n.includes('zzzz')) return true;
  if (/^test\d*$/.test(x) || /^asdf/.test(x) || /^qwerty/.test(x)) return true;
  if (/^[a-z]\1{2,}$/.test(x)) return true;        // aaaa, bbbb, etc.
  if (/^(.)\1{3,}$/.test(x)) return true;          // any 4+ repeated char
  return false;
};

async function batchedWrite(label, ops) {
  if (ops.length === 0) { console.log(`  ${label}: nothing to do`); return; }
  let done = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) op(batch);
    await batch.commit();
    done += chunk.length;
    process.stdout.write(`  ${label}: ${done}/${ops.length}\r`);
  }
  console.log(`  ${label}: ${done}/${ops.length}     `);
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writes will happen)' : 'DRY RUN (no writes)'}\n`);

  // Load source dump
  const migrated = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  console.log(`Loaded ${migrated.length} migrated users from ${path.basename(USERS_FILE)}\n`);

  // Load current Firestore players
  console.log('Reading current Firestore `players` collection...');
  const snap = await getDocs(collection(db, 'players'));
  console.log(`  Found ${snap.size} existing players\n`);

  // ---- PHASE 1: identify test users to delete ----
  const toDelete = [];
  const keepByUsername = new Map();
  snap.forEach(d => {
    const data = d.data();
    const u = (data.username || '').toLowerCase();
    const n = `${data.firstName || ''} ${data.lastName || ''}`.trim();
    if (isTestUser(u, n)) {
      toDelete.push({ id: d.id, username: u, name: n });
    } else {
      keepByUsername.set(u, { id: d.id, coins: data.coins || 0 });
    }
  });
  console.log('== PHASE 1: cleanup test users ==');
  console.log(`  ${toDelete.length} matched test patterns:`);
  for (const t of toDelete) console.log(`    - ${t.username || '(no-username)'}  name="${t.name}"  id=${t.id}`);

  // ---- PHASE 2: plan token reset (coins -> 0) for ALL kept players ----
  const toReset = [];
  for (const [, p] of keepByUsername) {
    if ((p.coins || 0) !== 0) toReset.push(p);
  }
  console.log(`\n== PHASE 2: reset tokens to 0 ==`);
  console.log(`  Players with coins > 0:  ${toReset.length}  (out of ${keepByUsername.size} kept)`);

  // ---- PHASE 3: plan Tinasoft user push (skip if username already exists, after cleanup) ----
  // After deletion, the kept set is the dedupe baseline.
  const toCreate = [];
  const skippedExisting = [];
  for (const u of migrated) {
    const { _source, ...payload } = u;
    if (keepByUsername.has(u.username)) skippedExisting.push(u.username);
    else toCreate.push(payload);
  }
  console.log(`\n== PHASE 3: push Tinasoft users ==`);
  console.log(`  Will create:               ${toCreate.length}`);
  console.log(`  Skipped (already exists):  ${skippedExisting.length}`);
  if (skippedExisting.length) console.log(`    e.g. ${skippedExisting.slice(0, 5).join(', ')}${skippedExisting.length > 5 ? '...' : ''}`);

  if (!EXECUTE) {
    console.log(`\nDRY RUN complete. Re-run with --execute to apply all 3 phases.`);
    return;
  }

  console.log(`\n>> EXECUTING <<`);

  // Phase 1 commit — delete test users
  await batchedWrite(
    'Deleting test users',
    toDelete.map(t => batch => batch.delete(doc(db, 'players', t.id)))
  );

  // Phase 2 commit — reset coins
  await batchedWrite(
    'Resetting coins -> 0',
    toReset.map(p => batch => batch.update(doc(db, 'players', p.id), { coins: 0 }))
  );

  // Phase 3 — create new (addDoc auto-generates IDs; not batchable, do in parallel waves of 25)
  console.log(`  Creating ${toCreate.length} new players...`);
  let created = 0;
  for (let i = 0; i < toCreate.length; i += 25) {
    const chunk = toCreate.slice(i, i + 25);
    await Promise.all(chunk.map(p => addDoc(collection(db, 'players'), p)));
    created += chunk.length;
    process.stdout.write(`    created ${created}/${toCreate.length}\r`);
  }
  console.log(`    created ${created}/${toCreate.length}     `);

  console.log(`\nDone.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
