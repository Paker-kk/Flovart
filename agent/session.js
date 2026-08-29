import crypto from 'node:crypto';
import { NativeWorkflowStore } from './native-workspace.js';

const sendEvent = (response, type, payload) => response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);

const HOST_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export class WorkflowAgentSessionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorkflowAgentSessionError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, retryable: false, details: this.details };
  }
}

const hostWriterView = writer => writer
  ? {
    agentIdentity: writer.agentIdentity,
    projectId: writer.projectId || null,
    hasSessionId: Boolean(writer.hostSessionId),
  }
  : null;

function sessionError(code, message, details) {
  return new WorkflowAgentSessionError(code, message, details);
}

export class WorkflowAgentSession {
  constructor({ timeoutMs = 60000, nativeWorkspace, isKnownAgentIdentity } = {}) {
    this.timeoutMs = timeoutMs;
    this.clients = new Map();
    this.pending = new Map();
    this.snapshot = null;
    this.snapshots = new Map();
    this.activeClientId = null;
    this.activeHostWriter = null;
    this.isKnownAgentIdentity = isKnownAgentIdentity;
    this.nativeWorkspace = nativeWorkspace || new NativeWorkflowStore();
  }

  health() {
    const native = this.nativeWorkspace.health();
    return {
      ok: true,
      hasWorkflow: native.enabled ? native.hasWorkflow : Boolean(this.snapshot),
      clients: native.enabled ? Math.max(1, this.clients.size) : this.clients.size,
      pending: this.pending.size,
      activeProjectId: native.enabled ? native.activeProjectId : this.snapshot?.id || null,
      snapshotUpdatedAt: native.enabled ? native.snapshotUpdatedAt : this.snapshot?.snapshotUpdatedAt || null,
      clientId: native.enabled ? null : this.activeClientId || this.snapshot?.clientId || null,
      revision: native.enabled ? null : this.snapshot?.draftVersion ?? this.snapshot?.revision ?? null,
      activeWriter: native.enabled ? null : this.activeClientId ? { clientId: this.activeClientId, projectId: this.snapshot?.id || null } : null,
      activeHostWriter: native.enabled ? null : hostWriterView(this.activeHostWriter),
      nativeWorkspace: native.enabled,
    };
  }

  activateNativeWorkspace() {
    return this.nativeWorkspace.activate();
  }

  nativeWorkspaceState() {
    return this.nativeWorkspace.state();
  }

  openEvents(url, response) {
    const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    this.clients.set(clientId, response);
    sendEvent(response, 'hello', { ok: true, clientId });
    const timer = setInterval(() => sendEvent(response, 'ping', { time: Date.now() }), 15000);
    response.on('close', () => {
      clearInterval(timer);
      // A reconnect may reuse a client id before the old SSE response emits
      // `close`. Never let the old response evict the replacement session.
      if (this.clients.get(clientId) !== response) return;
      this.clients.delete(clientId);
      this.snapshots.delete(clientId);
      if (this.activeClientId === clientId) {
        const projectId = this.snapshot?.id || null;
        this.activeClientId = null;
        this.snapshot = null;
        this.emit('writer_unavailable', { clientId, projectId });
      }
      this.pending.forEach((pending, requestId) => {
        if (pending.clientId !== clientId) return;
        this.pending.delete(requestId);
        pending.reject(new Error('Flovart 浏览器连接已断开'));
      });
    });
  }

  updateSnapshot(snapshot, clientId) {
    const next = {
      ...(snapshot && typeof snapshot === 'object' ? snapshot : {}),
      clientId,
      snapshotUpdatedAt: new Date().toISOString(),
    };
    if (clientId) {
      this.snapshots.delete(clientId);
      this.snapshots.set(clientId, next);
      // The first visible browser claims the writer slot. A second tab may
      // publish a snapshot, but it cannot silently steal the active writer.
      if (!this.activeClientId || !this.clients.has(this.activeClientId)) {
        this.activeClientId = clientId;
        this.snapshot = next;
        this.emit('writer_changed', { clientId, projectId: next.id || null });
      } else if (this.activeClientId === clientId) {
        this.snapshot = next;
      }
    } else {
      this.snapshot = next;
    }
  }

  activateClient({ clientId, projectId } = {}) {
    const id = String(clientId || '');
    const snapshot = this.snapshots.get(id);
    if (!id || !snapshot || !this.clients.has(id)) throw new Error('指定的 Browser Workflow 不可用。');
    if (projectId && String(projectId) !== String(snapshot.id || '')) throw new Error(`Workflow Browser binding 不匹配：${projectId}`);
    this.activeClientId = id;
    this.snapshot = snapshot;
    this.emit('writer_changed', { clientId: id, projectId: snapshot.id || null });
    return { clientId: id, projectId: snapshot.id || null, revision: snapshot.draftVersion ?? snapshot.revision ?? null };
  }

  normalizeAgentIdentity(value) {
    const id = String(value || '').trim().toLowerCase();
    if (!HOST_ID_PATTERN.test(id)) throw sessionError('INVALID_ARGUMENT', 'Agent Identity 无效。');
    if (this.isKnownAgentIdentity && !this.isKnownAgentIdentity(id)) {
      throw sessionError('UNKNOWN_AGENT_HOST', `未注册的 Agent Identity：${id}`);
    }
    return id;
  }

  hostWriterState() {
    return hostWriterView(this.activeHostWriter);
  }

  activateAgentHost({ agentIdentity, hostSessionId, projectId } = {}) {
    const id = this.normalizeAgentIdentity(agentIdentity);
    const sessionId = hostSessionId === undefined || hostSessionId === null || hostSessionId === ''
      ? null
      : String(hostSessionId).trim().slice(0, 500);
    if (hostSessionId !== undefined && !sessionId) throw sessionError('INVALID_ARGUMENT', 'hostSessionId 不能为空。');
    const requestedProject = projectId === undefined || projectId === null || projectId === ''
      ? this.snapshot?.id || null
      : String(projectId).trim();
    if (projectId !== undefined && !requestedProject) throw sessionError('INVALID_ARGUMENT', 'projectId 不能为空。');
    if (requestedProject && this.snapshot?.id && requestedProject !== this.snapshot.id) {
      throw sessionError(
        'AGENT_PROJECT_INACTIVE',
        '当前 Browser Writer 没有激活这个 Workflow 项目；请先激活对应的 Browser 页面。',
        { activeProjectId: this.snapshot.id, requestedProjectId: requestedProject },
      );
    }
    const previous = this.activeHostWriter;
    const sameIdentity = previous?.agentIdentity === id;
    if (sameIdentity && previous.hostSessionId && sessionId && previous.hostSessionId !== sessionId) {
      throw sessionError('AGENT_HOST_SESSION_MISMATCH', '当前 Agent Host Session 不匹配，请先显式结束旧会话。', { agentIdentity: id });
    }
    const next = {
      agentIdentity: id,
      hostSessionId: sessionId || (sameIdentity ? previous.hostSessionId : null),
      projectId: requestedProject,
    };
    this.activeHostWriter = next;
    this.emit('host_writer_changed', {
      previous: hostWriterView(previous),
      active: hostWriterView(next),
    });
    return {
      activeHostWriter: hostWriterView(next),
      switched: Boolean(previous && (previous.agentIdentity !== next.agentIdentity || previous.projectId !== next.projectId)),
    };
  }

  authorizeExternalHost(caller, args = {}) {
    const requestedIdentity = caller?.agentIdentity;
    const requestedProject = args.projectId || this.snapshot?.id || null;
    const requestedSession = caller?.hostSessionId ? String(caller.hostSessionId).trim() : null;
    const active = this.activeHostWriter;
    if (!requestedIdentity) {
      if (active) throw sessionError(
        'AGENT_HOST_REQUIRED',
        `当前 Workflow 由 ${active.agentIdentity} 控制；请使用当前 Host Projection 再继续。`,
        { activeHostWriter: hostWriterView(active) },
      );
      return;
    }
    const identity = this.normalizeAgentIdentity(requestedIdentity);
    if (!active) {
      this.activeHostWriter = { agentIdentity: identity, hostSessionId: requestedSession, projectId: requestedProject };
      this.emit('host_writer_changed', { previous: null, active: hostWriterView(this.activeHostWriter) });
      return;
    }
    if (active.agentIdentity !== identity) throw sessionError(
      'AGENT_WRITER_INACTIVE',
      `${identity} 不是当前 Workflow 的 Active Host；请先在 Flovart Host Picker 显式切换。`,
      { activeHostWriter: hostWriterView(active), requestedAgentIdentity: identity },
    );
    if (active.hostSessionId && active.hostSessionId !== requestedSession) {
      throw sessionError('AGENT_HOST_SESSION_MISMATCH', '当前 Agent Host Session 不匹配，请重新建立 Host 会话。', { agentIdentity: identity });
    }
    if (active.projectId && requestedProject && active.projectId !== requestedProject) throw sessionError(
      'AGENT_PROJECT_INACTIVE',
      '当前 Agent Host 没有激活这个 Workflow 项目；请在 Flovart 中显式激活当前项目。',
      { activeHostWriter: hostWriterView(active), requestedProjectId: requestedProject },
    );
  }

  emit(type, payload) {
    this.clients.forEach((client, clientId) => {
      try { sendEvent(client, type, payload); }
      catch {
        this.clients.delete(clientId);
        try { client.end(); } catch { /* connection already closed */ }
      }
    });
  }

  resolveResult({ requestId, clientId, result, error }) {
    const pending = requestId ? this.pending.get(requestId) : null;
    if (!pending) return false;
    if (clientId && pending.clientId !== clientId) return false;
    this.pending.delete(requestId);
    error ? pending.reject(new Error(typeof error === 'string' ? error : error.message || 'Workflow command failed')) : pending.resolve(result);
    return true;
  }

  async callCommand(command, args = {}, source = 'mcp', idempotencyKey, signal, caller) {
    if (command === 'status') {
      return {
        ok: true,
        result: {
          surface: 'agent-session',
          authority: 'browser-workflow',
          ...this.health(),
        },
      };
    }
    const workspaceMode = args?.workspaceMode;
    const requestedClientId = typeof args?.clientId === 'string' && args.clientId ? args.clientId : null;
    const agentSource = source === 'agent' || source === 'flovart-agent';
    const browserBound = agentSource || workspaceMode === 'browser' || Boolean(requestedClientId);
    const shouldUseNativeWorkspace = command.startsWith('workflow.')
      && this.nativeWorkspace.enabled
      && !browserBound
      && (workspaceMode === 'native' || workspaceMode === 'headless');
    if (shouldUseNativeWorkspace) {
      if (signal?.aborted) throw new Error('Workflow 操作已取消');
      return this.nativeWorkspace.execute(command, args, source, idempotencyKey);
    }
    const boundSnapshot = requestedClientId ? this.snapshots.get(requestedClientId) : this.snapshot;
    if (command.startsWith('workflow.') && requestedClientId && !this.clients.has(requestedClientId)) {
      throw new Error('当前没有已连接并同步项目的 Flovart Workflow');
    }
    if (command.startsWith('workflow.') && requestedClientId && requestedClientId !== this.activeClientId) {
      throw new Error('WORKSPACE_WRITER_INACTIVE：请先显式激活当前 Browser Workflow。');
    }
    const clientId = this.clients.has(boundSnapshot?.clientId) ? boundSnapshot.clientId : null;
    if (args?.projectId && boundSnapshot?.id && args.projectId !== boundSnapshot.id) {
      throw new Error(`Workflow Browser binding 不匹配：${args.projectId}`);
    }
    const client = this.clients.get(clientId);
    if (!client) throw new Error('当前没有已连接并同步项目的 Flovart Workflow');
    if (command.startsWith('workflow.') && source === 'cli') {
      this.authorizeExternalHost(caller, args);
    }
    if (signal?.aborted) throw new Error('Workflow 操作已取消');
    const requestId = crypto.randomUUID();
    const envelope = { id: requestId, command, args, source, idempotencyKey: idempotencyKey || args.idempotencyKey };
    sendEvent(client, 'tool_call', { requestId, envelope });
    return new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const onAbort = () => {
        this.pending.delete(requestId);
        cleanup();
        reject(new Error('Workflow 操作已取消'));
      };
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        cleanup();
        reject(new Error('Workflow 操作超时'));
      }, this.timeoutMs);
      this.pending.set(requestId, {
        clientId,
        resolve: value => { clearTimeout(timer); cleanup(); resolve(value); },
        reject: error => { clearTimeout(timer); cleanup(); reject(error); },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
