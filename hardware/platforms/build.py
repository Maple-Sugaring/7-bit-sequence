"""Generate every STL and drilling template for both platforms, then check them.

    pip install -r requirements.txt
    python build.py
"""
import struct
import sys
from pathlib import Path

import numpy as np
from manifold3d import Manifold

import params as P
import parts
from templates import build_template

HERE = Path(__file__).parent
SP, FC, COMMON = HERE / "single-point", HERE / "four-cell", HERE / "common"


def write_stl(manifold, path):
    mesh = manifold.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float32)
    tris = np.asarray(mesh.tri_verts)
    with open(path, "wb") as f:
        f.write(path.stem.encode()[:80].ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            n = np.cross(v[b] - v[a], v[c] - v[a])
            n = n / (np.linalg.norm(n) or 1.0)
            f.write(struct.pack("<12fH", *n, *v[a], *v[b], *v[c], 0))


def read_stl(path):
    data = path.read_bytes()
    n = struct.unpack_from("<I", data, 80)[0]
    t = np.frombuffer(data, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n, offset=84)
    return t["v"].astype(np.float64)


def manifold_from_stl(path):
    from manifold3d import Mesh
    v = read_stl(path).reshape(-1, 3)
    keys, inverse = np.unique(np.round(v, 4), axis=0, return_inverse=True)
    mesh = Mesh(vert_properties=keys.astype(np.float32), tri_verts=inverse.reshape(-1, 3).astype(np.uint32))
    m = Manifold(mesh)
    assert m.status().name == "NoError", f"{path.name} is not a closed mesh: {m.status()}"
    return m


def check_stl(path):
    """Closed, consistently wound, no degenerate faces, positive volume."""
    v = read_stl(path)
    keys = {}
    faces = np.array([keys.setdefault(tuple(np.round(p, 4)), len(keys)) for p in v.reshape(-1, 3)]).reshape(-1, 3)
    edges = set()
    for a, b, c in faces:
        for e in ((a, b), (b, c), (c, a)):
            assert e not in edges, f"{path.name}: edge used twice in one direction"
            edges.add(e)
    open_edges = sum(1 for a, b in edges if (b, a) not in edges)
    area = np.linalg.norm(np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0]), axis=1) / 2
    vol = np.einsum("ij,ij->i", v[:, 0], np.cross(v[:, 1], v[:, 2])).sum() / 6
    assert open_edges == 0, f"{path.name}: {open_edges} open edges"
    assert (area < 1e-9).sum() == 0, f"{path.name}: degenerate triangles"
    assert vol > 0, f"{path.name}: inside-out"
    lo, hi = v.reshape(-1, 3).min(0), v.reshape(-1, 3).max(0)
    return vol, hi - lo


def on_bed(m):
    lo = m.bounding_box()[:3]
    return m.translate((-lo[0], -lo[1], -lo[2]))


def flip(m):
    return m.mirror((0, 0, 1))


def export_parts():
    out = {
        SP / "cell-block-8mm.stl": parts.cell_block(),
        SP / "cell-block-testfit.stl": parts.cell_block(1.5),
        SP / "cable-clip.stl": parts.cable_clip(),
        SP / "cover.stl": flip(parts.cover(parts.sp_top_panel_bottom(), cable_notch=True)),
        FC / "cover.stl": flip(parts.cover(parts.fc_top_panel_bottom())),
        FC / "holder-adapter.stl": parts.holder_adapter(),
        FC / "locator-ring.stl": parts.locator_ring(),
        FC / "hx711-tray.stl": parts.hx711_tray(),
        FC / "edge-hook.stl": parts.edge_hook().rotate((90, 0, 0)),
        COMMON / "foot-pad.stl": parts.foot_pad(),
        COMMON / "foot-a-cleated.stl": parts.foot_cleated(),
        COMMON / "foot-b-spike.stl": flip(parts.foot_spike()),
        COMMON / "foot-c-swivel-ball.stl": parts.foot_swivel_ball(),
        COMMON / "foot-c-swivel-pad.stl": parts.foot_swivel_pad(),
        COMMON / "foot-d-claw.stl": flip(parts.foot_claw()),
        COMMON / "foot-e-snowshoe.stl": parts.foot_snowshoe(),
        COMMON / "foot-f-riser.stl": parts.foot_riser(),
        COMMON / "foot-g-staked.stl": parts.foot_staked(),
        COMMON / "stake-bracket-top.stl": flip(parts.stake_bracket_top()),
        COMMON / "stake-bracket-bottom.stl": parts.stake_bracket_bottom(),
        COMMON / "bucket-tab.stl": parts.bucket_tab(),
    }
    report = []
    for path, m in out.items():
        path.parent.mkdir(exist_ok=True)
        write_stl(on_bed(m), path)
        vol, size = check_stl(path)
        report.append(f"  {path.relative_to(HERE)}: {size[0]:.1f} x {size[1]:.1f} x {size[2]:.1f} mm, {vol / 1000:.1f} cm^3")
    return report


def gap(a, b, search=60.0):
    return parts.union(a).min_gap(parts.union(b), search)


def check_assemblies():
    lines = []
    sp = parts.sp_assembly()
    g = gap(sp["top"], sp["base"])
    lines.append(f"  single-point: closest top-side part to base-side part {g:.1f} mm")
    assert g > 5, "single-point: top and base sides come within 5 mm"
    sp_cover = parts.cover(parts.sp_top_panel_bottom(), cable_notch=True).translate((0, 0, parts.sp_top_panel_bottom() + P.PANEL_T))
    g = gap([sp_cover], sp["base"], 20)
    lines.append(f"  single-point: cover to base side {g:.1f} mm")
    assert g >= 2.5, "single-point: cover comes within 2.5 mm of the base side"

    v3_base = manifold_from_stl(FC / "LoadCellBaseV3.stl")
    v3_cap = manifold_from_stl(FC / "LoadCellTopV3.stl")
    fc = parts.fc_assembly(v3_base, v3_cap)
    g = gap(fc["top"], fc["base"] + fc["holder_bases"])
    lines.append(f"  four-cell: closest top panel/locator/tab to base side {g:.1f} mm")
    assert g > 5, "four-cell: top and base sides come within 5 mm"
    g = gap(fc["top"][1:5], fc["caps"], 5)
    lines.append(f"  four-cell: locator ring to holder cap {g:.2f} mm (must be > 0 so the panel sits on the bosses)")
    assert g > 0.2
    g = gap(fc["caps"], fc["holder_bases"], 5)
    lines.append(f"  four-cell: holder cap to holder base {g:.2f} mm (V3 design: cap skirt sits on the base flange)")
    fc_cover = parts.cover(parts.fc_top_panel_bottom()).translate((0, 0, parts.fc_top_panel_bottom() + P.PANEL_T))
    g = gap([fc_cover], fc["base"] + fc["holder_bases"], 20)
    lines.append(f"  four-cell: cover to base side {g:.1f} mm")
    assert g >= 2.5, "four-cell: cover comes within 2.5 mm of the base side"
    hooks = parts.placed_edge_hooks()
    g = gap(hooks, fc["base"] + fc["holder_bases"], 20)
    lines.append(f"  four-cell: edge hooks to base side {g:.1f} mm")
    assert g >= 2.5, "four-cell: edge hooks come within 2.5 mm of the base side"
    g = gap(fc["caps"], fc["base"], 10)
    lines.append(f"  four-cell: holder cap to everything else on the base side {g:.1f} mm")
    assert g > 0.15
    return lines


def check_layouts():
    """No two holes on a panel closer than 4 mm edge to edge (screws from opposite faces would collide)."""
    lines = []
    for name, layout in (("single-point", parts.sp_layout()), ("four-cell", parts.fc_layout())):
        for side in ("top", "base"):
            holes = layout[side]
            worst = min(
                np.hypot(x1 - x2, y1 - y2) - (parts.HOLE_D[k1] + parts.HOLE_D[k2]) / 2
                for i, (k1, x1, y1) in enumerate(holes)
                for k2, x2, y2 in holes[i + 1:]
            )
            lines.append(f"  {name} {side}: closest pair of holes {worst:.1f} mm apart (edge to edge)")
            assert worst >= 4, f"{name} {side}: holes within {worst:.1f} mm of each other"
            edge = min(parts.HALF - max(abs(x), abs(y)) - parts.HOLE_D[k] / 2 for k, x, y in holes)
            assert edge >= 4, f"{name} {side}: a hole is {edge:.1f} mm from the panel edge"
    return lines


def build_templates():
    sp, fc = parts.sp_layout(), parts.fc_layout()
    sp_notes = [
        "Mark the FRONT edge on both panels and keep the cell's cable end on the same side for top and base.",
    ]
    jobs = [
        (SP / "template-top.pdf", "Single-point TOP panel", sp["top"], sp["top_outlines"],
         sp_notes + ["Countersink B on the top face so the bolt heads sit flush under the bucket."]),
        (SP / "template-base.pdf", "Single-point BASE panel", sp["base"], sp["base_outlines"],
         sp_notes + ["Fit T-nuts (D) from the underside, flange down."]),
        (FC / "template-top.pdf", "Four-cell TOP panel", fc["top"], fc["top_outlines"],
         ["Locator rings screw on from underneath (G)."]),
        (FC / "template-base.pdf", "Four-cell BASE panel", fc["base"], fc["base_outlines"],
         ["Holder adapters screw on from the top (F), notch toward the centre; the HX711 tray",
          "screws on from underneath (G). Fit T-nuts (D) from the underside, flange down."]),
    ]
    for path, title, holes, outlines, notes in jobs:
        build_template(path, title, holes, outlines, notes)
    return [f"  {p.relative_to(HERE)}" for p, *_ in jobs]


def main():
    for d in (SP, FC, COMMON):
        d.mkdir(exist_ok=True)
    print("Parts:")
    print("\n".join(export_parts()))
    print("Templates:")
    print("\n".join(build_templates()))
    print("Hole spacing checks:")
    print("\n".join(check_layouts()))
    print("Clearance checks:")
    print("\n".join(check_assemblies()))
    unmeasured = ["PANEL_T", "CELL_HOLE_INSET", "STAKE_D"]
    print("Still estimates (params.py, marked MEASURE):", ", ".join(unmeasured))


if __name__ == "__main__":
    sys.exit(main())
