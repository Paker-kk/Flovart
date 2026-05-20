import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from '../stores/useBoardStore';

describe('Flovart-cc Wire-Free Deduplication & Rename Sync Engine Test Suite', () => {
  beforeEach(() => {
    useBoardStore.setState({ elements: [], errorLog: {} });
  });

  it('应当在添加重名资产时，由存储层原子执行后缀递增去重', () => {
    const store = useBoardStore.getState();

    store.addElement({ id: 'el_1', type: 'image', name: '朱鸢资产', x: 0, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });
    store.addElement({ id: 'el_2', type: 'image', name: '朱鸢资产', x: 200, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });
    store.addElement({ id: 'el_3', type: 'image', name: '  朱鸢资产  ', x: 400, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });

    const current = useBoardStore.getState().elements;
    expect(current[0].name).toBe('朱鸢资产');
    expect(current[1].name).toBe('朱鸢资产_1');
    expect(current[2].name).toBe('朱鸢资产_2');
  });

  it('应当在资产重命名时，无损执行下游元素的提示词标签无痕热重构', () => {
    const store = useBoardStore.getState();

    store.addElement({ id: 'img_src', type: 'image', name: '首帧参考', x: 0, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });
    store.addElement({
      id: 'vid_dst',
      type: 'video',
      name: '分镜视频',
      x: 300,
      y: 0,
      width: 100,
      height: 100,
      href: '',
      mimeType: 'video/mp4',
      initialPrompt: '请让 @首帧参考 动起来，镜头拉近。',
    });

    let elements = useBoardStore.getState().elements;
    expect(elements[1].generationState?.promptPayload.resolvedReferences[0].targetElementId).toBe('img_src');

    store.updateElementMeta('img_src', { name: '废土核心人设' });

    elements = useBoardStore.getState().elements;
    expect(elements[0].name).toBe('废土核心人设');
    expect(elements[1].generationState?.promptPayload.rawText).toBe('请让 @废土核心人设 动起来，镜头拉近。');
    expect(elements[1].generationState?.promptPayload.resolvedReferences[0].token).toBe('@废土核心人设');
    expect(elements[1].generationState?.promptPayload.resolvedReferences[0].targetElementId).toBe('img_src');
  });

  it('重命名短标签时不应误伤带后缀的相邻资产标签', () => {
    const store = useBoardStore.getState();

    store.addElement({ id: 'img_a', type: 'image', name: 'A', x: 0, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });
    store.addElement({ id: 'img_a_1', type: 'image', name: 'A_1', x: 200, y: 0, width: 100, height: 100, href: '', mimeType: 'image/png' });
    store.addElement({
      id: 'vid_dst',
      type: 'video',
      name: '分镜视频',
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      href: '',
      mimeType: 'video/mp4',
      initialPrompt: '参考 @A，但不要替换 @A_1。',
    });

    store.updateElementMeta('img_a', { name: 'B' });

    const elements = useBoardStore.getState().elements;
    expect(elements[2].generationState?.promptPayload.rawText).toBe('参考 @B，但不要替换 @A_1。');
    expect(elements[2].generationState?.promptPayload.resolvedReferences.map((ref) => ref.token)).toEqual(['@B', '@A_1']);
  });
});
