// NINJA FIGHTERS - KOF Style - Phase 1
// Mobile touch controls: D-pad left, attack buttons right
// Multi-touch support for move + attack simultaneously

'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { InputState } from './NinjaFightersEngine';
import { emptyInput } from './NinjaFightersEngine';

interface Props {
  onInput: (inp: InputState) => void;
}

// Which side a touch belongs to
type TouchSide = 'dpad' | 'buttons';

interface TouchInfo {
  id: number;
  side: TouchSide;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  element: string; // button id hit
}

export function NinjaFightersMobileControls({ onInput }: Props) {
  const inputRef = useRef<InputState>(emptyInput());
  const touchesRef = useRef<Map<number, TouchInfo>>(new Map());
  const dpadRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);

  const recompute = useCallback(() => {
    const inp = emptyInput();
    for (const t of Array.from(touchesRef.current.values())) {
      if (t.side === 'dpad') {
        const dx = t.currentX - t.startX;
        const dy = t.currentY - t.startY;
        const DEAD = 16;
        if (dx < -DEAD) inp.left = true;
        if (dx > DEAD) inp.right = true;
        if (dy < -DEAD) inp.up = true;
      } else if (t.side === 'buttons') {
        switch (t.element) {
          case 'light':   inp.light = true; break;
          case 'heavy':   inp.heavy = true; break;
          case 'special': inp.special = true; break;
          case 'block':   inp.block = true; break;
          case 'jump':    inp.up = true; break;
        }
      }
    }
    inputRef.current = inp;
    onInput(inp);
  }, [onInput]);

  const getButtonFromPoint = useCallback((el: HTMLElement | null, x: number, y: number): string => {
    if (!el) return '';
    const rect = el.getBoundingClientRect();
    const lx = x - rect.left;
    const ly = y - rect.top;
    const buttons = Array.from(el.querySelectorAll('[data-btn]'));
    for (const btn of buttons) {
      const bRect = btn.getBoundingClientRect();
      const bx = bRect.left - rect.left;
      const by = bRect.top - rect.top;
      if (lx >= bx && lx <= bx + bRect.width && ly >= by && ly <= by + bRect.height) {
        return (btn as HTMLElement).dataset.btn || '';
      }
    }
    return '';
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const dpadEl = dpadRef.current;
    const btnsEl = buttonsRef.current;

    for (const touch of Array.from(e.changedTouches)) {
      const tx = touch.clientX, ty = touch.clientY;
      let side: TouchSide | null = null;
      let element = '';

      if (dpadEl) {
        const r = dpadEl.getBoundingClientRect();
        if (tx >= r.left && tx <= r.right && ty >= r.top && ty <= r.bottom) {
          side = 'dpad';
        }
      }
      if (!side && btnsEl) {
        const r = btnsEl.getBoundingClientRect();
        if (tx >= r.left && tx <= r.right && ty >= r.top && ty <= r.bottom) {
          side = 'buttons';
          element = getButtonFromPoint(btnsEl, tx, ty);
        }
      }

      if (side) {
        touchesRef.current.set(touch.identifier, {
          id: touch.identifier, side,
          startX: tx, startY: ty,
          currentX: tx, currentY: ty,
          element,
        });
      }
    }
    recompute();
  }, [recompute, getButtonFromPoint]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const btnsEl = buttonsRef.current;
    for (const touch of Array.from(e.changedTouches)) {
      const info = touchesRef.current.get(touch.identifier);
      if (!info) continue;
      info.currentX = touch.clientX;
      info.currentY = touch.clientY;
      if (info.side === 'buttons') {
        info.element = getButtonFromPoint(btnsEl, touch.clientX, touch.clientY);
      }
    }
    recompute();
  }, [recompute, getButtonFromPoint]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    e.preventDefault();
    for (const touch of Array.from(e.changedTouches)) {
      touchesRef.current.delete(touch.identifier);
    }
    recompute();
  }, [recompute]);

  useEffect(() => {
    const opts = { passive: false };
    document.addEventListener('touchstart', handleTouchStart, opts);
    document.addEventListener('touchmove', handleTouchMove, opts);
    document.addEventListener('touchend', handleTouchEnd, opts);
    document.addEventListener('touchcancel', handleTouchEnd, opts);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // D-pad direction buttons (left / up / right)
  const dpadBtnStyle = (active?: boolean) => ({
    width: 58, height: 58,
    background: active ? 'rgba(255,200,50,0.35)' : 'rgba(255,255,255,0.10)',
    border: `2px solid ${active ? 'rgba(255,200,50,0.8)' : 'rgba(255,255,255,0.25)'}`,
    borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22,
    color: 'white',
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    touchAction: 'none' as const,
    transition: 'background 0.08s',
  });

  const attackBtnStyle = (color: string, size = 62) => ({
    width: size, height: size,
    background: `rgba(${color},0.18)`,
    border: `2.5px solid rgba(${color},0.7)`,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700,
    color: `rgba(${color},1)`,
    fontFamily: 'monospace',
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    touchAction: 'none' as const,
    letterSpacing: 0.5,
    flexDirection: 'column' as const,
    lineHeight: 1.1,
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 160,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 10px 12px',
        pointerEvents: 'none',
        zIndex: 200,
      }}
    >
      {/* LEFT — D-pad */}
      <div
        ref={dpadRef}
        style={{
          pointerEvents: 'auto',
          touchAction: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* Up button */}
        <div style={{ ...dpadBtnStyle(), marginBottom: 2 }}>▲</div>
        {/* Left + Right row */}
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={dpadBtnStyle()}>◀</div>
          {/* Center pad (dead zone visual) */}
          <div style={{
            width: 58, height: 58,
            background: 'rgba(255,255,255,0.04)',
            border: '2px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
          }} />
          <div style={dpadBtnStyle()}>▶</div>
        </div>
      </div>

      {/* RIGHT — Attack buttons */}
      <div
        ref={buttonsRef}
        style={{
          pointerEvents: 'auto',
          touchAction: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
        }}
      >
        {/* Top row: Block + Jump */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div data-btn="block" style={attackBtnStyle('100,180,255', 52)}>
            <span>🛡</span>
            <span>BLK</span>
          </div>
          <div data-btn="jump" style={attackBtnStyle('180,255,180', 52)}>
            <span>↑</span>
            <span>JMP</span>
          </div>
        </div>
        {/* Bottom row: Light + Heavy + Special */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div data-btn="light" style={attackBtnStyle('255,200,50', 60)}>
            <span>⚡</span>
            <span>LGT</span>
          </div>
          <div data-btn="heavy" style={attackBtnStyle('255,100,50', 66)}>
            <span>💥</span>
            <span>HVY</span>
          </div>
          <div data-btn="special" style={attackBtnStyle('255,50,150', 72)}>
            <span>★</span>
            <span>SPC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
