#pragma once

#include <stdint.h>

struct LiveView {
  const char *nodeCode;
  bool hasWeight;
  float pounds;
  const char *title;  // fault title instead of a weight, or nullptr
  const char *hint;   // bottom line
  int batteryPercent; // -1: no pack (USB power)
  int batteryMv;
  uint32_t nextTxS;
  uint32_t serviceLeftS;
};

void displayBegin();
// The SSD1306 sleeps (about 10 uA) instead of cutting Vext, which also feeds
// the header pins and would need a full re-init.
void displayPower(bool on);
bool displayOn();
void displayLive(const LiveView &view);
void displayMessage(const char *title, const char *line1, const char *line2);
// Before deep sleep: panel asleep, Vext held off.
void displayShutdown();
