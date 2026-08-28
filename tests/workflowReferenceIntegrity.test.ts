import { describe, expect, it, vi } from 'vitest';
import { runWorkflowGeneration } from '../services/workflowGeneration';
import {
  createWorkflowOperationInputBinding,
  createWorkflowOperationNode,
  workflowOperationInputConnections,
} from '../components/workflow/operations';
import { getWorkflowInputNodes, toImageReferenceChips, toWorkflowMentionItems } from '../components/workflow/references';
import { isFetchableMediaHref } from '../components/workflow/media';
import { workflowMediaStorage } from '../components/workflow/storage';
import { createWorkflowNode } from '../components/workflow/constants';
import type { WorkflowProject } from '../components/workflow/types';
import type { ProductModelMode, UserApiKey } from '../types';

const imageKey: UserApiKey = {
  id: 'image-key',
  provider: 'openai',
  capabilities: ['image'],
  key: 'secret',
  customModels: ['gpt-image-2'],
  routeMappings: [
    { target: { kind: 'product-mode', productModelId: 'flovart:gpt-image-2', mode: 'text-to-image' as const }, routeId: 'gpt-image-2', order: 0 },
    { target: { kind: 'product-mode', productModelId: 'flovart:gpt-image-2', mode: 'image-to-image' as const }, routeId: 'gpt-image-2', order: 0 },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const baseProject = (nodes: WorkflowProject['nodes'], connections: WorkflowProject['connections']): WorkflowProject => ({
  id: 'project-integrity',
  title: '引用完整性',
  nodes,
  connections,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, k: 1 },
  backgroundMode: 'dots',
  agentSessions: [],
  activeAgentSessionId: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
});

const generationRuntimeOverrides = (latest: { current: WorkflowProject }) => ({
  userApiKeys: [imageKey],
  executeMedia: vi.fn().mockResolvedValue({ ok: true, elementId: 'operation-1', capability: 'image', mediaUrl: 'https://output/result', mimeType: 'image/png' }),
  fetchMedia: vi.fn().mockResolvedValue(new Blob(['result'])),
  ingestMedia: vi.fn().mockResolvedValue({ type: 'image', storageKey: 'fresh-result-key', name: 'result.png', mimeType: 'image/png', bytes: 6, naturalWidth: 800, naturalHeight: 400 }),
  encodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AA=='),
  getProject: () => latest.current,
  onProjectChange: (next: WorkflowProject) => { latest.current = next; },
});

describe('workflow reference integrity', () => {
  it('keeps a shared storage key alive when in-place regeneration replaces the initiator media', async () => {
    await workflowMediaStorage.clear();
    await workflowMediaStorage.set('shared-old-key', new Blob(['shared-source']));
    const operation = await createWorkflowOperationNode({
      id: 'operation-1', capabilityId: 'image.generate@1', position: { x: 0, y: 0 }, prompt: '再生成一张',
      productModelId: 'flovart:gpt-image-2', parameters: { submode: 'image-to-image', count: 1 },
      inputBindings: [createWorkflowOperationInputBinding('binding-1', 'hidden-input', 'reference_image', 0)],
      now: '2026-08-22T00:00:00.000Z',
    });
    // 模拟"原位替换成 operation 后再次生成"的形态：operation 自身还挂着旧图 storageKey，
    // 隐藏输入节点与它共享同一个 key。
    operation.metadata = { ...operation.metadata, storageKey: 'shared-old-key', mimeType: 'image/png' };
    const hiddenInput = {
      ...createWorkflowNode('hidden-input', 'image', { x: 0, y: 320 }, { storageKey: 'shared-old-key', mimeType: 'image/png', status: 'success' as const }),
      isVisible: false,
      isLocked: true,
    };
    const latest = { current: baseProject([operation, hiddenInput], workflowOperationInputConnections(operation)) };

    await runWorkflowGeneration(latest.current, 'operation-1', generationRuntimeOverrides(latest));

    // 旧图仍被隐藏输入引用，不能因为原位写回而被物理删除。
    expect(await workflowMediaStorage.get('shared-old-key')).not.toBeNull();
  });

  it('fails with a named actionable error when a referenced image blob is missing', async () => {
    await workflowMediaStorage.clear();
    const operation = await createWorkflowOperationNode({
      id: 'operation-1', capabilityId: 'image.generate@1', position: { x: 420, y: 0 }, prompt: '基于参考图再画',
      productModelId: 'flovart:gpt-image-2', parameters: { submode: 'image-to-image', count: 1 },
      inputBindings: [createWorkflowOperationInputBinding('binding-1', 'reference-1', 'reference_image', 0)],
      now: '2026-08-22T00:00:00.000Z',
    });
    const reference = createWorkflowNode('reference-1', 'image', { x: 0, y: 0 }, { storageKey: 'missing-blob-key', mimeType: 'image/png', status: 'success' });
    const latest = { current: baseProject([operation, reference], workflowOperationInputConnections(operation)) };
    const overrides = generationRuntimeOverrides(latest);

    const result = await runWorkflowGeneration(latest.current, 'operation-1', overrides);

    const error = result.nodes.find(node => node.id === 'operation-1')?.metadata.error || '';
    expect(error).toContain(`「${reference.title}」`);
    expect(error).toContain('已不存在');
  });

  it('treats hidden upstream inputs as real reference candidates for chips and mentions', () => {
    const target = createWorkflowNode('target', 'config', { x: 420, y: 0 }, {});
    const visible = createWorkflowNode('visible-ref', 'image', { x: 0, y: 0 }, { href: 'https://cdn.example.com/a.png' });
    const hidden = {
      ...createWorkflowNode('hidden-ref', 'image', { x: 0, y: 220 }, { storageKey: 'hidden-key', mimeType: 'image/png' }),
      isVisible: false,
    };
    const connections = [
      { id: 'c1', fromNodeId: 'visible-ref', toNodeId: 'target' },
      { id: 'c2', fromNodeId: 'hidden-ref', toNodeId: 'target' },
    ];
    const inputs = getWorkflowInputNodes(target, [target, visible, hidden], connections);
    expect(inputs.map(node => node.id)).toEqual(['visible-ref', 'hidden-ref']);

    const ordered = [...inputs];
    expect(toImageReferenceChips(ordered, []).map(chip => chip.label)).toEqual(toWorkflowMentionItems(ordered).map(item => item.label));
  });

  it('only treats fetchable hrefs as renderable thumbnails', () => {
    expect(isFetchableMediaHref('https://cdn.example.com/a.png')).toBe(true);
    expect(isFetchableMediaHref('data:image/png;base64,AA==')).toBe(true);
    expect(isFetchableMediaHref('blob:test/1')).toBe(true);
    expect(isFetchableMediaHref('asset-library:abc')).toBe(false);
    expect(isFetchableMediaHref('cold-media:xyz')).toBe(false);
    expect(isFetchableMediaHref('idb-ref:123')).toBe(false);
    expect(isFetchableMediaHref('')).toBe(false);
  });
});
