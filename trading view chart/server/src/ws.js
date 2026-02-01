/**
 * WebSocket server for real-time candle updates
 */

import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle subscription messages if needed
        if (data.type === 'subscribe') {
          ws.subscription = data.subscription || {};
          console.log('Client subscribed:', data.subscription);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', serverTimeMs: Date.now() }));
  });

  console.log('✓ WebSocket server initialized on /ws');
}

/**
 * Broadcast completed candle to all connected clients
 * @param {Object} payload - {meta, candle}
 */
export function broadcastCandleCompleted(payload) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'candle_completed',
    meta: payload.meta,
    candle: payload.candle,
  });

  clients.forEach((client) => {
    if (client.readyState === 1) {
      // WebSocket.OPEN
      // Optional: filter by subscription
      // For now, broadcast to all
      client.send(message);
    }
  });

  console.log(`Broadcasted candle_completed: ${payload.meta.symbol} ${payload.candle.start_time_ms}`);
}

/**
 * Get count of connected clients
 */
export function getClientCount() {
  return clients.size;
}
