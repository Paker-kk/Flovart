import {
  fromIdbRef,
  getImages,
  isDataUrl,
  isIdbRef,
  putImages,
  toIdbRef,
} from '../../utils/imageDB';
import {
  fromIdbVideoRef,
  getVideoBlob,
  isIdbVideoRef,
  putVideoBlob,
  toIdbVideoRef,
} from '../../utils/mediaDB';
import type { NodeIOMap, WorkflowNode, WorkflowValue } from './types';

const WORKFLOW_PINNED_KEY_PREFIX = 'workflow-pinned';

function buildPinnedKey(nodeId: string, portKey: string, suffix: string): string {
  return `${WORKFLOW_PINNED_KEY_PREFIX}:${nodeId}:${portKey}:${suffix}`;
}

async function serializePinnedValue(
  value: WorkflowValue | null,
  nodeId: string,
  portKey: string,
  imageEntries: { key: string; data: string }[],
): Promise<WorkflowValue | null> {
  if (!value) return value;

  if (value.kind === 'image') {
    if (!isDataUrl(value.href)) return value;
    const key = buildPinnedKey(nodeId, portKey, 'image');
    imageEntries.push({ key, data: value.href });
    return { ...value, href: toIdbRef(key) };
  }

  if (value.kind === 'video') {
    let nextHref = value.href;
    let nextPosterHref = value.posterHref;

    if (value.href.startsWith('blob:')) {
      try {
        const blob = await fetch(value.href).then((response) => response.blob());
        const key = buildPinnedKey(nodeId, portKey, 'video');
        await putVideoBlob(key, blob);
        nextHref = toIdbVideoRef(key);
      } catch {
        nextHref = value.href;
      }
    }

    if (nextPosterHref && isDataUrl(nextPosterHref)) {
      const posterKey = buildPinnedKey(nodeId, portKey, 'poster');
      imageEntries.push({ key: posterKey, data: nextPosterHref });
      nextPosterHref = toIdbRef(posterKey);
    }

    return { ...value, href: nextHref, posterHref: nextPosterHref };
  }

  return value;
}

async function serializePinnedOutputs(
  pinnedOutputs: NodeIOMap,
  nodeId: string,
): Promise<NodeIOMap> {
  const imageEntries: { key: string; data: string }[] = [];
  const nextOutputs: NodeIOMap = {};

  for (const [portKey, value] of Object.entries(pinnedOutputs)) {
    nextOutputs[portKey] = await serializePinnedValue(value, nodeId, portKey, imageEntries);
  }

  if (imageEntries.length > 0) {
    await putImages(imageEntries);
  }

  return nextOutputs;
}

export async function serializeWorkflowNodesForStorage(nodes: WorkflowNode[]): Promise<WorkflowNode[]> {
  return Promise.all(
    nodes.map(async (node) => {
      const pinnedOutputs = node.config?.pinnedOutputs;
      if (!pinnedOutputs || Object.keys(pinnedOutputs).length === 0) {
        return {
          ...node,
          config: node.config ? { ...node.config } : node.config,
        };
      }

      return {
        ...node,
        config: {
          ...node.config,
          pinnedOutputs: await serializePinnedOutputs(pinnedOutputs, node.id),
        },
      };
    }),
  );
}

async function hydratePinnedValue(
  value: WorkflowValue | null,
  resolvedImages: Map<string, string>,
): Promise<WorkflowValue | null> {
  if (!value) return value;

  if (value.kind === 'image' && isIdbRef(value.href)) {
    const hydratedHref = resolvedImages.get(fromIdbRef(value.href));
    return hydratedHref ? { ...value, href: hydratedHref } : value;
  }

  if (value.kind === 'video') {
    let nextHref = value.href;
    let nextPosterHref = value.posterHref;

    if (isIdbVideoRef(value.href)) {
      const blob = await getVideoBlob(fromIdbVideoRef(value.href));
      if (blob) {
        nextHref = URL.createObjectURL(blob);
      }
    }

    if (nextPosterHref && isIdbRef(nextPosterHref)) {
      const hydratedPoster = resolvedImages.get(fromIdbRef(nextPosterHref));
      if (hydratedPoster) {
        nextPosterHref = hydratedPoster;
      }
    }

    return { ...value, href: nextHref, posterHref: nextPosterHref };
  }

  return value;
}

export async function hydrateWorkflowNodesFromStorage(nodes: WorkflowNode[]): Promise<WorkflowNode[]> {
  const imageKeys = new Set<string>();

  for (const node of nodes) {
    const pinnedOutputs = node.config?.pinnedOutputs;
    if (!pinnedOutputs) continue;
    for (const value of Object.values(pinnedOutputs)) {
      if (!value) continue;
      if (value.kind === 'image' && isIdbRef(value.href)) {
        imageKeys.add(fromIdbRef(value.href));
      }
      if (value.kind === 'video' && value.posterHref && isIdbRef(value.posterHref)) {
        imageKeys.add(fromIdbRef(value.posterHref));
      }
    }
  }

  const resolvedImages = await getImages([...imageKeys]);

  return Promise.all(
    nodes.map(async (node) => {
      const pinnedOutputs = node.config?.pinnedOutputs;
      if (!pinnedOutputs || Object.keys(pinnedOutputs).length === 0) {
        return {
          ...node,
          config: node.config ? { ...node.config } : node.config,
        };
      }

      const nextOutputs: NodeIOMap = {};
      for (const [portKey, value] of Object.entries(pinnedOutputs)) {
        nextOutputs[portKey] = await hydratePinnedValue(value, resolvedImages);
      }

      return {
        ...node,
        config: {
          ...node.config,
          pinnedOutputs: nextOutputs,
        },
      };
    }),
  );
}

export function collectPinnedOutputObjectUrls(nodes: WorkflowNode[]): Set<string> {
  const urls = new Set<string>();

  for (const node of nodes) {
    const pinnedOutputs = node.config?.pinnedOutputs;
    if (!pinnedOutputs) continue;
    for (const value of Object.values(pinnedOutputs)) {
      if (value?.kind === 'video' && value.href.startsWith('blob:')) {
        urls.add(value.href);
      }
    }
  }

  return urls;
}
