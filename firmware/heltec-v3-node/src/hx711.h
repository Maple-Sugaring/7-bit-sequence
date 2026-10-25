#pragma once

#include <stdint.h>

#include "scale_logic.h"

// Bit-banged HX711 on GPIO 6 (DT) and 7 (SCK), channel A, gain 128.
class Hx711 {
 public:
  void begin();
  // Powers the chip down and up again and reports which pin answered:
  // DOUT drives high while the first conversion runs, PD_SCK is an input.
  // Leaves the HX711 powered, with DT/SCK assigned to match the wiring.
  maple::Wiring probe();
  void powerDown();
  bool powered() const { return powered_; }
  // One conversion, or LONG_MIN when DT does not go low in time.
  long readOne(uint32_t timeoutMs);
  // True when a conversion is waiting (DT low), so a live loop never blocks.
  bool ready() const;
  // Up to `n` conversions after a fresh probe, dropping the settling ones.
  // Stops early when the chip does not answer at all. Returns how many arrived.
  int burst(long *out, int n);
  maple::Wiring wiring() const { return wiring_; }
  const char *wiringText() const;

 private:
  void assignPins(maple::Wiring wiring);
  uint8_t dt_ = 6;
  uint8_t sck_ = 7;
  maple::Wiring wiring_ = maple::Wiring::Missing;
  bool powered_ = false;
};
