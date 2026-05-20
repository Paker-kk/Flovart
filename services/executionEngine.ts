/**
 * executionEngine — Node DAG Resolver & AI API Dispatcher (ADR-003)
 *
 * Given a SpatialNode, this engine:
 * 1. Reads dependencies from the ADR-003 independent dependency zone
 * 2. Walks the DAG to collect upstream outputs (Blobs from IndexedDB)
 * 3. Assembles the API payload (prompt + reference images/video)
 * 4. Dispatches to aiGateway
 * 5. Writes results back to useBoardStore + IndexedDB
 *
 * Priority Chain for STORYBOARD_TABLE nodes:
 *   running > queued > error > success > idle
 */
import type {
  SpatialNode,
  GenerateImageNode,
  GenerateVideoNode,
  StoryboardTableNode,
  StaticAssetNode,
  PromptTextNode,
  RowExecution,
} from '../types';
import { useBoardStore, computeTableSummary } from '../stores/useBoardStore';
import {
  isExtensionContext,
  generateImageViaExtension,
  generateVideoViaExtension,
  type ExtensionImageResult,
  type ExtensionVideoResult,
} from './extensionGateway';
import { generateImageWithProvider, generateVideoWithProvider, inferProviderFromModel } from './aiGateway';
import { getImage, putImage } from '../utils/imageDB';
import { getVideoBlob, putVideoBlob } from '../utils/mediaDB';

// ─── Dual-Pool Concurrency Isolation (ADR-003) ──

const POOL_CONFIG = {
  image: { maxConcurrency: 4 },
  video: { maxConcurrency: 2 },
};

class GenerationPool {
  private running = new Map<string, number>();
  private queues: Record<string, Array<() => Promise<void>>> = { image: [], video: [] };

  private poolFor(node: SpatialNode): 'image' | 'video' {
    if (node.type === 'GENERATE_VIDEO') return 'video';
    return 'image';
  }

  async enqueue<T>(node: SpatialNode, fn: () => Promise<T>): Promise<T> {
    const pool = this.poolFor(node);
    const config = POOL_CONFIG[pool];

    if ((this.running.get(pool) ?? 0) < config.maxConcurrency) {
      this.running.set(pool, (this.running.get(pool) ?? 0) + 1);
      try {
        return await fn();
      } finally {
        this.running.set(pool, (this.running.get(pool) ?? 1) - 1);
        this.drain(pool);
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queues[pool].push(async () => {
        this.running.set(pool, (this.running.get(pool) ?? 0) + 1);
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.running.set(pool, (this.running.get(pool) ?? 1) - 1);
          this.drain(pool);
        }
      });
    });
  }

  private drain(pool: 'image' | 'video') {
    const next = this.queues[pool].shift();
    if (next) next();
  }
}

export const generationPool = new GenerationPool();

// ─── Secure generation wrappers ──────────────

async function secureGenerateImage(
  prompt: string, model: string,
): Promise<{ newImageBase64: string | null; newImageMimeType: string | null; textResponse: string | null }> {
  if (isExtensionContext()) {
    const provider = inferProviderFromModel(model);
    const result: ExtensionImageResult = await generateImageViaExtension({ provider, model, prompt });
    if (result.images?.[0]) {
      return { newImageBase64: result.images[0].base64, newImageMimeType: result.images[0].mimeType, textResponse: null };
    }
    return { newImageBase64: null, newImageMimeType: null, textResponse: null };
  }
  return generateImageWithProvider(prompt, model);
}

async function secureGenerateVideo(
  prompt: string, model: string,
  options?: { aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'; onProgress?: (msg: string) => void; image?: { href: string; mimeType: string } },
): Promise<{ videoBlob: Blob; mimeType: string }> {
  if (isExtensionContext()) {
    const provider = inferProviderFromModel(model);
    options?.onProgress?.('Submitting via extension gateway...');
    const result: ExtensionVideoResult = await generateVideoViaExtension({
      provider, model, prompt,
      aspectRatio: options?.aspectRatio || '16:9',
      image: options?.image?.href,
    });
    if (result.videoBase64) {
      const binary = atob(result.videoBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.mimeType || 'video/mp4' });
      return { videoBlob: blob, mimeType: result.mimeType || 'video/mp4' };
    }
    throw new Error('Extension video generation returned no data');
  }
  return generateVideoWithProvider(prompt, model, undefined, options);
}

// ─── DAG Walker (ADR-003: uses dependencies array) ──

export function resolveDependencies(
  nodeId: string,
  nodeMap: Map<string, SpatialNode>,
  visited = new Set<string>(),
): SpatialNode[] {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);

  const node = nodeMap.get(nodeId);
  if (!node) return [];
  const depIds: string[] = (node as any).dependencies ?? [];
  if (!depIds.length) return [];

  const deps: SpatialNode[] = [];
  for (const depId of depIds) {
    const dep = nodeMap.get(depId);
    if (!dep) continue;
    deps.push(...resolveDependencies(depId, nodeMap, visited));
    deps.push(dep);
  }

  const seen = new Set<string>();
  return deps.filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

function allDependenciesReady(deps: SpatialNode[]): boolean {
  return deps.every(d => {
    const exec = (d as any).execution;
    return exec?.status === 'success' || exec?.status === 'completed';
  });
}

async function collectReferenceMedia(
  deps: SpatialNode[],
): Promise<Array<{ href: string; mimeType: string; blob?: Blob }>> {
  const refs: Array<{ href: string; mimeType: string; blob?: Blob }> = [];

  for (const dep of deps) {
    const outputs = (dep as any).outputs;
    const href = outputs?.mediaHref || outputs?.blobId || '';
    if (!href) continue;

    let blob: Blob | undefined;
    try {
      if (outputs?.blobId) {
        const mime = outputs?.mediaMimeType || '';
        const stored = mime.startsWith('video')
          ? await getVideoBlob(outputs.blobId) as Blob | undefined
          : await getImage(outputs.blobId) as any;
        blob = stored ?? undefined;
      }
    } catch {
      blob = undefined;
    }

    refs.push({ href, mimeType: outputs?.mediaMimeType || 'image/png', blob });
  }

  return refs;
}

// ─── Executor ─────────────────────────────────

export interface ExecutionResult {
  ok: boolean;
  mediaHref?: string;
  mediaMimeType?: string;
  blobId?: string;
  error?: string;
  width?: number;
  height?: number;
}

export async function executeNode(node: SpatialNode): Promise<ExecutionResult> {
  const store = useBoardStore.getState();
  const nodeMap = new Map(store.nodes.map(n => [n.id, n]));

  // Phase 1 nodes (PROMPT_TEXT, STATIC_ASSET) are always "done"
  if (node.type === 'PROMPT_TEXT') {
    store.updateNode(node.id, {
      execution: { status: 'success' },
    } as Partial<PromptTextNode>);
    return { ok: true };
  }

  if (node.type === 'STATIC_ASSET') {
    store.updateNode(node.id, {
      execution: { status: 'success' },
    } as Partial<StaticAssetNode>);
    return { ok: true };
  }

  // Compute nodes
  if (node.type !== 'GENERATE_IMAGE' && node.type !== 'GENERATE_VIDEO' && node.type !== 'STORYBOARD_TABLE') {
    throw new Error(`Unknown node type: ${(node as any).type}`);
  }

  if (node.type === 'STORYBOARD_TABLE') {
    return executeTableNode(node as StoryboardTableNode, store);
  }

  return generationPool.enqueue(node, () => executeMediaNode(node as GenerateImageNode | GenerateVideoNode, store, nodeMap));
}

async function executeMediaNode(
  node: GenerateImageNode | GenerateVideoNode,
  store: ReturnType<typeof useBoardStore.getState>,
  nodeMap: Map<string, SpatialNode>,
): Promise<ExecutionResult> {
  // Set status to running
  store.setNodeExecution(node.id, { status: 'running', progressPercent: 5, startedAt: Date.now() });

  try {
    // Resolve dependencies
    const deps = resolveDependencies(node.id, nodeMap);
    store.setNodeExecution(node.id, { progressPercent: 10 });

    // Check readiness
    if (deps.length > 0 && !allDependenciesReady(deps)) {
      const pending = deps.filter(d => {
        const exec = (d as any).execution;
        return exec?.status !== 'success' && exec?.status !== 'completed';
      });
      throw new Error(`Upstream nodes not ready: ${pending.map(d => d.id).join(', ')}`);
    }

    // Collect reference media
    const refs = await collectReferenceMedia(deps);
    store.setNodeExecution(node.id, { progressPercent: 20 });

    // Use the node's own prompt (ADR-003: prompt is kept clean, dependencies are separate)
    const prompt = node.inputs.prompt;

    if (node.type === 'GENERATE_IMAGE') {
      store.setNodeExecution(node.id, { progressPercent: 30 });

      const result = await secureGenerateImage(
        prompt,
        node.inputs.model || 'gemini-3.1-flash-image-preview',
      );

      if (result.newImageBase64 && result.newImageMimeType) {
        const href = `data:${result.newImageMimeType};base64,${result.newImageBase64}`;

        const dims = await new Promise<{ w: number; h: number }>(resolve => {
          const img = new Image();
          img.onload = () => resolve({ w: img.width, h: img.height });
          img.onerror = () => resolve({ w: 1024, h: 1024 });
          img.src = href;
        });

        const binary = atob(result.newImageBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.newImageMimeType });
        const blobId = `blob_img_${node.id}`;
        await putImage(blobId, blob as any);

        store.setNodeOutput(node.id, {
          blobId,
          mediaHref: href,
          mediaMimeType: result.newImageMimeType,
          width: dims.w,
          height: dims.h,
          candidates: node.outputs.candidates,
        });
        store.setNodeExecution(node.id, {
          status: 'success',
          progressPercent: 100,
          finishedAt: Date.now(),
        });

        return { ok: true, mediaHref: href, mediaMimeType: result.newImageMimeType, blobId, width: dims.w, height: dims.h };
      }

      throw new Error(result.textResponse || 'Image generation returned no data');
    }

    if (node.type === 'GENERATE_VIDEO') {
      store.setNodeExecution(node.id, { progressPercent: 30 });

      const refImage = refs.find(r => r.mimeType.startsWith('image'));
      const result = await secureGenerateVideo(
        prompt,
        node.inputs.model || 'veo-3.1-generate-preview',
        {
          aspectRatio: (node.inputs.aspectRatio as any) || '16:9',
          onProgress: (msg: string) => {
            store.setNodeExecution(node.id, { progressPercent: Math.min(90, 30 + Math.random() * 40) });
          },
          image: refImage ? { href: refImage.href, mimeType: refImage.mimeType } : undefined,
        },
      );

      const blobId = `blob_vid_${node.id}`;
      await putVideoBlob(blobId, result.videoBlob);
      const blobUrl = URL.createObjectURL(result.videoBlob);

      store.setNodeOutput(node.id, {
        blobId,
        mediaHref: blobUrl,
        mediaMimeType: result.mimeType,
        candidates: node.outputs.candidates,
      });
      store.setNodeExecution(node.id, {
        status: 'success',
        progressPercent: 100,
        finishedAt: Date.now(),
      });

      return { ok: true, mediaHref: blobUrl, mediaMimeType: result.mimeType, blobId };
    }

    throw new Error(`Unsupported node type: ${node.type}`);
  } catch (err) {
    const error = err as Error;
    store.setNodeExecution(node.id, { status: 'error', progressPercent: 0, finishedAt: Date.now(), error: error.message });
    return { ok: false, error: error.message };
  }
}

async function executeTableNode(
  node: StoryboardTableNode,
  store: ReturnType<typeof useBoardStore.getState>,
): Promise<ExecutionResult> {
  const rows = node.runtimePayload?.rowExecutions ?? [];
  if (rows.length === 0) {
    store.updateNode(node.id, {
      execution: { status: 'success', progressPercent: 100, summary: '0 rows' },
    } as Partial<StoryboardTableNode>);
    return { ok: true };
  }

  // Process each row
  for (const row of rows) {
    if (row.status !== 'idle' && row.status !== 'error') continue;

    store.updateRowExecution(node.id, row.rowId, { status: 'queued' });
    store.recomputeTableStatus(node.id);

    try {
      const rowData = node.runtimePayload?.rows?.[row.rowIndex] ?? {};
      let prompt = node.inputs.templatePrompt;
      for (const [key, value] of Object.entries(rowData)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), String(value));
      }

      store.updateRowExecution(node.id, row.rowId, {
        status: 'running',
        substeps: {
          imageGen: { status: 'running', startedAt: Date.now() },
          videoGen: { status: 'idle' },
        },
      });
      store.recomputeTableStatus(node.id);

      const result = await secureGenerateImage(
        prompt,
        'gemini-3.1-flash-image-preview',
      );

      if (result.newImageBase64 && result.newImageMimeType) {
        const href = `data:${result.newImageMimeType};base64,${result.newImageBase64}`;

        const binary = atob(result.newImageBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.newImageMimeType });
        const blobId = `blob_table_${node.id}_row_${row.rowIndex}`;
        await putImage(blobId, blob as any);

        // Generate a lightweight thumbnail for the virtual list
        const thumbnailDataUrl = await generateThumbnail(href, 256);

        store.updateRowExecution(node.id, row.rowId, {
          status: 'success',
          substeps: {
            imageGen: { status: 'success', jobId: blobId, startedAt: row.substeps.imageGen.startedAt },
            videoGen: { status: 'idle' },
          },
          outputs: {
            imageBlobId: blobId,
            thumbnailDataUrl,
          },
        });
      } else {
        throw new Error(result.textResponse || 'Image generation returned no data');
      }
    } catch (err) {
      const error = err as Error;
      const newRetryCount = row.retryCount + 1;
      const isRetryable = newRetryCount < row.maxRetries;

      store.updateRowExecution(node.id, row.rowId, {
        status: isRetryable ? 'queued' : 'error',
        errorMessage: error.message,
        errorCode: classifyError(error.message),
        retryCount: newRetryCount,
      });
    }

    store.recomputeTableStatus(node.id);
  }

  const currentRows = (store.getNodeById(node.id) as StoryboardTableNode)?.runtimePayload?.rowExecutions ?? [];
  const summary = computeTableSummary(currentRows);
  store.updateNode(node.id, { execution: summary } as Partial<StoryboardTableNode>);

  return { ok: summary.status === 'error' ? false : true };
}

function classifyError(message: string): RowExecution['errorCode'] {
  const m = message.toLowerCase();
  if (m.includes('nsfw') || m.includes('safety') || m.includes('content policy')) return 'nsfw_blocked';
  if (m.includes('timeout') || m.includes('timed out')) return 'api_timeout';
  if (m.includes('rate limit') || m.includes('too many requests')) return 'rate_limited';
  return 'unknown';
}

async function generateThumbnail(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Execute multiple nodes in dependency order.
 * Nodes without dependencies can run in parallel within pool constraints.
 */
export async function executeAllNodes(): Promise<ExecutionResult[]> {
  const store = useBoardStore.getState();
  const nodeMap = new Map(store.nodes.map(n => [n.id, n]));
  const results: ExecutionResult[] = [];

  const remaining = new Set(store.nodes.map(n => n.id));
  const executed = new Set<string>();
  let rounds = 0;
  const MAX_ROUNDS = 50;

  while (remaining.size > 0 && rounds < MAX_ROUNDS) {
    rounds++;
    const batch: string[] = [];

    for (const id of remaining) {
      const node = nodeMap.get(id)!;
      const deps = resolveDependencies(id, nodeMap);
      const allDepsDone = deps.every(d => executed.has(d.id));
      if (allDepsDone) batch.push(id);
    }

    if (batch.length === 0) break;

    const batchResults = await Promise.all(batch.map(id => executeNode(nodeMap.get(id)!)));
    results.push(...batchResults);

    for (const id of batch) {
      remaining.delete(id);
      executed.add(id);
    }
  }

  return results;
}

/**
 * Self-healing retry: fix a prompt and re-execute a failed row.
 */
export async function retryTableRow(nodeId: string, rowId: string, fixedPrompt?: string): Promise<ExecutionResult> {
  const store = useBoardStore.getState();
  const node = store.getNodeById(nodeId) as StoryboardTableNode | undefined;
  if (!node || node.type !== 'STORYBOARD_TABLE') {
    return { ok: false, error: 'Node not found or not a STORYBOARD_TABLE' };
  }

  const row = node.runtimePayload?.rowExecutions?.find(r => r.rowId === rowId);
  if (!row) return { ok: false, error: 'Row not found' };

  // Reset row state
  store.updateRowExecution(nodeId, rowId, {
    status: 'idle',
    errorMessage: undefined,
    errorCode: undefined,
    retryCount: 0,
    substeps: {
      imageGen: { status: 'idle' },
      videoGen: { status: 'idle' },
    },
  });

  if (fixedPrompt && node.runtimePayload?.rows) {
    // Apply fixed prompt to the row data
    const rowData = node.runtimePayload.rows[row.rowIndex];
    if (rowData) {
      // Store the fixed prompt override in a designated column
      node.runtimePayload.rows[row.rowIndex] = { ...rowData, _fixedPrompt: fixedPrompt };
    }
  }

  return executeNode(store.getNodeById(nodeId)!);
}
