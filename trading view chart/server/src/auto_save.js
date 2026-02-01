/**
 * Automatic candle saver
 * Monitors time and saves completed candles automatically
 */

import { saveCandle } from './db.js';
import { generateDeterministicCandle, getCandleIndex, getCandleStartTime } from './shared/generator.js';
import { broadcastCandleCompleted } from './ws.js';

// Configuration
const config = {
  symbol: 'BTCUSD',
  timeframeMinutes: 1,
  version: 'v1',
  volatility: 0.02,
  priceDecimals: 2,
  initialPrice: 42000,
};

let lastSavedCandleIndex = -1;
let prevClose = config.initialPrice;

/**
 * Check and save completed candles
 */
export function checkAndSaveCandles() {
  const serverTimeMs = Date.now();
  const currentCandleIndex = getCandleIndex(serverTimeMs, config.timeframeMinutes);
  
  // If we're on a new candle, save the previous one
  if (currentCandleIndex > lastSavedCandleIndex && lastSavedCandleIndex >= 0) {
    // Generate and save the completed candle (previous index)
    const completedCandleIndex = currentCandleIndex - 1;
    const completedCandleStartMs = getCandleStartTime(completedCandleIndex, config.timeframeMinutes);
    
    const seedBase = `${config.symbol}|${config.timeframeMinutes}|${config.version}|`;
    
    const candle = generateDeterministicCandle({
      seedBase,
      index: completedCandleIndex,
      prevClose,
      volatility: config.volatility,
      timeframeMinutes: config.timeframeMinutes,
      priceDecimals: config.priceDecimals,
      startTimeMs: completedCandleStartMs,
    });
    
    const meta = {
      symbol: config.symbol,
      timeframeMinutes: config.timeframeMinutes,
      version: config.version,
    };
    
    try {
      const result = saveCandle(meta, candle);
      
      if (result.inserted) {
        console.log(`✓ Auto-saved candle: ${config.symbol} at ${new Date(completedCandleStartMs).toISOString()}`);
        
        // Broadcast to WebSocket clients
        broadcastCandleCompleted({ meta, candle });
        
        // Update prevClose for next candle
        prevClose = candle.close;
      }
    } catch (error) {
      console.error('Error auto-saving candle:', error);
    }
  }
  
  // Update last saved index
  if (currentCandleIndex > lastSavedCandleIndex) {
    lastSavedCandleIndex = currentCandleIndex;
  }
}

/**
 * Start automatic candle saving
 * @param {number} intervalMs - Check interval in milliseconds (default: 1000ms)
 */
export function startAutoSave(intervalMs = 1000) {
  console.log(`🤖 Auto-save enabled: checking every ${intervalMs}ms`);
  console.log(`   Symbol: ${config.symbol}, Timeframe: ${config.timeframeMinutes}m, Version: ${config.version}`);
  
  // Initialize with current candle index
  const serverTimeMs = Date.now();
  lastSavedCandleIndex = getCandleIndex(serverTimeMs, config.timeframeMinutes);
  
  // Check periodically
  setInterval(checkAndSaveCandles, intervalMs);
}

/**
 * Configure auto-save settings
 * @param {Object} newConfig - Configuration object
 */
export function configureAutoSave(newConfig) {
  Object.assign(config, newConfig);
  console.log('✓ Auto-save configuration updated:', config);
}
