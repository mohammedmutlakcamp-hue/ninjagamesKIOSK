'use client';

import { useEffect, useRef } from 'react';

/**
 * useEscapeKey — press ESC to close the topmost modal.
 *
 * Maintains a global stack of ESC handlers so that when nested modals are open,
 * pressing ESC closes the innermost (most recently mounted) one first, the way
 * native OS dialogs behave.
 *
 * Usage:
 *   useEscapeKey(() => setOpen(false), isOpen);
 *
 * The hook is a no-op when `enabled` is false, so you can pass a modal's open
 * state directly — ESC will only fire while the modal is actually visible.
 */

type EscHandler = () => void;

const handlerStack: EscHandler[] = [];
let listenerAttached = false;

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (handlerStack.length === 0) return;
  // Only call the top (innermost) handler
  const top = handlerStack[handlerStack.length - 1];
  e.stopPropagation();
  top();
}

function attachListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  window.addEventListener('keydown', handleGlobalKeydown, true); // capture phase so we run first
  listenerAttached = true;
}

export function useEscapeKey(callback: EscHandler, enabled: boolean = true) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    // Wrap so stack entry is stable across renders
    const wrapper: EscHandler = () => cbRef.current();
    handlerStack.push(wrapper);
    attachListener();
    return () => {
      const idx = handlerStack.lastIndexOf(wrapper);
      if (idx >= 0) handlerStack.splice(idx, 1);
    };
  }, [enabled]);
}
