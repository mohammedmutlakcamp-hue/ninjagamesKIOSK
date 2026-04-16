@echo off
:: ────────────────────────────────────────────────────────────────────────
:: Ninja Games Kiosk — Server PC one-time setup
:: Run this ONCE on the PC that will be the LAN game server.
:: Requires Node.js (LTS) installed from https://nodejs.org
:: ────────────────────────────────────────────────────────────────────────
title Ninja Games Kiosk - Server Setup
color 0A
cls

echo  ===============================================
echo   NINJA GAMES KIOSK - SERVER SETUP
echo  ===============================================
echo.

:: ── Verify Node ──────────────────────────────────────
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Node.js is not installed.
    echo  Download and install the LTS from https://nodejs.org
    echo  then re-run this script.
    pause
    exit /b 1
)
node --version
echo.

:: ── Locate the server folder ─────────────────────────
:: Expected layout:
::   <this folder>\
::     SETUP.bat           (this script)
::     START-SERVER.bat
::     server\             (copied here OR symlinked from project)
set "SERVER_DIR=%~dp0server"
if not exist "%SERVER_DIR%\package.json" (
    echo  ERROR: server\package.json not found.
    echo.
    echo  Copy the project's `server` folder into:
    echo    %~dp0server
    echo  then re-run SETUP.bat.
    pause
    exit /b 1
)

cd /d "%SERVER_DIR%"

:: ── Install dependencies ─────────────────────────────
echo  Installing dependencies (this may take 3-5 minutes the first time)...
echo.
call npm install
if %ERRORLEVEL% neq 0 (
    echo  npm install failed. Check your internet connection.
    pause
    exit /b 1
)

:: ── Build the Next.js bundle ─────────────────────────
echo.
echo  Building production bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo  Build failed. See errors above.
    pause
    exit /b 1
)

:: ── Open firewall port 3000 ──────────────────────────
echo.
echo  Opening firewall port 3000 (LAN access)...
netsh advfirewall firewall delete rule name="NinjaKiosk Server" >nul 2>&1
netsh advfirewall firewall add rule name="NinjaKiosk Server" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

echo.
echo  ===============================================
echo   SETUP COMPLETE
echo  ===============================================
echo.
echo  To start the server, double-click START-SERVER.bat
echo.
echo  The server will be reachable from any PC on the LAN at
echo    http://^<server-ip^>:3000/kiosk
echo.
pause
