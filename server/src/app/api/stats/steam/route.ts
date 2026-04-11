import { NextRequest, NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

// Steam App IDs
const APP_IDS: Record<string, number> = {
  csgo: 730,    // CS2
  dota2: 570,
  rust: 252490,
};

// CS2 stat name mappings from Steam API
const CS2_STAT_MAP: Record<string, string> = {
  'total_kills': 'kills',
  'total_deaths': 'deaths',
  'total_kills_headshot': 'headshots',
  'total_matches_won': 'wins',
  'total_matches_played': 'matches',
  'total_time_played': 'timePlayed',
};

export async function GET(req: NextRequest) {
  const steamId = req.nextUrl.searchParams.get('steamId');
  const gameId = req.nextUrl.searchParams.get('gameId');

  if (!steamId || !gameId) {
    return NextResponse.json({ error: 'Missing steamId or gameId' }, { status: 400 });
  }

  if (!STEAM_API_KEY) {
    return NextResponse.json({ error: 'Steam API key not configured' }, { status: 500 });
  }

  const appId = APP_IDS[gameId];
  if (!appId) {
    return NextResponse.json({ error: `Unsupported game: ${gameId}` }, { status: 400 });
  }

  try {
    // Fetch user stats for game
    const statsUrl = `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${steamId}`;
    const statsRes = await fetch(statsUrl);

    if (!statsRes.ok) {
      // Profile might be private
      if (statsRes.status === 403) {
        return NextResponse.json({ error: 'Steam profile is private. Set game details to public.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to fetch Steam stats' }, { status: statsRes.status });
    }

    const data = await statsRes.json();
    const rawStats = data?.playerstats?.stats || [];

    // Parse stats based on game
    if (gameId === 'csgo') {
      const parsed: Record<string, number> = {};
      for (const stat of rawStats) {
        const mapped = CS2_STAT_MAP[stat.name];
        if (mapped) parsed[mapped] = stat.value;
      }

      return NextResponse.json({
        game: 'csgo',
        stats: {
          kills: parsed.kills || 0,
          deaths: parsed.deaths || 0,
          headshots: parsed.headshots || 0,
          wins: parsed.wins || 0,
          gamesPlayed: parsed.matches || 0,
          hoursPlayed: Math.round((parsed.timePlayed || 0) / 3600),
        },
      });
    }

    if (gameId === 'dota2') {
      const parsed: Record<string, number> = {};
      for (const stat of rawStats) {
        parsed[stat.name] = stat.value;
      }
      return NextResponse.json({
        game: 'dota2',
        stats: {
          kills: parsed['kill'] || 0,
          deaths: parsed['death'] || 0,
          headshots: 0,
          wins: parsed['win'] || 0,
          gamesPlayed: (parsed['win'] || 0) + (parsed['lose'] || 0),
          hoursPlayed: 0,
        },
      });
    }

    // Generic response for other Steam games
    return NextResponse.json({ game: gameId, rawStats });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Resolve vanity URL to Steam ID
export async function POST(req: NextRequest) {
  if (!STEAM_API_KEY) {
    return NextResponse.json({ error: 'Steam API key not configured' }, { status: 500 });
  }

  const { vanityUrl } = await req.json();
  if (!vanityUrl) {
    return NextResponse.json({ error: 'Missing vanityUrl' }, { status: 400 });
  }

  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${vanityUrl}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data?.response?.success === 1) {
      // Also get profile info
      const profileUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${data.response.steamid}`;
      const profileRes = await fetch(profileUrl);
      const profileData = await profileRes.json();
      const player = profileData?.response?.players?.[0];

      return NextResponse.json({
        steamId: data.response.steamid,
        username: player?.personaname || vanityUrl,
        avatar: player?.avatarfull || '',
      });
    }

    return NextResponse.json({ error: 'Steam user not found' }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
