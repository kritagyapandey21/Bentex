/**
 * Populate database with historical candles
 */

import { saveCandle } from './db.js';
import { generateDeterministicCandle, getCandleStartTime } from './shared/generator.js';

const config = {
  symbol: 'BTCUSD',
  timeframeMinutes: 1,
  version: 'v1',
  volatility: 0.02,
  priceDecimals: 2,
  initialPrice: 42000,
  numCandles: 1000,
};

/**
 * Populate historical candles
 */
async function populateHistory() {
  console.log('🔄 Populating historical candles...');
  console.log(`   Symbol: ${config.symbol}`);
  console.log(`   Timeframe: ${config.timeframeMinutes} minute(s)`);
  console.log(`   Version: ${config.version}`);
  console.log(`   Number of candles: ${config.numCandles}`);
  
  const now = Date.now();
  const timeframeMs = config.timeframeMinutes * 60 * 1000;
  
  // Calculate starting point (1000 candles ago)
  const startIndex = Math.floor(now / timeframeMs) - config.numCandles;
  
  const seedBase = `${config.symbol}|${config.timeframeMinutes}|${config.version}|`;
  let prevClose = config.initialPrice;
  
  let inserted = 0;
  let skipped = 0;
  
  console.log(`\n📊 Generating candles from index ${startIndex}...`);
  const startTime = Date.now();
  
  for (let i = 0; i < config.numCandles; i++) {
    const candleIndex = startIndex + i;
    const startTimeMs = getCandleStartTime(candleIndex, config.timeframeMinutes);
    
    // Generate candle
    const candle = generateDeterministicCandle({
      seedBase,
      index: candleIndex,
      prevClose,
      volatility: config.volatility,
      timeframeMinutes: config.timeframeMinutes,
      priceDecimals: config.priceDecimals,
      startTimeMs,
    });
    
    const meta = {
      symbol: config.symbol,
      timeframeMinutes: config.timeframeMinutes,
      version: config.version,
    };
    
    try {
      const result = saveCandle(meta, candle);
      
      if (result.inserted) {
        inserted++;
        prevClose = candle.close;
        
        // Progress indicator every 100 candles
        if ((i + 1) % 100 === 0) {
          console.log(`   ✓ ${i + 1}/${config.numCandles} candles processed...`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error saving candle ${candleIndex}:`, error);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n✅ Population complete!`);
  console.log(`   Inserted: ${inserted} candles`);
  console.log(`   Skipped: ${skipped} (already existed)`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   First candle: ${new Date(getCandleStartTime(startIndex, config.timeframeMinutes)).toISOString()}`);
  console.log(`   Last candle: ${new Date(getCandleStartTime(startIndex + config.numCandles - 1, config.timeframeMinutes)).toISOString()}`);
  
  process.exit(0);
}

// Run immediately
populateHistory().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

export { populateHistory };
