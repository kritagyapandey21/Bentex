import json
import tempfile
import os
import time
import importlib

import pytest

# Ensure tests use an isolated data dir to avoid modifying repository files (OneDrive locks)
_tmpdir = tempfile.mkdtemp()
os.environ['TANIX_DATA_DIR'] = _tmpdir
import app
importlib.reload(app)
from app import app as flask_app
from app import USER_STORE


def test_health():
    client = flask_app.test_client()
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True


def test_register_login_deposit_and_trade_flow():
    client = flask_app.test_client()
    email = f"testuser+{int(time.time())}@example.com"
    password = "testpass123"

    # Register
    resp = client.post('/auth/register', json={"email": email, "password": password})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True

    # After registration, session cookie should be set. Use same client.
    resp = client.get('/api/me')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True
    user = data.get('user')
    assert user and user.get('email') == email

    # Deposit
    resp = client.post('/api/deposit', json={"amount": 50})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True
    assert 'balance' in data

    # Place a trade (use an OTC asset known to the services)
    asset_id = 'OTC-AAPL'
    payload = {
        'direction': 'buy',
        'asset_id': asset_id,
        'amount': 10,
        'expiration': '1m'
    }
    resp = client.post('/api/trades', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True
    assert 'trade' in data

    # Fetch active trades
    resp = client.get('/api/trades')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data and data.get('ok') is True
    assert isinstance(data.get('trades', []), list)
