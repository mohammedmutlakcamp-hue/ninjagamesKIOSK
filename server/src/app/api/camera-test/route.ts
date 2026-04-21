// Camera Test Connection — verifies host/port/auth/channel for a Hikvision
// device without having to save it to Firestore first. Returns JSON so the
// admin modal can render a clear pass/fail with the actual reason.
//
// Used by the "Test Connection" button in CameraPanel.

import { NextRequest, NextResponse } from 'next/server';
import { hikFetch } from '@/lib/hik-fetch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const host = String(body.host || '').trim();
    const user = String(body.user || 'admin');
    const password = String(body.password || '');
    const port = Number(body.port) || (body.https ? 443 : 80);
    const channel = Number(body.channel) || 101;
    const https = !!body.https;

    if (!host) {
      return NextResponse.json({ ok: false, reason: 'Missing host / IP' }, { status: 400 });
    }

    // 1) Try /ISAPI/System/deviceInfo first — cheap sanity check that also
    //    tells us the device model + firmware without pulling a snapshot.
    const info = await hikFetch({
      host, port, https, user, password,
      pathWithQuery: '/ISAPI/System/deviceInfo',
      timeoutMs: 6000,
    });

    if (!info.ok) {
      return NextResponse.json({ ok: false, stage: 'deviceInfo', reason: info.reason, status: info.status });
    }

    // Parse out model/firmware/serial from the XML (quick + dirty, no deps).
    const xml = info.body ? Buffer.from(info.body).toString('utf-8') : '';
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i').exec(xml);
      return m ? m[1] : undefined;
    };
    const model = pick('model');
    const firmwareVersion = pick('firmwareVersion');
    const serialNumber = pick('serialNumber');
    const deviceName = pick('deviceName');

    // 2) Verify the specific channel can serve a snapshot.
    const snap = await hikFetch({
      host, port, https, user, password,
      pathWithQuery: `/ISAPI/Streaming/channels/${channel}/picture`,
      timeoutMs: 8000,
    });

    if (!snap.ok) {
      return NextResponse.json({
        ok: false,
        stage: 'snapshot',
        reason: snap.reason,
        status: snap.status,
        hint: snap.status === 404
          ? `Channel ${channel} not found. On a DVR/NVR, main streams are 101 (cam 1), 201 (cam 2), 301, 401…`
          : snap.status === 401
            ? 'Auth worked on /deviceInfo but failed on snapshot — some firmwares restrict snapshot permission per user. Try the admin account.'
            : undefined,
        device: { model, firmwareVersion, serialNumber, deviceName },
      });
    }

    // 3) Detect channel count from the DVR if possible, so UI can offer
    //    auto-add-all.
    let channelCount: number | undefined;
    try {
      const chList = await hikFetch({
        host, port, https, user, password,
        pathWithQuery: '/ISAPI/Streaming/channels',
        timeoutMs: 4000,
      });
      if (chList.ok && chList.body) {
        const cxml = Buffer.from(chList.body).toString('utf-8');
        // Count <StreamingChannel> entries whose id ends in 01 (main streams)
        const mainIds = Array.from(cxml.matchAll(/<id>(\d+)<\/id>/g)).map((m) => m[1]);
        channelCount = mainIds.filter((id) => id.endsWith('01') && id !== '101' ? true : id === '101').length;
        if (!channelCount) channelCount = mainIds.length > 0 ? Math.max(...mainIds.map(Number).filter((n) => n % 100 === 1).map((n) => Math.floor(n / 100))) : undefined;
      }
    } catch { /* optional */ }

    return NextResponse.json({
      ok: true,
      snapshotBytes: snap.body?.byteLength || 0,
      device: { model, firmwareVersion, serialNumber, deviceName },
      channelCount,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, reason: err?.message || 'Unknown error' }, { status: 500 });
  }
}
