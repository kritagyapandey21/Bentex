/**
 * ========================================
 * DETERMINISTIC-CHART.JS - Integration Layer
 * ========================================
 * Integrates deterministic candle generation with existing chart system
 */

// Deterministic chart client
const DeterministicChartClient = {
    enabled: false,
    currentAsset: null,
    timeframeMinutes: 1,
    version: 'v1',
    volatility: 0.02,
    priceDecimals: 5,
    partialUpdateInterval: null,
    lastServerTime: null,

    /**
     * Enable deterministic chart mode
     */
    enable() {
        this.enabled = true;
        logActivity('Deterministic chart mode enabled');
    },

    /**
     * Disable deterministic chart mode
     */
    disable() {
        this.enabled = false;
        this.stopPartialUpdates();
        logActivity('Deterministic chart mode disabled');
    },

    /**
     * Load deterministic chart for asset
     */
    async load(assetId, initialPrice, timeframeMinutes = 1) {
        if (!this.enabled) return;

        this.currentAsset = assetId;
        this.timeframeMinutes = timeframeMinutes;

        try {
            // Fetch OHLC data from server
            const response = await fetch(`/api/ohlc?asset=${assetId}&timeframe=${timeframeMinutes}`);
            const data = await response.json();

            if (data.candles && Array.isArray(data.candles)) {
                // Convert server candles to chart format
                const chartCandles = data.candles.map(c => ({
                    time: c.time || Math.floor(c.start_time_ms / 1000),
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                }));

                // Update chart with deterministic candles
                if (window.App && App.Chart) {
                    App.Chart.ingestServerSnapshot({
                        candles: chartCandles,
                        interval_seconds: timeframeMinutes * 60,
                    });
                } else {
                    // Fallback to legacy chartData
                    chartData = chartCandles;
                    if (typeof drawChart === 'function') {
                        drawChart();
                    }
                }

                this.lastServerTime = data.serverTimeMs;

                // Start partial candle updates
                this.startPartialUpdates(data.partial);

                logActivity(`Loaded ${chartCandles.length} deterministic candles for ${assetId}`);
            }
        } catch (error) {
            logError(`Failed to load deterministic chart: ${error.message}`);
        }
    },

    /**
     * Generate client-side candles (for fallback or testing)
     */
    generateClientCandles(assetId, initialPrice, count = 500, timeframeMinutes = 1) {
        const now = Date.now();
        const startTimeMs = now - (count * timeframeMinutes * 60 * 1000);

        const candles = generateSeries({
            symbol: assetId,
            timeframeMinutes: timeframeMinutes,
            version: this.version,
            startTimeMs: startTimeMs,
            count: count,
            initialPrice: initialPrice,
            volatility: this.volatility,
            priceDecimals: this.priceDecimals,
        });

        return candles.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));
    },

    /**
     * Start partial candle updates
     */
    startPartialUpdates(initialPartial = null) {
        this.stopPartialUpdates();

        if (!this.currentAsset) return;

        // Update partial candle every second
        this.partialUpdateInterval = setInterval(() => {
            this.updatePartialCandle();
        }, 1000);

        // Initial update if provided
        if (initialPartial) {
            this.updatePartialCandle(initialPartial);
        }
    },

    /**
     * Stop partial candle updates
     */
    stopPartialUpdates() {
        if (this.partialUpdateInterval) {
            clearInterval(this.partialUpdateInterval);
            this.partialUpdateInterval = null;
        }
    },

    /**
     * Update the forming partial candle
     */
    updatePartialCandle(serverPartial = null) {
        if (!this.enabled || !this.currentAsset) return;

        try {
            const clientTimeMs = Date.now();
            const serverTimeMs = this.lastServerTime || clientTimeMs;
            const timeframeMs = this.timeframeMinutes * 60 * 1000;

            // Get current candle index and start time
            const currentIndex = getCandleIndex(serverTimeMs, this.timeframeMinutes);
            const candleStartMs = getCandleStartTime(currentIndex, this.timeframeMinutes);

            // Get previous close price
            let prevClose = 100; // Default fallback
            if (window.App && App.Chart && App.Chart.chartData && App.Chart.chartData.length > 0) {
                const lastCandle = App.Chart.chartData[App.Chart.chartData.length - 1];
                prevClose = lastCandle.close;
            } else if (chartData && chartData.length > 0) {
                prevClose = chartData[chartData.length - 1].close;
            }

            // Generate partial candle
            const seedBase = `${this.currentAsset}|${this.timeframeMinutes}|${this.version}|`;
            const partial = generatePartialCandle({
                seedBase,
                index: currentIndex,
                prevClose,
                candleStartMs,
                serverTimeMs: clientTimeMs,
                timeframeMs,
                volatility: this.volatility,
                timeframeMinutes: this.timeframeMinutes,
                priceDecimals: this.priceDecimals,
            });

            // Update chart with partial candle
            if (window.App && App.Chart && typeof App.Chart.updatePartialCandle === 'function') {
                App.Chart.updatePartialCandle(partial);
            } else {
                // Fallback: update current price
                if (partial && partial.close) {
                    currentPrice = partial.close;
                    if (typeof updateCurrentPriceDisplay === 'function') {
                        updateCurrentPriceDisplay(partial.close);
                    }
                }
            }
        } catch (error) {
            logError(`Partial candle update failed: ${error.message}`);
        }
    },

    /**
     * Get configuration
     */
    getConfig() {
        return {
            enabled: this.enabled,
            asset: this.currentAsset,
            timeframeMinutes: this.timeframeMinutes,
            version: this.version,
            volatility: this.volatility,
            priceDecimals: this.priceDecimals,
        };
    },
};

// Expose globally
window.DeterministicChartClient = DeterministicChartClient;

// Auto-enable on page load (optional)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Enable deterministic charts by default
        DeterministicChartClient.enable();
        logActivity('Deterministic chart client initialized');
    });
}
