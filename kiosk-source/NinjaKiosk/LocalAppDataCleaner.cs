using System.IO;

namespace NinjaKiosk;

// Wipes %LOCALAPPDATA% on player login + logout so each session starts with
// a clean slate. Many launchers (Riot, Epic, Battle.net, Discord, FiveM)
// stash account state, anti-cheat tokens, or login cookies in
// AppData\Local that survive a per-app cleanup; deleting the whole tree
// (minus a preserve list) makes the next player a stranger to those apps
// and fixes "game won't launch — already running for another user" errors.
//
// PRESERVE list — folders we MUST NOT touch:
//   - Microsoft, Packages, ConnectedDevicesPlatform — Windows itself
//   - NVIDIA*, AMD, Intel*           — GPU driver caches (deleting can crash the display driver)
//   - ninja-games-kiosk              — our own state
//   - Programs                        — per-user installed apps (Discord installer drops here)
//   - Comms, CrashDumps               — Windows telemetry
//
// Anything else (game launcher caches, browser data, EpicGamesLauncher,
// Riot Games, Battle.net, Discord, FiveM, etc.) is fair game.
internal static class LocalAppDataCleaner
{
    // Folders inside %LOCALAPPDATA% to preserve. Match is case-insensitive,
    // exact directory name (no globs).
    private static readonly HashSet<string> PreserveFolders = new(StringComparer.OrdinalIgnoreCase)
    {
        // Windows + OS components
        "Microsoft", "Packages", "ConnectedDevicesPlatform", "Comms", "CrashDumps",
        "PlaceholderTileLogoFolder", "PackageStaging", "TileDataLayer",

        // Driver / hardware vendors — wiping these causes display flicker
        // or kernel-level crashes on some systems
        "NVIDIA", "NVIDIA Corporation", "NVIDIA GeForce Experience",
        "AMD", "Intel", "IntelGraphicsProfiles",

        // Our own state — don't nuke ourselves mid-session
        "ninja-games-kiosk", "NinjaKiosk",

        // Per-user installer data (Squirrel/Electron apps land here)
        "Programs",

        // Windows search index, font cache, etc.
        "FontCache", "ElevatedDiagnostics",
    };

    // Loose files at the root of %LOCALAPPDATA% — leave them alone (rare,
    // but Windows occasionally drops .dat files there).

    /// <summary>
    /// Wipe everything in %LOCALAPPDATA% except the preserve list.
    /// Logs every directory it tries to remove and how it went.
    /// Safe to call when no player is logged in.
    /// </summary>
    public static void Wipe(string reason)
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(localAppData) || !Directory.Exists(localAppData))
        {
            App.Log($"LOCALAPPDATA_WIPE_SKIP ({reason}): path not found");
            return;
        }

        int deleted = 0, preserved = 0, failed = 0;
        long bytesFreed = 0;

        try
        {
            foreach (var dir in Directory.GetDirectories(localAppData))
            {
                var name = Path.GetFileName(dir);
                if (string.IsNullOrEmpty(name)) continue;

                if (PreserveFolders.Contains(name))
                {
                    preserved++;
                    continue;
                }

                try
                {
                    var size = SafeGetSize(dir);
                    DeleteDirectoryForce(dir);
                    deleted++;
                    bytesFreed += size;
                }
                catch (Exception ex)
                {
                    failed++;
                    App.Log($"LOCALAPPDATA_WIPE_FAIL: {name}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            App.Log($"LOCALAPPDATA_WIPE_ENUM_FAIL ({reason}): {ex.Message}");
            return;
        }

        // Also clear AppData\Local\Temp explicitly — even though it falls under
        // the wipe above, files in use throw and we want every-file best-effort.
        try
        {
            ClearDirContents(Path.Combine(localAppData, "Temp"));
        }
        catch { }

        App.Log($"LOCALAPPDATA_WIPE ({reason}): deleted={deleted} preserved={preserved} failed={failed} freed={bytesFreed / (1024 * 1024)}MB");
    }

    private static void DeleteDirectoryForce(string path)
    {
        // Two-pass delete: first clear ReadOnly flag on every entry, then
        // delete recursively. Game launchers love marking config files RO.
        try
        {
            foreach (var f in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
            {
                try
                {
                    var attr = File.GetAttributes(f);
                    if ((attr & FileAttributes.ReadOnly) != 0)
                        File.SetAttributes(f, attr & ~FileAttributes.ReadOnly);
                }
                catch { }
            }
        }
        catch { /* best-effort clear */ }

        Directory.Delete(path, recursive: true);
    }

    private static void ClearDirContents(string path)
    {
        if (!Directory.Exists(path)) return;
        foreach (var f in Directory.GetFiles(path))
        {
            try { File.Delete(f); } catch { }
        }
        foreach (var d in Directory.GetDirectories(path))
        {
            try { Directory.Delete(d, recursive: true); } catch { }
        }
    }

    private static long SafeGetSize(string path)
    {
        try
        {
            long total = 0;
            foreach (var f in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
            {
                try { total += new FileInfo(f).Length; } catch { }
            }
            return total;
        }
        catch { return 0; }
    }
}
