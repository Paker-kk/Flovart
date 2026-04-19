import { describe, it, expect, afterEach } from 'vitest';
import { getActiveBlobUrls, resetBlobUrls } from './setup';

describe('test infrastructure smoke', () => {
  afterEach(() => resetBlobUrls());

  it('crypto.subtle.digest works', async () => {
    const data = new TextEncoder().encode('hello');
    const hash = await crypto.subtle.digest('SHA-256', data);
    // Node webcrypto returns Buffer; just verify it's 32 bytes
    expect(hash.byteLength).toBe(32);
  });

  it('URL.createObjectURL returns a blob URL', () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    expect(url).toMatch(/^blob:/);
    expect(getActiveBlobUrls().has(url)).toBe(true);
  });

  it('URL.revokeObjectURL removes the tracked URL', () => {
    const blob = new Blob(['x']);
    const url = URL.createObjectURL(blob);
    URL.revokeObjectURL(url);
    expect(getActiveBlobUrls().has(url)).toBe(false);
  });
});
