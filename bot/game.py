"""Core RPG game logic: XP curve, levels, evolution tiers, stats, quests."""
from __future__ import annotations

import math
from datetime import date, datetime, timezone

# ---------------------------------------------------------------------------
# Exercise catalogue. Each exercise maps to a primary muscle-group stat:
#   strength  — presses / pulls (жимы / тяги)
#   endurance — cardio / high volume (кардио / объём)
#   agility   — functional movements (функционал)
# ---------------------------------------------------------------------------
EXERCISES = {
    "bench_press":  {"name": "Жим лёжа",        "stat": "strength",  "group": "chest",     "icon": "🏋️"},
    "deadlift":     {"name": "Становая тяга",   "stat": "strength",  "group": "back",      "icon": "🪝"},
    "squat":        {"name": "Приседания",      "stat": "strength",  "group": "legs",      "icon": "🦵"},
    "overhead":     {"name": "Жим стоя",        "stat": "strength",  "group": "shoulders", "icon": "🤸"},
    "row":          {"name": "Тяга в наклоне",  "stat": "strength",  "group": "back",      "icon": "🚣"},
    "curl":         {"name": "Подъём на бицепс","stat": "strength",  "group": "arms",      "icon": "💪"},
    "run":          {"name": "Бег",             "stat": "endurance", "group": "cardio",    "icon": "🏃"},
    "cycling":      {"name": "Велотренажёр",    "stat": "endurance", "group": "cardio",    "icon": "🚴"},
    "rowing_erg":   {"name": "Гребля",          "stat": "endurance", "group": "cardio",    "icon": "🛶"},
    "plank":        {"name": "Планка",          "stat": "endurance", "group": "core",      "icon": "🧘"},
    "burpee":       {"name": "Бёрпи",           "stat": "agility",   "group": "full",      "icon": "🤾"},
    "box_jump":     {"name": "Запрыгивания",    "stat": "agility",   "group": "legs",      "icon": "📦"},
    "kettlebell":   {"name": "Гиря (свинг)",    "stat": "agility",   "group": "full",      "icon": "🔔"},
    "jump_rope":    {"name": "Скакалка",        "stat": "agility",   "group": "cardio",    "icon": "🪢"},

    # --- Day A ---
    "leg_press":        {"name": "Жим ногами (платформа)",              "stat": "strength",  "group": "legs",  "icon": "🦿"},
    "lat_pulldown":     {"name": "Тяга верхнего блока широким хватом",   "stat": "strength",  "group": "back",  "icon": "🧲"},
    "bench_barbell":    {"name": "Жим штанги на горизонтальной скамье",  "stat": "strength",  "group": "chest", "icon": "🏋️"},
    "triceps_pushdown": {"name": "Разгибание на трицепс в блоке (прямой гриф)", "stat": "strength", "group": "arms", "icon": "🤙"},
    "db_curl":          {"name": "Подъём гантелей на бицепс",           "stat": "strength",  "group": "arms",  "icon": "💪"},

    # --- Day B ---
    "assisted_pullup":  {"name": "Подтягивания в гравитроне",           "stat": "strength",  "group": "back",  "icon": "🧗"},
    "smith_decline":    {"name": "Жим в Смите на наклонной вниз скамье", "stat": "strength", "group": "chest", "icon": "⛓️"},
    "leg_extension":    {"name": "Разгибание ног в тренажёре (квадрицепс)", "stat": "strength", "group": "legs", "icon": "🦵"},
    "barbell_curl":     {"name": "Подъём штанги на бицепс",             "stat": "strength",  "group": "arms",  "icon": "💪"},
    "ball_crunch":      {"name": "Скручивания на фитболе",              "stat": "endurance", "group": "core",  "icon": "🏐"},

    # --- Day C ---
    "seated_row":       {"name": "Тяга нижнего блока в тренажёре",      "stat": "strength",  "group": "back",  "icon": "🚣"},
    "incline_chest_machine": {"name": "Жим на верх груди в тренажёре",  "stat": "strength",  "group": "chest", "icon": "🛠️"},
    "rope_pushdown":    {"name": "Разгибание на трицепс с канатом",     "stat": "strength",  "group": "arms",  "icon": "🪢"},
    "leg_curl":         {"name": "Сгибание ног в тренажёре (бицепс бедра)", "stat": "strength", "group": "legs", "icon": "🦵"},
    "hyperextension":   {"name": "Гиперэкстензия",                      "stat": "endurance", "group": "core",  "icon": "🧎"},
}

STATS = ("strength", "endurance", "agility")

# ---------------------------------------------------------------------------
# Evolution tiers — the 3D model visibly grows with the player's level.
# ---------------------------------------------------------------------------
TIERS = [
    {"id": 0, "name": "Слизь",     "min_level": 0,  "muscle": 1.00, "color": "#8bf58b", "model": "slime"},
    {"id": 1, "name": "Новичок",   "min_level": 1,  "muscle": 1.00, "color": "#7dd3fc", "model": "human"},
    {"id": 2, "name": "Любитель",  "min_level": 5,  "muscle": 1.18, "color": "#38bdf8", "model": "human"},
    {"id": 3, "name": "Атлет",     "min_level": 10, "muscle": 1.40, "color": "#22d3ee", "model": "human"},
    {"id": 4, "name": "Про",       "min_level": 20, "muscle": 1.70, "color": "#c084fc", "model": "human"},
    {"id": 5, "name": "Элита",     "min_level": 35, "muscle": 2.05, "color": "#f472b6", "model": "human"},
    {"id": 6, "name": "Легенда",   "min_level": 50, "muscle": 2.40, "color": "#facc15", "model": "human"},
]

BASE_SET_XP = 12          # base XP per completed set
GYM_VISIT_XP = 40         # XP for showing up (first workout of the day)
STREAK_STEP_XP = 15       # extra XP per consecutive day, capped
STREAK_CAP = 7            # streak multiplier caps at 7 days


# --- Level / XP curve -------------------------------------------------------
# Players start at level 0 (a slime). Reaching level 1 (becoming human) takes a
# solid chunk of work — a few real workouts — then the curve keeps growing.
LEVEL1_XP = 250  # XP to evolve from slime (lvl 0) to human (lvl 1)


def xp_for_level(level: int) -> int:
    """Total XP needed to *reach* a given level (cumulative)."""
    if level <= 0:
        return 0
    return int(LEVEL1_XP + sum(round(95 * (n ** 1.42)) for n in range(1, level)))


def level_from_xp(total_xp: int) -> int:
    level = 0
    while xp_for_level(level + 1) <= total_xp:
        level += 1
    return level


def level_progress(total_xp: int) -> dict:
    """Return current level, xp into the level, and xp needed for the next."""
    level = level_from_xp(total_xp)
    floor = xp_for_level(level)
    ceil = xp_for_level(level + 1)
    return {
        "level": level,
        "xp_into_level": total_xp - floor,
        "xp_for_next": ceil - floor,
        "total_xp": total_xp,
    }


def tier_for_level(level: int) -> dict:
    current = TIERS[0]
    for t in TIERS:
        if level >= t["min_level"]:
            current = t
    return current


# --- XP calculation ---------------------------------------------------------
def set_xp(weight: float, reps: int, best_weight: float, best_reps: int) -> int:
    """XP for a single set: base + volume + progression bonus over personal best."""
    weight = max(0.0, float(weight or 0))
    reps = max(1, int(reps or 1))
    volume = weight * reps
    base = BASE_SET_XP + volume * 0.05
    # Progression bonus: beating your personal best on this exercise.
    prev_best = max(0.0, best_weight * max(1, best_reps))
    if volume > prev_best > 0:
        base += (volume - prev_best) * 0.08
    return max(BASE_SET_XP, round(base))


def streak_bonus_xp(streak_days: int) -> int:
    return min(streak_days, STREAK_CAP) * STREAK_STEP_XP


def compute_streak(last_workout_iso: str, today: date | None = None) -> tuple[bool, bool]:
    """Return (is_new_day, streak_continues) given the last workout date."""
    today = today or datetime.now(timezone.utc).date()
    if not last_workout_iso:
        return True, False
    try:
        last = datetime.fromisoformat(last_workout_iso).date()
    except ValueError:
        return True, False
    if last == today:
        return False, True  # already worked out today
    delta = (today - last).days
    return True, delta == 1  # continues only if yesterday


# --- Achievements -----------------------------------------------------------
ACHIEVEMENTS = [
    {"id": "first_set",   "name": "Первый подход",   "desc": "Заверши первый подход",         "icon": "🌱"},
    {"id": "level_5",     "name": "Любитель",        "desc": "Достигни 5 уровня",             "icon": "🥉"},
    {"id": "level_10",    "name": "Атлет",           "desc": "Достигни 10 уровня",            "icon": "🥈"},
    {"id": "level_25",    "name": "Профи",           "desc": "Достигни 25 уровня",            "icon": "🥇"},
    {"id": "streak_7",    "name": "Неделя огня",     "desc": "Стрик 7 дней подряд",           "icon": "🔥"},
    {"id": "strong_500",  "name": "Силач",           "desc": "500 очков Силы",                "icon": "💪"},
    {"id": "iron_1000",   "name": "Железный",        "desc": "Суммарно 1000 подходов",        "icon": "⚙️"},
    {"id": "duel_win",    "name": "Дуэлянт",         "desc": "Выиграй недельную дуэль",       "icon": "⚔️"},
]


def check_achievements(user: dict) -> list[str]:
    """Return achievement ids the user newly qualifies for (not yet unlocked)."""
    have = set(user.get("achievements", []))
    earned = []

    def add(aid: str, cond: bool):
        if cond and aid not in have:
            earned.append(aid)

    add("first_set", user.get("total_sets", 0) >= 1)
    add("level_5", user["level"] >= 5)
    add("level_10", user["level"] >= 10)
    add("level_25", user["level"] >= 25)
    add("streak_7", user.get("streak", 0) >= 7)
    add("strong_500", user.get("strength", 0) >= 500)
    add("iron_1000", user.get("total_sets", 0) >= 1000)
    add("duel_win", user.get("duels_won", 0) >= 1)
    return earned


# --- Daily quests -----------------------------------------------------------
DAILY_QUESTS = [
    {"id": "q_sets_5",   "name": "5 подходов",        "desc": "Выполни 5 подходов сегодня",       "target": 5,   "metric": "sets",     "reward_xp": 60},
    {"id": "q_strength", "name": "Силовая",           "desc": "Сделай силовое упражнение",        "target": 1,   "metric": "strength", "reward_xp": 40},
    {"id": "q_cardio",   "name": "Кардио-заряд",      "desc": "Сделай кардио упражнение",         "target": 1,   "metric": "endurance","reward_xp": 40},
    {"id": "q_volume",   "name": "Объём 2000",        "desc": "Набери 2000 кг суммарного объёма", "target": 2000,"metric": "volume",   "reward_xp": 80},
]


def today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def current_week() -> str:
    """ISO year-week string, e.g. 2026-W27, used for weekly duels."""
    now = datetime.now(timezone.utc)
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"
