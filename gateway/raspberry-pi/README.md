# Raspberry Pi gateway (USB serial)

Copy this folder onto the Pi. One process reads JSON lines from the gateway Heltec on USB and serves a local page. It does not use the SX1262 hat.

The gateway Heltec stays plugged into a USB port. On the Pi it shows up as `/dev/ttyACM0`.

## Run

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.env .env
python3 app.py
```

If opening the port fails with a permission error, add the user to `dialout` and sign in again:

```bash
sudo usermod -aG dialout "$USER"
ls -l /dev/ttyACM0
```

If the board is not `/dev/ttyACM0`, set `GATEWAY_SERIAL` in `.env` to the tty from that listing.

Open `http://<pi-ip>:8080` on a laptop on the same network.

The banner should move from **Waiting for packets** to **Link up** once a node OLED shows `Sent OK` and the gateway OLED shows `RX`. With both nodes powered, lines arrive about every 10 seconds.

## Ingest POST

After the page shows both `NODE-001` and `NODE-002`:

1. Put the server ingest secret in `.env` as `GATEWAY_INGEST_TOKEN`. Do not commit that file.
2. Set `FORWARD_TO_SERVER=1`.
3. Leave `GATEWAY_CODE=GW-ALUMNI` unless these nodes were registered on another Pi.
4. Restart `python3 app.py`.

Each line is posted once as:

```json
{
  "Gateway_Code": "GW-ALUMNI",
  "Readings": [
    {
      "Node_Code": "NODE-001",
      "Recorded_At": "2026-03-02T14:00:00.000Z",
      "Weight": 9.5,
      "Battery_Percent": 88,
      "Signal_Rssi": -74
    }
  ]
}
```

`Recorded_At` is set on the Pi. A dropped connection retries that same JSON. HTTP 201 means a new row. HTTP 200 with `Duplicate: true` means that node and timestamp were already stored. HTTP 401 is a bad token. HTTP 422 is a rejected reading. HTTP 503 means the API process has no `GATEWAY_INGEST_TOKEN` set.
