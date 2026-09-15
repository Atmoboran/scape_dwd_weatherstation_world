#!/usr/bin/env bash
# Optimizes raw STEP-derived GLBs (assets/models/*.glb) into two LOD tiers:
#   assets/models/low/<name>.glb   - aggressively decimated, Draco-compressed (initial load)
#   assets/models/high/<name>.glb  - full-detail, Draco-compressed only (lazy-loaded on approach)
#
# Requires: npx (Node) with network access to fetch @gltf-transform/cli on first run.
# Source STEPs have no material/texture data (see PLAN.md §7), so no texture steps are run.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="assets/models"
LOW_DIR="assets/models/low"
HIGH_DIR="assets/models/high"
GT="npx -y @gltf-transform/cli@latest"

mkdir -p "$LOW_DIR" "$HIGH_DIR"

for f in "$SRC_DIR"/*.glb; do
  name="$(basename "$f" .glb)"
  echo "== $name =="

  tmp="$(mktemp -d)"

  # High LOD: weld + prune/dedup + draco (lossless geometry, compressed transport)
  $GT weld "$f" "$tmp/high_weld.glb" >/dev/null
  $GT prune "$tmp/high_weld.glb" "$tmp/high_pruned.glb" >/dev/null
  $GT dedup "$tmp/high_pruned.glb" "$tmp/high_dedup.glb" >/dev/null
  $GT draco "$tmp/high_dedup.glb" "$HIGH_DIR/$name.glb" >/dev/null

  # Low LOD: simplify (decimate) first, then the same weld/prune/dedup/draco chain
  $GT simplify "$f" "$tmp/low_simplified.glb" --ratio 0.15 --error 0.01 >/dev/null
  $GT weld "$tmp/low_simplified.glb" "$tmp/low_weld.glb" >/dev/null
  $GT prune "$tmp/low_weld.glb" "$tmp/low_pruned.glb" >/dev/null
  $GT dedup "$tmp/low_pruned.glb" "$tmp/low_dedup.glb" >/dev/null
  $GT draco "$tmp/low_dedup.glb" "$LOW_DIR/$name.glb" >/dev/null

  rm -rf "$tmp"

  orig=$(stat -c%s "$f")
  low=$(stat -c%s "$LOW_DIR/$name.glb")
  high=$(stat -c%s "$HIGH_DIR/$name.glb")
  printf "  orig=%sB  low=%sB  high=%sB\n" "$orig" "$low" "$high"
done

echo "Done. Totals:"
du -sh "$LOW_DIR" "$HIGH_DIR"
