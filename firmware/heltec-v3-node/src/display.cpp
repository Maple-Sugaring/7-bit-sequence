#include "display.h"

#include <Arduino.h>
#include <U8g2lib.h>
#include <driver/gpio.h>

#include "config.h"

namespace {

U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, PIN_OLED_SCL, PIN_OLED_SDA, PIN_OLED_RST);
bool panelOn = false;
bool begun = false;

void drawHeader(const char *left, int batteryPercent) {
  u8g2.setFont(u8g2_font_6x10_tf);
  // 6 px per character: a 16-character code would run into the battery.
  char code[13];
  snprintf(code, sizeof(code), "%s", left ? left : "");
  u8g2.drawStr(0, 9, code);
  char right[12];
  if (batteryPercent < 0) {
    snprintf(right, sizeof(right), "USB");
  } else {
    snprintf(right, sizeof(right), "%d%%", batteryPercent);
  }
  // Battery outline with a fill bar, right aligned.
  const int textWidth = u8g2.getStrWidth(right);
  const int iconX = 128 - textWidth - 18;
  u8g2.drawStr(128 - textWidth, 9, right);
  u8g2.drawFrame(iconX, 1, 13, 8);
  u8g2.drawBox(iconX + 13, 3, 2, 4);
  if (batteryPercent > 0) u8g2.drawBox(iconX + 2, 3, (9 * batteryPercent + 50) / 100, 4);
  u8g2.drawHLine(0, 12, 128);
}

}  // namespace

void displayBegin() {
  gpio_hold_dis(static_cast<gpio_num_t>(PIN_VEXT));
  pinMode(PIN_VEXT, OUTPUT);
  digitalWrite(PIN_VEXT, LOW);  // Vext on (active low)
  delay(50);
  pinMode(PIN_OLED_RST, OUTPUT);
  digitalWrite(PIN_OLED_RST, LOW);
  delay(20);
  digitalWrite(PIN_OLED_RST, HIGH);
  delay(20);
  u8g2.begin();
  u8g2.setContrast(180);
  panelOn = true;
  begun = true;
}

void displayPower(bool on) {
  if (!begun || on == panelOn) return;
  u8g2.setPowerSave(on ? 0 : 1);
  panelOn = on;
}

bool displayOn() {
  return panelOn;
}

void displayLive(const LiveView &view) {
  if (!panelOn) return;
  u8g2.clearBuffer();
  drawHeader(view.nodeCode, view.batteryPercent);

  if (view.title) {
    u8g2.setFont(u8g2_font_7x13B_tf);
    u8g2.drawStr(0, 32, view.title);
  } else if (view.hasWeight) {
    char weight[16];
    snprintf(weight, sizeof(weight), "%.2f", view.pounds);
    u8g2.setFont(u8g2_font_helvB18_tr);
    u8g2.drawStr(0, 36, weight);
    const int width = u8g2.getStrWidth(weight);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(width + 4, 36, "lb");
  } else {
    u8g2.setFont(u8g2_font_7x13B_tf);
    u8g2.drawStr(0, 32, "Weighing...");
  }

  u8g2.setFont(u8g2_font_6x10_tf);
  char status[28];
  if (view.batteryPercent >= 0) {
    snprintf(status, sizeof(status), "TX %lus  %.2fV", static_cast<unsigned long>(view.nextTxS),
             view.batteryMv / 1000.0f);
  } else {
    snprintf(status, sizeof(status), "Next TX in %lus", static_cast<unsigned long>(view.nextTxS));
  }
  u8g2.drawStr(0, 50, status);
  char footer[28];
  if (view.serviceLeftS <= 10) {
    snprintf(footer, sizeof(footer), "Sleep in %lus", static_cast<unsigned long>(view.serviceLeftS));
  } else {
    snprintf(footer, sizeof(footer), "%s", view.hint ? view.hint : "");
  }
  u8g2.drawStr(0, 62, footer);
  u8g2.sendBuffer();
}

void displayMessage(const char *title, const char *line1, const char *line2) {
  if (!panelOn) return;
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 9, "MAPLE SAP NODE " FW_VERSION);
  u8g2.drawHLine(0, 12, 128);
  u8g2.setFont(u8g2_font_7x13B_tf);
  u8g2.drawStr(0, 30, title ? title : "");
  u8g2.setFont(u8g2_font_6x10_tf);
  u8g2.drawStr(0, 46, line1 ? line1 : "");
  u8g2.drawStr(0, 60, line2 ? line2 : "");
  u8g2.sendBuffer();
}

void displayShutdown() {
  if (begun) u8g2.setPowerSave(1);
  panelOn = false;
  digitalWrite(PIN_VEXT, HIGH);
  gpio_hold_en(static_cast<gpio_num_t>(PIN_VEXT));
}
