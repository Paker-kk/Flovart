import { describe, expect, it } from 'vitest';
import { collectVideoObjectUrls, diffRemovedObjectUrls } from '../utils/objectUrlRegistry';
import type { Element } from '../types';

describe('objectUrlRegistry', () => {
  it('collects only video blob: URLs', () => {
    const elements = [
      { id: '1', type: 'video', href: 'blob:http://localhost/vid-1' },
      { id: '2', type: 'video', href: 'idb-video:abc' },
      { id: '3', type: 'image', href: 'blob:http://localhost/img-1' },
      { id: '4', type: 'video', href: 'blob:http://localhost/vid-2' },
    ] as Element[];
    const urls = collectVideoObjectUrls(elements);
    expect([...urls].sort()).toEqual([
      'blob:http://localhost/vid-1',
      'blob:http://localhost/vid-2',
    ]);
  });

  it('returns empty set for no video elements', () => {
    const urls = collectVideoObjectUrls([
      { id: '1', type: 'image', href: 'blob:x' },
    ] as Element[]);
    expect(urls.size).toBe(0);
  });

  it('returns removed object URLs', () => {
    const prev = new Set(['blob:one', 'blob:two', 'blob:three']);
    const next = new Set(['blob:two']);
    const removed = diffRemovedObjectUrls(prev, next);
    expect(removed.sort()).toEqual(['blob:one', 'blob:three']);
  });

  it('returns empty array when nothing removed', () => {
    const prev = new Set(['blob:a']);
    const next = new Set(['blob:a', 'blob:b']);
    expect(diffRemovedObjectUrls(prev, next)).toEqual([]);
  });
});
