import { describe, expect, it, vi } from 'vitest';

import { executeWorkflow } from '../services/workflowEngine';
import type { WorkflowEdge, WorkflowNode } from '../components/nodeflow/types';

describe('workflowEngine', () => {
  it('propagates structured text values through template and preview nodes', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'prompt_1', kind: 'prompt', x: 0, y: 0 },
      {
        id: 'template_1',
        kind: 'template',
        x: 320,
        y: 0,
        config: { templateText: 'Scene: {{var1}}' },
      },
      { id: 'preview_1', kind: 'preview', x: 640, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'template_1', toPort: 'var1' },
      { id: 'edge_2', fromNode: 'template_1', fromPort: 'text', toNode: 'preview_1', toPort: 'result' },
    ];
    const onPlaceOnCanvas = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputPrompt: 'A castle on the hill',
      onPlaceOnCanvas,
    });

    const templateOutput = result.nodeOutputs.get('template_1')?.text;
    expect(result.success).toBe(true);
    expect(templateOutput).toMatchObject({ kind: 'text', text: 'Scene: A castle on the hill' });
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text', text: 'Scene: A castle on the hill' }),
    );
  });

  it('passes structured image values into saveToCanvas side effects', async () => {
    const imageHref = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
    const nodes: WorkflowNode[] = [
      { id: 'load_1', kind: 'loadImage', x: 0, y: 0 },
      { id: 'save_1', kind: 'saveToCanvas', x: 320, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'load_1', fromPort: 'image', toNode: 'save_1', toPort: 'result' },
    ];
    const onPlaceOnCanvas = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputImages: [imageHref],
      onPlaceOnCanvas,
    });

    expect(result.success).toBe(true);
    expect(result.nodeOutputs.get('load_1')?.image).toMatchObject({
      kind: 'image',
      href: imageHref,
      mimeType: 'image/png',
    });
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', href: imageHref }),
    );
  });

  it('reuses pinned outputs instead of executing the node again', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'template_1',
        kind: 'template',
        x: 0,
        y: 0,
        config: {
          templateText: 'This should not run',
          pinnedOutputs: {
            text: { kind: 'text', text: 'Pinned text' },
          },
        },
      },
      { id: 'preview_1', kind: 'preview', x: 320, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'template_1', fromPort: 'text', toNode: 'preview_1', toPort: 'result' },
    ];
    const onPlaceOnCanvas = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputPrompt: 'Ignored prompt',
      onPlaceOnCanvas,
    });

    expect(result.success).toBe(true);
    expect(result.nodeOutputs.get('template_1')?.text).toMatchObject({ kind: 'text', text: 'Pinned text' });
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'text', text: 'Pinned text' }),
    );
  });
});