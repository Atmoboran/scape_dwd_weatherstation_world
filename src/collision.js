// Cheap collision: treat each instrument as an axis-aligned box (from its manifest bbox)
// and the player as a point with a radius. Resolves overlap by push-out along the
// shallowest axis, per PLAN.md §3.2 ("bounding box, not true mesh collision").
const PLAYER_RADIUS = 0.4;

export function resolveCollisions(position, instruments) {
  for (const entry of instruments) {
    const c = entry.collider;
    const minX = c.center.x - c.halfExtents.x - PLAYER_RADIUS;
    const maxX = c.center.x + c.halfExtents.x + PLAYER_RADIUS;
    const minZ = c.center.z - c.halfExtents.z - PLAYER_RADIUS;
    const maxZ = c.center.z + c.halfExtents.z + PLAYER_RADIUS;

    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) {
      continue;
    }

    const overlapLeft = position.x - minX;
    const overlapRight = maxX - position.x;
    const overlapBack = position.z - minZ;
    const overlapFront = maxZ - position.z;
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront);

    if (minOverlap === overlapLeft) position.x = minX;
    else if (minOverlap === overlapRight) position.x = maxX;
    else if (minOverlap === overlapBack) position.z = minZ;
    else position.z = maxZ;
  }
}
