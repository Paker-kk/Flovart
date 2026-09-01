/** @vitest-environment node */

import { afterEach, describe, expect, it } from 'vitest';
import { executeUnifiedIgnition } from '../services/aiGateway';
import { createFakeProviderServer } from '../scripts/fake-provider-server.mjs';
import type { UserApiKey } from '../types';

const servers: any[] = [];

async function startFakeProvider() {
  const server: any = createFakeProviderServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fake provider did not expose a port');
  const origin = `http://127.0.0.1:${address.port}`;
  const key: UserApiKey = {
    id: 'rc-resilience-key',
    provider: 'custom',
    capabilities: ['image', 'video'],
    key: 'fake-secret',
    baseUrl: `${origin}/v1`,
    models: [
      { id: 'gpt-image-2', name: 'GPT Image 2', capability: 'image' },
      { id: 'grok-imagine-video', name: 'Grok Imagine Video', capability: 'video' },
    ],
    defaultModel: 'gpt-image-2',
    createdAt: 1,
    updatedAt: 1,
  };
  return { server, origin, key };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

const imageInput = (index: number, key: UserApiKey, origin: string, edit = false) => executeUnifiedIgnition({
  elementId: `rc-image-${index}`,
  prompt: edit ? `编辑参考图 ${index}` : `生成图片 ${index}`,
  modelId: 'gpt-image-2',
  productModelId: 'flovart:gpt-image-2',
  generationCapability: edit ? 'image-edit' : 'text-to-image',
  generationSubmode: edit ? 'image-to-image' : 'text-to-image',
  apiKeyPayload: key,
  ...(edit ? { references: [{ type: 'image' as const, href: `${origin}/fixtures/image.png`, mimeType: 'image/png', slotRole: 'reference_image' as const }] } : {}),
});

const videoInput = (index: number, key: UserApiKey, origin: string, edit = false) => executeUnifiedIgnition({
  elementId: `rc-video-${index}`,
  prompt: edit ? `让参考图动起来 ${index}` : `生成视频 ${index}`,
  modelId: 'grok-imagine-video',
  productModelId: 'flovart:grok-imagine-video',
  generationCapability: edit ? 'image-to-video' : 'text-to-video',
  generationSubmode: edit ? 'image-to-video' : 'text-to-video',
  apiKeyPayload: key,
  ...(edit ? { references: [{ type: 'image' as const, href: `${origin}/fixtures/image.png`, mimeType: 'image/png', slotRole: 'first_frame' as const }] } : {}),
});

describe('release candidate provider resilience', () => {
  it('completes the deterministic 30/30/20/20 HTTP soak without duplicate submits', async () => {
    const { server, origin, key } = await startFakeProvider();
    const results = [
      ...await Promise.all(Array.from({ length: 30 }, (_, index) => imageInput(index, key, origin))),
      ...await Promise.all(Array.from({ length: 30 }, (_, index) => imageInput(index, key, origin, true))),
      ...await Promise.all(Array.from({ length: 20 }, (_, index) => videoInput(index, key, origin))),
      ...await Promise.all(Array.from({ length: 20 }, (_, index) => videoInput(index, key, origin, true))),
    ];

    expect(results.every(result => result.ok)).toBe(true);
    const requests = server.getState().requests;
    const submissions = requests.filter(request => request.method === 'POST' && [
      '/v1/images/generations', '/v1/images/edits', '/v2/videos/generations',
    ].includes(request.path));
    const completions = results.filter(result => result.ok).length;
    const duplicateSubmissions = submissions.length - 100;
    expect(submissions).toHaveLength(100);
    expect(completions).toBe(100);
    expect(duplicateSubmissions).toBe(0);
    expect(requests.filter(request => request.path === '/v1/images/edits' && request.referenceCount === 1)).toHaveLength(30);
    expect(requests.filter(request => request.path === '/v2/videos/generations' && request.referenceCount === 1)).toHaveLength(20);
  }, 60_000);

  it('recovers after transient rate limiting without hiding the failed attempt', async () => {
    const { server, origin, key } = await startFakeProvider();
    server.setMode('rate_limit');
    await expect(imageInput(1, key, origin)).resolves.toMatchObject({ ok: false, errorMessage: 'AI 服务当前限流，请稍后重试。' });

    server.setMode('success');
    await expect(imageInput(1, key, origin)).resolves.toMatchObject({ ok: true });

    const submissions = server.getState().requests.filter(request => request.method === 'POST' && request.path === '/v1/images/generations');
    expect(submissions).toHaveLength(2);
  });
});
