const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

let state = null;
const initialView = new URLSearchParams(window.location.search).get('view');
let activeView = ['hero', 'training', 'rating', 'account'].includes(initialView) ? initialView : 'hero';
let activePanel = 'prs';
let leaderboard = null;
let threeScene = null;
const initData = tg?.initData || '';
const devUser = new URLSearchParams(window.location.search).get('devUser');

const els = {
  choiceView: document.getElementById('choiceView'),
  heroView: document.getElementById('heroView'),
  trainingView: document.getElementById('trainingView'),
  ratingView: document.getElementById('ratingView'),
  accountView: document.getElementById('accountView'),
  bottomNav: document.getElementById('bottomNav'),
  threeCharacter: document.getElementById('threeCharacter'),
  heroCover: document.getElementById('heroCover'),
  characterStage: document.getElementById('characterStage'),
  characterModel: document.getElementById('characterModel'),
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
  visualStage: document.getElementById('visualStage'),
  visualUpgrade: document.getElementById('visualUpgrade'),
  visualFrame: document.getElementById('visualFrame'),
  evolutionList: document.getElementById('evolutionList'),
  syncStatus: document.getElementById('syncStatus'),
  loadout: document.getElementById('loadout'),
  nextMilestone: document.getElementById('nextMilestone'),
  startWorkout: document.getElementById('startWorkout'),
  finishWorkout: document.getElementById('finishWorkout'),
  workoutStatus: document.getElementById('workoutStatus'),
  setForm: document.getElementById('setForm'),
  exerciseSelect: document.getElementById('exerciseSelect'),
  planExerciseSelect: document.getElementById('planExerciseSelect'),
  addPlanExercise: document.getElementById('addPlanExercise'),
  trainingPlan: document.getElementById('trainingPlan'),
  completePlan: document.getElementById('completePlan'),
  failPlan: document.getElementById('failPlan'),
  planReward: document.getElementById('planReward'),
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
  renderExerciseSelects();
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
  renderCharacterVisual(hero);
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
  els.evolutionList.innerHTML = hero.visual.unlocked.map(evolutionTemplate).join('');
  renderTrainingPlan();
  updateThreeCharacter(hero);
  renderRating();
  renderAccountPanel();
}

function renderCharacterVisual(hero) {
  const visual = hero.visual;
  els.heroCover.dataset.theme = visual.theme;
  els.characterStage.dataset.theme = visual.theme;
  els.characterStage.style.setProperty('--hero-scale', visual.scale);
  els.characterStage.style.setProperty('--hero-rotate', `${visual.rotate}deg`);
  els.characterStage.style.setProperty('--hero-rotate-alt', `${visual.rotate * -1}deg`);
  els.characterStage.style.setProperty('--aura-size', `${visual.auraLevel * 1.15}rem`);
  els.characterStage.style.setProperty('--aura-opacity', String(0.08 + visual.auraLevel * 0.035));
  els.characterStage.style.setProperty('--aura-glow', `${0.8 + visual.auraLevel * 0.35}rem`);
  els.characterStage.style.setProperty('--armor-height', `${visual.armorLevel * 0.3}rem`);
  els.characterStage.style.setProperty('--armor-opacity', String(0.16 + visual.armorLevel * 0.13));
  els.characterStage.style.setProperty('--muscle-size', `${visual.muscleLevel * 0.38}rem`);
  els.characterStage.style.setProperty('--muscle-opacity', String(0.12 + visual.muscleLevel * 0.1));
  els.characterModel.dataset.armor = visual.armorLevel;
  els.characterModel.dataset.muscle = visual.muscleLevel;
  els.characterModel.dataset.aura = visual.auraLevel;
  els.visualStage.textContent = `${visual.levelForm}: ${visual.stageName}`;
  els.visualUpgrade.textContent = visual.upgradeName;
  els.visualFrame.textContent = visual.frame;
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

function evolutionTemplate(item, index) {
  return `
    <div class="evolution-item">
      <span>${index + 1}</span>
      <strong>${escapeHtml(item)}</strong>
    </div>
  `;
}

function renderExerciseSelects() {
  const options = ['<option value="">Выбрать из списка</option>']
    .concat(state.exerciseCatalog.map((exercise) => `<option value="${escapeHtml(exercise)}">${escapeHtml(exercise)}</option>`))
    .join('');
  els.exerciseSelect.innerHTML = options;
  els.planExerciseSelect.innerHTML = state.exerciseCatalog
    .map((exercise) => `<option value="${escapeHtml(exercise)}">${escapeHtml(exercise)}</option>`)
    .join('');
}

function renderTrainingPlan() {
  const plan = state.trainingPlan;
  els.planReward.textContent = `+${plan.completeXp} / -${plan.failXp} XP`;

  if (!plan.items.length) {
    els.trainingPlan.innerHTML = '<p class="empty">Добавь упражнения в личный план. Потом закрывай их по одному и получай XP за полный план.</p>';
  } else {
    els.trainingPlan.innerHTML = plan.items.map((item) => `
      <button class="plan-item ${item.done ? 'is-done' : ''}" data-plan-exercise="${escapeHtml(item.exercise)}" data-plan-done="${item.done ? '0' : '1'}" type="button">
        <span>${item.done ? 'DONE' : 'TODO'}</span>
        <strong>${escapeHtml(item.exercise)}</strong>
      </button>
    `).join('');
  }

  els.trainingPlan.querySelectorAll('[data-plan-exercise]').forEach((button) => {
    button.addEventListener('click', () => togglePlanExercise(button.dataset.planExercise, button.dataset.planDone === '1'));
  });
}

async function ensureThreeScene() {
  if (threeScene) return threeScene;
  try {
    const THREE = await import('/vendor/three.module.js');
    const renderer = new THREE.WebGLRenderer({ canvas: els.threeCharacter, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.2, 5.2);
    scene.add(new THREE.HemisphereLight(0xd9f2ff, 0x07101c, 2.4));
    const keyLight = new THREE.DirectionalLight(0x7cc8ff, 3);
    keyLight.position.set(2.8, 4.5, 3.2);
    scene.add(keyLight);

    const group = new THREE.Group();
    scene.add(group);
    const material = new THREE.MeshStandardMaterial({ color: 0x2f74ff, metalness: 0.18, roughness: 0.38 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x12274a, metalness: 0.68, roughness: 0.24 });
    const aura = new THREE.MeshBasicMaterial({ color: 0x35d8ff, transparent: true, opacity: 0.22, wireframe: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.35, 8, 18), material);
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16), material);
    head.position.y = 1.12;
    group.add(head);
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 0.32), armor);
    shoulder.position.y = 0.58;
    group.add(shoulder);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.58, 6), armor);
    core.position.y = 0.05;
    group.add(core);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 42), armor);
    belt.position.y = -0.42;
    belt.rotation.x = Math.PI / 2;
    group.add(belt);
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.88, 8, 12), material);
    leftArm.position.set(-0.78, 0.14, 0);
    leftArm.rotation.z = -0.32;
    group.add(leftArm);
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.78;
    rightArm.rotation.z = 0.32;
    group.add(rightArm);
    const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.9, 8, 12), material);
    leftLeg.position.set(-0.25, -1.04, 0);
    group.add(leftLeg);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.25;
    group.add(rightLeg);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.08), aura);
    blade.position.set(0.95, 0.15, 0.18);
    blade.rotation.z = -0.38;
    group.add(blade);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.01, 8, 54), aura);
    halo.position.y = 1.55;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.012, 8, 64), aura);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const parts = { body, head, shoulder, core, belt, leftArm, rightArm, leftLeg, rightLeg, blade, halo, ring };
    threeScene = { THREE, renderer, scene, camera, group, material, armor, aura, parts, ring };
    resizeThreeScene();
    window.addEventListener('resize', resizeThreeScene);
    animateThreeScene();
  } catch {
    els.threeCharacter.hidden = true;
  }
  return threeScene;
}

function resizeThreeScene() {
  if (!threeScene) return;
  const rect = els.threeCharacter.getBoundingClientRect();
  threeScene.renderer.setSize(rect.width, rect.height, false);
  threeScene.camera.aspect = rect.width / Math.max(1, rect.height);
  threeScene.camera.updateProjectionMatrix();
}

function animateThreeScene() {
  if (!threeScene) return;
  const tick = performance.now() / 1000;
  threeScene.group.rotation.y = Math.sin(tick * 0.8) * 0.28;
  threeScene.group.position.y = Math.sin(tick * 1.4) * 0.05;
  threeScene.parts.ring.rotation.z = tick * 0.7;
  threeScene.parts.halo.rotation.z = tick * 0.95;
  threeScene.parts.blade.rotation.y = Math.sin(tick * 1.5) * 0.22;
  threeScene.renderer.render(threeScene.scene, threeScene.camera);
  requestAnimationFrame(animateThreeScene);
}

async function updateThreeCharacter(hero) {
  const scene = await ensureThreeScene();
  if (!scene) return;
  const colors = {
    storm: [0x39d8ff, 0x133d8d, 0x7edfff],
    iron: [0x41e3a5, 0x123a4b, 0x8ef6c8],
    power: [0xff5d76, 0x3f1b3d, 0xffa4b6]
  }[hero.visual.theme] || [0x39d8ff, 0x133d8d, 0x7edfff];
  scene.material.color.setHex(colors[0]);
  scene.armor.color.setHex(colors[1]);
  scene.aura.color.setHex(colors[2]);
  const level = Math.min(12, hero.visual.level || 1);
  const muscle = hero.visual.muscleLevel;
  const armor = hero.visual.armorLevel;
  const aura = hero.visual.auraLevel;
  const widthBoost = 1 + muscle * 0.045;
  const heightBoost = 1 + level * 0.012;

  scene.group.scale.set(0.86 + muscle * 0.035, 0.86 + level * 0.018, 0.86 + muscle * 0.025);
  scene.parts.body.scale.set(widthBoost, heightBoost, widthBoost);
  scene.parts.head.scale.setScalar(1 + level * 0.006);
  scene.parts.leftArm.scale.set(1 + muscle * 0.08, 1 + muscle * 0.055, 1 + muscle * 0.08);
  scene.parts.rightArm.scale.copy(scene.parts.leftArm.scale);
  scene.parts.leftLeg.scale.set(1 + muscle * 0.04, 1 + level * 0.025, 1 + muscle * 0.04);
  scene.parts.rightLeg.scale.copy(scene.parts.leftLeg.scale);
  scene.parts.shoulder.visible = level >= 2;
  scene.parts.core.visible = level >= 4;
  scene.parts.belt.visible = level >= 6;
  scene.parts.blade.visible = hero.visual.theme === 'storm' ? level >= 7 : level >= 9;
  scene.parts.halo.visible = aura >= 3;
  scene.parts.shoulder.scale.set(0.72 + armor * 0.14, 0.9 + armor * 0.05, 1);
  scene.parts.core.scale.set(0.72 + armor * 0.09, 0.75 + armor * 0.08, 1);
  scene.parts.belt.scale.setScalar(0.76 + armor * 0.08);
  scene.parts.blade.scale.set(1, 0.65 + level * 0.07, 1);
  scene.parts.ring.scale.setScalar(0.85 + aura * 0.12);
  scene.parts.halo.scale.setScalar(0.72 + aura * 0.08);
  scene.aura.opacity = 0.12 + aura * 0.035;
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

els.exerciseSelect.addEventListener('change', () => {
  if (els.exerciseSelect.value) {
    els.setForm.elements.exercise.value = els.exerciseSelect.value;
  }
});

els.addPlanExercise.addEventListener('click', async () => {
  try {
    render(await api('/api/plan/add', {
      method: 'POST',
      body: JSON.stringify({ exercise: els.planExerciseSelect.value })
    }));
    showToast('Упражнение добавлено в план');
  } catch (error) {
    showToast(error.message);
  }
});

async function togglePlanExercise(exercise, done) {
  try {
    render(await api('/api/plan/toggle', {
      method: 'POST',
      body: JSON.stringify({ exercise, done })
    }));
    tg?.HapticFeedback?.impactOccurred('light');
  } catch (error) {
    showToast(error.message);
  }
}

els.completePlan.addEventListener('click', async () => {
  try {
    const response = await api('/api/plan/complete', { method: 'POST' });
    render(response.state);
    leaderboard = null;
    showToast(response.result.alreadyCompleted ? 'План уже закрыт сегодня' : `План закрыт: +${response.result.xp} XP`);
  } catch (error) {
    showToast(error.message);
  }
});

els.failPlan.addEventListener('click', async () => {
  try {
    const response = await api('/api/plan/fail', { method: 'POST' });
    render(response.state);
    leaderboard = null;
    showToast(response.result.alreadyFailed ? 'Штраф уже был сегодня' : `План провален: -${response.result.xp} XP`);
  } catch (error) {
    showToast(error.message);
  }
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
