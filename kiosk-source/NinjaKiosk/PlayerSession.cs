using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace NinjaKiosk;

/// <summary>
/// Per-player session save / restore.
///
/// Each player has a folder at: D:\NinjaKioskPlayers\{uid}\  (or C:\ if D:\ doesn't exist)
///
/// Two strategies are used to give each player their own logged-in state for
/// browsers, Discord, Steam, etc:
///
///   METHOD A — "--user-data-dir" flag (preferred, zero risk):
///     Apps that natively support a custom data folder (Chrome, Edge, Brave,
///     Discord, FACEIT, OBS, Streamlabs, VS Code) get launched with a flag
///     pointing to the player's folder. Apps just create + use it. No copying,
///     no junctions, no admin rights required.
///
///   METHOD B — NTFS junction points (for apps without --user-data-dir):
///     Steam (and optionally Battle.net / Epic / Riot) write to fixed
///     locations under %APPDATA% / %LOCALAPPDATA%. We delete those folders
///     and replace them with junctions pointing to the player's folder.
///     Requires admin (kiosk client already runs elevated).
///
/// Survives PC shutdown — everything is just files on disk. On boot, leftover
/// junctions from a previous session are torn down by RestoreToBlank().
/// </summary>
public static class PlayerSession
{
    // ── Storage root ──────────────────────────────────────────────────────────

    /// <summary>
    /// LOCAL root — per-player data lives here on the physical machine.
    /// Apps read/write from here (fast, no network latency).
    ///
    /// - Server PC: uses C:\NinjaKioskPlayers (same folder the SMB share exposes)
    ///   so data is instantly available to other PCs without a copy step.
    /// - Client PCs: tries D:\ first, falls back to C:\ProgramData.
    /// </summary>
    public static string PlayersRoot
    {
        get
        {
            // On the server PC, use the share's local folder so apps write
            // directly to the shared location — no sync copy needed.
            if (IsServerPc) return ServerShareLocalPath;

            try
            {
                if (Directory.Exists(@"D:\")) return @"D:\NinjaKioskPlayers";
            }
            catch { }
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "NinjaKioskPlayers");
        }
    }

    /// <summary>
    /// Well-known local path for the shared folder on the server PC.
    /// This is the same path that is exposed as the "NinjaKioskPlayers" SMB share.
    /// </summary>
    private static readonly string ServerShareLocalPath = @"C:\NinjaKioskPlayers";

    /// <summary>
    /// True if this machine is the LAN server (no lan-config.json, or the
    /// config points to 127.0.0.1 / this machine's own IP).
    /// </summary>
    public static bool IsServerPc
    {
        get
        {
            var configFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "ninja-games-kiosk", "lan-config.json");

            // If lan-config.json exists and has a real server IP, we're a client
            if (File.Exists(configFile))
            {
                try
                {
                    var json = File.ReadAllText(configFile);
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    var ip = doc.RootElement.GetProperty("serverIp").GetString();
                    if (!string.IsNullOrEmpty(ip) && ip != "127.0.0.1")
                        return false; // definitely a client
                }
                catch { }
            }

            // No config or empty IP — check if the NinjaKioskPlayers SMB share
            // is active on THIS machine. Only the server has it.
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "net",
                    Arguments = "share NinjaKioskPlayers",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };
                using var p = Process.Start(psi);
                var output = p?.StandardOutput.ReadToEnd() ?? "";
                p?.WaitForExit(3000);
                // If output contains "Share name" or the path, the share exists on this machine
                var isServer = output.Contains("NinjaKioskPlayers", StringComparison.OrdinalIgnoreCase);
                App.Log($"PLAYER_SESSION: IsServerPc check — net share output contains share={isServer}");
                return isServer;
            }
            catch { return false; }
        }
    }

    /// <summary>
    /// NETWORK root — shared folder on the LAN server. All PCs sync to/from
    /// here so a player's state roams across machines.
    ///
    /// - Server PC: returns C:\NinjaKioskPlayers (the local path behind the SMB share)
    /// - Client PCs: returns \\{serverIp}\NinjaKioskPlayers (the UNC path)
    ///
    /// Returns null only if the share/folder isn't reachable.
    /// </summary>
    public static string? NetworkPlayersRoot
    {
        get
        {
            try
            {
                // ── Server PC: use the share's local folder directly ──
                if (IsServerPc)
                {
                    if (Directory.Exists(ServerShareLocalPath)) return ServerShareLocalPath;
                    // Try to create it
                    try { Directory.CreateDirectory(ServerShareLocalPath); return ServerShareLocalPath; }
                    catch { return null; }
                }

                // ── Client PC: use UNC path via lan-config.json ──
                var configFile = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "ninja-games-kiosk", "lan-config.json");
                if (!File.Exists(configFile)) return null;
                var json = File.ReadAllText(configFile);
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                var ip = doc.RootElement.GetProperty("serverIp").GetString();
                if (string.IsNullOrEmpty(ip)) return null;
                var share = $@"\\{ip}\NinjaKioskPlayers";
                if (Directory.Exists(share)) return share;

                // Elevated (admin) processes can't see shares from the normal
                // user session.  Force-connect with "net use" so the share is
                // accessible from this security context.
                App.Log($"PLAYER_SESSION: Share {share} not visible — trying net use...");
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "net",
                        Arguments = $"use \"{share}\" /persistent:no",
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                    };
                    using var p = Process.Start(psi);
                    p?.WaitForExit(5000);
                    var stdout = p?.StandardOutput.ReadToEnd() ?? "";
                    var stderr = p?.StandardError.ReadToEnd() ?? "";
                    App.Log($"PLAYER_SESSION: net use result: exit={p?.ExitCode} out={stdout.Trim()} err={stderr.Trim()}");
                }
                catch (Exception ex)
                {
                    App.Log($"PLAYER_SESSION: net use failed: {ex.Message}");
                }

                // Retry after net use
                if (Directory.Exists(share)) return share;
                App.Log($"PLAYER_SESSION: Network share {share} still not reachable after net use");
                return null;
            }
            catch { return null; }
        }
    }

    /// <summary>Returns the per-player LOCAL folder for the given uid (creates it).</summary>
    public static string FolderFor(string uid)
    {
        var safe = SanitizeUid(uid);
        var path = Path.Combine(PlayersRoot, safe);
        Directory.CreateDirectory(path);
        return path;
    }

    // ── Cross-PC roaming: network sync ───────────────────────────────────────

    /// <summary>
    /// Pulls the player's data FROM the network share TO the local machine.
    /// Call this BEFORE RestoreSession() on player login.
    /// If the network share isn't available, does nothing (player gets local
    /// data only, or a fresh start if they've never used this PC).
    /// </summary>
    public static void SyncFromNetwork(string uid)
    {
        App.Log($"PLAYER_SYNC: SyncFromNetwork called for uid={uid}, IsServerPc={IsServerPc}");
        var netRoot = NetworkPlayersRoot;
        if (netRoot == null)
        {
            App.Log($"PLAYER_SYNC: NetworkPlayersRoot is NULL — share not reachable! Cannot sync.");
            return;
        }
        App.Log($"PLAYER_SYNC: NetworkPlayersRoot={netRoot}");
        try
        {
            var safe = SanitizeUid(uid);
            var netFolder = Path.Combine(netRoot, safe);
            var localFolder = FolderFor(uid);

            // On the server PC, local and network are the same folder — skip copy
            if (string.Equals(Path.GetFullPath(netFolder), Path.GetFullPath(localFolder), StringComparison.OrdinalIgnoreCase))
            {
                App.Log($"PLAYER_SYNC: Server PC — local=network, skip pull for uid={uid}");
                return;
            }

            if (!Directory.Exists(netFolder))
            {
                App.Log($"PLAYER_SYNC: No network data for uid={uid} at {netFolder} (first time on any PC)");
                return;
            }
            App.Log($"PLAYER_SYNC: Pulling {netFolder} → {localFolder}");
            int fileCount = 0;
            int errorCount = 0;
            CopyDirectoryRecursive(netFolder, localFolder, ref fileCount, ref errorCount);
            App.Log($"PLAYER_SYNC: Pull complete for uid={uid} — {fileCount} files copied, {errorCount} errors");
        }
        catch (Exception ex)
        {
            App.Log($"PLAYER_SYNC: Pull error: {ex.Message}");
        }
    }

    /// <summary>
    /// Pushes the player's data FROM local TO the network share.
    /// Call this AFTER SaveSession() on player logout.
    /// If the network share isn't available, does nothing (data stays local).
    /// </summary>
    public static void SyncToNetwork(string uid)
    {
        App.Log($"PLAYER_SYNC: SyncToNetwork called for uid={uid}, IsServerPc={IsServerPc}");
        var netRoot = NetworkPlayersRoot;
        if (netRoot == null)
        {
            App.Log($"PLAYER_SYNC: NetworkPlayersRoot is NULL — share not reachable! Data stays local only.");
            return;
        }
        try
        {
            var safe = SanitizeUid(uid);
            var localFolder = FolderFor(uid);
            if (!Directory.Exists(localFolder)) return;
            var netFolder = Path.Combine(netRoot, safe);

            // On the server PC, local and network are the same folder — skip copy
            if (string.Equals(Path.GetFullPath(netFolder), Path.GetFullPath(localFolder), StringComparison.OrdinalIgnoreCase))
            {
                App.Log($"PLAYER_SYNC: Server PC — local=network, skip push for uid={uid}");
                return;
            }

            Directory.CreateDirectory(netFolder);
            App.Log($"PLAYER_SYNC: Pushing {localFolder} → {netFolder}");
            int fileCount = 0;
            int errorCount = 0;
            CopyDirectoryRecursive(localFolder, netFolder, ref fileCount, ref errorCount);
            App.Log($"PLAYER_SYNC: Push complete for uid={uid} — {fileCount} files copied, {errorCount} errors");
        }
        catch (Exception ex)
        {
            App.Log($"PLAYER_SYNC: Push error: {ex.Message}");
        }
    }

    /// <summary>Recursively copies all files and subdirs from src to dst (overwrites).
    /// Skips files/directories that are locked or access-denied — never aborts.</summary>
    private static void CopyDirectoryRecursive(string src, string dst, ref int fileCount, ref int errorCount)
    {
        try { Directory.CreateDirectory(dst); }
        catch { errorCount++; return; }

        try
        {
            foreach (var file in Directory.GetFiles(src))
            {
                var destFile = Path.Combine(dst, Path.GetFileName(file));
                try { File.Copy(file, destFile, overwrite: true); fileCount++; }
                catch { errorCount++; }
            }
        }
        catch { errorCount++; /* can't enumerate files in this dir — skip */ }

        try
        {
            foreach (var dir in Directory.GetDirectories(src))
            {
                var destDir = Path.Combine(dst, Path.GetFileName(dir));
                CopyDirectoryRecursive(dir, destDir, ref fileCount, ref errorCount);
            }
        }
        catch { errorCount++; /* can't enumerate subdirs — skip */ }
    }

    private static string SanitizeUid(string uid)
    {
        if (string.IsNullOrWhiteSpace(uid)) return "_unknown";
        var bad = Path.GetInvalidFileNameChars();
        var safe = new string(uid.Select(c => bad.Contains(c) ? '_' : c).ToArray());
        return safe.Length > 64 ? safe[..64] : safe;
    }

    // ── Method A: --user-data-dir flag for compatible apps ────────────────────

    /// <summary>
    /// Maps an app's exe filename (lowercase, no path) to:
    ///   - The flag template ({0} = data folder)
    ///   - The subfolder name to use under the player root
    ///
    /// If a launched exe matches one of these, the kiosk appends the flag to
    /// the launch arguments so the app uses a per-player data folder.
    /// </summary>
    private static readonly Dictionary<string, (string FlagTemplate, string SubFolder)> UserDataDirApps =
        new(StringComparer.OrdinalIgnoreCase)
        {
            // Chromium-family browsers and Electron apps all accept --user-data-dir
            ["chrome.exe"]        = ("--user-data-dir=\"{0}\"", "chrome"),
            ["msedge.exe"]        = ("--user-data-dir=\"{0}\"", "edge"),
            ["brave.exe"]         = ("--user-data-dir=\"{0}\"", "brave"),
            ["opera.exe"]         = ("--user-data-dir=\"{0}\"", "opera"),
            ["vivaldi.exe"]       = ("--user-data-dir=\"{0}\"", "vivaldi"),
            // Discord — accepts --user-data-dir (Electron app)
            ["discord.exe"]       = ("--user-data-dir=\"{0}\"", "discord"),
            ["discordcanary.exe"] = ("--user-data-dir=\"{0}\"", "discord-canary"),
            ["discordptb.exe"]    = ("--user-data-dir=\"{0}\"", "discord-ptb"),
            // OBS / Streamlabs — accept --portable mode + custom dir
            ["obs64.exe"]         = ("--portable --userdata=\"{0}\"", "obs"),
            ["streamlabs obs.exe"]= ("--user-data-dir=\"{0}\"", "streamlabs"),
            // FACEIT — Electron-based
            ["faceit.exe"]        = ("--user-data-dir=\"{0}\"", "faceit"),
            // VS Code / Cursor — accept --user-data-dir
            ["code.exe"]          = ("--user-data-dir=\"{0}\"", "vscode"),
            ["cursor.exe"]        = ("--user-data-dir=\"{0}\"", "cursor"),
        };

    /// <summary>
    /// If the given exe path matches a known app that supports --user-data-dir,
    /// returns the flag string to append to the launch args. Otherwise null.
    /// </summary>
    public static string? GetUserDataDirArgs(string exePath, string playerUid)
    {
        if (string.IsNullOrEmpty(exePath) || string.IsNullOrEmpty(playerUid)) return null;
        var name = Path.GetFileName(exePath);
        if (!UserDataDirApps.TryGetValue(name, out var info)) return null;

        var folder = Path.Combine(FolderFor(playerUid), info.SubFolder);
        Directory.CreateDirectory(folder);
        return string.Format(info.FlagTemplate, folder);
    }

    // ── Method B: Junction-point swapping for Steam (and friends) ─────────────

    /// <summary>
    /// Apps whose data folders live at fixed paths and which DO NOT accept
    /// a --user-data-dir flag. These are swapped via NTFS junction points.
    ///
    /// Each entry is: (display name, list of (live path, subfolder under player) pairs).
    /// On player login, each live path is:
    ///   1. Backed up to "{path}.ninjabak" if it exists and isn't already a junction
    ///   2. Replaced with a junction → {playerFolder}\{subfolder}
    /// On player logout, the junctions are removed (and the .ninjabak is left
    /// in place — it's the "default" state when no player is logged in).
    /// </summary>
    private static readonly string LocalAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    private static readonly string AppData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);

    private static readonly List<(string Name, (string LivePath, string SubFolder)[] Paths)> JunctionApps =
        new()
        {
            ("Steam", new[]
            {
                (Path.Combine(@"C:\Program Files (x86)\Steam", "config"), "steam-config"),
                (Path.Combine(@"C:\Program Files (x86)\Steam", "userdata"), "steam-userdata"),
            }),
            ("Chrome", new[]
            {
                // Chrome stores ALL login data, cookies, history, extensions here
                (Path.Combine(LocalAppData, @"Google\Chrome\User Data"), "chrome"),
            }),
            ("Edge", new[]
            {
                (Path.Combine(LocalAppData, @"Microsoft\Edge\User Data"), "edge"),
            }),
            ("Discord", new[]
            {
                (Path.Combine(AppData, "discord"), "discord"),
            }),
            ("Riot", new[]
            {
                // Riot Client stores auth in both Data AND Config folders
                (Path.Combine(LocalAppData, @"Riot Games\Riot Client\Data"), "riot"),
                (Path.Combine(LocalAppData, @"Riot Games\Riot Client\Config"), "riot-config"),
            }),
            ("Valorant", new[]
            {
                // Valorant stores settings + webcache with auth
                (Path.Combine(LocalAppData, @"VALORANT\Saved"), "valorant"),
            }),
            ("Epic", new[]
            {
                // Junction the ENTIRE Saved folder — it contains:
                // Config, Data, webcache_* (session cookies), Saves (remember-me tokens)
                (Path.Combine(LocalAppData, @"EpicGamesLauncher\Saved"), "epic"),
            }),
            ("Fortnite", new[]
            {
                // Fortnite stores config + auth locally
                (Path.Combine(LocalAppData, @"FortniteGame\Saved"), "fortnite"),
            }),
            ("Battle.net", new[]
            {
                (Path.Combine(AppData, "Battle.net"), "battlenet"),
            }),
            ("FiveM", new[]
            {
                // FiveM stores login cache + server favorites here
                (Path.Combine(LocalAppData, "FiveM"), "fivem"),
            }),
            ("Roblox", new[]
            {
                // Roblox stores login cookies and settings here
                (Path.Combine(LocalAppData, "Roblox"), "roblox"),
            }),
        };

    /// <summary>
    /// Restore the given player's session: kill running tracked apps, then for
    /// each junction-app create the junctions pointing to this player's folder.
    /// Safe to call when no previous session existed (creates empty folders).
    /// </summary>
    public static void RestoreSession(string uid)
    {
        try
        {
            App.Log($"PLAYER_SESSION: Restoring for uid={uid}");
            KillTrackedAppsBeforeSwap();

            var playerRoot = FolderFor(uid);

            // Re-encrypt DPAPI keys for this machine so Chrome/Edge can read sessions
            try { ImportDpapiKeys(playerRoot); }
            catch (Exception ex) { App.Log($"DPAPI_IMPORT_FAIL: {ex.Message}"); }

            foreach (var (name, paths) in JunctionApps)
            {
                foreach (var (livePath, subFolder) in paths)
                {
                    try
                    {
                        var playerCopy = Path.Combine(playerRoot, subFolder);
                        Directory.CreateDirectory(playerCopy);

                        // If the live path exists and ISN'T already a junction,
                        // back it up so we have a "default" to restore later.
                        if (Directory.Exists(livePath) && !IsReparsePoint(livePath))
                        {
                            var bak = livePath + ".ninjabak";
                            if (!Directory.Exists(bak))
                            {
                                App.Log($"PLAYER_SESSION: Backing up {livePath} → {bak}");
                                try { Directory.Move(livePath, bak); }
                                catch (Exception ex) { App.Log($"PLAYER_SESSION: backup move failed: {ex.Message}"); continue; }
                            }
                            else
                            {
                                // Backup already exists — just delete the live folder
                                try { Directory.Delete(livePath, recursive: true); } catch { }
                            }
                        }
                        else if (IsReparsePoint(livePath))
                        {
                            // It's already a junction from a previous session — remove it
                            try { Directory.Delete(livePath); } catch { }
                        }

                        // Create the junction: livePath → playerCopy
                        if (!Directory.Exists(livePath))
                        {
                            CreateJunction(livePath, playerCopy);
                            App.Log($"PLAYER_SESSION: Linked {livePath} → {playerCopy}");
                        }
                    }
                    catch (Exception ex)
                    {
                        App.Log($"PLAYER_SESSION: {name} restore error ({livePath}): {ex.Message}");
                    }
                }
            }

            App.Log($"PLAYER_SESSION: Restored uid={uid}");
        }
        catch (Exception ex)
        {
            App.Log($"PLAYER_SESSION: RestoreSession fatal: {ex.Message}");
        }
    }

    /// <summary>
    /// Save (or rather: detach) the current player's session. Removes all
    /// junctions but leaves the player's folder intact for next time. Restores
    /// the .ninjabak default state so the PC is in a "fresh / no player" mode.
    /// </summary>
    public static void SaveSession(string uid)
    {
        try
        {
            App.Log($"PLAYER_SESSION: Saving for uid={uid}");
            KillTrackedAppsBeforeSwap();

            foreach (var (name, paths) in JunctionApps)
            {
                foreach (var (livePath, _) in paths)
                {
                    try
                    {
                        // Remove the junction (does NOT delete target — that's the player's folder)
                        if (Directory.Exists(livePath) && IsReparsePoint(livePath))
                        {
                            Directory.Delete(livePath);
                            App.Log($"PLAYER_SESSION: Unlinked {livePath}");
                        }

                        // Restore the .ninjabak default if present
                        var bak = livePath + ".ninjabak";
                        if (Directory.Exists(bak) && !Directory.Exists(livePath))
                        {
                            try
                            {
                                Directory.Move(bak, livePath);
                                App.Log($"PLAYER_SESSION: Restored default {livePath}");
                            }
                            catch (Exception ex) { App.Log($"PLAYER_SESSION: bak restore error: {ex.Message}"); }
                        }
                    }
                    catch (Exception ex)
                    {
                        App.Log($"PLAYER_SESSION: {name} save error ({livePath}): {ex.Message}");
                    }
                }
            }

            // Export DPAPI keys so they can be re-encrypted on another PC
            try { ExportDpapiKeys(FolderFor(uid)); }
            catch (Exception ex) { App.Log($"DPAPI_EXPORT_FAIL: {ex.Message}"); }

            App.Log($"PLAYER_SESSION: Saved uid={uid}");
        }
        catch (Exception ex)
        {
            App.Log($"PLAYER_SESSION: SaveSession fatal: {ex.Message}");
        }
    }

    /// <summary>
    /// Boot-time cleanup: removes any leftover junctions from a previous
    /// session (e.g., if the PC was hard-rebooted mid-session). Restores
    /// the .ninjabak defaults so the PC starts in a clean state.
    /// Call this once on kiosk startup BEFORE the login screen appears.
    /// </summary>
    public static void RestoreToBlank()
    {
        try
        {
            App.Log("PLAYER_SESSION: Boot cleanup — restoring defaults");
            foreach (var (_, paths) in JunctionApps)
            {
                foreach (var (livePath, _) in paths)
                {
                    try
                    {
                        if (Directory.Exists(livePath) && IsReparsePoint(livePath))
                        {
                            Directory.Delete(livePath);
                        }
                        var bak = livePath + ".ninjabak";
                        if (Directory.Exists(bak) && !Directory.Exists(livePath))
                        {
                            Directory.Move(bak, livePath);
                        }
                    }
                    catch { }
                }
            }
        }
        catch (Exception ex)
        {
            App.Log($"PLAYER_SESSION: Boot cleanup error: {ex.Message}");
        }
    }

    // ── DPAPI key portability (Chrome/Edge session roaming) ─────────────────
    //
    // Chrome & Edge encrypt cookies/passwords with an AES key stored in
    // "Local State" → os_crypt.encrypted_key.  That key is DPAPI-protected,
    // meaning it's tied to the Windows user + machine.  When we copy the
    // profile to another PC, that PC can't decrypt it → sessions are lost.
    //
    // Fix: on save we DPAPI-decrypt the key and stash the raw bytes in the
    // player folder (.ninja-raw-key).  On restore we re-encrypt with the
    // local machine's DPAPI and patch Local State.  Now Chrome/Edge can
    // read the cookies on any PC.

    private static readonly string RawKeyFileName = ".ninja-raw-key";

    /// <summary>
    /// Chromium apps whose Local State file contains os_crypt.encrypted_key.
    /// Maps subfolder name → nothing extra needed, we just need to know which
    /// player subfolders to process.
    /// </summary>
    private static readonly string[] ChromiumSubFolders = { "chrome", "edge" };

    /// <summary>
    /// After SaveSession: for each Chromium profile, extract the AES key
    /// from Local State, DPAPI-decrypt it, save the raw key for portability.
    /// </summary>
    private static void ExportDpapiKeys(string playerRoot)
    {
        foreach (var sub in ChromiumSubFolders)
        {
            try
            {
                var profileDir = Path.Combine(playerRoot, sub);
                var localState = Path.Combine(profileDir, "Local State");
                if (!File.Exists(localState)) continue;

                var json = File.ReadAllText(localState);
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("os_crypt", out var osCrypt)) continue;
                if (!osCrypt.TryGetProperty("encrypted_key", out var encKeyProp)) continue;
                var encKeyB64 = encKeyProp.GetString();
                if (string.IsNullOrEmpty(encKeyB64)) continue;

                var encKeyBytes = Convert.FromBase64String(encKeyB64);
                // First 5 bytes are the "DPAPI" prefix marker
                if (encKeyBytes.Length <= 5) continue;
                if (System.Text.Encoding.ASCII.GetString(encKeyBytes, 0, 5) != "DPAPI") continue;

                var dpapiBlob = encKeyBytes[5..];
                var rawKey = ProtectedData.Unprotect(dpapiBlob, null, DataProtectionScope.CurrentUser);

                var rawKeyFile = Path.Combine(profileDir, RawKeyFileName);
                File.WriteAllBytes(rawKeyFile, rawKey);
                App.Log($"DPAPI_EXPORT: Exported raw key for {sub} ({rawKey.Length} bytes)");
            }
            catch (Exception ex)
            {
                App.Log($"DPAPI_EXPORT: {sub} error: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Before RestoreSession: for each Chromium profile that has a raw key file,
    /// re-encrypt with THIS machine's DPAPI and patch Local State so Chrome
    /// can decrypt cookies/passwords.
    /// </summary>
    private static void ImportDpapiKeys(string playerRoot)
    {
        foreach (var sub in ChromiumSubFolders)
        {
            try
            {
                var profileDir = Path.Combine(playerRoot, sub);
                var rawKeyFile = Path.Combine(profileDir, RawKeyFileName);
                var localState = Path.Combine(profileDir, "Local State");
                if (!File.Exists(rawKeyFile) || !File.Exists(localState)) continue;

                var rawKey = File.ReadAllBytes(rawKeyFile);
                if (rawKey.Length == 0) continue;

                // Re-encrypt with this machine's DPAPI
                var dpapiBlob = ProtectedData.Protect(rawKey, null, DataProtectionScope.CurrentUser);

                // Rebuild: "DPAPI" prefix + DPAPI blob → base64
                var withPrefix = new byte[5 + dpapiBlob.Length];
                System.Text.Encoding.ASCII.GetBytes("DPAPI", 0, 5, withPrefix, 0);
                Array.Copy(dpapiBlob, 0, withPrefix, 5, dpapiBlob.Length);
                var newB64 = Convert.ToBase64String(withPrefix);

                // Patch the JSON — read, modify, write
                var jsonText = File.ReadAllText(localState);
                using var jsonDoc = JsonDocument.Parse(jsonText);
                var root = jsonDoc.RootElement;

                // Simple string replacement for the encrypted_key value
                if (root.TryGetProperty("os_crypt", out var osCrypt) &&
                    osCrypt.TryGetProperty("encrypted_key", out var oldKeyProp))
                {
                    var oldB64 = oldKeyProp.GetString();
                    if (!string.IsNullOrEmpty(oldB64) && oldB64 != newB64)
                    {
                        // Replace the old base64 key with the new one in the JSON text
                        jsonText = jsonText.Replace($"\"{oldB64}\"", $"\"{newB64}\"");
                        File.WriteAllText(localState, jsonText);
                        App.Log($"DPAPI_IMPORT: Re-encrypted key for {sub} on this machine");
                    }
                    else
                    {
                        App.Log($"DPAPI_IMPORT: Key for {sub} already current (same machine)");
                    }
                }
            }
            catch (Exception ex)
            {
                App.Log($"DPAPI_IMPORT: {sub} error: {ex.Message}");
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Gracefully close, then force-kill tracked apps. Chrome/Edge are closed
    /// gracefully first (WM_CLOSE) so they flush cookies to disk. Other apps
    /// are force-killed immediately.
    /// </summary>
    private static void KillTrackedAppsBeforeSwap()
    {
        // Step 1: Gracefully close Chrome/Edge so they save cookies
        var graceful = new[] { "chrome", "msedge" };
        foreach (var n in graceful)
        {
            try
            {
                foreach (var p in Process.GetProcessesByName(n))
                {
                    try
                    {
                        if (p.MainWindowHandle != IntPtr.Zero)
                        {
                            p.CloseMainWindow();
                            App.Log($"PLAYER_SESSION: Closing {p.ProcessName} gracefully (PID {p.Id})");
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        // Wait for Chrome/Edge to flush cookies (they need a moment)
        try { System.Threading.Thread.Sleep(2000); } catch { }

        // Step 2: Force-kill everything that's still running
        var names = new[] {
            "steam", "steamwebhelper", "steamservice",
            "chrome", "msedge", "discord", "Update",
            "RiotClientServices", "RiotClientUx", "RiotClientCrashHandler",
            "EpicGamesLauncher", "EpicWebHelper", "FortniteClient-Win64-Shipping",
            "VALORANT-Win64-Shipping", "RiotClientServices",
            "Battle.net", "Agent",
            "FiveM", "FiveM_b2699_GTAProcess", "FiveM_ChromeBrowser",
            "RobloxPlayerBeta", "RobloxPlayerLauncher",
        };
        foreach (var n in names)
        {
            try
            {
                foreach (var p in Process.GetProcessesByName(n))
                {
                    try { p.Kill(true); App.Log($"PLAYER_SESSION: Killed {p.ProcessName} (PID {p.Id})"); }
                    catch { }
                }
            }
            catch { }
        }
        // Brief delay to let file handles release
        try { System.Threading.Thread.Sleep(800); } catch { }
    }

    /// <summary>True if the given path is an NTFS reparse point (junction or symlink).</summary>
    private static bool IsReparsePoint(string path)
    {
        try
        {
            var attrs = File.GetAttributes(path);
            return (attrs & FileAttributes.ReparsePoint) != 0;
        }
        catch { return false; }
    }

    /// <summary>
    /// Creates an NTFS junction point at <paramref name="link"/> pointing to
    /// <paramref name="target"/>. Uses cmd.exe `mklink /J` because it works on
    /// any .NET version and doesn't need elevated symlink creation rights.
    /// </summary>
    private static void CreateJunction(string link, string target)
    {
        // Make sure the parent of `link` exists
        var parent = Path.GetDirectoryName(link);
        if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c mklink /J \"{link}\" \"{target}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        using var p = Process.Start(psi);
        p?.WaitForExit(5000);
    }
}
