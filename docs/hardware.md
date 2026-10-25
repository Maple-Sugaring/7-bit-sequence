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
| `heltec-v3-node` | `node_001`, `node_002`, `field`, `field_four_cell`, `native` (host tests) | Weighs a bucket and transmits. |
| `heltec-v3-gateway` | `gateway` | Receives LoRa, prints JSON lines to USB, forwards `INTERVAL` commands from the Pi. |
| `hx711-test` | `heltec_v3` | Bench sketch that shows raw HX711 readings on the OLED. |

`platformio.ini` hard-codes `upload_port` and `monitor_port` to `/dev/cu.usbserial-0001` (a Mac). Change them if the board enumerates elsewhere.

### Node firmware 2.0 (`heltec-v3-node/`)

Versions are pinned in `platformio.ini` (espressif32 7.1.3 / Arduino-ESP32 2.0.17, RadioLib 7.8.1, U8g2 2.36.18) so the flasher image can be rebuilt exactly.

| Path | Responsibility |
| --- | --- |
| `lib/maple_core/` | Pure logic, no Arduino: sample analysis and fault decision (`scale_logic`), Li-ion curve and pack protection (`battery_logic`), LoRa JSON and serial commands (`protocol`). Unit tested on the laptop with `pio test -e native`. |
| `src/config.h` | Pinout, radio settings, timings, cell constants, `FW_VERSION`. |
| `src/hx711.*` | Bit-banged HX711: wiring probe, power up/down, bursts. |
| `src/scale.*` | Tare and counts/lb in NVS, measuring with retries, what to tell the person at the tree. |
| `src/battery.*` | Pack voltage from the onboard divider. |
| `src/radio_link.*`, `display.*`, `console.*`, `identity.*`, `power.*` | SX1262, OLED, UART0 console, node code, sleep and watchdog. |
| `src/main.cpp` | Service and field modes, reports, app commands. |

Environments:

| Env | `NODE_CODE` | Notes |
| --- | --- | --- |
| `node_001` | `NODE-001` | `TX_OFFSET_MS=0` |
| `node_002` | `NODE-002` | `TX_OFFSET_MS=10000` so the two nodes do not collide |
| `field` | `MAPLENODE00000000` placeholder | The image the website flashes. Node code is stamped into flash at `0x670000` by the web flasher. `TX_INTERVAL_MS=20000`. |
| `field_four_cell` | same as `field` | `field` plus `-DLOAD_CELL_FOUR_HALF_BRIDGE` for the four-cell platform. Flash from a laptop (`pio run -e field_four_cell -t upload`); the website only serves `field`. Keeps the stamped node code. Run `CAL <pounds>` once after flashing. |

Hardware (pinout unchanged from 1.x): HX711 on GPIO 6 (DT) and 7 (SCK), powered from 3V3 (see `hardware/platforms/wiring-tree.png`); load cell Guang Ce YZC-1B, 50 kg, 2.0 mV/V (`CELL_CAL_REV 2`), or with `LOAD_CELL_FOUR_HALF_BRIDGE` four 50 kg half-bridge cells as one bridge, 200 kg, about 2.1 mV/V measured on NODE-001 (`CELL_CAL_REV 3`); channel A gain 128, counts per pound from those figures until `CAL` stores a measured value. Switching sensor type discards the stored zero and tares again on the next clean reading. OLED SSD1306 on GPIO 17/18/21 (hardware I2C at 400 kHz); PRG button GPIO 0. The USB-C jack is a CP2102 on UART0 (GPIO 43/44), which is what the web flasher and a laptop open.

Power: the D5 enclosure's Heltec 5 W solar kit feeds its 18650 pack into the **SH1.25-2P lithium battery port underneath the board**. The board measures that pack through its 390k/100k divider on GPIO 1, switched by GPIO 37. GPIO 37 is pulled up on V3.0/V3.1 (divider on when driven LOW) and pulled down on V3.2 (on when HIGH), so the firmware reads the idle level and drives the opposite. ADC at 2.5 dB, 16 reads with the extremes dropped, × 4.9 × `bat_k` (default 1.045, set with `BATCAL`). The percentage follows a resting Li-ion curve (4.20 V 100%, 3.79 V 46%, 3.67 V 17%, 3.30 V 0%). Outside 2.5–4.5 V there is no pack on the port (USB only), and `Battery_Percent` is left out of the packet. A pack being charged over USB reads its charge voltage, so it shows near 100%.

Identity: at boot the node reads `MAPLEID1` + code at flash `0x670000` (written by the web flasher), then an NVS `node_code` from `PROVISION`, then a compiled `NODE_CODE` that is not the placeholder. If none, the OLED says "No node code / Flash again from the Deploy page" and the node stays awake without reporting.

Modes:

- **Service** (OLED on, live weight, serial console answering): for 2 minutes after boot, a PRG press, a serial command, or a tare/calibration from the app. Hold PRG 3 s to tare (an empty platform). A tap keeps the window open. The OLED shows the node code, pack % and voltage (or `USB`), the weight or the fault with what to check, and the seconds to the next report.
- **Field** (everything else): the ESP32 light-sleeps between reports at 80 MHz. The HX711 and the load-cell bridge are powered down (PD_SCK held high by a pull-up), the SX1262 sleeps warm, and the OLED panel sleeps. A PRG press wakes it into service mode. Serial input is not heard while it sleeps; press PRG or reset first (opening the port from a laptop or the flasher resets the board).

Each report (every `Interval_Seconds`, measured from the start of the previous report, plus up to 750 ms of jitter):

1. Reads the pack. Below 3.15 V (cutoff) it sends nothing and deep-sleeps for an hour. A pack that browns the board out, or wakes from protective sleep still low, goes straight back to deep sleep instead of booting the radio again.
2. Probes and measures the HX711. Probe: both lines are pulled up (the chip powers down), then pulled down (it powers up, and its DOUT drives high until the first conversion). The pin that reads high is DT, so a cable with DT and SCK swapped is detected and used as-is (`STATUS` says `wiring=DT/SCK swapped`). Neither pin is ever driven against the chip. If neither pin answers, the HX711 is missing or unpowered. DT has a pull-up, so a missing chip reads "not ready" instead of floating to the 0 / -1 that firmware 1.x reported as 0.00 lb.
3. Takes 12 conversions after dropping 2 settling ones (10 µs clock half-period, as in 1.x). The two highest and two lowest are trimmed; the reading is the mean of the rest.
4. Decides at most one fault, most fundamental first:
   - `load-cell`: no conversion arrived, a stuck DT (the whole burst within 4 counts), a saturated reading (an open bridge wire), or a trimmed spread over 5 lb.
   - `unstable`: trimmed spread over 0.5 lb.
   - `untared`: no zero stored.
   - `reversed`: more than 1 lb below the tare.

   Except `untared`, a fault has to show on 3 bursts in a row (power-cycling the HX711 each time, about 7 s) before it is sent, so a gust or a bump does not raise one. The first clean reading on an untared scale becomes the zero. A stored zero of exactly 0 or -1 (left by 1.x taring a floating pin) is discarded.
5. Sends the packet, then listens 4 s for a downlink addressed to its code, skipping other trees' packets. `Interval_Seconds` (10–86400 s) is stored in NVS. A `Command_Id` with `TARE` or `CAL` (+ `Pounds`) wakes the OLED and runs right away; see [Calibration from the app](#calibration-from-the-app).
6. Below 3.30 V (critical) it deep-sleeps for 30 minutes, or for the interval if that is longer, then reports again. Leaving cutoff or critical needs 100 mV of headroom.

A task watchdog (60 s) restarts a hung board. The radio retries init every 30 s if it failed. Stored settings (namespace `maple`: `node_code`, `rf_tag`, `interval_s`, `cmd_id`, `cmd_ok`, `hx_zero`, `hx_cpl`, `hx_tared`, `hx_rev`, `bat_k`) survive reflashing, power loss, and upgrading from 1.x.

Serial commands (115200 baud, newline terminated, UART0 behind the USB-C jack, in service mode):

| Command | Effect |
| --- | --- |
| `HELP` | Lists the commands. |
| `STATUS` | One line: firmware, code, mode, wiring, raw, zero, counts/lb, pounds, fault, pack mV and %, `bat_k`, interval, next report, radio, reset reason. |
| `TARE` | Replies `TARE queued`, tares now, then `TARE ok` or `TARE failed`. |
| `CAL <pounds>` | With a known weight on the tared cell, sets counts/lb; replies `CAL ok` or `CAL failed`. |
| `BATCAL <mV>` | Pack voltage from a multimeter; scales future readings; replies `BATCAL ok factor=...`. |
| `INTERVAL <s>` | Sets the report interval locally (the API's value wins on the next accepted packet). |
| `PROVISION {"Node_Code":"...","Rf_Tag":"..."}` | Stores an identity; replies `PROVISIONED` or `PROVISION failed`. A code stamped by the flasher still wins at boot. |
| `FACTORY` | Clears the whole NVS namespace (identity, calibration, interval); replies `CLEARED`. |
| `REBOOT` | Restarts. |

LoRa uplink payload (node to gateway):

```json
{"Node_Code":"NODE-001","Weight":35.90,"Battery_Percent":88,"Interval_Seconds":20}
{"Node_Code":"NODE-001","Fault":"unstable","Battery_Percent":88,"Interval_Seconds":20}
{"Node_Code":"NODE-001","Fault":"load-cell","Interval_Seconds":20}
```

`Interval_Seconds` is the node's current packet interval. Weight is gross pounds including the bucket, floored at 0. `Battery_Percent` is absent when no pack is on the lithium port.

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
- A tare or calibration needs a clean measurement (the same retries as a report); a platform still moving fails the command instead of storing a bad zero.

### Gateway firmware (`heltec-v3-gateway/src/main.cpp`)

Receives packets, extracts `Node_Code` (up to 16 characters), `Weight` or `Fault`, optional `Battery_Percent` (passed on only when the node sent it; before #126 a missing value became 100), optional `Interval_Seconds`, adds `Signal_Rssi`, and prints one JSON line on USB:

```json
{"Node_Code":"NODE-001","Weight":35.90,"Battery_Percent":88,"Signal_Rssi":-74}
```

It also prints plain-text `[rx]`/status lines that the Pi ignores. Lines from the Pi starting `INTERVAL <node_code> <seconds>` (10 to 86400) are transmitted to that node as `{"Node_Code":"...","Interval_Seconds":N}`. Lines `CMD <node_code> <id> TARE` and `CMD <node_code> <id> CAL <pounds>` are transmitted as `{"Node_Code":"...","Command_Id":N,"Action":"TARE"}` or with `"Action":"CAL","Pounds":7.875`. Command echo fields from a node (`Command_Id`, `Command_Ok`, `Counts_Per_Lb`) are passed through on the JSON line.

### Flashing from a laptop (alternative to the Deploy page)

```bash
cd firmware/heltec-v3-node
pio test -e native                # logic tests on the laptop, no board needed
pio run -e field -t upload        # keeps the code the flasher stamped at 0x670000
pio run -e node_001 -t upload     # or a compiled code, one board at a time
pio device monitor                # opening the port resets into service mode

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
