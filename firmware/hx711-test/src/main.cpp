#include <Arduino.h>
#include <U8g2lib.h>

// Heltec WiFi LoRa 32 V3: HX711 on GPIO 6/7, OLED on the board's own pins.
static const int PIN_DT = 6;
static const int PIN_SCK = 7;
static const uint8_t PIN_OLED_SDA = 17;
static const uint8_t PIN_OLED_SCL = 18;
static const uint8_t PIN_OLED_RST = 21;
static const uint8_t PIN_VEXT = 36;

static const uint32_t READY_TIMEOUT_MS = 800;

U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, PIN_OLED_SCL, PIN_OLED_SDA, PIN_OLED_RST);

long readRaw() {
  const uint32_t start = millis();
  while (digitalRead(PIN_DT) == HIGH) {
    if (millis() - start > READY_TIMEOUT_MS) {
      return LONG_MIN;
    }
  }

  noInterrupts();
  uint32_t value = 0;
  for (uint8_t bit = 0; bit < 24; bit++) {
    digitalWrite(PIN_SCK, HIGH);
    delayMicroseconds(1);
    value = (value << 1) | (digitalRead(PIN_DT) == HIGH ? 1U : 0U);
    digitalWrite(PIN_SCK, LOW);
    delayMicroseconds(1);
  }
  digitalWrite(PIN_SCK, HIGH);
  delayMicroseconds(1);
  digitalWrite(PIN_SCK, LOW);
  interrupts();

  if (value & 0x800000UL) {
    value |= 0xFF000000UL;
  }
  return static_cast<long>(value);
}

void powerOled() {
  pinMode(PIN_VEXT, OUTPUT);
  digitalWrite(PIN_VEXT, LOW);
  delay(50);
  pinMode(PIN_OLED_RST, OUTPUT);
  digitalWrite(PIN_OLED_RST, LOW);
  delay(20);
  digitalWrite(PIN_OLED_RST, HIGH);
  delay(20);
}

void drawCentered(const char *text, int y) {
  const int width = u8g2.getStrWidth(text);
  const int x = width >= 128 ? 0 : (128 - width) / 2;
  u8g2.drawStr(x, y, text);
}

void showReading(long delta, bool sensorOk) {
  char number[16];
  snprintf(number, sizeof(number), "%ld", delta);

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  drawCentered("WEIGHT", 12);
  u8g2.setFont(u8g2_font_logisoso24_tn);
  drawCentered(number, 46);
  u8g2.setFont(u8g2_font_6x12_tf);
  drawCentered(sensorOk ? "counts from zero" : "no sensor on 6/7", 62);
  u8g2.sendBuffer();
}

void setup() {
  pinMode(PIN_SCK, OUTPUT);
  digitalWrite(PIN_SCK, LOW);
  pinMode(PIN_DT, INPUT);
  Serial.begin(115200);
  powerOled();
  u8g2.begin();
  showReading(0, false);
  Serial.println("HX711 on OLED  DT=GPIO6  SCK=GPIO7");
}

void loop() {
  static bool haveZero = false;
  static long zero = 0;

  const long raw = readRaw();
  if (raw == LONG_MIN) {
    showReading(0, false);
    Serial.println("no data");
    delay(300);
    return;
  }

  if (!haveZero) {
    zero = raw;
    haveZero = true;
  }

  delayMicroseconds(2);
  const bool sensorOk = digitalRead(PIN_DT) == HIGH;
  const long delta = raw - zero;
  showReading(delta, sensorOk);
  Serial.printf("%ld,%ld,%s\n", raw, delta, sensorOk ? "ok" : "no-sensor");
  delay(200);
}
