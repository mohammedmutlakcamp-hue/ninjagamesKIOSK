using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Forms = System.Windows.Forms;

namespace NinjaKiosk;

public partial class MainWindow : Window
{
    // ── Config ──
    private const string CloudUrl = "https://www.ninjagamesjo.com/kiosk";
    private const string KillPhrase = "ghanemexit";
    private string _kioskUrl = CloudUrl;

    // Permissive shell: when true (default), the kiosk does NOT hide the
    // taskbar, block Ctrl+Alt+Del, intercept Win/Alt+Tab, or disable Task
    // Manager — players can plug in PS controllers via Settings, browse
    // Control Panel, alt-tab between apps, etc. The only hard guarantee is
    // that the kiosk process itself can't be killed (ProcessProtection +
    // shell-replacement) except by typing `ghanemexit`. Set to false in
    // SetupWindow to revert to the old strict-lockdown behavior.
    private const bool PermissiveShell = true;

    // ── Win32 ──
    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int id, LowLevelKeyboardProc cb, IntPtr hMod, uint tid);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")]
    private static extern IntPtr FindWindow(string? cls, string? win);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")]
    private static extern bool EnableWindow(IntPtr h, bool e);
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOACTIVATE = 0x0010;

    // ── State ──
    private IntPtr _hookId;
    private LowLevelKeyboardProc? _hookProc;
    private bool _allowAltTab;
    private bool _isLocked = true;
    private bool _taskbarHidden = true;
    private string _killBuffer = "";
    private bool _hookHasFired;
    private DateTime _lastHookFire = DateTime.UtcNow;
    private bool _exiting;
    private readonly DispatcherTimer _guardTimer;
    private readonly DispatcherTimer _heartbeatTimer;
    private readonly DispatcherTimer _commandTimer;
    private readonly DispatcherTimer _liveScreenTimer;
    private readonly string _cmdDir;
    private readonly string _cmdFile;
    private bool _webViewReady;
    private IntPtr _hwnd;
    private readonly List<int> _launchedPids = new();
    private HashSet<int> _preSessionPids = new();
    private bool _cleanupInProgress;

    // ── Player session tracking (for per-player Steam/Discord/etc state + history) ──
    private string? _currentPlayerUid;
    private string? _currentPlayerUsername;
    private string? _currentSessionId;          // Firestore sessions/{id} doc id
    private DateTime _sessionStartedAt;

    // ── Tray Icon ──
    private Forms.NotifyIcon? _trayIcon;
    private string? _currentPlayerName;
    private int _coinsRemaining;

    // ── Firebase ──
    private readonly FirestoreService _firebase = new();
    private string? _stationId;
    private string? _stationName;
    private int _timeRemaining;

    public MainWindow()
    {
        InitializeComponent();

        _cmdDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ninja-games-kiosk");
        Directory.CreateDirectory(_cmdDir);
        _cmdFile = Path.Combine(_cmdDir, "cmd.txt");

        // Load PC config
        var (id, name) = SetupWindow.LoadConfig();
        _stationId = id;
        _stationName = name;

        App.Log($"STARTUP station={_stationId} name={_stationName}");

        // ── Self-protection: deny PROCESS_TERMINATE on the kiosk process ──
        // This makes Task Manager / taskkill / Stop-Process fail with access
        // denied for any non-SYSTEM caller. Only the in-process ghanemexit
        // path (which calls Application.Shutdown directly) can stop us.
        ProcessProtection.ApplyAntiKill();

        // ── Shell replacement: kiosk becomes the Windows desktop ──
        // Persists across reboots — Winlogon launches NinjaKiosk instead of
        // explorer.exe at login. EnsureAutostart writes BOTH the shell key
        // and a Run-key fallback every launch, self-healing if Windows
        // Update or another app overwrites either.
        ShellHost.EnsureAutostart();
        // Kill the running desktop so the kiosk window is the only thing on
        // screen — no wallpaper, no taskbar, no desktop icons. Players can
        // still open Settings via Win+I, Run via Win+R, etc.
        ShellHost.HideDesktop();

        // Keyboard hook (kept — only intercepts the ghanemexit phrase in
        // permissive mode, blocks shortcuts in strict mode).
        InstallHook();

        // Strict-mode lockdown: only run if PermissiveShell is false.
        // In permissive mode the user can use Alt+Tab, Win key, Task Manager,
        // Control Panel, Bluetooth pairing for PS controllers, etc.
        if (!PermissiveShell)
        {
            HideTaskbar();
            DisableCtrlAltDel();
        }
        else
        {
            _taskbarHidden = false;
            _allowAltTab = true;
            App.Log("PERMISSIVE_SHELL: Tinasoft-style — taskbar visible, all shortcuts allowed");
        }

        // Guard timer
        _guardTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _guardTimer.Tick += GuardTick;
        _guardTimer.Start();

        // Firebase heartbeat (every 30s)
        _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _heartbeatTimer.Tick += async (_, _) => await FirebaseHeartbeatAsync();
        _heartbeatTimer.Start();

        // Firebase command polling (every 5s)
        // Slowed from 5s -> 8s to cut Firestore reads ~40% with no admin UX hit.
        _commandTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(8) };
        _commandTimer.Tick += async (_, _) => await FirebasePollCommandAsync();
        _commandTimer.Start();

        // Live screenshot upload (every 5s, only when unlocked) — admin "live view"
        // No periodic screenshot upload — purely on-demand. The admin panel
        // sends a `screenshot` command (see PCManagement.tsx) when it opens a
        // PC's screen view or has auto-refresh enabled. Saves continuous
        // CPU + bandwidth on every kiosk PC.

        // Live-screen timer: only runs when the admin sends `live-on`. Stops
        // on `live-off`. Pushes a screenshot every second for an MJPEG-like
        // monitoring feel without paying the cost when no one is looking.
        _liveScreenTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _liveScreenTimer.Tick += async (_, _) => await UploadScreenshotAsync(force: true);

        // Boot cleanup — tear down any leftover per-player junctions from a
        // previous session that didn't shut down cleanly. Safe to call always.
        try { PlayerSession.RestoreToBlank(); }
        catch (Exception ex) { App.Log($"BOOT_CLEANUP_FAIL: {ex.Message}"); }

        // Boot-time AppData wipe — catches the case where the previous session
        // crashed/power-cut before the logout wipe ran. Background thread so
        // it doesn't delay the kiosk window from showing up.
        Task.Run(() =>
        {
            try { LocalAppDataCleaner.Wipe("boot"); }
            catch (Exception ex) { App.Log($"LOCALAPPDATA_WIPE_BOOT_FAIL: {ex.Message}"); }
        });

        // System tray icon (shows remaining coins/time when player is in a game)
        InitTrayIcon();

        // Get window handle once loaded
        SourceInitialized += (_, _) =>
        {
            _hwnd = new WindowInteropHelper(this).Handle;
        };

        // Resolve LAN/Cloud URL, then WebView2 init + Firebase init
        Loaded += async (_, _) =>
        {
            try
            {
                LoadingText.Text = "Scanning network...";
                _kioskUrl = await ResolveKioskUrlAsync();
                App.Log($"KIOSK_URL: {_kioskUrl}");
                var isLan = _kioskUrl.StartsWith("http://");
                LoadingMode.Text = isLan ? "LAN MODE" : "CLOUD MODE";
                LoadingText.Text = "Loading kiosk...";
            }
            catch (Exception ex)
            {
                App.Log($"URL_RESOLVE_FAIL: {ex.Message} — using cloud");
                _kioskUrl = CloudUrl;
                LoadingMode.Text = "CLOUD MODE";
                LoadingText.Text = "Loading kiosk...";
            }

            try { await InitWebView(); }
            catch (Exception ex) { App.Log($"WEBVIEW_INIT_FAIL: {ex}"); }

            // Initialize Firebase connection
            await InitFirebaseAsync();
        };

        // Block close unless exiting
        Closing += (_, e) =>
        {
            if (!_exiting) { e.Cancel = true; return; }
            Cleanup();
        };

        // Block Alt+F4
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == System.Windows.Input.Key.System && e.SystemKey == System.Windows.Input.Key.F4)
                e.Handled = true;
        };

        // Refocus ONLY when locked
        Deactivated += (_, _) =>
        {
            if (_isLocked && !_exiting)
            {
                Dispatcher.BeginInvoke(() =>
                {
                    if (_isLocked && !_exiting)
                    {
                        Topmost = true;
                        WindowState = WindowState.Maximized;
                        Activate();
                    }
                }, DispatcherPriority.ApplicationIdle);
            }
        };
    }

    // ══════════════════════════════════════════
    //  TRAY ICON
    // ══════════════════════════════════════════

    private void InitTrayIcon()
    {
        System.Drawing.Icon? icon = null;
        try
        {
            var exePath = System.Reflection.Assembly.GetExecutingAssembly().Location.Replace(".dll", ".exe");
            icon = System.Drawing.Icon.ExtractAssociatedIcon(exePath);
        }
        catch { }

        _trayIcon = new Forms.NotifyIcon
        {
            Icon = icon ?? System.Drawing.SystemIcons.Application,
            Text = "Ninja Games Kiosk",
            Visible = true,
        };

        // Double-click tray icon to bring kiosk to front
        _trayIcon.DoubleClick += (_, _) =>
        {
            Dispatcher.Invoke(() =>
            {
                WindowState = WindowState.Maximized;
                Topmost = true;
                Activate();
                if (!_isLocked) Dispatcher.BeginInvoke(() => { Topmost = false; }, DispatcherPriority.Background);
            });
        };
    }

    private void UpdateTrayTooltip()
    {
        if (_trayIcon == null) return;

        string tip;
        if (_isLocked || string.IsNullOrEmpty(_currentPlayerName))
        {
            tip = "Ninja Games Kiosk — No active session";
        }
        else
        {
            var hours = _coinsRemaining / 150.0; // ~150 coins/hr based on pricing
            var timeStr = hours >= 1 ? $"{hours:F1}h left" : $"{(int)(hours * 60)}m left";
            tip = $"🎮 {_currentPlayerName}\n💰 {_coinsRemaining} coins · {timeStr}";
        }

        // NotifyIcon tooltip max is 127 chars
        if (tip.Length > 127) tip = tip[..127];
        _trayIcon.Text = tip;
    }

    // ══════════════════════════════════════════
    //  GUARD TICK
    // ══════════════════════════════════════════

    private void GuardTick(object? s, EventArgs e)
    {
        // Strict mode only: re-hide taskbar if Windows decided to put it back.
        // Permissive mode leaves the taskbar alone.
        if (!PermissiveShell && _taskbarHidden) HideTaskbar();

        // Re-install keyboard hook if Windows silently removed it
        if (_hookId == IntPtr.Zero || !IsHookValid())
        {
            App.Log("HOOK_REINSTALL: hook was lost, re-installing");
            try { if (_hookId != IntPtr.Zero) UnhookWindowsHookEx(_hookId); } catch { }
            _hookHasFired = false;
            InstallHook();
        }

        // Poll cmd.txt
        if (File.Exists(_cmdFile))
        {
            try
            {
                var cmd = File.ReadAllText(_cmdFile).Trim();
                File.Delete(_cmdFile);
                if (!string.IsNullOrEmpty(cmd)) RunCommand(cmd);
            }
            catch { }
        }
    }

    private void RunCommand(string cmd)
    {
        switch (cmd.ToLower().Trim())
        {
            case "lock":
            case "session-logout":
                DoLock();
                break;
            case "unlock":
            case "session-login":
                DoUnlock();
                break;
            case "quit":
            case "ghanemexit":
                App.Log($"EXIT via cmd: {cmd}");
                ExitKiosk();
                break;
            case "reload":
                try { WebView.CoreWebView2?.Navigate(_kioskUrl); } catch { }
                break;
            case "minimize":
                WindowState = WindowState.Minimized;
                break;
            case "restore":
                WindowState = WindowState.Maximized;
                Activate();
                break;
        }
    }

    private void DoLock()
    {
        _isLocked = true;
        _allowAltTab = PermissiveShell;          // permissive: keep alt-tab usable
        _taskbarHidden = !PermissiveShell;
        _timeRemaining = 0;
        _currentPlayerName = null;
        _coinsRemaining = 0;
        UpdateTrayTooltip();
        if (!PermissiveShell)
        {
            HideTaskbar();
            DisableCtrlAltDel();
        }

        // ── Per-player session save ──
        // If a player was logged in, save their per-app state (Steam junctions, etc)
        // and write the session-end record to Firestore for history.
        var loggedOutUid = _currentPlayerUid;
        var loggedOutUsername = _currentPlayerUsername;
        var endingSessionId = _currentSessionId;
        var startedAt = _sessionStartedAt;
        if (!string.IsNullOrEmpty(loggedOutUid))
        {
            try { PlayerSession.SaveSession(loggedOutUid); }
            catch (Exception ex) { App.Log($"PLAYER_SAVE_FAIL: {ex.Message}"); }
            // Push saved data to the LAN server share so other PCs can pick it up
            try { PlayerSession.SyncToNetwork(loggedOutUid); }
            catch (Exception ex) { App.Log($"PLAYER_SYNC_PUSH_FAIL: {ex.Message}"); }
        }
        _currentPlayerUid = null;
        _currentPlayerUsername = null;
        _currentSessionId = null;

        // Kill all processes launched during the session
        KillSessionProcesses();

        // Wipe %LOCALAPPDATA% so the next player gets a fresh slate (fixes
        // "Riot Client already running for another user", anti-cheat token
        // bleed-through, FiveM cache corruption, browser session leaks, etc.).
        // Runs on a background thread so the lock-screen UI doesn't freeze
        // for the 5–15s the wipe takes on a busy disk.
        Task.Run(() =>
        {
            try { LocalAppDataCleaner.Wipe("logout"); }
            catch (Exception ex) { App.Log($"LOCALAPPDATA_WIPE_LOGOUT_FAIL: {ex.Message}"); }
        });

        Topmost = true;
        WindowState = WindowState.Maximized;
        Activate();
        App.Log($"LOCKED (player={loggedOutUsername ?? "<none>"})");

        _ = FirebaseUpdateStatusAsync("locked");

        // Write session-end to Firestore (fire and forget)
        if (!string.IsNullOrEmpty(endingSessionId))
        {
            _ = Task.Run(async () => {
                try
                {
                    var durationSec = (int)(DateTime.UtcNow - startedAt).TotalSeconds;
                    await _firebase.EndPlayerSessionAsync(endingSessionId!, durationSec);
                }
                catch (Exception ex) { App.Log($"SESSION_END_FAIL: {ex.Message}"); }
            });
        }
        if (!string.IsNullOrEmpty(_stationId))
        {
            _ = Task.Run(async () => {
                try { await _firebase.ClearCurrentPlayerAsync(_stationId!); }
                catch (Exception ex) { App.Log($"CLEAR_PLAYER_FAIL: {ex.Message}"); }
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  PLAYER LOGIN / LOGOUT (called from web bridge)
    // ──────────────────────────────────────────────────────────────────────

    private void HandlePlayerLogin(string uid, string username)
    {
        try
        {
            _currentPlayerUid = uid;
            _currentPlayerUsername = username;
            _sessionStartedAt = DateTime.UtcNow;

            App.Log($"PLAYER_LOGIN: uid={uid} username={username}");

            // Wipe %LOCALAPPDATA% BEFORE pulling the player's roamed data so
            // we don't accidentally erase what we just synced. Runs on a
            // background thread so login UI stays responsive — the network
            // pull below races with the wipe but only touches preserved
            // ninja-games-kiosk dirs and per-player junctions, so they don't
            // collide.
            Task.Run(() =>
            {
                try { LocalAppDataCleaner.Wipe("login"); }
                catch (Exception ex) { App.Log($"LOCALAPPDATA_WIPE_LOGIN_FAIL: {ex.Message}"); }
            });

            // Pull player's data from the LAN server share (cross-PC roaming).
            // If the share isn't available, this is a no-op and the player gets
            // whatever local data exists (or a fresh start if first time on this PC).
            try { PlayerSession.SyncFromNetwork(uid); }
            catch (Exception ex) { App.Log($"PLAYER_SYNC_PULL_FAIL: {ex.Message}"); }

            // Restore the player's per-app state (Steam junctions etc)
            try { PlayerSession.RestoreSession(uid); }
            catch (Exception ex) { App.Log($"PLAYER_RESTORE_FAIL: {ex.Message}"); }

            // Write session-start record + update PC's currentPlayer (history + live state)
            if (!string.IsNullOrEmpty(_stationId))
            {
                _ = Task.Run(async () => {
                    try
                    {
                        var sessionId = await _firebase.StartPlayerSessionAsync(_stationId!, uid, username);
                        _currentSessionId = sessionId;
                        await _firebase.SetCurrentPlayerAsync(_stationId!, uid, username);
                    }
                    catch (Exception ex) { App.Log($"SESSION_START_FAIL: {ex.Message}"); }
                });
            }
        }
        catch (Exception ex)
        {
            App.Log($"HANDLE_LOGIN_ERROR: {ex.Message}");
        }
    }

    private void HandlePlayerLogout()
    {
        // We don't lock the kiosk here — the web UI handles its own logout flow
        // and will call session-logout separately. This just makes sure the
        // per-player state is saved if the web logs out without locking.
        if (string.IsNullOrEmpty(_currentPlayerUid)) return;
        try { PlayerSession.SaveSession(_currentPlayerUid); }
        catch (Exception ex) { App.Log($"PLAYER_LOGOUT_SAVE_FAIL: {ex.Message}"); }

        // After roaming data is safely on the server share, hard-wipe any
        // account-bleeding folders not covered by the junction system
        // (currently: AppData\Local\FortniteGame caches/EAC tokens).
        try { PlayerSession.HardCleanupAfterLogout(); }
        catch (Exception ex) { App.Log($"PLAYER_LOGOUT_CLEANUP_FAIL: {ex.Message}"); }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SCREENSHOT CAPTURE (live admin view)
    // ──────────────────────────────────────────────────────────────────────

    private bool _screenshotInProgress;

    private async Task UploadScreenshotAsync(bool force = false)
    {
        // Skip if locked (no point uploading lock screen) unless forced by admin command
        if (!force && _isLocked) return;
        if (string.IsNullOrEmpty(_stationId)) return;
        if (_screenshotInProgress) return;
        _screenshotInProgress = true;
        try
        {
            string? base64 = null;
            await Task.Run(() =>
            {
                try { base64 = CaptureScreenAsBase64Jpeg(targetWidth: 1280, jpegQuality: 80); }
                catch (Exception ex) { App.Log($"SCREENSHOT_CAP_FAIL: {ex.Message}"); }
            });
            if (string.IsNullOrEmpty(base64)) return;
            await _firebase.UploadScreenshotAsync(_stationId!, base64!);
        }
        catch (Exception ex)
        {
            App.Log($"SCREENSHOT_UPLOAD_FAIL: {ex.Message}");
        }
        finally
        {
            _screenshotInProgress = false;
        }
    }

    /// <summary>
    /// Captures the primary screen, downscales to <paramref name="targetWidth"/>
    /// (preserving aspect), encodes as JPEG at the given quality, and returns
    /// a base64 string suitable for embedding in a data: URL.
    /// </summary>
    private static string CaptureScreenAsBase64Jpeg(int targetWidth, long jpegQuality)
    {
        var bounds = System.Windows.Forms.Screen.PrimaryScreen?.Bounds
                     ?? new System.Drawing.Rectangle(0, 0, 1920, 1080);

        using var full = new System.Drawing.Bitmap(bounds.Width, bounds.Height);
        using (var g = System.Drawing.Graphics.FromImage(full))
        {
            g.CopyFromScreen(bounds.Location, System.Drawing.Point.Empty, bounds.Size);
        }

        // Downscale
        var scale = (double)targetWidth / bounds.Width;
        var w = targetWidth;
        var h = (int)(bounds.Height * scale);
        using var scaled = new System.Drawing.Bitmap(w, h);
        using (var g = System.Drawing.Graphics.FromImage(scaled))
        {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.SmoothingMode      = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            g.PixelOffsetMode    = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
            g.DrawImage(full, 0, 0, w, h);
        }

        // Encode as JPEG with custom quality
        var jpegEncoder = System.Drawing.Imaging.ImageCodecInfo.GetImageDecoders()
            .FirstOrDefault(c => c.FormatID == System.Drawing.Imaging.ImageFormat.Jpeg.Guid);
        var encParams = new System.Drawing.Imaging.EncoderParameters(1)
        {
            Param = { [0] = new System.Drawing.Imaging.EncoderParameter(
                System.Drawing.Imaging.Encoder.Quality, jpegQuality) }
        };

        using var ms = new MemoryStream();
        if (jpegEncoder != null) scaled.Save(ms, jpegEncoder, encParams);
        else scaled.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg);

        return Convert.ToBase64String(ms.ToArray());
    }

    private void KillSessionProcesses()
    {
        try
        {
            var killed = 0;
            // System processes to never kill
            var safeNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "explorer", "svchost", "csrss", "wininit", "winlogon", "lsass", "services",
                "smss", "system", "idle", "dwm", "taskhostw", "sihost", "fontdrvhost",
                "conhost", "ctfmon", "dashost", "searchhost", "startmenuexperiencehost",
                "runtimebroker", "shellexperiencehost", "textinputhost", "widgetservice",
                "msedgewebview2", "ninjakiosk", "cmd", "powershell", "pwsh",
            };

            foreach (var proc in Process.GetProcesses())
            {
                try
                {
                    // Skip if it existed before the session
                    if (_preSessionPids.Contains(proc.Id)) continue;
                    // Skip system/safe processes
                    if (safeNames.Contains(proc.ProcessName)) continue;
                    // Skip session 0 (system services)
                    if (proc.SessionId == 0) continue;

                    App.Log($"KILL: {proc.ProcessName} (PID {proc.Id})");
                    proc.Kill();
                    killed++;
                }
                catch { }
            }

            // Also kill specifically tracked PIDs
            foreach (var pid in _launchedPids)
            {
                try { Process.GetProcessById(pid).Kill(); } catch { }
            }
            _launchedPids.Clear();

            App.Log($"KILLED {killed} session processes");
        }
        catch (Exception ex)
        {
            App.Log($"KILL_ERROR: {ex.Message}");
        }
    }

    private void SessionCleanup()
    {
        if (_cleanupInProgress) return;
        _cleanupInProgress = true;

        Task.Run(() =>
        {
            try
            {
                App.Log("CLEANUP: Session cleanup started");

                // 1. Kill non-essential processes
                KillNonEssentialProcesses();

                // 2. Clear Steam login
                var steamPaths = new[] { @"C:\Program Files (x86)\Steam", @"D:\Steam" };
                foreach (var steamRoot in steamPaths)
                {
                    if (!Directory.Exists(steamRoot)) continue;
                    SafeDeleteFile(Path.Combine(steamRoot, "config", "loginusers.vdf"));
                    SafeDeleteFile(Path.Combine(steamRoot, "config", "config.vdf"));
                    try
                    {
                        foreach (var f in Directory.GetFiles(steamRoot, "ssfn*"))
                            SafeDeleteFile(f);
                    }
                    catch (Exception ex) { App.Log($"CLEANUP: Steam ssfn enum error: {ex.Message}"); }
                    var userdata = Path.Combine(steamRoot, "userdata");
                    if (Directory.Exists(userdata))
                    {
                        try
                        {
                            foreach (var dir in Directory.GetDirectories(userdata))
                                SafeDeleteDirectory(dir);
                        }
                        catch (Exception ex) { App.Log($"CLEANUP: Steam userdata enum error: {ex.Message}"); }
                    }
                }

                // 3. Clear Epic Games login
                var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                SafeDeleteFile(Path.Combine(localAppData, @"EpicGamesLauncher\Saved\Config\Windows\GameUserSettings.ini"));
                SafeDeleteDirectoryContents(Path.Combine(localAppData, @"EpicGamesLauncher\Saved\Logs"));

                // 4. Clear Discord
                var discordRoot = Path.Combine(appData, "discord");
                SafeDeleteDirectory(Path.Combine(discordRoot, "Local Storage"));
                SafeDeleteDirectory(Path.Combine(discordRoot, "Session Storage"));
                SafeDeleteDirectory(Path.Combine(discordRoot, "Cache"));

                // 5. Clear Riot/Valorant
                var riotData = Path.Combine(localAppData, @"Riot Games\Riot Client\Data");
                SafeDeleteFile(Path.Combine(riotData, "RiotGamesPrivateSettings.yaml"));
                SafeDeleteFile(Path.Combine(riotData, "RiotClientPrivateSettings.yaml"));

                // 6. Clear Roblox
                SafeDeleteDirectory(Path.Combine(localAppData, @"Roblox\LocalStorage"));
                try
                {
                    var robloxAppData = Path.Combine(appData, "Roblox");
                    if (Directory.Exists(robloxAppData))
                    {
                        foreach (var f in Directory.GetFiles(robloxAppData, "Cookie*"))
                            SafeDeleteFile(f);
                    }
                }
                catch (Exception ex) { App.Log($"CLEANUP: Roblox cookie enum error: {ex.Message}"); }

                // Battle.net
                SafeDeleteFile(Path.Combine(appData, "Battle.net", "Battle.net.config"));

                // FiveM
                SafeDeleteDirectory(Path.Combine(localAppData, "FiveM", "FiveM.app", "data", "cache"));

                // 7. Clear browsers
                var browserFiles = new[] { "Cookies", "Login Data", "History", "Web Data", "Local Storage", "Session Storage", "Cache" };

                // Chrome
                var chromeDefault = Path.Combine(localAppData, @"Google\Chrome\User Data\Default");
                foreach (var item in browserFiles)
                {
                    var p = Path.Combine(chromeDefault, item);
                    if (Directory.Exists(p)) SafeDeleteDirectory(p);
                    else SafeDeleteFile(p);
                }

                // Edge
                var edgeDefault = Path.Combine(localAppData, @"Microsoft\Edge\User Data\Default");
                foreach (var item in browserFiles)
                {
                    var p = Path.Combine(edgeDefault, item);
                    if (Directory.Exists(p)) SafeDeleteDirectory(p);
                    else SafeDeleteFile(p);
                }

                // Firefox
                var ffProfiles = Path.Combine(appData, @"Mozilla\Firefox\Profiles");
                if (Directory.Exists(ffProfiles))
                {
                    try
                    {
                        foreach (var profile in Directory.GetDirectories(ffProfiles))
                        {
                            SafeDeleteFile(Path.Combine(profile, "cookies.sqlite"));
                            SafeDeleteFile(Path.Combine(profile, "logins.json"));
                            SafeDeleteFile(Path.Combine(profile, "sessionstore.jsonlz4"));
                        }
                    }
                    catch (Exception ex) { App.Log($"CLEANUP: Firefox profiles enum error: {ex.Message}"); }
                }

                // 8. Clear system temp & misc
                var tempPath = Path.GetTempPath();
                SafeDeleteDirectoryContents(tempPath);
                SafeDeleteDirectoryContents(Path.Combine(localAppData, "Temp"));

                // Clear clipboard on UI thread
                try { Dispatcher.Invoke(() => System.Windows.Clipboard.Clear()); }
                catch (Exception ex) { App.Log($"CLEANUP: Clipboard clear error: {ex.Message}"); }

                // Flush DNS
                try
                {
                    var psi = new ProcessStartInfo("ipconfig", "/flushdns")
                    {
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process.Start(psi)?.WaitForExit(5000);
                    App.Log("CLEANUP: DNS cache flushed");
                }
                catch (Exception ex) { App.Log($"CLEANUP: DNS flush error: {ex.Message}"); }

                // Clear recent docs
                var recentDir = Path.Combine(appData, @"Microsoft\Windows\Recent");
                SafeDeleteDirectoryContents(recentDir);

                // 9. Clear Desktop & Downloads
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var desktop = Path.Combine(userProfile, "Desktop");
                if (Directory.Exists(desktop))
                {
                    try
                    {
                        foreach (var f in Directory.GetFiles(desktop))
                        {
                            if (f.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) continue;
                            SafeDeleteFile(f);
                        }
                    }
                    catch (Exception ex) { App.Log($"CLEANUP: Desktop enum error: {ex.Message}"); }
                }

                var downloads = Path.Combine(userProfile, "Downloads");
                SafeDeleteDirectoryContents(downloads);

                App.Log("CLEANUP: Session cleanup completed");
            }
            catch (Exception ex)
            {
                App.Log($"CLEANUP: Fatal error: {ex.Message}");
            }
            finally
            {
                _cleanupInProgress = false;
            }
        });
    }

    private void KillNonEssentialProcesses()
    {
        var whitelist = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "explorer", "NinjaKiosk", "msedgewebview2", "svchost", "csrss", "wininit",
            "winlogon", "lsass", "services", "smss", "System", "dwm", "conhost",
            "RuntimeBroker", "taskhostw", "sihost", "fontdrvhost", "SearchHost",
            "StartMenuExperienceHost", "ShellExperienceHost", "TextInputHost", "ctfmon"
        };

        var killed = 0;
        foreach (var proc in Process.GetProcesses())
        {
            try
            {
                if (whitelist.Contains(proc.ProcessName)) continue;
                if (proc.SessionId == 0) continue; // system services
                App.Log($"CLEANUP: Killing {proc.ProcessName} (PID {proc.Id})");
                proc.Kill();
                killed++;
            }
            catch { }
        }
        App.Log($"CLEANUP: Killed {killed} non-essential processes");
    }

    private static void SafeDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
                App.Log($"CLEANUP: Deleted {path}");
            }
        }
        catch (Exception ex) { App.Log($"CLEANUP: Failed to delete {path}: {ex.Message}"); }
    }

    private static void SafeDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
                App.Log($"CLEANUP: Deleted {path}");
            }
        }
        catch (Exception ex) { App.Log($"CLEANUP: Failed to delete {path}: {ex.Message}"); }
    }

    private static void SafeDeleteDirectoryContents(string path)
    {
        if (!Directory.Exists(path)) return;
        try
        {
            foreach (var file in Directory.GetFiles(path))
                SafeDeleteFile(file);
            foreach (var dir in Directory.GetDirectories(path))
                SafeDeleteDirectory(dir);
        }
        catch (Exception ex) { App.Log($"CLEANUP: Failed to clear {path}: {ex.Message}"); }
    }

    private void DoUnlock()
    {
        _isLocked = false;
        _allowAltTab = true;
        _taskbarHidden = false;
        // Always make sure the taskbar is visible on unlock — even if we
        // were running in strict mode and just toggled to permissive.
        ShowTaskbar();
        Topmost = false;
        // Snapshot current processes so we know what to keep on logout
        try { _preSessionPids = new HashSet<int>(Process.GetProcesses().Select(p => p.Id)); } catch { }
        _launchedPids.Clear();
        // Stay in normal z-order so sidebar tabs remain clickable
        // Window only goes to HWND_BOTTOM when a game is actually launched
        WindowState = WindowState.Maximized;
        App.Log("UNLOCKED");

        _ = FirebaseUpdateStatusAsync("online");
    }

    // ══════════════════════════════════════════
    //  KEYBOARD HOOK
    // ══════════════════════════════════════════

    private void InstallHook()
    {
        _hookProc = HookCallback;
        _hookId = SetWindowsHookEx(13, _hookProc, GetModuleHandle("user32"), 0);
        App.Log(_hookId != IntPtr.Zero ? "HOOK_OK" : "HOOK_FAILED");
    }

    private bool IsHookValid()
    {
        // Only check after the hook has fired at least once (user has pressed a key).
        // If the hook hasn't fired in 10+ seconds after that, Windows likely removed it.
        if (!_hookHasFired) return true;
        return (DateTime.UtcNow - _lastHookFire).TotalSeconds < 10;
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        _hookHasFired = true;
        _lastHookFire = DateTime.UtcNow;
        if (nCode >= 0)
        {
            int vk = Marshal.ReadInt32(lParam);
            int flags = Marshal.ReadInt32(lParam, 8);
            bool alt = (flags & 0x20) != 0;
            bool keyDown = (int)wParam == 0x0100 || (int)wParam == 0x0104;

            // Kill phrase — always active, in every mode. Letters A-Z buffer
            // up to 50 chars; on match we exit. Even Task Manager being open
            // (Ctrl+Shift+Esc) can't stop the keyboard hook from firing here.
            if (keyDown && vk >= 0x41 && vk <= 0x5A)
            {
                _killBuffer += (char)(vk + 32);
                if (_killBuffer.Length > 50) _killBuffer = _killBuffer.Substring(_killBuffer.Length - 50);
                if (_killBuffer.Contains(KillPhrase))
                {
                    App.Log($"KILLPHRASE: {_killBuffer}");
                    _killBuffer = "";
                    Dispatcher.BeginInvoke(() => ExitKiosk());
                    return (IntPtr)1;
                }
            }

            // ── Permissive mode: pass everything through after the killphrase ──
            // The user can Alt+Tab, hit the Win key, open Task Manager, open
            // Control Panel via Win+I, pair a PS controller via Settings, etc.
            // The kiosk window stays visible because it reasserts focus when
            // locked (see Deactivated handler) — but it doesn't BLOCK anything.
            if (PermissiveShell)
            {
                return CallNextHookEx(_hookId, nCode, wParam, lParam);
            }

            // ── Strict mode: legacy blocking behaviour ──
            // Block Windows keys
            if (vk == 0x5B || vk == 0x5C) return (IntPtr)1;
            // Block Ctrl+Esc (Start menu)
            if (vk == 0x1B && (GetAsyncKeyState(0x11) & 0x8000) != 0) return (IntPtr)1;
            // Block Ctrl+Shift+Esc (Task Manager)
            if (vk == 0x1B && (GetAsyncKeyState(0x11) & 0x8000) != 0 && (GetAsyncKeyState(0x10) & 0x8000) != 0) return (IntPtr)1;
            // Block Alt+F4
            if (alt && vk == 0x73) return (IntPtr)1;
            // Block Alt+Esc
            if (alt && vk == 0x1B) return (IntPtr)1;
            // Block Alt+Tab when locked
            if (alt && vk == 0x09 && !_allowAltTab) return (IntPtr)1;
        }
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    // ══════════════════════════════════════════
    //  TASKBAR
    // ══════════════════════════════════════════

    private static void HideTaskbar()
    {
        var tb = FindWindow("Shell_TrayWnd", null);
        if (tb != IntPtr.Zero)
        {
            ShowWindow(tb, 0);
            EnableWindow(tb, false);
            SetWindowPos(tb, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        var tb2 = FindWindow("Shell_SecondaryTrayWnd", null);
        if (tb2 != IntPtr.Zero)
        {
            ShowWindow(tb2, 0);
            EnableWindow(tb2, false);
        }
    }

    private static void ShowTaskbar()
    {
        var tb = FindWindow("Shell_TrayWnd", null);
        if (tb != IntPtr.Zero) { EnableWindow(tb, true); ShowWindow(tb, 5); }
        var tb2 = FindWindow("Shell_SecondaryTrayWnd", null);
        if (tb2 != IntPtr.Zero) { EnableWindow(tb2, true); ShowWindow(tb2, 5); }
    }

    // ══════════════════════════════════════════
    //  CTRL+ALT+DEL LOCKDOWN
    // ══════════════════════════════════════════
    // Policies are set by the installer (admin) via registry.
    // These helpers run reg.exe as a fallback.

    private static void DisableCtrlAltDel()
    {
        try
        {
            RunHidden("reg", @"add HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableTaskMgr /t REG_DWORD /d 1 /f");
            RunHidden("reg", @"add HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableLockWorkstation /t REG_DWORD /d 1 /f");
            RunHidden("reg", @"add HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableChangePassword /t REG_DWORD /d 1 /f");
            RunHidden("reg", @"add HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer /v NoLogoff /t REG_DWORD /d 1 /f");
            App.Log("CTRLALTDEL_DISABLED");
        }
        catch (Exception ex) { App.Log($"CTRLALTDEL_DISABLE_FAIL: {ex.Message}"); }
    }

    private static void EnableCtrlAltDel()
    {
        try
        {
            RunHidden("reg", @"delete HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableTaskMgr /f");
            RunHidden("reg", @"delete HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableLockWorkstation /f");
            RunHidden("reg", @"delete HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System /v DisableChangePassword /f");
            RunHidden("reg", @"delete HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer /v NoLogoff /f");
            App.Log("CTRLALTDEL_ENABLED");
        }
        catch (Exception ex) { App.Log($"CTRLALTDEL_ENABLE_FAIL: {ex.Message}"); }
    }

    private static void RunHidden(string exe, string args)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                Arguments = args,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false
            })?.WaitForExit(3000);
        }
        catch { }
    }

    // ══════════════════════════════════════════
    //  WEBVIEW2
    // ══════════════════════════════════════════

    private async Task InitWebView()
    {
        var userDataFolder = Path.Combine(_cmdDir, "WebView2Data");
        // Build all common LAN origins to allow getUserMedia on HTTP
        var origins = new List<string> { "http://localhost:3000" };
        // Add the resolved kiosk origin
        if (_kioskUrl.StartsWith("http://"))
        {
            try
            {
                var uri = new Uri(_kioskUrl);
                origins.Add($"http://{uri.Host}:{uri.Port}");
            }
            catch { }
        }
        // Also add common LAN subnets (192.168.x.x, 10.x.x.x)
        foreach (var iface in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
        {
            foreach (var addr in iface.GetIPProperties().UnicastAddresses)
            {
                if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                {
                    var ip = addr.Address.ToString();
                    if (ip.StartsWith("192.168.") || ip.StartsWith("10.") || ip.StartsWith("172."))
                        origins.Add($"http://{ip}:3000");
                }
            }
        }
        var originList = string.Join(",", origins.Distinct());
        App.Log($"WEBVIEW_SECURE_ORIGINS: {originList}");
        var options = new CoreWebView2EnvironmentOptions(
            $"--unsafely-treat-insecure-origin-as-secure={originList} --use-fake-ui-for-media-stream"
        );
        var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
        await WebView.EnsureCoreWebView2Async(env);

        var settings = WebView.CoreWebView2.Settings;
        settings.AreDevToolsEnabled = true;
        settings.IsStatusBarEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;

        WebView.CoreWebView2.WebMessageReceived += OnWebMessage;

        // Auto-grant microphone and camera permissions (for voice calls)
        WebView.CoreWebView2.PermissionRequested += (s, args) =>
        {
            if (args.PermissionKind == CoreWebView2PermissionKind.Microphone ||
                args.PermissionKind == CoreWebView2PermissionKind.Camera ||
                args.PermissionKind == CoreWebView2PermissionKind.Autoplay)
            {
                args.State = CoreWebView2PermissionState.Allow;
                App.Log($"PERMISSION_GRANTED: {args.PermissionKind}");
            }
        };

        // Inject electronAPI bridge
        await WebView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript());

        // Log all console messages from the web page
        WebView.CoreWebView2.Settings.AreDevToolsEnabled = true;

        WebView.CoreWebView2.NavigationCompleted += (_, args) =>
        {
            _webViewReady = true;
            App.Log($"NAV_COMPLETE: success={args.IsSuccess}");
            Dispatcher.Invoke(() => LoadingOverlay.Visibility = Visibility.Collapsed);
        };

        // Crash recovery
        WebView.CoreWebView2.ProcessFailed += async (_, args) =>
        {
            App.Log($"WEBVIEW_CRASH: {args.ProcessFailedKind} reason={args.Reason}");
            _webViewReady = false;
            await Task.Delay(3000);
            try
            {
                if (args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited ||
                    args.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                {
                    Dispatcher.Invoke(() =>
                    {
                        LoadingOverlay.Visibility = Visibility.Visible;
                        WebView.CoreWebView2?.Reload();
                    });
                }
            }
            catch (Exception ex) { App.Log($"RECOVERY_FAIL: {ex.Message}"); }
        };

        WebView.CoreWebView2.Navigate(_kioskUrl);
        App.Log("WEBVIEW_OK");
    }

    private string BridgeScript()
    {
        var pcDocId = _stationId ?? "";
        var pcName = _stationName ?? "";
        return @"
        window.electronAPI = {
            sessionLogin: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'session-login'}));
                return Promise.resolve({success:true});
            },
            sessionLogout: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'session-logout'}));
                return Promise.resolve({success:true});
            },
            // Web calls this with the player object after a successful login.
            // We forward the uid + username to the C# side for per-player session
            // restore + history tracking.
            playerLogin: function(player) {
                try {
                    window.chrome.webview.postMessage(JSON.stringify({
                        action:'player-login',
                        uid: (player && player.uid) || '',
                        username: (player && player.username) || ''
                    }));
                } catch(e) {}
                return Promise.resolve({success:true});
            },
            playerLogout: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'player-logout'}));
                return Promise.resolve({success:true});
            },
            launchGame: function(gameId, exePath) {
                window.chrome.webview.postMessage(JSON.stringify({action:'launch-game', gameId:gameId, exePath:exePath}));
                return Promise.resolve({success:true});
            },
            // One-click install on the local PC. Source is { type, appid|slug|url }
            // - same shape as INSTALL_SOURCES on the server. C# runs the
            // matching shell command and emits game-install-result.
            installGame: function(gameId, source) {
                window.chrome.webview.postMessage(JSON.stringify({action:'install-game', gameId:gameId, source:source||null}));
                return Promise.resolve({success:true});
            },
            // Player escalates a problem to admin via the launch-failure popup.
            // Writes a doc to pc-alerts that surfaces as a toast in the admin UI.
            informAdmin: function(payload) {
                window.chrome.webview.postMessage(JSON.stringify({action:'inform-admin', payload:payload||{}}));
                return Promise.resolve({success:true});
            },
            // Shell-execute any URI: ms-settings:bluetooth, ms-settings:display,
            // https://..., file:///..., even mailto:. Used by the System
            // Settings cards so players can open Bluetooth pairing etc without
            // a taskbar.
            openUri: function(uri) {
                window.chrome.webview.postMessage(JSON.stringify({action:'open-uri', uri:String(uri||'')}));
                return Promise.resolve({success:true});
            },
            returnToKiosk: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'return-to-kiosk'}));
                return Promise.resolve({success:true});
            },
            killSwitch: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'quit'}));
            },
            restartPC: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'restart-pc'}));
                return Promise.resolve({success:true});
            },
            shutdownPC: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'shutdown-pc'}));
                return Promise.resolve({success:true});
            },
            getPcInfo: function() {
                return Promise.resolve({pcDocId:'__PCDOCID__', pcName:'__PCNAME__'});
            },
            onPcInfo: function(cb) {
                cb({pcDocId:'__PCDOCID__', pcName:'__PCNAME__'});
            },
            lockPC: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'lock'}));
                return Promise.resolve({success:true});
            },
            unlockPC: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'unlock'}));
                return Promise.resolve({success:true});
            },
            resetPcSetup: function() {
                window.chrome.webview.postMessage(JSON.stringify({action:'reset-setup'}));
                return Promise.resolve({success:true});
            }
        };
        window.NinjaKiosk = {
            sendCommand: function(c) { window.chrome.webview.postMessage(JSON.stringify({action:c})); },
            lock: function() { window.electronAPI.lockPC(); },
            unlock: function() { window.electronAPI.unlockPC(); },
            quit: function() { window.electronAPI.killSwitch(); }
        };
        console.log('[NinjaKiosk] Bridge ready — station: __PCDOCID__');
    ".Replace("__PCDOCID__", pcDocId).Replace("__PCNAME__", pcName);
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(raw)) return;

            App.Log($"MSG: {raw}");

            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(raw);
                root = doc.RootElement.Clone();
            }
            catch
            {
                RunCommand(raw);
                return;
            }

            var action = root.TryGetProperty("action", out var a) ? a.GetString() ?? "" : "";

            switch (action)
            {
                case "session-login":
                    DoUnlock();
                    break;
                case "session-logout":
                    DoLock();
                    break;
                case "player-login":
                    {
                        var uid = root.TryGetProperty("uid", out var u) ? u.GetString() ?? "" : "";
                        var uname = root.TryGetProperty("username", out var n) ? n.GetString() ?? "" : "";
                        if (!string.IsNullOrEmpty(uid)) HandlePlayerLogin(uid, uname);
                    }
                    break;
                case "player-logout":
                    HandlePlayerLogout();
                    break;
                case "launch-game":
                    if (_isLocked) DoUnlock();
                    LaunchGame(root);
                    break;
                case "install-game":
                    InstallGameLocal(root);
                    break;
                case "inform-admin":
                    InformAdmin(root);
                    break;
                case "open-uri":
                    {
                        var uri = root.TryGetProperty("uri", out var u) ? u.GetString() ?? "" : "";
                        if (!string.IsNullOrEmpty(uri))
                        {
                            try
                            {
                                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
                                App.Log($"OPEN_URI: {uri}");
                            }
                            catch (Exception ex) { App.Log($"OPEN_URI_FAIL: {uri} {ex.Message}"); }
                        }
                    }
                    break;
                case "return-to-kiosk":
                    // Bring kiosk back to front temporarily
                    WindowState = WindowState.Maximized;
                    Topmost = true;
                    Activate();
                    // Then push back down if unlocked
                    if (!_isLocked)
                    {
                        Dispatcher.BeginInvoke(() => { Topmost = false; }, DispatcherPriority.Background);
                    }
                    break;
                case "restart-pc":
                    Process.Start("shutdown.exe", "/r /t 5 /f");
                    break;
                case "shutdown-pc":
                    Process.Start("shutdown.exe", "/s /t 5 /f");
                    break;
                case "lock":
                    DoLock();
                    break;
                case "unlock":
                    DoUnlock();
                    break;
                case "quit":
                    App.Log("EXIT via web msg");
                    ExitKiosk();
                    break;
                case "reset-setup":
                    SetupWindow.ClearConfig();
                    App.Log("SETUP_RESET — will show setup on next launch");
                    break;
                default:
                    RunCommand(action);
                    break;
            }
        }
        catch (Exception ex)
        {
            App.Log($"MSG_ERROR: {ex.Message}");
        }
    }

    // Steam game IDs
    private static readonly Dictionary<string, int> SteamIds = new()
    {
        {"csgo", 730}, {"cs2", 730}, {"dota2", 570}, {"rust", 252490},
        {"overwatch2", 2357570}, {"pubg", 578080}, {"tf2", 440},
        {"gta5", 271590}, {"gtav", 271590}, {"apex", 1172470},
        {"rocketleague", 252950}, {"deadbydaylight", 381210},
    };

    // Epic Games catalog IDs
    private static readonly Dictionary<string, string> EpicIds = new()
    {
        {"fortnite", "Fortnite"},
        {"rocketleague", "Sugar"},
        {"fallguys", "0a2d9f6403244d12969e11da6713137b"},
        {"hogwarts", "HogwartsLegacy"},
        {"asphalt", "AsphaltLegendsUnite"},
    };

    // Games with their own launcher protocols or known paths
    private static readonly Dictionary<string, string> LauncherUrls = new()
    {
        {"valorant", "valorant://"},
        {"lol", "leagueclient://"},
        {"roblox", "roblox://"},
        {"battlenet", "battlenet://"},
        {"fivem", "fivem://connect"},
    };

    // Local path overrides for games whose catalog path may not match this PC
    private static readonly Dictionary<string, string[]> LocalPathOverrides = new()
    {
        {"css", new[] {
            @"D:\New folder\Counter Strike Source v34\play-css-v34.exe",
            @"C:\counter\Counter Strike Source v34\play-css-v34.exe",
            @"E:\Counter Strike Source v34\play-css-v34.exe",
        }},
    };

    private void LaunchGame(JsonElement root)
    {
        var gameId = root.TryGetProperty("gameId", out var g) ? g.GetString() ?? "" : "";
        var exePath = root.TryGetProperty("exePath", out var p) ? p.GetString() ?? "" : "";

        App.Log($"LAUNCH_START: gameId={gameId}, exePath={exePath}");

        // Push kiosk behind everything so the game window goes on top
        if (_hwnd != IntPtr.Zero)
            SetWindowPos(_hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

        try
        {
            // 1. Check if it's a Steam game — MUST launch via Steam
            if (gameId.Length > 0 && SteamIds.TryGetValue(gameId.ToLower(), out int steamId))
            {
                App.Log($"LAUNCH via Steam: steam://rungameid/{steamId}");
                var sp = Process.Start(new ProcessStartInfo($"steam://rungameid/{steamId}") { UseShellExecute = true });
                if (sp != null) _launchedPids.Add(sp.Id);
                NotifyLaunchResult(gameId, true, "steam");
                return;
            }

            // 1b. Check launcher protocol URLs (Riot, Roblox, etc.)
            if (gameId.Length > 0 && LauncherUrls.TryGetValue(gameId.ToLower(), out var launcherUrl))
            {
                App.Log($"LAUNCH via protocol: {launcherUrl}");
                Process.Start(new ProcessStartInfo(launcherUrl) { UseShellExecute = true });
                NotifyLaunchResult(gameId, true, "protocol");
                return;
            }

            // Also detect Steam games by exe path
            if (exePath.Length > 0 && exePath.Contains("Steam", StringComparison.OrdinalIgnoreCase)
                && exePath.Contains("steamapps", StringComparison.OrdinalIgnoreCase))
            {
                var steamAppsDir = FindSteamAppsDir(exePath);
                if (steamAppsDir != null)
                {
                    var appId = FindSteamAppId(steamAppsDir, exePath);
                    if (appId > 0)
                    {
                        App.Log($"LAUNCH via Steam (auto-detected): steam://rungameid/{appId}");
                        Process.Start(new ProcessStartInfo($"steam://rungameid/{appId}") { UseShellExecute = true });
                        NotifyLaunchResult(gameId, true, "steam-auto");
                        return;
                    }
                }
            }

            // 2. Check if it's an Epic game — launch via Epic
            if (gameId.Length > 0 && EpicIds.TryGetValue(gameId.ToLower(), out var epicId))
            {
                App.Log($"LAUNCH via Epic: {epicId}");
                Process.Start(new ProcessStartInfo($"com.epicgames.launcher://apps/{epicId}?action=launch&silent=true") { UseShellExecute = true });
                NotifyLaunchResult(gameId, true, "epic");
                return;
            }

            // Also detect Epic games by exe path
            if (exePath.Length > 0 && exePath.Contains("Epic Games", StringComparison.OrdinalIgnoreCase))
            {
                App.Log($"LAUNCH via Epic Launcher (path-detected)");
                var epicLauncher = @"C:\Program Files (x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe";
                if (File.Exists(epicLauncher))
                {
                    Process.Start(new ProcessStartInfo(epicLauncher) { UseShellExecute = true });
                    NotifyLaunchResult(gameId, true, "epic-path");
                    return;
                }
            }

            // 2b. Check local path overrides for this gameId
            if (gameId.Length > 0 && LocalPathOverrides.TryGetValue(gameId.ToLower(), out var overrides))
            {
                foreach (var candidate in overrides)
                {
                    SplitExeAndArgs(candidate, out var oe, out var oa);
                    if (File.Exists(oe))
                    {
                        App.Log($"LAUNCH via local override: {oe} args: {oa}");
                        var psi = new ProcessStartInfo
                        {
                            FileName = oe,
                            UseShellExecute = true,
                            WorkingDirectory = Path.GetDirectoryName(oe) ?? ""
                        };
                        if (!string.IsNullOrEmpty(oa)) psi.Arguments = oa;
                        var proc = Process.Start(psi);
                        if (proc != null) _launchedPids.Add(proc.Id);
                        NotifyLaunchResult(gameId, true, "local-override");
                        return;
                    }
                }
            }

            // 3. Direct exe — split arguments if present, resolve path
            SplitExeAndArgs(exePath, out var exeOnly, out var exeArgs);
            var resolvedPath = ResolveExePath(exeOnly);
            // No exe path was given AND no Steam/Epic/launcher/local-override
            // matched: this game has no launch method on this PC. Tell the
            // web UI explicitly so it can offer "Install" and "Inform Admin".
            if (string.IsNullOrEmpty(exePath) && string.IsNullOrEmpty(resolvedPath))
            {
                App.Log($"LAUNCH_FAIL: no install/method for gameId={gameId}");
                NotifyLaunchResult(gameId, false, "not_installed",
                    "This game isn't installed on this PC.");
                return;
            }
            if (!string.IsNullOrEmpty(resolvedPath))
            {
                // ── PER-PLAYER SESSION (Method A): if this app supports
                //    --user-data-dir and a player is logged in, append the
                //    flag pointing to the player's per-app folder. This makes
                //    Chrome/Discord/etc remember each player's logins. ──
                if (!string.IsNullOrEmpty(_currentPlayerUid))
                {
                    var udd = PlayerSession.GetUserDataDirArgs(resolvedPath, _currentPlayerUid!);
                    if (!string.IsNullOrEmpty(udd))
                    {
                        exeArgs = string.IsNullOrEmpty(exeArgs) ? udd : $"{exeArgs} {udd}";
                        App.Log($"LAUNCH per-player flag appended: {udd}");
                    }
                }

                App.Log($"LAUNCH direct exe: {resolvedPath} args: {exeArgs}");
                var psi = new ProcessStartInfo
                {
                    FileName = resolvedPath,
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(resolvedPath) ?? ""
                };
                if (!string.IsNullOrEmpty(exeArgs)) psi.Arguments = exeArgs;
                var proc = Process.Start(psi);
                if (proc != null) _launchedPids.Add(proc.Id);
                App.Log($"LAUNCH_PID: {proc?.Id ?? -1}");
                NotifyLaunchResult(gameId, true, "direct");
            }
            else
            {
                App.Log($"LAUNCH_FAIL: exe not found gameId={gameId}, exePath={exePath}");
                // The catalog provided a path but the file doesn't exist on
                // disk → most likely the game was uninstalled / never
                // installed on this PC. Web UI can now show "install" CTA.
                NotifyLaunchResult(gameId, false, "not_installed",
                    $"Game executable not found: {exePath}");
            }
        }
        catch (Exception ex)
        {
            App.Log($"LAUNCH_ERROR: {ex}");
            NotifyLaunchResult(gameId, false, "error", ex.Message);
        }
    }

    // ──────────────────────────────────────────────────────────────────
    //  ONE-CLICK INSTALL (local PC, triggered from the kiosk web UI)
    // ──────────────────────────────────────────────────────────────────
    // The web-side `install-sources.ts` defines the install shell command
    // for every catalog game. We accept a JSON payload like
    //     { gameId: 'csgo', source: { type: 'steam', appid: 730 } }
    // and run the matching launcher protocol. Steam/Epic install pages
    // will pop up; the player can confirm.
    private void InstallGameLocal(JsonElement root)
    {
        var gameId = root.TryGetProperty("gameId", out var g) ? g.GetString() ?? "" : "";
        if (!root.TryGetProperty("source", out var src) || src.ValueKind != JsonValueKind.Object)
        {
            App.Log($"INSTALL_FAIL: no source for gameId={gameId}");
            NotifyInstallResult(gameId, false, "bad_source", "Missing install source.");
            return;
        }

        var type = src.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
        try
        {
            string? uri = null;
            switch (type)
            {
                case "steam":
                    if (src.TryGetProperty("appid", out var appid) &&
                        appid.ValueKind == JsonValueKind.Number)
                    {
                        uri = $"steam://install/{appid.GetInt32()}";
                    }
                    break;
                case "epic":
                    if (src.TryGetProperty("slug", out var slug))
                    {
                        var s = slug.GetString();
                        if (!string.IsNullOrEmpty(s))
                            uri = $"com.epicgames.launcher://store/p/{s}";
                    }
                    break;
                case "url":
                    if (src.TryGetProperty("url", out var u))
                        uri = u.GetString();
                    break;
            }

            if (string.IsNullOrEmpty(uri))
            {
                App.Log($"INSTALL_FAIL: bad source type={type} gameId={gameId}");
                NotifyInstallResult(gameId, false, "bad_source", $"Unsupported install source: {type}");
                return;
            }

            App.Log($"INSTALL: gameId={gameId} via {uri}");
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
            // Send a STATUS CODE not a localized string. The web side maps the
            // code to AR/EN copy so the player sees their own language.
            var status = type switch
            {
                "steam" => "installing_steam",
                "epic"  => "installing_epic",
                _       => "installing_url",
            };
            NotifyInstallResult(gameId, true, status, "");
        }
        catch (Exception ex)
        {
            App.Log($"INSTALL_ERROR: {ex.Message}");
            NotifyInstallResult(gameId, false, "error", ex.Message);
        }
    }

    private void NotifyInstallResult(string gameId, bool success, string status, string detail)
    {
        try
        {
            // `status` is a stable code (installing_steam | installing_epic |
            // installing_url | error | bad_source). `detail` is the raw
            // diagnostic — only shown if the web UI decides to.
            var safeDetail = detail.Replace("\\", "\\\\").Replace("'", "\\'");
            var script = $"window.dispatchEvent(new CustomEvent('game-install-result', {{ detail: {{ gameId: '{gameId}', success: {(success ? "true" : "false")}, status: '{status}', detail: '{safeDetail}' }} }}));";
            Dispatcher.BeginInvoke(() => WebView.CoreWebView2?.ExecuteScriptAsync(script));
        }
        catch (Exception ex)
        {
            App.Log($"NOTIFY_INSTALL_ERROR: {ex.Message}");
        }
    }

    // ──────────────────────────────────────────────────────────────────
    //  INFORM ADMIN (player escalates a problem from the launch popup)
    // ──────────────────────────────────────────────────────────────────
    // Writes a doc to `pc-alerts` in Firestore. The admin panel listens
    // for new alerts and shows a popup with the failing PC + game so
    // staff can install/fix without the player leaving their seat.
    private void InformAdmin(JsonElement root)
    {
        if (string.IsNullOrEmpty(_stationId)) return;
        var payload = new Dictionary<string, object?>
        {
            ["pcId"]      = _stationId,
            ["pcName"]    = _stationName,
            ["playerUid"] = _currentPlayerUid,
            ["playerName"]= _currentPlayerUsername,
            ["createdAt"] = DateTime.UtcNow.ToString("o"),
        };
        if (root.TryGetProperty("payload", out var p) && p.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in p.EnumerateObject())
            {
                payload[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var n) ? (object)n : prop.Value.GetDouble(),
                    JsonValueKind.True or JsonValueKind.False => prop.Value.GetBoolean(),
                    _ => prop.Value.ToString(),
                };
            }
        }
        _ = Task.Run(async () =>
        {
            try
            {
                await _firebase.PostAlertAsync(payload);
                App.Log($"INFORM_ADMIN_OK: {payload.GetValueOrDefault("kind")}");
            }
            catch (Exception ex)
            {
                App.Log($"INFORM_ADMIN_FAIL: {ex.Message}");
            }
        });
    }

    private void NotifyLaunchResult(string gameId, bool success, string method, string? error = null)
    {
        try
        {
            var errJson = error != null ? $", error: '{error.Replace("'", "\\'")}'" : "";
            var script = $"window.dispatchEvent(new CustomEvent('game-launch-result', {{ detail: {{ gameId: '{gameId}', success: {(success ? "true" : "false")}, method: '{method}'{errJson} }} }}));";
            Dispatcher.BeginInvoke(() =>
            {
                WebView.CoreWebView2?.ExecuteScriptAsync(script);
            });
        }
        catch (Exception ex)
        {
            App.Log($"NOTIFY_ERROR: {ex.Message}");
        }
    }

    private static string? ResolveExePath(string? exePath)
    {
        if (string.IsNullOrEmpty(exePath)) return null;
        if (File.Exists(exePath)) return exePath;

        // Replace user-specific folder with current user's folder
        var match = System.Text.RegularExpressions.Regex.Match(exePath, @"C:\\Users\\[^\\]+\\(.+)");
        if (match.Success)
        {
            var currentUser = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var resolved = Path.Combine(currentUser, match.Groups[1].Value);
            if (File.Exists(resolved)) return resolved;
        }

        // Try D:\ and E:\ if C:\ path doesn't exist
        if (exePath.StartsWith("C:\\", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var drive in new[] { "D:\\", "E:\\" })
            {
                var alt = drive + exePath.Substring(3);
                if (File.Exists(alt)) return alt;
            }
        }

        // Auto-detect latest Roblox version
        if (exePath.Contains("Roblox") && exePath.Contains("version-") && !File.Exists(exePath))
        {
            var robloxVersionsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "Versions");
            if (Directory.Exists(robloxVersionsDir))
            {
                var latestVersion = Directory.GetDirectories(robloxVersionsDir)
                    .Where(d => Path.GetFileName(d).StartsWith("version-"))
                    .OrderByDescending(d => Directory.GetCreationTime(d))
                    .FirstOrDefault();
                if (latestVersion != null)
                {
                    var betaExe = Path.Combine(latestVersion, "RobloxPlayerBeta.exe");
                    if (File.Exists(betaExe)) return betaExe;
                }
            }
        }

        return null;
    }

    private static void SplitExeAndArgs(string? raw, out string exeOnly, out string args)
    {
        exeOnly = raw ?? "";
        args = "";
        if (string.IsNullOrEmpty(raw)) return;

        // If the full string is a valid file, no split needed
        if (File.Exists(raw)) { exeOnly = raw; return; }

        // Look for ".exe " boundary to split path from arguments
        var idx = raw.IndexOf(".exe ", StringComparison.OrdinalIgnoreCase);
        if (idx >= 0)
        {
            exeOnly = raw.Substring(0, idx + 4);
            args = raw.Substring(idx + 5).Trim();
        }
    }

    private static string? FindSteamAppsDir(string exePath)
    {
        var dir = Path.GetDirectoryName(exePath);
        while (dir != null)
        {
            if (Path.GetFileName(dir).Equals("steamapps", StringComparison.OrdinalIgnoreCase))
                return dir;
            dir = Path.GetDirectoryName(dir);
        }
        return null;
    }

    private static int FindSteamAppId(string steamAppsDir, string exePath)
    {
        try
        {
            foreach (var f in Directory.GetFiles(steamAppsDir, "appmanifest_*.acf"))
            {
                var content = File.ReadAllText(f);
                // Check if this manifest's installdir matches the exe's path
                var installMatch = System.Text.RegularExpressions.Regex.Match(content, @"""installdir""\s+""([^""]+)""");
                if (installMatch.Success)
                {
                    var installDir = Path.Combine(steamAppsDir, "common", installMatch.Groups[1].Value);
                    if (exePath.StartsWith(installDir, StringComparison.OrdinalIgnoreCase))
                    {
                        var idMatch = System.Text.RegularExpressions.Regex.Match(content, @"""appid""\s+""(\d+)""");
                        if (idMatch.Success) return int.Parse(idMatch.Groups[1].Value);
                    }
                }
            }
        }
        catch { }
        return 0;
    }

    // ══════════════════════════════════════════
    //  FIREBASE
    // ══════════════════════════════════════════

    private async Task InitFirebaseAsync()
    {
        if (string.IsNullOrEmpty(_stationId)) return;
        try
        {
            await _firebase.AuthenticateAsync();
            await _firebase.UpdateStatusAsync(_stationId, "locked");
            App.Log("FIREBASE_INIT_OK");
        }
        catch (Exception ex) { App.Log($"FIREBASE_INIT_FAIL: {ex.Message}"); }
    }

    private async Task FirebaseHeartbeatAsync()
    {
        if (string.IsNullOrEmpty(_stationId)) return;
        try
        {
            // Status logic:
            //   "locked"   = kiosk is on the login screen, no player
            //   "occupied" = a player is logged in and using the PC
            //   "online"   = kiosk is unlocked but no tracked player (shouldn't happen normally)
            string status;
            if (_isLocked)
                status = "locked";
            else if (!string.IsNullOrEmpty(_currentPlayerUid))
                status = "occupied";
            else
                status = "online";

            // Collect health metrics
            int cpuPct = 0, ramPct = 0, diskPct = 0;
            try
            {
                // CPU: use a quick perf counter sample
                using var cpuCounter = new System.Diagnostics.PerformanceCounter("Processor", "% Processor Time", "_Total");
                cpuCounter.NextValue(); // first call always returns 0
                await Task.Delay(200);
                cpuPct = (int)cpuCounter.NextValue();
            }
            catch { }
            try
            {
                // Use performance counter for system-wide RAM usage
                using var ramCounter = new System.Diagnostics.PerformanceCounter("Memory", "% Committed Bytes In Use");
                ramPct = (int)ramCounter.NextValue();
            }
            catch
            {
                // Fallback: estimate from GC info
                try
                {
                    var gcInfo = GC.GetGCMemoryInfo();
                    var totalPhys = gcInfo.TotalAvailableMemoryBytes;
                    if (totalPhys > 0)
                    {
                        // Available to .NET ≈ total physical. Rough used = total - gc available
                        var inUse = totalPhys - gcInfo.HighMemoryLoadThresholdBytes;
                        ramPct = Math.Max(30, (int)((double)inUse / totalPhys * 100));
                    }
                }
                catch { }
            }
            try
            {
                var sysDrive = DriveInfo.GetDrives().FirstOrDefault(d => d.IsReady && d.Name.StartsWith("C"));
                if (sysDrive != null)
                    diskPct = (int)((1.0 - (double)sysDrive.AvailableFreeSpace / sysDrive.TotalSize) * 100);
            }
            catch { }

            string? hostName = null, ipAddr = null;
            try
            {
                hostName = Environment.MachineName;
                ipAddr = System.Net.Dns.GetHostAddresses(System.Net.Dns.GetHostName())
                    .FirstOrDefault(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?.ToString();
            }
            catch { }

            await _firebase.SendHeartbeatAsync(_stationId, status, _timeRemaining,
                cpuPct, ramPct, diskPct, hostName, ipAddr);

            // Read station info to update tray icon tooltip
            var (playerName, coins) = await _firebase.GetStationInfoAsync(_stationId);
            _currentPlayerName ??= playerName;
            _coinsRemaining = coins;
            Dispatcher.Invoke(UpdateTrayTooltip);
        }
        catch (Exception ex) { App.Log($"HEARTBEAT_ERROR: {ex.Message}"); }
    }

    private async Task FirebasePollCommandAsync()
    {
        if (string.IsNullOrEmpty(_stationId)) return;
        try
        {
            var cmd = await _firebase.PollCommandAsync(_stationId);
            if (cmd == null) return;

            App.Log($"FIREBASE_CMD: {cmd}");
            await _firebase.ClearCommandAsync(_stationId);

            Dispatcher.Invoke(() =>
            {
                switch (cmd.ToLower())
                {
                    case "lock":
                        DoLock();
                        break;
                    case "unlock":
                        DoUnlock();
                        break;
                    case "shutdown":
                        Process.Start("shutdown.exe", "/s /t 5 /f");
                        break;
                    case "restart":
                        Process.Start("shutdown.exe", "/r /t 5 /f");
                        break;
                    case "addtime":
                        // Time is managed by the web UI; this just triggers unlock if locked
                        if (_isLocked) DoUnlock();
                        break;
                    case "force-logout":
                        DoLock();
                        try { WebView.CoreWebView2?.Navigate(_kioskUrl); } catch { }
                        break;
                    case "lockdown":
                        DisableCtrlAltDel();
                        HideTaskbar();
                        break;
                    case "fullaccess":
                        EnableCtrlAltDel();
                        ShowTaskbar();
                        break;
                    case "screenshot":
                        // Force an immediate screenshot upload (even when locked)
                        _ = Task.Run(async () => { try { await UploadScreenshotAsync(force: true); } catch { } });
                        break;
                    case "live-on":
                        // Admin opened the screen tab — start 1fps stream
                        if (!_liveScreenTimer.IsEnabled)
                        {
                            _liveScreenTimer.Start();
                            App.Log("LIVE_SCREEN: started");
                            _ = Task.Run(async () => { try { await UploadScreenshotAsync(force: true); } catch { } });
                        }
                        break;
                    case "live-off":
                        // Admin closed the screen tab — stop the stream
                        if (_liveScreenTimer.IsEnabled)
                        {
                            _liveScreenTimer.Stop();
                            App.Log("LIVE_SCREEN: stopped");
                        }
                        break;
                    case "rescan-games":
                        // Re-scan installed games and push to Firestore. Useful when
                        // the shop installs/uninstalls a game without re-running setup.
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                var games = GameDiscovery.ScanInstalled();
                                App.Log($"RESCAN_GAMES: found {games.Count}");
                                if (!string.IsNullOrEmpty(_stationId))
                                    await _firebase.UpdateInstalledGamesAsync(_stationId, games);
                                SetupWindow.SaveDiscoveredGames(games);
                            }
                            catch (Exception ex) { App.Log($"RESCAN_GAMES_FAIL: {ex.Message}"); }
                        });
                        break;
                    default:
                        // Commands with payload (format: "verb:payload")
                        if (cmd.StartsWith("freeze"))
                        {
                            var freezeMsg = cmd.Contains(":") ? cmd.Substring(cmd.IndexOf(':') + 1) : "PC Frozen by Admin";
                            var escapedFreezeMsg = System.Text.Json.JsonSerializer.Serialize(freezeMsg);
                            WebView.CoreWebView2?.ExecuteScriptAsync($"document.dispatchEvent(new CustomEvent('admin-freeze', {{detail: {escapedFreezeMsg} }}))");
                        }
                        else if (cmd.StartsWith("show-message") || cmd.StartsWith("message:"))
                        {
                            var popupMsg = cmd.Contains(":") ? cmd.Substring(cmd.IndexOf(':') + 1) : "";
                            var escapedPopupMsg = System.Text.Json.JsonSerializer.Serialize(popupMsg);
                            WebView.CoreWebView2?.ExecuteScriptAsync($"document.dispatchEvent(new CustomEvent('admin-message', {{detail: {escapedPopupMsg} }}))");
                        }
                        else if (cmd.StartsWith("exec:"))
                        {
                            // Execute shell command and return output via Firestore (30s timeout)
                            var shellCmd = cmd.Substring("exec:".Length).Trim();
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    var psi = new ProcessStartInfo
                                    {
                                        FileName = "cmd.exe",
                                        Arguments = $"/c {shellCmd}",
                                        UseShellExecute = false,
                                        CreateNoWindow = true,
                                        RedirectStandardOutput = true,
                                        RedirectStandardError = true,
                                        WindowStyle = ProcessWindowStyle.Hidden,
                                    };
                                    using var proc = Process.Start(psi);
                                    if (proc == null) return;
                                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                                    string stdout, stderr;
                                    try
                                    {
                                        var stdoutTask = proc.StandardOutput.ReadToEndAsync(cts.Token);
                                        var stderrTask = proc.StandardError.ReadToEndAsync(cts.Token);
                                        await Task.WhenAll(stdoutTask, stderrTask);
                                        stdout = stdoutTask.Result;
                                        stderr = stderrTask.Result;
                                    }
                                    catch (OperationCanceledException)
                                    {
                                        try { proc.Kill(true); } catch { }
                                        await _firebase.UploadCommandResponseAsync(_stationId!, "exec", "[Timed out after 30 seconds]");
                                        return;
                                    }
                                    var output = stdout;
                                    if (!string.IsNullOrEmpty(stderr)) output += "\n[STDERR]\n" + stderr;
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "exec", output);
                                    App.Log($"EXEC ok: {shellCmd} ({output.Length} chars)");
                                }
                                catch (Exception ex)
                                {
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "exec", $"ERROR: {ex.Message}");
                                    App.Log($"EXEC fail: {ex.Message}");
                                }
                            });
                        }
                        else if (cmd.StartsWith("run-cmd:"))
                        {
                            // Fire-and-forget shell command (no output capture)
                            var shellCmd = cmd.Substring("run-cmd:".Length).Trim();
                            if (!string.IsNullOrEmpty(shellCmd))
                            {
                                try
                                {
                                    Process.Start(new ProcessStartInfo
                                    {
                                        FileName = "cmd.exe",
                                        Arguments = $"/c {shellCmd}",
                                        UseShellExecute = false,
                                        CreateNoWindow = true,
                                        WindowStyle = ProcessWindowStyle.Hidden,
                                    });
                                    App.Log($"RUN_CMD ok: {shellCmd}");
                                }
                                catch (Exception ex) { App.Log($"RUN_CMD fail: {ex.Message}"); }
                            }
                        }
                        else if (cmd == "list-processes")
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    var procs = Process.GetProcesses()
                                        .Where(p => p.SessionId != 0) // skip system session
                                        .Select(p =>
                                        {
                                            try { return new { pid = p.Id, name = p.ProcessName, mem = p.WorkingSet64 / 1024 / 1024, title = p.MainWindowTitle }; }
                                            catch { return new { pid = p.Id, name = p.ProcessName, mem = 0L, title = "" }; }
                                        })
                                        .OrderByDescending(p => p.mem)
                                        .Take(150)
                                        .ToList();
                                    var json = System.Text.Json.JsonSerializer.Serialize(procs);
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "list-processes", json);
                                    App.Log($"LIST_PROCESSES: {procs.Count} processes");
                                }
                                catch (Exception ex)
                                {
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "list-processes", $"ERROR: {ex.Message}");
                                }
                            });
                        }
                        else if (cmd == "system-info")
                        {
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    var info = new Dictionary<string, string>();
                                    info["hostname"] = Environment.MachineName;
                                    info["user"] = Environment.UserName;
                                    info["os"] = $"{Environment.OSVersion} ({(Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit")})";
                                    info["uptime"] = TimeSpan.FromMilliseconds(Environment.TickCount64).ToString(@"d\d\ hh\:mm\:ss");
                                    info["processors"] = Environment.ProcessorCount.ToString();
                                    info["dotnet"] = Environment.Version.ToString();

                                    // RAM via GC (approximate total physical)
                                    var gcInfo = GC.GetGCMemoryInfo();
                                    var totalRam = gcInfo.TotalAvailableMemoryBytes / 1024.0 / 1024 / 1024;
                                    info["totalRamGB"] = totalRam.ToString("F1");

                                    // Drives
                                    var drives = new List<string>();
                                    foreach (var d in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
                                    {
                                        var freeGB = d.AvailableFreeSpace / 1024.0 / 1024 / 1024;
                                        var totalGB = d.TotalSize / 1024.0 / 1024 / 1024;
                                        drives.Add($"{d.Name} {freeGB:F1}GB free / {totalGB:F1}GB total");
                                    }
                                    info["drives"] = string.Join(" | ", drives);

                                    // Network adapters
                                    try
                                    {
                                        var nics = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
                                            .Where(n => n.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up
                                                && n.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                                            .Select(n =>
                                            {
                                                var ips = n.GetIPProperties().UnicastAddresses
                                                    .Where(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                                                    .Select(a => a.Address.ToString());
                                                return $"{n.Name}: {string.Join(", ", ips)} ({n.Speed / 1_000_000}Mbps)";
                                            });
                                        info["network"] = string.Join(" | ", nics);
                                    }
                                    catch { info["network"] = "N/A"; }

                                    // MAC address
                                    try
                                    {
                                        var mac = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
                                            .Where(n => n.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up
                                                && n.NetworkInterfaceType != System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                                            .Select(n => n.GetPhysicalAddress().ToString())
                                            .FirstOrDefault(m => !string.IsNullOrEmpty(m));
                                        if (mac != null)
                                            info["mac"] = string.Join(":", Enumerable.Range(0, mac.Length / 2).Select(i => mac.Substring(i * 2, 2)));
                                    }
                                    catch { }

                                    var json = System.Text.Json.JsonSerializer.Serialize(info);
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "system-info", json);
                                    App.Log("SYSTEM_INFO uploaded");
                                }
                                catch (Exception ex)
                                {
                                    await _firebase.UploadCommandResponseAsync(_stationId!, "system-info", $"ERROR: {ex.Message}");
                                }
                            });
                        }
                        else if (cmd.StartsWith("kill-app:"))
                        {
                            var appName = cmd.Substring("kill-app:".Length).Trim();
                            if (appName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                                appName = appName[..^4];
                            try
                            {
                                var killed = 0;
                                foreach (var p in Process.GetProcessesByName(appName))
                                {
                                    try { p.Kill(true); killed++; } catch { }
                                }
                                App.Log($"KILL_APP {appName}: killed {killed}");
                            }
                            catch (Exception ex) { App.Log($"KILL_APP fail: {ex.Message}"); }
                        }
                        else if (cmd.StartsWith("kill-pid:"))
                        {
                            var pidStr = cmd.Substring("kill-pid:".Length).Trim();
                            if (int.TryParse(pidStr, out var pid))
                            {
                                try { Process.GetProcessById(pid).Kill(true); App.Log($"KILL_PID {pid} ok"); }
                                catch (Exception ex) { App.Log($"KILL_PID {pid} fail: {ex.Message}"); }
                            }
                        }
                        else if (cmd.StartsWith("open-url:"))
                        {
                            var url = cmd.Substring("open-url:".Length).Trim();
                            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                            catch (Exception ex) { App.Log($"OPEN_URL fail: {ex.Message}"); }
                        }
                        else if (cmd == "sleep")
                        {
                            try { Process.Start("rundll32.exe", "powrprof.dll,SetSuspendState 0,1,0"); }
                            catch (Exception ex) { App.Log($"SLEEP fail: {ex.Message}"); }
                        }
                        else if (cmd == "logoff")
                        {
                            try { Process.Start("shutdown.exe", "/l /f"); }
                            catch (Exception ex) { App.Log($"LOGOFF fail: {ex.Message}"); }
                        }
                        else
                        {
                            RunCommand(cmd);
                        }
                        break;
                }
            });
        }
        catch (Exception ex) { App.Log($"CMD_POLL_ERROR: {ex.Message}"); }
    }

    private async Task FirebaseUpdateStatusAsync(string status)
    {
        if (string.IsNullOrEmpty(_stationId)) return;
        try { await _firebase.UpdateStatusAsync(_stationId, status); }
        catch (Exception ex) { App.Log($"STATUS_UPDATE_ERROR: {ex.Message}"); }
    }

    // ══════════════════════════════════════════
    //  LAN AUTO-DETECT
    // ══════════════════════════════════════════

    private static readonly string LanConfigFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ninja-games-kiosk", "lan-config.json");

    /// <summary>
    /// Resolves the kiosk URL: tries LAN server first (from config or auto-scan), falls back to cloud.
    /// </summary>
    private async Task<string> ResolveKioskUrlAsync()
    {
        // 1. Check lan-config.json for explicit server IP
        var lanIp = LoadLanServerIp();
        if (!string.IsNullOrEmpty(lanIp))
        {
            var lanUrl = $"http://{lanIp}:3000/kiosk";
            if (await IsServerReachableAsync(lanIp, 3000))
            {
                App.Log($"LAN_RESOLVED: {lanUrl} (from config)");
                return lanUrl;
            }
            App.Log($"LAN_UNREACHABLE: {lanIp}:3000 — trying scan...");
        }

        // 2. Auto-scan: check common LAN IPs based on our subnet
        var scannedIp = await ScanLanForServerAsync();
        if (scannedIp != null)
        {
            // Save for next time
            SaveLanServerIp(scannedIp);
            var lanUrl = $"http://{scannedIp}:3000/kiosk";
            App.Log($"LAN_RESOLVED: {lanUrl} (auto-scanned)");
            return lanUrl;
        }

        // 3. Fallback to cloud
        App.Log("LAN_NOT_FOUND: using cloud URL");
        return CloudUrl;
    }

    private static string? LoadLanServerIp()
    {
        try
        {
            if (!File.Exists(LanConfigFile)) return null;
            var json = File.ReadAllText(LanConfigFile);
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.GetProperty("serverIp").GetString();
        }
        catch { return null; }
    }

    public static void SaveLanServerIp(string ip)
    {
        try
        {
            var dir = Path.GetDirectoryName(LanConfigFile)!;
            Directory.CreateDirectory(dir);
            File.WriteAllText(LanConfigFile, JsonSerializer.Serialize(new { serverIp = ip }));
        }
        catch { }
    }

    private static async Task<bool> IsServerReachableAsync(string ip, int port)
    {
        try
        {
            using var tcp = new TcpClient();
            var task = tcp.ConnectAsync(ip, port);
            if (await Task.WhenAny(task, Task.Delay(1500)) == task && tcp.Connected)
                return true;
        }
        catch { }
        return false;
    }

    private static async Task<string?> ScanLanForServerAsync()
    {
        try
        {
            // Get our local IP to determine subnet
            string? localIp = null;
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var addr in ni.GetIPProperties().UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == AddressFamily.InterNetwork)
                    {
                        localIp = addr.Address.ToString();
                        break;
                    }
                }
                if (localIp != null) break;
            }

            if (localIp == null) return null;
            var parts = localIp.Split('.');
            if (parts.Length != 4) return null;
            var subnet = $"{parts[0]}.{parts[1]}.{parts[2]}";

            App.Log($"LAN_SCAN: subnet {subnet}.x (local: {localIp})");

            // Scan all IPs in parallel (1-254 + gateway)
            var tasks = new List<Task<string?>>();
            for (int i = 1; i <= 254; i++)
            {
                var ip = $"{subnet}.{i}";
                if (ip == localIp) continue; // skip self
                tasks.Add(ProbeServerAsync(ip));
            }

            var results = await Task.WhenAll(tasks);
            return results.FirstOrDefault(r => r != null);
        }
        catch (Exception ex)
        {
            App.Log($"LAN_SCAN_ERROR: {ex.Message}");
            return null;
        }
    }

    private static async Task<string?> ProbeServerAsync(string ip)
    {
        try
        {
            using var tcp = new TcpClient();
            var connectTask = tcp.ConnectAsync(ip, 3000);
            if (await Task.WhenAny(connectTask, Task.Delay(500)) == connectTask && tcp.Connected)
            {
                // Verify it's actually our kiosk server
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                var resp = await http.GetAsync($"http://{ip}:3000/kiosk");
                if (resp.IsSuccessStatusCode)
                    return ip;
            }
        }
        catch { }
        return null;
    }

    // ══════════════════════════════════════════
    //  EXIT
    // ══════════════════════════════════════════

    private void ExitKiosk()
    {
        if (_exiting) return;
        _exiting = true;
        App.Log("EXIT");

        // Restore the previous Windows shell BEFORE cleanup — the next boot
        // should land on a normal desktop, not relaunch the kiosk in a loop.
        try { ShellHost.RestoreShell(); }
        catch (Exception ex) { App.Log($"SHELL_RESTORE_FAIL: {ex.Message}"); }

        Cleanup();

        // Bring back the Windows desktop right now so the admin doesn't
        // stare at a black screen after exit.
        try { ShellHost.ShowDesktop(); }
        catch (Exception ex) { App.Log($"SHOW_DESKTOP_FAIL: {ex.Message}"); }

        System.Windows.Application.Current.Shutdown();
    }

    private void Cleanup()
    {
        _guardTimer.Stop();
        _heartbeatTimer.Stop();
        _commandTimer.Stop();
        _liveScreenTimer.Stop();
        if (_hookId != IntPtr.Zero) { UnhookWindowsHookEx(_hookId); _hookId = IntPtr.Zero; }

        // Remove tray icon
        if (_trayIcon != null) { _trayIcon.Visible = false; _trayIcon.Dispose(); _trayIcon = null; }

        // ONLY re-enable taskbar + task manager when admin exits via "ghanemexit".
        // On a normal Windows restart/shutdown, keep everything locked so the
        // lockdown persists across reboots.
        if (_exiting)
        {
            ShowTaskbar();
            EnableCtrlAltDel();
        }

        // Mark offline in Firebase (fire-and-forget, don't block exit)
        if (!string.IsNullOrEmpty(_stationId))
        {
            _ = Task.Run(async () => {
                try { await _firebase.GoOfflineAsync(_stationId); } catch { }
                _firebase.Dispose();
            });
        }
        else
        {
            _firebase.Dispose();
        }
    }
}
