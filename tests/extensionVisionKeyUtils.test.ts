import { describe, expect, it } from 'vitest';

import {
  buildVisionApiPlan,
  pickConfiguredModel,
} from '../extension/shared/vision-key-utils.js';

describe('extension vision key utils', () => {
  it('picks string model ids from structured model entries instead of serializing objects', () => {
    const model = pickConfiguredModel({
      provider: 'custom',
      defaultModel: '',
      models: [{ id: 'third-party-vision', name: 'Third Party Vision' }],
      customModels: ['fallback-model'],
    });

    expect(model).toBe('third-party-vision');
  });

  it('prefers defaultModel before fetched and custom model lists', () => {
    const model = pickConfiguredModel({
      provider: 'openai',
      defaultModel: 'gpt-4o-mini',
      models: [{ id: 'gpt-image-1', name: 'GPT Image' }],
      customModels: ['other-model'],
    });

    expect(model).toBe('gpt-4o-mini');
  });

  it('builds native Anthropic plans instead of treating Claude as OpenAI-compatible', () => {
    const plan = buildVisionApiPlan({
      provider: 'anthropic',
      key: 'sk-ant-test',
      models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet' }],
    });

    expect(plan.kind).toBe('anthropic');
    expect(plan.model).toBe('claude-sonnet-4-6');
    expect(plan.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('normalizes custom bare domains to OpenAI-compatible /v1 endpoints', () => {
    const plan = buildVisionApiPlan({
      provider: 'custom',
      key: 'sk-test',
      baseUrl: 'https://gateway.example.com',
      models: [{ id: 'third-party-vision', name: 'Third Party Vision' }],
    });

    expect(plan.kind).toBe('openai-compatible');
    expect(plan.baseUrl).toBe('https://gateway.example.com/v1');
    expect(plan.model).toBe('third-party-vision');
  });

  it('applies custom auth headers and model mappings for extension vision calls', () => {
    const plan = buildVisionApiPlan({
      provider: 'custom',
      key: 'secret-key',
      baseUrl: 'https://gateway.example.com',
      models: [{ id: 'third-party-vision', name: 'Third Party Vision' }],
      extraConfig: {
        authHeaderName: 'x-api-key',
        authScheme: '',
        modelMappingsJson: '{"third-party-vision":"vendor-vision"}',
      },
    });

    expect(plan.model).toBe('vendor-vision');
    expect(plan.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'secret-key',
    });
  });
});
