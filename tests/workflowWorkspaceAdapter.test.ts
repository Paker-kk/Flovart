import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBrowserWorkflowBinding } from '../services/browserWorkflowBinding';
import { agentBootstrapStorageKeys } from '../services/agentConnectionBootstrap';
import { useWorkflowWorkspaceAdapter } from '../components/workflow/useWorkflowWorkspaceAdapter';
import { WorkflowWorkspaceAdapter } from '../services/workflowWorkspaceAdapter';
import { useAgentConnectionStore } from '../stores/useAgentConnectionStore';

afterEach(() => {
  sessionStorage.removeItem(agentBootstrapStorageKeys.autoActivate);
  setBrowserWorkflowBinding(null);
  useAgentConnectionStore.getState().reset();
});

describe('visible Workflow Workspace Adapter', () => {
  it('connects from desktop discovery and publishes the latest project without opening Agent UI', async () => {
    let onStatus: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | undefined;
    const connect = vi.fn();
    const disconnect = vi.fn();
    const pushSnapshot = vi.fn().mockResolvedValue({ ok: true });
    const adapter = new WorkflowWorkspaceAdapter({
      discover: vi.fn().mockResolvedValue({
        state: 'ready',
        url: 'http://127.0.0.1:17372',
        token: 'desktop-only-token',
        managed: true,
      }),
      createBridge: options => {
        onStatus = options.onStatus;
        return { connect, disconnect, pushSnapshot };
      },
    });

    await expect(adapter.start({ id: 'project-1', nodes: [] })).resolves.toBe('connecting');
    expect(connect).toHaveBeenCalledOnce();

    adapter.update({ id: 'project-1', nodes: [{ id: 'node-1' }] });
    onStatus?.('connected');
    await vi.waitFor(() => expect(pushSnapshot).toHaveBeenCalledWith({
      id: 'project-1',
      nodes: [{ id: 'node-1' }],
    }));

    adapter.stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps one browser connection while the active project changes', async () => {
    const adapter = {
      start: vi.fn().mockResolvedValue('connecting'),
      update: vi.fn(),
      stop: vi.fn(),
    };
    const createAdapter = vi.fn(() => adapter);
    const { rerender, unmount } = renderHook(
      ({ project }) => useWorkflowWorkspaceAdapter(project as any, createAdapter),
      { initialProps: { project: null as any } },
    );

    expect(createAdapter).toHaveBeenCalledOnce();
    expect(adapter.start).toHaveBeenCalledWith(expect.objectContaining({ id: null }));

    rerender({ project: { id: 'project-1', nodes: [] } });
    rerender({ project: { id: 'project-2', nodes: [] } });

    expect(createAdapter).toHaveBeenCalledOnce();
    expect(adapter.start).toHaveBeenCalledOnce();
    expect(adapter.update).toHaveBeenLastCalledWith({ id: 'project-2', nodes: [] });

    unmount();
    expect(adapter.stop).toHaveBeenCalledOnce();
  });

  it('surfaces Active Writer changes without silently taking over another tab', async () => {
    let onStatus: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | undefined;
    let onEvent: ((type: string, payload: any) => void) | undefined;
    const adapter = new WorkflowWorkspaceAdapter({
      discover: vi.fn().mockResolvedValue({ state: 'ready', url: 'http://127.0.0.1:17372', token: 'browser-token', managed: false }),
      createBridge: options => {
        onStatus = options.onStatus;
        onEvent = options.onEvent;
        return { connect: vi.fn(), disconnect: vi.fn(), pushSnapshot: vi.fn().mockResolvedValue({ ok: true }), getClientId: () => 'browser-1' };
      },
    });

    await adapter.start({ id: 'project-1', revision: 1 });
    onStatus?.('connected');
    onEvent?.('writer_changed', { clientId: 'browser-1', projectId: 'project-1' });
    expect(useAgentConnectionStore.getState()).toMatchObject({ writerStatus: 'active', writerClientId: 'browser-1', writerProjectId: 'project-1' });

    onEvent?.('writer_unavailable', { clientId: 'browser-1', projectId: 'project-1' });
    expect(useAgentConnectionStore.getState()).toMatchObject({ writerStatus: 'revoked', writerClientId: null, writerProjectId: 'project-1' });
    adapter.stop();
  });

  it('activates the launcher-opened Browser Writer after its first visible snapshot', async () => {
    sessionStorage.setItem(agentBootstrapStorageKeys.autoActivate, '1');
    let onStatus: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | undefined;
    const pushSnapshot = vi.fn().mockResolvedValue({ ok: true });
    const activateWriter = vi.fn().mockResolvedValue({ ok: true });
    const adapter = new WorkflowWorkspaceAdapter({
      discover: vi.fn().mockResolvedValue({ state: 'ready', url: 'http://127.0.0.1:17372', token: 'browser-token', managed: false }),
      createBridge: options => {
        onStatus = options.onStatus;
        return { connect: vi.fn(), disconnect: vi.fn(), pushSnapshot, activateWriter };
      },
    });

    await adapter.start({ id: 'project-1', revision: 2 });
    onStatus?.('connected');
    await vi.waitFor(() => expect(activateWriter).toHaveBeenCalledWith('project-1'));
    expect(pushSnapshot).toHaveBeenCalledWith({ id: 'project-1', revision: 2 });
    expect(activateWriter).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(agentBootstrapStorageKeys.autoActivate)).toBeNull();
    adapter.update({ id: 'project-1', revision: 3 });
    await vi.waitFor(() => expect(pushSnapshot).toHaveBeenCalledWith({ id: 'project-1', revision: 3 }));
    expect(activateWriter).toHaveBeenCalledOnce();
    adapter.stop();
  });

  it('reconnects the visible Workflow after the browser receives an explicit Agent binding', async () => {
    const adapter = {
      start: vi.fn().mockResolvedValue('unavailable'),
      update: vi.fn(),
      stop: vi.fn(),
    };
    const { unmount } = renderHook(() => useWorkflowWorkspaceAdapter({ id: 'project-1', nodes: [] } as any, () => adapter));

    expect(adapter.start).toHaveBeenCalledOnce();
    act(() => setBrowserWorkflowBinding({ state: 'ready', url: 'http://127.0.0.1:17372', token: 'browser-token', managed: false }));

    await vi.waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(2));
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.start).toHaveBeenLastCalledWith({ id: 'project-1', nodes: [] });
    unmount();
  });

  it('serializes snapshot writes and publishes only the newest pending project', async () => {
    let onStatus: ((status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) | undefined;
    let releaseFirst: (() => void) | undefined;
    const pushSnapshot = vi.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirst = resolve; }))
      .mockResolvedValue({ ok: true });
    const adapter = new WorkflowWorkspaceAdapter({
      discover: vi.fn().mockResolvedValue({
        state: 'ready',
        url: 'http://127.0.0.1:17372',
        token: 'desktop-only-token',
        managed: true,
      }),
      createBridge: options => {
        onStatus = options.onStatus;
        return { connect: vi.fn(), disconnect: vi.fn(), pushSnapshot };
      },
    });

    await adapter.start({ id: 'project-1', revision: 1 });
    onStatus?.('connected');
    adapter.update({ id: 'project-1', revision: 2 });
    adapter.update({ id: 'project-1', revision: 3 });

    expect(pushSnapshot).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await vi.waitFor(() => expect(pushSnapshot).toHaveBeenCalledTimes(2));
    expect(pushSnapshot).toHaveBeenLastCalledWith({ id: 'project-1', revision: 3 });
  });

  it('does not create a ghost bridge when stopped during desktop discovery', async () => {
    let finishDiscovery: ((connection: any) => void) | undefined;
    const createBridge = vi.fn();
    const adapter = new WorkflowWorkspaceAdapter({
      discover: () => new Promise(resolve => { finishDiscovery = resolve; }),
      createBridge,
    });

    const starting = adapter.start({ id: null });
    adapter.stop();
    finishDiscovery?.({
      state: 'ready',
      url: 'http://127.0.0.1:17372',
      token: 'desktop-only-token',
      managed: true,
    });

    await expect(starting).resolves.toBe('disconnected');
    expect(createBridge).not.toHaveBeenCalled();
  });
});
