@echo off
taskkill /F /IM NinjaKiosk.exe >nul 2>&1
timeout /t 1 /nobreak >nul
powershell -Command "Get-ChildItem '%~dp0*' | Unblock-File" 2>nul
start "" "%~dp0NinjaKiosk.exe"
