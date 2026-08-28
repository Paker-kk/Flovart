import type { MentionItem } from '../MentionList';
import type { SeedanceReferences, WorkflowConnection, WorkflowNode } from './types';

/** 上游媒体节点类型 */
const MEDIA_TYPES = new Set(['image', 'video', 'audio']);

export interface ImageReferenceChip {
  id: string;
  label: string;
  thumbnail: string;
  storageKey?: string;
  elementType: 'image' | 'video' | 'audio';
  mentioned: boolean;
}

/**
 * 参考图 chip 面板顺序 = 连接数组顺序（连接是引用唯一事实来源）：
 * 上游 image/video/audio 连线节点按 connections 数组顺序返回，断开的 id 自然剔除。
 */
export function getOrderedImageReferences(
  targetNode: WorkflowNode,
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): WorkflowNode[] {
  return getWorkflowInputNodes(targetNode, nodes, connections).filter(node => MEDIA_TYPES.has(node.type));
}

export function toImageReferenceChips(
  orderedNodes: WorkflowNode[],
  mentionedIds: string[] = [],
): ImageReferenceChip[] {
  const mentioned = new Set(mentionedIds);
  const counters = { image: 0, video: 0, audio: 0 };
  return orderedNodes.map(node => {
    const type = (MEDIA_TYPES.has(node.type) ? node.type : 'image') as 'image' | 'video' | 'audio';
    let label = node.title;
    if (type === 'image') { counters.image += 1; label = `图片${counters.image}`; }
    else if (type === 'video') { counters.video += 1; label = `视频${counters.video}`; }
    else { counters.audio += 1; label = `音频${counters.audio}`; }
    return {
      id: node.id,
      label,
      thumbnail: node.metadata.href || '',
      storageKey: node.metadata.storageKey,
      elementType: type,
      mentioned: mentioned.has(node.id),
    };
  });
}

export function inferWorkflowMentionIds(plainText: string, items: MentionItem[]): string[] {
  const hits = items.flatMap(item => {
    const candidates = [item.label.trim(), ...(item.aliases || [])].filter(Boolean);
    const found: Array<{ id: string; index: number }> = [];
    for (const candidate of candidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp('@' + escaped + '(?![\\p{L}\\p{N}_])', 'u').exec(plainText);
      if (match) found.push({ id: item.id, index: match.index });
    }
    return found;
  });
  return hits.sort((left, right) => left.index - right.index).map(hit => hit.id);
}

/** 富文本 mention id 与纯文本 @名称合并，按文本顺序优先并去重。 */
export function resolveWorkflowMentionIds(plainText: string, explicitIds: string[], items: MentionItem[]): string[] {
  return [...new Set([...inferWorkflowMentionIds(plainText, items), ...explicitIds])];
}

export const EMPTY_SEEDANCE_REFERENCES: SeedanceReferences = {
  imageRefs: [],
  videoRefs: [],
  audioRefs: [],
};

export function getWorkflowInputNodeIds(targetNodeId: string, connections: WorkflowConnection[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const connection of connections) {
    if (connection.toNodeId !== targetNodeId || seen.has(connection.fromNodeId)) continue;
    seen.add(connection.fromNodeId);
    ids.push(connection.fromNodeId);
  }
  return ids;
}

export function getWorkflowInputNodes(
  targetNode: WorkflowNode,
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): WorkflowNode[] {
  // 不按 isVisible 过滤：原位替换产生的隐藏输入节点是语义上真实的参考来源，
  // 画布渲染层自行按可见性过滤，这里必须与运行时引用解析保持同一份输入集合，
  // 否则 chip 编号、@ 候选和提交时的引用会指向不同节点。
  const allowedIds = new Set(getWorkflowInputNodeIds(targetNode.id, connections));
  return nodes.filter(node => allowedIds.has(node.id) && node.id !== targetNode.id);
}

export function filterWorkflowInputIds(ids: string[], targetNodeId: string, connections: WorkflowConnection[]): string[] {
  const allowedIds = new Set(getWorkflowInputNodeIds(targetNodeId, connections));
  const seen = new Set<string>();
  return ids.filter(id => {
    if (!allowedIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function toWorkflowMentionItems(nodes: WorkflowNode[]): MentionItem[] {
  const counters = { image: 0, video: 0, audio: 0, text: 0 };
  return nodes.map(item => {
    const type = item.type as 'image' | 'video' | 'audio' | 'text';
    let label = item.title;
    if (type === 'image') { counters.image += 1; label = `图片${counters.image}`; }
    else if (type === 'video') { counters.video += 1; label = `视频${counters.video}`; }
    else if (type === 'audio') { counters.audio += 1; label = `音频${counters.audio}`; }
    else if (type === 'text') { counters.text += 1; label = `文本${counters.text}`; }
    const aliases = item.title && item.title !== label ? [item.title] : undefined;
    return {
      id: item.id,
      label,
      aliases,
      thumbnail: item.metadata.href || '',
      elementType: item.type,
      description: item.metadata.content?.trim().slice(0, 36) || item.type,
    };
  });
}

export function filterSeedanceReferences(
  refs: SeedanceReferences | undefined,
  targetNodeId: string,
  connections: WorkflowConnection[],
): SeedanceReferences {
  const value = refs || EMPTY_SEEDANCE_REFERENCES;
  return {
    imageRefs: filterWorkflowInputIds(value.imageRefs, targetNodeId, connections),
    videoRefs: filterWorkflowInputIds(value.videoRefs, targetNodeId, connections),
    audioRefs: filterWorkflowInputIds(value.audioRefs, targetNodeId, connections),
  };
}
