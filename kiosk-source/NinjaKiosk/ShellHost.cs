using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace NinjaKiosk;

// Makes NinjaKiosk the Windows shell (replaces explorer.exe at boot) so the
// kiosk IS the desktop — no login screen → bare desktop transition. The user
// boots straight into the kiosk login.
//
// Two modes:
//   - System shell  (HKLM): kiosk replaces explorer for ALL users on the box.
//                           Requires admin to install. Survives user switches.
//   - User shell    (HKCU): kiosk replaces explorer only for the current user.
//                           No admin needed.
//
// To keep a normal taskbar / start menu / desktop icons, we spawn explorer.exe
// as a child after our window is up. Windows tolerates explorer running
// alongside a custom shell — taskbar will appear, kiosk window stays visible.
//
// On clean exit (ghanemexit), we restore the original shell value so admins
// who connect via RDP / a service technician don't get stuck without a
// desktop on the next boot.
internal static class ShellHost
{
    // Standard Winlogon registry locations
    private const string HKLM_KEY = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon";
    private const string HKCU_KEY = @"Software\Microsoft\Windows NT\CurrentVersion\Winlogon";

    // Our backup of the previous shell value lives next to the kiosk config
    // so reinstalls can recover it even if the registry was already overwritten.
    private static readonly string BackupFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "ninja-games-kiosk", "previous-shell.txt");

    // ── Run-key fallbacks (in case shell-replacement doesn't take effect) ──
    private const string HKCU_RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string HKLM_RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RUN_VALUE_NAME = "NinjaKiosk";

    /// <summary>
    /// Belt-and-suspenders autostart. Writes ALL of:
    ///   1. Winlogon Shell  (HKLM + HKCU)  — kiosk replaces explorer.exe
    ///   2. Run key         (HKLM + HKCU)  — kiosk auto-launches at sign-in
    ///   3. Startup folder shortcut         — yet another fallback
    ///
    /// Called on every kiosk launch so it self-heals if Windows Update or
    /// another app overwrote a key. Idempotent — re-running is a no-op when
    /// keys already point at us.
    /// </summary>
    public static void EnsureAutostart()
    {
        try
        {
            var exe = GetExePath();
            if (string.IsNullOrEmpty(exe) || !File.Exists(exe))
            {
                App.Log($"ENSURE_AUTOSTART_SKIP: exe missing ({exe})");
                return;
            }
            InstallAsShell(exe);
            InstallRunKey(exe);
            InstallStartupShortcut(exe);
            App.Log("AUTOSTART_OK: shell + run-key + startup-shortcut all set");
        }
        catch (Exception ex) { App.Log($"ENSURE_AUTOSTART_FAIL: {ex.Message}"); }
    }

    private static void InstallRunKey(string exePath)
    {
        var value = $"\"{exePath}\"";
        try
        {
            using var hkcu = Registry.CurrentUser.CreateSubKey(HKCU_RUN_KEY, writable: true);
            hkcu?.SetValue(RUN_VALUE_NAME, value, RegistryValueKind.String);
        }
        catch (Exception ex) { App.Log($"RUNKEY_HKCU_FAIL: {ex.Message}"); }
        try
        {
            using var hklm = Registry.LocalMachine.OpenSubKey(HKLM_RUN_KEY, writable: true);
            hklm?.SetValue(RUN_VALUE_NAME, value, RegistryValueKind.String);
        }
        catch { /* needs admin — fine, HKCU covers single-user */ }
    }

    private static void InstallStartupShortcut(string exePath)
    {
        try
        {
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            var lnkPath = Path.Combine(startup, "NinjaKiosk.lnk");
            // Only write if missing or pointing somewhere else — avoid
            // touching the file every launch
            if (File.Exists(lnkPath)) return;

            // Use WSH from PowerShell to author the .lnk — no COM interop needed
            var ps = $"$ws=New-Object -ComObject WScript.Shell;$s=$ws.CreateShortcut('{lnkPath.Replace("'", "''")}');$s.TargetPath='{exePath.Replace("'", "''")}';$s.WorkingDirectory='{(Path.GetDirectoryName(exePath) ?? "").Replace("'", "''")}';$s.Save()";
            var psi = new ProcessStartInfo("powershell.exe", $"-NoProfile -ExecutionPolicy Bypass -Command \"{ps}\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(5000);
            App.Log($"STARTUP_LNK_WRITTEN: {lnkPath}");
        }
        catch (Exception ex) { App.Log($"STARTUP_LNK_FAIL: {ex.Message}"); }
    }

    /// <summary>
    /// Install the kiosk as the Windows shell. Returns true if any registry
    /// key was successfully updated.
    /// </summary>
    public static bool InstallAsShell(string? exePath = null)
    {
        exePath ??= GetExePath();
        if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
        {
            App.Log($"SHELL_INSTALL_SKIP: exe not found ({exePath})");
            return false;
        }

        var shellValue = $"\"{exePath}\"";
        bool any = false;

        // HKLM (system-wide). Will silently fail if not elevated; that's fine.
        try
        {
            using var hklm = Registry.LocalMachine.OpenSubKey(HKLM_KEY, writable: true);
            if (hklm != null)
            {
                var prev = hklm.GetValue("Shell") as string;
                BackupPrevious(prev);
                hklm.SetValue("Shell", shellValue, RegistryValueKind.String);
                any = true;
                App.Log($"SHELL_INSTALL_HKLM: was='{prev}' now='{shellValue}'");
            }
        }
        catch (Exception ex) { App.Log($"SHELL_INSTALL_HKLM_FAIL: {ex.Message}"); }

        // HKCU (per-user). Always try — works without elevation.
        try
        {
            using var hkcu = Registry.CurrentUser.CreateSubKey(HKCU_KEY, writable: true);
            if (hkcu != null)
            {
                var prev = hkcu.GetValue("Shell") as string;
                BackupPrevious(prev);
                hkcu.SetValue("Shell", shellValue, RegistryValueKind.String);
                any = true;
                App.Log($"SHELL_INSTALL_HKCU: was='{prev}' now='{shellValue}'");
            }
        }
        catch (Exception ex) { App.Log($"SHELL_INSTALL_HKCU_FAIL: {ex.Message}"); }

        return any;
    }

    /// <summary>
    /// Restore the previous Windows shell (usually explorer.exe). Called from
    /// ExitKiosk so the next boot has a normal desktop.
    /// </summary>
    public static void RestoreShell()
    {
        var prev = LoadBackup() ?? "explorer.exe";

        try
        {
            using var hklm = Registry.LocalMachine.OpenSubKey(HKLM_KEY, writable: true);
            if (hklm != null)
            {
                hklm.SetValue("Shell", prev, RegistryValueKind.String);
                App.Log($"SHELL_RESTORE_HKLM: '{prev}'");
            }
        }
        catch (Exception ex) { App.Log($"SHELL_RESTORE_HKLM_FAIL: {ex.Message}"); }

        try
        {
            using var hkcu = Registry.CurrentUser.OpenSubKey(HKCU_KEY, writable: true);
            if (hkcu != null)
            {
                hkcu.SetValue("Shell", prev, RegistryValueKind.String);
                App.Log($"SHELL_RESTORE_HKCU: '{prev}'");
            }
        }
        catch (Exception ex) { App.Log($"SHELL_RESTORE_HKCU_FAIL: {ex.Message}"); }

        // Also clear the autostart fallbacks — admin asked us to exit, so
        // they don't want the kiosk re-launching on the next sign-in.
        try
        {
            using var run = Registry.CurrentUser.OpenSubKey(HKCU_RUN_KEY, writable: true);
            run?.DeleteValue(RUN_VALUE_NAME, throwOnMissingValue: false);
        }
        catch { }
        try
        {
            using var run = Registry.LocalMachine.OpenSubKey(HKLM_RUN_KEY, writable: true);
            run?.DeleteValue(RUN_VALUE_NAME, throwOnMissingValue: false);
        }
        catch { }
        try
        {
            var startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            var lnkPath = Path.Combine(startup, "NinjaKiosk.lnk");
            if (File.Exists(lnkPath)) File.Delete(lnkPath);
        }
        catch { }
    }

    /// <summary>
    /// Kill the running explorer.exe so the Windows desktop wallpaper,
    /// desktop icons, and taskbar all disappear — leaving the kiosk window
    /// as the only thing on screen. The kiosk IS the desktop.
    ///
    /// Why kill instead of leaving it: shell-replacement via the registry
    /// only takes effect on the NEXT login. Until then, explorer is the
    /// active shell and our kiosk window floats on top of its wallpaper.
    /// To make the takeover visible immediately we have to terminate it.
    ///
    /// Power users can still:
    ///   - Press Win+I to open Settings (works without explorer)
    ///   - Press Win+R to open the Run dialog
    ///   - Press Win+E to open File Explorer (a separate process)
    ///   - Use the kiosk's own Software tab to launch Steam/Discord/etc
    /// </summary>
    public static void HideDesktop()
    {
        try
        {
            int killed = 0;
            foreach (var proc in Process.GetProcessesByName("explorer"))
            {
                try { proc.Kill(true); killed++; }
                catch (Exception ex) { App.Log($"EXPLORER_KILL_ONE_FAIL: pid={proc.Id} {ex.Message}"); }
            }
            App.Log($"EXPLORER_KILLED: {killed} processes (kiosk is now the desktop)");

            // Stop Windows from auto-respawning explorer for the duration of
            // this session. The Winlogon shell-watcher only re-launches what
            // the registry says is the shell — and that's already us, so
            // killing explorer is final until reboot or RestoreShell().
        }
        catch (Exception ex) { App.Log($"HIDE_DESKTOP_FAIL: {ex.Message}"); }
    }

    /// <summary>
    /// Bring back the standard Windows desktop. Called on ghanemexit so the
    /// admin doesn't end up staring at a black screen.
    /// </summary>
    public static void ShowDesktop()
    {
        try
        {
            if (Process.GetProcessesByName("explorer").Length > 0)
            {
                App.Log("EXPLORER_RESTORE_SKIP: already running");
                return;
            }
            var explorer = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                "explorer.exe");
            Process.Start(new ProcessStartInfo
            {
                FileName = explorer,
                UseShellExecute = true,
            });
            App.Log("EXPLORER_RESTORED");
        }
        catch (Exception ex) { App.Log($"SHOW_DESKTOP_FAIL: {ex.Message}"); }
    }

    private static string? GetExePath()
    {
        try
        {
            var loc = System.Reflection.Assembly.GetExecutingAssembly().Location;
            // Single-file publishes return a .dll — swap to .exe
            return loc.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
                ? loc[..^4] + ".exe"
                : loc;
        }
        catch { return null; }
    }

    private static void BackupPrevious(string? prev)
    {
        // Only save the first non-kiosk value we see so re-runs don't
        // overwrite the real explorer.exe backup with our own path.
        if (string.IsNullOrWhiteSpace(prev)) return;
        if (prev.IndexOf("ninjakiosk", StringComparison.OrdinalIgnoreCase) >= 0) return;
        try
        {
            var dir = Path.GetDirectoryName(BackupFile)!;
            Directory.CreateDirectory(dir);
            if (!File.Exists(BackupFile))
                File.WriteAllText(BackupFile, prev);
        }
        catch { }
    }

    private static string? LoadBackup()
    {
        try { return File.Exists(BackupFile) ? File.ReadAllText(BackupFile).Trim() : null; }
        catch { return null; }
    }
}
