import { describe, expect, it } from 'vitest';

import {
  buildAssetItemsFromCollectedImages,
  normalizeCollectedImagesPayload,
} from '../utils/extensionBridge';

describe('extension bridge import helpers', () => {
  it('normalizes collected image payloads from the browser extension', () => {
    const payload = normalizeCollectedImagesPayload({
      source: 'https://example.com/gallery',
      images: [
        { src: 'https://example.com/a.png', alt: 'Hero', width: 512, height: 384 },
        { src: '', width: 100, height: 100 },
      ],
    });

    expect(payload?.images).toHaveLength(1);
    expect(payload?.images[0]).toMatchObject({
      src: 'https://example.com/a.png',
      alt: 'Hero',
      width: 512,
      height: 384,
    });
  });

  it('turns collected images into scene asset items with source metadata', () => {
    const payload = normalizeCollectedImagesPayload({
      source: 'https://example.com/gallery',
      images: [{ src: 'https://example.com/a.png', alt: 'Hero', width: 512, height: 384 }],
    });

    const items = buildAssetItemsFromCollectedImages(payload!, 1000);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: 'scene',
      name: 'Hero',
      dataUrl: 'https://example.com/a.png',
      width: 512,
      height: 384,
      sourceUrl: 'https://example.com/gallery',
      source: 'extension',
    });
  });
});
