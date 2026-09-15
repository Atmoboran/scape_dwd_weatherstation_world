import * as THREE from 'three';
import { loadGlb, disposeObject3D } from './model-loader.js';

const HIGH_LOD_ENTER_DIST = 15; // meters: start loading high-LOD when closer than this
const HIGH_LOD_EXIT_DIST = 20; // meters: dispose high-LOD when farther than this (hysteresis)
const MAX_CONCURRENT_LOADS = 2;

export class InstrumentRegistry {
  constructor(scene) {
    this.scene = scene;
    this.instruments = [];
    this.pendingLoads = 0;
  }

  async load(manifestUrl, onProgress) {
    const res = await fetch(manifestUrl);
    const manifest = await res.json();
    const list = manifest.instruments;
    let loaded = 0;

    for (const def of list) {
      const group = new THREE.Group();
      group.position.set(def.position[0], def.position[1], def.position[2]);
      group.rotation.y = def.rotationY || 0;
      this.scene.add(group);

      // `inner` scales the mesh into world units; `meshAnchor` is its child, so the
      // ground-alignment offset (in raw model units) gets scaled down along with it
      // instead of being applied as a full-size world-space translation.
      const inner = new THREE.Group();
      inner.scale.setScalar(def.scale ?? 1);
      group.add(inner);

      const meshAnchor = new THREE.Group();
      meshAnchor.position.y = def.modelYOffset ?? 0;
      inner.add(meshAnchor);

      const size = def.bbox.size;
      const halfExtents = new THREE.Vector3(
        (size[0] * (def.scale ?? 1)) / 2,
        (size[1] * (def.scale ?? 1)) / 2,
        (size[2] * (def.scale ?? 1)) / 2
      );

      const entry = {
        def,
        group,
        meshAnchor,
        lowMesh: null,
        highMesh: null,
        highLoading: false,
        collider: { center: group.position.clone(), halfExtents },
      };
      this.instruments.push(entry);

      try {
        const lowScene = await loadGlb(def.low);
        entry.lowMesh = lowScene;
        meshAnchor.add(lowScene);
      } catch (err) {
        console.error(`failed to load low-LOD for ${def.id}`, err);
      }

      loaded += 1;
      onProgress?.(loaded, list.length);
    }
  }

  /** Call once per frame with the player's world position. */
  update(playerPos) {
    for (const entry of this.instruments) {
      const dist = playerPos.distanceTo(entry.group.position);

      if (!entry.highMesh && !entry.highLoading && dist < HIGH_LOD_ENTER_DIST) {
        if (this.pendingLoads < MAX_CONCURRENT_LOADS) {
          this._loadHigh(entry);
        }
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
        // Player may have already walked away while this was in flight.
        if (entry.highMesh) {
          disposeObject3D(scene);
          return;
        }
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

  /** Returns the nearest instrument within `maxDist`, or null. */
  findNearest(playerPos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const entry of this.instruments) {
      const d = playerPos.distanceTo(entry.group.position);
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    return best;
  }
}
