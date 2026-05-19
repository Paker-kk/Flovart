export const assetDefs = {
  'asset.list': {
    name: 'asset.list',
    description: 'List locally generated media assets',
    category: 'Assets',
    args: [],
    columns: ['id', 'type', 'name', 'createdAt'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.assets?.list?.() || [];
    },
  },
};
