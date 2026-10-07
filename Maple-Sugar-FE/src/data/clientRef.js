/**
 * A fresh random UUID for one collection.
 *
 * The phone stamps each entry once, when it is saved. If the upload is retried
 * (a dropped signal, a replay from the offline queue) the API recognizes the
 * same reference and hands back the entry it already has instead of filing the
 * collection twice.
 *
 * crypto.randomUUID exists only in secure contexts, so the fallback builds a
 * version 4 UUID from getRandomValues, which does not have that limit.
 */
export function newClientRef() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
