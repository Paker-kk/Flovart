import type { WorkflowTemplate } from './templates';

export type WorkflowTemplateFilter = 'all' | 'image' | 'video' | 'utility';

export function getWorkflowTemplateFilterKind(
  template: WorkflowTemplate,
): Exclude<WorkflowTemplateFilter, 'all'> {
  const nodeKinds = new Set(template.nodes.map((node) => node.kind));

  if (nodeKinds.has('videoGen')) return 'video';
  if (nodeKinds.has('runningHub')) return 'utility';
  if (nodeKinds.has('imageGen') || nodeKinds.has('loadImage')) return 'image';

  return 'utility';
}

export function matchesWorkflowTemplateFilter(
  template: WorkflowTemplate,
  filter: WorkflowTemplateFilter,
): boolean {
  if (filter === 'all') return true;
  return getWorkflowTemplateFilterKind(template) === filter;
}
