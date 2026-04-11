@echo off
echo Restoring Windows Explorer as default shell...
reg delete "HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f
echo Done! Explorer will be the shell on next restart.
echo Starting Explorer now...
start explorer.exe
pause
