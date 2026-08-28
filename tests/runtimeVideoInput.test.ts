import { describe, expect, it, vi } from 'vitest';

const runtimeGeneration = vi.hoisted(() => ({
  runRuntimeMediaGeneration: vi.fn().mockResolvedValue({
    blob: new Blob(['video'], { type: 'video/mp4' }),
    mimeType: 'video/mp4',
    taskId: 'runtime-task-1',
  }),
}));

vi.mock('../services/runtimeGeneration', () => runtimeGeneration);

import { generateVideoWithProvider, UnsupportedGenerationInputError } from '../services/aiGateway';

const runtimeKey = (defaultModel: string) => ({
  id: 'runtime-key',
  provider: 'runningHub' as const,
  capabilities: ['video' as const],
  key: 'runtime:credential-1',
  defaultModel,
  runtimeManaged: { credentialId: 'credential-1' },
  createdAt: 0,
  updatedAt: 0,
});

describe('runtime video input adapter', () => {
  it('maps canonical artifact references to Runtime sourceImageIds', async () => {
    runtimeGeneration.runRuntimeMediaGeneration.mockClear();

    await generateVideoWithProvider('让角色运动', 'rhart-video-g/image-to-video', runtimeKey('flovart:grok-imagine-video-1.5'), {
      generationSubmode: 'image-to-video',
      references: [{
        href: 'artifact://artifact-task-1',
        mimeType: 'image/png',
        artifactRef: { taskId: 'artifact-task-1', kind: 'image', mimeType: 'image/png' },
        slotRole: 'first_frame',
      }],
    });

    expect(runtimeGeneration.runRuntimeMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      command: 'generate.video',
      args: expect.objectContaining({ sourceImageIds: ['artifact-task-1'] }),
    }));
  });

  it('rejects unsupported Runtime reference modes instead of dropping the image', async () => {
    runtimeGeneration.runRuntimeMediaGeneration.mockClear();

    await expect(generateVideoWithProvider('让角色运动', 'veo-route', runtimeKey('flovart:veo-3.1-lite'), {
      generationSubmode: 'image-to-video',
      references: [{
        href: 'artifact://artifact-task-1',
        mimeType: 'image/png',
        artifactRef: { taskId: 'artifact-task-1', kind: 'image', mimeType: 'image/png' },
        slotRole: 'first_frame',
      }],
    })).rejects.toBeInstanceOf(UnsupportedGenerationInputError);
    expect(runtimeGeneration.runRuntimeMediaGeneration).not.toHaveBeenCalled();
  });
});
