// ═══════════════════════════════════════════════════════════════════
//  PC status — ONE source of truth for online/offline detection.
// ───────────────────────────────────────────────────────────────────
//  Used by every admin panel that needs to know whether a kiosk PC is
//  reachable: PCManagement, GameReportPanel, RemoteInstallPanel,
//  GameUpdatePusher. Don't reimplement this logic anywhere — import.
//
//  How a PC's heartbeat lands in Firestore:
//    The C# kiosk client (NinjaKiosk MainWindow.xaml.cs) calls
//    FirestoreService.SendHeartbeatAsync every 30 s. That writes
//    `pcs/{id}.lastSeen` as a Firestore Timestamp + `online: true`.
//    On clean shutdown it writes `online: false`.
//
//  Online definition:
//    lastSeen heartbeat within ONLINE_WINDOW_MS (90 s by default —
//    3× the heartbeat interval so brief network blips don't flap the
//    UI). Falls back to the legacy `lastHeartbeat` number field for
//    any old PC docs still using it.
// ═══════════════════════════════════════════════════════════════════

export const ONLINE_WINDOW_MS = 90_000; // 90 s = 3× heartbeat interval

// Convert anything heartbeat-shaped (Firestore Timestamp object, REST
// API Timestamp shape, ISO string, or plain millisecond number) → ms.
// Returns 0 when nothing parseable.
export function tsToMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const t = Date.parse(ts);
    return isNaN(t) ? 0 : t;
  }
  if (typeof ts === 'object') {
    // Firestore SDK Timestamp instance
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    // { seconds, nanoseconds } shape
    if ('seconds' in ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
    // REST shape — { integerValue: "1234" } or nested .timestampValue
    if (ts.integerValue) return Number(ts.integerValue);
    if (ts.timestampValue) {
      const t = Date.parse(ts.timestampValue);
      return isNaN(t) ? 0 : t;
    }
  }
  return 0;
}

// The latest heartbeat timestamp (ms) for a PC, regardless of which
// field shape the kiosk client wrote.
export function pcLastSeenMs(pc: any): number {
  if (!pc) return 0;
  return tsToMs(pc.lastSeen) || tsToMs(pc.lastHeartbeat) || 0;
}

// PC is online if its heartbeat is fresh. We don't trust the explicit
// `online` boolean alone — kiosks that hard-crash never get to flip it
// to false, so the stale heartbeat is the only reliable signal.
export function pcIsOnline(pc: any): boolean {
  const ms = pcLastSeenMs(pc);
  if (!ms) return false;
  return Date.now() - ms < ONLINE_WINDOW_MS;
}

// Human-readable "last seen" string for the admin UI.
export function pcLastSeenLabel(pc: any): string {
  const ms = pcLastSeenMs(pc);
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Compact status descriptor for badges. Kept here so every panel uses
// the same labels / colors.
export type PCStatusKind = 'online' | 'occupied' | 'free' | 'offline';
export function pcStatusKind(pc: any): PCStatusKind {
  if (!pcIsOnline(pc)) return 'offline';
  const status = (pc?.status || '').toLowerCase();
  if (status === 'occupied') return 'occupied';
  if (status === 'offline') return 'offline'; // explicit offline status overrides heartbeat
  return 'free';
}

// ─── Player-side liveness ───────────────────────────────────────────
// Shorter window than PCs because a logged-in player heartbeats from
// the kiosk dashboard every 30 s. 2 minutes = 4× that interval —
// tolerates one missed beat plus a short network hiccup, but doesn't
// keep ghost players in the friends list for half an hour.
//
// Why we don't trust onlineStatus.isOnline alone: kiosks that hard-crash,
// lose power, or get force-shut-down never get to flip the boolean back,
// so the player shows as "In lobby" forever. The only reliable signal
// is the heartbeat freshness.
export const PLAYER_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function playerLastSeenMs(player: any): number {
  if (!player) return 0;
  return tsToMs(player?.onlineStatus?.lastSeen)
      || tsToMs(player?.lastSeen)
      || 0;
}

export function playerIsOnline(player: any): boolean {
  if (!player?.onlineStatus?.isOnline) return false;
  const ms = playerLastSeenMs(player);
  if (!ms) return false;
  return Date.now() - ms < PLAYER_ONLINE_WINDOW_MS;
}

// Same liveness check given a (isOnlineFlag, lastSeen) pair — useful
// when the caller already destructured the player doc.
export function isLivePlayer(isOnlineFlag: any, lastSeen: any): boolean {
  if (!isOnlineFlag) return false;
  const ms = tsToMs(lastSeen);
  if (!ms) return false;
  return Date.now() - ms < PLAYER_ONLINE_WINDOW_MS;
}
