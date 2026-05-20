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

// ─── Node DAG Tools ─────────────────────────

server.registerTool(
  'flovart_node_create',
  {
    description: 'Create an execution node on the Flovart canvas with an independent Prompt. CRITICAL: If you want this node to reference or modify the result of an existing node, you MUST use @node_id syntax in textPrompt (e.g. "@node_1 apply cyberpunk filter").',
    inputSchema: z.object({
      id: z.string().describe('Must be a globally unique node identifier. Suggested format: node_img_01 or node_vid_01.'),
      type: z.enum(['imageGen', 'videoGen', 'textPrompt', 'inpaint']).describe('Node engine type. imageGen (generate image), videoGen (generate/image-to-video), textPrompt (text-only script node), inpaint (localized inpainting). Do NOT invent types beyond this enum.'),
      textPrompt: z.string().describe('Core generation instruction. REQUIRED: If there are dependencies on other nodes, you MUST include @targetNodeId in the prompt.'),
      parameters: z.object({
        aspectRatio: z.enum(['16:9', '9:16', '1:1', '21:9']).optional(),
      }).optional().describe('Optional. Generation physical parameters.'),
    }),
  },
  async (args) => textResult(await withRuntime('node.create', args)),
);

server.registerTool(
  'flovart_job_start',
  {
    description: 'Submit the current canvas node DAG and trigger the parallel execution engine. This tool is asynchronous and will immediately return a job_id. It will NOT return the final result directly.',
    inputSchema: z.object({
      targetNodeId: z.string().describe('The leaf node ID whose final result you want to obtain. The engine will automatically compute and execute all upstream nodes it depends on.'),
    }),
  },
  async (args) => textResult(await withRuntime('job.start', args)),
);

server.registerTool(
  'flovart_job_status',
  {
    description: 'Poll the progress of a job created by flovart_job_start. IMPORTANT: If status is "running" or "queued", you MUST wait a few seconds and call this tool again, until status becomes "success" or "error".',
    inputSchema: z.object({
      job_id: z.string().describe('The job ticket ID returned by the engine.'),
    }),
  },
  async (args) => textResult(await withRuntime('job.status', args)),
);

server.registerTool(
  'flovart_node_update',
  {
    description: 'Update a node\'s prompt text. Used by the self-healing loop to fix prompts that trigger content violations, then retry execution.',
    inputSchema: z.object({
      id: z.string().describe('The node ID to update'),
      textPrompt: z.string().optional().describe('New prompt text for the node'),
      parameters: z.object({
        aspectRatio: z.enum(['16:9', '9:16', '1:1', '21:9']).optional(),
      }).optional(),
    }),
  },
  async (args) => textResult(await withRuntime('node.update', args)),
);

// ─── ADR-003 New Tools: Upscale, Gacha, Promote, Row Retry ───

server.registerTool(
  'flovart_node_upscale',
  {
    description: 'Trigger 4x-UltraSharp upscale on a node\'s output result. Only applicable to GENERATE_IMAGE nodes.',
    inputSchema: z.object({
      nodeId: z.string().describe('The node ID whose output should be upscaled'),
    }),
  },
  async (args) => textResult(await withRuntime('node.upscale', args)),
);

server.registerTool(
  'flovart_node_gacha',
  {
    description: 'Trigger batch generation for a node, producing multiple candidate results stored in the node\'s candidates array. Count limited to 1-8.',
    inputSchema: z.object({
      nodeId: z.string().describe('The node ID to run batch gacha on'),
      count: z.number().min(1).max(8).describe('Number of candidates to generate (1-8)'),
    }),
  },
  async (args) => textResult(await withRuntime('node.gacha', args)),
);

server.registerTool(
  'flovart_node_promote_candidate',
  {
    description: 'Promote a specific candidate (by index) from a node\'s gacha results into an independent SpatialNode on the canvas. Does NOT duplicate the DAG — the new node is linked via a SpatialEdge.',
    inputSchema: z.object({
      nodeId: z.string().describe('The source node ID containing the candidates array'),
      candidateIndex: z.number().min(0).describe('Zero-based index into the candidates array'),
    }),
  },
  async (args) => textResult(await withRuntime('node.promote-candidate', args)),
);

server.registerTool(
  'flovart_row_retry',
  {
    description: 'Surgically retry a single failed row in a STORYBOARD_TABLE node. Clears the row state and re-submits only that row to the generation pool. Other rows are unaffected.',
    inputSchema: z.object({
      nodeId: z.string().describe('The STORYBOARD_TABLE node ID'),
      rowId: z.string().describe('The specific row ID to retry'),
    }),
  },
  async (args) => textResult(await withRuntime('row.retry', args)),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
