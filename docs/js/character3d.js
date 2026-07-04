// GymGame 3D character — loads the original GLB hero model and evolves it with
// the player's tier, plus procedural neon equipment that orbits and unlocks by
// level. Keeps the GymCharacter interface (setStats / play / celebrate) so the
// rest of the app is unchanged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const NEON_CYAN = 0x22d3ee;
const NEON_MAGENTA = 0xf472b6;

const MODEL_URLS = {
  human: new URL('../assets/models/base_basic_shaded.glb', import.meta.url).href,
  slime: new URL('../assets/models/slime.glb', import.meta.url).href,
};
const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/';

// Display framing (world units). The model is auto-fit to this height and its
// feet are anchored on the ring so the whole hero stays visible.
const DISPLAY_HEIGHT = 2.55;
const FEET_Y = -1.5;

export class GymCharacter {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.anim = 'idle';
    this.celebrateT = 0;
    this.animPulse = 0;
    this.stats = { strength: 0, endurance: 0, agility: 0 };
    this.muscle = 1;
    this.level = 0;
    this.equip = {};
    this.bodyColor = new THREE.Color(NEON_CYAN);
    this.heroReady = false;
    this.modelType = null;   // 'slime' | 'human'
    this._loadToken = 0;

    // user-controlled rotation (face camera by default, drag to spin 360°)
    this.yaw = 0;
    this.dragging = false;
    this._lastX = 0;
    this._fitW = 1;
    this._fitH = DISPLAY_HEIGHT;

    this._loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    this._loader.setDRACOLoader(draco);

    this._initScene();
    this._loadModel('slime');   // everyone starts as a slime until setStats says otherwise
    this._buildEquipment();
    this._bindDrag();
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
    this.camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    // Image-based lighting: reflections/detail on the PBR materials.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    // Studio-style key/fill/rim lighting for depth and detail.
    scene.add(new THREE.HemisphereLight(0xdff0ff, 0x0a1420, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0006; key.shadow.radius = 4;
    scene.add(key);
    const fillCyan = new THREE.PointLight(NEON_CYAN, 22, 45);
    fillCyan.position.set(3.5, 1.5, 3);
    scene.add(fillCyan);
    const rimMag = new THREE.PointLight(NEON_MAGENTA, 26, 45);
    rimMag.position.set(-4, 3, -1.5);
    scene.add(rimMag);
    const backViolet = new THREE.DirectionalLight(0x8b5cf6, 1.2);
    backViolet.position.set(0, 3, -5);
    scene.add(backViolet);

    // soft contact shadow catcher on the ring plane
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = FEET_Y + 0.01;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // hero holder (turntable) + independent equipment root
    this.group = new THREE.Group();
    scene.add(this.group);

    // glowing platform + grid (kept from the neon home stage)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.05, 16, 64),
      new THREE.MeshBasicMaterial({ color: NEON_CYAN })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = FEET_Y;
    scene.add(ring);
    this.ring = ring;

    const grid = new THREE.GridHelper(12, 12, NEON_MAGENTA, 0x1e293b);
    grid.position.y = FEET_Y;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    scene.add(grid);

    // Post-processing: neon bloom (only bright emissive/neon elements glow).
    renderer.setClearColor(0x000000, 0);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.45, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // Load (or swap to) a model type: 'slime' (level 0) or 'human' (level 1+).
  _loadModel(type) {
    if (type === this.modelType) return;
    this.modelType = type;
    const token = ++this._loadToken;
    this._loader.load(
      MODEL_URLS[type],
      (gltf) => {
        if (token !== this._loadToken) return; // a newer swap superseded this one
        const model = gltf.scene;
        model.traverse((o) => {
          if (o.isMesh) {
            o.frustumCulled = false;
            o.castShadow = true;
            if (o.material) o.material.envMapIntensity = 0.7;
          }
        });

        // Auto-fit: measure, recentre on origin so feet sit at the bottom,
        // then scale to a known display height.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.position.set(-center.x, -box.min.y, -center.z);

        const root = new THREE.Group();
        root.add(model);
        this._fitScale = DISPLAY_HEIGHT / Math.max(0.001, size.y);
        this._fitW = size.x * this._fitScale;
        this._fitH = size.y * this._fitScale;

        // remove the previous model, if any
        if (this.hero) { this.group.remove(this.hero); this._dispose(this.hero); }
        this.hero = root;
        this.group.add(root);
        this.heroReady = true;
        this._applyScale();
        this._frame();
      },
      undefined,
      (err) => console.error(`Model "${type}" failed to load:`, err)
    );
  }

  _dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
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
        radius: 1.2,  depth: 0.5,  height: 1.35, speed: 0.5,  phase: Math.PI * 0.25 },
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
    // slime below level 1, human from level 1 up (tier.model overrides if given)
    const wantModel = (tier && tier.model) || (this.level >= 1 ? 'human' : 'slime');
    this._loadModel(wantModel);
    this._applyScale();
    this._showEquipmentForLevel(this.level);
  }

  // Fixed size: the model is always rendered at the same standard scale
  // (no growth with level/stats), auto-fit to the display height and anchored
  // at the feet on the ring.
  _applyScale() {
    if (!this.heroReady || !this.hero || !this._fitScale) return;
    const s = this._fitScale;
    this._scaleY = s;
    this.hero.scale.set(s, s, s);
    this.hero.position.y = FEET_Y;
  }

  play(name) {
    this.anim = name;
  }

  celebrate() {
    this.celebrateT = 2.2;
  }

  // Drag anywhere on the canvas to rotate the hero a full 360°.
  _bindDrag() {
    const c = this.canvas;
    const down = (x) => { this.dragging = true; this._lastX = x; };
    const move = (x) => {
      if (!this.dragging) return;
      this.yaw += (x - this._lastX) * 0.01;
      this._lastX = x;
    };
    const up = () => { this.dragging = false; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture?.(e.pointerId); down(e.clientX); });
    c.addEventListener('pointermove', (e) => move(e.clientX));
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
  }

  _loop() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    // face camera by default; user drag sets yaw. Tiny idle sway when idle.
    const sway = this.dragging ? 0 : Math.sin(t * 0.6) * 0.06;
    this.group.position.y = Math.sin(t * 1.4) * 0.04;
    this.ring.rotation.z += dt * 0.6;
    this._animateEquipment(t);

    if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      this.yaw += dt * 6; // celebratory spin, ends facing wherever it lands
      const flash = Math.abs(Math.sin(this.celebrateT * 12));
      this.ring.scale.setScalar(1 + flash * 0.35);
    } else {
      this.ring.scale.setScalar(1);
    }
    this.group.rotation.y = this.yaw + sway;

    this.composer.render();
    requestAnimationFrame(this._loop);
  }

  // Pull the camera to whatever distance frames the whole model (both width and
  // height) with margin — so the hero looks the same size on any screen and
  // never overflows the stage, regardless of viewport/aspect changes.
  _frame() {
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect || 1;
    const margin = 1.5;                       // more padding so nothing clips
    const h = this._fitH * margin;
    const w = this._fitW * margin;
    const distH = (h / 2) / Math.tan(fov / 2);
    const distW = (w / 2) / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(distH, distW, 3);
    const centerY = FEET_Y + this._fitH / 2;
    // aim a bit above centre so the hero sits lower in the frame with headroom
    const aim = centerY + this._fitH * 0.12;
    this.camera.position.set(0, aim, dist);
    this.camera.lookAt(0, aim, 0);
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this._frame();
  }
}
