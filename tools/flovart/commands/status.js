export const statusDef = {
  status: {
    name: 'status',
    description: 'Inspect Flovart runtime status (providers, canvas, assets)',
    category: 'System',
    args: [],
    columns: ['runtime', 'mediaElements', 'providers'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected. Run npm run dev first.' };
      const result = await runtime.status?.() || {};
      return { ok: true, result };
    },
  },
  setup: {
    name: 'setup',
    description: 'Show setup instructions for Flovart CLI/MCP',
    category: 'System',
    args: [],
    execute: async () => {
      const text = [
        'Flovart CLI setup:',
        '1. npm run dev',
        '2. Start Chrome with --remote-debugging-port=9222',
        '3. Open Flovart in that Chrome window',
        '4. npm run flovart:cli -- status',
      ].join('\n');
      return { ok: true, text };
    },
  },
};
