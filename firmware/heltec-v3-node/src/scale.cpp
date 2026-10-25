#include "scale.h"

#include <Arduino.h>
#include <Preferences.h>
#include <stdlib.h>

#include "config.h"
#include "console.h"

namespace {

long zero = 0;
float countsPerLb = 0;
bool tared = false;

float datasheetCountsPerLb() {
  const float fraction = (CELL_MV_PER_V / 1000.0f) / (0.5f / HX711_GAIN);
  const float countsPerKg = fraction * HX711_FULL_SCALE_COUNTS / CELL_CAPACITY_KG;
  return countsPerKg * KG_PER_LB;
}

void save() {
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putLong("hx_zero", zero);
  prefs.putFloat("hx_cpl", countsPerLb);
  prefs.putBool("hx_tared", tared);
  prefs.putUChar("hx_rev", CELL_CAL_REV);
  prefs.end();
}

}  // namespace

void scaleLoad() {
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, true);
  tared = prefs.getBool("hx_tared", false);
  zero = prefs.getLong("hx_zero", 0);
  countsPerLb = prefs.getFloat("hx_cpl", 0);
  const uint8_t rev = prefs.getUChar("hx_rev", 0);
  prefs.end();

  bool changed = false;
  if (rev != CELL_CAL_REV) {
    // A different sensor: its zero means nothing here, so tare again on the
    // next clean reading.
    tared = false;
    zero = 0;
    changed = true;
  }
  if (tared && maple::storedZeroIsBogus(zero)) {
    logf("[scale] stored zero %ld came from a disconnected HX711; taring again on the next clean reading", zero);
    tared = false;
    changed = true;
  }
  if (rev != CELL_CAL_REV || !(countsPerLb > 100.0f)) {
    countsPerLb = datasheetCountsPerLb();
    changed = true;
  }
  if (changed) save();
  logf("[scale] cell %s, counts/lb=%.0f, %s", CELL_SETUP, countsPerLb, tared ? "tared" : "not tared");
}

Measurement scaleEvaluate(const long *samples, int good, int requested, maple::Wiring wiring) {
  Measurement m;
  m.stats = maple::analyzeSamples(samples, good, requested, countsPerLb);
  m.fault = maple::decideFault(m.stats, tared, zero, countsPerLb);
  m.wiring = wiring;
  m.pounds = static_cast<float>(m.stats.raw - zero) / countsPerLb;
  return m;
}

Measurement scaleMeasure(Hx711 &hx, int attempts) {
  Measurement m = {};
  long samples[BURST_SAMPLES];
  for (int attempt = 1; attempt <= attempts; attempt++) {
    hx.probe();
    const int good = hx.burst(samples, BURST_SAMPLES);
    m = scaleEvaluate(samples, good, BURST_SAMPLES, hx.wiring());
    if (m.stats.verdict == maple::SampleVerdict::Ok) break;
    logf("[scale] attempt %d/%d not clean (%s, %d samples)", attempt, attempts,
         maple::faultCode(maple::decideFault(m.stats, true, zero, countsPerLb)), good);
  }
  return m;
}

void scaleTare(long raw) {
  zero = raw;
  tared = true;
  save();
  logf("[scale] tared zero=%ld counts/lb=%.0f", zero, countsPerLb);
}

bool scaleCalibrate(float pounds, long raw) {
  const long delta = raw - zero;
  if (!tared || pounds <= 0.0f || labs(delta) < CAL_MIN_DELTA_COUNTS) return false;
  countsPerLb = static_cast<float>(labs(delta)) / pounds;
  save();
  logf("[scale] calibrated %.0f counts/lb with %.3f lb", countsPerLb, pounds);
  return true;
}

float scaleCountsPerLb() {
  return countsPerLb;
}

long scaleZero() {
  return zero;
}

bool scaleTared() {
  return tared;
}

void scaleExplain(const Measurement &m, const char **title, const char **hint) {
  switch (m.stats.verdict) {
    case maple::SampleVerdict::NoResponse:
      *title = m.wiring == maple::Wiring::Missing ? "HX711 not found" : "HX711 stopped";
      *hint = "Check 3V3 GND DT SCK";
      return;
    case maple::SampleVerdict::Stuck:
      *title = "HX711 data stuck";
      *hint = "Check HX711 power, DT";
      return;
    case maple::SampleVerdict::Saturated:
      *title = "Load cell open";
      *hint = "Check E+ E- A+ A-";
      return;
    case maple::SampleVerdict::Garbage:
      *title = "Load cell noisy";
      *hint = "Check cell wires";
      return;
    case maple::SampleVerdict::Unstable:
      *title = "Unstable reading";
      *hint = "Wind or loose cable";
      return;
    case maple::SampleVerdict::Ok:
      break;
  }
  switch (m.fault) {
    case maple::Fault::Untared:
      *title = "Not tared";
      *hint = "Empty it, hold PRG 3s";
      return;
    case maple::Fault::Reversed:
      *title = "Below tare";
      *hint = "Re-tare or flip cell";
      return;
    default:
      break;
  }
  *title = nullptr;
  *hint = m.wiring == maple::Wiring::Swapped ? "DT/SCK swapped: OK" : "Hold PRG 3s to tare";
}
