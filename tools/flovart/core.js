export const COMMANDS = [
  'help',
  'setup',
  'status',
  'provider.status',
  'provider.begin-setup',
  'provider.select-model',
  'provider.test',
  'canvas.list-media',
  'canvas.add-image',
  'canvas.add-video',
  'canvas.clear-media',
  'asset.list',
  'generate.image',
  'generate.images-batch',
  'generate.video',
  'video.status',
  'export.project',
];

export const QUICK_COMMANDS = [
  'status',
  'provider.status',
  'canvas.list-media',
  'asset.list',
  'setup',
];

export const HELP_TEXT = [
  'Flovart Agent Bridge exposes deterministic tools for external agents.',
  'Claude Code/Codex/OpenCode should do planning and call these commands with explicit arguments.',
  '',
  'Commands:',
  'help                                            Show this help',
  'setup                                           Show MCP/CLI setup steps',
  'status                                          Inspect runtime status',
  'provider.status                                 Inspect provider/model configuration',
  'provider.begin-setup --provider <id> --purpose image|video|both',
  'provider.select-model --image-model <id> --video-model <id>',
  'provider.test                                   Check configured provider readiness',
  'canvas.list-media                               List image/video elements only',
  'canvas.add-image --href <data-or-url> --mime-type image/png [--name <name>]',
  'canvas.add-video --href <blob-or-url> --mime-type video/mp4 [--name <name>]',
  'canvas.clear-media                              Remove image/video elements only',
  'asset.list                                      List local generated media assets',
  'generate.image --prompt <prompt>                Generate one image',
  'generate.images-batch --file shots.json         Trigger multiple image generations',
  'generate.video --prompt <prompt> [--source-image-ids id1,id2]',
  'video.status --job-id <id>                      Query video job status',
  'export.project                                  Export project metadata when supported',
  '',
  'This CLI does not understand natural language. The external agent is the planner.',
].join('\n');

export const SETUP_TEXT = [
  'Flovart Agent Bridge setup:',
  '1. npm run dev',
  '2. Start Chrome with --remote-debugging-port=9222',
  '3. Open Flovart in that Chrome window',
  '4. npm run flovart:cli -- status --json',
  '5. npm run flovart:mcp',
  '',
  'API keys must be entered in the Flovart browser UI only. Do not paste secrets into Claude Code transcripts.',
].join('\n');

export function formatValue(value) {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > 2200 ? `${json.slice(0, 2200)}\n...truncated` : json;
  } catch {
    return String(value);
  }
}

export function createLine(kind, content, meta) {
  return { kind, content, meta };
}

export function createFlovartSession(initial = {}) {
  return {
    id: initial.id || `flovart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    lastTool: initial.lastTool || '',
    isDark: !!initial.isDark,
  };
}

export function parseCliArgs(argv = []) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    if (eq >= 0) {
      result[raw.slice(0, eq)] = raw.slice(eq + 1);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[raw] = true;
      continue;
    }

    result[raw] = next;
    index += 1;
  }
  return result;
}

export function normalizeCommandName(name = '') {
  return String(name).trim().replace(/-/g, '.');
}

function parseJsonOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

function mediaElementFromArgs(args, type) {
  const width = args.width ? Number(args.width) : undefined;
  const height = args.height ? Number(args.height) : undefined;
  return {
    type,
    href: required(args.href, 'href'),
    mimeType: args['mime-type'] || args.mimeType || (type === 'image' ? 'image/png' : 'video/mp4'),
    name: args.name || (type === 'image' ? 'Agent Image' : 'Agent Video'),
    x: args.x ? Number(args.x) : undefined,
    y: args.y ? Number(args.y) : undefined,
    width,
    height,
  };
}

export async function executeFlovartCommand(commandName, args = {}, runtime = {}) {
  const command = normalizeCommandName(commandName);

  switch (command) {
    case 'help':
      return { ok: true, text: HELP_TEXT, commands: COMMANDS };
    case 'setup':
      return { ok: true, text: SETUP_TEXT };
    case 'status':
      return await runtime.status?.() || {
        ok: true,
        runtime: runtime._version || 'unknown',
        mediaElements: await runtime.canvas?.listMedia?.(),
        providers: await runtime.provider?.status?.(),
      };
    case 'provider.status':
      return await runtime.provider?.status?.() || { ok: false, error: 'provider.status unavailable' };
    case 'provider.begin.setup':
    case 'provider.begin-setup':
      return await runtime.provider?.beginSetup?.({
        provider: args.provider || 'custom',
        purpose: args.purpose || 'both',
      });
    case 'provider.select.model':
    case 'provider.select-model':
      return await runtime.provider?.selectModel?.({
        imageModel: args['image-model'] || args.imageModel,
        videoModel: args['video-model'] || args.videoModel,
        textModel: args['text-model'] || args.textModel,
      });
    case 'provider.test':
      return await runtime.provider?.test?.({ purpose: args.purpose || 'both' });
    case 'canvas.list.media':
    case 'canvas.list-media':
      return await runtime.canvas?.listMedia?.();
    case 'canvas.add.image':
    case 'canvas.add-image':
      return await runtime.canvas?.addImage?.(mediaElementFromArgs(args, 'image'));
    case 'canvas.add.video':
    case 'canvas.add-video':
      return await runtime.canvas?.addVideo?.(mediaElementFromArgs(args, 'video'));
    case 'canvas.clear.media':
    case 'canvas.clear-media':
      return await runtime.canvas?.clearMedia?.();
    case 'asset.list':
      return await runtime.assets?.list?.();
    case 'generate.image':
      return await runtime.generate?.image?.({
        prompt: required(args.prompt, 'prompt'),
        aspectRatio: args['aspect-ratio'] || args.aspectRatio,
        placeOnCanvas: args['place-on-canvas'] !== 'false',
      });
    case 'generate.images.batch':
    case 'generate.images-batch': {
      const items = args.items || parseJsonOption(args.itemsJson, null);
      return await runtime.generate?.imagesBatch?.({
        items: required(items, 'items'),
        placeOnCanvas: args['place-on-canvas'] !== 'false',
        layout: args.layout || 'grid',
      });
    }
    case 'generate.video':
      return await runtime.generate?.video?.({
        prompt: required(args.prompt, 'prompt'),
        sourceImageIds: typeof args['source-image-ids'] === 'string' ? args['source-image-ids'].split(',').filter(Boolean) : [],
        durationSec: args.duration ? Number(args.duration) : undefined,
        aspectRatio: args['aspect-ratio'] || args.aspectRatio,
      });
    case 'video.status':
      return await runtime.generate?.videoStatus?.({ jobId: required(args['job-id'] || args.jobId, 'job-id') });
    case 'export.project':
      return await runtime.export?.project?.({ format: args.format || 'json' });
    default:
      throw new Error(`Unknown Flovart command: ${commandName}`);
  }
}

export function planFlovartInput(rawInput, session = createFlovartSession()) {
  const parts = String(rawInput || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const command = parts[0];
  const args = parseCliArgs(parts.slice(1));
  session.lastTool = command;
  return {
    title: command,
    steps: [`Run deterministic Flovart tool: ${command}`],
    run: async ({ runtime }) => executeFlovartCommand(command, args, runtime),
  };
}
