"""Validate Telegram Mini App ``initData`` (HMAC signature check).

See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


class AuthError(Exception):
    pass


def validate_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> dict:
    """Return the parsed & verified user dict, or raise AuthError."""
    if not init_data:
        raise AuthError("empty initData")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise AuthError("missing hash")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise AuthError("bad signature")

    auth_date = int(pairs.get("auth_date", "0"))
    if max_age and auth_date and (time.time() - auth_date) > max_age:
        raise AuthError("initData expired")

    user_raw = pairs.get("user")
    if not user_raw:
        raise AuthError("no user in initData")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise AuthError("bad user json") from exc

    return {
        "user": user,
        "start_param": pairs.get("start_param"),
        "auth_date": auth_date,
    }
