import { afterEach, describe, expect, it } from 'vitest';
import { createFakeProviderServer } from '../scripts/fake-provider-server.mjs';

const listen = server => new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve(`http://127.0.0.1:${address.port}`);
  });
});

const close = server => new Promise(resolve => server.close(resolve));

describe('local fake OpenAI-compatible provider', () => {
  const servers = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  it('serves model discovery, image/edit requests, async video, and redacted records over HTTP', async () => {
    const server = createFakeProviderServer();
    servers.push(server);
    const origin = await listen(server);
    const headers = { Authorization: 'Bearer fake-secret', 'Content-Type': 'application/json' };

    const models = await fetch(`${origin}/v1/models`, { headers });
    expect(models.ok).toBe(true);
    expect((await models.json()).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gpt-image-2' }),
      expect.objectContaining({ id: 'grok-imagine-video' }),
    ]));

    const image = await fetch(`${origin}/v1/images/generations`, {
      method: 'POST', headers, body: JSON.stringify({ model: 'gpt-image-2', prompt: '一只猫' }),
    });
    expect((await image.json()).data[0].url).toMatch(/\/fixtures\/image\.png$/);

    const edit = await fetch(`${origin}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: headers.Authorization, 'Content-Type': 'multipart/form-data; boundary=test' },
      body: '--test\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\n\r\nbytes\r\n--test--\r\n',
    });
    expect((await edit.json()).data[0].url).toMatch(/\/fixtures\/image\.png$/);

    const created = await fetch(`${origin}/v2/videos/generations`, {
      method: 'POST', headers, body: JSON.stringify({ model: 'grok-imagine-video', prompt: '猫在雨中', images: ['data:image/png;base64,redacted'] }),
    });
    const createdJson = await created.json();
    expect(createdJson.id).toMatch(/^fake-video-/);
    const completed = await fetch(`${origin}/v2/videos/generations/${createdJson.id}`, { headers });
    expect((await completed.json()).status).toBe('succeeded');
    const content = await fetch(`${origin}/v1/videos/${createdJson.id}/content`);
    expect(content.headers.get('content-type')).toMatch(/video\/mp4/);
    expect((await content.arrayBuffer()).byteLength).toBeGreaterThan(32);

    const state = server.getState();
    expect(state.requests.some(request => request.path === '/v1/images/edits' && request.referenceCount === 1)).toBe(true);
    expect(JSON.stringify(state)).not.toContain('fake-secret');
    expect(JSON.stringify(state)).not.toContain('data:image');
    expect(state.requests[0].headers.authorization).toBe('[redacted]');
  });
});
