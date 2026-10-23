# Spec: Fleet-wide interactive tree/node status map

**Created**: 2026-10-07
**Status**: draft
**Author**: team
**Epic**: none
**Issue**: Maple-Sugaring/7-bit-sequence#51 (EIR-004)

## Problem
The only maps today are the single-pin `LocationViewMap` and the deployment `LocationPicker` (PR #34). Collectors have no way to see where faulted or stale nodes are across the whole sugarbush, so they find problems by walking the list on the Dashboard.

## Goal
A collector can open one map, see every authorized node colour- and shape-coded by status, filter to a site, open a node and reach its detail page in two taps. Map status always equals the status shown on the Dashboard and Alerts.

## User Stories
- As a collector, I open the fleet map, filter to a site, spot a faulted or stale node, select it, review its readings, and go to the tree to flag or resolve the issue.
- As an admin, I see a mini-map on the Dashboard so I notice faulted nodes without leaving it.
- As a user on a phone or using a screen reader, I get the same information from a list as from the map.

## Requirements
### Must-have
- New `/map` page (main nav) and a Dashboard mini-map sharing one `FleetMap` component and one data hook.
- Markers for all nodes returned by `GET /nodes/board` that have valid coordinates; marker colour AND shape/icon encode status; legend with counts.
- Statuses: `fresh`, `stale`, `faulted`, `maintenance`, `offline`.
- Site filter and node search/select; selecting a node opens a popup with: last reading (weight, temp, ice, flow), `last_seen` and age, battery, RSSI, fault, and a link to `NodePage`.
- Nodes with missing/invalid coordinates are not drawn; listed under "No location" and counted in the legend.
- Overlapping/near-identical points render one marker with a single popup listing every node there.
- Accessible alternative list (same filter, same status text, links to `NodePage`), full parity with the map.
- Permissions: route and nav entry require `VIEW_DASHBOARD` or `VIEW_NODES`; others are redirected.
- Status derived in ONE shared frontend module used by `dashboardService`, `AlertsPage` badges and the map.
- Loading, empty, and error states; list still works if tiles fail.
- Works at phone width (list/map toggle, 44px tap targets).

### Nice-to-have
- Refetch on window focus and every 60s.
- Selected node and site filter in URL query params (`?site=&node=`).

### Out of scope
- Marker clustering, heatmaps.
- Editing locations (stays in `LocationPicker`), flag/resolve inside the popup (lives on `NodePage`).
- Push/live updates, offline tiles, routing/navigation.
- New backend endpoint or schema change.

## Data Model
None. Uses existing `node.latitude`, `node.longitude`, `node.status_code` (0-3), `last_seen`, `battery_level`, `signal_rssi`, and latest metrics already returned by `GET /nodes/board`.

## API Changes
None. Consumes `GET /nodes/board`. Status derivation (precedence, first match wins):
1. no `last_seen` -> `offline`
2. `status_code` = maintenance -> `maintenance`
3. active fault / fault alert -> `faulted`
4. `now - last_seen` > 45 min (mirrors BE `STALE_AFTER_MINUTES`) -> `stale`
5. otherwise -> `fresh`
(Exact `status_code` value mapping confirmed against `dashboardService` during planning.)

## UI Changes
- `src/pages/FleetMapPage.jsx`, route `/map`, nav item.
- `src/components/map/FleetMap.jsx` (+ `FleetMapLegend`, `FleetNodeList`, `NodePopup`), built on `mapCore`.
- Dashboard mini-map section using `FleetMap` in compact mode.
- `src/business/nodeMapStatus.js` shared status derivation and coordinate validation.

## Edge Cases
1. Null, `0,0`, out-of-range, or swapped lat/lon: no marker, listed under "No location".
2. Multiple nodes at the same/very close point: one marker, one popup listing all.
3. Recent `last_seen` but fault code -> faulted; no `last_seen` -> offline (not stale).
4. Role without `VIEW_NODES`/`VIEW_DASHBOARD`: no nav item, direct URL redirects.
5. Zero nodes, fetch failure, tile load failure: message shown, list still renders.
6. Status changes between refetches: marker, list and legend update together.
7. Phone width: list/map toggle, no horizontal scroll, 44px targets.
8. Status not conveyed by colour alone; popup and list keyboard-reachable.

## Testing Criteria
Happy path:
- Unit: `nodeMapStatus` precedence for each status; coordinate validation table.
- Component: FleetMap renders one marker per valid node; legend counts match; site filter narrows markers and list; popup links to `/nodes/:id`.
- Consistency: same fixture through Dashboard and map yields identical status per node.
Edge cases:
- Overlap grouping, missing coords listed, stale/faulted/offline fixtures, permission redirect, empty/error states, small-viewport toggle.
- E2E (Playwright): collector filters site -> opens faulted node -> lands on NodePage.

## Dependencies
- `react-leaflet`/`leaflet` (installed); `mapCore`, `mapConstants`.
- `GET /nodes/board`, `Capability.VIEW_DASHBOARD/VIEW_NODES`, `NodePage`.
- Related: #31, PR #26, PR #34.
