/**
 * RunningHub API Service
 * Docs: https://www.runninghub.cn/ (ComfyUI-based API)
 */

const RH_BASE = 'https://www.runninghub.cn/openapi/v2';
const POLL_INTERVAL = 5000; // 5s
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

export interface RHTaskResult {
  url: string;
  nodeId: string;
  outputType: string; // png, mp4, txt, etc.
  text: string | null;
}

export interface RHTaskResponse {
  taskId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  errorCode: string;
  errorMessage: string;
  results: RHTaskResult[] | null;
  clientId: string;
  usage?: {
    consumeMoney: string | null;
    consumeCoins: string | null;
    taskCostTime: string;
    thirdPartyConsumeMoney: string | null;
  };
}

export interface RHSubmitPayload {
  imageUrls?: string[];
  prompt: string;
  resolution?: '1k' | '2k' | '4k';
  aspectRatio?: string;
  webhookUrl?: string;
  [key: string]: unknown; // allow extra params for custom models
}

function rhHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/** Submit a task to a RunningHub model endpoint */
export async function rhSubmitTask(
  apiKey: string,
  modelEndpoint: string,
  payload: RHSubmitPayload,
): Promise<RHTaskResponse> {
  const url = modelEndpoint.startsWith('http')
    ? modelEndpoint
    : `${RH_BASE}/${modelEndpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: rhHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunningHub submit failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Query task status */
export async function rhQueryTask(
  apiKey: string,
  taskId: string,
): Promise<RHTaskResponse> {
  const res = await fetch(`${RH_BASE}/query`, {
    method: 'POST',
    headers: rhHeaders(apiKey),
    body: JSON.stringify({ taskId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunningHub query failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Upload a file and get a temporary URL (valid 24h) */
export async function rhUploadFile(
  apiKey: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, fileName || 'upload.png');

  const res = await fetch(`${RH_BASE}/media/upload/binary`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunningHub upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.data?.download_url || '';
}

/** Convert a data URL to a Blob for upload */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Upload a data URL image and get a temporary URL */
export async function rhUploadDataUrl(
  apiKey: string,
  dataUrl: string,
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split('/')[1] || 'png';
  return rhUploadFile(apiKey, blob, `upload.${ext}`);
}

/**
 * Submit a task and poll until completion.
 * Returns the final task response with results.
 */
export async function rhRunTask(
  apiKey: string,
  modelEndpoint: string,
  payload: RHSubmitPayload,
  onProgress?: (status: string, attempt: number) => void,
): Promise<RHTaskResponse> {
  const submitResult = await rhSubmitTask(apiKey, modelEndpoint, payload);
  const taskId = submitResult.taskId;

  if (!taskId) {
    throw new Error('RunningHub: No taskId returned');
  }

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const result = await rhQueryTask(apiKey, taskId);
    onProgress?.(result.status, i + 1);

    if (result.status === 'SUCCESS') return result;
    if (result.status === 'FAILED') {
      throw new Error(
        `RunningHub task failed: ${result.errorMessage || 'Unknown error'}`,
      );
    }
    // QUEUED or RUNNING — continue polling
  }

  throw new Error('RunningHub task timed out after polling');
}

/** Quick test: verify API key validity */
export async function rhTestApiKey(apiKey: string): Promise<boolean> {
  try {
    // Use a lightweight query with a dummy task ID to test auth
    const res = await fetch(`${RH_BASE}/query`, {
      method: 'POST',
      headers: rhHeaders(apiKey),
      body: JSON.stringify({ taskId: 'test-0000' }),
    });
    // If 401/403 → bad key; any other response (including 404 for bad taskId) → key works
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
// RunningHub WebApp（AI 应用）API — 工作流编排接口
//
// 与上方 v2 标准模型 API 独立：
// - 认证方式不同（apiKey in body/query，非 Bearer header）
// - 基址不同（task/openapi + api/webapp，非 openapi/v2）
// - 交互模式不同（获取节点 → 修改参数 → 提交 → 轮询结果）
// ════════════════════════════════════════════════════════════════════

const RH_HOST = 'https://www.runninghub.cn';
const WEBAPP_POLL_INTERVAL = 5000; // 5s
const WEBAPP_MAX_POLL_ATTEMPTS = 120; // 10 min max

/** WebApp 节点信息 — 描述一个可修改的工作流节点 */
export interface RHWebAppNodeInfo {
  nodeId: string;
  nodeName: string;
  fieldName: string;
  fieldValue: string;
  fieldType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'STRING' | 'LIST';
  description: string;
  fieldData?: unknown; // LIST 类型时包含可选值列表
}

/** WebApp 提交响应 */
export interface RHWebAppSubmitResult {
  taskId: string;
  promptTips?: string; // JSON 字符串，包含 node_errors 等
}

/** WebApp 任务输出项 */
export interface RHWebAppOutputItem {
  fileUrl: string;
  fileType?: string;
  nodeId?: string;
}

/** WebApp 查询响应码含义 */
export type RHWebAppTaskStatus = 'SUCCESS' | 'RUNNING' | 'QUEUED' | 'FAILED' | 'UNKNOWN';

/**
 * 获取 WebApp 的可修改节点列表
 *
 * @param apiKey - RunningHub API Key
 * @param webappId - AI 应用 ID（WebApp 链接末尾数字）
 * @returns nodeInfoList — 所有可修改的节点
 */
export async function rhGetWebAppNodes(
  apiKey: string,
  webappId: string,
): Promise<RHWebAppNodeInfo[]> {
  const url = `${RH_HOST}/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=${encodeURIComponent(webappId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RunningHub WebApp 获取节点失败 (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`RunningHub WebApp 错误: ${json.msg || JSON.stringify(json)}`);
  }

  return json.data?.nodeInfoList || [];
}

/**
 * 上传文件到 RunningHub（用于 IMAGE/AUDIO/VIDEO 类型节点）
 *
 * @param apiKey - RunningHub API Key
 * @param file - 要上传的文件
 * @returns 上传后的文件名（如 api/xxxx.jpg），用作 fieldValue
 */
export async function rhUploadWebAppFile(
  apiKey: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('apiKey', apiKey);
  formData.append('fileType', 'input');
  formData.append('file', file, fileName || 'upload.png');

  const res = await fetch(`${RH_HOST}/task/openapi/upload`, {
    method: 'POST',
    headers: { Host: 'www.runninghub.cn' },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RunningHub WebApp 文件上传失败 (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data?.fileName) {
    throw new Error(`RunningHub WebApp 上传错误: ${json.msg || '未返回 fileName'}`);
  }

  return json.data.fileName;
}

/**
 * 上传 data URL 图片到 WebApp
 */
export async function rhUploadWebAppDataUrl(
  apiKey: string,
  dataUrl: string,
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split('/')[1] || 'png';
  return rhUploadWebAppFile(apiKey, blob, `upload.${ext}`);
}

/**
 * 提交 WebApp 任务
 *
 * @param apiKey - RunningHub API Key
 * @param webappId - AI 应用 ID
 * @param nodeInfoList - 修改后的节点信息列表
 * @returns 包含 taskId 和 promptTips 的提交结果
 */
export async function rhSubmitWebAppTask(
  apiKey: string,
  webappId: string,
  nodeInfoList: RHWebAppNodeInfo[],
): Promise<RHWebAppSubmitResult> {
  const res = await fetch(`${RH_HOST}/task/openapi/ai-app/run`, {
    method: 'POST',
    headers: {
      'Host': 'www.runninghub.cn',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webappId,
      apiKey,
      nodeInfoList,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RunningHub WebApp 提交任务失败 (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`RunningHub WebApp 提交错误: ${json.msg || JSON.stringify(json)}`);
  }

  const taskId = json.data?.taskId;
  if (!taskId) {
    throw new Error('RunningHub WebApp: 未返回 taskId');
  }

  // 检查 promptTips 中的 node_errors
  const promptTips = json.data?.promptTips;
  if (promptTips) {
    try {
      const tips = JSON.parse(promptTips);
      const nodeErrors = tips.node_errors;
      if (nodeErrors && Object.keys(nodeErrors).length > 0) {
        throw new Error(`RunningHub WebApp 节点错误: ${JSON.stringify(nodeErrors)}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('RunningHub WebApp 节点错误')) {
        throw e;
      }
      // promptTips 解析失败不阻塞
    }
  }

  return { taskId, promptTips };
}

/**
 * 查询 WebApp 任务输出（含状态判断）
 *
 * @returns status + outputs 数组（成功时）或 failedReason（失败时）
 */
export async function rhQueryWebAppOutputs(
  apiKey: string,
  taskId: string,
): Promise<{
  status: RHWebAppTaskStatus;
  outputs: RHWebAppOutputItem[];
  failedReason?: string;
}> {
  const res = await fetch(`${RH_HOST}/task/openapi/outputs`, {
    method: 'POST',
    headers: {
      'Host': 'www.runninghub.cn',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey, taskId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RunningHub WebApp 查询失败 (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  const code = json.code;

  // code=0 → 成功，data 是输出数组
  if (code === 0 && Array.isArray(json.data)) {
    return {
      status: 'SUCCESS',
      outputs: json.data.map((item: Record<string, unknown>) => ({
        fileUrl: item.fileUrl || '',
        fileType: item.fileType,
        nodeId: item.nodeId,
      })),
    };
  }

  // code=805 → 失败
  if (code === 805) {
    const reason = json.data?.failedReason;
    return {
      status: 'FAILED',
      outputs: [],
      failedReason: reason
        ? `${reason.node_name}: ${reason.exception_message}`
        : json.msg || '任务失败',
    };
  }

  // code=804 → 运行中, code=813 → 排队中
  if (code === 804) return { status: 'RUNNING', outputs: [] };
  if (code === 813) return { status: 'QUEUED', outputs: [] };

  return { status: 'UNKNOWN', outputs: [] };
}

/**
 * 运行完整的 WebApp 工作流 — 提交任务 + 自动轮询直到完成
 *
 * @param apiKey - RunningHub API Key
 * @param webappId - AI 应用 ID
 * @param nodeInfoList - 修改后的节点信息列表
 * @param onProgress - 进度回调（状态, 轮询次数）
 * @returns 最终输出项数组
 */
export async function rhRunWebApp(
  apiKey: string,
  webappId: string,
  nodeInfoList: RHWebAppNodeInfo[],
  onProgress?: (status: RHWebAppTaskStatus, attempt: number) => void,
): Promise<RHWebAppOutputItem[]> {
  const { taskId } = await rhSubmitWebAppTask(apiKey, webappId, nodeInfoList);

  for (let i = 0; i < WEBAPP_MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, WEBAPP_POLL_INTERVAL));

    const result = await rhQueryWebAppOutputs(apiKey, taskId);
    onProgress?.(result.status, i + 1);

    if (result.status === 'SUCCESS') return result.outputs;
    if (result.status === 'FAILED') {
      throw new Error(`RunningHub WebApp 任务失败: ${result.failedReason || '未知错误'}`);
    }
    // QUEUED / RUNNING → 继续轮询
  }

  throw new Error('RunningHub WebApp 任务超时（超过 10 分钟）');
}

/** 快速验证 WebApp API Key（尝试用一个随机 webappId 获取节点） */
export async function rhTestWebAppApiKey(apiKey: string): Promise<boolean> {
  try {
    // 用 dummy webappId 请求，如果 key 错误会返回非 0 code
    const url = `${RH_HOST}/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=test-0000`;
    const res = await fetch(url);
    // 401/403 → 无效 key
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}
