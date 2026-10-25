#include "scale_logic.h"

#include <math.h>

namespace maple {

long countsForPounds(float pounds, float countsPerLb) {
  if (!(countsPerLb > 0.0f)) return 0;
  return lroundf(pounds * countsPerLb);
}

SampleStats analyzeSamples(const long *samples, int good, int requested, float countsPerLb) {
  SampleStats stats = {SampleVerdict::NoResponse, 0, 0, good};
  if (good > MAX_BURST_SAMPLES) good = MAX_BURST_SAMPLES;
  // At least 60% of the burst, and enough that trimming leaves a middle.
  int minGood = (requested * 6 + 9) / 10;
  if (minGood < 4) minGood = 4;
  if (good < minGood) return stats;

  long sorted[MAX_BURST_SAMPLES];
  for (int i = 0; i < good; i++) {
    const long value = samples[i];
    if (value >= HX_SATURATION_COUNTS || value <= -HX_SATURATION_COUNTS) {
      stats.verdict = SampleVerdict::Saturated;
      return stats;
    }
    int at = i;
    while (at > 0 && sorted[at - 1] > value) {
      sorted[at] = sorted[at - 1];
      at--;
    }
    sorted[at] = value;
  }

  if (sorted[good - 1] - sorted[0] <= HX_STUCK_SPREAD_COUNTS) {
    stats.verdict = SampleVerdict::Stuck;
    return stats;
  }

  // Drop the extremes so one bump or one bad conversion cannot move the pounds.
  const int trim = good >= 8 ? 2 : 1;
  long long total = 0;
  for (int i = trim; i < good - trim; i++) total += sorted[i];
  stats.raw = static_cast<long>(total / (good - 2 * trim));
  stats.spread = sorted[good - 1 - trim] - sorted[trim];

  if (stats.spread > countsForPounds(GARBAGE_SPREAD_LB, countsPerLb)) {
    stats.verdict = SampleVerdict::Garbage;
  } else if (stats.spread > countsForPounds(UNSTABLE_SPREAD_LB, countsPerLb)) {
    stats.verdict = SampleVerdict::Unstable;
  } else {
    stats.verdict = SampleVerdict::Ok;
  }
  return stats;
}

Fault decideFault(const SampleStats &stats, bool tared, long zero, float countsPerLb) {
  switch (stats.verdict) {
    case SampleVerdict::NoResponse:
    case SampleVerdict::Stuck:
    case SampleVerdict::Saturated:
    case SampleVerdict::Garbage:
      return Fault::LoadCell;
    case SampleVerdict::Unstable:
      return Fault::Unstable;
    case SampleVerdict::Ok:
      break;
  }
  if (!tared) return Fault::Untared;
  if (stats.raw - zero < -countsForPounds(REVERSED_DELTA_LB, countsPerLb)) return Fault::Reversed;
  return Fault::None;
}

const char *faultCode(Fault fault) {
  switch (fault) {
    case Fault::LoadCell:
      return "load-cell";
    case Fault::Unstable:
      return "unstable";
    case Fault::Reversed:
      return "reversed";
    case Fault::Untared:
      return "untared";
    case Fault::None:
      break;
  }
  return nullptr;
}

Wiring classifyWiring(bool gpio6DrivenHigh, bool gpio7DrivenHigh) {
  if (gpio6DrivenHigh) return Wiring::Normal;
  if (gpio7DrivenHigh) return Wiring::Swapped;
  return Wiring::Missing;
}

}  // namespace maple
