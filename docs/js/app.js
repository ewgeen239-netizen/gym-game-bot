// GymGame Club — Mini App controller: state, screens, and interactions.
import { GymCharacter } from './character3d.js';
import { api, tg } from './api.js';
import { BOT_USERNAME } from './config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  profile: null,
  meta: null,
  activeView: 'home',
  selected: null,
  metric: 'level',
  pvpOther: null,
  char: null,
  pvpChars: {},
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#060912'); } catch (_) {}

  try {
    const { profile, meta } = await api.profile();
    state.profile = profile;
    state.meta = meta;
  } catch (err) {
    $('#loaderMsg').textContent = 'Ошибка связи с сервером. Проверь API_BASE в config.js';
    $('#loaderMsg').style.color = '#f472b6';
    console.error(err);
    return;
  }

  state.char = new GymCharacter($('#char3d'));
  applyCharacter();
  buildExercises();
  renderAll();
  bindNav();
  bindTrain();
  bindMulti();

  $('#loader').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

function applyCharacter() {
  const p = state.profile;
  state.char.setStats({ strength: p.strength, endurance: p.endurance, agility: p.agility, tier: p.tier, level: p.level });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll() {
  renderHUD();
  renderHome();
  renderProgress();
  renderInventory();
  renderQuests();
  updateLocks();
}

// At level 0 (slime) only home + training are available; everything else
// unlocks once you evolve into a human at level 1.
const LOCKED_AT_L0 = ['progress', 'inventory', 'quests', 'multi'];

function isLocked(view) {
  return (state.profile?.level ?? 0) < 1 && LOCKED_AT_L0.includes(view);
}

function updateLocks() {
  const locked = (state.profile?.level ?? 0) < 1;
  $$('.nav-btn').forEach((b) => {
    b.classList.toggle('locked', locked && LOCKED_AT_L0.includes(b.dataset.goto));
  });
}

function renderHUD() {
  const p = state.profile;
  $('#playerName').textContent = p.first_name;
  $('#tierName').textContent = p.tier.name;
  $('#tierBadge').textContent = p.tier.id;
  $('#tierBadge').style.background = `linear-gradient(135deg, ${p.tier.color}, #f472b6)`;
  $('#levelNum').textContent = p.level;
  const pct = p.xp_for_next ? Math.min(100, (p.xp_into_level / p.xp_for_next) * 100) : 100;
  $('#xpFill').style.width = pct + '%';
  $('#xpText').textContent = `${p.xp_into_level} / ${p.xp_for_next} XP`;
}

function renderHome() {
  const p = state.profile;
  $('#statStr').textContent = p.strength;
  $('#statEnd').textContent = p.endurance;
  $('#statAgi').textContent = p.agility;
  $('#streakNum').textContent = p.streak;
  $('#setsNum').textContent = p.total_sets;
}

function buildExercises() {
  const grid = $('#exGrid');
  grid.innerHTML = '';
  Object.entries(state.meta.exercises).forEach(([id, ex]) => {
    const el = document.createElement('div');
    el.className = 'ex-card';
    el.dataset.ex = id;
    el.innerHTML = `<div class="ico">${ex.icon}</div><div class="nm">${ex.name}</div><div class="tag ${ex.stat}">${statLabel(ex.stat)}</div>`;
    el.addEventListener('click', () => selectExercise(id, el));
    grid.appendChild(el);
  });
}

function statLabel(s) { return { strength: 'Сила', endurance: 'Выносл.', agility: 'Ловкость' }[s] || s; }

function selectExercise(id, el) {
  state.selected = id;
  $$('.ex-card').forEach((c) => c.classList.toggle('sel', c === el));
  const ex = state.meta.exercises[id];
  $('#tfHead').textContent = `${ex.icon} ${ex.name}`;
  $('#logBtn').disabled = false;
  state.char.play(animFor(id));
}

function animFor(id) {
  const ex = state.meta.exercises[id];
  if (!ex) return 'idle';
  if (id === 'curl' || id === 'row') return 'curl';
  if (ex.group === 'legs' || id === 'squat' || id === 'box_jump') return 'squat';
  if (id === 'bench_press' || id === 'overhead' || ex.stat === 'strength') return 'press';
  return 'curl';
}

async function renderProgress() {
  try {
    const { workouts } = await api.history();
    drawChart(workouts);
    const list = $('#historyList');
    list.innerHTML = '';
    if (!workouts.length) { list.innerHTML = '<div class="empty">Пока нет тренировок</div>'; return; }
    workouts.slice(0, 40).forEach((w) => {
      const ex = state.meta.exercises[w.exercise] || { icon: '🏋️', name: w.name };
      const el = document.createElement('div');
      el.className = 'hist-item';
      el.innerHTML = `<div class="h-ico">${ex.icon}</div>
        <div class="h-main"><div class="h-name">${ex.name}</div>
        <div class="h-meta">${w.sets}×${w.reps} · ${w.weight}кг · ${fmtDate(w.ts)}</div></div>
        <div class="h-xp">+${w.xp_gained}</div>`;
      list.appendChild(el);
    });
  } catch (e) { console.error(e); }
}

function drawChart(workouts) {
  const cv = $('#statChart');
  const ctx = cv.getContext('2d');
  const W = cv.width = cv.clientWidth * 2;
  const H = cv.height = 300;
  ctx.clearRect(0, 0, W, H);
  const colors = { strength: '#f472b6', endurance: '#22d3ee', agility: '#facc15' };
  // cumulative stat-ish curves from workout stat tags (count-weighted)
  const series = { strength: [], endurance: [], agility: [] };
  const cum = { strength: 0, endurance: 0, agility: 0 };
  const ordered = [...workouts].reverse();
  ordered.forEach((w) => {
    if (cum[w.stat] !== undefined) cum[w.stat] += w.xp_gained;
    Object.keys(series).forEach((k) => series[k].push(cum[k]));
  });
  const max = Math.max(1, ...Object.values(cum));
  const n = ordered.length || 1;
  Object.entries(series).forEach(([k, pts]) => {
    ctx.beginPath();
    ctx.lineWidth = 4; ctx.strokeStyle = colors[k];
    ctx.shadowColor = colors[k]; ctx.shadowBlur = 12;
    pts.forEach((v, i) => {
      const x = (i / Math.max(1, n - 1)) * (W - 20) + 10;
      const y = H - 20 - (v / max) * (H - 40);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  ctx.shadowBlur = 0;
  if (!workouts.length) {
    ctx.fillStyle = '#7c8db5'; ctx.font = '24px Rajdhani'; ctx.textAlign = 'center';
    ctx.fillText('Данных пока нет', W / 2, H / 2);
  }
}

const EQUIPMENT = [
  { id: 'gloves', ico: '🧤', name: 'Перчатки', req: 2 },
  { id: 'belt', ico: '🎽', name: 'Пояс силача', req: 4 },
  { id: 'shoes', ico: '👟', name: 'Кроссы Speed', req: 6 },
  { id: 'wrist', ico: '⌚', name: 'Фитнес-трекер', req: 8 },
  { id: 'hood', ico: '🥷', name: 'Кибер-худи', req: 12 },
  { id: 'aura_c', ico: '🔵', name: 'Аура Циан', req: 10 },
  { id: 'aura_m', ico: '🟣', name: 'Аура Маджента', req: 20 },
  { id: 'crown', ico: '👑', name: 'Корона Элиты', req: 35 },
  { id: 'wings', ico: '🪽', name: 'Экзо-крылья', req: 50 },
];

function renderInventory() {
  const grid = $('#invGrid');
  const lvl = state.profile.level;
  grid.innerHTML = '';
  EQUIPMENT.forEach((it) => {
    const owned = lvl >= it.req;
    const el = document.createElement('div');
    el.className = 'inv-item ' + (owned ? 'owned' : 'locked');
    el.innerHTML = `<div class="i-lock">${owned ? '✔️' : '🔒'}</div>
      <div class="i-ico">${it.ico}</div><div class="i-name">${it.name}</div>
      <div class="i-req">${owned ? 'Открыто' : 'LVL ' + it.req}</div>`;
    grid.appendChild(el);
  });
}

function renderQuests() {
  const p = state.profile;
  const ql = $('#questList');
  ql.innerHTML = '';
  p.quests.forEach((q) => {
    const pct = Math.min(100, (q.progress / q.target) * 100);
    const el = document.createElement('div');
    el.className = 'quest ' + (q.completed ? 'done' : '');
    el.innerHTML = `<div class="q-top"><span class="q-name">${q.completed ? '✅ ' : ''}${q.name}</span>
      <span class="q-reward">+${q.reward_xp} XP</span></div>
      <div class="q-bar"><div class="q-fill" style="width:${pct}%"></div></div>
      <div class="q-desc">${q.desc} · ${q.progress}/${q.target}</div>`;
    ql.appendChild(el);
  });

  const ag = $('#achGrid');
  ag.innerHTML = '';
  const have = new Set(p.achievements);
  state.meta.achievements.forEach((a) => {
    const el = document.createElement('div');
    el.className = 'ach ' + (have.has(a.id) ? 'on' : '');
    el.innerHTML = `<div class="a-ico">${a.icon}</div><div class="a-nm">${a.name}</div>`;
    el.title = a.desc;
    ag.appendChild(el);
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const NAV_VIEWS = ['home', 'train', 'progress', 'inventory', 'quests', 'multi'];

function updateNavGlider(index = NAV_VIEWS.indexOf(state.activeView || 'home')) {
  const safe = Math.max(0, Math.min(NAV_VIEWS.length - 1, index));
  document.documentElement.style.setProperty('--nav-index', safe);
}

function goto(name) {
  if (isLocked(name)) {
    toast('🔒 Разблокируется на 1 уровне — стань человеком!');
    updateNavGlider(); // snap glider back to the current view
    return;
  }
  state.activeView = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.goto === name));
  updateNavGlider();
  if (name === 'progress') renderProgress();
  if (name === 'multi') renderRank();
  tg?.HapticFeedback?.selectionChanged?.();
}

function bindNav() {
  // buttons outside the nav (e.g. "Тренироваться") still work as plain links
  $$('[data-goto]').forEach((b) => {
    if (!b.closest('#bottomNav')) b.addEventListener('click', () => goto(b.dataset.goto));
  });

  // draggable bottom nav: glide finger across to switch tabs (ported)
  const nav = $('#bottomNav');
  if (!nav) return;
  let dragging = false;

  const pick = (clientX, commit = false) => {
    const rect = nav.getBoundingClientRect();
    const progress = Math.max(0, Math.min(0.999, (clientX - rect.left) / Math.max(1, rect.width)));
    const index = Math.floor(progress * NAV_VIEWS.length);
    updateNavGlider(index);
    if (commit) goto(NAV_VIEWS[index]);
  };

  nav.addEventListener('pointerdown', (e) => {
    dragging = true;
    nav.classList.add('is-dragging');
    nav.setPointerCapture?.(e.pointerId);
    pick(e.clientX);
  });
  nav.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    pick(e.clientX);
  });
  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    nav.classList.remove('is-dragging');
    nav.releasePointerCapture?.(e.pointerId);
    pick(e.clientX, true);
  };
  nav.addEventListener('pointerup', finish);
  nav.addEventListener('pointercancel', finish);
  updateNavGlider(0);
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------
function bindTrain() {
  $('#logBtn').addEventListener('click', logWorkout);
}

async function logWorkout() {
  if (!state.selected) return;
  const btn = $('#logBtn');
  btn.disabled = true;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sets = clamp(+$('#inSets').value || 1, 1, 25);
  const reps = clamp(+$('#inReps').value || 1, 1, 30);
  const weight = clamp(+$('#inWeight').value || 0, 0, 500);
  $('#inSets').value = sets; $('#inReps').value = reps; $('#inWeight').value = weight;
  try {
    const res = await api.workout(state.selected, sets, reps, weight);
    state.profile = res.profile;
    applyCharacter();
    renderAll();
    tg?.HapticFeedback?.impactOccurred?.('medium');
    toast(`+${res.xp_gained} XP  (сет ${res.set_xp}${res.streak_xp ? ` · стрик +${res.streak_xp}` : ''}${res.quest_xp ? ` · квест +${res.quest_xp}` : ''})`);
    if (res.new_achievements?.length) {
      const a = state.meta.achievements.find((x) => x.id === res.new_achievements[0]);
      setTimeout(() => toast(`🏆 Достижение: ${a ? a.name : ''}`), 1400);
    }
    if (res.evolved) transform();          // slime -> human
    else if (res.leveled_up) levelUp();
  } catch (e) {
    toast('Ошибка: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function levelUp() {
  const p = state.profile;
  $('#luNum').textContent = p.level;
  $('#luSub').textContent = p.tier.name.toUpperCase();
  const overlay = $('#levelup');
  overlay.classList.remove('hidden');
  state.char.play('press');
  state.char.celebrate();
  tg?.HapticFeedback?.notificationOccurred?.('success');
  setTimeout(() => { overlay.classList.add('hidden'); state.char.play('idle'); }, 2200);
}

// Fullscreen slime -> human transformation, over all screens.
function transform() {
  const overlay = $('#transform');
  overlay.classList.remove('hidden');
  state.char.celebrate();
  tg?.HapticFeedback?.notificationOccurred?.('success');
  // swap emoji mid-animation for a "reveal" beat
  setTimeout(() => { $('#tfEmoji').textContent = '🧍'; }, 1500);
  setTimeout(() => {
    overlay.classList.add('hidden');
    $('#tfEmoji').textContent = '🫧';
    updateLocks();          // everything unlocks now that you're human
    if (state.activeView !== 'home') goto('home');
  }, 3200);
}

// ---------------------------------------------------------------------------
// Multiplayer
// ---------------------------------------------------------------------------
function bindMulti() {
  $$('#multiTabs .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  $$('#metricSwitch .ms').forEach((m) => m.addEventListener('click', () => {
    state.metric = m.dataset.metric;
    $$('#metricSwitch .ms').forEach((x) => x.classList.toggle('active', x === m));
    renderRank();
  }));
  $('#inviteBtn').addEventListener('click', shareInvite);
  $('#inviteBtn2').addEventListener('click', shareInvite);
  $('#createClubBtn').addEventListener('click', createClub);
}

function switchTab(tab) {
  $$('#multiTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.tab !== tab));
  if (tab === 'rank') renderRank();
  if (tab === 'friends') renderFriends();
  if (tab === 'duels') renderDuels();
  if (tab === 'clubs') renderClubs();
  if (tab === 'pvp') renderPvP();
}

async function renderFriends() {
  const board = $('#friendsBoard');
  board.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const { friends } = await api.friends();
    board.innerHTML = '';
    if (!friends.length) {
      board.innerHTML = '<div class="empty">Пока нет друзей.<br>Нажми «Добавить друга» — отправь ссылку. Когда друг зайдёт, он появится тут, а тебе придёт сообщение в боте.</div>';
      return;
    }
    friends.forEach((f) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `<div class="r-name">${f.name}<div class="r-sub">LVL ${f.level} · 💪${f.strength} 🫁${f.endurance} ⚡${f.agility}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'btn primary'; btn.textContent = '⚔️';
      btn.title = 'Вызвать на дуэль';
      btn.addEventListener('click', async () => {
        await api.createDuel(f.user_id);
        toast('Дуэль отправлена ' + f.name + '!');
        switchTab('duels');
      });
      el.appendChild(btn);
      board.appendChild(el);
    });
  } catch (e) { board.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>'; }
}

async function renderRank() {
  const board = $('#rankBoard');
  board.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const { leaderboard, me } = await api.leaderboard(state.metric);
    board.innerHTML = '';
    if (!leaderboard.length) { board.innerHTML = '<div class="empty">Рейтинг пуст</div>'; return; }
    leaderboard.forEach((r) => {
      const val = state.metric === 'level' ? `LVL ${r.level}` : r[state.metric];
      const el = document.createElement('div');
      el.className = 'row ' + (String(r.user_id) === String(me) ? 'me' : '');
      el.innerHTML = `<div class="rank ${r.rank <= 3 ? 'top' : ''}">${medal(r.rank)}</div>
        <div class="r-name">${r.name}<div class="r-sub">LVL ${r.level} · 💪${r.strength} 🫁${r.endurance} ⚡${r.agility}</div></div>
        <div class="r-val">${val}</div>`;
      el.addEventListener('click', () => pickOpponent(r));
      board.appendChild(el);
    });
  } catch (e) { board.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>'; }
}

function medal(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank; }

function pickOpponent(r) {
  if (String(r.user_id) === String(state.profile.user_id)) return;
  state.pvpOther = r.user_id;
  switchTab('pvp');
  $$('#multiTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'pvp'));
}

async function renderDuels() {
  const board = $('#duelBoard');
  board.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const { duels, week } = await api.duels();
    board.innerHTML = '';
    if (!duels.length) { board.innerHTML = '<div class="empty">Нет дуэлей. Пригласи друга ⬆️</div>'; return; }
    const myId = String(state.profile.user_id);
    duels.forEach((d) => {
      const iAmCh = String(d.challenger_id) === myId;
      const my = iAmCh ? d.challenger_xp : d.opponent_xp;
      const their = iAmCh ? d.opponent_xp : d.challenger_xp;
      const leading = my >= their;
      const el = document.createElement('div');
      el.className = 'duel';
      el.innerHTML = `<div><div class="d-status" style="color:${leading ? '#22d3ee' : '#f472b6'}">${d.status} · ${d.week === week ? 'эта неделя' : d.week}</div>
          <b>${d.opponent_name}</b></div>
        <div class="d-score">${my} <span class="d-vs">vs</span> ${their}</div>`;
      if (d.status === 'pending' && !iAmCh) {
        const acc = document.createElement('button');
        acc.className = 'btn primary'; acc.textContent = 'Принять';
        acc.style.marginLeft = '8px';
        acc.addEventListener('click', async (e) => { e.stopPropagation(); await api.acceptDuel(d.duel_id); renderDuels(); });
        el.appendChild(acc);
      }
      board.appendChild(el);
    });
  } catch (e) { board.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>'; }
}

async function renderClubs() {
  const board = $('#clubBoard');
  board.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const { clubs } = await api.clubs();
    board.innerHTML = '';
    if (!clubs.length) { board.innerHTML = '<div class="empty">Клубов пока нет. Создай первый!</div>'; return; }
    clubs.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'row ' + (c.club_id === state.profile.club_id ? 'me' : '');
      el.innerHTML = `<div class="rank ${c.rank <= 3 ? 'top' : ''}">${medal(c.rank)}</div>
        <div class="r-name">${c.name}<div class="r-sub">👥 ${c.members} участников</div></div>
        <div class="r-val">${c.total_xp} XP</div>`;
      el.addEventListener('click', async () => {
        if (c.club_id === state.profile.club_id) return;
        await api.joinClub(c.club_id);
        const { profile } = await api.profile();
        state.profile = profile; renderClubs(); renderHUD();
        toast('Вступил в клуб ' + c.name);
      });
      board.appendChild(el);
    });
  } catch (e) { board.innerHTML = '<div class="empty">Ошибка: ' + e.message + '</div>'; }
}

async function createClub() {
  const name = $('#clubName').value.trim();
  if (!name) return;
  try {
    await api.createClub(name);
  } catch (e) {
    // backend returns 409 with {"error": "..."} when you already own a club
    const m = /\{"error":\s*"([^"]+)"\}/.exec(e.message);
    toast(m ? m[1] : 'Можно создать только один клуб');
    return;
  }
  const { profile } = await api.profile();
  state.profile = profile;
  $('#clubName').value = '';
  renderClubs(); renderHUD();
  toast('Клуб «' + name + '» создан!');
}

async function renderPvP() {
  const me = state.profile;
  if (!state.pvpChars.me) state.pvpChars.me = new GymCharacter($('#pvpMe'));
  state.pvpChars.me.setStats({ strength: me.strength, endurance: me.endurance, agility: me.agility, tier: me.tier, level: me.level });
  $('#pvpMeInfo').innerHTML = pvpInfo(me, 'Ты');

  const info = $('#pvpOtherInfo');
  if (!state.pvpOther) { info.textContent = 'Открой «Рейтинг» и нажми на игрока'; return; }
  try {
    const { other } = await api.compare(state.pvpOther);
    if (!other) { info.textContent = 'Игрок не найден'; return; }
    if (!state.pvpChars.other) state.pvpChars.other = new GymCharacter($('#pvpOther'));
    state.pvpChars.other.setStats({ strength: other.strength, endurance: other.endurance, agility: other.agility, tier: other.tier, level: other.level });
    info.innerHTML = pvpInfo(other, other.first_name) +
      `<button class="btn ghost" style="margin-top:8px;width:100%" id="challengeBtn">⚔️ Вызвать на дуэль</button>`;
    $('#challengeBtn').addEventListener('click', async () => {
      await api.createDuel(other.user_id);
      toast('Дуэль отправлена ' + other.first_name + '!');
    });
  } catch (e) { info.textContent = 'Ошибка: ' + e.message; }
}

function pvpInfo(p, label) {
  return `<b>${label}</b> · ${p.tier.name}<br>LVL ${p.level} · ${p.total_xp} XP<br>
    💪 ${p.strength} · 🫁 ${p.endurance} · ⚡ ${p.agility}`;
}

function shareInvite() {
  const myId = state.profile.user_id;
  const link = `https://t.me/${BOT_USERNAME}?startapp=${myId}`;
  const text = 'Го дуэль в GymGame Club! Кто накачает персонажа сильнее за неделю 💪';
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, '_blank');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function fmtDate(iso) {
  try { const d = new Date(iso); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

boot();
