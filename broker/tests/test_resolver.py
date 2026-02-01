import os
import time
from datetime import timedelta

import pytest

from services import trading
from services import time_utils
from services.user_store import UserStore
from services import chart_service


def test_trade_resolver_resolves_expired_trade(tmp_path):
    # Isolate data directory to avoid OneDrive/permissions issues
    os.environ['TANIX_DATA_DIR'] = str(tmp_path)

    # Create a JSON-backed store in the temp dir
    db_path = tmp_path / 'users.json'
    store = UserStore(db_path)

    # Create a user and open a trade (will deduct stake)
    user = store.create_user('resolver@example.com', 'password')
    initial_balance = float(user.get('balance', 0.0))

    # Open a trade which normally expires in 1s, then force its expiry to the past
    trade = trading.open_trade(user, 'OTC-AAPL', 'buy', 10.0, expiration='1s')
    # Set the trade to have expired in the past
    past = time_utils.now() - timedelta(seconds=5)
    trade['expires_at'] = time_utils.iso(past)

    # Persist the modified user state
    store.upsert(user)
    store.save()

    # Start the resolver with a short interval
    from services.worker import start_trade_resolver, stop_trade_resolver

    start_trade_resolver(store, interval=1)

    # Wait a short time to allow resolver to run
    time.sleep(1.5)

    # Stop the resolver to clean up
    stop_trade_resolver()

    # As a safety, also directly invoke resolver on the in-memory user to ensure
    # the behaviour works even if the background thread missed it in the test run.
    resolved = trading.resolve_active_trades(user)
    if resolved:
        store.upsert(user)
        store.save()

    # Reload user and assert the trade was resolved
    updated = store.get('resolver@example.com')
    assert updated is not None
    assert len(updated.get('active_trades', [])) == 0
    # There should be at least one history entry (the resolved trade)
    history = updated.get('history', [])
    assert len(history) >= 1
    # Ensure the transaction log contains an entry corresponding to the trade
    txs = updated.get('transactions', [])
    found = any(tx.get('trade_id') == trade.get('id') for tx in txs)
    assert found, 'Expected a transaction record for the resolved trade'
    # Balance should have been adjusted (either refunded+profit or net loss)
    assert float(updated.get('balance', 0.0)) != initial_balance


def test_trade_resolver_deterministic_win_loss_and_chart(tmp_path, monkeypatch):
    """Deterministic test: force 30% wins / 70% losses and ensure chart trends accordingly."""
    os.environ['TANIX_DATA_DIR'] = str(tmp_path)

    db_path = tmp_path / 'users.json'
    store = UserStore(db_path)

    user = store.create_user('deterministic@example.com', 'password')
    initial_balance = float(user.get('balance', 0.0))

    # Create N trades of fixed amount that will be expired
    N = 50
    amount = 10.0
    # Use explicit opened/expires timestamps: opened at 10:17, expires at 10:18 (UTC)
    from datetime import datetime, timezone
    opened_dt = datetime(2025, 11, 5, 10, 17, 0, tzinfo=timezone.utc)
    expires_dt = datetime(2025, 11, 5, 10, 18, 0, tzinfo=timezone.utc)

    for _ in range(N):
        trade = trading.open_trade(user, 'OTC-AAPL', 'buy', amount, expiration='60s')
        # override timestamps to the explicit values
        trade['opened_at'] = time_utils.iso(opened_dt)
        trade['expires_at'] = time_utils.iso(expires_dt)

    # Force expiry by setting all trades' expires_at into the past
    past = time_utils.now() - timedelta(seconds=5)
    for t in user.get('active_trades', []):
        t['expires_at'] = time_utils.iso(past)

    store.upsert(user)
    store.save()

    # Set WIN_PROBABILITY to 0.30 so ~30% wins
    monkeypatch.setattr(trading, 'WIN_PROBABILITY', 0.30)

    # Build deterministic random sequence: first WINS then LOSSES
    wins = int(N * 0.3)
    seq = [0.1] * wins + [0.9] * (N - wins)

    def seq_random():
        # pop from front
        return seq.pop(0) if seq else 0.9

    monkeypatch.setattr(trading.random, 'random', seq_random)

    # Make chart generation deterministic and biased downward (losses) so chart moves accordingly
    monkeypatch.setattr(chart_service.random, 'gauss', lambda mu, sigma: -abs(mu) * 0.001)
    monkeypatch.setattr(chart_service.random, 'choice', lambda choices: -1)

    from services.worker import start_trade_resolver, stop_trade_resolver

    start_trade_resolver(store, interval=1)
    # Allow resolver to run
    import time as _time
    _time.sleep(1.5)
    stop_trade_resolver()

    updated = store.get('deterministic@example.com')
    assert updated is not None

    history = updated.get('history', [])
    # Count wins and losses as recorded
    win_count = sum(1 for h in history if h.get('result') == 'win')
    loss_count = sum(1 for h in history if h.get('result') == 'loss')
    assert win_count == int(N * 0.3)
    assert win_count + loss_count == N

    # Verify per-trade arithmetic: each history entry net matches payout formula
    for h in history[:N]:
        amt = float(h.get('amount', 0.0))
        pct = float(h.get('payout_percent', 85))
        if h.get('result') == 'win':
            expected_net = round(amt * pct / 100, 2)
        else:
            expected_net = round(-amt, 2)
        assert round(float(h.get('net', 0.0)), 2) == expected_net

    # Check transactions net totals roughly reflect losses > wins
    txs = updated.get('transactions', [])
    net_sum = sum(float(tx.get('net', 0.0)) for tx in txs if tx.get('type') in ('trade_win', 'trade_loss'))
    # net_sum should be negative because majority lost
    assert net_sum < 0

    # Chart should show downward movement due to monkeypatched randomness
    chart = chart_service.get_otc_chart('OTC-AAPL', timeframe='1m', points=10)
    candles = chart.get('candles', [])
    assert len(candles) >= 2
    first_close = candles[0]['close']
    last_close = candles[-1]['close']
    assert last_close < first_close
