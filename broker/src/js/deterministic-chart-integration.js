/**
 * Integration layer: Deterministic Candles + Pro Chart
 * 
 * This module integrates the deterministic candle generator with the main
 * Tanix trading platform chart, ensuring all users see identical chart data.
 */

// Check if deterministic candles are loaded
if (typeof window.DeterministicCandles === 'undefined') {
    console.error('DeterministicCandles module not loaded! Load deterministic-candles.js first.');
}

const DeterministicChartIntegration = {
    // Configuration
    config: {
        historyVersion: 'v1', // Bump this to regenerate all historical data
        defaultVolatility: 0.002, // 0.2% default volatility
        defaultDecimals: 2,
        cacheDuration: 5 * 60 * 1000, // Cache for 5 minutes
    },

    // Cache for generated candles
    cache: new Map(),

    /**
     * Get deterministic candles for a symbol and timeframe
     * @param {string} symbol - Asset symbol (e.g., 'BTCUSD', 'OTC-AAPL')
     * @param {string} timeframe - Timeframe (e.g., '1m', '5m', '1h')
     * @param {number} candleCount - Number of candles to generate
     * @param {number} startPrice - Starting price (optional, will derive if not provided)
     * @param {string} startDate - Start date in YYYY-MM-DD format (default: today)
     * @returns {Array} Array of candle objects
     */
    getCandles(symbol, timeframe, candleCount = 300, startPrice = null, startDate = null) {
        // Normalize symbol (remove OTC- prefix for consistency)
        const normalizedSymbol = symbol.replace('OTC-', '');
        
        // Use today's date if not provided
        if (!startDate) {
            const now = new Date();
            startDate = now.toISOString().split('T')[0];
        }
        
        // Create cache key
        const cacheKey = `${normalizedSymbol}|${timeframe}|${this.config.historyVersion}|${startDate}|${candleCount}`;
        
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.config.cacheDuration) {
            console.log('📦 Using cached candles:', cacheKey);
            return cached.candles;
        }
        
        // Derive start price if not provided
        if (!startPrice) {
            startPrice = this.deriveStartPrice(normalizedSymbol, startDate);
        }
        
        // Create seed string
        const seedString = window.DeterministicCandles.createSeedString(
            normalizedSymbol,
            timeframe,
            this.config.historyVersion,
            startDate,
            startDate
        );
        
        // Calculate start timestamp (beginning of day)
        const startTimestampMs = new Date(`${startDate}T00:00:00Z`).getTime();
        
        // Get timeframe in minutes
        const timeframeMinutes = window.DeterministicCandles.timeframeToMinutes(timeframe);
        
        // Get volatility for symbol
        const volatility = this.getVolatilityForSymbol(normalizedSymbol);
        
        // Generate candles
        console.log('🎲 Generating deterministic candles:', {
            symbol: normalizedSymbol,
            timeframe,
            candleCount,
            startPrice,
            volatility,
            seedString
        });
        
        const candles = window.DeterministicCandles.generateSeries({
            seedString: seedString,
            startTimestampMs: startTimestampMs,
            candleCount: candleCount,
            timeframeMinutes: timeframeMinutes,
            startPrice: startPrice,
            volatility: volatility,
            decimals: this.config.defaultDecimals,
            includeVolume: true
        });
        
        // Cache the result
        this.cache.set(cacheKey, {
            candles: candles,
            timestamp: Date.now()
        });
        
        console.log(`✅ Generated ${candles.length} deterministic candles`);
        
        return candles;
    },

    /**
     * Get live candle update (deterministic)
     * @param {string} symbol - Asset symbol
     * @param {string} timeframe - Timeframe
     * @param {Object} lastCandle - Last completed candle
     * @param {number} nowMs - Current timestamp
     * @param {string} startDate - Start date for seed
     * @returns {Object} Live candle
     */
    getLiveCandle(symbol, timeframe, lastCandle, nowMs, startDate = null) {
        const normalizedSymbol = symbol.replace('OTC-', '');
        
        if (!startDate) {
            const now = new Date();
            startDate = now.toISOString().split('T')[0];
        }
        
        const seedString = window.DeterministicCandles.createSeedString(
            normalizedSymbol,
            timeframe,
            this.config.historyVersion,
            startDate,
            startDate
        );
        
        const timeframeMinutes = window.DeterministicCandles.timeframeToMinutes(timeframe);
        const volatility = this.getVolatilityForSymbol(normalizedSymbol);
        
        return window.DeterministicCandles.generateLiveUpdate({
            seedString: seedString,
            lastCandle: lastCandle,
            nowMs: nowMs,
            timeframeMinutes: timeframeMinutes,
            volatility: volatility,
            decimals: this.config.defaultDecimals
        });
    },

    /**
     * Derive appropriate start price for a symbol
     * @param {string} symbol - Asset symbol
     * @param {string} dateISO - Date in YYYY-MM-DD format
     * @returns {number} Start price
     */
    deriveStartPrice(symbol, dateISO) {
        // Base prices for common symbols
        const basePrices = {
            'BTCUSD': 42000,
            'ETHUSD': 2800,
            'EURUSD': 1.08,
            'GBPUSD': 1.26,
            'USDJPY': 150.0,
            'AAPL': 189.0,
            'GOOGL': 140.0,
            'MSFT': 380.0,
            'TSLA': 240.0,
            'AMZN': 155.0,
            'GOLD': 2050.0,
            'SILVER': 24.0,
            'OIL': 82.0,
        };
        
        const basePrice = basePrices[symbol] || 100.0;
        
        // Use deterministic price derivation
        return window.DeterministicCandles.deriveStartPrice(symbol, dateISO, basePrice);
    },

    /**
     * Get appropriate volatility for a symbol type
     * @param {string} symbol - Asset symbol
     * @returns {number} Volatility factor
     */
    getVolatilityForSymbol(symbol) {
        const upper = symbol.toUpperCase();
        
        // Crypto - higher volatility
        if (upper.includes('BTC') || upper.includes('ETH') || upper.includes('CRYPTO')) {
            return 0.003; // 0.3%
        }
        
        // Forex - low volatility
        if (upper.includes('USD') || upper.includes('EUR') || upper.includes('GBP') || 
            upper.includes('JPY') || upper.includes('CHF') || upper.includes('CAD')) {
            return 0.0015; // 0.15%
        }
        
        // Commodities - medium volatility
        if (upper.includes('GOLD') || upper.includes('SILVER') || upper.includes('OIL')) {
            return 0.0025; // 0.25%
        }
        
        // Stocks - medium volatility
        return 0.002; // 0.2%
    },

    /**
     * Convert deterministic candles to ProChart format
     * @param {Array} candles - Deterministic candles
     * @returns {Array} ProChart formatted candles
     */
    toProChartFormat(candles) {
        return candles.map(candle => ({
            timestamp: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume || Math.floor(Math.random() * 1000000) + 500000
        }));
    },

    /**
     * Clear cache (call when changing version)
     */
    clearCache() {
        this.cache.clear();
        console.log('🗑️ Cache cleared');
    },

    /**
     * Change history version (regenerates all data)
     * @param {string} newVersion - New version string (e.g., 'v2')
     */
    setVersion(newVersion) {
        this.config.historyVersion = newVersion;
        this.clearCache();
        console.log(`📝 History version updated to: ${newVersion}`);
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.DeterministicChartIntegration = DeterministicChartIntegration;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeterministicChartIntegration;
}
