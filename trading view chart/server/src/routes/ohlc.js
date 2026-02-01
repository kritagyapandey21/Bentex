/**
 * API Routes - OHLC data endpoints
 */

import express from 'express';
import {
  generateSeries,
  generatePartialCandle,
  getCandleIndex,
  getCandleStartTime,
} from '../shared/generator.js';
import { getCandles, getLastSavedCandle } from '../db.js';

const router = express.Router();

/**
 * GET /api/ohlc
 * Returns persisted candles + optional server-side partial
 * Query params: symbol, timeframeMinutes, start, end, version, [includePartial]
 */
router.get('/ohlc', (req, res) => {
  const {
    symbol,
    timeframeMinutes: tfStr,
    start: startStr,
    end: endStr,
    version = 'v1',
    includePartial = 'true',
  } = req.query;

  // Validation
  if (!symbol || !tfStr || !startStr || !endStr) {
    return res.status(400).json({
      error: 'Missing required parameters: symbol, timeframeMinutes, start, end',
    });
  }

  const timeframeMinutes = parseInt(tfStr, 10);
  const startMs = parseInt(startStr, 10);
  const endMs = parseInt(endStr, 10);

  if (isNaN(timeframeMinutes) || isNaN(startMs) || isNaN(endMs)) {
    return res.status(400).json({ error: 'Invalid numeric parameters' });
  }

  if (timeframeMinutes <= 0 || startMs < 0 || endMs <= startMs) {
    return res.status(400).json({ error: 'Invalid parameter values' });
  }

  try {
    // Get persisted candles from DB
    const persistedCandles = getCandles({
      symbol,
      timeframeMinutes,
      version,
      startMs,
      endMs,
      limit: 10000,
    });

    const serverTimeMs = Date.now();
    const timeframeMs = timeframeMinutes * 60 * 1000;

    // Determine current candle index
    const currentCandleIndex = getCandleIndex(serverTimeMs, timeframeMinutes);
    const currentCandleStartMs = getCandleStartTime(currentCandleIndex, timeframeMinutes);

    let partial = null;

    // Generate server-side partial if requested and within range
    if (
      includePartial === 'true' &&
      currentCandleStartMs >= startMs &&
      currentCandleStartMs < endMs
    ) {
      // Get previous close (from last persisted or generate)
      const lastSaved = getLastSavedCandle({ symbol, timeframeMinutes, version });
      
      let prevClose;
      if (lastSaved && lastSaved.start_time_ms < currentCandleStartMs) {
        prevClose = lastSaved.close;
      } else {
        // Fallback: use initial price (in production, you'd store this in config)
        prevClose = symbol === 'BTCUSD' ? 42000 : 100;
      }

      const seedBase = `${symbol}|${timeframeMinutes}|${version}|`;

      partial = generatePartialCandle({
        seedBase,
        index: currentCandleIndex,
        prevClose,
        candleStartMs: currentCandleStartMs,
        serverTimeMs,
        timeframeMs,
        volatility: 0.02,
        timeframeMinutes,
        priceDecimals: 2,
      });
    }

    res.json({
      symbol,
      timeframeMinutes,
      version,
      serverTimeMs,
      candles: persistedCandles,
      partial,
    });
  } catch (error) {
    console.error('Error in GET /api/ohlc:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/last_saved
 * Returns the latest persisted candle
 * Query params: symbol, timeframeMinutes, version
 */
router.get('/last_saved', (req, res) => {
  const { symbol, timeframeMinutes: tfStr, version = 'v1' } = req.query;

  if (!symbol || !tfStr) {
    return res.status(400).json({ error: 'Missing required parameters: symbol, timeframeMinutes' });
  }

  const timeframeMinutes = parseInt(tfStr, 10);
  if (isNaN(timeframeMinutes)) {
    return res.status(400).json({ error: 'Invalid timeframeMinutes' });
  }

  try {
    const lastCandle = getLastSavedCandle({ symbol, timeframeMinutes, version });

    if (!lastCandle) {
      return res.json({ symbol, timeframeMinutes, version, lastCandle: null });
    }

    res.json({
      symbol,
      timeframeMinutes,
      version,
      lastCandle,
    });
  } catch (error) {
    console.error('Error in GET /api/last_saved:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
