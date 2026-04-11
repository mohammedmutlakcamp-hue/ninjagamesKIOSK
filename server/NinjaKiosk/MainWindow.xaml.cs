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

namespace NinjaKiosk;

public partial class MainWindow : Window
{
    // ── Config ──
    private const string CloudUrl = "https://www.ninjagamesjo.com/kiosk";
    private const string KillPhrase = "ghanemexit";
    private string _kioskUrl = CloudUrl; // resolved at startup

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
    private bool _exiting;
    private readonly DispatcherTimer _guardTimer;
    private readonly DispatcherTimer _heartbeatTimer;
    private readonly DispatcherTimer _commandTimer;
    private readonly string _cmdDir;
    private readonly string _cmdFile;
    private bool _webViewReady;
    private IntPtr _hwnd;
    private readonly List<int> _launchedPids = new();
    private HashSet<int> _preSessionPids = new();

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

        // Keyboard hook
        InstallHook();

        // Hide taskbar & lock Ctrl+Alt+Del
        HideTaskbar();
        DisableCtrlAltDel();

        // Guard timer
        _guardTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        _guardTimer.Tick += GuardTick;
        _guardTimer.Start();

        // Firebase heartbeat (every 30s)
        _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _heartbeatTimer.Tick += async (_, _) => await FirebaseHeartbeatAsync();
        _heartbeatTimer.Start();

        // Firebase command polling (every 5s)
        _commandTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _commandTimer.Tick += async (_, _) => await FirebasePollCommandAsync();
        _commandTimer.Start();

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
    //  GUARD TICK
    // ══════════════════════════════════════════

    private void GuardTick(object? s, EventArgs e)
    {
        if (_taskbarHidden) HideTaskbar();

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
        _allowAltTab = false;
        _taskbarHidden = true;
        _timeRemaining = 0;
        HideTaskbar();
        DisableCtrlAltDel();

        // Kill all processes launched during the session
        KillSessionProcesses();

        Topmost = true;
        WindowState = WindowState.Maximized;
        Activate();
        App.Log("LOCKED");

        _ = FirebaseUpdateStatusAsync("locked");
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

    private void DoUnlock()
    {
        _isLocked = false;
        _allowAltTab = true;
        _taskbarHidden = false;
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

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            int vk = Marshal.ReadInt32(lParam);
            int flags = Marshal.ReadInt32(lParam, 8);
            bool alt = (flags & 0x20) != 0;
            bool keyDown = (int)wParam == 0x0100 || (int)wParam == 0x0104;

            // Kill phrase
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
        var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await WebView.EnsureCoreWebView2Async(env);

        var settings = WebView.CoreWebView2.Settings;
        settings.AreDevToolsEnabled = true;
        settings.IsStatusBarEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;

        WebView.CoreWebView2.WebMessageReceived += OnWebMessage;

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
            launchGame: function(gameId, exePath) {
                window.chrome.webview.postMessage(JSON.stringify({action:'launch-game', gameId:gameId, exePath:exePath}));
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
                case "launch-game":
                    if (_isLocked) DoUnlock();
                    LaunchGame(root);
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

    private void LaunchGame(JsonElement root)
    {
        try
        {
            var gameId = root.TryGetProperty("gameId", out var g) ? g.GetString() : null;
            var exePath = root.TryGetProperty("exePath", out var p) ? p.GetString() : null;

            App.Log($"LAUNCH_START: gameId={gameId}, exePath={exePath}");

            // Push kiosk behind everything so the game window goes on top
            if (_hwnd != IntPtr.Zero)
                SetWindowPos(_hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

            // 1. Check if it's a Steam game — MUST launch via Steam
            if (gameId != null && SteamIds.TryGetValue(gameId.ToLower(), out int steamId))
            {
                App.Log($"LAUNCH via Steam: steam://rungameid/{steamId}");
                var sp = Process.Start(new ProcessStartInfo($"steam://rungameid/{steamId}") { UseShellExecute = true });
                if (sp != null) _launchedPids.Add(sp.Id);
                return;
            }

            // 1b. Check launcher protocol URLs (Riot, Roblox, etc.)
            if (gameId != null && LauncherUrls.TryGetValue(gameId.ToLower(), out var launcherUrl))
            {
                App.Log($"LAUNCH via protocol: {launcherUrl}");
                Process.Start(new ProcessStartInfo(launcherUrl) { UseShellExecute = true });
                return;
            }

            // Also detect Steam games by exe path
            if (!string.IsNullOrEmpty(exePath) && exePath.Contains("Steam", StringComparison.OrdinalIgnoreCase)
                && exePath.Contains("steamapps", StringComparison.OrdinalIgnoreCase))
            {
                // Extract appid from nearby appmanifest files
                var steamAppsDir = FindSteamAppsDir(exePath);
                if (steamAppsDir != null)
                {
                    var appId = FindSteamAppId(steamAppsDir, exePath);
                    if (appId > 0)
                    {
                        App.Log($"LAUNCH via Steam (auto-detected): steam://rungameid/{appId}");
                        Process.Start(new ProcessStartInfo($"steam://rungameid/{appId}") { UseShellExecute = true });
                        return;
                    }
                }
            }

            // 2. Check if it's an Epic game — launch via Epic
            if (gameId != null && EpicIds.TryGetValue(gameId.ToLower(), out var epicId))
            {
                App.Log($"LAUNCH via Epic: {epicId}");
                Process.Start(new ProcessStartInfo($"com.epicgames.launcher://apps/{epicId}?action=launch&silent=true") { UseShellExecute = true });
                return;
            }

            // Also detect Epic games by exe path
            if (!string.IsNullOrEmpty(exePath) && exePath.Contains("Epic Games", StringComparison.OrdinalIgnoreCase))
            {
                // Launch Epic Games Launcher which will handle the game
                App.Log($"LAUNCH via Epic Launcher (path-detected)");
                var epicLauncher = @"C:\Program Files (x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe";
                if (File.Exists(epicLauncher))
                {
                    Process.Start(new ProcessStartInfo(epicLauncher) { UseShellExecute = true });
                    return;
                }
            }

            // 3. Direct exe — try provided path first, then search common locations
            var resolvedPath = ResolveExePath(exePath);
            if (!string.IsNullOrEmpty(resolvedPath))
            {
                App.Log($"LAUNCH direct exe: {resolvedPath}");
                var proc = Process.Start(new ProcessStartInfo
                {
                    FileName = resolvedPath,
                    UseShellExecute = true,
                    WorkingDirectory = Path.GetDirectoryName(resolvedPath)
                });
                App.Log($"LAUNCH_PID: {proc?.Id ?? -1}");
            }
            else
            {
                App.Log($"LAUNCH_FAIL: no valid launch method for gameId={gameId}, exePath={exePath}");
            }
        }
        catch (Exception ex)
        {
            App.Log($"LAUNCH_ERROR: {ex}");
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

        return null;
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
            var status = _isLocked ? "locked" : "online";
            await _firebase.SendHeartbeatAsync(_stationId, status, _timeRemaining);
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
                    default:
                        RunCommand(cmd);
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

            // Scan common server IPs in parallel (1-50 + gateway)
            var tasks = new List<Task<string?>>();
            for (int i = 1; i <= 50; i++)
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
            if (await Task.WhenAny(connectTask, Task.Delay(800)) == connectTask && tcp.Connected)
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
        Cleanup();

        // Launch explorer.exe so admin can use the desktop
        // (needed when kiosk replaces the Windows shell)
        try
        {
            var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            Process.Start(explorer);
            App.Log("EXPLORER_LAUNCHED");
        }
        catch (Exception ex)
        {
            App.Log($"EXPLORER_LAUNCH_FAIL: {ex.Message}");
        }

        Application.Current.Shutdown();
    }

    private void Cleanup()
    {
        _guardTimer.Stop();
        _heartbeatTimer.Stop();
        _commandTimer.Stop();
        if (_hookId != IntPtr.Zero) { UnhookWindowsHookEx(_hookId); _hookId = IntPtr.Zero; }
        ShowTaskbar();
        EnableCtrlAltDel();

        // Mark offline in Firebase
        if (!string.IsNullOrEmpty(_stationId))
        {
            try { _firebase.GoOfflineAsync(_stationId).GetAwaiter().GetResult(); }
            catch { }
        }
        _firebase.Dispose();
    }
}
