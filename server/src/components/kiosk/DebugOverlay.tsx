'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribe, clearEntries, type DebugEntry } from '@/lib/debug-logger';

const CATEGORY_COLOR: Record<string, string> = {
  visibility: '#FFD700',
  focus: '#39FF14',
  blur: '#FF4D4D',
  lifecycle: '#7F7FFF',
  bridge: '#00E5FF',
  frame: '#FF8C00',
  error: '#FF1F1F',
  net: '#A0A0A0',
  init: '#9CFFB5',
};

export function DebugOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<readonly DebugEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(setEntries), []);

  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        width: 520,
        height: 360,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.92)',
        border: '1px solid #39FF14',
        borderRadius: 8,
        boxShadow: '0 0 30px rgba(57,255,20,0.4)',
        fontFamily: 'Consolas, monospace',
        fontSize: 11,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          background: 'rgba(57,255,20,0.15)',
          borderBottom: '1px solid rgba(57,255,20,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: '#39FF14', fontWeight: 'bold' }}>NINJA DEBUG · {entries.length}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => clearEntries()}
            style={{ background: 'transparent', color: '#FFD700', border: '1px solid #FFD700', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
          >clear</button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: '#FF4D4D', border: '1px solid #FF4D4D', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
          >×</button>
        </div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ color: '#888', minWidth: 60 }}>+{e.rel}ms</span>
            <span style={{ color: CATEGORY_COLOR[e.category] || '#fff', minWidth: 70, fontWeight: 'bold' }}>{e.category}</span>
            <span style={{ flex: 1, wordBreak: 'break-all' }}>
              {e.msg}
              {e.data !== undefined && e.data !== '' ? <span style={{ color: '#888' }}> {typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}</span> : null}
            </span>
          </div>
        ))}
        {entries.length === 0 && <div style={{ color: '#888', padding: 8 }}>(no events)</div>}
      </div>
      <div style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.04)', color: '#888', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        type ghanemdebug to toggle · window.__ninjaDebug.getEntries()
      </div>
    </div>
  );
}
