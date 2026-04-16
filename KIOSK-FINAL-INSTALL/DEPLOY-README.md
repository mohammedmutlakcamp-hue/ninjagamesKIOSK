# Ninja Games Kiosk — Deployment Package (April 2026)

Everything you need to bring up a new gaming center site.

## What's in this folder

```
Ninja Games Kiosk Final 2026/
├── server/                       Next.js LAN web server (port 3000)
├── kiosk-source/                 C# WPF client source code
├── client/                       Pre-compiled NinjaKiosk.exe (self-contained, ~326 MB)
├── NinjaKiosk-LAN-Setup.bat      Run on the SERVER PC (firewall + Node setup)
├── NinjaKiosk-Client-Setup.bat   Run on each CLIENT PC
├── START-KIOSK.bat               Quick-launch the kiosk client
├── CLAUDE.md                     Full project documentation
└── DEPLOY-README.md              You are here
```

## Quick start on a new PC

### Server PC (the one running Next.js for the LAN)

1. Install Node.js 18+ from nodejs.org
2. `cd server && npm install` (rebuilds node_modules — takes ~5 minutes)
3. `npm run build`
4. Right-click `NinjaKiosk-LAN-Setup.bat` → Run as administrator (opens port 3000)
5. `npx next start -H 0.0.0.0 -p 3000`
6. Find your LAN IP: `ipconfig` — note the IPv4 address
7. Test: open `http://<your-lan-ip>:3000/kiosk` in a browser

### Client PCs (gaming stations)

1. Install .NET 8 Runtime from microsoft.com (only if not building from source)
2. Right-click `NinjaKiosk-Client-Setup.bat` → Run as administrator
3. **Easiest**: compile the installer (see below) and run `NinjaKiosk-Setup.exe`. It auto-registers the PC, installs to Program Files, sets up auto-start, and optionally replaces the Windows shell.
4. **Or** copy the entire `client/` folder anywhere and double-click `NinjaKiosk.exe`. First run shows a setup dialog asking for the PC name.

## Building the installer

The installer script is at `kiosk-source/installer.iss`. To compile it:

1. Download Inno Setup 6 (free) from https://jrsoftware.org/isdl.php
2. After install, run:
   ```
   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" kiosk-source\installer.iss
   ```
3. Output: `NinjaKiosk-Setup.exe` in the deployment folder root.

## Rebuilding the kiosk client from source

```
cd kiosk-source/NinjaKiosk
dotnet publish NinjaKiosk.csproj -c Release -r win-x64 --self-contained true
```

Then copy `bin/Release/net8.0-windows/win-x64/publish/*` over `client/`.

## What's new in this build (April 2026)

### Per-player session persistence
Each player has their own folder at `D:\NinjaKioskPlayers\{uid}\` that survives PC reboot. When a player logs into the kiosk:

- **Chrome / Edge / Discord / FACEIT / OBS / VS Code**: launched with `--user-data-dir` flag pointing to the player's folder. Their logins, cookies, and history persist between sessions.
- **Steam**: NTFS junction points swap `Steam/config` and `Steam/userdata` to the player's folder. Their Steam Guard, library, and cloud saves are theirs.

When the player logs out, their state is detached cleanly. The next player gets a clean slate or, if they've used this PC before, their own state restored. Tracked in `kiosk-source/NinjaKiosk/PlayerSession.cs`.

### Live admin view (every 5 seconds)
The kiosk client uploads a JPEG screenshot of the primary screen to `pcs/{stationId}.screenshot` (base64) every 5 seconds when the player is unlocked. The admin panel can show this as a near-live preview of every PC.

Admin can also send `command=screenshot` to `pcs/{stationId}` to force an immediate capture.

### Player session history
Every login writes a doc to `sessions/{id}` with:
```
{ playerId, playerName, pcId, startedAt, endedAt, durationSec, active }
```
Every logout patches `endedAt`, `durationSec`, and `active=false`. The PC doc is also patched with `currentPlayerId` / `currentPlayerName` / `sessionStartedAt` so admin can see who's sitting at each PC right now.

### Remote command execution
The kiosk polls `pcs/{stationId}.command` every 5 seconds. Set the `command` field to any of these and it'll execute on the next poll:

| Command | Effect |
|---|---|
| `lock` | Lock the PC (player session ends) |
| `unlock` | Unlock the PC |
| `restart` | shutdown.exe /r |
| `shutdown` | shutdown.exe /s |
| `force-logout` | End session + reload kiosk |
| `screenshot` | Capture and upload immediately |
| `lockdown` | Hide taskbar + disable Ctrl+Alt+Del |
| `fullaccess` | Re-enable taskbar + Ctrl+Alt+Del |
| `freeze:<message>` | Freeze the kiosk with a message |
| `show-message:<text>` or `message:<text>` | Show a popup on the kiosk |
| `run-cmd:<shell>` | Run an arbitrary shell command (cmd.exe /c) |
| `kill-app:<name>` | Kill a process by name (e.g. `kill-app:steam`) |

### PC auto-registration on install
The Inno Setup installer asks for a PC name on the install wizard. When the kiosk first launches, it registers in Firestore at `pcs/{normalized-name}` with `name`, `status`, `online`, `createdAt`, `command`, `timeRemaining`. The PC immediately appears in the admin panel.

### Task Manager
**Currently UNLOCKED for the debug launch period.** Re-enable later by:
1. Uncommenting the `DisableTaskMgr` line in `kiosk-source/NinjaKiosk/MainWindow.xaml.cs` `DisableCtrlAltDel()`
2. Uncommenting the matching block in the keyboard hook (`HookCallback`)
3. Adding the registry entry to `installer.iss`

### Icon
The kiosk now uses `kiosk-source/NinjaKiosk/ninja.ico` (multi-size 16/32/48/64/128/256, generated from the Ninja Games logo). Shown on the taskbar, system tray, .exe, and installer.

## What needs to be done next (admin panel side)

The kiosk client writes all the data above. The admin panel needs to be updated to **read** it:

1. **Live screen tile**: render `pcs/{id}.screenshot` as `<img src={"data:image/jpeg;base64," + screenshot} />` for each PC card
2. **"Sitting now" pill**: show `pcs/{id}.currentPlayerName` on each PC card
3. **History tab**: query `sessions` collection ordered by `startedAt desc`, show as a list with player name + PC + duration
4. **Command buttons**: each PC card gets buttons that write to `pcs/{id}.command` — Send Message, Lock, Restart, Run Command, etc.

These are admin panel UI tasks (`server/src/app/ghanimadmin/`) — separate from the kiosk client work in this package.

## Pre-launch checklist (shop deploy)

### Server PC
1. **Static IP** — assign a fixed LAN IP (e.g. `192.168.1.10`) in Windows network settings, AND add a DHCP reservation in the router. The C# clients scan `.1`–`.50` for port 3000; the server must be in that range.
2. **Open firewall port 3000** — `NinjaKiosk-LAN-Setup.bat` does this; re-run as admin if `npm start` reports port issues.
3. **Run server on `0.0.0.0`** — never `localhost`. The CLAUDE.md `init` flow does this. Verify with `netstat -ano | findstr :3000`.
4. **Health check** — once running, hit `http://<server-ip>:3000/api/health` from another PC. Should return `{ "ok": true }`.

### Client PCs
1. **DHCP reservations** — give each PC a stable IP via the router so PC names line up with seats.
2. Run `INSTALL.bat` as admin once per PC. The wizard:
   - Asks for PC name (becomes Firestore `pcs/{id}` doc id)
   - Registers the PC in Firestore
   - Auto-scans for installed games and pushes the catalog to `pcs/{id}.installedGames` (admin → PC → Info tab to view)
   - Adds an autostart entry under `HKCU\...\Run` so the kiosk launches on login

### Firestore rules
Open rules ship in `server/firebase.rules.json`. The tightened production set is in `firestore.rules` (root). Deploy with:
```bash
firebase login
firebase deploy --only firestore:rules
```
The web UI signs in anonymously on load (`server/src/lib/firebase.ts`) so the tightened rules don't break unauthenticated kiosk usage.

### Initial seed (one-time)
- Menu items — POST to `/api/seed-menu` from a logged-in admin browser, OR run `node scripts/seed-menu.js` from the server.
- Admin user — set the custom claim on a Firebase Auth account once: `firebase auth:set-custom-user-claims <uid> '{"admin": true}'`.

### Monitoring
- External: point UptimeRobot at `https://ninjagamesjo.com/api/health` for cloud, `http://<lan-ip>:3000/api/health` for LAN.
- Internal: each PC's `pcs/{id}.lastSeen` updates every 30s (heartbeat). Admin → PCs view shows online/offline.

### Re-scan installed games at any time
Admin → PCs → select a PC → Controls tab → **Re-scan**. The C# kiosk re-runs `GameDiscovery.ScanInstalled()` and pushes the new list back to Firestore.

