#pragma once

#include <stddef.h>

// Node code, in this order: the block the web flasher writes at 0x670000,
// then a PROVISION over serial (NVS node_code), then a compiled NODE_CODE
// that is not the field placeholder. False when there is none.
bool identityLoad(char *code, size_t len);
// False when the code is empty, too long (16 max) or not printable ASCII.
bool identityProvision(const char *code, const char *rfTag);
// FACTORY: clears the whole NVS namespace (identity, calibration, interval).
void identityClear();
