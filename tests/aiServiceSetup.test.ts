import { describe, expect, it } from 'vitest';
import type { UserApiKey } from '../types';
import { mergeSuggestedProductRouteMappings } from '../services/aiServiceSetup';

describe('AI service first-run setup', () => {
  it('turns discovered OpenAI-compatible image models into ready product routes', () => {
    const key: UserApiKey = {
      id: 'fake-service',
      provider: 'custom',
      capabilities: ['image'],
      key: 'fake-key',
      baseUrl: 'http://127.0.0.1:43123/v1',
      models: [{ id: 'gpt-image-2', name: 'GPT Image 2', capability: 'image' }],
      createdAt: 1,
      updatedAt: 1,
    };

    const prepared = mergeSuggestedProductRouteMappings(key);

    expect(prepared.routeMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ routeId: 'gpt-image-2', target: { kind: 'product-mode', productModelId: 'flovart:gpt-image-2', mode: 'text-to-image' } }),
      expect.objectContaining({ routeId: 'gpt-image-2', target: { kind: 'product-mode', productModelId: 'flovart:gpt-image-2', mode: 'image-to-image' } }),
    ]));
  });
});
