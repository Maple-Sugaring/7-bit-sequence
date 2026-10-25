#include "protocol.h"

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

namespace maple {

namespace {

// snprintf that remembers whether anything was cut off.
struct Writer {
  char *out;
  size_t size;
  size_t used;
  bool overflow;

  void add(const char *fmt, ...) {
    if (overflow) return;
    va_list args;
    va_start(args, fmt);
    const int wrote = vsnprintf(out + used, size - used, fmt, args);
    va_end(args);
    if (wrote < 0 || static_cast<size_t>(wrote) >= size - used) {
      overflow = true;
      return;
    }
    used += static_cast<size_t>(wrote);
  }
};

// Start of the value after "key": in a flat JSON object, or nullptr.
const char *valueAfter(const char *json, const char *key) {
  char needle[40];
  const int wrote = snprintf(needle, sizeof(needle), "\"%s\":", key);
  if (wrote < 0 || static_cast<size_t>(wrote) >= sizeof(needle)) return nullptr;
  const char *at = strstr(json, needle);
  return at ? at + wrote : nullptr;
}

}  // namespace

size_t buildUplink(const Uplink &up, char *out, size_t outLen) {
  if (!out || outLen == 0) return 0;
  Writer w = {out, outLen, 0, false};
  w.add("{\"Node_Code\":\"%s\"", up.nodeCode ? up.nodeCode : "");
  if (up.fault) {
    w.add(",\"Fault\":\"%s\"", up.fault);
  } else {
    // Gross pounds including the bucket. Below zero is noise around the tare.
    w.add(",\"Weight\":%.2f", up.weightLb > 0.0f ? up.weightLb : 0.0f);
  }
  if (up.batteryPercent >= 0) w.add(",\"Battery_Percent\":%d", up.batteryPercent);
  w.add(",\"Interval_Seconds\":%lu", static_cast<unsigned long>(up.intervalS));
  if (up.echo && up.commandId != 0) {
    w.add(",\"Command_Id\":%lu,\"Command_Ok\":%d,\"Counts_Per_Lb\":%.0f",
          static_cast<unsigned long>(up.commandId), up.commandOk ? 1 : 0, up.countsPerLb);
  }
  w.add("}");
  if (w.overflow) {
    out[0] = '\0';
    return 0;
  }
  return w.used;
}

bool parseDownlink(const char *payload, const char *nodeCode, Downlink *out) {
  if (!payload || !nodeCode || !out) return false;
  char addressed[48];
  const int wrote = snprintf(addressed, sizeof(addressed), "\"Node_Code\":\"%s\"", nodeCode);
  if (wrote < 0 || static_cast<size_t>(wrote) >= sizeof(addressed)) return false;
  if (!strstr(payload, addressed)) return false;

  *out = Downlink{false, 0, Action::None, 0, 0.0f};

  if (const char *value = valueAfter(payload, "Interval_Seconds")) {
    const unsigned long seconds = strtoul(value, nullptr, 10);
    if (seconds >= MIN_INTERVAL_S && seconds <= MAX_INTERVAL_S) {
      out->hasInterval = true;
      out->intervalS = static_cast<uint32_t>(seconds);
    }
  }

  const char *idValue = valueAfter(payload, "Command_Id");
  const uint32_t id = idValue ? static_cast<uint32_t>(strtoul(idValue, nullptr, 10)) : 0;
  if (id == 0) return true;
  if (strstr(payload, "\"Action\":\"TARE\"")) {
    out->action = Action::Tare;
    out->commandId = id;
  } else if (strstr(payload, "\"Action\":\"CAL\"")) {
    const char *poundsValue = valueAfter(payload, "Pounds");
    const float pounds = poundsValue ? strtof(poundsValue, nullptr) : 0.0f;
    if (pounds > MIN_CAL_POUNDS) {
      out->action = Action::Cal;
      out->commandId = id;
      out->pounds = pounds;
    }
  }
  return true;
}

Command parseCommand(const char *line) {
  Command command = {CommandType::None, 0.0f, ""};
  if (!line) return command;
  while (*line && isspace(static_cast<unsigned char>(*line))) line++;
  if (!*line) return command;

  size_t keywordLen = 0;
  while (line[keywordLen] && !isspace(static_cast<unsigned char>(line[keywordLen]))) keywordLen++;
  const char *rest = line + keywordLen;
  while (*rest && isspace(static_cast<unsigned char>(*rest))) rest++;
  command.rest = rest;
  command.number = strtof(rest, nullptr);

  struct Keyword {
    const char *word;
    CommandType type;
  };
  static const Keyword KEYWORDS[] = {
      {"HELP", CommandType::Help},         {"?", CommandType::Help},
      {"STATUS", CommandType::Status},     {"TARE", CommandType::Tare},
      {"CAL", CommandType::Cal},           {"BATCAL", CommandType::BatCal},
      {"INTERVAL", CommandType::Interval}, {"PROVISION", CommandType::Provision},
      {"FACTORY", CommandType::Factory},   {"REBOOT", CommandType::Reboot},
  };
  command.type = CommandType::Unknown;
  for (const Keyword &keyword : KEYWORDS) {
    if (strlen(keyword.word) == keywordLen && strncasecmp(line, keyword.word, keywordLen) == 0) {
      command.type = keyword.type;
      break;
    }
  }
  return command;
}

bool jsonString(const char *json, const char *key, char *out, size_t outLen) {
  if (!json || !out || outLen == 0) return false;
  out[0] = '\0';
  const char *value = valueAfter(json, key);
  if (!value || *value != '"') return false;
  value++;
  const char *end = strchr(value, '"');
  if (!end) return false;
  size_t len = static_cast<size_t>(end - value);
  if (len >= outLen) len = outLen - 1;
  memcpy(out, value, len);
  out[len] = '\0';
  return len > 0;
}

}  // namespace maple
