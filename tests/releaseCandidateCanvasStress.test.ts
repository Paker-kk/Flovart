import { describe, expect, it } from 'vitest';
import { createWorkflowNode } from '../components/workflow/constants';
import { applyWorkflowMutation, redoWorkflowDraftChangeSet, undoWorkflowDraftChangeSet } from '../components/workflow/draftAuthority';
import type { WorkflowProject } from '../components/workflow/types';

function createStressProject(nodeCount = 500): WorkflowProject {
  const now = new Date().toISOString();
  const nodes = Array.from({ length: nodeCount }, (_, index) => createWorkflowNode(
    `rc-stress-node-${index}`,
    'image',
    { x: 60 + (index % 20) * 380, y: 70 + Math.floor(index / 20) * 260 },
    { status: 'idle' },
  ));
  const connections = Array.from({ length: nodeCount - 1 }, (_, index) => ({
    id: `rc-stress-connection-${index}`,
    fromNodeId: nodes[index].id,
    toNodeId: nodes[index + 1].id,
    objectVersion: 1,
  }));
  return {
    id: 'rc-stress-project',
    title: 'RC canvas stress',
    nodes,
    connections,
    selectedNodeIds: [],
    viewport: { x: 0, y: 0, k: 1 },
    backgroundMode: 'dots',
    agentSessions: [],
    activeAgentSessionId: null,
    draftLog: [],
    draftChangeSets: [],
    draftRedoStack: [],
    draftVersion: 1,
    workflowMutationReceipts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function graphHash(project: WorkflowProject) {
  return JSON.stringify({
    nodes: project.nodes.map(({ objectVersion: _objectVersion, ...node }) => node),
    connections: project.connections.map(({ objectVersion: _objectVersion, ...connection }) => connection),
  });
}

function moveNode(project: WorkflowProject, index: number) {
  const node = project.nodes[index % project.nodes.length];
  const result = applyWorkflowMutation(project, {
    clientId: 'rc-canvas-stress',
    projectId: project.id,
    expectedRevision: project.draftVersion || 1,
    mutationId: `rc-stress-mutation-${index}`,
    source: 'agent',
    intent: 'RC deterministic canvas mutation',
    ops: [{
      type: 'move_nodes',
      positions: [{ id: node.id, position: { x: node.position.x + index + 1, y: node.position.y + index + 2 } }],
    }],
  });
  if (result.ok === false) throw new Error(result.error.message);
  return result.project;
}

describe('release candidate canvas stress invariants', () => {
  it('builds a 500-node/499-edge graph without malformed references', () => {
    const project = createStressProject();
    expect(project.nodes).toHaveLength(500);
    expect(project.connections).toHaveLength(499);
    expect(project.connections.every(connection => (
      project.nodes.some(node => node.id === connection.fromNodeId)
      && project.nodes.some(node => node.id === connection.toNodeId)
    ))).toBe(true);
  });

  it('returns to the exact graph after 100 undo steps and replays 100 redo steps', () => {
    const initial = createStressProject(100);
    const initialHash = graphHash(initial);
    let current = initial;
    for (let index = 0; index < 100; index += 1) current = moveNode(current, index);
    const finalHash = graphHash(current);

    for (let index = 0; index < 100; index += 1) {
      const result = undoWorkflowDraftChangeSet(current);
      expect(result.ok).toBe(true);
      if (result.ok) current = result.project;
    }
    expect(graphHash(current)).toBe(initialHash);
    expect(current.nodes).toHaveLength(100);
    expect(current.connections).toHaveLength(99);

    for (let index = 0; index < 100; index += 1) {
      const result = redoWorkflowDraftChangeSet(current);
      expect(result.ok).toBe(true);
      if (result.ok) current = result.project;
    }
    expect(graphHash(current)).toBe(finalHash);
    expect(current.draftRedoStack).toHaveLength(0);
    expect(current.draftVersion).toBe(301);
  });
});
