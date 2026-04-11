# NinjaKiosk - Gaming Center Kiosk System

Complete LAN-based kiosk system for Ninja Games gaming center.

## Quick Start

### Server PC (hosts the kiosk web UI)
1. Run `NinjaKiosk-LAN-Setup.bat` as admin (one-time firewall setup)
2. Run `server\START-LAN-SERVER.bat` to start the web server on port 3000

### Client PCs (gaming stations)
1. Run `NinjaKiosk-Client-Setup.bat` as admin (one-time firewall setup)
2. Run `client\NinjaKiosk.exe` or `START-KIOSK.bat`
3. The kiosk auto-detects the LAN server

## Requirements
- Windows 10/11
- Node.js (for server PC) — download from https://nodejs.org
- WebView2 Runtime (usually pre-installed on Windows 10/11)

## First Time Setup (Server)
```bash
cd server
npm install
npm run build
npm start
```

## Folder Structure
- `server/` — Next.js web server (kiosk UI, admin panel, API)
- `client/` — Compiled kiosk app (NinjaKiosk.exe)
- `kiosk-source/` — C# source code for the kiosk client

## Exit Kiosk
Type `ghanemexit` on the keyboard at any time.
