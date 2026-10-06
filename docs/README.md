# Maple Sugaring documentation

Project documentation for the RIT Maple Sugaring monitoring system (7-Bit Sequence, ISTE 501). It covers the web app, the API, the LoRa hardware, and the Raspberry Pi gateway.

Everything here was written from the code at the commit recorded in [HANDOFF.md](HANDOFF.md). Anything the code does not settle is marked **TODO**. No secrets or real credentials appear in these docs.

## Start here

| If you want to... | Read |
| --- | --- |
| Understand how the pieces fit | [architecture.md](architecture.md) |
| Run the app on your machine | [setup-development.md](setup-development.md) |
| Look at the UI with no backend and sign in as each role | [roles-and-logins.md](roles-and-logins.md) |
| Put it on a server, run CI, or get Discord push alerts | [operations.md](operations.md) |
| Look up an environment variable | [configuration.md](configuration.md) |
| Fix something that is broken | [troubleshooting.md](troubleshooting.md) |
| Take over the project | [HANDOFF.md](HANDOFF.md) |

## Components

| Component | Folder | Guide |
| --- | --- | --- |
| React web app | `Maple-Sugar-FE/` | [frontend.md](frontend.md) |
| Express API | `Maple-Sugar-BE/` | [backend.md](backend.md) |
| Deploy page and browser flasher | `Maple-Sugar-FE/src/pages/DeployPage.jsx`, `src/hardware/heltecFlash.js` | [deploy-and-flasher.md](deploy-and-flasher.md) |
| Heltec firmware (node, gateway, HX711 test) | `firmware/` | [hardware.md](hardware.md) |
| Raspberry Pi gateway | `gateway/raspberry-pi/` | [hardware.md](hardware.md#raspberry-pi-gateway) |
| Shift schedule | Frontend pages plus `/schedule/*` routes | [schedule.md](schedule.md) |
| CI and Discord notification | `.github/` | [operations.md](operations.md#ci) |

## Existing backend docs

`Maple-Sugar-BE/docs/` is the detailed backend reference (schema, HTTP API, repositories, services, business rules, tests). It is still the best source for those topics, but parts are behind the code. [HANDOFF.md](HANDOFF.md#known-documentation-drift) lists exactly which parts.

| Doc | Topic |
| --- | --- |
| [ddl.md](../Maple-Sugar-BE/docs/ddl.md) | Postgres schema (written at migration 008) |
| [api.md](../Maple-Sugar-BE/docs/api.md) | HTTP routes, auth, errors |
| [dal.md](../Maple-Sugar-BE/docs/dal.md) | Repositories and JSON field names |
| [services.md](../Maple-Sugar-BE/docs/services.md) | Service layer |
| [business.md](../Maple-Sugar-BE/docs/business.md) | Roles, thresholds, alert rules |
| [testing.md](../Maple-Sugar-BE/docs/testing.md) | Test coverage |

## Conventions

- Paths are relative to the repository root unless stated.
- The browser always calls `/api/...`. nginx (or the Vite dev proxy) strips `/api`, so Express routes are mounted at the root. Docs that list "API routes" give the Express path.
- JSON field names such as `Node_Code` and `Recorded_At` are the API contract. Do not rename them.
