"""User persistence and helper utilities."""

from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Dict, Any

from werkzeug.security import generate_password_hash, check_password_hash

from .time_utils import now, iso


DEFAULT_BALANCE = 10_000.0
DEFAULT_CURRENCY = "USD"


class UserStore:
    """Simple JSON-backed user store for demo purposes."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._data = self._load()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _load(self) -> Dict[str, Dict[str, Any]]:
        if self._db_path.exists():
            try:
                with self._db_path.open("r", encoding="utf-8") as fh:
                    raw = json.load(fh)
                    if isinstance(raw, dict):
                        for user in raw.values():
                            self.ensure_structs(user)
                        return raw
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _write(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._db_path.with_suffix(".json.tmp")
        with tmp_path.open("w", encoding="utf-8") as fh:
            json.dump(self._data, fh, indent=2, ensure_ascii=False)
        tmp_path.replace(self._db_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @staticmethod
    def normalize_email(email: str | None) -> str | None:
        if not email:
            return None
        return email.strip().lower()

    @staticmethod
    def generate_account_id() -> str:
        return str(random.randint(10_000_000, 99_999_999))

    @staticmethod
    def ensure_structs(user: Dict[str, Any] | None) -> None:
        if not user:
            return
        user.setdefault("balance", DEFAULT_BALANCE)
        user.setdefault("currency", DEFAULT_CURRENCY)
        user.setdefault("active_trades", [])
        user.setdefault("history", [])
        user.setdefault("transactions", [])
        user.setdefault("providers", {})
        if "created_at" not in user:
            user["created_at"] = iso(now())
        user.setdefault("profile", {})

    def save(self) -> None:
        self._write()

    # ------------------------------------------------------------------
    # User retrieval and serialization
    # ------------------------------------------------------------------
    def get(self, email: str | None) -> Dict[str, Any] | None:
        normalized = self.normalize_email(email)
        if not normalized:
            return None
        user = self._data.get(normalized)
        if user:
            self.ensure_structs(user)
        return user

    def upsert(self, user: Dict[str, Any]) -> None:
        normalized = self.normalize_email(user.get("email"))
        if not normalized:
            raise ValueError("User must include an email")
        self.ensure_structs(user)
        self._data[normalized] = user

    def authenticate(self, email: str, password: str) -> Dict[str, Any] | None:
        user = self.get(email)
        if not user:
            return None
        hash_value = user.get("password_hash")
        if not hash_value:
            return None
        try:
            if not check_password_hash(hash_value, password):
                return None
        except ValueError:
            return None
        return user

    def create_user(self, email: str, password: str, currency: str | None = None) -> Dict[str, Any]:
        normalized = self.normalize_email(email)
        if not normalized:
            raise ValueError("Email is required")
        if self.get(normalized):
            raise ValueError("User already exists")

        display_name = normalized.split("@")[0].replace(".", " ").title()
        timestamp = iso(now())
        user = {
            "email": normalized,
            "password_hash": generate_password_hash(password),
            "display_name": display_name,
            "nickname": "",
            "first_name": "",
            "last_name": "",
            "currency": currency or DEFAULT_CURRENCY,
            "balance": DEFAULT_BALANCE,
            "account_id": self.generate_account_id(),
            "two_factor_enabled": False,
            "email_notifications": True,
            "active_trades": [],
            "history": [],
            "transactions": [],
            "created_at": timestamp,
            "last_login_at": None,
            "providers": {"password": timestamp},
        }
        self.upsert(user)
        self.save()
        return user

    def get_or_create_oauth_user(self, provider: str, email: str, profile: Dict[str, Any] | None = None) -> Dict[str, Any]:
        normalized = self.normalize_email(email)
        if not normalized:
            raise ValueError("Email is required")

        profile = profile or {}
        timestamp = iso(now())
        display_name = profile.get("name") or normalized.split("@")[0].replace(".", " ").title()
        first_name = profile.get("given_name") or ""
        last_name = profile.get("family_name") or ""
        picture = profile.get("picture")

        user = self.get(normalized)
        if user:
            self.ensure_structs(user)
            providers = user.setdefault("providers", {})
            if provider not in providers:
                providers[provider] = timestamp
            if display_name and not user.get("display_name"):
                user["display_name"] = display_name
            if first_name and not user.get("first_name"):
                user["first_name"] = first_name
            if last_name and not user.get("last_name"):
                user["last_name"] = last_name
            if picture:
                profile_data = user.setdefault("profile", {})
                profile_data.setdefault("picture", picture)
            self.upsert(user)
            self.save()
            return user

        user = {
            "email": normalized,
            "password_hash": "",
            "display_name": display_name,
            "nickname": "",
            "first_name": first_name,
            "last_name": last_name,
            "currency": DEFAULT_CURRENCY,
            "balance": DEFAULT_BALANCE,
            "account_id": self.generate_account_id(),
            "two_factor_enabled": False,
            "email_notifications": True,
            "active_trades": [],
            "history": [],
            "transactions": [],
            "created_at": timestamp,
            "last_login_at": None,
            "providers": {provider: timestamp},
            "created_via": provider,
        }
        if picture:
            user["profile"] = {"picture": picture}
        self.upsert(user)
        self.save()
        return user

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------
    @staticmethod
    def serialize_user(user: Dict[str, Any]) -> Dict[str, Any]:
        if not user:
            return {}
        display_name = (
            user.get("display_name")
            or user.get("nickname")
            or user.get("first_name")
            or user.get("email")
        )
        email = user.get("email")
        initials = ''.join(part[0].upper() for part in (display_name or email or '').split() if part)[:2]
        if not initials and email:
            initials = email[0].upper()
        return {
            "email": email,
            "display_name": display_name,
            "nickname": user.get("nickname") or "",
            "first_name": user.get("first_name") or "",
            "last_name": user.get("last_name") or "",
            "currency": user.get("currency", DEFAULT_CURRENCY),
            "balance": user.get("balance", DEFAULT_BALANCE),
            "account_id": user.get("account_id"),
            "two_factor_enabled": bool(user.get("two_factor_enabled")),
            "email_notifications": bool(user.get("email_notifications", True)),
            "initials": initials,
            "active_trade_count": len(user.get("active_trades", [])),
            "last_login_at": user.get("last_login_at"),
            "providers": dict(user.get("providers") or {}),
            "profile": dict(user.get("profile") or {}),
        }

    # ------------------------------------------------------------------
    # Password utilities
    # ------------------------------------------------------------------
    @staticmethod
    def verify_password(user: Dict[str, Any], password: str) -> bool:
        hash_value = user.get("password_hash")
        if not hash_value:
            return False
        try:
            return check_password_hash(hash_value, password)
        except ValueError:
            return False

    @staticmethod
    def set_password(user: Dict[str, Any], new_password: str) -> None:
        user["password_hash"] = generate_password_hash(new_password)
        providers = user.setdefault("providers", {})
        providers["password"] = iso(now())


def get_store(db_path: Path | None = None) -> UserStore:
    """Factory that allows lazy import without circular dependencies."""
    # Determine default path
    if db_path is None:
        root = Path(os.environ.get("TANIX_DATA_DIR", "data"))
        db_path = root / "users.json"

    # Support optional SQLite backend via env var
    db_url = os.environ.get("TANIX_DB_URL")
    use_sqlite = os.environ.get("TANIX_USE_SQLITE") == "1" or (db_url and str(db_url).startswith("sqlite://"))
    if use_sqlite:
        # Resolve sqlite path
        if db_url and str(db_url).startswith("sqlite://"):
            sqlite_path = Path(str(db_url)[len("sqlite://"):])
        else:
            sqlite_path = Path(os.environ.get("TANIX_DATA_DIR", "data")) / "users.db"

        # Lazy import sqlite implementation
        try:
            import sqlite3
        except Exception:
            # Fallback to JSON store if sqlite not available
            return UserStore(db_path)

        # If a JSON store exists, attempt migration (best-effort)
        try:
            if db_path.exists() and db_path.suffix == '.json':
                _migrate_json_to_sqlite(db_path, sqlite_path)
        except Exception:
            # ignore migration failures and continue
            pass

        return _SQLiteUserStore(sqlite_path)

    return UserStore(db_path)


def _load_all_from_json(json_path: Path) -> list:
    try:
        with json_path.open('r', encoding='utf-8') as fh:
            raw = json.load(fh)
        if isinstance(raw, dict):
            return list(raw.values())
    except Exception:
        pass
    return []


def _migrate_json_to_sqlite(json_path: Path, sqlite_path: Path) -> None:
    """Migrate existing JSON users into SQLite (best-effort, non-destructive).

    This will insert/update users into the SQLite DB and attempt to back up the
    original JSON file by renaming it to `.bak` suffix. Failures are non-fatal.
    """
    try:
        if not json_path.exists():
            return
        with json_path.open('r', encoding='utf-8') as fh:
            raw = json.load(fh)
        if not isinstance(raw, dict):
            return
        store = _SQLiteUserStore(sqlite_path)
        for user in raw.values():
            try:
                store.upsert(user)
            except Exception:
                continue
        # Backup original JSON
        try:
            backup = json_path.with_suffix(json_path.suffix + '.bak')
            json_path.replace(backup)
        except Exception:
            pass
    except Exception:
        return


class _SQLiteUserStore:
    """A lightweight SQLite-backed user store that mirrors the JSON store API.

    It stores the entire user JSON blob in a single table column for simplicity.
    """

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        import sqlite3
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._ensure_tables()

    def _ensure_tables(self) -> None:
        cur = self._conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                data TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @staticmethod
    def normalize_email(email: str | None) -> str | None:
        if not email:
            return None
        return email.strip().lower()

    @staticmethod
    def generate_account_id() -> str:
        return str(random.randint(10_000_000, 99_999_999))

    @staticmethod
    def ensure_structs(user: Dict[str, Any] | None) -> None:
        if not user:
            return
        user.setdefault("balance", DEFAULT_BALANCE)
        user.setdefault("currency", DEFAULT_CURRENCY)
        user.setdefault("active_trades", [])
        user.setdefault("history", [])
        user.setdefault("transactions", [])
        user.setdefault("providers", {})
        if "created_at" not in user:
            user["created_at"] = iso(now())
        user.setdefault("profile", {})

    def save(self) -> None:
        # SQLite writes immediately on upsert; nothing to do here.
        return

    def list_users(self) -> list[Dict[str, Any]]:
        cur = self._conn.cursor()
        cur.execute("SELECT data FROM users ORDER BY email")
        rows = cur.fetchall()
        out = []
        for row in rows:
            try:
                user = json.loads(row["data"])
            except Exception:
                continue
            self.ensure_structs(user)
            out.append(user)
        return out

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def get(self, email: str | None) -> Dict[str, Any] | None:
        normalized = self.normalize_email(email)
        if not normalized:
            return None
        cur = self._conn.cursor()
        cur.execute("SELECT data FROM users WHERE email = ?", (normalized,))
        row = cur.fetchone()
        if not row:
            return None
        try:
            user = json.loads(row["data"])
        except Exception:
            return None
        self.ensure_structs(user)
        return user

    def upsert(self, user: Dict[str, Any]) -> None:
        normalized = self.normalize_email(user.get("email"))
        if not normalized:
            raise ValueError("User must include an email")
        self.ensure_structs(user)
        data = json.dumps(user, ensure_ascii=False)
        cur = self._conn.cursor()
        # Use REPLACE to insert or update
        cur.execute("REPLACE INTO users (email, data) VALUES (?, ?)", (normalized, data))
        self._conn.commit()

    def authenticate(self, email: str, password: str) -> Dict[str, Any] | None:
        user = self.get(email)
        if not user:
            return None
        hash_value = user.get("password_hash")
        if not hash_value:
            return None
        try:
            if not check_password_hash(hash_value, password):
                return None
        except ValueError:
            return None
        return user

    def create_user(self, email: str, password: str, currency: str | None = None) -> Dict[str, Any]:
        normalized = self.normalize_email(email)
        if not normalized:
            raise ValueError("Email is required")
        if self.get(normalized):
            raise ValueError("User already exists")

        display_name = normalized.split("@")[0].replace(".", " ").title()
        timestamp = iso(now())
        user = {
            "email": normalized,
            "password_hash": generate_password_hash(password),
            "display_name": display_name,
            "nickname": "",
            "first_name": "",
            "last_name": "",
            "currency": currency or DEFAULT_CURRENCY,
            "balance": DEFAULT_BALANCE,
            "account_id": self.generate_account_id(),
            "two_factor_enabled": False,
            "email_notifications": True,
            "active_trades": [],
            "history": [],
            "transactions": [],
            "created_at": timestamp,
            "last_login_at": None,
            "providers": {"password": timestamp},
        }
        self.upsert(user)
        return user

    def get_or_create_oauth_user(self, provider: str, email: str, profile: Dict[str, Any] | None = None) -> Dict[str, Any]:
        normalized = self.normalize_email(email)
        if not normalized:
            raise ValueError("Email is required")

        profile = profile or {}
        timestamp = iso(now())
        display_name = profile.get("name") or normalized.split("@")[0].replace(".", " ").title()
        first_name = profile.get("given_name") or ""
        last_name = profile.get("family_name") or ""
        picture = profile.get("picture")

        user = self.get(normalized)
        if user:
            self.ensure_structs(user)
            providers = user.setdefault("providers", {})
            if provider not in providers:
                providers[provider] = timestamp
            if display_name and not user.get("display_name"):
                user["display_name"] = display_name
            if first_name and not user.get("first_name"):
                user["first_name"] = first_name
            if last_name and not user.get("last_name"):
                user["last_name"] = last_name
            if picture:
                profile_data = user.setdefault("profile", {})
                profile_data.setdefault("picture", picture)
            self.upsert(user)
            return user

        user = {
            "email": normalized,
            "password_hash": "",
            "display_name": display_name,
            "nickname": "",
            "first_name": first_name,
            "last_name": last_name,
            "currency": DEFAULT_CURRENCY,
            "balance": DEFAULT_BALANCE,
            "account_id": self.generate_account_id(),
            "two_factor_enabled": False,
            "email_notifications": True,
            "active_trades": [],
            "history": [],
            "transactions": [],
            "created_at": timestamp,
            "last_login_at": None,
            "providers": {provider: timestamp},
            "created_via": provider,
        }
        if picture:
            user["profile"] = {"picture": picture}
        self.upsert(user)
        return user

    # ------------------------------------------------------------------
    # Serialization helpers (mirror UserStore.serialize_user)
    # ------------------------------------------------------------------
    @staticmethod
    def serialize_user(user: Dict[str, Any]) -> Dict[str, Any]:
        if not user:
            return {}
        display_name = (
            user.get("display_name")
            or user.get("nickname")
            or user.get("first_name")
            or user.get("email")
        )
        email = user.get("email")
        initials = ''.join(part[0].upper() for part in (display_name or email or '').split() if part)[:2]
        if not initials and email:
            initials = email[0].upper()
        return {
            "email": email,
            "display_name": display_name,
            "nickname": user.get("nickname") or "",
            "first_name": user.get("first_name") or "",
            "last_name": user.get("last_name") or "",
            "currency": user.get("currency", DEFAULT_CURRENCY),
            "balance": user.get("balance", DEFAULT_BALANCE),
            "account_id": user.get("account_id"),
            "two_factor_enabled": bool(user.get("two_factor_enabled")),
            "email_notifications": bool(user.get("email_notifications", True)),
            "initials": initials,
            "active_trade_count": len(user.get("active_trades", [])),
            "last_login_at": user.get("last_login_at"),
            "providers": dict(user.get("providers") or {}),
            "profile": dict(user.get("profile") or {}),
        }

    # ------------------------------------------------------------------
    # Password utilities
    # ------------------------------------------------------------------
    @staticmethod
    def verify_password(user: Dict[str, Any], password: str) -> bool:
        hash_value = user.get("password_hash")
        if not hash_value:
            return False
        try:
            return check_password_hash(hash_value, password)
        except ValueError:
            return False

    @staticmethod
    def set_password(user: Dict[str, Any], new_password: str) -> None:
        user["password_hash"] = generate_password_hash(new_password)
        providers = user.setdefault("providers", {})
        providers["password"] = iso(now())


# Add a convenience method on the JSON-backed store to list users
setattr(UserStore, 'list_users', lambda self: list(self._data.values()))
