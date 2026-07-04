"""Storage abstraction with a local-JSON backend and a factory.

The Google Sheets backend lives in ``sheets.py`` and implements the same
``Storage`` interface, so the rest of the app is storage-agnostic.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from typing import Optional

from . import config


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class Storage:
    """Interface implemented by both JSON and Sheets backends."""

    # users
    def get_user(self, uid: int) -> Optional[dict]: raise NotImplementedError
    def save_user(self, user: dict) -> None: raise NotImplementedError
    def list_users(self) -> list[dict]: raise NotImplementedError
    # workouts
    def add_workout(self, row: dict) -> None: raise NotImplementedError
    def list_workouts(self, uid: int, limit: int = 100) -> list[dict]: raise NotImplementedError
    # clubs
    def get_club(self, cid: str) -> Optional[dict]: raise NotImplementedError
    def save_club(self, club: dict) -> None: raise NotImplementedError
    def list_clubs(self) -> list[dict]: raise NotImplementedError
    # duels
    def get_duel(self, did: str) -> Optional[dict]: raise NotImplementedError
    def save_duel(self, duel: dict) -> None: raise NotImplementedError
    def list_duels(self) -> list[dict]: raise NotImplementedError


class JsonStorage(Storage):
    """Single-file JSON backend. Good for local dev and small deployments."""

    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._data = {"users": {}, "workouts": [], "clubs": {}, "duels": {}}
        self._load()

    def _load(self) -> None:
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        for key, default in (("users", {}), ("workouts", []), ("clubs", {}), ("duels", {})):
            self._data.setdefault(key, default)

    def _flush(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = f"{self.path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    # users
    def get_user(self, uid):
        return self._data["users"].get(str(uid))

    def save_user(self, user):
        with self._lock:
            self._data["users"][str(user["user_id"])] = user
            self._flush()

    def list_users(self):
        return list(self._data["users"].values())

    # workouts
    def add_workout(self, row):
        with self._lock:
            self._data["workouts"].append(row)
            self._flush()

    def list_workouts(self, uid, limit=100):
        rows = [w for w in self._data["workouts"] if str(w["user_id"]) == str(uid)]
        return rows[-limit:]

    # clubs
    def get_club(self, cid):
        return self._data["clubs"].get(cid)

    def save_club(self, club):
        with self._lock:
            self._data["clubs"][club["club_id"]] = club
            self._flush()

    def list_clubs(self):
        return list(self._data["clubs"].values())

    # duels
    def get_duel(self, did):
        return self._data["duels"].get(did)

    def save_duel(self, duel):
        with self._lock:
            self._data["duels"][duel["duel_id"]] = duel
            self._flush()

    def list_duels(self):
        return list(self._data["duels"].values())


def build_storage() -> Storage:
    """Pick the backend based on configuration.

    If Google Sheets is configured but fails to initialise, log a clear reason
    and fall back to local JSON so the bot still starts (instead of crashing on
    a raw traceback).
    """
    import logging

    log = logging.getLogger("gymgame.storage")
    if config.USE_SHEETS:
        try:
            from .sheets import SheetsStorage  # lazy import so JSON mode needs no gspread
            return SheetsStorage(config.GOOGLE_SHEETS_CREDS, config.GOOGLE_SHEET_ID)
        except Exception as exc:  # noqa: BLE001 — surface a readable message, then fall back
            log.error("=" * 60)
            log.error("Google Sheets init FAILED — falling back to local JSON.")
            log.error("Reason: %s: %s", type(exc).__name__, exc)
            log.error("Common fixes:")
            log.error("  • GOOGLE_SHEETS_CREDS must be the FULL service-account JSON")
            log.error("    (starts with {\"type\": \"service_account\", ...}).")
            log.error("  • Enable BOTH Google Sheets API and Google Drive API.")
            log.error("  • Share the sheet with the service account client_email (Editor).")
            log.error("  • GOOGLE_SHEET_ID = the id between /d/ and /edit in the sheet URL.")
            log.error("See GOOGLE_SHEETS_SETUP.md")
            log.error("=" * 60)
    return JsonStorage(config.DATA_FILE)
