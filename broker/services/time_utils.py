"""Time helper utilities used across the Tanix backend."""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """Serialize a datetime to an ISO 8601 string (always Z-suffixed)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO 8601 timestamp, tolerating Z suffixes."""
    if not value:
        return None
    try:
        cleaned = value
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def parse_duration_seconds(value: str | None, default_seconds: int = 300) -> int:
    """Convert a shorthand duration string (5m, 1h, etc.) into seconds."""
    if not value:
        return max(default_seconds, 1)
    raw = value.strip().lower()
    if not raw:
        return max(default_seconds, 1)

    try:
        if raw.endswith("ms"):
            return max(default_seconds, 1)
        if raw.endswith("s"):
            return max(int(float(raw[:-1])), 1)
        if raw.endswith("m"):
            minutes = float(raw[:-1]) if raw[:-1] else default_seconds / 60
            return max(int(minutes * 60), 1)
        if raw.endswith("h"):
            hours = float(raw[:-1]) if raw[:-1] else default_seconds / 3600
            return max(int(hours * 3600), 1)
        if raw.endswith("d"):
            days = float(raw[:-1]) if raw[:-1] else default_seconds / 86400
            return max(int(days * 86400), 1)
        if raw.isdigit():
            return max(int(raw), 1)
        return max(int(float(raw)), 1)
    except (TypeError, ValueError):
        return max(default_seconds, 1)
