import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { NodeWorkflowPanel } from '../components/NodeWorkflowPanel';

describe('NodeWorkflowPanel smoke', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders the starter workflow without requiring side panels', () => {
    const { container } = render(
      <NodeWorkflowPanel
        prompt=""
        setPrompt={() => undefined}
        generationMode="image"
        setGenerationMode={() => undefined}
        attachments={[]}
        canvasImages={[]}
        canvasVideos={[]}
        onRemoveAttachment={() => undefined}
        onUploadFiles={() => undefined}
        onDropCanvasImage={() => undefined}
        userApiKeys={[]}
        onPlaceWorkflowValue={() => undefined}
        onSaveWorkflowValueToAssets={() => undefined}
      />,
    );

    expect(container.querySelector('.workflow-libtv')).toBeTruthy();
    expect(container.querySelectorAll('.workflow-node-card').length).toBeGreaterThan(0);
    expect(screen.queryByText('Connected Inputs')).toBeNull();
  });

  it('falls back to the starter graph when stored workflow nodes are unknown', () => {
    localStorage.setItem('flovart.nodeflow.v1', JSON.stringify({
      nodes: [{ id: 'old_1', kind: 'legacyNode', x: 0, y: 0 }],
      edges: [{ id: 'edge_legacy', fromNode: 'old_1', fromPort: 'out', toNode: 'missing', toPort: 'in' }],
      groups: [{ id: 'group_legacy', title: 'Old Group', x: 0, y: 0, width: 200, height: 120, nodeIds: ['old_1'] }],
    }));

    render(
      <NodeWorkflowPanel
        prompt=""
        setPrompt={() => undefined}
        generationMode="image"
        setGenerationMode={() => undefined}
        attachments={[]}
        canvasImages={[]}
        canvasVideos={[]}
        onRemoveAttachment={() => undefined}
        onUploadFiles={() => undefined}
        onDropCanvasImage={() => undefined}
        userApiKeys={[]}
        onPlaceWorkflowValue={() => undefined}
        onSaveWorkflowValueToAssets={() => undefined}
      />,
    );

    expect(screen.getAllByText('Generate').length).toBeGreaterThan(0);
    expect(screen.queryByText('legacyNode')).toBeNull();
  });

  it('keeps nodes on double click and opens the quick add menu from output ports', () => {
    const { container } = render(
      <NodeWorkflowPanel
        prompt=""
        setPrompt={() => undefined}
        generationMode="image"
        setGenerationMode={() => undefined}
        selectedImageModel="gemini-3.1-flash-image-preview"
        selectedVideoModel="veo-3.1-generate-preview"
        imageModelOptions={['gemini-3.1-flash-image-preview']}
        videoModelOptions={['veo-3.1-generate-preview']}
        attachments={[]}
        canvasImages={[]}
        canvasVideos={[]}
        onRemoveAttachment={() => undefined}
        onUploadFiles={() => undefined}
        onDropCanvasImage={() => undefined}
        userApiKeys={[]}
        onPlaceWorkflowValue={() => undefined}
        onSaveWorkflowValueToAssets={() => undefined}
      />,
    );

    const initialCount = container.querySelectorAll('.workflow-node-card').length;
    const firstNode = container.querySelector('.workflow-node-card');
    const canvas = container.querySelector('.workflow-canvas');
    expect(firstNode).toBeTruthy();
    expect(canvas).toBeTruthy();

    fireEvent.doubleClick(firstNode!);
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(initialCount);

    const firstHeader = firstNode!.querySelector('.workflow-node-header');
    expect(firstHeader).toBeTruthy();
    fireEvent.mouseDown(firstHeader!, { clientX: 160, clientY: 160, button: 0 });
    fireEvent.mouseMove(canvas!, { clientX: 260, clientY: 220 });
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(initialCount);
    fireEvent.mouseUp(canvas!, { clientX: 260, clientY: 220 });
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(initialCount);

    const outputPort = container.querySelector('[data-port-type="output"]');
    expect(outputPort).toBeTruthy();
    fireEvent.mouseDown(outputPort!, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseMove(canvas!, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(canvas!, { clientX: 300, clientY: 240 });

    expect(screen.getByText('引用该节点生成')).toBeTruthy();
  });
});
