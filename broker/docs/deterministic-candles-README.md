# Deterministic OHLC Candle Generator

A pure client-side JavaScript module that generates identical time-series candles across all browsers and page refreshes. No server storage required.

## Features

✅ **Deterministic Generation** - Same seed always produces identical candles  
✅ **Pure Client-Side** - No server storage or API calls needed  
✅ **Cryptographically Seeded** - Uses xmur3 + sfc32 RNG with Box-Muller transform  
✅ **Version Control** - Bump version to change all historical data  
✅ **Live Updates** - Deterministic real-time candle updates  
✅ **Multiple Timeframes** - Support for 1m, 5m, 15m, 1h, 4h, 1d, etc.  
✅ **Volume Generation** - Optional deterministic volume data  
✅ **Tested** - Comprehensive test suite included

## Installation

```javascript
// Include in your HTML
<script src="src/js/deterministic-candles.js"></script>

// Or use as module
import { generateSeries, generateLiveUpdate } from './deterministic-candles.js';
```

## Quick Start

```javascript
// Create a seed string
const seedString = DeterministicCandles.createSeedString(
    'BTCUSD',     // symbol
    '1m',         // timeframe (1m, 5m, 15m, 1h, 4h, 1d)
    'v1',         // version (bump to regenerate all history)
    '2025-11-09', // range start (YYYY-MM-DD)
    '2025-11-09'  // range end (YYYY-MM-DD)
);

// Generate candles
const candles = DeterministicCandles.generateSeries({
    seedString: seedString,
    startTimestampMs: new Date('2025-11-09T00:00:00Z').getTime(),
    candleCount: 1440,        // number of candles to generate
    timeframeMinutes: 1,       // candle duration in minutes
    startPrice: 42000,         // starting price
    volatility: 0.002,         // volatility factor (0.2%)
    decimals: 2,               // price decimal places
    includeVolume: true        // generate volume data
});

console.log(candles);
// [{time: 1731110400000, open: 42000, high: 42010.52, low: 41989.32, close: 41995.11, volume: 1234567}, ...]
```

## Seed Strategy

The seed string format ensures deterministic generation:

```
symbol|timeframe|version|rangeStartISO|rangeEndISO
```

**Examples:**
```javascript
"BTCUSD|1m|v1|2025-11-09|2025-11-09"    // Bitcoin 1-minute for today
"ETHUSD|5m|v1|2025-11-01|2025-11-09"    // Ethereum 5-minute for date range
"GBPUSD|1h|v2|2025-11-09|2025-11-09"    // GBP/USD 1-hour, version 2
```

### Version Control

Bumping the version changes **all** generated candles:

```javascript
// Version 1 generates one set of candles
const v1Seed = "BTCUSD|1m|v1|2025-11-09|2025-11-09";

// Version 2 generates completely different candles
const v2Seed = "BTCUSD|1m|v2|2025-11-09|2025-11-09";
```

## API Reference

### `generateSeries(params)`

Generates a complete candle series.

**Parameters:**
- `seedString` (string) - Deterministic seed
- `startTimestampMs` (number) - Start timestamp in milliseconds
- `candleCount` (number) - Number of candles to generate
- `timeframeMinutes` (number) - Candle timeframe in minutes
- `startPrice` (number) - Starting price
- `volatility` (number) - Volatility factor (e.g., 0.002 = 0.2%)
- `decimals` (number, optional) - Price decimal places (default: 2)
- `includeVolume` (boolean, optional) - Generate volume data (default: false)

**Returns:** Array of candle objects

### `generateLiveUpdate(params)`

Generates deterministic live candle updates.

**Parameters:**
- `seedString` (string) - Same seed as historical data
- `lastCandle` (object) - Last completed candle
- `nowMs` (number) - Current timestamp in milliseconds
- `timeframeMinutes` (number) - Candle timeframe in minutes
- `volatility` (number) - Volatility factor
- `decimals` (number, optional) - Price decimal places (default: 2)

**Returns:** Live candle object with `isLive` and `progress` properties

### `deriveStartPrice(symbol, dateISO, basePrice)`

Derives a deterministic start price for a given date (useful for historical accuracy).

**Parameters:**
- `symbol` (string) - Trading symbol
- `dateISO` (string) - Date in YYYY-MM-DD format
- `basePrice` (number) - Base reference price

**Returns:** Adjusted start price

### `createSeedString(symbol, timeframe, version, rangeStart, rangeEnd)`

Creates a properly formatted seed string.

**Parameters:**
- `symbol` (string) - Trading symbol
- `timeframe` (string) - Timeframe (1m, 5m, 1h, etc.)
- `version` (string) - Version identifier
- `rangeStart` (string) - Start date (YYYY-MM-DD)
- `rangeEnd` (string) - End date (YYYY-MM-DD)

**Returns:** Seed string

### `timeframeToMinutes(timeframe)`

Converts timeframe string to minutes.

**Parameters:**
- `timeframe` (string) - Timeframe string (e.g., "1m", "5m", "1h", "1d")

**Returns:** Number of minutes

## Integration with lightweight-charts

```javascript
// Initialize chart
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: 800,
    height: 400,
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    }
});

const candlestickSeries = chart.addCandlestickSeries({
    upColor: '#22d3a7',
    downColor: '#ef476f',
});

// Generate and display candles
const candles = DeterministicCandles.generateSeries({
    seedString: 'BTCUSD|1m|v1|2025-11-09|2025-11-09',
    startTimestampMs: new Date('2025-11-09T00:00:00Z').getTime(),
    candleCount: 1440,
    timeframeMinutes: 1,
    startPrice: 42000,
    volatility: 0.002
});

// Convert to lightweight-charts format (timestamps in seconds)
const chartData = candles.map(c => ({
    time: Math.floor(c.time / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
}));

candlestickSeries.setData(chartData);
chart.timeScale().fitContent();
```

## Live Updates Example

```javascript
const seedString = 'BTCUSD|1m|v1|2025-11-09|2025-11-09';
let lastCandle = candles[candles.length - 1];

setInterval(() => {
    const liveCandle = DeterministicCandles.generateLiveUpdate({
        seedString: seedString,
        lastCandle: lastCandle,
        nowMs: Date.now(),
        timeframeMinutes: 1,
        volatility: 0.002
    });
    
    // Update chart
    candlestickSeries.update({
        time: Math.floor(liveCandle.time / 1000),
        open: liveCandle.open,
        high: liveCandle.high,
        low: liveCandle.low,
        close: liveCandle.close
    });
    
    console.log(`Progress: ${(liveCandle.progress * 100).toFixed(1)}%`);
}, 1000);
```

## Technical Details

### RNG Implementation

1. **xmur3** - String hashing function that converts seed string to four 32-bit integers
2. **sfc32** - Simple Fast Counter PRNG that generates uniform random numbers in [0,1)
3. **Box-Muller** - Transform to convert uniform random to normal distribution

### Price Generation Algorithm

```
1. Generate normally distributed z-score: z = boxMuller(rng)
2. Adjust volatility for timeframe: vol = volatility * sqrt(timeframe / baseTimeframe)
3. Calculate percent move: pctMove = z * vol
4. Calculate close: close = previousClose * (1 + pctMove)
5. Calculate open: open = previousClose
6. Add intraday wiggles for high/low using deterministic factors
7. Ensure: high >= max(open, close) and low <= min(open, close)
```

### Candle Continuity

Each candle's `open` equals the previous candle's `close`, ensuring realistic price continuity.

## Testing

Run the test suite:

```bash
node tests/deterministic-candles.test.js
```

Tests verify:
- ✅ Same seed produces identical output
- ✅ Different seed produces different output
- ✅ OHLC relationships are valid (high ≥ open/close, low ≤ open/close)
- ✅ Candle continuity (open = previous close)
- ✅ Timestamp progression
- ✅ Volume generation is deterministic
- ✅ Live updates are deterministic
- ✅ Version control works correctly
- ✅ Decimal precision is respected
- ✅ RNG produces correct distribution

## Best Practices

### 1. Cache Generated Candles

```javascript
const cache = new Map();

function getCachedCandles(seedString, params) {
    if (cache.has(seedString)) {
        return cache.get(seedString);
    }
    
    const candles = DeterministicCandles.generateSeries(params);
    cache.set(seedString, candles);
    return candles;
}
```

### 2. Use Appropriate Volatility

- **Forex pairs**: 0.001 - 0.003 (0.1% - 0.3%)
- **Crypto majors**: 0.002 - 0.005 (0.2% - 0.5%)
- **Crypto alts**: 0.005 - 0.015 (0.5% - 1.5%)
- **Stocks**: 0.001 - 0.004 (0.1% - 0.4%)

### 3. Version Management

Use semantic versioning for history changes:
- `v1` - Initial release
- `v2` - Major algorithm change
- `v2.1` - Minor tweaks

### 4. Date Range Strategy

- Use consistent date ranges for caching
- Generate only what's needed for display
- Consider pre-generating common ranges

## License

MIT License - Free to use in your projects

## Contributing

Feel free to submit issues and enhancement requests!
