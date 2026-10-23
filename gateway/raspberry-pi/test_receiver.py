"""Run with: python3 -m unittest test_receiver (needs requirements.txt installed)."""

from __future__ import annotations

import unittest
from unittest.mock import Mock

from receiver import (
    PacketStore,
    build_ingest_body,
    downlink_command,
    forward_status,
    line_packet,
    parse_reading,
    process_packet,
)


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


class PacketStoreTest(unittest.TestCase):
    def test_nodes_keep_counts_past_the_history_limit(self) -> None:
        store = PacketStore(history_limit=2)
        for text in (
            '{"Node_Code":"NODE-001","Weight":1}',
            '{"Node_Code":"NODE-002","Weight":2}',
            '{"Node_Code":"NODE-001","Fault":"unstable"}',
        ):
            store.add(line_packet(text))
        snap = store.snapshot()
        self.assertEqual(len(snap["packets"]), 2)
        nodes = {node["node_code"]: node for node in snap["nodes"]}
        self.assertEqual(nodes["NODE-001"]["packets"], 2)
        self.assertEqual(nodes["NODE-001"]["faults"], 1)
        self.assertEqual(nodes["NODE-001"]["last_weight"], 1.0)
        self.assertEqual(nodes["NODE-002"]["packets"], 1)

    def test_since_returns_only_newer_packets(self) -> None:
        store = PacketStore()
        for weight in (1, 2, 3):
            store.add(line_packet(f'{{"Node_Code":"NODE-001","Weight":{weight}}}'))
        seqs = [packet["seq"] for packet in store.snapshot(since=1)["packets"]]
        self.assertEqual(seqs, [3, 2])

    def test_parse_errors_are_counted(self) -> None:
        store = PacketStore()
        store.add(line_packet('{"Weight":1}'))
        self.assertEqual(store.snapshot()["parse_errors"], 1)


class ProcessPacketTest(unittest.TestCase):
    def test_the_downlink_is_kept_on_the_packet(self) -> None:
        packet = line_packet('{"Node_Code":"NODE-001","Weight":1,"Interval_Seconds":900}')
        send = Mock(return_value="INTERVAL NODE-001 10\n")
        command = process_packet(packet, True, "token", "url", "GW", send=send)
        self.assertEqual(command, "INTERVAL NODE-001 10\n")
        self.assertEqual(packet["downlink"], "INTERVAL NODE-001 10")

    def test_local_only_mode_says_so(self) -> None:
        packet = line_packet('{"Node_Code":"NODE-001","Weight":1}')
        self.assertIsNone(process_packet(packet, False, "", "url", "GW"))
        self.assertIsNone(packet["downlink"])
        self.assertIn("FORWARD_TO_SERVER=0", packet["forward"]["detail"])

    def test_missing_token_is_reported(self) -> None:
        packet = line_packet('{"Node_Code":"NODE-001","Weight":1}')
        process_packet(packet, True, "", "url", "GW")
        self.assertIn("GATEWAY_INGEST_TOKEN is empty", packet["forward"]["detail"])


if __name__ == "__main__":
    unittest.main()
