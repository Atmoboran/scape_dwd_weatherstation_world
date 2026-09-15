import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./assets/vendor/three/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Always loads fresh (no cache): callers that hot-swap LOD tiers dispose the previous
// instance's geometry/materials, so a cached scene graph would go stale on reuse.
export function loadGlb(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

export function disposeObject3D(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const value = mat[key];
          if (value && value.isTexture) value.dispose();
        }
        mat.dispose();
      }
    }
  });
}
