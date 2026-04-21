export type WorkflowStage = 'idle' | 'input' | 'agent' | 'generate' | 'output' | 'error';

export type WorkflowRunStatus = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'skipped' | 'pinned';

export type WorkflowValueKind = 'text' | 'image' | 'video' | 'json' | 'empty';

export interface WorkflowTextValue {
  kind: 'text';
  text: string;
}

export interface WorkflowImageValue {
  kind: 'image';
  href: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface WorkflowVideoValue {
  kind: 'video';
  href: string;
  mimeType: string;
  width?: number;
  height?: number;
  posterHref?: string;
}

export interface WorkflowJsonValue {
  kind: 'json';
  value: unknown;
}

export interface WorkflowEmptyValue {
  kind: 'empty';
}

export type WorkflowValue =
  | WorkflowTextValue
  | WorkflowImageValue
  | WorkflowVideoValue
  | WorkflowJsonValue
  | WorkflowEmptyValue;

export type PortValue = WorkflowValue | null;

export interface NodeIOMap {
  [portKey: string]: PortValue;
}

export interface WorkflowNodeRunState {
  status: WorkflowRunStatus;
  outputs?: NodeIOMap;
  error?: string;
  message?: string;
  updatedAt: number;
}

export const EMPTY_WORKFLOW_VALUE: WorkflowEmptyValue = { kind: 'empty' };

export function isWorkflowValueEmpty(value: PortValue | undefined): boolean {
  if (!value || value.kind === 'empty') return true;
  if (value.kind === 'text') return value.text.trim().length === 0;
  if (value.kind === 'json') {
    if (value.value == null) return true;
    if (Array.isArray(value.value)) return value.value.length === 0;
    if (typeof value.value === 'object') return Object.keys(value.value as Record<string, unknown>).length === 0;
  }
  return false;
}

export function getWorkflowTextContent(value: PortValue | undefined): string {
  if (!value || value.kind === 'empty') return '';
  if (value.kind === 'text') return value.text;
  if (value.kind === 'image' || value.kind === 'video') return value.href;
  if (typeof value.value === 'string') return value.value;
  try {
    return JSON.stringify(value.value, null, 2);
  } catch {
    return String(value.value ?? '');
  }
}

export function getWorkflowImageValue(value: PortValue | undefined): WorkflowImageValue | null {
  return value?.kind === 'image' ? value : null;
}

export function getWorkflowVideoValue(value: PortValue | undefined): WorkflowVideoValue | null {
  return value?.kind === 'video' ? value : null;
}

export function getPrimaryWorkflowValue(outputs: NodeIOMap | undefined | null): PortValue {
  if (!outputs) return null;
  const preferredKeys = ['result', 'image', 'video', 'text', 'output', 'input'];
  for (const key of preferredKeys) {
    const value = outputs[key];
    if (!isWorkflowValueEmpty(value)) return value ?? null;
  }
  for (const value of Object.values(outputs)) {
    if (!isWorkflowValueEmpty(value)) return value ?? null;
  }
  return null;
}

export function summarizeWorkflowValue(value: PortValue | undefined): string {
  if (isWorkflowValueEmpty(value)) return 'No output yet';
  if (!value) return 'No output yet';
  if (value.kind === 'text') return value.text.trim() || 'Empty text';
  if (value.kind === 'image') {
    return value.width && value.height
      ? `Image · ${value.width}x${value.height}`
      : `Image · ${value.mimeType}`;
  }
  if (value.kind === 'video') {
    return value.width && value.height
      ? `Video · ${value.width}x${value.height}`
      : `Video · ${value.mimeType}`;
  }
  if (Array.isArray(value.value)) return `JSON array · ${value.value.length} items`;
  if (value.value && typeof value.value === 'object') {
    return `JSON object · ${Object.keys(value.value as Record<string, unknown>).length} keys`;
  }
  return `JSON · ${String(value.value ?? '')}`;
}

export type NodeKind =
  | 'prompt'       // Text input
  | 'loadImage'    // Image input
  | 'enhancer'     // Prompt enhancer
  | 'generator'    // Image generation (AIGC)
  | 'preview'      // Output preview
  | 'llm'          // Generic LLM node (system prompt → text in → text out)
  | 'imageGen'     // Text/Image → Image (provider-agnostic)
  | 'videoGen'     // Text/Image → Video
  | 'runningHub'   // RunningHub ComfyUI API call
  | 'httpRequest'  // Generic HTTP / MCP call
  | 'condition'    // Branch based on text condition
  | 'switch'       // Multi-way branch (N output ports)
  | 'merge'        // Merge multiple inputs into one
  | 'template'     // Text template with {{variable}} interpolation
  | 'upscale'      // Image super-resolution
  | 'faceRestore'  // Face restoration (CodeFormer, GFPGAN)
  | 'bgRemove'     // Background removal
  | 'saveToCanvas';// Place result onto the drawing canvas

export type PortType = 'text' | 'image' | 'result' | 'video' | 'any';

export type XYPosition = { x: number; y: number };

export interface NodePort {
  key: string;
  type: PortType;
  label: string;
}

export interface NodeDefinition {
  title: string;
  width: number;
  height: number;
  inputs: NodePort[];
  outputs: NodePort[];
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** Per-node configuration (system prompt, model, URL, etc.) */
  config?: NodeConfig;
}

/** Node-specific configuration depending on kind */
export interface NodeConfig {
  /** Debug: pinned outputs reused instead of re-executing the node */
  pinnedOutputs?: NodeIOMap;
  /** LLM: system prompt */
  systemPrompt?: string;
  /** LLM / ImageGen / VideoGen: provider to use */
  provider?: string;
  /** LLM / ImageGen / VideoGen: model to use */
  model?: string;
  /** Generator: execution mode */
  generationMode?: 'image' | 'video';
  /** RunningHub: model endpoint path */
  rhEndpoint?: string;
  /** RunningHub: resolution (1k/2k/4k) */
  rhResolution?: '1k' | '2k' | '4k';
  /** RunningHub: aspect ratio */
  rhAspectRatio?: string;
  /** HTTP/MCP: request URL */
  httpUrl?: string;
  /** HTTP/MCP: HTTP method */
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** HTTP/MCP: request headers (JSON string) */
  httpHeaders?: string;
  /** HTTP/MCP: request body template (supports {{input}} variables) */
  httpBodyTemplate?: string;
  /** HTTP/MCP: JSONPath to extract result from response */
  httpResultPath?: string;
  /** Template: text template with {{variable}} placeholders */
  templateText?: string;
  /** Condition: expression to evaluate (e.g., "{{input}} contains 'error'") */
  conditionExpr?: string;
  /** Condition: multi-rule evaluation */
  conditionRules?: { field: string; operator: string; value: string; logicGroup?: 'and' | 'or' }[];
  /** Switch: case definitions [{label, rules}] */
  cases?: { label: string; rules: { field: string; operator: string; value: string; logicGroup?: 'and' | 'or' }[] }[];
  /** Upscale: scale factor */
  scale?: number;
  /** Upscale/FaceRestore/BgRemove: RunningHub workflow ID */
  workflowId?: string;
  /** FaceRestore: fidelity weight (0-1) */
  fidelity?: number;
  /** Retry: number of retry attempts for this node */
  retryCount?: number;
  /** Per-node timeout override */
  timeoutMs?: number;
  /** Generic label for display */
  label?: string;
  /** Temperature for LLM calls */
  temperature?: number;
  /** Max tokens for LLM calls */
  maxTokens?: number;
  /** RunningHub workflow variable bag */
  nodeConfigs?: Record<string, string>;
}

export interface WorkflowEdge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface WorkflowGroup {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
}

export interface WorkflowViewport {
  x: number;
  y: number;
  scale: number;
}

export interface PendingConnection {
  fromNode: string;
  fromPort: string;
  mouseX: number;
  mouseY: number;
}

export interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

