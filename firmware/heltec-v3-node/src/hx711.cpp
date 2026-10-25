#include "hx711.h"

#include <Arduino.h>
#include <limits.h>

#include "config.h"

void Hx711::begin() {
  assignPins(maple::Wiring::Normal);
  wiring_ = maple::Wiring::Missing;
  powerDown();
}

void Hx711::assignPins(maple::Wiring wiring) {
  wiring_ = wiring;
  const bool swapped = wiring == maple::Wiring::Swapped;
  dt_ = swapped ? PIN_HX_SCK : PIN_HX_DT;
  sck_ = swapped ? PIN_HX_DT : PIN_HX_SCK;
}

maple::Wiring Hx711::probe() {
  // Both lines pulled up: PD_SCK high for over 60 us powers the HX711 down,
  // whichever pin it is on. Nothing is driven, so a swapped cable never has
  // an output fighting the chip's DOUT.
  pinMode(PIN_HX_DT, INPUT_PULLUP);
  pinMode(PIN_HX_SCK, INPUT_PULLUP);
  delay(2);
  // Both pulled down: PD_SCK goes low and the chip resets. DOUT then drives
  // high until its first conversion (about 400 ms), against the pull-down.
  pinMode(PIN_HX_DT, INPUT_PULLDOWN);
  pinMode(PIN_HX_SCK, INPUT_PULLDOWN);
  bool gpio6High = false;
  bool gpio7High = false;
  for (int i = 0; i < 20; i++) {
    delay(1);
    gpio6High |= digitalRead(PIN_HX_DT) == HIGH;
    gpio7High |= digitalRead(PIN_HX_SCK) == HIGH;
  }
  const maple::Wiring seen = maple::classifyWiring(gpio6High, gpio7High);
  // Nothing answered: still try the wiring on the diagram, and let the burst
  // decide. A pull-up on DT means a missing chip reads "not ready" forever
  // instead of floating to 0 / -1 and passing for a weight.
  assignPins(seen == maple::Wiring::Swapped ? maple::Wiring::Swapped : maple::Wiring::Normal);
  wiring_ = seen;
  pinMode(dt_, INPUT_PULLUP);
  pinMode(sck_, OUTPUT);
  digitalWrite(sck_, LOW);
  powered_ = true;
  return seen;
}

void Hx711::powerDown() {
  // Pull-ups, not outputs: PD_SCK stays high (HX711 and the bridge off, about
  // 1 uA) in light sleep, and stays safe if the cable is swapped.
  pinMode(PIN_HX_DT, INPUT_PULLUP);
  pinMode(PIN_HX_SCK, INPUT_PULLUP);
  powered_ = false;
}

bool Hx711::ready() const {
  return powered_ && digitalRead(dt_) == LOW;
}

long Hx711::readOne(uint32_t timeoutMs) {
  if (!powered_) return LONG_MIN;
  const uint32_t start = millis();
  while (digitalRead(dt_) == HIGH) {
    if (millis() - start > timeoutMs) return LONG_MIN;
    delay(1);
  }

  noInterrupts();
  uint32_t value = 0;
  for (uint8_t bit = 0; bit < 24; bit++) {
    digitalWrite(sck_, HIGH);
    delayMicroseconds(HX_CLOCK_HALF_US);
    value = (value << 1) | (digitalRead(dt_) == HIGH ? 1U : 0U);
    digitalWrite(sck_, LOW);
    delayMicroseconds(HX_CLOCK_HALF_US);
  }
  // 25th pulse: channel A, gain 128 for the next conversion.
  digitalWrite(sck_, HIGH);
  delayMicroseconds(HX_CLOCK_HALF_US);
  digitalWrite(sck_, LOW);
  interrupts();

  if (value & 0x800000UL) value |= 0xFF000000UL;
  return static_cast<long>(static_cast<int32_t>(value));
}

int Hx711::burst(long *out, int n) {
  if (!powered_) probe();
  // The first conversion after power-up proves the chip is there at all; if
  // it never comes there is no point waiting out the rest of the burst.
  if (readOne(HX_FIRST_READY_MS) == LONG_MIN) return 0;
  for (int i = 1; i < HX_DISCARD_SAMPLES; i++) readOne(HX_READY_TIMEOUT_MS);

  const int maxMissed = n - (n * 6 + 9) / 10;
  int good = 0;
  int missed = 0;
  while (good + missed < n) {
    const long value = readOne(HX_READY_TIMEOUT_MS);
    if (value == LONG_MIN) {
      if (++missed > maxMissed) break;
    } else {
      out[good++] = value;
    }
  }
  if (good > 0 && wiring_ == maple::Wiring::Missing) wiring_ = maple::Wiring::Normal;
  return good;
}

const char *Hx711::wiringText() const {
  switch (wiring_) {
    case maple::Wiring::Normal:
      return "normal";
    case maple::Wiring::Swapped:
      return "DT/SCK swapped";
    case maple::Wiring::Missing:
      break;
  }
  return "no HX711";
}
