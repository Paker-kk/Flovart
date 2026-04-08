import type { AIProvider } from '../types';

const OPENAI_COMPATIBLE_PROVIDERS = new Set<AIProvider>([
    'openai',
    'openrouter',
    'deepseek',
    'siliconflow',
    'qwen',
    'minimax',
    'volcengine',
    'custom',
    'keling',
    'flux',
    'midjourney',
]);

function trimTrailingSlashes(value: string) {
    return value.trim().replace(/\/+$/, '');
}

function safeParseUrl(value: string) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isRootPath(pathname: string) {
    return pathname === '' || pathname === '/';
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

export function normalizeProviderBaseUrl(provider: AIProvider, baseUrl?: string) {
    const trimmed = trimTrailingSlashes(baseUrl || '');
    if (!trimmed) return trimmed;

    if (provider === 'google') {
        return trimmed.replace(/\/models$/i, '');
    }

    if (!OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
        return trimmed;
    }

    const parsed = safeParseUrl(trimmed);
    if (!parsed || !isRootPath(parsed.pathname)) {
        return trimmed;
    }

    const origin = parsed.origin;
    if (provider === 'openrouter' || /openrouter/i.test(parsed.hostname)) {
        return `${origin}/api/v1`;
    }
    if (provider === 'qwen' || /dashscope\.aliyuncs\.com/i.test(parsed.hostname)) {
        return `${origin}/compatible-mode/v1`;
    }
    if (provider === 'volcengine' || /volces\.com/i.test(parsed.hostname)) {
        return `${origin}/api/v3`;
    }
    return `${origin}/v1`;
}

export function getOpenAICompatibleBaseUrlCandidates(provider: AIProvider, baseUrl: string) {
    const trimmed = trimTrailingSlashes(baseUrl);
    if (!trimmed) return [];

    const normalized = normalizeProviderBaseUrl(provider, trimmed);
    const parsed = safeParseUrl(trimmed);
    if (!parsed || !isRootPath(parsed.pathname)) {
        return unique([normalized, trimmed]);
    }

    const origin = parsed.origin;
    const candidates = provider === 'openrouter' || /openrouter/i.test(parsed.hostname)
        ? [`${origin}/api/v1`, normalized, trimmed, `${origin}/v1`]
        : [normalized, trimmed, `${origin}/v1`, `${origin}/api/v1`];

    if (provider === 'qwen' || /dashscope\.aliyuncs\.com/i.test(parsed.hostname)) {
        candidates.push(`${origin}/compatible-mode/v1`);
    }
    if (provider === 'volcengine' || /volces\.com/i.test(parsed.hostname)) {
        candidates.push(`${origin}/api/v3`);
    }

    return unique(candidates);
}