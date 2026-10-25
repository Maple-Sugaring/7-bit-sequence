#pragma once

// Turns a burst of raw HX711 counts into one reading, or into the reason there
// is no reading. Pure: no Arduino, so it runs under `pio test -e native`.

namespace maple {

// The HX711 clamps at 0x7FFFFF / 0x800000. Anything this close to a rail is
// an open bridge wire, not weight.
static const long HX_SATURATION_COUNTS = 8388600L;
// A live bridge at gain 128 always shows tens of counts of noise. A burst this
// flat is a DT line stuck high or low (a floating pin reads 0 and -1).
static const long HX_STUCK_SPREAD_COUNTS = 4;
// Movement inside one ~1.5 s burst, on the trimmed samples. A still bucket
// reads steady to a few hundredths, so past 0.5 lb it is wind or a loose
// cable; past 5 lb it is not a scale at all. In pounds so the limits follow
// the calibration, whichever cell is fitted.
static const float UNSTABLE_SPREAD_LB = 0.5f;
static const float GARBAGE_SPREAD_LB = 5.0f;
// Creep or cold can pull the zero down a few tenths. More than a pound below
// the tare is a reversed or tension-loaded cell.
static const float REVERSED_DELTA_LB = 1.0f;
static const int MAX_BURST_SAMPLES = 16;

enum class SampleVerdict { Ok, NoResponse, Stuck, Saturated, Garbage, Unstable };

struct SampleStats {
  SampleVerdict verdict;
  long raw;     // trimmed mean, valid when verdict is Ok or Unstable
  long spread;  // trimmed max - min
  int good;     // conversions that arrived
};

enum class Fault { None, LoadCell, Unstable, Reversed, Untared };

// Which pin answered when the HX711 was powered up (see Hx711::probe).
enum class Wiring { Normal, Swapped, Missing };

// `samples` holds the `good` conversions that arrived out of `requested`.
SampleStats analyzeSamples(const long *samples, int good, int requested, float countsPerLb);

// The one fault worth reporting, most fundamental first.
Fault decideFault(const SampleStats &stats, bool tared, long zero, float countsPerLb);

// The uplink code the API knows, or nullptr for Fault::None.
const char *faultCode(Fault fault);

Wiring classifyWiring(bool gpio6DrivenHigh, bool gpio7DrivenHigh);

long countsForPounds(float pounds, float countsPerLb);

// Firmware 1.x tared on the 0 / -1 a floating DT pin reads. A real bridge
// never zeroes at exactly those counts, so such a stored zero is re-tared.
bool storedZeroIsBogus(long zero);

}  // namespace maple
