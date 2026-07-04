# 💪 GymGame Club

Telegram **Mini App RPG** for the gym. Level up a **3D character** by doing real
workouts: every set and every gym visit gives XP; the character grows in levels,
evolves visually (Новичок → Легенда), gains stats, gear, achievements — plus a
full multiplayer layer (global leaderboards, weekly duels, clubs, PvP compare).

- **Frontend:** Telegram Mini App + [Three.js](https://threejs.org) 3D character, hosted on **GitHub Pages** (`docs/`)
- **Backend:** Python + [aiogram 3](https://aiogram.dev) + aiohttp API, hosted on **Railway**
- **Storage:** Google Sheets (with automatic local‑JSON fallback for dev)

Live frontend: `https://ewgeen239-netizen.github.io/gym-game-bot/`

---

## Project structure

```
gym-game-bot/
├── bot/                     # Python backend (aiogram bot + aiohttp API)
│   ├── main.py              # entry point: runs the bot AND the API together
│   ├── config.py            # env-var configuration
│   ├── auth.py              # Telegram WebApp initData signature validation
│   ├── game.py              # pure RPG logic: XP curve, tiers, stats, quests
│   ├── service.py           # domain ops: workouts, leaderboard, duels, clubs
│   ├── storage.py           # Storage interface + local-JSON backend
│   ├── sheets.py            # Google Sheets backend (same interface)
│   └── api.py               # HTTP endpoints consumed by the Mini App
├── docs/                    # Frontend (served by GitHub Pages)
│   ├── index.html
│   ├── css/style.css        # cyberpunk / neon theme
│   └── js/
│       ├── config.js        # ← EDIT: Railway API URL + bot username
│       ├── api.js           # API client (sends Telegram initData)
│       ├── character3d.js   # Three.js procedural humanoid + animations
│       └── app.js           # screens, state, interactions
├── requirements.txt
├── Procfile / railway.json  # Railway start config
├── runtime.txt              # Python version pin
└── .env.example
```

## Screens

1. **Дом** — 3D character, XP bar, level, stats, streak
2. **Зал** — pick exercise, enter sets/reps/weight, earn XP (character animates)
3. **Прогресс** — stat‑growth chart + workout history
4. **Лут** — equipment/skins unlocked by level
5. **Квесты** — daily quests + achievements
6. **Онлайн** — leaderboard, duels, clubs, PvP compare (two 3D models side by side)

---

## Game mechanics

- **XP per set** = base + volume bonus + progression bonus (beating your PR).
- **Gym‑visit XP** + **streak bonus** on the first workout of each day (streak caps at 7).
- **Stats** are tied to muscle groups:
  - **Сила** — presses/pulls (bench, deadlift, squat, rows…)
  - **Выносливость** — cardio/volume (run, cycling, plank…)
  - **Ловкость** — functional (burpees, box jumps, kettlebell…)
- **Levels** use a curve (`xp_for_level`), and the 3D model **evolves at tiers**
  (levels 1/5/10/20/35/50) — muscle scale and neon colour change per tier.
- **Daily quests** auto‑reward XP; **achievements** unlock on milestones.
- **Multiplayer:** global + per‑metric leaderboards, weekly **duels** (most XP in
  the ISO week wins), **clubs** (shared XP total), **PvP** side‑by‑side compare,
  **referrals** (both players get bonus XP via `?startapp=<id>` deep links).

---

## Google Sheets schema

Create one spreadsheet; the backend creates these tabs automatically on first
run (you only need to share the sheet with the service account). Columns:

**Users**
```
user_id | username | first_name | created_at | level | xp | total_xp |
strength | endurance | agility | streak | last_workout | total_sets |
tier | skin | equipment(JSON) | achievements(JSON) | quests(JSON) |
club_id | referrer_id | duels_won
```

**Workouts** (append‑only training log)
```
id | user_id | ts | exercise | name | muscle_group | stat | sets | reps | weight | xp_gained
```

**Clubs**
```
club_id | name | owner_id | created_at | members(JSON) | total_xp
```

**Duels**
```
duel_id | challenger_id | opponent_id | week | challenger_xp | opponent_xp | status | created_at
```

> Ratings/leaderboards are derived from **Users** at query time (no separate tab).
> Daily quests & achievements are stored as JSON columns on **Users**.

---

## Deploy — step by step

### 0. Frontend (GitHub Pages) — already set up
This repo is public and Pages serves the `docs/` folder on `main`. Your Mini App
URL is:
```
https://ewgeen239-netizen.github.io/gym-game-bot/
```

### 1. Create the bot in BotFather
1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → get the **BOT_TOKEN**.
2. `/setmenubutton` (optional) → paste the Pages URL above as the Web App URL.
   > The backend also sets this menu button automatically on start.
3. Note your bot's **@username**.

### 2. Google Sheets (recommended storage)
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. Enable **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
4. Open the service account → **Keys → Add key → JSON** → download it.
5. Create a Google Sheet, copy its **ID** from the URL
   (`https://docs.google.com/spreadsheets/d/`**`<THIS_PART>`**`/edit`).
6. **Share** the sheet with the service account's `client_email` (Editor).

### 3. Backend on Railway
1. [railway.app](https://railway.com/dashboard) → **New Project → Deploy from GitHub repo** → pick `gym-game-bot`.
2. Railway auto‑detects Python (Nixpacks) and runs `python -m bot.main`.
3. Add **Variables** (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `BOT_TOKEN` | token from BotFather |
   | `BOT_USERNAME` | your bot @username (no `@`) |
   | `WEBAPP_URL` | `https://ewgeen239-netizen.github.io/gym-game-bot/` |
   | `ALLOWED_ORIGINS` | `https://ewgeen239-netizen.github.io` |
   | `GOOGLE_SHEET_ID` | the sheet ID from step 2 |
   | `GOOGLE_SHEETS_CREDS` | the **entire** service‑account JSON, pasted as one value |

   > Leave `GOOGLE_SHEETS_CREDS` / `GOOGLE_SHEET_ID` empty to use the local‑JSON
   > fallback (data won't survive redeploys without a volume).
4. Under **Settings → Networking → Generate Domain** to get your public URL, e.g.
   `https://gym-game-bot-production.up.railway.app`.

### 4. Wire the frontend to the backend
Edit **`docs/js/config.js`**:
```js
export const API_BASE = 'https://gym-game-bot-production.up.railway.app'; // your Railway URL
export const BOT_USERNAME = 'your_bot_username';                          // no @
```
Commit & push — GitHub Pages redeploys automatically.

### 5. Test
Open your bot → `/start` → **🎮 Открыть GymGame** → log a set → watch the 3D
character animate and XP roll in.

---

## Local development

No Telegram or Google account needed — the app falls back to local JSON and a
debug user:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # leave BOT_TOKEN empty to run API-only
python -m bot.main              # API on http://localhost:8080
```

Serve the frontend and open it in a browser (it auto‑detects localhost → same‑
origin API + dev user):

```bash
python -m http.server 5500 --directory docs
# open http://localhost:5500/
```

## Security notes

- The bot token and Google creds live **only** in Railway variables — never in the repo.
- The API validates Telegram `initData` HMAC on every request; the debug user is
  accepted **only** when no `BOT_TOKEN` is configured (i.e. local dev).
- CORS is restricted to `ALLOWED_ORIGINS`.
