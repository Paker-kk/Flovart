import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowView } from '../dsh-plugin/src/client/WorkflowView';

const sessionId = 'deepseek-session' as Parameters<typeof WorkflowView>[0]['sessionId'];

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

function project(id = 'workflow-brief') {
  return {
    ok: true,
    result: {
      id,
      title: '海洋保护短片',
      nodes: [{
        id: 'brief-node',
        type: 'text',
        title: 'Production Brief',
        position: { x: 120, y: 120 },
        width: 320,
        height: 220,
        objectVersion: 1,
        metadata: { content: '制作一支 60 秒海洋保护短片' },
      }],
      connections: [],
      selectedNodeIds: [],
      viewport: { x: 80, y: 80, k: 1 },
      draftVersion: 2,
    },
  };
}

describe('DeepSeek Harness native Workflow view', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prepares the local workspace without exposing address or token fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0 });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [] } });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByRole('heading', { name: '先告诉 Flovart 这次要做什么' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Agent Runtime 地址')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('本机 Token')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Production Brief' })).toBeInTheDocument();
  });

  it('automatically reconnects while the owned Workspace Operator is restarting', async () => {
    let healthChecks = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') {
        healthChecks += 1;
        if (healthChecks === 1) return jsonResponse({ ok: false, error: { code: 'WORKSPACE_UNAVAILABLE', message: 'Workspace 正在重启' } }, 503);
        return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0 });
      }
      if (pathname === '/director/status') return jsonResponse({ ok: true, binding: null, projectId: null });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [] } });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace Operator 暂时不可用，正在自动恢复（1/3）');
    expect(await screen.findByRole('heading', { name: '先告诉 Flovart 这次要做什么' }, { timeout: 2_000 })).toBeInTheDocument();
    expect(healthChecks).toBe(2);
  });

  it('re-registers the native workspace when the operator restarts after the view is ready', async () => {
    let registrations = 0;
    let healthChecks = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') {
        registrations += 1;
        return jsonResponse({ ok: true });
      }
      if (pathname === '/health') {
        healthChecks += 1;
        return jsonResponse({ ok: true, nativeWorkspace: healthChecks === 2 ? false : true, clients: 0 });
      }
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [] } });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByRole('heading', { name: '先告诉 Flovart 这次要做什么' })).toBeInTheDocument();
    await waitFor(() => expect(registrations).toBe(2), { timeout: 5_000 });
    expect(healthChecks).toBeGreaterThanOrEqual(3);
  });

  it('keeps Flovart navigable when Runtime is offline and does not ask for a second Agent', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: false, error: 'Runtime offline' }, 503));
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByText('Flovart Runtime offline', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启动 / 重试 Runtime' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ask DSH Agent' })).toBeInTheDocument();
    expect(screen.getByText(/不会创建第二个 Agent。/)).toBeInTheDocument();
  });

  it('sends the current Workflow selection to the bound DSH Session', async () => {
    type PromptMessage = { type: string; text: string };
    type PromptResult = { ok: boolean; result: { accepted: boolean } };
    const prompt = vi.fn<(messages: PromptMessage[], mode: string) => Promise<PromptResult>>(
      async () => ({ ok: true, result: { accepted: true } }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0 });
      if (pathname === '/director/status') return jsonResponse({ ok: true, binding: null, projectId: null });
      if (pathname === '/director/bind') return jsonResponse({ ok: true, binding: { id: 'binding-1' } });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [{ id: 'workflow-brief', title: '海洋保护短片' }] } });
        if (body.command === 'workflow.inspect') return jsonResponse({ ok: true, result: project() });
        if (body.command === 'workflow.select') return jsonResponse({ ok: true, result: { ok: true, result: { selectedNodeIds: body.args.ids } } });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} session={{ prompt } as never} />);

    expect(await screen.findByText('Production Brief')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Production Brief'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask DSH Agent' }), { target: { value: '把这个节点改成夜景' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('"selectedNodeIds": [\n    "brief-node"\n  ]'),
      }),
    ], 'queue');
    expect(prompt.mock.calls[0]?.[0]?.[0]?.text).toContain('"projectId": "workflow-brief"');
    expect(prompt.mock.calls[0]?.[0]?.[0]?.text).toContain('把这个节点改成夜景');
  });

  it('creates and binds a brief-led project inside the session view', async () => {
    const commands: Array<{ command: string; args: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0 });
      if (pathname === '/director/bind') return jsonResponse({ ok: true, binding: { id: 'binding-1' } });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        commands.push(body);
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [] } });
        if (body.command === 'workflow.project.create') return jsonResponse({ ok: true, result: { ok: true, result: { projectId: 'workflow-brief' } } });
        if (body.command === 'workflow.node.create') return jsonResponse({ ok: true, result: { ok: true, result: { nodeId: 'brief-node' } } });
        if (body.command === 'workflow.inspect') return jsonResponse({ ok: true, result: project() });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);
    const brief = await screen.findByRole('textbox', { name: 'Production Brief' });
    fireEvent.change(brief, { target: { value: '制作一支 60 秒海洋保护短片' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并进入工作页' }));

    expect(await screen.findByText('Production Brief')).toBeInTheDocument();
    await waitFor(() => expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'workflow.project.create' }),
      expect.objectContaining({
        command: 'workflow.node.create',
        args: expect.objectContaining({
          projectId: 'workflow-brief',
          type: 'text',
          title: 'Production Brief',
          metadata: expect.objectContaining({ content: '制作一支 60 秒海洋保护短片' }),
        }),
      }),
    ])));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/flovart-workspace/director/bind', window.location.origin),
      expect.objectContaining({ body: expect.stringContaining('deepseek-session') }),
    );
  });

  it('requires an explicit visible Handoff before taking a project from another Harness Session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0, activeProjectId: 'workflow-brief' });
      if (pathname === '/director/status') return jsonResponse({ ok: true, binding: null, projectId: null });
      if (pathname === '/director/bind') return jsonResponse({
        ok: false,
        error: {
          code: 'BINDING_CONFLICT',
          message: '同一 ProductionSession 已绑定其他外部 Session；请先显式 Director Handoff。',
          retryable: false,
          details: { activeBindingId: 'binding-a', activeSessionId: 'session-a' },
        },
      }, 409);
      if (pathname === '/director/handoff') return jsonResponse({ ok: true, binding: { bindingId: 'binding-b' } });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({ ok: true, result: { ok: true, result: [{ id: 'workflow-brief', title: '海洋保护短片' }] } });
        if (body.command === 'workflow.inspect') return jsonResponse({ ok: true, result: project() });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('session-a');
    expect(screen.getByRole('alert')).toHaveTextContent('接管后，原 Session 将失去这个项目的 Director Binding');
    fireEvent.click(screen.getByRole('button', { name: '接管此项目' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('已绑定当前 Harness 会话')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/flovart-workspace/director/handoff', window.location.origin),
      expect.objectContaining({
        body: JSON.stringify({
          agentIdentity: 'deepseek-harness',
          sessionId: 'deepseek-session',
          projectId: 'workflow-brief',
          expectedBindingId: 'binding-a',
        }),
      }),
    );
  });

  it('restores the project already bound to this Harness Session after reload', async () => {
    const commands: Array<{ command: string; args: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0, activeProjectId: 'workflow-a' });
      if (pathname === '/director/status') return jsonResponse({
        ok: true,
        binding: { id: 'binding-b', host: 'deepseek', sessionId: 'deepseek-session', projectId: 'workflow-b' },
        projectId: 'workflow-b',
      });
      if (pathname === '/director/bind') return jsonResponse({ ok: true, binding: { id: 'unexpected-rebind' } });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        commands.push(body);
        if (body.command === 'workflow.project.list') return jsonResponse({
          ok: true,
          result: {
            ok: true,
            result: [
              { id: 'workflow-a', title: '项目 A' },
              { id: 'workflow-b', title: '项目 B' },
            ],
          },
        });
        if (body.command === 'workflow.inspect') return jsonResponse({ ok: true, result: project(String(body.args?.projectId || 'workflow-a')) });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);

    expect(await screen.findByRole('combobox', { name: '选择 Workflow 项目' })).toHaveValue('workflow-b');
    expect(screen.getByText('已绑定当前 Harness 会话')).toBeInTheDocument();
    expect(commands).toContainEqual(expect.objectContaining({
      command: 'workflow.inspect',
      args: { projectId: 'workflow-b', workspaceMode: 'native' },
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/flovart-workspace/director/status?agentIdentity=deepseek-harness&sessionId=deepseek-session', window.location.origin),
      expect.any(Object),
    );
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith('/director/bind'))).toBe(false);
  });

  it('makes switching the current Harness Session to another project an explicit Handoff', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const pathname = url.pathname.replace(/^\/flovart-workspace/, '');
      if (pathname === '/workflow/native/register') return jsonResponse({ ok: true });
      if (pathname === '/health') return jsonResponse({ ok: true, nativeWorkspace: true, clients: 0, activeProjectId: 'workflow-a' });
      if (pathname === '/director/status') return jsonResponse({
        ok: true,
        binding: { id: 'binding-a', host: 'deepseek', sessionId: 'deepseek-session', projectId: 'workflow-a' },
        projectId: 'workflow-a',
      });
      if (pathname === '/director/bind') return jsonResponse({
        ok: false,
        error: {
          code: 'BINDING_CONFLICT',
          message: '当前 Session 已绑定其他项目；请先显式 Director Handoff。',
          retryable: false,
          details: { activeBindingId: 'binding-a', activeSessionId: 'deepseek-session', activeProjectId: 'workflow-a' },
        },
      }, 409);
      if (pathname === '/director/handoff') return jsonResponse({ ok: true, binding: { bindingId: 'binding-b' } });
      if (pathname === '/api/tools') {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.command === 'workflow.project.list') return jsonResponse({
          ok: true,
          result: { ok: true, result: [{ id: 'workflow-a', title: '项目 A' }, { id: 'workflow-b', title: '项目 B' }] },
        });
        if (body.command === 'workflow.project.use') return jsonResponse({ ok: true, result: { ok: true, result: { projectId: body.args.projectId } } });
        if (body.command === 'workflow.inspect') return jsonResponse({ ok: true, result: project(String(body.args?.projectId || 'workflow-a')) });
      }
      return jsonResponse({ ok: false, error: 'unexpected request' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowView sessionId={sessionId} />);
    const selector = await screen.findByRole('combobox', { name: '选择 Workflow 项目' });
    fireEvent.change(selector, { target: { value: 'workflow-b' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('workflow-a');
    expect(screen.getByRole('alert')).toHaveTextContent('切换后，原项目将失去这个 Harness Session 的 Director Binding');
    fireEvent.click(screen.getByRole('button', { name: '接管此项目' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: '选择 Workflow 项目' })).toHaveValue('workflow-b');
    expect(screen.getByText('已绑定当前 Harness 会话')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/flovart-workspace/director/handoff', window.location.origin),
      expect.objectContaining({
        body: JSON.stringify({
          agentIdentity: 'deepseek-harness',
          sessionId: 'deepseek-session',
          projectId: 'workflow-b',
          expectedBindingId: 'binding-a',
        }),
      }),
    );
  });
});
