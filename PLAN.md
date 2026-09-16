# Plan: "Meteo Instrument Walk" — a browser-based walk-around viewer for STEP-derived 3D models

## Status (2026-09-15, updated)

- STEP → GLB conversion pipeline (§0) validated and run against all 9 source files.
- 8 of 9 instruments successfully converted and pushed to `assets/models/` in this repo:
  `01_MOHP_v9.glb`, `02_Sturmwarn_Lindau_v17.glb`, `04_AMDA_v38.glb`, `05_Meer_v4.glb`,
  `06_MME_v9.glb`, `07_Airport_v51.glb`, `08_RADAK_v13.glb`, `09_ATSO_Norderney_v28.glb`.
- `03 Windprofiler_Dio v24.step` (238MB, ~4.4M STEP entities — far larger than the others) is
  **still skipped**. It will need its own conversion pass later, likely with much coarser
  tessellation deflection and/or more wall-clock time/compute, given its size.
- **GLB optimization pipeline (§2.2/§2.3) implemented and run**: `tools/optimize_glb.sh` runs
  `gltf-transform` (weld/prune/dedup/draco, plus `simplify --ratio 0.15` for the low tier; no
  texture steps since no textures survived) and produced two LOD tiers, committed to
  `assets/models/low/` (1.7MB total) and `assets/models/high/` (1.9MB total) — the original
  36MB of raw GLBs are dramatically under the ~50MB total-transfer target even before any
  lazy-loading kicks in.
- **`tools/generate_manifest.py` implemented**: computes each instrument's bbox from the raw GLB,
  normalizes `scale` so each model's largest bbox dimension maps to a placeholder 3m (source STEPs
  carry no reliable unit metadata — see the `units_note` in `manifest.json`, hand-calibration is
  still a TODO), lays instruments out on a grid, and writes `assets/models/manifest.json`.
- **Runtime app implemented** (§4): vanilla Three.js, no build step, ES modules via an import map
  pointing at a self-hosted `assets/vendor/three/` (build + GLTFLoader/DRACOLoader/
  PointerLockControls/BufferGeometryUtils + the Draco decoder WASM — no CDN dependency, per §7).
  Ground plane, hemisphere+directional lighting, fog for pop-in masking. Desktop controls
  (`PointerLockControls` + WASD) and mobile controls (custom touch joystick + drag-to-look, no
  external library) both implemented in `src/player-controller.js`. Two-tier LOD + lazy
  loading/disposal in `src/instrument-registry.js` (load low-LOD for every instrument up front,
  swap in high-LOD within 15m, dispose it again past 20m, cap at 2 concurrent in-flight loads).
  Ground/step height in `src/terrain.js`. Loading screen + proximity name label in
  `src/ui.js`. Verified end-to-end with headless Chromium (desktop + mobile-emulated): scene
  renders, WASD/joystick movement, collision, proximity label, and high-LOD hot-swap all confirmed
  working, zero console errors.
- **API note for future runs:** the installed `cadquery-ocp` 8.0.1 exposes face-casting as
  `TopoDS.Face(shape)`, not `TopoDS.Face_s(shape)` as originally written below — the code sample in
  §0 has been corrected to match.
- **Game/UX pass (§3.4 polish, done):** the scene is now laid out as one packed row of
  adjacent stations along a gravel walkway (previously a wide grid that read as specks on
  a field), the player spawns at the near end looking down the row, and the runtime gained
  a proper game layer: a **visible** on-screen joystick + drag-to-look + sprint toggle on
  touch (the previous invisible touch zones were the single worst usability bug - on a phone
  there was nothing on screen to tell you how to move), a start screen that lists the right
  controls per device, a "stations found" counter with the §3.4 find-all-N mechanic,
  a rotating minimap, per-station accent colours/beacons/3D nameplates for wayfinding,
  proximity info cards with description + measured quantities, head-bob, blob shadows,
  a gradient sky and a procedural ground. Proximity is measured to the footprint edge
  rather than the centre, since the platforms are ~8m wide.
- **Weather + walkable platforms (done, later pass):** `src/weather.js` adds six switchable
  presets (clear, overcast, rain, thunder, snow, fog) driving sky gradient, fog distance,
  sun/hemisphere/ambient light, ground and walkway textures (dry/wet/snow) and GPU-cheap
  `THREE.Points` precipitation that follows the player; thunder adds lightning flashes.
  Transitions are eased, and the choice persists in `localStorage`. Picked from an in-world
  settings button (or `C` on desktop, since a locked pointer makes the button unclickable).
  Stations are now **walkable**: instead of blocking the footprint, `src/terrain.js` raises
  the player onto each station's base slab, whose height is measured offline by
  `deck_height()` in the manifest generator (largest upward-facing surface area) so the
  runtime never raycasts CAD triangle soup on a phone. The 3D nameplates and beacon light
  columns were removed as visual clutter at the user's request.
- **Still open:** instrument #3 (Windprofiler) conversion; hand-calibrating per-instrument `scale`
  against real dimensions; actual GitHub Pages hosting switch-on (Settings → Pages); real-device
  (not just emulated) mobile testing; instrument info panels beyond the name label; optional CI
  size-guard workflow.

**Reference project:** /hpc/uhome/bfrank/uwork/apps_scape/modelgrid_AR (flat repo of pre-converted `.glb`/`.usdz` pairs
next to a single `index.html`, using `<model-viewer>` for AR quick-look). We are reusing the "flat,
static, pre-converted assets" philosophy, but swapping AR quick-look for a first-person walk-around
scene built with Three.js, since the goal is "walk around", not "place on my table".

**Goal:** A first-person, walk-around 3D scene, hosted for free on GitHub Pages, that loads a set of
meteorological-instrument models (originally CAD `.step` files, ~500MB total) and runs smoothly in a
normal smartphone browser (Safari iOS / Chrome Android).

**Hard constraint:** 500MB of source STEP files cannot be shipped to a phone as-is. The entire plan
hinges on an offline conversion + compression pipeline that gets this down to something a phone can
download and render (target: well under 50MB *total* transferred for an initial scene, more if the
player explicitly walks further and triggers lazy-loading of more instruments).

---

## 0. STEP → GLB conversion method (validated in this session, cheapest known path)

here are the .step files: /hpc/uhome/bfrank/uwork/apps_scape/dwd_weatherstation_world/drive-download-20260915T140403Z-1-001.zip
push the newly created .glb files into the git repo as well!

This is the exact toolchain and code pattern already tested and working in this conversation. It's the
cheapest viable approach found so far — free, open-source, no commercial API, no full CAD application
required — and should be the default for `tools/step_to_glb.py` in §3.1 unless a lighter alternative is
found and validated (see §"Lighter alternatives" at the end of this section).

### Install
```bash
# Skip the `cadquery` high-level package if possible — it pulls in VTK (~640MB installed,
# unused for this pipeline) plus casadi/numba/etc. `cadquery-ocp` alone avoids all of that.
pip install cadquery-ocp trimesh --break-system-packages
```
`cadquery-ocp` (import name `OCP`) is the Python binding to **OpenCASCADE Technology (OCCT)** — the
open-source CAD kernel also used by FreeCAD. `trimesh` is only used at the very end, purely to package
triangles into a valid `.glb` container (buffers/accessors/scene graph) — it does no geometry work here.

Installed footprint: OCP alone ≈166MB; if `cadquery` is also installed it drags in VTK (≈640MB) as an
unused dependency — worth avoiding for a leaner CI/offline-pipeline environment.

### Pipeline
```
.step (text, exact B-rep surfaces)
   │  STEPControl_Reader.ReadFile() + TransferRoots() + OneShape()
   ▼
TopoDS_Shape (in-memory exact CAD geometry)
   │  BRepMesh_IncrementalMesh(shape, linear_deflection, False, angular_deflection, True)
   ▼
per-face triangulations (stored on each TopoDS_Face after meshing)
   │  walk faces via TopExp_Explorer(shape, TopAbs_FACE); for each face:
   │    - BRep_Tool.Triangulation_s(face, loc) → local verts + triangle indices
   │    - apply loc.Transformation() to get verts into global coordinates
   │    - check face.Orientation() (REVERSED) and flip triangle winding if needed,
   │      so normals come out consistently correct
   ▼
flat global vertex/triangle arrays (numpy)
   │  trimesh.Trimesh(vertices=..., faces=..., process=False) → .export("out.glb")
   ▼
.glb (binary glTF mesh)
```

### Minimal working code
```python
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
import numpy as np, trimesh

reader = STEPControl_Reader()
reader.ReadFile("input.step")
reader.TransferRoots()
shape = reader.OneShape()

# Tessellation quality knobs — tune per-instrument (see §3.1):
# smaller values = finer/heavier mesh, larger = coarser/lighter.
mesh = BRepMesh_IncrementalMesh(shape, 0.5, False, 0.3, True)
mesh.Perform()

all_verts, all_faces, offset = [], [], 0
exp = TopExp_Explorer(shape, TopAbs_FACE)
while exp.More():
    face = TopoDS.Face(exp.Current())
    loc = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face, loc)
    if tri is not None:
        trsf = loc.Transformation()
        verts = np.array([tuple(tri.Node(i).Transformed(trsf).Coord())
                           for i in range(1, tri.NbNodes() + 1)])
        reversed_face = face.Orientation().name == "REVERSED"
        tris = []
        for i in range(1, tri.NbTriangles() + 1):
            i1, i2, i3 = tri.Triangle(i).Value(1), tri.Triangle(i).Value(2), tri.Triangle(i).Value(3)
            if reversed_face:
                i1, i2, i3 = i1, i3, i2
            tris.append((i1 - 1 + offset, i2 - 1 + offset, i3 - 1 + offset))
        all_verts.append(verts)
        all_faces.append(np.array(tris))
        offset += tri.NbNodes()
    exp.Next()

m = trimesh.Trimesh(vertices=np.vstack(all_verts), faces=np.vstack(all_faces), process=False)
m.fix_normals()
m.export("output.glb")
```

### Validated performance (this session's test file)
- Input: 6.5MB STEP (Autodesk-originated, `AUTOMOTIVE_DESIGN` schema, single assembly)
- Read + mesh + extract + export: **~5 seconds total**
- Output: 2.8MB GLB, 5,224 source faces → 110,673 vertices / 120,534 triangles
- No color/material data survived (source STEP had none embedded) — expect the same for the
  meteo-instrument files unless their source STEPs explicitly carry appearance/color data.

### Lighter alternatives (not yet validated, worth trying if install footprint matters)
- **`cadquery-ocp` without `cadquery`** — as noted above, avoids the VTK dependency entirely; this is
  already the recommended install above, just flagging it as the known lever if size still matters.
- **FreeCAD CLI (`freecadcmd`)** — also OCCT-based; scriptable, but a full desktop-app install is
  arguably heavier to set up in CI than the Python wheel.
- **OpenCASCADE's own `DRAWEXE` tool** — lightest possible option (no Python binding overhead), but
  requires Tcl scripting instead of Python.
- Commercial STEP-conversion APIs exist but add cost and an external dependency for no clear benefit
  over the free local pipeline above, given it already works.

---

## 1. Problem framing / non-negotiables

1. **STEP is not a runtime format.** It must be converted to a mesh (GLB) *once, offline, ahead of
   time* (like we did earlier in this conversation with OpenCASCADE/OCP). The browser must never see
   `.step` files.
2. **500MB raw → must shrink drastically.** STEP B-rep geometry tessellated at engineering precision
   is enormously wasteful for a walk-around game (nobody needs sub-millimeter curvature on a
   thermometer housing viewed from 2 meters away). Two levers, both required:
   - **Coarser tessellation** at conversion time (linear/angular deflection tuned per part size).
   - **GLB post-processing compression**: Draco or Meshopt geometry compression + KTX2/Basis texture
     compression via `gltf-transform`. This alone commonly yields 5–20x size reduction on CAD-derived
     meshes with no visible quality loss at walking distance.
3. **GitHub Pages constraints to respect:**
   - Free, static-only hosting (no server-side code, no database).
   - Soft repo-size guidance ~1GB / recommended-not-enforced; individual file limit 100MB (files over
     that are rejected by git unless using Git LFS, which itself has its own free-tier bandwidth cap).
     → **Design decision: no single GLB may exceed ~25–40MB, and we should target well under that.**
   - No custom server headers by default → rely on standard browser caching + `Cache-Control` via
     Pages' defaults, and lean on compression instead of clever server tricks.
4. **"Normal smartphones" means mid-range hardware.** Assume: limited VRAM, single-threaded JS
   bottlenecks, thermal throttling. Design for **level-of-detail (LOD) and lazy loading**, not "load
   everything at scene start."

---

## 2. High-level architecture

```
repo/
├── index.html                 # entry point, loads app.js
├── src/
│   ├── main.js                 # Three.js scene bootstrap, render loop
│   ├── player-controller.js    # first-person movement + mobile touch controls
│   ├── model-loader.js         # GLTFLoader + Draco/Meshopt decoder setup, lazy loading
│   ├── instrument-registry.js  # manifest of instruments: name, glb path, position, scale, LOD tiers
│   ├── collision.js            # simple capsule-vs-mesh or bounding-box collision
│   └── ui.js                   # loading screen, joystick overlay, instrument info popup
├── assets/
│   ├── models/
│   │   ├── manifest.json       # generated: {id, file, lod: [low, med, high], bbox, scale, units}
│   │   ├── low/*.glb            # decimated + draco-compressed, used at distance / initial load
│   │   ├── high/*.glb           # fuller detail, lazy-loaded when player is near
│   ├── textures/                # ktx2 basis-compressed textures if any color/material data exists
│   └── env/                     # ground plane texture, skybox, minimal lighting IBL
├── tools/                       # NOT shipped to Pages — offline conversion pipeline
│   ├── step_to_glb.py           # OCP-based conversion (from this conversation)
│   ├── optimize_glb.sh          # gltf-transform pipeline: draco/meshopt + ktx2 + prune + dedup
│   └── generate_manifest.py     # scans assets/models, writes manifest.json with bbox/scale/LOD info
├── .github/workflows/
│   └── pages.yml                # optional: CI that validates asset sizes before deploy
└── PLAN.md / README.md
```

Key idea: **the STEP→GLB conversion and the GLB optimization happen once, locally or in CI, and only
the optimized GLBs + a JSON manifest are committed / deployed.** The 500MB of STEP files themselves
live outside the deployed site (e.g., a separate `raw-assets` branch, Git LFS, or just kept locally /
in cloud storage — never pushed to the `gh-pages`-serving path).

---

## 3. Offline conversion pipeline (run locally or in CI, not in the browser)

### 2.1 STEP → GLB (reuse this session's approach)
- Use `cadquery-ocp` (OpenCASCADE Python bindings) exactly as demonstrated:
  `STEPControl_Reader` → `BRepMesh_IncrementalMesh` → walk `TopExp_Explorer(shape, TopAbs_FACE)` →
  extract triangulation per face → assemble into a single mesh → export via `trimesh`.
- **Per-instrument tessellation tuning:** small/detailed instruments (sensors, probes) can afford
  finer deflection; large housings/masts should use coarser deflection. Parameterize
  `BRepMesh_IncrementalMesh(shape, linear_deflection, False, angular_deflection, True)` per file
  rather than one global setting.
- Preserve **assembly/part names** if present in the STEP (`FILE_SCHEMA`/product structure) so each
  instrument can later be split into sub-meshes for labeling / interactivity (e.g., "click the
  anemometer cups to see a label"). This is optional polish, not required for v1.
- Output: one raw `.glb` per instrument into a scratch folder (not committed).

### 2.2 GLB optimization (the step that actually solves the 500MB problem)
Use **`gltf-transform`** (Node CLI, `@gltf-transform/cli`) as the workhorse:
```
gltf-transform simplify   in.glb tmp1.glb --ratio 0.15 --error 0.001   # mesh decimation
gltf-transform weld        tmp1.glb tmp2.glb                            # merge duplicate verts
gltf-transform draco       tmp2.glb tmp3.glb                            # geometry compression
gltf-transform resize      tmp3.glb tmp4.glb --width 1024 --height 1024 # cap texture size (if any)
gltf-transform uastc       tmp4.glb out.glb                             # KTX2/Basis texture compression
```
Also run `gltf-transform prune` and `gltf-transform dedup` to strip unused nodes/materials that
sometimes leak in from STEP assembly structure (empty groups, duplicate materials per face, etc. —
CAD exports are notoriously messy here).

Expect **CAD tessellation → decimation + Draco** to realistically take the ~500MB source down to
**15–40MB total** for a "low" LOD tier across all instruments, possibly less since much of the STEP
bulk is precision curve data that's overkill for walking-distance viewing. This must be measured, not
assumed — see Milestone 2 below for a go/no-go checkpoint.

### 2.3 Two-tier LOD (recommended, not optional at this scale)
- **Low-LOD**: aggressively decimated (large `--ratio` reduction), no or tiny textures. Loaded
  up-front for every instrument in the world so the scene is immediately walkable.
- **High-LOD**: fuller detail. Lazy-loaded only when the player's distance to an instrument drops
  below a threshold (e.g., 15m), then hot-swapped in. Unloaded (disposed) again if the player walks
  away, to keep GPU memory bounded on weaker phones.
- This mirrors standard game-engine practice and is the single highest-leverage decision for hitting
  "runs on a normal smartphone."

### 2.4 Manifest generation
`generate_manifest.py` scans the optimized output and writes `manifest.json`:
```json
{
  "instruments": [
    {
      "id": "anemometer_01",
      "name": "Cup Anemometer",
      "low": "assets/models/low/anemometer_01.glb",
      "high": "assets/models/high/anemometer_01.glb",
      "position": [10, 0, -5],
      "rotationY": 0,
      "scale": 1.0,
      "units_note": "verify original STEP units (mm vs m) before setting scale"
    }
  ]
}
```
This decouples "where things are placed in the walk-around world" from the raw geometry, and lets
non-technical edits (repositioning instruments) happen without touching code.

**Important — units:** as seen with the airport STEP file, STEP files often carry no explicit unit
metadata in a way that's trivially recoverable, and Autodesk-originated files can be mm or cm or m
depending on export settings. Each instrument's real-world scale must be sanity-checked by hand
(compare bounding box to the instrument's known real dimensions) and encoded as a `scale` factor in
the manifest — do not assume they're consistent across files from "different meteorological
instruments," since they may come from different original CAD tools/users.

---

## 4. Runtime app (what actually ships to the browser)

### 3.1 Rendering
- **Three.js**, vanilla (no React/build-step needed — keeps this deployable as flat static files on
  Pages with zero build pipeline, matching the reference repo's simplicity). A bundler (Vite) is
  optional polish for dev ergonomics but should output to static files Pages can serve directly.
- `GLTFLoader` + `DRACOLoader` + `KTX2Loader` (with the Basis transcoder WASM, also served as a static
  asset) to load the optimized GLBs.
- Simple lighting: one directional light + ambient/hemisphere light. Avoid real-time shadows on
  mobile (huge perf cost) — bake a soft ground shadow blob or skip shadows entirely for v1.
- Ground plane: a large flat textured plane (a "meteo field" — grass/gravel/tarmac texture), not
  imported geometry, to keep the base scene cheap.
- Fog (`THREE.Fog`) to cheaply hide draw-distance pop-in and mask lazy-loading of high-LOD models.

### 3.2 Movement / controls
- **Desktop:** WASD + mouse-look via `PointerLockControls` (as discussed earlier).
- **Mobile (the actual target per "normal smartphones"):** no pointer lock on touch devices —
  implement a **virtual joystick** (left thumb, movement) + **drag-to-look** (right side of screen,
  camera rotation), the standard mobile-FPS control scheme. A lightweight library
  (`nipplejs`) or a ~100-line custom implementation both work; keep it dependency-light.
- **Collision:** start simple — treat each instrument's bounding box (from the manifest) as a
  cylinder/box obstacle for the player capsule, rather than true mesh collision (which is expensive on
  mobile). This is enough to stop players walking through instruments and is far cheaper than
  raycasting against full CAD triangle soup.
- Player capsule with basic gravity/ground clamping (flat ground, so this can be trivial — just lock Y
  to ground height, no jumping needed for v1).

### 3.3 Lazy loading / streaming (core to the 500MB problem)
- On load: fetch `manifest.json`, instantiate **placeholder markers or low-LOD instances** for every
  instrument immediately (cheap — this is the "world is walkable right away" tier).
- Every N frames, check player distance to each instrument; when crossing the near-threshold, kick off
  an async `GLTFLoader.load()` for that instrument's high-LOD GLB and swap it in when ready (with a
  quick fade/pop, no need for elaborate crossfading in v1).
- When crossing back out of a further threshold, dispose the high-LOD mesh/geometry/textures
  (`geometry.dispose()`, `material.dispose()`, texture disposal) to free GPU memory — mobile Safari in
  particular has tight WebGL memory ceilings and will silently crash the tab if this is skipped.
- Cap concurrent in-flight loads (e.g., max 2 at once) to avoid saturating a weak mobile connection.

### 3.4 UI
- Minimal loading screen with a progress bar (sum of manifest low-LOD byte sizes vs. bytes loaded).
- On approach, a small floating label / info panel with the instrument's name (and optionally a short
  description — nice hook for an educational "meteo instrument museum" framing).
- No inventory/game mechanics needed for v1 — this is an exploration/viewer experience, not a game
  with objectives, unless you want to scope that in later (e.g., a simple "find all N instruments"
  counter is a cheap, appealing addition once the core walk-around works).

---

## 5. Hosting on GitHub Pages

- Standard `gh-pages` branch or `Settings → Pages → Deploy from branch (main /docs)` — no server code,
  so this is a direct fit.
- **Repo hygiene given the 500MB source:**
  - Source `.step` files: **do not commit to the repo Pages serves from.** Options, in order of
    preference: (a) keep them entirely outside git (local disk / cloud drive, only the conversion
    pipeline references them), (b) a separate private repo or a non-Pages branch if version history on
    the raw CAD is wanted, (c) Git LFS if you specifically need them versioned alongside the code —
    but note LFS has its own free-tier bandwidth/storage caps and is unrelated to what Pages serves.
  - Only the **optimized GLBs + manifest + app code** go into the branch Pages deploys, keeping the
    live site's payload aligned with the "phone-friendly" target (tens of MB, not 500MB).
- Optional CI (`pages.yml` GitHub Action): on push, run a size-check script that fails the build if
  `assets/models/**` exceeds a set budget (e.g., 60MB total) — cheap guardrail against someone
  accidentally committing an unoptimized GLB later.
- HTTPS + CDN caching are automatic with Pages, which helps repeat visits load fast.

---

## 6. Suggested build order (milestones for the Claude Code agent)

1. **Pipeline proof-of-concept:** Take 2–3 representative STEP files (pick a small simple one and a
   large complex one from the 500MB set). Run STEP→GLB, then the gltf-transform optimization chain.
   Measure actual before/after sizes. **This determines whether the size targets in this plan are
   realistic for your specific files** — CAD models vary a lot in how compressible they are.
2. **Static scene skeleton:** Three.js scene with ground plane, lighting, and one optimized GLB placed
   in it, viewable on desktop.
3. **Mobile controls:** joystick + drag-look, tested on an actual phone (or Chrome device emulation as
   a first pass, but real-device testing matters a lot here for feel/perf).
4. **Batch-convert all instruments**, generate manifest, place them in the world (rough grid layout is
   fine initially — refine positions manually afterward by editing manifest.json).
5. **LOD + lazy-loading + disposal**, tested with the full instrument set to confirm memory stays
   bounded during a long walk (watch for a slow memory creep = a disposal bug).
6. **Collision + polish:** bounding-box collision, loading screen, instrument info labels.
7. **Deploy to GitHub Pages**, test on multiple real phones (iOS Safari and Android Chrome behave
   differently enough with WebGL/texture formats that both should be checked before calling it done).

---

## 7. Key risks / things to watch

- **Texture/material data may not survive STEP at all** — as seen with the airport file, STEP
  geometry often carries no color/appearance info. If these instruments need to look distinguishable
  from each other, budget time for hand-assigning simple materials/colors per instrument rather than
  expecting them to come through the conversion.
- **iOS Safari WebGL memory ceiling** is the most common real-world failure mode for "worked on
  desktop, crashes on phone" — the LOD/disposal discipline in §4.3 is not optional polish, it's load-
  bearing for the "normal smartphones" requirement.
- **Units inconsistency across source files** (different CAD authors/tools) — verify per-instrument,
  don't assume.
- **Draco/Meshopt decoder WASM files** must be self-hosted as static assets (not loaded from a CDN
  that could change/break), consistent with a dependency-light, long-term-stable Pages deployment.


commit and push to main of https://github.com/Atmoboran/scape_dwd_weatherstation_world.git
also push the plan.md into the repo