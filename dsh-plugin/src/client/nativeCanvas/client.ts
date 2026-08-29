import { extractCommandResultData, extractProjectId, normalizeNativeCanvasProject, type NativeCanvasProject } from './model.ts'

export interface NativeCanvasClientOptions {
  url: string
  token?: string
  fetch?: typeof globalThis.fetch
}

export interface NativeCanvasHealth {
  ok: boolean
  hasWorkflow: boolean
  clients: number
  nativeWorkspace: boolean
  activeProjectId: string | null
  snapshotUpdatedAt: string | null
}

export interface NativeCanvasDirectorBinding {
  id?: string
  bindingId?: string
  host?: string
  sessionId?: string
  projectId?: string
}

export interface NativeCanvasDirectorStatus {
  binding: NativeCanvasDirectorBinding | null
  projectId: string | null
}

export class NativeCanvasRequestError extends Error {
  readonly code: string | null
  readonly details: Record<string, unknown> | null
  readonly status: number

  constructor(message: string, options: { code?: string | null; details?: Record<string, unknown> | null; status: number }) {
    super(message)
    this.name = 'NativeCanvasRequestError'
    this.code = options.code || null
    this.details = options.details || null
    this.status = options.status
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

const makeId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `dsh-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function errorMessage(value: unknown, fallback: string): string {
  const record = asRecord(value)
  const nested = asRecord(record?.error)
  return String(nested?.message || record?.message || record?.error || fallback)
}

export class NativeCanvasClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof globalThis.fetch

  constructor(options: NativeCanvasClientOptions) {
    this.baseUrl = options.url.replace(/\/+$/, '')
    this.token = options.token || ''
    this.fetchImpl = options.fetch || globalThis.fetch.bind(globalThis)
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImpl(new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`), {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { 'x-flovart-agent-token': this.token } : {}),
        ...(init.headers || {}),
      },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || asRecord(body)?.ok === false) {
      const error = asRecord(asRecord(body)?.error)
      throw new NativeCanvasRequestError(errorMessage(body, `Flovart Runtime 返回 HTTP ${response.status}`), {
        code: typeof error?.code === 'string' ? error.code : null,
        details: asRecord(error?.details),
        status: response.status,
      })
    }
    return body
  }

  async health(): Promise<NativeCanvasHealth> {
    const body = asRecord(await this.request('/health')) || {}
    return {
      ok: body.ok !== false,
      hasWorkflow: Boolean(body.hasWorkflow),
      clients: Number(body.clients || 0),
      nativeWorkspace: Boolean(body.nativeWorkspace),
      activeProjectId: typeof body.activeProjectId === 'string' ? body.activeProjectId : null,
      snapshotUpdatedAt: typeof body.snapshotUpdatedAt === 'string' ? body.snapshotUpdatedAt : null,
    }
  }

  async registerNativeWorkspace() {
    return this.request('/workflow/native/register', { method: 'POST', body: '{}' })
  }

  async command(command: string, args: Record<string, unknown> = {}, source: 'operator' | 'agent' = 'operator'): Promise<unknown> {
    const commandArgs = { ...args, workspaceMode: args.workspaceMode || 'native' }
    const body = asRecord(await this.request('/api/tools', {
      method: 'POST',
      body: JSON.stringify({ command, args: commandArgs, source, idempotencyKey: makeId() }),
    })) || {}
    const result = body.result
    if (asRecord(result)?.ok === false) throw new Error(errorMessage(result, `${command} 执行失败`))
    return result
  }

  async listProjects() {
    const result = extractCommandResultData(await this.command('workflow.project.list'))
    return Array.isArray(result)
      ? result.flatMap(item => {
        const record = asRecord(item)
        const id = typeof record?.id === 'string' ? record.id : ''
        return id ? [{
          id,
          title: typeof record?.title === 'string' ? record.title : '未命名工作流',
          ...(typeof record?.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
        }] : []
      })
      : []
  }

  async inspect(projectId?: string): Promise<NativeCanvasProject> {
    const result = await this.command('workflow.inspect', projectId ? { projectId } : {})
    const project = normalizeNativeCanvasProject(result)
    if (!project) throw new Error('Runtime 返回的 Workflow 项目格式无效。')
    return project
  }

  async createProject(title: string): Promise<string> {
    const result = await this.command('workflow.project.create', { title })
    const projectId = extractProjectId(result)
    if (!projectId) throw new Error('Workflow 项目已创建，但 Runtime 没有返回项目 ID。')
    return projectId
  }

  async directorStatus(filters: { sessionId?: string; projectId?: string } = {}): Promise<NativeCanvasDirectorStatus> {
    const query = new URLSearchParams({ agentIdentity: 'deepseek-harness' })
    if (filters.sessionId) query.set('sessionId', filters.sessionId)
    if (filters.projectId) query.set('projectId', filters.projectId)
    const body = asRecord(await this.request(`/director/status?${query.toString()}`)) || {}
    return {
      binding: asRecord(body.binding) as NativeCanvasDirectorBinding | null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
    }
  }

  async bindDirector(sessionId: string, projectId: string): Promise<NativeCanvasDirectorBinding | null> {
    const body = asRecord(await this.request('/director/bind', {
      method: 'POST',
      body: JSON.stringify({ agentIdentity: 'deepseek-harness', sessionId, projectId }),
    }))
    return asRecord(body?.binding) as NativeCanvasDirectorBinding | null
  }

  async handoffDirector(sessionId: string, projectId: string, expectedBindingId?: string): Promise<NativeCanvasDirectorBinding | null> {
    const body = asRecord(await this.request('/director/handoff', {
      method: 'POST',
      body: JSON.stringify({
        agentIdentity: 'deepseek-harness',
        sessionId,
        projectId,
        ...(expectedBindingId ? { expectedBindingId } : {}),
      }),
    }))
    return asRecord(body?.binding) as NativeCanvasDirectorBinding | null
  }
}
