"""Run with: python3 -m unittest test_receiver (needs requirements.txt installed)."""

from __future__ import annotations

import unittest
from unittest.mock import Mock

from receiver import build_ingest_body, downlink_command, forward_status, parse_reading


def response(accepted: list[dict]) -> Mock:
    reply = Mock()
    reply.json.return_value = {"Accepted": accepted}
    return reply


class DownlinkCommandTest(unittest.TestCase):
    def test_calibration_wins_over_an_interval_change(self) -> None:
        reply = response([
            {"Desired_Interval_Seconds": 10, "Command": {"Command_Id": 31, "Action": "CAL", "Pounds": 10}},
        ])
        line = downlink_command(reply, {"Node_Code": "NODE-001", "Interval_Seconds": 900})
        self.assertEqual(line, "CMD NODE-001 31 CAL 10.000\n")

    def test_tare_has_no_pounds(self) -> None:
        reply = response([{"Command": {"Command_Id": 32, "Action": "TARE"}}])
        self.assertEqual(downlink_command(reply, {"Node_Code": "NODE-001"}), "CMD NODE-001 32 TARE\n")

    def test_interval_only_when_it_differs(self) -> None:
        reply = response([{"Desired_Interval_Seconds": 10}])
        self.assertEqual(
            downlink_command(reply, {"Node_Code": "NODE-001", "Interval_Seconds": 900}),
            "INTERVAL NODE-001 10\n",
        )
        self.assertIsNone(downlink_command(reply, {"Node_Code": "NODE-001", "Interval_Seconds": 10}))

    def test_unknown_action_is_not_radioed(self) -> None:
        reply = response([{"Command": {"Command_Id": 33, "Action": "REBOOT"}}])
        self.assertIsNone(downlink_command(reply, {"Node_Code": "NODE-001", "Interval_Seconds": 10}))


class AckFieldsTest(unittest.TestCase):
    def test_ack_fields_reach_the_api(self) -> None:
        reading = parse_reading(
            '{"Node_Code":"NODE-001","Weight":10.02,"Battery_Percent":90,"Signal_Rssi":-70,'
            '"Interval_Seconds":10,"Command_Id":31,"Command_Ok":1,"Counts_Per_Lb":10246}'
        )
        body = build_ingest_body(reading, "GW-ALUMNI", "2026-10-22T14:00:00.000Z")
        item = body["Readings"][0]
        self.assertEqual(item["Command_Id"], 31)
        self.assertEqual(item["Command_Ok"], 1)
        self.assertEqual(item["Counts_Per_Lb"], 10246.0)

    def test_readings_without_an_ack_are_unchanged(self) -> None:
        reading = parse_reading('{"Node_Code":"NODE-001","Weight":3.5}')
        item = build_ingest_body(reading, "GW-ALUMNI", "2026-10-22T14:00:00.000Z")["Readings"][0]
        self.assertNotIn("Command_Id", item)


class ForwardStatusTest(unittest.TestCase):
    def reply(self, accepted: list[dict]) -> Mock:
        reply = response(accepted)
        reply.status_code = 200
        reply.text = str({"Accepted": accepted})
        return reply

    def test_a_fault_is_not_called_a_duplicate(self) -> None:
        status = forward_status(self.reply([{"Fault": "load-cell", "Duplicate": False}]))
        self.assertEqual(status["detail"], "fault recorded")

    def test_a_real_duplicate_is_still_reported(self) -> None:
        status = forward_status(self.reply([{"Duplicate": True}]))
        self.assertEqual(status["detail"], "duplicate reading")


if __name__ == "__main__":
    unittest.main()
