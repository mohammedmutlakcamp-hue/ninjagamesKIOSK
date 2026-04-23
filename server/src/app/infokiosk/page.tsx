'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { MapPin, Star, Facebook, Instagram, ArrowLeft, X, Smartphone } from 'lucide-react';

interface LinkItem {
  title: string;
  url: string;
  icon: React.ReactNode;
}

const links: LinkItem[] = [
  {
    title: 'Ninja Games Location',
    url: 'https://maps.app.goo.gl/jDFemhPVrsXMjuyD9?g_st=ic',
    icon: <MapPin size={20} />,
  },
  {
    title: 'Google Review',
    url: 'https://share.google/CW0iX87oFRlrr7Qn0',
    icon: <Star size={20} />,
  },
  {
    title: 'Facebook',
    url: 'https://www.facebook.com/Ninjawyz',
    icon: <Facebook size={20} />,
  },
  {
    title: 'Instagram',
    url: 'https://www.instagram.com/ininjagames',
    icon: <Instagram size={20} />,
  },
];

function qrImageUrl(url: string, size = 320): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&color=0D1F0D&bgcolor=FFFFFF&data=${encodeURIComponent(url)}`;
}

function handleBackToKiosk() {
  if (typeof window === 'undefined') return;
  // The C# electronAPI.returnToKiosk only brings the window to front — it does
  // NOT change the WebView URL, so we'd still be stuck on /infokiosk. Just
  // navigate the WebView directly; this works identically on LAN, cloud, and
  // inside the C# kiosk shell.
  window.location.replace('/kiosk');
}

export default function InfoKioskPage() {
  const [qrLink, setQrLink] = useState<LinkItem | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-black">
      {/* Persistent BACK TO KIOSK button (fixed top-left, always visible) */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleBackToKiosk}
        className="fixed top-4 left-4 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#00ff41]/40"
        style={{
          background: 'linear-gradient(135deg, rgba(0,0,0,0.85), rgba(0,255,65,0.1))',
          backdropFilter: 'blur(10px)',
          color: '#00ff41',
          boxShadow: '0 0 20px rgba(0,255,65,0.25)',
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        <ArrowLeft size={16} />
        <span className="text-xs font-semibold tracking-wider">BACK TO KIOSK</span>
      </motion.button>

      {/* Animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #000000 0%, #0a1a0a 25%, #00ff41 50%, #0a1a0a 75%, #000000 100%)',
          backgroundSize: '400% 400%',
          animation: 'gradientShift 8s ease infinite',
        }}
      />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Animated lime glow orbs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 20, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[15%] left-[15%] w-[350px] h-[350px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #00ff41, transparent)', filter: 'blur(80px)' }}
        />
        <motion.div
          animate={{ y: [0, 25, 0], x: [0, -15, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-[15%] right-[15%] w-[300px] h-[300px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #39ff14, transparent)', filter: 'blur(70px)' }}
        />
        <motion.div
          animate={{ y: [0, -20, 0], scale: [1, 1.3, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-[50%] left-[50%] w-[200px] h-[200px] rounded-full opacity-10 -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(circle, #00ff41, transparent)', filter: 'blur(60px)' }}
        />
      </div>

      {/* Global keyframes */}
      <style jsx global>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-[420px] px-6 py-12 flex flex-col items-center">
        {/* Avatar with glow */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 150 }}
          className="mb-5"
        >
          <motion.div
            animate={{ boxShadow: ['0 0 30px rgba(0,255,65,0.4)', '0 0 60px rgba(0,255,65,0.7)', '0 0 30px rgba(0,255,65,0.4)'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-36 h-36 rounded-full overflow-hidden border-[3px] border-[#00ff41]/50"
          >
            <Image src="/img/logo.png" alt="Ninja Games" width={144} height={144} className="w-full h-full object-cover" />
          </motion.div>
        </motion.div>

        {/* Name */}
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-white text-2xl font-bold mb-1 tracking-wide"
          style={{ fontFamily: "'IBM Plex Sans', sans-serif", textShadow: '0 0 20px rgba(0,255,65,0.5)' }}
        >
          Ninjagames
        </motion.h1>

        {/* Bio */}
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-[#00ff41]/70 text-sm mb-8"
        >
          Just a ninja 👀
        </motion.p>

        {/* Links — tapping opens a QR popup so the player stays on the kiosk */}
        <div className="w-full space-y-3">
          {links.map((link, i) => (
            <motion.button
              key={link.title}
              onClick={() => setQrLink(link)}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              whileHover={{ scale: 1.02, boxShadow: '0 0 25px rgba(0,255,65,0.3)' }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-full transition-all relative overflow-hidden border border-[#00ff41]/20"
              style={{
                background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,255,65,0.08) 100%)',
                color: '#00ff41',
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontWeight: 600,
                fontSize: '15px',
                backdropFilter: 'blur(10px)',
              }}
            >
              <span className="absolute left-5 opacity-60">{link.icon}</span>
              {link.title}
            </motion.button>
          ))}
        </div>

        {/* Social Icons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 flex gap-4"
        >
          <button onClick={() => setQrLink(links.find(l => l.title === 'Instagram')!)}
            className="w-10 h-10 rounded-full bg-[#00ff41]/10 border border-[#00ff41]/20 flex items-center justify-center text-[#00ff41] hover:bg-[#00ff41]/20 transition-all">
            <Instagram size={18} />
          </button>
          <button onClick={() => setQrLink(links.find(l => l.title === 'Facebook')!)}
            className="w-10 h-10 rounded-full bg-[#00ff41]/10 border border-[#00ff41]/20 flex items-center justify-center text-[#00ff41] hover:bg-[#00ff41]/20 transition-all">
            <Facebook size={18} />
          </button>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 text-[#00ff41]/30 text-xs"
        >
          ninjagamesjo.com
        </motion.p>
      </div>

      {/* QR Popup — "SCAN ME TO OPEN ON PHONE" */}
      <AnimatePresence>
        {qrLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrLink(null)}
            className="fixed inset-0 z-[80] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(14px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[380px] rounded-3xl p-7 text-center"
              style={{
                background: 'linear-gradient(180deg, #04120a 0%, #020806 100%)',
                border: '1.5px solid rgba(0,255,65,0.35)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 50px rgba(0,255,65,0.18)',
              }}
            >
              {/* Close */}
              <button
                onClick={() => setQrLink(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-[#00ff41]/70 hover:text-[#00ff41] transition-all"
                style={{ background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.2)' }}
              >
                <X size={16} />
              </button>

              {/* Header */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-[#00ff41]/60">{qrLink.icon}</span>
                <h2 className="text-white text-xl font-bold tracking-wide"
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif", textShadow: '0 0 14px rgba(0,255,65,0.4)' }}>
                  {qrLink.title}
                </h2>
              </div>

              {/* "SCAN ME" label */}
              <div className="flex items-center justify-center gap-2 mb-5 text-[#00ff41]/70 text-xs tracking-[0.25em] font-semibold">
                <Smartphone size={13} />
                SCAN ME TO OPEN ON PHONE
              </div>

              {/* QR code */}
              <motion.div
                animate={{ boxShadow: ['0 0 25px rgba(0,255,65,0.3)', '0 0 45px rgba(0,255,65,0.55)', '0 0 25px rgba(0,255,65,0.3)'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="mx-auto w-[280px] h-[280px] rounded-2xl p-3 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl(qrLink.url)}
                  alt={`QR code for ${qrLink.title}`}
                  width={320}
                  height={320}
                  className="w-full h-full rounded-lg"
                />
              </motion.div>

              {/* URL */}
              <p className="mt-5 text-[#00ff41]/50 text-[11px] break-all font-mono px-2">
                {qrLink.url}
              </p>

              {/* Hint */}
              <p className="mt-4 text-white/60 text-xs">
                Point your phone camera at the code — we won&apos;t take you off the kiosk.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
