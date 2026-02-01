# TradingView-like Charts with Deterministic OHLC

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Production-ready front-end + back-end system that renders TradingView-style candlestick charts from **deterministically generated data** with **server-authoritative persistence** and **no rollback on refresh**.

## 🎯 Key Features

- **✅ Deterministic History** — Identical candles for all clients (seeded PRNG)
- **✅ Server Authoritative** — Completed candles durably persisted in database
- **✅ No Rollback** — Partial candle continues seamlessly after refresh
- **✅ Real-time Updates** — WebSocket broadcasting of completed candles
- **✅ Idempotent Persistence** — Race-safe database writes
- **✅ TradingView Compatible** — Works with both lightweight-charts and TradingView widget
- **✅ Production Ready** — Comprehensive tests, validation, error handling

## 📁 Project Structure

```
trading view chart/
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── server.js                 # Main Express server
│   │   ├── db.js                     # Database operations
│   │   ├── ws.js                     # WebSocket server
│   │   ├── migrate.js                # Migration runner
│   │   ├── shared/
│   │   │   ├── rng.js                # Deterministic RNG (xmur3, sfc32)
│   │   │   └── generator.js          # OHLC generation logic
│   │   └── routes/
│   │       ├── ohlc.js               # GET /api/ohlc, /api/last_saved
│   │       └── save_candle.js        # POST /api/save_candle
│   ├── migrations/
│   │   └── 001_create_candles.sql    # Database schema
│   ├── public/
│   │   ├── demo.html                 # Lightweight Charts demo
│   │   ├── tradingview-demo.html     # TradingView datafeed demo
│   │   ├── rng.js                    # Client-side RNG (identical to server)
│   │   └── generator.js              # Client-side generator (identical to server)
│   └── data/
│       └── candles.db                # SQLite database (auto-created)
├── tests/
│   ├── run_tests.js                  # Automated test suite
│   └── manual_test_no_rollback.md    # Manual test guide
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ with ES modules support
- npm or yarn

### Installation

```powershell
cd "server"
npm install
```

### Initialize Database

```powershell
npm run migrate
```

### Start Server

```powershell
npm start
```

Server will start on `http://localhost:3000`

### Access Demos

- **Lightweight Charts**: http://localhost:3000/demo.html
- **TradingView Datafeed**: http://localhost:3000/tradingview-demo.html
- **API Health Check**: http://localhost:3000/health

## 📊 API Reference

### `GET /api/ohlc`

Fetch historical candles + optional server-side partial candle.

**Query Parameters:**
- `symbol` (required) — Trading symbol (e.g., "BTCUSD")
- `timeframeMinutes` (required) — Timeframe in minutes (1, 5, 15, 60, etc.)
- `start` (required) — Start time in UTC milliseconds
- `end` (required) — End time in UTC milliseconds
- `version` (optional, default: "v1") — History version
- `includePartial` (optional, default: "true") — Include current forming candle

**Response:**
```json
{
  "symbol": "BTCUSD",
  "timeframeMinutes": 1,
  "version": "v1",
  "serverTimeMs": 1731050000000,
  "candles": [
    {
      "start_time_ms": 1730956800000,
      "open": 42000,
      "high": 42050,
      "low": 41990,
      "close": 42020,
      "volume": 12
    }
  ],
  "partial": {
    "start_time_ms": 1731043200000,
    "open": 42100,
    "high": 42120,
    "low": 42090,
    "close": 42110,
    "isPartial": true
  }
}
```

**Example:**
```powershell
curl "http://localhost:3000/api/ohlc?symbol=BTCUSD&timeframeMinutes=1&start=1730956800000&end=1731043200000&version=v1"
```

### `POST /api/save_candle`

Save a completed candle (idempotent).

**Request Body:**
```json
{
  "meta": {
    "symbol": "BTCUSD",
    "timeframeMinutes": 1,
    "version": "v1"
  },
  "candle": {
    "start_time_ms": 1731043200000,
    "open": 42100,
    "high": 42120,
    "low": 42090,
    "close": 42110,
    "volume": 15
  }
}
```

**Response:**
```json
{
  "ok": true,
  "inserted": true
}
```

- `inserted: true` — Candle was newly saved
- `inserted: false` — Candle already exists (idempotent)

**Example:**
```powershell
curl -X POST http://localhost:3000/api/save_candle `
  -H "Content-Type: application/json" `
  -d '{\"meta\":{\"symbol\":\"BTCUSD\",\"timeframeMinutes\":1,\"version\":\"v1\"},\"candle\":{\"start_time_ms\":1731043200000,\"open\":42100,\"high\":42120,\"low\":42090,\"close\":42110,\"volume\":15}}'
```

### `GET /api/last_saved`

Get the most recent persisted candle.

**Query Parameters:**
- `symbol` (required)
- `timeframeMinutes` (required)
- `version` (optional, default: "v1")

**Response:**
```json
{
  "symbol": "BTCUSD",
  "timeframeMinutes": 1,
  "version": "v1",
  "lastCandle": {
    "start_time_ms": 1731043200000,
    "open": 42100,
    "high": 42120,
    "low": 42090,
    "close": 42110,
    "volume": 15
  }
}
```

### WebSocket: `ws://localhost:3000/ws`

**Connect:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

**Subscribe (optional):**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  subscription: { symbol: 'BTCUSD', timeframeMinutes: 1, version: 'v1' }
}));
```

**Receive Completed Candle:**
```json
{
  "type": "candle_completed",
  "meta": {
    "symbol": "BTCUSD",
    "timeframeMinutes": 1,
    "version": "v1"
  },
  "candle": {
    "start_time_ms": 1731043200000,
    "open": 42100,
    "high": 42120,
    "low": 42090,
    "close": 42110,
    "volume": 15
  }
}
```

## 🔬 How It Works

### Deterministic Generation

All candles are generated using a **seeded PRNG** (xmur3 + sfc32) with **Box-Muller transform** for Gaussian distribution.

**Seed Format:**
```
${symbol}|${timeframeMinutes}|${version}|${dateRangeStartISO}
```

**Formula:**
```javascript
// 1. Generate Gaussian random variable
const z = gaussian(rng);

// 2. Calculate price movement
const pctMove = z * volatility * sqrt(timeframeMinutes);
const close = prevClose * (1 + pctMove);

// 3. Deterministic OHLC
const open = prevClose;
const high = max(open, close) * (1 + intradayHighFactor);
const low = min(open, close) * (1 - intradayLowFactor);
```

**Key Properties:**
- Same seed → **identical candles** (byte-for-byte)
- Different version → **different history** (non-destructive updates)
- Client & server use **identical code** (parity guarantee)

### Partial Candle (Live)

The current forming candle is **deterministically interpolated** from its target value:

```javascript
// 1. Generate target (final) candle
const targetCandle = generateDeterministicCandle(...);

// 2. Calculate elapsed fraction
const f = clamp((serverTimeMs - candleStartMs) / timeframeMs, 0, 1);

// 3. Interpolate current close
const curClose = open + (targetCandle.close - open) * f;
```

This ensures **seamless continuation** after refresh (no rollback).

### Server-Side Partial (Recommended)

The server computes the partial candle and includes it in `GET /api/ohlc` responses. This is **authoritative** and eliminates client clock skew issues.

### Idempotent Persistence

Database uses `UNIQUE(symbol, timeframe_minutes, version, start_time_ms)` constraint:

```sql
INSERT OR IGNORE INTO candles (...) VALUES (...)
```

- First save → inserted
- Duplicate save → silently ignored (no error)
- Concurrent saves → only one succeeds
- **Result: race-safe, no duplicates**

## 🧪 Testing

### Run Automated Tests

```powershell
cd server
npm test
```

**Tests Cover:**
- ✅ Determinism (same seed = same candles)
- ✅ Version changes produce different history
- ✅ Valid OHLC relationships
- ✅ Idempotent saves
- ✅ Database time-range queries
- ✅ Concurrent save handling
- ✅ Price decimal rounding
- ✅ Volatility scaling with timeframe

### Manual No-Rollback Test

See `tests/manual_test_no_rollback.md` for step-by-step verification.

## ⚙️ Configuration

### Change Volatility

Edit `server/src/routes/ohlc.js` and `server/src/shared/generator.js`:

```javascript
volatility: 0.02,  // 2% volatility (change to 0.01 for 1%, 0.05 for 5%, etc.)
```

### Change Price Decimals

```javascript
priceDecimals: 2,  // 2 decimals (change to 4 for crypto, 6 for forex)
```

### Change Initial Price

Edit demo files or add to API:

```javascript
initialPrice: 42000,  // Starting price for symbol
```

### Bump History Version

When changing the generation algorithm:

```javascript
version: 'v2'  // Old clients on v1 see unchanged history
```

## 🛠️ Database

### Schema

```sql
CREATE TABLE candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe_minutes INTEGER NOT NULL,
  version TEXT NOT NULL,
  start_time_ms BIGINT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, timeframe_minutes, version, start_time_ms)
);
```

### SQLite (Default)

Database file: `server/data/candles.db`

### PostgreSQL Migration

1. Change `server/src/db.js`:
```javascript
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

2. Update migration to use `ON CONFLICT DO NOTHING` (Postgres syntax)

3. Change `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`

## 📈 Chart Integration

### Lightweight Charts (Included)

See `server/public/demo.html` for full example.

**Key Points:**
- Convert `start_time_ms` → seconds: `time: Math.floor(ms / 1000)`
- Use `series.update()` for partial candle updates
- Use `series.setData()` for initial load

### TradingView Widget Datafeed

See `server/public/tradingview-demo.html` for datafeed implementation.

**Required Methods:**
- `onReady(callback)` — Library configuration
- `resolveSymbol(symbolName, ...)` — Symbol metadata
- `getBars(symbolInfo, resolution, periodParams, ...)` — Historical data
- `subscribeBars(...)` — Real-time updates (connect to WebSocket)
- `unsubscribeBars(subscriberUID)` — Cleanup

## 🔒 Security & Production

### Rate Limiting

Add middleware:
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

app.use('/api', limiter);
```

### Admin Token

Protect purge endpoints:
```javascript
app.use('/api/admin', (req, res, next) => {
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### HTTPS & WSS

Use a reverse proxy (nginx, Caddy) or configure Express with SSL:
```javascript
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

const server = https.createServer(options, app);
```

### Input Validation

All endpoints validate inputs (see `server/src/routes/`):
- Type checking (numbers, strings)
- Range validation (positive values, start < end)
- OHLC relationship validation
- Sanitization (prevent SQL injection)

### Gzip Compression

```javascript
import compression from 'compression';
app.use(compression());
```

## 📊 Performance

### Pagination

API enforces max 10,000 candles per request. For larger ranges, use multiple requests:

```javascript
const pageSize = 10000;
const totalCandles = 50000;

for (let i = 0; i < totalCandles; i += pageSize) {
  const start = baseStartMs + i * timeframeMs;
  const end = start + pageSize * timeframeMs;
  const data = await fetch(`/api/ohlc?...&start=${start}&end=${end}`);
  // Process page
}
```

### Caching (Optional)

Add Redis for hot data:
```javascript
import Redis from 'ioredis';
const redis = new Redis();

// Cache last N candles
await redis.setex(`candles:${symbol}:${tf}`, 60, JSON.stringify(candles));
```

**Note: Always persist to database for durability.**

## 🐛 Troubleshooting

### Issue: Chart shows "No data"

**Check:**
1. Server running? `curl http://localhost:3000/health`
2. Database initialized? `npm run migrate`
3. Browser console errors?
4. API response valid? Check Network tab in DevTools

### Issue: WebSocket disconnects frequently

**Check:**
1. Firewall blocking port 3000?
2. Reverse proxy timeout settings (increase timeout)
3. Browser console for connection errors

### Issue: Candles change after refresh (not deterministic)

**Check:**
1. Server & client use **identical** RNG code
2. Same seed parameters (symbol, timeframe, version)
3. No floating-point precision issues (use `toFixed()`)

### Issue: Duplicate candles in database

**Check:**
1. Using `INSERT OR IGNORE` (SQLite) or `ON CONFLICT DO NOTHING` (Postgres)
2. UNIQUE constraint exists: `UNIQUE(symbol, timeframe_minutes, version, start_time_ms)`
3. Database migration ran successfully

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## 📞 Support

For issues, questions, or feature requests, please open a GitHub issue.

---

**Built with ❤️ for deterministic, server-authoritative charting**
