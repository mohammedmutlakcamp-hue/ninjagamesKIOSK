# Ninja Games Kiosk — Final Install Bundle

Everything you need to deploy the kiosk system to a real shop.

```
KIOSK-FINAL-INSTALL/
├── README.md              ← you are here
├── STAFF-GUIDE.md         ← print this and pin it behind the counter
├── DEPLOY-README.md       ← deeper deploy notes (env vars, security, monitoring)
├── ninja.ico              ← brand asset (used by installer)
│
├── server-pc/             ← run on the ONE PC that hosts the server
│   ├── SETUP.bat          ← one-time install (Node deps + build + firewall)
│   ├── START-SERVER.bat   ← double-click to start the LAN server
│   └── server/            ← (you copy this here — see Server PC step below)
│
└── client-pc/             ← run on every gaming PC
    ├── NinjaKiosk-Setup.exe   ← one-click installer (~97 MB)
    ├── INSTALL-WATCHDOG.bat   ← one-click watchdog registration
    ├── WATCHDOG.bat           ← keeps NinjaKiosk.exe alive
    └── UNINSTALL.bat          ← clean removal
```

---

## 🖥️ Server PC (run once)

The server PC is the one that hosts Firebase data + the kiosk web UI on the LAN. It runs on whichever PC you want — usually a dedicated counter PC.

1. **Install Node.js LTS** from <https://nodejs.org>.
2. **Copy** the project's `server/` folder into `KIOSK-FINAL-INSTALL/server-pc/server/`. (The setup script expects it there.)
3. Right-click **`SETUP.bat`** → Run as administrator. It installs deps, builds the bundle, and opens firewall port 3000.
4. Give the server PC a **static LAN IP** (router DHCP reservation) so client PCs can find it consistently.
5. Double-click **`START-SERVER.bat`** every time you boot the server. (Or set it as a Startup item.)

The server will be reachable at:
- Kiosk:  `http://<server-ip>:3000/kiosk`
- Mobile: `http://<server-ip>:3000/app`
- Admin:  `http://<server-ip>:3000/ghanimadmin`

---

## 🎮 Client PCs (run on each gaming PC)

Each gaming PC needs the kiosk client installed. Two double-clicks total:

1. **`NinjaKiosk-Setup.exe`** — installs the kiosk app, adds desktop shortcut, sets up auto-start, and (optionally) replaces the Windows shell so the PC boots directly into the kiosk. Uses the ninja icon throughout.
2. **`INSTALL-WATCHDOG.bat`** — right-click → Run as administrator. Registers a Windows scheduled task that checks every minute and relaunches the kiosk if it crashes.

After install, double-click the **Ninja Games Kiosk** desktop shortcut. The first launch shows the setup wizard:
- Enter the PC's display name (e.g. `Station 5`)
- The wizard registers the PC in Firebase, scans installed games, and pushes the catalog to the admin dashboard
- The kiosk then connects to the LAN server (or falls back to `ninjagamesjo.com`)

---

## ✏️ Customizations the shop can do later

- **Re-scan installed games** without reinstalling — Admin Dashboard → PCs → select PC → Controls → "Re-scan".
- **Live screen view** — Admin Dashboard → PCs → select PC → Screen tab. Streams at 1 fps while open, costs 0% CPU when closed.
- **Lock / unlock / restart / kill app** — all from the admin Controls tab.
- **Daily Firestore backup** — see `DEPLOY-README.md` (Task Scheduler + `scripts/backup-firestore.js`).

---

## 📞 If something goes wrong

See **`STAFF-GUIDE.md`** for the most common shop scenarios (refunds, top-ups, frozen PCs, missing items, kill switch phrase, etc.).

For deeper troubleshooting:
- Server logs: terminal window from `START-SERVER.bat`
- Client logs: `%APPDATA%\ninja-games-kiosk\app.log` on each PC
- Watchdog logs: `%TEMP%\ninja-watchdog.log`

---

🥷 Built for Ninja Games — Amman, Jordan
