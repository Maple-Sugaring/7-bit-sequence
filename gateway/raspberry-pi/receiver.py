"""Receive dummy sap packets from the Heltec node and optionally POST them."""

from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import requests

from sx126x import Sx126x


HISTORY_LIMIT = 20


def load_env(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def parse_packet(raw: bytes, start_freq: int, rssi_enabled: bool) -> dict[str, Any]:
    """Strip the Waveshare 3-byte header and optional trailing RSSI byte."""
    packet: dict[str, Any] = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "raw_hex": raw.hex(" "),
        "raw_text": "",
        "rssi_dbm": None,
        "src_addr": None,
        "channel_mhz": None,
        "payload": None,
        "parse_error": None,
        "forward": {"status": "skipped", "detail": "radio only"},
    }

    if len(raw) < 4:
        packet["parse_error"] = f"short frame ({len(raw)} bytes)"
        packet["raw_text"] = raw.decode("utf-8", errors="replace")
        return packet

    packet["src_addr"] = (raw[0] << 8) + raw[1]
    packet["channel_mhz"] = raw[2] + start_freq + 0.125

    body = raw[3:]

    def as_text(blob: bytes) -> str:
        return blob.decode("utf-8", errors="replace").strip("\x00").strip()

    text = as_text(body)
    parsed = None
    json_error = None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        json_error = exc.msg
        # Waveshare can append an RSSI byte; Heltec does not. Try both.
        if rssi_enabled and len(body) >= 2:
            try:
                parsed = json.loads(as_text(body[:-1]))
                packet["rssi_dbm"] = body[-1] - 256
                text = as_text(body[:-1])
                json_error = None
            except json.JSONDecodeError:
                pass

    packet["raw_text"] = text
    if parsed is None:
        packet["parse_error"] = f"JSON: {json_error}" if json_error else "JSON parse failed"
        return packet

    if not isinstance(parsed, dict):
        packet["parse_error"] = "JSON was not an object"
        return packet

    packet["payload"] = parsed
    return packet


def forward_reading(packet: dict[str, Any], api_url: str, token: str) -> None:
    payload = packet.get("payload") or {}
    body = {
        "NodeID": payload.get("NodeID"),
        "Weight": payload.get("Weight"),
        "Temperature": payload.get("Temperature"),
        "Sugar_Percent": payload.get("Sugar_Percent"),
        "Weather_Conditions": payload.get("Weather_Conditions", "LoRa dummy"),
        "Recorded_At": packet["received_at"],
    }
    try:
        response = requests.post(
            api_url,
            json=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=12,
        )
        snippet = (response.text or "")[:180]
        if response.status_code == 201:
            packet["forward"] = {"status": "201", "detail": "saved on maple server"}
        elif response.status_code == 401:
            packet["forward"] = {
                "status": "401",
                "detail": "JWT rejected — paste a fresh session token",
            }
        else:
            packet["forward"] = {
                "status": str(response.status_code),
                "detail": snippet or response.reason,
            }
    except requests.RequestException as exc:
        packet["forward"] = {"status": "error", "detail": str(exc)}


class PacketStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.packets: deque[dict[str, Any]] = deque(maxlen=HISTORY_LIMIT)
        self.rx_count = 0
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.radio_status = "starting"
        self.radio_detail = "Opening LoRa HAT UART"
        self.last_error: str | None = None

    def set_radio(self, status: str, detail: str) -> None:
        with self._lock:
            self.radio_status = status
            self.radio_detail = detail

    def add(self, packet: dict[str, Any]) -> None:
        with self._lock:
            self.rx_count += 1
            packet["seq"] = self.rx_count
            self.packets.appendleft(packet)
            self.radio_status = "up"
            self.radio_detail = "Receiving dummy sap packets"
            self.last_error = packet.get("parse_error")

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            packets = list(self.packets)
            last = packets[0] if packets else None
            return {
                "radio_status": self.radio_status,
                "radio_detail": self.radio_detail,
                "last_error": self.last_error,
                "rx_count": self.rx_count,
                "started_at": self.started_at,
                "last_received_at": last["received_at"] if last else None,
                "last": last,
                "packets": packets,
            }


def run_receiver(store: PacketStore) -> None:
    serial_dev = os.getenv("LORA_SERIAL", "/dev/serial0")
    freq = int(os.getenv("LORA_FREQ", "915"))
    air_speed = int(os.getenv("LORA_AIR_SPEED", "9600"))
    rssi = env_bool("LORA_RSSI", True)
    forward = env_bool("FORWARD_TO_SERVER", False)
    api_url = os.getenv(
        "MAPLE_API_URL",
        "https://maplesugaring01.webdev.gccis.rit.edu/api/metrics",
    )
    token = os.getenv("MAPLE_BEARER_TOKEN", "").strip()

    try:
        store.set_radio("configuring", f"Opening {serial_dev} @ 9600")
        radio = Sx126x(
            serial_num=serial_dev,
            freq=freq,
            addr=0,
            power=22,
            rssi=rssi,
            air_speed=air_speed,
        )
        store.set_radio(
            "waiting",
            f"Listening {freq}.125 MHz — waiting for Heltec packets",
        )
    except Exception as exc:
        store.set_radio("error", str(exc))
        return

    try:
        while True:
            raw = radio.receive_bytes()
            if not raw:
                time.sleep(0.05)
                continue
            packet = parse_packet(raw, radio.start_freq, rssi)
            if forward and packet.get("payload") and token:
                forward_reading(packet, api_url, token)
            elif forward and not token:
                packet["forward"] = {
                    "status": "skipped",
                    "detail": "FORWARD_TO_SERVER=1 but MAPLE_BEARER_TOKEN is empty",
                }
            elif not forward:
                packet["forward"] = {
                    "status": "skipped",
                    "detail": "local dummy app only (FORWARD_TO_SERVER=0)",
                }
            store.add(packet)
            print(
                f"[rx #{store.rx_count}] rssi={packet['rssi_dbm']} "
                f"err={packet['parse_error']} payload={packet['payload']} "
                f"fwd={packet['forward']['status']}",
                flush=True,
            )
    finally:
        radio.close()
