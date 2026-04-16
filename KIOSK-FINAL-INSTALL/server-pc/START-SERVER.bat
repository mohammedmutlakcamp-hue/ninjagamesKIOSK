@echo off
:: ────────────────────────────────────────────────────────────────────────
:: Ninja Games Kiosk — Start the LAN server (production mode)
:: Bind to 0.0.0.0 (NOT localhost) so client PCs can reach it on port 3000.
:: ────────────────────────────────────────────────────────────────────────
title Ninja Games Kiosk - LAN Server (port 3000)
cd /d "%~dp0server"

:: Free port 3000 in case a previous session is still alive
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo  Starting Ninja Games Kiosk server on http://0.0.0.0:3000 ...
echo  Kiosk URL:  http://^<this-pc-ip^>:3000/kiosk
echo  Mobile PWA: http://^<this-pc-ip^>:3000/app
echo  Admin:      http://^<this-pc-ip^>:3000/ghanimadmin
echo.

call npx next start -H 0.0.0.0 -p 3000
pause
