import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATA_FILE = process.env.DATA_FILE || './data/gym-game-bot.json';
const LEVEL_STEP = 200;

if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN. Add it to .env or Railway variables.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const sessions = new Map();

const defaultData = {
  users: {}
};

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return structuredClone(defaultData);
  }
}

async function saveData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

let db = await loadData();

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function userId(ctx) {
  return String(ctx.from.id);
}

function getUser(ctx) {
  const id = userId(ctx);
  if (!db.users[id]) {
    db.users[id] = {
      telegramId: id,
      name: ctx.from.first_name || ctx.from.username || 'Athlete',
      xp: 0,
      level: 1,
      streak: 0,
      lastWorkoutDate: null,
      totalSets: 0,
      totalWorkouts: 0,
      prs: {},
      achievements: [],
      workouts: [],
      daily: {}
    };
  }
  return db.users[id];
}

function levelFromXp(xp) {
  return Math.floor(xp / LEVEL_STEP) + 1;
}

function addXp(user, amount) {
  const before = user.level;
  user.xp += amount;
  user.level = levelFromXp(user.xp);
  return user.level > before;
}

function grantAchievement(user, key) {
  if (user.achievements.includes(key)) return false;
  user.achievements.push(key);
  return true;
}

function achievementTitle(key) {
  return {
    first_set: 'Первый подход',
    first_workout: 'Первая тренировка',
    ten_sets: '10 подходов',
    three_day_streak: 'Серия 3 дня',
    pr_hunter: 'Охотник за PR'
  }[key] || key;
}

function getDaily(user) {
  const day = todayKey();
  if (!user.daily[day]) {
    user.daily[day] = {
      sets: 0,
      workoutFinished: false,
      claimed: []
    };
  }
  return user.daily[day];
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Начать тренировку', 'start_workout')],
    [Markup.button.callback('Записать подход', 'log_set')],
    [
      Markup.button.callback('Профиль', 'profile'),
      Markup.button.callback('Квесты', 'quests')
    ],
    [
      Markup.button.callback('Ачивки', 'achievements'),
      Markup.button.callback('Завершить', 'finish_workout')
    ]
  ]);
}

function profileText(user) {
  const xpInLevel = user.xp % LEVEL_STEP;
  return [
    `Темный режим: ON`,
    ``,
    `Игрок: ${user.name}`,
    `Уровень: ${user.level}`,
    `XP: ${user.xp} (${xpInLevel}/${LEVEL_STEP} до следующего уровня)`,
    `Стрик: ${user.streak} дн.`,
    `Тренировок: ${user.totalWorkouts}`,
    `Подходов: ${user.totalSets}`,
    ``,
    `Лучшие веса:`,
    formatPrs(user)
  ].join('\n');
}

function formatPrs(user) {
  const entries = Object.entries(user.prs);
  if (!entries.length) return 'Пока пусто. Запиши первый подход.';
  return entries
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 8)
    .map(([exercise, pr]) => `- ${exercise}: ${pr.weight} кг x ${pr.reps}`)
    .join('\n');
}

function questsText(user) {
  const daily = getDaily(user);
  return [
    `Ежедневные квесты`,
    ``,
    `${daily.sets >= 3 ? 'DONE' : 'TODO'} Записать 3 подхода: ${daily.sets}/3`,
    `${daily.workoutFinished ? 'DONE' : 'TODO'} Завершить тренировку: ${daily.workoutFinished ? '1/1' : '0/1'}`,
    ``,
    `Награды начисляются сразу: подходы дают XP, завершение тренировки дает большой бонус.`
  ].join('\n');
}

function achievementsText(user) {
  if (!user.achievements.length) return 'Ачивок пока нет. Первый подход откроет первую.';
  return user.achievements.map((key) => `- ${achievementTitle(key)}`).join('\n');
}

async function replyMenu(ctx, text) {
  await ctx.reply(text, mainMenu());
}

bot.start(async (ctx) => {
  const user = getUser(ctx);
  await saveData(db);
  await replyMenu(
    ctx,
    [
      `Добро пожаловать в Gym Game Bot.`,
      ``,
      `Здесь тренировка работает как игра: записываешь упражнения и веса, получаешь XP, уровни, ачивки, стрики и ежедневные квесты.`,
      ``,
      profileText(user)
    ].join('\n')
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    [
      `Команды:`,
      `/start - открыть меню`,
      `/profile - профиль`,
      `/quests - ежедневные квесты`,
      `/achievements - ачивки`,
      ``,
      `Самый быстрый путь: Начать тренировку -> Записать подход -> Завершить.`
    ].join('\n')
  );
});

bot.command('profile', async (ctx) => replyMenu(ctx, profileText(getUser(ctx))));
bot.command('quests', async (ctx) => replyMenu(ctx, questsText(getUser(ctx))));
bot.command('achievements', async (ctx) => replyMenu(ctx, achievementsText(getUser(ctx))));

bot.action('profile', async (ctx) => {
  await ctx.answerCbQuery();
  await replyMenu(ctx, profileText(getUser(ctx)));
});

bot.action('quests', async (ctx) => {
  await ctx.answerCbQuery();
  await replyMenu(ctx, questsText(getUser(ctx)));
});

bot.action('achievements', async (ctx) => {
  await ctx.answerCbQuery();
  await replyMenu(ctx, achievementsText(getUser(ctx)));
});

bot.action('start_workout', async (ctx) => {
  const user = getUser(ctx);
  const day = todayKey();
  let workout = user.workouts.find((item) => item.date === day && !item.finishedAt);
  if (!workout) {
    workout = {
      date: day,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      sets: []
    };
    user.workouts.push(workout);
  }
  await saveData(db);
  await ctx.answerCbQuery('Тренировка начата');
  await replyMenu(ctx, 'Тренировка активна. Жми "Записать подход", чтобы добавить упражнение, вес и повторы.');
});

bot.action('log_set', async (ctx) => {
  sessions.set(userId(ctx), { step: 'exercise' });
  await ctx.answerCbQuery();
  await ctx.reply('Введи упражнение. Например: Жим лежа');
});

bot.action('finish_workout', async (ctx) => {
  const user = getUser(ctx);
  const day = todayKey();
  const workout = user.workouts.find((item) => item.date === day && !item.finishedAt);
  if (!workout) {
    await ctx.answerCbQuery();
    await replyMenu(ctx, 'Нет активной тренировки. Сначала нажми "Начать тренировку".');
    return;
  }

  workout.finishedAt = new Date().toISOString();
  user.totalWorkouts += 1;
  getDaily(user).workoutFinished = true;

  updateStreak(user, day);
  const levelUp = addXp(user, 50);
  const grants = [];
  if (grantAchievement(user, 'first_workout')) grants.push('Первая тренировка');
  if (user.streak >= 3 && grantAchievement(user, 'three_day_streak')) grants.push('Серия 3 дня');

  await saveData(db);
  await ctx.answerCbQuery('Тренировка завершена');
  await replyMenu(
    ctx,
    [
      `Тренировка завершена.`,
      `Подходов сегодня: ${workout.sets.length}`,
      `+50 XP`,
      levelUp ? `Новый уровень: ${user.level}` : null,
      grants.length ? `Новые ачивки: ${grants.join(', ')}` : null
    ].filter(Boolean).join('\n')
  );
});

bot.on('text', async (ctx) => {
  const id = userId(ctx);
  const session = sessions.get(id);
  if (!session) return;

  const text = ctx.message.text.trim();
  if (session.step === 'exercise') {
    session.exercise = normalizeExercise(text);
    session.step = 'weight';
    await ctx.reply('Введи вес в кг. Например: 80');
    return;
  }

  if (session.step === 'weight') {
    const weight = parseNumber(text);
    if (!weight) {
      await ctx.reply('Нужно число. Например: 80 или 80.5');
      return;
    }
    session.weight = weight;
    session.step = 'reps';
    await ctx.reply('Введи повторы. Например: 8');
    return;
  }

  if (session.step === 'reps') {
    const reps = parseInt(text, 10);
    if (!Number.isInteger(reps) || reps <= 0) {
      await ctx.reply('Нужно целое число повторов. Например: 8');
      return;
    }

    const user = getUser(ctx);
    const result = addSet(user, {
      exercise: session.exercise,
      weight: session.weight,
      reps
    });
    sessions.delete(id);
    await saveData(db);

    await replyMenu(
      ctx,
      [
        `Подход записан: ${session.exercise} - ${session.weight} кг x ${reps}`,
        `+${result.xp} XP`,
        result.isPr ? `Новый PR по упражнению.` : null,
        result.levelUp ? `Новый уровень: ${user.level}` : null,
        result.achievements.length ? `Ачивки: ${result.achievements.join(', ')}` : null
      ].filter(Boolean).join('\n')
    );
  }
});

function normalizeExercise(value) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function parseNumber(value) {
  const normalized = value.replace(',', '.');
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 10) / 10;
}

function addSet(user, set) {
  const day = todayKey();
  let workout = user.workouts.find((item) => item.date === day && !item.finishedAt);
  if (!workout) {
    workout = {
      date: day,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      sets: []
    };
    user.workouts.push(workout);
  }

  const entry = {
    ...set,
    at: new Date().toISOString()
  };
  workout.sets.push(entry);
  user.totalSets += 1;
  getDaily(user).sets += 1;

  let xp = 10;
  const achievements = [];
  const previous = user.prs[set.exercise];
  const isPr = !previous || set.weight > previous.weight || (set.weight === previous.weight && set.reps > previous.reps);
  if (isPr) {
    user.prs[set.exercise] = { weight: set.weight, reps: set.reps, at: entry.at };
    xp += 25;
    if (grantAchievement(user, 'pr_hunter')) achievements.push('Охотник за PR');
  }

  if (grantAchievement(user, 'first_set')) achievements.push('Первый подход');
  if (user.totalSets >= 10 && grantAchievement(user, 'ten_sets')) achievements.push('10 подходов');
  const levelUp = addXp(user, xp);

  return {
    xp,
    isPr,
    levelUp,
    achievements
  };
}

function updateStreak(user, day) {
  if (!user.lastWorkoutDate) {
    user.streak = 1;
    user.lastWorkoutDate = day;
    return;
  }

  if (user.lastWorkoutDate === day) return;

  const yesterday = new Date(`${day}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  user.streak = user.lastWorkoutDate === todayKey(yesterday) ? user.streak + 1 : 1;
  user.lastWorkoutDate = day;
}

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update?.update_id}:`, error);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

await bot.launch();
console.log('Gym Game Bot is running.');
