import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeSummary } from '../hooks/useApiKeys';

describe('buildAgentRuntimeSummary', () => {
    it('distinguishes discussion support from Banana endpoint support', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gpt-4o',
            keys: [{ provider: 'openai', key: 'sk-test', capabilities: ['text'] }],
        });

        expect(summary.discussionSupported).toBe(true);
        expect(summary.bananaRuntimeSupported).toBe(false);
    });

    it('reports both supported when Banana + text keys exist', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gemini-2.5-pro',
            keys: [
                { provider: 'google', key: 'AIzaSy123', capabilities: ['text', 'image', 'video'] },
                { provider: 'banana', key: 'bn-key', capabilities: ['agent'] },
            ],
        });

        expect(summary.discussionSupported).toBe(true);
        expect(summary.bananaRuntimeSupported).toBe(true);
    });

    it('reports neither when no keys', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gpt-4o',
            keys: [],
        });

        expect(summary.discussionSupported).toBe(false);
        expect(summary.bananaRuntimeSupported).toBe(false);
    });
});
