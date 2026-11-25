// 整包加密：PBKDF2-SHA256 → AES-GCM 256。只用 Web Crypto，Node 與瀏覽器共用。
export const ENC_FORMAT = 'ziwei-people-enc';
const subtle = () => globalThis.crypto.subtle;

const toB64 = (buf) => {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomSalt() {
  return toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(passphrase, saltB64, iterations = 600000) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptDoc(doc, key, kdf) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(doc)));
  return {
    format: ENC_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: kdf.iterations, salt: kdf.salt },
    iv: toB64(iv),
    data: toB64(ct),
  };
}

export async function decryptDoc(envelope, key) {
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.data));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new Error('passphrase 錯誤或資料損毀');
  }
}

export const isEncrypted = (raw) => raw?.format === ENC_FORMAT;
