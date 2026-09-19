# Maple sap LoRa hardware test

Point-to-point LoRa from a Heltec WiFi LoRa 32 V3 to a Raspberry Pi 3 with an SX1262 hat, then (optionally) to the maple sugaring API.

This is **not** LoRaWAN. Both radios use 915.125 MHz, SF9, BW 125 kHz, CR 4/5, sync word 0x12.

```
Heltec V3  --LoRa JSON-->  Pi SX1262 hat  -->  dummy app :8080
                                              \-> optional POST /api/metrics
```

## 1. Flash the Heltec (this Mac, USB-C)

Antenna **on** before the board transmits.

```bash
cd firmware/heltec-v3-node
pio run -t upload
pio device monitor
```

The OLED and serial port show what the board is doing: radio init, each dummy sap TX, success, or a plain-language error.

Dummy payload (Node 1, plausible sap numbers, every 20s):

```json
{"NodeID":1,"Weight":9.4,"Temperature":38.2,"Sugar_Percent":2.1,"Weather_Conditions":"LoRa dummy"}
```

## 2. Dummy app on the Pi

Copy `gateway/raspberry-pi/` onto Ubuntu and follow [gateway/raspberry-pi/README.md](gateway/raspberry-pi/README.md).

Proof that ESP32 → Pi works: `http://<pi-ip>:8080` shows **Link up** and the same sap fields. Leave `FORWARD_TO_SERVER=0` until that is true.

## 3. Optional server forward

Set `FORWARD_TO_SERVER=1` and `MAPLE_BEARER_TOKEN` to a signed-in student/admin JWT. The Pi POSTs to:

`https://maplesugaring01.webdev.gccis.rit.edu/api/metrics`

## If packets never appear

1. Hat UART jumpers on **B**, antennas on both ends.
2. Pi serial device actually exists (`ls -l /dev/serial*`).
3. Heltec OLED still says `Sent OK` — then the miss is on the Pi/hat side (Waveshare UART hats use a private stack; SF/BW/sync on the Heltec is the next knob).
