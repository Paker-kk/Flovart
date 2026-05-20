/**
 * Parse @mentions from a prompt string and sync them into SpatialEdges.
 * 
 * When a user types "@node_img_001 加上赛博朋克风格" in a prompt,
 * this resolver extracts the mention IDs and creates/removes edges 
 * in the board store to reflect the dependency graph.
 */
import { useBoardStore } from '../stores/useBoardStore';

const MENTION_RE = /@(node_[a-z0-9_]+)/gi;

export function parseMentions(text: string): string[] {
  const ids: string[] = [];
  let match;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
  }
  MENTION_RE.lastIndex = 0;
  return ids;
}

export function stripMentions(text: string): string {
  return text.replace(MENTION_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Sync edges to exactly match the current mentions of the given node.
 * Creates new edges where missing, removes stale ones.
 */
export function syncEdgesFromMentions(nodeId: string, mentions: string[]) {
  const store = useBoardStore.getState();
  const existingEdges = store.edges.filter(e => e.sourceNodeId === nodeId && e.relation === 'mentions');

  // Remove stale edges (nodes no longer mentioned)
  for (const edge of existingEdges) {
    if (!mentions.includes(edge.targetNodeId)) {
      store.removeEdge(edge.id);
    }
  }

  // Create new edges for new mentions
  for (const mentionId of mentions) {
    const exists = existingEdges.some(e => e.targetNodeId === mentionId);
    if (!exists) {
      store.addEdge({
        sourceNodeId: nodeId,
        targetNodeId: mentionId,
        relation: 'mentions',
        animated: true,
      });
    }
  }
}

/**
 * One-shot: parse mentions from a prompt and sync edges for the node.
 */
export function resolveAndSyncEdges(nodeId: string, textPrompt: string) {
  const mentions = parseMentions(textPrompt);
  syncEdgesFromMentions(nodeId, mentions);
  return mentions;
}
