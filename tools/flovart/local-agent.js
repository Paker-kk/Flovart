import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DEFAULT_WEB_URL = 'http://127.0.0.1:37522';

export function agentConfigPath(env = process.env) {
  return env.FLOVART_AGENT_CONFIG || join(homedir(), '.flovart', 'agent.json');
}

export function normalizeLocalAgentUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('Flovart Agent 地址无效。');
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('Flovart Agent 只能使用本机 loopback HTTP 地址。');
  }
  return url.origin;
}

export function readLocalAgentConnection(options = {}) {
  const file = options.configPath || agentConfigPath(options.env || process.env);
  if (!existsSync(file)) return null;
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Flovart Agent 配置无法读取。');
  }
  const url = normalizeLocalAgentUrl(config?.url);
  const token = String(config?.token || '').trim();
  if (!token) throw new Error('Flovart Agent 配置缺少连接 Token。');
  return { url, token, configPath: file };
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前环境没有可用的 fetch。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 800);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: options.token ? { 'x-flovart-agent-token': options.token } : undefined,
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch (cause) {
    if (controller.signal.aborted) throw new Error('请求本机 Flovart Agent 超时。');
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectLocalAgent(connection, options = {}) {
  const normalized = connection || readLocalAgentConnection(options);
  if (!normalized) return { state: 'offline', connection: null, health: null, protocol: null };

  let healthResponse;
  try {
    healthResponse = await fetchJson(new URL('/health', normalized.url), options);
  } catch (cause) {
    return { state: 'offline', connection: normalized, health: null, protocol: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
  if (!healthResponse.response.ok) {
    return { state: 'offline', connection: normalized, health: healthResponse.body, protocol: null, error: `Agent health 返回 HTTP ${healthResponse.response.status}` };
  }

  let protocolResponse;
  try {
    protocolResponse = await fetchJson(new URL('/crew/protocol', normalized.url), { ...options, token: normalized.token });
  } catch (cause) {
    return { state: 'offline', connection: normalized, health: healthResponse.body, protocol: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
  if (protocolResponse.response.status === 401 || /invalid token/i.test(String(protocolResponse.body?.error || ''))) {
    return { state: 'auth_failed', connection: normalized, health: healthResponse.body, protocol: null, error: 'Flovart Agent 连接 Token 无效。' };
  }
  if (!protocolResponse.response.ok || protocolResponse.body?.ok === false) {
    return { state: 'offline', connection: normalized, health: healthResponse.body, protocol: null, error: `Agent protocol 返回 HTTP ${protocolResponse.response.status}` };
  }
  return { state: 'ready', connection: normalized, health: healthResponse.body, protocol: protocolResponse.body };
}

export async function waitForLocalAgent(options = {}) {
  const deadline = Date.now() + (options.timeoutMs || 15_000);
  let last = null;
  while (Date.now() <= deadline) {
    let connection = null;
    try {
      connection = readLocalAgentConnection(options);
    } catch (cause) {
      last = { state: 'auth_failed', error: cause instanceof Error ? cause.message : String(cause) };
    }
    if (connection) {
      last = await inspectLocalAgent(connection, options);
      if (last.state === 'ready' || last.state === 'auth_failed') return last;
    }
    await new Promise(resolve => setTimeout(resolve, options.intervalMs || 250));
  }
  return last || { state: 'offline', connection: null, health: null, protocol: null, error: '等待 Flovart Agent 超时。' };
}

export async function waitForWebUi(url = DEFAULT_WEB_URL, options = {}) {
  const deadline = Date.now() + (options.timeoutMs || 20_000);
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const result = await fetchJson(url, options);
      if (result.response.ok || result.response.status === 404) return new URL(url).origin;
      lastError = `WebUI 返回 HTTP ${result.response.status}`;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
    }
    await new Promise(resolve => setTimeout(resolve, options.intervalMs || 250));
  }
  throw new Error(lastError || '等待 Flovart WebUI 超时。');
}

export function buildBrowserBootstrapUrl(frontendUrl, connection, route = '#/app') {
  const url = new URL(frontendUrl);
  const normalized = connection || {};
  url.searchParams.set('agentUrl', normalizeLocalAgentUrl(normalized.url));
  const token = String(normalized.token || '').trim();
  if (!token) throw new Error('构造 Browser bootstrap URL 时缺少 Agent Token。');
  url.searchParams.set('agentToken', token);
  url.hash = route.startsWith('#') ? route : `#${route}`;
  return url.toString();
}

export function redactBootstrapUrl(value) {
  try {
    const url = new URL(String(value));
    url.searchParams.delete('agentToken');
    url.searchParams.delete('token');
    return url.toString();
  } catch {
    return String(value || '').replace(/([?&#](?:agentToken|token)=)[^&#]*/gi, '$1[redacted]');
  }
}

export const LOCAL_AGENT_DEFAULTS = Object.freeze({
  webUrl: DEFAULT_WEB_URL,
  configPath: agentConfigPath(),
});
