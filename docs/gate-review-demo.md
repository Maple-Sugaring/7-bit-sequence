# Gate review demo (15 minutes)

A scripted walkthrough of the MVP features that work today. Scope comes from the GR2 status sheet ("7 Bit Sequence — GR2 Requirements and Implementation Status", MVP Coverage tab, 2026-10-22) and the closed GitHub issues. Of 47 baseline MVP requirements: 2 verified on the deployed site, 19 implemented on main, 1 on a branch, 12 partial, 13 missing. The demo shows the first group live and says plainly what is partial or missing (last segment).

Requirement keys in brackets (`B5`) are the trace keys from that sheet.

## Roles

| Who | Does |
| --- | --- |
| Driver | Laptop on the projector, signed in as Administrator. |
| Field | Stands at the scale with the test weight and a phone. |
| Narrator | Keeps time and reads the talk track. Can be the driver. |

## Setup (30 minutes before)

1. **Hardware.** Node on the platform with antenna, gateway Heltec plugged into the Pi, Pi running `python3 app.py` with `FORWARD_TO_SERVER=1`. The Pi page (`http://<pi-ip>:8080`) shows "Link up" and the node code.
2. **Firmware.** Node and gateway flashed from this branch (calibration over LoRa needs both). Four-cell platform: `pio run -e field_four_cell -t upload`. Gateway: `pio run -e gateway -t upload`. Update the Pi's `receiver.py` too.
3. **Fast interval.** Deploy → edit the demo tree → *Seconds between packets* = `10` → Save. Within two packets the node OLED says "Interval updated / Every 10s".
4. **Test weight.** Weigh it on a kitchen scale and write the pounds on it (for example 7.875 lb). Platform empty.
5. **Browser tabs, in order:** (1) The Bush, (2) the demo tree's page, (3) Sugar Woods, (4) Notifications, (5) Schedule, (6) Deploy, (7) the mock site as a backup. Zoom to 125%.
6. **Phone.** Signed in on the same site, on Collection.
7. **Second account.** A Student login on another browser profile (or the mock site's *Student* button) for the role switch.
8. **Dry run** the calibration once. Each step lands within about 10 to 15 seconds at a 10 s interval.
9. **Wake the node** with a PRG press just before the demo: between reports it sleeps with the OLED off. An app tare or calibration wakes it on its own.

## Script

| Time | Segment | Show | Requirements |
| --- | --- | --- | --- |
| 0:00 | Problem and system | One sentence on the problem (buckets checked by hand, sap spoils, nobody knows which bucket is full). Architecture slide or the diagram in [architecture.md](architecture.md): load cell node → LoRa → gateway → Pi → API → web app. | B36 (LoRa, see gaps) |
| 1:00 | Live weight | The Bush. Field lifts the bucket off and puts it back; the tree card changes within one packet, no reload. Open the tree: battery, signal, last seen, weight in pounds and gallons, syrup estimate. | B3, B12, B47, B40 |
| 3:00 | Calibrate from the app | Tree page → *Calibrate the scale*. (1) Field empties the platform, driver clicks **Tare**; the alert goes "Waiting" → "Radioed" → step done, the OLED wakes and shows "Tared from app". (2) Field sets the test weight, driver enters the pounds, **Calibrate**; OLED shows "Calibrated". (3) *Check the reading* turns green when the platform reads within 0.2 lb. Point out: no laptop cable, works on a deployed tree. | B7 (sensor health), supports #50 |
| 6:00 | Fault warning | Field unplugs the HX711 lead (or presses down hard on one edge and keeps rocking it through the next packet, about 7 s). That packet raises a "load-cell" (or "unstable") alert; open Notifications to show it. Press PRG: the OLED says "HX711 not found" and what to check. Plug back in; the next good reading clears the alert. | B7, B14 |
| 7:30 | Collection round on the phone | Collection on the phone: start a round, label it, the tree's weight is already filled in from the sensor, enter an optional Brix, save. Mention the offline queue (airplane mode keeps entries and sends later). | B5, B6, B46, B48, B47 |
| 9:30 | Dashboard and data | The Bush: sugar content, shelf life per bucket, full-bucket warning, fleet map. Sugar Woods: weight over time per tree, export **CSV** and **PDF**. | B2, B11, B4, B13, B14 |
| 11:00 | Alerts and notifications | Notifications page: open and resolved alerts, flag a node issue from the tree page ("Report a spill"). Show the critical email setting on Profile and send the test email. | B27 (email), B16 (partial) |
| 12:00 | Roles and schedule | Admin nav has seven routes. Assign a shift to a student on Schedule. Switch to the Student login: fewer routes, own shifts, drop the shift. Mention Google sign-in limited to RIT accounts. | B38, B9, B45, B41, B42, B43 |
| 13:15 | Deploy | Deploy page: gateway cards, register a tree on the map, the browser flasher (show the dialog, do not flash). | #18, #31 |
| 14:00 | Status and gaps | The coverage numbers above, then the "Not claimed" list below and what comes next. Take questions. | all |

Keep each segment to its slot. If one runs long, cut Deploy first, then Alerts.

## Not claimed in this demo

Say these out loud in the last segment instead of implying them:

- **Year-to-year comparison** (B39) is on branch `68-data-comp`, not main.
- **Push / SMS** (B16): Twilio code exists, delivery not verified; no push.
- **Sap temperature and flowmeter** (B15, B17): the API accepts the fields; the field firmware sends weight and battery only.
- **Local buffering** (B18): the API spools when Postgres is down and the phone queues entries; the Pi still drops readings after 3 retries.
- **Hardware qualification** (B19 to B26, B29 to B35, B37): cold, IP67, solar and Li-ion endurance, food-contact materials, optical-sensor voltages. Not tested yet.
- **66.9% finished syrup** (B10): the constant and helper exist; no finished-batch measurement.
- **Wireless protocol** (B36): the requirement names Bluetooth / 802.11ac / ESP-NOW; we use LoRa 915 MHz for range. Needs sponsor sign-off.
- **10-second interval** is for the demo. The field setting is 900 s (15 min); set it back afterwards.

## If something breaks

| Problem | Do this |
| --- | --- |
| Tree card does not change | Check the Pi page for "Link up" and a recent packet. If the Pi shows `401`/`503`, the ingest token is wrong. Switch to the mock tab and keep going. |
| Calibration stuck on "Radioed" | The node missed the downlink. It is resent on every packet, so wait one more interval. After 30 s, press **Tare** again (it replaces the old request). |
| *Check the reading* is yellow | The test weight was off-centre or the platform was not empty at tare. **Start over**. |
| Calibrate failed | No weight change was seen. Tare with the platform empty, then put the weight on before clicking Calibrate. |
| Site down | Use the mock tab (role buttons, sample data). Everything except live hardware and calibration works there; calibration in mock mode simulates the node. |

## After the demo

- Deploy → demo tree → *Seconds between packets* back to `900`.
- Take the test weight off and tare once more with the empty platform.
