-- SQLite schema for persistent candle storage
-- Postgres-ready (use BIGINT for start_time_ms)

CREATE TABLE IF NOT EXISTS candles (
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

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_candles_lookup 
ON candles(symbol, timeframe_minutes, version, start_time_ms);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_candles_time_range 
ON candles(symbol, timeframe_minutes, version, start_time_ms ASC);
