#!/usr/bin/env python3
"""Scans assets/models/low + assets/models/high and writes assets/models/manifest.json.

Computes each instrument's bounding box from its low-LOD GLB (via trimesh) and lays
instruments out on a simple grid in the walk-around world. Positions/scale can be
hand-edited afterward without touching any code (see PLAN.md §2.4).
"""
import json
import math
import re
from pathlib import Path

import trimesh

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "assets" / "models"
LOW_DIR = MODELS_DIR / "low"
HIGH_DIR = MODELS_DIR / "high"
MANIFEST_PATH = MODELS_DIR / "manifest.json"

GRID_SPACING = 10.0  # meters between instrument placements
GRID_COLS = 3

# STEP files carry no reliable unit metadata (see PLAN.md §2.4 "Important — units").
# As a placeholder default (until hand-calibrated against real instrument dimensions),
# each model is scaled so its largest bbox dimension maps to this many meters -
# keeps the initial scene visually sane instead of guessing raw units are meters.
TARGET_MAX_DIM_M = 3.0


def pretty_name(stem: str) -> str:
    # "07_Airport_v51" -> "Airport"
    name = re.sub(r"^\d+_", "", stem)
    name = re.sub(r"_v\d+$", "", name)
    return name.replace("_", " ")


def main():
    low_files = sorted(LOW_DIR.glob("*.glb"))
    instruments = []

    for i, low_path in enumerate(low_files):
        stem = low_path.stem
        high_path = HIGH_DIR / low_path.name
        if not high_path.exists():
            raise SystemExit(f"missing high-LOD file for {stem}")

        # Read bbox from the un-compressed source GLB (trimesh can't decode Draco
        # without the optional DracoPy dependency; bbox is unaffected by decimation
        # or Draco compression anyway, so the raw source file is an equivalent source).
        raw_path = MODELS_DIR / low_path.name
        mesh = trimesh.load(raw_path, force="mesh")
        bbox_min = mesh.bounds[0].tolist()
        bbox_max = mesh.bounds[1].tolist()
        size = [bbox_max[j] - bbox_min[j] for j in range(3)]
        max_dim = max(size) or 1.0
        scale = TARGET_MAX_DIM_M / max_dim

        col = i % GRID_COLS
        row = i // GRID_COLS
        x = (col - (GRID_COLS - 1) / 2.0) * GRID_SPACING
        z = -row * GRID_SPACING
        # Sit the model on the ground plane (bbox min-Y at y=0), in raw model units.
        y_offset = -bbox_min[1]

        instruments.append(
            {
                "id": stem,
                "name": pretty_name(stem),
                "low": f"assets/models/low/{low_path.name}",
                "high": f"assets/models/high/{high_path.name}",
                "position": [round(x, 3), 0, round(z, 3)],
                "rotationY": 0,
                "scale": round(scale, 6),
                "modelYOffset": round(y_offset, 6),
                "bbox": {"min": bbox_min, "max": bbox_max, "size": size},
                "units_note": (
                    "STEP source carries no reliable unit metadata; `scale` is a "
                    f"placeholder normalizing the model's largest bbox dimension to "
                    f"{TARGET_MAX_DIM_M}m - hand-calibrate against the real instrument's "
                    "known dimensions before treating this as accurate."
                ),
            }
        )

    manifest = {"instruments": instruments}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {MANIFEST_PATH} with {len(instruments)} instruments")


if __name__ == "__main__":
    main()
