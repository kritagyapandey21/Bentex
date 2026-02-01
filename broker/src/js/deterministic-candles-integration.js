/**
 * Integration example for lightweight-charts
 * 
 * This file demonstrates how to integrate the deterministic candle generator
 * with the lightweight-charts library.
 */

/**
 * Example 1: Load historical data and display on chart
 */
function exampleBasicIntegration() {
    // Create seed string
    const seedString = DeterministicCandles.createSeedString(
        'BTCUSD',     // symbol
        '1m',         // timeframe
        'v1',         // version
        '2025-11-09', // range start
        '2025-11-09'  // range end
    );
    
    // Generate candles
    const candles = DeterministicCandles.generateSeries({
        seedString: seedString,
        startTimestampMs: new Date('2025-11-09T00:00:00Z').getTime(),
        candleCount: 1440, // Full day at 1-minute intervals
        timeframeMinutes: 1,
        startPrice: 42000,
        volatility: 0.002,
        decimals: 2,
        includeVolume: true
    });
    
    // Create chart
    const chart = LightweightCharts.createChart(document.getElementById('chart-container'), {
        width: 800,
        height: 400,
        layout: {
            background: { color: '#1a1a1a' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: '#2b2b43' },
            horzLines: { color: '#2b2b43' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        }
    });
    
    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22d3a7',
        downColor: '#ef476f',
        borderVisible: false,
        wickUpColor: '#22d3a7',
        wickDownColor: '#ef476f',
    });
    
    // Convert timestamps to seconds for lightweight-charts
    const chartData = candles.map(candle => ({
        time: Math.floor(candle.time / 1000), // Convert ms to seconds
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
    }));
    
    candlestickSeries.setData(chartData);
    
    // Optional: Add volume series
    if (candles[0].volume) {
        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });
        
        const volumeData = candles.map(candle => ({
            time: Math.floor(candle.time / 1000),
            value: candle.volume,
            color: candle.close >= candle.open ? '#22d3a766' : '#ef476f66'
        }));
        
        volumeSeries.setData(volumeData);
    }
    
    chart.timeScale().fitContent();
    
    return { chart, candlestickSeries, candles };
}

/**
 * Example 2: Live updating chart
 */
function exampleLiveUpdates() {
    const { chart, candlestickSeries, candles } = exampleBasicIntegration();
    
    const seedString = DeterministicCandles.createSeedString(
        'BTCUSD', '1m', 'v1', '2025-11-09', '2025-11-09'
    );
    
    // Update live candle every second
    setInterval(() => {
        const lastCandle = candles[candles.length - 1];
        const nowMs = Date.now();
        
        const liveCandle = DeterministicCandles.generateLiveUpdate({
            seedString: seedString,
            lastCandle: lastCandle,
            nowMs: nowMs,
            timeframeMinutes: 1,
            volatility: 0.002,
            decimals: 2
        });
        
        // Update chart with live candle
        candlestickSeries.update({
            time: Math.floor(liveCandle.time / 1000),
            open: liveCandle.open,
            high: liveCandle.high,
            low: liveCandle.low,
            close: liveCandle.close
        });
        
        console.log('Live update:', liveCandle.progress * 100, '%');
    }, 1000);
}

/**
 * Example 3: Multiple timeframes with version control
 */
function exampleMultipleTimeframes() {
    const symbol = 'ETHUSD';
    const version = 'v1';
    const rangeStart = '2025-11-01';
    const rangeEnd = '2025-11-09';
    const basePrice = 2800;
    
    const timeframes = [
        { tf: '1m', minutes: 1, count: 1440 },
        { tf: '5m', minutes: 5, count: 288 },
        { tf: '15m', minutes: 15, count: 96 },
        { tf: '1h', minutes: 60, count: 24 }
    ];
    
    const results = {};
    
    timeframes.forEach(({ tf, minutes, count }) => {
        const seedString = DeterministicCandles.createSeedString(
            symbol, tf, version, rangeStart, rangeEnd
        );
        
        const candles = DeterministicCandles.generateSeries({
            seedString: seedString,
            startTimestampMs: new Date('2025-11-09T00:00:00Z').getTime(),
            candleCount: count,
            timeframeMinutes: minutes,
            startPrice: basePrice,
            volatility: 0.0025,
            decimals: 2
        });
        
        results[tf] = candles;
        console.log(`${tf}: Generated ${candles.length} candles`);
    });
    
    return results;
}

/**
 * Example 4: Chart switching with cached data
 */
class DeterministicChartManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.cache = new Map();
        this.chart = null;
        this.series = null;
    }
    
    initialize() {
        this.chart = LightweightCharts.createChart(
            document.getElementById(this.containerId),
            {
                width: 800,
                height: 400,
                layout: {
                    background: { color: '#1a1a1a' },
                    textColor: '#d1d4dc',
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                }
            }
        );
        
        this.series = this.chart.addCandlestickSeries({
            upColor: '#22d3a7',
            downColor: '#ef476f',
            borderVisible: false,
            wickUpColor: '#22d3a7',
            wickDownColor: '#ef476f',
        });
    }
    
    loadSymbol(symbol, timeframe, startDate, endDate, version = 'v1') {
        const cacheKey = `${symbol}|${timeframe}|${version}|${startDate}|${endDate}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            console.log('Loading from cache:', cacheKey);
            const candles = this.cache.get(cacheKey);
            this.updateChart(candles);
            return candles;
        }
        
        // Generate new candles
        console.log('Generating candles:', cacheKey);
        const seedString = DeterministicCandles.createSeedString(
            symbol, timeframe, version, startDate, endDate
        );
        
        const timeframeMinutes = DeterministicCandles.timeframeToMinutes(timeframe);
        const startPrice = DeterministicCandles.deriveStartPrice(symbol, startDate, 42000);
        
        const startTimestampMs = new Date(`${startDate}T00:00:00Z`).getTime();
        const endTimestampMs = new Date(`${endDate}T23:59:59Z`).getTime();
        const candleCount = Math.floor((endTimestampMs - startTimestampMs) / (timeframeMinutes * 60 * 1000)) + 1;
        
        const candles = DeterministicCandles.generateSeries({
            seedString: seedString,
            startTimestampMs: startTimestampMs,
            candleCount: candleCount,
            timeframeMinutes: timeframeMinutes,
            startPrice: startPrice,
            volatility: 0.002,
            decimals: 2,
            includeVolume: true
        });
        
        // Cache the result
        this.cache.set(cacheKey, candles);
        this.updateChart(candles);
        
        return candles;
    }
    
    updateChart(candles) {
        const chartData = candles.map(candle => ({
            time: Math.floor(candle.time / 1000),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close
        }));
        
        this.series.setData(chartData);
        this.chart.timeScale().fitContent();
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.DeterministicChartExamples = {
        exampleBasicIntegration,
        exampleLiveUpdates,
        exampleMultipleTimeframes,
        DeterministicChartManager
    };
}
