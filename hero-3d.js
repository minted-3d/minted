// Minted — palco 3D do hero
// Troféu, mascote e chaveiro em WebGL, com iluminação de estúdio.
// Arraste para girar; os botões trocam o produto.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('hero3d');
const stage = document.getElementById('heroStage');
if (!canvas || !stage) {
  // Página sem palco — o módulo é carregado só no index, mas sai quieto.
} else {
  boot();
}

function boot() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const skuEl = document.getElementById('heroSku');
  const fallback = document.getElementById('heroFallback');

  function showFallback() {
    if (fallback) fallback.hidden = false;
    canvas.hidden = true;
    stage.classList.add('is-ready', 'is-fallback');
  }

  if (!webglOk()) {
    showFallback();
    return;
  }

  try {
    startScene(reduceMotion, skuEl, showFallback);
  } catch (err) {
    console.error('Minted 3D:', err);
    showFallback();
  }
}

function startScene(reduceMotion, skuEl, showFallback) {

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(2.55, 1.72, 3.55);
  camera.lookAt(0, 0.92, 0);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.72;
    envScene.dispose();
    pmrem.dispose();
  } catch (err) {
    console.warn('Minted 3D: environment map skipped', err);
  }

  lights(scene);
  scene.add(studioFloor());

  const layerTex = printLayers();
  const pivot = new THREE.Group();
  scene.add(pivot);

  const products = {
    trophy: { label: 'Troféu Corrida · Campeã', build: () => createTrophy(layerTex) },
    mascot: { label: 'Tambor azul · brinde', build: () => createDrum(layerTex) },
    key:    { label: 'Chaveiro Liber Sistemas', build: () => createKeychain(layerTex) }
  };

  const startKey = ['trophy', 'mascot', 'key'].includes(new URLSearchParams(location.search).get('p'))
    ? new URLSearchParams(location.search).get('p')
    : 'trophy';
  let currentKey = startKey;
  let current = products[startKey].build();
  pivot.add(current);
  document.querySelectorAll('[data-product]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.product === startKey ? 'true' : 'false');
  });
  if (skuEl) skuEl.textContent = products[startKey].label;

  let intro = reduceMotion ? 1 : 0;
  let visible = true;
  let switching = false;
  let clickSpin = 0;
  let clickBounce = 0;
  let downPt = null;
  let cameraFramed = false;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI * 0.32;
  controls.maxPolarAngle = Math.PI * 0.58;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 1.8;
  controls.rotateSpeed = 0.95;
  controls.target.set(0, 0.95, 0);
  controls.update();

  canvas.style.touchAction = 'none';
  canvas.tabIndex = 0;
  canvas.style.cursor = 'grab';

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let resumeAuto = 0;

  canvas.addEventListener('pointerdown', (e) => {
    downPt = { x: e.clientX, y: e.clientY };
    canvas.classList.add('is-dragging');
    canvas.style.cursor = 'grabbing';
    controls.autoRotate = false;
    resumeAuto = 0;
  });

  canvas.addEventListener('pointerup', (e) => {
    canvas.classList.remove('is-dragging');
    canvas.style.cursor = 'grab';
    if (!downPt) return;
    const dist = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
    if (dist < 10) onClickModel(e);
    downPt = null;
    resumeAuto = reduceMotion ? 0 : performance.now() + 1800;
  });

  canvas.addEventListener('pointercancel', () => {
    canvas.classList.remove('is-dragging');
    canvas.style.cursor = 'grab';
    downPt = null;
  });

  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { pivot.rotation.y += 0.18; e.preventDefault(); }
    if (e.key === 'ArrowRight') { pivot.rotation.y -= 0.18; e.preventDefault(); }
  });

  function onClickModel(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(current, true);
    if (!hits.length) {
      clickSpin = 7;
      clickBounce = 1;
      return;
    }
    clickSpin = 11;
    clickBounce = 1;
  }

  document.querySelectorAll('[data-product]').forEach((btn) => {
    btn.addEventListener('click', () => switchProduct(btn.dataset.product));
  });

  function switchProduct(key) {
    if (!products[key] || key === currentKey || switching) return;
    switching = true;
    currentKey = key;
    document.querySelectorAll('[data-product]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.product === key ? 'true' : 'false');
    });
    if (skuEl) skuEl.textContent = products[key].label;
    canvas.setAttribute('aria-label', products[key].label + '. Arraste ou clique para girar.');

    clickSpin = 0;
    clickBounce = 0;
    const outgoing = current;
    const incoming = products[key].build();
    incoming.scale.setScalar(0.01);
    incoming.rotation.y = 0;
    pivot.add(incoming);

    const t0 = performance.now();
    const dur = reduceMotion ? 1 : 420;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      outgoing.scale.setScalar(1 - e);
      incoming.scale.setScalar(e);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        pivot.remove(outgoing);
        disposeGroup(outgoing);
        incoming.scale.setScalar(1);
        current = incoming;
        switching = false;
      }
    };
    requestAnimationFrame(tick);
  }

  const vis = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }, { threshold: 0.05 });
  vis.observe(canvas);

  const clock = new THREE.Clock();
  let fitted = false;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!fitted) { fit(); fitted = true; }

    if (!visible || document.hidden) return;

    if (intro < 1) {
      intro = Math.min(1, intro + dt * 1.15);
      const e = 1 - Math.pow(1 - intro, 3);
      current.scale.setScalar(0.72 + 0.28 * e);
    }

    if (clickSpin) {
      current.rotation.y += clickSpin * dt;
      clickSpin *= Math.pow(0.9, dt * 60);
      if (Math.abs(clickSpin) < 0.04) clickSpin = 0;
    }
    if (clickBounce > 0) {
      clickBounce = Math.max(0, clickBounce - dt * 2.8);
      current.position.y = Math.sin(clickBounce * Math.PI) * 0.14;
    } else if (!reduceMotion) {
      current.position.y = Math.sin(clock.elapsedTime * 0.85) * 0.04;
    }

    if (resumeAuto && performance.now() > resumeAuto && !downPt && !reduceMotion) {
      controls.autoRotate = true;
      resumeAuto = 0;
    }

    controls.update();
    renderer.render(scene, camera);
    if (intro > 0.15) stage.classList.add('is-ready');
  }

  function fit() {
    const w = canvas.clientWidth || stage.clientWidth || 600;
    const h = canvas.clientHeight || stage.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    if (!cameraFramed) {
      camera.position.set(w < 720 ? 2.9 : 2.55, 1.65, w < 720 ? 4.1 : 3.45);
      controls.target.set(0, 0.95, 0);
      cameraFramed = true;
    }
    controls.update();
  }

  window.addEventListener('resize', fit);
  if (window.ResizeObserver) {
    new ResizeObserver(fit).observe(stage);
  }

  fit();
  renderer.render(scene, camera);
  stage.classList.add('is-ready');
  requestAnimationFrame(frame);
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function lights(scene) {
  const hemi = new THREE.HemisphereLight(0xd7e8f2, 0x1a140c, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff3e4, 2.35);
  key.position.set(4.2, 6.4, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.03;
  const cam = key.shadow.camera;
  cam.near = 1;
  cam.far = 18;
  cam.left = -4;
  cam.right = 4;
  cam.top = 4;
  cam.bottom = -4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7ed7ff, 0.55);
  fill.position.set(-3.4, 2.2, 2.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xb8fff0, 0.7);
  rim.position.set(-0.4, 3.2, -4.4);
  scene.add(rim);

  const spark = new THREE.PointLight(0xffffff, 1.1, 7, 2);
  spark.position.set(0.85, 2.35, 1.55);
  scene.add(spark);
}

function studioFloor() {
  const g = new THREE.Group();

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.28, 0.045, 72),
    physical({ color: 0x101926, metalness: 0.72, roughness: 0.28, envMapIntensity: 1.1 })
  );
  disc.position.y = -0.022;
  disc.receiveShadow = true;
  g.add(disc);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.28, 0.012, 10, 80),
    new THREE.MeshPhysicalMaterial({
      color: 0x3fe0a4,
      metalness: 0.4,
      roughness: 0.25,
      emissive: 0x0d4a38,
      emissiveIntensity: 0.35
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.004;
  g.add(ring);

  // Sombra de contato pintada — barata e estável
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 256;
  const ctx = sc.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.18)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  g.add(shadow);

  return g;
}

function physical(opts) {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0.05,
    roughness: 0.4,
    envMapIntensity: 1,
    clearcoat: 0,
    ...opts
  });
}

function pla(color, bump) {
  return physical({
    color,
    metalness: 0.04,
    roughness: 0.38,
    clearcoat: 0.72,
    clearcoatRoughness: 0.28,
    bumpMap: bump || null,
    bumpScale: bump ? 0.018 : 0,
    sheen: 0.18,
    sheenColor: new THREE.Color(color),
    sheenRoughness: 0.55,
    flatShading: true
  });
}

function metal(color, roughness = 0.28) {
  return physical({
    color,
    metalness: 0.92,
    roughness,
    envMapIntensity: 1.25,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4
  });
}

function printLayers() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 256; y++) {
    const v = (y % 3 === 0) ? 168 : 255;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 10);
  t.anisotropy = 4;
  return t;
}

function add(parent, geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.pos) m.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  parent.add(m);
  return m;
}

function mintedCube(size, bump) {
  const g = new THREE.Group();
  const h = size / 2;
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.98, size * 0.98, size * 0.98),
    physical({ color: 0x0a1c30, roughness: 0.55, metalness: 0.2 })
  );
  core.castShadow = true;
  g.add(core);
  const plane = new THREE.PlaneGeometry(size, size);
  const faces = [
    { pos: [ h, 0, 0], rot: [0,  Math.PI / 2, 0], color: 0x0c2344 },
    { pos: [-h, 0, 0], rot: [0, -Math.PI / 2, 0], color: 0x24c3cf },
    { pos: [ 0, h, 0], rot: [-Math.PI / 2, 0, 0], color: 0x3fe0a4 },
    { pos: [ 0,-h, 0], rot: [ Math.PI / 2, 0, 0], color: 0x0a1c30 },
    { pos: [ 0, 0, h], rot: [0, 0, 0],            color: 0x24c3cf },
    { pos: [ 0, 0,-h], rot: [0, Math.PI, 0],      color: 0x1a6f96 }
  ];
  faces.forEach((f) => {
    const m = new THREE.Mesh(plane, pla(f.color, bump));
    m.position.set(f.pos[0], f.pos[1], f.pos[2]);
    m.rotation.set(f.rot[0], f.rot[1], f.rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  });
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: 0x062018, transparent: true, opacity: 0.35 })
  );
  g.add(edges);
  return g;
}

function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9a36a';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#b08a52';
  ctx.fillRect(0, 0, 512, 8);
  ctx.fillRect(0, 120, 512, 8);
  ctx.fillStyle = '#3a2710';
  ctx.font = '600 44px "Bricolage Grotesque", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0.28em';
  ctx.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createTrophy(bump) {
  const g = new THREE.Group();
  const gold = pla(0xe8c34a, bump);
  const goldDeep = pla(0xc9a227, bump);
  const cream = pla(0xf3efe6, bump);

  add(g, new THREE.CylinderGeometry(0.78, 0.84, 0.12, 48), cream, { pos: [0, 0.06, 0] });
  add(g, new THREE.CylinderGeometry(0.58, 0.62, 0.11, 40), cream, { pos: [0, 0.16, 0] });

  const plaqueMat = physical({
    color: 0xe8c34a,
    metalness: 0.15,
    roughness: 0.35,
    map: plateTexture('CAMPEÃ'),
    clearcoat: 0.4
  });
  add(g, new THREE.BoxGeometry(0.52, 0.12, 0.04), plaqueMat, { pos: [0, 0.12, 0.62], cast: false });

  add(g, new THREE.TorusGeometry(0.98, 0.055, 10, 48, Math.PI * 1.22), gold, {
    pos: [-0.12, 1.12, 0], rot: [0, 0, 0.42]
  });
  add(g, new THREE.TorusGeometry(0.76, 0.048, 10, 48, Math.PI * 1.18), gold, {
    pos: [-0.06, 1.02, 0], rot: [0, 0, 0.42]
  });
  add(g, new THREE.TorusGeometry(0.5, 0.055, 8, 28, Math.PI * 0.72), gold, {
    pos: [0.12, 0.42, 0], rot: [0, 0, -0.55]
  });

  const runner = makeRunnerTrophy(gold, goldDeep);
  runner.position.set(0.06, 0.28, 0);
  runner.rotation.y = -0.15;
  g.add(runner);
  return g;
}

function makeRunnerTrophy(gold, goldDeep) {
  const g = new THREE.Group();
  g.scale.z = 0.42;

  add(g, new THREE.SphereGeometry(0.13, 16, 16), gold, { pos: [0.22, 1.22, 0] });
  add(g, new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), gold, { pos: [0.06, 1.30, 0], rot: [0.15, 0, 1.15] });
  add(g, new THREE.SphereGeometry(0.048, 10, 10), gold, { pos: [-0.04, 1.20, 0] });
  add(g, new THREE.CapsuleGeometry(0.035, 0.08, 3, 8), gold, { pos: [0.20, 1.08, 0], rot: [0.25, 0, 0] });
  add(g, new RoundedBoxGeometry(0.2, 0.38, 0.16, 2, 0.06), gold, { pos: [0.12, 0.82, 0], rot: [0.12, 0.2, -0.18] });
  add(g, new RoundedBoxGeometry(0.2, 0.14, 0.14, 2, 0.05), goldDeep, { pos: [0.02, 0.58, 0], rot: [0.18, 0.18, 0] });

  add(g, new THREE.CapsuleGeometry(0.038, 0.16, 3, 8), gold, { pos: [0.30, 0.94, 0], rot: [0.15, 0, -1.15] });
  add(g, new THREE.CapsuleGeometry(0.034, 0.14, 3, 8), gold, { pos: [0.44, 1.02, 0], rot: [0.05, 0, -0.35] });
  add(g, new THREE.SphereGeometry(0.042, 8, 8), gold, { pos: [0.54, 1.08, 0] });

  add(g, new THREE.CapsuleGeometry(0.038, 0.15, 3, 8), gold, { pos: [-0.08, 0.86, 0], rot: [0.2, 0, 0.95] });
  add(g, new THREE.CapsuleGeometry(0.034, 0.13, 3, 8), gold, { pos: [-0.18, 0.70, 0], rot: [0.45, 0, 0.45] });
  add(g, new THREE.SphereGeometry(0.038, 8, 8), gold, { pos: [-0.22, 0.58, 0] });

  add(g, new THREE.CapsuleGeometry(0.048, 0.22, 4, 8), gold, { pos: [0.16, 0.38, 0], rot: [0.95, 0.15, -0.15] });
  add(g, new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), gold, { pos: [0.22, 0.16, 0], rot: [0.12, 0, 0] });
  add(g, new RoundedBoxGeometry(0.08, 0.045, 0.16, 1, 0.02), goldDeep, { pos: [0.24, 0.05, 0.08] });

  add(g, new THREE.CapsuleGeometry(0.048, 0.22, 4, 8), gold, { pos: [-0.10, 0.36, 0], rot: [-0.9, 0, 0.12] });
  add(g, new THREE.CapsuleGeometry(0.04, 0.15, 4, 8), gold, { pos: [-0.24, 0.14, 0], rot: [-0.15, 0, 0] });
  add(g, new RoundedBoxGeometry(0.08, 0.045, 0.16, 1, 0.02), goldDeep, { pos: [-0.30, 0.05, -0.06] });

  return g;
}

function createDrum(bump) {
  const g = new THREE.Group();
  const blue = pla(0x1565c0, bump);
  const blueLid = pla(0x0d47a1, bump);
  const steel = metal(0xb8c2cc, 0.38);
  const yellow = pla(0xffd100, bump);
  const green = pla(0x009739, bump);
  const white = pla(0xffffff, bump);
  const dark = physical({ color: 0x111111, roughness: 0.4 });

  const h = 1.48;
  const r = 0.5;
  add(g, new THREE.CylinderGeometry(r, r, h, 48), blue, { pos: [0, 0.08 + h / 2, 0] });
  add(g, new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.07, 48), blueLid, { pos: [0, 0.08 + h + 0.02, 0] });
  add(g, new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.06, 40), blueLid, { pos: [0, 0.05, 0] });

  [0.22, 0.52, 1.05, 1.42].forEach((y) => {
    add(g, new THREE.TorusGeometry(r + 0.012, 0.032, 8, 40), steel, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
  });

  add(g, new THREE.TorusGeometry(r + 0.018, 0.038, 8, 40), yellow, { pos: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0] });
  add(g, new THREE.TorusGeometry(r + 0.018, 0.026, 8, 40), green, { pos: [0, 0.74, 0], rot: [Math.PI / 2, 0, 0] });

  add(g, new THREE.CylinderGeometry(0.065, 0.065, 0.05, 16), steel, { pos: [-0.16, 0.08 + h + 0.06, 0.12] });
  add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), steel, { pos: [0.18, 0.08 + h + 0.06, -0.08] });

  add(g, new THREE.SphereGeometry(0.085, 12, 12), white, { pos: [-0.15, 1.08, r - 0.04] });
  add(g, new THREE.SphereGeometry(0.085, 12, 12), white, { pos: [ 0.15, 1.08, r - 0.04] });
  add(g, new THREE.SphereGeometry(0.04, 10, 10), dark, { pos: [-0.15, 1.08, r + 0.04] });
  add(g, new THREE.SphereGeometry(0.04, 10, 10), dark, { pos: [ 0.15, 1.08, r + 0.04] });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 12, Math.PI), dark);
  smile.position.set(0, 0.90, r + 0.01);
  smile.rotation.set(Math.PI, 0, 0);
  g.add(smile);

  return g;
}

function createKeychain(bump) {
  const g = new THREE.Group();
  const purple = pla(0x6d28ff, bump);
  const white = pla(0xf6f5f8, bump);
  const steel = metal(0xc5d0da, 0.22);

  add(g, new THREE.TorusGeometry(0.42, 0.048, 14, 48), steel, { pos: [0, 1.55, 0], rot: [0.28, 0.12, 0.2] });
  add(g, new THREE.TorusGeometry(0.1, 0.022, 10, 20), steel, { pos: [0, 1.14, 0], rot: [0.5, 0, 0] });

  add(g, new THREE.CylinderGeometry(0.52, 0.52, 0.14, 48), white, { pos: [0, 0.58, 0], rot: [Math.PI / 2, 0, 0] });
  add(g, new THREE.TorusGeometry(0.52, 0.028, 8, 40), purple, { pos: [0, 0.58, 0] });

  const map = new THREE.TextureLoader().load('logos/liber-isotipo.png');
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const logoMat = physical({ map, roughness: 0.32, metalness: 0.04, clearcoat: 0.35 });
  add(g, new THREE.CircleGeometry(0.4, 40), logoMat, { pos: [0, 0.58, 0.072] });
  add(g, new THREE.CircleGeometry(0.4, 40), logoMat, { pos: [0, 0.58, -0.072], rot: [0, Math.PI, 0] });

  const tagMat = physical({
    color: 0x111111,
    metalness: 0.1,
    roughness: 0.4,
    map: plateTexture('LIBER')
  });
  add(g, new THREE.BoxGeometry(0.42, 0.09, 0.02), tagMat, { pos: [0, 0.12, 0.08], cast: false });

  return g;
}

function disposeGroup(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.bumpMap) m.bumpMap.dispose();
        m.dispose();
      });
    }
  });
}
