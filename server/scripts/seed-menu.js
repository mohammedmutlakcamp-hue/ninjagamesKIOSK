/**
 * Run this script to seed the Firestore 'menu' collection with updated items.
 * Usage: node scripts/seed-menu.js
 *
 * Make sure you have GOOGLE_APPLICATION_CREDENTIALS set or use firebase-admin init.
 * Or run this from the admin panel's menu management.
 */

const MENU_ITEMS = [
  // ═══ DRINKS ═══
  { id: 'cola_small', name: 'Cola Small', category: 'drinks', price: 35, description: 'Cold cola', available: true, preparationTime: 1 },
  { id: 'cola_large', name: 'Cola Large', category: 'drinks', price: 50, description: 'Large cold cola', available: true, preparationTime: 1 },
  { id: 'iced_coffee', name: 'Iced Coffee', category: 'drinks', price: 75, description: 'Chilled iced coffee', available: true, preparationTime: 3 },
  { id: 'energy_drink', name: 'Energy Drink', category: 'drinks', price: 85, description: 'Energy boost', available: true, preparationTime: 1 },
  { id: 'energy_drink_xl', name: 'Energy Drink XL', category: 'drinks', price: 60, description: 'Extra large energy drink', available: true, preparationTime: 1 },
  { id: 'energy_drink_bm', name: 'Energy Drink B.M', category: 'drinks', price: 35, description: 'Budget energy drink', available: true, preparationTime: 1 },
  { id: 'hot_chocolate', name: 'Hot Chocolate', category: 'drinks', price: 60, description: 'Warm hot chocolate', available: true, preparationTime: 3 },
  { id: 'karak_tea', name: 'Karak Tea', category: 'drinks', price: 60, description: 'Traditional karak tea', available: true, preparationTime: 3 },
  { id: 'tea', name: 'Tea', category: 'drinks', price: 40, description: 'Classic tea', available: true, preparationTime: 2 },
  { id: 'coffee', name: 'Coffee', category: 'drinks', price: 75, description: 'Fresh brewed coffee', available: true, preparationTime: 3 },
  { id: 'water_small', name: 'Water Small', category: 'drinks', price: 35, description: 'Small water bottle', available: true, preparationTime: 1 },
  { id: 'water_large', name: 'Water Large', category: 'drinks', price: 50, description: 'Large water bottle', available: true, preparationTime: 1 },

  // ═══ SNACKS ═══
  { id: 'chips', name: 'Chips', category: 'snacks', price: 25, description: 'Crispy chips', available: true, preparationTime: 1 },
  { id: 'chocolate_bar', name: 'Chocolate Bar', category: 'snacks', price: 15, description: 'Sweet chocolate bar', available: true, preparationTime: 1 },
  { id: 'biscuits', name: 'Biscuits', category: 'snacks', price: 15, description: 'Tasty biscuits', available: true, preparationTime: 1 },
  { id: 'molto', name: 'Molto', category: 'snacks', price: 60, description: 'Molto croissant', available: true, preparationTime: 1 },
  { id: 'fries_small', name: 'Fries Small', category: 'snacks', price: 75, description: 'Small portion of fries', available: true, preparationTime: 5 },
  { id: 'fries_large', name: 'Fries Large', category: 'snacks', price: 100, description: 'Large portion of fries', available: true, preparationTime: 5 },

  // ═══ FOOD (Sandwiches & Meals) ═══
  { id: 'ninja_ninja', name: 'Ninja Ninja Sandwich', nameAr: 'نينجا نينجا', category: 'food', price: 175, description: 'Signature ninja sandwich', available: true, preparationTime: 8 },
  { id: 'salohy', name: 'Salohy Sandwich', nameAr: 'صلوحي', category: 'food', price: 175, description: 'Salohy special sandwich', available: true, preparationTime: 8 },
  { id: 'zanzon', name: 'Zanzon Sandwich', nameAr: 'زنزون', category: 'food', price: 175, description: 'Zanzon special sandwich', available: true, preparationTime: 8 },
  { id: 'amory', name: 'Amory Sandwich', nameAr: 'عموري', category: 'food', price: 175, description: 'Amory special sandwich', available: true, preparationTime: 8 },
  { id: 'abo_mahmmad', name: 'Abo Mahmmad Sandwich', nameAr: 'ابو محمد', category: 'food', price: 175, description: 'Abo Mahmmad special sandwich', available: true, preparationTime: 8 },
  { id: 'chicken_burger', name: 'Chicken Burger', category: 'food', price: 120, description: 'Crispy chicken burger', available: true, preparationTime: 7 },
  { id: 'beef_burger', name: 'Beef Burger', category: 'food', price: 120, description: 'Juicy beef burger', available: true, preparationTime: 7 },
  { id: 'hotdog_meal', name: 'Hot Dog Meal', category: 'food', price: 175, description: 'Hot dog meal combo', available: true, preparationTime: 5 },
  { id: 'hotdog_sandwich', name: 'Hot Dog Sandwich', category: 'food', price: 85, description: 'Classic hot dog', available: true, preparationTime: 4 },
];

console.log('=== NINJA GAMES MENU ITEMS ===');
console.log(`Total items: ${MENU_ITEMS.length}`);
console.log(`Drinks: ${MENU_ITEMS.filter(i => i.category === 'drinks').length}`);
console.log(`Snacks: ${MENU_ITEMS.filter(i => i.category === 'snacks').length}`);
console.log(`Food: ${MENU_ITEMS.filter(i => i.category === 'food').length}`);
console.log('');
console.log('To add these to Firestore, use the admin panel Menu tab,');
console.log('or paste this data into the Firebase console under the "menu" collection.');
console.log('');
console.log(JSON.stringify(MENU_ITEMS, null, 2));
