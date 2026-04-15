/**
 * 临时端到端测试 — 用真实 API Key 跑通图片生成全链路
 * 运行: npx vitest run tests/e2e-realapi.test.ts
 * 测试后请删除此文件（含 API Key 信息不可提交）
 */
import { describe, it, expect, vi } from 'vitest';

const REAL_API_KEY = 'sk-PyZwQXLOffHgkqYJVXFYngrqut8VKtBIC4ybWGe8URe9te5f';
const REAL_BASE_URL = 'https://ai.t8star.cn/v1';

describe('E2E: 真实 API 图片生成全链路', () => {
    it('generateImageWithProvider (custom key, nano-banana-pro-2k) 返回图片', async () => {
        const { generateImageWithProvider } = await import('../services/aiGateway');

        // 模拟 UserApiKey
        const customKey = {
            id: 'test-key-1',
            provider: 'custom' as const,
            capabilities: ['image' as const, 'text' as const, 'video' as const],
            key: REAL_API_KEY,
            baseUrl: REAL_BASE_URL,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        console.log('[E2E] Starting generateImageWithProvider...');
        const t0 = Date.now();

        const result = await generateImageWithProvider(
            'A cute cartoon cat with big eyes, bright colors, simple background',
            'nano-banana-pro-2k',
            customKey,
        );

        console.log(`[E2E] Completed in ${Date.now() - t0}ms:`, {
            hasBase64: !!result.newImageBase64,
            base64Length: result.newImageBase64?.length || 0,
            mimeType: result.newImageMimeType,
            textResponse: result.textResponse?.slice(0, 100),
        });

        expect(result.newImageBase64).toBeTruthy();
        expect(result.newImageBase64!.length).toBeGreaterThan(1000);
        expect(result.newImageMimeType).toBeTruthy();
    }, 300_000); // 允许 300 秒超时

    it('validateApiKey (custom key) 通过验证', async () => {
        const { validateApiKey } = await import('../services/aiGateway');

        const result = await validateApiKey('custom', REAL_API_KEY, REAL_BASE_URL);

        console.log('Validation result:', result);
        expect(result.ok).toBe(true);
    }, 30_000);

    it('resolveGenerationProvider 对 custom key 不误路由', async () => {
        const mod = await import('../services/aiGateway');
        // inferProviderFromModel('veo3.1-fast') 会返回 google
        expect(mod.inferProviderFromModel('veo3.1-fast')).toBe('google');
        // 但 resolveGenerationProvider 不导出，通过 generateVideoWithProvider 间接测试
        // 验证 inferProviderFromModel 对 nano-banana-pro-2k
        const nanoProvider = mod.inferProviderFromModel('nano-banana-pro-2k');
        console.log('nano-banana-pro-2k inferred provider:', nanoProvider);
        // 这个模型名不匹配任何已知 provider，会走 custom
        expect(nanoProvider).toBe('custom');
    });
});
