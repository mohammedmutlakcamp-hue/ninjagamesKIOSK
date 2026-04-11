@echo off
setlocal
title Ninja Games Kiosk - UNINSTALL
color 0C
echo.
echo  ===============================================
echo      NINJA GAMES KIOSK - FULL UNINSTALL
echo  ===============================================
echo.
echo  This will COMPLETELY remove the kiosk from this PC.
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Right-click this file and Run as administrator!
    echo.
    pause
    exit /b 1
)

set /p CONFIRM="  Type YES to confirm uninstall: "
if /i not "%CONFIRM%"=="YES" (
    echo  Cancelled.
    pause
    exit /b 0
)

echo.

echo  [1/10] Killing kiosk processes...
taskkill /F /IM NinjaKiosk.exe >nul 2>&1
taskkill /F /IM "NG Kiosk.exe" >nul 2>&1
taskkill /F /IM Kiosk.exe >nul 2>&1
taskkill /F /IM msedgewebview2.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo          DONE

echo  [2/10] Removing shell replacement...
reg delete "HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1
echo          DONE

echo  [3/10] Removing autostart entries...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaKiosk /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaGamesKiosk /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Kiosk /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaKiosk /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaGamesKiosk /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NinjaKiosk.lnk" >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Ninja Games Kiosk.lnk" >nul 2>&1
del "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\NinjaKiosk.lnk" >nul 2>&1
echo          DONE

echo  [4/10] Re-enabling Task Manager + Ctrl+Alt+Del...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableTaskMgr /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableLockWorkstation /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableChangePassword /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v NoLogoff /f >nul 2>&1
echo          DONE

echo  [5/10] Restoring Explorer...
start explorer.exe
echo          DONE

echo  [6/10] Removing NTFS junctions (player sessions)...
for %%J in (
    "%LOCALAPPDATA%\Google\Chrome\User Data"
    "%LOCALAPPDATA%\Microsoft\Edge\User Data"
    "%APPDATA%\discord"
    "%LOCALAPPDATA%\Riot Games\Riot Client\Data"
    "%LOCALAPPDATA%\EpicGamesLauncher\Saved\Config\Windows"
    "%LOCALAPPDATA%\EpicGamesLauncher\Saved\Data"
    "%APPDATA%\Battle.net"
    "%LOCALAPPDATA%\FiveM"
    "%LOCALAPPDATA%\Roblox"
    "C:\Program Files (x86)\Steam\config"
    "C:\Program Files (x86)\Steam\userdata"
) do (
    fsutil reparsepoint query %%J >nul 2>&1
    if not errorlevel 1 (
        rmdir %%J >nul 2>&1
    )
    if exist "%%~J.ninjabak" (
        if not exist %%J (
            move "%%~J.ninjabak" %%J >nul 2>&1
        )
    )
)
echo          DONE

echo  [7/10] Deleting kiosk config...
rmdir /s /q "%APPDATA%\ninja-games-kiosk" >nul 2>&1
echo          DONE

echo  [8/10] Deleting local player data...
rmdir /s /q "D:\NinjaKioskPlayers" >nul 2>&1
rmdir /s /q "C:\NinjaKioskPlayers" >nul 2>&1
rmdir /s /q "%ProgramData%\NinjaKioskPlayers" >nul 2>&1
echo          DONE

echo  [9/10] Removing network share...
net share NinjaKioskPlayers /delete >nul 2>&1
echo          DONE

echo  [10/10] Removing firewall rules...
netsh advfirewall firewall delete rule name="NinjaKiosk LAN TCP 3000" >nul 2>&1
netsh advfirewall firewall delete rule name="NinjaKiosk LAN TCP 3000 Out" >nul 2>&1
netsh advfirewall firewall delete rule name="NinjaKiosk App" >nul 2>&1
netsh advfirewall firewall delete rule name="NinjaKiosk Client Out" >nul 2>&1
echo          DONE

echo.
echo  ===============================================
echo       UNINSTALL COMPLETE
echo  ===============================================
echo.
echo   Everything removed. PC is back to normal.
echo   Restart recommended.
echo.
pause
exit /b 0
