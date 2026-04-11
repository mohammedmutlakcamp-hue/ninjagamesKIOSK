'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gamepad2, X } from 'lucide-react';
import Image from 'next/image';

export interface FriendToast {
  id: string;
  friendName: string;
  friendNinjaType?: string;
  message: string;
  type: 'online' | 'playing';
}

interface Props {
  toasts: FriendToast[];
  onDismiss: (id: string) => void;
}

export function FriendNotification({ toasts, onDismiss }: Props) {
  useEffect(() => {
    toasts.forEach((toast) => {
      const timer = setTimeout(() => onDismiss(toast.id), 5000);
      return () => clearTimeout(timer);
    });
  }, [toasts, onDismiss]);

  return (
    <div className="fixed bottom-6 left-6 z-[150] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: -100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -100, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="pointer-events-auto flex items-center gap-4 px-5 py-4 rounded-xl border min-w-[340px] max-w-[420px]"
            style={{
              background: 'rgba(10,10,10,0.9)',
              backdropFilter: 'blur(20px)',
              borderColor: toast.type === 'online' ? 'rgba(57,255,20,0.3)' : 'rgba(100,149,237,0.3)',
              boxShadow: toast.type === 'online'
                ? '0 0 20px rgba(57,255,20,0.15)'
                : '0 0 20px rgba(100,149,237,0.15)',
            }}
          >
            {/* Friend avatar */}
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 relative border border-white/10">
              <Image
                src={`/img/pfp-${toast.friendNinjaType || 'neon'}.png`}
                alt={toast.friendName}
                width={48}
                height={48}
                className="object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                <Users size={20} className="text-gray-600" />
              </div>
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-black" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="font-ninja text-sm text-ninja-green truncate">{toast.friendName}</p>
              <p className="text-gray-400 font-body text-sm truncate">{toast.message}</p>
            </div>

            {/* Icon */}
            <div className="flex-shrink-0">
              {toast.type === 'online' ? (
                <Users size={20} className="text-ninja-green" />
              ) : (
                <Gamepad2 size={20} className="text-blue-400" />
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
