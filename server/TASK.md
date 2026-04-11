# TASK: Fix XP System, Chest Discounts, Cost Per Hour, Chest Animation, Sell Values

## Context
This is a Next.js kiosk app for an internet cafe. The mobile app at /private/tmp/ninja-games-app/lib/xp.ts has the XP system already defined but the kiosk doesn't use it at all.

## Issues to Fix

### 1. XP System Not Working
- Copy the XP system from /private/tmp/ninja-games-app/lib/xp.ts to src/lib/xp.ts
- Add XP display to the KioskDashboard sidebar (level, XP bar, title from level)
- Add XP display to ProfileTab (level badge, XP progress, current perks)
- The XP is calculated dynamically from player stats (calculateTotalXP function) — no separate XP field needed

### 2. Chest Discounts Not Applied
- In ChestsTab, use getLevelInfo to get chestDiscount percentage
- Show discounted price on chests (original price crossed out, new price shown)
- Actually charge the discounted price when opening
- Show "X% OFF" badge on chests if player has a discount

### 3. Cost Per Hour Not Implemented  
- The COINS_PER_HOUR constant is 200 and coin packages reflect this
- But there's no visible "cost per hour" display or level-based cost reduction
- Add to the sidebar: show effective cost/hour based on player level (coinRateBonus from xp.ts)
- Actually apply the coinRateBonus — players with bonus should have their coins drain SLOWER
- In KioskDashboard's coin deduction interval, reduce the COINS_PER_MINUTE by the coinRateBonus %
- Update minutesLeft calculation to reflect the bonus

### 4. Chest Opening Sliding Animation
- The current spinning roulette animation exists but make sure it works properly
- The spin strip should be visually smooth and land on the correct reward
- Add a tick/click sound effect feel with a subtle CSS pulse on each card as it passes center
- Make sure the indicator arrows are clearly pointing at the winning card when stopped

### 5. Sell Value Correctness
- Currently sells at 80% of item.value — this is fine
- BUT: the InventoryItem TypeScript interface in types/index.ts is MISSING the `value` field
- Add `value?: number` to InventoryItem interface
- Also verify that chest rewards save value correctly to inventory (they do in ChestsTab openChest)
- In the sell modal, show what the item is worth more clearly

## Files to modify:
- src/lib/xp.ts (CREATE - copy from mobile app)
- src/types/index.ts (add value to InventoryItem)
- src/components/kiosk/KioskDashboard.tsx (add XP display, apply coin rate bonus)
- src/components/kiosk/tabs/ChestsTab.tsx (apply chest discount, verify animation)
- src/components/kiosk/tabs/ProfileTab.tsx (add XP/level display)
- src/components/kiosk/tabs/InventoryTab.tsx (verify sell value display)

## Important:
- Import getLevelInfo and calculateTotalXP from '@/lib/xp'
- The XP is calculated from existing player stats — no DB migration needed
- Keep the existing visual style (dark theme, ninja-green accents, glass morphism)
- Don't break existing functionality
