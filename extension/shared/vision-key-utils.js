const DEFAULT_BASE_URLS = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  minimax: 'https://api.minimax.chat/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  openrouter: 'https://openrouter.ai/api/v1',
};

const FALLBACK_MODELS = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
  openrouter: 'openai/gpt-4o-mini',
  custom: 'gpt-4o-mini',
};

function trimSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isRootPath(pathname) {
  return pathname === '' || pathname === '/';
}

function normalizeOpenAIBaseUrl(provider, baseUrl) {
  const trimmed = trimSlashes(baseUrl);
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!isRootPath(parsed.pathname)) return trimmed;
    if (provider === 'openrouter' || /openrouter/i.test(parsed.hostname)) return `${parsed.origin}/api/v1`;
    if (provider === 'qwen' || /dashscope\.aliyuncs\.com/i.test(parsed.hostname)) return `${parsed.origin}/compatible-mode/v1`;
    if (provider === 'volcengine' || /volces\.com/i.test(parsed.hostname)) return `${parsed.origin}/api/v3`;
    return `${parsed.origin}/v1`;
  } catch {
    return trimmed;
  }
}

function modelIdFromEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry.id === 'string') return entry.id.trim();
  if (typeof entry.name === 'string') return entry.name.trim();
  return '';
}

function parseJsonRecord(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveMappedModel(model, keyConfig) {
  const directMappings = parseJsonRecord(keyConfig?.extraConfig?.modelMappingsJson);
  const configJson = parseJsonRecord(keyConfig?.extraConfig?.configJson);
  const nestedMappings = configJson?.modelMappings && typeof configJson.modelMappings === 'object' && !Array.isArray(configJson.modelMappings)
    ? configJson.modelMappings
    : null;
  const mappings = { ...(nestedMappings || {}), ...(directMappings || {}) };
  const mapped = mappings[model];
  return typeof mapped === 'string' && mapped.trim() ? mapped.trim() : model;
}

function buildCompatibleHeaders(keyConfig) {
  const apiKey = keyConfig?.key || '';
  const headers = { 'Content-Type': 'application/json' };
  const headerName = keyConfig?.extraConfig?.authHeaderName?.trim();
  const authScheme = keyConfig?.extraConfig?.authScheme;
  const value = authScheme === undefined
    ? `Bearer ${apiKey}`
    : authScheme.trim()
      ? `${authScheme.trim()} ${apiKey}`
      : apiKey;
  headers[headerName || 'Authorization'] = value;
  return headers;
}

export function pickConfiguredModel(keyConfig) {
  const provider = keyConfig?.provider || 'custom';
  const candidates = [
    keyConfig?.defaultModel,
    ...(Array.isArray(keyConfig?.models) ? keyConfig.models : []),
    ...(Array.isArray(keyConfig?.customModels) ? keyConfig.customModels : []),
    FALLBACK_MODELS[provider],
    FALLBACK_MODELS.custom,
  ];
  for (const candidate of candidates) {
    const model = modelIdFromEntry(candidate);
    if (model) return model;
  }
  return FALLBACK_MODELS.custom;
}

export function buildVisionApiPlan(keyConfig) {
  const provider = keyConfig?.provider || 'custom';
  const pickedModel = pickConfiguredModel(keyConfig);
  const model = resolveMappedModel(pickedModel, keyConfig);

  if (provider === 'google') {
    return {
      kind: 'google',
      model: model.startsWith('gemini') ? model : FALLBACK_MODELS.google,
      baseUrl: trimSlashes(keyConfig?.baseUrl || DEFAULT_BASE_URLS.google),
    };
  }

  if (provider === 'anthropic') {
    return {
      kind: 'anthropic',
      model: model.startsWith('claude') ? model : FALLBACK_MODELS.anthropic,
      baseUrl: trimSlashes(keyConfig?.baseUrl || DEFAULT_BASE_URLS.anthropic),
    };
  }

  return {
    kind: 'openai-compatible',
    model,
    baseUrl: normalizeOpenAIBaseUrl(provider, keyConfig?.baseUrl || DEFAULT_BASE_URLS[provider] || DEFAULT_BASE_URLS.openai),
    headers: provider === 'openrouter'
      ? {
        ...buildCompatibleHeaders(keyConfig),
        'HTTP-Referer': 'https://flovart.app',
        'X-OpenRouter-Title': 'Flovart Extension',
      }
      : buildCompatibleHeaders(keyConfig),
  };
}
