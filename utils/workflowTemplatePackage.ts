import { NODE_DEFS } from '../components/nodeflow/defs';
import type {
  NodeConfig,
  NodeKind,
  WorkflowEdge,
  WorkflowGroup,
  WorkflowNode,
  WorkflowViewport,
} from '../components/nodeflow/types';
import type { AICapability, AIProvider } from '../types';

export interface WorkflowTemplateMetadata {
  name: string;
  description?: string;
  tags?: string[];
  author?: string;
  thumbnail?: string;
}

export interface WorkflowTemplateKeySlot {
  id: string;
  nodeId: string;
  nodeLabel?: string;
  provider: AIProvider | 'custom';
  capability: AICapability;
  model?: string;
  label: string;
}

export interface WorkflowTemplateRequirements {
  providers: string[];
  models: string[];
  capabilities: AICapability[];
}

export interface WorkflowTemplatePackage {
  version: 1;
  metadata: WorkflowTemplateMetadata;
  workflow: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    groups: WorkflowGroup[];
    viewport?: WorkflowViewport;
  };
  requirements: WorkflowTemplateRequirements;
  keySlots: WorkflowTemplateKeySlot[];
  createdAt: number;
}

export interface CreateWorkflowTemplatePackageInput {
  metadata: WorkflowTemplateMetadata;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups?: WorkflowGroup[];
  viewport?: WorkflowViewport;
  now?: number;
}

const SENSITIVE_CONFIG_KEYS = new Set<keyof NodeConfig>([
  'apiKeyRef',
  'pinnedOutputs',
  'mediaKind',
  'mediaHref',
  'mediaMimeType',
  'mediaName',
  'mediaWidth',
  'mediaHeight',
  'mediaPosterHref',
  'mediaDurationSec',
  'mediaTrimInSec',
  'mediaTrimOutSec',
]);

const CREDENTIAL_NODE_KINDS = new Set<NodeKind>([
  'enhancer',
  'llm',
  'generator',
  'imageGen',
  'videoGen',
  'runningHub',
  'httpRequest',
  'upscale',
  'faceRestore',
  'bgRemove',
]);

const SENSITIVE_HEADER_NAMES = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'token',
  'secret',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0))).sort();
}

function uniqueCapabilities(values: AICapability[]): AICapability[] {
  return Array.from(new Set(values));
}

function isKnownNodeKind(kind: unknown): kind is NodeKind {
  return typeof kind === 'string' && kind in NODE_DEFS;
}

function normalizeProvider(provider: unknown, kind: NodeKind): AIProvider | 'custom' {
  if (typeof provider === 'string' && provider.trim()) return provider as AIProvider;
  if (kind === 'runningHub' || kind === 'upscale' || kind === 'faceRestore' || kind === 'bgRemove') return 'runningHub';
  if (kind === 'httpRequest') return 'custom';
  return 'google';
}

function inferCapability(kind: NodeKind, generationMode?: string): AICapability {
  if (kind === 'llm' || kind === 'enhancer' || kind === 'httpRequest') return 'text';
  if (kind === 'videoGen' || generationMode === 'video') return 'video';
  if (kind === 'runningHub') return 'image';
  return 'image';
}

function titleCaseProvider(provider: string): string {
  if (provider === 'runningHub') return 'RunningHub';
  if (provider === 'openai') return 'OpenAI';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function titleCaseCapability(capability: AICapability): string {
  return capability.charAt(0).toUpperCase() + capability.slice(1);
}

function makeKeySlot(node: WorkflowNode): WorkflowTemplateKeySlot | null {
  if (!CREDENTIAL_NODE_KINDS.has(node.kind)) return null;
  const provider = normalizeProvider(node.config?.provider, node.kind);
  const capability = inferCapability(node.kind, node.config?.generationMode);
  return {
    id: `key_${node.id}_${provider}`,
    nodeId: node.id,
    nodeLabel: node.config?.label,
    provider,
    capability,
    model: node.config?.model,
    label: `${titleCaseCapability(capability)}: ${titleCaseProvider(provider)}`,
  };
}

function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return SENSITIVE_HEADER_NAMES.some((token) => normalized === token || normalized.includes(token));
}

function sanitizeHttpHeaders(headers: string | undefined): string | undefined {
  if (!headers?.trim()) return undefined;
  try {
    const parsed = JSON.parse(headers) as unknown;
    if (!isRecord(parsed)) return undefined;
    const safeEntries = Object.entries(parsed).filter(([name]) => !isSensitiveHeaderName(name));
    if (safeEntries.length === 0) return undefined;
    return JSON.stringify(Object.fromEntries(safeEntries), null, 2);
  } catch {
    return undefined;
  }
}

export function sanitizeWorkflowNodeForTemplate(node: WorkflowNode): WorkflowNode {
  const config = node.config;
  if (!config) return { ...node };

  const nextConfig: NodeConfig = {};
  for (const [key, value] of Object.entries(config) as Array<[keyof NodeConfig, NodeConfig[keyof NodeConfig]]>) {
    if (SENSITIVE_CONFIG_KEYS.has(key)) continue;
    if (key === 'httpHeaders') {
      const safeHeaders = sanitizeHttpHeaders(typeof value === 'string' ? value : undefined);
      if (safeHeaders) nextConfig.httpHeaders = safeHeaders;
      continue;
    }
    (nextConfig as Record<string, unknown>)[key] = value;
  }

  return {
    ...node,
    config: Object.keys(nextConfig).length > 0 ? nextConfig : undefined,
  };
}

function sanitizeWorkflowEdges(edges: WorkflowEdge[], nodeIds: Set<string>): WorkflowEdge[] {
  return edges
    .filter((edge) => (
      !!edge
      && typeof edge.id === 'string'
      && nodeIds.has(edge.fromNode)
      && nodeIds.has(edge.toNode)
      && typeof edge.fromPort === 'string'
      && typeof edge.toPort === 'string'
    ))
    .map((edge) => ({ ...edge }));
}

function sanitizeWorkflowGroups(groups: WorkflowGroup[], nodeIds: Set<string>): WorkflowGroup[] {
  return groups
    .filter((group) => !!group && typeof group.id === 'string' && Array.isArray(group.nodeIds))
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((nodeId) => nodeIds.has(nodeId)),
    }))
    .filter((group) => group.nodeIds.length > 0);
}

function buildRequirements(nodes: WorkflowNode[], keySlots: WorkflowTemplateKeySlot[]): WorkflowTemplateRequirements {
  return {
    providers: uniqueSorted(keySlots.map((slot) => slot.provider)),
    models: uniqueSorted(nodes.map((node) => node.config?.model)),
    capabilities: uniqueCapabilities(keySlots.map((slot) => slot.capability)),
  };
}

export function createWorkflowTemplatePackage(input: CreateWorkflowTemplatePackageInput): WorkflowTemplatePackage {
  const nodes = input.nodes
    .filter((node): node is WorkflowNode => (
      !!node
      && typeof node.id === 'string'
      && isKnownNodeKind(node.kind)
      && typeof node.x === 'number'
      && typeof node.y === 'number'
    ))
    .map(sanitizeWorkflowNodeForTemplate);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = sanitizeWorkflowEdges(input.edges, nodeIds);
  const groups = sanitizeWorkflowGroups(input.groups ?? [], nodeIds);
  const keySlots = nodes.map(makeKeySlot).filter((slot): slot is WorkflowTemplateKeySlot => !!slot);

  return {
    version: 1,
    metadata: {
      name: input.metadata.name.trim() || 'Untitled Workflow Template',
      description: input.metadata.description,
      tags: input.metadata.tags?.filter((tag) => tag.trim().length > 0),
      author: input.metadata.author,
      thumbnail: input.metadata.thumbnail,
    },
    workflow: {
      nodes,
      edges,
      groups,
      viewport: input.viewport ? { ...input.viewport } : undefined,
    },
    requirements: buildRequirements(nodes, keySlots),
    keySlots,
    createdAt: input.now ?? Date.now(),
  };
}

export function serializeWorkflowTemplatePackage(pack: WorkflowTemplatePackage): string {
  return JSON.stringify(pack, null, 2);
}

export function applyWorkflowTemplateKeyBindings(
  pack: WorkflowTemplatePackage,
  bindings: Record<string, string | undefined>,
): WorkflowTemplatePackage['workflow'] {
  const nodeBindings = new Map<string, string>();
  for (const slot of pack.keySlots) {
    const apiKeyRef = bindings[slot.id];
    if (apiKeyRef?.trim()) {
      nodeBindings.set(slot.nodeId, apiKeyRef);
    }
  }

  return {
    nodes: pack.workflow.nodes.map((node) => {
      const apiKeyRef = nodeBindings.get(node.id);
      if (!apiKeyRef) {
        return {
          ...node,
          config: node.config ? { ...node.config } : undefined,
        };
      }
      return {
        ...node,
        config: {
          ...node.config,
          apiKeyRef,
        },
      };
    }),
    edges: pack.workflow.edges.map((edge) => ({ ...edge })),
    groups: pack.workflow.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })),
    viewport: pack.workflow.viewport ? { ...pack.workflow.viewport } : undefined,
  };
}

function isValidViewport(value: unknown): value is WorkflowViewport {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number'
    && typeof value.scale === 'number';
}

function parseNodes(value: unknown): WorkflowNode[] | null {
  if (!Array.isArray(value)) return null;
  const nodes = value.filter((node): node is WorkflowNode => (
    isRecord(node)
    && typeof node.id === 'string'
    && isKnownNodeKind(node.kind)
    && typeof node.x === 'number'
    && typeof node.y === 'number'
  ));
  if (nodes.length === 0) return null;
  return nodes.map(sanitizeWorkflowNodeForTemplate);
}

function parseKeySlots(value: unknown, nodes: WorkflowNode[]): WorkflowTemplateKeySlot[] {
  if (!Array.isArray(value)) return nodes.map(makeKeySlot).filter((slot): slot is WorkflowTemplateKeySlot => !!slot);
  return value
    .filter((slot): slot is WorkflowTemplateKeySlot => (
      isRecord(slot)
      && typeof slot.id === 'string'
      && typeof slot.nodeId === 'string'
      && typeof slot.provider === 'string'
      && typeof slot.capability === 'string'
      && typeof slot.label === 'string'
    ))
    .map((slot) => ({ ...slot }));
}

export function parseWorkflowTemplatePackageJson(input: string): WorkflowTemplatePackage | null {
  try {
    const raw = JSON.parse(input) as unknown;
    if (!isRecord(raw) || raw.version !== 1) return null;
    if (!isRecord(raw.metadata) || typeof raw.metadata.name !== 'string' || !raw.metadata.name.trim()) return null;
    if (!isRecord(raw.workflow)) return null;

    const nodes = parseNodes(raw.workflow.nodes);
    if (!nodes) return null;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = sanitizeWorkflowEdges(Array.isArray(raw.workflow.edges) ? raw.workflow.edges as WorkflowEdge[] : [], nodeIds);
    const groups = sanitizeWorkflowGroups(Array.isArray(raw.workflow.groups) ? raw.workflow.groups as WorkflowGroup[] : [], nodeIds);
    const keySlots = parseKeySlots(raw.keySlots, nodes);

    return {
      version: 1,
      metadata: {
        name: raw.metadata.name,
        description: typeof raw.metadata.description === 'string' ? raw.metadata.description : undefined,
        tags: Array.isArray(raw.metadata.tags)
          ? raw.metadata.tags.filter((tag): tag is string => typeof tag === 'string')
          : undefined,
        author: typeof raw.metadata.author === 'string' ? raw.metadata.author : undefined,
        thumbnail: typeof raw.metadata.thumbnail === 'string' ? raw.metadata.thumbnail : undefined,
      },
      workflow: {
        nodes,
        edges,
        groups,
        viewport: isValidViewport(raw.workflow.viewport) ? { ...raw.workflow.viewport } : undefined,
      },
      requirements: buildRequirements(nodes, keySlots),
      keySlots,
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}
