/**
 * aiGateway 验证测试 — 测试 validateApiKey 对各 provider 的验证逻辑
 * 包括 Google (models.list)、OpenAI (/models)、Anthropic (/messages) 等格式校验
 * 以及 generateImageWithProvider 对不支持 provider 的报错行为
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateApiKey, inferProviderFromModel, generateImageWithProvider } from '../services/aiGateway';

function mockJsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
        headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
    } as Response;
}

describe('aiGateway - validateApiKey', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('Google provider 调用 models.list 接口验证', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            models: [{
                name: 'models/gemini-3.1-flash-image-preview',
                displayName: 'Gemini 3.1 Flash Image Preview',
                supportedGenerationMethods: ['generateImages'],
            }],
        }));
        const result = await validateApiKey('google', 'test-google-key');
        expect(result.ok).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('generativelanguage.googleapis.com')
        );
    });

    it('OpenAI provider 调用 /models 接口验证', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            data: [{ id: 'gpt-4o' }],
        }));
        const result = await validateApiKey('openai', 'sk-test-key');
        expect(result.ok).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('api.openai.com/v1/models'),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer sk-test-key' }),
            })
        );
    });

    it('短 key 格式校验失败（通用）', async () => {
        const result = await validateApiKey('banana' as any, 'short');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('太短');
    });

    it('Anthropic provider 验证逻辑', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
        });
        const result = await validateApiKey('anthropic', 'sk-ant-test-key');
        expect(result.ok).toBe(true);
    });

    it('custom 裸域名会自动补全到 /v1 并返回 effectiveBaseUrl', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            data: [{ id: 'gemini-3.1-flash-image-preview-512px' }],
        }));

        const result = await validateApiKey('custom', 'sk-test-key', 'https://ai.t8star.cn');

        expect(result.ok).toBe(true);
        expect(result.effectiveBaseUrl).toBe('https://ai.t8star.cn/v1');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://ai.t8star.cn/v1/models',
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer sk-test-key' }),
            })
        );
    });
});

describe('aiGateway - generateImageWithProvider', () => {
    it('OpenRouter 使用 chat completions 返回图片 data url', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{
                message: {
                    images: [{ image_url: { url: 'data:image/png;base64,ZmFrZQ==' } }],
                },
            }],
        }));

        const result = await generateImageWithProvider('test prompt', 'openai/gpt-image-1', {
            id: '1',
            provider: 'openrouter',
            capabilities: ['image'],
            key: 'sk-or-test-key',
            createdAt: 0,
            updatedAt: 0,
        });

        expect(result.newImageBase64).toBe('ZmFrZQ==');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('openrouter.ai/api/v1/chat/completions'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('custom OpenAI 兼容端点即使模型带前缀也走 images/generations', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            data: [{ b64_json: 'ZmFrZQ==' }],
        }));

        const result = await generateImageWithProvider('test prompt', 'openai/gpt-image-1', {
            id: '2',
            provider: 'custom',
            capabilities: ['image'],
            key: 'sk-test-key',
            baseUrl: 'https://example-proxy.test/v1',
            extraConfig: { endpointFlavor: 'openai-compatible' },
            createdAt: 0,
            updatedAt: 0,
        });

        expect(result.newImageBase64).toBe('ZmFrZQ==');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            expect.stringContaining('example-proxy.test/v1/images/generations'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('custom 裸域名在图片生成时自动补全到 /v1', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            data: [{ b64_json: 'ZmFrZQ==' }],
        }));

        const result = await generateImageWithProvider('test prompt', 'gemini-3.1-flash-image-preview-512px', {
            id: '3',
            provider: 'custom',
            capabilities: ['image'],
            key: 'sk-test-key',
            baseUrl: 'https://ai.t8star.cn',
            extraConfig: { endpointFlavor: 'openai-compatible' },
            createdAt: 0,
            updatedAt: 0,
        });

        expect(result.newImageBase64).toBe('ZmFrZQ==');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://ai.t8star.cn/v1/images/generations',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('不支持的 provider 抛出错误', async () => {
        await expect(
            generateImageWithProvider('test prompt', 'claude-3-haiku', { id: '1', provider: 'anthropic', capabilities: ['text'], key: 'test', createdAt: 0, updatedAt: 0 })
        ).rejects.toThrow('暂不支持');
    });
});
