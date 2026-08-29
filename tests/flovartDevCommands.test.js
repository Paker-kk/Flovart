import { describe, expect, it, vi } from 'vitest';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { buildBrowserOpenCommand, findAvailablePort, findExistingWebUi, parseDevArgs, planInstall, planStart } from '../tools/flovart/dev-commands.js';
import { buildTuiCommand, tokenizeTuiLine } from '../tools/flovart/tui.js';

describe('flovart dev startup commands', () => {
  it('plans frontend-only local startup without database', () => {
    const plan = planStart(['--source', '--web', '--open'], process.cwd());

    expect(plan).toMatchObject({
      command: 'start',
      mode: 'local',
      services: ['web'],
      openBrowser: true,
      browserAgent: true,
    });
    expect(plan.urls).toEqual({ web: 'http://localhost:37522' });
  });

  it('plans backend startup with PostgreSQL dependency', () => {
    const plan = planStart(['--source', '--backend'], process.cwd());

    expect(plan.mode).toBe('local');
    expect(plan.services).toEqual(['db', 'hub', 'enterprise']);
    expect(plan.openBrowser).toBe(false);
  });

  it('plans full docker startup with detached mode', () => {
    const plan = planStart(['--source', '--docker', '--all', '--detach', '--open'], process.cwd());

    expect(plan).toMatchObject({
      mode: 'docker',
      services: ['db', 'hub', 'enterprise', 'web'],
      detach: true,
      openBrowser: true,
    });
  });

  it('keeps install scoped to requested services', () => {
    expect(planInstall(['--source', '--web'], process.cwd()).services).toEqual(['web']);
    expect(planInstall(['--source', '--backend'], process.cwd()).services).toEqual(['hub', 'enterprise']);
    expect(parseDevArgs(['web', '--plan', '--json'])).toMatchObject({ web: true, plan: true, json: true });
  });

  it('does not start a managed coding agent unless explicitly requested', () => {
    expect(parseDevArgs([])).toMatchObject({ agent: 'none', noAgent: true });
    expect(parseDevArgs(['--agent=codex'])).toMatchObject({ agent: 'codex', noAgent: false });
  });

  it('starts the source Browser Agent by default and allows an explicit diagnostic opt-out', () => {
    expect(planStart(['--source', '--web']).browserAgent).toBe(true);
    expect(planStart(['--source', '--web', '--no-browser-agent']).browserAgent).toBe(false);
    expect(planStart(['--open'], process.cwd()).mode).toBe('local');
  });

  it('selects a free local WebUI port when the preferred port is occupied', async () => {
    const occupied = createNetServer();
    await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
    const preferred = occupied.address().port;
    try {
      const port = await findAvailablePort(preferred);
      expect(port).toBeGreaterThan(0);
      expect(port).not.toBe(preferred);
    } finally {
      await new Promise(resolve => occupied.close(resolve));
    }
  });

  it('reuses a discovered Flovart WebUI before starting a duplicate Vite process', async () => {
    const probe = vi.fn().mockResolvedValue('http://127.0.0.1:6114');
    await expect(findExistingWebUi({
      preferredPort: 37522,
      discovery: () => ({ url: 'http://127.0.0.1:6114' }),
      probe,
    })).resolves.toBe('http://127.0.0.1:6114');
    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:6114', { timeoutMs: 800 });
  });

  it('ignores an unrelated loopback service and falls back to dynamic startup', async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await expect(findExistingWebUi({ preferredPort: 37522, discovery: () => null, probe })).resolves.toBeNull();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('passes Windows bootstrap URLs through the OS handler without shell splitting', () => {
    expect(buildBrowserOpenCommand('http://127.0.0.1:17373/?agentUrl=http%3A%2F%2F127.0.0.1%3A17373&agentToken=secret#/app', 'win32')).toEqual({
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', 'http://127.0.0.1:17373/?agentUrl=http%3A%2F%2F127.0.0.1%3A17373&agentToken=secret#/app'],
    });
  });

  it('lets a JSON start command exit cleanly after reusing an existing WebUI', async () => {
    const web = createHttpServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<body data-flovart-webui="1"></body>');
    });
    await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
    const port = web.address().port;
    try {
      const child = spawn(process.execPath, [
        'tools/flovart/cli.js', 'start', '--source', '--web', '--no-browser-agent', '--json', '--no-open',
      ], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 15_000,
        windowsHide: true,
        env: { ...process.env, FLOVART_WEB_PORT: String(port), FLOVART_WEB_DISCOVERY: `${process.env.TEMP || 'C:\\tmp'}\\flovart-missing-web-${process.pid}.json` },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += String(chunk); });
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      const result = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', status => resolve({ status, stdout, stderr }));
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`\"url\": \"http://127.0.0.1:${port}\"`);
      expect(result.stderr).not.toContain('uv_handle');
    } finally {
      await new Promise(resolve => web.close(resolve));
    }
  });

  it('maps TUI slash commands to existing CLI commands', () => {
    expect(buildTuiCommand('/START')).toEqual({ type: 'run', args: ['start'] });
    expect(buildTuiCommand('/web --plan')).toEqual({ type: 'run', args: ['start', '--source', '--web', '--open', '--plan'] });
    expect(buildTuiCommand('/docker -d')).toEqual({ type: 'run', args: ['start', '--source', '--docker', '--all', '--open', '-d'] });
    expect(buildTuiCommand('/plan --backend')).toEqual({ type: 'run', args: ['start', '--plan', '--json', '--backend'] });
    expect(buildTuiCommand('/runtime')).toEqual({ type: 'run', args: ['runtime.status', '--json'] });
    expect(buildTuiCommand('/workspace')).toEqual({ type: 'run', args: ['workspace.status', '--json'] });
    expect(buildTuiCommand('/tasks')).toEqual({ type: 'run', args: ['task.list', '--limit', '20', '--json'] });
    expect(buildTuiCommand('/research')).toEqual({ type: 'unknown', name: 'research (topic required)' });
    expect(buildTuiCommand('/research US politics')).toMatchObject({
      type: 'run',
      args: [
        'research.topic.collect',
        '--topic',
        'US politics',
        '--sources',
        '["reddit","x"]',
        '--idempotency-key',
        expect.stringMatching(/^tui-research-\d+$/),
        '--json',
      ],
    });
    expect(buildTuiCommand('/exit')).toEqual({ type: 'exit' });
  });

  it('tokenizes quoted TUI commands', () => {
    expect(tokenizeTuiLine('/run prompt.enhance --prompt "red car"')).toEqual(['/run', 'prompt.enhance', '--prompt', 'red car']);
  });
});
