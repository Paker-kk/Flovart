import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_DIR } from './config.js';

const NODE_TYPES = new Set(['image', 'text', 'video', 'audio', 'config']);
const SENSITIVE_KEY = /(?:api.?key|authorization|token|secret|password|storage.?key|file.?path|local.?path|data.?url)/i;
const MEDIA_KEY = /^(?:href|poster|src|url)$/i;
const MEDIA_VALUE = /^(?:data:|blob:|file:)/i;
const MAX_DRAFT_LOG = 256;
const NATIVE_WORKSPACE_FILE = process.env.FLOVART_NATIVE_WORKSPACE_FILE
  || path.join(AGENT_DIR, 'native-workflow.json');

const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const number = (value, fallback) => {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
};
const positive = (value, fallback) => Math.max(1, number(value, fallback));

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitize(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (MEDIA_KEY.test(key)) return '[media]';
  if (typeof value === 'string') return MEDIA_VALUE.test(value) ? '[media]' : value.slice(0, 20000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item));
  const source = record(value);
  if (!source) return value;
  return Object.fromEntries(Object.entries(source).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
}

function newProject(title = 'DeepSeek 原生画布') {
  const now = new Date().toISOString();
  return {
    id: id('workflow'),
    title: text(title, 'DeepSeek 原生画布'),
    nodes: [],
    connections: [],
    selectedNodeIds: [],
    viewport: { x: 80, y: 80, k: 1 },
    backgroundMode: 'dots',
    agentSessions: [],
    activeAgentSessionId: null,
    draftLog: [],
    draftVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeNode(value, index = 0) {
  const source = record(value) || {};
  const position = record(source.position) || {};
  const type = text(source.type, 'text');
  return {
    id: text(source.id, id(`node-${index + 1}`)),
    type: NODE_TYPES.has(type) ? type : 'text',
    title: text(source.title, '未命名节点'),
    position: {
      x: number(position.x, 80 + index * 40),
      y: number(position.y, 80 + index * 40),
    },
    width: positive(source.width, 320),
    height: positive(source.height, 220),
    freeResize: source.freeResize !== false,
    isVisible: source.isVisible !== false,
    isLocked: source.isLocked === true,
    objectVersion: Math.max(1, Math.floor(number(source.objectVersion, 1))),
    metadata: sanitize(record(source.metadata) || {}),
  };
}

function normalizeProject(value) {
  const source = record(value);
  if (!source) return null;
  const project = newProject(source.title);
  project.id = text(source.id, project.id);
  project.nodes = Array.isArray(source.nodes) ? source.nodes.map(normalizeNode) : [];
  const nodeIds = new Set(project.nodes.map(node => node.id));
  project.connections = Array.isArray(source.connections)
    ? source.connections.flatMap((value, index) => {
      const connection = record(value) || {};
      const fromNodeId = text(connection.fromNodeId);
      const toNodeId = text(connection.toNodeId);
      if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return [];
      return [{
        id: text(connection.id, id(`connection-${index + 1}`)),
        fromNodeId,
        toNodeId,
        ...(typeof connection.kind === 'string' ? { kind: connection.kind } : {}),
      }];
    })
    : [];
  const viewport = record(source.viewport) || {};
  project.selectedNodeIds = Array.isArray(source.selectedNodeIds)
    ? source.selectedNodeIds.filter(nodeId => typeof nodeId === 'string' && nodeIds.has(nodeId))
    : [];
  project.viewport = {
    x: number(viewport.x, 80),
    y: number(viewport.y, 80),
    k: Math.min(2, Math.max(0.25, number(viewport.k, 1))),
  };
  project.draftVersion = Math.max(1, Math.floor(number(source.draftVersion, 1)));
  project.createdAt = text(source.createdAt, project.createdAt);
  project.updatedAt = text(source.updatedAt, project.updatedAt);
  project.draftLog = Array.isArray(source.draftLog) ? source.draftLog.slice(-MAX_DRAFT_LOG).map(item => sanitize(item)) : [];
  return project;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cycleExists(connections, fromNodeId, toNodeId) {
  const outgoing = new Map();
  connections.forEach(connection => {
    const current = outgoing.get(connection.fromNodeId) || [];
    current.push(connection.toNodeId);
    outgoing.set(connection.fromNodeId, current);
  });
  const pending = [toNodeId];
  const visited = new Set();
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === fromNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(outgoing.get(nodeId) || []));
  }
  return false;
}

function nativeMutationOperations(project, operations) {
  const next = clone(project);
  const reject = message => ({ ok: false, message });
  const nodes = () => next.nodes;
  const nodeById = nodeId => nodes().find(node => node.id === nodeId);
  const uniqueConnectionId = requested => requested || id('connection');

  for (const operation of operations) {
    const type = text(operation?.type);
    if (type === 'add_node') {
      const node = normalizeNode(operation.node, nodes().length);
      if (nodes().some(item => item.id === node.id)) return reject(`节点 ID 已存在：${node.id}`);
      next.nodes.push(node);
      next.selectedNodeIds = [node.id];
      continue;
    }
    if (type === 'create_connected_node') {
      const node = normalizeNode(operation.node, nodes().length);
      if (nodes().some(item => item.id === node.id)) return reject(`节点 ID 已存在：${node.id}`);
      const fromNodeId = text(operation.fromNodeId);
      if (!nodeById(fromNodeId)) return reject(`来源节点不存在：${fromNodeId}`);
      if (cycleExists(next.connections, fromNodeId, node.id)) return reject('该连接会形成循环。');
      next.nodes.push(node);
      next.connections.push({ id: id('connection'), fromNodeId, toNodeId: node.id });
      next.selectedNodeIds = [node.id];
      continue;
    }
    if (type === 'update_node') {
      const node = nodeById(text(operation.id));
      if (!node) return reject(`节点不存在：${operation.id}`);
      const patch = record(operation.patch) || {};
      const updated = normalizeNode({
        ...node,
        ...patch,
        id: node.id,
        position: record(patch.position) ? { ...node.position, ...patch.position } : node.position,
        metadata: operation.replaceMetadata ? (record(patch.metadata) || {}) : { ...node.metadata, ...(record(patch.metadata) || {}) },
      });
      updated.objectVersion = Math.max(1, Number(node.objectVersion || 1) + 1);
      next.nodes = nodes().map(item => item.id === node.id ? updated : item);
      continue;
    }
    if (type === 'delete_nodes') {
      const ids = new Set(Array.isArray(operation.ids) ? operation.ids.map(String) : []);
      if (!ids.size) return reject('delete_nodes.ids 不能为空');
      const missing = [...ids].find(nodeId => !nodeById(nodeId));
      if (missing) return reject(`节点不存在：${missing}`);
      next.nodes = nodes().filter(node => !ids.has(node.id));
      next.connections = next.connections.filter(connection => !ids.has(connection.fromNodeId) && !ids.has(connection.toNodeId));
      next.selectedNodeIds = next.selectedNodeIds.filter(nodeId => !ids.has(nodeId));
      continue;
    }
    if (type === 'delete_connections') {
      if (operation.all === true) next.connections = [];
      else {
        const ids = new Set(Array.isArray(operation.ids) ? operation.ids.map(String) : []);
        if (!ids.size) return reject('delete_connections.ids 不能为空');
        if ([...ids].some(connectionId => !next.connections.some(connection => connection.id === connectionId))) return reject('连接不存在');
        next.connections = next.connections.filter(connection => !ids.has(connection.id));
      }
      continue;
    }
    if (type === 'connect_nodes') {
      const fromNodeId = text(operation.fromNodeId);
      const toNodeId = text(operation.toNodeId);
      if (!nodeById(fromNodeId) || !nodeById(toNodeId)) return reject('连接节点不存在。');
      if (fromNodeId === toNodeId || cycleExists(next.connections, fromNodeId, toNodeId)) return reject('该连接会形成循环。');
      if (next.connections.some(connection => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId)) return reject('连接已存在。');
      if (text(operation.id) && next.connections.some(connection => connection.id === operation.id)) return reject(`连接 ID 已存在：${operation.id}`);
      const connectionId = uniqueConnectionId(text(operation.id));
      next.connections.push({ id: connectionId, fromNodeId, toNodeId, ...(text(operation.kind) ? { kind: operation.kind } : {}) });
      continue;
    }
    if (type === 'move_nodes') {
      const positions = Array.isArray(operation.positions) ? operation.positions : [];
      if (!positions.length) return reject('move_nodes.positions 不能为空');
      for (const item of positions) {
        const node = nodeById(text(item?.id));
        const position = record(item?.position);
        if (!node || !position) return reject('节点位置参数无效');
        node.position = { x: number(position.x, node.position.x), y: number(position.y, node.position.y) };
        node.objectVersion = Math.max(1, Number(node.objectVersion || 1) + 1);
      }
      continue;
    }
    if (type === 'reorder_nodes') {
      const ids = Array.isArray(operation.ids) ? operation.ids.map(String) : [];
      if (ids.length !== nodes().length || new Set(ids).size !== nodes().length || ids.some(nodeId => !nodeById(nodeId))) return reject('节点顺序必须完整且不能重复');
      next.nodes = ids.map(nodeId => nodeById(nodeId));
      continue;
    }
    return reject(`原生画布不支持此 Mutation Operation：${type || '(empty)'}`);
  }
  return { ok: true, project: next };
}

export class NativeWorkflowStore {
  constructor({ file = NATIVE_WORKSPACE_FILE } = {}) {
    this.file = file;
    const saved = this.read();
    this.projects = saved.projects;
    this.activeProjectId = saved.activeProjectId || this.projects[0]?.id || null;
    this.idempotency = new Map();
    this.enabled = false;
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const projects = Array.isArray(parsed?.projects) ? parsed.projects.map(normalizeProject).filter(Boolean) : [];
      return { projects, activeProjectId: typeof parsed?.activeProjectId === 'string' ? parsed.activeProjectId : null };
    } catch {
      return { projects: [], activeProjectId: null };
    }
  }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ version: 1, activeProjectId: this.activeProjectId, projects: this.projects }, null, 2), 'utf8');
  }

  activate() {
    this.enabled = true;
    if (!this.activeProjectId || !this.projects.some(project => project.id === this.activeProjectId)) {
      this.activeProjectId = this.projects[0]?.id || null;
      this.persist();
    }
    return this.state();
  }

  health() {
    return {
      enabled: this.enabled,
      hasWorkflow: this.projects.length > 0,
      clients: this.enabled ? 1 : 0,
      activeProjectId: this.activeProjectId,
      snapshotUpdatedAt: this.activeProject()?.updatedAt || null,
    };
  }

  state() {
    return {
      ...this.health(),
      projects: this.projects.map(project => ({ id: project.id, title: project.title, createdAt: project.createdAt, updatedAt: project.updatedAt })),
    };
  }

  activeProject() {
    return this.projects.find(project => project.id === this.activeProjectId) || null;
  }

  summary(command, args) {
    const projectId = text(args.projectId || args.nodeId || args.id, '当前项目');
    return `${command}：${projectId}`;
  }

  touch(project, command, source, ids = []) {
    project.draftVersion = Math.max(1, Number(project.draftVersion || 1) + 1);
    project.updatedAt = new Date().toISOString();
    project.draftLog = [...(project.draftLog || []), {
      id: id('draft'),
      at: project.updatedAt,
      source: ['ui', 'cli', 'agent', 'mcp', 'operator'].includes(source) ? source : 'operator',
      command,
      summary: this.summary(command, { projectId: project.id }),
      ok: true,
      nodeIds: ids,
    }].slice(-MAX_DRAFT_LOG);
    this.persist();
  }

  success(command, result) {
    return { ok: true, commandId: id('native-command'), result };
  }

  failure(command, code, message) {
    return { ok: false, commandId: command, error: { code, message } };
  }

  projectFor(args) {
    const projectId = text(args.projectId, this.activeProjectId);
    const project = this.projects.find(item => item.id === projectId);
    if (!project) throw new Error(`Workflow 项目不存在：${projectId || '未指定'}`);
    return project;
  }

  execute(command, args = {}, source = 'operator', idempotencyKey) {
    const cacheKey = idempotencyKey ? `${source}:${idempotencyKey}` : null;
    if (cacheKey && this.idempotency.has(cacheKey)) return clone(this.idempotency.get(cacheKey));
    let result;
    try {
      const project = command.startsWith('workflow.') && !['workflow.project.list', 'workflow.project.create'].includes(command)
        ? this.projectFor(args)
        : null;
      if (command === 'workflow.project.list') {
        result = this.success(command, this.projects.map(item => ({ id: item.id, title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt })));
      } else if (command === 'workflow.project.create') {
        const next = newProject(args.title);
        this.projects.push(next);
        this.activeProjectId = next.id;
        this.persist();
        result = this.success(command, { projectId: next.id });
      } else if (command === 'workflow.project.use') {
        this.activeProjectId = project.id;
        this.persist();
        result = this.success(command, { projectId: project.id });
      } else if (command === 'workflow.project.delete') {
        this.projects = this.projects.filter(item => item.id !== project.id);
        this.activeProjectId = this.projects[0]?.id || null;
        this.persist();
        result = this.success(command, { projectId: project.id });
      } else if (command === 'workflow.inspect') {
        result = this.success(command, clone(project));
      } else if (command === 'workflow.selection.get') {
        const selectedNodeIds = project.selectedNodeIds.filter(nodeId => project.nodes.some(node => node.id === nodeId));
        result = this.success(command, {
          projectId: project.id,
          selectedNodeIds,
          nodes: project.nodes.filter(node => selectedNodeIds.includes(node.id)).map(clone),
          viewport: clone(project.viewport),
          draftVersion: project.draftVersion || 1,
        });
      } else if (command === 'workflow.apply') {
        const operations = Array.isArray(args.operations || args.ops) ? (args.operations || args.ops) : [];
        const expectedRevision = Number(args.expectedRevision);
        const mutationId = text(args.mutationId);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('expectedRevision 必须是正整数');
        if (!mutationId) throw new Error('mutationId 不能为空');
        if (expectedRevision !== Number(project.draftVersion || 1)) {
          result = this.failure(command, 'REVISION_CONFLICT', `Workflow 草稿版本已变化：期望 ${expectedRevision}，当前 ${project.draftVersion || 1}。`);
        } else if (!operations.length) {
          result = this.failure(command, 'BAD_REQUEST', 'operations 至少包含一个 Document Operation');
        } else {
          const applied = nativeMutationOperations(project, operations);
          if (!applied.ok) result = this.failure(command, 'BAD_REQUEST', applied.message);
          else {
            const affectedNodeIds = operations.flatMap(operation => {
              if (operation.type === 'add_node' || operation.type === 'create_connected_node') return [String(operation.node?.id || '')];
              if (operation.type === 'update_node' || operation.type === 'delete_nodes' || operation.type === 'move_nodes') return [String(operation.id || operation.nodeId || '')].filter(Boolean);
              return [];
            });
            this.projects = this.projects.map(item => item.id === project.id ? applied.project : item);
            this.touch(applied.project, command, source, affectedNodeIds);
            result = this.success(command, {
              projectId: project.id,
              mutationId,
              draftVersion: applied.project.draftVersion,
              operationCount: operations.length,
            });
          }
        }
      } else if (command === 'workflow.node.run') {
        const nodeId = text(args.nodeId || args.id);
        if (!project.nodes.some(node => node.id === nodeId)) result = this.failure(command, 'NOT_FOUND', `节点不存在：${nodeId}`);
        else result = this.failure(command, 'RUNNER_UNAVAILABLE', 'Native/Headless Workflow 不提供 Provider 执行；请连接可见 Browser Workflow 或交给 Production Runtime。');
      } else if (command === 'workflow.node.create' || command === 'workflow.node.create-connected') {
        const type = text(args.type, 'text');
        if (!NODE_TYPES.has(type)) throw new Error(`不支持的节点类型：${type}`);
        const node = normalizeNode({
          id: args.id,
          type,
          title: args.title,
          position: { x: number(args.x, 80), y: number(args.y, 80) },
          width: args.width,
          height: args.height,
          metadata: args.metadata,
        }, project.nodes.length);
        if (project.nodes.some(item => item.id === node.id)) throw new Error(`节点 ID 已存在：${node.id}`);
        project.nodes.push(node);
        const fromNodeId = text(args.fromNodeId || args.from);
        if (command.endsWith('connected')) {
          if (!project.nodes.some(item => item.id === fromNodeId)) throw new Error(`来源节点不存在：${fromNodeId}`);
          if (cycleExists(project.connections, fromNodeId, node.id)) throw new Error('该连接会形成循环。');
          project.connections.push({ id: id('connection'), fromNodeId, toNodeId: node.id });
        }
        this.touch(project, command, source, [node.id]);
        result = this.success(command, { projectId: project.id, nodeId: node.id, draftVersion: project.draftVersion });
      } else if (command === 'workflow.node.update') {
        const nodeId = text(args.nodeId || args.id);
        const node = project.nodes.find(item => item.id === nodeId);
        if (!node) throw new Error(`节点不存在：${nodeId}`);
        const patch = record(args.patch || args.updates) || {};
        if ('title' in patch) node.title = text(patch.title, node.title);
        if ('position' in patch && record(patch.position)) node.position = { x: number(patch.position.x, node.position.x), y: number(patch.position.y, node.position.y) };
        if ('width' in patch) node.width = positive(patch.width, node.width);
        if ('height' in patch) node.height = positive(patch.height, node.height);
        if ('metadata' in patch && record(patch.metadata)) node.metadata = { ...node.metadata, ...sanitize(patch.metadata) };
        if ('isLocked' in patch) node.isLocked = patch.isLocked === true;
        if ('isVisible' in patch) node.isVisible = patch.isVisible !== false;
        node.objectVersion = Number(node.objectVersion || 1) + 1;
        this.touch(project, command, source, [node.id]);
        result = this.success(command, { projectId: project.id, nodeId: node.id, draftVersion: project.draftVersion, objectVersion: node.objectVersion });
      } else if (command === 'workflow.node.delete') {
        const nodeId = text(args.nodeId || args.id);
        if (!project.nodes.some(item => item.id === nodeId)) throw new Error(`节点不存在：${nodeId}`);
        project.nodes = project.nodes.filter(item => item.id !== nodeId);
        project.connections = project.connections.filter(connection => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId);
        project.selectedNodeIds = project.selectedNodeIds.filter(id => id !== nodeId);
        this.touch(project, command, source, [nodeId]);
        result = this.success(command, { projectId: project.id, nodeId, draftVersion: project.draftVersion });
      } else if (command === 'workflow.node.move' || command === 'workflow.node.resize') {
        const nodeId = text(args.nodeId || args.id);
        const node = project.nodes.find(item => item.id === nodeId);
        if (!node) throw new Error(`节点不存在：${nodeId}`);
        if (command.endsWith('move')) node.position = { x: number(args.x, node.position.x), y: number(args.y, node.position.y) };
        else { node.width = positive(args.width, node.width); node.height = positive(args.height, node.height); }
        node.objectVersion = Number(node.objectVersion || 1) + 1;
        this.touch(project, command, source, [nodeId]);
        result = this.success(command, { projectId: project.id, nodeId, draftVersion: project.draftVersion, objectVersion: node.objectVersion });
      } else if (command === 'workflow.connect') {
        const fromNodeId = text(args.fromNodeId || args.from);
        const toNodeId = text(args.toNodeId || args.to);
        if (!project.nodes.some(item => item.id === fromNodeId) || !project.nodes.some(item => item.id === toNodeId)) throw new Error('连接节点不存在。');
        if (fromNodeId === toNodeId || cycleExists(project.connections, fromNodeId, toNodeId)) throw new Error('该连接会形成循环。');
        if (project.connections.some(connection => connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId)) throw new Error('连接已存在。');
        const connection = { id: text(args.id, id('connection')), fromNodeId, toNodeId };
        project.connections.push(connection);
        this.touch(project, command, source, [fromNodeId, toNodeId]);
        result = this.success(command, { projectId: project.id, connectionId: connection.id, draftVersion: project.draftVersion });
      } else if (command === 'workflow.disconnect') {
        const connectionId = text(args.connectionId || args.id);
        if (!project.connections.some(connection => connection.id === connectionId)) throw new Error(`连接不存在：${connectionId}`);
        project.connections = project.connections.filter(connection => connection.id !== connectionId);
        this.touch(project, command, source, [connectionId]);
        result = this.success(command, { projectId: project.id, connectionId, draftVersion: project.draftVersion });
      } else if (command === 'workflow.select') {
        const ids = Array.isArray(args.ids) ? args.ids.filter(nodeId => typeof nodeId === 'string') : [];
        project.selectedNodeIds = ids.filter(nodeId => project.nodes.some(node => node.id === nodeId));
        this.persist();
        result = this.success(command, { projectId: project.id, ids: project.selectedNodeIds });
      } else if (command === 'workflow.viewport.set') {
        project.viewport = { x: number(args.x, project.viewport.x), y: number(args.y, project.viewport.y), k: Math.min(2, Math.max(0.25, number(args.k, project.viewport.k))) };
        this.persist();
        result = this.success(command, { projectId: project.id, viewport: project.viewport });
      } else {
        result = this.failure(command, 'UNKNOWN_COMMAND', `原生画布暂不支持命令：${command}`);
      }
    } catch (error) {
      result = this.failure(command, 'BAD_REQUEST', error instanceof Error ? error.message : String(error));
    }
    if (cacheKey) {
      this.idempotency.set(cacheKey, clone(result));
      while (this.idempotency.size > MAX_DRAFT_LOG) this.idempotency.delete(this.idempotency.keys().next().value);
    }
    return result;
  }
}
