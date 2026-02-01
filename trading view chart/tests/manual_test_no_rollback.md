# Manual Test: No Rollback on Refresh

This test verifies that completed candles persist and the partial candle continues seamlessly after browser refresh.

## Prerequisites

1. Server running on `http://localhost:3000`
2. Database initialized (run `npm run migrate` if needed)

## Test Steps

### Step 1: Initial Load
1. Open browser to `http://localhost:3000/demo.html`
2. Wait for chart to load (should show ~200 candles)
3. Note the current time and candle position

### Step 2: Let Candles Complete
1. Wait for 5 minutes (5 one-minute candles to complete)
2. During this time, click "Save Current Candle" button 5 times (once per minute when candle changes)
3. Verify WebSocket shows "Connected"
4. Note the last 5 candle values (write down their close prices)

### Step 3: Refresh Browser
1. Press F5 or Ctrl+R to refresh the page
2. Chart should reload from server

### Step 4: Verify No Rollback
✅ **PASS Criteria:**
- The 5 saved candles appear exactly as before refresh
- No backward jump in the chart
- The current forming candle continues from the correct position
- No visual "reset" or "jump back" in the partial candle

❌ **FAIL Criteria:**
- Saved candles disappear or change values
- Chart jumps backward in time
- Partial candle starts from a different position than expected
- Visual discontinuity or gap in the chart

### Step 5: Verify Persistence
1. Open new browser tab to `http://localhost:3000/demo.html`
2. Both tabs should show identical historical candles
3. Both tabs should show the same current partial candle (within ~1 second)

## Expected Results

- **Determinism**: Multiple refreshes show identical historical data
- **Persistence**: Saved candles survive browser refresh
- **Continuity**: Partial candle continues seamlessly (no rollback)
- **Sync**: Multiple clients see the same data

## Troubleshooting

If test fails:
1. Check server console for errors
2. Verify database file exists: `server/data/candles.db`
3. Check browser console for errors
4. Verify WebSocket connection status
5. Try clearing browser cache and repeat test
