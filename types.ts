

export type Tool = 'select' | 'pan' | 'draw' | 'erase' | 'rectangle' | 'circle' | 'triangle' | 'text' | 'arrow' | 'highlighter' | 'lasso' | 'line';

export type WheelAction = 'zoom' | 'pan';

export type GenerationMode = 'image' | 'video' | 'keyframe';

export type WorkspaceView = 'canvas' | 'workflow' | 'storyboard' | 'assets' | 'diagnostics' | 'publish';

export interface Point {
  x: number;
  y: number;
}

interface CanvasElementBase {
  id: string;
  x: number;
  y: number;
  name?: string;
  isVisible?: boolean;
  isLocked?: boolean;
  parentId?: string;
}

/** 图片滤镜/调色参数 */
export interface ImageFilters {
  brightness: number;   // 0–200, default 100
  contrast: number;     // 0–200, default 100
  saturate: number;     // 0–200, default 100
  hueRotate: number;    // 0–360, default 0
  blur: number;         // 0–20,  default 0
  opacity: number;      // 0–100, default 100
  grayscale: number;    // 0–100, default 0
  sepia: number;        // 0–100, default 0
  temperature: number;  // -100–100, default 0 (暖色/冷色)
  sharpen: number;      // 0–100, default 0
}

export const DEFAULT_IMAGE_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  blur: 0,
  opacity: 100,
  grayscale: 0,
  sepia: 0,
  temperature: 0,
  sharpen: 0,
};

export interface ImageElement extends CanvasElementBase {
  type: 'image';
  href: string; 
  width: number;
  height: number;
  mimeType: string;
  borderRadius?: number;
  filters?: Partial<ImageFilters>;
  /** Non-destructive layer mask: data URL of grayscale image. White = visible, Black = hidden */
  mask?: string;
}

export interface VideoElement extends CanvasElementBase {
  type: 'video';
  href: string; // Blob URL
  width: number;
  height: number;
  mimeType: string;
  poster?: string;
  durationSec?: number;
  sourceKind?: 'upload' | 'workflow' | 'generation';
}

export interface PathElement extends CanvasElementBase {
  type: 'path';
  points: Point[];
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity?: number;
}

export interface ShapeElement extends CanvasElementBase {
    type: 'shape';
    shapeType: 'rectangle' | 'circle' | 'triangle';
    width: number;
    height: number;
    strokeColor: string;
    strokeWidth: number;
    fillColor: string;
    borderRadius?: number;
    strokeDashArray?: [number, number];
}

export interface TextElement extends CanvasElementBase {
    type: 'text';
    text: string;
    fontSize: number;
    fontColor: string;
    width: number;
    height: number;
}

export interface ArrowElement extends CanvasElementBase {
    type: 'arrow';
    points: [Point, Point];
    strokeColor: string;
    strokeWidth: number;
}

export interface LineElement extends CanvasElementBase {
    type: 'line';
    points: [Point, Point];
    strokeColor: string;
    strokeWidth: number;
}

export interface GroupElement extends CanvasElementBase {
    type: 'group';
    width: number;
    height: number;
}


export type Element = ImageElement | PathElement | ShapeElement | TextElement | ArrowElement | LineElement | GroupElement | VideoElement;

export interface UserEffect {
  id: string;
  name: string;
  value: string;
}

export interface Board {
  id: string;
  name: string;
  elements: Element[];
  history: Element[][];
  historyIndex: number;
  panOffset: Point;
  zoom: number;
  canvasBackgroundColor: string;
}

// Asset Library
export type AssetCategory = 'character' | 'scene' | 'prop';

export interface AssetItem {
  id: string;
  name?: string;
  category: AssetCategory;
  dataUrl: string; // base64 image
  mimeType: string; // image/png, image/jpeg
  width: number;
  height: number;
  createdAt: number;
  source?: 'local' | 'extension' | 'workflow' | 'generation' | 'recipe' | 'market';
  sourceUrl?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  generationParams?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
}

export interface AssetLibrary {
  character: AssetItem[];
  scene: AssetItem[];
  prop: AssetItem[];
}

export interface GenerationHistoryItem {
  id: string;
  name?: string;
  dataUrl: string;        // 图片 base64 或视频缩略图 base64
  mimeType: string;
  width: number;
  height: number;
  prompt: string;
  createdAt: number;
  /** 生成类型：image | video，默认 image */
  mediaType?: 'image' | 'video';
  provider?: string;
  model?: string;
  generationParams?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
}

export interface GenerationRecipe {
  prompt: string;
  provider?: string;
  model?: string;
  generationParams?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
}

export interface RecipePackage {
  version: 1;
  asset: {
    name?: string;
    category: AssetCategory;
    dataUrl: string;
    mimeType: string;
    width: number;
    height: number;
  };
  recipe: GenerationRecipe;
  createdAt: number;
}

// API Key & Model Preferences
export type ThemeMode = 'light' | 'dark' | 'system';
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'qwen' | 'banana' | 'deepseek' | 'siliconflow' | 'keling' | 'flux' | 'midjourney' | 'runningHub' | 'minimax' | 'volcengine' | 'openrouter' | 'custom';
export type AICapability = 'text' | 'image' | 'video' | 'agent';

/** 模型条目（用于结构化展示） */
export interface ModelItem {
  id: string;
  name: string;
}

export interface UserApiKey {
  id: string;
  provider: AIProvider;
  capabilities: AICapability[];
  key: string;
  baseUrl?: string;
  name?: string;
  isDefault?: boolean;
  status?: 'unknown' | 'ok' | 'error';
  /** 用户为这个 Key 自定义的可调用模型列表 */
  customModels?: string[];
  /** 这些自定义模型中用户设定的默认模型 */
  defaultModel?: string;
  /** 结构化模型列表（可选，优先于 customModels 展示） */
  models?: ModelItem[];
  /** Provider 特有的额外配置（如 Google Veo 的 projectId） */
  extraConfig?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface ModelPreference {
  textModel: string;
  imageModel: string;
  videoModel: string;
  agentModel: string;
}

// Agent / Workflow
export type WorkspaceMode = 'whiteboard' | 'node';

// Multi-Agent Chat System
export type AgentRoleId = 'creative_director' | 'prompt_engineer' | 'style_master' | 'compositor' | 'quality_reviewer' | string;

export interface AgentRole {
    id: AgentRoleId;
    name: string;
    emoji: string;
    color: string;
    systemPrompt: string;
    description: string;
}

export interface AgentConfig {
    id: string;
    roleId: AgentRoleId;
    enabled: boolean;
    provider?: AIProvider;
    model?: string;
}

export interface AgentMessage {
    id: string;
    agentId: string;
    agentName: string;
    agentEmoji: string;
    agentColor: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: number;
    isGenerating?: boolean;
    imageUrl?: string;
}

export interface AgentBudget {
    maxCost: number;
    currentCost: number;
    maxRounds: number;
}

export interface AgentSession {
    id: string;
    task: string;
    agents: AgentConfig[];
    messages: AgentMessage[];
    status: 'idle' | 'discussing' | 'generating' | 'completed' | 'error' | 'stopped';
    currentRound: number;
    budget: AgentBudget;
    finalPrompt?: string;
}
export type PromptEnhanceMode = 'smart' | 'style' | 'precise' | 'translate';

export interface PromptEnhanceRequest {
  prompt: string;
  mode: PromptEnhanceMode;
  stylePreset?: string;
}

export interface PromptEnhanceResult {
  enhancedPrompt: string;
  negativePrompt: string;
  suggestions: string[];
  notes?: string;
}

export interface CharacterLockProfile {
  id: string;
  name: string;
  anchorElementId: string;
  referenceImage: string; // dataURL
  descriptor: string;
  createdAt: number;
  isActive: boolean;
}

export interface ChatAttachment {
  id: string;
  name: string;
  href: string;
  mimeType: string;
  source: 'canvas' | 'upload';
}

// ──────────────────────────────────────────────
// Spatial Node Architecture — ADR-003 Isolation Protocol
// ──────────────────────────────────────────────

export type SpatialNodeType =
  | 'STATIC_ASSET'
  | 'PROMPT_TEXT'
  | 'GENERATE_IMAGE'
  | 'GENERATE_VIDEO'
  | 'STORYBOARD_TABLE';

export type RowStepStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';
export type NodeExecutionStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';

export interface BaseSpatialNode {
  id: string;
  type: SpatialNodeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  dependencies: string[];
}

/** 1. Static asset node */
export interface StaticAssetNode extends BaseSpatialNode {
  type: 'STATIC_ASSET';
  inputs: {
    src: string;
    fileName?: string;
  };
  outputs: {
    blobId: string;
  };
}

/** 2. Prompt / text script node */
export interface PromptTextNode extends BaseSpatialNode {
  type: 'PROMPT_TEXT';
  inputs: {
    text: string;
    rawTiptapJSON?: unknown;
  };
  outputs: {
    text: string;
  };
}

/** 3. Image generation compute node */
export interface GenerateImageNode extends BaseSpatialNode {
  type: 'GENERATE_IMAGE';
  inputs: {
    prompt: string;
    aspectRatio: '16:9' | '9:16' | '1:1' | '21:9';
    negativePrompt?: string;
    model?: string;
    maskData?: string;
  };
  outputs: {
    blobId?: string;
    mediaHref?: string;
    mediaMimeType?: string;
    width?: number;
    height?: number;
    candidates: string[];
    activeCandidateIndex?: number;
  };
  execution: {
    status: NodeExecutionStatus;
    error?: string;
    jobId?: string;
    startedAt?: number;
    finishedAt?: number;
    progressPercent?: number;
  };
}

/** 4. Video generation compute node */
export interface GenerateVideoNode extends BaseSpatialNode {
  type: 'GENERATE_VIDEO';
  inputs: {
    prompt: string;
    durationSec: number;
    aspectRatio?: '16:9' | '9:16' | '1:1' | '21:9';
    model?: string;
    motionVector?: { pan: number; zoom: number; orbit: number };
  };
  outputs: {
    blobId?: string;
    mediaHref?: string;
    mediaMimeType?: string;
    candidates: string[];
    activeCandidateIndex?: number;
  };
  execution: {
    status: NodeExecutionStatus;
    error?: string;
    jobId?: string;
    startedAt?: number;
    finishedAt?: number;
    progressPercent?: number;
  };
}

/** Row-level state machine for STORYBOARD_TABLE */
export interface RowExecution {
  rowIndex: number;
  rowId: string;
  status: RowStepStatus;
  errorMessage?: string;
  errorCode?: 'nsfw_blocked' | 'api_timeout' | 'rate_limited' | 'unknown';
  substeps: {
    imageGen: { status: RowStepStatus; jobId?: string; startedAt?: number };
    videoGen: { status: RowStepStatus; jobId?: string; startedAt?: number };
  };
  outputs: {
    imageBlobId?: string;
    videoBlobId?: string;
    thumbnailDataUrl?: string;
  };
  retryCount: number;
  maxRetries: number;
}

/** 5. Storyboard table batch-processing node */
export interface StoryboardTableNode extends BaseSpatialNode {
  type: 'STORYBOARD_TABLE';
  inputs: {
    csvFileMeta?: { name: string; size: number; rowCount: number };
    templatePrompt: string;
  };
  runtimePayload?: {
    columns: string[];
    rows: Record<string, string>[];
    rowExecutions: RowExecution[];
  };
  execution: {
    status: NodeExecutionStatus;
    progressPercent: number;
    summary: string;
    errorSummary?: string;
  };
}

export type SpatialNode =
  | StaticAssetNode
  | PromptTextNode
  | GenerateImageNode
  | GenerateVideoNode
  | StoryboardTableNode;

export interface SpatialEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/** Keep NodeType as a compatibility alias */
export type NodeType = SpatialNodeType;
