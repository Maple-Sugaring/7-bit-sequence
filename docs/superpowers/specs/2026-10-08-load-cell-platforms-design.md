# Load cell platforms: design

Status: draft for review (2026-10-08)

## Goal

Two ground-standing platforms that weigh a 10-gallon bucket of sap (about 87 lb / 39.5 kg full) for the Heltec node:

- **Single-point platform**: one Guang Ce YZC-1B 50 kg bar cell.
- **Four-cell platform**: four DIYmalls 50 kg half-bridge cells (Amazon B09W2K13ZY, 8 cells + 2 HX711 per kit) wired as one full bridge on one HX711.

Success: readings rise in equal steps from empty to full; nothing but the cell(s) carries load at any weight; the platform survives freeze-thaw outdoors.

## Agreed decisions

- **Panels:** two 12 × 12 in squares of 5/8 in (15.9 mm) plywood per platform, painted on every face and edge. No HDPE.
- **Printed parts:** PETG on the RIT SHED Prusa MK4 (default `PETG - MK4` profile; perimeters 5, infill 30% for load-bearing parts).
- **Placement:** on the ground, on levelling feet (M8 bolt into a T-nut installed from the underside, flange down, so foot load presses the flange into the wood).
- **Staking:** four printed stake brackets clamp around the base corners and hold AVOFOREST 7.1 in tent stakes (Amazon B0CLV6H7YN) outside the panel footprint, so stakes are hammered in after assembly and no stake head sits under the top panel. Only about 4.5 in of a 7.1 in stake reaches the soil (feet plus panel); longer stakes are a drop-in upgrade.
- **Wiring:** every wire stays on the base panel; nothing crosses from top to base.
- **Wood screws** are #6 × 1/2 in so they cannot exit a 5/8 in panel.

## Single-point platform

```
                      bucket centre
                            │
  ════════════════════ top panel ═════════════════════
                                           ▓▓▓▓  load-end block (arrow end)
        ┌──────────────────────────────────────┐
        │ cable end                  arrow end │
        └──────────────────────────────────────┘
         ▓▓▓▓  fixed-end block (cable end)
  ═══════════════════ base panel ════════════════════
```

- The cell's midpoint sits under the panel centre (bucket centre). Blocks bolt to the cell's end holes.
- Cable end is bolted to the base, so the cable never bridges the panels.
- Cell bolts: base bolts come up from underneath into the cable end; top bolts are flat-head, countersunk from the top, into the arrow end. Length = 15.9 + block thickness + cell height − 1 mm, rounded down to stock, so no tip reaches the far panel.
- Each panel is drilled at all four cell-hole positions: bolt holes at its own end, clearance holes at the other end (belt and braces against bolt-tip contact).
- Four feet, one near each corner (60 mm in from both edges, inboard of the stake brackets). Level by turning the pads until none rocks.

## Four-cell platform

- Each cell sits in the team's existing `LoadCellBaseV3` + `LoadCellTopV3` holder (53.4 mm round, 14.5 mm tall, snap-on cap), used unchanged.
- A printed adapter screwed to the base locates each holder base, with a notch so the holder's wire slot faces the panel centre. Holders at (±75, ±75) mm.
- The top panel rests on the four cap bosses. A thin printed locator ring screwed under the top panel surrounds each boss so the panel cannot slide; the ring stays 0.5 mm clear of the cap.
- Known risk in the V3 holder: the cap skirt sits on the base flange (0 mm gap) and the snap allows about 0.2 mm of play, so part of the load bypasses the cell unless the cell stack is 8.0 to 8.2 mm tall. The verification steps below detect it.
- Bridge wiring per the earlier diagram: like colours join around the edge; red wires top-left to E+, bottom-right to E−, bottom-left to A−, top-right to A+. Wires run along the base to a centre hole and down into a printed tray under the base that holds the HX711 and the joins (the plywood is its lid), with a PG7 gland for the node cable; the gland is the strain relief, so the four-cell platform has no cable clip.
- Four feet at the middle of each edge, between the holders, so no foot bolt can reach a holder's void and the corners stay free for the stake brackets. Base bending between a holder and a foot does not change the reading; it only has to stay far smaller than the panel gap.

## Printed parts

| Part | Platform | Qty | Notes |
| --- | --- | --- | --- |
| Cell block (8 mm) | Single-point | 2 | Replaces the earlier `hardware/yzc1b-spacer` part; 1.5 mm test-fit version included |
| V3 holder base + cap | Four-cell | 4 + 4 | Team's existing files, unchanged |
| Holder adapter | Four-cell | 4 | Locates a V3 base on the plywood; 3 × #6 flat-head screws |
| Locator ring | Four-cell | 4 | 1.5 mm ring under the top panel around each cap boss; 3 × #6 pan-head screws |
| HX711 tray | Four-cell | 1 | Under the base; plywood is the lid; PG7 gland |
| Levelling foot pad | Both | 4 / 4 | 70 mm pad capturing an M8 bolt head |
| Bucket centring tab | Both | 4 / 4 | On the panel diagonals, touching the outside of the bucket rim; counterbored so a 1/2 in screw gets about 10 mm of wood |
| Cable clip | Single-point | 1 | On the base beside the cell's cable end |
| Stake bracket | Both | 4 + 4 / 4 + 4 | Same clamp as agreed, split into a top half (corner plate plus stake lug about 1.25 in out along the diagonal) and a bottom half with captive nuts, joined by 2 × M5 bolts through the corner, so both halves print flat with no supports. A pull on the stake presses the bottom half against the wood. |

## Drilling templates

Four 1:1 PDFs, one per panel (single-point top, single-point base, four-cell top, four-cell base):

- Full 12 × 12 in panel outline, tiled across four letter sheets with alignment marks.
- A 2 in scale square on every sheet to confirm it printed at 100%.
- Every hole marked with a centre cross and labelled with drill size and purpose (bolt, clearance, countersink, T-nut from underside, pilot for #6 screw).
- Base templates include the stake bracket pilot holes at all four corners; the stake holes themselves are in the printed brackets, not the plywood.
- Corner-to-corner diagonals drawn on the template to line up with diagonals drawn on the plywood.

## Inputs

All files are parametric. Files were generated with the estimates below; rerun `build.py` after measuring.

| Input | Value | Status |
| --- | --- | --- |
| YZC-1B size | 130 × 30 × 22 mm (L × W × H) | measured |
| YZC-1B holes | M6, threaded in the cell | measured |
| YZC-1B hole spacing | 15.9 mm (5/8 in) | measured with a ruler; holes are drilled 7 mm (not 6.4) in blocks and plywood to absorb ±0.5 mm |
| YZC-1B end face to hole centres | about 12.5 mm (estimated from photo) | to measure |
| YZC-1B end block length | about 40 mm (side holes start about 43 mm from each end, from photo) | estimate is enough; blocks are only 25 mm long |
| Cell bolts | 4 × M6 × 40 mm: socket head + washer from under the base, flat head countersunk from the top | derived: 16 mm thread engagement in the 22 mm cell, tip stops about 6 mm short of the far face |
| DIYmalls cell outer size, thickness, bump height | — | to measure |
| Bucket bottom rim diameter | 258.8 mm (10 3/16 in) | measured 10 2/16 to 10 3/16 in; tabs use the larger |
| Plywood actual thickness | 15.9 mm (5/8 in nominal) | to measure; "5/8 in" sheet is often 19/32 in (15.1 mm), and the stake bracket's clamp gap depends on it |
| Stake shaft diameter | about 5 mm (estimated from listing weight) | to measure; sets the bracket hole |

## Verification

- Before printing: OpenSCAD asserts reject holes that break an edge; every exported STL is checked for open edges, bad winding, degenerate faces and positive volume.
- Print the test-fit plates first.
- After assembly: fill the bucket a gallon at a time (8.34 lb each) and check readings rise in equal steps; paper test at every bolt tip and holder void with the bucket full; slide the full bucket 1 in toward each edge and check the reading barely changes; leave it full overnight and check for drift (creep in the PETG).

## Out of scope

- Firmware changes for the four-cell bridge (constants and fault thresholds in `firmware/heltec-v3-node/src/main.cpp`); a separate task.
- HDPE panels, overload stop, enclosure for the Heltec.

## Files

- `hardware/platforms/`: `params.py` (all dimensions), `parts.py`, `templates.py`, `build.py` (regenerates and checks everything), README with print list, hardware and assembly notes.
- `hardware/platforms/single-point/`, `four-cell/`, `common/`: STLs and the four template PDFs.
