export const canvasDefs = {
  'canvas.list-media': {
    name: 'canvas.list-media',
    description: 'List images and videos on the Flovart canvas',
    category: 'Canvas',
    args: [],
    columns: ['id', 'type', 'name', 'width', 'height'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.canvas?.listMedia?.() || [];
    },
  },
  'canvas.add-image': {
    name: 'canvas.add-image',
    description: 'Add an image element to the canvas',
    category: 'Canvas',
    args: [
      { name: 'href', type: 'str', required: true, help: 'Data URL or image URL' },
      { name: 'mime-type', type: 'str', default: 'image/png', help: 'MIME type' },
      { name: 'name', type: 'str', default: 'Agent Image', help: 'Element name' },
      { name: 'x', type: 'int', help: 'X position' },
      { name: 'y', type: 'int', help: 'Y position' },
      { name: 'width', type: 'int', help: 'Width in px' },
      { name: 'height', type: 'int', help: 'Height in px' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.canvas?.addImage?.({
        type: 'image',
        href: args.href,
        mimeType: args['mime-type'] || args.mimeType || 'image/png',
        name: args.name || 'Agent Image',
        x: args.x ? Number(args.x) : undefined,
        y: args.y ? Number(args.y) : undefined,
        width: args.width ? Number(args.width) : undefined,
        height: args.height ? Number(args.height) : undefined,
      });
    },
  },
  'canvas.add-video': {
    name: 'canvas.add-video',
    description: 'Add a video element to the canvas',
    category: 'Canvas',
    args: [
      { name: 'href', type: 'str', required: true, help: 'Blob URL or video URL' },
      { name: 'mime-type', type: 'str', default: 'video/mp4', help: 'MIME type' },
      { name: 'name', type: 'str', default: 'Agent Video', help: 'Element name' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.canvas?.addVideo?.({
        type: 'video',
        href: args.href,
        mimeType: args['mime-type'] || args.mimeType || 'video/mp4',
        name: args.name || 'Agent Video',
      });
    },
  },
  'canvas.clear-media': {
    name: 'canvas.clear-media',
    description: 'Remove all image/video elements from canvas',
    category: 'Canvas',
    args: [],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.canvas?.clearMedia?.() || { ok: true };
    },
  },
};
