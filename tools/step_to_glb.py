#!/usr/bin/env python3
"""Convert .step files to .glb via OpenCASCADE (OCP) tessellation + trimesh export."""
import sys
import time
from pathlib import Path

from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS
import numpy as np
import trimesh


def convert(step_path: Path, glb_path: Path, linear_deflection: float, angular_deflection: float):
    t0 = time.time()
    reader = STEPControl_Reader()
    status = reader.ReadFile(str(step_path))
    if status != 1:  # IFSelect_RetDone
        raise RuntimeError(f"Failed to read {step_path} (status={status})")
    reader.TransferRoots()
    shape = reader.OneShape()

    mesh = BRepMesh_IncrementalMesh(shape, linear_deflection, False, angular_deflection, True)
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

    if not all_verts:
        raise RuntimeError(f"No triangulated faces found in {step_path}")

    m = trimesh.Trimesh(vertices=np.vstack(all_verts), faces=np.vstack(all_faces), process=False)
    m.fix_normals()
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    m.export(str(glb_path))

    dt = time.time() - t0
    in_mb = step_path.stat().st_size / 1e6
    out_mb = glb_path.stat().st_size / 1e6
    print(f"{step_path.name}: {in_mb:.1f}MB -> {out_mb:.1f}MB, "
          f"{len(m.vertices)} verts / {len(m.faces)} tris, {dt:.1f}s "
          f"(deflection lin={linear_deflection} ang={angular_deflection})")


def deflection_for_size(size_bytes: int):
    """Coarser tessellation for larger/heavier source files."""
    mb = size_bytes / 1e6
    if mb < 5:
        return 0.2, 0.25
    if mb < 20:
        return 0.4, 0.3
    if mb < 60:
        return 0.8, 0.35
    return 1.5, 0.4


def main():
    src_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    step_files = sorted(src_dir.glob("*.step"))
    if not step_files:
        print(f"No .step files found in {src_dir}")
        return
    for step_path in step_files:
        stem = step_path.stem.strip()
        safe_name = stem.replace(" ", "_")
        glb_path = out_dir / f"{safe_name}.glb"
        lin, ang = deflection_for_size(step_path.stat().st_size)
        try:
            convert(step_path, glb_path, lin, ang)
        except Exception as e:
            print(f"FAILED: {step_path.name}: {e}")


if __name__ == "__main__":
    main()
