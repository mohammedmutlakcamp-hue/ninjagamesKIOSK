import { NextRequest, NextResponse } from 'next/server';

// Uses Henrik's Valorant API (free tier: 30 req/min)
// Docs: https://docs.henrikdev.xyz/valorant
const HENRIK_API_KEY = process.env.HENRIK_API_KEY || '';
const BASE_URL = 'https://api.henrikdev.xyz/valorant';

function headers() {
  const h: Record<string, string> = { 'Accept': 'application/json' };
  if (HENRIK_API_KEY) h['Authorization'] = HENRIK_API_KEY;
  return h;
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  const tag = req.nextUrl.searchParams.get('tag');
  const region = req.nextUrl.searchParams.get('region') || 'eu';

  if (!name || !tag) {
    return NextResponse.json({ error: 'Missing name or tag (e.g. Player#1234)' }, { status: 400 });
  }

  try {
    // Get account info
    const accountRes = await fetch(`${BASE_URL}/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers: headers() });
    if (!accountRes.ok) {
      return NextResponse.json({ error: 'Valorant account not found' }, { status: 404 });
    }
    const accountData = await accountRes.json();
    const account = accountData?.data;

    // Get MMR/rank info
    const mmrRes = await fetch(`${BASE_URL}/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers: headers() });
    const mmrData = mmrRes.ok ? await mmrRes.json() : null;

    // Get recent matches for stats
    const matchesRes = await fetch(`${BASE_URL}/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=10`, { headers: headers() });
    const matchesData = matchesRes.ok ? await matchesRes.json() : null;

    // Aggregate stats from recent matches
    let kills = 0, deaths = 0, headshots = 0, wins = 0, gamesPlayed = 0;

    if (matchesData?.data) {
      for (const match of matchesData.data) {
        const players = match?.players?.all_players || [];
        const me = players.find((p: any) =>
          p.name?.toLowerCase() === name.toLowerCase() && p.tag?.toLowerCase() === tag.toLowerCase()
        );
        if (me) {
          kills += me.stats?.kills || 0;
          deaths += me.stats?.deaths || 0;
          headshots += me.stats?.headshots || 0;
          gamesPlayed++;

          // Check if won
          const myTeam = me.team?.toLowerCase();
          const teams = match?.teams;
          if (teams && myTeam && teams[myTeam]?.has_won) {
            wins++;
          }
        }
      }
    }

    return NextResponse.json({
      game: 'valorant',
      account: {
        name: account?.name,
        tag: account?.tag,
        level: account?.account_level,
        card: account?.card?.small,
      },
      rank: mmrData?.data?.current_data ? {
        tier: mmrData.data.current_data.currenttierpatched,
        rr: mmrData.data.current_data.ranking_in_tier,
        elo: mmrData.data.current_data.elo,
      } : null,
      stats: {
        kills,
        deaths,
        headshots,
        wins,
        gamesPlayed,
        hoursPlayed: 0,
      },
      recentMatches: gamesPlayed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
