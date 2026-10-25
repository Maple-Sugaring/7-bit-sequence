#include <string.h>
#include <unity.h>

#include "protocol.h"

using namespace maple;

void setUp() {}
void tearDown() {}

static Uplink weightUplink() {
  Uplink up = {};
  up.nodeCode = "NODE-001";
  up.fault = nullptr;
  up.weightLb = 35.9f;
  up.batteryPercent = 88;
  up.intervalS = 20;
  return up;
}

void test_uplink_weight() {
  char out[192];
  const Uplink up = weightUplink();
  const size_t used = buildUplink(up, out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING(
      "{\"Node_Code\":\"NODE-001\",\"Weight\":35.90,\"Battery_Percent\":88,\"Interval_Seconds\":20}", out);
  TEST_ASSERT_EQUAL(strlen(out), used);
}

void test_uplink_negative_weight_floors_to_zero() {
  char out[192];
  Uplink up = weightUplink();
  up.weightLb = -0.04f;
  buildUplink(up, out, sizeof(out));
  TEST_ASSERT_NOT_NULL(strstr(out, "\"Weight\":0.00,"));
}

void test_uplink_fault() {
  char out[192];
  Uplink up = weightUplink();
  up.fault = "load-cell";
  buildUplink(up, out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING(
      "{\"Node_Code\":\"NODE-001\",\"Fault\":\"load-cell\",\"Battery_Percent\":88,\"Interval_Seconds\":20}", out);
}

void test_uplink_omits_battery_when_unknown() {
  char out[192];
  Uplink up = weightUplink();
  up.batteryPercent = -1;
  buildUplink(up, out, sizeof(out));
  TEST_ASSERT_EQUAL_STRING("{\"Node_Code\":\"NODE-001\",\"Weight\":35.90,\"Interval_Seconds\":20}", out);
}

void test_uplink_echo() {
  char out[192];
  Uplink up = weightUplink();
  up.echo = true;
  up.commandId = 7;
  up.commandOk = true;
  up.countsPerLb = 10246.4f;
  buildUplink(up, out, sizeof(out));
  const char *tail = ",\"Interval_Seconds\":20,\"Command_Id\":7,\"Command_Ok\":1,\"Counts_Per_Lb\":10246}";
  TEST_ASSERT_EQUAL_STRING(tail, out + strlen(out) - strlen(tail));
}

void test_uplink_sixteen_char_code() {
  char out[192];
  Uplink up = weightUplink();
  up.nodeCode = "ABCDEFGHIJKLMNOP";
  TEST_ASSERT_TRUE(buildUplink(up, out, sizeof(out)) > 0);
  TEST_ASSERT_NOT_NULL(strstr(out, "\"Node_Code\":\"ABCDEFGHIJKLMNOP\","));
}

void test_uplink_too_small_buffer_returns_zero() {
  char out[24];
  TEST_ASSERT_EQUAL(0, buildUplink(weightUplink(), out, sizeof(out)));
}

void test_downlink_interval() {
  Downlink down;
  TEST_ASSERT_TRUE(parseDownlink("{\"Node_Code\":\"NODE-001\",\"Interval_Seconds\":900}", "NODE-001", &down));
  TEST_ASSERT_TRUE(down.hasInterval);
  TEST_ASSERT_EQUAL_UINT32(900, down.intervalS);
  TEST_ASSERT_EQUAL(Action::None, down.action);
}

void test_downlink_interval_out_of_range_ignored() {
  Downlink down;
  TEST_ASSERT_TRUE(parseDownlink("{\"Node_Code\":\"NODE-001\",\"Interval_Seconds\":5}", "NODE-001", &down));
  TEST_ASSERT_FALSE(down.hasInterval);
  TEST_ASSERT_TRUE(parseDownlink("{\"Node_Code\":\"NODE-001\",\"Interval_Seconds\":90000}", "NODE-001", &down));
  TEST_ASSERT_FALSE(down.hasInterval);
}

void test_downlink_tare() {
  Downlink down;
  TEST_ASSERT_TRUE(
      parseDownlink("{\"Node_Code\":\"NODE-001\",\"Command_Id\":42,\"Action\":\"TARE\"}", "NODE-001", &down));
  TEST_ASSERT_EQUAL(Action::Tare, down.action);
  TEST_ASSERT_EQUAL_UINT32(42, down.commandId);
  TEST_ASSERT_FALSE(down.hasInterval);
}

void test_downlink_cal_pounds() {
  Downlink down;
  TEST_ASSERT_TRUE(parseDownlink(
      "{\"Node_Code\":\"NODE-001\",\"Command_Id\":43,\"Action\":\"CAL\",\"Pounds\":7.875}", "NODE-001", &down));
  TEST_ASSERT_EQUAL(Action::Cal, down.action);
  TEST_ASSERT_EQUAL_UINT32(43, down.commandId);
  TEST_ASSERT_FLOAT_WITHIN(0.0005f, 7.875f, down.pounds);
}

void test_downlink_cal_tiny_pounds_ignored() {
  Downlink down;
  TEST_ASSERT_TRUE(parseDownlink(
      "{\"Node_Code\":\"NODE-001\",\"Command_Id\":44,\"Action\":\"CAL\",\"Pounds\":0.01}", "NODE-001", &down));
  TEST_ASSERT_EQUAL(Action::None, down.action);
}

void test_downlink_zero_command_id_ignored() {
  Downlink down;
  TEST_ASSERT_TRUE(
      parseDownlink("{\"Node_Code\":\"NODE-001\",\"Command_Id\":0,\"Action\":\"TARE\"}", "NODE-001", &down));
  TEST_ASSERT_EQUAL(Action::None, down.action);
}

void test_downlink_other_node_ignored() {
  Downlink down;
  TEST_ASSERT_FALSE(parseDownlink("{\"Node_Code\":\"NODE-002\",\"Interval_Seconds\":900}", "NODE-001", &down));
}

void test_downlink_exact_code_not_prefix() {
  Downlink down;
  TEST_ASSERT_FALSE(parseDownlink("{\"Node_Code\":\"NODE-0010\",\"Interval_Seconds\":900}", "NODE-001", &down));
  TEST_ASSERT_FALSE(parseDownlink("{\"Node_Code\":\"NODE-001\",\"Interval_Seconds\":900}", "NODE-00", &down));
}

void test_parse_commands() {
  TEST_ASSERT_EQUAL(CommandType::None, parseCommand("").type);
  TEST_ASSERT_EQUAL(CommandType::Help, parseCommand("HELP").type);
  TEST_ASSERT_EQUAL(CommandType::Help, parseCommand("?").type);
  TEST_ASSERT_EQUAL(CommandType::Status, parseCommand("status").type);
  TEST_ASSERT_EQUAL(CommandType::Tare, parseCommand("TARE").type);
  TEST_ASSERT_EQUAL(CommandType::Factory, parseCommand("FACTORY").type);
  TEST_ASSERT_EQUAL(CommandType::Reboot, parseCommand("REBOOT").type);
  TEST_ASSERT_EQUAL(CommandType::Unknown, parseCommand("TAREX").type);
  TEST_ASSERT_EQUAL(CommandType::Unknown, parseCommand("hello").type);

  const Command cal = parseCommand("CAL 7.875");
  TEST_ASSERT_EQUAL(CommandType::Cal, cal.type);
  TEST_ASSERT_FLOAT_WITHIN(0.0005f, 7.875f, cal.number);
  const Command badCal = parseCommand("CAL abc");
  TEST_ASSERT_EQUAL(CommandType::Cal, badCal.type);
  TEST_ASSERT_EQUAL_FLOAT(0.0f, badCal.number);

  const Command batcal = parseCommand("BATCAL 3987");
  TEST_ASSERT_EQUAL(CommandType::BatCal, batcal.type);
  TEST_ASSERT_EQUAL_FLOAT(3987.0f, batcal.number);

  const Command interval = parseCommand("INTERVAL 60");
  TEST_ASSERT_EQUAL(CommandType::Interval, interval.type);
  TEST_ASSERT_EQUAL_FLOAT(60.0f, interval.number);

  const Command provision = parseCommand("PROVISION {\"Node_Code\":\"NODE-004\"}");
  TEST_ASSERT_EQUAL(CommandType::Provision, provision.type);
  TEST_ASSERT_EQUAL_STRING("{\"Node_Code\":\"NODE-004\"}", provision.rest);
}

void test_json_string() {
  char out[24];
  TEST_ASSERT_TRUE(jsonString("{\"Node_Code\":\"NODE-004\",\"Rf_Tag\":\"T9\"}", "Rf_Tag", out, sizeof(out)));
  TEST_ASSERT_EQUAL_STRING("T9", out);
  TEST_ASSERT_FALSE(jsonString("{\"Node_Code\":\"\"}", "Node_Code", out, sizeof(out)));
  TEST_ASSERT_FALSE(jsonString("{\"Other\":\"x\"}", "Node_Code", out, sizeof(out)));
  char tiny[5];
  TEST_ASSERT_TRUE(jsonString("{\"Node_Code\":\"NODE-004\"}", "Node_Code", tiny, sizeof(tiny)));
  TEST_ASSERT_EQUAL_STRING("NODE", tiny);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_uplink_weight);
  RUN_TEST(test_uplink_negative_weight_floors_to_zero);
  RUN_TEST(test_uplink_fault);
  RUN_TEST(test_uplink_omits_battery_when_unknown);
  RUN_TEST(test_uplink_echo);
  RUN_TEST(test_uplink_sixteen_char_code);
  RUN_TEST(test_uplink_too_small_buffer_returns_zero);
  RUN_TEST(test_downlink_interval);
  RUN_TEST(test_downlink_interval_out_of_range_ignored);
  RUN_TEST(test_downlink_tare);
  RUN_TEST(test_downlink_cal_pounds);
  RUN_TEST(test_downlink_cal_tiny_pounds_ignored);
  RUN_TEST(test_downlink_zero_command_id_ignored);
  RUN_TEST(test_downlink_other_node_ignored);
  RUN_TEST(test_downlink_exact_code_not_prefix);
  RUN_TEST(test_parse_commands);
  RUN_TEST(test_json_string);
  return UNITY_END();
}
