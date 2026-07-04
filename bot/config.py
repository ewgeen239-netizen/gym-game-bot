"""Runtime configuration pulled from environment variables."""
from __future__ import annotations  # noqa: F404  (PEP 604 unions on 3.9 local)

import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ModuleNotFoundError:  # dotenv is optional; env vars still work without it
    pass


def _clean(value: str | None) -> str:
    return (value or "").strip()


# --- Telegram ---------------------------------------------------------------
BOT_TOKEN = _clean(os.getenv("BOT_TOKEN"))
BOT_USERNAME = _clean(os.getenv("BOT_USERNAME"))  # without @, used for referral links

# Public URL of the Mini App frontend (GitHub Pages), opened via the WebApp button.
WEBAPP_URL = _clean(os.getenv("WEBAPP_URL")) or "https://ewgeen239-netizen.github.io/gym-game-bot/"

# --- Web server -------------------------------------------------------------
PORT = int(os.getenv("PORT", "8080"))
HOST = _clean(os.getenv("HOST")) or "0.0.0.0"

# CORS: comma separated list of allowed origins for the Mini App frontend.
_default_origins = "https://ewgeen239-netizen.github.io"
ALLOWED_ORIGINS = [
    o.strip() for o in (_clean(os.getenv("ALLOWED_ORIGINS")) or _default_origins).split(",") if o.strip()
]

# --- Storage ----------------------------------------------------------------
# When GOOGLE_SHEETS_CREDS (raw JSON) and GOOGLE_SHEET_ID are set, the Google
# Sheets backend is used. Otherwise the app falls back to a local JSON file.
GOOGLE_SHEETS_CREDS = _clean(os.getenv("GOOGLE_SHEETS_CREDS"))
GOOGLE_SHEET_ID = _clean(os.getenv("GOOGLE_SHEET_ID"))
DATA_FILE = _clean(os.getenv("DATA_FILE")) or "./data/gym-game-bot.json"

USE_SHEETS = bool(GOOGLE_SHEETS_CREDS and GOOGLE_SHEET_ID)


def require_token() -> str:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not set. Add it to your environment (.env or Railway variables).")
    return BOT_TOKEN
