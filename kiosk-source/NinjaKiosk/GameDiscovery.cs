using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace NinjaKiosk;

/// <summary>
/// Scans the local PC for installed games, launchers, and creator tools.
/// Returns a list keyed by the same game-IDs used in `server/src/lib/games-catalog.ts`,
/// so the web UI can override its default exe paths with the real discovered ones.
///
/// Detection strategies (per game):
///   1. DirectPath  — try a list of fixed candidate paths (env vars expanded)
///   2. SteamApp    — search every Steam library for `steamapps/common/{folder}/{exe}`
///   3. EpicApp     — read Epic Games Launcher manifests (.item files)
///   4. DesktopLnk  — fallback: scan Desktop *.lnk shortcuts whose target matches a game's exe
/// </summary>
public static class GameDiscovery
{
    public record InstalledGame(string Id, string Name, string ExePath, string Source);

    public static List<InstalledGame> ScanInstalled()
    {
        var found = new Dictionary<string, InstalledGame>(StringComparer.OrdinalIgnoreCase);
        var steamLibs = GetSteamLibraries();
        var epicApps = GetEpicInstalledApps();

        foreach (var k in KnownGames)
        {
            // Strategy 1: direct paths
            foreach (var p in k.DirectPaths)
            {
                var resolved = ResolvePath(p);
                if (File.Exists(resolved))
                {
                    found[k.Id] = new InstalledGame(k.Id, k.Name, resolved, "direct");
                    goto nextGame;
                }
            }
            // Strategy 2: Steam (any library)
            if (k.SteamSubpath != null)
            {
                foreach (var lib in steamLibs)
                {
                    var p = Path.Combine(lib, "steamapps", "common", k.SteamSubpath);
                    if (File.Exists(p))
                    {
                        found[k.Id] = new InstalledGame(k.Id, k.Name, p, "steam");
                        goto nextGame;
                    }
                }
            }
            // Strategy 3: Epic Games manifests
            if (k.EpicAppName != null && epicApps.TryGetValue(k.EpicAppName, out var epicExe))
            {
                if (File.Exists(epicExe))
                {
                    found[k.Id] = new InstalledGame(k.Id, k.Name, epicExe, "epic");
                    goto nextGame;
                }
            }
            nextGame:;
        }

        // Strategy 4: Desktop shortcut sweep — fill in any games still not found
        foreach (var (id, name, exePath) in ScanDesktopShortcuts())
        {
            if (!found.ContainsKey(id))
                found[id] = new InstalledGame(id, name, exePath, "desktop-lnk");
        }

        return found.Values.OrderBy(g => g.Id).ToList();
    }

    // ─────────────────────────── Helpers ───────────────────────────

    public static string ResolvePath(string path)
    {
        if (string.IsNullOrEmpty(path)) return path;
        // Custom %USERNAME% (Environment.ExpandEnvironmentVariables already handles it on Windows but be explicit)
        path = path.Replace("%USERNAME%", Environment.UserName, StringComparison.OrdinalIgnoreCase);
        return Environment.ExpandEnvironmentVariables(path);
    }

    /// <summary>Returns every Steam library install root (parsed from libraryfolders.vdf).</summary>
    public static List<string> GetSteamLibraries()
    {
        var roots = new List<string>();
        // Default install
        foreach (var def in new[] {
            @"C:\Program Files (x86)\Steam",
            @"C:\Program Files\Steam",
        })
        {
            if (Directory.Exists(def)) roots.Add(def);
        }
        // libraryfolders.vdf points at extra libraries on D:, E:, etc.
        foreach (var primary in roots.ToList())
        {
            var vdf = Path.Combine(primary, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(vdf)) continue;
            try
            {
                var text = File.ReadAllText(vdf);
                // Match lines like:   "path"        "D:\\SteamLibrary"
                foreach (Match m in Regex.Matches(text, @"""path""\s*""([^""]+)""", RegexOptions.IgnoreCase))
                {
                    var p = m.Groups[1].Value.Replace(@"\\", @"\");
                    if (Directory.Exists(p) && !roots.Contains(p, StringComparer.OrdinalIgnoreCase))
                        roots.Add(p);
                }
            }
            catch (Exception ex) { App.Log($"DISCOVERY_VDF_ERR: {ex.Message}"); }
        }
        return roots;
    }

    /// <summary>Reads Epic Games Launcher manifests; returns AppName -> full exe path.</summary>
    public static Dictionary<string, string> GetEpicInstalledApps()
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var manifestDir = @"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests";
        if (!Directory.Exists(manifestDir)) return dict;
        foreach (var item in Directory.EnumerateFiles(manifestDir, "*.item"))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(item));
                var root = doc.RootElement;
                var appName = root.TryGetProperty("AppName", out var an) ? an.GetString() : null;
                var install = root.TryGetProperty("InstallLocation", out var il) ? il.GetString() : null;
                var launch  = root.TryGetProperty("LaunchExecutable", out var le) ? le.GetString() : null;
                if (appName == null || install == null || launch == null) continue;
                dict[appName] = Path.Combine(install, launch);
            }
            catch { /* skip bad manifest */ }
        }
        return dict;
    }

    /// <summary>Resolves a *.lnk to its target exe path using WSH (no extra DLL).</summary>
    public static string? ResolveShortcut(string lnkPath)
    {
        try
        {
            var t = Type.GetTypeFromProgID("WScript.Shell");
            if (t == null) return null;
            dynamic shell = Activator.CreateInstance(t)!;
            var sc = shell.CreateShortcut(lnkPath);
            string target = sc.TargetPath;
            return string.IsNullOrEmpty(target) ? null : target;
        }
        catch { return null; }
    }

    /// <summary>Scans the public + user Desktop for *.lnk shortcuts; matches by exe filename or path keyword.</summary>
    public static List<(string id, string name, string exePath)> ScanDesktopShortcuts()
    {
        var hits = new List<(string, string, string)>();
        var dirs = new[] {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
        };
        foreach (var d in dirs.Where(Directory.Exists))
        {
            foreach (var lnk in Directory.EnumerateFiles(d, "*.lnk", SearchOption.TopDirectoryOnly))
            {
                var target = ResolveShortcut(lnk);
                if (string.IsNullOrEmpty(target) || !File.Exists(target)) continue;
                foreach (var k in KnownGames)
                {
                    foreach (var hint in k.LnkHints)
                    {
                        if (target.Contains(hint, StringComparison.OrdinalIgnoreCase))
                        {
                            hits.Add((k.Id, k.Name, target));
                            goto nextLnk;
                        }
                    }
                }
                nextLnk:;
            }
        }
        return hits;
    }

    // ─────────────────────────── Catalog ───────────────────────────

    private record Known(string Id, string Name,
        string[] DirectPaths,
        string? SteamSubpath = null,
        string? EpicAppName = null,
        string[]? LnkHints = null)
    {
        public string[] LnkHints { get; init; } = LnkHints ?? Array.Empty<string>();
    }

    /// <summary>
    /// Mirrors the IDs in `server/src/lib/games-catalog.ts`. Update both files together
    /// when a new game is added to the kiosk.
    /// </summary>
    private static readonly Known[] KnownGames =
    {
        // ── FPS / Battle Royale ──
        new("csgo", "Counter-Strike 2",
            new[] { @"%PROGRAMFILES(X86)%\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe" },
            SteamSubpath: @"Counter-Strike Global Offensive\game\bin\win64\cs2.exe",
            LnkHints: new[] { @"\cs2.exe", @"\Counter-Strike Global Offensive\" }),

        new("valorant", "Valorant",
            new[] { @"C:\Riot Games\VALORANT\live\VALORANT.exe" },
            LnkHints: new[] { @"\VALORANT.exe", @"\Riot Games\VALORANT\" }),

        new("fortnite", "Fortnite",
            new[] { @"C:\Program Files\Epic Games\Fortnite\FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe" },
            EpicAppName: "Fortnite",
            LnkHints: new[] { @"\FortniteClient-Win64-Shipping.exe", @"\Fortnite\" }),

        new("overwatch2", "Overwatch 2",
            new[] { @"%PROGRAMFILES(X86)%\Overwatch\_retail_\Overwatch.exe" },
            SteamSubpath: @"Overwatch\Overwatch.exe",
            LnkHints: new[] { @"\Overwatch.exe" }),

        new("css", "Counter-Strike Source v34",
            new[] { @"D:\New folder\Counter Strike Source v34\play-css-v34.exe" },
            LnkHints: new[] { @"play-css-v34.exe", @"Counter Strike Source" }),

        new("rust", "Rust",
            Array.Empty<string>(),
            SteamSubpath: @"Rust\RustClient.exe",
            LnkHints: new[] { @"\RustClient.exe" }),

        new("apex", "Apex Legends",
            new[] { @"%PROGRAMFILES(X86)%\Origin Games\Apex\r5apex.exe" },
            SteamSubpath: @"Apex Legends\r5apex.exe",
            LnkHints: new[] { @"r5apex.exe", @"\Apex Legends\" }),

        // ── MOBA ──
        new("lol", "League of Legends",
            new[] { @"C:\Riot Games\League of Legends\LeagueClient.exe" },
            LnkHints: new[] { @"\LeagueClient.exe", @"\League of Legends\" }),

        new("dota2", "Dota 2",
            Array.Empty<string>(),
            SteamSubpath: @"dota 2 beta\game\bin\win64\dota2.exe",
            LnkHints: new[] { @"\dota2.exe" }),

        // ── Open World / Action ──
        new("fivem", "FiveM (GTA V RP)",
            new[] { @"%LOCALAPPDATA%\FiveM\FiveM.exe" },
            LnkHints: new[] { @"\FiveM.exe" }),

        new("hogwarts", "Hogwarts Legacy",
            Array.Empty<string>(),
            SteamSubpath: @"Hogwarts Legacy\Phoenix\Binaries\Win64\HogwartsLegacy.exe",
            EpicAppName: "HogwartsLegacy",
            LnkHints: new[] { @"\HogwartsLegacy.exe" }),

        new("gtav", "Grand Theft Auto V",
            Array.Empty<string>(),
            SteamSubpath: @"Grand Theft Auto V\GTA5.exe",
            EpicAppName: "9d2d0eb64d5c44529cece33fe2a46482",
            LnkHints: new[] { @"\GTA5.exe", @"PlayGTAV.exe" }),

        // ── Racing / Sports ──
        new("rocketleague", "Rocket League",
            Array.Empty<string>(),
            EpicAppName: "Sugar",
            LnkHints: new[] { @"\RocketLeague.exe" }),

        new("asphalt", "Asphalt Legends Unite",
            Array.Empty<string>(),
            EpicAppName: "AsphaltLegendsUnite",
            LnkHints: new[] { @"Asphalt9_epic_x64_rtl.exe" }),

        new("forza5", "Forza Horizon 5",
            Array.Empty<string>(),
            SteamSubpath: @"Forza Horizon 5\ForzaHorizon5.exe",
            LnkHints: new[] { @"\ForzaHorizon5.exe" }),

        new("fifa25", "EA FC 25",
            new[] { @"%PROGRAMFILES%\EA Games\EA SPORTS FC 25\FC25.exe" },
            LnkHints: new[] { @"\FC25.exe" }),

        // ── Party / Co-op ──
        new("fallguys", "Fall Guys",
            Array.Empty<string>(),
            EpicAppName: "0a2d9f6403244d12969e11da6713137b",
            LnkHints: new[] { @"\FallGuys_client.exe" }),

        new("amongus", "Among Us",
            Array.Empty<string>(),
            SteamSubpath: @"Among Us\Among Us.exe",
            LnkHints: new[] { @"\Among Us.exe" }),

        new("ittakestwo", "It Takes Two",
            Array.Empty<string>(),
            SteamSubpath: @"It Takes Two\ItTakesTwo.exe",
            EpicAppName: "0afb7c1b2d6f48c8a6e9c8c7f8a7d8c2",
            LnkHints: new[] { @"\ItTakesTwo.exe" }),

        new("awayout", "A Way Out",
            new[] { @"%PROGRAMFILES%\EA Games\A Way Out\AWayOut.exe" },
            LnkHints: new[] { @"AWayOut.exe" }),

        new("lethalcompany", "Lethal Company",
            Array.Empty<string>(),
            SteamSubpath: @"Lethal Company\Lethal Company.exe",
            LnkHints: new[] { @"\Lethal Company.exe" }),

        // ── Survival ──
        new("palworld", "Palworld",
            Array.Empty<string>(),
            SteamSubpath: @"Palworld\Palworld.exe",
            LnkHints: new[] { @"\Palworld.exe" }),

        // ── Strategy ──
        new("generals", "C&C Generals",
            new[] { @"%PROGRAMFILES(X86)%\R.G. Mechanics\Command and Conquer - Generals\Command and Conquer Generals\Generals.exe" },
            LnkHints: new[] { @"Command and Conquer Generals\Generals.exe" }),

        new("zerohour", "C&C Generals: Zero Hour",
            new[] { @"%PROGRAMFILES(X86)%\R.G. Mechanics\Command and Conquer - Generals\Command and Conquer Generals Zero Hour\Generals.exe" },
            LnkHints: new[] { @"Zero Hour\Generals.exe" }),

        // ── RPG / Adventure ──
        new("eldenring", "Elden Ring",
            Array.Empty<string>(),
            SteamSubpath: @"ELDEN RING\Game\eldenring.exe",
            LnkHints: new[] { @"\eldenring.exe" }),

        new("bg3", "Baldur's Gate 3",
            Array.Empty<string>(),
            SteamSubpath: @"Baldurs Gate 3\bin\bg3.exe",
            LnkHints: new[] { @"\bg3.exe" }),

        new("cyberpunk", "Cyberpunk 2077",
            Array.Empty<string>(),
            SteamSubpath: @"Cyberpunk 2077\bin\x64\Cyberpunk2077.exe",
            EpicAppName: "Ginger",
            LnkHints: new[] { @"\Cyberpunk2077.exe" }),

        new("rdr2", "Red Dead Redemption 2",
            Array.Empty<string>(),
            SteamSubpath: @"Red Dead Redemption 2\RDR2.exe",
            LnkHints: new[] { @"\RDR2.exe" }),

        new("destiny2", "Destiny 2",
            Array.Empty<string>(),
            SteamSubpath: @"Destiny 2\destiny2.exe",
            LnkHints: new[] { @"\destiny2.exe" }),

        new("genshin", "Genshin Impact",
            new[] { @"%PROGRAMFILES%\Genshin Impact\Genshin Impact game\GenshinImpact.exe" },
            LnkHints: new[] { @"\GenshinImpact.exe" }),

        // ── Battle.net launcher games ──
        new("diablo4", "Diablo IV",
            new[] { @"%PROGRAMFILES(X86)%\Diablo IV\Diablo IV Launcher.exe" },
            LnkHints: new[] { @"Diablo IV Launcher.exe", @"\Diablo IV\" }),

        new("warzone", "Call of Duty: Warzone",
            new[] { @"%PROGRAMFILES(X86)%\Call of Duty\cod.exe" },
            LnkHints: new[] { @"\Call of Duty\cod.exe" }),

        new("bo6", "Call of Duty: BO6",
            new[] { @"%PROGRAMFILES(X86)%\Call of Duty\cod.exe" },
            LnkHints: new[] { @"\Black Ops 6\" }),

        // ── Fighting ──
        new("sf6", "Street Fighter 6",
            Array.Empty<string>(),
            SteamSubpath: @"Street Fighter 6\StreetFighter6.exe",
            LnkHints: new[] { @"\StreetFighter6.exe" }),

        new("tekken8", "Tekken 8",
            Array.Empty<string>(),
            SteamSubpath: @"TEKKEN 8\Polaris\Binaries\Win64\Polaris-Win64-Shipping.exe",
            LnkHints: new[] { @"Polaris-Win64-Shipping.exe" }),

        new("mk1", "Mortal Kombat 1",
            Array.Empty<string>(),
            SteamSubpath: @"Mortal Kombat 1\MK1.exe",
            LnkHints: new[] { @"\MK1.exe" }),

        new("marvelrivals", "Marvel Rivals",
            Array.Empty<string>(),
            SteamSubpath: @"MarvelRivals\MarvelRivals_Launcher.exe",
            LnkHints: new[] { @"MarvelRivals_Launcher.exe" }),

        // ── Other ──
        new("roblox", "Roblox",
            new[] { @"%LOCALAPPDATA%\Roblox\RobloxPlayerLauncher.exe" },
            LnkHints: new[] { @"RobloxPlayerLauncher.exe" }),

        new("minecraft", "Minecraft (TLauncher)",
            new[] { @"%APPDATA%\.minecraft\TLauncher.exe" },
            LnkHints: new[] { @"TLauncher.exe" }),

        new("freefire", "Free Fire MAX",
            new[] { @"%PROGRAMFILES%\BlueStacks_nxt\HD-Player.exe" },
            LnkHints: new[] { @"HD-Player.exe", @"BlueStacks" }),

        // ── Apps & launchers (also useful for the launchers / creator tools menus) ──
        new("steam",       "Steam",       new[] { @"%PROGRAMFILES(X86)%\Steam\steam.exe" }),
        new("epicgames",   "Epic Games",  new[] { @"%PROGRAMFILES(X86)%\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe" }),
        new("battlenet",   "Battle.net",  new[] { @"%PROGRAMFILES(X86)%\Battle.net\Battle.net Launcher.exe" }),
        new("riotclient",  "Riot Client", new[] { @"C:\Riot Games\Riot Client\RiotClientServices.exe" }),
        new("faceit",      "FACEIT",      new[] { @"%LOCALAPPDATA%\FACEIT\FACEIT.exe" }),
        new("medal",       "Medal.tv",    new[] { @"%LOCALAPPDATA%\Medal\Medal.exe" }),
        new("discord",     "Discord",     new[] { @"%LOCALAPPDATA%\Discord\Update.exe" }),
        new("chrome",      "Google Chrome", new[] { @"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe", @"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe" }),
        new("edge",        "Microsoft Edge", new[] { @"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe" }),
        new("obs",         "OBS Studio",  new[] { @"%PROGRAMFILES%\obs-studio\bin\64bit\obs64.exe" }),
        new("streamlabs",  "Streamlabs",  new[] { @"%PROGRAMFILES%\Streamlabs OBS\Streamlabs OBS.exe", @"%LOCALAPPDATA%\Programs\Streamlabs Desktop\Streamlabs Desktop.exe" }),
        new("hyperx",      "HyperX NGENUITY", new[] { @"%PROGRAMFILES%\HyperX\HyperX NGENUITY\HyperXNGENUITY.exe" }),
        new("geforce",     "GeForce Experience", new[] { @"%PROGRAMFILES%\NVIDIA Corporation\NVIDIA GeForce Experience\NVIDIA GeForce Experience.exe", @"%PROGRAMFILES%\NVIDIA Corporation\NVIDIA app\NVIDIA app.exe" }),
        new("razer",       "Razer Synapse", new[] { @"%PROGRAMFILES(X86)%\Razer\Synapse3\UserProcess\Razer Synapse 3.exe" }),
    };
}
