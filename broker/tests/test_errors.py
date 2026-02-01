import time

import tempfile
import os
import importlib

# Use isolated data dir for tests
_tmpdir = tempfile.mkdtemp()
os.environ['TANIX_DATA_DIR'] = _tmpdir
import app
importlib.reload(app)
from app import app as flask_app


def test_unauthenticated_access():
    client = flask_app.test_client()
    # Access protected endpoint without session
    resp = client.get('/api/trades')
    assert resp.status_code == 401


def test_invalid_deposit_and_trade():
    client = flask_app.test_client()
    # register a new user and use same client
    email = f"errtest+{int(time.time())}@example.com"
    password = "password123"
    resp = client.post('/auth/register', json={"email": email, "password": password})
    assert resp.status_code == 200

    # invalid deposit (non-numeric)
    resp = client.post('/api/deposit', json={"amount": "not-a-number"})
    assert resp.status_code == 400

    # deposit below minimum
    resp = client.post('/api/deposit', json={"amount": 1})
    assert resp.status_code == 400

    # invalid trade amount
    payload = {'direction': 'buy', 'asset_id': 'OTC-AAPL', 'amount': -10, 'expiration': '1m'}
    resp = client.post('/api/trades', json=payload)
    assert resp.status_code == 400
