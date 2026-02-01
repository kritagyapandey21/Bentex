"""Trading helpers for Tanix."""

from __future__ import annotations

import random
import uuid
from datetime import timedelta
from typing import Dict, Any, List

from . import assets
from .time_utils import now, iso, parse_iso, parse_duration_seconds

WIN_PROBABILITY = 0.30  # Only 30% of trades win (house edge: 70% lose)
LOSS_PROBABILITY = 1.0 - WIN_PROBABILITY
MAX_HISTORY = 200
MAX_TRANSACTIONS = 200


def serialize_trade(trade: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": trade.get("id"),
        "asset": trade.get("asset"),
        "asset_name": trade.get("asset_name") or trade.get("asset"),
        "direction": trade.get("direction"),
        "amount": round(float(trade.get("amount", 0.0)), 2),
        "payout_percent": float(trade.get("payout_percent", 85)),
        "opened_at": trade.get("opened_at"),
        "expires_at": trade.get("expires_at"),
        "currency": trade.get("currency"),
        "entry_price": trade.get("entry_price"),
    }


def serialize_transaction(entry: Dict[str, Any]) -> Dict[str, Any]:
    amount = round(float(entry.get("amount", 0.0)), 2)
    net_value = entry.get("net")
    net_amount = round(float(net_value), 2) if net_value is not None else amount
    return {
        "type": entry.get("type"),
        "trade_id": entry.get("trade_id"),
        "asset": entry.get("asset"),
        "direction": entry.get("direction"),
        "amount": amount,
        "net": net_amount,
        "currency": entry.get("currency"),
        "payout_percent": entry.get("payout_percent"),
        "created_at": entry.get("created_at"),
    }


def _log_transaction(user: Dict[str, Any], entry: Dict[str, Any]) -> None:
    transactions = user.setdefault("transactions", [])
    transactions.insert(0, entry)
    user["transactions"] = transactions[:MAX_TRANSACTIONS]


def open_trade(user: Dict[str, Any], asset_id: str, direction: str, amount: float, expiration: str | None) -> Dict[str, Any]:
    """Create and register a new trade for the user."""
    asset = assets.find_asset(asset_id)
    if not asset:
        raise ValueError("Asset not found")

    normalized_direction = direction.lower()
    if normalized_direction not in {"buy", "sell", "call", "put"}:
        raise ValueError("Direction must be CALL/PUT")

    normalized_direction = "buy" if normalized_direction in {"buy", "call"} else "sell"
    amount_value = round(float(amount), 2)
    if amount_value <= 0:
        raise ValueError("Trade amount must be positive")

    available_balance = float(user.get("balance", 0.0))
    if amount_value > available_balance:
        raise ValueError("Insufficient balance")

    duration_seconds = parse_duration_seconds(expiration, 300)
    opened_at = now()
    expires_at = opened_at + timedelta(seconds=duration_seconds)

    payout_percent = float(asset.get("payout", asset.get("payout_percent", 85)))
    trade_id = f"tr-{uuid.uuid4().hex[:12]}"
    trade = {
        "id": trade_id,
        "asset": asset.get("id") or asset.get("name"),
        "asset_name": asset.get("name"),
        "direction": normalized_direction,
        "amount": amount_value,
        "payout_percent": payout_percent,
        "opened_at": iso(opened_at),
        "expires_at": iso(expires_at),
        "currency": user.get("currency", "USD"),
        "entry_price": asset.get("price"),
    }

    # Deduct balance immediately for the stake
    user["balance"] = round(available_balance - amount_value, 2)
    active_trades = user.setdefault("active_trades", [])
    active_trades.insert(0, trade)

    _log_transaction(user, {
        "type": "trade_open",
        "trade_id": trade_id,
        "asset": trade["asset"],
        "direction": normalized_direction,
        "amount": amount_value,
        "net": round(-amount_value, 2),
        "currency": trade["currency"],
        "payout_percent": payout_percent,
        "created_at": trade["opened_at"],
    })

    return trade


def resolve_active_trades(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Resolve any expired trades.

    Returns a list of resolved trade result dictionaries (empty if none).
    Each resolved dict contains at least: id, asset, amount, payout_percent, result ("win"/"loss"), net, closed_at
    """
    active_trades = list(user.get("active_trades", []))
    if not active_trades:
        return []

    resolved: List[Dict[str, Any]] = []
    remaining: List[Dict[str, Any]] = []
    current_time = now()
    currency = user.get("currency", "USD")

    for trade in active_trades:
        expires_at = parse_iso(trade.get("expires_at"))
        if not expires_at or expires_at > current_time:
            remaining.append(trade)
            continue

        amount = float(trade.get("amount", 0.0))
        payout_percent = float(trade.get("payout_percent", 85))
        is_win = random.random() < WIN_PROBABILITY
        profit = round(amount * payout_percent / 100, 2) if is_win else 0.0
        net_result = round(profit if is_win else -amount, 2)

        if is_win:
            user["balance"] = round(user.get("balance", 0.0) + amount + profit, 2)

        trade_id = trade.get("id") or f"tr-{uuid.uuid4().hex[:10]}"
        history_entry = {
            "id": trade_id,
            "asset": trade.get("asset"),
            "asset_name": trade.get("asset_name") or trade.get("asset"),
            "direction": trade.get("direction"),
            "amount": round(amount, 2),
            "payout_percent": payout_percent,
            "result": "win" if is_win else "loss",
            "net": net_result,
            "closed_at": iso(current_time),
        }
        user.setdefault("history", []).insert(0, history_entry)
        user["history"] = user["history"][:MAX_HISTORY]

        _log_transaction(user, {
            "type": "trade_win" if is_win else "trade_loss",
            "trade_id": trade_id,
            "asset": trade.get("asset"),
            "direction": trade.get("direction"),
            "amount": round(amount, 2),
            "net": net_result,
            "currency": currency,
            "payout_percent": payout_percent,
            "created_at": history_entry["closed_at"],
        })

        resolved.append({
            "id": trade_id,
            "asset": trade.get("asset"),
            "amount": round(amount, 2),
            "payout_percent": payout_percent,
            "result": history_entry["result"],
            "net": net_result,
            "closed_at": history_entry["closed_at"],
        })

    user["active_trades"] = remaining
    return resolved


def get_active_trades(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [serialize_trade(trade) for trade in user.get("active_trades", [])]


def get_transactions(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [serialize_transaction(entry) for entry in user.get("transactions", [])]