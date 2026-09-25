"""Replay sugar-woods daily rows as ingest readings."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

# The three taps marked tracked on the running site. The dashboard gauges
# read the latest metric for these nodes only.
TREES = {
    ("Alumni House", "Alumni House - Tree 1"): ("GW-ALUMNI", "NODE-001"),
    ("Chabad House", "Chabad House - Tree 1"): ("GW-CHABAD", "NODE-007"),
    ("Red Barn", "Red Barn - Tree 1"): ("GW-BARN", "NODE-012"),
}
SITE_ORDER = {"Alumni House": 0, "Chabad House": 1, "Red Barn": 2}

SHEET_PATH = Path(__file__).with_name("sugar-woods-2024.csv")
CURSOR_PATH = Path(__file__).with_name(".sugar-woods-cursor")


def load_rows(path: Path = SHEET_PATH) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for record in csv.DictReader(handle):
            site = (record.get("site") or "").strip()
            tree = (record.get("tree") or "").strip()
            target = TREES.get((site, tree))
            if target is None:
                continue
            date = (record.get("date") or "").strip()
            gateway, node = target
            rows.append(
                {
                    "site": site,
                    "date": date,
                    "gateway": gateway,
                    "node": node,
                    "weight": float(record["weight_lb"]),
                }
            )
    rows.sort(key=lambda row: (row["date"], SITE_ORDER[row["site"]]))
    return rows


class SheetCursor:
    def __init__(self, rows: list[dict[str, Any]], path: Path = CURSOR_PATH) -> None:
        self.rows = rows
        self.path = path
        self.index = 0
        if path.exists():
            try:
                self.index = int(json.loads(path.read_text(encoding="utf-8")).get("index", 0))
            except (OSError, ValueError, json.JSONDecodeError):
                self.index = 0

    def peek(self) -> dict[str, Any] | None:
        if self.index < 0 or self.index >= len(self.rows):
            return None
        return self.rows[self.index]

    def commit(self) -> None:
        self.index += 1
        self.path.write_text(json.dumps({"index": self.index}), encoding="utf-8")


def apply_row(reading: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Keep battery and RSSI from the radio. Weight and tree come from the sheet.

    Sugar percent is recorded by a student at collection, not by the sensor.
    """
    updated = dict(reading)
    updated.pop("Sugar_Percent", None)
    updated["Node_Code"] = row["node"]
    updated["Weight"] = row["weight"]
    return updated
