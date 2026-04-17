// Ninja Games Kiosk — LAN TURN server
//
// Runs alongside Next.js on the server PC. Listens on UDP+TCP 3478 and relays
// WebRTC media between kiosk PCs when direct P2P can't work (router NAT
// hairpinning off, AP isolation, etc.).
//
// Start manually:    node turn-server.js
// Auto-start:        see INSTALL-TURN-SERVICE.bat in this folder
//
// Credentials MUST match the username/credential in server/src/components/
// kiosk/KioskVoiceCall.tsx + server/src/lib/voice-call.ts.

'use strict';

const Turn = require('node-turn');
const os = require('os');

// Grab the LAN IPv4 so clients connect by IP not 0.0.0.0
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '0.0.0.0';
}

const TURN_USER = 'ninja';
const TURN_PASS = 'CHANGE-ME-LAN-TURN-SECRET'; // keep in sync with frontend config

const server = new Turn({
  authMech: 'long-term',
  credentials: { [TURN_USER]: TURN_PASS },
  listeningPort: 3478,
  listeningIps: ['0.0.0.0'],
  relayIps: [getLanIp()],
  minPort: 49152,
  maxPort: 65535,
  debugLevel: 'INFO',
});

server.start();

console.log(`[TURN] listening on 3478 (UDP+TCP), relay IP ${getLanIp()}`);
console.log(`[TURN] credentials: ${TURN_USER} / ${TURN_PASS}`);
console.log('[TURN] update frontend iceServers if you change these.');
