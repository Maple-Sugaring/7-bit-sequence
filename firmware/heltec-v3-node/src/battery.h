#pragma once

struct BatteryReading {
  int mv;       // pack voltage as measured, even when out of range
  int percent;  // 0..100, or -1 when no pack is on the lithium port
};

void batteryBegin();
// Reads the pack through the onboard divider. Call it with the radio idle:
// a transmit sags the pack and would read low.
BatteryReading batteryRead();
// Scales future readings so the current one equals a multimeter reading.
bool batteryCalibrate(int actualMv, float *factorOut);
float batteryFactor();
