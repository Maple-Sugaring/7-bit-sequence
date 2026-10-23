# Hardware: Heltec firmware and Raspberry Pi gateway

This is not LoRaWAN. Raw LoRa point to point with RadioLib.

```
Heltec NODE --LoRa JSON--> Heltec GATEWAY --USB serial--> Raspberry Pi :8080 --HTTPS--> /api/ingest
                                       <-- INTERVAL <code> <s> | CMD <code> <id> TARE|CAL <lb> -- (Pi writes back over USB)
```

## Radio settings (must match on every board)

| Setting | Value |
| --- | --- |
| Frequency | 915.125 MHz |
| Spreading factor | 9 |
| Bandwidth | 125 kHz |
| Coding rate | 4/5 |
| Sync word | `0x12` |
| TX power | 22 dBm |
| Preamble | 8 |

Always attach the antenna before a board transmits.

## Firmware projects (`firmware/`, PlatformIO, board `heltec_wifi_lora_32_V3`, Arduino framework, libs `RadioLib` and `U8g2`)

| Project | Environments | Purpose |
| --- | --- | --- |
| `heltec-v3-node` | `node_001`, `node_002`, `field` | Weighs a bucket and transmits. |
| `heltec-v3-gateway` | `gateway` | Receives LoRa, prints JSON lines to USB, forwards `INTERVAL` commands from the Pi. |
| `hx711-test` | `heltec_v3` | Bench sketch that shows raw HX711 readings on the OLED. |

`platformio.ini` hard-codes `upload_port` and `monitor_port` to `/dev/cu.usbserial-0001` (a Mac). Change them if the board enumerates elsewhere.

### Node firmware (`heltec-v3-node/src/main.cpp`)

Environments:

| Env | `NODE_CODE` | Notes |
| --- | --- | --- |
| `node_001` | `NODE-001` | `TX_OFFSET_MS=0` |
| `node_002` | `NODE-002` | `TX_OFFSET_MS=10000` so the two nodes do not collide |
| `field` | `MAPLENODE00000000` placeholder | The image the website flashes. Node code is stamped into flash at `0x670000` by the web flasher. `TX_INTERVAL_MS=20000`. |
| `field_four_cell` | same as `field` | `field` plus `-DLOAD_CELL_FOUR_HALF_BRIDGE` for the four-cell platform. Flash from a laptop (`pio run -e field_four_cell -t upload`); the website only serves `field`. Keeps the stamped node code. Run `CAL <pounds>` once after flashing. |

Hardware: HX711 on GPIO 6 (DT) and 7 (SCK); load cell Guang Ce YZC-1B, 50 kg, 2.0 mV/V (`CELL_CAL_REV 2`), or with `LOAD_CELL_FOUR_HALF_BRIDGE` four 50 kg half-bridge cells as one bridge, 200 kg, about 2.1 mV/V measured on NODE-001 (`CELL_CAL_REV 3`); channel A gain 128, counts per pound from those figures until `CAL` stores a measured value. Switching sensor type discards the stored zero and calibration and tares again on the next reading; OLED SSD1306 on GPIO 17/18/21; battery ADC GPIO 1 (enable 37); PRG button GPIO 0. The USB-C jack is a CP2102 on UART0 (GPIO 43/44), which is what the web flasher and a laptop open.

Identity: at boot the node reads `MAPLEID1` + code at flash `0x670000` (written by the web flasher). Otherwise it uses a compiled `NODE_CODE` that is not the placeholder. If neither, the OLED says "No node code / Flash again from Deploy" and the node idles.

Behavior (loop):

- Reads the HX711 averaged, tares on first good reading, then every `txIntervalMs` transmits a reading.
- Reads the HX711 with a 10 µs clock half-period. At 1 µs the four-cell cable had not settled when DT was read, so bits 12 and 16 flipped and the weight jumped about 6.8 lb. A reading needs 6 good samples of 10, so one slow conversion is not a `load-cell` fault. The node stays awake (no deep sleep), so the OLED is always live.
- Hold PRG for 3 seconds to tare ("Taring..." then blink). Do this with an empty platform.
- After transmitting it listens for 4 s for one downlink addressed to its code (`"Node_Code":"<code>"`). An `Interval_Seconds` is applied (10 to 86400 s) and persisted in NVS (`Preferences` namespace `maple`). A `Command_Id` with `Action` `TARE` or `CAL` (+ `Pounds`) queues a tare or a test-weight calibration; see [Calibration from the app](#calibration-from-the-app).
- Up to 750 ms of random jitter is added to each packet so two nodes on the same interval do not keep colliding.
- Faults are sent instead of weight: `load-cell` (no HX711, or ten identical samples, which means DT is stuck), `untared`, `unstable` (the samples in one reading spread over 0.3 lb, ignoring the highest and lowest, for 3 readings in a row), `reversed` (more than 0.3 lb below tare). Both limits are in pounds, converted with the current counts per pound.

Serial commands (newline terminated, on USB or UART0):

| Command | Effect |
| --- | --- |
| `PROVISION {"Node_Code":"...","Rf_Tag":"..."}` | Store identity; replies `PROVISIONED`. |
| `FACTORY` | Clear identity; replies `CLEARED`. |
| `TARE` | Queue a tare; replies `TARE queued`. |
| `CAL <pounds>` | With a known weight on the cell, set counts/lb; replies `CAL ok` or `CAL failed`. |

LoRa uplink payload (node to gateway):

```json
{"Node_Code":"NODE-001","Weight":35.9,"Battery_Percent":88,"Interval_Seconds":20}
{"Node_Code":"NODE-001","Fault":"unstable","Battery_Percent":88,"Interval_Seconds":20}
```

`Interval_Seconds` is the node's current packet interval (verified in `sendScaleReading` and `sendFault`). Weight is gross pounds including the bucket, floored at 0.

For three packets after it applies an app command, the node also sends `"Command_Id":N,"Command_Ok":1|0,"Counts_Per_Lb":10246`.

### Calibration from the app

The tree page (Admin and MSS) has a *Calibrate the scale* card: tare with the platform empty, put a known test weight on and enter its pounds, then check the reading.

```
App --POST /nodes/:id/calibration--> API (calibration_commands: pending)
Node packet --> Pi --> API: reply Accepted[0].Command {Command_Id, Action, Pounds} (status sent)
Pi --CMD NODE-001 31 CAL 7.875--> gateway --LoRa {"Node_Code","Command_Id","Action","Pounds"}--> node
Node applies it, sends a packet 1.5 s later with Command_Id/Command_Ok/Counts_Per_Lb
API settles the command (done or failed); the page polls GET /nodes/:id/calibration
```

- The Pi sends one downlink per packet; a waiting command goes before an interval change.
- The API resends an open command on every packet until the node echoes its id, so a missed downlink costs one interval. The node keeps the last applied id in NVS (`cmd_id`) and does not apply the same id twice, even after a reboot; it repeats the echo instead.
- A new request replaces one that is still waiting (`cancelled`).
- `CAL` fails (`Command_Ok` 0) when the reading moved less than 1000 counts from the tare, which means no weight was on the platform.
- Each step takes about one packet interval. Set the tree to 10 s on Deploy for a demo, then back to 900 s.
- Serial `TARE` and `CAL <pounds>` still work over USB and do not touch the command id.

### Gateway firmware (`heltec-v3-gateway/src/main.cpp`)

Receives packets, extracts `Node_Code`, `Weight` or `Fault`, `Battery_Percent`, optional `Interval_Seconds`, adds `Signal_Rssi`, and prints one JSON line on USB:

```json
{"Node_Code":"NODE-001","Weight":35.90,"Battery_Percent":88,"Signal_Rssi":-74}
```

It also prints plain-text `[rx]`/status lines that the Pi ignores. Lines from the Pi starting `INTERVAL <node_code> <seconds>` (10 to 86400) are transmitted to that node as `{"Node_Code":"...","Interval_Seconds":N}`. Lines `CMD <node_code> <id> TARE` and `CMD <node_code> <id> CAL <pounds>` are transmitted as `{"Node_Code":"...","Command_Id":N,"Action":"TARE"}` or with `"Action":"CAL","Pounds":7.875`. Command echo fields from a node (`Command_Id`, `Command_Ok`, `Counts_Per_Lb`) are passed through on the JSON line.

### Flashing from a laptop (alternative to the Deploy page)

```bash
cd firmware/heltec-v3-node
pio run -e node_001 -t upload     # one board at a time
pio run -e node_002 -t upload
pio device monitor

cd ../heltec-v3-gateway
pio run -e gateway -t upload      # leave plugged into the Pi
```

The root `README.md` still describes dummy sap readings (a quarter gallon per packet at 8.34 lb per gallon). The current node firmware reads the real load cell; see [HANDOFF.md](HANDOFF.md#known-documentation-drift).

## Raspberry Pi gateway

`gateway/raspberry-pi/` (`app.py`, `receiver.py`, `templates/index.html`, `requirements.txt`, `config.example.env`). It does not use the SX1262 hat; it only reads the gateway Heltec over USB.

Install and run on the Pi:

```bash
sudo apt update && sudo apt install -y python3-pip python3-venv
cd gateway/raspberry-pi
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # pyserial, requests, flask
cp config.example.env .env
python3 app.py                      # dashboard on http://<pi-ip>:8080
```

If opening the port is denied: `sudo usermod -aG dialout "$USER"`, then sign in again. The board is normally `/dev/ttyACM0`.

Environment (`.env`, loaded by `receiver.load_env`; existing environment variables win):

| Variable | Default | Meaning |
| --- | --- | --- |
| `GATEWAY_SERIAL` | `/dev/ttyACM0` | Serial device of the gateway Heltec. |
| `GATEWAY_BAUD` | `115200` | |
| `DASHBOARD_HOST` | `0.0.0.0` | Flask bind address. |
| `DASHBOARD_PORT` | `8080` | Flask port. |
| `FORWARD_TO_SERVER` | `0` | `1` also POSTs to the API. Leave `0` until the local page shows both nodes. |
| `GATEWAY_CODE` | `GW-ALUMNI` | Must match a gateway registered on Deploy. |
| `MAPLE_API_URL` | `https://maplesugaring01.webdev.gccis.rit.edu/api/ingest` | Ingest endpoint. |
| `GATEWAY_INGEST_TOKEN` | empty | Must equal the API's `GATEWAY_INGEST_TOKEN`. Never commit. |

How it behaves (`receiver.py`):

- A background thread reads lines; only lines starting with `{` are parsed. Requires `Node_Code` and either `Weight` or `Fault`; optional `Battery_Percent`, `Signal_Rssi`, `Interval_Seconds`.
- `Recorded_At` is the Pi's UTC clock when the line arrived.
- With forwarding on, each reading is POSTed as `{"Gateway_Code": ..., "Readings": [one]}` with header `X-Gateway-Token`, up to 3 attempts, 12 s timeout, same body each retry (so the API deduplicates).
- If the response carries `Accepted[0].Command`, the Pi writes `CMD <code> <id> TARE` or `CMD <code> <id> CAL <pounds>` back to the gateway. Otherwise, if `Accepted[0].Desired_Interval_Seconds` differs from the node's reported interval, it writes `INTERVAL <code> <seconds>`. Command echo fields are forwarded to the API.
- Tests: `python3 -m unittest test_receiver` (with `requirements.txt` installed).
- HTTP statuses: 201 saved, 200 duplicate or accepted, 401 bad token, 422 rejected, 503 server has no token set. The last 20 packets are kept in memory.
- Local routes: `GET /` (page) and `GET /api/packets` (JSON snapshot: radio status, rx count, last packets and their forward result).

Proof the link works: the page shows "Link up" and the node codes. The Pi does not queue readings across restarts or long outages (retries are only the 3 immediate attempts). **TODO**: confirm whether data loss during a long server outage is acceptable.

## Ingest contract (what the Pi posts)

See `Maple-Sugar-BE/docs/api.md#sensor-ingest`. Summary: `POST /ingest` with `X-Gateway-Token`; body is one reading or `Readings` (max 32) plus `Gateway_Code`; weight is gross pounds; air temperature is ignored; response includes `Accepted` (with `Desired_Interval_Seconds`) and `Rejected`; duplicate node plus timestamp returns the existing row. A `Fault` of `load-cell`, `unstable`, `reversed`, or `untared` raises an alert instead of storing a weight (`business/alerting.js` `alertForFault`). If Postgres is unreachable the API answers 202 `Buffered: true` and replays later.

## Deployment notes

- One hub indoors near a window and power. A Pi per site is planned (gateway codes `GW-ALUMNI`, `GW-CHABAD`, `GW-BARN` in the API docs); the current live setup is `GW-ALUMNI` with `NODE-001` and `NODE-002`. Migration `009_two_nodes.sql` set only those two nodes as tracked.
- Pi auto-start (systemd unit) is not in the repo. **TODO**: document or add one.
