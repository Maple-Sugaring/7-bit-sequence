#include "battery_logic.h"

#include <math.h>

namespace maple {

namespace {

struct CurvePoint {
  int mv;
  int percent;
};

// Single 18650 cell at a light load, high to low. Li-ion is flat through the
// middle, so a straight 3.3-4.2 V line overstates charge for most of a night.
const CurvePoint CURVE[] = {
    {4200, 100}, {4100, 90}, {4000, 79}, {3920, 68}, {3850, 57}, {3790, 46},
    {3750, 36},  {3710, 26}, {3670, 17}, {3610, 9},  {3500, 4},  {3300, 0},
};
const int CURVE_POINTS = sizeof(CURVE) / sizeof(CURVE[0]);

}  // namespace

int batteryPercentFromMv(int mv) {
  if (mv < PACK_MIN_MV || mv > PACK_MAX_MV) return -1;
  if (mv >= CURVE[0].mv) return 100;
  for (int i = 1; i < CURVE_POINTS; i++) {
    const CurvePoint &high = CURVE[i - 1];
    const CurvePoint &low = CURVE[i];
    if (mv >= low.mv) {
      const float t = static_cast<float>(mv - low.mv) / static_cast<float>(high.mv - low.mv);
      return static_cast<int>(lroundf(low.percent + t * (high.percent - low.percent)));
    }
  }
  return 0;
}

PowerState powerStateFromMv(int mv, PowerState previous) {
  if (mv < 0) return PowerState::Normal;
  if (mv < CUTOFF_MV || (previous == PowerState::Cutoff && mv < CUTOFF_MV + RECOVER_MARGIN_MV)) {
    return PowerState::Cutoff;
  }
  const bool wasLow = previous != PowerState::Normal;
  if (mv < CRITICAL_MV || (wasLow && mv < CRITICAL_MV + RECOVER_MARGIN_MV)) {
    return PowerState::Critical;
  }
  return PowerState::Normal;
}

int dividerMvToBatteryMv(int pinMv, float factor) {
  return static_cast<int>(lroundf(static_cast<float>(pinMv) * VBAT_DIVIDER * factor));
}

}  // namespace maple
