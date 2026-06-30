const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

let state = null;
let activeView = 'hero';
let activePanel = 'prs';
let leaderboard = null;
const initData = tg?.initData || '';
const devUser = new URLSearchParams(window.location.search).get('devUser');

const els = {
  choiceView: document.getElementById('choiceView'),
  heroView: document.getElementById('heroView'),
  trainingView: document.getElementById('trainingView'),
  ratingView: document.getElementById('ratingView'),
  accountView: document.getElementById('accountView'),
  bottomNav: document.getElementById('bottomNav'),
  title: document.getElementById('hero-title'),
  rank: document.getElementById('heroRank'),
  heroImage: document.getElementById('heroImage'),
  heroClass: document.getElementById('heroClass'),
  heroPower: document.getElementById('heroPower'),
  heroLevel: document.getElementById('heroLevel'),
  heroXp: document.getElementById('heroXp'),
  xpFill: document.getElementById('xpFill'),
  heroTitle: document.getElementById('heroTitle'),
  attrStrength: document.getElementById('attrStrength'),
  attrDiscipline: document.getElementById('attrDiscipline'),
  attrEndurance: document.getElementById('attrEndurance'),
  choiceGrid: document.getElementById('choiceGrid'),
  heroEvolution: document.getElementById('heroEvolution'),
  syncStatus: document.getElementById('syncStatus'),
  loadout: document.getElementById('loadout'),
  nextMilestone: document.getElementById('nextMilestone'),
  startWorkout: document.getElementById('startWorkout'),
  finishWorkout: document.getElementById('finishWorkout'),
  workoutStatus: document.getElementById('workoutStatus'),
  setForm: document.getElementById('setForm'),
  streak: document.getElementById('streak'),
  workouts: document.getElementById('workouts'),
  sets: document.getElementById('sets'),
  quests: document.getElementById('quests'),
  ratingContent: document.getElementById('ratingContent'),
  accountContent: document.getElementById('accountContent'),
  toast: document.getElementById('toast')
};

function apiUrl(path) {
  if (devUser) return `${path}?devUser=${encodeURIComponent(devUser)}`;
  return path;
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData,
      ...(options.headers || {})
    }
  });

  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  setTimeout(() => els.toast.classList.remove('is-visible'), 2300);
}

function render(nextState) {
  state = nextState;
  const { profile, hero, daily, activeWorkout } = state;
  const xpPercent = Math.min(100, Math.round((profile.xpInLevel / profile.nextLevelXp) * 100));

  renderHeroChoices(hero);
  const needsChoice = hero.choiceRequired;
  document.body.classList.toggle('is-choosing', needsChoice);
  els.choiceView.classList.toggle('is-active', needsChoice);
  els.bottomNav.hidden = needsChoice;

  if (!needsChoice) {
    showView(activeView);
  }

  els.title.textContent = hero.archetype;
  els.rank.textContent = hero.rank;
  els.heroImage.src = hero.image;
  els.heroImage.alt = hero.archetype;
  els.heroClass.textContent = hero.className;
  els.heroPower.textContent = hero.power;
  els.syncStatus.textContent = profile.username ? `@${profile.username}` : 'Telegram ID';
  els.heroLevel.textContent = `Level ${profile.level}`;
  els.heroXp.textContent = `${profile.xpInLevel} / ${profile.nextLevelXp} XP`;
  els.xpFill.style.width = `${xpPercent}%`;
  els.heroTitle.textContent = hero.title;
  els.attrStrength.textContent = hero.attributes.strength;
  els.attrDiscipline.textContent = hero.attributes.discipline;
  els.attrEndurance.textContent = hero.attributes.endurance;
  els.heroEvolution.textContent = hero.evolutionText;
  els.streak.textContent = `${profile.streak} дн.`;
  els.workouts.textContent = profile.totalWorkouts;
  els.sets.textContent = profile.totalSets;
  els.workoutStatus.textContent = activeWorkout
    ? `Активно: ${activeWorkout.sets.length} подходов`
    : 'Нет активной тренировки';

  els.quests.innerHTML = [
    questTemplate('Записать 3 подхода', `${daily.sets}/3`, daily.sets >= 3),
    questTemplate('Завершить тренировку', daily.workoutFinished ? '1/1' : '0/1', daily.workoutFinished)
  ].join('');
  els.loadout.innerHTML = hero.loadout.map(loadoutTemplate).join('');
  els.nextMilestone.textContent = hero.nextMilestone;
  renderRating();
  renderAccountPanel();
}

function renderHeroChoices(hero) {
  els.choiceGrid.innerHTML = hero.choices.map((choice) => `
    <button class="choice-option" data-hero-type="${escapeHtml(choice.key)}" type="button">
      <span class="choice-media">
        <img src="${escapeHtml(choice.image)}" alt="${escapeHtml(choice.name)}">
      </span>
      <span class="choice-body">
        <strong>${escapeHtml(choice.name)}</strong>
        <small>${escapeHtml(choice.className)}</small>
        <em>${escapeHtml(choice.copy)}</em>
      </span>
    </button>
  `).join('');

  els.choiceGrid.querySelectorAll('[data-hero-type]').forEach((button) => {
    button.addEventListener('click', () => chooseHero(button.dataset.heroType));
  });
}

function questTemplate(title, progress, done) {
  return `
    <div class="quest ${done ? 'is-done' : ''}">
      <div>
        <strong>${title}</strong>
        <span>${done ? 'Квест закрыт' : 'В процессе'}</span>
      </div>
      <strong>${progress}</strong>
    </div>
  `;
}

function loadoutTemplate(item) {
  return `
    <div class="loadout-item ${item.unlocked ? '' : 'is-locked'}">
      <span class="loadout-slot">${escapeHtml(item.slot)}</span>
      <span class="loadout-name">${escapeHtml(item.name)}</span>
      <span class="loadout-state">${item.unlocked ? 'active' : 'locked'}</span>
    </div>
  `;
}

function showView(view) {
  activeView = view;
  const isChoice = state?.hero.choiceRequired;
  els.heroView.classList.toggle('is-active', !isChoice && view === 'hero');
  els.trainingView.classList.toggle('is-active', !isChoice && view === 'training');
  els.ratingView.classList.toggle('is-active', !isChoice && view === 'rating');
  els.accountView.classList.toggle('is-active', !isChoice && view === 'account');

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  });

  if (view === 'rating') renderRating();
  if (view === 'account') renderAccountPanel();
}

function renderRating() {
  if (activeView !== 'rating') return;
  if (!leaderboard) {
    els.ratingContent.innerHTML = '<p class="empty">Загружаю рейтинг игроков...</p>';
    loadLeaderboard();
    return;
  }

  const rows = leaderboard.players.map((player, index) => {
    const isMe = player.telegramId === state.profile.telegramId;
    return `
      <div class="leader-row ${isMe ? 'is-me' : ''}">
        <span class="leader-rank">#${index + 1}</span>
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <span>${player.level} lvl · ${player.power} power · ${player.totalWorkouts} трен.</span>
        </div>
        <strong>${player.xp} XP</strong>
      </div>
    `;
  }).join('');

  els.ratingContent.innerHTML = `
    <div class="rating-summary">Твой ранг: ${leaderboard.currentRank ? `#${leaderboard.currentRank}` : 'пока нет'}</div>
    ${rows ? `<div class="leader-list">${rows}</div>` : '<p class="empty">Рейтинг пустой. Первый игрок появится после входа в Mini App.</p>'}
  `;
}

async function loadLeaderboard() {
  try {
    leaderboard = await api('/api/leaderboard');
    renderRating();
  } catch (error) {
    els.ratingContent.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderAccountPanel() {
  if (activePanel === 'prs') {
    els.accountContent.innerHTML = listOrEmpty(
      state.prs,
      'PR пока нет. Запиши первый подход, и герой получит первый рекорд.',
      (item) => `
        <div class="item-row">
          <div>
            <strong>${escapeHtml(item.exercise)}</strong>
            <span>Личный рекорд</span>
          </div>
          <strong>${item.weight} кг x ${item.reps}</strong>
        </div>
      `
    );
  }

  if (activePanel === 'achievements') {
    els.accountContent.innerHTML = listOrEmpty(
      state.achievements,
      'Ачивок пока нет. Первый подход откроет стартовую.',
      (item) => `
        <div class="item-row">
          <strong>${escapeHtml(item.title)}</strong>
          <span>Открыто</span>
        </div>
      `
    );
  }

  if (activePanel === 'history') {
    els.accountContent.innerHTML = listOrEmpty(
      state.recentSets,
      'История пустая. Начни тренировку и добавь подход.',
      (item) => `
        <div class="item-row">
          <div>
            <strong>${escapeHtml(item.exercise)}</strong>
            <span>${item.date}</span>
          </div>
          <strong>${item.weight} кг x ${item.reps}</strong>
        </div>
      `
    );
  }
}

function listOrEmpty(items, emptyText, renderItem) {
  if (!items.length) return `<p class="empty">${emptyText}</p>`;
  return `<div class="item-list">${items.map(renderItem).join('')}</div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

async function refresh() {
  render(await api('/api/state'));
}

async function chooseHero(heroType) {
  activeView = 'hero';
  render(await api('/api/hero/choose', {
    method: 'POST',
    body: JSON.stringify({ heroType })
  }));
  tg?.HapticFeedback?.notificationOccurred('success');
  showToast('Персонаж выбран');
}

els.startWorkout.addEventListener('click', async () => {
  render(await api('/api/workout/start', { method: 'POST' }));
  leaderboard = null;
  tg?.HapticFeedback?.impactOccurred('medium');
  showToast('Тренировка начата');
});

els.finishWorkout.addEventListener('click', async () => {
  try {
    const response = await api('/api/workout/finish', { method: 'POST' });
    render(response.state);
    leaderboard = null;
    tg?.HapticFeedback?.notificationOccurred('success');
    showToast(`+${response.result.xp} XP за тренировку`);
  } catch (error) {
    showToast(error.message);
  }
});

els.setForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(els.setForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await api('/api/workout/set', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    render(response.state);
    leaderboard = null;
    els.setForm.reset();
    tg?.HapticFeedback?.impactOccurred(response.result.isPr ? 'heavy' : 'light');
    showToast(response.result.isPr ? `Новый PR: +${response.result.xp} XP` : `Подход записан: +${response.result.xp} XP`);
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

document.querySelectorAll('.subtab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activePanel = tab.dataset.panel;
    document.querySelectorAll('.subtab').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.panel === activePanel);
    });
    renderAccountPanel();
  });
});

refresh().catch((error) => {
  document.body.innerHTML = `<main class="app-shell"><section class="page-head"><h1>Mini App не авторизован</h1><p>${escapeHtml(error.message)}. Открой приложение через кнопку в Telegram-боте.</p></section></main>`;
});
