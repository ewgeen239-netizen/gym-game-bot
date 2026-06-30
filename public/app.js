const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

let state = null;
let activeTab = 'prs';
let leaderboard = null;
const initData = tg?.initData || '';
const devUser = new URLSearchParams(window.location.search).get('devUser');

const els = {
  title: document.getElementById('hero-title'),
  rank: document.getElementById('heroRank'),
  initial: document.getElementById('heroInitial'),
  heroClass: document.getElementById('heroClass'),
  heroPower: document.getElementById('heroPower'),
  heroLevel: document.getElementById('heroLevel'),
  heroXp: document.getElementById('heroXp'),
  xpFill: document.getElementById('xpFill'),
  heroTitle: document.getElementById('heroTitle'),
  attrStrength: document.getElementById('attrStrength'),
  attrDiscipline: document.getElementById('attrDiscipline'),
  attrEndurance: document.getElementById('attrEndurance'),
  characterChoice: document.getElementById('characterChoice'),
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
  tabContent: document.getElementById('tabContent'),
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

  els.title.textContent = profile.name;
  els.rank.textContent = hero.rank;
  els.initial.textContent = hero.avatar || profile.name.slice(0, 1).toUpperCase();
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
  renderHeroChoices(hero);

  renderTab();
}

function renderHeroChoices(hero) {
  els.characterChoice.classList.toggle('is-hidden', !hero.choiceRequired);
  els.choiceGrid.innerHTML = hero.choices.map((choice) => `
    <button class="choice-option" data-hero-type="${escapeHtml(choice.key)}" type="button">
      <span class="choice-avatar">${escapeHtml(choice.avatar)}</span>
      <strong>${escapeHtml(choice.name)}</strong>
      <small>${escapeHtml(choice.copy)}</small>
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

function renderTab() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === activeTab);
  });

  if (activeTab === 'prs') {
    els.tabContent.innerHTML = listOrEmpty(
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

  if (activeTab === 'achievements') {
    els.tabContent.innerHTML = listOrEmpty(
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

  if (activeTab === 'rating') {
    renderRating();
  }

  if (activeTab === 'history') {
    els.tabContent.innerHTML = listOrEmpty(
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

function renderRating() {
  if (!leaderboard) {
    els.tabContent.innerHTML = '<p class="empty">Загружаю рейтинг игроков...</p>';
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

  els.tabContent.innerHTML = `
    <div class="rating-summary">Твой ранг: ${leaderboard.currentRank ? `#${leaderboard.currentRank}` : 'пока нет'}</div>
    ${rows ? `<div class="leader-list">${rows}</div>` : '<p class="empty">Рейтинг пустой. Первый игрок появится после входа в Mini App.</p>'}
  `;
}

async function loadLeaderboard() {
  try {
    leaderboard = await api('/api/leaderboard');
    if (activeTab === 'rating') renderRating();
  } catch (error) {
    els.tabContent.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
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

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    renderTab();
  });
});

refresh().catch((error) => {
  document.body.innerHTML = `<main class="app-shell"><section class="hero-panel"><div><h1>Mini App не авторизован</h1><p class="hero-copy">${escapeHtml(error.message)}. Открой приложение через кнопку в Telegram-боте.</p></div></section></main>`;
});
