# Gym Game Bot

Telegram bot + Telegram Mini App for gym workouts that feels like a small RPG: exercises and working weights are the core, with XP, levels, daily quests, streaks, achievements, PR tracking, and a dark hero profile on top.

## Links

- Telegram bot: https://t.me/gymgamepanda_bot
- GitHub repo: https://github.com/ewgeen239-netizen/gym-game-bot
- BotFather: https://t.me/BotFather
- Railway dashboard: https://railway.com/dashboard

## Features

- Dark RPG-style Telegram Mini App.
- Bot button that opens the Mini App when `APP_URL` is configured.
- First-launch character choice:
  - Tema's RPG character;
  - classic gym athlete;
  - sportswoman athlete.
- Hero profile: class, evolution stage, power, rank, level, XP progress, streak.
- Fast workout flow: start workout, log exercise, weight, and reps.
- XP, levels, streaks, and personal records.
- Telegram sync by Telegram ID, so the same Telegram account keeps one hero profile.
- Bottom Mini App tabs: PR, achievements, leaderboard, and history.
- Leaderboard across all players stored in the same app database.
- Daily quests:
  - log 3 sets today;
  - finish a workout today.
- Achievements:
  - first set;
  - first workout;
  - 10 total sets;
  - 3-day streak;
  - first personal record.
- File storage by default, good enough for MVP and local testing.

## Local Setup

```bash
npm install
cp .env.example .env
```

Put your Telegram bot token into `.env`:

```text
BOT_TOKEN=your_token_here
APP_URL=https://your-railway-domain.up.railway.app
```

Run:

```bash
npm start
```

Local Mini App preview without launching the Telegram bot:

```bash
BOT_TOKEN=123456:test SKIP_BOT=1 PORT=3000 npm start
```

Open:

```text
http://localhost:3000/?devUser=715467947
```

## Railway Deploy

1. Create a Telegram bot through `@BotFather`.
2. Deploy from this GitHub repo: https://github.com/ewgeen239-netizen/gym-game-bot
3. Copy the generated Railway public domain.
4. Add `BOT_TOKEN` and `APP_URL` in Railway variables.
5. Optional but recommended: add a Railway Volume and set `DATA_FILE=/data/gym-game-bot.json`, so bot data survives redeploys.
6. Redeploy.
7. Open the bot and send `/start`: https://t.me/gymgamepanda_bot
8. Press `Open Mini App`, choose a character, and log the first set.

The bot sets its Telegram menu button automatically when `APP_URL` exists. `/start` is intentionally short; send `подробнее` or `/details` in the bot to get the full explanation.

Railway will run:

```bash
npm start
```

Required Railway variable:

```text
BOT_TOKEN=your_token_from_botfather
APP_URL=https://your-railway-domain.up.railway.app
```

Recommended Railway variable when a Volume is mounted at `/data`:

```text
DATA_FILE=/data/gym-game-bot.json
```

## Run Anywhere

Any server that supports Node.js 20+ can run this bot:

```bash
npm install
BOT_TOKEN=your_token APP_URL=https://your-domain.example npm start
```

Keep the token out of GitHub. Use environment variables on Railway, VPS, Render, Fly.io, or any other host.

## MVP Notes

This version uses long polling, so it is simple to deploy and does not require webhooks. The Mini App validates Telegram `initData` for API requests. For a bigger bot, the next step is PostgreSQL storage and admin screens.
