"""Dimensions for both load cell platforms, in mm.

Values marked MEASURE are estimates. Change them here and rerun build.py.
"""

IN = 25.4

# Plywood panels: two 12 x 12 in squares per platform.
PANEL = 12 * IN
PANEL_T = 15.9  # MEASURE: 5/8 in nominal; many "5/8" sheets are 19/32 in (15.1)

# Guang Ce YZC-1B, 50 kg.
CELL_L, CELL_W, CELL_H = 130.0, 30.0, 22.0
CELL_HOLE_PITCH = 15.9   # centre to centre, across the width (ruler)
CELL_HOLE_INSET = 12.5   # MEASURE: cell end face to hole centres (estimated from a photo)
M6_CLEAR = 7.0           # 0.6 mm over a normal M6 clearance to absorb the ruler-measured pitch
M6_CSK_D = 13.0          # countersink for an M6 flat head
CELL_BOLT_LEN = 40.0     # M6 x 40: 16 mm into the cell, tip 6 mm short of the far face
BLOCK_L, BLOCK_T = 25.0, 8.0
TIP_CLEAR_D = 10.0       # clearance hole in the far panel opposite every bolt tip (tips stop 13.9 mm short anyway)

# Levelling feet: M8 bolt into a T-nut fitted from the underside, flange down.
M8_TNUT_D = 10.0         # barrel of a typical M8 T-nut; check yours
M8_HEAD_AF, M8_HEAD_H = 13.0, 5.3
FOOT_D, FOOT_T = 70.0, 8.0
FOOT_INSET_CORNER = 60.0  # single-point corner feet, from both edges (inboard of the stake brackets)
FOOT_INSET_EDGE = 30.0    # edge-middle feet, from the edge

# Outdoor feet for the 5/16-18 x 2-1/2 in hex bolts actually bought (head 1/2 in across flats).
FOOT_HEAD_AF, FOOT_HEAD_H = 12.7, 5.6
FOOT_HEAD_FIT = 0.3              # pocket oversize so the head drops in but cannot spin
BALL_R, BALL_FIT = 11.0, 0.35    # swivel foot ball and socket clearance

# #6 wood screws, 1/2 in long (shorter than the panel).
PILOT_D = 2.8
SCREW_CLEAR = 3.8
SCREW_CSK_D = 7.2

# Stake brackets: AVOFOREST 7.1 in stakes.
STAKE_D = 5.0            # MEASURE: shaft diameter (estimated from listing weight)
STAKE_OUT = 1.25 * IN    # stake hole distance from the panel corner, along the diagonal
BRACKET = 40.0           # plate size from the corner along each edge
BRACKET_T = 5.0
BRACKET_BOLTS = ((12.0, 28.0), (28.0, 12.0))  # from the two edges
LUG_R = 10.0
M5_CLEAR, M5_CSK_D = 5.5, 10.4
M5_NUT_AF, M5_NUT_H = 8.0, 4.0

# Bucket centring tabs on the top panel diagonals.
BUCKET_RIM_D = (10 + 3 / 16) * IN  # measured 10 2/16 to 10 3/16 in; the larger, so the bucket cannot bind
TAB_CLEAR, TAB_DEPTH, TAB_H = 1.5, 14.0, 10.0

CABLE_D = 5.0            # YZC-1B cable

# Four-cell platform built on the LoadCellBaseV3 / LoadCellTopV3 holders.
V3_R, V3_H = 26.7, 14.5          # holder radius, base bottom to cap boss top
V3_BOSS_R, V3_RING_TOP = 20.0, 12.5
HOLDER_XY = 75.0                 # holder centres at (+-75, +-75)
ADAPTER_R, ADAPTER_FLOOR, ADAPTER_WALL = 40.0, 2.0, 2.0
ADAPTER_POCKET_R = 26.9          # V3 base flange is 26.7
ADAPTER_HOLE_R = 33.5
LOCATOR_R, LOCATOR_T = 38.0, 1.5
LOCATOR_HOLE_R, LOCATOR_SCREW_R = 20.6, 33.0
WIRE_HOLE_D = 12.0
TRAY_IN = (80.0, 60.0, 25.0)     # HX711 and wire joins, under the base
TRAY_WALL = 2.5
GLAND_D = 12.5                   # PG7 cable gland

# Plastic cover over the top panel (Prusa XL, full-serve). Held by the bucket tab screws.
COVER_T = 3.0                    # top sheet
COVER_WALL = 3.0                 # skirt wall
COVER_CLEAR = 3.0                # skirt to the panel edges (it hangs past the base too)
COVER_DRIP = 5.0                 # skirt reaches this far below the base's underside
COVER_CORNER_NOTCH = 50.0        # skirt cut away this far from each corner for the stake brackets
COVER_BASE_GAP = 3.0             # notch top above the stake bracket plates on the base

# Glue-on edge hooks: glued to the top panel only, catch under the base if the top is lifted.
HOOK_W, HOOK_WALL = 40.0, 4.0
HOOK_SIDE_GAP = 3.0              # hook leg to the base panel's edge
HOOK_LIFT_GAP = 4.0              # hook lip to the underside of the base
