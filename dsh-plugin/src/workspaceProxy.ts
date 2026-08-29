import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { FlovartPluginConfig } from './config.ts'

export const WORKSPACE_PROXY_PATH = '/flovart-workspace'

const ROUTES = new Map<string, ReadonlySet<string>>([
  ['/health', new Set(['GET'])],
  ['/workflow/native/register', new Set(['POST'])],
  ['/api/tools', new Set(['POST'])],
  ['/director/bind', new Set(['POST'])],
  ['/director/handoff', new Set(['POST'])],
  ['/director/status', new Set(['GET'])],
])
const MAX_BODY_BYTES = 36 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function workspaceOrigin(value: string): URL {
  const target = new URL(value)
  if (target.protocol !== 'http:' || !LOOPBACK_HOSTS.has(target.hostname) || target.username || target.password) {
    throw new Error('Workspace Operator 必须使用无凭据的本机 http 地址。')
  }
  return target
}

export function resolveWorkspaceProxyTarget(workspaceUrl: string, requestUrl: string, method = 'GET'): URL | null {
  const incoming = new URL(requestUrl, 'http://dsh.local')
  if (incoming.pathname !== WORKSPACE_PROXY_PATH && !incoming.pathname.startsWith(`${WORKSPACE_PROXY_PATH}/`)) return null
  const path = incoming.pathname.slice(WORKSPACE_PROXY_PATH.length) || '/'
  if (!ROUTES.get(path)?.has(method.toUpperCase())) return null
  return new URL(`${path}${incoming.search}`, `${workspaceOrigin(workspaceUrl).origin}/`)
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(value)
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined
}

export function createWorkspaceProxyHandler(
  config: Pick<FlovartPluginConfig, 'workspaceUrl' | 'workspaceToken'>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (!config.workspaceToken) {
      json(response, 503, { ok: false, error: { message: 'Workspace Operator 尚未由 Flovart Harness 启动器准备。' } })
      return
    }
    let target: URL | null
    try {
      target = resolveWorkspaceProxyTarget(config.workspaceUrl, request.url || '/', request.method || 'GET')
    } catch (error) {
      json(response, 503, { ok: false, error: { message: error instanceof Error ? error.message : String(error) } })
      return
    }
    if (!target) {
      json(response, 404, { ok: false, error: { message: 'Workspace 路由不存在。' } })
      return
    }
    try {
      const body = await readBody(request)
      const init: RequestInit = {
        method: request.method || 'GET',
        headers: {
          accept: 'application/json',
          'x-flovart-agent-token': config.workspaceToken,
          ...(request.headers['content-type'] ? { 'content-type': request.headers['content-type'] } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      }
      if (body) init.body = body.toString('utf8')
      const upstream = await fetchImpl(target, init)
      const payload = Buffer.from(await upstream.arrayBuffer())
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(payload)
    } catch (error) {
      json(response, 502, { ok: false, error: { message: `无法连接本机 Workspace Operator：${error instanceof Error ? error.message : String(error)}` } })
    }
  }
}

export function registerWorkspaceProxy(ctx: Context, config: FlovartPluginConfig): void {
  const handler = createWorkspaceProxyHandler(config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: WORKSPACE_PROXY_PATH,
    handler,
  }), 'flovart: same-origin Workspace Operator proxy')
}
