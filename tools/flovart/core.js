export const QUICK_COMMANDS = [
  'status',
  'canvas.list',
  'canvas.add-text FlovartCli ready',
  'canvas.add-shape',
  'generate.image cinematic AI canvas control room',
  'jobs.list',
];

export const HELP_TEXT = [
  'Available commands:',
  'Natural language is supported. Example: 帮我画一个猫咪吃汉堡的',
  'help                         Show this help',
  'status                       Inspect runtime state',
  'session.create [name]         Create a runtime session',
  'canvas.list                  List current canvas elements',
  'canvas.add-text <text>        Add a text element to canvas',
  'canvas.add-shape              Add a rectangle test element',
  'canvas.clear                  Clear canvas elements',
  'generate.image <prompt>       Trigger image generation',
  'jobs.list                     List runtime jobs',
  'setup                         Show external CLI setup commands',
].join('\n');

export const SETUP_TEXT = [
  'External CLI setup:',
  '1. npm run dev',
  '2. chrome --remote-debugging-port=9222',
  '3. node tools/flovart/cli.js canvas.list',
  '4. node tools/flovart/cli.js "帮我画一个猫咪吃汉堡的"',
].join('\n');

const IMAGE_INTENT = /(^|\s)(draw|paint|generate|create|make|render)\b/i;
const CLEAR_INTENT = /清空|清除画布|clear canvas|reset canvas/i;
const LIST_INTENT = /看看画布|列出|有哪些元素|list canvas|show canvas/i;
const TEXT_INTENT = /添加文字|加文字|写上|add text/i;

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
  return {
    kind,
    content,
    meta,
  };
}

export function createFlovartSession(initial = {}) {
  return {
    id: initial.id || `flovart-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    messages: Array.isArray(initial.messages) ? [...initial.messages] : [],
    lastImagePrompt: initial.lastImagePrompt || '',
    lastTool: initial.lastTool || '',
    lastMode: initial.lastMode || 'idle',
    lastUserInput: initial.lastUserInput || '',
    isDark: !!initial.isDark,
  };
}

function remember(session, role, content, meta) {
  session.messages.push({ role, content, meta, timestamp: Date.now() });
}

function stripLeadingIntent(input) {
  return input
    .replace(/^(请|麻烦|帮我|给我|你来|please)\s*/i, '')
    .replace(/^(画|生成|做一张|来一张|创作|绘制|设计|draw|paint|generate|create|make|render)\s*/i, '')
    .trim();
}

function defaultTextPlacement(text, isDark) {
  return {
    type: 'text',
    text,
    x: 120,
    y: 120,
    width: 300,
    height: 100,
    fontSize: 28,
    fontColor: isDark ? '#F3F4F6' : '#111827',
  };
}

function defaultShapePlacement() {
  return {
    type: 'shape',
    x: 160,
    y: 160,
    width: 220,
    height: 140,
    shapeType: 'rectangle',
    fillColor: '#2563EB',
    strokeColor: '#93C5FD',
    strokeWidth: 2,
    borderRadius: 20,
  };
}

function withToolPlan(title, steps, run) {
  return {
    title,
    steps,
    run,
  };
}

function looksLikeRefinement(input) {
  return /更|再来|重新|换成|改成|调整|背景|颜色|风格|大小|更大|更小|更可爱|更酷|更明亮|更暗/.test(input);
}

export function planFlovartInput(rawInput, session = createFlovartSession()) {
  const input = String(rawInput || '').trim();
  if (!input) return null;
  session.lastUserInput = input;
  remember(session, 'user', input);

  const explicit = input.toLowerCase();

  if (explicit === 'help' || explicit === '/help') {
    return withToolPlan('Help', ['Show available commands.'], async ({ emit }) => {
      session.lastMode = 'help';
      session.lastTool = 'help';
      emit('output', HELP_TEXT);
      return { ok: true };
    });
  }

  if (explicit === 'setup') {
    return withToolPlan('Setup', ['Show external CLI setup commands.'], async ({ emit }) => {
      session.lastMode = 'setup';
      session.lastTool = 'setup';
      emit('output', SETUP_TEXT);
      return { ok: true };
    });
  }

  if (explicit === 'status') {
    return withToolPlan('Status', ['Inspect runtime state.', 'Collect canvas, job, and provider info.'], async ({ runtime, emit, ctx }) => {
      const elements = runtime.canvas?.getElements?.() || [];
      const jobs = runtime.command?.list?.() || [];
      const snapshot = {
        runtime: runtime._version || 'unknown',
        sessionId: ctx?.sessionId || null,
        elements: elements.length,
        jobs: jobs.length,
        providers: runtime.config?.getProviders?.() || [],
      };
      session.lastMode = 'status';
      session.lastTool = 'status';
      emit('output', formatValue(snapshot));
      return snapshot;
    });
  }

  if (/^session\.create(?:\s+(.+))?$/i.test(input)) {
    const name = input.replace(/^session\.create\s*/i, '').trim() || 'flovart-cli';
    return withToolPlan('Create session', ['Create a runtime session.'], async ({ runtime, emit, ctx }) => {
      const created = runtime.session?.create?.(name);
      const nextSessionId = created?.sessionId || created?.id || session.id;
      session.id = nextSessionId;
      if (ctx) ctx.sessionId = nextSessionId;
      session.lastMode = 'session.create';
      session.lastTool = 'session.create';
      emit('tool', formatValue(created), 'session.create');
      return created;
    });
  }

  if (explicit === 'canvas.list') {
    return withToolPlan('List canvas', ['Inspect current canvas elements.'], async ({ runtime, emit }) => {
      const elements = runtime.canvas?.getElements?.() || [];
      session.lastMode = 'canvas.list';
      session.lastTool = 'canvas.getElements';
      emit('tool', formatValue(elements), 'canvas.getElements');
      return elements;
    });
  }

  if (/^canvas\.add-text\s+/i.test(input)) {
    const text = input.replace(/^canvas\.add-text\s*/i, '').trim() || 'FlovartCli ready';
    return withToolPlan('Add text', [`Add text element: ${text}`], async ({ runtime, emit, ctx }) => {
      const el = runtime.canvas?.addElement?.(defaultTextPlacement(text, !!ctx?.isDark));
      session.lastMode = 'canvas.add-text';
      session.lastTool = 'canvas.addElement';
      emit('tool', formatValue({ id: el, text }), 'canvas.addElement');
      return { id: el, text };
    });
  }

  if (explicit === 'canvas.add-shape') {
    return withToolPlan('Add shape', ['Add a rectangle test element to the canvas.'], async ({ runtime, emit }) => {
      const id = runtime.canvas?.addElement?.(defaultShapePlacement());
      session.lastMode = 'canvas.add-shape';
      session.lastTool = 'canvas.addElement';
      emit('tool', formatValue({ id }), 'canvas.addElement');
      return { id };
    });
  }

  if (explicit === 'canvas.clear') {
    return withToolPlan('Clear canvas', ['Clear all canvas elements.'], async ({ runtime, emit }) => {
      runtime.canvas?.clear?.();
      session.lastMode = 'canvas.clear';
      session.lastTool = 'canvas.clear';
      emit('tool', formatValue({ ok: true }), 'canvas.clear');
      return { ok: true };
    });
  }

  if (/^generate\.image\s+/i.test(input)) {
    const prompt = input.replace(/^generate\.image\s*/i, '').trim();
    return withToolPlan('Generate image', [`Use prompt: ${prompt}`, 'Call generate.image and place result on canvas.'], async ({ runtime, emit }) => {
      const result = await runtime.generate?.image?.(prompt, 'agent');
      session.lastMode = 'generate.image';
      session.lastTool = 'generate.image';
      session.lastImagePrompt = prompt;
      emit('tool', formatValue(result || { ok: true, prompt }), 'generate.image');
      return result || { ok: true, prompt };
    });
  }

  if (explicit === 'jobs.list') {
    return withToolPlan('List jobs', ['List runtime jobs.'], async ({ runtime, emit }) => {
      const jobs = runtime.command?.list?.() || [];
      session.lastMode = 'jobs.list';
      session.lastTool = 'command.list';
      emit('tool', formatValue(jobs), 'command.list');
      return jobs;
    });
  }

  if (session.lastImagePrompt && looksLikeRefinement(input)) {
    const prompt = `${session.lastImagePrompt}, ${input}`;
    return withToolPlan('Refine image', [
      'Use the previous image prompt as context.',
      `Previous prompt: ${session.lastImagePrompt}`,
      `Refinement: ${input}`,
      `Merged prompt: ${prompt}`,
      'Call generate.image and place result on canvas.',
    ], async ({ runtime, emit }) => {
      const result = await runtime.generate?.image?.(prompt, 'agent');
      session.lastMode = 'generate.image';
      session.lastTool = 'generate.image';
      session.lastImagePrompt = prompt;
      emit('tool', formatValue(result || { ok: true, prompt }), 'generate.image');
      return result || { ok: true, prompt };
    });
  }

  if (CLEAR_INTENT.test(input)) {
    return withToolPlan('Clear canvas', ['Interpret request as canvas cleanup.', 'Call canvas.clear.'], async ({ runtime, emit }) => {
      runtime.canvas?.clear?.();
      session.lastMode = 'canvas.clear';
      session.lastTool = 'canvas.clear';
      emit('tool', formatValue({ ok: true }), 'canvas.clear');
      return { ok: true };
    });
  }

  if (LIST_INTENT.test(input)) {
    return withToolPlan('List canvas', ['Interpret request as canvas inspection.', 'Call canvas.getElements.'], async ({ runtime, emit }) => {
      const elements = runtime.canvas?.getElements?.() || [];
      session.lastMode = 'canvas.list';
      session.lastTool = 'canvas.getElements';
      emit('tool', formatValue(elements), 'canvas.getElements');
      return elements;
    });
  }

  if (TEXT_INTENT.test(input)) {
    const text = input.replace(/^(请|麻烦|帮我)?\s*(添加文字|加文字|写上|add text)\s*/i, '').trim() || input;
    return withToolPlan('Add text', [`Interpret request as text insertion.`, `Add text element: ${text}`], async ({ runtime, emit, ctx }) => {
      const id = runtime.canvas?.addElement?.(defaultTextPlacement(text, !!ctx?.isDark));
      session.lastMode = 'canvas.add-text';
      session.lastTool = 'canvas.addElement';
      emit('tool', formatValue({ id, text }), 'canvas.addElement');
      return { id, text };
    });
  }

  if (IMAGE_INTENT.test(input) || /画|生成|做一张|来一张|创作|出图|绘制|设计/.test(input)) {
    const prompt = stripLeadingIntent(input) || input;
    return withToolPlan('Generate image', [
      'Interpret request as image generation.',
      `Use prompt: ${prompt}`,
      'Call generate.image and place result on canvas.',
    ], async ({ runtime, emit }) => {
      const result = await runtime.generate?.image?.(prompt, 'agent');
      session.lastMode = 'generate.image';
      session.lastTool = 'generate.image';
      session.lastImagePrompt = prompt;
      emit('tool', formatValue(result || { ok: true, prompt }), 'generate.image');
      return result || { ok: true, prompt };
    });
  }

  return withToolPlan('Generate image', [
    'No exact command matched.',
    'Treat the message as a creative image request.',
    'Call generate.image with the full request.',
  ], async ({ runtime, emit }) => {
    const result = await runtime.generate?.image?.(input, 'agent');
    session.lastMode = 'generate.image';
    session.lastTool = 'generate.image';
    session.lastImagePrompt = input;
    emit('tool', formatValue(result || { ok: true, prompt: input }), 'generate.image');
    return result || { ok: true, prompt: input };
  });
}
