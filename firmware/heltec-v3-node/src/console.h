#pragma once

#include "protocol.h"

// Serial console on UART0 (the CP2102 behind the USB-C jack).
void consoleBegin();
// True when a full line arrived; `out->rest` stays valid until the next poll.
bool consolePoll(maple::Command *out);
void consoleFlush();
void logf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
