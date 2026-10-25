#include "power.h"

#include <Arduino.h>
#include <driver/gpio.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "console.h"

namespace {

RTC_DATA_ATTR maple::PowerState savedPowerState = maple::PowerState::Normal;

const gpio_num_t HELD_PINS[] = {
    static_cast<gpio_num_t>(PIN_HX_DT),
    static_cast<gpio_num_t>(PIN_HX_SCK),
    static_cast<gpio_num_t>(PIN_LORA_NSS),
    static_cast<gpio_num_t>(PIN_VEXT),
};

}  // namespace

void powerBegin() {
  setCpuFrequencyMhz(CPU_MHZ);
  // Pins held through a deep sleep stay latched until released.
  gpio_deep_sleep_hold_dis();
  for (gpio_num_t pin : HELD_PINS) gpio_hold_dis(pin);
  // A stuck SPI transfer or HX711 loop restarts the board instead of hanging
  // a tree for the season. IDF 4.4 reconfigures the TWDT if it is already up.
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(nullptr);
}

void watchdogFeed() {
  esp_task_wdt_reset();
}

Wake lightSleepFor(uint32_t ms) {
  // A held (or stuck) PRG button would wake the board straight back up.
  const bool buttonWakes = digitalRead(PIN_PRG) == HIGH;
  if (buttonWakes) {
    gpio_wakeup_enable(static_cast<gpio_num_t>(PIN_PRG), GPIO_INTR_LOW_LEVEL);
    esp_sleep_enable_gpio_wakeup();
  }
  Wake wake = Wake::Timer;
  uint32_t left = ms;
  while (left > 0) {
    const uint32_t chunk = left < SLEEP_CHUNK_MS ? left : SLEEP_CHUNK_MS;
    watchdogFeed();
    consoleFlush();
    esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(chunk) * 1000ULL);
    esp_light_sleep_start();
    watchdogFeed();
    if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_GPIO) {
      wake = Wake::Button;
      break;
    }
    left -= chunk;
  }
  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);
  if (buttonWakes) {
    esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_GPIO);
    gpio_wakeup_disable(static_cast<gpio_num_t>(PIN_PRG));
  }
  return wake;
}

void deepSleepFor(uint32_t seconds) {
  logf("[power] deep sleep %lus", static_cast<unsigned long>(seconds));
  consoleFlush();
  // The HX711 lines are already pulled up (chip off); keep them that way,
  // and keep the radio's chip select and Vext where they were left.
  for (gpio_num_t pin : HELD_PINS) gpio_hold_en(pin);
  gpio_deep_sleep_hold_en();
  esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(seconds) * 1000000ULL);
  if (digitalRead(PIN_PRG) == HIGH) esp_sleep_enable_ext0_wakeup(static_cast<gpio_num_t>(PIN_PRG), 0);
  esp_deep_sleep_start();
}

bool bootedFromBrownout() {
  return esp_reset_reason() == ESP_RST_BROWNOUT;
}

bool bootedFromDeepSleep() {
  return esp_reset_reason() == ESP_RST_DEEPSLEEP;
}

const char *resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:
      return "power-on";
    case ESP_RST_EXT:
      return "reset pin";
    case ESP_RST_SW:
      return "software";
    case ESP_RST_PANIC:
      return "crash";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:
      return "watchdog";
    case ESP_RST_DEEPSLEEP:
      return "deep sleep";
    case ESP_RST_BROWNOUT:
      return "brownout";
    default:
      return "other";
  }
}

maple::PowerState &rememberedPowerState() {
  return savedPowerState;
}
