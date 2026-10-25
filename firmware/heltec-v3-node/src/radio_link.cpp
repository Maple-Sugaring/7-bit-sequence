#include "radio_link.h"

#include <Arduino.h>
#include <RadioLib.h>
#include <SPI.h>
#include <driver/gpio.h>

#include "config.h"
#include "console.h"

namespace {

SX1262 radio = new Module(PIN_LORA_NSS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
bool ready = false;
bool spiStarted = false;

int16_t beginWith(float tcxoVolts) {
  return radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNC, LORA_POWER_DBM, LORA_PREAMBLE,
                     tcxoVolts, false);
}

}  // namespace

bool radioBegin() {
  gpio_hold_dis(static_cast<gpio_num_t>(PIN_LORA_NSS));
  if (!spiStarted) {
    SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_NSS);
    spiStarted = true;
  }
  int16_t state = beginWith(LORA_TCXO_V);
  if (state == RADIOLIB_ERR_SPI_CMD_FAILED) {
    logf("[radio] TCXO %.1f V failed, retrying as XTAL", LORA_TCXO_V);
    state = beginWith(0.0f);
  }
  if (state != RADIOLIB_ERR_NONE) {
    logf("[radio] init failed: %d (%s)", state, radioErrorText(state));
    ready = false;
    return false;
  }
  radio.setDio2AsRfSwitch(true);
  radio.setCRC(2);
  ready = true;
  logf("[radio] ready %.3f MHz SF%u BW%.0f", LORA_FREQ_MHZ, LORA_SF, LORA_BW_KHZ);
  return true;
}

bool radioReady() {
  return ready;
}

int16_t radioSend(const char *json) {
  if (!ready) return RADIOLIB_ERR_CHIP_NOT_FOUND;
  const size_t len = strlen(json);
  int16_t state = RADIOLIB_ERR_UNKNOWN;
  for (int attempt = 0; attempt < 2; attempt++) {
    state = radio.transmit(reinterpret_cast<const uint8_t *>(json), len);
    if (state == RADIOLIB_ERR_NONE) return state;
    delay(200);
  }
  return state;
}

int radioListen(char *buf, size_t len, uint32_t ms) {
  if (!ready || len < 2) return -1;
  const int16_t state = radio.receive(reinterpret_cast<uint8_t *>(buf), len - 1, ms);
  if (state == RADIOLIB_ERR_RX_TIMEOUT) return -1;
  if (state != RADIOLIB_ERR_NONE) return 0;  // corrupted packet: keep listening
  size_t got = radio.getPacketLength();
  if (got > len - 1) got = len - 1;
  buf[got] = '\0';
  return static_cast<int>(got);
}

void radioSleep() {
  if (ready) radio.sleep(true);
}

void radioShutdown() {
  if (ready) radio.sleep(false);
  // A floating chip select can wake the SX1262 while the ESP32 is off.
  pinMode(PIN_LORA_NSS, OUTPUT);
  digitalWrite(PIN_LORA_NSS, HIGH);
  gpio_hold_en(static_cast<gpio_num_t>(PIN_LORA_NSS));
}

const char *radioErrorText(int16_t code) {
  switch (code) {
    case RADIOLIB_ERR_NONE:
      return "ok";
    case RADIOLIB_ERR_CHIP_NOT_FOUND:
      return "SX1262 not found";
    case RADIOLIB_ERR_PACKET_TOO_LONG:
      return "packet too long";
    case RADIOLIB_ERR_TX_TIMEOUT:
      return "TX timed out";
    case RADIOLIB_ERR_SPI_CMD_TIMEOUT:
      return "SPI timeout (BUSY)";
    case RADIOLIB_ERR_SPI_CMD_FAILED:
      return "SPI failed (TCXO)";
    case RADIOLIB_ERR_INVALID_FREQUENCY:
      return "bad frequency";
    case RADIOLIB_ERR_INVALID_OUTPUT_POWER:
      return "bad TX power";
    default:
      return "radio error";
  }
}
