// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA MULTIPLAYER — PeerJS P2P + Firebase matchmaking
// Firebase: 'ninja-arena-matches' collection for lobby
// PeerJS: tries LAN server (port 9000) then falls back to PeerJS cloud
// ═══════════════════════════════════════════════════════════════════════════════

import type { InputState } from './NinjaArenaEngine';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, onSnapshot, doc, updateDoc,
  query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';

export interface MatchDoc {
  id?: string;
  hostId: string;
  hostName: string;
  hostPeerId: string;
  status: 'waiting' | 'matched' | 'ended';
  guestId?: string;
  guestName?: string;
  guestPeerId?: string;
  createdAt: number;
}

export type MultiplayerEvent =
  | { type: 'waiting' }
  | { type: 'matched'; isHost: boolean; opponentName: string }
  | { type: 'remoteInput'; input: InputState }
  | { type: 'opponentLeft' }
  | { type: 'connected' }
  | { type: 'error'; message: string };

// ══════════════════════════════════════════════════════════════════════════════

export class NinjaArenaMultiplayer {
  private peer: any = null;
  private conn: any = null;
  private matchDocId: string | null = null;
  private unsubMatch: (() => void) | null = null;
  private isHost = false;
  private seq = 0;

  constructor(private onEvent: (e: MultiplayerEvent) => void) {}

  // ── Matchmaking ───────────────────────────────────────────────────────────

  async findMatch(playerId: string, playerName: string) {
    try {
      // Look for an open match
      const q = query(
        collection(db, 'ninja-arena-matches'),
        where('status', '==', 'waiting'),
        orderBy('createdAt', 'asc'),
        limit(1),
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        await this.joinMatch(snap.docs[0].id, snap.docs[0].data() as MatchDoc, playerId, playerName);
      } else {
        await this.hostMatch(playerId, playerName);
      }
    } catch (err: any) {
      this.onEvent({ type: 'error', message: err?.message ?? 'Matchmaking failed' });
    }
  }

  private async hostMatch(playerId: string, playerName: string) {
    const peerId = await this.initPeer(true);

    const docRef = await addDoc(collection(db, 'ninja-arena-matches'), {
      hostId: playerId,
      hostName: playerName,
      hostPeerId: peerId,
      status: 'waiting',
      createdAt: Date.now(),
    } satisfies Omit<MatchDoc, 'id'>);

    this.matchDocId = docRef.id;
    this.isHost = true;
    this.onEvent({ type: 'waiting' });

    // Watch for guest joining
    this.unsubMatch = onSnapshot(doc(db, 'ninja-arena-matches', docRef.id), (snap) => {
      const data = snap.data() as MatchDoc;
      if (data?.status === 'matched' && data.guestPeerId && !this.conn) {
        this.unsubMatch?.();
        this.connectToPeer(data.guestPeerId).then(() => {
          this.onEvent({ type: 'matched', isHost: true, opponentName: data.guestName ?? 'Opponent' });
        }).catch(() => {
          this.onEvent({ type: 'error', message: 'P2P connection failed' });
        });
      }
    });
  }

  private async joinMatch(matchId: string, matchData: MatchDoc, playerId: string, playerName: string) {
    const peerId = await this.initPeer(false);

    await updateDoc(doc(db, 'ninja-arena-matches', matchId), {
      status: 'matched',
      guestId: playerId,
      guestName: playerName,
      guestPeerId: peerId,
    });

    this.matchDocId = matchId;
    this.isHost = false;

    await this.connectToPeer(matchData.hostPeerId);
    this.onEvent({ type: 'matched', isHost: false, opponentName: matchData.hostName });
  }

  // ── PeerJS ────────────────────────────────────────────────────────────────

  private async initPeer(acceptIncoming: boolean): Promise<string> {
    const { Peer } = await import('peerjs');

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (id: string) => { if (!settled) { settled = true; resolve(id); } };
      const fail = (e: any) => { if (!settled) { settled = true; reject(e); } };

      // Try LAN PeerJS server first
      const tryLan = () => {
        try {
          const lanPeer = new Peer({
            host: window.location.hostname,
            port: 9000,
            path: '/peerjs',
            debug: 0,
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
          });
          this.peer = lanPeer;
          lanPeer.on('open', (id: string) => {
            if (acceptIncoming) lanPeer.on('connection', (c: any) => this.setupConn(c));
            done(id);
          });
          lanPeer.on('error', () => {
            // Fallback to PeerJS cloud
            lanPeer.destroy();
            tryCloud();
          });
        } catch { tryCloud(); }
      };

      // Fallback: public PeerJS cloud
      const tryCloud = () => {
        try {
          const cloudPeer = new Peer({
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
          });
          this.peer = cloudPeer;
          cloudPeer.on('open', (id: string) => {
            if (acceptIncoming) cloudPeer.on('connection', (c: any) => this.setupConn(c));
            done(id);
          });
          cloudPeer.on('error', fail);
          setTimeout(() => fail(new Error('Peer timeout')), 12000);
        } catch (e) { fail(e); }
      };

      tryLan();
    });
  }

  private async connectToPeer(remotePeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(remotePeerId, { reliable: false, serialization: 'json' });
      this.setupConn(conn);
      conn.on('open', () => { this.onEvent({ type: 'connected' }); resolve(); });
      conn.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 12000);
    });
  }

  private setupConn(conn: any) {
    this.conn = conn;
    conn.on('data', (data: any) => {
      if (data?.type === 'input') {
        this.onEvent({ type: 'remoteInput', input: data.input });
      }
    });
    conn.on('close', () => this.onEvent({ type: 'opponentLeft' }));
    conn.on('error', () => this.onEvent({ type: 'opponentLeft' }));
  }

  // ── In-game ───────────────────────────────────────────────────────────────

  sendInput(input: InputState) {
    if (!this.conn?.open) return;
    try {
      this.conn.send({ type: 'input', seq: this.seq++, input });
    } catch {}
  }

  getIsHost() { return this.isHost; }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async cleanup() {
    this.unsubMatch?.();
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    if (this.matchDocId) {
      try {
        await updateDoc(doc(db, 'ninja-arena-matches', this.matchDocId), { status: 'ended' });
      } catch {}
    }
    this.conn = null;
    this.peer = null;
    this.matchDocId = null;
  }
}
