import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import { Player, LinkedAccounts } from '@/types';

interface FetchedStats {
  kills: number;
  deaths: number;
  headshots: number;
  wins: number;
  gamesPlayed: number;
  hoursPlayed: number;
}

interface SyncResult {
  game: string;
  success: boolean;
  stats?: FetchedStats;
  rank?: any;
  error?: string;
}

// Fetch stats from our API routes
async function fetchSteamStats(steamId: string, gameId: string): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/stats/steam?steamId=${steamId}&gameId=${gameId}`);
    const data = await res.json();
    if (!res.ok) return { game: gameId, success: false, error: data.error };
    return { game: gameId, success: true, stats: data.stats };
  } catch (err: any) {
    return { game: gameId, success: false, error: err.message };
  }
}

async function fetchValorantStats(name: string, tag: string): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/stats/valorant?name=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
    const data = await res.json();
    if (!res.ok) return { game: 'valorant', success: false, error: data.error };
    return { game: 'valorant', success: true, stats: data.stats, rank: data.rank };
  } catch (err: any) {
    return { game: 'valorant', success: false, error: err.message };
  }
}

async function fetchFortniteStats(username: string): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/stats/fortnite?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    if (!res.ok) return { game: 'fortnite', success: false, error: data.error };
    return { game: 'fortnite', success: true, stats: data.stats };
  } catch (err: any) {
    return { game: 'fortnite', success: false, error: err.message };
  }
}

async function fetchLoLStats(name: string, tag: string): Promise<SyncResult> {
  try {
    const res = await fetch(`/api/stats/lol?name=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
    const data = await res.json();
    if (!res.ok) return { game: 'lol', success: false, error: data.error };
    return { game: 'lol', success: true, stats: data.stats, rank: data.rank };
  } catch (err: any) {
    return { game: 'lol', success: false, error: err.message };
  }
}

// Write fetched stats to Firebase (replaces per-game stats, not manual reports)
async function writeStatsToFirebase(playerId: string, gameId: string, stats: FetchedStats) {
  const ref = doc(db, 'players', playerId);
  await updateDoc(ref, {
    [`stats.gameStats.${gameId}.kills`]: stats.kills,
    [`stats.gameStats.${gameId}.deaths`]: stats.deaths,
    [`stats.gameStats.${gameId}.headshots`]: stats.headshots,
    [`stats.gameStats.${gameId}.wins`]: stats.wins,
    [`stats.gameStats.${gameId}.hoursPlayed`]: stats.hoursPlayed,
    [`stats.gameStats.${gameId}.lastPlayed`]: Date.now(),
    lastStatSync: Date.now(),
  });
}

// Recalculate totals from all per-game stats
async function recalcTotals(playerId: string, allGameStats: Record<string, FetchedStats>) {
  let totalKills = 0, totalDeaths = 0, totalHeadshots = 0, totalWins = 0;

  for (const stats of Object.values(allGameStats)) {
    totalKills += stats.kills || 0;
    totalDeaths += stats.deaths || 0;
    totalHeadshots += stats.headshots || 0;
    totalWins += stats.wins || 0;
  }

  const ref = doc(db, 'players', playerId);
  await updateDoc(ref, {
    'stats.totalKills': totalKills,
    'stats.totalDeaths': totalDeaths,
    'stats.totalHeadshots': totalHeadshots,
    'stats.totalWins': totalWins,
  });
}

// Main sync function — syncs all linked accounts
export async function syncAllStats(player: Player): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const accounts = player.linkedAccounts;
  if (!accounts) return results;

  const allGameStats: Record<string, FetchedStats> = {};

  // Steam games (CS2, Dota 2, Rust)
  if (accounts.steam?.steamId) {
    const steamGames = ['csgo', 'dota2'];
    for (const gameId of steamGames) {
      const result = await fetchSteamStats(accounts.steam.steamId, gameId);
      results.push(result);
      if (result.success && result.stats) {
        await writeStatsToFirebase(player.uid, gameId, result.stats);
        allGameStats[gameId] = result.stats;
      }
    }
  }

  // Valorant
  if (accounts.riot?.gameName && accounts.riot?.tagLine) {
    const result = await fetchValorantStats(accounts.riot.gameName, accounts.riot.tagLine);
    results.push(result);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, 'valorant', result.stats);
      allGameStats['valorant'] = result.stats;
    }
  }

  // Fortnite
  if (accounts.epic?.username) {
    const result = await fetchFortniteStats(accounts.epic.username);
    results.push(result);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, 'fortnite', result.stats);
      allGameStats['fortnite'] = result.stats;
    }
  }

  // LoL (uses same Riot account)
  if (accounts.riot?.gameName && accounts.riot?.tagLine) {
    const result = await fetchLoLStats(accounts.riot.gameName, accounts.riot.tagLine);
    results.push(result);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, 'lol', result.stats);
      allGameStats['lol'] = result.stats;
    }
  }

  // Recalculate totals
  if (Object.keys(allGameStats).length > 0) {
    // Merge with existing manual stats
    const existing = player.stats?.gameStats || {};
    const merged = { ...existing };
    for (const [gameId, stats] of Object.entries(allGameStats)) {
      merged[gameId] = stats as any;
    }
    await recalcTotals(player.uid, merged as unknown as Record<string, FetchedStats>);
  }

  return results;
}

// Sync a single game
export async function syncGameStats(player: Player, gameId: string): Promise<SyncResult> {
  const accounts = player.linkedAccounts;

  if (gameId === 'csgo' || gameId === 'dota2') {
    if (!accounts?.steam?.steamId) return { game: gameId, success: false, error: 'Steam not linked' };
    const result = await fetchSteamStats(accounts.steam.steamId, gameId);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, gameId, result.stats);
    }
    return result;
  }

  if (gameId === 'valorant') {
    if (!accounts?.riot) return { game: gameId, success: false, error: 'Riot not linked' };
    const result = await fetchValorantStats(accounts.riot.gameName, accounts.riot.tagLine);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, gameId, result.stats);
    }
    return result;
  }

  if (gameId === 'fortnite') {
    if (!accounts?.epic) return { game: gameId, success: false, error: 'Epic not linked' };
    const result = await fetchFortniteStats(accounts.epic.username);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, gameId, result.stats);
    }
    return result;
  }

  if (gameId === 'lol') {
    if (!accounts?.riot) return { game: gameId, success: false, error: 'Riot not linked' };
    const result = await fetchLoLStats(accounts.riot.gameName, accounts.riot.tagLine);
    if (result.success && result.stats) {
      await writeStatsToFirebase(player.uid, gameId, result.stats);
    }
    return result;
  }

  return { game: gameId, success: false, error: 'No API available for this game' };
}

// Resolve Steam vanity URL to Steam ID
export async function resolveSteamId(vanityUrl: string): Promise<{ steamId?: string; username?: string; error?: string }> {
  try {
    const res = await fetch('/api/stats/steam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vanityUrl }),
    });
    return await res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

// Link account to player profile in Firebase
export async function linkAccount(playerId: string, platform: keyof LinkedAccounts, data: any) {
  const ref = doc(db, 'players', playerId);
  await updateDoc(ref, { [`linkedAccounts.${platform}`]: data });
}

// Unlink account
export async function unlinkAccount(playerId: string, platform: keyof LinkedAccounts) {
  const ref = doc(db, 'players', playerId);
  await updateDoc(ref, { [`linkedAccounts.${platform}`]: null });
}
