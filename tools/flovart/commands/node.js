function nodeCommand(program) {
  const nodeCmd = program.command('node');

  nodeCmd.command('create_text').description('Create a PROMPT_TEXT node')
    .option('--prompt <text>', 'Text/script content')
    .option('--name <name>', 'Display name')
    .option('--id <id>', 'Node ID')
    .option('--x <number>', 'X position', '100')
    .option('--y <number>', 'Y position', '100')
    .action(async (opts) => {
      const id = opts.id || `node_text_${Date.now().toString(36)}`;
      const result = { id, type: 'PROMPT_TEXT', x: Number(opts.x), y: Number(opts.y),
        inputs: { textPrompt: opts.prompt || '', mentions: [] },
        meta: { name: opts.name || (opts.prompt || '').slice(0, 30) || 'Text Node', createdAt: Date.now() } };
      console.log(JSON.stringify(result, null, 2));
      return result;
    });

  nodeCmd.command('create_image').description('Create a GENERATE_IMAGE node')
    .option('--prompt <text>', 'Image prompt (@node_id for refs)')
    .option('--name <name>', 'Display name')
    .option('--id <id>', 'Node ID')
    .option('--aspect <ratio>', 'Aspect ratio', '16:9')
    .option('--count <number>', 'Count', '1')
    .option('--x <number>', 'X', '520').option('--y <number>', 'Y', '100')
    .action(async (opts) => {
      const mentionRe = /@(node_[a-z0-9_]+)/gi;
      const mentions = []; let m;
      while ((m = mentionRe.exec(opts.prompt || '')) !== null) mentions.push(m[1]);
      const id = opts.id || `node_img_${Date.now().toString(36)}`;
      const result = { id, type: 'GENERATE_IMAGE', x: Number(opts.x), y: Number(opts.y),
        inputs: { textPrompt: opts.prompt || '', mentions, generationParams: { aspectRatio: opts.aspect, count: Number(opts.count) } },
        meta: { name: opts.name || ((opts.prompt || '').slice(0, 30) + ' Image'), createdAt: Date.now() } };
      console.log(JSON.stringify(result, null, 2));
      return result;
    });

  nodeCmd.command('create_video').description('Create a GENERATE_VIDEO node')
    .option('--prompt <text>', 'Video prompt (@image_node for first frame)')
    .option('--name <name>', 'Display name')
    .option('--id <id>', 'Node ID')
    .option('--aspect <ratio>', 'Aspect ratio', '16:9')
    .option('--duration <seconds>', 'Duration', '5')
    .option('--x <number>', 'X', '940').option('--y <number>', 'Y', '100')
    .action(async (opts) => {
      const mentionRe = /@(node_[a-z0-9_]+)/gi;
      const mentions = []; let m;
      while ((m = mentionRe.exec(opts.prompt || '')) !== null) mentions.push(m[1]);
      const id = opts.id || `node_vid_${Date.now().toString(36)}`;
      const result = { id, type: 'GENERATE_VIDEO', x: Number(opts.x), y: Number(opts.y),
        inputs: { textPrompt: opts.prompt || '', mentions, generationParams: { aspectRatio: opts.aspect, durationSec: Number(opts.duration) } },
        meta: { name: opts.name || ((opts.prompt || '').slice(0, 30) + ' Video'), createdAt: Date.now() } };
      console.log(JSON.stringify(result, null, 2));
      return result;
    });

  nodeCmd.command('create_storyboard').description('Create a STORYBOARD_TABLE node')
    .option('--prompt <text>', 'Storyboard description')
    .option('--name <name>', 'Display name')
    .option('--id <id>', 'Node ID')
    .option('--x <number>', 'X', '100').option('--y <number>', 'Y', '400')
    .action(async (opts) => {
      const id = opts.id || `node_story_${Date.now().toString(36)}`;
      const result = { id, type: 'STORYBOARD_TABLE', x: Number(opts.x), y: Number(opts.y),
        inputs: { textPrompt: opts.prompt || '', mentions: [] },
        meta: { name: opts.name || 'Storyboard', createdAt: Date.now() } };
      console.log(JSON.stringify(result, null, 2));
      return result;
    });

  nodeCmd.command('upload').description('Wrap a local file as STATIC_ASSET node')
    .option('--file <path>', 'Path to media file')
    .option('--name <name>', 'Display name')
    .option('--id <id>', 'Node ID')
    .option('--x <number>', 'X', '100').option('--y <number>', 'Y', '700')
    .action(async (opts) => {
      const id = opts.id || `node_asset_${Date.now().toString(36)}`;
      const fs = require('fs');
      const exists = fs.existsSync(opts.file);
      const result = { id, type: 'STATIC_ASSET', x: Number(opts.x), y: Number(opts.y),
        inputs: { textPrompt: '', mentions: [] },
        outputs: { status: exists ? 'success' : 'idle', mediaHref: opts.file || '' },
        meta: { name: opts.name || `Asset: ${opts.file || 'unknown'}`, createdAt: Date.now() } };
      console.log(JSON.stringify(result, null, 2));
      return result;
    });

  nodeCmd.command('execute').description('Generate command to execute a node')
    .option('--id <id>', 'Node ID')
    .action(async (opts) => {
      console.log(JSON.stringify({ method: 'node.execute', params: { id: opts.id } }));
    });

  nodeCmd.command('execute_all').description('Generate command to execute all nodes')
    .action(async () => {
      console.log(JSON.stringify({ method: 'node.execute_all', params: {} }));
    });

  nodeCmd.command('status').description('Query node execution status')
    .option('--id <id>', 'Node ID')
    .action(async (opts) => {
      console.log(JSON.stringify({ method: 'node.status', params: { id: opts.id } }));
    });

  program.command('board.status').description('Export full node graph as JSON')
    .option('--format <fmt>', 'json | summary', 'json')
    .action(async (opts) => {
      console.log(JSON.stringify({ method: 'board.status', params: { format: opts.format } }));
    });

  program.command('export.timeline').description('Export video node sequence for assembly')
    .option('--nodes <ids>', 'Comma-separated node IDs')
    .option('--out <path>', 'Output file', 'timeline.json')
    .action(async (opts) => {
      const nodeIds = (opts.nodes || '').split(',').map(s => s.trim()).filter(Boolean);
      console.log(JSON.stringify({ method: 'export.timeline', params: { nodes: nodeIds, out: opts.out } }));
    });
}

module.exports = { nodeCommand };
