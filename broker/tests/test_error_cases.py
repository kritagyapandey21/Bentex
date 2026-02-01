import os
import pytest

from services import trading
from services.user_store import UserStore


def test_open_trade_insufficient_balance(tmp_path):
    os.environ['TANIX_DATA_DIR'] = str(tmp_path)
    db_path = tmp_path / 'users.json'
    store = UserStore(db_path)
    user = store.create_user('lowfunds@example.com', 'password')
    # set a very small balance
    user['balance'] = 1.0
    store.upsert(user)
    store.save()

    with pytest.raises(ValueError) as exc:
        trading.open_trade(user, 'OTC-AAPL', 'buy', 10.0, expiration='60s')
    assert 'insufficient' in str(exc.value).lower()


def test_open_trade_invalid_amount(tmp_path):
    os.environ['TANIX_DATA_DIR'] = str(tmp_path)
    db_path = tmp_path / 'users.json'
    store = UserStore(db_path)
    user = store.create_user('invalidamt@example.com', 'password')

    # Negative amount
    with pytest.raises(ValueError):
        trading.open_trade(user, 'OTC-AAPL', 'buy', -5.0, expiration='60s')

    # Non-numeric amount should raise when converting to float
    with pytest.raises((ValueError, TypeError)):
        trading.open_trade(user, 'OTC-AAPL', 'buy', 'not-a-number', expiration='60s')
