import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBrowserWorkflowBinding } from '../services/browserWorkflowBinding';
import { getManagedAgentConnection } from '../services/managedAgentConnection';

describe('managed Agent desktop connection', () => {
  afterEach(() => setBrowserWorkflowBinding(null));

  it('discovers a loopback connection through Tauri IPC without browser storage', async () => {
    const invoke = vi.fn().mockResolvedValue({
      state: 'ready',
      url: 'http://127.0.0.1:17372',
      token: 'desktop-only-token',
      managed: true,
    });

    await expect(getManagedAgentConnection({ isTauri: true, invoke })).resolves.toEqual({
      state: 'ready',
      url: 'http://127.0.0.1:17372',
      token: 'desktop-only-token',
      managed: true,
    });
    expect(invoke).toHaveBeenCalledWith('managed_agent_connection');
  });

  it('uses an explicit browser binding and rejects non-loopback endpoints', async () => {
    const invoke = vi.fn();
    await expect(getManagedAgentConnection({ isTauri: false, invoke })).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();

    setBrowserWorkflowBinding({ state: 'ready', url: 'http://127.0.0.1:17372', token: 'browser-token', managed: false });
    await expect(getManagedAgentConnection({ isTauri: false, invoke })).resolves.toMatchObject({
      url: 'http://127.0.0.1:17372',
      token: 'browser-token',
      managed: false,
    });
    expect(invoke).not.toHaveBeenCalled();

    invoke.mockResolvedValue({
      state: 'ready',
      url: 'https://example.com',
      token: 'unsafe-token',
      managed: false,
    });
    await expect(getManagedAgentConnection({ isTauri: true, invoke })).rejects.toThrow('loopback');
  });
});
