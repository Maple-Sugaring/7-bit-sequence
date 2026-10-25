#pragma once

#include "hx711.h"
#include "scale_logic.h"

struct Measurement {
  maple::SampleStats stats;
  maple::Fault fault;
  maple::Wiring wiring;
  float pounds;  // gross pounds over the tare; meaningful only without a fault
};

// Loads tare and counts-per-pound from NVS (keys hx_zero, hx_cpl, hx_tared,
// hx_rev). A different cell type (hx_rev) discards the old zero.
void scaleLoad();
// Probes the HX711, takes a burst, and retries a burst that is not clean.
// Leaves the HX711 powered; the caller powers it down for sleep.
Measurement scaleMeasure(Hx711 &hx, int attempts);
// Classifies an already collected burst (the live service-mode readings).
Measurement scaleEvaluate(const long *samples, int good, int requested, maple::Wiring wiring);
void scaleTare(long raw);
// Sets counts per pound from a known weight. False when the weight did not
// move the bridge (nothing on the platform, or not tared).
bool scaleCalibrate(float pounds, long raw);
float scaleCountsPerLb();
long scaleZero();
bool scaleTared();
// What to tell a person standing at the tree for this measurement.
void scaleExplain(const Measurement &m, const char **title, const char **hint);
