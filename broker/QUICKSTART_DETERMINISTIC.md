# Quick Start - Deterministic Charts

## 🚀 Start the Server

```bash
cd zzzzzzz
python app.py
```

The server will start on `http://localhost:5000`

## 🧪 Test Deterministic Generation

```bash
cd zzzzzzz
python test_deterministic.py
```

Expected output: ✅ All candles match perfectly!

## 📊 View Charts in Browser

1. Navigate to `http://localhost:5000`
2. Login or create an account
3. The trading chart will automatically use deterministic candles

## 🔧 API Usage Examples

### Get Deterministic Candles

```bash
# Get 500 1-minute candles for BTCUSD
curl "http://localhost:5000/api/ohlc?asset=BTCUSD&timeframe=1&count=500"

# Get 5-minute candles with partial
curl "http://localhost:5000/api/ohlc?asset=EUR/USD&timeframe=5&includePartial=true"
```

### Client-Side JavaScript

```javascript
// Enable deterministic mode
DeterministicChartClient.enable();

// Load chart for an asset
await DeterministicChartClient.load('BTCUSD', 42000, 1);

// Get configuration
const config = DeterministicChartClient.getConfig();
console.log(config);
```

## ✨ Key Features

✅ **Identical candles** across all sessions and clients
✅ **No rollback** - charts maintain continuity on refresh  
✅ **Partial candles** - real-time forming candles with interpolation
✅ **Server-client consistency** - Python and JavaScript produce same results

## 🎯 Verify It Works

1. Open the trading platform in two browser windows
2. Load the same asset (e.g., BTCUSD)
3. Refresh both windows multiple times
4. **All candles should be identical** across all windows and refreshes!

## 📝 Configuration

Edit in `app.py` or via API parameters:

- **Volatility:** `0.02` (2% price movement)
- **Price Decimals:** `5` (for crypto) or `2` (for forex)
- **Timeframe:** `1` minute (or 5, 15, 60, etc.)
- **Version:** `v1` (change to `v2` for different candle sequence)

## 🐛 Troubleshooting

**Charts still random?**
- Check browser console for errors
- Verify `DeterministicChartClient.enable()` is called
- Ensure scripts are loaded in correct order

**Server errors?**
- Check Python dependencies are installed
- Verify `services/` directory has all files
- Review server logs for errors

**Candles don't match between server/client?**
- Confirm seed format is identical
- Check volatility and decimals are the same
- Verify RNG implementation matches

## 📚 Documentation

- Full docs: `DETERMINISTIC_INTEGRATION.md`
- Trading View Chart source: `../trading view chart/README.md`
- API Reference: See `/api/ohlc` endpoint in `app.py`

---

**Ready to trade with deterministic charts!** 🎉
