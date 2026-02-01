# Architecture Overview

Complete system architecture for the deterministic OHLC chart system.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                           │
│                                                                   │
│  ┌──────────────────┐              ┌────────────────────────┐   │
│  │ Lightweight      │              │ TradingView Widget     │   │
│  │ Charts Demo      │              │ Datafeed Demo          │   │
│  └────────┬─────────┘              └────────┬───────────────┘   │
│           │                                  │                   │
│           └──────────────┬───────────────────┘                   │
│                          │                                       │
│  ┌───────────────────────▼────────────────────────────────────┐ │
│  │         Client-side Generator (rng.js, generator.js)       │ │
│  │  • Deterministic partial candle computation                │ │
│  │  • Identical RNG implementation to server                  │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                  ┌────────┴─────────┐
                  │                  │
            HTTP REST API      WebSocket
                  │                  │
┌─────────────────▼──────────────────▼───────────────────────────┐
│                      NODE.JS SERVER                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                   Express.js App                            ││
│  │                                                             ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  ││
│  │  │ GET /api/    │  │ POST /api/   │  │ GET /api/       │  ││
│  │  │ ohlc         │  │ save_candle  │  │ last_saved      │  ││
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  ││
│  │         │                  │                    │           ││
│  │         └──────────────────┼────────────────────┘           ││
│  │                            │                                ││
│  └────────────────────────────┼────────────────────────────────┘│
│                               │                                 │
│  ┌────────────────────────────▼────────────────────────────────┐│
│  │              Server-side Generator                          ││
│  │   (shared/rng.js, shared/generator.js)                      ││
│  │                                                              ││
│  │  • generateDeterministicCandle()                            ││
│  │  • generatePartialCandle() - server authoritative           ││
│  │  • generateSeries()                                         ││
│  │  • xmur3 + sfc32 PRNG                                       ││
│  │  • Box-Muller transform for Gaussian                        ││
│  └─────────────────────────┬────────────────────────────────────┘│
│                            │                                     │
│  ┌─────────────────────────▼────────────────────────────────────┐│
│  │                Database Layer (db.js)                        ││
│  │                                                              ││
│  │  • saveCandle() - idempotent INSERT OR IGNORE               ││
│  │  • getCandles() - time range queries                        ││
│  │  • getLastSavedCandle()                                     ││
│  │  • getCandleCount()                                         ││
│  │  • purgeCandles()                                           ││
│  └─────────────────────────┬────────────────────────────────────┘│
│                            │                                     │
│  ┌─────────────────────────▼────────────────────────────────────┐│
│  │              WebSocket Server (ws.js)                        ││
│  │                                                              ││
│  │  • Connection management                                    ││
│  │  • broadcastCandleCompleted()                               ││
│  │  • Subscription tracking (optional)                         ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   SQLite Database    │
                    │   (candles.db)       │
                    │                      │
                    │  Table: candles      │
                    │  UNIQUE constraint   │
                    │  on (symbol, tf,     │
                    │      version, time)  │
                    └──────────────────────┘
```

## Data Flow

### 1. Initial Chart Load

```
Client                    Server                    Database
  │                         │                           │
  │── GET /api/ohlc ───────>│                           │
  │                         │                           │
  │                         │── SELECT candles ───────>│
  │                         │<── return rows ───────────│
  │                         │                           │
  │                         │ (generate partial candle) │
  │                         │                           │
  │<── return JSON ─────────│                           │
  │                         │                           │
  │ (render chart)          │                           │
  │                         │                           │
```

### 2. Save Completed Candle

```
Client                    Server                    Database
  │                         │                           │
  │─ POST /api/save_candle >│                           │
  │                         │                           │
  │                         │─ INSERT OR IGNORE ──────>│
  │                         │<─ changes count ──────────│
  │                         │                           │
  │<─ {ok:true,inserted} ───│                           │
  │                         │                           │
  │                         │ (broadcast to WS clients) │
  │                         │                           │
```

### 3. Real-time Updates (WebSocket)

```
Client A      Client B           Server              Database
  │             │                   │                    │
  │─ WS connect ────────────────────>│                    │
  │<─ connected ─────────────────────│                    │
  │             │                   │                    │
  │             │─ POST /save_candle>│                   │
  │             │                   │─ INSERT ──────────>│
  │             │                   │<─ success ─────────│
  │             │<─ {ok:true} ───────│                   │
  │             │                   │                    │
  │<─ candle_completed ──────────────│                   │
  │ (update chart)                  │                   │
  │             │                   │                   │
```

### 4. Deterministic Generation Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Seed Generation                      │
│                                                         │
│  seedBase = `${symbol}|${timeframe}|${version}|${date}` │
│                                                         │
│  Example: "BTCUSD|1|v1|2025-11-09"                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  PRNG Initialization                    │
│                                                         │
│  hash = xmur3(seedBase + "|candle|" + index)            │
│  rng = sfc32(hash(), hash(), hash(), hash())            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Gaussian Random Generation                 │
│                                                         │
│  z = sqrt(-2 * log(u1)) * cos(2 * PI * u2)              │
│      where u1, u2 = rng()                               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                Price Movement Calculation               │
│                                                         │
│  pctMove = z * volatility * sqrt(timeframeMinutes)      │
│  close = prevClose * (1 + pctMove)                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   OHLC Construction                     │
│                                                         │
│  open = prevClose                                       │
│  high = max(open, close) * (1 + intradayHighFactor)     │
│  low = min(open, close) * (1 - intradayLowFactor)       │
│  [intraday factors use separate seeded RNG]            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Price Rounding                        │
│                                                         │
│  round(price, priceDecimals)                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  Final Candle │
              └───────────────┘
```

### 5. Partial Candle Interpolation

```
┌─────────────────────────────────────────────────────────┐
│          Generate Target (Completed) Candle             │
│                                                         │
│  targetCandle = generateDeterministicCandle(...)        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│            Calculate Elapsed Fraction                   │
│                                                         │
│  elapsed = serverTimeMs - candleStartMs                 │
│  f = clamp(elapsed / timeframeMs, 0, 1)                 │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Interpolate Current Values                 │
│                                                         │
│  open = prevClose                                       │
│  curClose = open + (targetCandle.close - open) * f      │
│  curHigh = max(open, curClose) * (1 + highFactor * f)   │
│  curLow = min(open, curClose) * (1 - lowFactor * f)     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Partial Candle│
              │ (isPartial=true)│
              └───────────────┘
```

## Database Schema

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
  
  -- Ensures idempotency
  UNIQUE(symbol, timeframe_minutes, version, start_time_ms)
);

-- Indexes for performance
CREATE INDEX idx_candles_lookup 
  ON candles(symbol, timeframe_minutes, version, start_time_ms);

CREATE INDEX idx_candles_time_range 
  ON candles(symbol, timeframe_minutes, version, start_time_ms ASC);
```

## Key Design Decisions

### 1. Determinism Strategy

**Problem:** Need identical candles across all clients and sessions.

**Solution:**
- Seeded PRNG (xmur3 + sfc32) with string seeds
- Box-Muller for Gaussian distribution
- Identical implementation on server and client
- Version parameter allows algorithm evolution

### 2. Server-Authoritative Partial

**Problem:** Client clock skew causes partial candle misalignment.

**Solution:**
- Server computes partial candle
- Returns `serverTimeMs` in API responses
- Client uses server time for calculations
- No visual jumps on refresh

### 3. Idempotent Persistence

**Problem:** Concurrent saves, retries, network issues can cause duplicates.

**Solution:**
- UNIQUE constraint on `(symbol, timeframe, version, time)`
- `INSERT OR IGNORE` / `INSERT ON CONFLICT DO NOTHING`
- Return `inserted: true/false` to inform client
- Safe for concurrent writes

### 4. WebSocket Broadcasting

**Problem:** Need real-time updates without polling.

**Solution:**
- WebSocket server attached to HTTP server
- Broadcast on successful save
- Client reconnect with backoff
- Optional subscription filtering

### 5. Time Precision

**Problem:** JavaScript `Date.now()` returns milliseconds, but some chart libraries use seconds.

**Solution:**
- Internal storage: UTC milliseconds (BIGINT)
- API contract: milliseconds
- Conversion to seconds only when passing to chart library
- Clear documentation of units

## Scalability Considerations

### Horizontal Scaling

For multiple server instances:

1. **Database**: Use PostgreSQL with connection pooling
2. **WebSocket**: Implement Redis pub/sub for cross-server broadcasting
3. **Load Balancer**: Sticky sessions for WebSocket connections
4. **Cache**: Redis for hot candles (last N minutes)

### Vertical Scaling

- Database indexes on common queries
- Pagination (max 10k candles per request)
- Connection pooling
- Gzip compression for large responses

### Future Enhancements

1. **Redis Cache Layer**
   - Cache last 1000 candles per symbol/timeframe
   - TTL: 5 minutes
   - Fallback to database

2. **Subscription Filtering**
   - Track client subscriptions
   - Only broadcast relevant candles
   - Reduce bandwidth

3. **Historical Data Compression**
   - Compress old candles (>30 days)
   - Store deltas instead of full OHLC
   - Decompress on demand

4. **Multi-Symbol Support**
   - Different initial prices per symbol
   - Symbol configuration table
   - Default values for unknown symbols

## Security Architecture

### Input Validation

All endpoints validate:
- Parameter types (string, number)
- Value ranges (positive, start < end)
- OHLC relationships
- SQL injection prevention (parameterized queries)

### Rate Limiting (Recommended)

```javascript
// Example with express-rate-limit
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests',
});

app.use('/api', limiter);
```

### Authentication (Future)

For production, add:
- API keys for write operations
- JWT tokens for authenticated users
- Role-based access (read-only vs admin)
- Admin endpoints protected

### HTTPS/WSS

Production should use:
- HTTPS for REST API
- WSS for WebSocket
- Let's Encrypt for certificates
- Redirect HTTP → HTTPS

## Monitoring & Logging

### Metrics to Track

- Request rate (per endpoint)
- Response times (p50, p95, p99)
- WebSocket connections count
- Database query performance
- Error rates
- Candles saved per minute

### Logging

Current: Console logging  
Recommended: Structured logging (Winston, Pino)

```javascript
logger.info('Candle saved', {
  symbol: 'BTCUSD',
  timeframe: 1,
  start_time_ms: 1731043200000,
  inserted: true,
});
```

## Testing Strategy

### Unit Tests
- Determinism (same seed = same output)
- OHLC relationships
- Price rounding

### Integration Tests
- API endpoints
- Database operations
- WebSocket messages

### End-to-End Tests
- Full client → server → database flow
- Refresh no-rollback scenario
- Multi-client sync

### Performance Tests
- Load testing (Apache Bench, k6)
- Concurrent saves
- Large time ranges

---

**Last Updated:** November 9, 2025  
**Version:** 1.0.0
