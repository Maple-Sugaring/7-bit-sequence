#include <Arduino.h>
#include <Preferences.h>
#include <SPI.h>
#include <RadioLib.h>
#include <U8g2lib.h>
#include <esp_flash.h>
#include <math.h>
#include <string.h>

#ifndef NODE_CODE
#define NODE_CODE "NODE-001"
#endif

#ifndef TX_OFFSET_MS
#define TX_OFFSET_MS 0
#endif

#ifndef FILL_START_STEPS
#define FILL_START_STEPS 0
#endif

// Heltec WiFi LoRa 32 V3 pinout (SX1262 + SSD1306).
static const uint8_t PIN_LORA_NSS = 8;
static const uint8_t PIN_LORA_SCK = 9;
static const uint8_t PIN_LORA_MOSI = 10;
static const uint8_t PIN_LORA_MISO = 11;
static const uint8_t PIN_LORA_RST = 12;
static const uint8_t PIN_LORA_BUSY = 13;
static const uint8_t PIN_LORA_DIO1 = 14;
static const uint8_t PIN_OLED_SDA = 17;
static const uint8_t PIN_OLED_SCL = 18;
static const uint8_t PIN_OLED_RST = 21;
static const uint8_t PIN_LED = 35;
static const uint8_t PIN_VEXT = 36;
static const uint8_t PIN_PRG = 0;
static const int PIN_HX_DT = 6;
static const int PIN_HX_SCK = 7;
static const uint8_t PIN_BATTERY_ADC = 1;
static const uint8_t PIN_BATTERY_EN = 37;

// Guang Ce YZC-1B: 50 kg capacity, 2.0 mV/V. The HX711 reads channel A at
// gain 128, and the cell is excited from the HX711 analog supply, so the
// supply voltage cancels. Full-scale counts are 2^23 - 1.
//   counts/kg = (0.002 / (0.5/128)) * 8388607 / 50
//   counts/lb = counts/kg * 0.45359237
static const float CELL_CAPACITY_KG = 50.0f;
static const float CELL_MV_PER_V = 2.0f;
static const float HX711_GAIN = 128.0f;
static const float HX711_FULL_SCALE_COUNTS = 8388607.0f;
static const float KG_PER_LB = 0.45359237f;
static const uint8_t CELL_CAL_REV = 2;
static const uint32_t TARE_HOLD_MS = 3000;
static const uint32_t HX_READY_TIMEOUT_MS = 800;
// About 0.3 lb of disagreement inside one 1-second sample, or the same
// amount below the tare. Either one is electrical, not sap.
static const long UNSTABLE_SPREAD_COUNTS = 12000;
static const long REVERSED_DELTA_COUNTS = -12000;

float datasheetCountsPerLb() {
  const float fraction = (CELL_MV_PER_V / 1000.0f) / (0.5f / HX711_GAIN);
  const float countsPerKg = fraction * HX711_FULL_SCALE_COUNTS / CELL_CAPACITY_KG;
  return countsPerKg * KG_PER_LB;
}

// USB CDC is not wired to the Heltec USB-C jack. The CP2102 the laptop and
// the web flasher open is UART0 on GPIO43 TX / GPIO44 RX.
static HardwareSerial HostUart(0);

// Must match firmware/heltec-v3-gateway (915.125 MHz).
static const float LORA_FREQ_MHZ = 915.125;
static const float LORA_BW_KHZ = 125.0;
static const uint8_t LORA_SF = 9;
static const uint8_t LORA_CR = 5;  // 4/5
static const uint8_t LORA_SYNC = 0x12;
static const int8_t LORA_POWER_DBM = 22;
static const uint16_t LORA_PREAMBLE = 8;

#ifndef TX_INTERVAL_MS
#define TX_INTERVAL_MS 20000
#endif
uint32_t txIntervalMs = TX_INTERVAL_MS;

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, PIN_OLED_SCL, PIN_OLED_SDA, PIN_OLED_RST);

// The field image is built with NODE_CODE "MAPLENODE00000000". The website
// replaces that exact text with the real node code before flashing.
Preferences provisionStore;
char nodeCode[24] = NODE_CODE;
char rfTag[40] = "";
bool provisioned = false;
String serialLine;
bool tareRequested = false;
bool calRequested = false;
float calPounds = 0;

bool jsonString(const String &line, const char *key, char *out, size_t outLen) {
  const String needle = String("\"") + key + "\":\"";
  const int at = line.indexOf(needle);
  if (at < 0) return false;
  const int start = at + needle.length();
  const int end = line.indexOf('"', start);
  if (end < 0) return false;
  line.substring(start, end).toCharArray(out, outLen);
  return out[0] != '\0';
}

void rememberProvision() {
  provisionStore.begin("maple", false);
  provisionStore.putString("node_code", nodeCode);
  provisionStore.putString("rf_tag", rfTag);
  provisionStore.end();
  provisioned = true;
}

bool loadProvision() {
  provisionStore.begin("maple", true);
  const uint32_t seconds = provisionStore.getUInt("interval_s", 0);
  provisionStore.end();
  if (seconds >= 60 && seconds <= 86400) {
    txIntervalMs = seconds * 1000UL;
  }

  // Written by the website at flash time. Not part of the signed app image,
  // so the OLED still powers on.
  uint8_t identity[32] = {0};
  if (esp_flash_read(nullptr, identity, 0x670000, sizeof(identity)) == ESP_OK &&
      memcmp(identity, "MAPLEID1", 8) == 0 && identity[8] != 0 && identity[8] != 0xFF) {
    memcpy(nodeCode, identity + 8, 16);
    nodeCode[16] = '\0';
    provisioned = true;
    return true;
  }

  if (strcmp(NODE_CODE, "MAPLENODE00000000") != 0 && strcmp(NODE_CODE, "UNPROVISIONED") != 0) {
    strncpy(nodeCode, NODE_CODE, sizeof(nodeCode) - 1);
    nodeCode[sizeof(nodeCode) - 1] = '\0';
    provisioned = true;
    return true;
  }
  return false;
}

void clearProvision() {
  provisionStore.begin("maple", false);
  provisionStore.clear();
  provisionStore.end();
  strncpy(nodeCode, "UNPROVISIONED", sizeof(nodeCode) - 1);
  nodeCode[sizeof(nodeCode) - 1] = '\0';
  rfTag[0] = '\0';
  provisioned = false;
  USBSerial.println("CLEARED");
  HostUart.println("CLEARED");
}

void announce(const char *action, const char *detail, const char *extra);

void handleSerialLine(const String &line) {
  if (line.startsWith("FACTORY")) {
    clearProvision();
    announce("Cleared", "Open Deploy to reuse", "Waiting for PROVISION");
    return;
  }
  if (!line.startsWith("PROVISION ")) {
    if (line.equals("TARE")) {
      tareRequested = true;
      USBSerial.println("TARE queued");
      HostUart.println("TARE queued");
    } else if (line.startsWith("CAL ")) {
      calPounds = line.substring(4).toFloat();
      calRequested = calPounds > 0.05f;
      if (!calRequested) {
        USBSerial.println("CAL failed");
        HostUart.println("CAL failed");
      }
    }
    return;
  }

  char nextCode[24];
  if (!jsonString(line, "Node_Code", nextCode, sizeof(nextCode))) {
    USBSerial.println("PROVISION failed");
    return;
  }
  strncpy(nodeCode, nextCode, sizeof(nodeCode) - 1);
  nodeCode[sizeof(nodeCode) - 1] = '\0';
  char nextTag[40] = "";
  if (jsonString(line, "Rf_Tag", nextTag, sizeof(nextTag))) {
    strncpy(rfTag, nextTag, sizeof(rfTag) - 1);
    rfTag[sizeof(rfTag) - 1] = '\0';
  } else {
    rfTag[0] = '\0';
  }
  rememberProvision();
  USBSerial.println("PROVISIONED");
  HostUart.println("PROVISIONED");
  announce("Provisioned", nodeCode, rfTag[0] ? rfTag : "No RF tag yet");
}

void pollPort(Stream &port, String &line) {
  while (port.available()) {
    const char c = static_cast<char>(port.read());
    if (c == '\n') {
      line.trim();
      if (line.length()) handleSerialLine(line);
      line = "";
    } else if (c != '\r' && line.length() < 180) {
      line += c;
    }
  }
}

void pollSerial() {
  pollPort(USBSerial, serialLine);
  static String hostLine;
  pollPort(HostUart, hostLine);
}

char lineAction[28] = "Booting...";
char lineDetail[28] = "";
char lineExtra[28] = "Do not TX without antenna";
uint32_t txCount = 0;
bool radioReady = false;
bool offsetDone = (TX_OFFSET_MS == 0);

const char *radioLibMeaning(int16_t code) {
  switch (code) {
    case RADIOLIB_ERR_NONE:
      return "ok";
    case RADIOLIB_ERR_UNKNOWN:
      return "unknown radio error";
    case RADIOLIB_ERR_CHIP_NOT_FOUND:
      return "SX1262 not found (SPI/wiring)";
    case RADIOLIB_ERR_PACKET_TOO_LONG:
      return "packet too long";
    case RADIOLIB_ERR_TX_TIMEOUT:
      return "TX timed out";
    case RADIOLIB_ERR_SPI_CMD_TIMEOUT:
      return "SPI timeout (BUSY pin?)";
    case RADIOLIB_ERR_SPI_CMD_FAILED:
      return "SPI failed (TCXO vs XTAL)";
    case RADIOLIB_ERR_INVALID_FREQUENCY:
      return "bad frequency";
    case RADIOLIB_ERR_INVALID_BANDWIDTH:
      return "bad bandwidth";
    case RADIOLIB_ERR_INVALID_SPREADING_FACTOR:
      return "bad spreading factor";
    case RADIOLIB_ERR_INVALID_CODING_RATE:
      return "bad coding rate";
    case RADIOLIB_ERR_INVALID_OUTPUT_POWER:
      return "bad TX power";
    default:
      return "see serial for code";
  }
}

void drawScreen() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawStr(0, 10, "MAPLE SAP NODE");
  u8g2.drawHLine(0, 12, 128);
  u8g2.drawStr(0, 26, lineAction);
  u8g2.drawStr(0, 40, lineDetail);
  u8g2.drawStr(0, 54, lineExtra);
  u8g2.sendBuffer();
}

void announce(const char *action, const char *detail, const char *extra) {
  strncpy(lineAction, action, sizeof(lineAction) - 1);
  lineAction[sizeof(lineAction) - 1] = '\0';
  strncpy(lineDetail, detail, sizeof(lineDetail) - 1);
  lineDetail[sizeof(lineDetail) - 1] = '\0';
  strncpy(lineExtra, extra, sizeof(lineExtra) - 1);
  lineExtra[sizeof(lineExtra) - 1] = '\0';
  char statusLine[120];
  snprintf(statusLine, sizeof(statusLine), "[status] %s | %s | %s", lineAction, lineDetail, lineExtra);
  USBSerial.println(statusLine);
  HostUart.println(statusLine);
  drawScreen();
}

void powerOled(bool on) {
  pinMode(PIN_VEXT, OUTPUT);
  digitalWrite(PIN_VEXT, on ? LOW : HIGH);
  delay(50);
  pinMode(PIN_OLED_RST, OUTPUT);
  digitalWrite(PIN_OLED_RST, LOW);
  delay(20);
  digitalWrite(PIN_OLED_RST, HIGH);
  delay(20);
}

bool initRadio() {
  announce("Booting radio...", "SPI SX1262 @ 915.1", nodeCode);
  SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_NSS);

  int16_t state = radio.begin(
      LORA_FREQ_MHZ,
      LORA_BW_KHZ,
      LORA_SF,
      LORA_CR,
      LORA_SYNC,
      LORA_POWER_DBM,
      LORA_PREAMBLE,
      1.8,
      false);

  if (state == RADIOLIB_ERR_SPI_CMD_FAILED) {
    USBSerial.println("[radio] TCXO 1.8V failed, retrying as XTAL (0V)");
    announce("Radio retry", "TCXO failed, try XTAL", "err -707");
    state = radio.begin(
        LORA_FREQ_MHZ,
        LORA_BW_KHZ,
        LORA_SF,
        LORA_CR,
        LORA_SYNC,
        LORA_POWER_DBM,
        LORA_PREAMBLE,
        0.0,
        false);
  }

  if (state != RADIOLIB_ERR_NONE) {
    char detail[28];
    snprintf(detail, sizeof(detail), "err %d", state);
    announce("Radio init FAIL", detail, radioLibMeaning(state));
    return false;
  }

  radio.setDio2AsRfSwitch(true);
  radio.setCRC(true);

  char extra[28];
  snprintf(extra, sizeof(extra), "SF%d BW125  %s", LORA_SF, nodeCode);
  announce("Radio ready 915.1", extra, "Load cell to gateway");
  return true;
}

void waitWithCountdown(uint32_t durationMs) {
  const uint32_t started = millis();
  while (millis() - started < durationMs) {
    const uint32_t remaining = (durationMs - (millis() - started) + 999) / 1000;
    char extra[28];
    snprintf(extra, sizeof(extra), "Next TX in %lus", static_cast<unsigned long>(remaining));
    if (strcmp(lineExtra, extra) != 0) {
      strncpy(lineExtra, extra, sizeof(lineExtra) - 1);
      lineExtra[sizeof(lineExtra) - 1] = '\0';
      drawScreen();
    }
    delay(250);
  }
}

void applyIntervalSeconds(uint32_t seconds) {
  if (seconds < 60 || seconds > 86400) return;
  txIntervalMs = seconds * 1000UL;
  provisionStore.begin("maple", false);
  provisionStore.putUInt("interval_s", seconds);
  provisionStore.end();
  char extra[28];
  snprintf(extra, sizeof(extra), "Every %lus", static_cast<unsigned long>(seconds));
  announce("Interval updated", nodeCode, extra);
}

void hearInterval() {
  String payload;
  const int16_t state = radio.receive(payload, 0, 1500);
  if (state != RADIOLIB_ERR_NONE) return;
  if (payload.indexOf(nodeCode) < 0) return;
  const int key = payload.indexOf("\"Interval_Seconds\":");
  if (key < 0) return;
  applyIntervalSeconds(static_cast<uint32_t>(payload.substring(key + 19).toInt()));
}

long scaleZero = 0;
float countsPerLb = 0;
bool scaleTared = false;
bool scaleOk = false;
float lastPounds = 0;
long lastRaw = 0;
uint32_t lastTxMs = 0;
uint32_t lastDrawMs = 0;
uint32_t lastScaleLogMs = 0;
bool prgDown = false;
bool prgFired = false;
uint32_t prgSince = 0;

long readHx711() {
  const uint32_t start = millis();
  while (digitalRead(PIN_HX_DT) == HIGH) {
    if (millis() - start > HX_READY_TIMEOUT_MS) return LONG_MIN;
  }

  noInterrupts();
  uint32_t value = 0;
  for (uint8_t bit = 0; bit < 24; bit++) {
    digitalWrite(PIN_HX_SCK, HIGH);
    delayMicroseconds(1);
    value = (value << 1) | (digitalRead(PIN_HX_DT) == HIGH ? 1U : 0U);
    digitalWrite(PIN_HX_SCK, LOW);
    delayMicroseconds(1);
  }
  digitalWrite(PIN_HX_SCK, HIGH);
  delayMicroseconds(1);
  digitalWrite(PIN_HX_SCK, LOW);
  interrupts();

  if (value & 0x800000UL) value |= 0xFF000000UL;
  return static_cast<long>(value);
}

bool readAveraged(long *rawOut, long *spreadOut) {
  // 10 Hz samples. Drop the high and low so one noisy conversion cannot move the pounds.
  long samples[10];
  for (int i = 0; i < 10; i++) {
    const long raw = readHx711();
    if (raw == LONG_MIN) return false;
    samples[i] = raw;
  }
  for (int i = 0; i < 10; i++) {
    for (int j = i + 1; j < 10; j++) {
      if (samples[j] < samples[i]) {
        const long swap = samples[i];
        samples[i] = samples[j];
        samples[j] = swap;
      }
    }
  }
  long total = 0;
  for (int i = 1; i < 9; i++) total += samples[i];
  *rawOut = total / 8;
  if (spreadOut) *spreadOut = samples[9] - samples[0];
  return true;
}

void saveScale() {
  provisionStore.begin("maple", false);
  provisionStore.putLong("hx_zero", scaleZero);
  provisionStore.putFloat("hx_cpl", countsPerLb);
  provisionStore.putBool("hx_tared", scaleTared);
  provisionStore.putUChar("hx_rev", CELL_CAL_REV);
  provisionStore.end();
}

void loadScale() {
  provisionStore.begin("maple", false);
  scaleTared = provisionStore.getBool("hx_tared", false);
  scaleZero = provisionStore.getLong("hx_zero", 0);
  const uint8_t rev = provisionStore.getUChar("hx_rev", 0);
  countsPerLb = provisionStore.getFloat("hx_cpl", 0);
  if (rev != CELL_CAL_REV || !(countsPerLb > 100.0f)) {
    countsPerLb = datasheetCountsPerLb();
    provisionStore.putFloat("hx_cpl", countsPerLb);
    provisionStore.putUChar("hx_rev", CELL_CAL_REV);
  }
  provisionStore.end();
}

float poundsFromRaw(long raw) {
  if (!(countsPerLb > 100.0f)) return 0;
  return static_cast<float>(raw - scaleZero) / countsPerLb;
}

void applyTare(long raw) {
  scaleZero = raw;
  scaleTared = true;
  lastPounds = 0;
  saveScale();
  for (int i = 0; i < 2; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(90);
    digitalWrite(PIN_LED, LOW);
    delay(90);
  }
  announce("Tared 0.0 lb", nodeCode, "Hold PRG 3s to tare");
  char line[80];
  snprintf(line, sizeof(line), "[scale] tared zero=%ld counts/lb=%.0f", scaleZero, countsPerLb);
  USBSerial.println(line);
  HostUart.println(line);
}

int batteryPercent() {
  pinMode(PIN_BATTERY_EN, OUTPUT);
  digitalWrite(PIN_BATTERY_EN, LOW);
  delay(8);
  const uint32_t pinMv = analogReadMilliVolts(PIN_BATTERY_ADC);
  digitalWrite(PIN_BATTERY_EN, HIGH);
  const int batteryMv = static_cast<int>(pinMv * 4.9f);
  if (batteryMv < 2800 || batteryMv > 4600) return 100;
  int percent = (batteryMv - 3300) * 100 / 900;
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  return percent;
}

bool transmitJson(const char *json, int16_t *lastState) {
  const size_t jsonLen = strlen(json);
  for (int attempt = 0; attempt < 2; attempt++) {
    digitalWrite(PIN_LED, HIGH);
    const int16_t state = radio.transmit(reinterpret_cast<const uint8_t *>(json), jsonLen);
    digitalWrite(PIN_LED, LOW);
    if (lastState) *lastState = state;
    if (state == RADIOLIB_ERR_NONE) return true;
    delay(200);
  }
  return false;
}

void sendFault(const char *fault) {
  txCount++;
  const int battery = batteryPercent();
  char json[192];
  snprintf(
      json,
      sizeof(json),
      "{\"Node_Code\":\"%s\",\"Fault\":\"%s\",\"Battery_Percent\":%d,\"Interval_Seconds\":%lu}",
      nodeCode,
      fault,
      battery,
      static_cast<unsigned long>(txIntervalMs / 1000UL));

  announce("Fault", fault, nodeCode);
  int16_t state = RADIOLIB_ERR_UNKNOWN;
  if (transmitJson(json, &state)) {
    hearInterval();
    announce("Fault sent", fault, nodeCode);
    USBSerial.printf("[tx] %s\n", json);
    HostUart.printf("[tx] %s\n", json);
    return;
  }
  char action[28];
  snprintf(action, sizeof(action), "TX FAIL err %d", state);
  announce(action, radioLibMeaning(state), "Check antenna / radio");
}

void sendScaleReading() {
  txCount++;
  const float pounds = lastPounds < 0 ? 0.0f : lastPounds;
  const int battery = batteryPercent();

  char json[192];
  snprintf(
      json,
      sizeof(json),
      "{\"Node_Code\":\"%s\",\"Weight\":%.2f,\"Battery_Percent\":%d,\"Interval_Seconds\":%lu}",
      nodeCode,
      pounds,
      battery,
      static_cast<unsigned long>(txIntervalMs / 1000UL));

  char action[28];
  char detail[28];
  snprintf(action, sizeof(action), "TX %.2f lb", pounds);
  snprintf(detail, sizeof(detail), "%s  %d%%", nodeCode, battery);
  announce(action, detail, "On air to gateway...");

  int16_t state = RADIOLIB_ERR_UNKNOWN;
  if (transmitJson(json, &state)) {
    hearInterval();
    snprintf(action, sizeof(action), "Sent %.2f lb", pounds);
    snprintf(detail, sizeof(detail), "%s  sap #%lu", nodeCode, static_cast<unsigned long>(txCount));
    char extra[28];
    snprintf(extra, sizeof(extra), "Next TX in %lus", static_cast<unsigned long>(txIntervalMs / 1000UL));
    announce(action, detail, extra);
    USBSerial.printf("[tx] %s\n", json);
    HostUart.printf("[tx] %s\n", json);
    return;
  }

  snprintf(action, sizeof(action), "TX FAIL err %d", state);
  announce(action, radioLibMeaning(state), "Check antenna / radio");
}

void setup() {
  HostUart.begin(115200, SERIAL_8N1, 44, 43);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_PRG, INPUT_PULLUP);
  pinMode(PIN_HX_SCK, OUTPUT);
  digitalWrite(PIN_HX_SCK, LOW);
  pinMode(PIN_HX_DT, INPUT);

  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(90);
    digitalWrite(PIN_LED, LOW);
    delay(90);
  }

  powerOled(true);
  u8g2.begin();
  u8g2.setContrast(180);
  announce("Booting...", nodeCode, "Starting USB + radio");

  USBSerial.begin(115200);
  USBSerial.setTxTimeoutMs(0);
  USBSerial.println();
  HostUart.println();
  USBSerial.printf("Maple sap LoRa node  %s  Heltec WiFi LoRa 32 V3\n", nodeCode);
  HostUart.printf("Maple sap LoRa node  %s  Heltec WiFi LoRa 32 V3\n", nodeCode);

  loadScale();
  if (!loadProvision()) {
    announce("No node code", "Flash again from Deploy", "Identity is in the image");
  }

  radioReady = initRadio();
  lastTxMs = millis() - txIntervalMs;
}

void loop() {
  pollSerial();
  if (!provisioned) {
    delay(50);
    return;
  }

  if (!radioReady) {
    delay(4000);
    radioReady = initRadio();
    return;
  }

  if (!offsetDone) {
    char detail[28];
    snprintf(detail, sizeof(detail), "%s offset", nodeCode);
    announce("Holding TX", detail, "Next TX soon");
    const uint32_t started = millis();
    while (millis() - started < TX_OFFSET_MS) {
      pollSerial();
      delay(50);
    }
    offsetDone = true;
  }

  long raw = 0;
  long spread = 0;
  const bool rawOk = readAveraged(&raw, &spread);
  scaleOk = rawOk;
  const char *fault = nullptr;
  if (rawOk) {
    lastRaw = raw;
    if (!scaleTared || tareRequested) {
      tareRequested = false;
      applyTare(raw);
    } else if (calRequested) {
      const float delta = static_cast<float>(raw - scaleZero);
      if (fabsf(delta) > 1000.0f) {
        countsPerLb = fabsf(delta) / calPounds;
        provisionStore.begin("maple", false);
        provisionStore.putFloat("hx_cpl", countsPerLb);
        provisionStore.putUChar("hx_rev", CELL_CAL_REV);
        provisionStore.end();
        saveScale();
        char detail[28];
        snprintf(detail, sizeof(detail), "%.0f counts/lb", countsPerLb);
        announce("Calibrated", detail, nodeCode);
        USBSerial.println("CAL ok");
        HostUart.println("CAL ok");
      } else {
        USBSerial.println("CAL failed");
        HostUart.println("CAL failed");
      }
      calRequested = false;
    }
    lastPounds = poundsFromRaw(raw);
  }

  if (!rawOk) fault = "load-cell";
  else if (!scaleTared) fault = "untared";
  else if (spread > UNSTABLE_SPREAD_COUNTS) fault = "unstable";
  else if (raw - scaleZero < REVERSED_DELTA_COUNTS) fault = "reversed";

  const bool holding = digitalRead(PIN_PRG) == LOW;
  if (holding && !prgDown) {
    prgDown = true;
    prgSince = millis();
    prgFired = false;
  } else if (!holding) {
    prgDown = false;
    prgFired = false;
  } else if (!prgFired && rawOk && millis() - prgSince >= TARE_HOLD_MS) {
    prgFired = true;
    applyTare(raw);
    lastPounds = 0;
  }

  if (!holding || prgFired) {
    if (!scaleOk) {
      if (strcmp(lineAction, "No load cell") != 0) {
        announce("No load cell", nodeCode, "Check GPIO 6 and 7");
      }
    } else if (millis() - lastDrawMs > 400) {
      lastDrawMs = millis();
      const long delta = lastRaw - scaleZero;
      char action[28];
      char detail[28];
      snprintf(action, sizeof(action), "%.2f lb", lastPounds);
      snprintf(detail, sizeof(detail), "%ld counts", delta);
      strncpy(lineAction, action, sizeof(lineAction) - 1);
      lineAction[sizeof(lineAction) - 1] = '\0';
      strncpy(lineDetail, detail, sizeof(lineDetail) - 1);
      lineDetail[sizeof(lineDetail) - 1] = '\0';
      strncpy(lineExtra, "Hold PRG 3s to tare", sizeof(lineExtra) - 1);
      lineExtra[sizeof(lineExtra) - 1] = '\0';
      drawScreen();
      if (millis() - lastScaleLogMs > 2000) {
        lastScaleLogMs = millis();
        char line[96];
        snprintf(line, sizeof(line), "[scale] %s raw=%ld delta=%ld lb=%.2f", nodeCode, lastRaw, delta, lastPounds);
        HostUart.println(line);
      }
    }
  } else {
    const uint32_t left = (TARE_HOLD_MS - (millis() - prgSince) + 999) / 1000;
    char detail[28];
    snprintf(detail, sizeof(detail), "%lus more", static_cast<unsigned long>(left));
    strncpy(lineAction, "Taring...", sizeof(lineAction) - 1);
    strncpy(lineDetail, detail, sizeof(lineDetail) - 1);
    strncpy(lineExtra, "Release after blink", sizeof(lineExtra) - 1);
    lineAction[sizeof(lineAction) - 1] = '\0';
    lineDetail[sizeof(lineDetail) - 1] = '\0';
    lineExtra[sizeof(lineExtra) - 1] = '\0';
    drawScreen();
  }

  if (millis() - lastTxMs >= txIntervalMs) {
    if (fault) sendFault(fault);
    else if (scaleOk && scaleTared) sendScaleReading();
    lastTxMs = millis();
  }
  delay(40);
}
