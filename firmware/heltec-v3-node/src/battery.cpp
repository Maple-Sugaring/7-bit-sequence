#include "battery.h"

#include <Arduino.h>
#include <Preferences.h>

#include "battery_logic.h"
#include "config.h"

namespace {

// Meshtastic's measured correction for this divider at 2.5 dB; BATCAL refines it.
const float DEFAULT_FACTOR = 1.045f;
const float MIN_FACTOR = 0.8f;
const float MAX_FACTOR = 1.25f;
const int ADC_SAMPLES = 16;

float factor = DEFAULT_FACTOR;

// Millivolts at GPIO1 (the divider output), trimmed mean of 16 reads.
int readDividerMv() {
  // GPIO37 is pulled up on V3.0/V3.1 (divider on when driven LOW) and pulled
  // down on V3.2 (on when driven HIGH). Read the idle level and drive the
  // opposite, as Meshtastic does, so one image fits every board revision.
  pinMode(PIN_BATTERY_CTRL, INPUT);
  delayMicroseconds(50);
  const int idle = digitalRead(PIN_BATTERY_CTRL);
  pinMode(PIN_BATTERY_CTRL, OUTPUT);
  digitalWrite(PIN_BATTERY_CTRL, idle == HIGH ? LOW : HIGH);
  delay(10);

  int samples[ADC_SAMPLES];
  for (int i = 0; i < ADC_SAMPLES; i++) {
    const int value = static_cast<int>(analogReadMilliVolts(PIN_BATTERY_ADC));
    int at = i;
    while (at > 0 && samples[at - 1] > value) {
      samples[at] = samples[at - 1];
      at--;
    }
    samples[at] = value;
  }
  // Back to the board's own pull: divider off, no current through 490k.
  pinMode(PIN_BATTERY_CTRL, INPUT);

  long total = 0;
  for (int i = 2; i < ADC_SAMPLES - 2; i++) total += samples[i];
  return static_cast<int>(total / (ADC_SAMPLES - 4));
}

}  // namespace

void batteryBegin() {
  // 2.5 dB covers the divider's 0.5-0.92 V with better accuracy than the
  // default 11 dB on a high-impedance source.
  analogSetPinAttenuation(PIN_BATTERY_ADC, ADC_2_5db);
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, true);
  const float stored = prefs.getFloat("bat_k", DEFAULT_FACTOR);
  prefs.end();
  factor = (stored >= MIN_FACTOR && stored <= MAX_FACTOR) ? stored : DEFAULT_FACTOR;
}

BatteryReading batteryRead() {
  BatteryReading reading;
  reading.mv = maple::dividerMvToBatteryMv(readDividerMv(), factor);
  reading.percent = maple::batteryPercentFromMv(reading.mv);
  return reading;
}

bool batteryCalibrate(int actualMv, float *factorOut) {
  const int dividerMv = readDividerMv();
  if (dividerMv <= 0 || actualMv < maple::PACK_MIN_MV || actualMv > maple::PACK_MAX_MV) return false;
  const float next = static_cast<float>(actualMv) / (static_cast<float>(dividerMv) * maple::VBAT_DIVIDER);
  if (next < MIN_FACTOR || next > MAX_FACTOR) return false;
  factor = next;
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putFloat("bat_k", factor);
  prefs.end();
  if (factorOut) *factorOut = factor;
  return true;
}

float batteryFactor() {
  return factor;
}
