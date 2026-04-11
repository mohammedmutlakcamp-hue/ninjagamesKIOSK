# NinjaKiosk

Native C# WPF + WebView2 kiosk application for Ninja Games gaming center. Replaces the Windows shell to lock down PCs for customer sessions.

## Project Structure

| File / Folder | Description |
|---|---|
| `NinjaKiosk/` | Main C# WPF project |
| `NinjaKiosk/MainWindow.xaml` | Kiosk window layout — fullscreen borderless window with WebView2 and a loading overlay |
| `NinjaKiosk/MainWindow.xaml.cs` | Core kiosk logic — keyboard hooks, session lock/unlock, game launching, taskbar control, WebView2 bridge |
| `NinjaKiosk/App.xaml.cs` | App startup — single-instance mutex, crash logging |
| `NinjaKiosk/NinjaKiosk.csproj` | .NET 8.0 project file with WebView2 dependency |
| `NinjaKiosk/app.manifest` | Windows manifest (runs as current user, not admin) |
| `NinjaKiosk/AssemblyInfo.cs` | Assembly metadata |
| `installer.iss` | Inno Setup installer script — builds `NinjaKiosk-Setup.exe`, sets kiosk as Windows shell |
| `restore-shell.bat` | Restores `explorer.exe` as the default Windows shell (undo kiosk mode) |

## How It Works

1. **Shell Replacement** — The installer sets `NinjaKiosk.exe` as the Windows shell (via registry), so it launches instead of Explorer on boot.
2. **Lock Mode** (default on startup) — Fullscreen, topmost, hides taskbar, blocks Alt+Tab / Win key / Alt+F4. Shows the kiosk web UI from `ninjagamesjo.com/kiosk`.
3. **Unlock Mode** (customer session) — Taskbar shown, Alt+Tab allowed, kiosk pushed behind other windows so customers can use the PC normally.
4. **Session Logout** — Kills all processes started during the session, re-locks the kiosk.
5. **Game Launch** — Supports Steam, Epic Games, Riot (Valorant/LoL), Roblox, Battle.net, FiveM, and direct `.exe` launch.

## Web Bridge API

The web UI at `ninjagamesjo.com/kiosk` communicates with the kiosk via `window.electronAPI`:

| Method | Action |
|---|---|
| `sessionLogin()` | Unlock PC for customer |
| `sessionLogout()` | Lock PC, kill session processes |
| `launchGame(gameId, exePath)` | Launch a game |
| `returnToKiosk()` | Bring kiosk window to front |
| `lockPC()` / `unlockPC()` | Manual lock/unlock |
| `restartPC()` / `shutdownPC()` | Restart or shut down the PC |
| `killSwitch()` | Exit kiosk entirely |

## Exit / Admin Access

- Type `ghanimexit` on the keyboard at any time to exit the kiosk and restore Explorer.
- Run `restore-shell.bat` as admin to permanently restore Explorer as the default shell.

## Build

```bash
# Build
dotnet publish NinjaKiosk/NinjaKiosk.csproj -c Release -r win-x64 --self-contained false

# Build installer (requires Inno Setup)
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

## Requirements

- Windows 10/11
- .NET 8.0 Runtime
- WebView2 Runtime (usually pre-installed on Windows 10/11)
- Inno Setup 6 (for building the installer)
