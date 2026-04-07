/**
 * 类型完整性验证测试 — 确保所有核心类型定义完整、字段匹配
 * 覆盖：AIProvider、GenerationMode、UserApiKey、Board、CharacterLockProfile 等
 */
import { describe, it, expect } from 'vitest';
import type {
    AIProvider,
    UserApiKey,
    GenerationMode,
    PromptEnhanceMode,
    Element,
    ImageElement,
    VideoElement,
    Board,
    AssetCategory,
    CharacterLockProfile,
} from '../types';

describe('types.ts - 类型完整性验证', () => {
    it('AIProvider 包含所有预期值', () => {
        const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'qwen', 'banana', 'deepseek', 'siliconflow', 'keling', 'flux', 'midjourney', 'runningHub', 'minimax', 'volcengine', 'openrouter', 'custom'];
        expect(providers).toHaveLength(15);
    });

    it('GenerationMode 包含 image / video / keyframe', () => {
        const modes: GenerationMode[] = ['image', 'video', 'keyframe'];
        expect(modes).toHaveLength(3);
    });

    it('PromptEnhanceMode 有 4 种模式', () => {
        const modes: PromptEnhanceMode[] = ['smart', 'style', 'precise', 'translate'];
        expect(modes).toHaveLength(4);
    });

    it('UserApiKey 结构包含必需字段', () => {
        const key: UserApiKey = {
            id: 'test-id',
            provider: 'google',
            capabilities: ['text', 'image'],
            key: 'api-key-value',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        expect(key.provider).toBe('google');
        expect(key.capabilities).toContain('text');
    });

    it('ImageElement 结构正确', () => {
        const img: ImageElement = {
            id: 'img-1',
            type: 'image',
            x: 0, y: 0,
            href: 'data:image/png;base64,abc',
            width: 100, height: 100,
            mimeType: 'image/png',
        };
        expect(img.type).toBe('image');
    });

    it('VideoElement 结构正确', () => {
        const vid: VideoElement = {
            id: 'vid-1',
            type: 'video',
            x: 0, y: 0,
            href: 'blob:xxx',
            width: 640, height: 480,
            mimeType: 'video/mp4',
        };
        expect(vid.type).toBe('video');
    });

    it('Board 结构可以实例化', () => {
        const board: Board = {
            id: 'board-1',
            name: 'Test Board',
            elements: [],
            history: [[]],
            historyIndex: 0,
            panOffset: { x: 0, y: 0 },
            zoom: 1,
            canvasBackgroundColor: '#ffffff',
        };
        expect(board.elements).toEqual([]);
        expect(board.zoom).toBe(1);
    });

    it('AssetCategory 三种分类', () => {
        const categories: AssetCategory[] = ['character', 'scene', 'prop'];
        expect(categories).toHaveLength(3);
    });

    it('CharacterLockProfile 包含必需字段', () => {
        const profile: CharacterLockProfile = {
            id: 'cl-1',
            name: 'Test Character',
            anchorElementId: 'img-1',
            referenceImage: 'data:image/png;base64,abc',
            descriptor: 'A woman with red hair',
            createdAt: Date.now(),
            isActive: true,
        };
        expect(profile.isActive).toBe(true);
        expect(profile.descriptor).toContain('red hair');
    });
});
