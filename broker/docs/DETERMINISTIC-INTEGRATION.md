# Deterministic Candle Integration

## Overview

The Tanix trading platform now uses **deterministic candle generation** to ensure all users see identical chart simulations. This provides a consistent, predictable trading experience across all sessions.

## How It Works

### 1. **Seed-Based Generation**
Every candle is generated from a seed string in the format:
```
symbol|timeframe|version|startDate|startDate
```

Example: `BTCUSD|1m|v1|2024-01-15|2024-01-15`

### 2. **Components**

#### Core Module: `deterministic-candles.js`
- **Purpose**: Pure deterministic OHLC candle generation
- **Features**:
  - xmur3 hash function (string → seed)
  - sfc32 PRNG (uniform random numbers)
  - Box-Muller transform (normal distribution)
  - Reproducible time-series generation
  - Live candle updates (deterministic)

#### Integration Layer: `deterministic-chart-integration.js`
- **Purpose**: Bridge between deterministic module and ProChart
- **Features**:
  - Symbol-based volatility selection
  - Price derivation for different asset types
  - Caching (5-minute TTL)
  - Format conversion (deterministic → ProChart)
  - Version control for regeneration

#### Modified Chart: `pro-chart.js`
- **Changes**:
  - `generateHistoricalData()` now uses deterministic candles when available
  - `tickFormingCandle()` uses deterministic live updates
  - Falls back to random generation if deterministic module not loaded
  - Console logs indicate which mode is active

## Key Features

### ✅ Consistency
- **Same seed = Same candles**: Every user sees identical charts
- **Cross-device**: Works consistently on desktop, mobile, tablet
- **Cross-browser**: Works in Chrome, Firefox, Safari, Edge

### ✅ Deterministic Live Updates
- Live candles update deterministically based on timestamp
- Progress through candle is deterministic (not random)
- All users see the same live movement

### ✅ Version Control
- Change `historyVersion` to regenerate all data
- Useful for testing or updates
- Users can switch between different versions

### ✅ Volatility Profiles
Different asset types have appropriate volatility:
- **Crypto**: 0.3% (high volatility)
- **Forex**: 0.15% (low volatility)
- **Commodities**: 0.25% (medium volatility)
- **Stocks**: 0.2% (medium volatility)

### ✅ Caching
- Generated candles cached for 5 minutes
- Reduces computation
- Can be cleared with `DeterministicChartIntegration.clearCache()`

## Usage

### Basic Integration (Already Done)
The integration is automatic. When you load the trading page:

1. `deterministic-candles.js` loads first
2. `deterministic-chart-integration.js` loads second
3. `pro-chart.js` detects their presence and uses them
4. Charts become deterministic automatically

### Manual Control

#### Change History Version
```javascript
// Regenerate all charts with new data
DeterministicChartIntegration.setVersion('v2');
// Charts will refresh with new candles
```

#### Clear Cache
```javascript
// Force regeneration on next load
DeterministicChartIntegration.clearCache();
```

#### Get Candles Directly
```javascript
const candles = DeterministicChartIntegration.getCandles(
    'BTCUSD',  // symbol
    '5m',      // timeframe
    300,       // candle count
    42000,     // start price (optional)
    '2024-01-15' // start date (optional, defaults to today)
);
```

## Testing Multi-User Consistency

### Test 1: Same Browser, Different Windows
1. Open trading page in multiple windows
2. Select same asset and timeframe
3. Verify all windows show identical candles
4. ✅ Should match perfectly

### Test 2: Different Browsers
1. Open in Chrome, Firefox, Edge
2. Select same asset and timeframe
3. Compare candle values
4. ✅ Should match exactly

### Test 3: Different Devices
1. Open on desktop and mobile
2. Select same asset and timeframe
3. Compare charts
4. ✅ Should be identical

### Test 4: Live Candle Sync
1. Open in two windows
2. Watch the forming candle
3. Verify both update identically
4. ✅ Live movements should sync

## Console Logs

Watch the browser console for these messages:

```
🎲 Using deterministic candle generation
✅ Generated 300 deterministic candles for BTCUSD 1m
📦 Using cached candles: BTCUSD|1m|v1|2024-01-15|300
```

If deterministic module isn't loaded:
```
⚠️ Deterministic candles not available, using random generation
Generated 300 historical candles (random)
```

## Architecture

```
┌─────────────────────────────────────────┐
│        User Opens Trading Page          │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Load: deterministic-candles.js         │
│  - xmur3 hash                           │
│  - sfc32 PRNG                           │
│  - Box-Muller transform                 │
│  - generateSeries()                     │
│  - generateLiveUpdate()                 │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Load: deterministic-chart-integration  │
│  - getCandles()                         │
│  - getLiveCandle()                      │
│  - Cache management                     │
│  - Volatility profiles                  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Load: pro-chart.js                     │
│  - Detects deterministic modules        │
│  - Uses getCandles() for history        │
│  - Uses getLiveCandle() for live        │
│  - Falls back to random if not loaded   │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  All Users See Identical Charts! ✅     │
└─────────────────────────────────────────┘
```

## Benefits

### For Users
- ✅ Consistent experience across devices
- ✅ Reproducible chart patterns
- ✅ No surprises from random data
- ✅ Fair trading simulation

### For Developers
- ✅ Easy testing (predictable data)
- ✅ Bug reproduction (same seed = same bug)
- ✅ Version control (regenerate anytime)
- ✅ No server storage needed

### For Platform
- ✅ No server-side candle storage
- ✅ Reduced API calls
- ✅ Client-side computation
- ✅ Scales to unlimited users

## Troubleshooting

### Problem: Charts still look different on different devices
**Solution**: Check console logs. If you see "random generation", the modules didn't load.

### Problem: Want to regenerate all data
**Solution**: `DeterministicChartIntegration.setVersion('v2')`

### Problem: Cache issues
**Solution**: `DeterministicChartIntegration.clearCache()`

### Problem: Live candles not syncing
**Solution**: Ensure both devices use same system time (NTP sync)

## Future Enhancements

Possible improvements:
1. **Server seed broadcast**: Server provides daily seed for ultimate consistency
2. **Historical date selection**: Pick specific date ranges
3. **Market events**: Inject deterministic "news events" at specific times
4. **User customization**: Allow users to pick volatility levels
5. **Backtesting**: Use historical seeds for strategy testing

## Files Modified

- ✅ `src/js/deterministic-candles.js` (NEW)
- ✅ `src/js/deterministic-chart-integration.js` (NEW)
- ✅ `src/js/pro-chart.js` (MODIFIED)
- ✅ `index.html` (MODIFIED - added script tags)
- ✅ `tests/deterministic-candles.test.js` (NEW)
- ✅ `demo-deterministic-candles.html` (NEW)

## Conclusion

Your Tanix trading platform now provides a **deterministic, consistent chart experience** for all users. No more random variations - everyone sees the same market simulation! 🎉
