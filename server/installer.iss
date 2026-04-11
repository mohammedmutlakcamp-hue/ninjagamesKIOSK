[Setup]
AppName=Ninja Games Kiosk
AppId={{B5E2F8A1-3C4D-4E6F-9A8B-1C2D3E4F5A6B}
AppVersion=2.1.0
AppPublisher=Ninja Games
DefaultDirName={autopf}\NinjaKiosk
DefaultGroupName=Ninja Games Kiosk
OutputDir=C:\Users\vip-2\Desktop
OutputBaseFilename=NinjaKiosk-Setup
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
UninstallDisplayName=Ninja Games Kiosk
DisableProgramGroupPage=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no

[Files]
Source: "C:\Users\vip-2\Desktop\NinjaKiosk\NinjaKiosk\bin\Release\net8.0-windows\win-x64\publish\NinjaKiosk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "C:\Users\vip-2\Desktop\NinjaKiosk\NinjaKiosk\bin\Release\net8.0-windows\win-x64\publish\runtimes\*"; DestDir: "{app}\runtimes"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "C:\Users\vip-2\Desktop\NinjaKiosk\restore-shell.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commondesktop}\Ninja Games Kiosk"; Filename: "{app}\NinjaKiosk.exe"; WorkingDir: "{app}"
Name: "{group}\Ninja Games Kiosk"; Filename: "{app}\NinjaKiosk.exe"; WorkingDir: "{app}"
Name: "{group}\Uninstall Ninja Games Kiosk"; Filename: "{uninstallexe}"
Name: "{group}\Restore Normal Desktop"; Filename: "{app}\restore-shell.bat"; WorkingDir: "{app}"

[Registry]
; Replace Windows shell with NinjaKiosk — no desktop/taskbar shown on boot
Root: HKCU; Subkey: "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"; ValueType: string; ValueName: "Shell"; ValueData: """{app}\NinjaKiosk.exe"""; Flags: uninsdeletevalue
; Disable Task Manager (blocks Ctrl+Alt+Del → Task Manager)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableTaskMgr"; ValueData: "1"; Flags: uninsdeletevalue
; Disable Change Password and Lock from Ctrl+Alt+Del screen
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableLockWorkstation"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableChangePassword"; ValueData: "1"; Flags: uninsdeletevalue
; Disable Sign Out
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"; ValueType: dword; ValueName: "NoLogoff"; ValueData: "1"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\NinjaKiosk.exe"; Description: "Launch Ninja Games Kiosk"; Flags: nowait postinstall skipifsilent runascurrentuser

[InstallDelete]
; Clean previous install files
Type: filesandordirs; Name: "{app}\*"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  OldUninstaller: String;
  OldDir: String;
begin
  Result := '';

  // 1. Kill ALL running NinjaKiosk processes
  Exec('taskkill.exe', '/F /IM NinjaKiosk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1000);

  // 2. Try to run old uninstaller from AppData (previous install location)
  OldDir := ExpandConstant('{localappdata}') + '\Programs\NinjaKiosk';
  OldUninstaller := OldDir + '\unins000.exe';
  if FileExists(OldUninstaller) then
  begin
    Log('Found old uninstaller at: ' + OldUninstaller);
    Exec(OldUninstaller, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
    // Force-remove leftover directory
    DelTree(OldDir, True, True, True);
  end;

  // 3. Try to run old uninstaller from Program Files (in case it was there)
  OldDir := ExpandConstant('{autopf}') + '\NinjaKiosk';
  OldUninstaller := OldDir + '\unins000.exe';
  if FileExists(OldUninstaller) then
  begin
    Log('Found old uninstaller at: ' + OldUninstaller);
    Exec(OldUninstaller, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
    DelTree(OldDir, True, True, True);
  end;

  // 4. Also check Inno Setup uninstall registry for any previous version with any AppId
  if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{{B5E2F8A1-3C4D-4E6F-9A8B-1C2D3E4F5A6B}_is1', 'UninstallString', OldUninstaller) then
  begin
    Log('Found registry uninstaller: ' + OldUninstaller);
    Exec(RemoveQuotes(OldUninstaller), '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
  end;

  // 5. Clean up old shell registry if it points to old location
  if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell', OldUninstaller) then
  begin
    if Pos('AppData', OldUninstaller) > 0 then
    begin
      Log('Removing stale shell registry pointing to: ' + OldUninstaller);
      RegDeleteValue(HKCU, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell');
    end;
  end;

  // 6. Kill again in case uninstaller relaunched it
  Exec('taskkill.exe', '/F /IM NinjaKiosk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
