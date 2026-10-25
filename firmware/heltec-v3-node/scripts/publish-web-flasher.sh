#!/usr/bin/env bash
# Rebuilds the `field` image and copies it to the web flasher
# (Maple-Sugar-FE/public/firmware, served at /firmware/ by the Deploy page).
# Run from anywhere: firmware/heltec-v3-node/scripts/publish-web-flasher.sh
set -euo pipefail

node_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$node_dir/../.." && pwd)"
out_dir="$repo_dir/Maple-Sugar-FE/public/firmware"
build_dir="$node_dir/.pio/build/field"

cd "$node_dir"
pio test -e native
pio run -e field

version="$(sed -n 's/^#define FW_VERSION "\(.*\)"/\1/p' src/config.h)"
if [[ -z "$version" ]]; then
  echo "FW_VERSION not found in src/config.h" >&2
  exit 1
fi

# boot_app0.bin is the stock OTA selector from the Arduino core PlatformIO used.
framework_dir="${PLATFORMIO_CORE_DIR:-$HOME/.platformio}/packages/framework-arduinoespressif32"
boot_app0="$framework_dir/tools/partitions/boot_app0.bin"
if [[ ! -f "$boot_app0" ]]; then
  echo "boot_app0.bin not found at $boot_app0" >&2
  exit 1
fi

mkdir -p "$out_dir"
cp "$build_dir/bootloader.bin" "$build_dir/partitions.bin" "$build_dir/firmware.bin" "$out_dir/"
cp "$boot_app0" "$out_dir/boot_app0.bin"

# Offsets match the board's default_8MB.csv; the node code goes at 0x670000
# (heltecFlash.js stampNodeCode), outside every part listed here.
cat > "$out_dir/manifest.json" <<EOF
{
  "name": "Maple Sugaring field node",
  "version": "$version field",
  "chipFamily": "ESP32-S3",
  "parts": [
    { "path": "bootloader.bin", "offset": 0 },
    { "path": "partitions.bin", "offset": 32768 },
    { "path": "boot_app0.bin", "offset": 57344 },
    { "path": "firmware.bin", "offset": 65536 }
  ]
}
EOF

echo "Published firmware $version to $out_dir:"
ls -l "$out_dir"
