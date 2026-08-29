import { inspectLocalAgent, probeWebUi, readLocalAgentConnection } from './local-agent.js';
import { readWebDiscovery } from './web-discovery.js';
import { FlovartRuntimeClient } from './runtime-client.js';

const DEFAULT_FRONTEND_URLS = Object.freeze([
  'http://127.0.0.1:37522',
  'http://127.0.0.1:11451',
]);

function frontendCandidates(env = process.env) {
  const explicit = String(env.FLOVART_WEB_URL || '').trim();
  if (explicit) return [explicit];
  const configured = String(env.FLOVART_WEBUI_PORTS || '').split(',').map(value => value.trim()).filter(Boolean);
  const discovered = readWebDiscovery(env)?.url;
  return [...new Set([...(discovered ? [discovered] : []), ...(configured.length ? configured : DEFAULT_FRONTEND_URLS)])];
}

async function probeFrontend(url, fetchImpl = globalThis.fetch) {
  return Boolean(await probeWebUi(url, { fetchImpl, timeoutMs: 800 }).catch(() => null));
}

export async function getLocalStatus(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const frontendUrl = (typeof fetchImpl === 'function'
    ? (await firstReachable(frontendCandidates(options.env || process.env), fetchImpl))
    : null);
  const runtimeStatus = await readRuntimeStatus(options);

  let agent;
  try {
    const connection = readLocalAgentConnection({ env: options.env || process.env, configPath: options.configPath });
    agent = await inspectLocalAgent(connection, { fetchImpl, timeoutMs: options.timeoutMs || 800 });
  } catch (cause) {
    agent = { state: 'auth_failed', connection: null, health: null, protocol: null, error: cause instanceof Error ? cause.message : String(cause) };
  }

  const health = agent.health || {};
  const browserConnected = agent.state === 'ready' && Number(health.clients || 0) > 0 && Boolean(health.hasWorkflow);
  const desktopReady = Boolean(runtimeStatus && browserConnected);
  const status = {
    ready: Boolean((frontendUrl && agent.state === 'ready' && browserConnected) || desktopReady),
    runtime: runtimeStatus
      ? { status: 'ready', surface: 'desktop-runtime', version: runtimeStatus.runtimeVersion }
      : { status: 'offline', surface: 'desktop-runtime' },
    frontend: { status: frontendUrl || runtimeStatus ? 'ready' : 'offline', url: frontendUrl },
    agent: { status: agent.state, url: agent.connection?.url || null },
    browser: {
      connected: browserConnected,
      clientId: health.clientId || null,
      projectId: health.activeProjectId || null,
      revision: numericOrNull(health.revision),
      clients: Number(health.clients || 0),
      hasWorkflow: Boolean(health.hasWorkflow),
      activeHostWriter: health.activeHostWriter || null,
    },
    browserConnected,
    clientId: health.clientId || null,
    projectId: health.activeProjectId || null,
    revision: numericOrNull(health.revision),
    activeHostWriter: health.activeHostWriter || null,
  };
  if (agent.error) status.agent.error = agent.error;
  return status;
}

async function readRuntimeStatus(options) {
  try {
    const client = options.runtimeClient || new FlovartRuntimeClient({
      discoveryPath: options.runtimeDiscoveryPath,
      timeoutMs: options.timeoutMs || 800,
    });
    return await client.status();
  } catch {
    return null;
  }
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
