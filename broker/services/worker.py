"""Background workers for periodic tasks (trade resolution, cleanup)."""

from __future__ import annotations

import threading
import time
import logging
from typing import Callable

from . import trading as trading_service
from . import chart_service

log = logging.getLogger(__name__)


class TradeResolver:
    """Simple background thread that periodically resolves active trades.

    Usage:
        resolver = TradeResolver(store, interval=5)
        resolver.start()  # starts a daemon thread
        resolver.stop()   # requests stop and joins thread
    """

    def __init__(self, store, interval: int = 5):
        self.store = store
        self.interval = float(interval)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="trade-resolver")

    def start(self) -> None:
        if not self._thread.is_alive():
            log.info("Starting TradeResolver thread (interval=%ss)", self.interval)
            self._thread.start()

    def stop(self, timeout: float | None = 2.0) -> None:
        log.info("Stopping TradeResolver thread")
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout)

    def _run(self) -> None:
        # Loop until stopped; on each pass iterate all users and resolve expired trades.
        while not self._stop.is_set():
            try:
                users = []
                # Prefer explicit API if provided
                if hasattr(self.store, 'list_users') and callable(getattr(self.store, 'list_users')):
                    users = self.store.list_users()
                else:
                    # Fallback: try to access internal structure (JSON store)
                    try:
                        users = list(getattr(self.store, '_data').values())
                    except Exception:
                        users = []

                for user in users:
                    try:
                        resolved = trading_service.resolve_active_trades(user)
                        if resolved:
                            # For each resolved trade, allow chart to be nudged by outcome
                            for r in resolved:
                                try:
                                    asset = r.get('asset')
                                    net = float(r.get('net', 0.0))
                                    # nudge chart based on trade net (positive -> up, negative -> down)
                                    try:
                                        chart_service.apply_trade_movement(asset, net)
                                    except Exception:
                                        log.exception('Failed to apply trade movement to chart for %s', asset)
                                except Exception:
                                    log.exception('Error handling resolved trade for user %s', user.get('email'))

                            # persist change
                            try:
                                self.store.upsert(user)
                                # some stores have no-op save(); call it to be safe
                                if hasattr(self.store, 'save'):
                                    self.store.save()
                            except Exception:
                                log.exception("Failed to persist user after resolving trades: %s", user.get('email'))
                    except Exception:
                        log.exception("Error while resolving trades for user: %s", user.get('email'))
            except Exception:
                log.exception("Unexpected error in TradeResolver loop")

            # Sleep in small increments so stop becomes responsive
            total = 0.0
            step = 0.25
            while total < self.interval and not self._stop.is_set():
                time.sleep(step)
                total += step


_global_resolver: TradeResolver | None = None


def start_trade_resolver(store, interval: int = 5) -> None:
    global _global_resolver
    if _global_resolver is None:
        _global_resolver = TradeResolver(store, interval=interval)
        _global_resolver.start()


def stop_trade_resolver() -> None:
    global _global_resolver
    if _global_resolver is not None:
        _global_resolver.stop()
        _global_resolver = None
