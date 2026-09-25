# Maple sap LoRa hardware test

Two Heltec WiFi LoRa 32 V3 nodes send dummy sap readings to a third Heltec. That gateway board is plugged into a Raspberry Pi over USB. The Pi can POST each line to the maple sugaring ingest API.

This is **not** LoRaWAN. All three radios use 915.125 MHz, SF9, BW 125 kHz, CR 4/5, sync word 0x12.

```
Heltec NODE-001 --LoRa JSON--> Heltec gateway --USB--> Pi :8080
Heltec NODE-002 --LoRa JSON-->        \-> POST /api/ingest
```

`NODE-001` and `NODE-002` belong to gateway `GW-ALUMNI` on the maple server.

## 1. Flash the two nodes (this Mac, USB-C)

Antenna **on** before a board transmits. Flash one board at a time. `platformio.ini` uses `/dev/cu.usbserial-0001`; change `upload_port` if the board enumerates somewhere else.

```bash
cd firmware/heltec-v3-node
pio run -e node_001 -t upload
pio run -e node_002 -t upload
pio device monitor
```

`node_002` waits 10 seconds before its first transmit so the two packets do not overlap. After that, each node sends every 20 seconds.

The OLED and serial port show radio init, each dummy reading, success, or a plain-language error.

Dummy payload (gross pounds, no air temperature):

```json
{"Node_Code":"NODE-001","Weight":9.5,"Battery_Percent":88}
```

## 2. Flash the gateway Heltec

Leave this board plugged into the Pi. It only receives.

```bash
cd firmware/heltec-v3-gateway
pio run -e gateway -t upload
```

Each good packet prints one JSON line on USB, then a plain-text status line. The Pi posts the JSON line and ignores the status line.

```json
{"Node_Code":"NODE-001","Weight":9.5,"Battery_Percent":88,"Signal_Rssi":-74}
```

## 3. Pi app

Copy `gateway/raspberry-pi/` onto the Pi and follow [gateway/raspberry-pi/README.md](gateway/raspberry-pi/README.md).

Proof that the nodes reach the Pi: `http://<pi-ip>:8080` shows **Link up** and both node codes. Leave `FORWARD_TO_SERVER=0` until that is true.

## 4. Ingest POST

Set `FORWARD_TO_SERVER=1` and `GATEWAY_INGEST_TOKEN` to the server `GATEWAY_INGEST_TOKEN`. This is not a signed-in user JWT. The Pi POSTs to:

`https://maplesugaring01.webdev.gccis.rit.edu/api/ingest`

Header: `X-Gateway-Token`. The body is one reading wrapped for `GW-ALUMNI`. `Recorded_At` is the Pi clock when the USB line arrived. A retry sends that same body again.

## If packets never appear

1. Antennas on all three Heltecs. The gateway OLED should leave "Waiting for nodes" when a node shows `Sent OK`.
2. The Pi serial device exists (`ls -l /dev/ttyACM0`). Set `GATEWAY_SERIAL` if the gateway enumerates on another tty.
3. The gateway user is in the `dialout` group so it can open the USB port.
