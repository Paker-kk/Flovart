import { startServe } from '../serve.js';

export const serveDefs = {
  serve: {
    name: 'serve',
    description: 'Start HTTP API server (OpenAI-compatible image generation)',
    category: 'Server',
    args: [
      { name: 'port', type: 'int', default: 8080, help: 'HTTP server port' },
      { name: 'host', type: 'str', default: '127.0.0.1', help: 'Bind address' },
    ],
    longRunning: true,
    execute: async (args, runtime) => {
      // serve manages its own CDP connection
      return await startServe({ port: args.port || 8080, host: args.host || '127.0.0.1' });
    },
  },
};
