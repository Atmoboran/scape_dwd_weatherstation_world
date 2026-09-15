import * as THREE from 'three';
import { PlayerController } from './player-controller.js';
import { InstrumentRegistry } from './instrument-registry.js';
import { resolveCollisions } from './collision.js';
import { setLoadingProgress, hideLoadingScreen, setLabel } from './ui.js';

const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd6e8);
scene.fog = new THREE.Fog(0xbfd6e8, 20, 90);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Lighting: single directional + hemisphere ambient, no real-time shadows (mobile perf).
const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(15, 25, 10);
scene.add(sun);

// Ground plane: flat textured field, cheap compared to imported geometry.
const groundGeo = new THREE.PlaneGeometry(400, 400);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x7a8f63, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const player = new PlayerController(camera, renderer.domElement);
const registry = new InstrumentRegistry(scene);

registry
  .load('./assets/models/manifest.json', setLoadingProgress)
  .then(() => hideLoadingScreen())
  .catch((err) => {
    console.error('failed to load manifest', err);
    hideLoadingScreen();
  });

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  player.update(dt, (position) => resolveCollisions(position, registry.instruments));
  registry.update(camera.position);

  const nearest = registry.findNearest(camera.position, 6);
  setLabel(nearest?.def.name ?? null);

  renderer.render(scene, camera);
}

animate();
