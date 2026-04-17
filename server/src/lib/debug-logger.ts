/**
 * Lightweight ring-buffer debug logger.
 *
 * Captures focus/visibility/page lifecycle events plus arbitrary app
 * events with high-resolution timestamps so we can diagnose the
 * "black screen for 3s when switching windows" bug.
 *
 * Logs are exposed on window.__ninjaDebug for console inspection and
 * mirrored to console.log. The DebugOverlay component renders a
 * scrolling on-screen view, toggled by typing "ghanemdebug".
 */

export type DebugEntry = {
  ts: number;        // epoch ms
  rel: number;       // ms since first log
  category: string;
  msg: string;
  data?: unknown;
};

const MAX_ENTRIES = 300;
const buffer: DebugEntry[] = [];
const subscribers = new Set<(entries: readonly DebugEntry[]) => void>();
let started = 0;

function emit(entry: DebugEntry) {
  if (!started) started = entry.ts;
  entry.rel = entry.ts - started;
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  // eslint-disable-next-line no-console
  console.log(`[DBG +${entry.rel}ms] ${entry.category}: ${entry.msg}`, entry.data ?? '');
  subscribers.forEach(sub => sub(buffer));
}

export function dlog(category: string, msg: string, data?: unknown) {
  emit({ ts: Date.now(), rel: 0, category, msg, data });
}

export function getEntries(): readonly DebugEntry[] {
  return buffer;
}

export function subscribe(fn: (entries: readonly DebugEntry[]) => void): () => void {
  subscribers.add(fn);
  fn(buffer);
  return () => { subscribers.delete(fn); };
}

export function clearEntries() {
  buffer.length = 0;
  started = 0;
  subscribers.forEach(sub => sub(buffer));
}

let installed = false;
export function installLifecycleListeners() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  dlog('init', 'logger installed', {
    ua: navigator.userAgent,
    href: location.href,
    visible: document.visibilityState,
    hasFocus: document.hasFocus(),
    hasElectronAPI: !!(window as any).electronAPI,
  });

  document.addEventListener('visibilitychange', () => {
    dlog('visibility', document.visibilityState, { hidden: document.hidden });
  });
  window.addEventListener('focus', () => dlog('focus', 'window.focus'));
  window.addEventListener('blur', () => dlog('blur', 'window.blur'));
  window.addEventListener('pageshow', (e) => dlog('lifecycle', 'pageshow', { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener('pagehide', (e) => dlog('lifecycle', 'pagehide', { persisted: (e as PageTransitionEvent).persisted }));
  window.addEventListener('beforeunload', () => dlog('lifecycle', 'beforeunload'));
  window.addEventListener('online', () => dlog('net', 'online'));
  window.addEventListener('offline', () => dlog('net', 'offline'));
  window.addEventListener('error', (e) => dlog('error', 'window.error', { msg: e.message, src: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => dlog('error', 'unhandledrejection', { reason: String((e as PromiseRejectionEvent).reason) }));

  // Track tab/popup transitions (rendering pauses correlate to compositor stalls)
  let lastFrame = performance.now();
  const frameCheck = () => {
    const now = performance.now();
    const gap = now - lastFrame;
    if (gap > 250) dlog('frame', `render gap ${Math.round(gap)}ms`);
    lastFrame = now;
    requestAnimationFrame(frameCheck);
  };
  requestAnimationFrame(frameCheck);

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

  (window as any).__ninjaDebug = { getEntries, clearEntries, dlog };
}
