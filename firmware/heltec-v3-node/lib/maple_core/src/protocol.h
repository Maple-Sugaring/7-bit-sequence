#pragma once

#include <stddef.h>
#include <stdint.h>

// The text the node speaks: LoRa JSON to and from the gateway, and serial
// commands from a laptop or the web flasher. Field names and order match
// firmware/heltec-v3-gateway and Maple-Sugar-BE /ingest; do not rename them.

namespace maple {

// Same limits as the API and gateway. 10 s is for demos; the field runs minutes.
static const uint32_t MIN_INTERVAL_S = 10;
static const uint32_t MAX_INTERVAL_S = 86400;
// A calibration weight below this is a typo, not a test weight.
static const float MIN_CAL_POUNDS = 0.05f;

struct Uplink {
  const char *nodeCode;
  const char *fault;  // nullptr: send weightLb instead
  float weightLb;
  int batteryPercent;  // < 0: no pack measured, field left out
  uint32_t intervalS;
  bool echo;  // repeat the last app command's result
  uint32_t commandId;
  bool commandOk;
  float countsPerLb;
};

// Writes the JSON into `out`. Returns its length, or 0 if it did not fit.
size_t buildUplink(const Uplink &up, char *out, size_t outLen);

enum class Action { None, Tare, Cal };

struct Downlink {
  bool hasInterval;
  uint32_t intervalS;
  Action action;
  uint32_t commandId;
  float pounds;
};

// False when the packet is not addressed to `nodeCode` (exact match).
bool parseDownlink(const char *payload, const char *nodeCode, Downlink *out);

enum class CommandType { None, Help, Status, Tare, Cal, BatCal, Interval, Provision, Factory, Reboot, Unknown };

struct Command {
  CommandType type;
  float number;      // CAL pounds, BATCAL millivolts, INTERVAL seconds
  const char *rest;  // text after the keyword (PROVISION JSON), points into the line
};

// `line` is one trimmed serial line. Keywords ignore case.
Command parseCommand(const char *line);

// Copies the string value of "key":"..." into out (truncated to fit).
// False when the key is missing or its value is empty.
bool jsonString(const char *json, const char *key, char *out, size_t outLen);

}  // namespace maple
