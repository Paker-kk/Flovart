import { describe, expect, it } from 'vitest';

import { collectNodeInputValues, normalizeWorkflowProgressStatus } from '../components/nodeflow/runDetails';
import type { NodeIOMap, WorkflowEdge } from '../components/nodeflow/types';

describe('normalizeWorkflowProgressStatus', () => {
  it('keeps explicit workflow statuses, including pinned', () => {
    expect(normalizeWorkflowProgressStatus('queued')).toBe('queued');
    expect(normalizeWorkflowProgressStatus('pinned')).toBe('pinned');
    expect(normalizeWorkflowProgressStatus('skipped')).toBe('skipped');
  });

  it('treats provider progress messages as running', () => {
    expect(normalizeWorkflowProgressStatus('RunningHub: submitted')).toBe('running');
    expect(normalizeWorkflowProgressStatus('retry 1/2 (1200ms)')).toBe('running');
  });
});

describe('collectNodeInputValues', () => {
  it('maps upstream output ports onto the selected node input ports', () => {
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'template_1', toPort: 'var1' },
      { id: 'edge_2', fromNode: 'image_1', fromPort: 'image', toNode: 'template_1', toPort: 'var2' },
    ];
    const outputsByNode = new Map<string, NodeIOMap | undefined>([
      ['prompt_1', { text: { kind: 'text', text: 'castle' } }],
      ['image_1', { image: { kind: 'image', href: 'data:image/png;base64,abc', mimeType: 'image/png' } }],
    ]);

    const inputs = collectNodeInputValues('template_1', edges, outputsByNode);

    expect(inputs).toEqual({
      var1: { kind: 'text', text: 'castle' },
      var2: { kind: 'image', href: 'data:image/png;base64,abc', mimeType: 'image/png' },
    });
  });

  it('ignores missing upstream outputs', () => {
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'template_1', toPort: 'var1' },
    ];
    const outputsByNode = new Map<string, NodeIOMap | undefined>([['prompt_1', undefined]]);

    expect(collectNodeInputValues('template_1', edges, outputsByNode)).toEqual({});
  });
});
