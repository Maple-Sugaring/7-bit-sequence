#include <unity.h>

#include "battery_logic.h"

using namespace maple;

void setUp() {}
void tearDown() {}

void test_curve_points() {
  TEST_ASSERT_EQUAL(100, batteryPercentFromMv(4200));
  TEST_ASSERT_EQUAL(46, batteryPercentFromMv(3790));
  TEST_ASSERT_EQUAL(17, batteryPercentFromMv(3670));
  TEST_ASSERT_EQUAL(0, batteryPercentFromMv(3300));
}

void test_curve_interpolates() {
  // Halfway between 3920 (68%) and 4000 (79%).
  const int percent = batteryPercentFromMv(3960);
  TEST_ASSERT_TRUE(percent == 73 || percent == 74);
  TEST_ASSERT_EQUAL(95, batteryPercentFromMv(4150));
}

void test_charging_voltage_clamps_to_100() {
  TEST_ASSERT_EQUAL(100, batteryPercentFromMv(4350));
}

void test_deep_discharge_clamps_to_0() {
  TEST_ASSERT_EQUAL(0, batteryPercentFromMv(3000));
}

void test_out_of_range_is_no_pack() {
  TEST_ASSERT_EQUAL(-1, batteryPercentFromMv(0));
  TEST_ASSERT_EQUAL(-1, batteryPercentFromMv(-1));
  TEST_ASSERT_EQUAL(-1, batteryPercentFromMv(2400));
  TEST_ASSERT_EQUAL(-1, batteryPercentFromMv(4600));
}

void test_power_state_thresholds() {
  TEST_ASSERT_EQUAL(PowerState::Normal, powerStateFromMv(3700, PowerState::Normal));
  TEST_ASSERT_EQUAL(PowerState::Critical, powerStateFromMv(3290, PowerState::Normal));
  TEST_ASSERT_EQUAL(PowerState::Cutoff, powerStateFromMv(3100, PowerState::Normal));
}

void test_power_state_hysteresis() {
  // Coming back up needs 100 mV of headroom, so a pack that sags under the
  // radio does not flip in and out of protection every report.
  TEST_ASSERT_EQUAL(PowerState::Critical, powerStateFromMv(3350, PowerState::Critical));
  TEST_ASSERT_EQUAL(PowerState::Normal, powerStateFromMv(3350, PowerState::Normal));
  TEST_ASSERT_EQUAL(PowerState::Normal, powerStateFromMv(3400, PowerState::Critical));
  TEST_ASSERT_EQUAL(PowerState::Cutoff, powerStateFromMv(3200, PowerState::Cutoff));
  TEST_ASSERT_EQUAL(PowerState::Critical, powerStateFromMv(3250, PowerState::Cutoff));
}

void test_no_pack_is_normal() {
  TEST_ASSERT_EQUAL(PowerState::Normal, powerStateFromMv(-1, PowerState::Normal));
  TEST_ASSERT_EQUAL(PowerState::Normal, powerStateFromMv(-1, PowerState::Critical));
}

void test_divider_scaling() {
  TEST_ASSERT_EQUAL(4096, dividerMvToBatteryMv(800, 1.045f));
  TEST_ASSERT_EQUAL(3920, dividerMvToBatteryMv(800, 1.0f));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_curve_points);
  RUN_TEST(test_curve_interpolates);
  RUN_TEST(test_charging_voltage_clamps_to_100);
  RUN_TEST(test_deep_discharge_clamps_to_0);
  RUN_TEST(test_out_of_range_is_no_pack);
  RUN_TEST(test_power_state_thresholds);
  RUN_TEST(test_power_state_hysteresis);
  RUN_TEST(test_no_pack_is_normal);
  RUN_TEST(test_divider_scaling);
  return UNITY_END();
}
