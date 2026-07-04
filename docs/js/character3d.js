// GymGame 3D character — loads the original GLB hero model and evolves it with
// the player's tier, plus procedural neon equipment that orbits and unlocks by
// level. Keeps the GymCharacter interface (setStats / play / celebrate) so the
// rest of the app is unchanged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const NEON_CYAN = 0x22d3ee;
const NEON_MAGENTA = 0xf472b6;

const HERO_URL = new URL('../assets/models/base_basic_shaded.glb', import.meta.url).href;
const HERO_MODEL_SCALE = 1.95;
const HERO_MODEL_Y = -1.54;

export class GymCharacter {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.anim = 'idle';
    this.celebrateT = 0;
    this.animPulse = 0;
    this.stats = { strength: 0, endurance: 0, agility: 0 };
    this.muscle = 1;
    this.level = 1;
    this.equip = {};
    this.bodyColor = new THREE.Color(NEON_CYAN);
    this.heroReady = false;

    this._initScene();
    this._loadHero();
    this._buildEquipment();
    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
    requestAnimationFrame(this._loop);
  }

  _initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 1.15, 4.9);
    this.camera.lookAt(0, 0.55, 0);

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    this.renderer = renderer;

    // Neutral-ish lighting so the model's PBR materials read correctly,
    // plus a couple of soft neon accents for the cyberpunk vibe.
    scene.add(new THREE.HemisphereLight(0xd9f2ff, 0x07101c, 2.2));
    const key = new THREE.DirectionalLight(0x9ad4ff, 2.6);
    key.position.set(2.8, 4.5, 3.2);
    scene.add(key);
    const rim = new THREE.PointLight(NEON_MAGENTA, 18, 40);
    rim.position.set(-4, 2.5, 2.5);
    scene.add(rim);

    // hero holder (turntable) + independent equipment root
    this.group = new THREE.Group();
    scene.add(this.group);

    // glowing platform + grid (kept from the neon home stage)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.05, 16, 64),
      new THREE.MeshBasicMaterial({ color: NEON_CYAN })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.55;
    scene.add(ring);
    this.ring = ring;

    const grid = new THREE.GridHelper(12, 12, NEON_MAGENTA, 0x1e293b);
    grid.position.y = -1.55;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    scene.add(grid);
  }

  _loadHero() {
    const loader = new GLTFLoader();
    loader.load(
      HERO_URL,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        const root = new THREE.Group();
        root.add(model);
        root.scale.setScalar(HERO_MODEL_SCALE);
        root.position.set(0, HERO_MODEL_Y, 0);
        this.hero = root;
        this.group.add(root);
        this.heroReady = true;
        this._applyScale();
      },
      undefined,
      (err) => console.error('Hero model failed to load:', err)
    );
  }

  // --- Orbiting equipment (procedural, unlocks by level) -------------------
  _equipmentSpecs() {
    const gem = (geo, color, emissive = 0.9) =>
      new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color, metalness: 0.7, roughness: 0.25,
        emissive: new THREE.Color(color), emissiveIntensity: emissive,
      }));
    return [
      { key: 'gloves', level: 2,  make: () => gem(new THREE.OctahedronGeometry(0.16), NEON_MAGENTA),
        radius: 1.25, depth: 0.5, height: 0.3, speed: 0.7,  phase: Math.PI * 0.1 },
      { key: 'belt',   level: 4,  make: () => gem(new THREE.TorusGeometry(0.18, 0.06, 10, 20), 0xfacc15),
        radius: 1.1,  depth: 0.45, height: -0.1, speed: 0.55, phase: Math.PI * 0.8 },
      { key: 'shoes',  level: 6,  make: () => gem(new THREE.BoxGeometry(0.28, 0.12, 0.4), NEON_CYAN),
        radius: 1.35, depth: 0.55, height: -0.9, speed: 0.6,  phase: Math.PI * 1.4 },
      { key: 'tracker',level: 8,  make: () => gem(new THREE.TorusGeometry(0.12, 0.045, 8, 16), NEON_CYAN),
        radius: 1.0,  depth: 0.4,  height: 0.6, speed: 0.75, phase: Math.PI * 0.45 },
      { key: 'aura',   level: 10, make: () => {
          const m = gem(new THREE.IcosahedronGeometry(0.22, 0), NEON_CYAN, 0.5);
          m.material.wireframe = true; return m;
        }, radius: 1.5, depth: 0.65, height: 0.75, speed: 0.4, phase: Math.PI * 1.05 },
      { key: 'hood',   level: 12, make: () => gem(new THREE.ConeGeometry(0.2, 0.34, 6), 0xa855f7),
        radius: 1.2,  depth: 0.5,  height: 0.9, speed: 0.5,  phase: Math.PI * 0.25 },
      { key: 'crown',  level: 35, make: () => gem(new THREE.ConeGeometry(0.22, 0.3, 5), 0xfacc15),
        radius: 0.9,  depth: 0.35, height: 1.9, speed: 0.9, phase: 0 },
      { key: 'wings',  level: 50, make: () => {
          const g = new THREE.Group();
          [-1, 1].forEach((s) => { const w = gem(new THREE.ConeGeometry(0.14, 0.7, 4), NEON_MAGENTA); w.position.x = s * 0.25; w.rotation.z = s * 0.6; g.add(w); });
          return g;
        }, radius: 1.6, depth: 0.7, height: 0.5, speed: 0.35, phase: Math.PI },
    ];
  }

  _buildEquipment() {
    this.equipRoot = new THREE.Group();
    this.scene.add(this.equipRoot);
    this._equipmentSpecs().forEach((spec, i) => {
      const mesh = spec.make();
      mesh.visible = false;
      mesh.userData = { ...spec, seed: i * 0.9 };
      this.equipRoot.add(mesh);
      this.equip[spec.key] = mesh;
    });
  }

  _showEquipmentForLevel(level) {
    Object.values(this.equip).forEach((m) => { m.visible = level >= m.userData.level; });
  }

  _animateEquipment(t) {
    if (!this.equipRoot) return;
    Object.values(this.equip).forEach((m) => {
      if (!m.visible) return;
      const u = m.userData;
      const angle = t * u.speed + u.phase;
      const float = Math.sin(t * 1.35 + u.seed) * 0.06;
      m.position.set(Math.cos(angle) * u.radius, u.height + float, Math.sin(angle) * u.depth);
      m.rotation.y = -angle + Math.PI / 2 + t * 0.5;
      m.rotation.x = Math.sin(t * 0.7 + u.seed) * 0.4;
    });
  }

  // --- Public interface -----------------------------------------------------
  setStats({ strength = 0, endurance = 0, agility = 0, tier, level } = {}) {
    this.stats = { strength, endurance, agility };
    this.muscle = tier ? tier.muscle : 1;
    if (typeof level === 'number') this.level = level;
    if (tier && tier.color) {
      this.bodyColor = new THREE.Color(tier.color);
      if (this.ring) this.ring.material.color.set(tier.color);
    }
    this._applyScale();
    this._showEquipmentForLevel(this.level);
  }

  // Evolution: the hero grows with tier. Strength adds a little extra bulk.
  _applyScale() {
    if (!this.heroReady || !this.hero) return;
    const bulk = 1 + Math.min(this.stats.strength / 1200, 0.35);
    const s = HERO_MODEL_SCALE * this.muscle * bulk;
    this._scaleXZ = s * 1.02;
    this._scaleY = s;
    this.hero.scale.set(this._scaleXZ, this._scaleY, this._scaleXZ);
  }

  play(name) {
    this.anim = name;
    this.animPulse = 1;
  }

  celebrate() {
    this.celebrateT = 2.2;
  }

  _loop() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    // idle turntable + gentle float
    this.group.rotation.y += dt * 0.4;
    this.group.position.y = Math.sin(t * 1.4) * 0.05;
    this.ring.rotation.z += dt * 0.6;
    this._animateEquipment(t);

    // exercise "pulse": a quick squash/bounce on the hero (model is static)
    if (this.animPulse > 0 && this.hero && this._scaleY) {
      this.animPulse = Math.max(0, this.animPulse - dt * 1.6);
      const p = Math.sin((1 - this.animPulse) * Math.PI) * 0.06;
      this.hero.scale.y = this._scaleY * (1 + p);
      if (this.animPulse === 0) this.hero.scale.y = this._scaleY; // restore
    }

    if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      this.group.rotation.y += dt * 6;
      const flash = Math.abs(Math.sin(this.celebrateT * 12));
      this.ring.scale.setScalar(1 + flash * 0.35);
    } else {
      this.ring.scale.setScalar(1);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }

  _onResize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
