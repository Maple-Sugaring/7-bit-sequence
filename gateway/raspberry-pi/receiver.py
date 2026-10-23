"""Read gateway Heltec USB lines and optionally POST them to /ingest."""

from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable

import requests
import serial


HISTORY_LIMIT = 200
MAX_TRACKED_NODES = 200
POST_ATTEMPTS = 3
RECONNECT_SECONDS = 3


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
    fault = parsed.get("Fault")
    if not isinstance(node, str) or not node.strip():
        raise ValueError("missing Node_Code")
    has_fault = isinstance(fault, str) and fault.strip()
    has_weight = not isinstance(weight, bool) and isinstance(weight, (int, float))
    if not has_fault and not has_weight:
        raise ValueError("missing Weight")

    reading: dict[str, Any] = {"Node_Code": node.strip()}
    if has_fault:
        reading["Fault"] = fault.strip()
    if has_weight:
        reading["Weight"] = float(weight)

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

    if parsed.get("Interval_Seconds") is not None:
        interval = parsed["Interval_Seconds"]
        if isinstance(interval, bool) or not isinstance(interval, (int, float)):
            raise ValueError("Interval_Seconds is not a number")
        reading["Interval_Seconds"] = int(interval)

    # The node echoes the last calibration command it applied.
    for key, kind in (("Command_Id", int), ("Command_Ok", int), ("Counts_Per_Lb", float)):
        value = parsed.get(key)
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{key} is not a number")
        reading[key] = kind(value)

    return reading


def build_ingest_body(
    reading: dict[str, Any],
    gateway_code: str,
    recorded_at: str,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "Node_Code": reading["Node_Code"],
        "Recorded_At": recorded_at,
    }
    if "Fault" in reading:
        item["Fault"] = reading["Fault"]
    if "Weight" in reading:
        item["Weight"] = reading["Weight"]
    if "Battery_Percent" in reading:
        item["Battery_Percent"] = reading["Battery_Percent"]
    if "Signal_Rssi" in reading:
        item["Signal_Rssi"] = reading["Signal_Rssi"]
    for key in ("Command_Id", "Command_Ok", "Counts_Per_Lb"):
        if key in reading:
            item[key] = reading[key]
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
        # Every success body has a Duplicate key; only true means the API already had it.
        try:
            accepted = response.json().get("Accepted") or []
        except ValueError:
            accepted = []
        duplicate = any(item.get("Duplicate") for item in accepted if isinstance(item, dict))
        fault = any(item.get("Fault") for item in accepted if isinstance(item, dict))
        detail = "duplicate reading" if duplicate else "fault recorded" if fault else "accepted"
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


def calibration_line(node: str, command: Any) -> str | None:
    if not isinstance(command, dict):
        return None
    command_id = command.get("Command_Id")
    if isinstance(command_id, bool) or not isinstance(command_id, int) or command_id <= 0:
        return None
    action = command.get("Action")
    if action == "TARE":
        return f"CMD {node} {command_id} TARE\n"
    pounds = command.get("Pounds")
    if action == "CAL" and not isinstance(pounds, bool) and isinstance(pounds, (int, float)) and pounds > 0:
        return f"CMD {node} {command_id} CAL {pounds:.3f}\n"
    return None


def downlink_command(response: requests.Response, reading: dict[str, Any]) -> str | None:
    """Pick the one line the gateway radios back to this node.

    The node hears a single packet after it transmits, so a waiting calibration
    goes first; the interval catches up on the next packet.
    """
    try:
        payload = response.json()
    except ValueError:
        return None
    accepted = payload.get("Accepted") or []
    if not accepted:
        return None
    node = reading.get("Node_Code")
    if not isinstance(node, str) or not node.strip():
        return None
    node = node.strip()

    calibration = calibration_line(node, accepted[0].get("Command"))
    if calibration:
        return calibration

    desired = accepted[0].get("Desired_Interval_Seconds")
    if isinstance(desired, bool) or not isinstance(desired, int):
        return None
    if reading.get("Interval_Seconds") == desired:
        return None
    return f"INTERVAL {node} {desired}\n"


def forward_reading(
    packet: dict[str, Any],
    api_url: str,
    token: str,
    gateway_code: str,
) -> str | None:
    reading = packet.get("reading")
    if not reading:
        return None
    body = build_ingest_body(reading, gateway_code, packet["received_at"])
    packet["ingest"] = body
    try:
        response = post_ingest(body, api_url, token)
        packet["forward"] = forward_status(response)
        return downlink_command(response, reading)
    except requests.RequestException as exc:
        packet["forward"] = {"status": "error", "detail": str(exc)}
        return None


class PacketStore:
    def __init__(self, history_limit: int = HISTORY_LIMIT) -> None:
        self._lock = threading.Lock()
        self.packets: deque[dict[str, Any]] = deque(maxlen=history_limit)
        self.rx_count = 0
        self.parse_errors = 0
        self.downlinks = 0
        # Per-node totals outlive the history window.
        self.nodes: dict[str, dict[str, Any]] = {}
        self.started_at = utc_millis()
        self.radio_status = "starting"
        self.radio_detail = "Opening gateway USB serial"
        self.last_error: str | None = None
        self.config: dict[str, Any] = {}

    def set_radio(self, status: str, detail: str) -> None:
        with self._lock:
            self.radio_status = status
            self.radio_detail = detail

    def set_config(self, config: dict[str, Any]) -> None:
        with self._lock:
            self.config = dict(config)

    def add(self, packet: dict[str, Any]) -> None:
        with self._lock:
            self.rx_count += 1
            packet["seq"] = self.rx_count
            self.packets.appendleft(packet)
            self.radio_status = "up"
            self.radio_detail = "Receiving gateway USB lines"
            self.last_error = packet.get("parse_error")
            if packet.get("parse_error"):
                self.parse_errors += 1
            if packet.get("downlink"):
                self.downlinks += 1
            reading = packet.get("reading")
            if reading:
                self._count_node(reading, packet)

    def _count_node(self, reading: dict[str, Any], packet: dict[str, Any]) -> None:
        code = reading["Node_Code"]
        node = self.nodes.get(code)
        if node is None:
            if len(self.nodes) >= MAX_TRACKED_NODES:
                oldest = min(self.nodes, key=lambda tracked: self.nodes[tracked]["last_seen"])
                del self.nodes[oldest]
            node = {
                "node_code": code,
                "packets": 0,
                "faults": 0,
                "downlinks": 0,
                "first_seen": packet["received_at"],
                "last_weight": None,
                "last_weight_at": None,
            }
            self.nodes[code] = node
        node["packets"] += 1
        node["last_seen"] = packet["received_at"]
        node["last_seq"] = packet["seq"]
        node["last_fault"] = reading.get("Fault")
        if reading.get("Fault"):
            node["faults"] += 1
        if "Weight" in reading:
            node["last_weight"] = reading["Weight"]
            node["last_weight_at"] = packet["received_at"]
        for key, field in (
            ("Battery_Percent", "battery_percent"),
            ("Signal_Rssi", "rssi_dbm"),
            ("Interval_Seconds", "interval_seconds"),
            ("Counts_Per_Lb", "counts_per_lb"),
        ):
            if key in reading:
                node[field] = reading[key]
        node["last_forward"] = packet["forward"]["status"]
        if packet.get("downlink"):
            node["downlinks"] += 1
            node["last_downlink"] = packet["downlink"]

    def snapshot(self, since: int = 0) -> dict[str, Any]:
        with self._lock:
            packets = [packet for packet in self.packets if packet["seq"] > since]
            last = self.packets[0] if self.packets else None
            return {
                "radio_status": self.radio_status,
                "radio_detail": self.radio_detail,
                "last_error": self.last_error,
                "rx_count": self.rx_count,
                "parse_errors": self.parse_errors,
                "downlinks": self.downlinks,
                "history_limit": self.packets.maxlen,
                "started_at": self.started_at,
                "server_time": utc_millis(),
                "last_received_at": last["received_at"] if last else None,
                "last": last,
                "nodes": sorted((dict(node) for node in self.nodes.values()), key=lambda n: n["node_code"]),
                "config": dict(self.config),
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
        "downlink": None,
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


def process_packet(
    packet: dict[str, Any],
    enabled: bool,
    token: str,
    api_url: str,
    gateway_code: str,
    send: Callable[..., str | None] = forward_reading,
) -> str | None:
    """Forward one packet when configured and return the line to radio back."""
    if not packet.get("reading"):
        return None
    if not enabled:
        packet["forward"] = {
            "status": "skipped",
            "detail": "local app only (FORWARD_TO_SERVER=0)",
        }
        return None
    if not token:
        packet["forward"] = {
            "status": "skipped",
            "detail": "FORWARD_TO_SERVER=1 but GATEWAY_INGEST_TOKEN is empty",
        }
        return None
    command = send(packet, api_url, token, gateway_code)
    if command:
        packet["downlink"] = command.strip()
    return command


def run_receiver(store: PacketStore) -> None:
    serial_dev = os.getenv("GATEWAY_SERIAL", "/dev/ttyACM0")
    baud = int(os.getenv("GATEWAY_BAUD", "115200"))
    forward = env_bool("FORWARD_TO_SERVER", False)
    gateway_code = os.getenv("GATEWAY_CODE", "GW-ALUMNI").strip() or "GW-ALUMNI"
    api_url = os.getenv(
        "MAPLE_API_URL",
        "https://ritmaplesugaring.privatedns.org/api/ingest",
    )
    token = os.getenv("GATEWAY_INGEST_TOKEN", "").strip()
    store.set_config({
        "serial": serial_dev,
        "baud": baud,
        "forward": forward,
        "token_set": bool(token),
        "gateway_code": gateway_code,
        "api_url": api_url,
    })

    # Keep retrying so an unplugged gateway Heltec comes back without a restart.
    while True:
        try:
            store.set_radio("configuring", f"Opening {serial_dev} @ {baud}")
            port = serial.Serial(serial_dev, baud, timeout=1)
            store.set_radio("waiting", f"Listening on {serial_dev} for gateway JSON lines")
        except Exception as exc:
            store.set_radio("error", f"{exc} (retrying in {RECONNECT_SECONDS}s)")
            time.sleep(RECONNECT_SECONDS)
            continue
        try:
            read_lines(port, store, forward, token, api_url, gateway_code)
        except serial.SerialException as exc:
            store.set_radio("error", f"{exc} (retrying in {RECONNECT_SECONDS}s)")
        finally:
            port.close()
        time.sleep(RECONNECT_SECONDS)


def read_lines(
    port: serial.Serial,
    store: PacketStore,
    forward: bool,
    token: str,
    api_url: str,
    gateway_code: str,
) -> None:
    while True:
        raw = port.readline()
        if not raw:
            continue
        text = raw.decode("utf-8", errors="replace").strip()
        packet = line_packet(text)
        if packet is None:
            continue
        command = process_packet(packet, forward, token, api_url, gateway_code)
        if command:
            port.write(command.encode("utf-8"))
            port.flush()
        store.add(packet)
        print(
            f"[rx #{store.rx_count}] rssi={packet['rssi_dbm']} "
            f"err={packet['parse_error']} reading={packet['reading']} "
            f"fwd={packet['forward']['status']} tx={packet['downlink']}",
            flush=True,
        )
