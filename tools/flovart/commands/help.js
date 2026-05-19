export const helpDef = {
  help: {
    name: 'help',
    aliases: ['--help', '-h'],
    description: 'Show this help message',
    category: 'General',
    args: [],
    execute: async () => {
      return { ok: true, text: 'Use flovart <command> --help for details.', commands: Object.keys(helpDef) };
    },
  },
};
