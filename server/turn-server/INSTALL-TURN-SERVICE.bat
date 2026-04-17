@echo off
setlocal
title Install Ninja Kiosk TURN Server (Windows Service)
color 0B

net session >nul 2>&1 || (echo Right-click and Run as administrator. & pause & exit /b 1)

cd /d "%~dp0"

echo.
echo  [1/4] Installing dependencies (node-turn + pm2)...
call npm install --omit=dev || goto :fail
call npm install -g pm2 pm2-windows-service || goto :fail

echo.
echo  [2/4] Opening firewall ports for TURN...
netsh advfirewall firewall delete rule name="NinjaKiosk TURN UDP" >nul 2>&1
netsh advfirewall firewall delete rule name="NinjaKiosk TURN TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="NinjaKiosk TURN Relay" >nul 2>&1
netsh advfirewall firewall add rule name="NinjaKiosk TURN UDP"   dir=in action=allow protocol=UDP localport=3478 >nul
netsh advfirewall firewall add rule name="NinjaKiosk TURN TCP"   dir=in action=allow protocol=TCP localport=3478 >nul
netsh advfirewall firewall add rule name="NinjaKiosk TURN Relay" dir=in action=allow protocol=UDP localport=49152-65535 >nul
echo     done.

echo.
echo  [3/4] Registering TURN with PM2...
call pm2 delete ninja-turn >nul 2>&1
call pm2 start turn-server.js --name ninja-turn || goto :fail
call pm2 save

echo.
echo  [4/4] Installing PM2 as a Windows service (auto-start on boot)...
rem pm2-service-install is interactive; answer defaults. If already installed, skip.
sc query PM2 >nul 2>&1
if errorlevel 1 (
    echo     Installing PM2 service — accept the prompts with defaults.
    call pm2-service-install -n PM2
) else (
    echo     PM2 service already installed.
)

echo.
echo  TURN server is running. Verify with:   pm2 status
echo  Logs:                                  pm2 logs ninja-turn
echo.
echo  Now rebuild the Next.js app so the new iceServers config ships:
echo    cd ..  ^&^&  npm run build
echo.
pause
exit /b 0

:fail
echo.
echo  INSTALL FAILED. Check the output above.
pause
exit /b 1
