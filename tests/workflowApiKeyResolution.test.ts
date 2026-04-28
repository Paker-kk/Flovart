import { describe, expect, it } from 'vitest';
import { resolveNodeApiKey } from '../services/workflowEngine';
import type { UserApiKey } from '../types';

const makeKey = (overrides: Partial<UserApiKey>): UserApiKey => ({
  id: 'key-id',
  provider: 'google',
  capabilities: ['text'],
  key: 'secret',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('resolveNodeApiKey', () => {
  it('prefers explicit node apiKeyRef over provider and global defaults', () => {
    const apiKeys: UserApiKey[] = [
      makeKey({ id: 'google-default', provider: 'google', isDefault: true, key: 'google-key' }),
      makeKey({ id: 'openai-node', provider: 'openai', key: 'openai-key' }),
      makeKey({ id: 'workspace-default', provider: 'anthropic', isDefault: true, key: 'workspace-key' }),
    ];

    const resolved = resolveNodeApiKey(apiKeys, { apiKeyRef: 'openai-node' }, 'google', 'openai');

    expect(resolved?.id).toBe('openai-node');
  });

  it('prefers a provider-matching key before falling back to the workspace default', () => {
    const apiKeys: UserApiKey[] = [
      makeKey({ id: 'workspace-default', provider: 'anthropic', isDefault: true, key: 'workspace-key' }),
      makeKey({ id: 'google-key', provider: 'google', key: 'google-key' }),
    ];

    const resolved = resolveNodeApiKey(apiKeys, undefined, 'google', 'openai');

    expect(resolved?.id).toBe('google-key');
  });

  it('falls back to the workspace default when no provider key is available', () => {
    const apiKeys: UserApiKey[] = [
      makeKey({ id: 'workspace-default', provider: 'anthropic', isDefault: true, key: 'workspace-key' }),
    ];

    const resolved = resolveNodeApiKey(apiKeys, undefined, 'google', 'openai');

    expect(resolved?.id).toBe('workspace-default');
  });

  it('skips keys marked as error so failed providers do not keep rotating in', () => {
    const apiKeys: UserApiKey[] = [
      makeKey({ id: 'bad-default', provider: 'google', isDefault: true, key: 'bad-key', status: 'error' }),
      makeKey({ id: 'good-google', provider: 'google', key: 'good-key', status: 'ok' }),
    ];

    const resolved = resolveNodeApiKey(apiKeys, undefined, 'google');

    expect(resolved?.id).toBe('good-google');
  });

  it('does not resolve an explicit key binding when that key is marked as error', () => {
    const apiKeys: UserApiKey[] = [
      makeKey({ id: 'bad-bound', provider: 'google', key: 'bad-key', status: 'error' }),
      makeKey({ id: 'good-google', provider: 'google', key: 'good-key', status: 'ok' }),
    ];

    const resolved = resolveNodeApiKey(apiKeys, { apiKeyRef: 'bad-bound' }, 'google');

    expect(resolved).toBeUndefined();
  });
});
