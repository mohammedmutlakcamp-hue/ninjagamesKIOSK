@echo off
:: ────────────────────────────────────────────────────────────────────────
:: NinjaKiosk Watchdog
:: Checks every minute that NinjaKiosk.exe is running. If not, relaunches
:: it from the install location. Run via Windows Task Scheduler.
::
:: Install (run once, as admin):
::   schtasks /Create /TN "NinjaKiosk Watchdog" /TR "\"%~dp0WATCHDOG.bat\"" ^
::            /SC MINUTE /MO 1 /RL HIGHEST /F
::
:: Uninstall:
::   schtasks /Delete /TN "NinjaKiosk Watchdog" /F
:: ────────────────────────────────────────────────────────────────────────
setlocal

set "EXE_NAME=WindowsServiceHost.exe"
set "EXE_PATH=%~dp0client\WindowsServiceHost.exe"
set "LOG=%TEMP%\ninja-watchdog.log"

tasklist /FI "IMAGENAME eq %EXE_NAME%" 2>NUL | find /I "%EXE_NAME%" >NUL
if %ERRORLEVEL%==0 (
    echo [%DATE% %TIME%] OK — %EXE_NAME% running >> "%LOG%"
    exit /b 0
)

echo [%DATE% %TIME%] DOWN — restarting %EXE_NAME% >> "%LOG%"

:: Launch detached so the watchdog exits cleanly. Wrap in start "" so cmd
:: parses the quoted path correctly on paths with spaces.
if exist "%EXE_PATH%" (
    start "" "%EXE_PATH%"
    echo [%DATE% %TIME%] LAUNCHED %EXE_PATH% >> "%LOG%"
) else (
    echo [%DATE% %TIME%] ERROR — %EXE_PATH% not found >> "%LOG%"
    exit /b 1
)

endlocal
exit /b 0
