#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <U8g2lib.h>

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

// Must match firmware/heltec-v3-gateway (915.125 MHz).
static const float LORA_FREQ_MHZ = 915.125;
static const float LORA_BW_KHZ = 125.0;
static const uint8_t LORA_SF = 9;
static const uint8_t LORA_CR = 5;  // 4/5
static const uint8_t LORA_SYNC = 0x12;
static const int8_t LORA_POWER_DBM = 22;
static const uint16_t LORA_PREAMBLE = 8;

static const uint32_t TX_INTERVAL_MS = 20000;

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, PIN_OLED_SCL, PIN_OLED_SDA, PIN_OLED_RST);

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
  USBSerial.printf("[status] %s | %s | %s\n", lineAction, lineDetail, lineExtra);
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
  announce("Booting radio...", "SPI SX1262 @ 915.1", NODE_CODE);
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
  snprintf(extra, sizeof(extra), "SF%d BW125  %s", LORA_SF, NODE_CODE);
  announce("Radio ready 915.1", extra, "Dummy weight to gateway");
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

void sendDummyReading() {
  txCount++;
  // Each packet adds a quarter gallon, so the bucket fills, then empties
  // (a collection) and fills again. Gross pounds include a 2.5 lb bucket.
  static const float kSapLbPerGallon = 8.34f;
  static const float kEmptyBucketLb = 2.5f;
  static const float kStepGallons = 0.25f;
  static const int kStepsToFull = 40;  // 40 * 0.25 = 10 gallons
  const int step = (FILL_START_STEPS + static_cast<int>(txCount)) % (kStepsToFull + 1);
  const float gallons = kStepGallons * static_cast<float>(step);
  const float weight = kEmptyBucketLb + gallons * kSapLbPerGallon;
  const int battery = 80 + static_cast<int>(txCount % 16);

  char json[160];
  snprintf(
      json,
      sizeof(json),
      "{\"Node_Code\":\"%s\",\"Weight\":%.1f,\"Battery_Percent\":%d}",
      NODE_CODE,
      weight,
      battery);

  const size_t jsonLen = strlen(json);
  char action[28];
  char detail[28];
  snprintf(action, sizeof(action), "TX sap #%lu", static_cast<unsigned long>(txCount));
  snprintf(detail, sizeof(detail), "%s %.1fgal %.0flb", NODE_CODE, gallons, weight);
  announce(action, detail, "On air to gateway...");

  digitalWrite(PIN_LED, HIGH);
  const int16_t state = radio.transmit(reinterpret_cast<uint8_t *>(json), jsonLen);
  digitalWrite(PIN_LED, LOW);

  if (state == RADIOLIB_ERR_NONE) {
    snprintf(action, sizeof(action), "Sent OK %.1flb %d%%", weight, battery);
    snprintf(detail, sizeof(detail), "%u bytes  sap #%lu", static_cast<unsigned>(jsonLen),
             static_cast<unsigned long>(txCount));
    announce(action, detail, "Next TX in 20s");
    USBSerial.printf("[tx] %s\n", json);
    return;
  }

  snprintf(action, sizeof(action), "TX FAIL err %d", state);
  announce(action, radioLibMeaning(state), "Check antenna / radio");
}

void setup() {
  pinMode(PIN_LED, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(90);
    digitalWrite(PIN_LED, LOW);
    delay(90);
  }

  powerOled(true);
  u8g2.begin();
  u8g2.setContrast(180);
  announce("Booting...", NODE_CODE, "Starting USB + radio");

  USBSerial.begin(115200);
  USBSerial.setTxTimeoutMs(0);
  USBSerial.println();
  USBSerial.printf("Maple sap LoRa node  %s  Heltec WiFi LoRa 32 V3\n", NODE_CODE);

  radioReady = initRadio();
}

void loop() {
  if (!radioReady) {
    delay(4000);
    radioReady = initRadio();
    return;
  }

  if (!offsetDone) {
    char detail[28];
    snprintf(detail, sizeof(detail), "%s offset", NODE_CODE);
    announce("Holding TX", detail, "Next TX in 10s");
    waitWithCountdown(TX_OFFSET_MS);
    offsetDone = true;
  }

  sendDummyReading();
  waitWithCountdown(TX_INTERVAL_MS);
}
