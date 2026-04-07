/**
 * geminiService 单元测试 — 测试 Gemini 服务的配置和 API Key 验证
 * 使用 mock fetch 避免真实 API 调用
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setGeminiRuntimeConfig, validateGeminiApiKey } from '../services/geminiService';

describe('geminiService - API Key 配置', () => {
    it('setGeminiRuntimeConfig 不抛异常', () => {
        expect(() => setGeminiRuntimeConfig({
            textApiKey: 'test-key',
            imageApiKey: 'test-key-2',
        })).not.toThrow();
    });

    it('validateGeminiApiKey 对无效 key 返回错误', async () => {
        // Mock fetch 返回 400
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: { message: 'API key not valid' } }),
        });
        const result = await validateGeminiApiKey('invalid-key');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('API Key 无效');
    });

    it('validateGeminiApiKey 对有效 key 返回成功', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
        });
        const result = await validateGeminiApiKey('valid-key');
        expect(result.ok).toBe(true);
    });

    it('validateGeminiApiKey 网络错误返回失败', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
        const result = await validateGeminiApiKey('any-key');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Network error');
    });
});
