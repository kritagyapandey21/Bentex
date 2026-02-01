"""
Auto-save service for completed candles
Monitors time and saves completed candles to database automatically
Also saves partial candles every second for persistence
"""

import threading
import time
import logging
from typing import Dict, Optional

from services.deterministic_generator import (
    generate_deterministic_candle,
    generate_partial_candle,
    get_candle_index,
    get_candle_start_time,
)
from services.candle_db import (
    save_candle,
    get_latest_candle,
    save_partial_candle,
    delete_partial_candle,
)

logger = logging.getLogger(__name__)


class CandleAutoSaver:
    """Automatically saves completed candles for tracked symbols"""
    
    def __init__(self):
        self.tracked_symbols: Dict[str, Dict] = {}
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.check_interval = 0.1  # Check every 100ms (10 times per second) for high frequency saves
        self.last_save_times: Dict[str, float] = {}  # Track last save time for each symbol
        
    def track_symbol(
        self,
        symbol: str,
        timeframe_minutes: int = 1,
        version: str = "v1",
        initial_price: float = 100.0,
        volatility: float = 0.02,
        price_decimals: int = 5
    ):
        """Start tracking a symbol for auto-save"""
        key = f"{symbol}|{timeframe_minutes}|{version}"
        
        if key in self.tracked_symbols:
            return  # Already tracking
        
        # Get current candle index
        server_time_ms = int(time.time() * 1000)
        current_index = get_candle_index(server_time_ms, timeframe_minutes)
        
        # Get last saved candle from database
        last_candle = get_latest_candle(symbol, timeframe_minutes, version)
        prev_close = last_candle['close'] if last_candle else initial_price
        
        self.tracked_symbols[key] = {
            'symbol': symbol,
            'timeframe_minutes': timeframe_minutes,
            'version': version,
            'initial_price': initial_price,
            'volatility': volatility,
            'price_decimals': price_decimals,
            'last_saved_index': current_index,
            'prev_close': prev_close,
        }
        
        logger.info(f"📊 Tracking {symbol} (timeframe: {timeframe_minutes}m, version: {version})")
    
    def check_and_save(self):
        """Check all tracked symbols and save completed candles + current partial (high frequency)"""
        server_time_ms = int(time.time() * 1000)
        current_time = time.time()
        
        for key, config in list(self.tracked_symbols.items()):
            try:
                current_index = get_candle_index(server_time_ms, config['timeframe_minutes'])
                current_candle_start_ms = get_candle_start_time(current_index, config['timeframe_minutes'])
                
                # If we're on a new candle, save the previous one as completed
                if current_index > config['last_saved_index']:
                    # Generate and save completed candle(s)
                    for completed_index in range(config['last_saved_index'], current_index):
                        completed_candle_start_ms = get_candle_start_time(
                            completed_index,
                            config['timeframe_minutes']
                        )
                        
                        seed_base = f"{config['symbol']}|{config['timeframe_minutes']}|{config['version']}|"
                        
                        # Generate the FINAL completed candle (not interpolated)
                        candle = generate_deterministic_candle(
                            seed_base=seed_base,
                            index=completed_index,
                            prev_close=config['prev_close'],
                            volatility=config['volatility'],
                            timeframe_minutes=config['timeframe_minutes'],
                            price_decimals=config['price_decimals'],
                            start_time_ms=completed_candle_start_ms,
                        )
                        
                        # Save completed candle to database (will replace any existing)
                        inserted = save_candle(
                            config['symbol'],
                            config['timeframe_minutes'],
                            config['version'],
                            candle.to_dict()
                        )
                        
                        if inserted:
                            logger.info(
                                f"✅ COMPLETED candle saved to DB: {config['symbol']} "
                                f"index {completed_index} "
                                f"(OHLC: {candle.open:.{config['price_decimals']}f} / "
                                f"{candle.high:.{config['price_decimals']}f} / "
                                f"{candle.low:.{config['price_decimals']}f} / "
                                f"{candle.close:.{config['price_decimals']}f}) "
                                f"[FINAL - immutable]"
                            )
                        
                        # Delete the partial candle since it's now completed
                        delete_partial_candle(
                            config['symbol'],
                            config['timeframe_minutes'],
                            config['version'],
                            completed_candle_start_ms
                        )
                        
                        # Update prev_close for next candle
                        config['prev_close'] = candle.close
                    
                    # Update last saved index
                    config['last_saved_index'] = current_index
                
                # Generate and save current partial candle (high frequency - every 100ms)
                # This ensures microsecond-level data preservation
                seed_base = f"{config['symbol']}|{config['timeframe_minutes']}|{config['version']}|"
                timeframe_ms = config['timeframe_minutes'] * 60 * 1000
                
                partial = generate_partial_candle(
                    seed_base=seed_base,
                    index=current_index,
                    prev_close=config['prev_close'],
                    candle_start_ms=current_candle_start_ms,
                    server_time_ms=server_time_ms,
                    timeframe_ms=timeframe_ms,
                    volatility=config['volatility'],
                    timeframe_minutes=config['timeframe_minutes'],
                    price_decimals=config['price_decimals'],
                )
                
                # Save partial candle (upsert - updates if exists)
                save_partial_candle(
                    config['symbol'],
                    config['timeframe_minutes'],
                    config['version'],
                    partial.to_dict()
                )
                
                # Log only every 5 seconds to avoid spam
                last_log = self.last_save_times.get(key, 0)
                if current_time - last_log >= 5.0:
                    logger.info(
                        f"💾 Partial candle saved: {config['symbol']} "
                        f"(close: {partial.close:.{config['price_decimals']}f}) "
                        f"[saved at 10Hz]"
                    )
                    self.last_save_times[key] = current_time
                
            except Exception as e:
                logger.error(f"Error auto-saving {key}: {e}")
    
    def run(self):
        """Main loop for auto-save thread (high frequency - 10Hz)"""
        logger.info(f"🤖 Auto-save thread started (interval: {self.check_interval}s = {int(1/self.check_interval)}Hz)")
        logger.info("💾 Saving partial candles at 10Hz for microsecond-level precision")
        
        while self.running:
            try:
                self.check_and_save()
            except Exception as e:
                logger.error(f"Error in auto-save loop: {e}")
            
            time.sleep(self.check_interval)
        
        logger.info("🤖 Auto-save thread stopped")
    
    def start(self):
        """Start the auto-save background thread"""
        if self.running:
            return
        
        self.running = True
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        logger.info("✓ Auto-save service started")
    
    def stop(self):
        """Stop the auto-save background thread"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
        logger.info("✓ Auto-save service stopped")


# Global auto-saver instance
_auto_saver: Optional[CandleAutoSaver] = None


def get_auto_saver() -> CandleAutoSaver:
    """Get the global auto-saver instance"""
    global _auto_saver
    if _auto_saver is None:
        _auto_saver = CandleAutoSaver()
    return _auto_saver


def start_auto_save():
    """Start the auto-save service"""
    saver = get_auto_saver()
    saver.start()
    return saver
