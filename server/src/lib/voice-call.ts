/**
 * VoiceCallManager — PeerJS-based voice call system with Firebase signaling.
 * Signaling collection: 'voice-calls'
 * PeerJS server: port 9000, path /peerjs
 */

import { db } from './firebase';
import {
  collection, addDoc, doc, updateDoc, onSnapshot,
  query, where, Unsubscribe,
} from 'firebase/firestore';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface VoiceCallData {
  id: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  callerPeerId: string;
  status: 'ringing' | 'connected' | 'ended' | 'declined';
  timestamp: number;
}

// ─── Remote audio element (singleton) ───────────────────────────────────────

let remoteAudio: HTMLAudioElement | null = null;

function getRemoteAudio(): HTMLAudioElement {
  if (!remoteAudio) {
    remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.style.display = 'none';
    document.body.appendChild(remoteAudio);
  }
  return remoteAudio;
}

// ─── Ringtone via Web Audio API ──────────────────────────────────────────────

function createRingtone(type: 'ring' | 'dial'): { stop: () => void } | null {
  if (typeof window === 'undefined') return null;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'ring' ? 440 : 480;
    gain.gain.value = 0.12;
    const now = ctx.currentTime;
    for (let i = 0; i < 60; i++) {
      gain.gain.setValueAtTime(0.12, now + i * 1.5);
      gain.gain.setValueAtTime(0, now + i * 1.5 + 0.8);
    }
    osc.start();
    return { stop: () => { try { osc.stop(); ctx.close(); } catch {} } };
  } catch {
    return null;
  }
}

// ─── VoiceCallManager ────────────────────────────────────────────────────────

export class VoiceCallManager {
  private peer: any = null; // Peer instance (loaded dynamically)
  private localStream: MediaStream | null = null;
  private currentMediaCall: any = null; // PeerJS MediaConnection
  private callDocId: string | null = null;
  private callUnsub: Unsubscribe | null = null;
  private incomingUnsub: Unsubscribe | null = null;
  private ringtone: { stop: () => void } | null = null;
  private _state: CallState = 'idle';
  private _myPeerId: string | null = null;

  // ── Callbacks (set by VoiceCallProvider) ──────────────────────────────────
  onStateChange?: (state: CallState, call?: VoiceCallData) => void;
  onIncomingCall?: (callData: VoiceCallData) => void;
  onError?: (msg: string) => void;

  get state() { return this._state; }
  get myPeerId() { return this._myPeerId; }

  private setState(state: CallState, call?: VoiceCallData) {
    this._state = state;
    this.onStateChange?.(state, call);
  }

  // ── Initialize PeerJS peer ────────────────────────────────────────────────
  async initialize(userId: string): Promise<string> {
    // Lazy-load peerjs (client-side only)
    const { default: Peer } = await import('peerjs');

    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }

    const peerId = `ninja-${userId.slice(0, 8)}-${Date.now()}`;

    return new Promise<string>((resolve, reject) => {
      // Determine PeerJS server host — use LAN server IP for both PC and mobile
      const host = window.location.hostname;

      const peer = new Peer(peerId, {
        host,
        port: 9000,
        path: '/peerjs',
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      this.peer = peer;

      peer.on('open', (id: string) => {
        this._myPeerId = id;
        console.log('[VOICE] Peer ready:', id);
        resolve(id);
      });

      peer.on('error', (err: Error) => {
        console.error('[VOICE] Peer error:', err);
        this.onError?.(err.message);
        reject(err);
      });

      peer.on('disconnected', () => {
        console.warn('[VOICE] Peer disconnected, reconnecting...');
        try { peer.reconnect(); } catch {}
      });

      // Receive PeerJS media calls (from the answering side calling back)
      peer.on('call', (mediaCall: any) => {
        this.currentMediaCall = mediaCall;
        if (this.localStream) {
          mediaCall.answer(this.localStream);
        }
        mediaCall.on('stream', (remote: MediaStream) => {
          this.playRemote(remote);
          this.ringtone?.stop();
          this.ringtone = null;
        });
        mediaCall.on('close', () => this.handleHangup());
        mediaCall.on('error', (e: Error) => console.error('[VOICE] call error:', e));
      });
    });
  }

  // ── Start outgoing call ───────────────────────────────────────────────────
  async startCall(
    callerId: string,
    callerName: string,
    receiverId: string,
    receiverName: string,
  ): Promise<void> {
    if (!this._myPeerId) throw new Error('Peer not initialized');
    if (this._state !== 'idle') return;

    try {
      this.setState('calling');

      // Write signaling doc to Firebase
      const ref = await addDoc(collection(db, 'voice-calls'), {
        callerId,
        callerName,
        receiverId,
        receiverName,
        callerPeerId: this._myPeerId,
        status: 'ringing',
        timestamp: Date.now(),
      });
      this.callDocId = ref.id;
      this.setState('ringing');

      // Acquire microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Play dial tone
      this.ringtone = createRingtone('dial');

      // Watch for status changes (accepted / declined / ended)
      this.callUnsub = onSnapshot(doc(db, 'voice-calls', ref.id), (snap) => {
        const data = snap.data() as VoiceCallData | undefined;
        if (!data) return;
        if (data.status === 'connected') {
          this.ringtone?.stop();
          this.ringtone = null;
          // Receiver will peer.call() us — we receive in peer.on('call')
        }
        if (data.status === 'declined' || data.status === 'ended') {
          this.ringtone?.stop();
          this.ringtone = null;
          this.cleanup(false);
          this.setState('ended');
          setTimeout(() => this.setState('idle'), 1500);
        }
      });
    } catch (err: any) {
      console.error('[VOICE] startCall failed:', err);
      this.onError?.(err.message || 'Could not start call');
      this.cleanup(true);
      this.setState('idle');
    }
  }

  // ── Answer incoming call ──────────────────────────────────────────────────
  async answerCall(callData: VoiceCallData): Promise<void> {
    if (!this.peer) throw new Error('Peer not initialized');
    this.callDocId = callData.id;
    this.ringtone?.stop();
    this.ringtone = null;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Call the caller back via PeerJS — this triggers caller's peer.on('call')
      const mediaCall = this.peer.call(callData.callerPeerId, this.localStream);
      this.currentMediaCall = mediaCall;

      mediaCall.on('stream', (remote: MediaStream) => {
        this.playRemote(remote);
      });
      mediaCall.on('close', () => this.handleHangup());
      mediaCall.on('error', (e: Error) => console.error('[VOICE] answer call err:', e));

      // Update Firebase to 'connected'
      await updateDoc(doc(db, 'voice-calls', callData.id), { status: 'connected' });

      // Watch for end
      this.callUnsub = onSnapshot(doc(db, 'voice-calls', callData.id), (snap) => {
        const data = snap.data() as VoiceCallData | undefined;
        if (data?.status === 'ended') {
          this.cleanup(false);
          this.setState('ended');
          setTimeout(() => this.setState('idle'), 1500);
        }
      });

      this.setState('connected');
    } catch (err: any) {
      console.error('[VOICE] answerCall failed:', err);
      this.onError?.(err.message || 'Could not answer call');
      await updateDoc(doc(db, 'voice-calls', callData.id), { status: 'declined' }).catch(() => {});
      this.cleanup(false);
      this.setState('idle');
    }
  }

  // ── Decline incoming call ─────────────────────────────────────────────────
  async declineCall(callDocId: string): Promise<void> {
    this.ringtone?.stop();
    this.ringtone = null;
    await updateDoc(doc(db, 'voice-calls', callDocId), { status: 'declined' }).catch(() => {});
    this.setState('idle');
  }

  // ── End active call ───────────────────────────────────────────────────────
  async endCall(): Promise<void> {
    if (this.callDocId) {
      await updateDoc(doc(db, 'voice-calls', this.callDocId), {
        status: 'ended',
        endedAt: Date.now(),
      }).catch(() => {});
    }
    this.cleanup(false);
    this.setState('ended');
    setTimeout(() => this.setState('idle'), 1500);
  }

  // ── Mute/Unmute toggle — returns new isMuted value ────────────────────────
  toggleMute(): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    if (tracks.length === 0) return false;
    const newEnabled = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = newEnabled; });
    return !newEnabled; // isMuted = !enabled
  }

  // ── Speaker on/off — returns new isSpeakerOff value ──────────────────────
  toggleSpeaker(): boolean {
    const audio = getRemoteAudio();
    audio.muted = !audio.muted;
    return audio.muted;
  }

  // ── Listen for incoming calls for this user ───────────────────────────────
  listenForIncomingCalls(userId: string): Unsubscribe {
    const q = query(
      collection(db, 'voice-calls'),
      where('receiverId', '==', userId),
      where('status', '==', 'ringing'),
    );
    this.incomingUnsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = { id: change.doc.id, ...change.doc.data() } as VoiceCallData;
          this.ringtone?.stop();
          this.ringtone = createRingtone('ring');
          this.onIncomingCall?.(data);
        }
      });
    });
    return this.incomingUnsub;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private handleHangup() {
    if (this._state === 'connected' || this._state === 'calling' || this._state === 'ringing') {
      this.cleanup(false);
      this.setState('ended');
      setTimeout(() => this.setState('idle'), 1500);
    }
  }

  private playRemote(stream: MediaStream) {
    const audio = getRemoteAudio();
    audio.srcObject = stream;
    audio.play().catch((e) => console.error('[VOICE] play err:', e));
  }

  private cleanup(updateFirebase: boolean) {
    if (updateFirebase && this.callDocId) {
      updateDoc(doc(db, 'voice-calls', this.callDocId), { status: 'ended' }).catch(() => {});
    }
    this.callUnsub?.();
    this.callUnsub = null;
    this.callDocId = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try { this.currentMediaCall?.close(); } catch {}
    this.currentMediaCall = null;
    this.ringtone?.stop();
    this.ringtone = null;
    const audio = getRemoteAudio();
    audio.srcObject = null;
    audio.pause();
  }

  destroy() {
    this.incomingUnsub?.();
    this.incomingUnsub = null;
    this.cleanup(true);
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this._myPeerId = null;
  }
}
