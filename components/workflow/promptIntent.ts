import type { WorkflowGenerationReferenceRole, WorkflowNode } from './types';

export type PromptIntentAction = 'edit' | 'generate' | 'stop' | 'add_reference' | 'remove_reference' | 'reorder_reference';

/** PromptBar 对外只表达稳定引用身份，不携带 Provider wire 字段或凭据。 */
export interface PromptReferenceIdentity {
  id?: string;
  assetId?: string;
  label?: string;
  elementType?: string;
  sourceType?: string;
  role?: WorkflowGenerationReferenceRole;
}

export interface PromptIntent {
  targetNodeId: string;
  text: string;
  mentions: PromptReferenceIdentity[];
  requestedAction: PromptIntentAction;
}

function mentionIdentity(mention: PromptReferenceIdentity) {
  return mention.id ? `id:${mention.id}` : mention.assetId ? `asset:${mention.assetId}` : `label:${mention.label || ''}`;
}

export function createPromptIntent(input: {
  targetNodeId: string;
  text?: string;
  mentions?: readonly PromptReferenceIdentity[];
  requestedAction?: PromptIntentAction;
}): PromptIntent {
  const mentions: PromptReferenceIdentity[] = [];
  const seen = new Set<string>();
  for (const mention of input.mentions || []) {
    const identity = mentionIdentity(mention);
    if (seen.has(identity)) continue;
    seen.add(identity);
    mentions.push({ ...mention });
  }
  return {
    targetNodeId: input.targetNodeId,
    text: input.text || '',
    mentions,
    requestedAction: input.requestedAction || 'edit',
  };
}

function documentMentions(document: unknown): PromptReferenceIdentity[] {
  if (!document || typeof document !== 'object') return [];
  const result: PromptReferenceIdentity[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'mediaMention' && node.attrs && typeof node.attrs === 'object') {
      const attrs = node.attrs as Record<string, unknown>;
      if (typeof attrs.id === 'string' || typeof attrs.assetId === 'string') {
        result.push({
          id: typeof attrs.id === 'string' ? attrs.id : undefined,
          assetId: typeof attrs.assetId === 'string' ? attrs.assetId : undefined,
          label: typeof attrs.label === 'string' ? attrs.label : undefined,
          elementType: typeof attrs.elementType === 'string' ? attrs.elementType : undefined,
          sourceType: typeof attrs.sourceType === 'string' ? attrs.sourceType : undefined,
        });
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(document);
  return result;
}

/** 把现有 Draft 节点投影为运行时可消费的 PromptIntent。 */
export function promptIntentFromNode(node: WorkflowNode, requestedAction: PromptIntentAction = 'edit'): PromptIntent {
  return createPromptIntent({
    targetNodeId: node.id,
    text: node.metadata.prompt || node.metadata.content || '',
    mentions: [
      ...documentMentions(node.metadata.richTextDocument),
      ...(node.metadata.mentionedNodeIds || []).map(id => ({ id })),
    ],
    requestedAction,
  });
}
