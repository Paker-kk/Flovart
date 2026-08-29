// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CrewStore } from '../agent/crew/store.js';
import { CrewService } from '../agent/crew/service.js';
import { parseCrewIntentJson, runWorkspaceOperator } from '../agent/crew/operator.js';
import { validateRuntimeContract } from '../tools/flovart/contracts.js';

function tempCrewDir() {
  return mkdtempSync(join(tmpdir(), 'flovart-crew-'));
}

function seedWorkflow() {
  return {
    ok: true,
    result: {
      id: 'project_1',
      draftVersion: 7,
      selectedNodeIds: ['image_1', 'image_2', 'image_3'],
      nodes: [
        { id: 'image_1', type: 'image', title: '镜头 A', x: 100, y: 220, objectVersion: 3 },
        { id: 'image_2', type: 'image', title: '镜头 B', x: 100, y: 440, objectVersion: 2 },
        { id: 'image_3', type: 'image', title: '镜头 C', x: 100, y: 660, objectVersion: 1 },
        { id: 'text_1', type: 'text', title: '旁白', x: 40, y: 40, objectVersion: 1 },
      ],
      connections: [],
    },
  };
}

function fakeDispatcher(workflow, options = {}) {
  let draftVersion = workflow.result.draftVersion;
  let nextObjectVersion = 10;
  let createdCount = 0;
  const calls = [];
  const createConnected = (args) => {
    const source = workflow.result.nodes.find(node => node.id === args.fromNodeId);
    if (!source) return { ok: false, error: { code: 'NOT_FOUND', message: '源节点不存在' } };
    if (options.conflictNodeIds?.includes(args.fromNodeId)) {
      return {
        ok: false,
        error: { code: 'PRECONDITION_FAILED', message: '对象版本已变化', details: { objectIds: [args.fromNodeId] } },
      };
    }
    createdCount += 1;
    const node = {
      id: `video_${createdCount}`,
      type: 'video',
      title: args.title,
      x: args.x,
      y: args.y,
      objectVersion: nextObjectVersion++,
    };
    workflow.result.nodes.push(node);
    workflow.result.connections.push({ id: `conn_${node.id}`, fromNodeId: args.fromNodeId, toNodeId: node.id, objectVersion: 1 });
    draftVersion += 1;
    return {
      ok: true,
      result: {
        projectId: workflow.result.id,
        changeSetId: `changeset_${node.id}`,
        draftVersion,
        affectedNodeIds: [node.id],
        affectedConnectionIds: [`conn_${node.id}`],
        objectVersions: { [node.id]: node.objectVersion },
      },
    };
  };
  return async (command, args) => {
    calls.push({ command, args });
    if (command === 'workflow.inspect') {
      workflow.result.draftVersion = draftVersion;
      return workflow;
    }
    if (command === 'workflow.node.create-connected') return createConnected(args);
    return { ok: false, error: { code: 'UNKNOWN_COMMAND', message: `unexpected ${command}` } };
  };
}

const INTENT_JSON = JSON.stringify({
  goal: '把当前选中的三张图片建立为并行图生视频分支',
  scope: { workspace: 'workflow', selectedObjectIds: ['image_1', 'image_2', 'image_3'] },
  constraints: {
    maxSideEffect: 'draft-only',
    maxSteps: 12,
    allowedCapabilities: ['workflow.inspect', 'workflow.node.create-connected'],
  },
  completion: { requiredOutputs: ['changeset', 'receipt'] },
});

describe('Workspace Operator (crew tracer bullet)', () => {
  it('expands the bounded intent into a completed parallel-branch receipt', async () => {
    const callCommand = fakeDispatcher(seedWorkflow());
    const intent = {
      intentId: 'intent_1',
      projectId: 'project_1',
      goal: '把当前选中的三张图片建立为并行图生视频分支',
      selectedObjectIds: ['image_1', 'image_2', 'image_3'],
      maxSideEffect: 'draft-only',
      maxSteps: 12,
      allowedCapabilities: ['workflow.inspect', 'workflow.node.create-connected'],
    };
    const events = [];
    const receipt = await runWorkspaceOperator(intent, {
      callCommand,
      emit: (type, data) => events.push({ type, data }),
    });

    expect(receipt.status).toBe('completed');
    expect(receipt.commands.filter(entry => entry.command === 'workflow.node.create-connected')).toHaveLength(3);
    expect(receipt.usage.steps).toBe(3);
    expect(receipt.affectedObjectIds).toEqual(['video_1', 'video_2', 'video_3']);
    expect(receipt.changeSetId).toBe('changeset_video_3');
    expect(receipt.draftVersion).toBe(10);
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'crew.intent.status_changed',
      'crew.tool.started',
      'crew.tool.finished',
    ]));
    expect(validateRuntimeContract('crew-receipt', { ...receipt, eventCursor: 0 })).toMatchObject({ ok: true });
  });

  it('returns waiting with PRECONDITION_CONFLICT and re-reads before giving up', async () => {
    const workflow = seedWorkflow();
    const callCommand = fakeDispatcher(workflow, { conflictNodeIds: ['image_1'] });
    const receipt = await runWorkspaceOperator({
      intentId: 'intent_conflict',
      projectId: 'project_1',
      goal: '把当前选中的三张图片建立为并行图生视频分支',
      selectedObjectIds: ['image_1', 'image_2', 'image_3'],
      maxSideEffect: 'draft-only',
      maxSteps: 12,
      allowedCapabilities: ['workflow.inspect', 'workflow.node.create-connected'],
    }, { callCommand });

    expect(receipt.status).toBe('waiting');
    expect(receipt.waiting?.reason).toBe('PRECONDITION_CONFLICT');
    expect(receipt.waiting?.objectIds).toEqual(['image_1']);
  });

  it('fails honestly for intents the closed rules cannot expand', async () => {
    const callCommand = fakeDispatcher(seedWorkflow());
    const receipt = await runWorkspaceOperator({
      intentId: 'intent_open',
      projectId: 'project_1',
      goal: '把整个影片全部拍完并发布到社区',
      selectedObjectIds: ['image_1'],
      maxSideEffect: 'provider-paid',
      allowedCapabilities: [],
    }, { callCommand });

    expect(receipt.status).toBe('failed');
    expect(receipt.error?.code).toBe('OPERATOR_ROUTE_UNAVAILABLE');
  });

  it('cancels cooperatively and returns a cancelled receipt', async () => {
    const callCommand = fakeDispatcher(seedWorkflow());
    const signal = { aborted: false, cancelled: false };
    const run = runWorkspaceOperator({
      intentId: 'intent_cancel',
      projectId: 'project_1',
      goal: '把当前选中的三张图片建立为并行图生视频分支',
      selectedObjectIds: ['image_1', 'image_2', 'image_3'],
      maxSideEffect: 'draft-only',
      maxSteps: 12,
      allowedCapabilities: ['workflow.inspect', 'workflow.node.create-connected'],
    }, { callCommand, signal });
    signal.cancelled = true;
    const receipt = await run;

    expect(receipt.status).toBe('cancelled');
  });

  it('parses the CLI intentJson shape', () => {
    const intent = parseCrewIntentJson(INTENT_JSON);
    expect(intent.goal).toContain('并行');
    expect(intent.selectedObjectIds).toHaveLength(3);
    expect(intent.maxSideEffect).toBe('draft-only');
  });
});

describe('CrewService (persistent intents, idempotency, director binding)', () => {
  it('persists an intent, runs it, and returns the receipt', async () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      const submitted = service.submitIntent({
        intentText: INTENT_JSON,
        projectId: 'project_1',
        idempotencyKey: 'key-1',
      });
      expect(submitted.intent.status).toBe('accepted');

      const receipt = await service.runIntent(submitted.intent.intentId);
      expect(receipt.status).toBe('completed');
      expect(receipt.affectedObjectIds).toEqual(['video_1', 'video_2', 'video_3']);

      const reloadedStore = new CrewStore({ dir });
      expect(reloadedStore.getIntent(submitted.intent.intentId).status).toBe('completed');
      expect(reloadedStore.getReceipt(submitted.intent.intentId).status).toBe('completed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('replays the same idempotencyKey+payload and conflicts on different payload', async () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      const first = service.submitIntent({ intentText: INTENT_JSON, projectId: 'project_1', idempotencyKey: 'key-same' });
      await service.runIntent(first.intent.intentId);

      const replay = service.submitIntent({ intentText: INTENT_JSON, projectId: 'project_1', idempotencyKey: 'key-same' });
      expect(replay.replayed).toBe(true);
      expect(replay.receipt.status).toBe('completed');

      let conflictError = null;
      try {
        service.submitIntent({
          intentText: JSON.stringify({ ...JSON.parse(INTENT_JSON), goal: '另一个目标' }),
          projectId: 'project_1',
          idempotencyKey: 'key-same',
        });
      } catch (error) {
        conflictError = error;
      }
      expect(conflictError).toBeInstanceOf(Error);
      expect(conflictError.code).toBe('IDEMPOTENCY_CONFLICT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks pending intents interrupted on restart recovery', async () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      service.submitIntent({ intentText: INTENT_JSON, projectId: 'project_1', idempotencyKey: 'key-recovery' });

      const recovered = new CrewStore({ dir });
      const interrupted = recovered.recoverAfterRestart();
      expect(interrupted).toEqual([{ intentId: expect.stringContaining('intent_'), fromStatus: 'accepted' }]);
      expect(recovered.getReceipt(interrupted[0].intentId).status).toBe('interrupted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cancels a pending intent and archives director bindings', async () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      const binding = service.bindDirector({ hostKind: 'codex', sessionId: 'session-1', projectId: 'project_1' });
      expect(binding.state).toBe('active');
      expect(service.directorStatus().binding?.bindingId).toBe(binding.bindingId);

      const submitted = service.submitIntent({
        intentText: INTENT_JSON,
        projectId: 'project_1',
        idempotencyKey: 'key-cancel',
        director: { bindingId: binding.bindingId, hostKind: 'codex', sessionId: 'session-1' },
      });
      const { receipt } = service.cancelIntent(submitted.intent.intentId);
      expect(receipt.status).toBe('cancelled');

      const unbound = service.unbindDirector({ bindingId: binding.bindingId });
      expect(unbound.binding.state).toBe('archived');
      expect(service.directorStatus().binding).toBeNull();

      expect(() => service.bindDirector({ hostKind: 'codex', sessionId: 'session-2', projectId: 'project_1' }))
        .not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hands one project to another Director only through an explicit compare-and-swap', () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      const previous = service.bindDirector({ hostKind: 'deepseek', sessionId: 'session-a', projectId: 'project_1' });

      expect(() => service.bindDirector({ hostKind: 'deepseek', sessionId: 'session-b', projectId: 'project_1' }))
        .toThrowError(/显式 Director Handoff/);

      const next = service.handoffDirector({
        hostKind: 'deepseek',
        sessionId: 'session-b',
        projectId: 'project_1',
        expectedBindingId: previous.bindingId,
      });

      expect(store.getBinding(previous.bindingId)).toMatchObject({ state: 'archived', archivedReason: 'director-handoff' });
      expect(next).toMatchObject({
        state: 'active',
        hostKind: 'deepseek',
        externalSessionId: 'session-b',
        productionSessionId: 'project_1',
      });
      expect(service.directorStatus({ projectId: 'project_1' }).binding?.bindingId).toBe(next.bindingId);
      expect(() => service.handoffDirector({
        hostKind: 'deepseek',
        sessionId: 'session-c',
        projectId: 'project_1',
        expectedBindingId: previous.bindingId,
      })).toThrowError(/绑定状态已变化/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('moves one Director Session between projects instead of allowing two active bindings', () => {
    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
      const previous = service.bindDirector({ hostKind: 'deepseek', sessionId: 'session-a', projectId: 'project_1' });

      expect(() => service.bindDirector({ hostKind: 'deepseek', sessionId: 'session-a', projectId: 'project_2' }))
        .toThrowError(/显式 Director Handoff/);

      const next = service.handoffDirector({ hostKind: 'deepseek', sessionId: 'session-a', projectId: 'project_2' });
      expect(store.getBinding(previous.bindingId)).toMatchObject({ state: 'archived', archivedReason: 'director-handoff' });
      expect(service.directorStatus({ projectId: 'project_1' }).binding).toBeNull();
      expect(service.directorStatus({ sessionId: 'session-a', hostKind: 'deepseek' }).binding).toMatchObject({
        bindingId: next.bindingId,
        productionSessionId: 'project_2',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects missing goal/project/side-effect and unknown hosts', async () => {
    const store = new CrewStore({ dir: tempCrewDir() });
    const service = new CrewService({ store, callCommand: fakeDispatcher(seedWorkflow()) });
    expect(() => service.submitIntent({
      intentText: JSON.stringify({ goal: '', scope: { workspace: 'workflow' }, constraints: { maxSideEffect: 'draft-only' } }),
      projectId: 'project_1',
      idempotencyKey: 'key-x',
    })).toThrowError(/goal/);
    expect(() => service.bindDirector({ hostKind: 'cursor', sessionId: 's', projectId: 'project_1' }))
      .toThrowError(/不支持的 Director Runtime Binding/);
  });
});

describe('CrewService over the real Workflow Draft Authority', () => {
  it('creates three parallel branches through the real dispatcher and returns a completed receipt', async () => {
    // 真实浏览器 Draft Authority 路径：createWorkflowDispatcher + memory store，
    // 等价于 WorkflowAgentBridge.handleToolCall 对 operator source 的 workflow.* 处理。
    const { createWorkflowDispatcher } = await import('../services/workflowDispatcher');
    const { createWorkflowProject } = await import('../components/workflow/store');
    const { createWorkflowNode } = await import('../components/workflow/constants');
    const { CrewStore } = await import('../agent/crew/store.js');
    const { CrewService } = await import('../agent/crew/service.js');

    let projects = [createWorkflowProject('tracer')];
    projects[0].nodes = [
      createWorkflowNode('image_1', 'image', { x: 100, y: 220 }, { href: 'data:image/png;base64,AA==', mimeType: 'image/png' }),
      createWorkflowNode('image_2', 'image', { x: 100, y: 440 }, { href: 'data:image/png;base64,AA==', mimeType: 'image/png' }),
      createWorkflowNode('image_3', 'image', { x: 100, y: 660 }, { href: 'data:image/png;base64,AA==', mimeType: 'image/png' }),
    ];
    projects[0].selectedNodeIds = ['image_1', 'image_2', 'image_3'];
    let activeProjectId = projects[0].id;
    const dispatch = createWorkflowDispatcher({
      getState: () => ({ projects, activeProjectId }),
      createProject: title => {
        const project = createWorkflowProject(title);
        projects = [project, ...projects];
        activeProjectId = project.id;
        return project.id;
      },
      setActiveProject: id => { activeProjectId = id; },
      deleteProjects: ids => { projects = projects.filter(project => !ids.includes(project.id)); },
      updateProject: (id, patch) => { projects = projects.map(project => project.id === id ? { ...project, ...patch } : project); },
      runNode: async () => {},
      stopNode: async () => {},
    });

    const dir = tempCrewDir();
    try {
      const store = new CrewStore({ dir });
      const service = new CrewService({
        store,
        callCommand: async (command, args, source, idempotencyKey) => {
          const result = await dispatch({
            id: `operator_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            command,
            args,
            source: source || 'operator',
            idempotencyKey: idempotencyKey || undefined,
          });
          return result;
        },
      });
      const submitted = service.submitIntent({
        intentText: JSON.stringify({
          goal: '把当前选中的三张图片建立为并行图生视频分支',
          scope: { workspace: 'workflow', selectedObjectIds: ['image_1', 'image_2', 'image_3'] },
          constraints: { maxSideEffect: 'draft-only', maxSteps: 12, allowedCapabilities: ['workflow.inspect', 'workflow.node.create-connected'] },
          completion: { requiredOutputs: ['changeset', 'receipt'] },
        }),
        projectId: projects[0].id,
        idempotencyKey: 'real-browser-tracer',
      });
      const receipt = await service.runIntent(submitted.intent.intentId);

      expect(receipt.status).toBe('completed');
      expect(receipt.usage.steps).toBe(3);
      const updated = projects[0];
      expect(updated.nodes.filter(node => node.type === 'video')).toHaveLength(3);
      expect(updated.connections.filter(connection => connection.fromNodeId.startsWith('image_'))).toHaveLength(3);
      expect(updated.draftChangeSets.some(changeSet => changeSet.actor === 'operator')).toBe(true);
      expect(updated.draftVersion).toBeGreaterThan(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
