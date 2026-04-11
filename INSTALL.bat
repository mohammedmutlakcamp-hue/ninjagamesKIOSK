@echo off
setlocal enabledelayedexpansion
title Ninja Games Kiosk - INSTALL
color 0A
echo.
echo  ===============================================
echo      NINJA GAMES KIOSK - INSTALL
echo      Copy this folder to a USB, plug into
echo      any PC, run this as Administrator.
echo  ===============================================
echo.

:: ============================================
:: ADMIN CHECK
:: ============================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Right-click this file and Run as administrator!
    echo.
    pause
    exit /b 1
)

set "BASEDIR=%~dp0"
set "CLIENT=%BASEDIR%client\NinjaKiosk.exe"
if not exist "%CLIENT%" (
    color 0C
    echo  ERROR: client\NinjaKiosk.exe not found!
    echo  Make sure you're running this from the kiosk folder.
    echo.
    pause
    exit /b 1
)

:: ============================================
:: ROLE SELECTION
:: ============================================
echo  What is this PC?
echo    [1] CLIENT PC  (gaming station)
echo    [2] SERVER PC  (runs web server + hosts player data)
echo.
set /p MODE="  Enter 1 or 2: "
if "%MODE%"=="" set MODE=1

echo.
set /p PCNAME="  Enter PC name (e.g. PC-01, VIP-01): "
if "%PCNAME%"=="" set PCNAME=PC-01

echo.
echo  Full kiosk lockdown? (replaces desktop)
echo    [Y] Yes - boots into kiosk (recommended for clients)
echo    [N] No  - runs as normal app
echo.
set /p LOCKDOWN="  Enter Y or N: "
if "%LOCKDOWN%"=="" set LOCKDOWN=Y

:: For CLIENT mode, ask for server IP
set SERVER_IP=
if "%MODE%"=="1" (
    echo.
    echo  Enter the SERVER PC's IP address.
    echo  ^(The PC that runs the web server + player data share^)
    echo  Leave blank for auto-detect.
    echo.
    set /p SERVER_IP="  Server IP: "
)

echo.
echo  ===============================================
echo   Installing: %PCNAME%
echo  ===============================================
echo.

:: ============================================
:: STEP 1: Kill any running kiosk
:: ============================================
echo  [1/9] Killing old kiosk instances...
taskkill /F /IM NinjaKiosk.exe >nul 2>&1
taskkill /F /IM "NG Kiosk.exe" >nul 2>&1
taskkill /F /IM Kiosk.exe >nul 2>&1
taskkill /F /IM msedgewebview2.exe >nul 2>&1
timeout /t 1 /nobreak >nul
:: Clean old autostart entries
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaKiosk /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaGamesKiosk /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Kiosk /f >nul 2>&1
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaKiosk /f >nul 2>&1
reg delete "HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NinjaKiosk.lnk" >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Ninja Games Kiosk.lnk" >nul 2>&1
rmdir /s /q "%LOCALAPPDATA%\Programs\NinjaKiosk" >nul 2>&1
rmdir /s /q "%ProgramFiles%\NinjaKiosk" >nul 2>&1
:: Remove old junctions from previous sessions
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

:: ============================================
:: STEP 2: Set network to Private + enable sharing
:: ============================================
echo  [2/9] Configuring network...
:: Allow changing network category even if greyed out by policy
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\NetworkProfile" /v NL_AllowNetworkCategory /t REG_DWORD /d 1 /f >nul 2>&1
:: Set ALL network profiles to Private
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try{Get-NetConnectionProfile|Set-NetConnectionProfile -NetworkCategory Private}catch{}" >nul 2>&1
:: Enable Network Discovery
netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes >nul 2>&1
:: Enable File and Printer Sharing
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1
:: Port 3000 firewall rules (kiosk web server)
netsh advfirewall firewall delete rule name="NinjaKiosk LAN TCP 3000" >nul 2>&1
netsh advfirewall firewall add rule name="NinjaKiosk LAN TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
netsh advfirewall firewall add rule name="NinjaKiosk LAN TCP 3000 Out" dir=out action=allow protocol=TCP remoteport=3000 profile=any >nul 2>&1
:: Allow kiosk exe through firewall
netsh advfirewall firewall delete rule name="NinjaKiosk App" >nul 2>&1
netsh advfirewall firewall add rule name="NinjaKiosk App" dir=in action=allow program="%CLIENT%" profile=any >nul 2>&1
echo          DONE

:: ============================================
:: STEP 3: Fix SMB / Guest Auth (Windows 11 blocks shares without this)
:: ============================================
echo  [3/9] Fixing SMB + guest auth (Windows 11 fix)...
:: Disable SMB signing requirements
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" /v RequireSecuritySignature /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" /v EnableSecuritySignature /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" /v RequireSecuritySignature /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" /v EnableSecuritySignature /t REG_DWORD /d 0 /f >nul 2>&1
:: Allow guest access to shares (critical for cross-PC player sync)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters" /v AllowInsecureGuestAuth /t REG_DWORD /d 1 /f >nul 2>&1
:: Anonymous access
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v everyoneincludesanonymous /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters" /v restrictnullsessaccess /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v LimitBlankPasswordUse /t REG_DWORD /d 0 /f >nul 2>&1
:: Enable SMB1 + SMB2 protocols
powershell -NoProfile -Command "try{Set-SmbServerConfiguration -EnableSMB1Protocol $true -Force}catch{}" >nul 2>&1
powershell -NoProfile -Command "try{Set-SmbServerConfiguration -EnableSMB2Protocol $true -Force}catch{}" >nul 2>&1
echo          DONE

:: ============================================
:: STEP 4: SERVER-ONLY — Create player data share
:: ============================================
if "%MODE%"=="1" (
    echo  [4/9] Skipped (client mode^)
    goto :STEP5
)

echo  [4/9] Creating player data share...

:: Create the folder
if exist "D:\" (
    mkdir "D:\NinjaKioskPlayers" 2>nul
    set "SHARE_PATH=D:\NinjaKioskPlayers"
) else (
    mkdir "C:\NinjaKioskPlayers" 2>nul
    set "SHARE_PATH=C:\NinjaKioskPlayers"
)

:: Delete old share if exists
net share NinjaKioskPlayers /delete >nul 2>&1

:: Create the share — DO NOT suppress errors here
echo          Creating share at !SHARE_PATH!...
net share NinjaKioskPlayers=!SHARE_PATH! /grant:Everyone,FULL
if %errorlevel% neq 0 (
    color 0E
    echo          WARNING: Share creation may have failed.
    echo          Trying alternative method...
    net share NinjaKioskPlayers=!SHARE_PATH! /grant:Everyone,FULL /unlimited
)

:: Set NTFS permissions — Everyone = Full Control (recursive)
echo          Setting permissions...
icacls "!SHARE_PATH!" /grant Everyone:(OI)(CI)F /T >nul 2>&1

:: Verify the share exists
net share NinjaKioskPlayers >nul 2>&1
if %errorlevel% equ 0 (
    echo          DONE — Share: \\%COMPUTERNAME%\NinjaKioskPlayers
) else (
    color 0E
    echo          WARNING: Could not verify share. Player sync may not work.
    echo          Try running this script again, or create the share manually:
    echo            net share NinjaKioskPlayers=!SHARE_PATH! /grant:Everyone,FULL
)

:STEP5
:: ============================================
:: STEP 5: Lock down the PC
:: ============================================
echo  [5/9] Locking Task Manager + Ctrl+Alt+Del...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableTaskMgr /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableLockWorkstation /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System" /v DisableChangePassword /t REG_DWORD /d 1 /f >nul 2>&1
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" /v NoLogoff /t REG_DWORD /d 1 /f >nul 2>&1
echo          DONE

:: ============================================
:: STEP 6: Register PC name + save config
:: ============================================
echo  [6/9] Saving config for %PCNAME%...
mkdir "%APPDATA%\ninja-games-kiosk" >nul 2>&1

:: Save PC name/station ID
echo {"stationId":"%PCNAME%","stationName":"%PCNAME%"} > "%APPDATA%\ninja-games-kiosk\pc-config.json"

:: Save server IP (client only)
if "%MODE%"=="1" (
    if not "!SERVER_IP!"=="" (
        echo {"serverIp":"!SERVER_IP!"} > "%APPDATA%\ninja-games-kiosk\lan-config.json"
        echo          Server IP: !SERVER_IP!
    ) else (
        echo          Server IP: auto-detect
    )
)
echo          DONE

:: ============================================
:: STEP 7: Set autostart mode
:: ============================================
if /i "%LOCKDOWN%"=="Y" goto :LOCKDOWN_YES

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v NinjaKiosk /d "\"%CLIENT%\"" /f >nul 2>&1
echo  [7/9] Autostart: normal app mode — DONE
goto :STEP8

:LOCKDOWN_YES
reg add "HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /d "\"%CLIENT%\"" /f >nul 2>&1
echo  [7/9] Autostart: FULL LOCKDOWN — DONE

:STEP8
:: ============================================
:: STEP 8: Test connectivity (client only)
:: ============================================
if "%MODE%"=="2" (
    echo  [8/9] Skipped (server mode^)
    goto :STEP9
)

echo  [8/9] Testing connectivity...
if not "!SERVER_IP!"=="" (
    :: Test ping
    ping -n 1 -w 2000 !SERVER_IP! >nul 2>&1
    if %errorlevel% equ 0 (
        echo          Ping to !SERVER_IP!: OK
    ) else (
        color 0E
        echo          Ping to !SERVER_IP!: FAILED (check network)
    )
    :: Test share access
    dir "\\!SERVER_IP!\NinjaKioskPlayers" >nul 2>&1
    if %errorlevel% equ 0 (
        echo          Player share: OK
    ) else (
        color 0E
        echo          Player share: NOT ACCESSIBLE
        echo          Make sure INSTALL.bat was run on the SERVER first!
        echo          Trying to connect...
        net use "\\!SERVER_IP!\NinjaKioskPlayers" /persistent:no >nul 2>&1
        dir "\\!SERVER_IP!\NinjaKioskPlayers" >nul 2>&1
        if %errorlevel% equ 0 (
            echo          Player share: OK (after net use)
        ) else (
            echo          Player share: STILL NOT ACCESSIBLE
            echo          Run INSTALL.bat as SERVER on the other PC first,
            echo          then restart this PC.
        )
    )
    :: Test port 3000
    powershell -NoProfile -Command "try{$tcp=New-Object System.Net.Sockets.TcpClient;$tcp.Connect('!SERVER_IP!',3000);$tcp.Close();Write-Host '         Web server: OK'}catch{Write-Host '         Web server: NOT RUNNING (start it on server)'}" 2>nul
) else (
    echo          Auto-detect mode - will scan LAN on kiosk startup
)
echo          DONE

:STEP9
:: ============================================
:: STEP 9: Launch kiosk
:: ============================================
echo  [9/9] Launching kiosk...
start "" "%CLIENT%"

echo.
echo  ===============================================
echo       INSTALL COMPLETE!
echo  ===============================================
echo.
echo   PC Name:        %PCNAME%
if "%MODE%"=="1" (
    echo   Mode:           CLIENT
    if "!SERVER_IP!"=="" (
        echo   Server:         Auto-detect
    ) else (
        echo   Server:         !SERVER_IP!
    )
) else (
    echo   Mode:           SERVER
    echo   Player Share:   \\%COMPUTERNAME%\NinjaKioskPlayers
)
echo   Task Manager:   DISABLED
if /i "%LOCKDOWN%"=="Y" (
    echo   Lockdown:       FULL (shell replacement^)
) else (
    echo   Lockdown:       Normal app autostart
)
echo   Exit kiosk:     type "ghanemexit" on keyboard
echo.
echo   IMPORTANT:
if "%MODE%"=="2" (
    echo   - Start the Next.js web server before using kiosks
    echo   - Run: cd server ^&^& npm start
) else (
    echo   - Make sure the SERVER PC has INSTALL.bat run first
    echo   - Server must be running the web server on port 3000
)
echo.
echo   Restart PC and kiosk starts automatically.
echo.
pause
exit /b 0
