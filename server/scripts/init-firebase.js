#!/usr/bin/env node
/**
 * Ninja Games - Firebase Initialization Script
 * Wipes all existing data and sets up fresh collections
 * 
 * Usage: 
 *   1. Set environment variables (or create .env.local)
 *   2. Run: node scripts/init-firebase.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// You'll need to set these or use a service account JSON
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('../firebase-service-account.json'); // Download from Firebase Console

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();
  
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  if (snapshot.size > 0) {
    await batch.commit();
    console.log(`  🗑️  Deleted ${snapshot.size} docs from ${collectionPath}`);
  } else {
    console.log(`  ✅ ${collectionPath} already empty`);
  }
}

async function main() {
  console.log('🥷 Ninja Games - Firebase Initialization');
  console.log('========================================\n');

  // Step 1: Clear all collections
  console.log('Step 1: Clearing existing data...');
  const collections = ['players', 'pcs', 'menu', 'orders', 'reservations', 'config', 'admins'];
  for (const col of collections) {
    await deleteCollection(col);
  }

  // Step 2: Create admin account
  console.log('\nStep 2: Creating admin account...');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ninjagames.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ninja2024!';
  
  let adminUser;
  try {
    adminUser = await auth.getUserByEmail(adminEmail);
    console.log(`  ℹ️  Admin user already exists: ${adminEmail}`);
  } catch {
    adminUser = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: 'Admin',
    });
    console.log(`  ✅ Created admin: ${adminEmail} / ${adminPassword}`);
  }

  await db.collection('admins').doc(adminUser.uid).set({
    email: adminEmail,
    name: 'Admin',
    role: 'owner',
    createdAt: Date.now(),
  });

  // Step 3: Create default PCs
  console.log('\nStep 3: Creating default PCs...');
  for (let i = 1; i <= 10; i++) {
    const pcName = `PC-${String(i).padStart(2, '0')}`;
    await db.collection('pcs').add({
      name: pcName,
      status: 'offline',
      currentPlayer: null,
      currentPlayerName: null,
      sessionStart: null,
      coinsRemaining: null,
      minutesRemaining: null,
      reservedBy: null,
      reservedAt: null,
      reservationExpires: null,
      specs: '',
      ipAddress: '',
      lastHeartbeat: 0,
      games: [],
    });
    console.log(`  ✅ Created ${pcName}`);
  }

  // Step 4: Create default menu items
  console.log('\nStep 4: Creating default menu...');
  const defaultMenu = [
    // Drinks
    { name: 'Espresso', category: 'drinks', price: 20, description: 'Strong black coffee', available: true, preparationTime: 3, image: '' },
    { name: 'Cappuccino', category: 'drinks', price: 25, description: 'Coffee with steamed milk', available: true, preparationTime: 4, image: '' },
    { name: 'Iced Coffee', category: 'drinks', price: 25, description: 'Cold brew coffee', available: true, preparationTime: 3, image: '' },
    { name: 'Red Bull', category: 'drinks', price: 30, description: 'Energy drink', available: true, preparationTime: 1, image: '' },
    { name: 'Water', category: 'drinks', price: 5, description: 'Bottled water', available: true, preparationTime: 1, image: '' },
    { name: 'Soda', category: 'drinks', price: 10, description: 'Pepsi / 7Up / Mirinda', available: true, preparationTime: 1, image: '' },
    { name: 'Fresh Juice', category: 'drinks', price: 30, description: 'Orange or lemon juice', available: true, preparationTime: 5, image: '' },
    { name: 'Hot Chocolate', category: 'drinks', price: 25, description: 'Rich hot cocoa', available: true, preparationTime: 4, image: '' },
    
    // Snacks
    { name: 'Chips', category: 'snacks', price: 10, description: 'Potato chips bag', available: true, preparationTime: 1, image: '' },
    { name: 'Chocolate Bar', category: 'snacks', price: 10, description: 'Snickers / KitKat / Mars', available: true, preparationTime: 1, image: '' },
    { name: 'Popcorn', category: 'snacks', price: 15, description: 'Freshly popped', available: true, preparationTime: 3, image: '' },
    { name: 'Nuts Mix', category: 'snacks', price: 20, description: 'Mixed nuts & dried fruits', available: true, preparationTime: 1, image: '' },
    { name: 'Cookies', category: 'snacks', price: 15, description: 'Chocolate chip cookies', available: true, preparationTime: 1, image: '' },
    
    // Food
    { name: 'Club Sandwich', category: 'food', price: 40, description: 'Chicken, lettuce, tomato', available: true, preparationTime: 10, image: '' },
    { name: 'Cheese Burger', category: 'food', price: 45, description: 'Beef patty with cheese', available: true, preparationTime: 12, image: '' },
    { name: 'Pizza Slice', category: 'food', price: 25, description: 'Pepperoni or Margherita', available: true, preparationTime: 5, image: '' },
    { name: 'Shawarma Wrap', category: 'food', price: 35, description: 'Chicken shawarma', available: true, preparationTime: 8, image: '' },
    { name: 'Fries', category: 'food', price: 20, description: 'Crispy french fries', available: true, preparationTime: 7, image: '' },
    { name: 'Manakeesh', category: 'food', price: 15, description: 'Za\'atar or cheese', available: true, preparationTime: 5, image: '' },
  ];

  for (const item of defaultMenu) {
    await db.collection('menu').add(item);
    console.log(`  ✅ ${item.category}: ${item.name} (🪙${item.price})`);
  }

  // Step 5: Create default settings
  console.log('\nStep 5: Creating default settings...');
  await db.collection('config').doc('settings').set({
    cafeName: 'Ninja Games',
    currency: 'JOD',
    coinRate: 200, // 1 JOD = 200 coins (1 hour)
    openHour: 10,
    closeHour: 24,
    autoShutdown: true,
    maxReservationMinutes: 30,
    lowBalanceWarning: 50,
    gracePeriodSeconds: 60,
  });

  console.log('\n========================================');
  console.log('🥷 Firebase initialized successfully!');
  console.log('========================================');
  console.log(`\nAdmin login: ${adminEmail} / ${adminPassword}`);
  console.log('PCs: 10 created (PC-01 to PC-10)');
  console.log('Menu: 19 default items');
  console.log('\nNext steps:');
  console.log('1. Set NEXT_PUBLIC_FIREBASE_* env vars in Vercel');
  console.log('2. Deploy: git push');
  console.log('3. Login at your-domain.vercel.app/admin');
}

main().catch(console.error);
