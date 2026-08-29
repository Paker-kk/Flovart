/**
 * Native session-scoped Workflow view for DeepSeek Harness.
 *
 * This component owns presentation and gesture state only. Project data and
 * mutations cross the authenticated Workspace Operator command seam, so the DSH
 * bundle never imports Flovart's WebUI root, browser storage, or provider
 * credentials. The WebUI window remains a deliberate recovery/degraded path.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent, type ReactElement, type WheelEvent } from 'react'
import type { ClientContext, ISessions, SessionFace } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { bridgeBus } from './bus.ts'
import { NativeCanvasClient, NativeCanvasRequestError } from './nativeCanvas/client.ts'
import {
  NATIVE_CANVAS_NODE_TYPES,
  clampViewport,
  edgePath,
  nodePreviewText,
  nodeTypeLabel,
  screenToWorld,
  type NativeCanvasNode,
  type NativeCanvasProject,
  type NativeCanvasViewport,
} from './nativeCanvas/model.ts'

const WORLD_WIDTH = 6400
const WORLD_HEIGHT = 4000
const RECONNECT_DELAYS = [350, 800, 1600]
const HEALTH_CHECK_MS = 2000
const NODE_TYPE_LABELS = NATIVE_CANVAS_NODE_TYPES.map(type => ({ type, label: nodeTypeLabel(type) }))

type CanvasStatus = 'idle' | 'connecting' | 'ready' | 'error'
type WorkflowViewProps = Pick<ConvViewProps, 'sessionId'> & { session?: SessionFace }
type ProjectOption = { id: string; title: string; updatedAt?: string }
type BindingConflict = {
  projectId: string
  activeBindingId?: string
  activeSessionId?: string
  activeProjectId?: string
}
type PanState = { pointerId: number; startX: number; startY: number; originX: number; originY: number }
type NodeDragState = { pointerId: number; nodeId: string; offsetX: number; offsetY: number }

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 28,
  padding: '4px 9px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontSize: 12,
  cursor: 'pointer',
} as const

const mutedTextStyle = { color: 'var(--dsw-alias-label-secondary, currentColor)' } as const

function statusLabel(status: CanvasStatus) {
  return status === 'ready' ? '工作页已就绪' : status === 'connecting' ? '正在准备工作页' : status === 'error' ? '准备失败' : '等待准备'
}

function statusColor(status: CanvasStatus) {
  return status === 'ready' ? 'var(--dsh-success, currentColor)' : status === 'error' ? 'var(--dsh-danger, currentColor)' : 'var(--dsh-warning, currentColor)'
}

function projectBadges(project: NativeCanvasProject) {
  return {
    waiting: project.nodes.filter(node => node.metadata.status === 'loading').length,
    error: project.nodes.filter(node => node.metadata.status === 'error').length,
    artifacts: project.nodes.filter(node => node.metadata.hasMedia === true).length,
  }
}

function isRetryableWorkspaceError(error: unknown) {
  return error instanceof TypeError
    || (error instanceof NativeCanvasRequestError && (error.status === 0 || error.status >= 500))
}

function selectionContext(project: NativeCanvasProject | null): string {
  if (!project) return 'projectId: unknown\nworkflowId: unknown\nselectedNodeIds: []\nselectedAssetIds: []'
  return JSON.stringify({
    projectId: project.id,
    workflowId: project.id,
    revision: project.draftVersion,
    selectedNodeIds: project.selectedNodeIds,
    selectedAssetIds: [],
    ...(project.selectedNodeIds[0] ? { focusedNodeId: project.selectedNodeIds[0] } : {}),
  }, null, 2)
}

export function createWorkflowView(ctx: ClientContext) {
  // RC8's published client bundles can merge a legacy SessionStore onto the
  // Cordis Context before the runtime contract is loaded. The runtime itself
  // exposes this exact ISessions face, so keep the seam explicit here rather
  // than reaching into a host HTTP endpoint or duplicating Agent state.
  const sessions = ctx.sessions as unknown as Pick<ISessions, 'scope' | 'sessionOf'>
  return function BoundWorkflowView(props: WorkflowViewProps): ReactElement {
    const scope = sessions.scope(props.sessionId)
    const session = scope ? sessions.sessionOf(scope) : undefined
    return <WorkflowView {...props} {...(session ? { session } : {})} />
  }
}

export function WorkflowView({ sessionId, session }: WorkflowViewProps): ReactElement {
  const [status, setStatus] = useState<CanvasStatus>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [bindingText, setBindingText] = useState<string | null>(null)
  const [bindingConflict, setBindingConflict] = useState<BindingConflict | null>(null)
  const [brief, setBrief] = useState('')
  const [project, setProject] = useState<NativeCanvasProject | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [blankProjectId, setBlankProjectId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [promptState, setPromptState] = useState<'idle' | 'sending' | 'sent' | 'unavailable'>('idle')
  const [pan, setPan] = useState<PanState | null>(null)
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null)
  const runtimeRef = useRef<NativeCanvasClient | null>(null)
  const projectRef = useRef<NativeCanvasProject | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const viewportTimerRef = useRef<number | undefined>(undefined)
  const reconnectTimerRef = useRef<number | undefined>(undefined)
  const healthTimerRef = useRef<number | undefined>(undefined)
  const reconnectAttemptsRef = useRef(0)
  const connectInFlightRef = useRef(false)
  const connectRef = useRef<(() => Promise<void>) | null>(null)
  const autoConnectRef = useRef(false)

  const agentReady = Boolean(session)

  const setCurrentProject = useCallback((next: NativeCanvasProject | null) => {
    projectRef.current = next
    setProject(next)
    if (next) {
      setProjectId(next.id)
      bridgeBus.publish({ kind: 'badges', badges: projectBadges(next) })
    }
  }, [])

  const refresh = useCallback(async (runtime: NativeCanvasClient | null = runtimeRef.current, targetId = projectRef.current?.id || projectId) => {
    if (!runtime || !targetId) return null
    const next = await runtime.inspect(targetId)
    setCurrentProject(next)
    return next
  }, [projectId, setCurrentProject])

  const bindProject = useCallback(async (runtime: NativeCanvasClient, targetId: string) => {
    if (!sessionId) return
    try {
      await runtime.bindDirector(sessionId, targetId)
      setBindingConflict(null)
      setBindingText('已绑定当前 Harness 会话')
    } catch (error) {
      if (error instanceof NativeCanvasRequestError && error.code === 'BINDING_CONFLICT') {
        setBindingConflict({
          projectId: targetId,
          ...(typeof error.details?.activeBindingId === 'string' ? { activeBindingId: error.details.activeBindingId } : {}),
          ...(typeof error.details?.activeSessionId === 'string' ? { activeSessionId: error.details.activeSessionId } : {}),
          ...(typeof error.details?.activeProjectId === 'string' ? { activeProjectId: error.details.activeProjectId } : {}),
        })
        setBindingText('需要确认 Director Handoff')
        return
      }
      setBindingText('工作页已连接；Harness 会话绑定暂不可用')
    }
  }, [sessionId])

  const handoffProject = useCallback(async () => {
    const runtime = runtimeRef.current
    const conflict = bindingConflict
    if (!runtime || !sessionId || !conflict) return
    setBusy('director.handoff')
    setErrorText(null)
    try {
      await runtime.handoffDirector(sessionId, conflict.projectId, conflict.activeBindingId)
      setBindingConflict(null)
      setBindingText('已绑定当前 Harness 会话')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }, [bindingConflict, sessionId])

  const connect = useCallback(async () => {
    if (connectInFlightRef.current) return
    connectInFlightRef.current = true
    if (reconnectTimerRef.current !== undefined) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = undefined
    }
    setStatus('connecting')
    setErrorText(null)
    setBindingText(null)
    setBindingConflict(null)
    const runtime = new NativeCanvasClient({ url: new URL('/flovart-workspace', globalThis.location.origin).toString() })
    runtimeRef.current = runtime
    try {
      await runtime.registerNativeWorkspace()
      const health = await runtime.health()
      if (!health.nativeWorkspace && health.clients < 1) throw new Error('Runtime 没有启用原生 Workflow 工作区。')
      const options = await runtime.listProjects()
      setProjects(options)
      const directorStatus = sessionId
        ? await runtime.directorStatus({ sessionId }).catch(() => null)
        : null
      const boundProjectId = directorStatus?.binding?.projectId || directorStatus?.projectId || ''
      const hasProject = (candidate: string | null | undefined): candidate is string => Boolean(candidate && options.some(option => option.id === candidate))
      const targetId = hasProject(boundProjectId)
        ? boundProjectId
        : hasProject(projectId)
          ? projectId
          : hasProject(health.activeProjectId)
            ? health.activeProjectId
            : options[0]?.id
      setStatus('ready')
      reconnectAttemptsRef.current = 0
      bridgeBus.publish({ kind: 'connected' })
      if (!targetId) {
        setCurrentProject(null)
        return
      }
      const next = await runtime.inspect(targetId)
      setCurrentProject(next)
      if (targetId === boundProjectId) {
        setBindingConflict(null)
        setBindingText('已绑定当前 Harness 会话')
      } else {
        void bindProject(runtime, next.id)
      }
    } catch (error) {
      runtimeRef.current = null
      if (isRetryableWorkspaceError(error) && reconnectAttemptsRef.current < RECONNECT_DELAYS.length) {
        const attempt = reconnectAttemptsRef.current + 1
        reconnectAttemptsRef.current = attempt
        setStatus('connecting')
        setErrorText(`Workspace Operator 暂时不可用，正在自动恢复（${attempt}/${RECONNECT_DELAYS.length}）`)
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = undefined
          void connectRef.current?.()
        }, RECONNECT_DELAYS[attempt - 1])
        return
      }
      setStatus('error')
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      connectInFlightRef.current = false
    }
  }, [bindProject, projectId, sessionId, setCurrentProject])

  connectRef.current = connect

  useEffect(() => {
    if (autoConnectRef.current) return
    autoConnectRef.current = true
    void connect()
  }, [connect])

  useEffect(() => {
    if (status !== 'ready') return
    healthTimerRef.current = window.setInterval(() => {
      const runtime = runtimeRef.current
      if (!runtime || connectInFlightRef.current) return
      void runtime.health().then(health => {
        if (!health.nativeWorkspace) void connectRef.current?.()
      }).catch(() => {
        void connectRef.current?.()
      })
    }, HEALTH_CHECK_MS)
    return () => {
      if (healthTimerRef.current !== undefined) {
        window.clearInterval(healthTimerRef.current)
        healthTimerRef.current = undefined
      }
    }
  }, [status])

  useEffect(() => () => {
    if (viewportTimerRef.current !== undefined) window.clearTimeout(viewportTimerRef.current)
    if (reconnectTimerRef.current !== undefined) window.clearTimeout(reconnectTimerRef.current)
    if (healthTimerRef.current !== undefined) window.clearInterval(healthTimerRef.current)
  }, [])

  const execute = useCallback(async (command: string, args: Record<string, unknown> = {}) => {
    const runtime = runtimeRef.current
    if (!runtime) throw new Error('原生工作页尚未准备完成。')
    setBusy(command)
    try {
      return await runtime.command(command, args)
    } finally {
      setBusy(null)
    }
  }, [])

  const refreshProjectList = useCallback(async (runtime = runtimeRef.current) => {
    if (!runtime) return
    setProjects(await runtime.listProjects())
  }, [])

  const saveViewport = useCallback((viewport: NativeCanvasViewport) => {
    const runtime = runtimeRef.current
    const targetId = projectRef.current?.id
    if (!runtime || !targetId) return
    if (viewportTimerRef.current !== undefined) window.clearTimeout(viewportTimerRef.current)
    viewportTimerRef.current = window.setTimeout(() => {
      void runtime.command('workflow.viewport.set', { projectId: targetId, ...viewport }).catch(error => {
        setErrorText(error instanceof Error ? error.message : String(error))
      })
    }, 280)
  }, [])

  const updateViewport = useCallback((nextViewport: NativeCanvasViewport) => {
    const next = clampViewport(nextViewport)
    setProject(previous => {
      if (!previous) return previous
      const updated = { ...previous, viewport: next }
      projectRef.current = updated
      return updated
    })
    saveViewport(next)
  }, [saveViewport])

  const selectNode = useCallback((nodeId: string, additive: boolean) => {
    const current = projectRef.current
    const runtime = runtimeRef.current
    if (!current) return
    const nextIds = additive
      ? current.selectedNodeIds.includes(nodeId)
        ? current.selectedNodeIds.filter(id => id !== nodeId)
        : [...current.selectedNodeIds, nodeId]
      : [nodeId]
    const next = { ...current, selectedNodeIds: nextIds }
    projectRef.current = next
    setProject(next)
    if (runtime) {
      void runtime.command('workflow.select', { projectId: current.id, ids: nextIds }).catch(error => {
        setErrorText(error instanceof Error ? error.message : String(error))
      })
    }
  }, [])

  const createNode = useCallback(async (type: (typeof NATIVE_CANVAS_NODE_TYPES)[number]) => {
    const current = projectRef.current
    if (!current) return
    const centerX = (440 - current.viewport.x) / current.viewport.k - 160
    const centerY = (300 - current.viewport.y) / current.viewport.k - 100
    try {
      await execute('workflow.node.create', {
        projectId: current.id,
        type,
        title: `${nodeTypeLabel(type)}节点`,
        x: Math.max(24, centerX),
        y: Math.max(24, centerY),
      })
      await refresh(undefined, current.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }, [execute, refresh])

  const connectSelected = useCallback(async () => {
    const current = projectRef.current
    if (!current || current.selectedNodeIds.length !== 2) return
    try {
      await execute('workflow.connect', {
        projectId: current.id,
        fromNodeId: current.selectedNodeIds[0],
        toNodeId: current.selectedNodeIds[1],
      })
      await refresh(undefined, current.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }, [execute, refresh])

  const deleteSelected = useCallback(async () => {
    const current = projectRef.current
    if (!current || current.selectedNodeIds.length === 0) return
    if (!window.confirm(`删除选中的 ${current.selectedNodeIds.length} 个节点？`)) return
    try {
      for (const nodeId of current.selectedNodeIds) {
        await execute('workflow.node.delete', { projectId: current.id, nodeId })
      }
      await refresh(undefined, current.id)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }, [execute, refresh])

  const createProject = useCallback(async (productionBrief = '', openBlank = false) => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const cleanBrief = productionBrief.trim()
    setBusy('workflow.project.create')
    setErrorText(null)
    try {
      const reusable = cleanBrief && projectRef.current?.nodes.length === 0 ? projectRef.current.id : null
      const createdId = reusable || await runtime.createProject(cleanBrief ? cleanBrief.slice(0, 36) : 'DeepSeek 制作项目')
      if (cleanBrief) {
        await runtime.command('workflow.node.create', {
          projectId: createdId,
          type: 'text',
          title: 'Production Brief',
          x: 120,
          y: 120,
          metadata: {
            content: cleanBrief,
            prompt: cleanBrief,
            role: 'production-brief',
          },
        })
      }
      await refreshProjectList(runtime)
      await refresh(runtime, createdId)
      await bindProject(runtime, createdId)
      setBlankProjectId(openBlank ? createdId : null)
      setBrief('')
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }, [bindProject, refresh, refreshProjectList])

  const selectProject = useCallback(async (nextProjectId: string) => {
    if (!nextProjectId || nextProjectId === projectRef.current?.id) return
    const runtime = runtimeRef.current
    if (!runtime) return
    setBindingConflict(null)
    setBindingText('正在确认 Director Binding')
    setErrorText(null)
    try {
      await execute('workflow.project.use', { projectId: nextProjectId })
      await refresh(undefined, nextProjectId)
      await bindProject(runtime, nextProjectId)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }, [bindProject, execute, refresh])

  const fitProject = useCallback(() => {
    const current = projectRef.current
    const surface = surfaceRef.current
    if (!current || !surface || current.nodes.length === 0) return
    const minX = Math.min(...current.nodes.map(node => node.x))
    const minY = Math.min(...current.nodes.map(node => node.y))
    const maxX = Math.max(...current.nodes.map(node => node.x + node.width))
    const maxY = Math.max(...current.nodes.map(node => node.y + node.height))
    const k = Math.min(1, Math.max(0.35, Math.min((surface.clientWidth - 72) / Math.max(1, maxX - minX), (surface.clientHeight - 72) / Math.max(1, maxY - minY))))
    updateViewport({ x: 36 - minX * k, y: 36 - minY * k, k })
  }, [updateViewport])

  const onSurfacePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-node]') || target.closest('button') || event.button !== 0) return
    const current = projectRef.current
    if (!current) return
    setPan({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: current.viewport.x, originY: current.viewport.y })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onSurfacePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const current = projectRef.current
    const surface = surfaceRef.current
    if (!current || !surface) return
    if (pan) {
      updateViewport({
        ...current.viewport,
        x: pan.originX + event.clientX - pan.startX,
        y: pan.originY + event.clientY - pan.startY,
      })
      return
    }
    if (!nodeDrag) return
    const point = screenToWorld(event.clientX, event.clientY, surface.getBoundingClientRect(), current.viewport)
    const next = {
      ...current,
      nodes: current.nodes.map(node => node.id === nodeDrag.nodeId
        ? { ...node, x: point.x - nodeDrag.offsetX, y: point.y - nodeDrag.offsetY }
        : node),
    }
    projectRef.current = next
    setProject(next)
  }, [nodeDrag, pan, updateViewport])

  const onSurfacePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (pan) {
      setPan(null)
      return
    }
    if (!nodeDrag) return
    const current = projectRef.current
    const node = current?.nodes.find(item => item.id === nodeDrag.nodeId)
    setNodeDrag(null)
    if (!current || !node) return
    void execute('workflow.node.move', { projectId: current.id, nodeId: node.id, x: node.x, y: node.y })
      .catch(error => setErrorText(error instanceof Error ? error.message : String(error)))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [execute, nodeDrag, pan])

  const onNodePointerDown = useCallback((event: PointerEvent<HTMLDivElement>, node: NativeCanvasNode) => {
    event.stopPropagation()
    const surface = surfaceRef.current
    const current = projectRef.current
    if (!surface || !current || event.button !== 0) return
    const point = screenToWorld(event.clientX, event.clientY, surface.getBoundingClientRect(), current.viewport)
    setNodeDrag({ pointerId: event.pointerId, nodeId: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onSurfaceWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const current = projectRef.current
    const surface = surfaceRef.current
    if (!current || !surface) return
    const rect = surface.getBoundingClientRect()
    const world = screenToWorld(event.clientX, event.clientY, rect, current.viewport)
    const nextK = Math.min(2, Math.max(0.25, current.viewport.k * (event.deltaY > 0 ? 0.9 : 1.1)))
    updateViewport({
      k: nextK,
      x: event.clientX - rect.left - world.x * nextK,
      y: event.clientY - rect.top - world.y * nextK,
    })
  }, [updateViewport])

  const selectCurrentProject = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    void selectProject(event.target.value)
  }, [selectProject])

  const submitPrompt = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const text = prompt.trim()
    if (!text) return
    if (!session) {
      setPromptState('unavailable')
      return
    }
    setPromptState('sending')
    try {
      const result = await session.prompt([{
        type: 'text',
        text: `<flovart_context>\n${selectionContext(projectRef.current)}\n</flovart_context>\n\n${text}`,
      }], 'queue')
      if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false) {
        throw new Error('DSH Agent 拒绝了这条消息。')
      }
      setPrompt('')
      setPromptState('sent')
    } catch (error) {
      setPromptState('unavailable')
      setErrorText(error instanceof Error ? error.message : String(error))
    }
  }, [prompt, session])

  const promptBar = (
    <form onSubmit={submitPrompt} style={{ display: 'grid', gap: 7, padding: '10px 12px', borderTop: '1px solid var(--dsh-border, rgba(128,128,128,0.25))', background: 'var(--dsh-bg, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, ...mutedTextStyle }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: agentReady ? 'var(--dsh-success, currentColor)' : 'var(--dsh-warning, currentColor)' }} />
        <span>Ask DSH Agent</span>
        <span>{agentReady ? '已就绪' : '当前不可用，输入会保留'}</span>
        {project && project.selectedNodeIds.length > 0 && <span>已选 {project.selectedNodeIds.length} 个节点</span>}
        {promptState === 'sent' && <span style={{ marginLeft: 'auto' }}>已发送</span>}
        {promptState === 'sending' && <span style={{ marginLeft: 'auto' }}>发送中…</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          aria-label="Ask DSH Agent"
          value={prompt}
          onChange={event => { setPrompt(event.target.value); if (promptState !== 'idle') setPromptState('idle') }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitPrompt() } }}
          placeholder="选中节点后，告诉 DSH Agent 要怎么改…"
          rows={2}
          style={{ flex: 1, minWidth: 0, resize: 'vertical', padding: '8px 10px', border: '1px solid var(--dsh-border, rgba(128,128,128,0.3))', borderRadius: 8, background: 'var(--dsh-bg-subtle, transparent)', color: 'var(--dsh-text, inherit)', font: 'inherit', fontSize: 12, lineHeight: 1.5 }}
        />
        <button type="submit" style={{ ...buttonStyle, minHeight: 34, background: 'var(--dsw-alias-button-primary-fill, #1f6feb)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', borderColor: 'transparent' }} disabled={!prompt.trim() || promptState === 'sending'}>发送</button>
      </div>
    </form>
  )

  const header = useMemo(() => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '6px 12px', borderBottom: '1px solid var(--dsh-border, rgba(128,128,128,0.25))', flexWrap: 'wrap' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 650, fontSize: 13 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(status) }} />
        <span>Flovart Workflow</span>
      </div>
      <span style={{ ...mutedTextStyle, fontSize: 11 }}>{statusLabel(status)}</span>
      <span style={{ ...mutedTextStyle, fontSize: 11 }}>DSH Agent {agentReady ? '●' : '○'}</span>
      <span style={{ ...mutedTextStyle, fontSize: 11 }}>Runtime {status === 'ready' ? '●' : status === 'error' ? '○' : '◌'}</span>
      <span style={{ ...mutedTextStyle, fontSize: 11 }}>Providers {status === 'ready' ? '由 Runtime 管理' : '等待 Runtime'}</span>
      {bindingText && <span style={{ ...mutedTextStyle, fontSize: 11 }}>{bindingText}</span>}
      {project && (
        <select value={project.id} onChange={selectCurrentProject} aria-label="选择 Workflow 项目" style={{ ...buttonStyle, maxWidth: 210, appearance: 'auto' }}>
          {projects.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
        </select>
      )}
      {project && <span style={{ ...mutedTextStyle, fontSize: 11 }}>Draft v{project.draftVersion}</span>}
      <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {project && NODE_TYPE_LABELS.map(item => <button key={item.type} type="button" style={buttonStyle} onClick={() => void createNode(item.type)} disabled={Boolean(busy)}>{item.label}</button>)}
        {project && <button type="button" style={buttonStyle} onClick={() => void connectSelected()} disabled={project.selectedNodeIds.length !== 2 || Boolean(busy)}>连接选中</button>}
        {project && <button type="button" style={buttonStyle} onClick={() => void deleteSelected()} disabled={project.selectedNodeIds.length === 0 || Boolean(busy)}>删除</button>}
        {project && <button type="button" style={buttonStyle} onClick={fitProject}>适配</button>}
        {project && <button type="button" style={buttonStyle} onClick={() => void createProject()} disabled={Boolean(busy)}>新项目</button>}
        {busy && <span style={{ ...mutedTextStyle, fontSize: 11 }}>{busy.replace('workflow.', '正在 ')}</span>}
      </div>
    </div>
  ), [agentReady, bindingText, busy, connectSelected, createNode, createProject, deleteSelected, fitProject, project, projects, selectCurrentProject, status])

  const handoffAlert = bindingConflict && (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--dsh-warning, currentColor)', fontSize: 12, lineHeight: 1.5, flexWrap: 'wrap' }}>
      {bindingConflict.activeProjectId
        ? <span>当前 Harness Session 仍绑定项目 <strong>{bindingConflict.activeProjectId}</strong>。切换后，原项目将失去这个 Harness Session 的 Director Binding。</span>
        : <span>这个项目当前由 Harness Session <strong>{bindingConflict.activeSessionId || '未知会话'}</strong> 担任 Director。接管后，原 Session 将失去这个项目的 Director Binding。</span>}
      <button type="button" style={{ ...buttonStyle, marginLeft: 'auto', borderColor: 'var(--dsh-warning, currentColor)' }} onClick={() => void handoffProject()} disabled={Boolean(busy)}>
        接管此项目
      </button>
    </div>
  )

  if (status !== 'ready') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsh-text, inherit)' }}>
        {header}
        {handoffAlert}
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
          <div style={{ width: 'min(520px, 100%)', display: 'grid', gap: 12, padding: 20, border: '1px solid var(--dsh-border, rgba(128,128,128,0.25))', borderRadius: 10, background: 'var(--dsh-bg-subtle, transparent)' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>{status === 'error' ? 'Flovart Runtime offline' : '正在准备 Flovart Workflow'}</div>
              <div style={{ ...mutedTextStyle, fontSize: 12, lineHeight: 1.6 }}>{status === 'error' ? 'Flovart 页面仍然可用；Runtime 恢复后才能读取最新 Workflow、编辑 Draft 或执行生成。' : '正在检查 Flovart Runtime。DSH Agent 不需要额外连接，页面会保持可见。'}</div>
            </div>
            {errorText && <div role="alert" style={{ padding: 10, borderRadius: 7, border: '1px solid var(--dsh-danger, currentColor)', fontSize: 12, lineHeight: 1.5 }}>{errorText}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {status === 'error' && <button type="button" style={{ ...buttonStyle, background: 'var(--dsw-alias-button-primary-fill, #1f6feb)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', borderColor: 'transparent', paddingInline: 14 }} onClick={() => { reconnectAttemptsRef.current = 0; void connect() }}>启动 / 重试 Runtime</button>}
              {status === 'error' && <span style={{ ...mutedTextStyle, fontSize: 11 }}>按钮会请求当前 Host 重新检查 Runtime；不会创建第二个 Agent。</span>}
            </div>
          </div>
        </div>
        {promptBar}
      </div>
    )
  }

  if (!project || (project.nodes.length === 0 && blankProjectId !== project.id)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsh-text, inherit)' }}>
        {header}
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
          <form onSubmit={event => { event.preventDefault(); if (brief.trim()) void createProject(brief) }} style={{ width: 'min(620px, 100%)', display: 'grid', gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 680 }}>先告诉 Flovart 这次要做什么</h2>
              <p style={{ ...mutedTextStyle, margin: '8px 0 0', fontSize: 13, lineHeight: 1.65 }}>这份 Production Brief 会成为工作页的第一个节点。之后继续在 DeepSeek 主对话下达指令，Production Crew 会把状态、回执和产物同步到这里。</p>
            </div>
            {errorText && <div role="alert" style={{ padding: 10, borderRadius: 7, border: '1px solid var(--dsh-danger, currentColor)', fontSize: 12 }}>{errorText}</div>}
            <textarea
              aria-label="Production Brief"
              value={brief}
              onChange={event => setBrief(event.target.value)}
              placeholder="例如：制作一支 60 秒海洋保护短片，面向年轻观众，先完成研究、脚本和分镜。"
              rows={6}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 12, border: '1px solid var(--dsh-border, rgba(128,128,128,0.3))', borderRadius: 9, background: 'var(--dsh-bg, transparent)', color: 'var(--dsh-text, inherit)', font: 'inherit', lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" style={{ ...buttonStyle, minHeight: 34, background: 'var(--dsw-alias-button-primary-fill, #1f6feb)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', borderColor: 'transparent', paddingInline: 16 }} disabled={!brief.trim() || Boolean(busy)}>创建并进入工作页</button>
              <button type="button" style={{ ...buttonStyle, minHeight: 34, borderColor: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.3))' }} onClick={() => project ? setBlankProjectId(project.id) : void createProject('', true)} disabled={Boolean(busy)}>空白开始</button>
              {busy && <span style={{ ...mutedTextStyle, fontSize: 11 }}>正在创建 Workflow Draft…</span>}
            </div>
          </form>
        </div>
        {promptBar}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--dsh-text, inherit)' }}>
      {header}
      {handoffAlert}
      {errorText && <div role="alert" style={{ padding: '6px 12px', borderBottom: '1px solid var(--dsh-danger, currentColor)', fontSize: 12 }}>{errorText}</div>}
      <div
        ref={surfaceRef}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerUp}
        onWheel={onSurfaceWheel}
        style={{ position: 'relative', flex: 1, minHeight: 360, overflow: 'hidden', touchAction: 'none', cursor: pan ? 'grabbing' : 'grab', background: 'var(--dsh-bg-subtle, transparent)' }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(var(--dsh-border, rgba(128,128,128,0.22)) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: 0.58 }} />
        <div style={{ position: 'absolute', width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate(${project.viewport.x}px, ${project.viewport.y}px) scale(${project.viewport.k})`, transformOrigin: '0 0' }}>
          <svg width={WORLD_WIDTH} height={WORLD_HEIGHT} viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
            {project.connections.map(connection => {
              const from = project.nodes.find(node => node.id === connection.fromNodeId)
              const to = project.nodes.find(node => node.id === connection.toNodeId)
              if (!from || !to) return null
              return <path key={connection.id} d={edgePath(from, to)} fill="none" stroke="var(--dsh-accent, currentColor)" strokeOpacity={0.55} strokeWidth={2.4} />
            })}
          </svg>
          {project.nodes.map(node => {
            const selected = project.selectedNodeIds.includes(node.id)
            return (
              <div
                key={node.id}
                data-canvas-node="true"
                onPointerDown={event => onNodePointerDown(event, node)}
                onClick={event => { event.stopPropagation(); selectNode(node.id, event.shiftKey) }}
                style={{ position: 'absolute', left: node.x, top: node.y, width: node.width, minHeight: node.height, boxSizing: 'border-box', padding: 12, border: `1px solid ${selected ? 'var(--dsh-accent, currentColor)' : 'var(--dsh-border, rgba(128,128,128,0.34))'}`, borderRadius: 10, background: 'var(--dsh-bg-raised, var(--dsh-bg, transparent))', boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--dsh-accent, currentColor) 22%, transparent)' : '0 8px 24px color-mix(in srgb, var(--dsh-shadow, currentColor) 10%, transparent)', cursor: nodeDrag?.nodeId === node.id ? 'grabbing' : 'grab', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', ...mutedTextStyle }}>{nodeTypeLabel(node.type)}</span>
                  <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: node.metadata.status === 'error' ? 'var(--dsh-danger, currentColor)' : node.metadata.status === 'loading' ? 'var(--dsh-warning, currentColor)' : 'var(--dsh-success, currentColor)' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 650, lineHeight: 1.35 }}>{node.title}</div>
                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, ...mutedTextStyle }}>{nodePreviewText(node)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 10, ...mutedTextStyle }}>
                  <span>v{String(node.metadata.objectVersion || 1)}</span>
                  <span style={{ marginLeft: 'auto' }}>{node.id.slice(0, 8)}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'inline-flex', gap: 8, padding: '5px 8px', border: '1px solid var(--dsh-border, rgba(128,128,128,0.24))', borderRadius: 6, background: 'var(--dsh-bg, transparent)', fontSize: 11, ...mutedTextStyle, pointerEvents: 'none' }}>
          拖动画布平移 · 滚轮缩放 · Shift 多选 · 选择两个节点后连接
        </div>
      </div>
      {promptBar}
    </div>
  )
}
