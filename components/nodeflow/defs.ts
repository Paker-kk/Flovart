import type { NodeDefinition, NodeKind, WorkflowEdge, WorkflowGroup, WorkflowNode } from './types';

export const NODE_DEFS: Record<NodeKind, NodeDefinition> = {
  prompt: {
    title: 'CLIP Text Encode (Prompt)',
    width: 360,
    height: 240,
    inputs: [],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT' }],
  },
  loadImage: {
    title: 'Load Image',
    width: 300,
    height: 160,
    inputs: [],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  enhancer: {
    title: 'Prompt Enhancer Agent',
    width: 320,
    height: 170,
    inputs: [{ key: 'text', type: 'text', label: 'TEXT IN' }],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT OUT' }],
  },
  generator: {
    title: 'KSampler / Generator',
    width: 360,
    height: 190,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'IMAGE' },
    ],
    outputs: [{ key: 'result', type: 'result', label: 'RESULT' }],
  },
  preview: {
    title: 'Preview / Save Output',
    width: 280,
    height: 130,
    inputs: [{ key: 'result', type: 'result', label: 'RESULT IN' }],
    outputs: [],
  },
  // ──── New Agent / Workflow Nodes ────
  llm: {
    title: 'LLM 大语言模型',
    width: 380,
    height: 220,
    inputs: [{ key: 'text', type: 'text', label: 'INPUT' }],
    outputs: [{ key: 'text', type: 'text', label: 'OUTPUT' }],
  },
  imageGen: {
    title: '图片生成 (AIGC)',
    width: 360,
    height: 200,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'REF IMAGE' },
    ],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  videoGen: {
    title: '视频生成',
    width: 360,
    height: 200,
    inputs: [
      { key: 'text', type: 'text', label: 'PROMPT' },
      { key: 'image', type: 'image', label: 'FIRST FRAME' },
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
    title: 'HTTP / MCP 请求',
    width: 380,
    height: 220,
    inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
    outputs: [{ key: 'output', type: 'any', label: 'OUTPUT' }],
  },
  condition: {
    title: '条件分支',
    width: 300,
    height: 160,
    inputs: [{ key: 'input', type: 'any', label: 'INPUT' }],
    outputs: [
      { key: 'true', type: 'any', label: 'TRUE' },
      { key: 'false', type: 'any', label: 'FALSE' },
    ],
  },
  merge: {
    title: '合并',
    width: 280,
    height: 140,
    inputs: [
      { key: 'a', type: 'any', label: 'A' },
      { key: 'b', type: 'any', label: 'B' },
    ],
    outputs: [{ key: 'output', type: 'any', label: 'OUTPUT' }],
  },
  template: {
    title: '文本模板',
    width: 340,
    height: 180,
    inputs: [
      { key: 'var1', type: 'text', label: 'VAR1' },
      { key: 'var2', type: 'text', label: 'VAR2' },
    ],
    outputs: [{ key: 'text', type: 'text', label: 'TEXT' }],
  },
  switch: {
    title: '多路分支 (Switch)',
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
    title: '超分辨率 (Upscale)',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  faceRestore: {
    title: '人脸修复',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  bgRemove: {
    title: '背景移除',
    width: 320,
    height: 160,
    inputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
    outputs: [{ key: 'image', type: 'image', label: 'IMAGE' }],
  },
  saveToCanvas: {
    title: '保存到画布',
    width: 280,
    height: 130,
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

