import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NativeWorkflowStore } from '../agent/native-workspace.js';
import { WorkflowAgentSession } from '../agent/session.js';

describe('workflow agent session', () => {
  it('does not silently activate the native workspace when no browser is connected', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flovart-session-native-'));
    try {
      const session = new WorkflowAgentSession({ timeoutMs: 10, nativeWorkspace: new NativeWorkflowStore({ file: join(directory, 'workflow.json') }) });
      expect(session.health()).toMatchObject({ nativeWorkspace: false, hasWorkflow: false });
      await expect(session.callCommand('workflow.project.create', { title: '原生工作区测试' }, 'mcp')).rejects.toThrow('没有已连接并同步项目');
      expect(session.health()).toMatchObject({ nativeWorkspace: false, hasWorkflow: false });

      session.activateNativeWorkspace();
      const created = await session.callCommand('workflow.project.create', { workspaceMode: 'native', title: '原生工作区测试' }, 'mcp');
      expect(session.health()).toMatchObject({ nativeWorkspace: true, hasWorkflow: true });
      const result = await session.callCommand('workflow.inspect', { workspaceMode: 'native', projectId: created.result.projectId }, 'mcp');
      expect(result.ok).toBe(true);
      expect(session.health()).toMatchObject({ nativeWorkspace: true, hasWorkflow: true });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('redacts secrets from pushed workflow snapshots', () => {
    const session = new WorkflowAgentSession();
    session.updateSnapshot({ nodes: [{ metadata: { href: 'data:image/png;base64,SECRET' } }] });
    expect(JSON.stringify(session.health())).not.toContain('SECRET');
  });

  it('cleans pending calls when the owning browser disconnects', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 1000 });
    let close;
    const response = { writeHead() {}, write() {}, on(event, listener) { if (event === 'close') close = listener; } };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: 'project-1' }, 'browser-1');
    const call = session.callCommand('workflow.inspect');
    close();
    await expect(call).rejects.toThrow('连接已断开');
  });

  it('routes commands only to the browser that owns the latest Workflow snapshot', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 1000 });
    let event = '';
    const response = { writeHead() {}, write(value) { event += value; }, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: 'project-1' }, 'browser-1');

    const call = session.callCommand('workflow.node.move', { nodeId: 'node-1', x: 10, y: 20 }, 'cli', 'move-node-1');
    const payload = JSON.parse(event.match(/event: tool_call\ndata: (.+)\n\n/)?.[1] || '{}');
    session.resolveResult({ requestId: payload.requestId, clientId: 'browser-1', result: { ok: true } });

    await expect(call).resolves.toEqual({ ok: true });
    expect(payload.envelope).toMatchObject({
      command: 'workflow.node.move',
      source: 'cli',
      idempotencyKey: 'move-node-1',
    });
    expect(session.health()).toMatchObject({ hasWorkflow: true, activeProjectId: 'project-1', clientId: 'browser-1' });
  });

  it('keeps the active writer snapshot current as the browser project changes', () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    const response = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: null, draftVersion: 0 }, 'browser-1');
    session.updateSnapshot({ id: 'project-1', draftVersion: 2 }, 'browser-1');

    expect(session.health()).toMatchObject({ activeProjectId: 'project-1', revision: 2, activeWriter: { projectId: 'project-1' } });
  });

  it('never falls back a browser-bound mutation into an active native workspace', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flovart-session-binding-'));
    try {
      const nativeWorkspace = new NativeWorkflowStore({ file: join(directory, 'workflow.json') });
      const session = new WorkflowAgentSession({ timeoutMs: 10, nativeWorkspace });
      session.activateNativeWorkspace();

      await expect(session.callCommand('workflow.apply', {
        workspaceMode: 'browser',
        clientId: 'missing-browser',
        projectId: 'browser-project',
        expectedRevision: 1,
        mutationId: 'browser-only',
        operations: [],
      }, 'cli')).rejects.toThrow('没有已连接并同步项目');
      await expect(session.callCommand('workflow.project.create', { title: 'Agent 不得进入 Native' }, 'agent')).rejects.toThrow('没有已连接并同步项目');
      expect(nativeWorkspace.state().projects).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prefers a connected Browser workspace unless Native mode is explicit', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flovart-session-authority-'));
    try {
      const nativeWorkspace = new NativeWorkflowStore({ file: join(directory, 'workflow.json') });
      const session = new WorkflowAgentSession({ timeoutMs: 1000, nativeWorkspace });
      session.activateNativeWorkspace();
      let events = '';
      const response = { writeHead() {}, write(value) { events += value; }, on() {} };
      session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
      session.updateSnapshot({ id: 'browser-project', draftVersion: 1 }, 'browser-1');

      const browserCall = session.callCommand('workflow.project.list', {}, 'cli', 'browser-list');
      const browserPayload = JSON.parse(events.match(/event: tool_call\ndata: (.+)\n\n/)?.[1] || '{}');
      session.resolveResult({ requestId: browserPayload.requestId, clientId: 'browser-1', result: { ok: true, result: [] } });
      await expect(browserCall).resolves.toMatchObject({ ok: true });
      expect(nativeWorkspace.state().projects).toEqual([]);

      const nativeResult = await session.callCommand('workflow.project.create', { workspaceMode: 'native', title: '显式原生' }, 'operator', 'native-create');
      expect(nativeResult.ok).toBe(true);
      expect(nativeWorkspace.state().projects).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('never selects Native for a non-explicit workspace mode', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flovart-session-explicit-native-'));
    try {
      const nativeWorkspace = new NativeWorkflowStore({ file: join(directory, 'workflow.json') });
      const session = new WorkflowAgentSession({ timeoutMs: 10, nativeWorkspace });
      session.activateNativeWorkspace();
      await expect(session.callCommand('workflow.project.create', { title: '不得隐式原生' }, 'cli')).rejects.toThrow('没有已连接并同步项目');
      expect(nativeWorkspace.state().projects).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps explicit multi-tab clientId mutations on their owning browser', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 1000 });
    let firstEvents = '';
    let secondEvents = '';
    const first = { writeHead() {}, write(value) { firstEvents += value; }, on() {} };
    const second = { writeHead() {}, write(value) { secondEvents += value; }, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), first);
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-2'), second);
    session.updateSnapshot({ id: 'project-1' }, 'browser-1');
    session.updateSnapshot({ id: 'project-2' }, 'browser-2');

    const call = session.callCommand('workflow.apply', {
      workspaceMode: 'browser', clientId: 'browser-1', projectId: 'project-1',
      expectedRevision: 1, mutationId: 'tab-1', operations: [],
    }, 'cli');
    const payload = JSON.parse(firstEvents.match(/event: tool_call\ndata: (.+)\n\n/)?.[1] || '{}');
    session.resolveResult({ requestId: payload.requestId, clientId: 'browser-1', result: { ok: true } });

    await expect(call).resolves.toEqual({ ok: true });
    expect(payload.envelope.args.clientId).toBe('browser-1');
    expect(secondEvents).not.toContain('tool_call');
  });

  it('locks tagged external CLI calls to one Host until an explicit switch', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 1000 });
    let events = '';
    const response = { writeHead() {}, write(value) { events += value; }, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: 'project-1', draftVersion: 1 }, 'browser-1');

    const inspectFor = async (agentIdentity, idempotencyKey) => {
      const call = session.callCommand('workflow.inspect', { projectId: 'project-1' }, 'cli', idempotencyKey, undefined, { agentIdentity });
      const calls = [...events.matchAll(/event: tool_call\ndata: (.+)\n\n/g)];
      const payload = JSON.parse(calls.at(-1)?.[1] || '{}');
      session.resolveResult({ requestId: payload.requestId, clientId: 'browser-1', result: { ok: true } });
      return call;
    };

    await expect(inspectFor('codex', 'codex-inspect')).resolves.toMatchObject({ ok: true });
    expect(session.health()).toMatchObject({ activeHostWriter: { agentIdentity: 'codex', projectId: 'project-1' } });
    await expect(inspectFor('claude-code', 'claude-inspect')).rejects.toMatchObject({ code: 'AGENT_WRITER_INACTIVE' });

    expect(session.activateAgentHost({ agentIdentity: 'claude-code', projectId: 'project-1' })).toMatchObject({
      switched: true,
      activeHostWriter: { agentIdentity: 'claude-code', projectId: 'project-1' },
    });
    await expect(inspectFor('claude-code', 'claude-inspect-v2')).resolves.toMatchObject({ ok: true });
    await expect(session.callCommand('workflow.inspect', { projectId: 'project-1' }, 'cli', 'anonymous-inspect')).rejects.toMatchObject({ code: 'AGENT_HOST_REQUIRED' });
  });

  it('does not let an inactive Browser tab switch the Host writer project', () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    const first = { writeHead() {}, write() {}, on() {} };
    const second = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), first);
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-2'), second);
    session.updateSnapshot({ id: 'project-1', draftVersion: 1 }, 'browser-1');
    session.updateSnapshot({ id: 'project-2', draftVersion: 1 }, 'browser-2');
    session.activateAgentHost({ agentIdentity: 'codex', projectId: 'project-1' });

    expect(() => session.activateAgentHost({ agentIdentity: 'claude-code', projectId: 'project-2' }))
      .toThrow('当前 Browser Writer 没有激活这个 Workflow 项目');
    expect(session.health()).toMatchObject({ activeHostWriter: { agentIdentity: 'codex', projectId: 'project-1' } });
  });

  it('does not let a second browser tab silently become the Active Writer', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    const first = { writeHead() {}, write() {}, on() {} };
    const second = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), first);
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-2'), second);
    session.updateSnapshot({ id: 'project-1', draftVersion: 1 }, 'browser-1');
    session.updateSnapshot({ id: 'project-2', draftVersion: 1 }, 'browser-2');

    expect(session.health()).toMatchObject({ clientId: 'browser-1', activeWriter: { clientId: 'browser-1', projectId: 'project-1' } });
    await expect(session.callCommand('workflow.inspect', { clientId: 'browser-2', projectId: 'project-2' }, 'cli')).rejects.toThrow('WORKSPACE_WRITER_INACTIVE');

    expect(session.activateClient({ clientId: 'browser-2', projectId: 'project-2' })).toMatchObject({ clientId: 'browser-2', projectId: 'project-2' });
    expect(session.health()).toMatchObject({ clientId: 'browser-2', activeWriter: { clientId: 'browser-2' } });
  });

  it('rejects explicit activation when the browser has no matching project binding', () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    const response = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: null, draftVersion: 1 }, 'browser-1');

    expect(() => session.activateClient({ clientId: 'browser-1', projectId: 'project-1' })).toThrow('Workflow Browser binding 不匹配');
  });

  it('revokes the writer instead of silently falling back when the active tab closes', () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    let close;
    const first = { writeHead() {}, write() {}, on(event, listener) { if (event === 'close') close = listener; } };
    const second = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), first);
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-2'), second);
    session.updateSnapshot({ id: 'project-1' }, 'browser-1');
    session.updateSnapshot({ id: 'project-2' }, 'browser-2');
    close();
    expect(session.health()).toMatchObject({ clients: 1, hasWorkflow: false, clientId: null, activeWriter: null });
  });

  it('does not let a stale SSE close event evict a same-id reconnect', () => {
    const session = new WorkflowAgentSession({ timeoutMs: 10 });
    let staleClose;
    const first = { writeHead() {}, write() {}, on(event, listener) { if (event === 'close') staleClose = listener; } };
    const replacement = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), first);
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), replacement);
    session.updateSnapshot({ id: 'project-1', draftVersion: 1 }, 'browser-1');

    staleClose?.();
    expect(session.health()).toMatchObject({ clients: 1, hasWorkflow: true, clientId: 'browser-1' });
  });

  it('stops waiting and clears the pending command when the Agent turn is cancelled', async () => {
    const session = new WorkflowAgentSession({ timeoutMs: 1000 });
    const response = { writeHead() {}, write() {}, on() {} };
    session.openEvents(new URL('http://127.0.0.1/events?clientId=browser-1'), response);
    session.updateSnapshot({ id: 'project-1' }, 'browser-1');
    const controller = new AbortController();
    const call = session.callCommand('workflow.inspect', {}, 'flovart-agent', undefined, controller.signal);

    controller.abort();

    await expect(call).rejects.toThrow('已取消');
    expect(session.health().pending).toBe(0);
  });
});
