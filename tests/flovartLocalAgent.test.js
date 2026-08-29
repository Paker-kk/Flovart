import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBrowserBootstrapUrl,
  normalizeLocalAgentUrl,
  probeWebUi,
  readLocalAgentConnection,
  redactBootstrapUrl,
} from '../tools/flovart/local-agent.js';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe('local Agent bootstrap helpers', () => {
  it('only accepts loopback HTTP endpoints and reads the local config', () => {
    expect(normalizeLocalAgentUrl('http://127.0.0.1:17373/path')).toBe('http://127.0.0.1:17373');
    expect(() => normalizeLocalAgentUrl('https://example.com')).toThrow('loopback');
    const dir = mkdtempSync(join(tmpdir(), 'flovart-local-agent-'));
    tempDirs.push(dir);
    const file = join(dir, 'agent.json');
    writeFileSync(file, JSON.stringify({ url: 'http://127.0.0.1:17373', token: 'secret-token' }), 'utf8');
    expect(readLocalAgentConnection({ configPath: file })).toMatchObject({ url: 'http://127.0.0.1:17373', token: 'secret-token' });
  });

  it('builds the main App URL and never exposes the token in logs', () => {
    const url = buildBrowserBootstrapUrl('http://127.0.0.1:37522', { url: 'http://127.0.0.1:17373', token: 'secret-token' });
    expect(url).toContain('#/app');
    expect(url).toContain('agentUrl=');
    expect(new URL(url).searchParams.get('activateBrowserWriter')).toBe('1');
    expect(redactBootstrapUrl(url)).not.toContain('secret-token');
    expect(redactBootstrapUrl(url)).not.toContain('activateBrowserWriter');
    expect(redactBootstrapUrl('http://127.0.0.1:37522/#/app?agentToken=secret-token&activateBrowserWriter=1')).toBe('http://127.0.0.1:37522/#/app');
  });

  it('rejects an unrelated localhost HTTP service during WebUI discovery', async () => {
    const fetchImpl = async (_url, init) => {
      expect(init.headers.accept).toBe('text/html');
      return new Response('<title>Other app</title>', { status: 200 });
    };
    await expect(probeWebUi('http://127.0.0.1:43127', { fetchImpl })).resolves.toBeNull();
  });
});
