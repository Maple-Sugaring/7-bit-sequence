#pragma once

#include <stdint.h>

#include "battery_logic.h"

enum class Wake { Timer, Button };

// CPU to 80 MHz, task watchdog on the loop task, held pins released.
void powerBegin();
void watchdogFeed();
// Light sleep (RAM, GPIO levels and millis() survive) until the timer or a
// PRG press. Split into chunks so the watchdog is fed on long intervals.
Wake lightSleepFor(uint32_t ms);
// Deep sleep: the HX711 and radio are already off; holds their lines so
// nothing wakes up while the ESP32 is off. Boots fresh after `seconds`.
[[noreturn]] void deepSleepFor(uint32_t seconds);
bool bootedFromBrownout();
bool bootedFromDeepSleep();
const char *resetReasonText();
// Survives deep sleep, so the pack hysteresis holds across wakes.
maple::PowerState &rememberedPowerState();
