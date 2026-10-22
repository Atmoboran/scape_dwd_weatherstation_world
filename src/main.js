import * as THREE from 'three';
import { PlayerController, hasTouch } from './player-controller.js';
import { InstrumentRegistry, edgeDistance } from './instrument-registry.js';
import { floorHeightAt } from './terrain.js';
import { Weather, WEATHER_PRESETS } from './weather.js';
import { theme, applyTheme } from './theme.js';
import * as ui from './ui.js';

const WEATHER_STORAGE_KEY = 'meteo-walk.weather';

// All measured from the edge of a station's footprint, not its centre.
const DISCOVER_DIST = 3; // meters: walking this close marks a station found
const INTERACT_DIST = 6; // meters: close enough to open the info panel
const LABEL_DIST = 26;

const DECAL_SEED = 1337;

applyTheme();
ui.initCopy();

const scene = new THREE.Scene();
// Fog and sky colours are placeholders: Weather overwrites them from the theme on
// construction, before the first frame is drawn.
scene.fog = new THREE.Fog(0xffffff, 45, 190);

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
      top: { value: new THREE.Color(0xffffff) },
      horizon: { value: new THREE.Color(0xffffff) },
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
const hemi = new THREE.HemisphereLight(
  theme.scene.hemisphere.sky,
  theme.scene.hemisphere.ground,
  1.15
);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(30, 45, 18);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// --- procedural speckle texture: gives the ground some grain, no image download ---
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

const GROUND_MAPS = Object.fromEntries(
  Object.entries(theme.scene.groundStyles).map(([style, { base, speck }]) => [
    style,
    speckleTexture(base, speck, 160),
  ])
);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ map: GROUND_MAPS.grass, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

/** Swaps the ground texture when the weather changes (dry, wet, snow-covered). */
function applyGroundStyle(style) {
  ground.material.map = GROUND_MAPS[style] ?? GROUND_MAPS.grass;
  ground.material.needsUpdate = true;
}

const weather = new Weather(scene, { sky, sun, hemi, ambient }, applyGroundStyle);

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, `rgba(0,0,0,${theme.scene.shadowOpacity})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const player = new PlayerController(camera, renderer.domElement);
const registry = new InstrumentRegistry(scene);
const clock = new THREE.Clock();

let nearest = null;
const sampleFloor = (x, z) => floorHeightAt(registry.instruments, x, z);

/** Deterministic RNG, so the scenery is the same on every visit. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Flat colour fields and circles strewn over the grass: the theme's graphic system
 * read from above. Hard-edged, unlit and stacked just above the ground plane.
 */
function addGroundDecals() {
  const { enabled, rectCount, circleCount, palette } = theme.scene.decals;
  if (!enabled) return;

  const rand = seededRandom(DECAL_SEED);
  const pick = () => palette[Math.floor(rand() * palette.length)];
  let layer = 0.004;

  // Keeps decals off the spawn clearing: at eye level a nearby flat field reads as a
  // flood of colour across the whole screen rather than a mark on the ground.
  const place = (mesh, minRadius) => {
    for (let tries = 0; tries < 40; tries++) {
      const x = (rand() - 0.5) * 190;
      const z = (rand() - 0.5) * 190;
      if (Math.hypot(x, z) < minRadius) continue;
      mesh.position.set(x, (layer += 0.002), z);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      return;
    }
  };

  for (let i = 0; i < rectCount; i++) {
    const geometry = new THREE.PlaneGeometry(6 + rand() * 12, 5 + rand() * 10);
    place(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: pick() })), 22);
  }

  for (let i = 0; i < circleCount; i++) {
    const geometry = new THREE.CircleGeometry(2.5 + rand() * 4.5, 40);
    place(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: pick() })), 22);
  }
}

/** A gravel-ish apron and a soft shadow under each station. */
function addStationGrounding(instruments) {
  const apronMat = new THREE.MeshBasicMaterial({ color: theme.scene.apron.color });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
  });

  for (const entry of instruments) {
    const [w, d] = entry.def.footprint;
    const { x, z } = entry.group.position;

    const apron = new THREE.Mesh(
      new THREE.CircleGeometry((Math.max(w, d) / 2) * theme.scene.apron.scale, 56),
      apronMat
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(x, 0.05, z);
    scene.add(apron);

    const blob = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, d * 1.5), shadowMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(x, 0.06, z);
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
    addGroundDecals();
    addStationGrounding(instruments);
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

    // Spawn in the clearing the layout keeps free, facing the nearest station.
    const first = instruments.reduce((a, b) =>
      a.group.position.length() <= b.group.position.length() ? a : b
    );
    player.spawnAt(0, 0, Math.atan2(-first.group.position.x, -first.group.position.z));

    await ui.showStartScreen();
    player.start();
    ui.toast(
      theme.strings.hintTitle(instruments.length),
      theme.strings.hintSub,
      theme.scene.stationPalette[0]
    );
  })
  .catch((err) => {
    console.error('failed to load the world', err);
    ui.setLoadFailed();
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
      theme.strings.foundToast(nearest.def.name),
      remaining > 0 ? theme.strings.remaining(remaining) : theme.strings.allFound,
      nearest.accent
    );
    if (remaining === 0) {
      setTimeout(
        () => ui.toast(theme.strings.completeTitle, theme.strings.completeSub, nearest.accent),
        2800
      );
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
