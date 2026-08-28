import { describe, expect, it } from 'vitest';
import { createWorkflowNode } from '../components/workflow/constants';
import { buildCanonicalGenerationInput, resolveWorkflowInputs } from '../components/workflow/inputResolver';
import { createPromptIntent, promptIntentFromNode } from '../components/workflow/promptIntent';

describe('PromptIntent contract', () => {
  it('keeps only stable target, text, mention identity and action', () => {
    const intent = createPromptIntent({
      targetNodeId: 'target',
      text: '参考 @角色 生成镜头',
      requestedAction: 'generate',
      mentions: [
        { id: 'character', label: '角色', elementType: 'image' },
        { id: 'character', label: '重复引用', elementType: 'image' },
      ],
    });

    expect(intent).toEqual({
      targetNodeId: 'target',
      text: '参考 @角色 生成镜头',
      mentions: [{ id: 'character', label: '角色', elementType: 'image' }],
      requestedAction: 'generate',
    });
    expect(intent).not.toHaveProperty('provider');
    expect(intent).not.toHaveProperty('apiKey');
  });

  it('uses the current PromptIntent as the single input to graph, mention and artifact resolution', () => {
    const source = createWorkflowNode('artifact-node', 'image', { x: 0, y: 0 }, {
      artifactRef: { taskId: 'task-1', artifactId: 'artifact-1', kind: 'image', mimeType: 'image/png' },
      prompt: '旧文本不应覆盖意图',
    });
    const target = createWorkflowNode('target', 'image', { x: 420, y: 0 }, {
      prompt: '旧 Prompt',
      mentionedNodeIds: ['missing-node'],
      config: { mode: 'image', submode: 'image-to-image' },
    });
    const promptIntent = createPromptIntent({
      targetNodeId: target.id,
      text: '参考 @角色 修改构图',
      mentions: [{ id: source.id, label: '角色', elementType: 'image' }],
      requestedAction: 'generate',
    });
    const inputs = resolveWorkflowInputs(target, [source, target], [{ id: 'edge', fromNodeId: source.id, toNodeId: target.id }], { promptIntent });
    const canonical = buildCanonicalGenerationInput({ targetNode: target, inputs, prompt: inputs.prompt, mode: 'image', submode: 'image-to-image' });

    expect(inputs.prompt).toBe('参考 @角色 修改构图');
    expect(inputs.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: 'missing-node' })]));
    expect(canonical.references).toEqual([expect.objectContaining({
      origin: 'runtime-artifact',
      label: '角色',
      resource: expect.objectContaining({ locator: expect.objectContaining({ kind: 'runtime-artifact' }) }),
    })]);
  });

  it('projects an existing node into the same intent shape for compatibility callers', () => {
    const node = createWorkflowNode('target', 'video', { x: 0, y: 0 }, {
      prompt: '让画面动起来',
      mentionedNodeIds: ['image-1'],
    });
    expect(promptIntentFromNode(node, 'generate')).toEqual({
      targetNodeId: 'target',
      text: '让画面动起来',
      mentions: [{ id: 'image-1' }],
      requestedAction: 'generate',
    });
  });
});
