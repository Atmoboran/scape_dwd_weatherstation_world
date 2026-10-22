#!/usr/bin/env python3
"""Scans assets/models/low + assets/models/high and writes assets/models/manifest.json.

Computes each instrument's bounding box, normalizes scale, and scatters the stations
across the field with a seeded RNG so the layout is reproducible but not a grid or a
row. Positions/rotations/text can be hand-edited afterward without touching code
(see PLAN.md §2.4).

This file holds *content and layout*, not design: station colours come from the active
theme in src/themes/, so swapping the theme restyles the world.
"""
import json
import math
import random
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

LAYOUT_SEED = 7  # change to reshuffle the scatter
FIELD_RADIUS_M = 34.0  # stations are scattered inside this disc
CLEARING_RADIUS_M = 12.0  # kept free in the middle so the player spawns in the open
MIN_GAP_M = 3.5  # free space between two stations' bounding circles

# Exhibit copy. Placeholder texts written from the model names - review against the
# real site documentation. German, per the SCAPE brand language.
INFO = {
    "01_MOHP": {
        "title": "Observatorium Hohenpeißenberg",
        "description": (
            "Ein Bergobservatorium. Der Hohenpeißenberg in Bayern besitzt eine der "
            "längsten ununterbrochenen Wetteraufzeichnungen der Welt – gemessen wird "
            "hier seit 1781. Dadurch ist seine Messreihe ein wichtiger Bezugspunkt für die "
            "Klimaforschung."
        ),
        "measures": ["Temperatur", "Luftfeuchte", "Luftdruck", "Strahlung", "Spurengase"],
    },
    "02_Sturmwarn_Lindau": {
        "title": "Sturmwarnstation Lindau",
        "description": (
            "Eine Sturmwarnleuchte am See. An deutschen Seen steckt die Botschaft im Takt: "
            "40 Blitze pro Minute bedeuten Starkwindwarnung, 90 Blitze pro Minute "
            "Sturmwarnung – vom Boot aus lange zu erkennen, bevor das Wetter da ist."
        ),
        "measures": ["Windgeschwindigkeit", "Windrichtung", "Böen"],
    },
    "04_AMDA": {
        "title": "Automatische Messstation",
        "description": (
            "Eine Station ohne Personal. Die Sensoren sitzen in genormten Höhen an den "
            "Masten, damit die Werte zwischen den Standorten vergleichbar bleiben. Gemeldet "
            "wird selbstständig, Tag und Nacht."
        ),
        "measures": ["Temperatur", "Luftfeuchte", "Wind", "Niederschlag", "Sonnenscheindauer"],
    },
    "05_Meer": {
        "title": "Meeresmessplattform",
        "description": (
            "Eine Messplattform auf See. Geräte über dem Wasser trotzen Salz, Gischt "
            "und ständiger Bewegung – die Technik muss aushalten, was sie misst."
        ),
        "measures": ["Wind", "Lufttemperatur", "Wassertemperatur", "Wellenhöhe"],
    },
    "06_MME": {
        "title": "Messfeld",
        "description": (
            "Ein offenes Messfeld mit vielen Sensoren. Die freie Umgebung ist so wichtig wie "
            "die Geräte selbst: Gebäude, Bäume oder Zäune würden Wind "
            "und Strahlung verfälschen."
        ),
        "measures": ["Temperatur", "Luftfeuchte", "Bodentemperatur", "Strahlung"],
    },
    "07_Airport": {
        "title": "Flughafen-Wetterstation",
        "description": (
            "Wettertechnik für die Luftfahrt. Windmesser stehen nahe den Pisten, ein "
            "Ceilometer misst die Wolkenuntergrenze – für Flugzeuge zählen vor "
            "allem Seitenwind, Sicht und Wolkenhöhe."
        ),
        "measures": ["Wind", "Sichtweite / RVR", "Wolkenuntergrenze", "Luftdruck (QNH)"],
    },
    "08_RADAK": {
        "title": "Radarstandort",
        "description": (
            "Eine Radaranlage. Radar misst nicht an einem einzigen Punkt, sondern tastet die "
            "Luft im Umkreis ab – so entstehen flächendeckende Niederschlagskarten "
            "und Vorhersagen für die nächsten Stunden."
        ),
        "measures": ["Niederschlagsintensität", "Echo-Obergrenze", "Radialgeschwindigkeit"],
    },
    "09_ATSO_Norderney": {
        "title": "Inselstation Norderney",
        "description": (
            "Eine Station auf einer Nordseeinsel. Küsten- und Inselstandorte erfassen den "
            "Übergang von Meer zu Land, wo der Temperaturunterschied zwischen Wasser und "
            "Küste Wind und Nebel antreibt."
        ),
        "measures": ["Wind", "Temperatur", "Luftfeuchte", "Luftdruck"],
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


def scatter(radii, rng):
    """Rejection-samples non-overlapping positions in a disc, leaving the middle clear.

    `radii` are the stations' bounding-circle radii; returns a list of (x, z).
    Largest first, so the tight cases are placed while there's still room.
    """
    order = sorted(range(len(radii)), key=lambda i: -radii[i])
    placed = {}

    for i in order:
        r = radii[i]
        for _ in range(20000):
            # sqrt() keeps the sample uniform over the disc rather than centre-heavy.
            dist = math.sqrt(rng.random()) * (FIELD_RADIUS_M - r)
            angle = rng.random() * math.tau
            x, z = dist * math.cos(angle), dist * math.sin(angle)

            if math.hypot(x, z) < CLEARING_RADIUS_M + r:
                continue
            if any(
                math.hypot(x - px, z - pz) < r + radii[j] + MIN_GAP_M
                for j, (px, pz) in placed.items()
            ):
                continue
            placed[i] = (x, z)
            break
        else:
            raise SystemExit(f"could not place station {i}: field too crowded")

    return [placed[i] for i in range(len(radii))]


def pretty_name(stem: str) -> str:
    # "07_Airport_v51" -> "Airport"
    name = re.sub(r"^\d+_", "", stem)
    name = re.sub(r"_v\d+$", "", name)
    return name.replace("_", " ")


def info_for(stem: str) -> dict:
    return INFO.get(re.sub(r"_v\d+$", "", stem), {})


def main():
    rng = random.Random(LAYOUT_SEED)
    entries = []

    for low_path in sorted(LOW_DIR.glob("*.glb")):
        stem = low_path.stem
        if not (HIGH_DIR / low_path.name).exists():
            raise SystemExit(f"missing high-LOD file for {stem}")

        mesh = trimesh.load(MODELS_DIR / low_path.name, force="mesh")
        bbox_min = mesh.bounds[0].tolist()
        bbox_max = mesh.bounds[1].tolist()
        size = [bbox_max[i] - bbox_min[i] for i in range(3)]
        scale = TARGET_MAX_DIM_M / (max(size) or 1.0)
        entries.append(
            {
                "stem": stem,
                "file": low_path.name,
                "bbox_min": bbox_min,
                "bbox_max": bbox_max,
                "size": size,
                "scale": scale,
                "deck": deck_height(mesh, bbox_min),
                "footprint": [size[0] * scale, size[2] * scale],
            }
        )

    radii = [math.hypot(*e["footprint"]) / 2 for e in entries]
    positions = scatter(radii, rng)

    instruments = []
    for e, (x, z) in zip(entries, positions):
        info = info_for(e["stem"])
        instruments.append(
            {
                "id": e["stem"],
                "name": info.get("title") or pretty_name(e["stem"]),
                "sourceName": pretty_name(e["stem"]),
                "description": info.get("description", ""),
                "measures": info.get("measures", []),
                "low": f"assets/models/low/{e['file']}",
                "high": f"assets/models/high/{e['file']}",
                "position": [round(x, 3), 0, round(z, 3)],
                "rotationY": round(rng.uniform(0, math.tau), 4),
                "scale": round(e["scale"], 6),
                # Recentres the mesh on its own footprint and sits it on the ground,
                # in raw model units (applied inside the scaled group).
                "modelOffset": [
                    round(-(e["bbox_min"][0] + e["bbox_max"][0]) / 2, 6),
                    round(-e["bbox_min"][1], 6),
                    round(-(e["bbox_min"][2] + e["bbox_max"][2]) / 2, 6),
                ],
                "footprint": [round(e["footprint"][0], 3), round(e["footprint"][1], 3)],
                "height": round(e["size"][1] * e["scale"], 3),
                # Top of the base slab, in world meters - the step the player walks up.
                "deckHeight": round(e["deck"] * e["scale"], 3),
            }
        )

    manifest = {
        "note": (
            "Generated by tools/generate_manifest.py. `scale` is a placeholder: the source "
            "STEP files carry no reliable unit metadata, so each model's largest bounding-box "
            f"dimension is normalized to {TARGET_MAX_DIM_M}m. Hand-calibrate against the real "
            "instrument dimensions before treating scale or distances as accurate. The "
            "`description`/`measures` texts are placeholder exhibit copy - review them against "
            "the actual site documentation. Station colours are not here: they come from the "
            "active theme in src/themes/."
        ),
        "instruments": instruments,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {MANIFEST_PATH} with {len(instruments)} instruments")


if __name__ == "__main__":
    main()
