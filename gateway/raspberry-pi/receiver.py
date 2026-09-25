"""Read gateway Heltec USB lines and optionally POST them to /ingest."""

from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import requests
import serial


HISTORY_LIMIT = 20
POST_ATTEMPTS = 3


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


def utc_millis(moment: datetime | None = None) -> str:
    moment = moment or datetime.now(timezone.utc)
    millis = moment.microsecond // 1000
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{millis:03d}Z"


def parse_reading(text: str) -> dict[str, Any]:
    """Accept one gateway JSON object. Non-objects and bad fields raise."""
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("JSON was not an object")

    node = parsed.get("Node_Code")
    weight = parsed.get("Weight")
    if not isinstance(node, str) or not node.strip():
        raise ValueError("missing Node_Code")
    if isinstance(weight, bool) or not isinstance(weight, (int, float)):
        raise ValueError("missing Weight")

    reading: dict[str, Any] = {
        "Node_Code": node.strip(),
        "Weight": float(weight),
    }

    if parsed.get("Battery_Percent") is not None:
        battery = parsed["Battery_Percent"]
        if isinstance(battery, bool) or not isinstance(battery, (int, float)):
            raise ValueError("Battery_Percent is not a number")
        reading["Battery_Percent"] = int(battery)

    if parsed.get("Signal_Rssi") is not None:
        rssi = parsed["Signal_Rssi"]
        if isinstance(rssi, bool) or not isinstance(rssi, (int, float)):
            raise ValueError("Signal_Rssi is not a number")
        reading["Signal_Rssi"] = int(rssi)

    return reading


def build_ingest_body(
    reading: dict[str, Any],
    gateway_code: str,
    recorded_at: str,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "Node_Code": reading["Node_Code"],
        "Recorded_At": recorded_at,
        "Weight": reading["Weight"],
    }
    if "Battery_Percent" in reading:
        item["Battery_Percent"] = reading["Battery_Percent"]
    if "Signal_Rssi" in reading:
        item["Signal_Rssi"] = reading["Signal_Rssi"]
    return {"Gateway_Code": gateway_code, "Readings": [item]}


def post_ingest(body: dict[str, Any], api_url: str, token: str) -> requests.Response:
    """POST the same body on a dropped connection so the timestamp stays put."""
    last_error: requests.RequestException | None = None
    for attempt in range(POST_ATTEMPTS):
        try:
            return requests.post(
                api_url,
                json=body,
                headers={
                    "X-Gateway-Token": token,
                    "Content-Type": "application/json",
                },
                timeout=12,
            )
        except requests.RequestException as exc:
            last_error = exc
            if attempt + 1 < POST_ATTEMPTS:
                time.sleep(1)
    assert last_error is not None
    raise last_error


def forward_status(response: requests.Response) -> dict[str, str]:
    snippet = (response.text or "")[:180]
    if response.status_code == 201:
        return {"status": "201", "detail": "saved on maple server"}
    if response.status_code == 200:
        detail = "duplicate reading" if "Duplicate" in (response.text or "") else "accepted"
        return {"status": "200", "detail": detail}
    if response.status_code == 401:
        return {"status": "401", "detail": "gateway token rejected"}
    if response.status_code == 422:
        return {"status": "422", "detail": snippet or "reading rejected"}
    if response.status_code == 503:
        return {
            "status": "503",
            "detail": "server has no GATEWAY_INGEST_TOKEN",
        }
    return {"status": str(response.status_code), "detail": snippet or response.reason}


def forward_reading(
    packet: dict[str, Any],
    api_url: str,
    token: str,
    gateway_code: str,
) -> None:
    reading = packet.get("reading")
    if not reading:
        return
    body = build_ingest_body(reading, gateway_code, packet["received_at"])
    packet["ingest"] = body
    try:
        response = post_ingest(body, api_url, token)
        packet["forward"] = forward_status(response)
    except requests.RequestException as exc:
        packet["forward"] = {"status": "error", "detail": str(exc)}


class PacketStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.packets: deque[dict[str, Any]] = deque(maxlen=HISTORY_LIMIT)
        self.rx_count = 0
        self.started_at = utc_millis()
        self.radio_status = "starting"
        self.radio_detail = "Opening gateway USB serial"
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
            self.radio_detail = "Receiving gateway USB lines"
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


def line_packet(text: str) -> dict[str, Any] | None:
    """Return a packet for a JSON line. Plain-text logs are ignored."""
    if not text.startswith("{"):
        return None

    packet: dict[str, Any] = {
        "received_at": utc_millis(),
        "raw_text": text,
        "rssi_dbm": None,
        "reading": None,
        "payload": None,
        "parse_error": None,
        "forward": {"status": "skipped", "detail": "serial only"},
    }
    try:
        reading = parse_reading(text)
    except (json.JSONDecodeError, ValueError) as exc:
        packet["parse_error"] = str(exc)
        return packet

    packet["reading"] = reading
    packet["payload"] = reading
    packet["rssi_dbm"] = reading.get("Signal_Rssi")
    return packet


def run_receiver(store: PacketStore) -> None:
    serial_dev = os.getenv("GATEWAY_SERIAL", "/dev/ttyACM0")
    baud = int(os.getenv("GATEWAY_BAUD", "115200"))
    forward = env_bool("FORWARD_TO_SERVER", False)
    gateway_code = os.getenv("GATEWAY_CODE", "GW-ALUMNI").strip() or "GW-ALUMNI"
    api_url = os.getenv(
        "MAPLE_API_URL",
        "https://maplesugaring01.webdev.gccis.rit.edu/api/ingest",
    )
    token = os.getenv("GATEWAY_INGEST_TOKEN", "").strip()

    try:
        store.set_radio("configuring", f"Opening {serial_dev} @ {baud}")
        port = serial.Serial(serial_dev, baud, timeout=1)
        store.set_radio("waiting", f"Listening on {serial_dev} for gateway JSON lines")
    except Exception as exc:
        store.set_radio("error", str(exc))
        return

    try:
        while True:
            try:
                raw = port.readline()
            except serial.SerialException as exc:
                store.set_radio("error", str(exc))
                return
            if not raw:
                continue
            text = raw.decode("utf-8", errors="replace").strip()
            packet = line_packet(text)
            if packet is None:
                continue
            if forward and packet.get("reading") and token:
                forward_reading(packet, api_url, token, gateway_code)
            elif forward and packet.get("reading") and not token:
                packet["forward"] = {
                    "status": "skipped",
                    "detail": "FORWARD_TO_SERVER=1 but GATEWAY_INGEST_TOKEN is empty",
                }
            elif packet.get("reading") and not forward:
                packet["forward"] = {
                    "status": "skipped",
                    "detail": "local app only (FORWARD_TO_SERVER=0)",
                }
            store.add(packet)
            print(
                f"[rx #{store.rx_count}] rssi={packet['rssi_dbm']} "
                f"err={packet['parse_error']} reading={packet['reading']} "
                f"fwd={packet['forward']['status']}",
                flush=True,
            )
    finally:
        port.close()
