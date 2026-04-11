'use client';

/**
 * VoiceCallProvider — global voice call context.
 * Wraps the app so any component can call useVoiceCall() to initiate/manage calls.
 *
 * Usage:
 *   <VoiceCallProvider player={player}>
 *     <YourApp />
 *   </VoiceCallProvider>
 *
 *   const { startCall, endCall, state, incomingCall } = useVoiceCall();
 */

import {
  createContext, useContext, useEffect, useRef, useState,
  useCallback, ReactNode,
} from 'react';
import { VoiceCallManager, VoiceCallData, CallState } from '@/lib/voice-call';
import { VoiceCallUI } from './VoiceCallUI';
import { callNotifications } from '@/lib/call-notifications';

// ─── Context Types ────────────────────────────────────────────────────────────

interface VoiceCallContextValue {
  state: CallState;
  incomingCall: VoiceCallData | null;
  activeCall: VoiceCallData | null;
  isMuted: boolean;
  isSpeakerOff: boolean;
  callDuration: number;
  startCall: (receiverId: string, receiverName: string) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

export function useVoiceCall(): VoiceCallContextValue {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) throw new Error('useVoiceCall must be used inside VoiceCallProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  player: any;
  children: ReactNode;
}

export function VoiceCallProvider({ player, children }: Props) {
  const managerRef = useRef<VoiceCallManager | null>(null);

  const [state, setState] = useState<CallState>('idle');
  const [incomingCall, setIncomingCall] = useState<VoiceCallData | null>(null);
  const [activeCall, setActiveCall] = useState<VoiceCallData | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Duration timer
  useEffect(() => {
    if (state !== 'connected') { setCallDuration(0); return; }
    const id = setInterval(() => setCallDuration((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Initialize VoiceCallManager once player is ready
  useEffect(() => {
    if (!player?.uid || typeof window === 'undefined') return;

    const mgr = new VoiceCallManager();
    managerRef.current = mgr;

    mgr.onStateChange = (newState, callData) => {
      setState(newState);
      if (newState === 'idle' || newState === 'ended') {
        setActiveCall(null);
        setIsMuted(false);
        setIsSpeakerOff(false);
      }
      if (newState === 'connected' && callData) {
        setActiveCall(callData);
        setIncomingCall(null);
      }
    };

    mgr.onIncomingCall = (callData) => {
      // Ignore if already in a call
      if (managerRef.current?.state !== 'idle') return;
      setIncomingCall(callData);
      setState('ringing');
      
      // Start call notifications (sound, vibration, system notification, push)
      callNotifications.startIncomingCallAlert(callData.callerName, player.uid);
    };

    mgr.onError = (msg) => console.error('[VoiceCallProvider]', msg);

    // Initialize peer and listen for incoming calls
    mgr.initialize(player.uid)
      .then(() => {
        mgr.listenForIncomingCalls(player.uid);
        console.log('[VOICE] Provider ready for', player.username);
        
        // Request notification and vibration permissions
        callNotifications.requestPermissions().catch(console.warn);
      })
      .catch((err) => console.error('[VOICE] Init failed:', err));

    return () => {
      mgr.destroy();
      managerRef.current = null;
    };
  }, [player?.uid]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const startCall = useCallback(async (receiverId: string, receiverName: string) => {
    const mgr = managerRef.current;
    if (!mgr || !player?.uid) return;

    const call: VoiceCallData = {
      id: '',
      callerId: player.uid,
      callerName: player.username || 'Player',
      receiverId,
      receiverName,
      callerPeerId: mgr.myPeerId || '',
      status: 'ringing',
      timestamp: Date.now(),
    };
    setActiveCall(call);
    await mgr.startCall(player.uid, player.username || 'Player', receiverId, receiverName);
  }, [player]);

  const answerCall = useCallback(async () => {
    if (!incomingCall || !managerRef.current) return;
    
    // Stop call notifications
    callNotifications.stopIncomingCallAlert();
    
    setActiveCall(incomingCall);
    setIncomingCall(null);
    await managerRef.current.answerCall(incomingCall);
  }, [incomingCall]);

  const declineCall = useCallback(async () => {
    if (!incomingCall || !managerRef.current) return;
    
    // Stop call notifications
    callNotifications.stopIncomingCallAlert();
    
    await managerRef.current.declineCall(incomingCall.id);
    setIncomingCall(null);
    setState('idle');
  }, [incomingCall]);

  const endCall = useCallback(async () => {
    // Stop call notifications
    callNotifications.stopIncomingCallAlert();
    
    await managerRef.current?.endCall();
  }, []);

  const toggleMute = useCallback(() => {
    const muted = managerRef.current?.toggleMute() ?? false;
    setIsMuted(muted);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const off = managerRef.current?.toggleSpeaker() ?? false;
    setIsSpeakerOff(off);
  }, []);

  const value: VoiceCallContextValue = {
    state,
    incomingCall,
    activeCall,
    isMuted,
    isSpeakerOff,
    callDuration,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
      {/* Global call UI — renders floating widget / incoming call modal */}
      <VoiceCallUI player={player} />
    </VoiceCallContext.Provider>
  );
}
