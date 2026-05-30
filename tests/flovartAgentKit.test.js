import { describe, expect, it } from 'vitest';

import {
  diagnoseAgentSetup,
  enhancePrompt,
  initCliHost,
  planBatchGeneration,
  searchInspiration,
} from '../tools/flovart/agent-kit.js';

describe('flovart agent kit', () => {
  it('builds host-specific CLI config without writing in dry-run mode', () => {
    const projectDir = process.cwd();

    expect(initCliHost({ host: 'opencode', projectDir, dryRun: true })).toMatchObject({
      ok: true,
      writes: [
        expect.objectContaining({
          wrapperKey: 'cliServers',
          config: { cliServers: { flovart: expect.objectContaining({ command: 'node' }) } },
        }),
      ],
    });

    expect(initCliHost({ host: 'vscode', projectDir, dryRun: true })).toMatchObject({
      ok: true,
      writes: [
        expect.objectContaining({
          wrapperKey: 'servers',
          config: { servers: { flovart: expect.objectContaining({ type: 'stdio', command: 'node' }) } },
        }),
      ],
    });
  });

  it('enhances prompts and plans batches deterministically', () => {
    expect(enhancePrompt({ prompt: 'future city', style: 'cinematic' })).toMatchObject({
      ok: true,
      prompt: 'future city',
      style: 'cinematic',
    });

    const plan = planBatchGeneration({ prompt: 'red sports car', count: 3, aspectRatio: '16:9' });
    expect(plan).toMatchObject({ ok: true, count: 3, aspectRatio: '16:9' });
    expect(plan.items).toHaveLength(3);
    expect(plan.items[0]).toEqual(expect.objectContaining({ clientShotId: 'shot-1', prompt: expect.stringContaining('red sports car') }));
  });

  it('searches local inspiration and diagnoses setup without secrets', () => {
    expect(searchInspiration({ query: 'product' })).toMatchObject({
      ok: true,
      items: expect.arrayContaining([expect.objectContaining({ id: 'product-hero-luxury' })]),
    });

    const diagnosis = diagnoseAgentSetup({ projectDir: process.cwd() });
    expect(diagnosis).toMatchObject({
      ok: true,
      checks: expect.arrayContaining([expect.objectContaining({ id: 'cli', ok: true })]),
    });
    expect(JSON.stringify(diagnosis)).not.toMatch(/api[_-]?key|token|secret/i);
  });
});
