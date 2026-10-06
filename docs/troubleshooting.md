# Troubleshooting

## Web app and API

| Symptom | Likely cause and fix |
| --- | --- |
| API exits at boot with "Invalid configuration" | A required variable is missing: `DATABASE_URL`, `JWT_SECRET` (32+ chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. The message lists each. |
| `docker compose up` fails: env file required | Create `Maple-Sugar-BE/.env` from `.env.example`. The `api` service marks it required. |
| `/api/api/...` 404s | Express routes are mounted at the root. nginx and the Vite proxy strip `/api`; do not add an `/api` prefix inside Express. |
| UI loads but every call returns 502 | The `api` container is down or `API_UPSTREAM` is wrong. nginx resolves it per request. Check `docker compose ps` and `logs api`. |
| Google error `redirect_uri_mismatch` | `PUBLIC_API_URL` must match the registered redirect URI byte for byte, no trailing slash. Register both `/auth/google/callback` and `/auth/google/calendar/callback`. |
| Sign in returns `NOT_PROVISIONED` | The email has no invite. Add it on the Admin page or in `BOOTSTRAP_ADMIN_EMAILS`. |
| `ACCOUNT_EXPIRED` | User inactive or past `Account_Expiry`. Admin can extend or unlock. |
| Sign in works but session is lost | Cookie origin mismatch: open the app at the host in `PUBLIC_WEB_URL`, send credentials, and set `CORS_ORIGINS` for any extra origin. |
| `/health` returns 503 | Postgres unreachable. Redis problems alone do not cause 503. |
| Slow or stale data, cache warnings in logs | Redis down; the API falls back to SQL. Safe to ignore or fix `REDIS_URL`. |
| Calendar features say connect Calendar (409 `CALENDAR_REQUIRED`) | The user has no stored refresh token. Sign in again to grant Calendar, or use `/auth/google/calendar`. |
| After rotating `JWT_SECRET`, Calendar sync fails | Refresh tokens were encrypted with a key derived from the old secret. Users must reconnect Calendar. |
| Live weather panel empty | `OPENWEATHER_API_KEY` is unset (`Configured: false`) or the call failed (502 `WEATHER_FAILED`). |
| White screen in Vite dev | MUI CJS helpers not pre-bundled; `optimizeDeps.include` in `vite.config.js` exists for this. Clear `node_modules/.vite`. |
| Mock login buttons missing | `VITE_API_MODE` is not `mock` (the tracked `Maple-Sugar-FE/.env` sets `http`). Use `.env.local`. Restart Vite. |
| Mock login buttons visible in a deployed build | The image was built with `VITE_API_MODE=mock`. Rebuild with `http`. |
| My changes to a Vite env var do nothing in Docker | VITE values are baked at build time. `docker compose build web`. |
| A fixture node or shift keeps disappearing | By design: `clearSeededData` deletes fixture rows on every API start. Create real ones from Deploy and the Schedule page (admin panel). |
| CI fails "env sync" | You added or removed an env var read in `config.js` without updating `.env.example` (or vice versa). |

## Hardware: flashing from the Deploy page

| Symptom | Fix |
| --- | --- |
| "USB flashing needs Chrome or Edge" | Web Serial is unavailable. Use Chrome or Edge on desktop. |
| "Chrome could not open the bootloader" | Hold PRG, tap RST, release PRG, then press Flash (or Clear flash) once. Try another USB cable (data, not charge-only). |
| "This site is not serving the Heltec firmware yet" or "firmware ... is empty" | `/firmware/manifest.json` or a part is missing or tiny. Check `Maple-Sugar-FE/public/firmware/` and the nginx `/firmware/` location. |
| Board boots but OLED says "No node code" | Identity block at `0x670000` missing. Flash again from Deploy. |
| Board never starts after a manual flash | The field image is built DIO; a QIO write bricks boot on the V3. The web flasher uses `dio`. |
| Chrome crashes on repeated resets (macOS) | The flasher connects once by design. Do not retry rapidly; unplug and replug. |
| Reading shows `untared` / "No load cell" on OLED | Hold PRG 3 s with an empty platform. "No load cell" means check the HX711 wiring on GPIO 6 and 7. |
| Fault alerts `unstable` or `reversed` | Electrical noise or cell wired backwards; see node firmware thresholds in [hardware.md](hardware.md). |

## Hardware: radio and Pi

| Symptom | Fix |
| --- | --- |
| Pi page stays "Waiting for packets" | Antennas on all boards; nodes powered and past their first TX (node 002 waits 10 s on the `node_002` build); same radio settings (915.125 MHz, SF9, BW125, CR 4/5, sync 0x12); gateway OLED should leave "Waiting for nodes". |
| Pi cannot open the serial port | `ls -l /dev/ttyACM0`; set `GATEWAY_SERIAL` to the right tty; `sudo usermod -aG dialout "$USER"` and log in again. |
| Pi shows readings but server shows nothing | `FORWARD_TO_SERVER=1`? Token set? Read the forward status on the Pi page: 401 bad token, 422 rejected (read the detail), 503 server has no `GATEWAY_INGEST_TOKEN`. |
| 422 on ingest | Unknown `Node_Code`, node registered to a different gateway than `GATEWAY_CODE`, or weight failed bucket rules (above ~10 gal gross, or ice ~14 gal). Register the node on Deploy under the right gateway. |
| Same reading counted twice | It is not: the same node and `Recorded_At` returns `Duplicate: true`. |
| Node ignores interval change | Interval is delivered as a downlink right after a node transmits; the Pi only sends it after an accepted reading whose `Desired_Interval_Seconds` differs. Wait one packet. Valid range 60 to 86400 s. |
| Node Offline / Missed Readings alerts | No reading for 45 minutes (offline) or two intervals (late). Check power, antenna, Pi, network. Nodes set to Maintenance are skipped. |
| `pio` upload fails on a Mac | `platformio.ini` pins `/dev/cu.usbserial-0001`. Edit `upload_port` and `monitor_port`. |
