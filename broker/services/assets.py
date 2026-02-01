"""Asset catalogue and helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Any


@dataclass(frozen=True)
class Asset:
    id: str
    name: str
    price: str
    change: str
    change_type: str
    payout: int

    def to_payload(self, category: str | None = None) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "price": self.price,
            "change": self.change,
            "changeType": self.change_type,
            "payout": self.payout,
            "category": category,
            "isOTC": category == "otc",
        }


_OTC_ASSETS: List[Asset] = [
    Asset(id="OTC-AAPL", name="OTC: AAPL", price="189.42", change="+0.35%", change_type="positive", payout=81),
    Asset(id="OTC-TSLA", name="OTC: TSLA", price="242.74", change="-0.80%", change_type="negative", payout=88),
    Asset(id="OTC-MSFT", name="OTC: MSFT", price="312.18", change="+0.22%", change_type="positive", payout=87),
    Asset(id="OTC-GOOG", name="OTC: GOOGL", price="132.11", change="+0.48%", change_type="positive", payout=86),
    Asset(id="OTC-NFLX", name="OTC: NFLX", price="406.92", change="-1.12%", change_type="negative", payout=85),
    Asset(id="OTC-AMZN", name="OTC: AMZN", price="128.14", change="+0.62%", change_type="positive", payout=87),
    Asset(id="OTC-BABA", name="OTC: BABA", price="84.52", change="+0.15%", change_type="positive", payout=84),
    Asset(id="OTC-NVDA", name="OTC: NVDA", price="442.37", change="+1.20%", change_type="positive", payout=89),
    Asset(id="OTC-INTC", name="OTC: INTC", price="46.08", change="-0.40%", change_type="negative", payout=83),
]

_ASSET_INDEX: Dict[str, Asset] = {asset.id: asset for asset in _OTC_ASSETS}
_ASSET_INDEX.update({asset.name: asset for asset in _OTC_ASSETS})


def get_catalog() -> Dict[str, List[Dict[str, Any]]]:
    """Return the entire asset catalogue keyed by category."""
    return {"otc": [asset.to_payload("otc") for asset in _OTC_ASSETS]}


def get_assets_by_category(category: str) -> List[Dict[str, Any]]:
    """Return OTC assets when requested; empty for unsupported categories."""
    normalized = (category or "").strip().lower()
    if normalized != "otc":
        return []
    return [asset.to_payload("otc") for asset in _OTC_ASSETS]


def find_asset(asset_id: str | None) -> Dict[str, Any] | None:
    """Look up an asset by id or display name."""
    if not asset_id:
        return None
    asset = _ASSET_INDEX.get(asset_id)
    if asset:
        return asset.to_payload("otc")
    return None
