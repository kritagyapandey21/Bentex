"""Lightweight OTC chart streaming service with deterministic generation."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

from .assets import find_asset
from .time_utils import now, iso
from .deterministic_generator import (
    generate_series,
    generate_partial_candle,
    get_candle_index,
    get_candle_start_time,
    Candle as DeterministicCandle,
)


@dataclass
class Candle:
    time: int
    open: float
    high: float
    low: float
    close: float

    def to_payload(self) -> Dict[str, Any]:
        return {
            "time": self.time,
            "open": round(self.open, 5),
            "high": round(self.high, 5),
            "low": round(self.low, 5),
            "close": round(self.close, 5),
        }


class ChartStream:
    """Generates deterministic OTC candles with server-authoritative persistence."""

    def __init__(self) -> None:
        self._state: Dict[str, Candle] = {}
        self._history: Dict[str, List[Candle]] = {}  # Store historical candles per asset
        self._max_history = 500  # Keep max 500 candles in history
        self._version = "v1"  # History version for deterministic generation

    @staticmethod
    def _starting_price(asset_payload: Dict[str, Any]) -> float:
        try:
            return float(asset_payload.get("price", "100").replace(",", ""))
        except (TypeError, ValueError):
            return 100.0

    def _ensure_state(self, asset_id: str) -> Candle:
        asset_payload = find_asset(asset_id)
        if not asset_payload:
            raise ValueError("Asset not found")
        
        # Initialize history if needed
        if asset_id not in self._history:
            base_price = self._starting_price(asset_payload)
            timestamp_ms = int(now().timestamp() * 1000)
            timeframe_minutes = 1
            
            # Generate deterministic historical candles
            start_time_ms = timestamp_ms - (500 * 60 * 1000)  # 500 minutes back
            
            det_candles = generate_series(
                symbol=asset_id,
                timeframe_minutes=timeframe_minutes,
                version=self._version,
                start_time_ms=start_time_ms,
                count=500,
                initial_price=base_price,
                volatility=0.02,
                price_decimals=5,
            )
            
            # Convert to legacy Candle format
            self._history[asset_id] = []
            for det_candle in det_candles:
                candle = Candle(
                    time=int(det_candle.start_time_ms / 1000),
                    open=det_candle.open,
                    high=det_candle.high,
                    low=det_candle.low,
                    close=det_candle.close,
                )
                self._history[asset_id].append(candle)
            
            self._state[asset_id] = self._history[asset_id][-1]
        
        return self._state[asset_id]

    def _advance_candle(self, candle: Candle, seconds: int) -> Candle:
        current = candle.close
        volatility = max(0.0005 * current, 0.05)
        drift = 0.00015 * current
        step = random.gauss(0, volatility)
        step += random.choice([-1, 1]) * drift * 0.2
        close = max(0.01, current + step)
        baseline_high = max(candle.close, close)
        baseline_low = min(candle.close, close)
        high = baseline_high + abs(step) * 0.4
        low = max(0.01, baseline_low - abs(step) * 0.4)
        return Candle(
            time=candle.time + seconds,
            open=candle.close,
            high=high,
            low=low,
            close=close,
        )

    def generate_series(self, asset_id: str, points: int, interval_seconds: int) -> List[Dict[str, Any]]:
        """Return the most recent candles from stored history."""
        self._ensure_state(asset_id)
        
        # Get candles from history
        if asset_id in self._history:
            # Return the last 'points' candles from history
            candles = self._history[asset_id][-points:]
            return [candle.to_payload() for candle in candles]
        
        # Fallback to old behavior if no history
        current_candle = self._state[asset_id]
        candles: List[Candle] = []
        seed_candle = current_candle
        for _ in range(points):
            seed_candle = self._advance_candle(seed_candle, interval_seconds)
            candles.append(seed_candle)
        return [candle.to_payload() for candle in candles]
    
    def advance_time(self, asset_id: str, interval_seconds: int = 60) -> None:
        """Advance the chart by one candle using deterministic generation."""
        if asset_id not in self._history:
            self._ensure_state(asset_id)
        
        current_candle = self._state.get(asset_id)
        if not current_candle:
            return
        
        # Use deterministic generation for next candle
        timestamp_ms = int(time.time() * 1000)
        timeframe_minutes = interval_seconds // 60
        
        current_index = get_candle_index(timestamp_ms, timeframe_minutes)
        next_candle_start_ms = get_candle_start_time(current_index + 1, timeframe_minutes)
        
        # Generate next deterministic candle
        seed_base = f"{asset_id}|{timeframe_minutes}|{self._version}|"
        
        det_candles = generate_series(
            symbol=asset_id,
            timeframe_minutes=timeframe_minutes,
            version=self._version,
            start_time_ms=next_candle_start_ms,
            count=1,
            initial_price=current_candle.close,
            volatility=0.02,
            price_decimals=5,
        )
        
        if det_candles:
            det_candle = det_candles[0]
            new_candle = Candle(
                time=int(det_candle.start_time_ms / 1000),
                open=det_candle.open,
                high=det_candle.high,
                low=det_candle.low,
                close=det_candle.close,
            )
            
            # Add to history
            self._history[asset_id].append(new_candle)
            
            # Trim history if too long
            if len(self._history[asset_id]) > self._max_history:
                self._history[asset_id] = self._history[asset_id][-self._max_history:]
            
            # Update current state
            self._state[asset_id] = new_candle

    def snapshot(self, asset_id: str, points: int = 120, interval_seconds: int = 60) -> Dict[str, Any]:
        asset_payload = find_asset(asset_id)
        if not asset_payload:
            raise ValueError("Asset not found")
        series = self.generate_series(asset_id, points, interval_seconds)
        return {
            "asset": asset_payload,
            "candles": series,
            "interval_seconds": interval_seconds,
            "generated_at": iso(now()),
        }


_stream = ChartStream()


def get_otc_chart(asset_id: str, timeframe: str | None = "1m", points: int = 120) -> Dict[str, Any]:
    tf = (timeframe or "1m").lower()
    interval_seconds = 60
    if tf.endswith("m"):
        try:
            interval_seconds = max(int(tf[:-1]) * 60, 5)
        except ValueError:
            interval_seconds = 60
    elif tf.endswith("s"):
        try:
            interval_seconds = max(int(tf[:-1]), 5)
        except ValueError:
            interval_seconds = 60
    elif tf.endswith("h"):
        try:
            interval_seconds = max(int(tf[:-1]) * 3600, 60)
        except ValueError:
            interval_seconds = 3600

    points = max(points, 20)
    return _stream.snapshot(asset_id, points=points, interval_seconds=interval_seconds)


def apply_trade_movement(asset_id: str | None, net: float) -> None:
    """Apply a deterministic movement to the internal chart stream for an asset.

    The magnitude is proportional to the trade net amount (currency units). Positive
    net nudges the price up; negative net nudges it down.
    """
    if not asset_id:
        return
    try:
        candle = _stream._ensure_state(asset_id)
    except Exception:
        return

    current = candle.close
    # base move (percent of price) to ensure visibility
    base_move = max(0.0005 * current, 0.05)

    # scale factor derived from net: small trades move chart a little, large trades more
    try:
        scale = min(max(abs(float(net)) / 10.0, 0.1), 5.0)
    except Exception:
        scale = 1.0

    delta = base_move * scale
    if net < 0:
        delta = -abs(delta)

    new_close = max(0.01, current + delta)
    new_candle = Candle(
        time=candle.time + 60,
        open=candle.close,
        high=max(candle.close, new_close),
        low=min(candle.close, new_close),
        close=new_close,
    )
    
    # Update both state and history
    _stream._state[asset_id] = new_candle
    if asset_id in _stream._history:
        _stream._history[asset_id].append(new_candle)
        if len(_stream._history[asset_id]) > _stream._max_history:
            _stream._history[asset_id] = _stream._history[asset_id][-_stream._max_history:]


def advance_all_charts(interval_seconds: int = 60) -> None:
    """Advance all active charts by one candle. Called periodically by background worker."""
    for asset_id in list(_stream._state.keys()):
        _stream.advance_time(asset_id, interval_seconds)
