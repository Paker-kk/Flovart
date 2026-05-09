#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createFlovartSession, planFlovartInput, formatValue } from './core.js';

const server = new McpServer({ name: 'flovart', version: '0.1.0' });
const session = createFlovartSession();

async function connectRuntime() {
  const client = new (await import('./runtime-client.js')).FlovartRuntimeClient();
  await client.connect();
  return client;
}

async function run(input, isDark = false) {
  const plan = planFlovartInput(input, session);
  if (!plan) return { ok: false, error: 'empty input' };

  const transcript = [];
  const emit = (kind, content, meta) => transcript.push({ kind, content, meta });
  const ctx = { sessionId: session.id, isDark };
  emit('output', `Plan:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`);
  const client = await connectRuntime();
  try {
    const runtime = {
      _version: 'external-cdp',
      canvas: {
        getElements: () => client.execute('canvas.getElements'),
        addElement: partial => client.execute('canvas.addElement', partial),
        clear: () => client.execute('canvas.clear'),
      },
      session: {
        create: name => client.execute('session.create', name),
      },
      command: {
        list: sessionId => client.execute('command.list', sessionId),
      },
      generate: {
        image: (prompt, source) => client.execute('generate.image', prompt, source),
      },
      config: {
        getProviders: () => client.execute('config.getProviders'),
      },
    };
    const result = await plan.run({ runtime, emit, ctx });
    emit('output', formatValue(result));
    return { ok: true, sessionId: session.id, transcript, result };
  } finally {
    await client.disconnect();
  }
}

server.registerTool(
  'flovart.run',
  {
    description: 'Run a Flovart natural language or command task against the current runtime.',
    inputSchema: z.object({
      input: z.string(),
      isDark: z.boolean().optional(),
    }),
  },
  async ({ input, isDark }) => ({
    content: [{ type: 'text', text: JSON.stringify(await run(input, isDark), null, 2) }],
  }),
);

server.registerTool(
  'flovart.status',
  {
    description: 'Inspect Flovart runtime status and current session context.',
    inputSchema: z.object({}),
  },
  async () => {
    const runtime = getRuntime() || {};
    const elements = runtime.canvas?.getElements?.() || [];
    const jobs = runtime.command?.list?.() || [];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: true,
          runtime: runtime._version || 'unknown',
          sessionId: session.id,
          elements: elements.length,
          jobs: jobs.length,
          providers: runtime.config?.getProviders?.() || [],
          lastMode: session.lastMode,
          lastTool: session.lastTool,
          lastImagePrompt: session.lastImagePrompt,
        }, null, 2),
      }],
    };
  },
);

server.registerTool(
  'flovart.canvas_list',
  {
    description: 'List current canvas elements from the running Flovart runtime.',
    inputSchema: z.object({}),
  },
  async () => {
    const runtime = getRuntime() || {};
    const elements = runtime.canvas?.getElements?.() || [];
    return { content: [{ type: 'text', text: JSON.stringify(elements, null, 2) }] };
  },
);

server.registerTool(
  'flovart.canvas_add_text',
  {
    description: 'Add a text element to the current Flovart canvas.',
    inputSchema: z.object({
      text: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
    }),
  },
  async ({ text, x, y }) => {
    const runtime = getRuntime() || {};
    const id = runtime.canvas?.addElement?.({
      type: 'text',
      text,
      x: x ?? 120,
      y: y ?? 120,
      width: 300,
      height: 100,
      fontSize: 28,
      fontColor: '#111827',
    });
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id, text }, null, 2) }] };
  },
);

server.registerTool(
  'flovart.generate_image',
  {
    description: 'Generate an image through Flovart runtime.',
    inputSchema: z.object({
      prompt: z.string(),
    }),
  },
  async ({ prompt }) => {
    const runtime = getRuntime() || {};
    const result = await runtime.generate?.image?.(prompt, 'agent');
    return { content: [{ type: 'text', text: JSON.stringify(result || { ok: true, prompt }, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
