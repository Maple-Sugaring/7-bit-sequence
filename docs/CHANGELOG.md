# Changelog

Reconstructed from `git log` (newest first). There are no release tags or version numbers. Dates are commit dates.

| Date | Commit | Change |
| --- | --- | --- |
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
