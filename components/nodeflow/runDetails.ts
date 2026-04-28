import type { NodeIOMap, WorkflowEdge, WorkflowRunStatus } from './types';

const EXPLICIT_PROGRESS_STATUSES = new Set<WorkflowRunStatus>([
  'idle',
  'queued',
  'running',
  'success',
  'error',
  'skipped',
  'pinned',
]);

export function normalizeWorkflowProgressStatus(status: string): WorkflowRunStatus {
  if (EXPLICIT_PROGRESS_STATUSES.has(status as WorkflowRunStatus)) {
    return status as WorkflowRunStatus;
  }
  return 'running';
}

export function collectNodeInputValues(
  nodeId: string,
  edges: WorkflowEdge[],
  outputsByNode: Map<string, NodeIOMap | undefined>,
): NodeIOMap {
  const inputs: NodeIOMap = {};

  for (const edge of edges) {
    if (edge.toNode !== nodeId) continue;
    const sourceOutputs = outputsByNode.get(edge.fromNode);
    const value = sourceOutputs?.[edge.fromPort];
    if (value !== undefined) {
      inputs[edge.toPort] = value;
    }
  }

  return inputs;
}
