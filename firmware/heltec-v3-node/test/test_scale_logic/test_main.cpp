#include <unity.h>

#include "scale_logic.h"

using namespace maple;

// Datasheet counts per pound for the YZC-1B cell, close to what NODE-001 stores.
static const float CPL = 38963.0f;

void setUp() {}
void tearDown() {}

void test_floating_zero_and_minus_one_is_stuck() {
  // A floating DT pin reads all zeros or all ones. This mix is what NODE-001
  // sent as "0.00 lb" with no load cell attached.
  const long samples[] = {0, -1, 0, 0, -1, 0, -1, 0, 0, -1};
  const SampleStats stats = analyzeSamples(samples, 10, 10, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Stuck, stats.verdict);
  const Fault fault = decideFault(stats, true, 0, CPL);
  TEST_ASSERT_EQUAL(Fault::LoadCell, fault);
  TEST_ASSERT_EQUAL_STRING("load-cell", faultCode(fault));
}

void test_all_identical_is_stuck() {
  const long samples[] = {123456, 123456, 123456, 123456, 123456, 123456, 123456, 123456};
  TEST_ASSERT_EQUAL(SampleVerdict::Stuck, analyzeSamples(samples, 8, 8, CPL).verdict);
}

void test_saturated_rail_is_load_cell() {
  const long samples[] = {8388607, 8388607, 8388607, 8388607, 8388607, 8388600, 8388607, 8388607};
  const SampleStats stats = analyzeSamples(samples, 8, 8, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Saturated, stats.verdict);
  TEST_ASSERT_EQUAL(Fault::LoadCell, decideFault(stats, true, 0, CPL));

  const long low[] = {-8388608, -8388000, -8388100, -8387900, -8388200, -8388300};
  TEST_ASSERT_EQUAL(SampleVerdict::Saturated, analyzeSamples(low, 6, 6, CPL).verdict);
}

void test_too_few_samples_is_no_response() {
  const long samples[] = {1000, 1010, 990, 1005, 995};
  const SampleStats stats = analyzeSamples(samples, 5, 10, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::NoResponse, stats.verdict);
  TEST_ASSERT_EQUAL(Fault::LoadCell, decideFault(stats, true, 0, CPL));
}

void test_quiet_samples_are_ok_with_trimmed_mean() {
  // 12 samples: drops the two lowest (90, 95) and two highest (130, 140).
  const long samples[] = {100, 140, 110, 90, 120, 105, 115, 95, 130, 100, 110, 120};
  const SampleStats stats = analyzeSamples(samples, 12, 12, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Ok, stats.verdict);
  // Middle eight: 100 100 105 110 110 115 120 120 -> 880 / 8 = 110
  TEST_ASSERT_EQUAL(110, stats.raw);
  TEST_ASSERT_EQUAL(20, stats.spread);
  TEST_ASSERT_EQUAL(12, stats.good);
  TEST_ASSERT_EQUAL(Fault::None, decideFault(stats, true, 0, CPL));
  TEST_ASSERT_NULL(faultCode(Fault::None));
}

void test_single_outlier_is_trimmed() {
  long samples[12];
  for (int i = 0; i < 12; i++) samples[i] = 500000 + (i % 3) * 40;
  samples[7] = 500000 + static_cast<long>(0.5f * CPL);  // one bump on the bucket
  const SampleStats stats = analyzeSamples(samples, 12, 12, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Ok, stats.verdict);
}

void test_spread_over_point_three_lb_is_unstable() {
  long samples[12];
  for (int i = 0; i < 12; i++) samples[i] = 500000 + static_cast<long>(i * 0.06f * CPL);
  const SampleStats stats = analyzeSamples(samples, 12, 12, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Unstable, stats.verdict);
  const Fault fault = decideFault(stats, true, 0, CPL);
  TEST_ASSERT_EQUAL(Fault::Unstable, fault);
  TEST_ASSERT_EQUAL_STRING("unstable", faultCode(fault));
}

void test_spread_over_five_lb_is_garbage_load_cell() {
  // An open bridge wire: the amplifier answers, but the numbers wander by pounds.
  long samples[12];
  for (int i = 0; i < 12; i++) samples[i] = (i % 2 ? 1 : -1) * static_cast<long>((i + 1) * 1.0f * CPL);
  const SampleStats stats = analyzeSamples(samples, 12, 12, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Garbage, stats.verdict);
  TEST_ASSERT_EQUAL(Fault::LoadCell, decideFault(stats, true, 0, CPL));
}

void test_reversed_below_tare() {
  long samples[10];
  const long zero = 800000;
  for (int i = 0; i < 10; i++) samples[i] = zero - static_cast<long>(0.5f * CPL) + i * 30;
  const SampleStats stats = analyzeSamples(samples, 10, 10, CPL);
  TEST_ASSERT_EQUAL(SampleVerdict::Ok, stats.verdict);
  const Fault fault = decideFault(stats, true, zero, CPL);
  TEST_ASSERT_EQUAL(Fault::Reversed, fault);
  TEST_ASSERT_EQUAL_STRING("reversed", faultCode(fault));

  // A little under zero is drift, not a reversed cell.
  for (int i = 0; i < 10; i++) samples[i] = zero - static_cast<long>(0.1f * CPL) + i * 30;
  TEST_ASSERT_EQUAL(Fault::None, decideFault(analyzeSamples(samples, 10, 10, CPL), true, zero, CPL));
}

void test_untared_when_never_tared() {
  const long samples[] = {1000, 1040, 990, 1005, 995, 1020, 1010, 1000};
  const SampleStats stats = analyzeSamples(samples, 8, 8, CPL);
  const Fault fault = decideFault(stats, false, 0, CPL);
  TEST_ASSERT_EQUAL(Fault::Untared, fault);
  TEST_ASSERT_EQUAL_STRING("untared", faultCode(fault));
}

void test_wiring_classification() {
  TEST_ASSERT_EQUAL(Wiring::Normal, classifyWiring(true, false));
  TEST_ASSERT_EQUAL(Wiring::Normal, classifyWiring(true, true));
  TEST_ASSERT_EQUAL(Wiring::Swapped, classifyWiring(false, true));
  TEST_ASSERT_EQUAL(Wiring::Missing, classifyWiring(false, false));
}

void test_counts_for_pounds() {
  TEST_ASSERT_EQUAL(11689, countsForPounds(0.3f, CPL));
  TEST_ASSERT_EQUAL(0, countsForPounds(0.3f, 0.0f));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_floating_zero_and_minus_one_is_stuck);
  RUN_TEST(test_all_identical_is_stuck);
  RUN_TEST(test_saturated_rail_is_load_cell);
  RUN_TEST(test_too_few_samples_is_no_response);
  RUN_TEST(test_quiet_samples_are_ok_with_trimmed_mean);
  RUN_TEST(test_single_outlier_is_trimmed);
  RUN_TEST(test_spread_over_point_three_lb_is_unstable);
  RUN_TEST(test_spread_over_five_lb_is_garbage_load_cell);
  RUN_TEST(test_reversed_below_tare);
  RUN_TEST(test_untared_when_never_tared);
  RUN_TEST(test_wiring_classification);
  RUN_TEST(test_counts_for_pounds);
  return UNITY_END();
}
