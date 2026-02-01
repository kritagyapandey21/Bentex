/**
 * Main server application
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { runMigrations } from './db.js';
import { initWebSocket } from './ws.js';
import ohlcRoutes from './routes/ohlc.js';
import saveCandleRoutes from './routes/save_candle.js';
import { startAutoSave } from './auto_save.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api', ohlcRoutes);
app.use('/api', saveCandleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// Static files for client demo
app.use(express.static('public'));

// Initialize database
console.log('Initializing database...');
runMigrations();

// Create HTTP server and attach WebSocket
const server = createServer(app);
initWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`✓ API: http://localhost:${PORT}/api/ohlc`);
  console.log(`✓ Demo: http://localhost:${PORT}/demo.html`);
  
  // Start automatic candle saving
  startAutoSave(1000); // Check every second
});

export default app;
