"""High-level game operations built on top of Storage + pure game logic."""
from __future__ import annotations

from datetime import datetime, timezone

from . import game
from .storage import Storage, new_id


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Users ------------------------------------------------------------------
def _blank_quests() -> dict:
    return {"date": game.today_iso(), "sets": 0, "strength": 0,
            "endurance": 0, "agility": 0, "volume": 0, "claimed": []}


def default_user(tg_user: dict, referrer_id: str = "") -> dict:
    return {
        "user_id": tg_user["id"],
        "username": tg_user.get("username", ""),
        "first_name": tg_user.get("first_name", "Игрок"),
        "created_at": now_iso(),
        "level": 1, "xp": 0, "total_xp": 0,
        "strength": 0, "endurance": 0, "agility": 0,
        "streak": 0, "last_workout": "", "total_sets": 0,
        "tier": 0, "skin": "default", "equipment": [], "achievements": [],
        "quests": _blank_quests(), "club_id": "",
        "referrer_id": referrer_id, "duels_won": 0,
    }


def get_or_create_user(storage: Storage, tg_user: dict, referrer_id: str = "") -> dict:
    user = storage.get_user(tg_user["id"])
    if user:
        # keep display fields fresh
        user["username"] = tg_user.get("username", user.get("username", ""))
        user["first_name"] = tg_user.get("first_name", user.get("first_name", "Игрок"))
        _roll_quests(user)
        return user
    user = default_user(tg_user, referrer_id)
    storage.save_user(user)
    # reward the referrer once
    if referrer_id and str(referrer_id) != str(tg_user["id"]):
        ref = storage.get_user(referrer_id)
        if ref:
            _grant_xp(ref, 150)
            storage.save_user(ref)
    return user


def _roll_quests(user: dict) -> None:
    q = user.get("quests") or {}
    if q.get("date") != game.today_iso():
        user["quests"] = _blank_quests()


def _grant_xp(user: dict, amount: int) -> bool:
    """Add XP, recompute level/tier. Return True if the player levelled up."""
    before = user["level"]
    user["total_xp"] = int(user.get("total_xp", 0)) + int(amount)
    prog = game.level_progress(user["total_xp"])
    user["level"] = prog["level"]
    user["xp"] = prog["xp_into_level"]
    user["tier"] = game.tier_for_level(user["level"])["id"]
    return user["level"] > before


# --- Serialisation for the frontend ----------------------------------------
def serialize_profile(user: dict) -> dict:
    prog = game.level_progress(int(user.get("total_xp", 0)))
    tier = game.tier_for_level(prog["level"])
    return {
        "user_id": user["user_id"],
        "username": user.get("username", ""),
        "first_name": user.get("first_name", "Игрок"),
        "level": prog["level"],
        "xp_into_level": prog["xp_into_level"],
        "xp_for_next": prog["xp_for_next"],
        "total_xp": prog["total_xp"],
        "strength": user.get("strength", 0),
        "endurance": user.get("endurance", 0),
        "agility": user.get("agility", 0),
        "streak": user.get("streak", 0),
        "total_sets": user.get("total_sets", 0),
        "tier": tier,
        "skin": user.get("skin", "default"),
        "equipment": user.get("equipment", []),
        "achievements": user.get("achievements", []),
        "quests": _quest_view(user),
        "club_id": user.get("club_id", ""),
        "duels_won": user.get("duels_won", 0),
    }


def _quest_view(user: dict) -> list[dict]:
    q = user.get("quests") or _blank_quests()
    out = []
    for spec in game.DAILY_QUESTS:
        progress = q.get(spec["metric"], 0)
        out.append({
            **spec,
            "progress": min(progress, spec["target"]),
            "completed": spec["id"] in q.get("claimed", []),
        })
    return out


# --- Workout ----------------------------------------------------------------
STAT_GAIN = {
    "strength": lambda sets, reps, weight: round(4 + weight * reps * 0.02),
    "endurance": lambda sets, reps, weight: round(5 + reps * 0.4 + sets * 2),
    "agility": lambda sets, reps, weight: round(6 + sets * 3 + reps * 0.2),
}


def apply_workout(storage: Storage, user: dict, exercise_id: str,
                  sets: int, reps: int, weight: float) -> dict:
    ex = game.EXERCISES.get(exercise_id)
    if not ex:
        raise ValueError("unknown exercise")

    sets = max(1, int(sets))
    reps = max(1, int(reps))
    weight = max(0.0, float(weight or 0))
    stat = ex["stat"]

    _roll_quests(user)

    # personal best on this exercise (for progression bonus)
    prev = storage.list_workouts(user["user_id"], limit=200)
    best_vol = 0.0
    for w in prev:
        if w.get("exercise") == exercise_id:
            best_vol = max(best_vol, float(w.get("weight", 0)) * int(w.get("reps", 1)))
    best_weight = weight if weight else 1
    best_reps = int(best_vol / best_weight) if best_weight else 0

    # XP: per set + gym-visit + streak bonus (visit/streak only once per day)
    per_set = game.set_xp(weight, reps, weight if best_vol else 0, best_reps)
    xp = per_set * sets

    is_new_day, continues = game.compute_streak(user.get("last_workout", ""))
    streak_xp = 0
    visit_xp = 0
    if is_new_day:
        user["streak"] = user.get("streak", 0) + 1 if continues else 1
        visit_xp = game.GYM_VISIT_XP
        streak_xp = game.streak_bonus_xp(user["streak"])
        user["last_workout"] = game.today_iso()

    total_xp_gain = xp + visit_xp + streak_xp

    # stats
    gain = STAT_GAIN[stat](sets, reps, weight) * sets
    user[stat] = user.get(stat, 0) + gain
    user["total_sets"] = user.get("total_sets", 0) + sets

    # quests progress
    q = user["quests"]
    q["sets"] += sets
    q[stat] += 1
    q["volume"] += int(weight * reps * sets)
    quest_reward = _settle_quests(user)

    leveled = _grant_xp(user, total_xp_gain + quest_reward)

    # achievements
    new_ach = game.check_achievements(user)
    if new_ach:
        user["achievements"] = list(user.get("achievements", [])) + new_ach

    storage.save_user(user)
    storage.add_workout({
        "id": new_id(), "user_id": user["user_id"], "ts": now_iso(),
        "exercise": exercise_id, "name": ex["name"], "muscle_group": ex["group"],
        "stat": stat, "sets": sets, "reps": reps, "weight": weight,
        "xp_gained": total_xp_gain + quest_reward,
    })

    # tally any active duels
    _add_duel_xp(storage, user["user_id"], total_xp_gain + quest_reward)

    return {
        "xp_gained": total_xp_gain + quest_reward,
        "set_xp": per_set, "visit_xp": visit_xp, "streak_xp": streak_xp,
        "quest_xp": quest_reward, "stat_gained": {stat: gain},
        "leveled_up": leveled, "new_achievements": new_ach,
        "profile": serialize_profile(user),
    }


def _settle_quests(user: dict) -> int:
    """Auto-claim finished daily quests; return total reward XP."""
    q = user["quests"]
    reward = 0
    for spec in game.DAILY_QUESTS:
        if spec["id"] in q["claimed"]:
            continue
        if q.get(spec["metric"], 0) >= spec["target"]:
            q["claimed"].append(spec["id"])
            reward += spec["reward_xp"]
    return reward


# --- Leaderboard ------------------------------------------------------------
_METRIC_KEY = {
    "level": lambda u: (u.get("total_xp", 0)),
    "xp": lambda u: u.get("total_xp", 0),
    "strength": lambda u: u.get("strength", 0),
    "endurance": lambda u: u.get("endurance", 0),
    "agility": lambda u: u.get("agility", 0),
}


def leaderboard(storage: Storage, metric: str = "level", limit: int = 50,
                friend_ids: list[int] | None = None) -> list[dict]:
    key = _METRIC_KEY.get(metric, _METRIC_KEY["level"])
    users = storage.list_users()
    if friend_ids is not None:
        allow = {str(i) for i in friend_ids}
        users = [u for u in users if str(u["user_id"]) in allow]
    users.sort(key=key, reverse=True)
    out = []
    for rank, u in enumerate(users[:limit], start=1):
        prog = game.level_progress(int(u.get("total_xp", 0)))
        out.append({
            "rank": rank, "user_id": u["user_id"],
            "name": u.get("first_name") or u.get("username") or "Игрок",
            "level": prog["level"], "total_xp": prog["total_xp"],
            "strength": u.get("strength", 0), "endurance": u.get("endurance", 0),
            "agility": u.get("agility", 0), "tier": game.tier_for_level(prog["level"])["id"],
        })
    return out


# --- Duels ------------------------------------------------------------------
def create_duel(storage: Storage, challenger_id: int, opponent_id: int) -> dict:
    duel = {
        "duel_id": new_id(), "challenger_id": challenger_id,
        "opponent_id": opponent_id, "week": game.current_week(),
        "challenger_xp": 0, "opponent_xp": 0, "status": "pending",
        "created_at": now_iso(),
    }
    storage.save_duel(duel)
    return duel


def accept_duel(storage: Storage, duel_id: str, user_id: int) -> dict | None:
    duel = storage.get_duel(duel_id)
    if not duel or str(duel["opponent_id"]) != str(user_id):
        return None
    duel["status"] = "active"
    storage.save_duel(duel)
    return duel


def _add_duel_xp(storage: Storage, user_id: int, xp: int) -> None:
    week = game.current_week()
    for duel in storage.list_duels():
        if duel.get("status") != "active" or duel.get("week") != week:
            continue
        changed = False
        if str(duel["challenger_id"]) == str(user_id):
            duel["challenger_xp"] = int(duel.get("challenger_xp", 0)) + xp
            changed = True
        elif str(duel["opponent_id"]) == str(user_id):
            duel["opponent_xp"] = int(duel.get("opponent_xp", 0)) + xp
            changed = True
        if changed:
            storage.save_duel(duel)


def duels_for(storage: Storage, user_id: int) -> list[dict]:
    out = []
    for d in storage.list_duels():
        if str(user_id) in (str(d["challenger_id"]), str(d["opponent_id"])):
            out.append(d)
    return out


# --- Clubs ------------------------------------------------------------------
def create_club(storage: Storage, owner: dict, name: str) -> dict:
    club = {
        "club_id": new_id(), "name": name[:40] or "Клуб",
        "owner_id": owner["user_id"], "created_at": now_iso(),
        "members": [owner["user_id"]], "total_xp": int(owner.get("total_xp", 0)),
    }
    storage.save_club(club)
    owner["club_id"] = club["club_id"]
    storage.save_user(owner)
    return club


def join_club(storage: Storage, user: dict, club_id: str) -> dict | None:
    club = storage.get_club(club_id)
    if not club:
        return None
    if user["user_id"] not in club["members"]:
        club["members"].append(user["user_id"])
    user["club_id"] = club_id
    _recompute_club_xp(storage, club)
    storage.save_user(user)
    return club


def _recompute_club_xp(storage: Storage, club: dict) -> None:
    total = 0
    for mid in club["members"]:
        m = storage.get_user(mid)
        if m:
            total += int(m.get("total_xp", 0))
    club["total_xp"] = total
    storage.save_club(club)


def clubs_leaderboard(storage: Storage, limit: int = 50) -> list[dict]:
    clubs = storage.list_clubs()
    clubs.sort(key=lambda c: c.get("total_xp", 0), reverse=True)
    out = []
    for rank, c in enumerate(clubs[:limit], start=1):
        out.append({
            "rank": rank, "club_id": c["club_id"], "name": c["name"],
            "members": len(c.get("members", [])), "total_xp": c.get("total_xp", 0),
        })
    return out
