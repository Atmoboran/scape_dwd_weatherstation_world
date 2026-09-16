import * as THREE from 'three';
import { PlayerController, hasTouch } from './player-controller.js';
import { InstrumentRegistry, edgeDistance } from './instrument-registry.js';
import { floorHeightAt } from './terrain.js';
import { Weather, WEATHER_PRESETS } from './weather.js';
import * as ui from './ui.js';

const WEATHER_STORAGE_KEY = 'meteo-walk.weather';

// All measured from the edge of a station's footprint, not its centre.
const DISCOVER_DIST = 3; // meters: walking this close marks a station found
const INTERACT_DIST = 6; // meters: close enough to open the info panel
const LABEL_DIST = 22;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc8dcee, 45, 190);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// Phones report a DPR of 3+; rendering that many pixels is the easiest way to cook a
// mobile GPU, and 1.5 is indistinguishable at arm's length.
renderer.setPixelRatio(Math.min(devicePixelRatio, hasTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- sky: gradient dome, cheaper and better looking than a flat clear colour ---
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f86c6) },
      horizon: { value: new THREE.Color(0xc8dcee) },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vH = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; varying float vH;
      void main() {
        gl_FragColor = vec4(mix(horizon, top, clamp(vH * 1.6, 0.0, 1.0)), 1.0);
      }`,
  })
);
scene.add(sky);

// --- lighting: one sun + sky fill, no real-time shadows (mobile perf) ---
const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(30, 45, 18);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// --- procedural speckle texture: gives grass and gravel some grain, no image download ---
function speckleTexture(base, speck, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = speck;
  for (let i = 0; i < 4200; i++) {
    g.globalAlpha = 0.2 + Math.random() * 0.45;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GROUND_MAPS = {
  grass: speckleTexture('#8ba869', '#6b8a4d', 160),
  wet: speckleTexture('#6f8a55', '#53683e', 160),
  snow: speckleTexture('#eef3f7', '#d3dde6', 160),
};
const PATH_MAPS = {
  grass: speckleTexture('#b9ae98', '#9a8f79', 1),
  wet: speckleTexture('#8f8672', '#6f6757', 1),
  snow: speckleTexture('#e6ebf0', '#c9d2da', 1),
};

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ map: GROUND_MAPS.grass, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let pathMaterial = null;

/** Swaps ground/walkway textures when the weather changes (dry, wet, snow-covered). */
function applyGroundStyle(style) {
  ground.material.map = GROUND_MAPS[style] ?? GROUND_MAPS.grass;
  ground.material.needsUpdate = true;
  if (pathMaterial) {
    const map = PATH_MAPS[style] ?? PATH_MAPS.grass;
    map.repeat.copy(PATH_MAPS.grass.repeat);
    pathMaterial.map = map;
    pathMaterial.needsUpdate = true;
  }
}

const weather = new Weather(scene, { sky, sun, hemi, ambient }, applyGroundStyle);

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const SHADOW_TEX = blobTexture();

const player = new PlayerController(camera, renderer.domElement);
const registry = new InstrumentRegistry(scene);
const clock = new THREE.Clock();

let nearest = null;
const sampleFloor = (x, z) => floorHeightAt(registry.instruments, x, z);

function addSceneDressing(instruments) {
  // Gravel walkway running the length of the row, so there's an obvious route to follow.
  const minX = Math.min(...instruments.map((e) => e.group.position.x)) - 8;
  const maxX = Math.max(...instruments.map((e) => e.group.position.x)) + 8;
  for (const map of Object.values(PATH_MAPS)) map.repeat.set((maxX - minX) / 3, 1.2);
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, 3.4),
    new THREE.MeshStandardMaterial({ map: PATH_MAPS.grass, roughness: 1 })
  );
  pathMaterial = path.material;
  path.rotation.x = -Math.PI / 2;
  path.position.set((minX + maxX) / 2, 0.012, 6.5);
  scene.add(path);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: SHADOW_TEX,
    transparent: true,
    depthWrite: false,
  });
  for (const entry of instruments) {
    const [w, d] = entry.def.footprint;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, d * 1.5), shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(entry.group.position.x, 0.02, entry.group.position.z);
    scene.add(blob);
  }
}

function inspectNearest() {
  if (ui.isPanelOpen()) {
    ui.closePanel();
    return;
  }
  if (!nearest) return;
  ui.openPanel(nearest);
  // The panel is unreadable/unclickable while the pointer is captured.
  if (!hasTouch) player.controls.unlock();
}

registry
  .load('./assets/models/manifest.json', ui.setLoadingProgress)
  .then(async (instruments) => {
    addSceneDressing(instruments);
    ui.initProgress(instruments);
    ui.updateProgress(instruments, 0);
    ui.onInteract(inspectNearest);
    ui.onPanelClose(() => {
      if (!hasTouch) player.controls.lock();
    });

    let savedWeather = null;
    try {
      savedWeather = localStorage.getItem(WEATHER_STORAGE_KEY);
    } catch {
      // private mode / blocked storage: just start on the default preset
    }
    if (savedWeather) weather.apply(savedWeather, true);

    ui.initSettings(
      WEATHER_PRESETS,
      weather.currentId,
      (id) => {
        weather.apply(id);
        try {
          localStorage.setItem(WEATHER_STORAGE_KEY, id);
        } catch {
          // non-fatal: the choice just won't persist
        }
      },
      () => {
        // Release the pointer so the picker is clickable on desktop.
        if (!hasTouch) player.controls.unlock();
      }
    );

    // Start on the walkway at the near end of the row, looking down it (+X).
    const startX = Math.min(...instruments.map((e) => e.group.position.x)) - 9;
    player.spawnAt(startX, 6.5, -Math.PI / 2);

    await ui.showStartScreen();
    player.start();
    ui.toast('Find all 8 stations', 'Walk up to one to log it', '#5fb0ff');
  })
  .catch((err) => {
    console.error('failed to load the world', err);
    document.getElementById('loading-hint').textContent = 'failed to load models - check the console';
  });

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;

  player.update(dt, sampleFloor);
  registry.update(player.position);
  weather.update(dt, elapsed, camera.position);
  sky.position.copy(camera.position);

  nearest = registry.findNearest(player.position, LABEL_DIST);
  const dist = nearest ? edgeDistance(nearest, player.position) : Infinity;

  ui.setNearestLabel(nearest, dist);
  ui.setInteractPrompt(Boolean(nearest) && dist < INTERACT_DIST && !ui.isPanelOpen());

  if (nearest && dist < DISCOVER_DIST && registry.discover(nearest)) {
    ui.updateProgress(registry.instruments, registry.foundCount);
    const remaining = registry.instruments.length - registry.foundCount;
    ui.toast(
      `Logged: ${nearest.def.name}`,
      remaining > 0 ? `${remaining} station${remaining > 1 ? 's' : ''} left` : 'Every station logged!',
      nearest.def.accent
    );
    if (remaining === 0) {
      setTimeout(() => ui.toast('Field survey complete', 'Nice walk.', '#6ee7a8'), 2800);
    }
  }

  ui.drawMinimap(registry.instruments, player.position, player.yaw);
  renderer.render(scene, camera);
}

animate();

// Keep the pointer released while reading a panel on desktop.
if (!hasTouch) {
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') ui.closePanel();
  });
}
