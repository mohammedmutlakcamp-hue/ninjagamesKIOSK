const { PeerServer } = require('peer');

const PORT = process.env.PEER_PORT ? parseInt(process.env.PEER_PORT, 10) : 9000;
const PATH = process.env.PEER_PATH || '/peerjs';

const server = PeerServer({
  port: PORT,
  path: PATH,
  allow_discovery: true,
  proxied: false,
  // Keep connections alive
  alive_timeout: 60000,
  expire_timeout: 5000,
  // Allow CORS from any origin (LAN usage)
  corsOptions: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  },
});

server.on('connection', (client) => {
  console.log(`[PEER] Connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
  console.log(`[PEER] Disconnected: ${client.getId()}`);
});

server.on('error', (err) => {
  console.error('[PEER] Server error:', err.message);
});

console.log(`[PEER] PeerJS signaling server running on port ${PORT} at ${PATH}`);
console.log(`[PEER] Clients connect to: ws://<LAN-IP>:${PORT}${PATH}`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[PEER] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[PEER] Shutting down...');
  process.exit(0);
});
