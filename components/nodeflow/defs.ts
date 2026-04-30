import type { NodeDefinition, NodeKind, WorkflowEdge, WorkflowGroup, WorkflowNode } from './types';

export const NODE_DEFS: Record<NodeKind, NodeDefinition> = {
  prompt: {
    title: 'Prompt',
    width: 300,
    height: 190,
    inputs: [],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT' }],
  },
  loadImage: {
    title: 'Image Input',
    width: 260,
    height: 130,
    inputs: [],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  loadVideo: {
    title: 'Video Input',
    width: 260,
    height: 130,
    inputs: [],
    outputs: [{ key: 'video', type: 'video', label: 'VIDEO' }],
  },
  enhancer: {
    title: 'Prompt Enhance',
    width: 300,
    height: 150,
    inputs: [{ key: 'text', type: 'text', label: 'TEXT IN' }],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT OUT' }],
  },
  generator: {
    title: 'Generate',
    width: 310,
    height: 170,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'IMAGE' },
    ],
    outputs: [{ key: 'result', type: 'result', label: 'RESULT' }],
  },
  preview: {
    title: 'Preview',
    width: 240,
    height: 112,
    inputs: [{ key: 'result', type: 'result', label: 'RESULT IN' }],
    outputs: [],
  },
  llm: {
    title: 'LLM',
    width: 380,
    height: 220,
    inputs: [{ key: 'text', type: 'text', label: 'INPUT' }],
    outputs: [{ key: 'text', type: 'text', label: 'OUTPUT' }],
  },
  imageGen: {
    title: 'Image',
    width: 260,
    height: 146,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE IN' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  videoGen: {
    title: 'Video',
    width: 260,
    height: 146,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE IN' }],
    outputs: [{ key: 'video', type: 'video', label: 'VIDEO' }],
  },
  videoEdit: {
    title: 'Video Edit',
    width: 310,
    height: 180,
    inputs: [
      { key: 'video', type: 'video', label: 'VIDEO' },
      { key: 'image', type: 'image', label: 'POSTER' },
      { key: 'text', type: 'text', label: 'PROMPT' },
    ],
    outputs: [{ key: 'video', type: 'video', label: 'VIDEO' }],
  },
  runningHub: {
    title: 'RunningHub',
    width: 380,
    height: 220,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'IMAGE' },
    ],
    outputs: [{ key: 'result', type: 'result', label: 'RESULT' }],
  },
  httpRequest: {
    title: 'HTTP / MCP Request',
    width: 380,
    height: 220,
    inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
    outputs: [{ key: 'output', type: 'any', label: 'OUTPUT' }],
  },
  condition: {
    title: 'Condition',
    width: 300,
    height: 160,
    inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
    outputs: [
      { key: 'true', type: 'any', label: 'TRUE' },
      { key: 'false', type: 'any', label: 'FALSE' },
    ],
  },
  merge: {
    title: 'Merge',
    width: 280,
    height: 140,
    inputs: [
      { key: 'a', type: 'any', label: 'A' },
      { key: 'b', type: 'any', label: 'B' },
    ],
    outputs: [{ key: 'output', type: 'any', label: 'OUTPUT' }],
  },
  template: {
    title: 'Text Template',
    width: 340,
    height: 180,
    inputs: [
      { key: 'var1', type: 'text', label: 'VAR1' },
      { key: 'var2', type: 'text', label: 'VAR2' },
    ],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT' }],
  },
  switch: {
    title: 'Switch',
    width: 340,
    height: 200,
    inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
    outputs: [
      { key: 'out_0', type: 'any', label: 'CASE 0' },
      { key: 'out_1', type: 'any', label: 'CASE 1' },
      { key: 'out_2', type: 'any', label: 'CASE 2' },
      { key: 'out_3', type: 'any', label: 'CASE 3' },
      { key: 'default', type: 'any', label: 'DEFAULT' },
    ],
  },
  upscale: {
    title: 'Upscale',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  faceRestore: {
    title: 'Face Restore',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  bgRemove: {
    title: 'Background Remove',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  saveToCanvas: {
    title: 'Save',
    width: 240,
    height: 112,
    inputs: [{ key: 'result', type: 'any', label: 'RESULT IN' }],
    outputs: [],
  },
  saveToAssets: {
    title: 'Save To Assets',
    width: 300,
    height: 140,
    inputs: [{ key: 'result', type: 'any', label: 'RESULT IN' }],
    outputs: [],
  },
};

export const INITIAL_NODES: WorkflowNode[] = [
  { id: 'image_1', kind: 'imageGen', x: 240, y: 180, config: { label: 'Image' } },
  { id: 'video_1', kind: 'videoGen', x: 680, y: 180, config: { label: 'Video' } },
];

export const INITIAL_EDGES: WorkflowEdge[] = [
  { id: 'edge_1', fromNode: 'image_1', fromPort: 'image', toNode: 'video_1', toPort: 'image' },
];

export const INITIAL_GROUPS: WorkflowGroup[] = [];
