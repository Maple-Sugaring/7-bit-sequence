#pragma once

#include <stddef.h>
#include <stdint.h>

// SX1262 point-to-point LoRa to the gateway Heltec (not LoRaWAN).

static const int16_t RADIO_OK = 0;  // RADIOLIB_ERR_NONE

bool radioBegin();
bool radioReady();
// Transmits one packet, retrying once. Returns the RadioLib status.
int16_t radioSend(const char *json);
// Waits up to `ms` for one packet. Returns its length (NUL terminated in
// `buf`), or -1 on timeout or a bad packet.
int radioListen(char *buf, size_t len, uint32_t ms);
// Warm sleep (about 1 uA, keeps its settings); the next send wakes it.
void radioSleep();
// Cold sleep before the ESP32 deep-sleeps, with NSS held high.
void radioShutdown();
const char *radioErrorText(int16_t code);
