"""Printed parts, drilling layouts and assemblies for both platforms.

Plan coordinates: origin at the panel centre, x to the right, y up, viewed
from above. The single-point cell lies along x with its cable end at -x.
"""
import math

from manifold3d import CrossSection, Manifold

import params as P

SEG = 64
HALF = P.PANEL / 2


def box(x0, y0, z0, x1, y1, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def cyl(r, z0, z1, x=0.0, y=0.0, seg=SEG):
    return Manifold.cylinder(z1 - z0, r, r, seg).translate((x, y, z0))


def hex_prism(af, z0, z1, x=0.0, y=0.0):
    r = af / math.sqrt(3)
    return Manifold.cylinder(z1 - z0, r, r, 6).rotate((0, 0, 30)).translate((x, y, z0))


def csk_hole(x, y, z0, z1, d, csk_d, top=True):
    """Through hole from z0 to z1 with a 90 degree countersink on the top (or bottom) face."""
    depth = (csk_d - d) / 2
    hole = cyl(d / 2, z0 - 1, z1 + 1, x, y)
    if top:
        cone = Manifold.cylinder(depth + 0.01, d / 2, csk_d / 2, SEG).translate((x, y, z1 - depth))
    else:
        cone = Manifold.cylinder(depth + 0.01, csk_d / 2, d / 2, SEG).translate((x, y, z0 - 0.01))
    return hole + cone


def union(parts):
    out = parts[0]
    for p in parts[1:]:
        out = out + p
    return out


def polar(r, deg):
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def rot(xy, deg):
    a = math.radians(deg)
    x, y = xy
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


# ---------------------------------------------------------------- printed parts

def cell_block(t=P.BLOCK_T):
    """Spacer between a panel and one end of the YZC-1B. x=0 is the cell end face."""
    block = box(0, -P.CELL_W / 2, 0, P.BLOCK_L, P.CELL_W / 2, t)
    for y in (-P.CELL_HOLE_PITCH / 2, P.CELL_HOLE_PITCH / 2):
        block = block - cyl(P.M6_CLEAR / 2, -1, t + 1, P.CELL_HOLE_INSET, y)
    assert P.CELL_HOLE_INSET + P.M6_CLEAR / 2 < P.BLOCK_L, "holes run off the block"
    assert (P.CELL_W - P.CELL_HOLE_PITCH) / 2 > P.M6_CLEAR / 2, "holes break the sides"
    return block


def foot_pad():
    """Pad that holds an M8 bolt head; turning the pad turns the bolt in the T-nut."""
    boss_h = P.M8_HEAD_H + 1.5
    pad = cyl(P.FOOT_D / 2, 0, P.FOOT_T) + cyl(12, P.FOOT_T, P.FOOT_T + boss_h)
    top = P.FOOT_T + boss_h
    return pad - hex_prism(P.M8_HEAD_AF + 0.3, top - P.M8_HEAD_H - 0.2, top + 1)


def head_pocket(top_z):
    """Hex pocket for the foot bolt head, open at top_z."""
    return hex_prism(P.FOOT_HEAD_AF + P.FOOT_HEAD_FIT, top_z - P.FOOT_HEAD_H - 0.2, top_z + 1)


def grip_flutes(part, r, z0, z1, count, offset=0.0):
    """Finger scallops around a round edge so the foot turns by hand."""
    for i in range(count):
        x, y = polar(r + 1.5, offset + 360 * i / count)
        part = part - cyl(3.0, z0 - 1, z1 + 1, x, y, 24)
    return part


def tread_grooves(part, r, depth=2.5, width=3.0):
    """Radial and ring grooves cut into the flat underside for grip on rough ground."""
    for i in range(16):                      # start 14 mm out so the grooves never meet in the middle
        part = part - box(14, -width / 2, -1, r + 1, width / 2, depth).rotate((0, 0, 22.5 * i))
    ring = cyl(r * 0.72 + width / 2, -1, depth) - cyl(r * 0.72 - width / 2, -2, depth + 1)
    return part - ring


def foot_cleated():
    """Option A: wide 100 mm pad with tread grooves for mud, snow and uneven dirt."""
    r, base_h, boss_h = 50.0, 10.0, 9.0
    pad = Manifold.cylinder(base_h, r, r - 3, 96)
    boss = Manifold.cylinder(boss_h, 15, 13, 64).translate((0, 0, base_h))
    part = tread_grooves(pad, r) + boss
    part = grip_flutes(part, r, 3, base_h, 18)
    return part - head_pocket(base_h + boss_h)


def foot_spike():
    """Option B: ground spike that pushes into soft soil and stops at a wide collar."""
    boss_r, boss_h, collar_r, spike_len = 20.0, 12.0, 32.0, 50.0
    boss = cyl(boss_r, 0, boss_h)
    collar = Manifold.cylinder(8, collar_r, boss_r, 64).translate((0, 0, -8))
    spike = Manifold.cylinder(spike_len, 2.5, 16, 48).translate((0, 0, -8 - spike_len))
    part = grip_flutes(boss + collar + spike, boss_r, 1, boss_h, 10)
    return part - head_pocket(boss_h)


def foot_swivel_ball():
    """Option C, part 1: holds the bolt head; its ball snaps into the swivel pad."""
    r = P.BALL_R
    ball = Manifold.sphere(r, 64) - box(-r, -r, -r - 1, r, r, -r + 2)       # flat so it prints on the bed
    neck = cyl(6.0, 0, r + 6)
    boss = Manifold.cylinder(5, 6, 14, 64).translate((0, 0, r + 6)) + cyl(14, r + 11, r + 21)
    part = grip_flutes(ball + neck + boss, 14, r + 12, r + 21, 8)
    return part - head_pocket(r + 21)


def foot_swivel_pad():
    """Option C, part 2: 90 mm treaded pad with a slotted socket; tilts about 25 degrees."""
    r, base_h = 45.0, 8.0
    rb = P.BALL_R + P.BALL_FIT
    center_z = base_h + rb - 2.5
    pad = tread_grooves(Manifold.cylinder(base_h, r, r - 3, 96), r)
    housing = cyl(17, base_h - 0.01, center_z + 7)
    part = pad + housing
    part = part - Manifold.sphere(rb, 64).translate((0, 0, center_z))
    part = part - cyl(9.5, center_z, center_z + 10)                         # mouth narrower than the ball
    for a in (0, 90):
        part = part - box(-18, -1, center_z - 3, 18, 1, center_z + 10).rotate((0, 0, a))
    return part


def foot_claw():
    """Option D: three-toed claw that seats on roots and rocks (3 points never rock)."""
    hub_h, hub_r = 12.0, 14.0
    part = cyl(hub_r, 0, hub_h)
    profile = [(0, 1), (12, 1), (34, -18), (38, -14), (38, hub_h), (0, hub_h)]  # counter-clockwise
    fin = Manifold.extrude(CrossSection([profile]), 6).translate((0, 0, -3)).rotate((90, 0, 0))
    for a in (0, 120, 240):
        part = part + fin.rotate((0, 0, a))
    part = grip_flutes(part, hub_r, 1, hub_h, 3, offset=60)
    return part - head_pocket(hub_h)


def foot_snowshoe():
    """Option E: 150 x 90 mm oval pad with tread for deep snow and very soft ground."""
    base_h, boss_h = 8.0, 9.0
    outline = CrossSection.circle(45, 96).translate((-30, 0)) + CrossSection.circle(45, 96).translate((30, 0))
    pad = Manifold.extrude(outline.hull(), base_h)
    pad = tread_grooves(pad, 70)
    boss = Manifold.cylinder(boss_h, 15, 13, 64).translate((0, 0, base_h))
    return pad + boss - head_pocket(base_h + boss_h)


def foot_riser():
    """Option F: 80 mm treaded pad on a 45 mm column, for a corner over a dip or hole."""
    base_h, col_h, r = 8.0, 45.0, 40.0
    pad = tread_grooves(Manifold.cylinder(base_h, r, r - 3, 96), r)
    col = Manifold.cylinder(col_h, 18, 15, 64).translate((0, 0, base_h))
    part = grip_flutes(pad + col, 15, base_h + col_h - 12, base_h + col_h, 8)
    return part - head_pocket(base_h + col_h)


def foot_staked():
    """Option G: 110 mm treaded pad with two stake holes, so each foot can be pinned down."""
    r, base_h, boss_h = 55.0, 9.0, 9.0
    pad = tread_grooves(Manifold.cylinder(base_h, r, r - 3, 96), r)
    boss = Manifold.cylinder(boss_h, 15, 13, 64).translate((0, 0, base_h))
    part = grip_flutes(pad + boss, r, 3, base_h, 20)
    for a in (56.25, 236.25):                 # between tread grooves
        x, y = polar(47, a)
        part = part - cyl((P.STAKE_D + 1.5) / 2, -1, base_h + 1, x, y)
    return part - head_pocket(base_h + boss_h)


def lug_xy():
    d = P.STAKE_OUT / math.sqrt(2)
    return d, d


def stake_bracket_top(panel_t=P.PANEL_T):
    """Corner plate on top of the base with the stake lug outboard of the corner.

    Local coordinates: panel corner at the origin, panel in x<0, y<0, panel top at z=0.
    """
    lx, ly = lug_xy()
    plate = Manifold.batch_hull([
        box(-P.BRACKET, -P.BRACKET, 0, 0, 0, P.BRACKET_T),
        cyl(P.LUG_R, 0, P.BRACKET_T, lx, ly),
    ])
    lug = cyl(P.LUG_R, -panel_t - P.BRACKET_T, P.BRACKET_T, lx, ly)
    part = plate + lug
    part = part - cyl((P.STAKE_D + 1.5) / 2, -panel_t - P.BRACKET_T - 1, P.BRACKET_T + 1, lx, ly)
    for u, v in P.BRACKET_BOLTS:
        part = part - csk_hole(-u, -v, 0, P.BRACKET_T, P.M5_CLEAR, P.M5_CSK_D)
    assert math.hypot(lx, ly) - P.LUG_R > 3, "lug touches the panel corner"
    return part


def stake_bracket_bottom(panel_t=P.PANEL_T):
    """Plate under the base corner with captive M5 nuts. Panel bottom at z=-panel_t."""
    z1 = -panel_t
    z0 = z1 - P.BRACKET_T
    part = box(-P.BRACKET, -P.BRACKET, z0, 0, 0, z1)
    for u, v in P.BRACKET_BOLTS:
        part = part - cyl(P.M5_CLEAR / 2, z0 - 1, z1 + 1, -u, -v)
        part = part - hex_prism(P.M5_NUT_AF + 0.2, z0 - 1, z0 + P.M5_NUT_H + 0.2, -u, -v)
    return part


def tab_geometry():
    """Footprint polygon (plan, on the +45 degree diagonal) and screw positions."""
    r_in = P.BUCKET_RIM_D / 2 + P.TAB_CLEAR
    r_out = r_in + P.TAB_DEPTH
    pts = []
    for i in range(25):
        a = 45 - 14 + 28 * i / 24
        pts.append(polar(r_out, a))
    for i in range(25):
        a = 45 + 14 - 28 * i / 24
        pts.append(polar(r_in, a))
    sector = CrossSection([pts])
    limit = CrossSection.square((2 * (HALF - 3), 2 * (HALF - 3)), True)
    foot = sector ^ limit
    d = r_in + P.TAB_DEPTH / 2
    u, v = (math.sqrt(0.5), math.sqrt(0.5)), (-math.sqrt(0.5), math.sqrt(0.5))
    screws = [(d * u[0] + s * v[0], d * u[1] + s * v[1]) for s in (-6.0, 6.0)]
    for x, y in screws:
        assert max(abs(x), abs(y)) + TAB_CBORE_D / 2 < HALF - 3, (
            "bucket rim too big for tabs on a 12 in panel; check BUCKET_RIM_D")
    return foot, screws


TAB_CBORE_D, TAB_FLOOR = 7.5, 3.0  # pan-head counterbore so a 1/2 in screw gets ~10 mm of wood


def bucket_tab():
    foot, screws = tab_geometry()
    tab = Manifold.extrude(foot, P.TAB_H)
    for x, y in screws:
        tab = tab - cyl(P.SCREW_CLEAR / 2, -1, P.TAB_H + 1, x, y)
        tab = tab - cyl(TAB_CBORE_D / 2, TAB_FLOOR, P.TAB_H + 1, x, y)
    return tab


def cable_clip():
    """Saddle over the YZC-1B cable; channel along x, screws at +-9 mm in y."""
    c = P.CABLE_D + 0.6
    w = c + 5
    clip = box(-5, -14, 0, 5, 14, 2.5) + box(-5, -w / 2, 0, 5, w / 2, c + 2.5)
    clip = clip - Manifold.cylinder(12, c / 2, c / 2, SEG).rotate((0, 90, 0)).translate((-6, 0, c / 2))
    clip = clip - box(-6, -c / 2, -1, 6, c / 2, c / 2)
    for y in (-10.5, 10.5):
        clip = clip - cyl(P.SCREW_CLEAR / 2, -1, 4, 0, y)
    return clip


def adapter_holes_local():
    return [polar(P.ADAPTER_HOLE_R, a) for a in (-30, 90, 210)]


def holder_adapter():
    """Locates a LoadCellBaseV3 on the base panel. Its wire notch is at local -y."""
    floor = cyl(P.ADAPTER_R, 0, P.ADAPTER_FLOOR) - cyl(13.5, -1, P.ADAPTER_FLOOR + 1)
    z1 = P.ADAPTER_FLOOR + P.ADAPTER_WALL
    wall = cyl(P.ADAPTER_R, P.ADAPTER_FLOOR, z1) - cyl(P.ADAPTER_POCKET_R, P.ADAPTER_FLOOR - 0.01, z1 + 1)
    part = (floor + wall) - box(-3.5, -P.ADAPTER_R - 1, P.ADAPTER_FLOOR, 3.5, -20, z1 + 1)
    for x, y in adapter_holes_local():
        part = part - csk_hole(x, y, 0, z1, P.SCREW_CLEAR, P.SCREW_CSK_D)
    return part


def locator_screws_local():
    """Relative to the outward diagonal (+x here), so none lines up with a bucket tab screw."""
    return [polar(P.LOCATOR_SCREW_R, a) for a in (60, 180, 300)]


def locator_ring():
    """Hangs under the top panel around a cap boss so the panel cannot slide off."""
    part = cyl(P.LOCATOR_R, 0, P.LOCATOR_T) - cyl(P.LOCATOR_HOLE_R, -1, P.LOCATOR_T + 1)
    for x, y in locator_screws_local():
        part = part - cyl(P.SCREW_CLEAR / 2, -1, P.LOCATOR_T + 1, x, y)
    return part


def tray_geometry():
    ix, iy, iz = P.TRAY_IN
    ox, oy, oz = ix / 2 + P.TRAY_WALL, iy / 2 + P.TRAY_WALL, iz + P.TRAY_WALL
    screws = [(sx * (ox + 6), sy * (oy - 10)) for sx in (-1, 1) for sy in (-1, 1)]
    return (ix, iy, iz), (ox, oy, oz), screws


def hx711_tray():
    """Open-topped box screwed under the base; the plywood is its lid. Open face at z=oz."""
    (ix, iy, iz), (ox, oy, oz), screws = tray_geometry()
    part = box(-ox, -oy, 0, ox, oy, oz) - box(-ix / 2, -iy / 2, P.TRAY_WALL, ix / 2, iy / 2, oz + 1)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * ox, sx * (ox + 12)))
        part = part + box(x0, -oy, 0, x1, oy, oz)
    for x, y in screws:
        part = part - cyl(P.SCREW_CLEAR / 2, -1, oz + 1, x, y)
        part = part - cyl(4.2, -1, oz - 4, x, y)
    gland = Manifold.cylinder(P.TRAY_WALL + 2, P.GLAND_D / 2, P.GLAND_D / 2, SEG).rotate((0, 90, 0))
    part = part - gland.translate((ox - P.TRAY_WALL - 1, 0, 12))
    return part


def sp_top_panel_bottom():
    return P.PANEL_T + 2 * P.BLOCK_T + P.CELL_H


def cover(top_panel_bottom, cable_notch=False):
    """Lid over the top panel only. Local: top panel's upper face at z=0.

    The skirt hangs past both panels, COVER_CLEAR outside their edges, and ends COVER_DRIP
    below the base. Near each corner it is cut away up to COVER_BASE_GAP above the stake
    bracket plates, so it never touches the base side. Fastened only by the tab screws.
    """
    def local(z_abs):
        return z_abs - (top_panel_bottom + P.PANEL_T)

    inner = HALF + P.COVER_CLEAR
    outer = inner + P.COVER_WALL
    z_bot = local(-P.COVER_DRIP)
    lid = box(-outer, -outer, 0, outer, outer, P.COVER_T)
    skirt = box(-outer, -outer, z_bot, outer, outer, P.COVER_T) - box(-inner, -inner, z_bot - 1, inner, inner, 0)
    part = lid + skirt
    notch_top = local(P.PANEL_T + P.BRACKET_T + P.COVER_BASE_GAP)
    n = HALF - P.COVER_CORNER_NOTCH
    for sx, sy in corners():
        xs = sorted((sx * n, sx * (outer + 1)))
        ys = sorted((sy * n, sy * (outer + 1)))
        part = part - box(xs[0], ys[0], z_bot - 1, xs[1], ys[1], notch_top)
    if cable_notch:
        part = part - box(-outer - 1, -8, z_bot - 1, -inner + 1, 8, local(P.PANEL_T + 12))
    for _, x, y in tab_holes():
        part = part - cyl(P.SCREW_CLEAR / 2, -1, P.COVER_T + 1, x, y)
    return part


def fc_top_panel_bottom():
    return P.PANEL_T + P.ADAPTER_FLOOR + P.V3_H


def edge_hook():
    """Four-cell lift stop, glued to the top panel's edge and top face.

    Local: panel edge face at x=0 (panels at x<0), base underside at z=0, extruded along y.
    """
    t, wall = P.PANEL_T, P.HOOK_WALL
    ztb = fc_top_panel_bottom()
    top = ztb + t
    leg_x = P.HOOK_SIDE_GAP
    lip_top = -P.HOOK_LIFT_GAP
    rects = [
        (-10, top, wall, top + 3),                      # flange on the top face
        (0, ztb, wall, top + 3),                        # plate on the top panel's edge
        (leg_x, lip_top - wall, leg_x + wall, ztb),     # leg, clear of the base edge
        (-12, lip_top - wall, leg_x + wall, lip_top),   # lip under the base
    ]
    return union([box(x0, -P.HOOK_W / 2, z0, x1, P.HOOK_W / 2, z1) for x0, z0, x1, z1 in rects])


def placed_edge_hooks():
    return [edge_hook().translate((HALF, 0, 0)).rotate((0, 0, a)) for a in (0, 90, 180, 270)]


# ------------------------------------------------------------ drilling layouts

HOLE_TYPES = {
    "A": ("7 mm (9/32 in) through", "M6 cell bolt, head underneath"),
    "B": ("7 mm (9/32 in) through, countersink to 13 mm on this face", "M6 flat-head cell bolt"),
    "C": ("10 mm (25/64 in) through", "clearance opposite a bolt tip"),
    "D": ("10 mm through (fit your T-nut)", "levelling foot, T-nut from underside, flange down"),
    "E": ("5.5 mm (7/32 in) through", "M5 stake bracket bolt"),
    "F": ("2.8 mm (7/64 in) pilot, 12 mm deep", "#6 x 1/2 in screw from this face"),
    "G": ("2.8 mm (7/64 in) pilot, through", "#6 x 1/2 in screw from underneath"),
    "H": ("12 mm (1/2 in) through", "cell wires down to the HX711 tray"),
}

HOLE_D = {"A": 7.0, "B": 7.0, "C": P.TIP_CLEAR_D, "D": 10.0, "E": 5.5, "F": 2.8, "G": 2.8, "H": 12.0}


def corners():
    return [(sx, sy) for sx in (1, -1) for sy in (1, -1)]


def bracket_holes():
    holes = []
    for sx, sy in corners():
        for u, v in P.BRACKET_BOLTS:
            holes.append(("E", sx * (HALF - u), sy * (HALF - v)))
    return holes


def tab_holes():
    _, screws = tab_geometry()
    holes = []
    for k in range(4):
        for xy in screws:
            x, y = rot(xy, 90 * k)
            holes.append(("F", x, y))
    return holes


def cell_hole_x():
    return -P.CELL_L / 2 + P.CELL_HOLE_INSET, P.CELL_L / 2 - P.CELL_HOLE_INSET


def sp_feet():
    c = HALF - P.FOOT_INSET_CORNER
    return [(sx * c, sy * c) for sx, sy in corners()]


def bracket_outlines():
    out = []
    for sx, sy in corners():
        xs = sorted((sx * HALF, sx * (HALF - P.BRACKET)))
        ys = sorted((sy * HALF, sy * (HALF - P.BRACKET)))
        out.append(("rect", xs[0], ys[0], xs[1], ys[1], "stake bracket"))
    return out


def tab_outlines():
    foot, _ = tab_geometry()
    out = []
    for k in range(4):
        for poly in foot.rotate(90 * k).to_polygons():
            out.append(("poly", [tuple(p) for p in poly], "bucket tab" if k == 0 else ""))
    return out


def front_label():
    return [("text", 0, -HALF + 6, "FRONT EDGE (same edge on top and base)")]


def sp_cell_outline():
    x0, x1 = -P.CELL_L / 2, P.CELL_L / 2
    return [
        ("rect", x0, -P.CELL_W / 2, x1, P.CELL_W / 2, ""),
        ("text", x0 + 16, P.CELL_W / 2 + 4, "CABLE END"),
        ("text", x1 - 16, P.CELL_W / 2 + 4, "ARROW END"),
    ]


def sp_layout():
    fx, lx = cell_hole_x()
    ys = (-P.CELL_HOLE_PITCH / 2, P.CELL_HOLE_PITCH / 2)
    base = [("A", fx, y) for y in ys] + [("C", lx, y) for y in ys]
    base += [("D", x, y) for x, y in sp_feet()]
    base += [("F", -90.0, -10.5), ("F", -90.0, 10.5)]
    base += bracket_holes()
    top = [("B", lx, y) for y in ys] + [("C", fx, y) for y in ys]
    top += tab_holes()
    clip = [("rect", -95.0, -14.0, -85.0, 14.0, "cable clip")]
    return {
        "base": base,
        "top": top,
        "base_outlines": sp_cell_outline() + clip + bracket_outlines() + front_label(),
        "top_outlines": sp_cell_outline() + tab_outlines() + front_label(),
    }


def holder_positions():
    return [(sx * P.HOLDER_XY, sy * P.HOLDER_XY) for sx, sy in corners()]


def holder_angle(x, y):
    """Rotation that points the holder's wire notch (local -y) at the panel centre."""
    dx, dy = -x / math.hypot(x, y), -y / math.hypot(x, y)
    return math.degrees(math.atan2(dx, -dy))


def fc_feet():
    e = HALF - P.FOOT_INSET_EDGE
    return [(0, e), (0, -e), (e, 0), (-e, 0)]


def fc_layout():
    base, top = [], []
    for hx, hy in holder_positions():
        a = holder_angle(hx, hy)
        for xy in adapter_holes_local():
            x, y = rot(xy, a)
            base.append(("F", hx + x, hy + y))
        outward = math.degrees(math.atan2(hy, hx))
        for xy in locator_screws_local():
            x, y = rot(xy, outward)
            top.append(("G", hx + x, hy + y))
    base += [("D", x, y) for x, y in fc_feet()]
    base.append(("H", 0.0, 0.0))
    base += [("G", x, y) for x, y in tray_geometry()[2]]
    base += bracket_holes()
    top += tab_holes()
    _, (ox, oy, _), _ = tray_geometry()
    holders = []
    for hx, hy in holder_positions():
        holders.append(("circle", hx, hy, P.ADAPTER_R, ""))
        holders.append(("circle", hx, hy, P.V3_R, ""))
        nx, ny = 0.6 * -hx, 0.6 * -hy
        holders.append(("text", hx + nx * 0.55, hy + ny * 0.55, "wires"))
    rings = [("circle", hx, hy, P.LOCATOR_R, "") for hx, hy in holder_positions()]
    rings += [("circle", hx, hy, P.V3_BOSS_R, "") for hx, hy in holder_positions()]
    return {
        "base": base,
        "top": top,
        "base_outlines": holders + [("rect", -ox - 12, -oy, ox + 12, oy, "HX711 tray (underneath)")]
        + bracket_outlines() + front_label(),
        "top_outlines": rings + [("text", P.HOLDER_XY, P.HOLDER_XY + P.LOCATOR_R + 4, "locator ring")]
        + tab_outlines() + front_label(),
    }


# ------------------------------------------------------------------ assemblies

def at_corner(part, sx, sy, z):
    """Place a bracket part modelled at the (+,+) corner onto corner (sx, sy)."""
    p = part
    if sx < 0:
        p = p.mirror((1, 0, 0))
    if sy < 0:
        p = p.mirror((0, 1, 0))
    return p.translate((sx * HALF, sy * HALF, z))


def common_base(t):
    base = box(-HALF, -HALF, 0, HALF, HALF, t)
    brackets = []
    for sx, sy in corners():
        brackets.append(at_corner(stake_bracket_top(t), sx, sy, t))
        brackets.append(at_corner(stake_bracket_bottom(t), sx, sy, t))
    return base, brackets


def placed_tabs(z):
    tab = bucket_tab()
    return [tab.rotate((0, 0, 90 * k)).translate((0, 0, z)) for k in range(4)]


def feet_parts(feet):
    parts = []
    for x, y in feet:
        parts.append(foot_pad().translate((x, y, -45)))
        parts.append(cyl(4, -45 + P.FOOT_T, P.PANEL_T, x, y))
    return parts


def sp_assembly():
    t = P.PANEL_T
    fx, lx = cell_hole_x()
    ys = (-P.CELL_HOLE_PITCH / 2, P.CELL_HOLE_PITCH / 2)
    z_cell = t + P.BLOCK_T
    z_top = z_cell + P.CELL_H + P.BLOCK_T
    base, brackets = common_base(t)
    fixed_block = cell_block().translate((-P.CELL_L / 2, 0, t))
    load_block = cell_block().mirror((1, 0, 0)).translate((P.CELL_L / 2, 0, z_cell + P.CELL_H))
    cell = box(-P.CELL_L / 2, -P.CELL_W / 2, z_cell, P.CELL_L / 2, P.CELL_W / 2, z_cell + P.CELL_H)
    top = box(-HALF, -HALF, z_top, HALF, HALF, z_top + t)
    base_bolts = [cyl(3, 0, P.CELL_BOLT_LEN, fx, y) for y in ys]
    top_bolts = [cyl(3, z_top + t - P.CELL_BOLT_LEN, z_top + t, lx, y) for y in ys]
    clip = cable_clip().translate((-90, 0, t))
    groups = {
        "top": [top, load_block] + top_bolts + placed_tabs(z_top + t),
        "base": [base, fixed_block, clip] + base_bolts + brackets + feet_parts(sp_feet()),
        "cell": [cell],
    }
    return groups


def fc_assembly(v3_base, v3_cap):
    t = P.PANEL_T
    z_v3 = t + P.ADAPTER_FLOOR
    z_top = z_v3 + P.V3_H
    base, brackets = common_base(t)
    adapters, v3b, v3c, locators = [], [], [], []
    for hx, hy in holder_positions():
        a = holder_angle(hx, hy)
        adapters.append(holder_adapter().rotate((0, 0, a)).translate((hx, hy, t)))
        v3b.append(v3_base.rotate((0, 0, a)).translate((hx, hy, z_v3)))
        v3c.append(v3_cap.rotate((0, 0, a)).translate((hx, hy, z_v3)))
        locators.append(locator_ring().translate((hx, hy, z_top - P.LOCATOR_T)))
    top = box(-HALF, -HALF, z_top, HALF, HALF, z_top + t)
    oz = tray_geometry()[1][2]
    tray = hx711_tray().translate((0, 0, -oz))
    groups = {
        "top": [top] + locators + placed_tabs(z_top + t),
        "caps": v3c,
        "base": [base, tray] + adapters + brackets + feet_parts(fc_feet()),
        "holder_bases": v3b,
    }
    return groups
