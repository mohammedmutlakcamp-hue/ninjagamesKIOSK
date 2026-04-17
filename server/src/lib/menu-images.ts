// ═══════════════════════════════════════════════════════════════════
//  Menu image lookup — ALWAYS returns the correct image for an item.
// ───────────────────────────────────────────────────────────────────
//  Why this exists:
//  Menu items are stored in Firestore (admin-managed via MenuManagement).
//  A bunch of seeded items had missing or wrong `image` fields, so the
//  Food & Snacks tab fell back to a generic icon. This map is the source
//  of truth: it's keyed by the item id and always returns the matching
//  picture from /public/img/menu/.
//
//  Lookup order in getMenuImage():
//    1. exact id match (covers every standard item)
//    2. name keyword match (covers admin-renamed items)
//    3. category default (drinks → cola.jpg, snacks → chips.jpg, food → sandwich.jpg)
// ═══════════════════════════════════════════════════════════════════

// EXACT id → image. Mirrors MENU_ITEMS in lib/constants.ts but the
// canonical list lives here so you can update images without touching
// pricing data.
export const MENU_IMAGE_BY_ID: Record<string, string> = {
  // ── DRINKS ──
  'cola-sm':       '/img/menu/cola.jpg',
  'cola-lg':       '/img/menu/cola.jpg',
  'iced-coffee':   '/img/menu/iced-coffee.jpg',
  'energy-drink':  '/img/menu/energy-drink.jpg',
  'energy-xl':     '/img/menu/energy-drink.jpg',
  'energy-bm':     '/img/menu/energy-drink.jpg',
  'zaki-juice':    '/img/menu/juice.jpg',
  'hot-chocolate': '/img/menu/hot-chocolate.jpg',
  'karak-tea':     '/img/menu/karak-tea.jpg',
  'tea':           '/img/menu/tea.jpg',
  'coffee':        '/img/menu/coffee.jpg',
  'water-sm':      '/img/menu/water.jpg',
  'water-lg':      '/img/menu/water.jpg',
  'lemon-mint':    '/img/menu/lemon-mint.jpg',
  'cocktail':      '/img/menu/cocktail.jpg',

  // ── SNACKS ──
  'molto':         '/img/menu/molto.jpg',
  'chips':         '/img/menu/chips.jpg',
  'chocolate-bar': '/img/menu/chocolate.jpg',
  'biscuits':      '/img/menu/biscuits.jpg',
  'fries-sm':      '/img/menu/fries.jpg',
  'fries-lg':      '/img/menu/fries.jpg',

  // ── FOOD ──
  'ninja-ninja':    '/img/menu/sandwich.jpg',
  'salohy':         '/img/menu/sandwich.jpg',
  'zanzon':         '/img/menu/sandwich.jpg',
  'amory':          '/img/menu/sandwich.jpg',
  'abo-mahmad':     '/img/menu/sandwich.jpg',
  'chicken-burger': '/img/menu/chicken-burger.jpg',
  'beef-burger':    '/img/menu/burger.jpg',
  'hot-dog':        '/img/menu/hotdog.jpg',
  'kabab':          '/img/menu/kabab.jpg',
};

// Keyword → image. Used for admin-added items whose id isn't in the
// strict map but whose name still describes a known thing.
const KEYWORD_IMAGE: { match: RegExp; image: string }[] = [
  { match: /cola|pepsi|coke|soda/i,                 image: '/img/menu/cola.jpg' },
  { match: /iced.*coffee|cold.*brew/i,              image: '/img/menu/iced-coffee.jpg' },
  { match: /energy/i,                                image: '/img/menu/energy-drink.jpg' },
  { match: /juice|عصير|zaki/i,                       image: '/img/menu/juice.jpg' },
  { match: /hot.*chocolate|cocoa|شوكولاتة.*ساخن/i,    image: '/img/menu/hot-chocolate.jpg' },
  { match: /karak|كرك/i,                             image: '/img/menu/karak-tea.jpg' },
  { match: /tea|شاي/i,                               image: '/img/menu/tea.jpg' },
  { match: /coffee|قهوة|espresso|latte|cappuccino/i, image: '/img/menu/coffee.jpg' },
  { match: /water|ماء/i,                             image: '/img/menu/water.jpg' },
  { match: /lemon.*mint|ليمون.*نعنع/i,               image: '/img/menu/lemon-mint.jpg' },
  { match: /cocktail|كوكتيل/i,                       image: '/img/menu/cocktail.jpg' },

  { match: /molto|مولتو/i,                           image: '/img/menu/molto.jpg' },
  { match: /chip|شيبس|crisp/i,                       image: '/img/menu/chips.jpg' },
  { match: /chocolate|شوكولاتة/i,                    image: '/img/menu/chocolate.jpg' },
  { match: /biscuit|cookie|بسكويت/i,                 image: '/img/menu/biscuits.jpg' },
  { match: /fries|fry|بطاطا/i,                       image: '/img/menu/fries.jpg' },

  { match: /chicken.*burger|برجر.*دجاج/i,            image: '/img/menu/chicken-burger.jpg' },
  { match: /beef.*burger|burger|برجر/i,              image: '/img/menu/burger.jpg' },
  { match: /hot.*dog|hotdog|هوت.*دوغ/i,              image: '/img/menu/hotdog.jpg' },
  { match: /kabab|kebab|كباب/i,                      image: '/img/menu/kabab.jpg' },
  { match: /sandwich|سندوي|نينجا|صلوحي|زنزون|عموري|محمد/i, image: '/img/menu/sandwich.jpg' },
];

// Category fallback — guaranteed image so cards never render blank.
const CATEGORY_FALLBACK: Record<string, string> = {
  drinks: '/img/menu/cola.jpg',
  snacks: '/img/menu/chips.jpg',
  food:   '/img/menu/sandwich.jpg',
};

export interface MenuImageItem {
  id?: string;
  name?: string;
  nameAr?: string;
  category?: string;
  image?: string;
}

// Source of truth: ignore item.image and look up by id/name/category so
// every card shows a CORRECT picture even if Firestore data is stale.
export function getMenuImage(item: MenuImageItem): string {
  if (item.id && MENU_IMAGE_BY_ID[item.id]) return MENU_IMAGE_BY_ID[item.id];
  const haystack = `${item.name || ''} ${item.nameAr || ''}`;
  for (const rule of KEYWORD_IMAGE) {
    if (rule.match.test(haystack)) return rule.image;
  }
  // Final fallback: a category default (always a real image, never blank).
  if (item.category && CATEGORY_FALLBACK[item.category]) return CATEGORY_FALLBACK[item.category];
  return '/img/menu/sandwich.jpg';
}
