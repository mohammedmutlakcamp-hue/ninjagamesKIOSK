'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, doc, updateDoc, onSnapshot, getDoc, getDocs, deleteDoc, query, where
} from 'firebase/firestore';
import { Phone, PhoneOff, PhoneIncoming, PhoneCall, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

// ─── Config ─────────────────────────────────────────────────────────────────

// Kiosks connect to ninjagamesjo.com (cloud), so TURN must be publicly reachable.
// Using metered.ca's free public TURN (openrelay) — enough for gaming-cafe scale.
// For production scale, swap to your own TURN account (metered.ca paid / Twilio /
// Cloudflare) and keep the same shape.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceTransportPolicy: 'all',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface CallDoc {
  id: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  status: 'ringing' | 'active' | 'ended' | 'declined';
  offer?: { type: string; sdp: string };
  answer?: { type: string; sdp: string };
  startedAt: number;
  endedAt?: number;
}

interface Props {
  player: any;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function KioskVoiceCall({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  const [activeCall, setActiveCall] = useState<CallDoc | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallDoc | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callError, setCallError] = useState<string | null>(null);

  // WebRTC
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Listeners to cleanup
  const unsubsRef = useRef<(() => void)[]>([]);

  // Ringtone
  const ringRef = useRef<{ stop: () => void } | null>(null);

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    // Stop ringtone
    ringRef.current?.stop();
    ringRef.current = null;
    // Close peer connection
    pcRef.current?.close();
    pcRef.current = null;
    // Stop local mic
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    // Unsubscribe all listeners
    unsubsRef.current.forEach(u => u());
    unsubsRef.current = [];
  }, []);

  // ─── Ringtone ─────────────────────────────────────────────────────────────

  const playRing = useCallback((type: 'ring' | 'dial') => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = type === 'ring' ? 440 : 480;
      gain.gain.value = 0.12;
      const now = ctx.currentTime;
      for (let i = 0; i < 30; i++) {
        gain.gain.setValueAtTime(0.12, now + i * 1.5);
        gain.gain.setValueAtTime(0, now + i * 1.5 + 0.8);
      }
      osc.start();
      ringRef.current = { stop: () => { try { osc.stop(); ctx.close(); } catch {} } };
    } catch {}
  }, []);

  // ─── Start Call (outgoing) ────────────────────────────────────────────────

  const startCall = useCallback(async (receiverId: string, receiverName: string) => {
    // Use refs to check if in a call (avoids stale closure)
    if (pcRef.current) {
      console.log('[VOICE] Already in a call, ignoring startCall');
      return;
    }
    console.log('[VOICE] Starting call to', receiverName, receiverId);
    try {
      cleanup();

      // 1. Check mic availability and get stream
      if (!navigator.mediaDevices?.getUserMedia) {
        const errMsg = 'Microphone not available — voice calls require HTTPS or the kiosk app';
        console.error('[VOICE]', errMsg);
        setCallError(errMsg);
        setTimeout(() => setCallError(null), 6000);
        return;
      }
      console.log('[VOICE] Requesting microphone...');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (micErr: any) {
        const errMsg = micErr?.name === 'NotAllowedError'
          ? 'Microphone access denied — check browser permissions'
          : `Microphone error: ${micErr?.message || micErr}`;
        console.error('[VOICE]', errMsg);
        setCallError(errMsg);
        setTimeout(() => setCallError(null), 6000);
        return;
      }
      localStreamRef.current = stream;
      console.log('[VOICE] Mic acquired');

      // 2. Create peer connection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onconnectionstatechange = () => {
        console.log('[VOICE] Connection state:', pc.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log('[VOICE] ICE state:', pc.iceConnectionState);
      };

      // 3. Handle remote audio
      pc.ontrack = (event) => {
        console.log('[VOICE] Got remote track');
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
        ringRef.current?.stop();
        ringRef.current = null;
      };

      // 4. Collect ICE candidates BEFORE creating offer (+ log type: host/srflx/relay)
      const tempCandidates: any[] = [];
      const candTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const t = (event.candidate.candidate.split(' ')[7] || 'unknown') as keyof typeof candTypes;
          if (t in candTypes) candTypes[t]++;
          console.log('[VOICE] local candidate type=', t, 'tally=', candTypes);
          tempCandidates.push(event.candidate.toJSON());
        } else {
          console.log('[VOICE] ICE gathering complete. Summary:', candTypes,
            candTypes.relay === 0 ? '⚠ NO RELAY CANDIDATES — TURN unreachable' : '');
        }
      };

      // 5. Create offer FIRST, before writing to Firestore
      console.log('[VOICE] Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[VOICE] Offer created');

      // 6. Write call doc WITH offer included (atomic — no race condition)
      const callDocRef = await addDoc(collection(db, 'calls'), {
        callerId: player.uid,
        callerName: player.username || 'Anonymous',
        receiverId,
        receiverName,
        status: 'ringing',
        startedAt: Date.now(),
        offer: { type: offer.type, sdp: offer.sdp },
      });
      console.log('[VOICE] Call doc created:', callDocRef.id);

      const callData: CallDoc = {
        id: callDocRef.id,
        callerId: player.uid,
        callerName: player.username || 'Anonymous',
        receiverId,
        receiverName,
        status: 'ringing',
        startedAt: Date.now(),
      };
      setActiveCall(callData);

      // 7. Now write any ICE candidates that were collected during offer creation
      const callerCandidates = collection(db, 'calls', callDocRef.id, 'callerCandidates');
      for (const c of tempCandidates) {
        addDoc(callerCandidates, c);
      }
      // Switch to live ICE candidate forwarding
      pc.onicecandidate = (event) => {
        if (event.candidate) addDoc(callerCandidates, event.candidate.toJSON());
      };

      // 8. Play dial tone
      playRing('dial');

      // 9. Listen for answer / status changes
      const unsubCall = onSnapshot(doc(db, 'calls', callDocRef.id), (snap) => {
        const data = snap.data();
        if (!data) return;

        // Receiver sent answer
        if (data.answer && pc.signalingState !== 'closed' && !pc.currentRemoteDescription) {
          console.log('[VOICE] Got answer from receiver');
          pc.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit)).catch(e => {
            console.error('[VOICE] Failed to set remote description:', e);
          });
          ringRef.current?.stop();
          ringRef.current = null;
        }

        // Status changes
        if (data.status === 'active') {
          setActiveCall(prev => prev ? { ...prev, status: 'active' } : prev);
        }
        if (data.status === 'declined' || data.status === 'ended') {
          console.log('[VOICE] Call ended/declined');
          cleanup();
          setActiveCall(null);
          setDuration(0);
        }
      });
      unsubsRef.current.push(unsubCall);

      // 10. Listen for receiver's ICE candidates
      const unsubIce = onSnapshot(collection(db, 'calls', callDocRef.id, 'receiverCandidates'), (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added' && pc.signalingState !== 'closed') {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      });
      unsubsRef.current.push(unsubIce);

    } catch (err: any) {
      const errMsg = `Call failed: ${err?.message || err}`;
      console.error('[VOICE]', errMsg, err);
      setCallError(errMsg);
      cleanup();
      setActiveCall(null);
      setTimeout(() => setCallError(null), 8000);
    }
  }, [player, cleanup, playRing]);

  // ─── Answer Call (incoming) ───────────────────────────────────────────────

  const answerCall = useCallback(async (call: CallDoc) => {
    console.log('[VOICE] Answering call from', call.callerName, call.id);
    try {
      cleanup();
      ringRef.current?.stop();
      ringRef.current = null;

      // 1. Check mic availability and get stream
      if (!navigator.mediaDevices?.getUserMedia) {
        const errMsg = 'Microphone not available — voice calls require HTTPS or the kiosk app';
        console.error('[VOICE]', errMsg);
        setCallError(errMsg);
        setIncomingCall(null);
        await updateDoc(doc(db, 'calls', call.id), { status: 'ended', endedAt: Date.now() }).catch(() => {});
        setTimeout(() => setCallError(null), 6000);
        return;
      }
      console.log('[VOICE] Requesting microphone...');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (micErr: any) {
        const errMsg = micErr?.name === 'NotAllowedError'
          ? 'Microphone access denied — check browser permissions'
          : `Microphone error: ${micErr?.message || micErr}`;
        console.error('[VOICE]', errMsg);
        setCallError(errMsg);
        setIncomingCall(null);
        await updateDoc(doc(db, 'calls', call.id), { status: 'ended', endedAt: Date.now() }).catch(() => {});
        setTimeout(() => setCallError(null), 6000);
        return;
      }
      localStreamRef.current = stream;
      console.log('[VOICE] Mic acquired');

      // 2. Create peer connection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onconnectionstatechange = () => {
        console.log('[VOICE] Connection state:', pc.connectionState);
      };
      pc.oniceconnectionstatechange = () => {
        console.log('[VOICE] ICE state:', pc.iceConnectionState);
      };

      // 3. Handle remote audio
      pc.ontrack = (event) => {
        console.log('[VOICE] Got remote track');
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // 4. Collect ICE candidates (+ log type: host/srflx/relay)
      const receiverCandidates = collection(db, 'calls', call.id, 'receiverCandidates');
      const candTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const t = (event.candidate.candidate.split(' ')[7] || 'unknown') as keyof typeof candTypes;
          if (t in candTypes) candTypes[t]++;
          console.log('[VOICE] local candidate type=', t, 'tally=', candTypes);
          addDoc(receiverCandidates, event.candidate.toJSON());
        } else {
          console.log('[VOICE] ICE gathering complete. Summary:', candTypes,
            candTypes.relay === 0 ? '⚠ NO RELAY CANDIDATES — TURN unreachable' : '');
        }
      };

      // 5. Get the offer from Firestore (with retry — offer might not be written yet)
      let callData: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const callSnap = await getDoc(doc(db, 'calls', call.id));
        callData = callSnap.data();
        if (callData?.offer) break;
        console.log(`[VOICE] No offer yet, retry ${attempt + 1}/5...`);
        await new Promise(r => setTimeout(r, 500));
      }

      if (!callData?.offer) {
        const errMsg = 'No offer found after 5 retries — caller may have disconnected';
        console.error('[VOICE]', errMsg);
        setCallError(errMsg);
        cleanup();
        setIncomingCall(null);
        setTimeout(() => setCallError(null), 5000);
        return;
      }
      console.log('[VOICE] Got offer, setting remote description...');

      // 6. Set remote description (offer) and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer as RTCSessionDescriptionInit));
      console.log('[VOICE] Remote description set, creating answer...');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[VOICE] Answer created, writing to Firestore...');

      // 7. Write answer + set status active
      await updateDoc(doc(db, 'calls', call.id), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'active',
      });
      console.log('[VOICE] Call is now active!');

      // 8. Listen for caller's ICE candidates
      const unsubIce = onSnapshot(collection(db, 'calls', call.id, 'callerCandidates'), (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added' && pc.signalingState !== 'closed') {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      });
      unsubsRef.current.push(unsubIce);

      // 9. Listen for call end
      const unsubStatus = onSnapshot(doc(db, 'calls', call.id), (snap) => {
        const data = snap.data();
        if (data?.status === 'ended') {
          console.log('[VOICE] Call ended by remote');
          cleanup();
          setActiveCall(null);
          setDuration(0);
        }
      });
      unsubsRef.current.push(unsubStatus);

      setActiveCall({ ...call, status: 'active' });
      setIncomingCall(null);
      setDuration(0);

    } catch (err: any) {
      const errMsg = `Answer failed: ${err?.message || err}`;
      console.error('[VOICE]', errMsg, err);
      setCallError(errMsg);
      cleanup();
      setIncomingCall(null);
      setTimeout(() => setCallError(null), 8000);
    }
  }, [cleanup]);

  // ─── End Call ─────────────────────────────────────────────────────────────

  // Keep a ref to activeCall so endCall doesn't need it in deps
  const activeCallRef = useRef<CallDoc | null>(null);
  activeCallRef.current = activeCall;

  const endCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call) return;
    console.log('[VOICE] Ending call:', call.id);
    cleanup();
    await updateDoc(doc(db, 'calls', call.id), { status: 'ended', endedAt: Date.now() }).catch(() => {});
    setActiveCall(null);
    setDuration(0);
    setIsMuted(false);
  }, [cleanup]);

  // ─── Decline Call ─────────────────────────────────────────────────────────

  const declineCall = useCallback(async (call: CallDoc) => {
    console.log('[VOICE] Declining call:', call.id);
    ringRef.current?.stop();
    ringRef.current = null;
    await updateDoc(doc(db, 'calls', call.id), { status: 'declined', endedAt: Date.now() }).catch(() => {});
    setIncomingCall(null);
  }, []);

  // ─── Toggle Mute ──────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks();
    if (!tracks?.length) return;
    const newEnabled = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = newEnabled; });
    setIsMuted(!newEnabled);
  }, []);

  // ─── Toggle Speaker ───────────────────────────────────────────────────────

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn(prev => {
      const next = !prev;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
      return next;
    });
  }, []);

  // ─── Listen for incoming calls ────────────────────────────────────────────

  useEffect(() => {
    if (!player?.uid) return;

    console.log('[VOICE] Setting up incoming call listener for', player.uid);
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', player.uid),
      where('status', '==', 'ringing')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      // Use ref to avoid stale closure
      if (snapshot.docs.length > 0 && !activeCallRef.current) {
        const callDoc = snapshot.docs[0];
        const data = callDoc.data();
        console.log('[VOICE] Incoming call from', data.callerName, '- has offer:', !!data.offer);
        const incoming: CallDoc = {
          id: callDoc.id,
          callerId: data.callerId,
          callerName: data.callerName,
          receiverId: data.receiverId,
          receiverName: data.receiverName || '',
          status: 'ringing',
          startedAt: data.startedAt,
        };
        setIncomingCall(incoming);
        if (!ringRef.current) playRing('ring');
      } else if (snapshot.docs.length === 0) {
        setIncomingCall(null);
        ringRef.current?.stop();
        ringRef.current = null;
      }
    });

    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.uid]);

  // ─── Listen for start-voice-call event ────────────────────────────────────

  const startCallRef = useRef(startCall);
  startCallRef.current = startCall;

  useEffect(() => {
    const handler = (e: Event) => {
      const { friendId, friendName } = (e as CustomEvent).detail;
      startCallRef.current(friendId, friendName);
    };
    window.addEventListener('start-voice-call', handler);
    return () => window.removeEventListener('start-voice-call', handler);
  }, []);

  // ─── Call duration timer ──────────────────────────────────────────────────

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'active') return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [activeCall?.status]);

  // ─── Ringing timeout — auto-cancel after 30s ─────────────────────────────

  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') return;
    const timeout = setTimeout(() => {
      console.log('[VOICE] Ringing timeout (30s), auto-ending call');
      endCallRef.current();
    }, 30000);
    return () => clearTimeout(timeout);
  }, [activeCall?.status]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Incoming Call Popup ──────────────────────────────────────── */}
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] w-[320px]"
          >
            <div className="relative rounded-2xl p-6 flex flex-col items-center gap-4 overflow-hidden"
              style={{
                background: 'rgba(15, 16, 21, 0.97)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(57,255,20,0.25)',
                boxShadow: '0 0 60px rgba(57,255,20,0.15), 0 12px 40px rgba(0,0,0,0.7)',
              }}>
              {/* Pulsing border */}
              <motion.div className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ border: '2px solid #39ff14' }}
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }} />

              {/* Avatar */}
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ background: 'linear-gradient(135deg, rgba(57,255,20,0.15), rgba(57,255,20,0.05))', border: '2px solid rgba(57,255,20,0.4)', color: '#39ff14' }}>
                {incomingCall.callerName.charAt(0).toUpperCase()}
              </motion.div>

              {/* Name */}
              <div className="text-center">
                <div className="text-white font-ninja text-base tracking-wide mb-1">{incomingCall.callerName}</div>
                <div className="flex items-center gap-1.5 justify-center">
                  <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.6, repeat: Infinity }}>
                    <PhoneIncoming size={14} className="text-green-400" />
                  </motion.div>
                  <span className="text-sm text-gray-400">{ar ? 'مكالمة صوتية واردة...' : 'Incoming voice call...'}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-4 mt-2">
                <button onClick={() => declineCall(incomingCall)}
                  className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30 transition-all active:scale-90 group"
                  style={{ border: '2px solid rgba(239,68,68,0.4)' }}>
                  <PhoneOff size={22} className="text-red-400 group-hover:text-red-300" />
                </button>
                <button onClick={() => answerCall(incomingCall)}
                  className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center hover:bg-green-500/30 transition-all active:scale-90 group"
                  style={{ border: '2px solid rgba(34,197,94,0.4)' }}>
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                    <Phone size={22} className="text-green-400 group-hover:text-green-300" />
                  </motion.div>
                </button>
              </div>
              <div className="flex items-center gap-10 -mt-1">
                <span className="text-[10px] text-red-400/60 uppercase tracking-wider">{ar ? 'رفض' : 'Decline'}</span>
                <span className="text-[10px] text-green-400/60 uppercase tracking-wider">{ar ? 'رد' : 'Answer'}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active Call Banner (fixed top) ───────────────────────────── */}
      <AnimatePresence>
        {activeCall && activeCall.status === 'active' && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[250] rounded-2xl px-5 py-3 flex items-center gap-4"
            style={{
              background: 'rgba(15, 16, 21, 0.95)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(34,197,94,0.3)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(34,197,94,0.1)',
            }}
          >
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <PhoneCall size={16} className="text-green-400" />
            </motion.div>
            <span className="text-sm text-green-300 font-medium">
              {activeCall.callerId === player.uid ? activeCall.receiverName : activeCall.callerName}
            </span>
            <span className="text-xs text-green-400/70 font-mono">{formatDuration(duration)}</span>

            <div className="flex items-center gap-1.5 ml-2">
              <button onClick={toggleMute}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}>
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <button onClick={toggleSpeaker}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${!isSpeakerOn ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}>
                {isSpeakerOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button onClick={endCall}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                <PhoneOff size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Outgoing Call (ringing) Banner ────────────────────────────── */}
      <AnimatePresence>
        {activeCall && activeCall.status === 'ringing' && activeCall.callerId === player.uid && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[250] rounded-2xl px-5 py-3 flex items-center gap-4"
            style={{
              background: 'rgba(15, 16, 21, 0.95)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(59,130,246,0.3)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>
              <Phone size={16} className="text-blue-400" />
            </motion.div>
            <span className="text-sm text-blue-300">
              {ar ? 'جاري الاتصال بـ ' : 'Calling '}<span className="font-medium">{activeCall.receiverName || (ar ? 'اللاعب' : 'Player')}</span>...
            </span>
            <button onClick={endCall}
              className="ml-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors border border-red-500/30">
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error Banner ────────────────────────────────────────────── */}
      <AnimatePresence>
        {callError && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[350] rounded-xl px-5 py-3 max-w-[400px]"
            style={{ background: 'rgba(220,38,38,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,100,100,0.4)' }}
          >
            <p className="text-white text-sm font-medium text-center">{callError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </>
  );
}
