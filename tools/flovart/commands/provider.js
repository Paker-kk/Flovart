export const providerDefs = {
  'provider.status': {
    name: 'provider.status',
    description: 'Check configured AI provider and model status',
    category: 'Provider',
    args: [],
    columns: ['provider', 'imageModel', 'videoModel', 'ready'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.provider?.status?.() || { ok: false, error: 'provider.status unavailable' };
    },
  },
  'provider.begin-setup': {
    name: 'provider.begin-setup',
    description: 'Open browser settings to let user enter API keys',
    category: 'Provider',
    args: [
      { name: 'provider', type: 'str', default: 'custom', help: 'Provider ID' },
      { name: 'purpose', type: 'str', default: 'both', choices: ['image', 'video', 'both'], help: 'Purpose' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.provider?.beginSetup?.({ provider: args.provider || 'custom', purpose: args.purpose || 'both' });
    },
  },
  'provider.select-model': {
    name: 'provider.select-model',
    description: 'Select image/video/text models for generation',
    category: 'Provider',
    args: [
      { name: 'image-model', type: 'str', help: 'Image model ID' },
      { name: 'video-model', type: 'str', help: 'Video model ID' },
      { name: 'text-model', type: 'str', help: 'Text model ID' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.provider?.selectModel?.({
        imageModel: args['image-model'] || args.imageModel,
        videoModel: args['video-model'] || args.videoModel,
        textModel: args['text-model'] || args.textModel,
      });
    },
  },
  'provider.test': {
    name: 'provider.test',
    description: 'Test configured provider readiness',
    category: 'Provider',
    args: [
      { name: 'purpose', type: 'str', default: 'both', choices: ['image', 'video', 'both'], help: 'Test purpose' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.provider?.test?.({ purpose: args.purpose || 'both' });
    },
  },
  'provider.set-api-key': {
    name: 'provider.set-api-key',
    description: 'Set an API key for an AI provider via CLI',
    category: 'Provider',
    args: [
      { name: 'provider', type: 'str', required: true, help: 'Provider ID (e.g. openai, google, anthropic)' },
      { name: 'key', type: 'str', required: true, help: 'The API key value' },
      { name: 'capabilities', type: 'str', default: 'image,video,text', help: 'Comma-separated capabilities' },
      { name: 'base-url', type: 'str', help: 'Custom base URL for the provider' },
      { name: 'name', type: 'str', help: 'A friendly name for this key' },
    ],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.provider?.setApiKey?.({
        provider: args.provider,
        key: args.key,
        capabilities: (args.capabilities || 'image,video,text').split(',').map(s => s.trim()),
        baseUrl: args['base-url'],
        name: args.name,
      });
    },
  },
};
