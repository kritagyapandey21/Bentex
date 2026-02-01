/**
 * API Routes - Save candle endpoint
 */

import express from 'express';
import { saveCandle } from '../db.js';
import { broadcastCandleCompleted } from '../ws.js';

const router = express.Router();

/**
 * POST /api/save_candle
 * Idempotent save for completed candle
 * Body: { meta: {symbol, timeframeMinutes, version}, candle: {start_time_ms, open, high, low, close, volume} }
 */
router.post('/save_candle', (req, res) => {
  const { meta, candle } = req.body;

  // Validation
  if (!meta || !candle) {
    return res.status(400).json({ error: 'Missing meta or candle in request body' });
  }

  const { symbol, timeframeMinutes, version } = meta;
  if (!symbol || !timeframeMinutes || !version) {
    return res.status(400).json({ error: 'Missing required meta fields: symbol, timeframeMinutes, version' });
  }

  const { start_time_ms, open, high, low, close } = candle;
  if (
    start_time_ms === undefined ||
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined
  ) {
    return res.status(400).json({
      error: 'Missing required candle fields: start_time_ms, open, high, low, close',
    });
  }

  // Validate numeric types
  if (
    typeof start_time_ms !== 'number' ||
    typeof open !== 'number' ||
    typeof high !== 'number' ||
    typeof low !== 'number' ||
    typeof close !== 'number'
  ) {
    return res.status(400).json({ error: 'Candle OHLC values must be numbers' });
  }

  // Validate OHLC relationships
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return res.status(400).json({ error: 'Invalid OHLC relationship (high must be >= max(o,c), low <= min(o,c))' });
  }

  try {
    // Idempotent save
    const result = saveCandle(meta, candle);

    // Broadcast to WebSocket clients if newly inserted
    if (result.inserted) {
      broadcastCandleCompleted({ meta, candle });
    }

    res.json({ ok: true, inserted: result.inserted });
  } catch (error) {
    console.error('Error in POST /api/save_candle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
