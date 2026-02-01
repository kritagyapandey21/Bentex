# 🚀 Quick Start Guide

## Installation (Windows)

### Option 1: Using Batch Files (Recommended)

1. **Double-click** `install.bat` to install dependencies and initialize database
2. **Double-click** `start.bat` to start the server
3. **Open browser** to http://localhost:3000/demo.html

### Option 2: Using PowerShell

```powershell
# Enable script execution (run PowerShell as Administrator)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Then in normal PowerShell:
cd server
npm install
npm run migrate
npm start
```

### Option 3: Using Command Prompt

```cmd
cd server
npm install
npm run migrate
npm start
```

## What You'll See

1. **Server Console:**
   ```
   Initializing database...
   ✓ Database migrations completed
   ✓ WebSocket server initialized on /ws
   ✓ Server running on http://localhost:3000
   ✓ WebSocket available at ws://localhost:3000/ws
   ✓ API: http://localhost:3000/api/ohlc
   ✓ Demo: http://localhost:3000/demo.html
   ```

2. **Browser (http://localhost:3000/demo.html):**
   - Live candlestick chart with 200 candles
   - Real-time updating partial candle (updates every second)
   - WebSocket status: Connected ✅
   - Controls to change symbol, timeframe, version

## Test the System

### Quick Test
1. Load demo.html
2. Click "Save Current Candle" button
3. Refresh the page (F5)
4. ✅ Chart should show the same candles (no rollback!)

### Run Automated Tests
**Double-click** `test.bat` or run:
```cmd
cd server
npm test
```

Should see:
```
✅ PASS: Determinism: Same seed produces identical candles
✅ PASS: Idempotent save prevents duplicates
✅ PASS: Valid OHLC relationships
... (8 tests total)
✨ All tests passed!
```

## Next Steps

1. **Try different timeframes**: Change dropdown in demo (1m, 5m, 15m, 1h)
2. **Test multi-client sync**: Open demo.html in two browser tabs
3. **Save candles**: Click "Save Current Candle" to persist
4. **Verify persistence**: Refresh and see saved candles
5. **Customize volatility**: Edit `server/src/routes/ohlc.js` (see README.md)

## Troubleshooting

**Port 3000 already in use:**
```powershell
# Change PORT in server/src/server.js or set environment variable
$env:PORT=3001; npm start
```

**Database errors:**
```cmd
cd server
npm run migrate
```

**WebSocket not connecting:**
- Check firewall settings
- Ensure server is running
- Check browser console for errors

## Documentation

See **README.md** for:
- Complete API reference
- Architecture details
- Production deployment guide
- Advanced configuration

## Support

Having issues? Check:
1. Node.js version: `node --version` (should be 18+)
2. Server logs in console
3. Browser console (F12) for errors
4. README.md troubleshooting section
