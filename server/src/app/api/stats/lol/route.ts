import { NextRequest, NextResponse } from 'next/server';

// Uses Riot's community Dragon API + ddragon for basic info
// For full stats, uses the Riot API (requires key)
const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const REGION = 'euw1'; // Default region, can be overridden

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  const tag = req.nextUrl.searchParams.get('tag');
  const region = req.nextUrl.searchParams.get('region') || REGION;

  if (!name || !tag) {
    return NextResponse.json({ error: 'Missing name or tag (Riot ID)' }, { status: 400 });
  }

  if (!RIOT_API_KEY) {
    return NextResponse.json({ error: 'Riot API key not configured' }, { status: 500 });
  }

  try {
    // Step 1: Get PUUID from Riot ID
    const accountRes = await fetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    if (!accountRes.ok) {
      return NextResponse.json({ error: 'Riot account not found' }, { status: 404 });
    }

    const account = await accountRes.json();
    const puuid = account.puuid;

    // Step 2: Get summoner info
    const summonerRes = await fetch(
      `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );
    const summoner = summonerRes.ok ? await summonerRes.json() : null;

    // Step 3: Get ranked stats
    const rankedRes = await fetch(
      `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summoner?.id}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );
    const rankedData = rankedRes.ok ? await rankedRes.json() : [];
    const soloQ = rankedData.find((q: any) => q.queueType === 'RANKED_SOLO_5x5');

    // Step 4: Get recent match IDs
    const matchIdsRes = await fetch(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );
    const matchIds = matchIdsRes.ok ? await matchIdsRes.json() : [];

    // Step 5: Fetch match details and aggregate stats
    let kills = 0, deaths = 0, wins = 0, gamesPlayed = 0;

    // Fetch up to 5 matches to avoid rate limits
    const matchesToFetch = matchIds.slice(0, 5);
    for (const matchId of matchesToFetch) {
      try {
        const matchRes = await fetch(
          `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
          { headers: { 'X-Riot-Token': RIOT_API_KEY } }
        );
        if (!matchRes.ok) continue;
        const match = await matchRes.json();
        const me = match?.info?.participants?.find((p: any) => p.puuid === puuid);
        if (me) {
          kills += me.kills || 0;
          deaths += me.deaths || 0;
          if (me.win) wins++;
          gamesPlayed++;
        }
      } catch {
        // Skip failed match fetches
      }
    }

    return NextResponse.json({
      game: 'lol',
      account: {
        name: account.gameName,
        tag: account.tagLine,
        level: summoner?.summonerLevel,
      },
      rank: soloQ ? {
        tier: `${soloQ.tier} ${soloQ.rank}`,
        lp: soloQ.leaguePoints,
        wins: soloQ.wins,
        losses: soloQ.losses,
        winRate: Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100),
      } : null,
      stats: {
        kills,
        deaths,
        headshots: 0,
        wins,
        gamesPlayed,
        hoursPlayed: 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
