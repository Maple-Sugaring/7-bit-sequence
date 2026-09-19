# Raspberry Pi LoRa gateway (dummy app)

Copy this folder onto the Ubuntu Pi. One process listens on the SX1262 hat and serves a local page so you can see Heltec packets without the maple server.

## Hat jumpers

- Upper UART jumpers on **B** (Pi controls the module).
- **M0** and **M1** jumpered to GND for normal RX/TX after boot (the script also drives BCM 22 / 27).
- SMA antenna attached.

## Ubuntu Server serial

Ubuntu does not ship `raspi-config` by default. Enable UART, disable the serial console:

```bash
sudo sed -i 's/console=serial0,115200 //' /boot/firmware/cmdline.txt
echo 'enable_uart=1' | sudo tee -a /boot/firmware/config.txt
sudo reboot
ls -l /dev/serial0 /dev/ttyS0 /dev/ttyAMA0
```

If `/dev/serial0` is missing, set `LORA_SERIAL` in `.env` to whichever tty the listing shows.

## Run

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv python3-rpi.gpio
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.env .env
python3 app.py
```

Open `http://<pi-ip>:8080` on a laptop on the same network.

The banner should move from **Waiting for packets** to **Link up** about every 20 seconds once the Heltec OLED shows `Sent OK`.

## Optional maple server POST

After the dummy app shows packets:

1. Sign in to the maple site, copy your session JWT.
2. Put it in `.env` as `MAPLE_BEARER_TOKEN`.
3. Set `FORWARD_TO_SERVER=1`.
4. Restart `python3 app.py`.

A 401 on the dashboard means the JWT expired. Radio status is independent of that.
