'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// NINJA ARENA MOBILE CONTROLS — Virtual joystick + attack buttons
// Left half: floating joystick (drag origin)
// Right half: action buttons grid (Light, Heavy, Block, Special, Jump)
// ═══════════════════════════════════════════════════════════════════════════════

import { useRef, useCallback, useEffect } from 'react';
import type { InputState } from './NinjaArenaEngine';

interface Props {
  onInput: (input: InputState) => void;
}

export function NinjaArenaMobileControls({ onInput }: Props) {
  const stateRef = useRef<InputState>({
    left: false, right: false, up: false,
    light: false, heavy: false, block: false, special: false,
  });

  const joyBaseRef    = useRef<{ x: number; y: number } | null>(null);
  const joyTouchId    = useRef<number | null>(null);
  const joyKnobPos    = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const knobElRef     = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  const push = useCallback(() => {
    onInput({ ...stateRef.current });
  }, [onInput]);

  // ── Joystick ────────────────────────────────────────────────────────────

  const handleJoyStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joyTouchId.current = touch.identifier;
    joyBaseRef.current = { x: touch.clientX, y: touch.clientY };
    joyKnobPos.current = { x: 0, y: 0 };
    if (knobElRef.current) {
      knobElRef.current.style.transform = 'translate(-50%, -50%)';
    }
  }, []);

  const handleJoyMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!joyBaseRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== joyTouchId.current) continue;

      const dx = t.clientX - joyBaseRef.current.x;
      const dy = t.clientY - joyBaseRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = 42;
      const clampDist = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampDist;
      const ky = Math.sin(angle) * clampDist;

      if (knobElRef.current) {
        knobElRef.current.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      }

      stateRef.current.left  = dx < -18;
      stateRef.current.right = dx > 18;
      stateRef.current.up    = dy < -38;
      push();
    }
  }, [push]);

  const handleJoyEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== joyTouchId.current) continue;
      joyBaseRef.current = null;
      joyTouchId.current = null;
      if (knobElRef.current) knobElRef.current.style.transform = 'translate(-50%, -50%)';
      stateRef.current.left  = false;
      stateRef.current.right = false;
      stateRef.current.up    = false;
      push();
    }
  }, [push]);

  // ── Action buttons ───────────────────────────────────────────────────────

  const pressKey = useCallback((key: keyof InputState, down: boolean) => {
    stateRef.current[key] = down;
    push();
  }, [push]);

  // Prevent context menu & double-tap zoom on buttons
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', prevent, { passive: false });
    el.addEventListener('touchstart', prevent, { passive: false });
    return () => {
      el.removeEventListener('contextmenu', prevent);
      el.removeEventListener('touchstart', prevent);
    };
  }, []);

  const btnBase = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    fontSize: 13, fontWeight: 700, color: '#fff',
    cursor: 'pointer', touchAction: 'none' as const,
  };

  const mkBtn = (
    key: keyof InputState,
    label: string,
    color: string,
    size = 58,
  ) => (
    <div
      style={{
        ...btnBase,
        width: size, height: size,
        background: `${color}33`,
        border: `2.5px solid ${color}99`,
        boxShadow: `0 0 14px ${color}44`,
        fontSize: label.length > 2 ? 11 : 14,
      }}
      onPointerDown={(e) => { e.preventDefault(); pressKey(key, true); }}
      onPointerUp={(e)   => { e.preventDefault(); pressKey(key, false); }}
      onPointerLeave={(e) => { e.preventDefault(); pressKey(key, false); }}
      onPointerCancel={(e) => { e.preventDefault(); pressKey(key, false); }}
    >
      {label}
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
        zIndex: 25,
      }}
    >
      {/* ── LEFT: Joystick ── */}
      <div
        style={{
          position: 'absolute', bottom: 28, left: 24,
          width: 110, height: 110,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          border: '2px solid rgba(255,255,255,0.14)',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
        onTouchStart={handleJoyStart}
        onTouchMove={handleJoyMove}
        onTouchEnd={handleJoyEnd}
        onTouchCancel={handleJoyEnd}
      >
        {/* Crosshair guides */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)', marginTop: -0.5 }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)', marginLeft: -0.5 }} />
        </div>
        {/* Knob */}
        <div
          ref={knobElRef}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(255,255,255,0.22)',
            border: '2px solid rgba(255,255,255,0.35)',
            boxShadow: '0 0 10px rgba(255,255,255,0.15)',
            transition: 'none',
          }}
        />
      </div>

      {/* ── RIGHT: Attack buttons ── */}
      <div
        style={{
          position: 'absolute', bottom: 20, right: 18,
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      >
        {/* Layout:
              [  JUMP  ]
           [BLOCK] [HEAVY]
           [LIGHT] [★SPEC]
        */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 62px)', gridTemplateRows: 'repeat(3, 62px)', gap: 6 }}>
          {/* Row 1: Jump spans full width */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
            {mkBtn('up', '↑ JUMP', '#44AAFF', 62)}
          </div>
          {/* Row 2 */}
          {mkBtn('block', '🛡', '#8844CC', 58)}
          {mkBtn('heavy', 'HEAVY', '#FF3333', 58)}
          {/* Row 3 */}
          {mkBtn('light', 'LIGHT', '#FFAA00', 58)}
          {mkBtn('special', '★', '#FF6600', 58)}
        </div>
      </div>

      {/* Controls hint (fades after 4s) */}
      <div
        style={{
          position: 'absolute', bottom: 148, left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 10,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        Drag left = move · Right buttons = attack
      </div>
    </div>
  );
}
