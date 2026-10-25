#include "identity.h"

#include <Arduino.h>
#include <Preferences.h>
#include <esp_flash.h>
#include <string.h>

#include "config.h"

namespace {

const size_t MAX_CODE = 16;

bool printable(const char *code) {
  const size_t len = strlen(code);
  if (len == 0 || len > MAX_CODE) return false;
  for (size_t i = 0; i < len; i++) {
    if (code[i] < 0x21 || code[i] > 0x7E || code[i] == '"' || code[i] == '\\') return false;
  }
  return true;
}

bool copyIfValid(const char *code, char *out, size_t len) {
  if (!printable(code) || strlen(code) >= len) return false;
  strcpy(out, code);
  return true;
}

}  // namespace

bool identityLoad(char *code, size_t len) {
  // Not part of the app image, so the image's checksum stays valid.
  uint8_t block[32] = {0};
  if (esp_flash_read(nullptr, block, IDENTITY_FLASH_ADDR, sizeof(block)) == ESP_OK &&
      memcmp(block, "MAPLEID1", 8) == 0) {
    char stamped[MAX_CODE + 1];
    memcpy(stamped, block + 8, MAX_CODE);
    stamped[MAX_CODE] = '\0';
    if (copyIfValid(stamped, code, len)) return true;
  }

  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, true);
  char provisioned[24] = "";
  if (prefs.isKey("node_code")) prefs.getString("node_code", provisioned, sizeof(provisioned));
  prefs.end();
  if (copyIfValid(provisioned, code, len)) return true;

  if (strcmp(NODE_CODE, PLACEHOLDER_NODE_CODE) != 0 && copyIfValid(NODE_CODE, code, len)) return true;
  return false;
}

bool identityProvision(const char *code, const char *rfTag) {
  if (!code || !printable(code)) return false;
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putString("node_code", code);
  prefs.putString("rf_tag", rfTag ? rfTag : "");
  prefs.end();
  return true;
}

void identityClear() {
  Preferences prefs;
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
}
