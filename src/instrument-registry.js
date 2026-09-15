import * as THREE from 'three';
import { loadGlb, disposeObject3D } from './model-loader.js';

const HIGH_LOD_ENTER_DIST = 18; // meters: start loading high-LOD when closer than this
const HIGH_LOD_EXIT_DIST = 26; // meters: dispose high-LOD when farther than this (hysteresis)
const MAX_CONCURRENT_LOADS = 2;

// Source STEPs carry no materials, so each station gets a faint accent tint to tell
// them apart, and flat shading - the meshes have no normals, and per-face lighting is
// the right look for tessellated CAD geometry anyway.
function stationMaterial(accent) {
  const color = new THREE.Color(accent).lerp(new THREE.Color(0x9aa3ad), 0.84);
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.45,
    roughness: 0.5,
    flatShading: true,
  });
}

function makeBeacon(accent) {
  const group = new THREE.Group();
  const color = new THREE.Color(accent);

  const beamMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.24, 9, 8, 1, true), beamMat);
  beam.position.y = 4.5;
  group.add(beam);

  const markerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), markerMat);
  marker.position.y = 9;
  group.add(marker);

  group.userData = { beam, marker, beamMat, markerMat };
  return group;
}

function makeNameplate(text, accent) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10, 15, 22, 0.82)';
  g.roundRect(6, 24, 500, 80, 18);
  g.fill();
  g.fillStyle = accent;
  g.fillRect(6, 24, 8, 80);
  g.font = '600 40px system-ui, sans-serif';
  g.fillStyle = '#eaf0f8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 262, 65, 460);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.scale.set(4.6, 1.15, 1);
  return sprite;
}

/** Horizontal distance from a point to the edge of a station's footprint (0 if inside). */
export function edgeDistance(entry, point) {
  const { center, halfExtents } = entry.collider;
  const dx = Math.max(Math.abs(point.x - center.x) - halfExtents.x, 0);
  const dz = Math.max(Math.abs(point.z - center.z) - halfExtents.y, 0);
  return Math.hypot(dx, dz);
}

export class InstrumentRegistry {
  constructor(scene) {
    this.scene = scene;
    this.instruments = [];
    this.pendingLoads = 0;
    this.foundCount = 0;
  }

  async load(manifestUrl, onProgress) {
    const res = await fetch(manifestUrl);
    const manifest = await res.json();
    const list = manifest.instruments;
    let loaded = 0;

    for (const def of list) {
      const group = new THREE.Group();
      group.position.fromArray(def.position);
      group.rotation.y = def.rotationY || 0;
      this.scene.add(group);

      // `inner` scales the model into world units; `meshAnchor` is its child, so the
      // centring/ground offset (in raw model units) is scaled along with the mesh
      // instead of being applied as a full-size world-space translation.
      const inner = new THREE.Group();
      inner.scale.setScalar(def.scale ?? 1);
      group.add(inner);

      const meshAnchor = new THREE.Group();
      meshAnchor.position.fromArray(def.modelOffset ?? [0, 0, 0]);
      inner.add(meshAnchor);

      const beacon = makeBeacon(def.accent);
      beacon.position.y = def.height ?? 4;
      group.add(beacon);

      const nameplate = makeNameplate(def.name, def.accent);
      nameplate.position.set(0, Math.max(def.height ?? 4, 3.5) + 2.6, 0);
      group.add(nameplate);

      const entry = {
        def,
        group,
        meshAnchor,
        beacon,
        nameplate,
        material: stationMaterial(def.accent),
        lowMesh: null,
        highMesh: null,
        highLoading: false,
        discovered: false,
        collider: {
          center: group.position.clone(),
          halfExtents: new THREE.Vector2(def.footprint[0] / 2, def.footprint[1] / 2),
        },
      };
      this.instruments.push(entry);

      try {
        entry.lowMesh = await loadGlb(def.low);
        this._applyMaterial(entry, entry.lowMesh);
        meshAnchor.add(entry.lowMesh);
      } catch (err) {
        console.error(`failed to load low-LOD for ${def.id}`, err);
      }

      loaded += 1;
      onProgress?.(loaded, list.length);
    }
    return this.instruments;
  }

  _applyMaterial(entry, root) {
    root.traverse((node) => {
      if (node.isMesh) node.material = entry.material;
    });
  }

  /** Call once per frame: LOD swapping plus beacon animation. */
  update(playerPos, elapsed) {
    for (const entry of this.instruments) {
      const dist = playerPos.distanceTo(entry.group.position);

      if (!entry.highMesh && !entry.highLoading && dist < HIGH_LOD_ENTER_DIST) {
        if (this.pendingLoads < MAX_CONCURRENT_LOADS) this._loadHigh(entry);
      } else if (entry.highMesh && dist > HIGH_LOD_EXIT_DIST) {
        this._unloadHigh(entry);
      }

      const { marker, beamMat, markerMat } = entry.beacon.userData;
      marker.rotation.y = elapsed * 1.1;
      marker.position.y = 9 + Math.sin(elapsed * 1.6) * 0.3;
      // Found stations keep a dim marker; unfound ones pulse to pull the player over.
      markerMat.opacity = entry.discovered ? 0.22 : 0.65 + Math.sin(elapsed * 2.4) * 0.3;
      beamMat.opacity = entry.discovered ? 0.04 : 0.14;

      // Nameplates: readable up close, faded out before they clutter the horizon.
      entry.nameplate.material.opacity = THREE.MathUtils.clamp((46 - dist) / 14, 0, 1);
    }
  }

  _loadHigh(entry) {
    entry.highLoading = true;
    this.pendingLoads += 1;
    loadGlb(entry.def.high)
      .then((scene) => {
        entry.highLoading = false;
        this.pendingLoads -= 1;
        // The player may have walked away while this was in flight.
        if (entry.highMesh) {
          disposeObject3D(scene);
          return;
        }
        this._applyMaterial(entry, scene);
        entry.highMesh = scene;
        if (entry.lowMesh) entry.meshAnchor.remove(entry.lowMesh);
        entry.meshAnchor.add(scene);
      })
      .catch((err) => {
        entry.highLoading = false;
        this.pendingLoads -= 1;
        console.error(`failed to load high-LOD for ${entry.def.id}`, err);
      });
  }

  _unloadHigh(entry) {
    entry.meshAnchor.remove(entry.highMesh);
    disposeObject3D(entry.highMesh);
    entry.highMesh = null;
    if (entry.lowMesh) entry.meshAnchor.add(entry.lowMesh);
  }

  /**
   * Nearest instrument within `maxDist`, measured to the edge of its footprint - with
   * 8m-wide platforms, distance to the centre would misjudge which one you're standing at.
   */
  findNearest(playerPos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const entry of this.instruments) {
      const d = edgeDistance(entry, playerPos);
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    return best;
  }

  /** Marks a station found. Returns true the first time only. */
  discover(entry) {
    if (entry.discovered) return false;
    entry.discovered = true;
    this.foundCount += 1;
    return true;
  }
}
