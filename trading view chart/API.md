# API Documentation

Complete REST API and WebSocket reference for the TradingView-like deterministic OHLC chart system.

## Base URL

```
http://localhost:3000
```

## Table of Contents

1. [REST API Endpoints](#rest-api-endpoints)
2. [WebSocket API](#websocket-api)
3. [Data Models](#data-models)
4. [Error Handling](#error-handling)
5. [Examples](#examples)

---

## REST API Endpoints

### Health Check

Check server status.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "time": 1731050000000
}
```

---

### Get OHLC Candles

Retrieve historical candles and optional partial (forming) candle.

**Endpoint:** `GET /api/ohlc`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Trading symbol (e.g., "BTCUSD") |
| `timeframeMinutes` | integer | Yes | Timeframe in minutes (1, 5, 15, 60, etc.) |
| `start` | integer | Yes | Start time in UTC milliseconds |
| `end` | integer | Yes | End time in UTC milliseconds |
| `version` | string | No | History version (default: "v1") |
| `includePartial` | boolean | No | Include partial candle (default: "true") |

**Success Response (200):**
```json
{
  "symbol": "BTCUSD",
  "timeframeMinutes": 1,
  "version": "v1",
  "serverTimeMs": 1731050000000,
  "candles": [
    {
      "start_time_ms": 1730956800000,
      "open": 42000.00,
      "high": 42050.00,
      "low": 41990.00,
      "close": 42020.00,
      "volume": 120
    }
  ],
  "partial": {
    "start_time_ms": 1731049800000,
    "open": 42100.00,
    "high": 42120.00,
    "low": 42090.00,
    "close": 42110.00,
    "isPartial": true
  }
}
```

**Error Response (400):**
```json
{
  "error": "Missing required parameters: symbol, timeframeMinutes, start, end"
}
```

**Notes:**
- Returns up to 10,000 candles per request
- `serverTimeMs` can be used to calculate client time offset
- Partial candle is server-authoritative (computed on server)
- All times are UTC milliseconds

---

### Save Candle

Save a completed candle to the database (idempotent).

**Endpoint:** `POST /api/save_candle`

**Headers:**
```
Content-Type: application/json
```

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
    "open": 42100.00,
    "high": 42120.00,
    "low": 42090.00,
    "close": 42110.00,
    "volume": 150
  }
}
```

**Success Response (200):**
```json
{
  "ok": true,
  "inserted": true
}
```

- `inserted: true` → Candle was newly saved
- `inserted: false` → Candle already exists (idempotent operation)

**Error Responses:**

**400 - Missing Fields:**
```json
{
  "error": "Missing required meta fields: symbol, timeframeMinutes, version"
}
```

**400 - Invalid OHLC:**
```json
{
  "error": "Invalid OHLC relationship (high must be >= max(o,c), low <= min(o,c))"
}
```

**Notes:**
- Database uses UNIQUE constraint on `(symbol, timeframe_minutes, version, start_time_ms)`
- Duplicate saves are silently ignored (no error)
- On successful new insert, candle is broadcast via WebSocket
- Concurrent saves of same candle are safe (only one inserts)

---

### Get Last Saved Candle

Retrieve the most recent persisted candle for a symbol/timeframe/version.

**Endpoint:** `GET /api/last_saved`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | Trading symbol |
| `timeframeMinutes` | integer | Yes | Timeframe in minutes |
| `version` | string | No | History version (default: "v1") |

**Success Response (200):**
```json
{
  "symbol": "BTCUSD",
  "timeframeMinutes": 1,
  "version": "v1",
  "lastCandle": {
    "start_time_ms": 1731043200000,
    "open": 42100.00,
    "high": 42120.00,
    "low": 42090.00,
    "close": 42110.00,
    "volume": 150
  }
}
```

**No Candles Found:**
```json
{
  "symbol": "BTCUSD",
  "timeframeMinutes": 1,
  "version": "v1",
  "lastCandle": null
}
```

---

## WebSocket API

Real-time candle updates via WebSocket.

### Connection

**URL:** `ws://localhost:3000/ws`

**Example:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Message:', data);
};
```

### Messages from Server

#### Connected Message

Sent immediately after connection.

```json
{
  "type": "connected",
  "serverTimeMs": 1731050000000
}
```

#### Candle Completed

Sent when a new candle is saved to the database.

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
    "open": 42100.00,
    "high": 42120.00,
    "low": 42090.00,
    "close": 42110.00,
    "volume": 150
  }
}
```

### Messages to Server

#### Subscribe (Optional)

You can send a subscription message to indicate your interest (currently informational).

```json
{
  "type": "subscribe",
  "subscription": {
    "symbol": "BTCUSD",
    "timeframeMinutes": 1,
    "version": "v1"
  }
}
```

**Note:** Current implementation broadcasts all candles to all clients. Subscription filtering can be added for optimization.

---

## Data Models

### Candle Object

Represents a single OHLC candle.

```typescript
{
  start_time_ms: number;  // UTC milliseconds (candle start time)
  open: number;           // Opening price
  high: number;           // Highest price
  low: number;            // Lowest price
  close: number;          // Closing price
  volume: number;         // Volume (optional, default: 0)
}
```

**Constraints:**
- `high >= max(open, close)`
- `low <= min(open, close)`
- `high >= low`

### Partial Candle Object

Same as Candle, with additional flag:

```typescript
{
  start_time_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  isPartial: true;       // Indicates this is a forming candle
}
```

### Meta Object

Identifies a candle series.

```typescript
{
  symbol: string;          // Trading symbol (e.g., "BTCUSD")
  timeframeMinutes: number; // Timeframe in minutes (1, 5, 15, 60, etc.)
  version: string;         // History version (e.g., "v1", "v2")
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Missing parameters, invalid values |
| 500 | Internal Server Error | Database error, unexpected exception |

### Error Response Format

All errors return JSON:

```json
{
  "error": "Error message description"
}
```

### Common Errors

**Missing Parameters:**
```json
{
  "error": "Missing required parameters: symbol, timeframeMinutes, start, end"
}
```

**Invalid Numeric Value:**
```json
{
  "error": "Invalid numeric parameters"
}
```

**Invalid Parameter Range:**
```json
{
  "error": "Invalid parameter values"
}
```

**Invalid OHLC:**
```json
{
  "error": "Invalid OHLC relationship (high must be >= max(o,c), low <= min(o,c))"
}
```

---

## Examples

### Fetch Last 100 Candles (1-minute)

```javascript
const symbol = 'BTCUSD';
const timeframeMinutes = 1;
const version = 'v1';
const endMs = Date.now();
const startMs = endMs - (100 * 60 * 1000); // 100 minutes ago

const url = `http://localhost:3000/api/ohlc?` +
  `symbol=${symbol}&` +
  `timeframeMinutes=${timeframeMinutes}&` +
  `start=${startMs}&` +
  `end=${endMs}&` +
  `version=${version}`;

const response = await fetch(url);
const data = await response.json();

console.log('Candles:', data.candles.length);
console.log('Partial:', data.partial);
```

### Save Current Candle

```javascript
const meta = {
  symbol: 'BTCUSD',
  timeframeMinutes: 1,
  version: 'v1',
};

const candle = {
  start_time_ms: 1731043200000,
  open: 42100,
  high: 42150,
  low: 42050,
  close: 42120,
  volume: 200,
};

const response = await fetch('http://localhost:3000/api/save_candle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ meta, candle }),
});

const result = await response.json();
console.log('Saved:', result.inserted);
```

### WebSocket Real-time Updates

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // Optional: Send subscription
  ws.send(JSON.stringify({
    type: 'subscribe',
    subscription: {
      symbol: 'BTCUSD',
      timeframeMinutes: 1,
      version: 'v1',
    },
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'candle_completed') {
    console.log('New candle:', data.candle);
    // Update your chart with the new candle
    chart.addCandle(data.candle);
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket closed');
  // Reconnect logic here
};
```

### Calculate Server Time Offset

```javascript
// Fetch server time
const response = await fetch('http://localhost:3000/api/ohlc?...');
const data = await response.json();

// Calculate offset
const clientTimeOffset = data.serverTimeMs - Date.now();

// Use offset for partial candle calculations
const serverTimeMs = Date.now() + clientTimeOffset;
```

### Convert Time for Lightweight Charts

```javascript
// Server returns milliseconds
const candles = data.candles.map(c => ({
  time: Math.floor(c.start_time_ms / 1000), // Convert to seconds
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
}));

candleSeries.setData(candles);
```

---

## Rate Limits

Currently no rate limiting is enforced. In production, consider:

- 100 requests/minute per IP for public endpoints
- 1000 requests/minute for authenticated users
- WebSocket: 1 connection per client, auto-reconnect with backoff

## CORS

CORS is enabled for all origins in development. For production:

```javascript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true,
}));
```

## Versioning

API version is embedded in the data model via the `version` parameter. This allows:

- Non-destructive algorithm updates
- Multiple history versions in same database
- Client controls which version to use

When updating generation logic, increment version:
- `v1` → `v2` → `v3`, etc.

Old clients continue using `v1`, new clients use `v2`.

---

**Last Updated:** November 9, 2025  
**API Version:** 1.0.0
