# Design: Fleet status map (issue #51)

Stack: MUI + emotion theme (`src/theme`), react-leaflet via `BaseMap`. Alerts live at `/notifications`.

## Status encoding (colour + shape + text, never colour alone)
| Status | Marker | Colour token | Label |
|---|---|---|---|
| fresh | filled circle | success | Fresh |
| stale | hollow circle, clock glyph | warning | Stale |
| faulted | triangle, "!" | error | Faulted |
| maintenance | square, wrench | info | Maintenance |
| offline | grey ring, slash | text.disabled | Offline |
Markers are `L.divIcon` with inline SVG; each has `aria-label="<node> - <status>"`.

## /map (desktop >= 900px)
- Header: title, "Updated 12s ago" + refresh button.
- Left rail (360px): site select, search, legend chips with counts (click toggles status filter), then the node list (sorted faulted > stale > offline > maintenance > fresh). A "No location (n)" group sits at the bottom.
- Right: map fills the remaining height. Selecting a list row pans/zooms and opens the popup; selecting a marker highlights its row.
- Popup: node name + status chip, last reading (weight, temp, ice, flow), last seen (relative + absolute on hover), battery, RSSI, fault text, button "Open node" -> `/node/:id`. At a shared point, the popup lists each node as a compact row with its own "Open" link.

## /map (phone < 900px)
- Sticky filter bar (site + status chips, horizontally scrollable).
- Segmented toggle "Map | List" (list is default for screen readers via order; remembered per session).
- Map is full-bleed 70vh; selecting a marker opens a bottom sheet with the popup content. All targets >= 44px.

## Dashboard mini-map
- Card "Fleet map" 260px high, scroll-wheel zoom off, legend as a single line of counts, link "Open full map" -> `/map`. Clicking a marker shows the same popup.

## States
- Loading: skeleton rail + grey map placeholder. Empty: "No nodes deployed yet" with link to /deploy (if permitted). Error: inline alert with Retry; list shows last good data if any. Tile failure: map area shows notice, list unaffected.

## Accessibility
- List is the full alternative (same filters, same status text). Rows are links. Focus moves to the popup heading on open; Esc closes. Respect `prefers-reduced-motion` (no fly-to animation). Contrast checked in light and dark modes.
