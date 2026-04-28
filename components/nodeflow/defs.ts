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
    title: 'Image Generate',
    width: 310,
    height: 170,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'REF IMAGE' },
    ],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  videoGen: {
    title: 'Video Generate',
    width: 310,
    height: 170,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'FIRST FRAME' },
    ],
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
  { id: 'prompt_1', kind: 'prompt', x: 240, y: 120 },
  { id: 'image_1', kind: 'loadImage', x: 260, y: 460 },
  { id: 'enhancer_1', kind: 'enhancer', x: 740, y: 140 },
  { id: 'generator_1', kind: 'generator', x: 1180, y: 260 },
  { id: 'preview_1', kind: 'preview', x: 1600, y: 280 },
];

export const INITIAL_EDGES: WorkflowEdge[] = [
  { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'enhancer_1', toPort: 'text' },
  { id: 'edge_2', fromNode: 'enhancer_1', fromPort: 'text', toNode: 'generator_1', toPort: 'text' },
  { id: 'edge_3', fromNode: 'image_1', fromPort: 'image', toNode: 'generator_1', toPort: 'image' },
  { id: 'edge_4', fromNode: 'generator_1', fromPort: 'result', toNode: 'preview_1', toPort: 'result' },
];

export const INITIAL_GROUPS: WorkflowGroup[] = [];
