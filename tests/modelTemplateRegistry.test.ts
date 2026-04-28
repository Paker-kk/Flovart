import { describe, expect, it } from 'vitest';

import {
  findModelTemplateByModel,
  getBuiltinModelTemplates,
  getModelTemplatesByCapability,
} from '../services/modelTemplateRegistry';

describe('modelTemplateRegistry', () => {
  it('builds builtin templates from the existing provider model map', () => {
    const templates = getBuiltinModelTemplates();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'google',
          capability: 'video',
          model: 'veo-3.1-generate-preview',
        }),
        expect.objectContaining({
          provider: 'openai',
          capability: 'image',
          model: 'gpt-image-1',
        }),
      ]),
    );
  });

  it('preserves image editing semantics on image templates', () => {
    const template = findModelTemplateByModel('gpt-image-1', 'image');

    expect(template).toMatchObject({
      provider: 'openai',
      capability: 'image',
      supportsReferenceImage: true,
      supportsMaskEdit: true,
      defaultParams: expect.objectContaining({ aspectRatio: '16:9' }),
    });
  });

  it('supports provider-prefixed lookups and capability filtering', () => {
    const template = findModelTemplateByModel('openrouter/openai/gpt-image-1', 'image');
    const videoTemplates = getModelTemplatesByCapability('video', 'google');

    expect(template?.model).toBe('gpt-image-1');
    expect(videoTemplates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'google',
          capability: 'video',
          model: 'veo-3.1-generate-preview',
        }),
      ]),
    );
  });
});
