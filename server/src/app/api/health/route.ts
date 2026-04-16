import { NextResponse } from 'next/server';

/**
 * GET /api/health — used by external monitors (UptimeRobot, etc.) and by
 * the C# kiosk client to verify the LAN/cloud server is up before falling
 * back to the cloud URL. Returns minimal JSON so it's cheap to poll.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'ninja-games-kiosk',
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
  });
}
