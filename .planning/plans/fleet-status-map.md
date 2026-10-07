# Plan: Fleet-wide interactive tree/node status map

**Spec**: .planning/specs/fleet-status-map.md
**Design**: .planning/specs/fleet-status-map.design.md
**Epic**: none
**Created**: 2026-10-07
**Status**: draft
**Stack**: frontend only (Maple-Sugar-FE, React + MUI + react-leaflet, Vitest). No backend change.

## Corrections to spec after codebase review
- Node detail route is `/nodes/:nodeId`; alerts route is `/notifications`.
- Status codes: 0 offline, 1 online, 2 degraded, 3 maintenance. `nodeService.getDeviceHealth()` already returns `isStale`, `minutesSinceSeen`, `latitude`, `longitude`, `gatewayName`; FE already defines `STALE_AFTER_MINUTES = 45`. Reuse, do not duplicate.
- Board has no fault field: "faulted" = `Status_Code === 2` OR node has an open fault-type alert (join from alertService).
- Nav items live in `src/routes/navigation.js`; routes in `src/routes/AppRoutes.jsx` (PROTECTED table with capability).

## Components
| Component | Type | Purpose |
|---|---|---|
| nodeMapStatus | business module | `deriveMapStatus(node, {faultNodeIds})`, `validCoordinates`, `groupByLocation`, status metadata (label, severity, shape) |
| useFleetMap | hook | loads device health + open alerts, returns nodes with `mapStatus`, sites, counts, refresh (focus + 60s) |
| FleetMap | component | BaseMap + status markers (divIcon), selection, popup |
| FleetMapLegend | component | status chips with counts, toggles filter |
| FleetNodeList | component | accessible list alternative + "No location" group |
| NodePopupContent | component | readings, health, "Open node" links (single popup lists all nodes at a point) |
| FleetMapPage | page | `/map` layout: filters, rail, map; mobile toggle |
| FleetMapCard | component | Dashboard mini-map |

## New files
| File | Location | Purpose |
|---|---|---|
| nodeMapStatus.js | Maple-Sugar-FE/src/business/ | status derivation, coords validation, grouping |
| useFleetMap.js | Maple-Sugar-FE/src/services/hooks/ | data hook |
| FleetMap.jsx, FleetMapLegend.jsx, FleetNodeList.jsx, NodePopupContent.jsx, statusMarker.js | Maple-Sugar-FE/src/components/map/ | map UI |
| FleetMapCard.jsx | Maple-Sugar-FE/src/components/map/ | Dashboard embed |
| FleetMapPage.jsx | Maple-Sugar-FE/src/pages/ | page |
| fleetMapStatus.test.js, fleetMapView.test.jsx | Maple-Sugar-FE/test/ | tests |

## Files to change
| File | What | Why |
|---|---|---|
| src/routes/AppRoutes.jsx | lazy `/map` route, capability VIEW_DASHBOARD | page + permission redirect |
| src/routes/navigation.js | "Map" nav item | discoverability, hidden w/o capability |
| src/pages/DashboardPage.jsx | render FleetMapCard | mini-map |
| src/services/dashboardService.js | use `deriveMapStatus` for online/degraded/offline counts if feasible, else assert parity in test | consistency requirement |
| src/pages/AlertsPage.jsx (only if it renders node status badges) | use shared status | consistency |

## Tasks
### Phase 1: Status logic (TDD)
| # | Task | Files |
|---|---|---|
| 1 | Tests then impl: `deriveMapStatus` precedence (offline > maintenance > faulted > stale > fresh), `validCoordinates` (null, 0/0, range, swapped), `groupByLocation` (round to ~5 decimals) | test/fleetMapStatus.test.js, src/business/nodeMapStatus.js |
| 2 | Parity test: Dashboard counts vs map statuses for the seed fixture; adapt dashboardService to shared logic | test/fleetMapStatus.test.js, src/services/dashboardService.js |

### Phase 2: Data (depends on 1)
| # | Task | Files |
|---|---|---|
| 3 | `useFleetMap` hook: device health + open fault alerts, derive status, sites, counts, refetch on focus/60s, error keeps last good data | src/services/hooks/useFleetMap.js |

### Phase 3: Components (depends on 1; 4, 5, 6 parallel)
| # | Task | Files |
|---|---|---|
| 4 | `statusMarker.js` divIcon SVGs (shape + colour + aria) and `FleetMapLegend` | src/components/map/statusMarker.js, FleetMapLegend.jsx |
| 5 | `NodePopupContent` (single popup for co-located nodes, links to `/nodes/:id`) | src/components/map/NodePopupContent.jsx |
| 6 | `FleetNodeList` incl. "No location" group, sorted by severity, rows are links | src/components/map/FleetNodeList.jsx |
| 7 | `FleetMap` composing BaseMap + markers + selection sync + reduced-motion fly-to | src/components/map/FleetMap.jsx |

### Phase 4: Pages (depends on 3, 7)
| # | Task | Files |
|---|---|---|
| 8 | `FleetMapPage`: filters (site, search, status chips), desktop rail + map, mobile Map/List toggle + bottom sheet, loading/empty/error states, URL params `?site=&node=` | src/pages/FleetMapPage.jsx |
| 9 | Route + nav item (permission gated) | src/routes/AppRoutes.jsx, src/routes/navigation.js |
| 10 | `FleetMapCard` on Dashboard | src/components/map/FleetMapCard.jsx, src/pages/DashboardPage.jsx |

### Phase 5: Verify
| # | Task | Files |
|---|---|---|
| 11 | Component tests (markers per valid node, legend counts, filter, overlap popup, no-location list, empty/error, permission redirect) | test/fleetMapView.test.jsx |
| 12 | `yarn build`, `yarn lint`, `yarn test`; browser QA at desktop and 375px | n/a |

| Parallel group | Tasks | Why |
|---|---|---|
| A | 4, 5, 6 | independent files |
| Sequential | 1 -> 2 -> 3 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 | each needs prior output |

## Testing plan (traced to spec)
- Status precedence, coordinate validation, grouping -> spec edge cases 1-3.
- Dashboard/map parity -> consistency requirement, edge case 6.
- Component: markers/legend/filter/popup links -> must-haves; overlap -> edge case 2.
- Permission redirect -> edge case 4; empty/error/tile failure -> edge case 5.
- Small screen toggle and a11y roles/labels -> edge cases 7-8.
- E2E Playwright (if `e2e/` exists, else browser QA via preview): site filter -> faulted node -> NodePage.

## Risks / open items
- Verify how fault packets set `Status_Code`/alerts so "faulted" matches Alerts exactly (task 1 starts by reading `alertService` + seed).
- Test infra for `.jsx` component tests (jsdom, Testing Library) may need adding; check vitest config in task 11, add devDependencies only if missing.
