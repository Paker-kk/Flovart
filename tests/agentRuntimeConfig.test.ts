import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeSummary } from '../hooks/useApiKeys';

describe('buildAgentRuntimeSummary', () => {
    it('distinguishes discussion support from image tool endpoint support', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gpt-4o',
            keys: [{ provider: 'openai', key: 'sk-test', capabilities: ['text'] }],
        });

        expect(summary.discussionSupported).toBe(true);
        expect(summary.imageToolSupported).toBe(false);
    });

    it('reports both supported when image tool + text keys exist', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gemini-2.5-pro',
            keys: [
                { provider: 'google', key: 'AIzaSy123', capabilities: ['text', 'image', 'video'] },
                { provider: 'custom', key: 'tool-key', capabilities: ['agent'] },
            ],
        });

        expect(summary.discussionSupported).toBe(true);
        expect(summary.imageToolSupported).toBe(true);
    });

    it('reports neither when no keys', () => {
        const summary = buildAgentRuntimeSummary({
            textModel: 'gpt-4o',
            keys: [],
        });

        expect(summary.discussionSupported).toBe(false);
        expect(summary.imageToolSupported).toBe(false);
    });
});
