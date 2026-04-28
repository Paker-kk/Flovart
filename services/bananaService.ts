/**
 * BANANA 图像识别拆层服务
 *
 * 说明：
 * - 通过 BANANA API 对单张图片做内容识别并返回可独立图层
 * - 兼容多种返回字段命名，方便快速接入不同后端实现
 */

export interface BananaImageInput {
  href: string;
  mimeType: string;
}

export interface BananaSplitLayer {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  // 相对原图左上角的偏移（像素）
  offsetX: number;
  offsetY: number;
}

export type BananaAgentTask = "upscale" | "remove-background" | "enhance";

export interface BananaAgentResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

type RawLayer = Record<string, unknown>;

const BANANA_API_URL =
  import.meta.env.VITE_BANANA_API_URL || "https://api.banana.dev/v1/vision/split-layers";
const BANANA_API_KEY = import.meta.env.VITE_BANANA_API_KEY || "";
const BANANA_AGENT_API_URL =
  import.meta.env.VITE_BANANA_AGENT_API_URL || "https://api.banana.dev/v1/vision/agent";

let runtimeBananaConfig: {
  apiKey?: string;
  splitUrl?: string;
  agentUrl?: string;
} = {};

export function setBananaRuntimeConfig(config: {
  apiKey?: string;
  splitUrl?: string;
  agentUrl?: string;
}) {
  runtimeBananaConfig = { ...runtimeBananaConfig, ...config };
}

function toDataUrl(base64: string, mimeType: string): string {
  if (base64.startsWith("data:")) return base64;
  return `data:${mimeType};base64,${base64}`;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeLayer(layer: RawLayer, idx: number): BananaSplitLayer | null {
  const name =
    (typeof layer.name === "string" && layer.name) ||
    (typeof layer.label === "string" && layer.label) ||
    `Layer ${idx + 1}`;

  const mimeType =
    (typeof layer.mimeType === "string" && layer.mimeType) ||
    (typeof layer.mime_type === "string" && layer.mime_type) ||
    "image/png";

  const base64 =
    (typeof layer.imageBase64 === "string" && layer.imageBase64) ||
    (typeof layer.base64 === "string" && layer.base64) ||
    (typeof layer.image_data === "string" && layer.image_data) ||
    (typeof layer.dataUrl === "string" && layer.dataUrl) ||
    (typeof layer.image_url === "string" && layer.image_url);

  if (!base64) return null;

  const bbox = (layer.bbox || layer.box || layer.bounds || {}) as Record<string, unknown>;
  const width = asNumber(layer.width, asNumber(bbox.width, 0));
  const height = asNumber(layer.height, asNumber(bbox.height, 0));
  const offsetX = asNumber(layer.x, asNumber(bbox.x, 0));
  const offsetY = asNumber(layer.y, asNumber(bbox.y, 0));

  return {
    name,
    dataUrl: toDataUrl(base64, mimeType),
    width,
    height,
    offsetX,
    offsetY,
  };
}

export async function splitImageByBanana(
  image: BananaImageInput
): Promise<BananaSplitLayer[]> {
  const base64Payload = image.href.includes(",")
    ? image.href.split(",")[1]
    : image.href;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = runtimeBananaConfig.apiKey || BANANA_API_KEY;
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  const response = await fetch(runtimeBananaConfig.splitUrl || BANANA_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      image: {
        data: base64Payload,
        mimeType: image.mimeType,
      },
      task: "layer-segmentation",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`BANANA API 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const rawLayers = (json.layers || json.results || json.data || []) as RawLayer[];
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
    throw new Error("BANANA API 未返回可用图层，请检查接口返回格式。");
  }

  const normalized = rawLayers
    .map((layer, idx) => normalizeLayer(layer, idx))
    .filter((layer): layer is BananaSplitLayer => !!layer);

  if (normalized.length === 0) {
    throw new Error("BANANA API 返回了图层，但未包含可用图像数据。");
  }

  return normalized;
}

function normalizeAgentImage(
  raw: Record<string, unknown>,
  fallbackMimeType: string
): BananaAgentResult | null {
  const mimeType =
    (typeof raw.mimeType === "string" && raw.mimeType) ||
    (typeof raw.mime_type === "string" && raw.mime_type) ||
    fallbackMimeType ||
    "image/png";

  const base64 =
    (typeof raw.imageBase64 === "string" && raw.imageBase64) ||
    (typeof raw.base64 === "string" && raw.base64) ||
    (typeof raw.image_data === "string" && raw.image_data) ||
    (typeof raw.dataUrl === "string" && raw.dataUrl) ||
    (typeof raw.image_url === "string" && raw.image_url);

  if (!base64) return null;

  return {
    dataUrl: toDataUrl(base64, mimeType),
    mimeType,
    width: asNumber(raw.width, 0),
    height: asNumber(raw.height, 0),
  };
}

export async function runBananaImageAgent(
  image: BananaImageInput,
  task: BananaAgentTask,
  options?: Record<string, unknown>
): Promise<BananaAgentResult> {
  const base64Payload = image.href.includes(",")
    ? image.href.split(",")[1]
    : image.href;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = runtimeBananaConfig.apiKey || BANANA_API_KEY;
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  const response = await fetch(runtimeBananaConfig.agentUrl || BANANA_AGENT_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      task,
      image: {
        data: base64Payload,
        mimeType: image.mimeType,
      },
      options: options || {},
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`BANANA Agent 请求失败 (${response.status}): ${text || response.statusText}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const candidate =
    (json.result as Record<string, unknown>) ||
    (json.image as Record<string, unknown>) ||
    (json.data as Record<string, unknown>) ||
    json;

  const normalized = normalizeAgentImage(candidate, image.mimeType);
  if (!normalized) {
    throw new Error("BANANA Agent 未返回可用图片数据。");
  }

  return normalized;
}
