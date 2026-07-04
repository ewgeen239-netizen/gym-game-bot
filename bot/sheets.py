"""Google Sheets storage backend (same interface as JsonStorage).

Layout (one worksheet / tab per entity):
  Users    — one row per player
  Workouts — append-only training log
  Clubs    — guild rows
  Duels    — weekly duel rows

Complex fields (lists / dicts) are stored as JSON strings inside their cell so
the sheet stays human-readable while preserving full structure.
"""
from __future__ import annotations

import base64
import binascii
import json
import threading
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

from .storage import Storage

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

USER_COLUMNS = [
    "user_id", "username", "first_name", "created_at", "level", "xp", "total_xp",
    "strength", "endurance", "agility", "streak", "last_workout", "total_sets",
    "tier", "skin", "equipment", "achievements", "quests", "club_id",
    "referrer_id", "duels_won",
]
WORKOUT_COLUMNS = [
    "id", "user_id", "ts", "exercise", "name", "muscle_group", "stat",
    "sets", "reps", "weight", "xp_gained",
]
CLUB_COLUMNS = ["club_id", "name", "owner_id", "created_at", "members", "total_xp"]
DUEL_COLUMNS = [
    "duel_id", "challenger_id", "opponent_id", "week", "challenger_xp",
    "opponent_xp", "status", "created_at",
]

# Fields that must be JSON-encoded in a cell.
_JSON_FIELDS = {"equipment", "achievements", "quests", "members"}


def _encode(field: str, value):
    if field in _JSON_FIELDS:
        return json.dumps(value or ([] if field in ("achievements", "members") else {}), ensure_ascii=False)
    return "" if value is None else value


def _decode(field: str, raw):
    if field in _JSON_FIELDS:
        try:
            return json.loads(raw) if raw else ([] if field in ("achievements", "members") else {})
        except (json.JSONDecodeError, TypeError):
            return [] if field in ("achievements", "members") else {}
    return raw


def _coerce_numbers(row: dict) -> dict:
    for k in ("level", "xp", "total_xp", "strength", "endurance", "agility",
              "streak", "total_sets", "tier", "sets", "reps", "duels_won",
              "challenger_xp", "opponent_xp", "members_count"):
        if k in row and row[k] not in ("", None):
            try:
                row[k] = int(float(row[k]))
            except (ValueError, TypeError):
                pass
    for k in ("weight",):
        if k in row and row[k] not in ("", None):
            try:
                row[k] = float(row[k])
            except (ValueError, TypeError):
                pass
    return row


def _parse_creds(creds_json: str) -> dict:
    """Accept the service-account credentials as raw JSON *or* base64-encoded
    JSON. base64 is recommended on hosts like Railway because it has no quotes
    or newlines to mangle. Gives a clear error if the value is malformed."""
    raw = (creds_json or "").strip()
    # strip a single layer of accidental wrapping quotes
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ("'", '"'):
        raw = raw[1:-1].strip()

    # try raw JSON first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # try base64 -> JSON
    try:
        decoded = base64.b64decode(raw, validate=True).decode("utf-8")
        return json.loads(decoded)
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError):
        pass

    head = raw[:24].replace("\n", " ")
    raise ValueError(
        "GOOGLE_SHEETS_CREDS is not valid JSON or base64. It must be the ENTIRE "
        "service-account file, from the opening '{' to the closing '}' "
        f"(got start: {head!r}...). Tip: base64-encode the file to avoid paste "
        "issues — `base64 -i key.json` (macOS) / `base64 -w0 key.json` (Linux)."
    )


class SheetsStorage(Storage):
    def __init__(self, creds_json: str, sheet_id: str):
        info = _parse_creds(creds_json)
        creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        self._gc = gspread.authorize(creds)
        self._sh = self._gc.open_by_key(sheet_id)
        self._lock = threading.Lock()
        self._ws = {
            "Users": self._ensure("Users", USER_COLUMNS),
            "Workouts": self._ensure("Workouts", WORKOUT_COLUMNS),
            "Clubs": self._ensure("Clubs", CLUB_COLUMNS),
            "Duels": self._ensure("Duels", DUEL_COLUMNS),
        }
        # in-memory row-index maps: entity id -> sheet row number (1-based incl. header)
        self._index = {"Users": {}, "Clubs": {}, "Duels": {}}
        self._reindex()

    def _ensure(self, title: str, columns: list[str]):
        try:
            ws = self._sh.worksheet(title)
        except gspread.WorksheetNotFound:
            ws = self._sh.add_worksheet(title=title, rows=1000, cols=max(10, len(columns)))
            ws.append_row(columns)
            return ws
        # make sure the header row is present
        header = ws.row_values(1)
        if not header:
            ws.update([columns], "A1")
        return ws

    def _reindex(self):
        for title, key in (("Users", "user_id"), ("Clubs", "club_id"), ("Duels", "duel_id")):
            records = self._ws[title].get_all_records()
            idx = {}
            for i, rec in enumerate(records, start=2):  # row 1 is header
                if rec.get(key) not in ("", None):
                    idx[str(rec[key])] = i
            self._index[title] = idx

    def _rows(self, title: str, columns: list[str]) -> list[dict]:
        out = []
        for rec in self._ws[title].get_all_records():
            row = {c: _decode(c, rec.get(c, "")) for c in columns}
            out.append(_coerce_numbers(row))
        return out

    def _upsert(self, title: str, columns: list[str], key: str, obj: dict):
        values = [_encode(c, obj.get(c)) for c in columns]
        with self._lock:
            row_num = self._index[title].get(str(obj[key]))
            if row_num:
                self._ws[title].update([values], f"A{row_num}")
            else:
                self._ws[title].append_row(values, value_input_option="USER_ENTERED")
                self._index[title][str(obj[key])] = len(self._ws[title].col_values(1))

    # users
    def get_user(self, uid):
        for u in self.list_users():
            if str(u["user_id"]) == str(uid):
                return u
        return None

    def save_user(self, user):
        self._upsert("Users", USER_COLUMNS, "user_id", user)

    def list_users(self):
        return self._rows("Users", USER_COLUMNS)

    # workouts (append-only)
    def add_workout(self, row):
        values = [_encode(c, row.get(c)) for c in WORKOUT_COLUMNS]
        with self._lock:
            self._ws["Workouts"].append_row(values, value_input_option="USER_ENTERED")

    def list_workouts(self, uid, limit=100):
        rows = [r for r in self._rows("Workouts", WORKOUT_COLUMNS) if str(r["user_id"]) == str(uid)]
        return rows[-limit:]

    # clubs
    def get_club(self, cid):
        for c in self.list_clubs():
            if c["club_id"] == cid:
                return c
        return None

    def save_club(self, club):
        self._upsert("Clubs", CLUB_COLUMNS, "club_id", club)

    def list_clubs(self):
        return self._rows("Clubs", CLUB_COLUMNS)

    # duels
    def get_duel(self, did):
        for d in self.list_duels():
            if d["duel_id"] == did:
                return d
        return None

    def save_duel(self, duel):
        self._upsert("Duels", DUEL_COLUMNS, "duel_id", duel)

    def list_duels(self):
        return self._rows("Duels", DUEL_COLUMNS)
