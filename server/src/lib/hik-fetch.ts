// Hikvision-aware fetch with automatic Basic → Digest auth negotiation.
//
// Many Hikvision cameras manufactured since ~2019 ship with Digest auth as
// the default; older models used Basic. The same proxy has to handle both,
// and if the camera sends back 401 + WWW-Authenticate: Digest, we must
// re-request with a proper digest challenge response.
//
// No external deps: MD5 via Node's built-in crypto.

import crypto from 'crypto';

function md5(s: string) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function parseWwwAuth(header: string): Record<string, string> {
  // Example: Digest realm="IP Camera", qop="auth", nonce="abc123...", opaque="xyz"
  const scheme = header.split(/\s+/, 1)[0];
  const rest = header.slice(scheme.length).trim();
  const out: Record<string, string> = { _scheme: scheme };
  const re = /(\w+)=("([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? '';
  }
  return out;
}

function buildDigestHeader(params: {
  method: string;
  uri: string;
  user: string;
  password: string;
  challenge: Record<string, string>;
}): string {
  const { method, uri, user, password, challenge } = params;
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const qop = challenge.qop || '';
  const opaque = challenge.opaque;
  const algorithm = (challenge.algorithm || 'MD5').toUpperCase();
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';

  // Only MD5 + MD5-sess are handled. SHA-256 variants are possible on some
  // NVRs but the vast majority of Hik cameras still default to MD5.
  let ha1 = md5(`${user}:${realm}:${password}`);
  if (algorithm === 'MD5-SESS') {
    ha1 = md5(`${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  let auth = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (algorithm) auth += `, algorithm=${algorithm}`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (opaque !== undefined) auth += `, opaque="${opaque}"`;
  return auth;
}

export interface HikFetchResult {
  ok: boolean;
  status: number;
  /** Reason phrase for user-facing error display. */
  reason: string;
  body?: ArrayBuffer;
  contentType?: string;
}

/**
 * Fetch a Hikvision ISAPI resource, negotiating auth as needed.
 * `pathWithQuery` must start with '/'. Example: '/ISAPI/Streaming/channels/101/picture'
 */
export async function hikFetch(opts: {
  host: string;
  port: number;
  https?: boolean;
  user: string;
  password: string;
  pathWithQuery: string;
  timeoutMs?: number;
  method?: string;
}): Promise<HikFetchResult> {
  const protocol = opts.https ? 'https' : 'http';
  const port = opts.port || (opts.https ? 443 : 80);
  const method = opts.method || 'GET';
  const url = `${protocol}://${opts.host}:${port}${opts.pathWithQuery}`;
  const timeoutMs = opts.timeoutMs ?? 8000;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);

  try {
    // First attempt — unauthenticated, to see which auth the camera demands.
    let res = await fetch(url, { method, signal: ctl.signal });

    if (res.status === 401) {
      const www = res.headers.get('www-authenticate') || '';
      // Drain so keepalive doesn't leak
      await res.arrayBuffer().catch(() => {});

      if (/^\s*Digest/i.test(www)) {
        const challenge = parseWwwAuth(www);
        const digest = buildDigestHeader({
          method,
          uri: opts.pathWithQuery,
          user: opts.user,
          password: opts.password,
          challenge,
        });
        res = await fetch(url, {
          method,
          headers: { Authorization: digest },
          signal: ctl.signal,
        });
      } else {
        // Basic (or unknown — fall through with Basic)
        const b64 = Buffer.from(`${opts.user}:${opts.password}`).toString('base64');
        res = await fetch(url, {
          method,
          headers: { Authorization: `Basic ${b64}` },
          signal: ctl.signal,
        });
      }
    }

    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      if (res.status === 401) reason = 'Bad username or password (401 Unauthorized)';
      else if (res.status === 403) reason = 'Forbidden (403) — user lacks permission for this channel';
      else if (res.status === 404) reason = 'Not found (404) — wrong channel number or camera model?';
      else if (res.status === 500) reason = 'Camera internal error (500)';
      return { ok: false, status: res.status, reason };
    }

    const buf = await res.arrayBuffer();
    return {
      ok: true,
      status: res.status,
      reason: 'OK',
      body: buf,
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    let reason = 'Unreachable';
    if (err?.name === 'AbortError') reason = 'Timed out — camera not responding';
    else if (/ECONNREFUSED/i.test(msg)) reason = 'Connection refused — wrong port or HTTP service off';
    else if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) reason = 'Host not found — check IP / hostname';
    else if (/ETIMEDOUT/i.test(msg)) reason = 'Network timeout — firewall / routing issue';
    else if (/CERT_|SSL_|SELF_SIGNED/i.test(msg)) reason = 'TLS/SSL error — uncheck HTTPS or install the camera cert';
    return { ok: false, status: 0, reason };
  } finally {
    clearTimeout(t);
  }
}
