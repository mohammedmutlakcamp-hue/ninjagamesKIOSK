/**
 * Persistent debug logger for the kiosk.
 *
 * Captures focus/visibility/page-lifecycle/launch/click/keyboard events
 * with high-resolution timestamps. Every 3 seconds the buffer is flushed
 * to BOTH:
 *   - localStorage  (key: "ninja-debug-log") — survives reloads
 *   - Firestore     (debug-logs/{sessionId}) — survives PC reset/power-off
 *
 * After a reset, pull the doc:
 *   firebase.firestore().collection('debug-logs').doc('<sessionId>').get()
 *
 * Or open https://ninjagamesjo.com/admin/debug-logs (admin viewer) — TBD.
 *
 * Toggle on-screen overlay by typing "ghanemdebug" anywhere on the kiosk.
 */
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export type DebugEntry = {
  ts: number;
  rel: number;
  category: string;
  msg: string;
  data?: unknown;
};

const MAX_ENTRIES = 1000;     // ring buffer cap
const FLUSH_MS    = 3000;     // persist every 3s
const LS_KEY      = 'ninja-debug-log';

const buffer: DebugEntry[] = [];
const subscribers = new Set<(entries: readonly DebugEntry[]) => void>();
let started = 0;
let sessionId = '';
let flushTimer: ReturnType<typeof setInterval> | null = null;
let dirty = false;

function shortId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function getStationId(): string {
  if (typeof window === 'undefined') return 'srv';
  // Prefer the value the C# host injected into localStorage
  const fromLS = localStorage.getItem('kiosk-station-id') || localStorage.getItem('stationId');
  if (fromLS) return fromLS;
  return 'unknown-pc';
}

function emit(entry: DebugEntry) {
  if (!started) started = entry.ts;
  entry.rel = entry.ts - started;
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  dirty = true;
  // eslint-disable-next-line no-console
  console.log(`[DBG +${entry.rel}ms] ${entry.category}: ${entry.msg}`, entry.data ?? '');
  subscribers.forEach(sub => sub(buffer));
}

export function dlog(category: string, msg: string, data?: unknown) {
  emit({ ts: Date.now(), rel: 0, category, msg, data });
}

export function getEntries(): readonly DebugEntry[] { return buffer; }
export function getSessionId(): string { return sessionId; }

export function subscribe(fn: (entries: readonly DebugEntry[]) => void): () => void {
  subscribers.add(fn);
  fn(buffer);
  return () => { subscribers.delete(fn); };
}

export function clearEntries() {
  buffer.length = 0;
  started = 0;
  dirty = true;
  subscribers.forEach(sub => sub(buffer));
}

async function flushNow(reason: string) {
  if (!dirty || buffer.length === 0) return;
  dirty = false;
  const snapshot = buffer.slice();
  // 1) localStorage — synchronous, can't fail from network
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      sessionId, station: getStationId(), savedAt: Date.now(), reason,
      entries: snapshot,
    }));
  } catch (e) {
    console.warn('debug-logger: localStorage flush failed', e);
  }
  // 2) Firestore — survives reset
  try {
    await setDoc(doc(db, 'debug-logs', sessionId), {
      sessionId,
      station: getStationId(),
      ua: navigator.userAgent,
      url: location.href,
      startedAt: started,
      lastFlush: Date.now(),
      lastFlushServer: serverTimestamp(),
      reason,
      count: snapshot.length,
      entries: snapshot,
    });
  } catch (e) {
    console.warn('debug-logger: firestore flush failed', e);
  }
}

let installed = false;
export function installLifecycleListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  sessionId = `${getStationId()}-${shortId()}`;

  dlog('init', 'logger installed', {
    sessionId,
    station: getStationId(),
    ua: navigator.userAgent,
    href: location.href,
    visible: document.visibilityState,
    hasFocus: document.hasFocus(),
    hasElectronAPI: !!(window as any).electronAPI,
    screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
    inner: { w: window.innerWidth, h: window.innerHeight },
  });

  document.addEventListener('visibilitychange', () => {
    dlog('visibility', document.visibilityState, { hidden: document.hidden });
  });
  window.addEventListener('focus', () => dlog('focus', 'window.focus'));
  window.addEventListener('blur', () => dlog('blur', 'window.blur'));
  window.addEventListener('pageshow', (e) => dlog('lifecycle', 'pageshow', { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener('pagehide', (e) => dlog('lifecycle', 'pagehide', { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener('beforeunload', () => { dlog('lifecycle', 'beforeunload'); flushNow('beforeunload'); });
  window.addEventListener('online', () => dlog('net', 'online'));
  window.addEventListener('offline', () => dlog('net', 'offline'));
  window.addEventListener('error', (e) => dlog('error', 'window.error', { msg: e.message, src: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => dlog('error', 'unhandledrejection', { reason: String((e as PromiseRejectionEvent).reason) }));
  window.addEventListener('resize', () => dlog('resize', `${window.innerWidth}x${window.innerHeight}`));

  // Click — log target tag + classes (helps see what was clicked just before black screen)
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!t) return;
    dlog('click', `${t.tagName}${t.id ? '#' + t.id : ''}${t.className && typeof t.className === 'string' ? '.' + t.className.split(' ').slice(0, 2).join('.') : ''}`, {
      x: e.clientX, y: e.clientY,
      text: (t.innerText || '').slice(0, 40),
    });
  }, true);

  // Track render gap — gap > 200ms means main thread stalled (likely the black screen)
  let lastFrame = performance.now();
  const frameCheck = () => {
    const now = performance.now();
    const gap = now - lastFrame;
    if (gap > 200) dlog('frame', `render gap ${Math.round(gap)}ms`, { wasVisible: !document.hidden, hasFocus: document.hasFocus() });
    lastFrame = now;
    requestAnimationFrame(frameCheck);
  };
  requestAnimationFrame(frameCheck);

  // Periodic heartbeat — proves the loop is alive even when nothing else fires
  let beat = 0;
  setInterval(() => {
    beat++;
    dlog('heartbeat', `beat #${beat}`, {
      visible: document.visibilityState,
      focus: document.hasFocus(),
      activeTag: (document.activeElement as HTMLElement | null)?.tagName,
      bodyChildren: document.body?.children.length ?? 0,
    });
  }, 5000);

  // Sample what's at the center of the viewport — if it's a black overlay, log it
  setInterval(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
    if (!el) return;
    const cs = getComputedStyle(el);
    dlog('paint-sample', `${el.tagName}.${(el.className || '').toString().split(' ').slice(0, 2).join('.')}`, {
      bg: cs.backgroundColor,
      opacity: cs.opacity,
      z: cs.zIndex,
      pos: cs.position,
      rect: { w: el.clientWidth, h: el.clientHeight },
    });
  }, 4000);

  // Patch electronAPI calls so we can correlate launch/return with focus loss
  try {
    const api: any = (window as any).electronAPI;
    if (api && !api.__patched) {
      for (const key of ['launchGame', 'returnToKiosk', 'killSwitch', 'minimize', 'restore']) {
        const orig = api[key];
        if (typeof orig === 'function') {
          api[key] = function(...args: unknown[]) {
            dlog('bridge', `electronAPI.${key}`, args);
            return orig.apply(this, args);
          };
        }
      }
      api.__patched = true;
    }
  } catch (e) {
    dlog('error', 'failed to patch electronAPI', { err: String(e) });
  }

  // Auto-flush every 3 seconds + on every important event we explicitly call
  flushTimer = setInterval(() => flushNow('interval'), FLUSH_MS);

  // Also flush on visibility change so we catch the moment of blackness
  document.addEventListener('visibilitychange', () => flushNow('visibility:' + document.visibilityState));
  window.addEventListener('blur', () => flushNow('blur'));

  (window as any).__ninjaDebug = {
    getEntries, clearEntries, dlog, flushNow,
    sessionId: () => sessionId,
    download: () => {
      const blob = new Blob([JSON.stringify(buffer, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ninja-debug-${sessionId}.json`;
      a.click();
    },
  };
}
