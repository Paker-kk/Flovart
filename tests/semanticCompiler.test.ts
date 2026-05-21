import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '../types';
import { compilePromptReferences, syncReferencesOnRename } from '../utils/semanticCompiler';

const elements: CanvasElement[] = [
  { id: 'img_a', type: 'image', name: '首帧参考', x: 0, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' },
  { id: 'img_b', type: 'image', name: '风格参考', x: 120, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' },
  { id: 'vid_a', type: 'video', name: '分镜视频', x: 240, y: 0, width: 100, height: 100, href: '', mimeType: 'video/mp4' },
];

describe('wire-free semantic compiler', () => {
  it('compiles @ tokens into stable element ids', () => {
    const payload = compilePromptReferences('请让 @首帧参考 使用 @风格参考 的废土色彩。', elements);

    expect(payload.rawText).toBe('请让 @首帧参考 使用 @风格参考 的废土色彩。');
    expect(payload.resolvedReferences).toEqual([
      { token: '@首帧参考', targetElementId: 'img_a', targetType: 'image' },
      { token: '@风格参考', targetElementId: 'img_b', targetType: 'image' },
    ]);
  });

  it('filters explicit negative references', () => {
    const payload = compilePromptReferences('参考 @首帧参考，但不要像 @风格参考 那样昏暗。', elements);

    expect(payload.resolvedReferences).toEqual([
      { token: '@首帧参考', targetElementId: 'img_a', targetType: 'image' },
    ]);
  });

  it('syncs renamed tokens without changing target ids', () => {
    const payload = compilePromptReferences('请让 @首帧参考 动起来。', elements);
    const synced = syncReferencesOnRename('首帧参考', '废土核心人设', payload);

    expect(synced.rawText).toBe('请让 @废土核心人设 动起来。');
    expect(synced.resolvedReferences).toEqual([
      { token: '@废土核心人设', targetElementId: 'img_a', targetType: 'image' },
    ]);
  });

  it('does not replace prefixed sibling tokens when renaming short names', () => {
    const payload = {
      rawText: '参考 @A，但不要替换 @A_1。',
      resolvedReferences: [
        { token: '@A', targetElementId: 'img_a', targetType: 'image' as const },
        { token: '@A_1', targetElementId: 'img_b', targetType: 'image' as const },
      ],
    };

    const synced = syncReferencesOnRename('A', 'B', payload);

    expect(synced.rawText).toBe('参考 @B，但不要替换 @A_1。');
    expect(synced.resolvedReferences.map((reference) => reference.token)).toEqual(['@B', '@A_1']);
  });
});
