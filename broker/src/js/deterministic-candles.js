/**
 * Deterministic OHLC Candle Generator
 * 
 * Generates identical time-series candles for the same seed across all browsers and sessions.
 * No server storage required - pure client-side deterministic generation.
 * 
 * Seed format: symbol|timeframe|history_version|rangeStartISO|rangeEndISO
 * Example: "BTCUSD|1m|v1|2025-11-01|2025-11-09"
 */

/**
 * xmur3 hash function - converts string to seed
 * @param {string} str - Input string to hash
 * @returns {function} - Function that returns 32-bit hash values
 */
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    }
    return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

/**
 * sfc32 - Simple Fast Counter PRNG
 * @param {number} a - Seed component 1
 * @param {number} b - Seed component 2
 * @param {number} c - Seed component 3
 * @param {number} d - Seed component 4
 * @returns {function} - Function that returns random number in [0,1)
 */
function sfc32(a, b, c, d) {
    return function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        let t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    };
}

/**
 * Create seeded RNG from string
 * @param {string} seedString - Seed string
 * @returns {function} - RNG function returning [0,1)
 */
function createSeededRNG(seedString) {
    const seed = xmur3(seedString);
    return sfc32(seed(), seed(), seed(), seed());
}

/**
 * Box-Muller transform to get normally distributed random value
 * @param {function} rng - Random number generator [0,1)
 * @returns {number} - Normally distributed value (mean=0, stddev=1)
 */
function boxMuller(rng) {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generate deterministic OHLC candle series
 * @param {Object} params - Generation parameters
 * @param {string} params.seedString - Seed for deterministic generation
 * @param {number} params.startTimestampMs - Start timestamp in milliseconds
 * @param {number} params.candleCount - Number of candles to generate
 * @param {number} params.timeframeMinutes - Timeframe in minutes (1, 5, 15, etc.)
 * @param {number} params.startPrice - Starting price
 * @param {number} params.volatility - Volatility factor (e.g., 0.002 for 0.2%)
 * @param {number} [params.decimals=2] - Number of decimal places for prices
 * @param {boolean} [params.includeVolume=false] - Whether to generate volume data
 * @returns {Array<Object>} - Array of candle objects
 */
function generateSeries({
    seedString,
    startTimestampMs,
    candleCount,
    timeframeMinutes,
    startPrice,
    volatility,
    decimals = 2,
    includeVolume = false
}) {
    const rng = createSeededRNG(seedString);
    const candles = [];
    const baseMinutes = 1; // Base volatility is per-minute
    const timeframeMs = timeframeMinutes * 60 * 1000;
    
    let prevClose = startPrice;
    
    for (let i = 0; i < candleCount; i++) {
        const time = startTimestampMs + (i * timeframeMs);
        
        // Generate normally distributed price move
        const z = boxMuller(rng);
        const volatilityAdjusted = volatility * Math.sqrt(timeframeMinutes / baseMinutes);
        const pctMove = z * volatilityAdjusted;
        
        // Calculate OHLC
        const open = prevClose;
        const close = prevClose * (1 + pctMove);
        
        // Deterministic intraday wiggle factors
        const absZ = Math.abs(z);
        const wiggleFactor = rng() * 0.3 + 0.1; // [0.1, 0.4]
        const intradayHighFactor = (absZ * volatilityAdjusted * wiggleFactor) * (rng() > 0.3 ? 1 : 0.5);
        const intradayLowFactor = (absZ * volatilityAdjusted * wiggleFactor) * (rng() > 0.3 ? 1 : 0.5);
        
        const high = Math.max(open, close) * (1 + intradayHighFactor);
        const low = Math.min(open, close) * (1 - intradayLowFactor);
        
        // Round to specified decimals
        const candle = {
            time: time,
            open: parseFloat(open.toFixed(decimals)),
            high: parseFloat(high.toFixed(decimals)),
            low: parseFloat(low.toFixed(decimals)),
            close: parseFloat(close.toFixed(decimals))
        };
        
        // Optional volume generation
        if (includeVolume) {
            // Volume correlates with price movement
            const baseVolume = 1000000;
            const volumeVariance = (absZ + 1) * (rng() * 0.5 + 0.75);
            candle.volume = Math.floor(baseVolume * volumeVariance);
        }
        
        candles.push(candle);
        prevClose = close;
    }
    
    return candles;
}

/**
 * Generate deterministic live candle update
 * Updates the current candle based on elapsed time since candle start
 * 
 * @param {Object} params - Update parameters
 * @param {string} params.seedString - Same seed used for historical data
 * @param {Object} params.lastCandle - Last complete candle
 * @param {number} params.nowMs - Current timestamp in milliseconds
 * @param {number} params.timeframeMinutes - Timeframe in minutes
 * @param {number} params.volatility - Volatility factor
 * @param {number} [params.decimals=2] - Decimal places
 * @returns {Object} - Updated live candle
 */
function generateLiveUpdate({
    seedString,
    lastCandle,
    nowMs,
    timeframeMinutes,
    volatility,
    decimals = 2
}) {
    const timeframeMs = timeframeMinutes * 60 * 1000;
    const candleStartTime = lastCandle.time + timeframeMs;
    
    // If nowMs is before next candle, return last candle
    if (nowMs < candleStartTime) {
        return lastCandle;
    }
    
    // Calculate progress through current candle [0, 1]
    const elapsedMs = nowMs - candleStartTime;
    const progress = Math.min(elapsedMs / timeframeMs, 1);
    
    // Create deterministic seed for this specific candle
    const liveSeed = `${seedString}|live|${candleStartTime}`;
    const rng = createSeededRNG(liveSeed);
    
    // Generate the full move for this candle
    const z = boxMuller(rng);
    const baseMinutes = 1;
    const volatilityAdjusted = volatility * Math.sqrt(timeframeMinutes / baseMinutes);
    const fullPctMove = z * volatilityAdjusted;
    
    // Apply progress factor for partial candle
    const currentPctMove = fullPctMove * progress;
    
    const open = lastCandle.close;
    const close = open * (1 + currentPctMove);
    
    // Intraday wiggles based on RNG
    const absZ = Math.abs(z);
    const wiggleFactor = rng() * 0.3 + 0.1;
    const intradayHighFactor = (absZ * volatilityAdjusted * wiggleFactor * progress) * (rng() > 0.3 ? 1 : 0.5);
    const intradayLowFactor = (absZ * volatilityAdjusted * wiggleFactor * progress) * (rng() > 0.3 ? 1 : 0.5);
    
    const high = Math.max(open, close) * (1 + intradayHighFactor);
    const low = Math.min(open, close) * (1 - intradayLowFactor);
    
    return {
        time: candleStartTime,
        open: parseFloat(open.toFixed(decimals)),
        high: parseFloat(high.toFixed(decimals)),
        low: parseFloat(low.toFixed(decimals)),
        close: parseFloat(close.toFixed(decimals)),
        isLive: true,
        progress: progress
    };
}

/**
 * Derive appropriate start price based on date range (for historical accuracy)
 * @param {string} symbol - Trading symbol
 * @param {string} dateISO - Date in ISO format (YYYY-MM-DD)
 * @param {number} basePrice - Base price for reference
 * @returns {number} - Adjusted start price
 */
function deriveStartPrice(symbol, dateISO, basePrice = 42000) {
    // Create deterministic seed for price derivation
    const seed = `${symbol}|price|${dateISO}`;
    const rng = createSeededRNG(seed);
    
    // Deterministic drift based on date
    const drift = (rng() - 0.5) * 0.3; // ±15% max drift
    return basePrice * (1 + drift);
}

/**
 * Create seed string from components
 * @param {string} symbol - Trading symbol (e.g., "BTCUSD")
 * @param {string} timeframe - Timeframe (e.g., "1m", "5m", "1h")
 * @param {string} version - History version (e.g., "v1")
 * @param {string} rangeStart - Range start date ISO (YYYY-MM-DD)
 * @param {string} rangeEnd - Range end date ISO (YYYY-MM-DD)
 * @returns {string} - Seed string
 */
function createSeedString(symbol, timeframe, version, rangeStart, rangeEnd) {
    return `${symbol}|${timeframe}|${version}|${rangeStart}|${rangeEnd}`;
}

/**
 * Convert timeframe string to minutes
 * @param {string} timeframe - Timeframe string (e.g., "1m", "5m", "1h", "1d")
 * @returns {number} - Minutes
 */
function timeframeToMinutes(timeframe) {
    const match = timeframe.match(/^(\d+)([mhd])$/);
    if (!match) throw new Error(`Invalid timeframe: ${timeframe}`);
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 'm': return value;
        case 'h': return value * 60;
        case 'd': return value * 60 * 24;
        default: throw new Error(`Unknown unit: ${unit}`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateSeries,
        generateLiveUpdate,
        deriveStartPrice,
        createSeedString,
        timeframeToMinutes,
        // Expose internals for testing
        _internals: {
            xmur3,
            sfc32,
            createSeededRNG,
            boxMuller
        }
    };
}

// Browser global export
if (typeof window !== 'undefined') {
    window.DeterministicCandles = {
        generateSeries,
        generateLiveUpdate,
        deriveStartPrice,
        createSeedString,
        timeframeToMinutes
    };
}
