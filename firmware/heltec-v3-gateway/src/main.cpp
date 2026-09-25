#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <U8g2lib.h>
#include <math.h>

// Heltec WiFi LoRa 32 V3 pinout (SX1262 + SSD1306).
// This board stays on the Pi USB port and prints one JSON line per packet.
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

// Must match firmware/heltec-v3-node (915.125 MHz).
static const float LORA_FREQ_MHZ = 915.125;
static const float LORA_BW_KHZ = 125.0;
static const uint8_t LORA_SF = 9;
static const uint8_t LORA_CR = 5;  // 4/5
static const uint8_t LORA_SYNC = 0x12;
static const int8_t LORA_POWER_DBM = 22;
static const uint16_t LORA_PREAMBLE = 8;
static const uint32_t RX_TIMEOUT_MS = 1000;

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, PIN_OLED_SCL, PIN_OLED_SDA, PIN_OLED_RST);

char lineAction[28] = "Booting...";
char lineDetail[28] = "";
char lineExtra[28] = "USB serial to the Pi";
uint32_t rxCount = 0;
bool radioReady = false;

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
    case RADIOLIB_ERR_RX_TIMEOUT:
      return "RX timed out";
    case RADIOLIB_ERR_CRC_MISMATCH:
      return "CRC mismatch";
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
  u8g2.drawStr(0, 10, "MAPLE SAP GATEWAY");
  u8g2.drawHLine(0, 12, 128);
  u8g2.drawStr(0, 26, lineAction);
  u8g2.drawStr(0, 40, lineDetail);
  u8g2.drawStr(0, 54, lineExtra);
  u8g2.sendBuffer();
}

// USB CDC takes the name Serial on this board. The Pi's CP2102 is on UART0
// (GPIO43 TX / GPIO44 RX), the same pins esptool uses.
static HardwareSerial PiUart(0);

void logLine(const char *text) {
  USBSerial.println(text);
  PiUart.println(text);
  PiUart.flush();
}

void announce(const char *action, const char *detail, const char *extra) {
  strncpy(lineAction, action, sizeof(lineAction) - 1);
  lineAction[sizeof(lineAction) - 1] = '\0';
  strncpy(lineDetail, detail, sizeof(lineDetail) - 1);
  lineDetail[sizeof(lineDetail) - 1] = '\0';
  strncpy(lineExtra, extra, sizeof(lineExtra) - 1);
  lineExtra[sizeof(lineExtra) - 1] = '\0';
  char line[96];
  snprintf(line, sizeof(line), "[status] %s | %s | %s", lineAction, lineDetail, lineExtra);
  logLine(line);
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
  announce("Booting radio...", "SPI SX1262 @ 915.1", "Antenna must be fitted");
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
    logLine("[radio] TCXO 1.8V failed, retrying as XTAL (0V)");
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
  snprintf(extra, sizeof(extra), "SF%d BW125 listen", LORA_SF);
  announce("Radio ready 915.1", extra, "Waiting for nodes");
  return true;
}

bool extractString(const char *json, const char *key, char *out, size_t outLen) {
  char pattern[40];
  snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
  const char *start = strstr(json, pattern);
  if (start == nullptr) {
    return false;
  }
  start += strlen(pattern);
  const char *end = strchr(start, '"');
  if (end == nullptr) {
    return false;
  }
  const size_t length = static_cast<size_t>(end - start);
  if (length == 0 || length >= outLen) {
    return false;
  }
  memcpy(out, start, length);
  out[length] = '\0';
  return true;
}

bool extractNumber(const char *json, const char *key, float *out) {
  char pattern[40];
  snprintf(pattern, sizeof(pattern), "\"%s\":", key);
  const char *start = strstr(json, pattern);
  if (start == nullptr) {
    return false;
  }
  start += strlen(pattern);
  while (*start == ' ') {
    start++;
  }
  char *end = nullptr;
  const float value = strtof(start, &end);
  if (end == start) {
    return false;
  }
  *out = value;
  return true;
}

void publishReading(const char *payload, int rssi) {
  char nodeCode[16];
  float weight = 0.0f;
  float battery = 0.0f;
  if (!extractString(payload, "Node_Code", nodeCode, sizeof(nodeCode)) ||
      !extractNumber(payload, "Weight", &weight) ||
      !extractNumber(payload, "Battery_Percent", &battery)) {
    char bad[160];
    snprintf(bad, sizeof(bad), "[rx] bad payload: %s", payload);
    logLine(bad);
    announce("RX parse FAIL", "need node/wt/batt", "Pi ignores this line");
    return;
  }

  const int batteryPercent = static_cast<int>(lroundf(battery));
  char line[180];
  snprintf(
      line,
      sizeof(line),
      "{\"Node_Code\":\"%s\",\"Weight\":%.1f,\"Battery_Percent\":%d,\"Signal_Rssi\":%d}",
      nodeCode,
      weight,
      batteryPercent,
      rssi);

  logLine(line);
  USBSerial.flush();

  rxCount++;
  char action[28];
  char detail[28];
  char extra[28];
  snprintf(action, sizeof(action), "RX #%lu", static_cast<unsigned long>(rxCount));
  snprintf(detail, sizeof(detail), "%s %.1flb %d%%", nodeCode, weight, batteryPercent);
  snprintf(extra, sizeof(extra), "RSSI %d dBm", rssi);
  announce(action, detail, extra);
}

void handlePacket(const char *payload) {
  const int rssi = static_cast<int>(lroundf(radio.getRSSI()));
  digitalWrite(PIN_LED, HIGH);
  publishReading(payload, rssi);
  digitalWrite(PIN_LED, LOW);
}

void setup() {
  PiUart.begin(115200, SERIAL_8N1, 44, 43);
  USBSerial.begin(115200);
  USBSerial.setTxTimeoutMs(100);

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
  announce("Booting...", "OLED is up", "Starting USB + radio");

  logLine("");
  logLine("Maple sap LoRa gateway  Heltec WiFi LoRa 32 V3");

  radioReady = initRadio();
}

void loop() {
  if (!radioReady) {
    delay(4000);
    radioReady = initRadio();
    return;
  }

  String payload;
  const int16_t state = radio.receive(payload, 0, RX_TIMEOUT_MS);
  if (state == RADIOLIB_ERR_RX_TIMEOUT) {
    if (strcmp(lineExtra, "Waiting for nodes") != 0 && rxCount == 0) {
      announce("Listening 915.1", "SF9 BW125", "Waiting for nodes");
    }
    return;
  }
  if (state == RADIOLIB_ERR_CRC_MISMATCH) {
    announce("RX CRC FAIL", "packet dropped", radioLibMeaning(state));
    return;
  }
  if (state != RADIOLIB_ERR_NONE) {
    char detail[28];
    snprintf(detail, sizeof(detail), "err %d", state);
    announce("RX FAIL", detail, radioLibMeaning(state));
    return;
  }

  handlePacket(payload.c_str());
}
