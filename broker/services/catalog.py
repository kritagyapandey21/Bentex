"""Promotions and tournaments catalogue."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Any, List


@dataclass(frozen=True)
class Tournament:
    id: str
    name: str
    prize: str
    participants: int
    end_date: str

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "prize": self.prize,
            "participants": f"{self.participants:,}",
            "end_date": self.end_date,
        }


@dataclass(frozen=True)
class Promotion:
    id: str
    name: str
    description: str
    code: str

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "code": self.code,
        }


_TOURNAMENTS: List[Tournament] = [
    Tournament(id="weekly-challenge", name="Weekly Challenge", prize="$5,000", participants=1247, end_date="2 days left"),
    Tournament(id="monthly-masters", name="Monthly Masters", prize="$25,000", participants=3892, end_date="12 days left"),
    Tournament(id="cypher-sprint", name="Cypher Sprint", prize="$10,000", participants=800, end_date="1 day left"),
    Tournament(id="neon-nights", name="Neon Nights", prize="$2,500", participants=3100, end_date="6 hours left"),
    Tournament(id="quantum-leap", name="Quantum Leap", prize="$50,000", participants=500, end_date="20 days left"),
]

_PROMOTIONS: List[Promotion] = [
    Promotion(id="riskfree100", name="Risk Free Trade", description="Get your first trade covered up to $100", code="RISKFREE100"),
    Promotion(id="cashback10", name="10% Cashback", description="Get 10% cashback on all your trades this month", code="CASHBACK10"),
    Promotion(id="double1000", name="100% Deposit Bonus", description="Double your deposit up to $1,000", code="DOUBLE1000"),
    Promotion(id="crypto20", name="Crypto Mania", description="20% bonus on all crypto deposits", code="CRYPTO20"),
    Promotion(id="friend50", name="Refer-a-Friend", description="Get $50 for every friend you refer", code="FRIEND50"),
]


def get_tournaments() -> List[Dict[str, Any]]:
    return [tournament.to_payload() for tournament in _TOURNAMENTS]


def get_promotions() -> List[Dict[str, Any]]:
    return [promotion.to_payload() for promotion in _PROMOTIONS]
