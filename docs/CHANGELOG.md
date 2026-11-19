# Changelog

Reconstructed from `git log` (newest first). There are no release tags or version numbers. Dates are commit dates.

| Date | Commit | Change |
| --- | --- | --- |
| 2026-11-18 | #154 | Recent collections list grouped by day with a daily total, aligned time/tree/volume columns, a volume bar scaled to the largest pull, and a Test tag only when test and live data are mixed. |
| 2026-11-18 | #153 | Collection: recording targets sorted and grouped by stand, so a stand never appears twice. Sap weight only is entered; the empty bucket is subtracted from the sensor reading in JS and added back before validating and saving (ice reweigh included). In-progress entries kept per tree in local storage. The form scrolls into view and focuses weight when the tree changes. |
| 2026-11-14 | #152 | **Year-to-year comparison (#68).** Sap data chart compares seasons, with a toggle and an option to sum readings across all nodes. |
| 2026-11-14 | #151 | RLES deploy: test that the deployed commit SHA survives a recreate. |
| 2026-11-12 | #150 | **Ice bucket reweigh (#131).** Collection flow and backend for reweighing a bucket after ice melts, plus a tutorial screen. |
| 2026-11-09 | #148 | Expanded RLES alpha demo fixtures (migration 025). |
| 2026-11-09 | #146 | Demo data restored in test mode (migration 024). |
| 2026-11-09 | #144 | Sensor health controls moved to the Admin page. |
| 2026-11-09 | #142 | **Measurement corrections and test data isolation.** Readings can be corrected with a revision and note, recorded in an append-only `audit_events` table. Collection logs keep their history after a node or bucket is deleted. A site-wide test/production data mode keeps test data, chart fixtures and alerts out of production views. Migrations 019 to 023. |
| 2026-11-08 | #62 | **Device health and sensor lifecycle.** Battery and signal report times per node; installation, replacement and maintenance events with a lifecycle card on the Deploy, Node and Dashboard pages (migration `019_sensor_lifecycle`). |
| 2026-11-07 | #141 | BigRep-printable enclosure with magnetic door catches. |
| 2026-11-05 | #140 | **Tutorials (#67).** Step-by-step calibration and solar hardware tutorials, plus UI tutorials for the Collection, Schedule and Deploy pages. |
| 2026-11-05 | #139 | Metric aggregation (BRU-007): history and consistency preserved during retention (migration 018). |
| 2026-11-05 | #138 | Collections tagged with MSS or student role and colour (#36). |
| 2026-11-05 | #137 | Logout restored (#136). |
| 2026-11-05 | #135 | Dark mode toggle. |
| 2026-11-05 | #134 | ADA/WCAG and colour contrast accessibility fixes (#48). |
| 2026-11-03 | #130 | Calibration card shows live platform state, open faults, command progress and a Cancel button; a load-cell fault disables Tare and Calibrate; checks use fresh readings. `GET /nodes/:id/calibration` returns live state and last scale; `DELETE` cancels a waiting command (#129). |
| 2026-11-03 | #133 | Deploy page layout fixed at tablet widths. |
| 2026-10-25 | #128 | Mobile walkthrough tour simplified, with a compact header. |
| 2026-10-25 | #126 | **Node firmware 2.0.** Rewritten in modules with host unit tests (`pio test -e native`). A missing or unpowered HX711 is now a `load-cell` fault instead of a fake 0.00 lb reading. A DT/SCK swap is detected and corrected. Faults are confirmed over three bursts. Battery voltage and percentage come from the solar pack on the SH1.25-2P port (no value when there is no pack), with low-pack deep sleep. Light sleep between reports, plus a 2-minute service mode on boot or PRG. Hardware-I2C OLED, task watchdog, pinned library versions. The API resolves a node's other fault alerts when a new fault arrives. The gateway stops reporting a missing battery as 100% and accepts 16-character codes. `scripts/publish-web-flasher.sh` publishes the image (firmware 2.0.0). |
| 2026-10-24 | #125 | App layouts fit device width. |
| 2026-10-24 | `3bcef54` | Admin gateway access button. |
| 2026-10-23 | #117, #119, #121, #123 | **RLES deploy.** Manual GitHub Actions deploy to RLES on a self-hosted runner, with a Compose overlay and the commit marker preserved on recreate. |
| 2026-10-23 | #115 | Only node faults that persist are reported. |
| 2026-10-23 | #113 | Raspberry Pi gateway page restyled to match the app and shows downlinks. |
| 2026-10-23 | #112 | RIT user emails always saved as `g.rit.edu`. |
| 2026-10-23 | `df72be8`, `06e0311` | Email sent through the Gmail API so alerts stop bouncing; no duplicate escalation emails on retry. |
| 2026-10-23 | #110 | **Load-cell calibration over LoRa.** Tare and test-weight calibration from the app (`calibration_commands`, migration 016, `GET`/`POST /nodes/:id/calibration`); report intervals down to 10 s; load-cell platform designs. |
| 2026-10-20 | `58a4c51`…`e59c09b` | Responsive landing page with WINT-010 panel, RIT typography and branding, simplified telemetry preview. |
| 2026-10-20 | #105 | Sign-in returns to the user's previous location (#73). |
| 2026-10-19 | #108 | Mobile navigation and field dashboard redesigned. |
| 2026-10-07 | `e284e52`, `cea68f8` | Mock frontend deployed to Vercel from `main`; mock-mode feedback goes to Discord. |
| 2026-10-07 | #93 | Demo polish: role-aware login redirects, alerts hidden from MSS, tree actions gated by capability with confirmations, schedule spot counts. |
| 2026-10-07 | #92 | Shelf life tracked per bucket batch instead of per tree, accumulated by temperature. |
| 2026-10-07 | #91 | UI consistency: map popup, headings, mobile overflow, admin actions. |
| 2026-10-07 | #87 | Sugar Woods: deselecting all trees no longer reselects them. |
| 2026-10-07 | #89 | **Fleet status map (#51).** Interactive tree/node status map, dashboard card, and one shared node status chip across pages. |
| 2026-10-07 | `aaa353b` | AWS deployment retired; Terraform made manual. |
| 2026-10-07 | #84, `2c08ba1` | Navigation consolidated (#70). RIT server Compose overlay and auto-pull deploy timer. |
| 2026-10-06 | #80 | **Collections rework (#28).** Round-based entry, optional sugar content, one-save API. |
| 2026-10-06 | #75 | CSV-matching PDF export on Sugar Woods (FR-010, #63). |
| 2026-10-06 | #78 | Schedule and Schedule Admin pages combined (#77). |
| 2026-10-06 | #76 | Mobile view, profile menu and schedule filters (#29). |
| 2026-10-06 | `9c4b841` | **Auth sessions.** 15-minute access token plus 30-day refresh token in a `sessions` table, with rotation, reuse detection and log out everywhere. |
| 2026-10-06 | #74 | **Sponsor demo.** Sample data for every screen in mock mode, hybrid calendar/email mode, editable and deletable gateway deployments with a map location picker. |
| 2026-10-06 | #72, `28565f1`, `1ea1d77` | Collection auto-fill verified (FR-006/007); notification bell opens the notifications page (EIR-010); temporary EC2 hosting for demos. |
| 2026-10-05 | #33 | Email notifications via Brevo (SMTP/SMS kept), shift reminders, notification preferences, profile page (migrations 012, 013), Docker permission fix. |
| 2026-10-05 | `ca2e170` | **Real field data (#26).** Deploy page; browser Heltec flasher with prebuilt `field` firmware under `Maple-Sugar-FE/public/firmware/`; node firmware reads a real HX711 load cell (tare, calibration, faults, interval downlink); gateway firmware and the Raspberry Pi USB gateway app; `POST /nodes`, `/gateways`, node details and interval routes; `deploy_nodes` capability (Admin and MSS); migrations 009 to 011 (two tracked nodes, `rf_tag` and `notes`, drop fixture metrics and alerts); `clearSeededData` on boot; node health watch, housekeeping jobs, ingest spool buffer; email and SMS alert notifications; dashboard, collection, notifications, and schedule polish; offline collection queue; nginx `/firmware/` no-cache. |
| 2026-09-30 | `24e09f2` | **Mock logins per role (#23).** Login page shows one button per role in mock mode. |
| 2026-09-25 | `c023634` | Discord notification reduced to one link. |
| 2026-09-25 | `408580f` | Discord webhook sends a custom User-Agent. |
| 2026-09-25 | `52ec18e` | CI: notify Discord on pushes to `main`. |
| 2026-09-25 | `9fecff1` | CI: frontend checks run on every pull request. |
| 2026-09-25 | `697260d` | **Sensor data endpoint (#8).** `POST /ingest` with gateway token. |
| 2026-09-25 | `68401f8` | CI: frontend lint and build. |
| 2026-09-25 | `f53da17` | Enzo's frontend and backend as the new baseline (#1). |
| 2026-09-17 | `fd45927` | Remove `node_modules`, add to `.gitignore`. |
| 2026-09-02 | `334322c` | Initial commit with `README.txt`. |

## Unmerged remote work

See [HANDOFF.md](HANDOFF.md#in-progress-or-not-confirmed): `30-email-notifications` and `31-edit-gateway-deployments` have commits not in `main`.
