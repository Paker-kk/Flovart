/**
 * ============================================
 * @Mention → SpatialEdge 实时转换桥
 * ============================================
 *
 * 监听 Tiptap editor JSON 变更，提取 @mention 的节点 ID，
 * 自动创建/清理 SpatialEdge，实现提示词中 @ 引用 → DAG 依赖连线的实时同步。
 */

import type { SpatialEdge } from '../types';

export interface MentionExtractResult {
  id: string;
  label: string;
  thumbnail: string;
  elementType: string;
}

/**
 * 从 Tiptap editor JSON 中提取所有被 @ 的节点 ID
 */
export function extractMentionedNodeIds(editorJSON: Record<string, unknown> | null | undefined): string[] {
  if (!editorJSON) return [];
  const ids = new Set<string>();

  function walk(node: Record<string, unknown>) {
    if (node.type === 'canvasMention' && node.attrs) {
      const attrs = node.attrs as MentionExtractResult;
      if (attrs.id) ids.add(attrs.id);
    }
    if (Array.isArray(node.content)) {
      (node.content as Record<string, unknown>[]).forEach(walk);
    }
  }

  walk(editorJSON);
  return Array.from(ids);
}

/**
 * 核心逻辑：将 @mention 实时转换为画板连线
 *
 * @param targetNodeId - 正在输入 prompt 的节点 ID（被 @ 指向的目标）
 * @param tiptapJSON    - Tiptap editor 的 JSON 输出
 * @param currentEdges  - 当前画板的所有边
 * @returns 更新后的边数组（移除过时的 + 添加新的）
 */
export function syncMentionsToEdges(
  targetNodeId: string,
  tiptapJSON: Record<string, unknown> | null | undefined,
  currentEdges: SpatialEdge[],
): SpatialEdge[] {
  const mentionedIds = extractMentionedNodeIds(tiptapJSON);
  const mentionedSet = new Set(mentionedIds);

  // 移除：指向本节点但源节点已不在 @ 列表中的旧边
  const retainedEdges = currentEdges.filter(
    edge =>
      edge.targetNodeId !== targetNodeId || mentionedSet.has(edge.sourceNodeId),
  );

  // 添加：新出现的 @ 引用
  const existingSourceIds = new Set(
    retainedEdges
      .filter(e => e.targetNodeId === targetNodeId)
      .map(e => e.sourceNodeId),
  );

  const newEdges: SpatialEdge[] = [];
  for (const sourceId of mentionedIds) {
    if (!existingSourceIds.has(sourceId)) {
      newEdges.push({
        id: `edge_${sourceId}_to_${targetNodeId}`,
        sourceNodeId: sourceId,
        targetNodeId: targetNodeId,
        relation: 'mentions',
      });
    }
  }

  return [...retainedEdges, ...newEdges];
}

/**
 * 从 text prompt 字符串中解析 @名称 引用（fallback：无需 Tiptap JSON）
 * 适用于纯文本 prompt + node name 的场景
 */
export function extractMentionsFromText(
  text: string,
  knownNodeNames: Map<string, string>, // nodeId → nodeName
): string[] {
  const result: string[] = [];
  for (const [nodeId, nodeName] of knownNodeNames) {
    if (!nodeName) continue;
    const escaped = nodeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`@${escaped}\\b`, 'i').test(text)) {
      result.push(nodeId);
    }
  }
  return result;
}
