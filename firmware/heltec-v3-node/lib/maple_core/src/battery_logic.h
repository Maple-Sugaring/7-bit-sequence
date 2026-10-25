#pragma once

// Battery charge for the 18650 pack the D5 solar kit feeds into the Heltec's
// SH1.25-2P lithium port. Pure, so it is tested on the host.

namespace maple {

// The Heltec V3 measures VBAT through 390k / 100k into GPIO1.
static const float VBAT_DIVIDER = 4.9f;
// Outside this window there is no pack on the port (USB power only, or the
// ADC is not reading the divider), so no percentage is reported.
static const int PACK_MIN_MV = 2500;
static const int PACK_MAX_MV = 4500;

// Protection levels for an unattended pack. Leaving a level needs 100 mV of
// headroom so a pack that sags under the radio does not flap.
static const int CRITICAL_MV = 3300;
static const int CUTOFF_MV = 3150;
static const int RECOVER_MARGIN_MV = 100;

// Resting Li-ion charge, 0..100, or -1 when no pack is measured.
int batteryPercentFromMv(int mv);

enum class PowerState { Normal, Critical, Cutoff };

// mv < 0 means no pack (USB power), which never needs protecting.
PowerState powerStateFromMv(int mv, PowerState previous);

int dividerMvToBatteryMv(int pinMv, float factor);

}  // namespace maple
