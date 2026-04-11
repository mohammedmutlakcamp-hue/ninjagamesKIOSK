# NinjaKiosk - Complete Project

## INIT COMMAND
When the user says "init", do ALL of these steps:

### 1. Install server dependencies (if missing)
```bash
cd "C:\Users\vip-2\Desktop\Ninja Kiosk Final\server"
npm install    # only if node_modules is missing
npm run build  # only if .next is missing
```

### 2. Start the LAN server
```bash
cd "C:\Users\vip-2\Desktop\Ninja Kiosk Final\server"
npx next start -H 0.0.0.0 -p 3000
```
Kill any existing process on port 3000 first. Run this in background. Verify port 3000 is listening.

### 3. Show the user their LAN IP
Run `ipconfig | findstr "IPv4"` and show:
- Kiosk URL: `http://{IP}:3000/kiosk`
- Mobile App: `http://{IP}:3000/app`
- Admin: `http://{IP}:3000/ghanimadmin`

### 4. Optionally launch the kiosk client
Ask the user if they want to launch NinjaKiosk.exe from `client/`.
**WARNING**: The kiosk locks the PC. Exit phrase: type `ghanemexit` on keyboard.

### 5. Read this file for TODO/NEXT STEPS
Check the bottom of this file for current tasks.

---

## PROJECT STRUCTURE

```
Ninja Kiosk Final/
├── server/                    # Next.js 14 LAN web server (port 3000)
│   ├── src/app/kiosk/         # Main kiosk UI page (login, register, welcome, dashboard)
│   ├── src/app/app/           # Mobile PWA route (/app)
│   │   ├── layout.tsx         # PWA metadata, apple-web-app, viewport, icons
│   │   └── page.tsx           # Mobile login/register/welcome/dashboard flow
│   ├── src/app/info/          # Info/linktree page
│   ├── src/app/reserve/       # Reservation page
│   ├── src/app/ghanimadmin/   # Admin panel
│   ├── src/app/api/           # API routes (game stats, notifications)
│   │   └── notifications/     # POST route for sending push notifications
│   ├── src/components/
│   │   ├── kiosk/             # PC kiosk components
│   │   │   ├── KioskDashboard.tsx   # Main dashboard (sidebar, tabs, modals)
│   │   │   ├── RegisterScreen.tsx   # Player registration
│   │   │   ├── TopUpScreen.tsx      # Top-up when coins = 0
│   │   │   ├── ChatBubble.tsx       # Chat UI
│   │   │   ├── FriendNotification.tsx # Friend online/playing toasts
│   │   │   ├── MatchReportModal.tsx  # Match report modal
│   │   │   └── tabs/
│   │   │       ├── GamesTab.tsx     # Main games view (hero, carousel, sidebar)
│   │   │       ├── ChestsTab.tsx    # Chest opening/rewards
│   │   │       ├── FoodTab.tsx      # Food & drinks ordering
│   │   │       ├── ProfileTab.tsx   # Player profile & settings
│   │   │       ├── LeaderboardTab.tsx # Top players
│   │   │       ├── InventoryTab.tsx  # Player inventory
│   │   │       ├── TournamentTab.tsx # Tournaments
│   │   │       ├── MiniGamesTab.tsx  # Built-in mini games
│   │   │       ├── DailyTasksTab.tsx # Daily tasks/challenges
│   │   │       ├── FriendsTab.tsx    # Friends list & management
│   │   │       └── SoftwareTab.tsx   # Software/apps launcher
│   │   └── mobile/            # Mobile PWA components
│   │       ├── MobileDashboard.tsx   # 5 tabs: Home, Chests, Friends, Tasks, Profile
│   │       └── MobileRegister.tsx    # Mobile registration (2-step: info → ninja picker)
│   ├── src/lib/
│   │   ├── games-catalog.ts   # All 47 game definitions
│   │   ├── firebase.ts        # Firebase config
│   │   ├── onesignal.ts       # OneSignal client init + notification helpers
│   │   ├── notifications.ts   # Game start notification (notifyFriendsGameStart)
│   │   ├── constants.ts       # COINS_PER_MINUTE, etc.
│   │   ├── translations.ts    # AR/EN translations
│   │   ├── xp.ts              # XP & level calculations
│   │   └── daily-tasks.ts     # Daily task tracking
│   ├── public/
│   │   ├── manifest.json      # PWA manifest (standalone, portrait, /app scope)
│   │   ├── OneSignalSDKWorker.js # OneSignal service worker
│   │   ├── img/
│   │   │   ├── icon-192.png   # PWA icon 192x192
│   │   │   ├── icon-512.png   # PWA icon 512x512
│   │   │   ├── apple-touch-icon.png # iOS home screen icon 180x180
│   │   │   ├── login-bg.mp4   # Mobile login video background
│   │   │   ├── logo-ninja.png # Main logo
│   │   │   ├── chest-*.png    # Chest images (bronze, silver, gold, legendary, ninja)
│   │   │   └── pfp-*.png      # Avatar images (neon, fire, ice, shadow, cyber, etc.)
│   │   └── games/             # Game images (47 games, each has card + banner)
│   │       ├── {id}.jpg       # Card images (400x550 portrait)
│   │       └── {id}-banner.jpg # Banner images (1920x600 landscape)
│   ├── package.json           # Next.js 14, React 18, Firebase, Tailwind, Framer Motion
│   ├── .env.local             # API keys (DO NOT COMMIT) — see ENV VARS section
│   └── vercel.json            # Vercel config
│
├── client/                    # Compiled C# WPF kiosk app (.NET 8.0 self-contained, 326MB)
│   ├── NinjaKiosk.exe         # Main executable
│   ├── START.bat              # Quick launcher
│   └── [runtime DLLs]        # .NET 8.0 + WebView2 runtime
│   NOTE: client/ is gitignored (too large). Rebuild from kiosk-source/ if needed.
│
├── kiosk-source/              # C# source code for the kiosk client
│   ├── NinjaKiosk/
│   │   ├── MainWindow.xaml.cs # Core logic (keyboard hooks, session, game launch, LAN scan)
│   │   ├── FirestoreService.cs# Firebase REST API integration
│   │   ├── SetupWindow.xaml.cs# PC name/ID setup dialog
│   │   └── NinjaKiosk.csproj  # .NET 8.0, WebView2 dependency
│   └── installer.iss          # Inno Setup installer script
│
├── .gitignore                 # Excludes: client/, node_modules, .next, bin/obj, .env
├── NinjaKiosk-LAN-Setup.bat   # Run on SERVER PC (firewall rules for port 3000)
├── NinjaKiosk-Client-Setup.bat # Run on CLIENT PCs (firewall + WebView2 check)
├── START-KIOSK.bat            # Quick-launch the C# kiosk client
├── CLAUDE.md                  # THIS FILE
└── README.md                  # Human-readable setup guide
```

## HOW THE SYSTEM WORKS

1. **Server PC** runs the Next.js web server on port 3000 (serves the kiosk web UI)
2. **Client PCs** run NinjaKiosk.exe (C# WPF app with WebView2)
3. C# app auto-scans LAN subnet (.1-.50) for port 3000, verifies `/kiosk` endpoint
4. If LAN server found → LAN mode (fast, works offline)
5. If not found → falls back to cloud: `https://www.ninjagamesjo.com/kiosk`
6. Server IP cached in `%APPDATA%\ninja-games-kiosk\lan-config.json`

## WEB BRIDGE API
The kiosk web UI communicates with the C# app via `window.electronAPI`:
- `sessionLogin()` / `sessionLogout()` — Lock/unlock PC for customer
- `launchGame(gameId, exePath)` — Launch a game (Steam, Epic, Riot, Roblox, Battle.net, FiveM, direct .exe)
- `returnToKiosk()` — Bring kiosk to front
- `lockPC()` / `unlockPC()` — Manual lock/unlock
- `restartPC()` / `shutdownPC()` — System control
- `killSwitch()` — Exit kiosk entirely
- `playerLogin(data)` / `playerLogout()` — Player session tracking
- `getPcInfo()` / `onPcInfo()` — Get PC identity (name, docId)

## KEY FEATURES
- Chest reward system (bronze/silver/gold/legendary/ninja) with roulette spin animation
- Firebase Firestore backend (project: ninja-games-kiosk)
- Multi-language support (Arabic + English)
- Player coin system, XP, levels, daily tasks
- Game launching (Steam, Epic, Riot, Roblox, Battle.net, FiveM, direct exe)
- PC lockdown (keyboard hooks, taskbar hide, registry locks)
- Admin panel at /ghanimadmin
- Friends system with online status notifications
- Send coins between players
- Food & drinks ordering
- Match report system
- Inventory & gifting system
- Push notifications via OneSignal

## MOBILE PWA (/app)
- Route: `/app` — iOS + Android PWA (Add to Home Screen)
- URL: `https://www.ninjagamesjo.com/app`
- Login screen with video background (`/img/login-bg.mp4`)
- 5 tabs: **Home, Chests, Friends, Tasks, Profile**
- **NO games tab** — games are PC-only on the kiosk
- iOS optimized: safe-area-inset-top/bottom, standalone, black-translucent status bar
- PWA manifest: `public/manifest.json` (standalone, portrait, scope /app)
- Icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- Components in `src/components/mobile/`:
  - `MobileDashboard.tsx` — Main dashboard with bottom nav, real-time Firestore listener
  - `MobileRegister.tsx` — 2-step registration (info → ninja type picker)
- Features: view coins/time, open chests, friends list, send coins, daily tasks, leaderboard, change ninja type

## PUSH NOTIFICATIONS (OneSignal)
- OneSignal SDK loaded on `/app` page mount
- Auto-prompts for notification permission on login
- Players registered with OneSignal using external_id = Firestore UID
- Config: `src/lib/onesignal.ts` (client init + all notification helpers)
- Game start notifications: `src/lib/notifications.ts` (notifyFriendsGameStart)
- REST API route: `/api/notifications` (POST) for admin panel
- **Notification triggers:**
  - Friend comes online → `notifyFriendOnline()`
  - Friend starts playing a game → `notifyFriendPlaying()` / `notifyFriendsGameStart()`
  - Coins received → `notifyCoinsReceived()`
  - Chest/gift received → `notifyChestReceived()`
  - Daily tasks reset → `notifyDailyTasksReset()`
  - Admin custom → `notifyCustom()`
- Admin panel: "Notifications" tab — send to all or specific player, quick templates

## ENV VARS (server/.env.local)
```
# Firebase (required)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ninja-games-kiosk
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# OneSignal Push Notifications
NEXT_PUBLIC_ONESIGNAL_APP_ID=      # Public app ID (client-side)
ONESIGNAL_REST_KEY=                 # REST API key (server-side only)

# Game Stats API Keys (optional)
STEAM_API_KEY=
HENRIK_API_KEY=
FORTNITE_API_KEY=
RIOT_API_KEY=
```
These same vars must be set in Vercel project settings for production.

## GAMES TAB LAYOUT (GamesTab.tsx) — PC KIOSK ONLY
- **Left sidebar**: Game list with search, software shortcuts
- **Center top**: Hero game banner (featured games rotate every 6s, or shows selected game)
- **Center bottom**: Suggested games carousel (5 visible cards, auto-scrolls in loop)
- **Right panel**: Friends list, Add Credit, Rewards buttons; Chest/rewards section below
- **DETAILS button**: Opens game info modal (genre, players, rating, play button)
- Hero takes 55% height, suggested games take 45%

## GAME IMAGES
All 47 games have both card and banner images in `server/public/games/`:
- Card: `/games/{id}.jpg` (400x550 portrait) — used in game cards/sidebar
- Banner: `/games/{id}-banner.jpg` (1920x600 landscape) — used in hero section
- Defined in `src/lib/games-catalog.ts` with `coverImage` and `bannerImage` fields

## BUILD COMMANDS

### Rebuild the Next.js server
```bash
cd server
rm -rf .next/cache    # clear image cache if images changed
npm install
npm run build
```

### Rebuild the C# kiosk client
```bash
cd kiosk-source
dotnet publish NinjaKiosk/NinjaKiosk.csproj -c Release -r win-x64 --self-contained true
```
Copy output from `kiosk-source/NinjaKiosk/bin/Release/net8.0-windows/win-x64/publish/` to `client/`

### Build installer (requires Inno Setup 6)
```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" kiosk-source/installer.iss
```

## ADMIN ACCESS
- Player "مالبورو" has Admin Panel button in GamesTab sidebar
- Hidden phrase `ghanemadmin` on login screen for anyone
- Admin panel at `/ghanimadmin` (requires Firebase auth)
- Admin features: PCs, Players, Top Ups, Menu, Orders, Tournaments, Revenue, Notifications, Settings

## GITHUB & DEPLOYMENT
- GitHub repo: https://github.com/mohammedmutlakcamp-hue/ninjagamesKIOSK
- Branch: main
- Vercel connected to this repo, **Root Directory: `server`**
- "Include files outside root directory" is ENABLED in Vercel
- Domain: ninjagamesjo.com
- `/app` = mobile PWA, `/kiosk` = PC kiosk, `/ghanimadmin` = admin
- All env vars set in Vercel project settings (Firebase + OneSignal)
- `client/` is gitignored (326MB compiled .NET app)

## MULTI-PC SYNC (LAN SHARED FOLDER)
This project folder is shared on the LAN. Multiple PCs may edit files simultaneously.
- **ALWAYS read `CLAUDE-SYNC.md`** at the start of every session and before editing files
- **ALWAYS append to `CLAUDE-SYNC.md`** after making any file changes
- **ALWAYS re-read a file** before editing it — another PC may have changed it
- This prevents conflicts between Claude instances running on different machines

## IMPORTANT NOTES
- Exit phrase for kiosk: type `ghanemexit` on keyboard
- Admin phrase: type `ghanemadmin` on login screen
- Cloud URL: `https://www.ninjagamesjo.com/kiosk`
- Mobile URL: `https://www.ninjagamesjo.com/app`
- Firebase project: `ninja-games-kiosk`
- Kiosk scans LAN .1-.50 on port 3000
- Server must bind to `0.0.0.0` (not localhost) for LAN access
- When replacing images, ALWAYS clear `.next/cache` before rebuilding
- Use `<img>` tag (not Next.js `Image`) for chest images to avoid aggressive caching

## FOR NEW PCs / AFTER RESET
1. Install Node.js from nodejs.org
2. Install .NET 8.0 Runtime (if running C# source, not needed for compiled client)
3. Run `NinjaKiosk-LAN-Setup.bat` as admin on the server PC
4. Run `NinjaKiosk-Client-Setup.bat` as admin on client PCs
5. Say "init" to Claude to start everything

## RECENT MAJOR CHANGES (April 2026 sessions)

### UI System
- **ninja-btn CSS system**: 8 color variants with hover effects. Applied to ALL buttons.
- **NinjaInput component**: Animated green conic-gradient border. Applied to ALL inputs.
- **kiosk-popup**: Now uses simple conditional rendering (no AnimatePresence) to prevent ghost overlay bugs. All inner modals use `absolute` not `fixed`.
- **rarity-ribbon CSS**: Corner badges for epic/legendary/mythic items.

### Store (StoreTab.tsx) — Full Redesign
- **Left sidebar nav**: Colored animated buttons for SKINS/CHESTS/TIME/COINS tabs
- **Skins tab**: 4 category showcase cards (Rare/Epic/Legendary/Mythic) with progress bars, click to filter. Quick filter pills for All/Starter/Country. "Your Collection" section with 140x180px cards showing owned skins with big 96px profile images. Collection Rewards system (collect X skins of a tier for bonus).
- **Chests tab**: Full replica of ChestsTab — CS:GO roulette, confirm modal, bulk open x3/x5/x10, fast mode toggle, all within the store popup. Uses `absolute` overlays (not `fixed`).
- **Time tab**: Radio-button style like TopUp modal. Buy Time adds coins to balance (not freePlayUntil). Discount packages.
- **Coins tab**: Radio-button style for JOD packages. Info cards (rate, play cost, fee). VIP promo card at bottom.
- **onClose prop**: Store passes `onClose` to handle navigation to other tabs (e.g., chests → switch-tab).

### Chest System (ChestsTab.tsx) — Full Rewrite
- **Real Firestore data**: `chest-drops` collection tracks every drop. "Last Opened" shows player's real drops. "Lucky Players" shows all rare+ drops from everyone (no dummy data).
- **Bulk open**: x3, x5, x10 buttons in confirm modal. Opening phase shows progress bar + cards flipping in. Reveal phase shows stat summary (coins/skins/vouchers/rare+) + all reward cards.
- **Fast Mode toggle**: Skip animation, go straight to reveal.
- **Skip button**: Appears 0.5s into spin animation.
- **Wider confirm modal**: 850px, rewards in single scrollable row.
- **Both sidebar and right panel** open the same ChestsTab popup.

### Inventory (InventoryTab.tsx) — Full Redesign
- **Vertical sidebar categories**: ALL, SKINS, VOUCHERS, BOOSTS, GIFTS with animated active indicators, color-coded icons, item counts per category.
- **Bigger photos**: 200px min columns, 300px tall cards, 44px skin images in cards, 44px in detail modal.
- **Non-tradeable badge**: "NON-TRADEABLE" with lock icon on top-right.
- **Gift from friend**: "from {username}" purple badge on gifted items.
- **Equipped badge**: Bottom-left (doesn't overlap rarity ribbon).
- **Select button**: Next to search bar in same row.
- **Pagination at bottom**: "Page X/Y" with Prev/Next, only shows if multiple pages.
- All modals use `absolute` positioning.

### Food & Drinks (FoodTab.tsx) — Full Redesign
- **17 real food photos** in `public/img/menu/` (downloaded from Unsplash).
- **Menu seeded** with image paths via `/api/seed-menu` POST (27 items).
- **Restaurant-style layout**: "All Menu" groups by sections (DRINKS/SNACKS/FOOD) with colored headers.
- **Real food photos** in cards with gradient overlay, prep time badge.
- **Floating order tracker**: Bottom-right floating button when orders are active. Expands to show all active orders with live status (PENDING → PREPARING → READY). Auto-shows on order placement.

### Social Hub (FriendsTab.tsx) — Full Redesign
- **Friends tab hidden** from left sidebar nav.
- **3 styled buttons**: FRIENDS (green), MESSAGES (blue), GROUPS (purple) with color-coded hover/active states.
- **Friend requests as toast bubbles**: Compact inline notifications with avatar, accept/decline. Appear on all views.
- **Messages tab**: Shows all friends sorted by recent message, click to open DM.
- **Groups tab**: Create groups, group chat, group voice calls.

### Chat System (ChatBubble.tsx) — Major Upgrade
- **Group chats**: Create groups, add members, leave group, system messages.
- **Group voice calls**: WebRTC mesh network, add person mid-call, participant count.
- **Add to call**: Button to add friends to active call.
- **Group info bar**: Shows member count + leave button.
- **Push notifications**: For group messages to all members.

### Voice Calls
- **Group calls**: Multi-participant WebRTC with mesh topology.
- **Add person to active call**: Creates new peer connection per participant.
- **Call banner**: Shows participant count for group calls.

### Right Panel (GamesTab.tsx) — Reordered
- **Order**: 1. Rewards/Chest card → 2. Friends + Send Coins buttons → 3. Friends list → 4. Chat button
- **Friends section**: Full functionality — search, friend request toasts, hover message/call buttons per friend.
- **No more** Inventory/Open Chests buttons (removed).
- **Claim + Tasks** buttons side by side in rewards card.

### Left Sidebar
- **TIME + CREDIT buttons** side by side below the timer.
- **Free time timer swap**: When free play active, sidebar timer swaps to glowing green countdown with sparkle icon. Normal timer returns when free play ends.

### Admin Panel
- **Order popup notification**: New orders trigger popup with chime sound, pulsing border, quick Accept & Prepare / Cancel buttons. Auto-dismiss 15s.
- **Orders grouped by status**: NEW ORDERS (pulsing bell), PREPARING, READY FOR PICKUP sections.
- **Status summary pills**: Count of pending/preparing/ready in header.

### Popup System Fix
- **No more AnimatePresence** on popup wrapper — simple conditional rendering prevents ghost overlays.
- **All inner modals** in tabs use `absolute inset-0` (not `fixed`) so they're contained within the popup.
- **Cleanup on unmount**: StoreTab resets roulette/modal state on unmount.

### Pricing
- Play: 100/1h, 250/3h, 500/7h, 1000/15h
- Coins: 100/1JD, 550/5JD, 1150/10JD
- Buy Time: Converts coins to playtime coins (pays X, gets hours×150 coins)

### Known Issues / Missing
- `hashshashin` skin uses samurai image as placeholder
- 5 skins have no welcome video yet
- Chest "Last Opened" section needs data — opens are now tracked in `chest-drops` collection, will populate as players open chests
- Creator tools need real launcher icons

### Latest Session Changes (continued)
- **ChestsTab fully redesigned**: Clean pick phase (select chest → pick amount x1/x3/x5/x10 → one big open button), CS:GO spin, single reveal card, bulk reveal with staggered card flip animations. No more separate confirm modal.
- **TournamentTab redesigned**: Game banner images from GAMES_CATALOG, status badges (LIVE/OPEN/ENDED), winner display for completed, filter tabs (ALL/ACTIVE/PAST), detail modal with banner header + 4-stat grid + results + brackets
- **Level badge**: Gaming-style — conic-gradient ring showing XP progress around profile photo, hexagon shield badge with level number
- **Sidebar**: Language (left) — Profile (center) — Settings (right) layout, tokens+time stacked vertically, free play has pulsing green glow + "FREE" banner, leaderboard removed from sidebar
- **Right panel**: Tournament card with active tournament preview + COMPETE/LEADERBOARD buttons, compact chat button, friends/daily-tasks/leaderboard removed from sidebar nav
- **Store**: Country ninja card added, default filter is country, chests+time tabs removed from store
- **Food popup**: Uses `kiosk-popup-large` (thinner)
- **Free time reset**: Script to reset freePlayUntil for all players via Firestore

### Session 3 Changes (April 6, 2026)
- **PIN system**: Changed from 4-digit to 6-digit across all files. API route `/api/reset-pins` resets all players.
- **Country**: Locked in profile after registration (display only). Modern searchable dropdown on registration screen.
- **Username change**: First 2 free, 3rd+ costs 350 coins. Tracks `usernameChanges` on player doc.
- **Profile photo upload**: "Change Photo" button below avatar in profile. Resizes to 200x200 JPEG base64, stores in `profilePhoto` field on player doc. Accepts all image formats.
- **Inventory**: Back in sidebar nav. Gift/item received popup now opens inventory on click.
- **View Player Info**: Shows full inventory grid (4-col, scrollable), respects privacy settings (lock icon if private). Added Skins count stat.
- **Profile stats**: Added Inventory count, Skins owned, Friends count to quick stats row.
- **Voice calls**: Rebuilt answer system using refs (`incomingCallRef`, `activeCallRef`) to prevent closure/listener race conditions. API route `/api/cleanup-calls` purges stale call docs.
- **Multi-PC sync**: `CLAUDE-SYNC.md` tracks all edits. `RESTART-SERVER.trigger` for remote restart. `sync-watcher.js` monitors both files.
- **Game launch**: Sidebar click shows banner (select-game event). C# client sends `game-launch-result` event. Launch popup: 3 states (spinner/success/failed).
- **Daily tasks bubble**: Fixed clipping, bigger badge, z-50.
- **Card PLAY NOW buttons**: Animated glowing pulse.

### Session 4 Changes (April 8-9, 2026)

#### Token/Time System Overhaul
- **Tokens** = currency bought with JOD (via top-up requests to admin)
- **Time** = bought with tokens via Buy Time modal (1h=100, 3h=250, 7h=500, 15h=1000 tokens)
- **`remainingPlaytime`** field on player doc = minutes left. Deducted every 60s (not coins)
- Login: 0 tokens + 0 time = blocked; tokens + 0 time = auto-shows Buy Time; 0 tokens + time = plays normally
- When time runs out: shows Buy Time (if tokens) or Top-Up (if no tokens)

#### Login Flow
- Username not found = "Create account" link
- Wrong PIN = "Incorrect PIN" (not generic)
- 0 coins = error + TopUpScreen popup after 1s (stays on login)
- Editable player name in top-up request

#### Guest Mode
- Requires admin approval before playing (rate limited 3/min)
- Admin gets full-screen purple popup with time selector (15m-2h)
- Guest coins always 0, no VIP, no rewards saved
- "Become a Ninja" popup when clicking restricted features
- Registration: admin code -> form -> ninja picker -> package picker -> admin approval -> account created
- Firestore collections: `guest-requests`, `guest-register-requests`, `guest-reg-topups`, `guest-approval-codes`

#### Admin Notifications (real-time popups)
- Top-up requests (yellow), guest play requests (purple), guest registration (green), guest reg+topup (purple)

#### Cyberpunk HUD Redesign
- **Buy Time modal**: PCB motherboard traces, animated circuit nodes, HUD corners, bubble particle button
- **Top-Up modal**: Same design with gold/yellow theme
- **Left sidebar**: Dense PCB traces, animated data pulses, grid pattern, neon edge glow, octagonal avatar frame
- **Sidebar nav**: Colored icons per tab (Games=green, Tournaments=red, Chests=cyan, etc.), HUD corners on active
- **Tokens/Time bars**: Fixed-size grid layout (1fr + 90px button), rounded buttons inside bars
- **Daily Tasks**: Cyberpunk cards with per-task colors, HUD corners, segmented progress bar, hexagonal streak badge
- **Inventory**: Animated PCB background, HUD-framed sidebar (300px), HUD corners on cards and modals
- **Profile/Settings**: Octagonal avatar, HUD-framed sections, PCB traces in banner
- **Food & Snacks**: "NINJA KITCHEN" header, cyberpunk bg with PCB traces, pill filter tabs, HUD balance box
- **Logout button**: Red HUD-framed with glow

#### New Tabs
- **Hubbly Bubbly** (shisha) — separate ordering system, 12 flavors, `shisha-orders` collection
- **Food & Snacks** moved to sidebar nav (below Store, above VIP)

#### Other Fixes
- VIP no longer auto-granted on registration
- Guest never shows as VIP
- Close button z-index fixed (z-[100]) for all popups
- Popup size: 20% smaller from all sides
- `MiniGameId` type added, `TaskAction` types extended

### Session 5 Changes (April 10, 2026)

#### Cross-PC Player Session Roaming (PlayerSession.cs)
- **DPAPI key portability**: Chrome/Edge encrypt cookies with machine-specific DPAPI keys. On logout, raw AES key is extracted and saved as `.ninja-raw-key`. On login (any PC), key is re-encrypted with local DPAPI so Chrome can decrypt sessions. Requires `System.Security.Cryptography.ProtectedData` NuGet package.
- **IsServerPc detection fix**: No longer defaults to `true` when no `lan-config.json` exists. Now checks if `NinjaKioskPlayers` SMB share exists on this machine via `net share` command output.
- **Network share access from elevated processes**: Added `net use` fallback when `Directory.Exists` fails on UNC path (elevated admin processes can't see normal user's network shares).
- **Resilient file sync**: `CopyDirectoryRecursive` now wraps file/directory enumeration in try/catch so access-denied errors on individual folders (e.g., Chrome extensions) skip instead of aborting entire sync.
- **Detailed sync logging**: File counts and error counts logged for every pull/push operation.
- **NTFS permissions**: Server's `C:\NinjaKioskPlayers` must have `Everyone:(OI)(CI)F` permissions. Run `icacls C:\NinjaKioskPlayers /grant Everyone:(OI)(CI)F /T` if access denied errors appear in client logs.

#### Install/Uninstall System
- **INSTALL.bat** — Fresh installer for both CLIENT and SERVER PCs. Asks for role, PC name, lockdown mode, server IP. Sets up network, firewall, SMB guest auth, registry, autostart, and launches kiosk.
- **UNINSTALL.bat** — Full uninstaller. Kills kiosk, removes shell replacement, re-enables Task Manager, cleans NTFS junctions + .ninjabak backups, deletes config + player data, removes firewall rules, reverts SMB registry changes.
- Both scripts replace the old `ULTIMATE-SETUP.bat`, `CLEAN-UNINSTALL.bat`, `NinjaKiosk-Client-Setup.bat`, `NinjaKiosk-Client-Network.bat`, `NinjaKiosk-SharePlayers.bat`, `fix-player-share.bat`.

#### Key Architecture Notes
- Server PC: `IsServerPc=true`, uses `C:\NinjaKioskPlayers` directly, no network sync needed
- Client PC: `IsServerPc=false`, pulls from `\\{serverIp}\NinjaKioskPlayers` on login, pushes on logout
- Player data root on client: `D:\NinjaKioskPlayers` (if D: exists) or `C:\ProgramData\NinjaKioskPlayers`
- Chrome sessions roam via DPAPI key re-encryption + junction-swapped profile folders
- The `client/` folder in this project contains the compiled kiosk exe — all PCs should run from this folder (or copy it locally)

## TODO / NEXT STEPS
- Tournament PIN: Require PIN before entering, check for tournament voucher
- Admin player management (see inventory, remove coins, remove items)
- Admin shisha orders panel
- Creator tools / launchers need real icons
- Add welcome videos for epic/legendary/mythic skins
- Test PWA "Add to Home Screen" on iOS Safari
