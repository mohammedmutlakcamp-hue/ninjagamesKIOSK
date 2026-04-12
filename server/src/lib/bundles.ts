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
  {
    trigger: ['cigarette', 'cigarettes', 'marlboro', 'دخان', 'سجائر'],
    suggests: ['karak', 'tea', 'coffee', 'شاي', 'قهوة'],
    title: 'Classic combo',
    reason: 'Smoke goes great with a hot drink',
  },
  {
    trigger: ['karak', 'tea', 'شاي'],
    suggests: ['cigarette', 'cookie', 'biscuit', 'croissant', 'بسكوت'],
    title: 'Make it perfect',
    reason: 'Tea is even better with a snack',
  },
  {
    trigger: ['coffee', 'espresso', 'latte', 'cappuccino', 'قهوة'],
    suggests: ['cigarette', 'croissant', 'cookie', 'cake', 'muffin'],
    title: 'Coffee break',
    reason: 'Add a little something on the side',
  },
  {
    trigger: ['shisha', 'hubbly'],
    suggests: ['juice', 'water', 'soda', 'cola', 'pepsi', 'عصير'],
    title: 'Hydrate while you smoke',
    reason: 'Drinks pair well with hubbly',
  },
  {
    trigger: ['burger', 'sandwich', 'chicken', 'pizza'],
    suggests: ['fries', 'soda', 'cola', 'pepsi', 'juice', 'water'],
    title: 'Complete the meal',
    reason: 'Add a side and a drink',
  },
  {
    trigger: ['fries', 'chips', 'nuggets'],
    suggests: ['burger', 'sandwich', 'soda', 'cola', 'ketchup'],
    title: 'Good call',
    reason: 'Make it a full snack session',
  },
  {
    trigger: ['energy', 'redbull', 'red bull', 'monster'],
    suggests: ['cigarette', 'chips', 'chocolate'],
    title: 'Gamer fuel',
    reason: 'Lock in for a long session',
  },
];

/**
 * Given a menu item name, return matched bundle rule (or null).
 */
export function findBundleRule(itemName: string): BundleRule | null {
  const lower = itemName.toLowerCase();
  for (const rule of BUNDLE_RULES) {
    if (rule.trigger.some(t => lower.includes(t.toLowerCase()))) {
      return rule;
    }
  }
  return null;
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
    .slice(0, 4); // max 4 suggestions per popup
}
