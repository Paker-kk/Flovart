# Flovart API Key 管理架构升级方案

> 参考项目：**cc-switch** (Tauri, 50+ presets)、**One-API** (31.6k★, Go, 渠道路由+故障转移)、**LiteLLM** (42.5k★, Python, 100+ Provider 统一网关)
>
> 设计目标：在浏览器 SPA 约束下，实现接近 One-API / cc-switch 级别的多供应商兼容能力

---

## 一、现状分析

### 1.1 Flovart 当前架构

| 层面 | 现状 | 问题 |
|------|------|------|
| **Provider 预设** | `DEFAULT_PROVIDER_MODELS` 硬编码 15 个 provider | 新增 provider 需改代码；无预设模板快速添加 |
| **Auth 策略** | `validateApiKey()` 用 if/else 链判断 provider | 仅支持 Bearer 和 x-api-key 两种，无法扩展 |
| **故障转移** | 无 | 单 key 失败即报错，无备用渠道、无熔断 |
| **用量监控** | `usageMonitor.ts` 粗估费用 | 已有基础框架，但未集成到路由决策中 |
| **Key 安全** | `keyVault.ts` AES-GCM 加密 localStorage | 已有，但缺少 key 轮换、异常检测 |
| **模型发现** | `modelFetcher.ts` 动态拉取 | 已有，但缺少本地缓存策略和离线预设 |

### 1.2 参考项目核心模式

#### cc-switch (Tauri Desktop)
- **Provider Preset 模板**：50+ 预设 `ProviderPreset` ( `apiKeyField`, `apiFormat`, `templateValues`, `endpointCandidates[]`, `category`, `theme` )
- **Universal Provider**：跨应用共享配置 `UniversalProviderPreset` → `createUniversalProviderFromPreset()` 工厂
- **AuthStrategy 枚举**：Anthropic (x-api-key) / ClaudeAuth (Bearer) / Bearer / Google (x-goog-api-key) / GoogleOAuth
- **Proxy 层**：Rust 本地 HTTP 代理 + Circuit Breaker + Failover Queue + Provider Adapter Trait

#### One-API (31.6k★, Go)
- **Channel 模型**：每个渠道有 `Type`, `Key`, `Status`, `Weight`, `Priority`, `BaseURL`, `Models`, `ModelMapping`, `Balance`, `ResponseTime`
- **Adaptor 接口**：`GetRequestURL()`, `SetupRequestHeader()`, `ConvertRequest()`, `DoRequest()`, `DoResponse()`, `GetModelList()`
- **自动禁用/启用**：`ShouldDisableChannel()` — 根据 statusCode/error 自动禁用失败渠道；`ShouldEnableChannel()` 自动恢复
- **负载均衡**：按 Weight + Priority 分组选择渠道
- **额度跟踪**：`UsedQuota`, `Balance`, `BalanceUpdatedTime` 精确到渠道级别

#### LiteLLM (42.5k★, Python)
- **统一 OpenAI 格式**：所有 100+ provider 统一到 `/chat/completions`, `/images`, `/audio` 等标准接口
- **Router**：retry/fallback 逻辑，跨多个 deployment 的负载均衡
- **Virtual Key**：多租户 key 管理 + 预算控制
- **Cost Tracking**：内置 `model_prices_and_context_window.json` 精确价格表

---

## 二、四层升级架构

### 架构总览

```
┌─────────────────────────────────────────────────┐
│                    App.tsx                       │
│              (消费层 - 无感知调用)                │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            Layer 4: Usage Monitor               │
│     用量追踪 · 预算控制 · 健康评分               │
│         (增强 usageMonitor.ts)                   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            Layer 3: Provider Router             │
│   负载均衡 · 故障转移 · 熔断器 · 自动重试        │
│         (新增 services/providerRouter.ts)        │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            Layer 2: Provider Adapter            │
│   统一请求/响应转换 · Auth 注入 · Header 构建     │
│         (新增 services/providerAdapters.ts)      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            Layer 1: Provider Presets            │
│   预设模板 · Key 格式推断 · Endpoint 发现         │
│     (新增 services/providerPresets.ts)           │
│     (增强 hooks/useApiKeys.ts)                   │
│     (增强 utils/keyVault.ts)                     │
└─────────────────────────────────────────────────┘
```

---

### Layer 1: Provider Presets — 供应商预设模板

> 借鉴 cc-switch 的 `ProviderPreset` + One-API 的 `Channel` 模型

#### 新增文件: `services/providerPresets.ts`

```typescript
// ── 核心类型 ──

export type AuthMethod =
  | 'bearer'            // Authorization: Bearer xxx
  | 'x-api-key'         // x-api-key: xxx (Anthropic)
  | 'x-goog-api-key'    // x-goog-api-key: xxx (Google)
  | 'query-param'       // ?key=xxx (Google legacy)
  | 'custom-header';    // extraConfig 指定 header name

export type ProviderCategory =
  | 'official'         // OpenAI, Anthropic, Google 官方
  | 'cn_official'      // 国内官方 (通义千问, 深度求索, 火山引擎等)
  | 'aggregator'       // 聚合平台 (OpenRouter, SiliconFlow)
  | 'third_party'      // 第三方中转 (各种代理站)
  | 'self_hosted'      // 自托管 (Ollama, vLLM, One-API 实例)
  | 'cloud_provider';  // 云服务商 (AWS Bedrock, Azure)

export interface EndpointTemplate {
  /** 基础 URL，支持 ${variable} 占位符 */
  baseUrl: string;
  /** 需要的额外配置字段 */
  requiredConfig?: string[];
  /** 可选的备用端点 */
  fallbackUrls?: string[];
}

export interface ProviderPreset {
  /** 唯一标识 */
  id: string;
  /** 显示名称 (支持中英文) */
  name: { zh: string; en: string };
  /** 分类 */
  category: ProviderCategory;
  /** 认证方式 */
  authMethod: AuthMethod;
  /** Key 字段名 (用于环境变量提示) */
  apiKeyField: string;
  /** Key 格式推断正则 (用于粘贴自动识别) */
  keyPattern?: RegExp;
  /** API 格式 */
  apiFormat: 'openai' | 'anthropic' | 'google' | 'custom';
  /** 端点模板 */
  endpoint: EndpointTemplate;
  /** 默认可用模型 */
  defaultModels: {
    text: string[];
    image: string[];
    video: string[];
  };
  /** 支持的能力 */
  capabilities: AICapability[];
  /** 是否支持 /models 端点动态发现 */
  supportsModelDiscovery: boolean;
  /** 额外的请求头 */
  extraHeaders?: Record<string, string>;
  /** 主题色 (用于 UI) */
  theme?: { color: string; icon?: string };
  /** 模型名称映射 (类似 One-API 的 ModelMapping) */
  modelMapping?: Record<string, string>;
  /** 估算费用倍率 (相对于官方价格) */
  costMultiplier?: number;
}

// ── 预设库 (50+ 预设) ──

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ━━ Official ━━
  {
    id: 'google',
    name: { zh: 'Google Gemini', en: 'Google Gemini' },
    category: 'official',
    authMethod: 'query-param', // ?key=xxx for REST
    apiKeyField: 'GOOGLE_API_KEY',
    keyPattern: /^AIzaSy/,
    apiFormat: 'google',
    endpoint: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    defaultModels: {
      text: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      image: ['gemini-3.1-flash-image-preview', 'imagen-4.0-generate-001'],
      video: ['veo-3.1-generate-preview'],
    },
    capabilities: ['text', 'image', 'video'],
    supportsModelDiscovery: true,
    theme: { color: '#4285F4' },
  },
  {
    id: 'openai',
    name: { zh: 'OpenAI', en: 'OpenAI' },
    category: 'official',
    authMethod: 'bearer',
    apiKeyField: 'OPENAI_API_KEY',
    keyPattern: /^sk-proj-/,
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://api.openai.com/v1' },
    defaultModels: {
      text: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4o-mini'],
      image: ['gpt-image-1', 'dall-e-3'],
      video: [],
    },
    capabilities: ['text', 'image'],
    supportsModelDiscovery: true,
    theme: { color: '#10A37F' },
  },
  {
    id: 'anthropic',
    name: { zh: 'Anthropic Claude', en: 'Anthropic Claude' },
    category: 'official',
    authMethod: 'x-api-key',
    apiKeyField: 'ANTHROPIC_API_KEY',
    keyPattern: /^sk-ant-/,
    apiFormat: 'anthropic',
    endpoint: { baseUrl: 'https://api.anthropic.com/v1' },
    defaultModels: {
      text: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
      image: [],
      video: [],
    },
    capabilities: ['text'],
    supportsModelDiscovery: false,
    extraHeaders: { 'anthropic-version': '2023-06-01' },
    theme: { color: '#D4A27F' },
  },

  // ━━ CN Official ━━
  {
    id: 'deepseek',
    name: { zh: 'DeepSeek 深度求索', en: 'DeepSeek' },
    category: 'cn_official',
    authMethod: 'bearer',
    apiKeyField: 'DEEPSEEK_API_KEY',
    keyPattern: /^sk-[a-f0-9]{32,}$/i,
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://api.deepseek.com/v1' },
    defaultModels: { text: ['deepseek-chat', 'deepseek-reasoner'], image: [], video: [] },
    capabilities: ['text'],
    supportsModelDiscovery: true,
    theme: { color: '#0066FF' },
    costMultiplier: 0.1,
  },
  {
    id: 'qwen',
    name: { zh: '通义千问', en: 'Qwen (Alibaba)' },
    category: 'cn_official',
    authMethod: 'bearer',
    apiKeyField: 'DASHSCOPE_API_KEY',
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    defaultModels: { text: ['qwen-max'], image: [], video: [] },
    capabilities: ['text'],
    supportsModelDiscovery: true,
    theme: { color: '#FF6A00' },
    costMultiplier: 0.15,
  },
  {
    id: 'volcengine',
    name: { zh: '火山引擎 (豆包)', en: 'Volcengine (Doubao)' },
    category: 'cn_official',
    authMethod: 'bearer',
    apiKeyField: 'VOLCENGINE_API_KEY',
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    defaultModels: { text: ['doubao-1.5-pro-256k'], image: [], video: [] },
    capabilities: ['text'],
    supportsModelDiscovery: false,
    theme: { color: '#3370FF' },
    costMultiplier: 0.12,
  },
  {
    id: 'minimax',
    name: { zh: 'MiniMax', en: 'MiniMax' },
    category: 'cn_official',
    authMethod: 'bearer',
    apiKeyField: 'MINIMAX_API_KEY',
    keyPattern: /^eyJ/i,
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://api.minimax.chat/v1' },
    defaultModels: {
      text: ['MiniMax-Text-01'],
      image: ['minimax-image-01'],
      video: ['video-01'],
    },
    capabilities: ['text', 'image', 'video'],
    supportsModelDiscovery: false,
    theme: { color: '#6C5CE7' },
  },

  // ━━ Aggregators ━━
  {
    id: 'openrouter',
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    category: 'aggregator',
    authMethod: 'bearer',
    apiKeyField: 'OPENROUTER_API_KEY',
    keyPattern: /^sk-or-/,
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://openrouter.ai/api/v1' },
    defaultModels: {
      text: ['openrouter/auto', 'google/gemini-3-flash-preview'],
      image: ['openai/gpt-image-1'],
      video: [],
    },
    capabilities: ['text', 'image'],
    supportsModelDiscovery: true,
    extraHeaders: { 'X-OpenRouter-Title': 'Flovart' },
    theme: { color: '#E91E63' },
  },
  {
    id: 'siliconflow',
    name: { zh: 'SiliconFlow 硅基流动', en: 'SiliconFlow' },
    category: 'aggregator',
    authMethod: 'bearer',
    apiKeyField: 'SILICONFLOW_API_KEY',
    keyPattern: /^sk-sf/i,
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://api.siliconflow.cn/v1' },
    defaultModels: {
      text: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
      image: [],
      video: [],
    },
    capabilities: ['text'],
    supportsModelDiscovery: true,
    theme: { color: '#00C9DB' },
    costMultiplier: 0.3,
  },

  // ━━ Image / Video Specialized ━━
  {
    id: 'keling',
    name: { zh: '可灵 AI', en: 'Keling AI' },
    category: 'cn_official',
    authMethod: 'bearer',
    apiKeyField: 'KELING_API_KEY',
    apiFormat: 'openai',
    endpoint: { baseUrl: 'https://api.klingai.com/v1' },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['image', 'video'],
    supportsModelDiscovery: true,
    theme: { color: '#FF4081' },
  },
  {
    id: 'flux',
    name: { zh: 'Flux (BFL)', en: 'Flux (BFL)' },
    category: 'official',
    authMethod: 'bearer',
    apiKeyField: 'BFL_API_KEY',
    apiFormat: 'custom',
    endpoint: { baseUrl: 'https://api.bfl.ml/v1' },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['image'],
    supportsModelDiscovery: false,
    theme: { color: '#7C3AED' },
  },
  {
    id: 'midjourney',
    name: { zh: 'Midjourney', en: 'Midjourney' },
    category: 'third_party',
    authMethod: 'bearer',
    apiKeyField: 'MIDJOURNEY_API_KEY',
    apiFormat: 'custom',
    endpoint: { baseUrl: 'https://api.midjourney.com/v1' },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['image'],
    supportsModelDiscovery: false,
    theme: { color: '#000000' },
  },

  // ━━ Self-hosted / 第三方 One-API 实例 ━━
  {
    id: 'one-api-instance',
    name: { zh: 'One-API 实例', en: 'One-API Instance' },
    category: 'self_hosted',
    authMethod: 'bearer',
    apiKeyField: 'ONE_API_KEY',
    apiFormat: 'openai',
    endpoint: {
      baseUrl: '${CUSTOM_BASE_URL}',
      requiredConfig: ['baseUrl'],
    },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['text', 'image', 'video'],
    supportsModelDiscovery: true,
    theme: { color: '#009688' },
  },
  {
    id: 'litellm-proxy',
    name: { zh: 'LiteLLM 代理', en: 'LiteLLM Proxy' },
    category: 'self_hosted',
    authMethod: 'bearer',
    apiKeyField: 'LITELLM_API_KEY',
    apiFormat: 'openai',
    endpoint: {
      baseUrl: '${CUSTOM_BASE_URL}',
      requiredConfig: ['baseUrl'],
    },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['text', 'image', 'video'],
    supportsModelDiscovery: true,
    theme: { color: '#2196F3' },
  },
  {
    id: 'ollama',
    name: { zh: 'Ollama 本地', en: 'Ollama (Local)' },
    category: 'self_hosted',
    authMethod: 'bearer',
    apiFormat: 'openai',
    apiKeyField: 'OLLAMA_API_KEY',
    endpoint: {
      baseUrl: 'http://localhost:11434/v1',
      fallbackUrls: ['http://127.0.0.1:11434/v1'],
    },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['text'],
    supportsModelDiscovery: true,
    theme: { color: '#FFFFFF' },
  },

  // ━━ Custom ━━
  {
    id: 'custom',
    name: { zh: '自定义端点', en: 'Custom Endpoint' },
    category: 'third_party',
    authMethod: 'bearer',
    apiKeyField: 'CUSTOM_API_KEY',
    apiFormat: 'openai',
    endpoint: {
      baseUrl: '${CUSTOM_BASE_URL}',
      requiredConfig: ['baseUrl'],
    },
    defaultModels: { text: [], image: [], video: [] },
    capabilities: ['text', 'image', 'video'],
    supportsModelDiscovery: true,
    theme: { color: '#607D8B' },
  },
];

// ── 便捷函数 ──

export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id);
}

export function getPresetsByCategory(category: ProviderCategory): ProviderPreset[] {
  return PROVIDER_PRESETS.filter(p => p.category === category);
}

export function inferPresetFromKey(apiKey: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.keyPattern?.test(apiKey.trim()));
}
```

**改动量**：新增 ~300 行。迁移 `DEFAULT_PROVIDER_MODELS` 和 `inferProviderFromKey()` 为预设驱动。

---

### Layer 2: Provider Adapter — 统一请求转换

> 借鉴 One-API 的 `Adaptor` 接口 + cc-switch 的 `ProviderAdapter` trait

#### 新增文件: `services/providerAdapters.ts`

```typescript
import type { ProviderPreset, AuthMethod } from './providerPresets';
import type { UserApiKey } from '../types';

// ── Adapter 接口 (借鉴 One-API Adaptor + cc-switch ProviderAdapter) ──

export interface RequestContext {
  /** 目标模型 */
  model: string;
  /** 请求体 */
  body: Record<string, unknown>;
  /** 是否流式 */
  stream?: boolean;
  /** 信号取消 */
  signal?: AbortSignal;
}

export interface AdaptedRequest {
  /** 完整请求 URL */
  url: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST';
  /** 请求头 */
  headers: Record<string, string>;
  /** 请求体 (JSON 序列化前) */
  body?: unknown;
}

export interface ProviderAdapter {
  /** 构建完整的请求 URL */
  buildUrl(preset: ProviderPreset, key: UserApiKey, ctx: RequestContext): string;

  /** 构建认证头 */
  buildAuthHeaders(preset: ProviderPreset, key: UserApiKey): Record<string, string>;

  /** 转换请求体 (如果 apiFormat 不同) */
  transformRequest(ctx: RequestContext): unknown;

  /** 解析响应 (标准化到统一格式) */
  parseResponse(raw: unknown, ctx: RequestContext): unknown;

  /** 判断是否需要特殊处理 */
  needsTransform(ctx: RequestContext): boolean;
}

// ── Auth 注入 (借鉴 cc-switch AuthStrategy) ──

export function buildAuthHeaders(
  method: AuthMethod,
  apiKey: string,
  extraHeaders?: Record<string, string>,
  customHeaderName?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };

  switch (method) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'x-api-key':
      headers['x-api-key'] = apiKey;
      break;
    case 'x-goog-api-key':
      headers['x-goog-api-key'] = apiKey;
      break;
    case 'custom-header':
      if (customHeaderName) headers[customHeaderName] = apiKey;
      break;
    case 'query-param':
      // Handled at URL level, not in headers
      break;
  }

  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

// ── 标准 Adapter 实现 ──

export const OpenAIAdapter: ProviderAdapter = {
  buildUrl(preset, key, ctx) {
    const base = (key.baseUrl || preset.endpoint.baseUrl).replace(/\/$/, '');
    return `${base}/chat/completions`;
  },
  buildAuthHeaders(preset, key) {
    return buildAuthHeaders(preset.authMethod, key.key, preset.extraHeaders);
  },
  transformRequest(ctx) { return ctx.body; },
  parseResponse(raw) { return raw; },
  needsTransform() { return false; },
};

export const AnthropicAdapter: ProviderAdapter = {
  buildUrl(preset, key, ctx) {
    const base = (key.baseUrl || preset.endpoint.baseUrl).replace(/\/$/, '');
    return `${base}/messages`;
  },
  buildAuthHeaders(preset, key) {
    return buildAuthHeaders('x-api-key', key.key, preset.extraHeaders);
  },
  transformRequest(ctx) {
    // OpenAI format → Anthropic format
    const { messages, model, ...rest } = ctx.body as Record<string, unknown>;
    return { model, max_tokens: 4096, messages, ...rest };
  },
  parseResponse(raw) {
    // Anthropic format → 统一格式
    const data = raw as { content?: { text?: string }[] };
    return data?.content?.map(c => c.text).join('') ?? '';
  },
  needsTransform() { return true; },
};

export const GoogleAdapter: ProviderAdapter = {
  buildUrl(preset, key, ctx) {
    const base = (key.baseUrl || preset.endpoint.baseUrl).replace(/\/$/, '');
    return `${base}/${ctx.model}:generateContent?key=${key.key}`;
  },
  buildAuthHeaders(preset, key) {
    return { 'Content-Type': 'application/json' }; // Key is in query param
  },
  transformRequest(ctx) {
    // OpenAI format → Google format
    const { messages } = ctx.body as { messages: { role: string; content: string }[] };
    return {
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    };
  },
  parseResponse(raw) { return raw; },
  needsTransform() { return true; },
};

// ── Adapter 注册表 ──

const ADAPTER_REGISTRY: Record<string, ProviderAdapter> = {
  openai: OpenAIAdapter,
  anthropic: AnthropicAdapter,
  google: GoogleAdapter,
};

export function getAdapter(apiFormat: string): ProviderAdapter {
  return ADAPTER_REGISTRY[apiFormat] ?? OpenAIAdapter;
}
```

**改动量**：新增 ~200 行。现有 `aiGateway.ts` 逐步迁移到 adapter 调用。

---

### Layer 3: Provider Router — 故障转移 + 熔断

> 借鉴 One-API 的 Channel Weight/Priority + cc-switch 的 CircuitBreaker + LiteLLM 的 Router

#### 新增文件: `services/providerRouter.ts`

```typescript
import type { UserApiKey, AICapability } from '../types';
import { recordApiUsage } from '../utils/usageMonitor';

// ── 熔断器 (借鉴 cc-switch CircuitBreaker) ──

interface CircuitState {
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 熔断打开时间 */
  openedAt: number | null;
  /** 当前状态 */
  state: 'closed' | 'open' | 'half-open';
  /** 最近响应时间 ms */
  lastResponseTime: number;
  /** 总请求数 */
  totalRequests: number;
  /** 成功请求数 */
  successRequests: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;      // 连续失败 N 次打开熔断
const CIRCUIT_BREAKER_TIMEOUT = 60_000;   // 熔断器打开 60s 后进入半开
const MAX_RETRY_ATTEMPTS = 2;             // 故障转移最大重试次数

const circuitStates = new Map<string, CircuitState>();

function getCircuitState(keyId: string): CircuitState {
  if (!circuitStates.has(keyId)) {
    circuitStates.set(keyId, {
      consecutiveFailures: 0,
      openedAt: null,
      state: 'closed',
      lastResponseTime: 0,
      totalRequests: 0,
      successRequests: 0,
    });
  }
  return circuitStates.get(keyId)!;
}

export function isCircuitOpen(keyId: string): boolean {
  const state = getCircuitState(keyId);
  if (state.state === 'closed') return false;
  if (state.state === 'open' && state.openedAt) {
    if (Date.now() - state.openedAt > CIRCUIT_BREAKER_TIMEOUT) {
      state.state = 'half-open';
      return false; // 允许探测
    }
    return true; // 仍在冷却中
  }
  return false;
}

export function recordSuccess(keyId: string, responseTime: number): void {
  const state = getCircuitState(keyId);
  state.consecutiveFailures = 0;
  state.state = 'closed';
  state.openedAt = null;
  state.lastResponseTime = responseTime;
  state.totalRequests++;
  state.successRequests++;
}

export function recordFailure(keyId: string): void {
  const state = getCircuitState(keyId);
  state.consecutiveFailures++;
  state.totalRequests++;
  if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.state = 'open';
    state.openedAt = Date.now();
  }
}

/** 获取 Key 的健康评分 (0-100)，用于加权选择 */
export function getHealthScore(keyId: string): number {
  const state = getCircuitState(keyId);
  if (state.state === 'open') return 0;
  if (state.totalRequests === 0) return 50; // 未知状态给中等分
  const successRate = state.successRequests / state.totalRequests;
  const recency = state.lastResponseTime
    ? Math.max(0, 100 - state.lastResponseTime / 50) // 响应越快分越高
    : 50;
  return Math.round(successRate * 70 + (recency / 100) * 30);
}

// ── 路由选择 (借鉴 One-API 负载均衡) ──

export interface RouteCandidate {
  key: UserApiKey;
  score: number;
}

/**
 * 选择最优 Key —— 从所有能处理该 capability 的 key 中，
 * 按 健康分 + 熔断状态 排序，返回排序后的候选列表。
 *
 * 类似 One-API 的 Channel Priority + Weight 选择。
 */
export function selectCandidates(
  keys: UserApiKey[],
  capability: AICapability,
  model?: string
): RouteCandidate[] {
  return keys
    .filter(key => {
      // 必须拥有所需能力
      if (!key.capabilities.includes(capability)) return false;
      // 熔断器未打开
      if (isCircuitOpen(key.id)) return false;
      return true;
    })
    .map(key => ({
      key,
      score: getHealthScore(key.id),
    }))
    .sort((a, b) => b.score - a.score);
}

// ── 带故障转移的调用 ──

export interface RouterCallOptions {
  keys: UserApiKey[];
  capability: AICapability;
  model: string;
  /** 实际执行 API 调用的函数 */
  execute: (key: UserApiKey) => Promise<unknown>;
  /** 最大重试次数 (默认 2) */
  maxRetries?: number;
}

/**
 * 带故障转移 + 熔断的统一调用入口。
 *
 * 按健康分排序选择 key，失败时自动切换到下一个候选。
 * 类似 One-API 的「失败自动重试，切换渠道」。
 */
export async function callWithFailover<T = unknown>(
  opts: RouterCallOptions
): Promise<{ result: T; usedKey: UserApiKey }> {
  const candidates = selectCandidates(opts.keys, opts.capability, opts.model);

  if (candidates.length === 0) {
    throw new Error(
      `没有可用的 ${opts.capability} API Key。请检查配置或等待熔断器恢复。`
    );
  }

  const maxRetries = Math.min(opts.maxRetries ?? MAX_RETRY_ATTEMPTS, candidates.length);
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    const candidate = candidates[i];
    const startTime = Date.now();

    try {
      const result = await opts.execute(candidate.key);
      const elapsed = Date.now() - startTime;

      recordSuccess(candidate.key.id, elapsed);
      recordApiUsage({
        keyId: candidate.key.id,
        provider: candidate.key.provider,
        model: opts.model,
        type: opts.capability as 'text' | 'image' | 'video',
        success: true,
      });

      return { result: result as T, usedKey: candidate.key };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      lastError = err instanceof Error ? err : new Error(String(err));

      recordFailure(candidate.key.id);
      recordApiUsage({
        keyId: candidate.key.id,
        provider: candidate.key.provider,
        model: opts.model,
        type: opts.capability as 'text' | 'image' | 'video',
        success: false,
        error: lastError.message,
      });

      // 自动禁用检测 (借鉴 One-API ShouldDisableChannel)
      if (shouldAutoDisable(lastError)) {
        const state = getCircuitState(candidate.key.id);
        state.state = 'open';
        state.openedAt = Date.now();
        console.warn(`[Router] Auto-disabled key ${candidate.key.id}: ${lastError.message}`);
      }

      // 如果还有候选，继续尝试
      if (i < maxRetries - 1) {
        console.warn(`[Router] Key ${candidate.key.id} failed, trying next candidate...`);
        continue;
      }
    }
  }

  throw lastError ?? new Error('所有 API Key 均请求失败');
}

// ── 自动禁用判断 (借鉴 One-API ShouldDisableChannel) ──

function shouldAutoDisable(error: Error): boolean {
  const msg = error.message.toLowerCase();
  const disableKeywords = [
    'invalid_api_key', 'authentication_error', 'permission_error',
    'insufficient_quota', 'account_deactivated', 'credit balance',
    '401', '403', 'forbidden', 'api key not valid', 'api key expired',
    '已欠费', 'quota exceeded', 'rate limit',
  ];
  return disableKeywords.some(kw => msg.includes(kw));
}

// ── 状态导出 (供 UI 展示) ──

export function getAllCircuitStates(): Map<string, CircuitState> {
  return new Map(circuitStates);
}

export function resetCircuitBreaker(keyId: string): void {
  circuitStates.delete(keyId);
}

export function resetAllCircuitBreakers(): void {
  circuitStates.clear();
}
```

**改动量**：新增 ~250 行。需要在 `aiGateway.ts` 的现有调用入口包装 `callWithFailover()`。

---

### Layer 4: Usage Monitor 增强

> 借鉴 One-API 的渠道额度跟踪 + LiteLLM 的 `model_prices_and_context_window.json`

#### 增强文件: `utils/usageMonitor.ts`

##### 4.1 新增精确价格表

```typescript
// 替代现有粗估 COST_MAP，参考 LiteLLM 的 model_prices_and_context_window.json
export const MODEL_PRICES: Record<string, {
  inputPerMToken: number;   // $ per million input tokens
  outputPerMToken: number;  // $ per million output tokens
  imagePerCall: number;     // $ per image generation call
  videoPerSecond: number;   // $ per second of video
}> = {
  'gemini-2.5-flash':             { inputPerMToken: 0.15,  outputPerMToken: 0.60,  imagePerCall: 0, videoPerSecond: 0 },
  'gemini-2.5-pro':               { inputPerMToken: 1.25,  outputPerMToken: 10.0,  imagePerCall: 0, videoPerSecond: 0 },
  'gemini-3.1-flash-image-preview': { inputPerMToken: 0.15, outputPerMToken: 0.60, imagePerCall: 0.0315, videoPerSecond: 0 },
  'imagen-4.0-generate-001':      { inputPerMToken: 0,     outputPerMToken: 0,     imagePerCall: 0.04, videoPerSecond: 0 },
  'veo-3.1-generate-preview':     { inputPerMToken: 0,     outputPerMToken: 0,     imagePerCall: 0, videoPerSecond: 0.35 },
  'gpt-5.4':                      { inputPerMToken: 2.5,   outputPerMToken: 10.0,  imagePerCall: 0, videoPerSecond: 0 },
  'gpt-5.4-mini':                 { inputPerMToken: 0.4,   outputPerMToken: 1.6,   imagePerCall: 0, videoPerSecond: 0 },
  'gpt-image-1':                  { inputPerMToken: 0,     outputPerMToken: 0,     imagePerCall: 0.04, videoPerSecond: 0 },
  'claude-opus-4-6':              { inputPerMToken: 15.0,  outputPerMToken: 75.0,  imagePerCall: 0, videoPerSecond: 0 },
  'claude-sonnet-4-6':            { inputPerMToken: 3.0,   outputPerMToken: 15.0,  imagePerCall: 0, videoPerSecond: 0 },
  'deepseek-chat':                { inputPerMToken: 0.14,  outputPerMToken: 0.28,  imagePerCall: 0, videoPerSecond: 0 },
  'deepseek-reasoner':            { inputPerMToken: 0.55,  outputPerMToken: 2.19,  imagePerCall: 0, videoPerSecond: 0 },
  // ... 可继续扩展
};
```

##### 4.2 新增预算预警

```typescript
export interface BudgetConfig {
  /** 每日预算上限 (USD cents) */
  dailyLimitCents: number;
  /** 月度预算上限 */
  monthlyLimitCents: number;
  /** 预警阈值 (0-1, 达到后触发通知) */
  warningThreshold: number;
}

export function checkBudget(keyId: string, config: BudgetConfig): {
  withinBudget: boolean;
  dailyUsed: number;
  monthlyUsed: number;
  warning: boolean;
} {
  // 计算并返回预算状态
}
```

##### 4.3 健康状态集成

已在 Layer 3 的 `providerRouter.ts` 中直接集成 `recordApiUsage()` 调用。

**改动量**：增强 ~100 行。

---

## 三、迁移策略

### Phase 1: 非破坏性新增 (v1.1)
1. 新增 `services/providerPresets.ts` — 纯数据文件，无侵入
2. 新增 `services/providerAdapters.ts` — 接口定义 + 3 个基础 adapter
3. 新增 `services/providerRouter.ts` — 熔断器 + 路由选择 + `callWithFailover()`
4. 增强 `utils/usageMonitor.ts` — 精确价格表 + 预算预警

### Phase 2: 渐进迁移 (v1.2)
5. 在 `aiGateway.ts` 中引入 `callWithFailover()` 包装现有调用
6. 将 `DEFAULT_PROVIDER_MODELS` 改为从 `PROVIDER_PRESETS` 生成
7. 将 `inferProviderFromKey()` 改为基于 `inferPresetFromKey()`
8. `useApiKeys.ts` 中添加 preset 选择器逻辑

### Phase 3: UI 集成 (v1.3)
9. `OnboardingWizard` 新增预设选择 UI (分 category 展示)
10. Settings 面板展示 Key 健康状态 (绿/黄/红)
11. Settings 面板展示用量统计 + 预算预警
12. Toast 通知：故障转移切换、预算预警、Key 自动禁用

### Phase 4: 高级功能 (v1.4)
13. 模型映射编辑器 (类似 One-API 的 ModelMapping)
14. 同 capability 多 Key 轮换策略
15. 自定义 One-API / LiteLLM 实例预设接入
16. 导入/导出预设配置

---

## 四、文件变更清单

| 文件 | 操作 | 预估行数 |
|------|------|----------|
| `services/providerPresets.ts` | **新增** | ~300 |
| `services/providerAdapters.ts` | **新增** | ~200 |
| `services/providerRouter.ts` | **新增** | ~250 |
| `utils/usageMonitor.ts` | **增强** | +100 |
| `services/aiGateway.ts` | **修改** | ±80 (包装 callWithFailover) |
| `hooks/useApiKeys.ts` | **修改** | ±50 (预设驱动) |
| `types.ts` | **修改** | +20 (新类型) |
| `components/OnboardingWizard.tsx` | **修改** | ±100 (预设选择 UI) |
| **合计** | | ~1,100 新增 / ±250 修改 |

---

## 五、对比参考项目的适配决策

| 特性 | cc-switch | One-API | LiteLLM | Flovart 决策 |
|------|-----------|---------|---------|--------------|
| 运行环境 | Tauri (Rust+TS) | Go Server | Python Server | **浏览器 SPA** |
| 代理层 | 本地 HTTP Proxy | Go HTTP Relay | Python Proxy | **不需要** (直连) |
| 熔断器 | Rust CircuitBreaker | Go AutoDisable | Python Router fallback | **JS 内存 CircuitBreaker** |
| 数据存储 | SQLite + WebDAV | MySQL/SQLite | PostgreSQL | **AES-GCM localStorage** |
| Provider 预设 | 50+ TS presets | 20+ Go channeltype | 100+ Python providers | **20+ TS presets** (可扩展) |
| Auth 策略 | 5 种 AuthStrategy | Header 注入 | header_factory | **5 种 AuthMethod** |
| 模型映射 | templateValues | ModelMapping JSON | model alias | **modelMapping Record** |
| 费用追踪 | 无 | Quota + Balance | model_prices JSON | **MODEL_PRICES + Budget** |
| 故障转移 | failover_queue | 渠道优先级+重试 | Router retry/fallback | **callWithFailover()** |
| 负载均衡 | 权重选择 | Weight + Priority | deployment routing | **健康评分排序** |

---

## 六、问题清单

在实施前需确认：
1. 是否需要 Key 导入/导出功能 (One-API 的批量管理能力)？
2. 预设列表是否需要远程更新能力 (类似 cc-switch 的 preset 更新)？
3. 是否需要增加对 Azure OpenAI / AWS Bedrock 的直接支持？
4. 预算预警是否需要通知到浏览器 Notification API？
5. 是否需要 Key 轮换策略 (多个同 provider key 的分布式轮流使用)？
