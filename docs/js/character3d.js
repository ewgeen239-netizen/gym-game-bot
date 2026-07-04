// GymGame 3D character — a procedural humanoid built from primitives.
// Muscle groups scale with the player's stats and evolution tier, and the
// figure plays exercise + level-up animations. No external model files needed.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const NEON_CYAN = 0x22d3ee;
const NEON_MAGENTA = 0xf472b6;

export class GymCharacter {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.anim = 'idle';
    this.animT = 0;
    this.celebrateT = 0;
    this.stats = { strength: 0, endurance: 0, agility: 0 };
    this.muscle = 1;
    this.bodyColor = new THREE.Color(NEON_CYAN);

    this._initScene();
    this._buildBody();
    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
    requestAnimationFrame(this._loop);
  }

  _initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, 6.2);
    this.camera.lookAt(0, 1.4, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // neon rim lighting
    scene.add(new THREE.AmbientLight(0x334155, 1.1));
    const key = new THREE.PointLight(NEON_CYAN, 40, 40);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.PointLight(NEON_MAGENTA, 30, 40);
    fill.position.set(-4, 2, 3);
    scene.add(fill);
    const back = new THREE.DirectionalLight(0x8b5cf6, 1.4);
    back.position.set(0, 4, -5);
    scene.add(back);

    // glowing platform
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.06, 16, 64),
      new THREE.MeshBasicMaterial({ color: NEON_CYAN })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);
    this.ring = ring;

    const grid = new THREE.GridHelper(14, 14, NEON_MAGENTA, 0x1e293b);
    grid.position.y = 0;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    scene.add(grid);
  }

  _mat(color, emissive = 0.55) {
    return new THREE.MeshStandardMaterial({
      color, metalness: 0.6, roughness: 0.35,
      emissive: new THREE.Color(color), emissiveIntensity: emissive,
    });
  }

  _buildBody() {
    const root = new THREE.Group();
    this.root = root;
    this.scene.add(root);

    const skin = this.bodyColor.getHex();
    const dark = 0x0f172a;

    // torso / chest (chest group scales with strength)
    this.chest = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 8, 16), this._mat(skin));
    torso.position.y = 2.15;
    this.chest.add(torso);
    const pecs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.35), this._mat(skin, 0.7));
    pecs.position.set(0, 2.35, 0.22);
    this.chest.add(pecs);
    // core / abs (endurance)
    this.core = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.32), this._mat(dark, 0.3));
    this.core.position.set(0, 1.7, 0.18);
    root.add(this.core);
    root.add(this.chest);

    // head + neck
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 24), this._mat(skin, 0.5));
    head.position.y = 2.95;
    root.add(head);
    this.head = head;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.12, 0.1),
      new THREE.MeshBasicMaterial({ color: NEON_MAGENTA })
    );
    visor.position.set(0, 2.98, 0.27);
    root.add(visor);

    // shoulders + arms (strength). Pivots at the shoulder joint.
    this.arms = { left: this._buildArm(-1), right: this._buildArm(1) };
    root.add(this.arms.left.pivot, this.arms.right.pivot);

    // hips + legs (agility). Pivots at the hip joint.
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.2, 6, 14), this._mat(skin, 0.4));
    hips.position.y = 1.35;
    root.add(hips);
    this.legs = { left: this._buildLeg(-1), right: this._buildLeg(1) };
    root.add(this.legs.left.pivot, this.legs.right.pivot);

    this._applyScale();
  }

  _buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.55 * side, 2.55, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), this._mat(this.bodyColor.getHex(), 0.7));
    pivot.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), this._mat(this.bodyColor.getHex()));
    upper.position.y = -0.4;
    pivot.add(upper);
    const forearmPivot = new THREE.Group();
    forearmPivot.position.y = -0.7;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 6, 12), this._mat(this.bodyColor.getHex()));
    fore.position.y = -0.35;
    forearmPivot.add(fore);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), this._mat(NEON_MAGENTA, 0.8));
    glove.position.y = -0.62;
    forearmPivot.add(glove);
    pivot.add(forearmPivot);
    return { pivot, forearmPivot, shoulder, upper };
  }

  _buildLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * side, 1.25, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.55, 6, 12), this._mat(this.bodyColor.getHex()));
    thigh.position.y = -0.4;
    pivot.add(thigh);
    const shinPivot = new THREE.Group();
    shinPivot.position.y = -0.75;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), this._mat(this.bodyColor.getHex()));
    shin.position.y = -0.35;
    shinPivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.4), this._mat(NEON_CYAN, 0.8));
    foot.position.set(0, -0.62, 0.08);
    shinPivot.add(foot);
    pivot.add(shinPivot);
    return { pivot, shinPivot, thigh };
  }

  setStats({ strength = 0, endurance = 0, agility = 0, tier } = {}) {
    this.stats = { strength, endurance, agility };
    this.muscle = tier ? tier.muscle : 1;
    if (tier && tier.color) this.bodyColor = new THREE.Color(tier.color);
    this._recolor();
    this._applyScale();
  }

  _recolor() {
    const hex = this.bodyColor.getHex();
    const paint = (m) => { if (m && m.material && m.material.color) { m.material.color.set(hex); m.material.emissive.set(hex); } };
    [this.arms, this.legs].forEach((pair) => {
      Object.values(pair || {}).forEach((limb) => limb.pivot.traverse(paint));
    });
    if (this.chest) this.chest.traverse(paint);
    if (this.head) paint(this.head);
    if (this.ring) this.ring.material.color.set(hex);
  }

  // Scale muscle groups by tier + individual stats (soft, capped growth).
  _applyScale() {
    const s = 1 + Math.min(this.stats.strength / 900, 0.9);
    const e = 1 + Math.min(this.stats.endurance / 900, 0.6);
    const a = 1 + Math.min(this.stats.agility / 900, 0.6);
    const m = this.muscle;

    if (this.chest) this.chest.scale.set(m * s, m, m * s);
    if (this.core) this.core.scale.set(1 * e, 1 + (e - 1) * 0.5, 1);
    Object.values(this.arms).forEach((arm) => arm.pivot.scale.setScalar(m * s));
    Object.values(this.legs).forEach((leg) => leg.pivot.scale.setScalar(m * a));
  }

  play(name) {
    this.anim = name;
    this.animT = 0;
  }

  celebrate() {
    this.celebrateT = 2.2;
  }

  _animate(t) {
    const { arms, legs, root, chest } = this;
    const rest = () => {
      arms.left.pivot.rotation.set(0, 0, 0.12);
      arms.right.pivot.rotation.set(0, 0, -0.12);
      arms.left.forearmPivot.rotation.x = 0;
      arms.right.forearmPivot.rotation.x = 0;
      legs.left.pivot.rotation.set(0, 0, 0);
      legs.right.pivot.rotation.set(0, 0, 0);
      root.position.y = 0;
    };

    if (this.anim === 'curl') {
      rest();
      const c = (Math.sin(t * 5) * 0.5 + 0.5) * 2.4;
      arms.left.forearmPivot.rotation.x = -c;
      arms.right.forearmPivot.rotation.x = -c;
    } else if (this.anim === 'squat') {
      rest();
      const d = (Math.sin(t * 4) * 0.5 + 0.5);
      root.position.y = -d * 0.55;
      legs.left.pivot.rotation.x = d * 0.9;
      legs.right.pivot.rotation.x = d * 0.9;
      legs.left.shinPivot.rotation.x = -d * 1.1;
      legs.right.shinPivot.rotation.x = -d * 1.1;
      arms.left.pivot.rotation.x = -d * 1.4;
      arms.right.pivot.rotation.x = -d * 1.4;
    } else if (this.anim === 'press') {
      rest();
      const p = (Math.sin(t * 5) * 0.5 + 0.5);
      arms.left.pivot.rotation.z = 0.12 + p * 2.6;
      arms.right.pivot.rotation.z = -0.12 - p * 2.6;
    } else {
      // idle: subtle breathing + arm sway
      rest();
      const b = Math.sin(t * 1.6) * 0.04;
      root.position.y = b;
      if (chest) chest.scale.y = (this.muscle) * (1 + b * 0.3);
      arms.left.pivot.rotation.z = 0.12 + Math.sin(t * 1.6) * 0.05;
      arms.right.pivot.rotation.z = -0.12 - Math.sin(t * 1.6) * 0.05;
    }
  }

  _loop() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    this._animate(t);

    // slow turntable
    this.root.rotation.y += dt * 0.35;
    this.ring.rotation.z += dt * 0.6;

    if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      this.root.rotation.y += dt * 6;
      const flash = Math.abs(Math.sin(this.celebrateT * 12));
      this.root.scale.setScalar(1 + flash * 0.08);
      this.ring.scale.setScalar(1 + flash * 0.4);
    } else {
      this.root.scale.setScalar(1);
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
