import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

  it('starts with only the simple image and video media nodes', () => {
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

    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(2);
    expect(screen.getAllByText('图片节点 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('视频节点 2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Prompt')).toBeNull();
    expect(screen.queryByText('Prompt Enhance')).toBeNull();
  });

  it('stores an uploaded image on the selected image node card', async () => {
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

    const uploadButton = screen.getByTitle('Upload media to Image');
    fireEvent.click(uploadButton);

    const mediaInput = container.querySelector('input[data-testid="workflow-node-media-input"]');
    expect(mediaInput).toBeTruthy();
    const file = new File(['fake image'], 'reference.png', { type: 'image/png' });
    fireEvent.change(mediaInput!, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.querySelector('img[alt="Image media"]')).toBeTruthy();
    });
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

    expect(screen.getAllByText('图片节点 2').length).toBeGreaterThan(0);
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

    expect(screen.getByText('Create linked node')).toBeTruthy();
  });

  it('zooms the canvas when scrolling over a node prompt bar because it belongs to the transformed graph', () => {
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

    const firstNode = container.querySelector('.workflow-node-card');
    const transformedGraph = container.querySelector('.workflow-canvas > div[style*="transform"]') as HTMLElement | null;
    expect(firstNode).toBeTruthy();
    expect(transformedGraph).toBeTruthy();

    fireEvent.click(firstNode!);
    const composer = container.querySelector('.workflow-floating-composer');
    expect(composer).toBeTruthy();
    expect(composer?.className).toContain('absolute');
    expect(composer?.className).not.toContain('fixed');
    expect(transformedGraph?.contains(composer!)).toBe(true);

    const before = transformedGraph!.style.transform;
    fireEvent.wheel(composer!, { deltaY: -120, clientX: 420, clientY: 360 });

    expect(transformedGraph!.style.transform).not.toBe(before);
  });

  it('keeps the node prompt bar in the transformed graph so it moves and scales with the node', () => {
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

    const firstNode = container.querySelector('.workflow-node-card');
    const canvas = container.querySelector('.workflow-canvas');
    const transformedGraph = container.querySelector('.workflow-canvas > div[style*="transform"]') as HTMLElement | null;
    expect(firstNode).toBeTruthy();
    expect(canvas).toBeTruthy();
    expect(transformedGraph).toBeTruthy();

    fireEvent.click(firstNode!);
    const composer = container.querySelector('.workflow-floating-composer') as HTMLElement | null;
    expect(composer).toBeTruthy();
    expect(transformedGraph?.contains(composer!)).toBe(true);
    expect(composer?.className).toContain('absolute');
    expect(composer?.className).not.toContain('fixed');

    const before = { left: composer!.style.left, top: composer!.style.top };
    const transformBefore = transformedGraph!.style.transform;
    fireEvent.wheel(canvas!, { deltaY: -120, clientX: 480, clientY: 260 });

    expect(transformedGraph!.style.transform).not.toBe(transformBefore);
    expect(composer!.style.left).toBe(before.left);
    expect(composer!.style.top).toBe(before.top);
  });

  it('centers the compact prompt bar under the selected node with the reduced control set', () => {
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

    const firstNode = container.querySelector('.workflow-node-card') as HTMLElement | null;
    expect(firstNode).toBeTruthy();
    fireEvent.click(firstNode!);

    const composer = container.querySelector('.workflow-floating-composer') as HTMLElement | null;
    expect(composer).toBeTruthy();

    const nodeCenter = parseFloat(firstNode!.style.left) + parseFloat(firstNode!.style.width) / 2;
    const composerCenter = parseFloat(composer!.style.left) + parseFloat(composer!.style.width) / 2;
    expect(composerCenter).toBeCloseTo(nodeCenter);

    expect(composer?.textContent).toContain('Lib Nano Pro');
    expect(composer?.textContent).toContain('16:9');
    expect(composer?.textContent).toContain('2K');
    expect(composer?.textContent).toContain('1张');
    expect(composer?.querySelector('[aria-label="Expand prompt bar"]')).toBeNull();
    expect(composer?.querySelector('[aria-label="Translate prompt"]')).toBeNull();
    expect(composer?.querySelector('[aria-label="Generation settings"]')).toBeNull();
    expect(composer?.textContent).not.toContain('风格');
    expect(composer?.textContent).not.toContain('标记');
    expect(composer?.textContent).not.toContain('聚焦');
    expect(composer?.textContent).not.toContain('摄像机');
    expect(composer?.textContent).not.toContain('文A');
    expect(composer?.querySelector('.workflow-composer-energy')).toBeNull();
  });

  it('replicates the corrected left rail and bottom-left controls with dedicated actions', () => {
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

    expect(screen.getByLabelText('Add node')).toBeTruthy();
    expect(screen.getByLabelText('Open saved workflows')).toBeTruthy();
    expect(screen.getByLabelText('Open shared asset library')).toBeTruthy();
    expect(screen.getByLabelText('Open generation history')).toBeTruthy();
    expect(screen.getByLabelText('Undo')).toBeTruthy();
    expect(screen.getByLabelText('Redo')).toBeTruthy();

    expect(screen.getByLabelText('Auto arrange canvas')).toBeTruthy();
    expect(screen.getByLabelText('Toggle minimap')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.queryByLabelText('Toggle link mode')).toBeNull();
    expect(screen.queryByLabelText('Open material pins')).toBeNull();

    const initialCount = container.querySelectorAll('.workflow-node-card').length;
    fireEvent.click(screen.getByLabelText('Add node'));
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(initialCount);
    expect(screen.getByText('Create node')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Open saved workflows'));
    expect(screen.getByText('Saved workflows')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Open shared asset library'));
    expect(screen.getByText('Shared asset library')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Open generation history'));
    expect(screen.getByText('Generation history')).toBeTruthy();
  });

  it('uses the shared Canva asset library and generation history panels', () => {
    const useAsset = vi.fn();
    const placeWorkflowValue = vi.fn();
    render(
      <NodeWorkflowPanel
        prompt=""
        setPrompt={() => undefined}
        generationMode="image"
        setGenerationMode={() => undefined}
        attachments={[]}
        canvasImages={[]}
        canvasVideos={[]}
        assetLibrary={{
          character: [],
          scene: [{
            id: 'asset-scene-1',
            name: 'Shared Scene',
            category: 'scene',
            dataUrl: 'data:image/png;base64,scene',
            mimeType: 'image/png',
            width: 640,
            height: 360,
            createdAt: 100,
          }],
          prop: [],
        }}
        generationHistory={[{
          id: 'history-1',
          name: 'History Shot',
          dataUrl: 'data:image/png;base64,history',
          mimeType: 'image/png',
          width: 512,
          height: 512,
          prompt: 'castle in rain',
          createdAt: 200,
        }]}
        onRemoveAttachment={() => undefined}
        onUploadFiles={() => undefined}
        onDropCanvasImage={useAsset}
        userApiKeys={[]}
        onPlaceWorkflowValue={placeWorkflowValue}
        onSaveWorkflowValueToAssets={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open shared asset library'));
    expect(screen.getByText('Shared asset library')).toBeTruthy();
    expect(screen.getByText('Shared Scene')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Use asset Shared Scene'));
    expect(useAsset).toHaveBeenCalledWith({
      id: 'asset-scene-1',
      name: 'Shared Scene',
      href: 'data:image/png;base64,scene',
      mimeType: 'image/png',
    });

    fireEvent.click(screen.getByLabelText('Open generation history'));
    expect(screen.getByText('Generation history')).toBeTruthy();
    expect(screen.getByText('History Shot')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Apply history History Shot'));
    expect(placeWorkflowValue).toHaveBeenCalledWith({
      kind: 'image',
      href: 'data:image/png;base64,history',
      mimeType: 'image/png',
      width: 512,
      height: 512,
    });
  });

  it('saves the current workflow and can reuse it from the workflow panel', () => {
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

    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Open saved workflows'));
    expect(screen.getByText('Saved workflows')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Save current workflow'));
    expect(screen.getByText('Untitled Flow')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Add node'));
    fireEvent.click(screen.getByText('Text Prompt'));
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(3);

    fireEvent.click(screen.getByLabelText('Open saved workflows'));
    fireEvent.click(screen.getByLabelText('Reuse workflow Untitled Flow'));
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(2);
  });

  it('can save a single node media value to the shared asset library from the canvas menu', () => {
    localStorage.setItem('flovart.nodeflow.v1', JSON.stringify({
      nodes: [{
        id: 'image_saved_1',
        kind: 'imageGen',
        x: 240,
        y: 180,
        config: {
          mediaKind: 'image',
          mediaHref: 'data:image/png;base64,node',
          mediaMimeType: 'image/png',
          mediaWidth: 320,
          mediaHeight: 240,
          label: 'Node Asset',
        },
      }],
      edges: [],
      groups: [],
    }));
    const saveToAssets = vi.fn();
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
        onSaveWorkflowValueToAssets={saveToAssets}
      />,
    );

    const node = container.querySelector('.workflow-node-card');
    expect(node).toBeTruthy();
    fireEvent.contextMenu(node!, { clientX: 220, clientY: 200 });
    fireEvent.click(screen.getByText('Add node to asset library'));

    expect(saveToAssets).toHaveBeenCalledWith({
      kind: 'image',
      href: 'data:image/png;base64,node',
      mimeType: 'image/png',
      width: 320,
      height: 240,
    }, expect.objectContaining({ id: 'image_saved_1' }));
  });

  it('renders starter media nodes as compact visual cards without verbose helper labels', () => {
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

    const firstNode = container.querySelector('.workflow-node-card') as HTMLElement | null;
    expect(firstNode).toBeTruthy();
    expect(firstNode?.className).toContain('workflow-node-card-compact');
    expect(container.querySelectorAll('.workflow-node-caption')).toHaveLength(2);
    expect(container.querySelectorAll('.workflow-port-label')).toHaveLength(0);
    expect(screen.queryByText('drag')).toBeNull();
    expect(screen.queryByText('Upload')).toBeNull();
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.queryByText('Auto API key')).toBeNull();
    expect(screen.queryByText('Default model')).toBeNull();
  });

  it('keeps the linked-node menu open while moving from the canvas to the menu and can create a node', () => {
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
    const canvas = container.querySelector('.workflow-canvas');
    const outputPort = container.querySelector('[data-port-type="output"]');
    expect(canvas).toBeTruthy();
    expect(outputPort).toBeTruthy();

    fireEvent.mouseDown(outputPort!, { clientX: 200, clientY: 200, button: 0 });
    fireEvent.mouseMove(canvas!, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(canvas!, { clientX: 300, clientY: 240 });
    expect(screen.getByText('Create linked node')).toBeTruthy();

    fireEvent.mouseLeave(canvas!, { clientX: 310, clientY: 245 });
    expect(screen.getByText('Create linked node')).toBeTruthy();

    const connectionMenu = container.querySelector('.workflow-connection-menu');
    expect(connectionMenu).toBeTruthy();
    const imageMenuButton = Array.from(connectionMenu!.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Image'));
    expect(imageMenuButton).toBeTruthy();
    fireEvent.click(imageMenuButton!);
    expect(container.querySelectorAll('.workflow-node-card')).toHaveLength(initialCount + 1);
  });
});
