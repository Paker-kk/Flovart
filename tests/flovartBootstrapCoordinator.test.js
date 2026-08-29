import { describe, expect, it, vi } from 'vitest';
import { FlovartBootstrapCoordinator } from '../tools/flovart/bootstrap-coordinator.js';

describe('Flovart bootstrap coordinator', () => {
  it('coordinates agent, dynamic WebUI, browser open, and connected readiness', async () => {
    const openBrowser = vi.fn();
    const inspectAgent = vi.fn()
      .mockResolvedValueOnce({
        state: 'ready',
        health: { clients: 1, hasWorkflow: true, clientId: 'browser-1', activeWriter: { clientId: 'browser-1' }, activeProjectId: 'project-1', revision: 3 },
      })
      .mockResolvedValue({
        state: 'ready',
        health: { clients: 2, hasWorkflow: true, clientId: 'browser-2', activeWriter: { clientId: 'browser-2' }, activeProjectId: 'project-1', revision: 3 },
      });
    const coordinator = new FlovartBootstrapCoordinator({
      inspectAgent,
      waitForWeb: vi.fn().mockResolvedValue('http://127.0.0.1:43127'),
      buildBootstrapUrl: vi.fn().mockReturnValue('http://127.0.0.1:43127/?bootstrap=internal#/app'),
      openBrowser,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(coordinator.start({
      ensureAgent: async () => ({ url: 'http://127.0.0.1:17373', token: 'internal', state: 'ready', managed: false }),
      launchWeb: async () => ({ getUrl: () => 'http://127.0.0.1:43127' }),
      open: true,
    })).resolves.toMatchObject({
      ok: true,
      runtime: { status: 'ready', surface: 'browser-workflow' },
      frontend: { status: 'ready', url: 'http://127.0.0.1:43127' },
      browser: { status: 'connected', clientId: 'browser-2', projectId: 'project-1', revision: 3 },
      browserOpened: true,
    });
    expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:43127/?bootstrap=internal#/app');
  });

  it('does not report an old Browser Writer as the page opened by this start command', async () => {
    const inspectAgent = vi.fn()
      .mockResolvedValueOnce({ state: 'ready', health: { clients: 1, hasWorkflow: true, clientId: 'old-browser', activeWriter: { clientId: 'old-browser' } } })
      .mockResolvedValue({ state: 'ready', health: { clients: 1, hasWorkflow: true, clientId: 'old-browser', activeWriter: { clientId: 'old-browser' } } });
    const coordinator = new FlovartBootstrapCoordinator({
      inspectAgent,
      waitForWeb: vi.fn().mockResolvedValue('http://127.0.0.1:43127'),
      openBrowser: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await expect(coordinator.start({
      ensureAgent: async () => ({ url: 'http://127.0.0.1:17373', token: 'internal', state: 'ready', managed: false }),
      launchWeb: async () => 'http://127.0.0.1:43127',
      open: true,
      timeoutMs: 0,
    })).resolves.toMatchObject({ ok: false, browser: { status: 'offline', connected: false } });
  });

  it('reports a concrete browser-unavailable state without claiming ready', async () => {
    const coordinator = new FlovartBootstrapCoordinator({
      inspectAgent: vi.fn().mockResolvedValue({ state: 'ready', health: { clients: 0, hasWorkflow: false } }),
      waitForWeb: vi.fn().mockResolvedValue('http://127.0.0.1:43127'),
      openBrowser: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(coordinator.start({
      ensureAgent: async () => ({ url: 'http://127.0.0.1:17373', token: 'internal', state: 'ready', managed: false }),
      launchWeb: async () => 'http://127.0.0.1:43127',
      open: true,
      timeoutMs: 0,
    })).resolves.toMatchObject({ ok: false, browser: { status: 'offline', connected: false } });
  });

  it('keeps an explicit no-Agent diagnostic start usable as a plain WebUI launch', async () => {
    const openBrowser = vi.fn();
    const coordinator = new FlovartBootstrapCoordinator({
      waitForWeb: vi.fn().mockResolvedValue('http://127.0.0.1:43127'),
      openBrowser,
    });

    await expect(coordinator.start({
      launchWeb: async () => 'http://127.0.0.1:43127',
      open: true,
      timeoutMs: 0,
    })).resolves.toMatchObject({
      ok: false,
      frontend: { status: 'ready', url: 'http://127.0.0.1:43127' },
      browser: { status: 'offline', connected: false },
      browserOpened: true,
    });
    expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:43127/#/app');
  });

  it('returns machine-readable startup errors instead of throwing from a failed service', async () => {
    const coordinator = new FlovartBootstrapCoordinator();
    await expect(coordinator.start({
      ensureAgent: async () => { throw new Error('agent failed'); },
      launchWeb: async () => { throw new Error('web failed'); },
      open: true,
    })).resolves.toMatchObject({
      ok: false,
      agent: { status: 'offline', error: 'agent failed' },
      frontend: { status: 'offline', error: 'web failed' },
    });
  });
});
