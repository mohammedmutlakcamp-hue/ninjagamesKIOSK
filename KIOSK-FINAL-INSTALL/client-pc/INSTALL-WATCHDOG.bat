@echo off
:: Registers the NinjaKiosk Watchdog with Windows Task Scheduler.
:: Run ONCE per client PC, as administrator.
:: After this, Windows will check every minute that NinjaKiosk.exe is alive
:: and relaunch it if it crashed.

net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ERROR: right-click and Run as administrator
    pause
    exit /b 1
)

set "TASK=NinjaKiosk Watchdog"
set "BAT=%~dp0WATCHDOG.bat"

if not exist "%BAT%" (
    echo  ERROR: WATCHDOG.bat not found at %BAT%
    pause
    exit /b 1
)

echo Registering scheduled task "%TASK%" ...
schtasks /Delete /TN "%TASK%" /F >nul 2>&1
schtasks /Create /TN "%TASK%" /TR "\"%BAT%\"" /SC MINUTE /MO 1 /RL HIGHEST /F
if %ERRORLEVEL% neq 0 (
    echo  Failed to register scheduled task.
    pause
    exit /b 1
)

echo.
echo  OK. Watchdog will run every minute and restart NinjaKiosk if it crashes.
echo  Logs: %%TEMP%%\ninja-watchdog.log
echo.
pause
