@echo off
title NinjaKiosk LAN Server
color 0A
setlocal enabledelayedexpansion

echo ============================================
echo   NINJA GAMES - LAN SERVER
echo ============================================
echo.

:: Get this PC's IP
set "MY_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        if "!MY_IP!"=="" set "MY_IP=%%b"
    )
)

echo   Server IP: %MY_IP%
echo   Port: 3000
echo.

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed!
    echo         Download from: https://nodejs.org
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do echo [OK] Node.js %%v

:: Go to project directory
cd /d "%~dp0"
if not exist "package.json" (
    cd /d "C:\Users\vip-2\ninjagamesKIOSK"
)

if not exist "package.json" (
    color 0C
    echo [ERROR] Cannot find ninjagamesKIOSK project!
    pause
    exit /b 1
)

echo [OK] Project directory: %CD%
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Check if already built
if not exist ".next" (
    echo Building for production...
    echo (This may take 1-2 minutes the first time)
    echo.
    call npm run build
    if %errorLevel% neq 0 (
        color 0E
        echo.
        echo [WARN] Production build failed, using dev mode instead...
        echo.
        goto :devmode
    )
    echo.
    echo [OK] Build complete!
    echo.
)

:: Start production server
echo ============================================
echo   SERVER STARTING
echo ============================================
echo.
echo   LAN clients connect to:
echo.
echo     http://%MY_IP%:3000/kiosk
echo.
echo   Press Ctrl+C to stop the server.
echo ============================================
echo.

:: Start in production mode bound to all interfaces
set HOST=0.0.0.0
set PORT=3000
call npx next start -H 0.0.0.0 -p 3000
goto :end

:devmode
echo ============================================
echo   SERVER STARTING (DEV MODE)
echo ============================================
echo.
echo   LAN clients connect to:
echo.
echo     http://%MY_IP%:3000/kiosk
echo.
echo   Press Ctrl+C to stop the server.
echo ============================================
echo.

call npm run dev

:end
pause
