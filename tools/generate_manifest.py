#!/usr/bin/env python3
"""Scans assets/models/low + assets/models/high and writes assets/models/manifest.json.

Computes each instrument's bounding box, normalizes scale, and packs the instruments
into one adjacent row so the world reads as a walkable exhibition rather than a few
specks scattered across a field. Positions/scale/text can be hand-edited afterward
without touching any code (see PLAN.md §2.4).
"""
import json
import re
from pathlib import Path

import trimesh

REPO_ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = REPO_ROOT / "assets" / "models"
LOW_DIR = MODELS_DIR / "low"
HIGH_DIR = MODELS_DIR / "high"
MANIFEST_PATH = MODELS_DIR / "manifest.json"

# STEP files carry no reliable unit metadata (see PLAN.md §2.4 "Important - units").
# As a placeholder default (until hand-calibrated against real instrument dimensions),
# each model is scaled so its largest bbox dimension maps to this many meters.
TARGET_MAX_DIM_M = 8.0

GAP_M = 1.0  # gap between neighbouring station footprints

ACCENTS = [
    "#4fa3ff",
    "#ffb04f",
    "#6ee7a8",
    "#ff7a9c",
    "#c08cff",
    "#ffe066",
    "#57d4e8",
    "#ff9a5a",
]

# Placeholder exhibit texts - these describe the general kind of station shown and are
# meant to be reviewed/replaced by someone with the actual DWD site documentation.
INFO = {
    "01_MOHP": {
        "title": "Hohenpeißenberg Observatory",
        "description": (
            "A mountain observatory site. Hohenpeißenberg in Bavaria holds one of the "
            "longest unbroken weather records in the world, with observations running "
            "since 1781 - which makes its measurement series a reference for studying "
            "long-term climate change."
        ),
        "measures": ["Temperature", "Humidity", "Air pressure", "Radiation", "Trace gases"],
    },
    "02_Sturmwarn_Lindau": {
        "title": "Storm Warning Station Lindau",
        "description": (
            "A lakeside storm-warning beacon. Around German lakes the flash rate is the "
            "message: 40 flashes per minute is a strong-wind warning, 90 flashes per "
            "minute is a storm warning - readable from a boat long before the weather "
            "arrives."
        ),
        "measures": ["Wind speed", "Wind direction", "Gusts"],
    },
    "04_AMDA": {
        "title": "Automatic Measuring Station",
        "description": (
            "An unstaffed automatic station. Sensors sit at standardised heights on the "
            "masts so that readings are comparable between sites, and the station reports "
            "on its own at fixed intervals, day and night, with no observer present."
        ),
        "measures": ["Temperature", "Humidity", "Wind", "Precipitation", "Sunshine duration"],
    },
    "05_Meer": {
        "title": "Marine Measuring Platform",
        "description": (
            "A marine/coastal measurement platform. Instruments over water face salt spray "
            "and constant motion, so the hardware is built to survive the environment it "
            "is measuring."
        ),
        "measures": ["Wind", "Air temperature", "Water temperature", "Wave height"],
    },
    "06_MME": {
        "title": "Measurement Field",
        "description": (
            "An open measurement field carrying an array of sensors. Keeping the surroundings "
            "clear matters as much as the instruments: obstacles, buildings and trees would "
            "distort wind and radiation readings."
        ),
        "measures": ["Temperature", "Humidity", "Soil temperature", "Radiation"],
    },
    "07_Airport": {
        "title": "Airport Weather Station",
        "description": (
            "Aviation weather instrumentation. Anemometers sit near the runway thresholds and "
            "a ceilometer measures cloud base, because for aviation the decisive numbers are "
            "crosswind, visibility and cloud height."
        ),
        "measures": ["Wind", "Visibility / RVR", "Cloud base", "Air pressure (QNH)"],
    },
    "08_RADAK": {
        "title": "Radar Site",
        "description": (
            "A radar installation. Radar does not sample a single point - it scans the "
            "surrounding volume of atmosphere, which is what makes area-wide precipitation "
            "maps and nowcasting possible."
        ),
        "measures": ["Precipitation intensity", "Echo top height", "Radial velocity"],
    },
    "09_ATSO_Norderney": {
        "title": "Norderney Island Station",
        "description": (
            "A North Sea island station. Coastal and island sites cover the sea-to-land "
            "transition, where the temperature contrast between water and land drives local "
            "wind and fog."
        ),
        "measures": ["Wind", "Temperature", "Humidity", "Air pressure"],
    },
}


def deck_height(mesh, bbox_min) -> float:
    """Height of the station's base platform above the model's own bottom, in raw units.

    Every station sits on one big flat slab, so the upward-facing surface with the
    largest total area is that deck. The runtime uses this to let the player step up
    onto the platform without raycasting CAD triangle soup on a phone.
    """
    normals = mesh.face_normals
    up = normals[:, 1] > 0.95
    if not up.any():
        return 0.0

    areas = mesh.area_faces[up]
    heights = mesh.vertices[mesh.faces[up]][:, :, 1].mean(axis=1)

    # Bin to 1/500th of the model's height so one slab's triangles land together.
    span = max(mesh.bounds[1][1] - bbox_min[1], 1e-6)
    bin_size = span / 500
    totals = {}
    for h, a in zip(heights, areas):
        key = round(h / bin_size)
        totals[key] = totals.get(key, 0.0) + a

    best = max(totals, key=totals.get)
    return max((best * bin_size) - bbox_min[1], 0.0)


def pretty_name(stem: str) -> str:
    # "07_Airport_v51" -> "Airport"
    name = re.sub(r"^\d+_", "", stem)
    name = re.sub(r"_v\d+$", "", name)
    return name.replace("_", " ")


def info_for(stem: str) -> dict:
    key = re.sub(r"_v\d+$", "", stem)
    return INFO.get(key, {})


def main():
    low_files = sorted(LOW_DIR.glob("*.glb"))
    entries = []

    for low_path in low_files:
        stem = low_path.stem
        if not (HIGH_DIR / low_path.name).exists():
            raise SystemExit(f"missing high-LOD file for {stem}")

        mesh = trimesh.load(MODELS_DIR / low_path.name, force="mesh")
        bbox_min = mesh.bounds[0].tolist()
        bbox_max = mesh.bounds[1].tolist()
        size = [bbox_max[i] - bbox_min[i] for i in range(3)]
        scale = TARGET_MAX_DIM_M / (max(size) or 1.0)
        deck = deck_height(mesh, bbox_min)
        entries.append((stem, low_path.name, bbox_min, bbox_max, size, scale, deck))

    # Pack the stations into one row along X, footprints adjacent with a fixed gap.
    total_width = sum(e[4][0] * e[5] for e in entries) + GAP_M * (len(entries) - 1)
    cursor = -total_width / 2

    instruments = []
    for i, (stem, filename, bbox_min, bbox_max, size, scale, deck) in enumerate(entries):
        footprint = [size[0] * scale, size[2] * scale]
        x = cursor + footprint[0] / 2
        cursor += footprint[0] + GAP_M

        info = info_for(stem)
        instruments.append(
            {
                "id": stem,
                "name": info.get("title") or pretty_name(stem),
                "sourceName": pretty_name(stem),
                "description": info.get("description", ""),
                "measures": info.get("measures", []),
                "accent": ACCENTS[i % len(ACCENTS)],
                "low": f"assets/models/low/{filename}",
                "high": f"assets/models/high/{filename}",
                "position": [round(x, 3), 0, 0],
                "rotationY": 0,
                "scale": round(scale, 6),
                # Recentres the mesh on its own footprint and sits it on the ground,
                # in raw model units (applied inside the scaled group).
                "modelOffset": [
                    round(-(bbox_min[0] + bbox_max[0]) / 2, 6),
                    round(-bbox_min[1], 6),
                    round(-(bbox_min[2] + bbox_max[2]) / 2, 6),
                ],
                "footprint": [round(footprint[0], 3), round(footprint[1], 3)],
                "height": round(size[1] * scale, 3),
                # Top of the base slab, in world meters - the step the player walks up.
                "deckHeight": round(deck * scale, 3),
            }
        )

    manifest = {
        "note": (
            "Generated by tools/generate_manifest.py. `scale` is a placeholder: the source "
            "STEP files carry no reliable unit metadata, so each model's largest bounding-box "
            f"dimension is normalized to {TARGET_MAX_DIM_M}m. Hand-calibrate against the real "
            "instrument dimensions before treating scale or distances as accurate. The "
            "`description`/`measures` texts are placeholder exhibit copy - review them against "
            "the actual site documentation."
        ),
        "instruments": instruments,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {MANIFEST_PATH} with {len(instruments)} instruments")


if __name__ == "__main__":
    main()
