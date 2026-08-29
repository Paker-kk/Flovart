// The model-facing Agent surface is intentionally smaller than the CLI registry.
// Granular commands remain CLI compatibility adapters; they are not Agent tools.
export const AGENT_PUBLIC_COMMANDS = Object.freeze([
  'status',
  'workflow.inspect',
  'workflow.selection.get',
  'workflow.apply',
  'workflow.node.run',
]);

export const AGENT_PUBLIC_COMMAND_SET = new Set(AGENT_PUBLIC_COMMANDS);

export const AGENT_BROWSER_COMMANDS = Object.freeze([
  'workflow.inspect',
  'workflow.selection.get',
  'workflow.apply',
  'workflow.node.run',
]);
