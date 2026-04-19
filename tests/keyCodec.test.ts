import { describe, expect, it } from 'vitest';
import { encodeKeys, decodeKeys } from '../utils/keyCodec';

const sampleKeys = [
  { id: '1', provider: 'google', key: 'AIza-test', capabilities: ['text', 'image', 'video'] },
];

describe('key codec (pure function)', () => {
  it('round-trips V3 AES-GCM payloads', async () => {
    const encoded = await encodeKeys(sampleKeys, 'runtime-test-id');
    const decoded = await decodeKeys(encoded, 'runtime-test-id');
    expect(decoded).toEqual(sampleKeys);
  });

  it('rejects V3 payload with wrong runtimeId', async () => {
    const encoded = await encodeKeys(sampleKeys, 'correct-id');
    const decoded = await decodeKeys(encoded, 'wrong-id');
    expect(decoded).toBeNull();
  });

  it('decodes legacy V2 base64 payloads', async () => {
    const legacy = btoa(JSON.stringify(sampleKeys));
    const decoded = await decodeKeys(legacy, 'runtime-test-id');
    expect(decoded).toEqual(sampleKeys);
  });

  it('returns null for malformed V3 object (missing iv/ct)', async () => {
    const decoded = await decodeKeys({ iv: null, ct: null }, 'runtime-test-id');
    expect(decoded).toBeNull();
  });

  it('returns null for completely garbage input', async () => {
    const decoded = await decodeKeys(12345 as unknown, 'runtime-test-id');
    expect(decoded).toBeNull();
  });

  it('returns null for invalid base64 string', async () => {
    const decoded = await decodeKeys('not-valid-base64!!!', 'runtime-test-id');
    expect(decoded).toBeNull();
  });
});
