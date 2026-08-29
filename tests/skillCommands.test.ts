import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSkillCommand, openUrlNative, buildNativeOpenCommand } from '../tools/flovart/skill-commands.js';
import { SkillRegistry } from '../tools/flovart/skill-registry.js';

const MANIFEST_YAML = `schemaVersion: flovart.production-skill/1
id: community.demo
version: 1.0.0
trustTier: local-installed
license: MIT
capabilities: [text.image]
permissions:
  network: none
  secrets: none
  filesystem: package-readonly
gates:
  - id: style-review
    type: style-reference
runtime:
  minVersion: 0.3.0
provenance:
  source: https://hub.example.com/demo
`;

function writePackage(root, id) {
  const dir = join(root, id);
  for (const sub of ['references', 'agents']) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: Demo\n---\n# Demo\n', 'utf8');
  writeFileSync(join(dir, 'flovart.skill.yaml'), MANIFEST_YAML, 'utf8');
  writeFileSync(join(dir, 'agents', 'openai.yaml'), 'interface:\n  display_name: Demo Skill\n  short_description: 演示\n', 'utf8');
  writeFileSync(join(dir, 'references', 'creative-direction.md'), '# D\n', 'utf8');
}

describe('flovart CLI skill commands', () => {
  let projectDir;
  let packageDir;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'flovart-skill-cli-project-'));
    packageDir = mkdtempSync(join(tmpdir(), 'flovart-skill-cli-pkg-'));
    mkdirSync(join(projectDir, '.agents', 'skills'), { recursive: true });
    writePackage(packageDir, 'community.demo');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(packageDir, { recursive: true, force: true });
  });

  it('lists local roots and skills, then reports the manifest with a stable hash', async () => {
    const registry = new SkillRegistry({ repoRoot: projectDir, roots: [join(projectDir, '.agents', 'skills')] });
    await registry.installPackage({
      id: 'community.demo',
      version: '1.0.0',
      files: [
        { path: 'SKILL.md', content: '---\nname: Demo\n---\n# Demo\n' },
        { path: 'flovart.skill.yaml', content: MANIFEST_YAML },
      ],
    });

    const list = await runSkillCommand('skill.list', { projectDir });
    expect(list.ok).toBe(true);
    expect(list.skills.some(skill => skill.id === 'community.demo' && skill.kind === 'production')).toBe(true);

    const manifest = await runSkillCommand('skill.manifest', { id: 'community.demo', projectDir });
    expect(manifest.ok).toBe(true);
    expect(manifest.manifest.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.manifest.capabilities).toEqual(['text.image']);

    const missing = await runSkillCommand('skill.manifest', { id: 'no.such', projectDir });
    expect(missing.ok).toBe(false);
    expect(missing.error.code).toBe('NOT_FOUND');
  });

  it('installs from a local directory and reinstalls refuse duplicates', async () => {
    const installed = await runSkillCommand('skill.install', {
      id: 'community.demo',
      fromDir: join(packageDir, 'community.demo'),
      projectDir,
    });
    expect(installed.ok).toBe(true);
    expect(existsSync(join(projectDir, '.agents', 'skills', 'community.demo', 'SKILL.md'))).toBe(true);

    const duplicate = await runSkillCommand('skill.install', {
      id: 'community.demo',
      fromDir: join(packageDir, 'community.demo'),
      projectDir,
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error.message).toContain('已安装');
  });

  it('installs from the hub only through https or loopback hosts', async () => {
    const badHost = await runSkillCommand('skill.install', { id: 'community.demo', hubUrl: 'http://10.0.0.8/hub', projectDir });
    expect(badHost.ok).toBe(false);
    expect(badHost.error.code).toBe('INVALID_URL');

    const missingArg = await runSkillCommand('skill.install', { id: 'community.demo', projectDir });
    expect(missingArg.ok).toBe(false);
    expect(missingArg.error.code).toBe('INVALID_ARGUMENT');
  });

  it('uninstalls app-managed packages and protects bundled ones', async () => {
    const registry = new SkillRegistry({ repoRoot: projectDir, installRoot: join(projectDir, '.agents', 'skills') });
    await registry.installPackage({
      id: 'community.demo',
      version: '1.0.0',
      files: [
        { path: 'SKILL.md', content: 'x' },
        { path: 'flovart.skill.yaml', content: MANIFEST_YAML },
      ],
    });
    const removed = await runSkillCommand('skill.uninstall', { id: 'community.demo', projectDir });
    expect(removed.ok).toBe(true);
    expect(existsSync(join(projectDir, '.agents', 'skills', 'community.demo'))).toBe(false);

    const bundled = await runSkillCommand('skill.uninstall', { id: 'community.vox-director', projectDir });
    expect(bundled.ok).toBe(false);
    expect(bundled.error.message).toContain('内置');
  });

  it('syncs the hub catalog and surfaces transport failures', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, skills: [{ id: 'community.demo', name: 'Demo', version: '1.0.0', description: 'd' }] }),
    }));
    vi.stubGlobal('fetch', fetcher);
    try {
      const synced = await runSkillCommand('skill.hub.list', { hubUrl: 'https://skills.example.com' });
      expect(synced.ok).toBe(true);
      expect(synced.skills).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }

    const dead = await runSkillCommand('skill.hub.list', { hubUrl: 'http://127.0.0.1:1' });
    expect(dead.ok).toBe(false);
    expect(dead.error.code).toBe('UNREACHABLE');
  });
});

describe('web.open', () => {
  it('opens a probing candidate with the native opener via global fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input);
      if (url === 'http://127.0.0.1:37522') return { ok: true, status: 200, text: async () => '<body data-flovart-webui="1"></body>' };
      throw new Error('unreachable');
    }));
    try {
      const result = await runSkillCommand('web.open', {});
      expect(result.ok).toBe(true);
      expect(result.opened).toBe('http://127.0.0.1:37522');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answers NO_WEBUI when nothing is listening', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    try {
      const result = await runSkillCommand('web.open', {});
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_WEBUI');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('honors FLOVART_WEBUI_PORTS over the default probe order', async () => {
    process.env.FLOVART_WEBUI_PORTS = 'http://127.0.0.1:8080,http://127.0.0.1:9000';
    vi.stubGlobal('fetch', vi.fn(async input => {
      return String(input) === 'http://127.0.0.1:8080'
        ? { ok: true, status: 200, text: async () => '<body data-flovart-webui="1"></body>' }
        : { ok: false, status: 404 };
    }));
    try {
      const result = await runSkillCommand('web.open', {});
      expect(result.ok).toBe(true);
      expect(result.opened).toBe('http://127.0.0.1:8080');
    } finally {
      vi.unstubAllGlobals();
      delete process.env.FLOVART_WEBUI_PORTS;
    }
  });

  it('spawns the platform opener without a shell', () => {
    // openUrlNative is best-effort: on CI/headless it must not throw.
    expect(() => openUrlNative('http://127.0.0.1:37522')).not.toThrow();
  });

  it('keeps Windows bootstrap query parameters out of shell parsing', () => {
    expect(buildNativeOpenCommand('http://127.0.0.1:17373/?agentToken=secret&next=%2Fapp', 'win32')).toEqual({
      cmd: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', 'http://127.0.0.1:17373/?agentToken=secret&next=%2Fapp'],
    });
  });
});
