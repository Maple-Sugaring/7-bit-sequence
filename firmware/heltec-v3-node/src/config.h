#pragma once

#include <stdint.h>

#define FW_VERSION "2.0.0"

#ifndef NODE_CODE
#define NODE_CODE "NODE-001"
#endif
// The field image ships with this placeholder. The web flasher writes the
// real code into flash at IDENTITY_FLASH_ADDR instead of patching the image.
#define PLACEHOLDER_NODE_CODE "MAPLENODE00000000"

#ifndef TX_OFFSET_MS
#define TX_OFFSET_MS 0
#endif

#ifndef TX_INTERVAL_MS
#define TX_INTERVAL_MS 20000
#endif

// Heltec WiFi LoRa 32 V3 pinout (SX1262 + SSD1306). Unchanged from 1.x.
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
static const uint8_t PIN_HX_DT = 6;
static const uint8_t PIN_HX_SCK = 7;
// VBAT from the SH1.25-2P lithium port (the D5 solar kit plugs in here)
// through 390k/100k. GPIO37 switches the divider on.
static const uint8_t PIN_BATTERY_ADC = 1;
static const uint8_t PIN_BATTERY_CTRL = 37;
// USB CDC is not wired to the Heltec USB-C jack. The CP2102 the laptop and
// the web flasher open is UART0.
static const uint8_t PIN_HOST_RX = 44;
static const uint8_t PIN_HOST_TX = 43;

// Must match firmware/heltec-v3-gateway (915.125 MHz).
static const float LORA_FREQ_MHZ = 915.125f;
static const float LORA_BW_KHZ = 125.0f;
static const uint8_t LORA_SF = 9;
static const uint8_t LORA_CR = 5;  // 4/5
static const uint8_t LORA_SYNC = 0x12;
static const int8_t LORA_POWER_DBM = 22;
static const uint16_t LORA_PREAMBLE = 8;
static const float LORA_TCXO_V = 1.8f;

// The HX711 reads channel A at gain 128, and the bridge is excited from the
// HX711 analog supply, so the supply voltage cancels. Full-scale counts are
// 2^23 - 1.
//   counts/kg = (mV/V / 1000 / (0.5/128)) * 8388607 / capacity_kg
//   counts/lb = counts/kg * 0.45359237
#if defined(LOAD_CELL_FOUR_HALF_BRIDGE)
// Four DIYmalls 50 kg half-bridge cells wired as one full bridge (200 kg).
// No datasheet. NODE-001 calibrated to 10246 counts/lb with a 7.875 lb
// weight, which works out to about 2.1 mV/V. Still run CAL on each node.
static const float CELL_CAPACITY_KG = 200.0f;
static const float CELL_MV_PER_V = 2.1f;
static const uint8_t CELL_CAL_REV = 3;
static const char *const CELL_SETUP = "4x half-bridge";
#else
// Guang Ce YZC-1B single-point cell: 50 kg, 2.0 mV/V.
static const float CELL_CAPACITY_KG = 50.0f;
static const float CELL_MV_PER_V = 2.0f;
static const uint8_t CELL_CAL_REV = 2;
static const char *const CELL_SETUP = "YZC-1B";
#endif
static const float HX711_GAIN = 128.0f;
static const float HX711_FULL_SCALE_COUNTS = 8388607.0f;
static const float KG_PER_LB = 0.45359237f;
// Half of each HX711 clock pulse. At 1 us the four-cell cable had not settled
// when DT was read, so bits 12 and 16 flipped and the weight jumped by about
// 6.8 lb. 10 us read steady to a few hundredths of a pound. The HX711 allows
// up to 50 us high.
static const uint32_t HX_CLOCK_HALF_US = 10;
// After power-up the HX711 needs 400 ms (10 SPS) to settle before the first
// conversion; the next ones arrive every 100 ms (12.5 ms on 80 SPS boards).
static const uint32_t HX_FIRST_READY_MS = 700;
static const uint32_t HX_READY_TIMEOUT_MS = 300;
static const int HX_DISCARD_SAMPLES = 2;
static const int BURST_SAMPLES = 12;
// A measurement that is not clean is retried, power-cycling the HX711, so one
// gust or a slow conversion is not reported as a fault.
static const int MEASURE_ATTEMPTS = 3;
// Calibration needs the test weight to move the bridge at least this much.
static const long CAL_MIN_DELTA_COUNTS = 1000;

// Service mode: OLED on and weighing live, serial console answering. Runs this
// long after boot, a PRG press, or a serial command, then the node goes back
// to sleeping between reports.
static const uint32_t SERVICE_WINDOW_MS = 120000;
static const uint32_t TARE_HOLD_MS = 3000;
static const uint32_t DISPLAY_REFRESH_MS = 500;
static const uint32_t FIRST_TX_DELAY_MS = 3000;

// The gateway answers after the Pi has heard back from the API over HTTPS, so
// the node keeps listening long enough for that round trip.
static const uint32_t DOWNLINK_LISTEN_MS = 4000;
// Up to this much random delay per packet keeps two nodes on the same
// interval from colliding every time.
static const uint32_t TX_JITTER_MS = 750;
// An applied command is echoed on this many packets, in case one is lost.
static const uint8_t ACK_PACKETS = 3;
// The ack goes out this soon after a command, not a full interval later.
static const uint32_t ACK_DELAY_MS = 1500;
static const uint32_t RADIO_RETRY_MS = 30000;

// Low-pack protection (see maple::powerStateFromMv): report and deep sleep
// when critical; sleep without transmitting below cutoff.
static const uint32_t CRITICAL_SLEEP_S = 1800;
static const uint32_t CUTOFF_SLEEP_S = 3600;

static const uint32_t WDT_TIMEOUT_S = 60;
// Light sleep is split into chunks so the watchdog is fed on long intervals.
static const uint32_t SLEEP_CHUNK_MS = 30000;
static const uint32_t CPU_MHZ = 80;

// Written by the web flasher: "MAPLEID1" then the node code, zero padded.
static const uint32_t IDENTITY_FLASH_ADDR = 0x670000;
static const char *const PREFS_NAMESPACE = "maple";
