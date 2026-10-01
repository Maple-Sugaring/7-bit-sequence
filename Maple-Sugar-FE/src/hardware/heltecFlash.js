/**
 * Browser flasher for a Heltec WiFi LoRa 32 V3.
 *
 * Same idea as the Meshtastic flasher (https://flasher.meshtastic.org/): the
 * site hosts the firmware, the browser downloads it, and Web Serial writes it
 * to the board. The person flashing never saves a file.
 *
 * The image is the PlatformIO `field` build, published under /firmware.
 */

export const FIELD_FIRMWARE_MANIFEST = '/firmware/manifest.json';
export const HELTEC_APP_ADDRESS = 0x10000;
/**
 * Unused SPIFFS area on the Heltec V3 partition map. The app image stays
 * byte-for-byte as built, so its checksum still boots and the OLED can power on.
 * The node code is written here instead.
 */
export const NODE_IDENTITY_ADDRESS = 0x670000;
export const NODE_IDENTITY_MAGIC = 'MAPLEID1';

export function stampNodeCode(parts, nodeCode) {
  const code = String(nodeCode ?? '').trim();
  if (!code || code.length > 16) {
    throw new Error('The node code has to fit in the firmware image.');
  }
  const data = new Uint8Array(32);
  data.set(new TextEncoder().encode(NODE_IDENTITY_MAGIC));
  data.set(new TextEncoder().encode(code), 8);
  return [...parts, { address: NODE_IDENTITY_ADDRESS, data }];
}

function report(onStatus, message, progress) {
  onStatus({ message, progress });
}

export async function loadFieldFirmware(onStatus = () => {}) {
  report(onStatus, 'Downloading firmware from this site…', 4);
  const manifestResponse = await fetch(FIELD_FIRMWARE_MANIFEST);
  if (!manifestResponse.ok) {
    throw new Error('This site is not serving the Heltec firmware yet.');
  }
  const manifest = await manifestResponse.json();
  const parts = [];
  const files = manifest.parts ?? [];
  for (const [index, part] of files.entries()) {
    report(
      onStatus,
      `Downloading ${part.path}…`,
      8 + Math.round((index / Math.max(files.length, 1)) * 12),
    );
    const response = await fetch(new URL(part.path, `${window.location.origin}/firmware/`).href);
    if (!response.ok) {
      throw new Error(`Could not download ${part.path} from this site.`);
    }
    parts.push({
      address: part.offset,
      data: new Uint8Array(await response.arrayBuffer()),
    });
  }
  if (!parts.length || parts.some((part) => part.data.length < 64)) {
    throw new Error('The firmware on this site is empty.');
  }
  return parts;
}

export function provisionCommand(node) {
  return `PROVISION ${JSON.stringify({
    Node_Code: node.Node_Code,
    Rf_Tag: node.Rf_Tag || '',
  })}\n`;
}

export function factoryCommand() {
  return 'FACTORY\n';
}

async function readChunk(reader, timeoutMs) {
  let timer;
  const result = await Promise.race([
    reader.read().then((value) => ({ kind: 'read', value })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Talk to a Heltec that is already running. Do not toggle DTR or RTS and do
 * not cancel the serial read. On this Mac, Chrome's USB thread traps when
 * those happen while the ESP32-S3 reconnects.
 */
async function openRunningPort(port) {
  if (port.readable || port.writable) {
    await port.close().catch(() => {});
  }
  await port.open({ baudRate: 115200 });
}

/** Sends the tree name to a board whose screen already says Waiting to deploy. */
export async function nameHeltec(port, command, onStatus = () => {}) {
  const marker = command.startsWith('FACTORY') ? 'CLEARED' : 'PROVISIONED';
  const payload = new TextEncoder().encode(command);
  report(onStatus, 'Sending the tree name…', 94);
  await openRunningPort(port);
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const decoder = new TextDecoder();
  let text = '';
  let inflight = null;
  let named = false;
  const deadline = Date.now() + 12000;
  let nextWrite = 0;
  try {
    while (Date.now() < deadline && !named) {
      if (Date.now() >= nextWrite) {
        await writer.write(payload);
        nextWrite = Date.now() + 1000;
        report(onStatus, 'Sending the tree name…', 94);
      }
      if (!inflight) inflight = reader.read();
      const result = await Promise.race([
        inflight.then((value) => ({ kind: 'read', value })),
        sleep(400).then(() => ({ kind: 'wait' })),
      ]);
      if (result.kind === 'wait') continue;
      inflight = null;
      if (result.value.done) break;
      text += decoder.decode(result.value.value, { stream: true });
      named = text.includes(marker);
    }
  } finally {
    writer.releaseLock();
    if (!inflight) {
      try {
        reader.releaseLock();
      } catch {
        // The port close releases a reader that is still finishing.
      }
    }
    await port.close().catch(() => {});
  }
  if (!named) {
    throw new Error('The Heltec is still on Waiting to deploy. Leave the cable plugged in and press Send name again. Do not flash again.');
  }
  report(onStatus, 'The board has its identity.', 100);
}

/** Writes one line and waits for the board to answer. */
export async function writeSerialCommand(port, command, marker, timeoutMs = 8000) {
  if (!port.readable || !port.writable) {
    await port.open({ baudRate: 115200 });
  }
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(command));
  writer.releaseLock();
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let heard = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline && !heard.includes(marker)) {
      const result = await readChunk(reader, Math.max(200, deadline - Date.now()));
      if (result.kind === 'timeout') break;
      if (result.value.done) break;
      heard += decoder.decode(result.value.value, { stream: true });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The port close below releases a read that is still finishing.
    }
  }
  if (!heard.includes(marker)) {
    throw new Error('The board did not confirm. Unplug it, plug it back in, and try again.');
  }
  return heard;
}

/**
 * Downloads the field firmware from this site, writes it over USB, then sends
 * `command` once the board boots.
 */
export async function flashHeltec(port, nodeCode, onStatus = () => {}) {
  const parts = stampNodeCode(await loadFieldFirmware(onStatus), nodeCode);
  const { ESPLoader, Transport } = await import('esptool-js');

  const terminal = {
    clean() {},
    writeLine() {},
    write() {},
  };
  // One connect only. Repeating USB resets is what crashes Chrome on this Mac.
  report(onStatus, 'Connecting to the Heltec bootloader…', 22);
  const transport = new Transport(port, true);
  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    romBaudrate: 115200,
    terminal,
  });
  try {
    await loader.main('default_reset');
  } catch (error) {
    try {
      await transport.disconnect();
    } catch {
      // Already closed.
    }
    throw new Error(
      'Chrome could not open the bootloader. Hold PRG, tap RST, release PRG, then press Flash once.',
      { cause: error },
    );
  }
  report(onStatus, 'Writing firmware…', 25);
  await loader.writeFlash({
    fileArray: parts,
    flashSize: '8MB',
    // The field image is built DIO. QIO rewrites the bootloader and the V3 never starts.
    flashMode: 'dio',
    flashFreq: '80m',
    eraseAll: false,
    compress: true,
    reportProgress(_fileIndex, written, total) {
      if (!total) return;
      const fraction = written / total;
      report(onStatus, `Writing firmware… ${Math.min(100, Math.round(fraction * 100))}%`, 25 + Math.round(fraction * 62));
    },
  });

  report(onStatus, 'Restarting the board…', 90);
  try {
    await loader.after('hard_reset');
  } catch {
    // Some cables drop the port as the chip resets. The next open recovers it.
  }
  try {
    await transport.disconnect();
  } catch {
    // The port may already be closed by the reset.
  }

  report(onStatus, `Flashed ${nodeCode}. The screen will show that code when the board starts.`, 100);
}

/**
 * Erases the whole ESP32 flash over USB. Firmware and the stored tree code are both gone.
 */
export async function eraseHeltec(port, onStatus = () => {}) {
  const { ESPLoader, Transport } = await import('esptool-js');

  const terminal = {
    clean() {},
    writeLine() {},
    write() {},
  };
  report(onStatus, 'Connecting to the Heltec bootloader…', null);
  const transport = new Transport(port, true);
  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    romBaudrate: 115200,
    terminal,
  });
  try {
    await loader.main('default_reset');
  } catch (error) {
    try {
      await transport.disconnect();
    } catch {
      // Already closed.
    }
    throw new Error(
      'Chrome could not open the bootloader. Hold PRG, tap RST, release PRG, then press Clear flash once.',
      { cause: error },
    );
  }
  report(onStatus, 'Clearing flash…', null);
  try {
    await loader.eraseFlash();
  } finally {
    try {
      await loader.after('hard_reset');
    } catch {
      // Some cables drop the port as the chip resets.
    }
    try {
      await transport.disconnect();
    } catch {
      // The port may already be closed by the reset.
    }
  }
  report(onStatus, 'Flash is clear.', 100);
}
