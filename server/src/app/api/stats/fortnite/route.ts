import { NextRequest, NextResponse } from 'next/server';

// Uses fortnite-api.com (free, no key required for basic stats)
const FORTNITE_API_KEY = process.env.FORTNITE_API_KEY || '';
const BASE_URL = 'https://fortnite-api.com/v2/stats/br/v2';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {};
    if (FORTNITE_API_KEY) headers['Authorization'] = FORTNITE_API_KEY;

    const res = await fetch(`${BASE_URL}?name=${encodeURIComponent(username)}`, { headers });

    if (!res.ok) {
      if (res.status === 403) {
        return NextResponse.json({ error: 'Fortnite stats are private. Enable in game settings.' }, { status: 403 });
      }
      if (res.status === 404) {
        return NextResponse.json({ error: 'Fortnite player not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch Fortnite stats' }, { status: res.status });
    }

    const data = await res.json();
    const overall = data?.data?.stats?.all?.overall;

    if (!overall) {
      return NextResponse.json({ error: 'No stats available (might be private)' }, { status: 404 });
    }

    return NextResponse.json({
      game: 'fortnite',
      account: {
        name: data?.data?.account?.name,
        level: data?.data?.battlePass?.level,
      },
      stats: {
        kills: overall.kills || 0,
        deaths: overall.deaths || 0,
        headshots: 0, // Fortnite API doesn't expose headshot count
        wins: overall.wins || 0,
        gamesPlayed: overall.matches || 0,
        hoursPlayed: Math.round((overall.minutesPlayed || 0) / 60),
        kd: overall.kd || 0,
        winRate: overall.winRate || 0,
        top10: overall.top10 || 0,
        top25: overall.top25 || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
