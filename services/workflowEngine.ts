/**
 * Workflow Execution Engine
 * Topological sort → sequential node execution → data propagation
 */
import type { WorkflowNode, WorkflowEdge, NodeKind } from '../components/nodeflow/types';
import { NODE_DEFS } from '../components/nodeflow/defs';
import type { AIProvider, UserApiKey } from '../types';
import { normalizeProviderBaseUrl } from './baseUrl';

// ──── Data Types ────

export type PortValue = string | null; // text, image dataURL, video URL, etc.

export interface NodeIOMap {
  [portKey: string]: PortValue;
}

export interface ExecutionContext {
  /** User's API keys (for LLM / ImageGen / Video / RunningHub calls) */
  apiKeys: UserApiKey[];
  /** Resolved prompt text from the prompt/loadImage nodes */
  inputPrompt?: string;
  /** Input images (dataURL) */
  inputImages?: string[];
  /** Callback: place an image on the canvas */
  onPlaceOnCanvas?: (dataUrl: string, width: number, height: number) => void;
  /** Callback: progress updates */
  onProgress?: (nodeId: string, status: string) => void;
  /** Callback: node completed */
  onNodeComplete?: (nodeId: string, outputs: NodeIOMap) => void;
  /** Callback: error */
  onError?: (nodeId: string, error: string) => void;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
}

export interface ExecutionResult {
  success: boolean;
  nodeOutputs: Map<string, NodeIOMap>;
  errors: { nodeId: string; error: string }[];
  /** Total cost estimate in cents (if traceable) */
  estimatedCost?: number;
}

// ──── Topological Sort ────

export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }

  for (const e of edges) {
    inDegree.set(e.toNode, (inDegree.get(e.toNode) || 0) + 1);
    adjacency.get(e.fromNode)?.push(e.toNode);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const next of adjacency.get(id) || []) {
      const d = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error('工作流存在循环依赖，无法执行');
  }

  return sorted;
}

// ──── Node Executors ────

function getApiKeyForProvider(ctx: ExecutionContext, provider: string): string {
  const key = ctx.apiKeys.find(
    (k) => k.provider === provider || k.provider === 'custom',
  );
  if (!key?.key) throw new Error(`未配置 ${provider} 的 API Key`);
  return key.key;
}

function getDefaultApiKey(ctx: ExecutionContext, ...providers: AIProvider[]): UserApiKey | undefined {
  for (const p of providers) {
    const key = ctx.apiKeys.find((k) => k.provider === p && k.key);
    if (key) return key;
  }
  return ctx.apiKeys.find((k) => k.isDefault && k.key);
}

async function executeLLM(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  const key = getDefaultApiKey(ctx, (node.config?.provider as AIProvider) || 'google', 'openai', 'anthropic', 'deepseek');
  if (!key) throw new Error('未找到可用的 LLM API Key');

  const systemPrompt = node.config?.systemPrompt || 'You are a helpful assistant.';
  const inputText = inputs.text || inputs.input || '';
  const model = node.config?.model || 'gemini-3-flash-preview';
  const temperature = node.config?.temperature ?? 0.7;
  const maxTokens = node.config?.maxTokens ?? 4096;

  // Use OpenAI-compatible API format (works for most providers)
  const { PROVIDER_LABELS } = await import('../services/aiGateway');

  if (key.provider === 'google') {
    // Use Gemini native format
    const { enhancePromptWithGemini, setGeminiRuntimeConfig } = await import('../services/geminiService');
    setGeminiRuntimeConfig({ textApiKey: key.key, imageApiKey: key.key, videoApiKey: key.key });
    const result = await enhancePromptWithGemini(inputText, systemPrompt, key.key);
    return { text: result || inputText };
  }

  // OpenAI-compatible
  const baseUrl = normalizeProviderBaseUrl(key.provider, key.baseUrl || 'https://api.openai.com/v1');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key.key}`,
      ...(key.provider === 'anthropic'
        ? { 'x-api-key': key.key, 'anthropic-version': '2023-06-01' }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputText },
      ],
    }),
    signal: ctx.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM 调用失败: ${err}`);
  }

  const json = await res.json();
  const text =
    json.choices?.[0]?.message?.content ||
    json.content?.[0]?.text ||
    '';
  return { text };
}

async function executeImageGen(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  const prompt = inputs.text || '';
  const refImage = inputs.image || null;
  const provider = (node.config?.provider as AIProvider) || 'google';
  const model = node.config?.model || (provider === 'openrouter' ? 'google/gemini-3.1-flash-image-preview' : provider === 'openai' ? 'gpt-image-1' : 'gemini-3.1-flash-image-preview');
  const key = getDefaultApiKey(ctx, provider);
  if (!key) throw new Error(`未找到 ${provider} 的 API Key`);

  if (provider === 'google' || provider === 'openai' || provider === 'openrouter' || provider === 'custom' || key.provider === 'google' || key.provider === 'openai' || key.provider === 'openrouter' || key.provider === 'custom') {
    const { editImageWithProvider, generateImageWithProvider } = await import('../services/aiGateway');
    const result = refImage
      ? await editImageWithProvider(
          [{ href: refImage, mimeType: 'image/png' }],
          prompt,
          model,
          key,
        )
      : await generateImageWithProvider(prompt, model, key);

    if (result?.newImageBase64 && result?.newImageMimeType) {
      return { image: `data:${result.newImageMimeType};base64,${result.newImageBase64}` };
    }

    return { image: null, text: result?.textResponse || '' };
  }

  // RunningHub-based image gen
  if (provider === 'runningHub' || key.provider === 'runningHub') {
    const { rhRunTask, rhUploadDataUrl } = await import('../services/runningHubService');
    const payload: Record<string, unknown> = {
      prompt,
      resolution: node.config?.rhResolution || '2k',
    };
    if (node.config?.rhAspectRatio) payload.aspectRatio = node.config.rhAspectRatio;
    if (refImage) {
      const uploadedUrl = await rhUploadDataUrl(key.key, refImage);
      payload.imageUrls = [uploadedUrl];
    }
    const endpoint = node.config?.rhEndpoint || 'rhart-image-n-pro-official/edit';
    const result = await rhRunTask(key.key, endpoint, payload as any, (status) => {
      ctx.onProgress?.(node.id, `RunningHub: ${status}`);
    });
    const imageUrl = result.results?.[0]?.url || null;
    // Fetch and convert to dataURL
    if (imageUrl) {
      const imgRes = await fetch(imageUrl);
      const blob = await imgRes.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return { image: dataUrl };
    }
    return { image: null };
  }

  throw new Error(`不支持的图片生成 Provider: ${provider}`);
}

async function executeVideoGen(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  const prompt = inputs.text || '';
  const firstFrame = inputs.image || null;
  const provider = (node.config?.provider as AIProvider) || 'google';
  const model = node.config?.model || (provider === 'minimax' ? 'video-01' : 'veo-3.1-generate-preview');
  const key = getDefaultApiKey(ctx, provider, 'google', 'minimax', 'keling');
  if (!key) throw new Error('未找到视频生成的 API Key');

  const { generateVideoWithProvider } = await import('../services/aiGateway');
  const result = await generateVideoWithProvider(
    prompt,
    model,
    key,
    {
      onProgress: (status) => ctx.onProgress?.(node.id, status),
      image: firstFrame ? { href: firstFrame, mimeType: 'image/png' } : undefined,
    },
  );
  if (result?.videoBlob) {
    const videoUrl = URL.createObjectURL(result.videoBlob);
    return { video: videoUrl };
  }
  return { video: null };
}

async function executeRunningHub(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  const key = getDefaultApiKey(ctx, 'runningHub');
  if (!key) throw new Error('未配置 RunningHub API Key');

  const { rhRunTask, rhUploadDataUrl } = await import('../services/runningHubService');
  const endpoint = node.config?.rhEndpoint || 'rhart-image-n-pro-official/edit';

  const payload: Record<string, unknown> = {
    prompt: inputs.text || '',
    resolution: node.config?.rhResolution || '2k',
  };
  if (node.config?.rhAspectRatio) payload.aspectRatio = node.config.rhAspectRatio;
  if (inputs.image) {
    const url = await rhUploadDataUrl(key.key, inputs.image);
    payload.imageUrls = [url];
  }

  const result = await rhRunTask(key.key, endpoint, payload as any, (status) => {
    ctx.onProgress?.(node.id, `RunningHub: ${status}`);
  });

  // Return all results
  const imageResult = result.results?.find((r) => r.outputType === 'png' || r.outputType === 'jpg');
  const videoResult = result.results?.find((r) => r.outputType === 'mp4');
  const textResult = result.results?.find((r) => r.text);

  if (imageResult) {
    const imgRes = await fetch(imageResult.url);
    const blob = await imgRes.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    return { result: dataUrl, image: dataUrl };
  }
  if (videoResult) {
    return { result: videoResult.url, video: videoResult.url };
  }
  if (textResult) {
    return { result: textResult.text, output: textResult.text };
  }

  return { result: null };
}

async function executeHttpRequest(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  const url = node.config?.httpUrl;
  if (!url) throw new Error('HTTP 节点未配置 URL');

  const method = node.config?.httpMethod || 'POST';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (node.config?.httpHeaders) {
    try {
      headers = { ...headers, ...JSON.parse(node.config.httpHeaders) };
    } catch {
      // ignore bad JSON
    }
  }

  // Interpolate body template with input values
  let body = node.config?.httpBodyTemplate || '';
  body = body.replace(/\{\{input\}\}/g, inputs.input || inputs.text || '');
  body = body.replace(/\{\{image\}\}/g, inputs.image || '');

  const res = await fetch(url, {
    method,
    headers,
    body: method !== 'GET' ? body : undefined,
    signal: ctx.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const responseText = await res.text();

  // Extract result via JSONPath if configured
  if (node.config?.httpResultPath) {
    try {
      const json = JSON.parse(responseText);
      const path = node.config.httpResultPath.split('.');
      let value: unknown = json;
      for (const key of path) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[key];
        }
      }
      return { output: String(value ?? ''), result: String(value ?? '') };
    } catch {
      return { output: responseText, result: responseText };
    }
  }

  return { output: responseText, result: responseText };
}

function executeTemplate(
  node: WorkflowNode,
  inputs: NodeIOMap,
): NodeIOMap {
  let text = node.config?.templateText || '';
  text = text.replace(/\{\{var1\}\}/g, inputs.var1 || '');
  text = text.replace(/\{\{var2\}\}/g, inputs.var2 || '');
  text = text.replace(/\{\{input\}\}/g, inputs.input || inputs.text || '');
  return { text };
}

function executeCondition(
  node: WorkflowNode,
  inputs: NodeIOMap,
): NodeIOMap {
  const expr = node.config?.conditionExpr || '';
  const input = inputs.input || inputs.text || '';
  let result = false;

  if (expr.includes('contains')) {
    const match = expr.match(/contains\s+['"](.+?)['"]/);
    if (match) result = input.includes(match[1]);
  } else if (expr.includes('empty')) {
    result = !input.trim();
  } else if (expr.includes('length>')) {
    const match = expr.match(/length>\s*(\d+)/);
    if (match) result = input.length > parseInt(match[1]);
  } else {
    result = !!input.trim();
  }

  return {
    true: result ? input : null,
    false: result ? null : input,
  };
}

function executeMerge(
  _node: WorkflowNode,
  inputs: NodeIOMap,
): NodeIOMap {
  const a = inputs.a || '';
  const b = inputs.b || '';
  return { output: [a, b].filter(Boolean).join('\n---\n') };
}

// ──── Main Executor ────

async function executeNode(
  node: WorkflowNode,
  inputs: NodeIOMap,
  ctx: ExecutionContext,
): Promise<NodeIOMap> {
  switch (node.kind) {
    case 'prompt':
      return { text: ctx.inputPrompt || inputs.text || '' };
    case 'loadImage':
      return { image: ctx.inputImages?.[0] || inputs.image || null };
    case 'enhancer':
    case 'llm':
      return executeLLM(node, inputs, ctx);
    case 'generator':
    case 'imageGen':
      return executeImageGen(node, inputs, ctx);
    case 'videoGen':
      return executeVideoGen(node, inputs, ctx);
    case 'runningHub':
      return executeRunningHub(node, inputs, ctx);
    case 'httpRequest':
      return executeHttpRequest(node, inputs, ctx);
    case 'template':
      return executeTemplate(node, inputs);
    case 'condition':
      return executeCondition(node, inputs);
    case 'merge':
      return executeMerge(node, inputs);
    case 'preview':
    case 'saveToCanvas':
      // Pass-through; side effects handled after execution
      return { result: inputs.result || inputs.image || inputs.video || inputs.input || null };
    default:
      return {};
  }
}

/**
 * Execute an entire workflow graph.
 */
export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const sorted = topologicalSort(nodes, edges);
  const nodeOutputs = new Map<string, NodeIOMap>();
  const errors: { nodeId: string; error: string }[] = [];

  for (const node of sorted) {
    if (ctx.signal?.aborted) {
      errors.push({ nodeId: node.id, error: '已取消' });
      break;
    }

    ctx.onProgress?.(node.id, 'running');

    // Collect inputs from connected edges
    const inputs: NodeIOMap = {};
    const incomingEdges = edges.filter((e) => e.toNode === node.id);
    for (const edge of incomingEdges) {
      const sourceOutputs = nodeOutputs.get(edge.fromNode);
      if (sourceOutputs) {
        const value = sourceOutputs[edge.fromPort];
        if (value !== undefined) {
          inputs[edge.toPort] = value;
        }
      }
    }

    try {
      const outputs = await executeNode(node, inputs, ctx);
      nodeOutputs.set(node.id, outputs);
      ctx.onNodeComplete?.(node.id, outputs);

      // Handle saveToCanvas / preview side effects
      if ((node.kind === 'saveToCanvas' || node.kind === 'preview') && ctx.onPlaceOnCanvas) {
        const result = outputs.result || outputs.image;
        if (result && typeof result === 'string' && result.startsWith('data:')) {
          // Get image dimensions
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = result;
          });
          ctx.onPlaceOnCanvas(result, img.naturalWidth || 512, img.naturalHeight || 512);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({ nodeId: node.id, error: errMsg });
      ctx.onError?.(node.id, errMsg);
      // Set empty outputs so downstream nodes can still try
      nodeOutputs.set(node.id, {});
    }
  }

  return {
    success: errors.length === 0,
    nodeOutputs,
    errors,
  };
}
