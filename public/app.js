const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

let state = null;
let activeTab = 'prs';
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
  els.initial.textContent = profile.name.slice(0, 1).toUpperCase();
  els.heroClass.textContent = hero.className;
  els.heroPower.textContent = hero.power;
  els.heroLevel.textContent = `Level ${profile.level}`;
  els.heroXp.textContent = `${profile.xpInLevel} / ${profile.nextLevelXp} XP`;
  els.xpFill.style.width = `${xpPercent}%`;
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

  renderTab();
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

els.startWorkout.addEventListener('click', async () => {
  render(await api('/api/workout/start', { method: 'POST' }));
  tg?.HapticFeedback?.impactOccurred('medium');
  showToast('Тренировка начата');
});

els.finishWorkout.addEventListener('click', async () => {
  try {
    const response = await api('/api/workout/finish', { method: 'POST' });
    render(response.state);
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
