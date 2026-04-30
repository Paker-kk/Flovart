import { describe, expect, it, vi, afterEach } from 'vitest';

import { AgentOrchestrator, createSession } from '../services/agentOrchestrator';
import type { UserApiKey } from '../types';

describe('AgentOrchestrator provider routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes discussion agents through unified provider config and model mappings', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ content: [{ text: '[FINAL_PROMPT]agent answer[/FINAL_PROMPT]' }] }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const customAnthropicKey: UserApiKey = {
      id: 'key_1',
      provider: 'custom',
      capabilities: ['text'],
      key: 'secret-key',
      baseUrl: 'https://anthropic-proxy.example.com/v1',
      models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet' }],
      extraConfig: {
        requestFormat: 'anthropic',
        authHeaderName: 'x-api-key',
        authScheme: '',
        modelMappingsJson: '{"claude-sonnet-4-6":"vendor-claude"}',
      },
      createdAt: 0,
      updatedAt: 0,
    };

    const session = createSession(
      'Make a poster prompt',
      [{ id: 'agent-1', roleId: 'quality_reviewer', enabled: true, model: 'claude-sonnet-4-6' }],
      { maxCost: 1, currentCost: 0, maxRounds: 1 },
    );
    const onFinalPrompt = vi.fn();

    const orchestrator = new AgentOrchestrator(session, {
      onMessage: vi.fn(),
      onStatusChange: vi.fn(),
      onRoundChange: vi.fn(),
      onFinalPrompt,
      onError: vi.fn(),
      onBudgetUpdate: vi.fn(),
      getApiKeyForModel: () => customAnthropicKey,
    }, 'claude-sonnet-4-6');

    await orchestrator.run();

    expect(onFinalPrompt).toHaveBeenCalledWith('agent answer');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://anthropic-proxy.example.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'secret-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      model: 'vendor-claude',
    }));
  });
});
