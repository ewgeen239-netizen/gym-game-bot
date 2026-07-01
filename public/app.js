const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
tg?.disableVerticalSwipes?.();

let state = null;
const VIEWS = ['hero', 'training', 'rating', 'account'];
const initialView = new URLSearchParams(window.location.search).get('view');
let activeView = VIEWS.includes(initialView) ? initialView : 'hero';
let activePanel = 'prs';
let leaderboard = null;
let threeScene = null;
let modelYaw = 0;
let isRotatingModel = false;
let lastModelPointerX = 0;
let threeControlsBound = false;
let heroRevealBound = false;
let heroFullView = false;
let sheetDragStartY = 0;
let sheetDragCurrentY = 0;
let isDraggingSheet = false;
const initData = tg?.initData || '';
const devUser = new URLSearchParams(window.location.search).get('devUser');
const HERO_MODEL_SCALE = 2.18;
const HERO_MODEL_Y = -1.36;
const HERO_MODEL_FULL_Y = -1.12;

const EQUIPMENT_ASSETS = [
  {
    key: 'shield',
    url: '/assets/equipment/vanguard_shield.glb',
    level: 3,
    height: 0.78,
    position: [-1.36, 1.08, 0.34],
    rotation: [0.04, Math.PI / 2.05, 0.12],
    orbitRadius: 1.36,
    orbitHeight: 1.08,
    orbitDepth: 0.48,
    orbitSpeed: 0.62,
    orbitPhase: Math.PI * 1.1,
    fallback: ['shield', 'shieldCore', 'crest']
  },
  {
    key: 'shoulders',
    url: '/assets/equipment/storm_shoulders.glb',
    level: 5,
    height: 0.58,
    position: [0.92, 1.16, -0.12],
    rotation: [0, 0, 0],
    orbitRadius: 1.02,
    orbitHeight: 1.16,
    orbitDepth: 0.34,
    orbitSpeed: 0.5,
    orbitPhase: Math.PI * 0.2,
    fallback: ['shoulder', 'core']
  },
  {
    key: 'wings',
    url: '/assets/equipment/aura_wings.glb',
    level: 7,
    height: 1.12,
    position: [0, 1.02, -0.58],
    rotation: [0, Math.PI / 2, 0],
    orbitRadius: 0.88,
    orbitHeight: 1.02,
    orbitDepth: 0.62,
    orbitSpeed: 0.38,
    orbitPhase: Math.PI * 1.55,
    fallback: ['halo', 'ring']
  },
  {
    key: 'blade',
    url: '/assets/equipment/tempest_blade.glb',
    level: 9,
    height: 0.98,
    position: [1.46, 0.94, 0.32],
    rotation: [0.05, 0.24, -0.52],
    orbitRadius: 1.46,
    orbitHeight: 0.94,
    orbitDepth: 0.46,
    orbitSpeed: 0.58,
    orbitPhase: Math.PI * 0.42,
    fallback: ['blade', 'bladeGuard']
  },
  {
    key: 'armor',
    url: '/assets/equipment/legend_armor.glb',
    level: 12,
    height: 0.94,
    position: [1.28, 1.06, 0.28],
    rotation: [0, 0, 0],
    orbitRadius: 1.28,
    orbitHeight: 1.06,
    orbitDepth: 0.42,
    orbitSpeed: 0.46,
    orbitPhase: Math.PI * 0.02,
    fallback: ['core', 'belt']
  }
];

const els = {
  heroView: document.getElementById('heroView'),
  trainingView: document.getElementById('trainingView'),
  ratingView: document.getElementById('ratingView'),
  accountView: document.getElementById('accountView'),
  bottomNav: document.getElementById('bottomNav'),
  navGlider: document.getElementById('navGlider'),
  threeCharacter: document.getElementById('threeCharacter'),
  heroCover: document.getElementById('heroCover'),
  heroSheet: document.getElementById('heroSheet'),
  characterStage: document.getElementById('characterStage'),
  title: document.getElementById('hero-title'),
  rank: document.getElementById('heroRank'),
  heroClass: document.getElementById('heroClass'),
  heroPower: document.getElementById('heroPower'),
  heroLevel: document.getElementById('heroLevel'),
  heroXp: document.getElementById('heroXp'),
  xpFill: document.getElementById('xpFill'),
  heroTitle: document.getElementById('heroTitle'),
  attrStrength: document.getElementById('attrStrength'),
  attrDiscipline: document.getElementById('attrDiscipline'),
  attrEndurance: document.getElementById('attrEndurance'),
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

  renderExerciseSelects();
  bindHeroRevealControls();
  document.body.classList.remove('is-choosing');
  els.bottomNav.hidden = false;
  showView(activeView);

  els.title.textContent = hero.archetype;
  els.rank.textContent = hero.rank;
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
  els.visualStage.textContent = `${visual.levelForm}: ${visual.stageName}`;
  els.visualUpgrade.textContent = `Сейчас: ${visual.upgradeName} · Дальше: ${visual.nextUpgradeName}`;
  els.visualFrame.textContent = visual.frame;
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
    const { GLTFLoader } = await import('/vendor/GLTFLoader.js');
    const renderer = new THREE.WebGLRenderer({ canvas: els.threeCharacter, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.18, 4.7);
    scene.add(new THREE.HemisphereLight(0xd9f2ff, 0x07101c, 2.4));
    const keyLight = new THREE.DirectionalLight(0x7cc8ff, 3);
    keyLight.position.set(2.8, 4.5, 3.2);
    scene.add(keyLight);

    const group = new THREE.Group();
    scene.add(group);
    const modelRoot = new THREE.Group();
    group.add(modelRoot);
    const equipmentRoot = new THREE.Group();
    group.add(equipmentRoot);
    const armor = new THREE.MeshStandardMaterial({ color: 0x12274a, metalness: 0.68, roughness: 0.24, side: THREE.DoubleSide });
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8f5ff, metalness: 0.82, roughness: 0.18 });
    const shieldMaterial = new THREE.MeshStandardMaterial({ color: 0x1a4d7f, metalness: 0.72, roughness: 0.26, side: THREE.DoubleSide });
    const aura = new THREE.MeshBasicMaterial({ color: 0x35d8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
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
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.06), bladeMaterial);
    blade.position.set(0.95, 0.15, 0.18);
    blade.rotation.z = -0.38;
    group.add(blade);
    const bladeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.08), armor);
    bladeGuard.position.set(0.78, -0.25, 0.18);
    bladeGuard.rotation.z = -0.38;
    group.add(bladeGuard);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.01, 8, 54), aura);
    halo.position.y = 1.55;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    const shield = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), shieldMaterial);
    shield.position.set(-0.78, 0.08, 0.2);
    shield.rotation.y = 0.35;
    group.add(shield);
    const shieldCore = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), aura);
    shieldCore.position.set(-0.78, 0.08, 0.23);
    shieldCore.rotation.y = 0.35;
    group.add(shieldCore);
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 40), aura);
    crest.position.set(-0.78, 0.08, 0.23);
    crest.rotation.y = 0.35;
    group.add(crest);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.012, 8, 64), aura);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const parts = { shoulder, core, belt, blade, bladeGuard, halo, shield, shieldCore, crest, ring };
    const loader = new GLTFLoader();
    threeScene = {
      THREE,
      renderer,
      scene,
      camera,
      group,
      modelRoot,
      equipmentRoot,
      equipment: {},
      equipmentLoading: {},
      equipmentReady: {},
      equipmentLoader: loader,
      armor,
      bladeMaterial,
      shieldMaterial,
      aura,
      parts,
      ring,
      usingModel: false
    };
    loader.load('/assets/models/base_basic_shaded.glb', (gltf) => {
      modelRoot.add(gltf.scene);
      modelRoot.scale.setScalar(HERO_MODEL_SCALE);
      modelRoot.position.set(0, HERO_MODEL_Y, 0);
      modelRoot.rotation.y = 0;
      gltf.scene.traverse((item) => {
        if (item.isMesh) {
          item.castShadow = false;
          item.frustumCulled = false;
        }
      });
      threeScene.usingModel = true;
    });
    resizeThreeScene();
    bindThreeCharacterControls();
    window.addEventListener('resize', resizeThreeScene);
    animateThreeScene();
  } catch {
    els.threeCharacter.hidden = true;
  }
  return threeScene;
}

function loadEquipmentAsset(config) {
  if (!threeScene || threeScene.equipment[config.key] || threeScene.equipmentLoading[config.key]) return;
  threeScene.equipmentLoading[config.key] = true;

  threeScene.equipmentLoader.load(config.url, (gltf) => {
    const { THREE } = threeScene;
    const wrapper = new THREE.Group();
    const object = gltf.scene;
    wrapper.add(object);

    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    object.position.sub(center);

    const fitScale = config.height / Math.max(0.01, size.y);
    wrapper.scale.setScalar(fitScale);
    wrapper.position.set(...config.position);
    wrapper.rotation.set(...config.rotation);
    wrapper.userData.basePosition = wrapper.position.clone();
    wrapper.userData.baseRotation = wrapper.rotation.clone();
    wrapper.userData.floatSeed = EQUIPMENT_ASSETS.findIndex((item) => item.key === config.key) * 0.9;
    wrapper.userData.orbitRadius = config.orbitRadius || Math.max(0.76, Math.abs(config.position[0]));
    wrapper.userData.orbitHeight = config.orbitHeight || config.position[1];
    wrapper.userData.orbitDepth = config.orbitDepth || Math.max(0.28, Math.abs(config.position[2]));
    wrapper.userData.orbitSpeed = config.orbitSpeed || 0.46;
    wrapper.userData.orbitPhase = config.orbitPhase || wrapper.userData.floatSeed;
    wrapper.visible = false;

    object.traverse((item) => {
      if (item.isMesh) {
        item.frustumCulled = false;
        if (item.material) {
          item.material.side = THREE.DoubleSide;
          item.material.envMapIntensity = 0.9;
          if (item.material.map) item.material.map.anisotropy = 4;
          if (item.material.normalMap) item.material.normalScale.setScalar(0.85);
          item.material.needsUpdate = true;
        }
      }
    });

    threeScene.equipmentRoot.add(wrapper);
    threeScene.equipment[config.key] = wrapper;
    threeScene.equipmentReady[config.key] = true;
    threeScene.equipmentLoading[config.key] = false;
    if (state?.hero) updateThreeCharacter(state.hero);
  }, undefined, () => {
    threeScene.equipmentLoading[config.key] = false;
  });
}

function bindHeroRevealControls() {
  if (heroRevealBound || !els.heroSheet) return;
  heroRevealBound = true;

  els.heroSheet.addEventListener('pointerdown', (event) => {
    isDraggingSheet = true;
    sheetDragStartY = event.clientY;
    sheetDragCurrentY = heroFullView ? 125 : 0;
    els.heroSheet.setPointerCapture?.(event.pointerId);
  });

  els.heroSheet.addEventListener('pointermove', (event) => {
    if (!isDraggingSheet) return;
    event.preventDefault();
    const delta = event.clientY - sheetDragStartY;
    const nextOffset = Math.max(0, Math.min(145, (heroFullView ? 125 : 0) + delta));
    sheetDragCurrentY = nextOffset;
    const progress = nextOffset / 125;
    els.heroCover.style.setProperty('--sheet-offset', `${nextOffset}px`);
    els.heroCover.style.setProperty('--sheet-alpha', String(Math.max(0, 1 - progress * 1.35)));
    els.heroCover.style.setProperty('--scene-veil', String(Math.max(0.28, 1 - progress * 0.72)));
  });

  const finishSheetDrag = (event) => {
    if (!isDraggingSheet) return;
    isDraggingSheet = false;
    els.heroSheet.releasePointerCapture?.(event.pointerId);
    setHeroFullView(sheetDragCurrentY > 62);
  };

  els.heroSheet.addEventListener('pointerup', finishSheetDrag);
  els.heroSheet.addEventListener('pointercancel', finishSheetDrag);
  els.heroSheet.addEventListener('lostpointercapture', () => {
    if (isDraggingSheet) setHeroFullView(sheetDragCurrentY > 62);
    isDraggingSheet = false;
  });

  els.heroSheet.addEventListener('click', (event) => {
    if (Math.abs(event.clientY - sheetDragStartY) > 6) return;
    setHeroFullView(!heroFullView);
  });
}

function setHeroFullView(enabled) {
  heroFullView = enabled;
  sheetDragCurrentY = enabled ? 125 : 0;
  els.heroCover.classList.toggle('is-full-hero', enabled);
  els.heroCover.style.removeProperty('--sheet-offset');
  els.heroCover.style.removeProperty('--sheet-alpha');
  els.heroCover.style.removeProperty('--scene-veil');
  updateThreeCameraMode();
  if (state?.hero) updateThreeCharacter(state.hero);
}

function updateThreeCameraMode() {
  if (!threeScene) return;
  if (heroFullView) {
    threeScene.camera.position.set(0, 1.08, 6.45);
    threeScene.camera.fov = 39;
  } else {
    threeScene.camera.position.set(0, 1.18, 4.7);
    threeScene.camera.fov = 35;
  }
  threeScene.camera.updateProjectionMatrix();
}

function bindThreeCharacterControls() {
  if (threeControlsBound) return;
  threeControlsBound = true;

  els.threeCharacter.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    isRotatingModel = true;
    lastModelPointerX = event.clientX;
    els.threeCharacter.setPointerCapture?.(event.pointerId);
  });

  els.threeCharacter.addEventListener('pointermove', (event) => {
    if (!isRotatingModel) return;
    event.preventDefault();
    const delta = event.clientX - lastModelPointerX;
    lastModelPointerX = event.clientX;
    modelYaw += delta * 0.012;
  });

  const stopRotating = (event) => {
    isRotatingModel = false;
    els.threeCharacter.releasePointerCapture?.(event.pointerId);
  };

  els.threeCharacter.addEventListener('pointerup', stopRotating);
  els.threeCharacter.addEventListener('pointercancel', stopRotating);
  els.threeCharacter.addEventListener('lostpointercapture', () => {
    isRotatingModel = false;
  });
}

function resizeThreeScene() {
  if (!threeScene) return;
  const rect = els.threeCharacter.getBoundingClientRect();
  threeScene.renderer.setSize(rect.width, rect.height, false);
  threeScene.camera.aspect = rect.width / Math.max(1, rect.height);
  updateThreeCameraMode();
  threeScene.camera.updateProjectionMatrix();
}

function animateThreeScene() {
  if (!threeScene) return;
  const tick = performance.now() / 1000;
  const idleTurn = isRotatingModel ? 0 : Math.sin(tick * 0.8) * 0.12;
  threeScene.group.rotation.y = modelYaw + idleTurn;
  threeScene.group.position.y = Math.sin(tick * 1.4) * 0.05;
  threeScene.parts.ring.rotation.z = tick * 0.7;
  threeScene.parts.halo.rotation.z = tick * 0.95;
  threeScene.parts.blade.rotation.y = Math.sin(tick * 1.5) * 0.22;
  animateEquipment(tick);
  threeScene.renderer.render(threeScene.scene, threeScene.camera);
  requestAnimationFrame(animateThreeScene);
}

function animateEquipment(tick) {
  if (!threeScene?.equipment) return;
  Object.values(threeScene.equipment).forEach((model) => {
    if (!model.visible || !model.userData.basePosition) return;
    const seed = model.userData.floatSeed || 0;
    const angle = tick * model.userData.orbitSpeed + model.userData.orbitPhase;
    const float = Math.sin(tick * 1.35 + seed) * 0.055;
    const x = Math.cos(angle) * model.userData.orbitRadius;
    const z = Math.sin(angle) * model.userData.orbitDepth;
    model.position.set(x, model.userData.orbitHeight + float, z);
    model.rotation.x = model.userData.baseRotation.x + Math.sin(tick * 0.7 + seed) * 0.035;
    model.rotation.y = model.userData.baseRotation.y - angle + Math.PI / 2;
    model.rotation.z = model.userData.baseRotation.z + Math.cos(tick * 0.6 + seed) * 0.035;
  });
}

async function updateThreeCharacter(hero) {
  const scene = await ensureThreeScene();
  if (!scene) return;
  const colors = {
    storm: [0x39d8ff, 0x133d8d, 0x7edfff],
    iron: [0x41e3a5, 0x123a4b, 0x8ef6c8],
    power: [0xff5d76, 0x3f1b3d, 0xffa4b6]
  }[hero.visual.theme] || [0x39d8ff, 0x133d8d, 0x7edfff];
  scene.armor.color.setHex(colors[1]);
  scene.bladeMaterial.color.setHex(colors[2]);
  scene.shieldMaterial.color.setHex(colors[1]);
  scene.aura.color.setHex(colors[2]);
  const level = Math.min(12, hero.visual.level || 1);
  const armor = hero.visual.armorLevel;
  const aura = hero.visual.auraLevel;
  const revealScale = heroFullView ? 0.9 : 1;
  scene.group.scale.setScalar(revealScale);
  scene.modelRoot.scale.setScalar(HERO_MODEL_SCALE * revealScale);
  scene.modelRoot.position.y = heroFullView ? HERO_MODEL_FULL_Y : HERO_MODEL_Y;
  Object.values(scene.parts).forEach((part) => {
    part.visible = false;
  });
  scene.parts.shoulder.scale.set(0.72 + armor * 0.14, 0.9 + armor * 0.05, 1);
  scene.parts.core.scale.set(0.72 + armor * 0.09, 0.75 + armor * 0.08, 1);
  scene.parts.belt.scale.setScalar(0.76 + armor * 0.08);
  scene.parts.blade.scale.set(1, 0.65 + level * 0.07, 1);
  scene.parts.ring.scale.setScalar(0.85 + aura * 0.12);
  scene.parts.halo.scale.setScalar(0.72 + aura * 0.08);
  scene.parts.shield.scale.setScalar(0.72 + level * 0.045);
  scene.parts.shieldCore.scale.setScalar(0.72 + aura * 0.08);
  scene.parts.crest.scale.setScalar(0.72 + aura * 0.08);
  scene.aura.opacity = 0.12 + aura * 0.035;
  updateEquipment(hero);
}

function updateEquipment(hero) {
  if (!threeScene?.equipment) return;
  const level = Math.min(12, hero.visual.level || 1);
  EQUIPMENT_ASSETS.forEach((config) => {
    if (level >= config.level) loadEquipmentAsset(config);
    const model = threeScene.equipment[config.key];
    const showRealAsset = Boolean(model && level >= config.level);
    if (model) {
      model.visible = showRealAsset;
      const growth = 1 + Math.max(0, level - config.level) * 0.025;
      model.scale.setScalar((config.height / getEquipmentHeight(model)) * growth);
    }
  });
}

function getEquipmentHeight(model) {
  const box = new threeScene.THREE.Box3().setFromObject(model);
  const size = new threeScene.THREE.Vector3();
  box.getSize(size);
  return Math.max(0.01, size.y / Math.max(0.01, model.scale.y));
}

function showView(view) {
  if (!VIEWS.includes(view)) return;
  activeView = view;
  els.heroView.classList.toggle('is-active', view === 'hero');
  els.trainingView.classList.toggle('is-active', view === 'training');
  els.ratingView.classList.toggle('is-active', view === 'rating');
  els.accountView.classList.toggle('is-active', view === 'account');

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  });
  updateNavGlider();

  if (view === 'rating') renderRating();
  if (view === 'account') renderAccountPanel();
  window.scrollTo(0, 0);
}

function updateNavGlider(index = VIEWS.indexOf(activeView)) {
  const safeIndex = Math.max(0, Math.min(VIEWS.length - 1, index));
  document.documentElement.style.setProperty('--nav-index', safeIndex);
}

function updateKeyboardOffset() {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty('--keyboard-offset', '0px');
    return;
  }
  const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
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
  const goToTab = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showView(tab.dataset.view);
  };
  tab.addEventListener('click', goToTab);
  tab.addEventListener('pointerup', goToTab);
});

if (els.bottomNav) {
  let isDraggingNav = false;

  const pickNavView = (clientX, commit = false) => {
    const rect = els.bottomNav.getBoundingClientRect();
    const progress = Math.max(0, Math.min(0.999, (clientX - rect.left) / Math.max(1, rect.width)));
    const index = Math.floor(progress * VIEWS.length);
    updateNavGlider(index);
    if (commit) showView(VIEWS[index]);
  };

  els.bottomNav.addEventListener('pointerdown', (event) => {
    isDraggingNav = true;
    els.bottomNav.classList.add('is-dragging');
    els.bottomNav.setPointerCapture?.(event.pointerId);
    pickNavView(event.clientX);
  });

  els.bottomNav.addEventListener('pointermove', (event) => {
    if (!isDraggingNav) return;
    event.preventDefault();
    pickNavView(event.clientX);
  });

  const finishNavDrag = (event) => {
    if (!isDraggingNav) return;
    isDraggingNav = false;
    els.bottomNav.classList.remove('is-dragging');
    els.bottomNav.releasePointerCapture?.(event.pointerId);
    pickNavView(event.clientX, true);
  };

  els.bottomNav.addEventListener('pointerup', finishNavDrag);
  els.bottomNav.addEventListener('pointercancel', finishNavDrag);
}

window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);
window.addEventListener('resize', updateKeyboardOffset);
updateKeyboardOffset();
updateNavGlider();

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
