import { describe, expect, it } from 'vitest';
import { buildSupportDiagnostics, serializeSupportDiagnostics } from '../services/supportDiagnostics';

describe('support diagnostics', () => {
  it('keeps support fields useful while removing connection secrets and query material', () => {
    const serialized = serializeSupportDiagnostics({
      appVersion: '0.3.2',
      connectionUrl: 'http://127.0.0.1:17373/?bootstrapToken=raw-secret',
      connectionStatus: 'ready',
      connectionErrorCode: 'DOCK_TIMEOUT',
      clientId: 'client-1',
      projectId: 'project-1',
      revision: 7,
      activeHostIdentity: 'codex',
      writerStatus: 'active',
      project: { id: 'project-1', draftVersion: 8 },
      providerStatus: 'ready',
    });

    expect(serialized).toContain('0.3.2');
    expect(serialized).toContain('project-1');
    expect(serialized).toContain('DOCK_TIMEOUT');
    expect(serialized).toContain('http://127.0.0.1:17373');
    expect(serialized).not.toContain('raw-secret');
    expect(serialized).not.toMatch(/bootstrapToken|apiKey|authorization|credential/i);
  });

  it('redacts non-loopback endpoints and keeps empty state explicit', () => {
    expect(buildSupportDiagnostics({ connectionUrl: 'https://example.com/agent?token=secret', connectionStatus: 'offline' })).toMatchObject({
      runtime: { status: 'offline', endpoint: 'redacted' },
      project: { id: null, revision: null, draftVersion: null },
    });
  });
});
