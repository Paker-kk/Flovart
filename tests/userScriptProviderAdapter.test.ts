import { describe, expect, it, afterEach, vi } from 'vitest';
import { buildCanonicalGenerationInput, resolveWorkflowInputs } from '../components/workflow/inputResolver';
import { createWorkflowNode } from '../components/workflow/constants';
import { executeUnifiedIgnition } from '../services/aiGateway';
import type { ProviderMaterializedReference } from '../services/providerGenerationAdapter';
import {
  clearUserScriptProviders,
  getUserScriptProvider,
  registerUserScriptProvider,
} from '../services/userScriptProviderAdapter';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function canonicalImage() {
  const source = createWorkflowNode('source', 'image', { x: 0, y: 0 }, {
    href: 'https://cdn.example.com/source.png',
    mimeType: 'image/png',
  });
  const target = createWorkflowNode('target', 'image', { x: 420, y: 0 }, {
    config: { mode: 'image', submode: 'image-to-image', modelId: 'custom-image-v1' },
  });
  const inputs = resolveWorkflowInputs(target, [source, target], [{ id: 'edge', fromNodeId: source.id, toNodeId: target.id }]);
  const input = buildCanonicalGenerationInput({ targetNode: target, inputs, prompt: '修改构图', mode: 'image', submode: 'image-to-image' });
  const references: ProviderMaterializedReference[] = input.references.map(reference => ({
    resourceId: reference.resource.resourceId,
    type: reference.resource.kind as 'image',
    href: 'https://cdn.example.com/source.png',
    mimeType: 'image/png',
    role: reference.role,
    order: reference.order,
  }));
  return { input, references };
}

function canonicalVideo() {
  const source = createWorkflowNode('video-source', 'image', { x: 0, y: 0 }, {
    href: 'https://cdn.example.com/video-source.png',
    mimeType: 'image/png',
  });
  const target = createWorkflowNode('video-target', 'video', { x: 420, y: 0 }, {
    config: { mode: 'video', submode: 'image-to-video', modelId: 'custom-video-v1' },
  });
  const inputs = resolveWorkflowInputs(target, [source, target], [{ id: 'video-edge', fromNodeId: source.id, toNodeId: target.id }]);
  const input = buildCanonicalGenerationInput({ targetNode: target, inputs, prompt: '让画面动起来', mode: 'video', submode: 'image-to-video' });
  const references: ProviderMaterializedReference[] = input.references.map(reference => ({
    resourceId: reference.resource.resourceId,
    type: 'image',
    href: 'https://cdn.example.com/video-source.png',
    mimeType: 'image/png',
    role: reference.role,
    order: reference.order,
  }));
  return { input, references };
}

afterEach(() => {
  clearUserScriptProviders();
  vi.restoreAllMocks();
});

describe('UserScriptProviderAdapter', () => {
  it('rejects non-HTTPS and loopback endpoints before registration', () => {
    expect(() => registerUserScriptProvider({
      id: 'unsafe',
      endpoint: 'http://127.0.0.1:9000',
      capabilities: ['text-to-image'],
      supportedReferenceKinds: [],
      supportedReferenceRoles: [],
      maxReferences: { image: 0, video: 0, audio: 0 },
      request: { method: 'POST', body: { prompt: { $path: 'input.prompt' } } },
      response: { kind: 'image', base64Path: 'data.0.b64_json' },
    })).toThrow('只允许 HTTPS');
  });

  it('maps canonical image input to a real request without exposing the credential to mapping', async () => {
    const adapter = registerUserScriptProvider({
      id: 'custom-image',
      endpoint: 'https://image.example.com/v1',
      capabilities: ['image-edit'],
      supportedReferenceKinds: ['image'],
      supportedReferenceRoles: ['reference', 'character', 'style', 'mask'],
      maxReferences: { image: 4, video: 0, audio: 0 },
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      request: {
        method: 'POST',
        path: '/images/edit',
        body: {
          model: { $path: 'input.parameters.modelId' },
          prompt: { $path: 'input.prompt' },
          references: {
            $map: {
              path: 'input.references',
              item: {
                url: { $path: '$item.href' },
                role: { $path: '$item.role' },
              },
            },
          },
        },
      },
      response: { kind: 'image', base64Path: 'data.0.b64_json' },
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [{ b64_json: 'ZmFrZQ==' }] }));
    const { input, references } = canonicalImage();

    const result = await adapter.execute(input, references, {
      provider: 'custom',
      routeId: 'custom-image-v1',
      productModelId: 'flovart:gpt-image-2',
    }, {
      fetch: fetchMock,
      credential: { referenceId: 'key-1', read: () => 'secret-key' },
    });

    expect(result.result.mediaUrl).toBe('data:image/png;base64,ZmFrZQ==');
    expect(fetchMock).toHaveBeenCalledWith('https://image.example.com/v1/images/edit', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer secret-key' }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      model: 'custom-image-v1',
      prompt: '修改构图',
      references: [{ url: 'https://cdn.example.com/source.png', role: 'reference' }],
    });
    expect(JSON.stringify(body)).not.toContain('secret-key');
    expect(getUserScriptProvider('custom-image')).toBe(adapter);
  });

  it('polls a custom video task and can cancel it through declarative paths', async () => {
    const adapter = registerUserScriptProvider({
      id: 'custom-video',
      endpoint: 'https://video.example.com/api',
      capabilities: ['image-to-video'],
      supportedReferenceKinds: ['image'],
      supportedReferenceRoles: ['first_frame', 'reference', 'character', 'style'],
      maxReferences: { image: 2, video: 0, audio: 0 },
      auth: { header: 'X-API-Key', prefix: '' },
      request: { method: 'POST', path: '/jobs', body: { prompt: { $path: 'input.prompt' } } },
      response: { kind: 'video', taskIdPath: 'task.id' },
      poll: {
        request: { method: 'GET', path: '/jobs/{{taskId}}' },
        response: { kind: 'video', statusPath: 'status', mediaUrlPath: 'result.url', failureStatuses: ['failed'] },
        intervalMs: 0,
        timeoutMs: 1000,
      },
      cancel: {
        request: { method: 'POST', path: '/jobs/{{taskId}}/cancel' },
        successPath: 'cancelled',
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ task: { id: 'task-7' } }))
      .mockResolvedValueOnce(response({ status: 'succeeded', result: { url: 'https://cdn.example.com/result.mp4' } }))
      .mockResolvedValueOnce(response({ cancelled: true }));
    const { input, references } = canonicalVideo();

    const result = await adapter.execute(input, references, { provider: 'custom', routeId: 'custom-video-v1' }, {
      fetch: fetchMock,
      credential: { referenceId: 'key-2', read: () => 'secret-video-key' },
      sleep: async () => undefined,
    });
    const canceled = await adapter.cancel({ providerId: 'custom-video', modelId: 'custom-video-v1', taskId: 'task-7' }, {
      fetch: fetchMock,
      credential: { referenceId: 'key-2', read: () => 'secret-video-key' },
    });

    expect(result.result).toEqual({ mediaUrl: 'https://cdn.example.com/result.mp4', mimeType: 'video/mp4', text: undefined });
    expect(canceled).toMatchObject({ canceled: true, reason: 'ok' });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      'https://video.example.com/api/jobs',
      'https://video.example.com/api/jobs/task-7',
      'https://video.example.com/api/jobs/task-7/cancel',
    ]);
  });

  it('enters the registered adapter from the canonical ignition path', async () => {
    registerUserScriptProvider({
      id: 'integrated-image',
      endpoint: 'https://integrated.example.com/api',
      capabilities: ['image-edit'],
      supportedReferenceKinds: ['image'],
      supportedReferenceRoles: ['reference'],
      maxReferences: { image: 1, video: 0, audio: 0 },
      auth: { header: 'Authorization' },
      request: {
        method: 'POST',
        path: '/generate',
        body: { prompt: { $path: 'input.prompt' }, refs: { $path: 'input.references' } },
      },
      response: { kind: 'image', base64Path: 'result.image' },
    });
    const fetchMock = vi.fn().mockResolvedValue(response({ result: { image: 'aW1hZ2U=' } }));
    globalThis.fetch = fetchMock;
    const { input, references } = canonicalImage();

    const result = await executeUnifiedIgnition({
      elementId: input.nodeId,
      prompt: input.prompt,
      modelId: 'integrated-image-v1',
      productModelId: 'flovart:gpt-image-2',
      generationCapability: 'image-edit',
      generationSubmode: 'image-to-image',
      apiKeyPayload: {
        id: 'custom-key',
        provider: 'custom',
        capabilities: ['image'],
        key: 'integration-secret',
        extraConfig: { providerScriptId: 'integrated-image' },
        createdAt: 0,
        updatedAt: 0,
      },
      references: references.map(reference => ({ type: 'image' as const, href: reference.href, mimeType: 'image/png', slotRole: 'reference_image' })),
      canonicalInput: input,
      materializedReferences: references,
    });

    expect(result).toMatchObject({ ok: true, capability: 'image', mimeType: 'image/png' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((JSON.parse(fetchMock.mock.calls[0][1].body as string) as { refs: unknown }).refs).toEqual([
      expect.objectContaining({ href: 'https://cdn.example.com/source.png' }),
    ]);
  });
});
