# Ninja Games - PC Game Scanner
# Scans for installed games on Windows and outputs JSON
# Run: powershell -ExecutionPolicy Bypass -File scan_games.ps1

$games = @()

Write-Host "🥷 Ninja Games - Game Scanner" -ForegroundColor Green
Write-Host "Scanning for installed games..." -ForegroundColor Gray
Write-Host ""

# ==================== STEAM ====================
$steamPaths = @(
    "C:\Program Files (x86)\Steam",
    "D:\Steam",
    "E:\Steam",
    "D:\SteamLibrary",
    "E:\SteamLibrary"
)

foreach ($steamPath in $steamPaths) {
    $libraryFolders = "$steamPath\steamapps\libraryfolders.vdf"
    if (Test-Path $libraryFolders) {
        # Parse library folders for additional paths
        $content = Get-Content $libraryFolders -Raw
        $paths = [regex]::Matches($content, '"path"\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
        $steamPaths += $paths
    }
    
    $appsPath = "$steamPath\steamapps\common"
    if (Test-Path $appsPath) {
        Get-ChildItem $appsPath -Directory | ForEach-Object {
            $dir = $_.FullName
            $name = $_.Name
            $exe = Get-ChildItem $dir -Filter "*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($exe) {
                $games += @{
                    name = $name
                    platform = "Steam"
                    exePath = $exe.FullName
                    installDir = $dir
                    size = [math]::Round((Get-ChildItem $dir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
                }
                Write-Host "  [Steam] $name" -ForegroundColor Cyan
            }
        }
    }
}

# ==================== EPIC GAMES ====================
$epicManifests = "C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
if (Test-Path $epicManifests) {
    Get-ChildItem $epicManifests -Filter "*.item" | ForEach-Object {
        $manifest = Get-Content $_.FullName | ConvertFrom-Json
        if ($manifest.InstallLocation -and (Test-Path $manifest.InstallLocation)) {
            $exe = Get-ChildItem $manifest.InstallLocation -Filter "*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
            $games += @{
                name = $manifest.DisplayName
                platform = "Epic Games"
                exePath = if ($exe) { $exe.FullName } else { "" }
                installDir = $manifest.InstallLocation
                size = [math]::Round((Get-ChildItem $manifest.InstallLocation -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
            }
            Write-Host "  [Epic] $($manifest.DisplayName)" -ForegroundColor Magenta
        }
    }
}

# ==================== RIOT GAMES ====================
$riotPaths = @(
    @{ name = "Valorant"; path = "C:\Riot Games\VALORANT\live\VALORANT.exe" },
    @{ name = "League of Legends"; path = "C:\Riot Games\League of Legends\LeagueClient.exe" }
)

foreach ($riot in $riotPaths) {
    if (Test-Path $riot.path) {
        $dir = Split-Path $riot.path -Parent
        $games += @{
            name = $riot.name
            platform = "Riot Games"
            exePath = $riot.path
            installDir = $dir
            size = [math]::Round((Get-ChildItem $dir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
        }
        Write-Host "  [Riot] $($riot.name)" -ForegroundColor Yellow
    }
}

# ==================== BATTLE.NET ====================
$bnetPaths = @(
    @{ name = "Call of Duty"; pattern = "C:\Program Files (x86)\Call of Duty\*\cod.exe" },
    @{ name = "Overwatch 2"; pattern = "C:\Program Files (x86)\Overwatch\_retail_\Overwatch.exe" },
    @{ name = "Diablo IV"; pattern = "C:\Program Files (x86)\Diablo IV\Diablo IV.exe" }
)

foreach ($bnet in $bnetPaths) {
    $found = Get-Item $bnet.pattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        $games += @{
            name = $bnet.name
            platform = "Battle.net"
            exePath = $found.FullName
            installDir = Split-Path $found.FullName -Parent
            size = 0
        }
        Write-Host "  [Battle.net] $($bnet.name)" -ForegroundColor Blue
    }
}

# ==================== UBISOFT ====================
$ubiPath = "C:\Program Files (x86)\Ubisoft\Ubisoft Game Launcher\games"
if (Test-Path $ubiPath) {
    Get-ChildItem $ubiPath -Directory | ForEach-Object {
        $exe = Get-ChildItem $_.FullName -Filter "*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($exe) {
            $games += @{
                name = $_.Name
                platform = "Ubisoft"
                exePath = $exe.FullName
                installDir = $_.FullName
                size = 0
            }
            Write-Host "  [Ubisoft] $($_.Name)" -ForegroundColor DarkCyan
        }
    }
}

# ==================== EA / ORIGIN ====================
$eaPaths = @("C:\Program Files\EA Games", "C:\Program Files (x86)\Origin Games", "C:\Program Files\Electronic Arts")
foreach ($eaPath in $eaPaths) {
    if (Test-Path $eaPath) {
        Get-ChildItem $eaPath -Directory | ForEach-Object {
            $exe = Get-ChildItem $_.FullName -Filter "*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($exe) {
                $games += @{
                    name = $_.Name
                    platform = "EA"
                    exePath = $exe.FullName
                    installDir = $_.FullName
                    size = 0
                }
                Write-Host "  [EA] $($_.Name)" -ForegroundColor DarkGreen
            }
        }
    }
}

# ==================== ROCKSTAR ====================
$rockstarPath = "C:\Program Files\Rockstar Games"
if (Test-Path $rockstarPath) {
    Get-ChildItem $rockstarPath -Directory | ForEach-Object {
        $exe = Get-ChildItem $_.FullName -Filter "*.exe" -Recurse -Depth 1 -ErrorAction SilentlyContinue | 
               Where-Object { $_.Name -notlike "*launcher*" -and $_.Name -notlike "*unins*" } | 
               Select-Object -First 1
        if ($exe) {
            $games += @{
                name = $_.Name
                platform = "Rockstar"
                exePath = $exe.FullName
                installDir = $_.FullName
                size = 0
            }
            Write-Host "  [Rockstar] $($_.Name)" -ForegroundColor Red
        }
    }
}

# ==================== XBOX / MICROSOFT STORE ====================
try {
    $xboxApps = Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -eq "Store" } |
                Where-Object { $_.Name -match "Minecraft|Forza|Halo|SeaOfThieves|StateOfDecay|FlightSimulator" }
    foreach ($app in $xboxApps) {
        $games += @{
            name = $app.Name.Split(".")[-1]
            platform = "Xbox/MS Store"
            exePath = "ms-xbl-$($app.PackageFamilyName)"
            installDir = $app.InstallLocation
            size = 0
        }
        Write-Host "  [Xbox] $($app.Name.Split('.')[-1])" -ForegroundColor Green
    }
} catch {}

# ==================== GENERIC SCAN ====================
$genericPaths = @(
    "C:\Program Files",
    "C:\Program Files (x86)",
    "D:\Games",
    "E:\Games"
)

$knownGames = @{
    "Minecraft" = "Minecraft*Launcher.exe"
    "Roblox" = "RobloxPlayerBeta.exe"
    "Genshin Impact" = "GenshinImpact.exe"
}

foreach ($gPath in $genericPaths) {
    if (Test-Path $gPath) {
        foreach ($known in $knownGames.GetEnumerator()) {
            $found = Get-ChildItem $gPath -Filter $known.Value -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found -and ($games | Where-Object { $_.name -eq $known.Key }).Count -eq 0) {
                $games += @{
                    name = $known.Key
                    platform = "Standalone"
                    exePath = $found.FullName
                    installDir = Split-Path $found.FullName -Parent
                    size = 0
                }
                Write-Host "  [Found] $($known.Key)" -ForegroundColor White
            }
        }
    }
}

# ==================== OUTPUT ====================
Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "  Found $($games.Count) games!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""

# Save to JSON
$outputPath = "$PSScriptRoot\detected_games.json"
$games | ConvertTo-Json -Depth 5 | Out-File $outputPath -Encoding UTF8
Write-Host "Saved to: $outputPath" -ForegroundColor Gray

# Also output to console
$games | ForEach-Object {
    Write-Host "  $($_.name) [$($_.platform)]" -ForegroundColor White -NoNewline
    Write-Host " -> $($_.exePath)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Copy detected_games.json to the admin panel to auto-configure PCs" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
