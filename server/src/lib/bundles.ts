// Bundle suggestion rules — when a user adds an item matching a trigger,
// suggest the companions. All matches are case-insensitive substring checks
// on the menu item's `name` field so you don't have to know Firestore IDs.

export interface BundleRule {
  trigger: string[];        // any of these substrings in the name triggers
  suggests: string[];       // name substrings to suggest adding
  title?: string;           // popup title override
  reason?: string;          // one-line blurb shown to the user
}

export const BUNDLE_RULES: BundleRule[] = [
  // ─── Cigarettes ──────────────────────────────────────────────
  {
    trigger: ['marlboro red', 'classic red'],
    suggests: ['karak', 'tea', 'coffee', 'espresso', 'redbull', 'red bull', 'lighter'],
    title: 'Marlboro Red combo',
    reason: 'A strong smoke needs a strong drink',
  },
  {
    trigger: ['marlboro gold', 'marlboro light'],
    suggests: ['karak', 'tea', 'coffee', 'latte', 'cappuccino', 'lighter', 'croissant'],
    title: 'Marlboro Gold combo',
    reason: 'Smooth cigs, smooth drinks',
  },
  {
    trigger: ['winston'],
    suggests: ['karak', 'coffee', 'espresso', 'red bull', 'redbull', 'lighter'],
    title: 'Winston combo',
    reason: 'Classic pairing',
  },
  {
    trigger: ['cigarette', 'cigarettes', 'marlboro', 'دخان', 'سجائر', 'kent', 'davidoff', 'camel'],
    suggests: ['karak', 'tea', 'coffee', 'red bull', 'redbull', 'lighter', 'شاي', 'قهوة'],
    title: 'Classic combo',
    reason: 'Smoke goes great with a hot drink',
  },

  // ─── Hot drinks ──────────────────────────────────────────────
  {
    trigger: ['karak', 'شاي'],
    suggests: ['marlboro', 'winston', 'cigarette', 'cookie', 'biscuit', 'croissant', 'بسكوت', 'donut', 'cake'],
    title: 'Make it perfect',
    reason: 'Karak deserves a smoke or something sweet',
  },
  {
    trigger: ['tea'],
    suggests: ['marlboro', 'winston', 'cigarette', 'cookie', 'biscuit', 'croissant', 'cake'],
    title: 'Tea time',
    reason: 'What goes with a warm cup?',
  },
  {
    trigger: ['espresso', 'ristretto'],
    suggests: ['marlboro', 'cigarette', 'croissant', 'chocolate', 'biscotti'],
    title: 'Espresso kick',
    reason: 'Short and strong',
  },
  {
    trigger: ['coffee', 'latte', 'cappuccino', 'americano', 'mocha', 'قهوة'],
    suggests: ['marlboro', 'winston', 'cigarette', 'croissant', 'cookie', 'cake', 'muffin', 'donut', 'chocolate'],
    title: 'Coffee break',
    reason: 'Add a bite on the side',
  },

  // ─── Shisha / hubbly ─────────────────────────────────────────
  {
    trigger: ['shisha', 'hubbly', 'معسل'],
    suggests: ['juice', 'water', 'soda', 'cola', 'pepsi', '7up', 'sprite', 'عصير', 'marlboro', 'winston', 'cigarette'],
    title: 'Perfect hubbly setup',
    reason: 'Something to sip and something to smoke',
  },

  // ─── Energy ──────────────────────────────────────────────────
  {
    trigger: ['redbull', 'red bull', 'monster', 'energy drink'],
    suggests: ['marlboro', 'winston', 'cigarette', 'chips', 'chocolate', 'snickers', 'lays'],
    title: 'Gamer fuel',
    reason: 'Lock in for a long session',
  },

  // ─── Food ────────────────────────────────────────────────────
  {
    trigger: ['burger', 'cheeseburger'],
    suggests: ['fries', 'chips', 'cola', 'pepsi', 'soda', 'water', 'ketchup', 'onion rings'],
    title: 'Complete the meal',
    reason: 'Nobody eats a burger alone',
  },
  {
    trigger: ['pizza', 'slice'],
    suggests: ['cola', 'pepsi', 'sprite', 'fries', 'chicken wings', 'garlic'],
    title: 'Pizza night',
    reason: 'Sides and a soda make it better',
  },
  {
    trigger: ['chicken', 'wings', 'nuggets'],
    suggests: ['fries', 'cola', 'pepsi', 'sauce', 'ranch', 'garlic'],
    title: 'More of a good thing',
    reason: 'Dip it, wash it down',
  },
  {
    trigger: ['sandwich', 'wrap', 'shawarma'],
    suggests: ['fries', 'chips', 'cola', 'pepsi', 'juice', 'water'],
    title: 'Add a side',
    reason: 'Sandwich alone is never enough',
  },
  {
    trigger: ['fries', 'potato', 'chips'],
    suggests: ['burger', 'sandwich', 'cola', 'pepsi', 'ketchup', 'mayo', 'sauce'],
    title: 'Good call',
    reason: 'Make it a full snack session',
  },
  {
    trigger: ['pasta', 'spaghetti'],
    suggests: ['bread', 'garlic', 'cola', 'pepsi', 'water'],
    title: 'Italian combo',
    reason: 'Bread and a drink complete it',
  },

  // ─── Sweets ──────────────────────────────────────────────────
  {
    trigger: ['ice cream', 'sundae'],
    suggests: ['brownie', 'cookie', 'waffle', 'coffee'],
    title: 'Dessert platter',
    reason: 'Why stop at one?',
  },
  {
    trigger: ['cake', 'brownie', 'cookie', 'muffin', 'donut'],
    suggests: ['coffee', 'latte', 'tea', 'karak', 'milk'],
    title: 'With something to drink',
    reason: 'Sweets always need a drink',
  },
  {
    trigger: ['chocolate'],
    suggests: ['milk', 'coffee', 'espresso', 'redbull'],
    title: 'Chocolate craving',
    reason: 'Wash it down',
  },

  // ─── Cold drinks ─────────────────────────────────────────────
  {
    trigger: ['cola', 'pepsi', 'sprite', '7up', 'mirinda', 'fanta'],
    suggests: ['burger', 'pizza', 'fries', 'chips', 'chicken'],
    title: 'Make it a meal',
    reason: 'A soda by itself is just thirsty',
  },
  {
    trigger: ['juice', 'عصير'],
    suggests: ['croissant', 'cake', 'shisha', 'sandwich'],
    title: 'Fresh pairing',
    reason: 'Goes down easy',
  },
];

/**
 * Given a menu item name, return matched bundle rule (or null).
 * Most specific rules (longer triggers) win to avoid e.g. "marlboro" catching
 * before "marlboro red".
 */
export function findBundleRule(itemName: string): BundleRule | null {
  const lower = itemName.toLowerCase();
  let best: { rule: BundleRule; len: number } | null = null;
  for (const rule of BUNDLE_RULES) {
    for (const t of rule.trigger) {
      if (lower.includes(t.toLowerCase())) {
        if (!best || t.length > best.len) {
          best = { rule, len: t.length };
        }
      }
    }
  }
  return best?.rule || null;
}

/**
 * Fallback: generic "goes well with" rule used when no specific match exists.
 * Guarantees every item triggers a suggestion popup as long as the menu
 * contains any of these common companion items.
 */
const FALLBACK_RULE: BundleRule = {
  trigger: ['__fallback__'],
  suggests: [
    // Drinks
    'cola', 'pepsi', 'sprite', '7up', 'water', 'juice',
    // Smokes
    'marlboro', 'winston', 'cigarette',
    // Hot
    'coffee', 'karak', 'tea',
    // Sweets
    'chocolate', 'cookie', 'cake', 'brownie',
    // Savory
    'chips', 'fries',
  ],
  title: 'Add something extra?',
  reason: 'These go great with almost anything',
};

export function findBundleRuleWithFallback(itemName: string): BundleRule {
  return findBundleRule(itemName) || FALLBACK_RULE;
}

/**
 * Given a bundle rule and the full menu, return actual menu items
 * that match the suggested substrings and aren't already in cart.
 */
export function getBundleSuggestions(
  rule: BundleRule,
  menu: Array<{ id: string; name: string; price: number; image?: string; available?: boolean }>,
  currentCartIds: string[],
  excludeItemId?: string,
): Array<{ id: string; name: string; price: number; image?: string }> {
  const lowerSuggests = rule.suggests.map(s => s.toLowerCase());
  return menu
    .filter(item => {
      if (item.id === excludeItemId) return false;
      if (currentCartIds.includes(item.id)) return false;
      if (item.available === false) return false;
      const lowerName = item.name.toLowerCase();
      return lowerSuggests.some(s => lowerName.includes(s));
    })
    .slice(0, 4);
}
