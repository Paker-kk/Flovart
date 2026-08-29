export const NATIVE_CANVAS_NODE_TYPES = ['image', 'text', 'video', 'audio', 'config'] as const

export type NativeCanvasNodeType = (typeof NATIVE_CANVAS_NODE_TYPES)[number] | 'script' | 'operation' | 'unknown'

export interface NativeCanvasViewport {
  x: number
  y: number
  k: number
}

export interface NativeCanvasNode {
  id: string
  type: NativeCanvasNodeType
  title: string
  x: number
  y: number
  width: number
  height: number
  metadata: Record<string, unknown>
}

export interface NativeCanvasConnection {
  id: string
  fromNodeId: string
  toNodeId: string
}

export interface NativeCanvasProject {
  id: string
  title: string
  nodes: NativeCanvasNode[]
  connections: NativeCanvasConnection[]
  selectedNodeIds: string[]
  viewport: NativeCanvasViewport
  draftVersion: number
  updatedAt?: string
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

const stringValue = (value: unknown, fallback: string): string => {
  const result = typeof value === 'string' ? value.trim() : ''
  return result || fallback
}

const finite = (value: unknown, fallback: number): number => {
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : fallback
}

const positive = (value: unknown, fallback: number): number => Math.max(1, finite(value, fallback))

function nodeType(value: unknown): NativeCanvasNodeType {
  const type = stringValue(value, 'unknown')
  return NATIVE_CANVAS_NODE_TYPES.includes(type as (typeof NATIVE_CANVAS_NODE_TYPES)[number])
    ? type as NativeCanvasNodeType
    : type === 'script' || type === 'operation' ? type : 'unknown'
}

function commandResultData(value: unknown): unknown {
  const result = asRecord(value)
  return result && 'result' in result ? result.result : value
}

export function extractCommandResultData(value: unknown): unknown {
  return commandResultData(value)
}

export function extractProjectId(value: unknown): string | null {
  const result = asRecord(commandResultData(value))
  const id = result?.projectId ?? result?.id
  return typeof id === 'string' && id.trim() ? id : null
}

export function normalizeNativeCanvasProject(value: unknown): NativeCanvasProject | null {
  const source = asRecord(commandResultData(value))
  if (!source) return null
  const id = stringValue(source.projectId ?? source.id, '')
  if (!id || !Array.isArray(source.nodes)) return null

  const nodes = source.nodes.flatMap((rawNode, index) => {
    const raw = asRecord(rawNode)
    if (!raw) return []
    const position = asRecord(raw.position)
    const metadata = asRecord(raw.metadata) || {}
    return [{
      id: stringValue(raw.id, `node-${index + 1}`),
      type: nodeType(raw.type),
      title: stringValue(raw.title, '未命名节点'),
      x: finite(position?.x, 80 + index * 40),
      y: finite(position?.y, 80 + index * 40),
      width: positive(raw.width, 320),
      height: positive(raw.height, 220),
      metadata,
    }]
  })
  const nodeIds = new Set(nodes.map(node => node.id))
  const connections = Array.isArray(source.connections)
    ? source.connections.flatMap((rawConnection, index) => {
      const raw = asRecord(rawConnection)
      if (!raw) return []
      const fromNodeId = stringValue(raw.fromNodeId, '')
      const toNodeId = stringValue(raw.toNodeId, '')
      if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return []
      return [{
        id: stringValue(raw.id, `connection-${index + 1}`),
        fromNodeId,
        toNodeId,
      }]
    })
    : []
  const rawViewport = asRecord(source.viewport)
  const selectedNodeIds = Array.isArray(source.selectedNodeIds)
    ? source.selectedNodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeIds.has(nodeId))
    : []

  return {
    id,
    title: stringValue(source.title, '未命名工作流'),
    nodes,
    connections,
    selectedNodeIds,
    viewport: {
      x: finite(rawViewport?.x, 80),
      y: finite(rawViewport?.y, 80),
      k: Math.min(2, Math.max(0.25, finite(rawViewport?.k, 1))),
    },
    draftVersion: Math.max(1, Math.floor(finite(source.draftVersion, 1))),
    ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {}),
  }
}

export function nodeTypeLabel(type: NativeCanvasNodeType): string {
  return {
    image: '图片',
    text: '文本',
    video: '视频',
    audio: '音频',
    config: '生成配置',
    script: '脚本',
    operation: '操作',
    unknown: '节点',
  }[type]
}

export function nodePreviewText(node: NativeCanvasNode): string {
  const prompt = node.metadata.prompt ?? node.metadata.content
  if (typeof prompt === 'string' && prompt.trim()) return prompt.trim().slice(0, 140)
  if (node.metadata.hasMedia === true || node.metadata.href || node.metadata.poster) return '已有媒体产物，内容由 Flovart Runtime 管理'
  return '等待 AI 或你继续编辑'
}

export function edgePath(from: NativeCanvasNode, to: NativeCanvasNode): string {
  const startX = from.x + from.width
  const startY = from.y + from.height / 2
  const endX = to.x
  const endY = to.y + to.height / 2
  const bend = Math.max(48, Math.abs(endX - startX) * 0.45)
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
}

export function screenToWorld(clientX: number, clientY: number, rect: { left: number; top: number }, viewport: NativeCanvasViewport) {
  return {
    x: (clientX - rect.left - viewport.x) / viewport.k,
    y: (clientY - rect.top - viewport.y) / viewport.k,
  }
}

export function clampViewport(viewport: NativeCanvasViewport): NativeCanvasViewport {
  return {
    x: viewport.x,
    y: viewport.y,
    k: Math.min(2, Math.max(0.25, viewport.k)),
  }
}
