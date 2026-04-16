import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

const MENU_ITEMS = [
  // ═══ DRINKS ═══
  { id: 'cola_small', name: 'Cola Small', nameAr: 'كولا صغير', category: 'drinks', price: 35, priceJOD: 0.35, description: 'Cold refreshing cola', available: true, preparationTime: 1, image: '/img/menu/cola.jpg' },
  { id: 'cola_large', name: 'Cola Large', nameAr: 'كولا كبير', category: 'drinks', price: 50, priceJOD: 0.50, description: 'Large cold cola', available: true, preparationTime: 1, image: '/img/menu/cola.jpg' },
  { id: 'iced_coffee', name: 'Iced Coffee', nameAr: 'قهوة مثلجة', category: 'drinks', price: 75, priceJOD: 0.75, description: 'Chilled iced coffee with cream', available: true, preparationTime: 3, image: '/img/menu/iced-coffee.jpg' },
  { id: 'energy_drink', name: 'Energy Drink', nameAr: 'مشروب طاقة', category: 'drinks', price: 85, priceJOD: 0.85, description: 'High energy boost', available: true, preparationTime: 1, image: '/img/menu/energy-drink.jpg' },
  { id: 'energy_drink_xl', name: 'Energy Drink XL', nameAr: 'مشروب طاقة XL', category: 'drinks', price: 60, priceJOD: 0.60, description: 'Extra large energy drink', available: true, preparationTime: 1, image: '/img/menu/energy-drink.jpg' },
  { id: 'energy_drink_bm', name: 'Energy Drink B.M', nameAr: 'مشروب طاقة B.M', category: 'drinks', price: 35, priceJOD: 0.35, description: 'Budget energy drink', available: true, preparationTime: 1, image: '/img/menu/energy-drink.jpg' },
  { id: 'zaki_juice', name: 'Zaki Juice', nameAr: 'عصير زكي', category: 'drinks', price: 15, priceJOD: 0.15, description: 'Sweet juice box', available: true, preparationTime: 1, image: '/img/menu/juice.jpg' },
  { id: 'hot_chocolate', name: 'Hot Chocolate', nameAr: 'شوكولاتة ساخنة', category: 'drinks', price: 60, priceJOD: 0.60, description: 'Warm creamy hot chocolate', available: true, preparationTime: 3, image: '/img/menu/hot-chocolate.jpg' },
  { id: 'karak_tea', name: 'Karak Tea', nameAr: 'شاي كرك', category: 'drinks', price: 65, priceJOD: 0.65, description: 'Traditional spiced karak tea', available: true, preparationTime: 3, image: '/img/menu/karak-tea.jpg' },
  { id: 'tea', name: 'Tea', nameAr: 'شاي', category: 'drinks', price: 35, priceJOD: 0.35, description: 'Classic hot tea', available: true, preparationTime: 2, image: '/img/menu/tea.jpg' },
  { id: 'coffee', name: 'Coffee', nameAr: 'قهوة', category: 'drinks', price: 65, priceJOD: 0.65, description: 'Fresh brewed coffee', available: true, preparationTime: 3, image: '/img/menu/coffee.jpg' },
  { id: 'water_small', name: 'Water Small', nameAr: 'ماء صغير', category: 'drinks', price: 35, priceJOD: 0.35, description: 'Small water bottle', available: true, preparationTime: 1, image: '/img/menu/water.jpg' },
  { id: 'water_large', name: 'Water Large', nameAr: 'ماء كبير', category: 'drinks', price: 50, priceJOD: 0.50, description: 'Large water bottle', available: true, preparationTime: 1, image: '/img/menu/water.jpg' },
  { id: 'lemon_mint', name: 'Lemon & Mint', nameAr: 'ليمون ونعنع', category: 'drinks', price: 100, priceJOD: 1.00, description: 'Fresh lemon with mint', available: true, preparationTime: 3, image: '/img/menu/lemon-mint.jpg' },
  { id: 'cocktail', name: 'Cocktail', nameAr: 'كوكتيل', category: 'drinks', price: 100, priceJOD: 1.00, description: 'Mixed fruit cocktail', available: true, preparationTime: 3, image: '/img/menu/cocktail.jpg' },

  // ═══ SNACKS ═══
  { id: 'molto', name: 'Molto', nameAr: 'مولتو', category: 'snacks', price: 60, priceJOD: 0.60, description: 'Chocolate filled croissant', available: true, preparationTime: 1, image: '/img/menu/molto.jpg' },
  { id: 'chips', name: 'Chips', nameAr: 'شيبس', category: 'snacks', price: 35, priceJOD: 0.35, description: 'Crispy salted chips', available: true, preparationTime: 1, image: '/img/menu/chips.jpg' },
  { id: 'chocolate_bar', name: 'Chocolate Bar', nameAr: 'شوكولاتة', category: 'snacks', price: 15, priceJOD: 0.15, description: 'Sweet chocolate bar', available: true, preparationTime: 1, image: '/img/menu/chocolate.jpg' },
  { id: 'biscuits', name: 'Biscuits', nameAr: 'بسكويت', category: 'snacks', price: 15, priceJOD: 0.15, description: 'Crunchy biscuits', available: true, preparationTime: 1, image: '/img/menu/biscuits.jpg' },
  { id: 'fries_small', name: 'Fries Small', nameAr: 'بطاطا صغير', category: 'snacks', price: 75, priceJOD: 0.75, description: 'Crispy golden fries', available: true, preparationTime: 5, image: '/img/menu/fries.jpg' },
  { id: 'fries_large', name: 'Fries Large', nameAr: 'بطاطا كبير', category: 'snacks', price: 100, priceJOD: 1.00, description: 'Large crispy golden fries', available: true, preparationTime: 5, image: '/img/menu/fries.jpg' },

  // ═══ FOOD (Sandwiches) ═══
  { id: 'ninja_ninja', name: 'Ninja Ninja Sandwich', nameAr: 'نينجا نينجا', category: 'food', price: 175, priceJOD: 1.75, description: 'Our signature ninja sandwich with special sauce', available: true, preparationTime: 8, image: '/img/menu/sandwich.jpg' },
  { id: 'salohy', name: 'Salohy Sandwich', nameAr: 'صلوحي', category: 'food', price: 175, priceJOD: 1.75, description: 'Salohy special grilled sandwich', available: true, preparationTime: 8, image: '/img/menu/sandwich.jpg' },
  { id: 'zanzon', name: 'Zanzon Sandwich', nameAr: 'زنزون', category: 'food', price: 175, priceJOD: 1.75, description: 'Zanzon loaded sandwich', available: true, preparationTime: 8, image: '/img/menu/sandwich.jpg' },
  { id: 'amory', name: 'Amory Sandwich', nameAr: 'عموري', category: 'food', price: 175, priceJOD: 1.75, description: 'Amory grilled chicken sandwich', available: true, preparationTime: 8, image: '/img/menu/sandwich.jpg' },
  { id: 'abo_mahmmad', name: 'Abo-Mahmad Sandwich', nameAr: 'ابو محمد', category: 'food', price: 175, priceJOD: 1.75, description: 'Abo Mahmad classic sandwich', available: true, preparationTime: 8, image: '/img/menu/sandwich.jpg' },
  { id: 'chicken_burger', name: 'Chicken Burger', nameAr: 'برجر دجاج', category: 'food', price: 120, priceJOD: 1.20, description: 'Crispy fried chicken burger', available: true, preparationTime: 7, image: '/img/menu/chicken-burger.jpg' },
  { id: 'beef_burger', name: 'Beef Burger', nameAr: 'برجر لحم', category: 'food', price: 120, priceJOD: 1.20, description: 'Juicy grilled beef burger', available: true, preparationTime: 7, image: '/img/menu/burger.jpg' },
  { id: 'hotdog', name: 'Hot Dog Sandwich', nameAr: 'هوت دوغ', category: 'food', price: 120, priceJOD: 1.20, description: 'Classic hot dog sandwich', available: true, preparationTime: 4, image: '/img/menu/hotdog.jpg' },
  { id: 'kabab', name: 'Kabab Sandwich', nameAr: 'كباب', category: 'food', price: 100, priceJOD: 1.00, description: 'Grilled kabab sandwich', available: true, preparationTime: 8, image: '/img/menu/kabab.jpg' },
];

export async function POST() {
  try {
    const menuRef = collection(db, 'menu');
    let count = 0;
    for (const item of MENU_ITEMS) {
      const { id, ...data } = item;
      await setDoc(doc(menuRef, id), data);
      count++;
    }
    return NextResponse.json({ success: true, count, message: `Seeded ${count} menu items` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ items: MENU_ITEMS.length, message: 'POST to this endpoint to seed the menu' });
}
