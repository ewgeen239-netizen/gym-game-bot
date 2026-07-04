"""aiohttp HTTP API consumed by the Telegram Mini App frontend."""
from __future__ import annotations

from aiohttp import web

from . import config, game, service
from .auth import AuthError, validate_init_data
from .storage import Storage


def _cors_headers(origin: str | None) -> dict:
    allow = origin if origin in config.ALLOWED_ORIGINS else (config.ALLOWED_ORIGINS[0] if config.ALLOWED_ORIGINS else "*")
    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
    }


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        return web.Response(status=204, headers=_cors_headers(request.headers.get("Origin")))
    try:
        resp = await handler(request)
    except web.HTTPException as exc:
        exc.headers.update(_cors_headers(request.headers.get("Origin")))
        raise
    resp.headers.update(_cors_headers(request.headers.get("Origin")))
    return resp


async def _auth(request: web.Request) -> tuple[dict, dict]:
    """Validate initData from the JSON body. Return (tg_auth, body)."""
    try:
        body = await request.json()
    except Exception:
        raise web.HTTPBadRequest(reason="invalid json")
    init_data = body.get("initData", "")
    # Dev escape hatch: if no BOT_TOKEN configured, trust a debug user (local only).
    if not config.BOT_TOKEN and body.get("debugUser"):
        return {"user": body["debugUser"], "start_param": body.get("start_param")}, body
    try:
        auth = validate_init_data(init_data, config.BOT_TOKEN)
    except AuthError as exc:
        raise web.HTTPUnauthorized(reason=str(exc))
    return auth, body


def routes(storage: Storage) -> web.RouteTableDef:
    r = web.RouteTableDef()

    @r.get("/")
    async def root(_):
        # The Mini App itself lives on GitHub Pages; this backend only serves the
        # JSON API. A friendly root avoids a bare 404 when the URL is opened.
        return web.json_response({
            "service": "GymGame Club API",
            "status": "ok",
            "storage": "sheets" if config.USE_SHEETS else "json",
            "frontend": config.WEBAPP_URL,
            "endpoints": ["/api/health", "/api/meta", "/api/profile", "/api/workout"],
        })

    @r.get("/api/health")
    async def health(_):
        return web.json_response({"ok": True, "storage": "sheets" if config.USE_SHEETS else "json"})

    @r.get("/api/meta")
    async def meta(_):
        return web.json_response({
            "exercises": game.EXERCISES,
            "tiers": game.TIERS,
            "achievements": game.ACHIEVEMENTS,
            "quests": game.DAILY_QUESTS,
        })

    @r.post("/api/profile")
    async def profile(request):
        auth, _ = await _auth(request)
        ref = auth.get("start_param") or ""
        user = service.get_or_create_user(storage, auth["user"], referrer_id=ref)
        storage.save_user(user)
        return web.json_response({
            "profile": service.serialize_profile(user),
            "meta": {"exercises": game.EXERCISES, "tiers": game.TIERS,
                     "achievements": game.ACHIEVEMENTS, "quests": game.DAILY_QUESTS},
        })

    @r.post("/api/workout")
    async def workout(request):
        auth, body = await _auth(request)
        user = service.get_or_create_user(storage, auth["user"])
        try:
            result = service.apply_workout(
                storage, user,
                body["exercise"], body.get("sets", 1),
                body.get("reps", 1), body.get("weight", 0),
            )
        except ValueError as exc:
            raise web.HTTPBadRequest(reason=str(exc))
        return web.json_response(result)

    @r.post("/api/history")
    async def history(request):
        auth, _ = await _auth(request)
        rows = storage.list_workouts(auth["user"]["id"], limit=60)
        return web.json_response({"workouts": list(reversed(rows))})

    @r.post("/api/leaderboard")
    async def lb(request):
        auth, body = await _auth(request)
        service.get_or_create_user(storage, auth["user"])
        metric = body.get("metric", "level")
        friends = body.get("friend_ids")
        board = service.leaderboard(storage, metric=metric, friend_ids=friends)
        return web.json_response({"leaderboard": board, "me": auth["user"]["id"]})

    @r.post("/api/compare")
    async def compare(request):
        auth, body = await _auth(request)
        me = service.get_or_create_user(storage, auth["user"])
        other = storage.get_user(body.get("other_id"))
        return web.json_response({
            "me": service.serialize_profile(me),
            "other": service.serialize_profile(other) if other else None,
        })

    # --- duels ---
    @r.post("/api/duel/create")
    async def duel_create(request):
        auth, body = await _auth(request)
        me = service.get_or_create_user(storage, auth["user"])
        duel = service.create_duel(storage, me["user_id"], body["opponent_id"])
        return web.json_response({"duel": duel})

    @r.post("/api/duel/accept")
    async def duel_accept(request):
        auth, body = await _auth(request)
        duel = service.accept_duel(storage, body["duel_id"], auth["user"]["id"])
        if not duel:
            raise web.HTTPNotFound(reason="duel not found")
        return web.json_response({"duel": duel})

    @r.post("/api/duels")
    async def duels(request):
        auth, _ = await _auth(request)
        me = service.get_or_create_user(storage, auth["user"])
        items = service.duels_for(storage, me["user_id"])
        # enrich with opponent names
        enriched = []
        for d in items:
            other_id = d["opponent_id"] if str(d["challenger_id"]) == str(me["user_id"]) else d["challenger_id"]
            other = storage.get_user(other_id)
            enriched.append({**d, "opponent_name": (other or {}).get("first_name", "Соперник")})
        return web.json_response({"duels": enriched, "week": game.current_week()})

    # --- clubs ---
    @r.post("/api/club/create")
    async def club_create(request):
        auth, body = await _auth(request)
        me = service.get_or_create_user(storage, auth["user"])
        try:
            club = service.create_club(storage, me, body.get("name", "Клуб"))
        except service.ClubLimitError as exc:
            return web.json_response({"error": str(exc)}, status=409)
        return web.json_response({"club": club})

    @r.post("/api/club/join")
    async def club_join(request):
        auth, body = await _auth(request)
        me = service.get_or_create_user(storage, auth["user"])
        club = service.join_club(storage, me, body["club_id"])
        if not club:
            raise web.HTTPNotFound(reason="club not found")
        return web.json_response({"club": club})

    @r.post("/api/clubs")
    async def clubs(request):
        await _auth(request)
        return web.json_response({"clubs": service.clubs_leaderboard(storage)})

    return r


def build_app(storage: Storage) -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.add_routes(routes(storage))
    return app
