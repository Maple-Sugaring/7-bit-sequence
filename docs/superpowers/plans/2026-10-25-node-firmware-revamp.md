# Node Firmware Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Heltec V3 sap-node firmware so that it reports only real weights, raises one clear fault per problem, reports solar-pack battery charge, and lasts on the D5 solar kit. Ship the new image through the web flasher.

**Architecture:** Pure logic (sample analysis, fault decision, battery curve, power policy, LoRa/serial text) moves into `lib/maple_core`, with no Arduino dependency, and is unit-tested on the host with PlatformIO `native` + Unity. Hardware drivers (HX711, battery ADC, radio, OLED, sleep/watchdog, console, identity) become small Arduino modules under `src/`. `main.cpp` is a two-mode state machine. **Service mode** (live OLED, continuous weighing, serial console) runs for 2 minutes after boot or a PRG press. **Field mode** light-sleeps between reports and powers the HX711 only while it measures.

**Tech Stack:** PlatformIO, espressif32 7.1.3 (Arduino-ESP32 2.0.17 / IDF 4.4), RadioLib 7.8.1, U8g2 2.36.18, Unity (native tests). Node.js `node:test` for the one API change.

**Spec:** Issue [#126](https://github.com/Maple-Sugaring/7-bit-sequence/issues/126). Hardware: [wiring-tree.png](../../../hardware/platforms/wiring-tree.png) (HX711 VCC→3V3, GND, DT→GPIO6, SCK→GPIO7). The D5 solar kit feeds the 18650 pack into the SH1.25-2P lithium battery port underneath the board.

## Global Constraints

- Pinout unchanged: LoRa NSS 8, SCK 9, MOSI 10, MISO 11, RST 12, BUSY 13, DIO1 14; OLED SDA 17, SCL 18, RST 21; LED 35; Vext 36; PRG 0; HX711 DT 6, SCK 7; VBAT ADC 1, ADC_Ctrl 37; host UART0 RX 44 / TX 43.
- Radio unchanged: 915.125 MHz, BW 125, SF9, CR 4/5, sync 0x12, 22 dBm, preamble 8, TCXO 1.8 V with an XTAL fallback, DIO2 as RF switch, CRC on.
- Uplink JSON keys and order unchanged: `Node_Code`, `Weight` (2 dp, floored at 0) **or** `Fault` (`load-cell` | `unstable` | `reversed` | `untared`), `Battery_Percent`, `Interval_Seconds`, then the echo `Command_Id`, `Command_Ok`, `Counts_Per_Lb` while an ack is due (3 packets). One change: `Battery_Percent` is **omitted** when no pack is measured.
- Downlink handling unchanged: `Interval_Seconds` 10–86400; `Command_Id` + `Action` `TARE` | `CAL` + `Pounds` (> 0.05); a repeated id re-acks, a pending id is ignored.
- Serial replies unchanged: `PROVISIONED`, `PROVISION failed`, `CLEARED`, `TARE queued`, `CAL ok`, `CAL failed`.
- NVS namespace `maple` and keys unchanged (`node_code`, `rf_tag`, `interval_s`, `cmd_id`, `cmd_ok`, `hx_zero`, `hx_cpl`, `hx_tared`, `hx_rev`), so stored calibration survives the upgrade. New key: `bat_k` (battery scale factor).
- Identity: the `MAPLEID1` + 16-byte code at flash `0x670000` wins, then the NVS `node_code` from `PROVISION`, then a compiled `NODE_CODE` that is not the placeholder `MAPLENODE00000000`.
- Cell constants unchanged: YZC-1B 50 kg 2.0 mV/V rev 2; four half-bridge 200 kg 2.1 mV/V rev 3.
- Firmware version `2.0.0`, printed at boot and by `STATUS`, and written to the flasher manifest.
- No Claude attribution in commits or the PR.

## Review Focus

1. **A floating DT pin that reads a mix of `0` and `-1`** (today's bug) must give `load-cell`, never a weight. Pinned in Task 1 (`test_floating_zero_and_minus_one_is_stuck`).
2. **No pack on the battery port (USB only)** must omit `Battery_Percent`, not send 100 or 0. Pinned in Task 2 (`test_out_of_range_is_no_pack`) and Task 3 (`test_uplink_omits_battery_when_unknown`).
3. **A 16-character stamped node code** must work end to end (node buffer, downlink match, gateway buffer). Pinned in Task 3 (`test_uplink_sixteen_char_code`, `test_downlink_exact_code_not_prefix`) and the gateway buffer in Task 7.
4. **A brownout reset on a nearly flat pack** must not boot-loop. Covered by Task 2 (`test_power_state_hysteresis`) and bench-checked in Task 8 by reading the boot log.
5. **One gust or bump during a measurement** must not raise `unstable`. Covered by the trimmed spread in Task 1 (`test_single_outlier_is_trimmed`) and the three-attempt retry in Task 5.

---

### Task 1: Pure sample analysis and fault decision (`maple_core/scale_logic`)

**Files:**
- Create: `firmware/heltec-v3-node/lib/maple_core/src/scale_logic.h`, `scale_logic.cpp`
- Create: `firmware/heltec-v3-node/test/test_scale_logic/test_main.cpp`
- Modify: `firmware/heltec-v3-node/platformio.ini`: a shared `[node]` section that the ESP32 envs extend; add `[env:native]` (`platform = native`, `test_framework = unity`, no lib_deps); pin `jgromes/RadioLib@7.8.1`, `olikraus/U8g2@2.36.18`, `platform = espressif32@7.1.3`.

**Interfaces (Produces):**
```cpp
namespace maple {
enum class SampleVerdict { Ok, NoResponse, Stuck, Saturated, Garbage, Unstable };
struct SampleStats { SampleVerdict verdict; long raw; long spread; int good; };
enum class Fault { None, LoadCell, Unstable, Reversed, Untared };
enum class Wiring { Normal, Swapped, Missing };
SampleStats analyzeSamples(const long *samples, int good, int requested, float countsPerLb);
Fault decideFault(const SampleStats &stats, bool tared, long zero, float countsPerLb);
const char *faultCode(Fault fault);            // "load-cell" ... or nullptr for None
Wiring classifyWiring(bool gpio6DrivenHigh, bool gpio7DrivenHigh);
long countsForPounds(float pounds, float countsPerLb);
}
```
Rules (constants in `scale_logic.h`): `good < requested*6/10` → NoResponse. Any sample with `|s| >= 8388600` → Saturated. Full spread `<= 4` counts → Stuck. Trimmed mean drops 2 low and 2 high when `good >= 8`, otherwise 1 and 1. Trimmed spread `> 5 lb` → Garbage. `> 0.3 lb` → Unstable. LoadCell covers NoResponse, Stuck, Saturated and Garbage. Untared means not tared. Reversed means `raw - zero < -0.3 lb`. Wiring: GPIO6 high → Normal (even if GPIO7 is also high); only GPIO7 high → Swapped; neither → Missing.

- [ ] **Step 1: Write failing tests**: `test_floating_zero_and_minus_one_is_stuck` ({0,-1,0,0,-1,0,-1,0,0,-1} → Stuck, decideFault → LoadCell, faultCode "load-cell"); `test_all_identical_is_stuck`; `test_saturated_rail_is_load_cell` (one sample 8388607); `test_too_few_samples_is_no_response` (5 of 10); `test_quiet_samples_are_ok_with_trimmed_mean` (raw equals the mean of the middle samples); `test_single_outlier_is_trimmed` (11 quiet samples plus one 0.5 lb spike → Ok); `test_spread_over_point_three_lb_is_unstable`; `test_spread_over_five_lb_is_garbage_load_cell`; `test_reversed_below_tare`; `test_untared_when_never_tared`; `test_wiring_classification` (all four input combinations).
- [ ] **Step 2: Run** `pio test -e native -f test_scale_logic` → FAIL (missing header).
- [ ] **Step 3: Implement** `scale_logic.cpp` (insertion sort on a local copy of at most 16 samples).
- [ ] **Step 4: Run** `pio test -e native -f test_scale_logic` → all PASS.
- [ ] **Step 5: Commit** `feat(node): pure HX711 sample analysis and fault decision`.

### Task 2: Pure battery curve and power policy (`maple_core/battery_logic`)

**Files:** Create `lib/maple_core/src/battery_logic.h`, `battery_logic.cpp`, `test/test_battery_logic/test_main.cpp`.

**Interfaces (Produces):**
```cpp
namespace maple {
int batteryPercentFromMv(int mv);                       // -1 when mv < 2500 or mv > 4500
enum class PowerState { Normal, Critical, Cutoff };
PowerState powerStateFromMv(int mv, PowerState previous); // mv < 0 (no pack) → Normal
int dividerMvToBatteryMv(int pinMv, float factor);        // pinMv * 4.9 * factor, rounded
}
```
Resting Li-ion curve (mV→%), interpolated linearly, clamped at 100 above 4200 and at 0 below 3300: 4200→100, 4100→90, 4000→79, 3920→68, 3850→57, 3790→46, 3750→36, 3710→26, 3670→17, 3610→9, 3500→4, 3300→0. Power state: Cutoff below 3150, Critical below 3300. Leaving a state needs 100 mV of headroom: Cutoff → Critical at ≥ 3250; Critical → Normal at ≥ 3400.

- [ ] **Step 1: Write failing tests**: `test_curve_points` (4200→100, 3790→46, 3300→0), `test_curve_interpolates` (3955→73 or 74), `test_charging_voltage_clamps_to_100` (4350→100), `test_out_of_range_is_no_pack` (0, 2400, 4600 → -1), `test_power_state_thresholds`, `test_power_state_hysteresis` (Critical at 3350 stays Critical; Normal at 3350 stays Normal), `test_no_pack_is_normal` (-1 → Normal), `test_divider_scaling` (800 mV, factor 1.045 → 4096).
- [ ] **Step 2: Run** `pio test -e native -f test_battery_logic` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(node): Li-ion battery curve and low-pack power policy`.

### Task 3: Pure LoRa and console text (`maple_core/protocol`)

**Files:** Create `lib/maple_core/src/protocol.h`, `protocol.cpp`, `test/test_protocol/test_main.cpp`.

**Interfaces (Produces):**
```cpp
namespace maple {
struct Uplink {
  const char *nodeCode; const char *fault; /* nullptr → weight */ float weightLb;
  int batteryPercent; /* < 0 → omitted */ uint32_t intervalS;
  bool echo; uint32_t commandId; bool commandOk; float countsPerLb;
};
size_t buildUplink(const Uplink &up, char *out, size_t outLen);   // 0 if it does not fit
enum class Action { None, Tare, Cal };
struct Downlink { bool hasInterval; uint32_t intervalS; Action action; uint32_t commandId; float pounds; };
bool parseDownlink(const char *payload, const char *nodeCode, Downlink *out); // false if not for us
enum class CommandType { None, Help, Status, Tare, Cal, BatCal, Interval, Provision, Factory, Reboot, Unknown };
struct Command { CommandType type; float number; const char *rest; };
Command parseCommand(const char *line);  // trims; "CAL 7.875", "BATCAL 3987", "INTERVAL 60", "PROVISION {...}"
bool jsonString(const char *json, const char *key, char *out, size_t outLen);
}
```

- [ ] **Step 1: Write failing tests**: `test_uplink_weight` (exact string `{"Node_Code":"NODE-001","Weight":35.90,"Battery_Percent":88,"Interval_Seconds":20}`), `test_uplink_negative_weight_floors_to_zero`, `test_uplink_fault`, `test_uplink_omits_battery_when_unknown`, `test_uplink_echo` (`,"Command_Id":7,"Command_Ok":1,"Counts_Per_Lb":10246}`), `test_uplink_sixteen_char_code`, `test_uplink_too_small_buffer_returns_zero`, `test_downlink_interval`, `test_downlink_interval_out_of_range_ignored` (5 and 90000), `test_downlink_tare`, `test_downlink_cal_pounds`, `test_downlink_cal_tiny_pounds_ignored`, `test_downlink_other_node_ignored`, `test_downlink_exact_code_not_prefix` (`NODE-001` must not match `NODE-0010`), `test_parse_commands` (each type, case of `TARE`, `CAL abc` → Cal with number 0), `test_json_string`.
- [ ] **Step 2: Run** `pio test -e native -f test_protocol` → FAIL.
- [ ] **Step 3: Implement** with `snprintf` and `strstr`, using no `String`.
- [ ] **Step 4: Run** `pio test -e native` → all three suites PASS.
- [ ] **Step 5: Commit** `feat(node): uplink/downlink and console parsing without String`.

### Task 4: Hardware drivers

**Files (Create under `firmware/heltec-v3-node/src/`):**
- `config.h`: the pins, radio, timing and cell constants above. `FW_VERSION "2.0.0"`, `SERVICE_WINDOW_MS 120000`, `TARE_HOLD_MS 3000`, `DOWNLINK_LISTEN_MS 4000`, `TX_JITTER_MS 750`, `ACK_PACKETS 3`, `MEASURE_ATTEMPTS 3`, `BURST_SAMPLES 12`, `CRITICAL_SLEEP_S 1800`, `CUTOFF_SLEEP_S 3600`, `WDT_TIMEOUT_S 60`, `CPU_MHZ 80`.
- `hx711.h/.cpp`: `class Hx711 { maple::Wiring probe(); void powerUp(); void powerDown(); long readOne(uint32_t timeoutMs); int burst(long *out, int n); maple::Wiring wiring() const; }`. `probe()`: pull both pins up for 2 ms (powers the chip down), then pull both down. The pull-down on SCK powers it up, and DOUT drives high while the first conversion runs. Read both pins for 20 ms and classify. Then set DT to `INPUT_PULLUP` and SCK to `OUTPUT LOW`, swapping roles when the result is `Swapped`. Neither pin is ever driven against the chip's output. Clock half-period 10 µs with interrupts off (unchanged). `readOne` returns `LONG_MIN` on timeout.
- `battery.h/.cpp`: `int readBatteryMv()` (-1 when no pack); `bool calibrateBattery(int actualMv)`. Reads GPIO37's idle level as `INPUT` and drives the opposite level (V3.1 pulls it up, V3.2 pulls it down). Settles 10 ms, sets `analogSetPinAttenuation(1, ADC_2_5db)`, takes 16 × `analogReadMilliVolts`, drops 2 high and 2 low, then returns GPIO37 to `INPUT`. Factor `bat_k` defaults to 1.045 and must stay within 0.8–1.25.
- `radio_link.h/.cpp`: `bool radioBegin()`, `int16_t radioSend(const char *json)` (2 attempts), `int radioListen(char *buf, size_t len, uint32_t ms)` (length, or -1), `void radioSleep()`, `const char *radioErrorText(int16_t)`.
- `display.h/.cpp`: `displayBegin()`, `displayPower(bool on)` (SSD1306 power save; Vext stays on, since it also feeds the OLED rail), `displayLive(const LiveView &v)`, `displayMessage(const char *title, const char *l1, const char *l2)`. `LiveView` holds the code, weight, fault text and hint, battery % and mV, next TX in s, service s left, and the TX count. Layout: a header with the node code and battery, a large weight or fault title, and a hint line.
- `console.h/.cpp`: `void consoleBegin()`, `bool consolePoll(maple::Command *out)`, `void logf(const char *fmt, ...)` (UART0 only; `USBSerial` is removed because it is not wired on this board).
- `identity.h/.cpp`: `bool identityLoad(char *code, size_t len)`, `void identityProvision(const char *code, const char *rfTag)`, `void identityClear()`.
- `power.h/.cpp`: `void powerBegin()` (CPU at 80 MHz, task watchdog 60 s on the loop task), `void watchdogFeed()`, `enum class Wake { Timer, Button }`, `Wake lightSleepFor(uint32_t ms)` (timer, plus GPIO0 low-level wake), `[[noreturn]] void deepSleepFor(uint32_t s)`, `bool bootedFromBrownout()`, `bool bootedFromDeepSleep()`, `const char *resetReasonText()`.

- [ ] **Step 1:** Write the modules. Move the old `main.cpp` body out; `main.cpp` stays as a stub that calls `displayMessage`.
- [ ] **Step 2: Run** `pio run -e field -e node_001 -e node_002 -e field_four_cell` → all build with no warnings from `src/`.
- [ ] **Step 3: Commit** `refactor(node): split firmware into drivers`.

### Task 5: Node state machine (`src/main.cpp`, `src/scale.h/.cpp`)

**Interfaces:** `scale.h`: `struct Measurement { maple::SampleStats stats; maple::Fault fault; float pounds; }`, `void scaleLoad()`, `Measurement scaleMeasure(Hx711 &hx, int attempts)` (one probe and burst per attempt; stops at the first Ok), `void scaleTare(long raw)`, `bool scaleCalibrate(float pounds, long raw)`, `float scaleCountsPerLb()`, `long scaleZero()`, `bool scaleTared()`. These use the NVS keys from Global Constraints.

Behavior:
- **Boot:** UART, watchdog, CPU at 80 MHz, identity, scale load, battery. On a brownout or deep-sleep wake with the pack at Critical or Cutoff → `deepSleepFor` right away (no OLED, no boot loop). Otherwise start the OLED and radio, probe the HX711, enter service mode, and send the first TX within 3 s.
- **Service mode:** HX711 on. A burst of 8 samples about every second updates the OLED. Holding PRG for 3 s tares; a short PRG press extends the window. Serial commands run immediately. Reports go out on schedule. When the window ends: OLED off, HX711 off, field mode.
- **Field mode:** when a report is due: `scaleMeasure(3)`, battery, auto-tare (only when untared and the measurement is Ok), build and send the uplink, listen 4 s, apply the downlink, then `radioSleep`. Then `lightSleepFor` until the next report. A PRG wake → service mode.
- **Commands:** TARE or CAL (serial or downlink) measure immediately, apply, persist `cmd_id`/`cmd_ok`, and send the ack 1.5 s later on 3 packets. A failed measurement settles the command as not ok.
- **Power:** after a report, if `powerStateFromMv` is Critical → `deepSleepFor(1800)`. If Cutoff → skip the TX and `deepSleepFor(3600)`. Pack state lives in `RTC_DATA_ATTR` for hysteresis.
- **Console** adds `HELP`, `STATUS` (one line with the version, code, wiring, raw, zero, counts/lb, lb, fault, mV, %, interval, mode and reset reason), `BATCAL <mV>`, `INTERVAL <s>` and `REBOOT` to the legacy commands.

- [ ] **Step 1:** Implement `scale.cpp` and `main.cpp`.
- [ ] **Step 2: Run** `pio run` for all node envs → build. `pio test -e native` → PASS.
- [ ] **Step 3: Commit** `feat(node): service/field modes, light sleep, confirmed faults, battery telemetry`.

### Task 6: API: a fault supersedes the node's other fault alerts

**Files:** Modify `Maple-Sugar-BE/src/business/alerting.js` (`clearedAlertTypes`), `Maple-Sugar-BE/src/services/ingestService.js` (fault branch), `Maple-Sugar-BE/test/business/domain.test.js:240`, `Maple-Sugar-BE/test/security/ingest.test.js`.

- [ ] **Step 1: Change the test** at `domain.test.js:240` to `assert.deepEqual(clearedAlertTypes({ Fault: 'load-cell' }), ['Unstable Reading', 'Reversed Load Cell', 'Untared'])`, and add `assert.deepEqual(clearedAlertTypes({ Fault: 'mystery' }), [])`. Add an ingest test, `a load-cell fault resolves the node's other fault alerts`, that asserts an `update alerts` query with the three other types.
- [ ] **Step 2: Run** `npm test` in `Maple-Sugar-BE` → the new assertions FAIL.
- [ ] **Step 3: Implement:** `FAULT_ALERT_TYPES` in `alerting.js`. For a known fault, `clearedAlertTypes` returns the other three. The ingest fault branch resolves them before `raiseOnce`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `fix(alerts): one open fault alert per node`.

### Task 7: Gateway passthrough, flasher publish script, docs

**Files:**
- Modify `firmware/heltec-v3-gateway/src/main.cpp`: `nodeCode[24]`. Write `Battery_Percent` only when the node sent it; the OLED shows `--%` otherwise. Modify `platformio.ini` to use the same pinned versions.
- Create `firmware/heltec-v3-node/scripts/publish-web-flasher.sh`: runs `pio test -e native`, `pio run -e field`, copies `bootloader.bin`, `partitions.bin`, `firmware.bin`, and `boot_app0.bin` from the framework's `tools/partitions/`, then rewrites `manifest.json` with `"version": "<FW_VERSION> field"`.
- Modify `docs/hardware.md` (node section), `docs/troubleshooting.md` (fault and battery rows), `docs/deploy-and-flasher.md` (Serving the firmware → script), `docs/CHANGELOG.md`.

- [ ] **Step 1:** Gateway edits. `pio run -e gateway` → builds.
- [ ] **Step 2:** Write and run the script → `Maple-Sugar-FE/public/firmware/*` updated, and `git diff --stat` shows the new `firmware.bin` and manifest.
- [ ] **Step 3:** `npm test` in `Maple-Sugar-FE` for the flasher tests → PASS.
- [ ] **Step 4:** Docs.
- [ ] **Step 5: Commit** `chore(flasher): publish firmware 2.0.0 field image` and `docs: node firmware 2.0`.

### Task 8: Bench verification on the connected board, review, PR

- [ ] Read flash `0x670000` to learn whether the bench board is stamped. Flash the matching env (`field` if stamped, otherwise `node_001`) and capture 90 s of serial output.
- [ ] Expected with the load cell unplugged: a boot banner with `2.0.0`, `wiring=missing`, every uplink a `load-cell` fault, no `Weight` packets, battery either omitted or a real voltage, and the service window ending in field mode with light-sleep cycles about one interval apart.
- [ ] Final whole-branch review (subagent), then fix the findings.
- [ ] Push, open the PR against `main` (`Closes #126`), and bind it.
