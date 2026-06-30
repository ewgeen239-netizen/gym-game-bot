# Gym Game Bot

Telegram bot for gym workouts that feels like a small game: exercises and working weights are the core, with XP, levels, daily quests, streaks, achievements, and PR tracking on top.

## Features

- Dark game-style text UX for Telegram.
- Fast workout flow: start workout, log exercise, weight, and reps.
- XP, levels, streaks, and personal records.
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

```bash
BOT_TOKEN=your_token_here
```

Run:

```bash
npm start
```

## Railway Deploy

1. Create a Telegram bot through `@BotFather`.
2. Add `BOT_TOKEN` in Railway variables.
3. Optional but recommended: add a Railway Volume and set `DATA_FILE=/data/gym-game-bot.json`, so bot data survives redeploys.
4. Deploy from this GitHub repo.

Railway will run:

```bash
npm start
```

## MVP Notes

This version uses long polling, so it is simple to deploy and does not require webhooks. For a bigger bot, the next step is PostgreSQL storage and admin screens.
