'use client';

/**
 * VoiceCallUI — global floating call widget.
 * Rendered inside VoiceCallProvider.
 * Shows incoming call modal and active call banner.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, PhoneIncoming, PhoneCall,
  Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react';
import { useVoiceCall } from './VoiceCallProvider';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface Props {
  player: any;
}

export function VoiceCallUI({ player }: Props) {
  const {
    state, incomingCall, activeCall, isMuted, isSpeakerOff, callDuration,
    answerCall, declineCall, endCall, toggleMute, toggleSpeaker,
  } = useVoiceCall();

  // Pulsing ring animation counter
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (state !== 'ringing') return;
    const id = setInterval(() => setPulse((p) => p + 1), 500);
    return () => clearInterval(id);
  }, [state]);

  const isKiosk = typeof window !== 'undefined' && window.innerWidth > 768;

  return (
    <>
      {/* ── Incoming Call Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {state === 'ringing' && incomingCall && (
          <motion.div
            key="incoming"
            initial={{ opacity: 0, scale: 0.85, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed z-[500] flex flex-col items-center"
            style={
              isKiosk
                ? { top: 24, right: 24, width: 320 }
                : { top: 0, left: 0, right: 0, padding: '16px 16px 0' }
            }
          >
            <div
              className="w-full rounded-3xl overflow-hidden"
              style={{
                background: 'rgba(10,10,14,0.97)',
                border: '1.5px solid rgba(57,255,20,0.25)',
                boxShadow: '0 0 60px rgba(57,255,20,0.12), 0 8px 40px rgba(0,0,0,0.8)',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Green bar */}
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #39FF14, #00ff88)' }} />

              <div className="p-6 text-center">
                {/* Animated avatar */}
                <div className="relative inline-block mb-4">
                  {/* Pulse rings */}
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full border-2"
                      style={{ borderColor: 'rgba(57,255,20,0.3)' }}
                      animate={{ scale: [1, 1.5 + i * 0.2], opacity: [0.6, 0] }}
                      transition={{ duration: 1.5, delay: i * 0.25, repeat: Infinity }}
                    />
                  ))}
                  <div
                    className="relative w-20 h-20 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(57,255,20,0.2), rgba(57,255,20,0.05))',
                      border: '2px solid rgba(57,255,20,0.4)',
                    }}
                  >
                    <img
                      src={`/img/pfp-neon.png`}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <PhoneIncoming
                      size={28}
                      className="absolute"
                      style={{ color: '#39FF14', filter: 'drop-shadow(0 0 8px #39FF14)' }}
                    />
                  </div>
                </div>

                <p className="text-white/50 text-xs font-medium tracking-widest uppercase mb-1">Incoming Voice Call</p>
                <h3 className="text-white text-xl font-bold mb-1">{incomingCall.callerName}</h3>
                <p className="text-white/30 text-sm mb-6">Wants to talk to you</p>

                {/* Accept / Decline */}
                <div className="flex gap-4 justify-center">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={declineCall}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-colors"
                    style={{ background: 'rgba(255,60,60,0.12)', border: '1.5px solid rgba(255,60,60,0.25)' }}
                  >
                    <PhoneOff size={24} color="#FF4444" />
                    <span className="text-xs font-semibold text-red-400">Decline</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={answerCall}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-2xl transition-colors"
                    style={{ background: 'rgba(57,255,20,0.15)', border: '1.5px solid rgba(57,255,20,0.35)' }}
                  >
                    <motion.div
                      animate={{ rotate: [0, 12, -12, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity }}
                    >
                      <Phone size={24} color="#39FF14" />
                    </motion.div>
                    <span className="text-xs font-semibold" style={{ color: '#39FF14' }}>Answer</span>
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active / Calling Widget ──────────────────────────────────────── */}
      <AnimatePresence>
        {(state === 'connected' || state === 'calling' || state === 'ringing') && !incomingCall && activeCall && (
          <motion.div
            key="active-call"
            initial={{ opacity: 0, y: isKiosk ? -20 : 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isKiosk ? -20 : 60 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="fixed z-[490]"
            style={
              isKiosk
                ? { top: 24, right: 24, width: 300 }
                : { bottom: 80, left: 12, right: 12 }
            }
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(10,10,14,0.96)',
                border: `1.5px solid ${state === 'connected' ? 'rgba(57,255,20,0.3)' : 'rgba(59,130,246,0.3)'}`,
                boxShadow: `0 0 30px ${state === 'connected' ? 'rgba(57,255,20,0.08)' : 'rgba(59,130,246,0.08)'}, 0 4px 24px rgba(0,0,0,0.7)`,
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Top bar */}
              <div className="px-4 py-3 flex items-center gap-3">
                {/* Status icon */}
                <motion.div
                  animate={state === 'connected' ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  <PhoneCall
                    size={18}
                    style={{ color: state === 'connected' ? '#39FF14' : '#60A5FA' }}
                  />
                </motion.div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {state === 'connected'
                      ? activeCall.receiverId === player?.uid
                        ? activeCall.callerName
                        : activeCall.receiverName
                      : state === 'calling' || state === 'ringing'
                        ? activeCall.receiverName
                        : activeCall.callerName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: state === 'connected' ? '#39FF14' : '#60A5FA' }}>
                    {state === 'connected'
                      ? formatDuration(callDuration)
                      : state === 'calling' || state === 'ringing'
                        ? 'Calling...'
                        : 'Connecting...'}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5">
                  {state === 'connected' && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        onClick={toggleMute}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                        style={{
                          background: isMuted ? 'rgba(255,60,60,0.2)' : 'rgba(255,255,255,0.08)',
                        }}
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted
                          ? <MicOff size={14} color="#FF4444" />
                          : <Mic size={14} color="#aaa" />}
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        onClick={toggleSpeaker}
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                        style={{
                          background: isSpeakerOff ? 'rgba(255,60,60,0.2)' : 'rgba(255,255,255,0.08)',
                        }}
                        title={isSpeakerOff ? 'Speaker off' : 'Speaker on'}
                      >
                        {isSpeakerOff
                          ? <VolumeX size={14} color="#FF4444" />
                          : <Volume2 size={14} color="#aaa" />}
                      </motion.button>
                    </>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={endCall}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,60,60,0.2)', border: '1px solid rgba(255,60,60,0.3)' }}
                    title="End call"
                  >
                    <PhoneOff size={14} color="#FF4444" />
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
