// Maple sap node: weighs a sap bucket on an HX711 load cell and reports it
// over LoRa to the gateway Heltec. Two modes:
//   service  OLED on, weighing live, serial console answering. Runs for
//            SERVICE_WINDOW_MS after boot, a PRG press, or a serial command.
//   field    light sleep between reports; the HX711, radio and OLED are off.
// See docs/hardware.md for the payloads and serial commands.

#include <Arduino.h>
#include <Preferences.h>
#include <esp_sleep.h>
#include <limits.h>

#include "battery.h"
#include "battery_logic.h"
#include "config.h"
#include "console.h"
#include "display.h"
#include "hx711.h"
#include "identity.h"
#include "power.h"
#include "protocol.h"
#include "radio_link.h"
#include "scale.h"

namespace {

enum class Mode { Service, Field };

// Live readings shown on the OLED: about 0.8 s at 10 SPS.
const int LIVE_SAMPLES = 8;
const uint32_t LIVE_SILENCE_MS = 2000;

Hx711 hx;
char nodeCode[24] = "UNPROVISIONED";
bool identified = false;
uint32_t intervalMs = TX_INTERVAL_MS;

Mode mode = Mode::Service;
uint32_t serviceUntil = 0;
uint32_t nextTxAt = 0;
uint32_t lastRadioTry = 0;
uint32_t txCount = 0;

// Tare and calibration from the app (business/calibration.js in the API). The
// id and result are kept in flash, so a command resent after a reboot is
// answered again instead of being applied twice.
uint32_t lastCommandId = 0;
bool lastCommandOk = false;
uint8_t ackPacketsLeft = 0;

BatteryReading battery = {0, -1};
Measurement lastMeasurement = {};
bool haveMeasurement = false;

long liveSamples[LIVE_SAMPLES];
int liveCount = 0;
uint32_t lastLiveSampleAt = 0;
uint32_t lastDisplayAt = 0;

bool prgDown = false;
bool prgFired = false;
uint32_t prgSince = 0;
// A result (tared, calibrated) stays on the OLED this long before the live view.
const uint32_t RESULT_HOLD_MS = 4000;
bool resultShown = false;
uint32_t resultAt = 0;

bool due(uint32_t at) {
  return static_cast<int32_t>(millis() - at) >= 0;
}

uint32_t secondsUntil(uint32_t at) {
  const int32_t left = static_cast<int32_t>(at - millis());
  return left > 0 ? (static_cast<uint32_t>(left) + 999) / 1000 : 0;
}

uint32_t jitter() {
  return static_cast<uint32_t>(random(TX_JITTER_MS));
}

void showResult(const char *title, const char *line1, const char *line2) {
  displayMessage(title, line1, line2);
  resultShown = true;
  resultAt = millis();
}

bool resultOnScreen() {
  if (resultShown && millis() - resultAt >= RESULT_HOLD_MS) resultShown = false;
  return resultShown;
}

void blink(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(80);
    digitalWrite(PIN_LED, LOW);
    delay(80);
  }
}

void loadSettings() {
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, true);
  const uint32_t seconds = prefs.getUInt("interval_s", 0);
  lastCommandId = prefs.getUInt("cmd_id", 0);
  lastCommandOk = prefs.getBool("cmd_ok", false);
  prefs.end();
  intervalMs = (seconds >= maple::MIN_INTERVAL_S && seconds <= maple::MAX_INTERVAL_S) ? seconds * 1000UL
                                                                                       : TX_INTERVAL_MS;
}

bool applyInterval(uint32_t seconds) {
  if (seconds < maple::MIN_INTERVAL_S || seconds > maple::MAX_INTERVAL_S) return false;
  intervalMs = seconds * 1000UL;
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putUInt("interval_s", seconds);
  prefs.end();
  nextTxAt = millis() + intervalMs + jitter();
  logf("[node] interval %lus", static_cast<unsigned long>(seconds));
  return true;
}

void rememberCommand(uint32_t id, bool ok) {
  lastCommandId = id;
  lastCommandOk = ok;
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putUInt("cmd_id", id);
  prefs.putBool("cmd_ok", ok);
  prefs.end();
}

// ---- modes ----

void enterService() {
  mode = Mode::Service;
  serviceUntil = millis() + SERVICE_WINDOW_MS;
  displayPower(true);
  hx.probe();
  liveCount = 0;
  lastLiveSampleAt = millis();
  lastDisplayAt = 0;
  logf("[mode] service for %lus (PRG or serial keeps it awake)",
       static_cast<unsigned long>(SERVICE_WINDOW_MS / 1000));
}

void extendService() {
  if (mode == Mode::Service) {
    serviceUntil = millis() + SERVICE_WINDOW_MS;
  } else {
    enterService();
  }
}

void enterField() {
  mode = Mode::Field;
  displayPower(false);
  hx.powerDown();
  logf("[mode] field: sleeping between reports every %lus", static_cast<unsigned long>(intervalMs / 1000));
}

[[noreturn]] void protectPack(uint32_t seconds) {
  logf("[power] pack at %d mV: sleeping %lus to save it", battery.mv, static_cast<unsigned long>(seconds));
  if (displayOn()) {
    char detail[24];
    snprintf(detail, sizeof(detail), "%.2f V", battery.mv / 1000.0f);
    displayMessage("Battery low", detail, "Sleeping to recover");
    delay(2000);
  }
  hx.powerDown();
  radioShutdown();
  displayShutdown();
  deepSleepFor(seconds);
}

maple::PowerState updatePowerState() {
  maple::PowerState &state = rememberedPowerState();
  state = maple::powerStateFromMv(battery.percent < 0 ? -1 : battery.mv, state);
  return state;
}

// ---- measuring ----

Measurement measureNow() {
  watchdogFeed();
  const Measurement m = scaleMeasure(hx, MEASURE_ATTEMPTS);
  watchdogFeed();
  lastMeasurement = m;
  haveMeasurement = true;
  liveCount = 0;  // the burst power-cycled the chip
  lastLiveSampleAt = millis();
  if (mode == Mode::Field) hx.powerDown();
  return m;
}

bool tareNow() {
  displayMessage("Taring...", "Keep the platform", "empty and still");
  const Measurement m = measureNow();
  if (m.stats.verdict != maple::SampleVerdict::Ok) {
    const char *title;
    const char *hint;
    scaleExplain(m, &title, &hint);
    logf("[scale] tare failed: %s", title ? title : "not clean");
    return false;
  }
  scaleTare(m.stats.raw);
  lastMeasurement.fault = maple::Fault::None;
  lastMeasurement.pounds = 0;
  blink(2);
  return true;
}

bool calibrateNow(float pounds) {
  char detail[24];
  snprintf(detail, sizeof(detail), "Test weight %.2f lb", pounds);
  displayMessage("Calibrating...", detail, "Keep it still");
  const Measurement m = measureNow();
  if (m.stats.verdict != maple::SampleVerdict::Ok) return false;
  if (!scaleCalibrate(pounds, m.stats.raw)) {
    logf("[scale] calibration failed: tare first, then put the weight on");
    return false;
  }
  blink(2);
  return true;
}

// ---- radio ----

void runAppCommand(const maple::Downlink &down) {
  if (down.commandId == lastCommandId) {
    // Already applied; the ack was lost, so say so again.
    ackPacketsLeft = ACK_PACKETS;
    nextTxAt = millis() + ACK_DELAY_MS;
    return;
  }
  // Someone is at the tree emptying the platform or setting the test weight,
  // so wake the screen for them.
  extendService();
  bool ok = false;
  char detail[24];
  if (down.action == maple::Action::Tare) {
    logf("[app] tare #%lu", static_cast<unsigned long>(down.commandId));
    ok = tareNow();
    snprintf(detail, sizeof(detail), "%s", nodeCode);
    showResult(ok ? "Tared from app" : "Tare failed", detail, ok ? "Platform is 0.00 lb" : "Empty it and retry");
  } else {
    logf("[app] calibrate #%lu with %.3f lb", static_cast<unsigned long>(down.commandId), down.pounds);
    ok = calibrateNow(down.pounds);
    snprintf(detail, sizeof(detail), "%.0f counts/lb", scaleCountsPerLb());
    showResult(ok ? "Calibrated" : "Calibrate failed", ok ? detail : "No weight on cell?", nodeCode);
  }
  rememberCommand(down.commandId, ok);
  ackPacketsLeft = ACK_PACKETS;
  nextTxAt = millis() + ACK_DELAY_MS;
  logf("[app] #%lu %s", static_cast<unsigned long>(down.commandId), ok ? "done" : "failed");
}

void listenForDownlink() {
  const uint32_t until = millis() + DOWNLINK_LISTEN_MS;
  char packet[192];
  for (;;) {
    const int32_t left = static_cast<int32_t>(until - millis());
    if (left <= 0) return;
    const int len = radioListen(packet, sizeof(packet), static_cast<uint32_t>(left));
    if (len < 0) return;
    if (len == 0) continue;
    maple::Downlink down;
    if (!maple::parseDownlink(packet, nodeCode, &down)) continue;  // another tree's packet
    logf("[rx] %s", packet);
    if (down.hasInterval && down.intervalS * 1000UL != intervalMs) applyInterval(down.intervalS);
    if (down.action != maple::Action::None) runAppCommand(down);
    return;
  }
}

void report() {
  // The period runs from the start of one report to the next, so the time
  // spent measuring does not stretch the interval the API expects.
  const uint32_t started = millis();
  battery = batteryRead();
  const maple::PowerState power = updatePowerState();
  if (power == maple::PowerState::Cutoff) protectPack(CUTOFF_SLEEP_S);

  Measurement m = measureNow();
  if (!scaleTared() && m.stats.verdict == maple::SampleVerdict::Ok) {
    // First clean reading after install or a cell swap becomes the zero
    // (the platform goes out empty).
    scaleTare(m.stats.raw);
    m.fault = maple::Fault::None;
    m.pounds = 0;
    lastMeasurement = m;
  }

  maple::Uplink up = {};
  up.nodeCode = nodeCode;
  up.fault = maple::faultCode(m.fault);
  up.weightLb = m.pounds;
  up.batteryPercent = battery.percent;
  up.intervalS = intervalMs / 1000UL;
  up.echo = ackPacketsLeft > 0;
  up.commandId = lastCommandId;
  up.commandOk = lastCommandOk;
  up.countsPerLb = scaleCountsPerLb();
  char json[200];
  buildUplink(up, json, sizeof(json));

  nextTxAt = started + intervalMs + jitter();
  if (!radioReady()) {
    logf("[tx] skipped, radio not ready: %s", json);
  } else {
    if (mode == Mode::Service) digitalWrite(PIN_LED, HIGH);
    const int16_t state = radioSend(json);
    digitalWrite(PIN_LED, LOW);
    txCount++;
    if (state == RADIO_OK) {
      logf("[tx] %s", json);
      if (ackPacketsLeft > 0) ackPacketsLeft--;
      listenForDownlink();
    } else {
      logf("[tx] failed %d (%s): %s", state, radioErrorText(state), json);
    }
    radioSleep();
  }

  // Never report more often than the site asked for, even to save the pack.
  if (power == maple::PowerState::Critical) protectPack(max(CRITICAL_SLEEP_S, static_cast<uint32_t>(intervalMs / 1000UL)));
}

// ---- console ----

void printStatus() {
  char batteryText[24];
  if (battery.percent < 0) {
    snprintf(batteryText, sizeof(batteryText), "%dmV no pack", battery.mv);
  } else {
    snprintf(batteryText, sizeof(batteryText), "%dmV %d%%", battery.mv, battery.percent);
  }
  const Measurement &m = lastMeasurement;
  const char *fault = haveMeasurement ? maple::faultCode(m.fault) : "not measured";
  logf("[status] fw=%s code=%s mode=%s wiring=%s raw=%ld zero=%ld cpl=%.0f lb=%.2f fault=%s battery=%s "
       "bat_k=%.4f interval=%lus next_tx=%lus tx=%lu radio=%s reset=%s",
       FW_VERSION, nodeCode, mode == Mode::Service ? "service" : "field", hx.wiringText(), m.stats.raw,
       scaleZero(), scaleCountsPerLb(), m.pounds, fault ? fault : "none", batteryText, batteryFactor(),
       static_cast<unsigned long>(intervalMs / 1000), static_cast<unsigned long>(secondsUntil(nextTxAt)),
       static_cast<unsigned long>(txCount), radioReady() ? "ok" : "down", resetReasonText());
}

void printHelp() {
  logf("Commands: STATUS | TARE | CAL <lb> | BATCAL <pack mV> | INTERVAL <s> | PROVISION {json} | FACTORY | "
       "REBOOT");
  logf("The console answers in service mode (2 min after boot or a PRG press).");
}

void handleCommand(const maple::Command &cmd) {
  extendService();
  switch (cmd.type) {
    case maple::CommandType::Help:
      printHelp();
      break;
    case maple::CommandType::Status:
      battery = batteryRead();
      printStatus();
      break;
    case maple::CommandType::Tare:
      logf("TARE queued");
      logf(tareNow() ? "TARE ok" : "TARE failed");
      break;
    case maple::CommandType::Cal:
      logf(cmd.number > maple::MIN_CAL_POUNDS && calibrateNow(cmd.number) ? "CAL ok" : "CAL failed");
      break;
    case maple::CommandType::BatCal: {
      float factor = 0;
      if (batteryCalibrate(static_cast<int>(cmd.number), &factor)) {
        battery = batteryRead();
        logf("BATCAL ok factor=%.4f pack=%dmV", factor, battery.mv);
      } else {
        logf("BATCAL failed (give the multimeter pack voltage in mV, 2500-4500)");
      }
      break;
    }
    case maple::CommandType::Interval:
      if (applyInterval(static_cast<uint32_t>(cmd.number))) {
        logf("INTERVAL ok %lus", static_cast<unsigned long>(intervalMs / 1000));
      } else {
        logf("INTERVAL failed (10-86400 s)");
      }
      break;
    case maple::CommandType::Provision: {
      char code[24];
      char rfTag[40] = "";
      maple::jsonString(cmd.rest, "Rf_Tag", rfTag, sizeof(rfTag));
      if (maple::jsonString(cmd.rest, "Node_Code", code, sizeof(code)) && identityProvision(code, rfTag)) {
        identityLoad(nodeCode, sizeof(nodeCode));
        identified = true;
        logf("PROVISIONED");
        displayMessage("Provisioned", nodeCode, rfTag[0] ? rfTag : "No RF tag yet");
        delay(1000);
      } else {
        logf("PROVISION failed");
      }
      break;
    }
    case maple::CommandType::Factory:
      identityClear();
      strcpy(nodeCode, "UNPROVISIONED");
      identified = false;
      scaleLoad();
      loadSettings();
      logf("CLEARED");
      displayMessage("Cleared", "Open Deploy to reuse", "Waiting for PROVISION");
      break;
    case maple::CommandType::Reboot:
      logf("REBOOT");
      consoleFlush();
      delay(50);
      ESP.restart();
      break;
    case maple::CommandType::Unknown:
      logf("? unknown command (HELP lists them)");
      break;
    case maple::CommandType::None:
      break;
  }
}

void handleConsole() {
  maple::Command cmd;
  while (consolePoll(&cmd)) handleCommand(cmd);
}

// ---- service mode ----

void showLive() {
  LiveView view = {};
  view.nodeCode = nodeCode;
  view.batteryPercent = battery.percent;
  view.batteryMv = battery.mv;
  view.nextTxS = secondsUntil(nextTxAt);
  view.serviceLeftS = secondsUntil(serviceUntil);

  if (prgDown && !prgFired) {
    const uint32_t held = millis() - prgSince;
    char detail[24];
    snprintf(detail, sizeof(detail), "Tare in %lus",
             static_cast<unsigned long>((TARE_HOLD_MS - min(held, TARE_HOLD_MS) + 999) / 1000));
    displayMessage("Hold to tare", detail, "Platform must be empty");
    return;
  }

  const bool silent = millis() - lastLiveSampleAt > LIVE_SILENCE_MS;
  if (liveCount < LIVE_SAMPLES && !silent) {
    view.title = "Weighing...";
    view.hint = "Hold PRG 3s to tare";
    displayLive(view);
    return;
  }
  const Measurement m = scaleEvaluate(liveSamples, silent ? 0 : liveCount, LIVE_SAMPLES, hx.wiring());
  scaleExplain(m, &view.title, &view.hint);
  view.hasWeight = view.title == nullptr;
  view.pounds = m.pounds;
  displayLive(view);
}

void serviceTick() {
  if (hx.ready()) {
    const long value = hx.readOne(0);
    if (value != LONG_MIN) {
      if (liveCount == LIVE_SAMPLES) {
        memmove(liveSamples, liveSamples + 1, sizeof(long) * (LIVE_SAMPLES - 1));
        liveCount--;
      }
      liveSamples[liveCount++] = value;
      lastLiveSampleAt = millis();
    }
  } else if (millis() - lastLiveSampleAt > LIVE_SILENCE_MS * 2) {
    // Nothing for a while: power-cycle it, in case it was just plugged in.
    hx.probe();
    liveCount = 0;
    lastLiveSampleAt = millis() - LIVE_SILENCE_MS - 1;
  }

  const bool holding = digitalRead(PIN_PRG) == LOW;
  if (holding && !prgDown) {
    prgDown = true;
    prgFired = false;
    prgSince = millis();
    extendService();
  } else if (!holding && prgDown) {
    prgDown = false;
  } else if (holding && !prgFired && millis() - prgSince >= TARE_HOLD_MS) {
    prgFired = true;
    if (tareNow()) {
      showResult("Tared 0.00 lb", nodeCode, "Release PRG");
    } else {
      const char *title;
      const char *hint;
      scaleExplain(lastMeasurement, &title, &hint);
      showResult("Tare failed", title ? title : "Reading not steady", hint);
    }
  }

  if (millis() - lastDisplayAt >= DISPLAY_REFRESH_MS && !resultOnScreen()) {
    lastDisplayAt = millis();
    showLive();
  }
}

}  // namespace

void setup() {
  powerBegin();
  consoleBegin();
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);
  pinMode(PIN_PRG, INPUT_PULLUP);
  hx.begin();
  batteryBegin();

  const esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  const bool fromDeepSleep = bootedFromDeepSleep();
  logf("%s", "");
  logf("Maple sap node fw %s  Heltec WiFi LoRa 32 V3  reset=%s", FW_VERSION, resetReasonText());

  // A flat pack that browned the board out, or one we put to sleep, does not
  // get to start the OLED and radio just to brown out again.
  battery = batteryRead();
  const maple::PowerState power = updatePowerState();
  if ((fromDeepSleep || bootedFromBrownout()) && power != maple::PowerState::Normal) {
    if (cause == ESP_SLEEP_WAKEUP_EXT0) displayBegin();  // PRG pressed: say why nothing happens
    protectPack(power == maple::PowerState::Cutoff ? CUTOFF_SLEEP_S : CRITICAL_SLEEP_S);
  }

  identified = identityLoad(nodeCode, sizeof(nodeCode));
  loadSettings();
  scaleLoad();
  logf("node %s, report every %lus, battery %d mV (%s)", identified ? nodeCode : "has no code",
       static_cast<unsigned long>(intervalMs / 1000), battery.mv, battery.percent < 0 ? "no pack" : "pack");

  // A timer wake from protective deep sleep goes straight back to reporting.
  const bool quietWake = fromDeepSleep && cause == ESP_SLEEP_WAKEUP_TIMER;
  displayBegin();
  if (quietWake) {
    displayPower(false);
  } else {
    blink(3);
    displayMessage(identified ? "Booting" : "No node code", identified ? nodeCode : "Flash again from",
                   identified ? "fw " FW_VERSION : "the Deploy page");
  }

  radioBegin();
  lastRadioTry = millis();

  if (quietWake) {
    enterField();
    nextTxAt = millis();
  } else {
    enterService();
    nextTxAt = millis() + FIRST_TX_DELAY_MS + TX_OFFSET_MS;
  }
}

void loop() {
  watchdogFeed();
  handleConsole();

  if (!radioReady() && millis() - lastRadioTry >= RADIO_RETRY_MS) {
    lastRadioTry = millis();
    radioBegin();
  }

  if (!identified) {
    // Stays awake so the Deploy page or a laptop can name it.
    if (millis() - lastDisplayAt >= 2000) {
      lastDisplayAt = millis();
      displayPower(true);
      displayMessage("No node code", "Flash again from", "the Deploy page");
    }
    delay(20);
    return;
  }

  if (mode == Mode::Service) {
    serviceTick();
    if (due(nextTxAt)) report();
    if (mode == Mode::Service && due(serviceUntil) && !prgDown) enterField();
    delay(5);
    return;
  }

  if (due(nextTxAt)) report();
  if (mode != Mode::Field) return;
  const int32_t wait = static_cast<int32_t>(nextTxAt - millis());
  if (wait > 0 && lightSleepFor(static_cast<uint32_t>(wait)) == Wake::Button) {
    logf("[mode] PRG pressed");
    enterService();
  }
}
