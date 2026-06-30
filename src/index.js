import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { Telegraf, Markup } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL = process.env.APP_URL || '';
const DATA_FILE = process.env.DATA_FILE || './data/gym-game-bot.json';
const PORT = Number(process.env.PORT || 3000);
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

const HERO_TYPES = {
  tema: {
    name: 'Персонаж Темы',
    className: 'Iron Panda',
    avatar: 'T',
    copy: 'Авторский герой Темы: темный профиль, рабочие веса и спокойная охота за прогрессом.'
  },
  athlete: {
    name: 'Спортсмен из зала',
    className: 'Gym Athlete',
    avatar: 'A',
    copy: 'Классический путь: от новичка к заметно более сильному и собранному атлету.'
  },
  sportswoman: {
    name: 'Спортсменка',
    className: 'Power Athlete',
    avatar: 'S',
    copy: 'Женский персонаж: с каждым уровнем больше силы, формы и уверенности в тренировках.'
  }
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

function getTelegramUserFromCtx(ctx) {
  return {
    id: String(ctx.from.id),
    name: ctx.from.first_name || ctx.from.username || 'Athlete',
    username: ctx.from.username || '',
    photoUrl: ''
  };
}

function getUserByTelegram(telegramUser) {
  const id = String(telegramUser.id);
  if (!db.users[id]) {
    db.users[id] = {
      telegramId: id,
      name: telegramUser.name || 'Athlete',
      username: telegramUser.username || '',
      photoUrl: telegramUser.photoUrl || '',
      heroType: '',
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
  } else {
    db.users[id].name = telegramUser.name || db.users[id].name;
    db.users[id].username = telegramUser.username || db.users[id].username || '';
    db.users[id].photoUrl = telegramUser.photoUrl || db.users[id].photoUrl || '';
    db.users[id].heroType = db.users[id].heroType || '';
  }
  return db.users[id];
}

function getUser(ctx) {
  return getUserByTelegram(getTelegramUserFromCtx(ctx));
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

function getActiveWorkout(user) {
  const day = todayKey();
  return user.workouts.find((item) => item.date === day && !item.finishedAt) || null;
}

function startWorkout(user) {
  let workout = getActiveWorkout(user);
  if (!workout) {
    workout = {
      date: todayKey(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      sets: []
    };
    user.workouts.push(workout);
  }
  return workout;
}

function finishWorkout(user) {
  const workout = getActiveWorkout(user);
  if (!workout) return null;

  workout.finishedAt = new Date().toISOString();
  user.totalWorkouts += 1;
  getDaily(user).workoutFinished = true;

  updateStreak(user, todayKey());
  const levelUp = addXp(user, 50);
  const achievements = [];
  if (grantAchievement(user, 'first_workout')) achievements.push('Первая тренировка');
  if (user.streak >= 3 && grantAchievement(user, 'three_day_streak')) achievements.push('Серия 3 дня');

  return {
    workout,
    xp: 50,
    levelUp,
    achievements
  };
}

function addSet(user, set) {
  const workout = startWorkout(user);
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
    achievements,
    set: entry,
    workout
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

function normalizeExercise(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function parseWeight(value) {
  const number = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 10) / 10;
}

function parseReps(value) {
  const reps = Number.parseInt(value, 10);
  if (!Number.isInteger(reps) || reps <= 0) return null;
  return reps;
}

function getHeroDefinition(user) {
  return HERO_TYPES[user.heroType] || HERO_TYPES.tema;
}

function getHeroClass(user) {
  const hero = getHeroDefinition(user);
  const stage = getEvolutionStage(user);
  if (user.heroType === 'athlete') {
    return ['Gym Rookie', 'Steady Lifter', 'Iron Athlete', 'Peak Performer'][stage];
  }
  if (user.heroType === 'sportswoman') {
    return ['Fit Starter', 'Strong Athlete', 'Power Athlete', 'Elite Form'][stage];
  }
  return ['Iron Panda Rookie', 'Quest Panda', 'Iron Panda', 'Panda Vanguard'][stage] || hero.className;
}

function getEvolutionStage(user) {
  if (user.level >= 10) return 3;
  if (user.level >= 6) return 2;
  if (user.level >= 3) return 1;
  return 0;
}

function getEvolutionText(user) {
  const stage = getEvolutionStage(user);
  if (user.heroType === 'athlete') {
    return [
      'Новичок в зале: техника, база, первые рабочие веса.',
      'Тело собранее, тренировки стабильнее, веса растут.',
      'Атлет уже заметно прокачан: больше силы и контроля.',
      'Финальная форма MVP: уверенный спортсмен с режимом.'
    ][stage];
  }
  if (user.heroType === 'sportswoman') {
    return [
      'Стартовая форма: легкий вход, первые привычки и контроль.',
      'Больше тонуса и силы, тренировки становятся системой.',
      'Прокачанная спортсменка: уверенная техника и мощный темп.',
      'Элитная форма: сильная, атлетичная, собранная.'
    ][stage];
  }
  return [
    'Персонаж Темы просыпается: первый квест - зайти в зал.',
    'Темный герой набирает форму: веса становятся добычей.',
    'Iron Panda уже в игре: PR и стрики двигают ранг.',
    'Vanguard режим: герой держит серию и давит прогресс.'
  ][stage];
}

function serializeUser(user) {
  const daily = getDaily(user);
  const activeWorkout = getActiveWorkout(user);
  const xpInLevel = user.xp % LEVEL_STEP;
  const nextLevelXp = LEVEL_STEP;
  const prCount = Object.keys(user.prs).length;
  const recentSets = user.workouts
    .flatMap((workout) => workout.sets.map((set) => ({ ...set, date: workout.date })))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);

  return {
    profile: {
      telegramId: user.telegramId,
      name: user.name,
      username: user.username,
      photoUrl: user.photoUrl || '',
      heroType: user.heroType || '',
      xp: user.xp,
      level: user.level,
      xpInLevel,
      nextLevelXp,
      streak: user.streak,
      totalSets: user.totalSets,
      totalWorkouts: user.totalWorkouts
    },
    hero: {
      choiceRequired: !user.heroType,
      choices: Object.entries(HERO_TYPES).map(([key, value]) => ({ key, ...value })),
      archetype: getHeroDefinition(user).name,
      avatar: getHeroDefinition(user).avatar,
      description: getHeroDefinition(user).copy,
      evolutionStage: getEvolutionStage(user),
      evolutionText: getEvolutionText(user),
      className: getHeroClass(user),
      title: getHeroTitle(user),
      power: Math.round(user.totalSets * 1.8 + user.totalWorkouts * 12 + user.level * 25),
      rank: user.level >= 10 ? 'S' : user.level >= 6 ? 'A' : user.level >= 3 ? 'B' : 'C',
      attributes: {
        strength: Math.min(99, 10 + prCount * 8 + Math.floor(user.totalSets / 3)),
        discipline: Math.min(99, 8 + user.streak * 10 + user.totalWorkouts * 2),
        endurance: Math.min(99, 10 + user.totalWorkouts * 6 + Math.floor(user.totalSets / 5))
      },
      loadout: getHeroLoadout(user),
      nextMilestone: getNextMilestone(user)
    },
    daily,
    activeWorkout,
    prs: Object.entries(user.prs)
      .map(([exercise, pr]) => ({ exercise, ...pr }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10),
    achievements: user.achievements.map((key) => ({ key, title: achievementTitle(key) })),
    recentSets
  };
}

function getHeroTitle(user) {
  if (user.streak >= 14) return 'Легенда режима';
  if (user.totalWorkouts >= 20) return 'Хранитель зала';
  if (Object.keys(user.prs).length >= 5) return 'Охотник за весами';
  if (user.totalSets >= 30) return 'Железный ученик';
  if (user.totalWorkouts >= 3) return 'Стабильный новичок';
  return 'Новобранец';
}

function getHeroLoadout(user) {
  const prCount = Object.keys(user.prs).length;
  return [
    {
      slot: 'Амулет',
      name: user.totalSets >= 1 ? 'Первый подход' : 'Пустой слот',
      unlocked: user.totalSets >= 1
    },
    {
      slot: 'Пояс',
      name: user.totalWorkouts >= 3 ? 'Пояс стабильности' : 'Откроется за 3 тренировки',
      unlocked: user.totalWorkouts >= 3
    },
    {
      slot: 'Перчатки',
      name: prCount >= 3 ? 'Перчатки PR' : 'Откроется за 3 PR',
      unlocked: prCount >= 3
    },
    {
      slot: 'Аура',
      name: user.streak >= 7 ? 'Семидневный огонь' : 'Откроется за 7 дней стрика',
      unlocked: user.streak >= 7
    }
  ];
}

function getNextMilestone(user) {
  const prCount = Object.keys(user.prs).length;
  if (user.totalSets < 1) return 'Запиши первый подход и открой первый слот героя.';
  if (user.totalWorkouts < 3) return `До Пояса стабильности: ${3 - user.totalWorkouts} трен.`;
  if (prCount < 3) return `До Перчаток PR: ${3 - prCount} PR.`;
  if (user.streak < 7) return `До Семидневного огня: ${7 - user.streak} дн.`;
  if (user.level < 6) return `До ранга A: ${6 - user.level} уров.`;
  return 'Следующая цель: держать серию и растить рабочие веса.';
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

function profileText(user) {
  const state = serializeUser(user);
  return [
    `Темный RPG режим: ON`,
    ``,
    `Герой: ${state.profile.name}`,
    `Класс: ${state.hero.className}`,
    `Уровень: ${state.profile.level}`,
    `XP: ${state.profile.xp} (${state.profile.xpInLevel}/${LEVEL_STEP})`,
    `Стрик: ${state.profile.streak} дн.`,
    `Тренировок: ${state.profile.totalWorkouts}`,
    `Подходов: ${state.profile.totalSets}`,
    ``,
    `Лучшие веса:`,
    formatPrs(user)
  ].join('\n');
}

function introText() {
  return [
    `Gym Game Bot - это Mini App для зала, где тренировки идут как RPG.`,
    ``,
    `Что делать: открыть Mini App, выбрать персонажа, начать тренировку и записывать упражнения, веса и повторы.`,
    ``,
    `Если хочешь объяснение по всем функциям - напиши: подробнее`
  ].join('\n');
}

function detailsText() {
  return [
    `Подробнее:`,
    ``,
    `1. Открываешь Mini App и выбираешь персонажа.`,
    `2. Нажимаешь "Начать тренировку".`,
    `3. Записываешь упражнение, вес и повторы.`,
    `4. Получаешь XP, уровни, PR, ачивки и закрываешь квесты дня.`,
    `5. Во вкладке "Рейтинг" сравниваешь прогресс с другими игроками.`,
    ``,
    `Синхронизация идет по Telegram ID: один человек = один герой и один прогресс.`
  ].join('\n');
}

function questsText(user) {
  const daily = getDaily(user);
  return [
    `Ежедневные квесты`,
    ``,
    `${daily.sets >= 3 ? 'DONE' : 'TODO'} Записать 3 подхода: ${daily.sets}/3`,
    `${daily.workoutFinished ? 'DONE' : 'TODO'} Завершить тренировку: ${daily.workoutFinished ? '1/1' : '0/1'}`,
    ``,
    `Mini App покажет это как RPG-профиль героя.`
  ].join('\n');
}

function achievementsText(user) {
  if (!user.achievements.length) return 'Ачивок пока нет. Первый подход откроет первую.';
  return user.achievements.map((key) => `- ${achievementTitle(key)}`).join('\n');
}

function mainMenu() {
  const rows = [];
  if (APP_URL) {
    rows.push([Markup.button.webApp('Открыть Mini App', APP_URL)]);
  }
  rows.push([Markup.button.callback('Начать тренировку', 'start_workout')]);
  rows.push([Markup.button.callback('Записать подход', 'log_set')]);
  rows.push([
    Markup.button.callback('Профиль', 'profile'),
    Markup.button.callback('Квесты', 'quests')
  ]);
  rows.push([
    Markup.button.callback('Ачивки', 'achievements'),
    Markup.button.callback('Завершить', 'finish_workout')
  ]);
  rows.push([Markup.button.callback('Подробнее', 'details')]);
  return Markup.inlineKeyboard(rows);
}

async function replyMenu(ctx, text) {
  await ctx.reply(text, mainMenu());
}

bot.start(async (ctx) => {
  getUser(ctx);
  await saveData(db);
  await replyMenu(ctx, introText());
});

bot.help(async (ctx) => {
  await ctx.reply(
    [
      `Команды:`,
      `/start - открыть меню`,
      `/profile - профиль`,
      `/quests - ежедневные квесты`,
      `/achievements - ачивки`,
      `/details - подробнее`,
      ``,
      APP_URL ? `Mini App: ${APP_URL}` : `Mini App включится после настройки APP_URL.`
    ].join('\n'),
    mainMenu()
  );
});

bot.command('details', async (ctx) => replyMenu(ctx, detailsText()));
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

bot.action('details', async (ctx) => {
  await ctx.answerCbQuery();
  await replyMenu(ctx, detailsText());
});

bot.action('start_workout', async (ctx) => {
  const user = getUser(ctx);
  startWorkout(user);
  await saveData(db);
  await ctx.answerCbQuery('Тренировка начата');
  await replyMenu(ctx, APP_URL ? 'Тренировка активна. Удобнее продолжить в Mini App.' : 'Тренировка активна. Жми "Записать подход".');
});

bot.action('log_set', async (ctx) => {
  sessions.set(String(ctx.from.id), { step: 'exercise' });
  await ctx.answerCbQuery();
  await ctx.reply('Введи упражнение. Например: Жим лежа');
});

bot.action('finish_workout', async (ctx) => {
  const user = getUser(ctx);
  const result = finishWorkout(user);
  if (!result) {
    await ctx.answerCbQuery();
    await replyMenu(ctx, 'Нет активной тренировки. Сначала нажми "Начать тренировку".');
    return;
  }

  await saveData(db);
  await ctx.answerCbQuery('Тренировка завершена');
  await replyMenu(
    ctx,
    [
      `Тренировка завершена.`,
      `Подходов сегодня: ${result.workout.sets.length}`,
      `+${result.xp} XP`,
      result.levelUp ? `Новый уровень: ${user.level}` : null,
      result.achievements.length ? `Новые ачивки: ${result.achievements.join(', ')}` : null
    ].filter(Boolean).join('\n')
  );
});

bot.on('text', async (ctx) => {
  const id = String(ctx.from.id);
  const rawText = ctx.message.text.trim();
  if (/^подробнее$/i.test(rawText)) {
    await replyMenu(ctx, detailsText());
    return;
  }

  const session = sessions.get(id);
  if (!session) return;

  const text = rawText;
  if (session.step === 'exercise') {
    session.exercise = normalizeExercise(text);
    session.step = 'weight';
    await ctx.reply('Введи вес в кг. Например: 80');
    return;
  }

  if (session.step === 'weight') {
    const weight = parseWeight(text);
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
    const reps = parseReps(text);
    if (!reps) {
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

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (calculated !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  const user = JSON.parse(userRaw);
  return {
    id: String(user.id),
    name: user.first_name || user.username || 'Athlete',
    username: user.username || '',
    photoUrl: user.photo_url || ''
  };
}

function authMiniApp(req, res, next) {
  const initData = req.header('x-telegram-init-data') || '';
  const devUser = process.env.NODE_ENV !== 'production' && req.query.devUser;
  const telegramUser = initData ? parseInitData(initData) : null;

  if (!telegramUser && !devUser) {
    res.status(401).json({ error: 'Telegram Mini App auth required.' });
    return;
  }

  req.telegramUser = telegramUser || {
    id: String(devUser),
    name: 'Dev Hero',
    username: 'dev'
  };
  req.user = getUserByTelegram(req.telegramUser);
  next();
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => {
  res.json({ ok: true, appUrlConfigured: Boolean(APP_URL) });
});

app.get('/api/state', authMiniApp, async (req, res) => {
  await saveData(db);
  res.json(serializeUser(req.user));
});

app.post('/api/hero/choose', authMiniApp, async (req, res) => {
  const heroType = String(req.body.heroType || '');
  if (!HERO_TYPES[heroType]) {
    res.status(400).json({ error: 'Unknown hero type.' });
    return;
  }

  req.user.heroType = heroType;
  await saveData(db);
  res.json(serializeUser(req.user));
});

app.get('/api/leaderboard', authMiniApp, (req, res) => {
  const players = Object.values(db.users)
    .map((user) => ({
      telegramId: user.telegramId,
      name: user.name,
      username: user.username,
      heroType: user.heroType || '',
      level: user.level,
      xp: user.xp,
      power: Math.round(user.totalSets * 1.8 + user.totalWorkouts * 12 + user.level * 25),
      totalSets: user.totalSets,
      totalWorkouts: user.totalWorkouts,
      streak: user.streak
    }))
    .sort((a, b) => b.xp - a.xp || b.power - a.power || b.totalWorkouts - a.totalWorkouts);

  const currentRank = players.findIndex((player) => player.telegramId === req.user.telegramId) + 1;
  res.json({
    currentRank: currentRank || null,
    players: players.slice(0, 20)
  });
});

app.post('/api/workout/start', authMiniApp, async (req, res) => {
  startWorkout(req.user);
  await saveData(db);
  res.json(serializeUser(req.user));
});

app.post('/api/workout/set', authMiniApp, async (req, res) => {
  const exercise = normalizeExercise(req.body.exercise);
  const weight = parseWeight(req.body.weight);
  const reps = parseReps(req.body.reps);

  if (!exercise || !weight || !reps) {
    res.status(400).json({ error: 'exercise, weight and reps are required.' });
    return;
  }

  const result = addSet(req.user, { exercise, weight, reps });
  await saveData(db);
  res.json({ result, state: serializeUser(req.user) });
});

app.post('/api/workout/finish', authMiniApp, async (req, res) => {
  const result = finishWorkout(req.user);
  if (!result) {
    res.status(400).json({ error: 'No active workout.' });
    return;
  }
  await saveData(db);
  res.json({ result, state: serializeUser(req.user) });
});

bot.catch((error, ctx) => {
  console.error(`Bot error for update ${ctx.update?.update_id}:`, error);
});

if (process.env.SKIP_BOT !== '1') {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Открыть меню' },
    { command: 'details', description: 'Как работает Gym RPG' },
    { command: 'profile', description: 'Профиль героя' },
    { command: 'quests', description: 'Квесты дня' },
    { command: 'achievements', description: 'Ачивки' }
  ]);
}

if (APP_URL && process.env.SKIP_BOT !== '1') {
  await bot.telegram.setChatMenuButton({
    menuButton: {
      type: 'web_app',
      text: 'Gym RPG',
      web_app: { url: APP_URL }
    }
  });
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
  console.log(`Mini App server is running on ${PORT}.`);
});

if (process.env.SKIP_BOT === '1') {
  console.log('Telegram bot launch skipped.');
} else {
  await bot.launch();
  console.log('Gym Game Bot is running.');
}
