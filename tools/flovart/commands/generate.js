export const generateDefs = {
  'generate.image': {
    name: 'generate.image',
    description: 'Generate one image from a text prompt',
    category: 'Generation',
    args: [
      { name: 'prompt', type: 'str', required: true, positional: true, help: 'Image description' },
      { name: 'aspect-ratio', type: 'str', help: 'Aspect ratio (e.g. 16:9, 1:1)' },
      { name: 'place-on-canvas', type: 'bool', default: true, help: 'Place on canvas after generation' },
    ],
    columns: ['id', 'url', 'width', 'height', 'seed'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.generate?.image?.({
        prompt: args.prompt,
        aspectRatio: args['aspect-ratio'] || args.aspectRatio,
        placeOnCanvas: args['place-on-canvas'] !== 'false',
      });
    },
  },
  'generate.images-batch': {
    name: 'generate.images-batch',
    description: 'Generate multiple images from a JSON file or inline items',
    category: 'Generation',
    args: [
      { name: 'file', type: 'str', help: 'JSON file with items array' },
      { name: 'layout', type: 'str', default: 'grid', help: 'Canvas layout' },
    ],
    columns: ['clientShotId', 'status', 'id'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.generate?.imagesBatch?.({
        items: args.items || [],
        placeOnCanvas: args['place-on-canvas'] !== 'false',
        layout: args.layout || 'grid',
      });
    },
  },
  'generate.video': {
    name: 'generate.video',
    description: 'Generate a video from a text prompt',
    category: 'Generation',
    args: [
      { name: 'prompt', type: 'str', required: true, help: 'Video description' },
      { name: 'source-image-ids', type: 'str', help: 'Comma-separated image IDs' },
      { name: 'duration', type: 'int', help: 'Duration in seconds' },
      { name: 'aspect-ratio', type: 'str', help: 'Aspect ratio' },
    ],
    columns: ['jobId', 'status', 'url'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.generate?.video?.({
        prompt: args.prompt,
        sourceImageIds: typeof args['source-image-ids'] === 'string'
          ? args['source-image-ids'].split(',').filter(Boolean) : [],
        durationSec: args.duration ? Number(args.duration) : undefined,
        aspectRatio: args['aspect-ratio'] || args.aspectRatio,
      });
    },
  },
};
