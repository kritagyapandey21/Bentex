# Auto-Save Feature

## Overview

The auto-save feature automatically detects when a candle completes and saves it to the database without any manual intervention. This ensures all completed candles are persisted and broadcast to connected clients.

## How It Works

1. **Time-Based Detection**: Every second, the system checks the current candle index
2. **Candle Completion**: When transitioning to a new candle (index increases), the previous candle is completed
3. **Automatic Saving**: The completed candle is generated deterministically and saved to the database
4. **WebSocket Broadcast**: All connected clients receive the `candle_completed` event
5. **Seamless Updates**: Charts automatically update with the new completed candle

## Configuration

Default settings in `server/src/auto_save.js`:

```javascript
{
  symbol: 'BTCUSD',
  timeframeMinutes: 1,
  version: 'v1',
  volatility: 0.02,
  priceDecimals: 2,
  initialPrice: 42000,
}
```

### Customizing Settings

```javascript
import { configureAutoSave } from './auto_save.js';

configureAutoSave({
  symbol: 'ETHUSD',
  timeframeMinutes: 5,
  version: 'v2',
  volatility: 0.03,
  initialPrice: 2500,
});
```

### Changing Check Interval

```javascript
import { startAutoSave } from './auto_save.js';

// Check every 500ms instead of 1000ms
startAutoSave(500);
```

## Monitoring

### Server Logs

When auto-save is enabled:
```
🤖 Auto-save enabled: checking every 1000ms
   Symbol: BTCUSD, Timeframe: 1m, Version: v1
```

When a candle is saved:
```
✓ Auto-saved candle: BTCUSD at 2025-11-09T12:56:00.000Z
```

### API Endpoint

Check the last saved candle:
```bash
GET http://localhost:3000/api/last_saved?symbol=BTCUSD&timeframeMinutes=1&version=v1
```

Response:
```json
{
  "lastSavedStartMs": 1699534560000,
  "lastSavedTime": "2025-11-09T12:56:00.000Z"
}
```

## Testing

### Manual Test

1. **Start Server**: `npm start` (auto-save starts automatically)
2. **Check Current Time**: Note the seconds (e.g., 12:56:28)
3. **Wait for Minute Boundary**: Next candle completes at 12:57:00
4. **Verify in Logs**: Look for `✓ Auto-saved candle: BTCUSD at ...`
5. **Query API**: Check `/api/last_saved` endpoint

### Automated Test

Run the test script:
```bash
node test_auto_save.js
```

This shows:
- Current time
- When the next candle will complete
- How long to wait
- How to verify the save

## Architecture

### Flow Diagram

```
Every 1 second
    ↓
Check current candle index
    ↓
Has index increased? ─No→ Continue
    ↓ Yes
Generate previous candle (deterministic)
    ↓
Save to database (idempotent)
    ↓
Broadcast to WebSocket clients
    ↓
Update prevClose for next candle
```

### Key Functions

**`checkAndSaveCandles()`**
- Compares current candle index with last saved
- Generates completed candle if index increased
- Saves to database with INSERT OR IGNORE
- Broadcasts candle_completed event

**`startAutoSave(intervalMs)`**
- Initializes with current candle index
- Sets up periodic check with setInterval
- Logs configuration on startup

**`configureAutoSave(config)`**
- Updates symbol, timeframe, version, volatility, etc.
- Allows runtime configuration changes

## Benefits

✅ **Zero Manual Effort**: No need to click "Save" buttons
✅ **Guaranteed Persistence**: Every completed candle is saved
✅ **Real-Time Updates**: Clients receive instant notifications
✅ **Idempotent**: Duplicate saves are ignored (UNIQUE constraint)
✅ **Deterministic**: Same candles every time for the same parameters
✅ **No Data Loss**: Server restarts don't affect saved candles

## Integration with Client

The demo client (`public/demo.html`) automatically receives updates:

```javascript
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'candle_completed') {
    // Auto-saved candle received
    const { candle } = message.data;
    console.log('Candle auto-saved:', candle);
    
    // Update chart
    chart.update(candle);
  }
});
```

## Disabling Auto-Save

To disable, comment out in `server/src/server.js`:

```javascript
server.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  // startAutoSave(1000); // Disabled
});
```

## Multi-Symbol Support (Future)

To auto-save multiple symbols:

```javascript
import { checkAndSaveCandles } from './auto_save.js';

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD'];

symbols.forEach(symbol => {
  configureAutoSave({ symbol });
  startAutoSave(1000);
});
```

## Troubleshooting

### Candles Not Saving

1. **Check Server Logs**: Look for error messages
2. **Verify Database**: Ensure `data/candles.db` exists and is writable
3. **Check Time**: Auto-save only triggers at candle boundaries (minute marks)
4. **Test Manually**: Use `POST /api/save_candle` to verify save logic works

### Duplicate Candles

- The UNIQUE constraint prevents duplicates
- Server logs will show if insert was skipped
- This is normal and expected behavior

### Performance

- Default 1-second interval is efficient
- For multiple symbols, consider 5-second interval
- Database saves are fast (milliseconds)

## See Also

- [API.md](./API.md) - WebSocket events
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [server/src/auto_save.js](./server/src/auto_save.js) - Source code
