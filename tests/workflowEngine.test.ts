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

  it('saves image outputs into the asset callback when saveToAssets runs', async () => {
    const imageHref = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
    const nodes: WorkflowNode[] = [
      { id: 'load_1', kind: 'loadImage', x: 0, y: 0 },
      {
        id: 'asset_1',
        kind: 'saveToAssets',
        x: 320,
        y: 0,
        config: { assetCategory: 'scene', assetName: 'Workflow Scene' },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'load_1', fromPort: 'image', toNode: 'asset_1', toPort: 'result' },
    ];
    const onSaveToAssets = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputImages: [imageHref],
      onSaveToAssets,
    });

    expect(result.success).toBe(true);
    expect(onSaveToAssets).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', href: imageHref }),
      expect.objectContaining({
        id: 'asset_1',
        config: expect.objectContaining({ assetCategory: 'scene', assetName: 'Workflow Scene' }),
      }),
    );
  });

  it('reports a clear node error when saveToAssets receives non-image output', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'prompt_1', kind: 'prompt', x: 0, y: 0 },
      { id: 'asset_1', kind: 'saveToAssets', x: 320, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'asset_1', toPort: 'result' },
    ];

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputPrompt: 'Just text',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        nodeId: 'asset_1',
        error: 'Save To Assets 目前仅支持图片输出',
      }),
    ]);
  });

  it('loads canvas video inputs through loadVideo nodes', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'load_video_1', kind: 'loadVideo', x: 0, y: 0 },
      { id: 'save_1', kind: 'saveToCanvas', x: 320, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'load_video_1', fromPort: 'video', toNode: 'save_1', toPort: 'result' },
    ];
    const onPlaceOnCanvas = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputVideos: [{
        id: 'video_1',
        kind: 'video',
        href: 'blob:canvas-video',
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
        posterHref: 'data:image/png;base64,cG9zdGVy',
        durationSec: 8,
        trimInSec: 1,
        trimOutSec: 6,
      }],
      onPlaceOnCanvas,
    });

    expect(result.success).toBe(true);
    expect(result.nodeOutputs.get('load_video_1')?.video).toMatchObject({
      kind: 'video',
      href: 'blob:canvas-video',
      mimeType: 'video/mp4',
      posterHref: 'data:image/png;base64,cG9zdGVy',
      durationSec: 8,
      trimInSec: 1,
      trimOutSec: 6,
      sourceVideoId: 'video_1',
    });
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'video',
        href: 'blob:canvas-video',
        trimInSec: 1,
        trimOutSec: 6,
      }),
    );
  });

  it('applies normalized trim metadata in videoEdit nodes', async () => {
    const nodes: WorkflowNode[] = [
      { id: 'load_video_1', kind: 'loadVideo', x: 0, y: 0 },
      {
        id: 'video_edit_1',
        kind: 'videoEdit',
        x: 320,
        y: 0,
        config: {
          trimInSec: 2.5,
          trimOutSec: 9,
        },
      },
      { id: 'save_1', kind: 'saveToCanvas', x: 640, y: 0 },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'load_video_1', fromPort: 'video', toNode: 'video_edit_1', toPort: 'video' },
      { id: 'edge_2', fromNode: 'video_edit_1', fromPort: 'video', toNode: 'save_1', toPort: 'result' },
    ];
    const onPlaceOnCanvas = vi.fn();

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputVideos: [{
        id: 'video_1',
        kind: 'video',
        href: 'blob:canvas-video',
        mimeType: 'video/mp4',
        width: 960,
        height: 540,
        durationSec: 7,
      }],
      onPlaceOnCanvas,
    });

    expect(result.success).toBe(true);
    expect(result.nodeOutputs.get('video_edit_1')?.video).toMatchObject({
      kind: 'video',
      href: 'blob:canvas-video',
      trimInSec: 2.5,
      trimOutSec: 7,
      sourceVideoId: 'video_1',
    });
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'video',
        trimInSec: 2.5,
        trimOutSec: 7,
      }),
    );
  });

  it('replaces video poster frames when videoEdit receives an image input', async () => {
    const imageHref = 'data:image/png;base64,cG9zdGVyLWltYWdl';
    const nodes: WorkflowNode[] = [
      { id: 'load_video_1', kind: 'loadVideo', x: 0, y: 0 },
      { id: 'load_image_1', kind: 'loadImage', x: 0, y: 240 },
      {
        id: 'video_edit_1',
        kind: 'videoEdit',
        x: 320,
        y: 0,
        config: {
          videoEditMode: 'replacePoster',
        },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'load_video_1', fromPort: 'video', toNode: 'video_edit_1', toPort: 'video' },
      { id: 'edge_2', fromNode: 'load_image_1', fromPort: 'image', toNode: 'video_edit_1', toPort: 'image' },
    ];

    const result = await executeWorkflow(nodes, edges, {
      apiKeys: [],
      inputImages: [imageHref],
      inputVideos: [{
        id: 'video_1',
        kind: 'video',
        href: 'blob:canvas-video',
        mimeType: 'video/mp4',
        width: 960,
        height: 540,
        posterHref: 'data:image/png;base64,b2xkLXBvc3Rlcg==',
      }],
    });

    expect(result.success).toBe(true);
    expect(result.nodeOutputs.get('video_edit_1')?.video).toMatchObject({
      kind: 'video',
      href: 'blob:canvas-video',
      posterHref: imageHref,
      sourceVideoId: 'video_1',
    });
  });
});
