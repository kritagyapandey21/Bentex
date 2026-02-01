/**
 * Database connection and operations
 */

import initSqlJs from 'sql.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'candles.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
let SQL;
let db;

async function initDB() {
  SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
}

// Save database to file
function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Initialize on import
await initDB();

/**
 * Run migrations
 */
export function runMigrations() {
  const migrationPath = path.join(__dirname, '..', 'migrations', '001_create_candles.sql');
  const migration = fs.readFileSync(migrationPath, 'utf-8');
  
  // Split by semicolon and execute each statement
  const statements = migration.split(';').filter(s => s.trim());
  statements.forEach(stmt => {
    if (stmt.trim()) {
      try {
        db.run(stmt);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists')) {
          throw err;
        }
      }
    }
  });
  
  saveDB();
  console.log('✓ Database migrations completed');
}

/**
 * Save a candle (idempotent)
 * @param {Object} meta - {symbol, timeframeMinutes, version}
 * @param {Object} candle - {start_time_ms, open, high, low, close, volume}
 * @returns {Object} {inserted: boolean}
 */
export function saveCandle(meta, candle) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO candles 
    (symbol, timeframe_minutes, version, start_time_ms, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.bind([
    meta.symbol,
    meta.timeframeMinutes,
    meta.version,
    candle.start_time_ms,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume || 0
  ]);

  const changesBefore = db.exec('SELECT changes() as changes')[0].values[0][0];
  stmt.step();
  stmt.free();
  const changesAfter = db.exec('SELECT changes() as changes')[0].values[0][0];

  saveDB();
  return { inserted: changesAfter > changesBefore };
}

/**
 * Get candles for a time range
 * @param {Object} params - {symbol, timeframeMinutes, version, startMs, endMs, limit}
 * @returns {Array} Array of candles
 */
export function getCandles({ symbol, timeframeMinutes, version, startMs, endMs, limit = 10000 }) {
  const stmt = db.prepare(`
    SELECT start_time_ms, open, high, low, close, volume
    FROM candles
    WHERE symbol = ? 
      AND timeframe_minutes = ? 
      AND version = ?
      AND start_time_ms >= ?
      AND start_time_ms < ?
    ORDER BY start_time_ms ASC
    LIMIT ?
  `);

  stmt.bind([symbol, timeframeMinutes, version, startMs, endMs, limit]);

  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();

  return results;
}

/**
 * Get the last saved candle
 * @param {Object} params - {symbol, timeframeMinutes, version}
 * @returns {Object|null} Last candle or null
 */
export function getLastSavedCandle({ symbol, timeframeMinutes, version }) {
  const stmt = db.prepare(`
    SELECT start_time_ms, open, high, low, close, volume
    FROM candles
    WHERE symbol = ? 
      AND timeframe_minutes = ? 
      AND version = ?
    ORDER BY start_time_ms DESC
    LIMIT 1
  `);

  stmt.bind([symbol, timeframeMinutes, version]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}

/**
 * Get count of saved candles
 * @param {Object} params - {symbol, timeframeMinutes, version}
 * @returns {number} Count
 */
export function getCandleCount({ symbol, timeframeMinutes, version }) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM candles
    WHERE symbol = ? 
      AND timeframe_minutes = ? 
      AND version = ?
  `);

  stmt.bind([symbol, timeframeMinutes, version]);

  let count = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    count = row.count;
  }
  stmt.free();

  return count;
}

/**
 * Delete all candles for a symbol/timeframe/version
 * @param {Object} params - {symbol, timeframeMinutes, version}
 * @returns {number} Number of deleted rows
 */
export function purgeCandles({ symbol, timeframeMinutes, version }) {
  const countBefore = getCandleCount({ symbol, timeframeMinutes, version });

  const stmt = db.prepare(`
    DELETE FROM candles
    WHERE symbol = ? 
      AND timeframe_minutes = ? 
      AND version = ?
  `);

  stmt.bind([symbol, timeframeMinutes, version]);
  stmt.step();
  stmt.free();

  saveDB();
  return countBefore;
}
