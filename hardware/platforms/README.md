# Load cell platforms

Two ground-standing platforms that weigh a 10-gallon sap bucket for the Heltec node. Design: [docs/superpowers/specs/2026-10-08-load-cell-platforms-design.md](../../docs/superpowers/specs/2026-10-08-load-cell-platforms-design.md).

Each platform is two 12 × 12 in squares of 5/8 in plywood (painted on every face and edge), the printed parts below, and four tent stakes.

## Print list

PETG, `PETG - MK4` profile at the SHED. Parts marked **load** carry weight: set perimeters 5 and infill 30%. Everything else prints on the defaults. No part needs supports.

**Single-point (YZC-1B)**

| File | Qty | |
| --- | --- | --- |
| `single-point/cell-block-testfit.stl` | 1 | Print first; must drop over the cell's bolt holes |
| `single-point/cell-block-8mm.stl` | 2 | load |
| `single-point/cable-clip.stl` | 1 | |
| `single-point/cover.stl` | 1 | optional; Prusa XL (full-serve), over the top panel, held by the tab screws |
| `common/foot-pad.stl` | 4 | load |
| `common/stake-bracket-top.stl` | 4 | load |
| `common/stake-bracket-bottom.stl` | 4 | load |
| `common/bucket-tab.stl` | 4 | |

**Four-cell (DIYmalls half-bridge cells)**

| File | Qty | |
| --- | --- | --- |
| `four-cell/LoadCellBaseV3.stl` | 4 | your holder base, unchanged |
| `four-cell/LoadCellTopV3.stl` | 4 | your holder cap, unchanged |
| `four-cell/holder-adapter.stl` | 4 | screws to the base panel, holds a V3 base |
| `four-cell/locator-ring.stl` | 4 | screws under the top panel, around a V3 cap boss |
| `four-cell/hx711-tray.stl` | 1 | HX711 and wire joins, under the base |
| `four-cell/edge-hook.stl` | 4 | optional; glued to the top panel so it can't be lifted off (not with the cover) |
| `four-cell/cover.stl` | 1 | optional; Prusa XL (full-serve), over the top panel, held by the tab screws |
| `common/foot-pad.stl` | 4 | load |
| `common/stake-bracket-top.stl` | 4 | load |
| `common/stake-bracket-bottom.stl` | 4 | load |
| `common/bucket-tab.stl` | 4 | |

## Hardware

| | Single-point | Four-cell |
| --- | --- | --- |
| M6 × 40 socket head + washer (cell, from under the base) | 2 | |
| M6 × 40 flat head (cell, countersunk from the top) | 2 | |
| M8 × 60 hex bolt + M8 T-nut + M8 jam nut (feet) | 4 | 4 |
| M5 × 30 flat head + M5 nut (stake brackets) | 8 | 8 |
| #6 × 1/2 in flat-head wood screw | | 12 (adapters) |
| #6 × 1/2 in pan-head wood screw | 10 (tabs, clip) | 24 (tabs, rings, tray) |
| PG7 cable gland | | 1 |
| Lever connectors (e.g. Wago 221-413) | | 4 |
| AVOFOREST 7.1 in tent stakes (longer for soft ground) | 4 | 4 |

All wood screws are 1/2 in so none can come out the other side of a 5/8 in panel.

## Drilling templates

`*/template-top.pdf` and `*/template-base.pdf`: page 1 is an overview with the hole key; pages 2-5 print at 100% on letter paper and tape together into a full-size template. Check the 2 in square on every sheet. Keep the marked FRONT edge on the same side for the top and base panels.

## Assembly notes

- **T-nuts go in from the underside, flange down,** so the foot load presses the flange into the wood. Thread an M8 bolt into each, drop its head into a foot pad, and turn the pads until all four touch and the platform does not rock; then lock each with its jam nut.
- **Stake brackets:** top half on the panel corner, bottom half underneath with the nuts in its pockets, two M5 bolts through. Turn each stake's hook away from the platform so it can't reach under the top panel.
- **Single-point:** fixed-end block between the base and the cable end; load-end block between the arrow end and the top. Arrow on the cell points down.
- **Four-cell:** turn each holder adapter so its notch faces the panel centre, then seat a V3 base in it with its wire slot in the notch. Run the wires along the base to the centre hole and down into the tray; wire the bridge as in the breadboard diagram. The top panel rests on the four cap bosses and the locator rings keep it from sliding. Optional edge hooks: glue one to the middle of each top-panel edge with a 4 mm spacer under its lip while the glue sets; it clears the base by 3 mm sideways and 4 mm underneath and only catches if the top is lifted.

## Before trusting the readings

1. Fill the bucket a gallon at a time (8.34 lb each). Readings should rise in equal steps.
2. With the bucket full, slide paper into every gap between the top side and the base side. It must never pinch.
3. Leave the bucket full overnight. A drifting reading means plastic is creeping somewhere in the load path.

**Four-cell holders:** in `LoadCellBaseV3`/`LoadCellTopV3`, the cap's skirt sits on the base's outer flange (0 mm gap, from the files' shared coordinates) and the snap ring allows about 0.2 mm of vertical play. Unless the cell plus its bump is between about 8.0 and 8.2 mm tall, part of the weight goes through the skirt instead of the cell. Step 1 and step 3 will show it: steps that are smaller than expected, or drift overnight.

## Regenerating

Dimensions live in `params.py`. Values marked `MEASURE` are still estimates:

| Parameter | Estimate | Measure |
| --- | --- | --- |
| `PANEL_T` | 15.9 mm | real plywood thickness ("5/8 in" is often 15.1) |
| `CELL_HOLE_INSET` | 12.5 mm | YZC-1B end face to hole centres |
| `STAKE_D` | 5.0 mm | stake shaft diameter |

```bash
pip install -r requirements.txt
python build.py
```

`build.py` rewrites every STL and PDF and stops if any check fails: each mesh closed and correctly wound, no two holes on a panel within 4 mm of each other (screws from opposite faces would collide), and nothing on the top side of either platform within 5 mm of the base side.

## Cover (optional)

One printed lid per platform (`*/cover.stl`, about 317 × 317 mm, so it needs the Prusa XL; submit it as full-serve). It sits on the top panel and its skirt hangs past both panels, 3 mm outside their edges, ending 5 mm below the base. Near each corner the skirt is notched up to 3 mm above the stake brackets, and the single-point cover has a notch for the cell cable. The four bucket tabs screw down through it into the top panel; nothing fastens it to the base. With the cover, use **#6 × 3/4 in** pan-head screws for the tabs. It takes the place of the edge hooks; the two can't be fitted together. It prints upside down with no supports.

## Outdoor feet (pick one per platform)

All three hold the head of the 5/16-18 × 2-1/2 in bolt that threads into the brass insert, so turning the foot by hand screws the bolt in or out to level; the lock nut under the panel then holds it. A dab of silicone in the hex pocket keeps the foot on the bolt when the platform is lifted. Print 4 of the chosen foot (5 perimeters, 30% infill).

| Option | Files | Best for |
| --- | --- | --- |
| A: cleated pad | `common/foot-a-cleated.stl` | Mud, snow, leaf litter: 100 mm pad spreads the load, tread grooves underneath grip, scalloped rim to turn by hand |
| B: ground spike | `common/foot-b-spike.stl` | Soft soil: 50 mm spike pushes in, the 64 mm collar stops it sinking further; resists sliding on slopes |
| C: swivel | `common/foot-c-swivel-ball.stl` + `common/foot-c-swivel-pad.stl` | Rocky or sloped ground: the 90 mm treaded pad tilts about 25° to sit flat, and the ball part turns to level while the pad stays put. Snap the ball into the pad (the slots flex). Print the pad in PETG; PLA may crack when snapping. |
| D: claw | `common/foot-d-claw.stl` | Roots and rocks: three toes always find footing; turn the hub to level. Print in PETG so the toes don't snap. |
| E: snowshoe | `common/foot-e-snowshoe.stl` | Deep snow and very soft ground: 150 × 90 mm oval with tread. |
| F: riser | `common/foot-f-riser.stl` | A corner over a dip or hole: 45 mm column on an 80 mm treaded pad adds reach beyond the bolt's travel. |
| G: staked pad | `common/foot-g-staked.stl` | Slopes and windy spots: 110 mm treaded pad with two stake holes, so each foot can be pinned after levelling. |

Feet can be mixed: for example riser feet on the downhill corners and cleated pads uphill.
