/**
 * Pure-function AES-GCM key codec.
 * No chrome.runtime dependency — accepts runtimeId as a parameter.
 * Mirrors the V3 format used in extension/popup/popup.js and
 * extension/background/service-worker.js.
 */

const ENC_SALT = 'flovart-ext-v3';

async function deriveEncryptionKey(runtimeId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(runtimeId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(ENC_SALT), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encode data as V3 AES-GCM { iv, ct } payload. */
export async function encodeKeys(
  data: unknown,
  runtimeId: string,
): Promise<{ iv: number[]; ct: number[] }> {
  const aesKey = await deriveEncryptionKey(runtimeId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

/** Decode either V3 AES-GCM or legacy V2 base64 payload. Returns null on failure. */
export async function decodeKeys(encoded: unknown, runtimeId: string): Promise<unknown | null> {
  // V2 legacy: plain base64 string
  if (typeof encoded === 'string') {
    try {
      const s = atob(encoded);
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  // V3: AES-GCM { iv, ct }
  if (typeof encoded !== 'object' || encoded === null) return null;
  const obj = encoded as Record<string, unknown>;
  if (!Array.isArray(obj.iv) || !Array.isArray(obj.ct)) return null;
  try {
    const aesKey = await deriveEncryptionKey(runtimeId);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(obj.iv as number[]) },
      aesKey,
      new Uint8Array(obj.ct as number[]),
    );
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
