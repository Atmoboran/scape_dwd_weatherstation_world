// Cheap collision: each station is an axis-aligned box (its manifest footprint) and the
// player is a point with a radius. Overlap is resolved by pushing out along the
// shallowest axis, per PLAN.md §3.2 ("bounding box, not true mesh collision").
const PLAYER_RADIUS = 0.45;

export function resolveCollisions(instruments, position) {
  for (const entry of instruments) {
    const { center, halfExtents } = entry.collider;
    const minX = center.x - halfExtents.x - PLAYER_RADIUS;
    const maxX = center.x + halfExtents.x + PLAYER_RADIUS;
    const minZ = center.z - halfExtents.y - PLAYER_RADIUS;
    const maxZ = center.z + halfExtents.y + PLAYER_RADIUS;

    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) {
      continue;
    }

    const overlaps = [position.x - minX, maxX - position.x, position.z - minZ, maxZ - position.z];
    const smallest = Math.min(...overlaps);
    if (smallest === overlaps[0]) position.x = minX;
    else if (smallest === overlaps[1]) position.x = maxX;
    else if (smallest === overlaps[2]) position.z = minZ;
    else position.z = maxZ;
  }
}
