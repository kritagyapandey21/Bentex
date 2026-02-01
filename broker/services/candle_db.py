"""
Database for storing completed candles
Allows candles to persist across server restarts
"""

import sqlite3
import os
from pathlib import Path
from typing import List, Dict, Optional
import logging

# Database path
DB_DIR = Path(__file__).parent.parent / 'data'
DB_PATH = DB_DIR / 'candles.db'

# Ensure data directory exists
DB_DIR.mkdir(exist_ok=True)

logger = logging.getLogger(__name__)


def init_db():
    """Initialize database and create tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS candles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timeframe_minutes INTEGER NOT NULL,
            version TEXT NOT NULL,
            start_time_ms INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, timeframe_minutes, version, start_time_ms)
        )
    ''')
    
    # Create table for partial (forming) candles
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS partial_candles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timeframe_minutes INTEGER NOT NULL,
            version TEXT NOT NULL,
            start_time_ms INTEGER NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(symbol, timeframe_minutes, version, start_time_ms)
        )
    ''')
    
    # Create index for faster queries
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_candles_lookup 
        ON candles(symbol, timeframe_minutes, version, start_time_ms DESC)
    ''')
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_partial_candles_lookup 
        ON partial_candles(symbol, timeframe_minutes, version, start_time_ms DESC)
    ''')
    
    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DB_PATH}")


def save_candle(symbol: str, timeframe_minutes: int, version: str, candle: Dict) -> bool:
    """
    Save a completed candle to the database
    IMMUTABLE: Once saved, completed candles CANNOT be modified
    Returns True if inserted, False if already exists
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if candle already exists (completed candles are immutable)
        cursor.execute('''
            SELECT id FROM candles 
            WHERE symbol = ? AND timeframe_minutes = ? AND version = ? AND start_time_ms = ?
        ''', (symbol, timeframe_minutes, version, candle['start_time_ms']))
        
        existing = cursor.fetchone()
        
        if existing:
            logger.debug(f"🔒 Candle already exists (immutable): {symbol} at {candle['start_time_ms']}")
            conn.close()
            return False
        
        # Insert new completed candle (INSERT only, no UPDATE)
        cursor.execute('''
            INSERT INTO candles (symbol, timeframe_minutes, version, start_time_ms, open, high, low, close)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            symbol,
            timeframe_minutes,
            version,
            candle['start_time_ms'],
            candle['open'],
            candle['high'],
            candle['low'],
            candle['close']
        ))
        conn.commit()
        logger.info(f"✅ LOCKED completed candle: {symbol} at {candle['start_time_ms']} (immutable)")
        return True
    except sqlite3.IntegrityError:
        # Candle already exists
        return False
    finally:
        conn.close()


def get_candles(
    symbol: str,
    timeframe_minutes: int,
    version: str,
    count: int = 500,
    end_time_ms: Optional[int] = None
) -> List[Dict]:
    """
    Get historical candles from database
    Returns list of candles ordered by start_time_ms ascending
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if end_time_ms:
        cursor.execute('''
            SELECT start_time_ms, open, high, low, close
            FROM candles
            WHERE symbol = ? AND timeframe_minutes = ? AND version = ? AND start_time_ms <= ?
            ORDER BY start_time_ms DESC
            LIMIT ?
        ''', (symbol, timeframe_minutes, version, end_time_ms, count))
    else:
        cursor.execute('''
            SELECT start_time_ms, open, high, low, close
            FROM candles
            WHERE symbol = ? AND timeframe_minutes = ? AND version = ?
            ORDER BY start_time_ms DESC
            LIMIT ?
        ''', (symbol, timeframe_minutes, version, count))
    
    rows = cursor.fetchall()
    conn.close()
    
    # Convert to dict and reverse to ascending order
    candles = [dict(row) for row in rows]
    candles.reverse()
    
    return candles


def get_latest_candle(symbol: str, timeframe_minutes: int, version: str) -> Optional[Dict]:
    """Get the most recent candle for a symbol"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT start_time_ms, open, high, low, close
        FROM candles
        WHERE symbol = ? AND timeframe_minutes = ? AND version = ?
        ORDER BY start_time_ms DESC
        LIMIT 1
    ''', (symbol, timeframe_minutes, version))
    
    row = cursor.fetchone()
    conn.close()
    
    return dict(row) if row else None


def delete_candles(symbol: str, timeframe_minutes: int, version: str) -> int:
    """Delete all candles for a symbol/timeframe/version"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        DELETE FROM candles
        WHERE symbol = ? AND timeframe_minutes = ? AND version = ?
    ''', (symbol, timeframe_minutes, version))
    
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()
    
    logger.info(f"Deleted {deleted_count} candles for {symbol}")
    return deleted_count


def save_partial_candle(symbol: str, timeframe_minutes: int, version: str, candle: Dict) -> bool:
    """
    Save or update a partial (forming) candle with microsecond precision
    Returns True if saved/updated
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get current timestamp with microsecond precision
    import datetime
    now_microseconds = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
    
    try:
        cursor.execute('''
            INSERT INTO partial_candles (symbol, timeframe_minutes, version, start_time_ms, open, high, low, close, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, timeframe_minutes, version, start_time_ms) 
            DO UPDATE SET 
                open = excluded.open,
                high = excluded.high,
                low = excluded.low,
                close = excluded.close,
                updated_at = excluded.updated_at
        ''', (
            symbol,
            timeframe_minutes,
            version,
            candle['start_time_ms'],
            candle['open'],
            candle['high'],
            candle['low'],
            candle['close'],
            now_microseconds
        ))
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Error saving partial candle: {e}")
        return False
    finally:
        conn.close()


def get_partial_candle(symbol: str, timeframe_minutes: int, version: str) -> Optional[Dict]:
    """Get the current partial (forming) candle for a symbol"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT start_time_ms, open, high, low, close
        FROM partial_candles
        WHERE symbol = ? AND timeframe_minutes = ? AND version = ?
        ORDER BY start_time_ms DESC
        LIMIT 1
    ''', (symbol, timeframe_minutes, version))
    
    row = cursor.fetchone()
    conn.close()
    
    return dict(row) if row else None


def delete_partial_candle(symbol: str, timeframe_minutes: int, version: str, start_time_ms: int) -> bool:
    """Delete a specific partial candle (called when it becomes completed)"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        DELETE FROM partial_candles
        WHERE symbol = ? AND timeframe_minutes = ? AND version = ? AND start_time_ms = ?
    ''', (symbol, timeframe_minutes, version, start_time_ms))
    
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return deleted


# Initialize database on module import
init_db()
