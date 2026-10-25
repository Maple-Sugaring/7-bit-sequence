#include "console.h"

#include <Arduino.h>
#include <ctype.h>
#include <stdarg.h>
#include <string.h>

#include "config.h"

namespace {

HardwareSerial HostUart(0);
char line[200];
size_t lineLen = 0;
bool lineTooLong = false;

}  // namespace

void consoleBegin() {
  HostUart.begin(115200, SERIAL_8N1, PIN_HOST_RX, PIN_HOST_TX);
}

bool consolePoll(maple::Command *out) {
  while (HostUart.available()) {
    const char c = static_cast<char>(HostUart.read());
    if (c == '\r') continue;
    if (c != '\n') {
      if (lineLen < sizeof(line) - 1) {
        line[lineLen++] = c;
      } else {
        lineTooLong = true;
      }
      continue;
    }
    line[lineLen] = '\0';
    const bool dropped = lineTooLong;
    lineLen = 0;
    lineTooLong = false;
    if (dropped) {
      logf("? line too long");
      continue;
    }
    // Trim the end; parseCommand skips leading space.
    size_t end = strlen(line);
    while (end > 0 && isspace(static_cast<unsigned char>(line[end - 1]))) line[--end] = '\0';
    *out = maple::parseCommand(line);
    if (out->type != maple::CommandType::None) return true;
  }
  return false;
}

void consoleFlush() {
  HostUart.flush();
}

void logf(const char *fmt, ...) {
  char buffer[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buffer, sizeof(buffer), fmt, args);
  va_end(args);
  HostUart.println(buffer);
}
