// ═══════════════════════════════════════════════════════════════════
//  Install sources — how to install each game in the catalog.
// ───────────────────────────────────────────────────────────────────
//  Used by RemoteInstallPanel + GameReportPanel.
//
//    steam   — silent install via  steam://install/<appid>
//    epic    — opens Epic Games Launcher store page
//    url     — opens the game's download page in the default browser
// ═══════════════════════════════════════════════════════════════════

export type InstallSource =
  | { type: 'steam'; appid: number }
  | { type: 'epic';  slug: string }
  | { type: 'url';   url: string };

export const INSTALL_SOURCES: Record<string, InstallSource> = {
  // Steam (silent install if user is logged into Steam)
  csgo:          { type: 'steam', appid: 730 },
  overwatch2:    { type: 'steam', appid: 2357570 },
  rust:          { type: 'steam', appid: 252490 },
  dota2:         { type: 'steam', appid: 570 },
  hogwarts:      { type: 'steam', appid: 990080 },
  pubg:          { type: 'steam', appid: 578080 },
  apex:          { type: 'steam', appid: 1172470 },
  gtav:          { type: 'steam', appid: 271590 },
  rdr2:          { type: 'steam', appid: 1174180 },
  cyberpunk:     { type: 'steam', appid: 1091500 },
  eldenring:     { type: 'steam', appid: 1245620 },
  bg3:           { type: 'steam', appid: 1086940 },
  destiny2:      { type: 'steam', appid: 1085660 },
  forza5:        { type: 'steam', appid: 1551360 },
  sf6:           { type: 'steam', appid: 1364780 },
  tekken8:       { type: 'steam', appid: 1778820 },
  mk1:           { type: 'steam', appid: 1971870 },
  amongus:       { type: 'steam', appid: 945360 },
  ittakestwo:    { type: 'steam', appid: 1426210 },
  lethalcompany: { type: 'steam', appid: 1966720 },
  palworld:      { type: 'steam', appid: 1623730 },
  thefinals:     { type: 'steam', appid: 2073850 },
  deadlock:      { type: 'steam', appid: 1422450 },
  marvelrivals:  { type: 'steam', appid: 2767030 },

  // Epic-only — opens Epic Games Launcher store page
  fortnite:      { type: 'epic',  slug: 'fortnite' },
  rocketleague:  { type: 'epic',  slug: 'rocket-league' },
  fallguys:      { type: 'epic',  slug: 'fall-guys' },
  asphalt:       { type: 'epic',  slug: 'asphalt-legends-unite' },

  // Direct download / Riot installer / launcher links
  valorant:      { type: 'url',   url: 'https://playvalorant.com/download/' },
  lol:           { type: 'url',   url: 'https://signup.leagueoflegends.com/en/signup/redownload' },
  fivem:         { type: 'url',   url: 'https://fivem.net/' },
  diablo4:       { type: 'url',   url: 'https://us.battle.net/download/getInstaller?os=win&installer=Diablo-IV-Setup.exe' },
  warzone:       { type: 'url',   url: 'https://us.battle.net/download/getInstaller?os=win&installer=Battle.net-Setup.exe' },
  bo6:           { type: 'url',   url: 'https://us.battle.net/download/getInstaller?os=win&installer=Battle.net-Setup.exe' },
  freefire:      { type: 'url',   url: 'https://www.bluestacks.com/download.html' },
  minecraft:     { type: 'url',   url: 'https://tlauncher.org/en/' },
  generals:      { type: 'url',   url: 'https://www.ea.com/games/command-and-conquer/command-and-conquer-the-ultimate-collection' },
  zerohour:      { type: 'url',   url: 'https://www.ea.com/games/command-and-conquer/command-and-conquer-the-ultimate-collection' },
  fifa25:        { type: 'url',   url: 'https://www.ea.com/games/ea-sports-fc/fc-25/buy' },
  awayout:       { type: 'url',   url: 'https://www.ea.com/games/a-way-out' },
  genshin:       { type: 'url',   url: 'https://genshin.hoyoverse.com/en/download' },
  roblox:        { type: 'url',   url: 'https://www.roblox.com/download/client' },
};

export const SOURCE_BADGE: Record<InstallSource['type'], { label: string; color: string }> = {
  steam: { label: 'STEAM',   color: '#1b2838' },
  epic:  { label: 'EPIC',    color: '#2a2a2a' },
  url:   { label: 'BROWSER', color: '#6b7280' },
};

export function buildInstallShellCommand(src: InstallSource): string {
  if (src.type === 'steam') return `start steam://install/${src.appid}`;
  if (src.type === 'epic')  return `start com.epicgames.launcher://store/p/${src.slug}`;
  return `start "" "${src.url.replace(/"/g, '%22')}"`;
}
