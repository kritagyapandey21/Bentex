from pathlib import Path
from typing import Dict, Any

from flask import Flask, redirect, send_from_directory, request, session, jsonify, url_for
import os
import time
import requests
import logging
import traceback

from google_auth_oauthlib.flow import Flow

from services import assets as asset_service
from services import catalog as catalog_service
from services import time_utils
from services import trading as trading_service
from services.chart_service import get_otc_chart
from services.user_store import UserStore, get_store

# Serve everything in the project root as static so existing paths keep working
APP_ROOT = Path(__file__).resolve().parent
DATA_DIR = APP_ROOT / 'data'
USER_DB_PATH = DATA_DIR / 'users.json'
# Disable default static route and explicitly serve needed folders
app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("TANIX_SECRET_KEY", "dev-secret-change-me")


USER_STORE = get_store(USER_DB_PATH)

logging.basicConfig(level=logging.INFO)

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
logging.info(
    "Google OAuth env present: client_id=%s client_secret=%s",
    bool(GOOGLE_CLIENT_ID),
    bool(GOOGLE_CLIENT_SECRET),
)
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
GOOGLE_AUTH_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
logging.info("Google OAuth enabled flag: %s", GOOGLE_AUTH_ENABLED)

# Optionally start background workers (trade resolver) unless explicitly disabled
try:
    from services.worker import start_trade_resolver
    _start_worker = os.environ.get('TANIX_START_WORKER', '1') != '0'
    if _start_worker:
        try:
            interval = int(os.environ.get('TRADE_RESOLVER_INTERVAL', '5'))
        except Exception:
            interval = 5
        start_trade_resolver(USER_STORE, interval=interval)
        logging.info('Trade resolver worker started (interval=%s)', interval)
except Exception:
    # If worker cannot be started for any reason, continue without it
    logging.info('Trade resolver worker not started')

# Start candle auto-save service
try:
    from services.candle_auto_save import start_auto_save
    start_auto_save()
    logging.info('Candle auto-save service started')
except Exception as e:
    logging.warning(f'Candle auto-save service not started: {e}')


def _google_client_config() -> Dict[str, Any]:
    if not GOOGLE_AUTH_ENABLED:
        raise RuntimeError("Google Sign-In is not configured")
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _build_google_flow(state: str | None = None) -> Flow:
    config = _google_client_config()
    flow = Flow.from_client_config(config, scopes=GOOGLE_SCOPES, state=state)
    flow.redirect_uri = url_for('auth_google_callback', _external=True)
    return flow


def _serialize_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return UserStore.serialize_user(user)


def _persist_user(user: Dict[str, Any]) -> None:
    USER_STORE.upsert(user)
    USER_STORE.save()


def _serialize_trade(trade: Dict[str, Any]) -> Dict[str, Any]:
    return trading_service.serialize_trade(trade)


def _ensure_session_user() -> Dict[str, Any] | None:
    email = session.get('user')
    user = USER_STORE.get(email)
    if user is None:
        session.pop('user', None)
        return None
    if trading_service.resolve_active_trades(user):
        USER_STORE.upsert(user)
        USER_STORE.save()
    return user


@app.route('/')
def root():
    """Default route: if logged in go to app, else to login."""
    if session.get('user'):
        return redirect('/index.html')
    return redirect('/login')


@app.route('/login')
def login_page():
    """Convenience route for /login -> login.html. If already logged in, go to app."""
    if session.get('user'):
        return redirect('/index.html')
    return send_from_directory(APP_ROOT, 'login.html')

@app.route('/login.html')
def login_html_alias():
    """Allow direct /login.html access for compatibility."""
    return login_page()


@app.route('/app')
@app.route('/index')
@app.route('/main.html')
@app.route('/index.html')
def main_app():
    """Serve the main SPA shell. Requires login."""
    if not session.get('user'):
        return redirect('/login')
    return send_from_directory(APP_ROOT, 'index.html')


@app.route('/src/<path:filename>')
def serve_src(filename: str):
    """Serve files under /src (js, css, pages)."""
    return send_from_directory(APP_ROOT / 'src', filename)


@app.route('/assets/<path:filename>')
def serve_assets(filename: str):
    """Serve assets directory if present."""
    return send_from_directory(APP_ROOT / 'assets', filename)


@app.route('/demo-deterministic-candles.html')
def demo_deterministic_candles():
    """Serve the deterministic candles demo page."""
    return send_from_directory(APP_ROOT, 'demo-deterministic-candles.html')


@app.route('/test-deterministic-integration.html')
def test_deterministic_integration():
    """Serve the integration test page."""
    return send_from_directory(APP_ROOT, 'test-deterministic-integration.html')


@app.route('/favicon.ico')
def favicon():
    # Avoid 404 noise; serve nothing or a placeholder if you add one
    return ('', 204)


@app.route('/auth/login', methods=['POST'])
def auth_login():
    """Server-side login.
    Accepts form or JSON: email, password. For demo: any non-empty is accepted.
    """
    email = request.form.get('email') if request.form else None
    password = request.form.get('password') if request.form else None
    if email is None and request.is_json:
        data = request.get_json(silent=True) or {}
        email = data.get('email')
        password = data.get('password')
    if not email or not password:
        return jsonify({"ok": False, "error": "Missing credentials"}), 400
    user = USER_STORE.authenticate(email, password)
    if not user:
        if request.accept_mimetypes.accept_html and not request.is_json:
            return redirect('/login?error=invalidCredentials')
        return jsonify({"ok": False, "error": "Invalid credentials"}), 401
    session['user'] = user['email']
    user['last_login_at'] = time_utils.iso(time_utils.now())
    USER_STORE.upsert(user)
    USER_STORE.save()
    # If the client expects HTML (form submit), redirect directly
    if request.accept_mimetypes.accept_html and not request.is_json:
        return redirect('/index.html')
    return jsonify({"ok": True, "redirect": "/index.html"})


@app.route('/auth/register', methods=['POST'])
def auth_register():
    """Server-side registration (demo). Accepts email/password; auto-logins on success."""
    email = request.form.get('email') if request.form else None
    password = request.form.get('password') if request.form else None
    currency = request.form.get('currency') if request.form else None
    if email is None and request.is_json:
        data = request.get_json(silent=True) or {}
        email = data.get('email')
        password = data.get('password')
        currency = data.get('currency')
    if not email or not password:
        return jsonify({"ok": False, "error": "Missing fields"}), 400
    try:
        new_user = USER_STORE.create_user(email, password, currency)
    except ValueError as exc:
        if "exists" in str(exc).lower():
            if request.accept_mimetypes.accept_html and not request.is_json:
                return redirect('/login?error=userExists')
            return jsonify({"ok": False, "error": "User already exists"}), 409
        return jsonify({"ok": False, "error": str(exc)}), 400

    session['user'] = new_user['email']
    if request.accept_mimetypes.accept_html and not request.is_json:
        return redirect('/index.html')
    return jsonify({"ok": True, "redirect": "/index.html"})


@app.route('/auth/google/status', methods=['GET'])
def auth_google_status():
    return jsonify({"ok": True, "enabled": GOOGLE_AUTH_ENABLED})


@app.route('/auth/google/login')
def auth_google_login():
    if not GOOGLE_AUTH_ENABLED:
        return redirect('/login?error=googleUnavailable')
    try:
        flow = _build_google_flow()
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
        )
    except RuntimeError:
        return redirect('/login?error=googleUnavailable')

    session['google_auth_state'] = state
    session['google_code_verifier'] = flow.code_verifier
    return redirect(authorization_url)


@app.route('/auth/google/callback')
def auth_google_callback():
    if not GOOGLE_AUTH_ENABLED:
        return redirect('/login?error=googleUnavailable')

    if request.args.get('error'):
        session.pop('google_auth_state', None)
        session.pop('google_code_verifier', None)
        return redirect('/login?error=googleDenied')

    state = request.args.get('state')
    saved_state = session.get('google_auth_state')
    if not state or not saved_state or state != saved_state:
        session.pop('google_auth_state', None)
        session.pop('google_code_verifier', None)
        return redirect('/login?error=googleAuthFailed')

    try:
        flow = _build_google_flow(state=saved_state)
    except RuntimeError:
        session.pop('google_auth_state', None)
        session.pop('google_code_verifier', None)
        return redirect('/login?error=googleUnavailable')

    code_verifier = session.get('google_code_verifier')
    if code_verifier:
        flow.code_verifier = code_verifier

    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as exc:
        logging.error('Failed to fetch token from Google OAuth: %s', exc)
        logging.error('Request args: %s', request.args.to_dict())
        logging.error(traceback.format_exc())
        session.pop('google_auth_state', None)
        session.pop('google_code_verifier', None)
        return redirect('/login?error=googleAuthFailed')

    session.pop('google_auth_state', None)
    session.pop('google_code_verifier', None)

    credentials = flow.credentials
    try:
        response = requests.get(
            'https://openidconnect.googleapis.com/v1/userinfo',
            headers={'Authorization': f'Bearer {credentials.token}'},
            timeout=10,
        )
        try:
            response.raise_for_status()
        except Exception as inner_exc:
            logging.error('Userinfo request failed: %s', inner_exc)
            logging.error('Response status: %s, body: %s', response.status_code, response.text)
            return redirect('/login?error=googleAuthFailed')
        profile = response.json()
    except Exception as exc:
        logging.error('Exception during userinfo fetch: %s', exc)
        logging.error(traceback.format_exc())
        return redirect('/login?error=googleAuthFailed')

    email = profile.get('email')
    if not email:
        return redirect('/login?error=googleAuthFailed')
    if not profile.get('email_verified', True):
        return redirect('/login?error=googleNotVerified')

    try:
        user = USER_STORE.get_or_create_oauth_user('google', email, profile)
    except ValueError:
        return redirect('/login?error=googleAuthFailed')

    user['last_login_at'] = time_utils.iso(time_utils.now())
    _persist_user(user)
    session['user'] = user['email']
    return redirect('/index.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


@app.route('/api/me', methods=['GET', 'PATCH'])
def api_me():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    if request.method == 'GET':
        return jsonify({"ok": True, "user": _serialize_user(user)})

    data = request.get_json(silent=True) or {}
    allowed_fields = {
        'display_name', 'nickname', 'first_name', 'last_name', 'currency',
        'two_factor_enabled', 'email_notifications'
    }
    updated = False
    for key in allowed_fields:
        if key in data:
            value = data[key]
            if key in {'two_factor_enabled', 'email_notifications'}:
                value = bool(value)
            elif isinstance(value, str):
                value = value.strip()
            user[key] = value
            updated = True
    if updated:
        first = (user.get('first_name') or '').strip()
        last = (user.get('last_name') or '').strip()
        nickname = (user.get('nickname') or '').strip()
        if first or last:
            user['display_name'] = ' '.join(part for part in (first, last) if part)
        elif nickname:
            user['display_name'] = nickname
        else:
            user['display_name'] = user['email']
        _persist_user(user)
    return jsonify({"ok": True, "user": _serialize_user(user)})


@app.route('/api/me/password', methods=['POST'])
def api_me_password():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    data = request.get_json(silent=True) or {}
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''
    if not old_password or not new_password:
        return jsonify({"ok": False, "error": "Missing required fields"}), 400
    if not UserStore.verify_password(user, old_password):
        return jsonify({"ok": False, "error": "Old password is incorrect"}), 400
    if len(new_password) < 6:
        return jsonify({"ok": False, "error": "Password must be at least 6 characters"}), 400
    UserStore.set_password(user, new_password)
    _persist_user(user)
    return jsonify({"ok": True})


@app.route('/api/deposit', methods=['POST'])
def api_deposit():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    data = request.get_json(silent=True) or {}
    amount = data.get('amount')
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid deposit amount"}), 400
    if amount_value < 10:
        return jsonify({"ok": False, "error": "Minimum deposit is 10."}), 400

    balance = float(user.get('balance', 0.0) or 0.0)
    user['balance'] = round(balance + amount_value, 2)
    transactions = user.setdefault('transactions', [])
    transactions.insert(0, {
        "type": "deposit",
        "amount": round(amount_value, 2),
        "currency": user.get('currency', 'USD'),
        "created_at": time_utils.iso(time_utils.now()),
    })
    user['transactions'] = transactions[:200]
    _persist_user(user)
    return jsonify({"ok": True, "balance": user['balance'], "user": _serialize_user(user)})


@app.route('/api/assets', methods=['GET'])
def api_assets():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    category = request.args.get('category')
    if category:
        key = category.strip().lower()
        assets = asset_service.get_assets_by_category(key)
        return jsonify({
            "ok": True,
            "assets": assets,
            "category": key,
            "updated_at": time_utils.iso(time_utils.now()),
        })

    catalog = asset_service.get_catalog()
    return jsonify({
        "ok": True,
        "assets": catalog,
        "updated_at": time_utils.iso(time_utils.now()),
    })


@app.route('/api/tournaments', methods=['GET'])
def api_tournaments():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    return jsonify({"ok": True, "tournaments": catalog_service.get_tournaments()})


@app.route('/api/promotions', methods=['GET'])
def api_promotions():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    return jsonify({"ok": True, "promotions": catalog_service.get_promotions()})


@app.route('/api/trades', methods=['GET', 'POST'])
def api_trades():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    if request.method == 'GET':
        return jsonify({
            "ok": True,
            "trades": trading_service.get_active_trades(user),
            "balance": user.get('balance', 0.0),
            "user": _serialize_user(user),
        })

    data = request.get_json(silent=True) or {}
    direction = (data.get('direction') or '').strip().lower()
    asset_ref = data.get('asset_id') or data.get('asset')
    amount = data.get('amount')
    expiration = data.get('expiration') or data.get('duration')

    if direction not in {'buy', 'sell', 'call', 'put'}:
        return jsonify({"ok": False, "error": "Direction must be CALL/PUT"}), 400
    if not asset_ref:
        return jsonify({"ok": False, "error": "Asset is required"}), 400
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid trade amount"}), 400

    try:
        trade = trading_service.open_trade(user, asset_ref, direction, amount_value, expiration)
    except ValueError as exc:
        message = str(exc) or "Invalid trade request"
        status = 400
        if "asset not found" in message.lower():
            status = 404
        return jsonify({"ok": False, "error": message}), status

    _persist_user(user)
    return jsonify({
        "ok": True,
        "trade": trading_service.serialize_trade(trade),
        "balance": user.get('balance', 0.0),
        "user": _serialize_user(user),
    })


@app.route('/api/history', methods=['GET'])
def api_history():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    return jsonify({
        "ok": True,
        "history": user.get('history', []),
        "balance": user.get('balance', 0.0),
        "user": _serialize_user(user),
    })


@app.route('/api/transactions', methods=['GET'])
def api_transactions():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401
    return jsonify({
        "ok": True,
        "transactions": trading_service.get_transactions(user),
        "balance": user.get('balance', 0.0),
        "user": _serialize_user(user),
    })


@app.route('/api/chart', methods=['GET'])
def api_chart():
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    asset_id = request.args.get('asset') or request.args.get('asset_id') or request.args.get('symbol')
    if not asset_id:
        return jsonify({"ok": False, "error": "Asset is required"}), 400

    timeframe = request.args.get('timeframe') or request.args.get('tf')
    points_param = request.args.get('points') or request.args.get('limit')
    try:
        points = int(points_param) if points_param else 120
    except (TypeError, ValueError):
        points = 120

    try:
        chart_payload = get_otc_chart(asset_id, timeframe, points)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404

    chart_payload["requested_at"] = time_utils.iso(time_utils.now())
    return jsonify({"ok": True, "chart": chart_payload})


@app.route('/api/ohlc', methods=['GET'])
def api_ohlc():
    """
    Deterministic OHLC endpoint - returns historical candles + optional partial
    Query params:
        - asset: Asset/symbol ID (required)
        - timeframe: Timeframe in minutes (default: 1)
        - count: Number of candles (default: 500)
        - includePartial: Include forming candle (default: true)
    """
    user = _ensure_session_user()
    if not user:
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    asset_id = request.args.get('asset') or request.args.get('symbol')
    if not asset_id:
        return jsonify({"ok": False, "error": "Asset is required"}), 400

    # Parse timeframe
    timeframe_param = request.args.get('timeframe', '1')
    try:
        timeframe_minutes = int(timeframe_param)
    except ValueError:
        timeframe_minutes = 1

    # Parse count
    count_param = request.args.get('count', '500')
    try:
        count = min(int(count_param), 5000)  # Cap at 5000
    except ValueError:
        count = 500

    # Include partial flag
    include_partial = request.args.get('includePartial', 'true').lower() == 'true'

    try:
        from services.deterministic_generator import (
            generate_series,
            generate_partial_candle,
            get_candle_index,
            get_candle_start_time,
        )
        from services.assets import find_asset
        from services.candle_db import get_candles, get_latest_candle, get_partial_candle
        from services.candle_auto_save import get_auto_saver

        # Get asset info for initial price
        asset_payload = find_asset(asset_id)
        if not asset_payload:
            return jsonify({"ok": False, "error": "Asset not found"}), 404

        # Get initial price
        try:
            initial_price = float(asset_payload.get("price", "100").replace(",", ""))
        except (TypeError, ValueError):
            initial_price = 100.0

        version = "v1"
        server_time_ms = int(time.time() * 1000)
        
        # Start tracking this symbol for auto-save
        auto_saver = get_auto_saver()
        auto_saver.track_symbol(
            symbol=asset_id,
            timeframe_minutes=timeframe_minutes,
            version=version,
            initial_price=initial_price,
            volatility=0.02,
            price_decimals=5
        )
        
        # Get saved candles from database
        saved_candles = get_candles(asset_id, timeframe_minutes, version, count=count)
        
        # If we have saved candles, use them
        if saved_candles:
            candles_data = saved_candles
            
            # Get the last saved candle's close for next candle generation
            last_saved = get_latest_candle(asset_id, timeframe_minutes, version)
            prev_close = last_saved['close'] if last_saved else initial_price
        else:
            # No saved candles, generate from scratch
            start_time_ms = server_time_ms - (count * timeframe_minutes * 60 * 1000)
            
            candles = generate_series(
                symbol=asset_id,
                timeframe_minutes=timeframe_minutes,
                version=version,
                start_time_ms=start_time_ms,
                count=count,
                initial_price=initial_price,
                volatility=0.02,
                price_decimals=5,
            )
            
            candles_data = [c.to_dict() for c in candles]
            prev_close = candles[-1].close if candles else initial_price

        # Generate partial candle if requested
        partial = None
        if include_partial and candles_data:
            current_index = get_candle_index(server_time_ms, timeframe_minutes)
            current_candle_start_ms = get_candle_start_time(current_index, timeframe_minutes)
            
            # Only generate partial if it's after the last historical candle
            last_candle_time = candles_data[-1]['start_time_ms']
            if current_candle_start_ms > last_candle_time:
                # Try to get saved partial candle first
                saved_partial = get_partial_candle(asset_id, timeframe_minutes, version)
                
                if saved_partial and saved_partial['start_time_ms'] == current_candle_start_ms:
                    # Use saved partial candle (persisted from previous request)
                    partial = saved_partial
                else:
                    # Generate new partial candle
                    timeframe_ms = timeframe_minutes * 60 * 1000
                    seed_base = f"{asset_id}|{timeframe_minutes}|{version}|"

                    partial_candle = generate_partial_candle(
                        seed_base=seed_base,
                        index=current_index,
                        prev_close=prev_close,
                        candle_start_ms=current_candle_start_ms,
                        server_time_ms=server_time_ms,
                        timeframe_ms=timeframe_ms,
                        volatility=0.02,
                        timeframe_minutes=timeframe_minutes,
                        price_decimals=5,
                    )
                    partial = partial_candle.to_dict()

        return jsonify({
            "ok": True,
            "symbol": asset_id,
            "timeframeMinutes": timeframe_minutes,
            "version": version,
            "serverTimeMs": server_time_ms,
            "candles": candles_data,
            "partial": partial,
            "fromDatabase": len(saved_candles) > 0,
        })

    except Exception as exc:
        logging.error(f"Error in /api/ohlc: {exc}")
        logging.error(traceback.format_exc())
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Lightweight health endpoint for readiness checks."""
    try:
        return jsonify({"ok": True, "status": "ok", "time": time_utils.iso(time_utils.now())})
    except Exception:
        return jsonify({"ok": False, "status": "error"}), 500


@app.route('/admin/resolve-trades', methods=['POST'])
def admin_resolve_trades():
    """Admin endpoint to trigger trade resolution on-demand.

    Requires authentication and that the logged-in user's email matches the
    `TANIX_ADMIN_EMAIL` environment variable. Accepts optional JSON body
    { "email": "user@example.com" } to resolve a single user; otherwise
    resolves all users.
    """
    # simple auth: must be logged in
    if not session.get('user'):
        return jsonify({"ok": False, "error": "Not authenticated"}), 401

    admin_email = os.environ.get('TANIX_ADMIN_EMAIL')
    if not admin_email or session.get('user') != admin_email:
        return jsonify({"ok": False, "error": "Not authorized"}), 403

    data = request.get_json(silent=True) or {}
    target = data.get('email')
    resolved_summary = []

    if target:
        user = USER_STORE.get(target)
        if not user:
            return jsonify({"ok": False, "error": "User not found"}), 404
        resolved = trading_service.resolve_active_trades(user)
        if resolved:
            USER_STORE.upsert(user)
            USER_STORE.save()
        resolved_summary.extend(resolved)
    else:
        # resolve for all users
        try:
            users = USER_STORE.list_users() if hasattr(USER_STORE, 'list_users') else []
        except Exception:
            users = []
        for u in users:
            try:
                resolved = trading_service.resolve_active_trades(u)
                if resolved:
                    USER_STORE.upsert(u)
                    USER_STORE.save()
                    resolved_summary.extend(resolved)
            except Exception:
                logging.exception('Failed to resolve trades for user: %s', u.get('email'))

    return jsonify({"ok": True, "resolved_count": len(resolved_summary), "resolved": resolved_summary})


if __name__ == '__main__':
    # Configurable host/port via env for flexibility
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '5000'))
    debug = os.environ.get('FLASK_DEBUG', '1') == '1'
    app.run(host=host, port=port, debug=debug)
