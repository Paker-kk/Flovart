export const exportDefs = {
  'export.project': {
    name: 'export.project',
    description: 'Export project metadata',
    category: 'Project',
    args: [
      { name: 'format', type: 'str', default: 'json', choices: ['json', 'png'], help: 'Export format' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.export?.project?.({ format: args.format || 'json' });
    },
  },
};
