import * as THREE from 'three';
import { loadGlb, disposeObject3D } from './model-loader.js';
import { theme } from './theme.js';

const HIGH_LOD_ENTER_DIST = 18; // meters: start loading high-LOD when closer than this
const HIGH_LOD_EXIT_DIST = 26; // meters: dispose high-LOD when farther than this (hysteresis)
const MAX_CONCURRENT_LOADS = 2;

// Source STEPs carry no materials, so each station is tinted with a colour from the
// active theme to tell them apart, and flat shaded - the meshes have no normals, and
// per-face lighting is the right look for tessellated CAD geometry anyway.
function stationMaterial(accent) {
  const { target, mix } = theme.scene.stationTint;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(accent).lerp(new THREE.Color(target), mix),
    ...theme.scene.stationMaterial,
    flatShading: true,
  });
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

    for (const [index, def] of list.entries()) {
      const palette = theme.scene.stationPalette;
      const accent = palette[index % palette.length];

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

      const entry = {
        def,
        group,
        meshAnchor,
        accent,
        material: stationMaterial(accent),
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

  /** Call once per frame to swap LOD tiers as the player moves. */
  update(playerPos) {
    for (const entry of this.instruments) {
      const dist = playerPos.distanceTo(entry.group.position);

      if (!entry.highMesh && !entry.highLoading && dist < HIGH_LOD_ENTER_DIST) {
        if (this.pendingLoads < MAX_CONCURRENT_LOADS) this._loadHigh(entry);
      } else if (entry.highMesh && dist > HIGH_LOD_EXIT_DIST) {
        this._unloadHigh(entry);
      }
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
