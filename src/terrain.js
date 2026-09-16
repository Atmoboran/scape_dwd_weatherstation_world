// Ground height under the player. Stations are walkable: rather than blocking the
// footprint, each one raises the floor to the top of its base slab (`deckHeight`,
// measured offline by tools/generate_manifest.py) so the player steps up onto the
// platform. No mesh raycasting - that's too expensive on a phone against CAD
// triangle soup, per PLAN.md §3.2.

// The slabs are hexagons inscribed in their rectangular footprint, so the raise is
// tested against an inset rectangle - otherwise the player would float on the corners.
const DECK_INSET = 0.85;

export function floorHeightAt(instruments, x, z) {
  let height = 0;
  for (const entry of instruments) {
    const deck = entry.def.deckHeight;
    if (!deck || deck <= height) continue;
    const { center, halfExtents } = entry.collider;
    if (
      Math.abs(x - center.x) < halfExtents.x * DECK_INSET &&
      Math.abs(z - center.z) < halfExtents.y * DECK_INSET
    ) {
      height = deck;
    }
  }
  return height;
}
