import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectPinnedOutputObjectUrls,
  hydrateWorkflowNodesFromStorage,
  serializeWorkflowNodesForStorage,
} from '../components/nodeflow/pinnedOutputPersistence';
import type { WorkflowNode } from '../components/nodeflow/types';
import { isIdbRef } from '../utils/imageDB';
import { isIdbVideoRef } from '../utils/mediaDB';
import { getActiveBlobUrls, resetBlobUrls } from './setup';

describe('pinnedOutputPersistence', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetBlobUrls();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('offloads pinned image/video media into IndexedDB refs and hydrates them back', async () => {
    const imageHref = 'data:image/png;base64,aW1hZ2U=';
    const posterHref = 'data:image/png;base64,cG9zdGVy';
    const videoBlob = new Blob(['video-bytes'], { type: 'video/mp4' });
    const liveVideoHref = URL.createObjectURL(videoBlob);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === liveVideoHref) {
        return new Response(videoBlob, { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }) as typeof fetch;

    const nodes: WorkflowNode[] = [
      {
        id: 'video_1',
        kind: 'videoGen',
        x: 0,
        y: 0,
        config: {
          pinnedOutputs: {
            image: { kind: 'image', href: imageHref, mimeType: 'image/png' },
            video: { kind: 'video', href: liveVideoHref, mimeType: 'video/mp4', posterHref },
          },
        },
      },
    ];

    const serializedNodes = await serializeWorkflowNodesForStorage(nodes);
    const serializedOutputs = serializedNodes[0].config?.pinnedOutputs;
    const serializedImage = serializedOutputs?.image;
    const serializedVideo = serializedOutputs?.video;

    expect(serializedImage?.kind).toBe('image');
    expect(serializedImage?.kind === 'image' && isIdbRef(serializedImage.href)).toBe(true);
    expect(serializedVideo?.kind).toBe('video');
    expect(serializedVideo?.kind === 'video' && isIdbVideoRef(serializedVideo.href)).toBe(true);
    expect(serializedVideo?.kind === 'video' && serializedVideo.posterHref && isIdbRef(serializedVideo.posterHref)).toBe(true);

    const hydratedNodes = await hydrateWorkflowNodesFromStorage(serializedNodes);
    const hydratedOutputs = hydratedNodes[0].config?.pinnedOutputs;
    const hydratedImage = hydratedOutputs?.image;
    const hydratedVideo = hydratedOutputs?.video;

    expect(hydratedImage).toMatchObject({ kind: 'image', href: imageHref, mimeType: 'image/png' });
    expect(hydratedVideo?.kind).toBe('video');
    expect(hydratedVideo?.kind === 'video' && hydratedVideo.href.startsWith('blob:test/')).toBe(true);
    expect(hydratedVideo?.kind === 'video' && hydratedVideo.posterHref).toBe(posterHref);
    expect(hydratedVideo?.kind === 'video' && getActiveBlobUrls().has(hydratedVideo.href)).toBe(true);
  });

  it('collects only blob URLs from pinned video outputs', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'node_1',
        kind: 'videoGen',
        x: 0,
        y: 0,
        config: {
          pinnedOutputs: {
            video: { kind: 'video', href: 'blob:test/keep', mimeType: 'video/mp4' },
            poster: { kind: 'image', href: 'blob:test/image', mimeType: 'image/png' },
          },
        },
      },
      {
        id: 'node_2',
        kind: 'videoGen',
        x: 0,
        y: 0,
        config: {
          pinnedOutputs: {
            video: { kind: 'video', href: 'idb-video:workflow-pinned:node_2:video:video', mimeType: 'video/mp4' },
          },
        },
      },
    ];

    expect([...collectPinnedOutputObjectUrls(nodes)]).toEqual(['blob:test/keep']);
  });
});
