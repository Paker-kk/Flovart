export const videoDefs = {
  'video.status': {
    name: 'video.status',
    description: 'Query a video generation job status',
    category: 'Generation',
    args: [
      { name: 'job-id', type: 'str', required: true, help: 'Video job ID' },
    ],
    columns: ['jobId', 'status', 'progress', 'url'],
    execute: async (args, runtime) => {
      if (!runtime) return { ok: false, error: 'Runtime not connected' };
      return await runtime.generate?.videoStatus?.({ jobId: args['job-id'] || args.jobId });
    },
  },
};
