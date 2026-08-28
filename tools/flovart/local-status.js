import { inspectLocalAgent, readLocalAgentConnection } from './local-agent.js';

const DEFAULT_FRONTEND_URLS = Object.freeze([
  'http://127.0.0.1:37522',
  'http://127.0.0.1:11451',
]);

function frontendCandidates(env = process.env) {
  const explicit = String(env.FLOVART_WEB_URL || '').trim();
  if (explicit) return [explicit];
  const configured = String(env.FLOVART_WEBUI_PORTS || '').split(',').map(value => value.trim()).filter(Boolean);
  return configured.length ? configured : [...DEFAULT_FRONTEND_URLS];
}

async function probeFrontend(url, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
    return response.ok || response.status === 404;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLocalStatus(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const frontendUrl = (typeof fetchImpl === 'function'
    ? (await firstReachable(frontendCandidates(options.env || process.env), fetchImpl))
    : null);

  let agent;
  try {
    const connection = readLocalAgentConnection({ env: options.env || process.env, configPath: options.configPath });
    agent = await inspectLocalAgent(connection, { fetchImpl, timeoutMs: options.timeoutMs || 800 });
  } catch (cause) {
    agent = { state: 'auth_failed', connection: null, health: null, protocol: null, error: cause instanceof Error ? cause.message : String(cause) };
  }

  const health = agent.health || {};
  const browserConnected = agent.state === 'ready' && Number(health.clients || 0) > 0 && Boolean(health.hasWorkflow);
  const status = {
    ready: Boolean(frontendUrl && agent.state === 'ready' && browserConnected),
    frontend: { status: frontendUrl ? 'ready' : 'offline', url: frontendUrl },
    agent: { status: agent.state, url: agent.connection?.url || null },
    browser: {
      connected: browserConnected,
      clientId: health.clientId || null,
      projectId: health.activeProjectId || null,
      revision: numericOrNull(health.revision),
      clients: Number(health.clients || 0),
      hasWorkflow: Boolean(health.hasWorkflow),
    },
    browserConnected,
    clientId: health.clientId || null,
    projectId: health.activeProjectId || null,
    revision: numericOrNull(health.revision),
  };
  if (agent.error) status.agent.error = agent.error;
  return status;
}

async function firstReachable(candidates, fetchImpl) {
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) continue;
      if (await probeFrontend(url.toString(), fetchImpl)) return url.origin;
    } catch { /* ignore invalid local configuration */ }
  }
  return null;
}

function numericOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export { DEFAULT_FRONTEND_URLS, frontendCandidates };
