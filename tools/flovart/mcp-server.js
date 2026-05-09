#!/usr/bin/env node
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { executeFlovartCommand } from './core.js';
import { FlovartRuntimeClient, createRuntimeFacade } from './runtime-client.js';

const server = new McpServer({ name: 'flovart', version: '0.2.0' });

async function withRuntime(command, args = {}) {
  const client = new FlovartRuntimeClient();
  try {
    await client.connect();
    const runtime = createRuntimeFacade(client);
    const result = await executeFlovartCommand(command, args, runtime);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.disconnect();
  }
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

server.registerTool(
  'flovart.status',
  {
    description: 'Inspect the running Flovart runtime. Use this before any media generation task.',
    inputSchema: z.object({}),
  },
  async () => textResult(await withRuntime('status')),
);

server.registerTool(
  'flovart.provider_status',
  {
    description: 'Inspect configured Flovart providers and selected image/video models. Does not expose API keys.',
    inputSchema: z.object({}),
  },
  async () => textResult(await withRuntime('provider.status')),
);

server.registerTool(
  'flovart.provider_begin_setup',
  {
    description: 'Open Flovart browser settings so the user can enter API keys safely in the UI.',
    inputSchema: z.object({
      provider: z.string().optional(),
      purpose: z.enum(['image', 'video', 'both']).optional(),
    }),
  },
  async (args) => textResult(await withRuntime('provider.begin-setup', args)),
);

server.registerTool(
  'flovart.provider_select_model',
  {
    description: 'Select image/video/text model IDs already configured in Flovart.',
    inputSchema: z.object({
      imageModel: z.string().optional(),
      videoModel: z.string().optional(),
      textModel: z.string().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('provider.select-model', args)),
);

server.registerTool(
  'flovart.provider_test',
  {
    description: 'Check whether Flovart has configured models for image/video generation.',
    inputSchema: z.object({ purpose: z.enum(['image', 'video', 'both']).optional() }),
  },
  async (args) => textResult(await withRuntime('provider.test', args)),
);

server.registerTool(
  'flovart.canvas_list_media',
  {
    description: 'List only image and video elements on the Flovart canvas.',
    inputSchema: z.object({}),
  },
  async () => textResult(await withRuntime('canvas.list-media')),
);

server.registerTool(
  'flovart.canvas_add_image',
  {
    description: 'Add an image element to the media-only Flovart canvas. Do not use this for text.',
    inputSchema: z.object({
      href: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('canvas.add-image', args)),
);

server.registerTool(
  'flovart.canvas_add_video',
  {
    description: 'Add a video element to the media-only Flovart canvas. Do not use this for text.',
    inputSchema: z.object({
      href: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('canvas.add-video', args)),
);

server.registerTool(
  'flovart.generate_image',
  {
    description: 'Generate one image from an explicit prompt. Claude Code should write the prompt; Flovart only executes it.',
    inputSchema: z.object({
      prompt: z.string(),
      aspectRatio: z.string().optional(),
      placeOnCanvas: z.boolean().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('generate.image', args)),
);

server.registerTool(
  'flovart.generate_images_batch',
  {
    description: 'Generate storyboard images from explicit per-shot prompts produced by Claude Code.',
    inputSchema: z.object({
      items: z.array(z.object({
        clientShotId: z.string().optional(),
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        aspectRatio: z.string().optional(),
      })),
      placeOnCanvas: z.boolean().optional(),
      layout: z.string().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('generate.images-batch', args)),
);

server.registerTool(
  'flovart.generate_video',
  {
    description: 'Generate a video from explicit prompt and optional source image canvas element IDs. No video editing timeline is exposed.',
    inputSchema: z.object({
      prompt: z.string(),
      sourceImageIds: z.array(z.string()).optional(),
      durationSec: z.number().optional(),
      aspectRatio: z.string().optional(),
    }),
  },
  async (args) => textResult(await withRuntime('generate.video', args)),
);

server.registerTool(
  'flovart.video_status',
  {
    description: 'Query a Flovart video generation job status.',
    inputSchema: z.object({ jobId: z.string() }),
  },
  async (args) => textResult(await withRuntime('video.status', args)),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
