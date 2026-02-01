"""
Deterministic OHLC candle generator
Python port of the JavaScript generator.js
CRITICAL: Must produce identical results to the JavaScript version
"""

import math
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from .rng import create_seeded_rng, gaussian


@dataclass
class Candle:
    """Represents a single OHLC candle"""
    start_time_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: int
    is_partial: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert candle to dictionary"""
        result = {
            "start_time_ms": self.start_time_ms,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }
        if self.is_partial:
            result["isPartial"] = True
        return result


def generate_deterministic_candle(
    seed_base: str,
    index: int,
    prev_close: float,
    volatility: float = 0.02,
    timeframe_minutes: int = 1,
    price_decimals: int = 2,
    start_time_ms: int = 0,
) -> Candle:
    """
    Generate a single deterministic candle
    
    Args:
        seed_base: Base seed string (symbol|timeframe|version|dateRange)
        index: Candle index
        prev_close: Previous candle's close price
        volatility: Volatility factor (e.g., 0.02 for 2%)
        timeframe_minutes: Timeframe in minutes
        price_decimals: Decimal places for rounding (2-6)
        start_time_ms: Candle start time in UTC milliseconds
    
    Returns:
        Candle object with OHLCV data
    """
    # Seed for close price movement
    close_seed = f"{seed_base}|candle|{index}"
    close_rng = create_seeded_rng(close_seed)
    
    # Generate Gaussian random variable for price movement
    z = gaussian(close_rng)
    
    # Calculate percentage move
    pct_move = z * volatility * math.sqrt(timeframe_minutes)
    
    # Calculate OHLC
    close = prev_close * (1 + pct_move)
    open_price = prev_close
    
    # Intraday high/low factors (deterministic)
    intraday_seed = f"{seed_base}|candle|{index}|intraday"
    intraday_rng = create_seeded_rng(intraday_seed)
    
    intraday_high_factor = abs(gaussian(intraday_rng)) * volatility * 0.3
    intraday_low_factor = abs(gaussian(intraday_rng)) * volatility * 0.3
    
    high = max(open_price, close) * (1 + intraday_high_factor)
    low = min(open_price, close) * (1 - intraday_low_factor)
    
    # Deterministic volume
    volume_seed = f"{seed_base}|candle|{index}|volume"
    volume_rng = create_seeded_rng(volume_seed)
    base_volume = 100
    volume = int(base_volume * (1 + volume_rng() * 0.5))
    
    # Round to specified decimals
    def round_price(num: float) -> float:
        return round(num, price_decimals)
    
    return Candle(
        start_time_ms=start_time_ms,
        open=round_price(open_price),
        high=round_price(high),
        low=round_price(low),
        close=round_price(close),
        volume=volume,
    )


def generate_series(
    symbol: str,
    timeframe_minutes: int,
    version: str,
    start_time_ms: int,
    count: int,
    initial_price: float,
    volatility: float = 0.02,
    price_decimals: int = 2,
    date_range_start_iso: str = "",
) -> List[Candle]:
    """
    Generate a series of deterministic candles
    
    Args:
        symbol: Trading symbol
        timeframe_minutes: Timeframe in minutes
        version: History version (e.g., "v1")
        start_time_ms: Start time in UTC milliseconds
        count: Number of candles to generate
        initial_price: Starting price
        volatility: Volatility factor
        price_decimals: Decimal places
        date_range_start_iso: Optional date range for seed
    
    Returns:
        List of Candle objects
    """
    seed_base = f"{symbol}|{timeframe_minutes}|{version}|{date_range_start_iso}"
    candles = []
    prev_close = initial_price
    
    timeframe_ms = timeframe_minutes * 60 * 1000
    
    for i in range(count):
        candle_start_time_ms = start_time_ms + i * timeframe_ms
        
        candle = generate_deterministic_candle(
            seed_base=seed_base,
            index=i,
            prev_close=prev_close,
            volatility=volatility,
            timeframe_minutes=timeframe_minutes,
            price_decimals=price_decimals,
            start_time_ms=candle_start_time_ms,
        )
        
        candles.append(candle)
        prev_close = candle.close
    
    return candles


def generate_partial_candle(
    seed_base: str,
    index: int,
    prev_close: float,
    candle_start_ms: int,
    server_time_ms: int,
    timeframe_ms: int,
    volatility: float = 0.02,
    timeframe_minutes: int = 1,
    price_decimals: int = 2,
) -> Candle:
    """
    Generate partial (forming) candle with deterministic interpolation
    
    Args:
        seed_base: Base seed string
        index: Candle index
        prev_close: Previous candle's close
        candle_start_ms: Candle start time in ms
        server_time_ms: Current server time in ms
        timeframe_ms: Timeframe in milliseconds
        volatility: Volatility
        timeframe_minutes: Timeframe in minutes
        price_decimals: Decimal places
    
    Returns:
        Partial candle with is_partial=True
    """
    # Generate target candle (what it will be when completed)
    target_candle = generate_deterministic_candle(
        seed_base=seed_base,
        index=index,
        prev_close=prev_close,
        volatility=volatility,
        timeframe_minutes=timeframe_minutes,
        price_decimals=price_decimals,
        start_time_ms=candle_start_ms,
    )
    
    # Calculate elapsed fraction
    elapsed = server_time_ms - candle_start_ms
    f = min(1.0, max(0.0, elapsed / timeframe_ms))
    
    # Interpolate close
    open_price = prev_close
    cur_close = open_price + (target_candle.close - open_price) * f
    
    # Deterministic high/low for partial
    intraday_seed = f"{seed_base}|candle|{index}|intraday"
    intraday_rng = create_seeded_rng(intraday_seed)
    
    intraday_high_factor = abs(gaussian(intraday_rng)) * volatility * 0.3 * f
    intraday_low_factor = abs(gaussian(intraday_rng)) * volatility * 0.3 * f
    
    cur_high = max(open_price, cur_close) * (1 + intraday_high_factor)
    cur_low = min(open_price, cur_close) * (1 - intraday_low_factor)
    
    # Round to specified decimals
    def round_price(num: float) -> float:
        return round(num, price_decimals)
    
    return Candle(
        start_time_ms=candle_start_ms,
        open=round_price(open_price),
        high=round_price(cur_high),
        low=round_price(cur_low),
        close=round_price(cur_close),
        volume=int(target_candle.volume * f),
        is_partial=True,
    )


def get_candle_index(time_ms: int, timeframe_minutes: int) -> int:
    """
    Compute candle index from UTC timestamp
    
    Args:
        time_ms: UTC milliseconds
        timeframe_minutes: Timeframe in minutes
    
    Returns:
        Candle index from UTC midnight
    """
    timeframe_ms = timeframe_minutes * 60 * 1000
    return int(time_ms // timeframe_ms)


def get_candle_start_time(index: int, timeframe_minutes: int) -> int:
    """
    Get candle start time from index
    
    Args:
        index: Candle index
        timeframe_minutes: Timeframe in minutes
    
    Returns:
        Start time in UTC milliseconds
    """
    timeframe_ms = timeframe_minutes * 60 * 1000
    return index * timeframe_ms
