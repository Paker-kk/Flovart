import { describe, expect, it } from 'vitest';

import {
  fetchHubSkillPackage,
  fetchHubSkills,
  hubSkillExternalUrl,
  normalizeHubUrl,
  SkillHubError,
} from '../services/skillHubClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('skillHubClient', () => {
  it('normalizes hub URLs and rejects invalid ones', () => {
    expect(normalizeHubUrl('')).toBe('');
    expect(normalizeHubUrl('  https://skills.example.com/  ')).toBe('https://skills.example.com');
    expect(normalizeHubUrl('http://127.0.0.1:8080/hub')).toBe('http://127.0.0.1:8080/hub');
    expect(() => normalizeHubUrl('not a url')).toThrow(SkillHubError);
    expect(() => normalizeHubUrl('file:///tmp/hub')).toThrow(SkillHubError);
  });

  it('builds the external redirect URL for a skill', () => {
    expect(hubSkillExternalUrl('https://skills.example.com', 'community.vox-director'))
      .toBe('https://skills.example.com/skills/community.vox-director');
    expect(hubSkillExternalUrl('https://skills.example.com', 'my skill')).toContain('my%20skill');
  });

  it('parses the hub skill list from either shape', async () => {
    const list = await fetchHubSkills('https://hub.test', async () => jsonResponse({
      ok: true,
      skills: [{ id: 'a.b', name: 'A', version: '1.0.0', description: 'd', tags: ['x'] }, { id: 'skip', version: '' }],
    }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a.b', name: 'A', version: '1.0.0', description: 'd', tags: ['x'] });

    const bare = await fetchHubSkills('https://hub.test', async () => jsonResponse([
      { id: 'b.c', name: 'B', version: '2.0.0', description: '' },
    ]));
    expect(bare).toHaveLength(1);
  });

  it('surfaces hub transport and manifest errors with stable codes', async () => {
    await expect(fetchHubSkills('https://hub.test', async () => { throw new Error('offline'); }))
      .rejects.toMatchObject({ code: 'UNREACHABLE' });
    await expect(fetchHubSkills('https://hub.test', async () => jsonResponse({ nope: true }, 500)))
      .rejects.toMatchObject({ code: 'UNREACHABLE' });
    await expect(fetchHubSkills('https://hub.test', async () => jsonResponse({ ok: true, skills: 'nope' })))
      .rejects.toMatchObject({ code: 'BAD_MANIFEST' });
  });

  it('fetches and validates a skill package', async () => {
    const fetcher = async () => jsonResponse({
      id: 'community.demo',
      version: '1.0.0',
      files: [
        { path: 'SKILL.md', content: '# Demo' },
        { path: 'flovart.skill.yaml', content: 'id: community.demo\nversion: 1.0.0' },
      ],
    });
    const pkg = await fetchHubSkillPackage('https://hub.test', 'community.demo', fetcher);
    expect(pkg.files.map(file => file.path)).toEqual(['SKILL.md', 'flovart.skill.yaml']);

    await expect(fetchHubSkillPackage('https://hub.test', 'community.demo', async () => jsonResponse({
      id: 'community.other',
      version: '1.0.0',
      files: [{ path: 'SKILL.md', content: 'x' }],
    }))).rejects.toMatchObject({ code: 'PACKAGE_REJECTED' });

    await expect(fetchHubSkillPackage('https://hub.test', 'community.demo', async () => jsonResponse({
      id: 'community.demo',
      version: '1.0.0',
      files: [{ path: 'notes.txt', content: 'no skill' }],
    }))).rejects.toMatchObject({ code: 'PACKAGE_REJECTED' });
  });
});
