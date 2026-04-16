; ════════════════════════════════════════════════════════════════════════
;  Ninja Games Kiosk — Inno Setup installer script
;  Compile with: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
; ════════════════════════════════════════════════════════════════════════

[Setup]
AppName=Ninja Games Kiosk
AppId={{B5E2F8A1-3C4D-4E6F-9A8B-1C2D3E4F5A6B}
AppVersion=1.0.0
AppPublisher=Ninja Games Gaming Center
AppPublisherURL=https://www.ninjagamesjo.com
DefaultDirName={autopf}\NinjaKiosk
DefaultGroupName=Ninja Games Kiosk
OutputDir=..\
OutputBaseFilename=NinjaKiosk-Setup
SetupIconFile=NinjaKiosk\ninja.ico
UninstallDisplayIcon={app}\NinjaKiosk.exe
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
UninstallDisplayName=Ninja Games Kiosk
DisableProgramGroupPage=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=no

[Files]
; Self-contained .NET publish output (we publish to ..\client\ before building installer)
Source: "..\client\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Helper to restore explorer.exe as the shell if you want to roll back kiosk lockdown
Source: "restore-shell.bat"; DestDir: "{app}"; Flags: ignoreversion
; Watchdog — Windows Task Scheduler restarts NinjaKiosk if it dies
Source: "..\WATCHDOG.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commondesktop}\Ninja Games Kiosk"; Filename: "{app}\NinjaKiosk.exe"; WorkingDir: "{app}"; IconFilename: "{app}\NinjaKiosk.exe"
Name: "{group}\Ninja Games Kiosk"; Filename: "{app}\NinjaKiosk.exe"; WorkingDir: "{app}"; IconFilename: "{app}\NinjaKiosk.exe"
Name: "{group}\Restore Normal Desktop"; Filename: "{app}\restore-shell.bat"; WorkingDir: "{app}"
Name: "{group}\Uninstall Ninja Games Kiosk"; Filename: "{uninstallexe}"

[Registry]
; ── Optional kiosk lockdown (only if user picked "Yes" on the shell page) ──
; Replace Windows shell with NinjaKiosk → boots straight into kiosk
Root: HKCU; Subkey: "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"; ValueType: string; ValueName: "Shell"; ValueData: """{app}\NinjaKiosk.exe"""; Flags: uninsdeletevalue; Check: IsKioskShell
; Disable Lock Workstation (Win+L)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableLockWorkstation"; ValueData: "1"; Flags: uninsdeletevalue; Check: IsKioskShell
; Disable Change Password
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableChangePassword"; ValueData: "1"; Flags: uninsdeletevalue; Check: IsKioskShell
; Disable Sign Out
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"; ValueType: dword; ValueName: "NoLogoff"; ValueData: "1"; Flags: uninsdeletevalue; Check: IsKioskShell
; Disable Task Manager
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Policies\System"; ValueType: dword; ValueName: "DisableTaskMgr"; ValueData: "1"; Flags: uninsdeletevalue; Check: IsKioskShell

; ── Auto-start on Windows boot (always-on, even if not replacing shell) ──
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NinjaKiosk"; ValueData: """{app}\NinjaKiosk.exe"""; Flags: uninsdeletevalue

[Run]
; Open firewall so the kiosk can reach the LAN server on :3000
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""NinjaKiosk Client"""; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""NinjaKiosk Client"" dir=out action=allow protocol=TCP remoteport=3000"; Flags: runhidden
; Register the watchdog scheduled task so a crashed kiosk auto-recovers
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""NinjaKiosk Watchdog"" /F"; Flags: runhidden
Filename: "schtasks.exe"; Parameters: "/Create /TN ""NinjaKiosk Watchdog"" /TR ""\""""{app}\WATCHDOG.bat""""\""""  /SC MINUTE /MO 1 /RL HIGHEST /F"; Flags: runhidden
; Launch the kiosk after install
Filename: "{app}\NinjaKiosk.exe"; Parameters: "{code:GetLaunchParams}"; Description: "Launch Ninja Games Kiosk"; Flags: nowait postinstall skipifsilent runascurrentuser

[InstallDelete]
Type: filesandordirs; Name: "{app}\*"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
; Remove the watchdog scheduled task
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""NinjaKiosk Watchdog"" /F"; Flags: runhidden
; Remove firewall rule
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""NinjaKiosk Client"""; Flags: runhidden
; Restore everything we changed
Filename: "reg.exe"; Parameters: "delete ""HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"" /v Shell /f"; Flags: runhidden
Filename: "reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System"" /v DisableTaskMgr /f"; Flags: runhidden
Filename: "reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System"" /v DisableLockWorkstation /f"; Flags: runhidden
Filename: "reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System"" /v DisableChangePassword /f"; Flags: runhidden
Filename: "reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"" /v NoLogoff /f"; Flags: runhidden
Filename: "reg.exe"; Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Run"" /v NinjaKiosk /f"; Flags: runhidden

[Code]
var
  ModePage: TInputOptionWizardPage;
  PcNamePage: TInputQueryWizardPage;
  ServerIpPage: TInputQueryWizardPage;
  ShellPage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  // Page 1: Installation Mode
  ModePage := CreateInputOptionPage(wpWelcome,
    'Installation Mode', 'Choose how this PC will be used',
    'Select the role for this PC in your gaming center:',
    True, False);
  ModePage.Add('Client PC — Gaming station (connects to LAN server or cloud)');
  ModePage.Add('Server PC — Hosts the kiosk web app for LAN clients');
  ModePage.SelectedValueIndex := 0;

  // Page 2: PC Name (registers in admin panel under this name)
  PcNamePage := CreateInputQueryPage(ModePage.ID,
    'PC Registration', 'Name this gaming station',
    'This name appears in the admin panel. Use something like PC-01, PC-02, VIP-01.');
  PcNamePage.Add('PC Name:', False);
  PcNamePage.Values[0] := 'PC-01';

  // Page 3: Server IP (optional, for client mode only)
  ServerIpPage := CreateInputQueryPage(PcNamePage.ID,
    'LAN Server', 'Enter the LAN server IP (optional)',
    'Leave blank for auto-detect. The kiosk scans the LAN automatically.' + #13#10 +
    'Only fill this in if auto-detect does not work.');
  ServerIpPage.Add('Server IP (e.g. 192.168.1.23):', False);
  ServerIpPage.Values[0] := '';

  // Page 4: Kiosk lockdown
  ShellPage := CreateInputOptionPage(ServerIpPage.ID,
    'Kiosk Lockdown', 'Replace Windows desktop with kiosk?',
    'If enabled, NinjaKiosk replaces Explorer as the Windows shell. ' +
    'The PC boots directly into kiosk mode with no desktop, taskbar, or Start menu. ' +
    'Type "ghanemexit" to exit kiosk mode.',
    True, False);
  ShellPage.Add('Yes — Full kiosk lockdown (recommended for client PCs)');
  ShellPage.Add('No — Normal desktop, kiosk runs as a regular app (auto-starts on boot)');
  ShellPage.SelectedValueIndex := 0;
end;

function IsServerMode: Boolean;
begin
  Result := (ModePage.SelectedValueIndex = 1);
end;

function IsKioskShell: Boolean;
begin
  Result := (ShellPage.SelectedValueIndex = 0) and (not IsServerMode);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = ServerIpPage.ID) and IsServerMode then Result := True;
  if (PageID = ShellPage.ID) and IsServerMode then Result := True;
end;

function GetPcName(Param: String): String;
begin
  Result := PcNamePage.Values[0];
end;

function GetServerIp(Param: String): String;
begin
  Result := ServerIpPage.Values[0];
end;

function GetLaunchParams(Param: String): String;
var
  Params: String;
begin
  Params := '--pc-name=' + PcNamePage.Values[0];
  if (not IsServerMode) and (ServerIpPage.Values[0] <> '') then
    Params := Params + ' --server-ip=' + ServerIpPage.Values[0];
  Result := Params;
end;

procedure SaveLanConfig;
var
  ConfigDir, ConfigFile: String;
begin
  ConfigDir := ExpandConstant('{userappdata}') + '\ninja-games-kiosk';
  ForceDirectories(ConfigDir);

  if IsServerMode then
  begin
    ConfigFile := ConfigDir + '\lan-config.json';
    SaveStringToFile(ConfigFile, '{"serverIp":"127.0.0.1","isServer":true}', False);
  end
  else if ServerIpPage.Values[0] <> '' then
  begin
    ConfigFile := ConfigDir + '\lan-config.json';
    SaveStringToFile(ConfigFile, '{"serverIp":"' + ServerIpPage.Values[0] + '"}', False);
  end;
end;

procedure SetupFirewall;
var
  ResultCode: Integer;
begin
  Exec('netsh.exe', 'advfirewall firewall delete rule name="NinjaKiosk LAN TCP 3000"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('netsh.exe', 'advfirewall firewall add rule name="NinjaKiosk LAN TCP 3000" dir=in action=allow protocol=TCP localport=3000 profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('netsh.exe', 'advfirewall firewall add rule name="NinjaKiosk LAN TCP 3000 Out" dir=out action=allow protocol=TCP remoteport=3000 profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Exec('netsh.exe', 'advfirewall firewall delete rule name="NinjaKiosk App"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('netsh.exe', 'advfirewall firewall add rule name="NinjaKiosk App" dir=in action=allow program="' + ExpandConstant('{app}') + '\NinjaKiosk.exe" profile=any', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Exec('netsh.exe', 'advfirewall firewall set rule group="Network Discovery" new enable=Yes', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// Remove every trace of any previously-installed kiosk app from this PC
// before installing the new one. Aggressive — kills processes, deletes
// auto-start entries from HKCU + HKLM Run keys, clears the shell-replacement
// value, removes startup folder shortcuts, runs old uninstallers if found.
procedure NukeOldKiosk;
var
  ResultCode: Integer;
  OldUninstaller, OldDir, ShellValue, RunValue: String;
  StartupShortcut: String;
begin
  // 1. Kill every process name that could be holding kiosk files open
  Exec('taskkill.exe', '/F /IM NinjaKiosk.exe',  '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM NinjaKiosk.dll',  '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM Kiosk.exe',       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM ninja-kiosk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM msedgewebview2.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1500);

  // 2. Remove HKCU Run-key autostart entries (any name that mentions Ninja/Kiosk)
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaKiosk', RunValue) then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaKiosk');
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaGamesKiosk', RunValue) then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaGamesKiosk');
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Kiosk', RunValue) then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Kiosk');
  // 3. Same for HKLM Run-key (machine-wide autostart)
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaKiosk', RunValue) then
    RegDeleteValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaKiosk');
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaGamesKiosk', RunValue) then
    RegDeleteValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'NinjaGamesKiosk');
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Kiosk', RunValue) then
    RegDeleteValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Run', 'Kiosk');

  // 4. Remove shell-replacement value if it points at any kiosk binary
  if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell', ShellValue) then
  begin
    if (Pos('NinjaKiosk', ShellValue) > 0) or (Pos('Kiosk', ShellValue) > 0) or (Pos('ninja', ShellValue) > 0) then
      RegDeleteValue(HKCU, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell');
  end;
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell', ShellValue) then
  begin
    if (Pos('NinjaKiosk', ShellValue) > 0) or (Pos('Kiosk', ShellValue) > 0) or (Pos('ninja', ShellValue) > 0) then
      RegWriteStringValue(HKLM, 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell', 'explorer.exe');
  end;

  // 5. Remove startup folder shortcuts (.lnk) named anything like NinjaKiosk
  StartupShortcut := ExpandConstant('{userstartup}') + '\NinjaKiosk.lnk';
  if FileExists(StartupShortcut) then DeleteFile(StartupShortcut);
  StartupShortcut := ExpandConstant('{userstartup}') + '\Ninja Games Kiosk.lnk';
  if FileExists(StartupShortcut) then DeleteFile(StartupShortcut);
  StartupShortcut := ExpandConstant('{commonstartup}') + '\NinjaKiosk.lnk';
  if FileExists(StartupShortcut) then DeleteFile(StartupShortcut);
  StartupShortcut := ExpandConstant('{commonstartup}') + '\Ninja Games Kiosk.lnk';
  if FileExists(StartupShortcut) then DeleteFile(StartupShortcut);

  // 6. Run old uninstallers from every common location and delete the dirs
  OldDir := ExpandConstant('{localappdata}') + '\Programs\NinjaKiosk';
  OldUninstaller := OldDir + '\unins000.exe';
  if FileExists(OldUninstaller) then
  begin
    Exec(OldUninstaller, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
  end;
  if DirExists(OldDir) then DelTree(OldDir, True, True, True);

  OldDir := ExpandConstant('{autopf}') + '\NinjaKiosk';
  OldUninstaller := OldDir + '\unins000.exe';
  if FileExists(OldUninstaller) then
  begin
    Exec(OldUninstaller, '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);
  end;
  if DirExists(OldDir) then DelTree(OldDir, True, True, True);

  OldDir := ExpandConstant('{pf32}') + '\NinjaKiosk';
  if DirExists(OldDir) then DelTree(OldDir, True, True, True);

  OldDir := 'C:\NinjaKiosk';
  if DirExists(OldDir) then DelTree(OldDir, True, True, True);

  // 7. Final kill in case anything respawned
  Exec('taskkill.exe', '/F /IM NinjaKiosk.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(500);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NukeOldKiosk;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    SaveLanConfig;
    SetupFirewall;
  end;
end;
