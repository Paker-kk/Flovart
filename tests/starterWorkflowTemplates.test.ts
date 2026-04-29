import { describe, expect, it } from 'vitest';
import { STARTER_WORKFLOW_TEMPLATES } from '../components/nodeflow/starterTemplates';

describe('STARTER_WORKFLOW_TEMPLATES', () => {
  it('exports the minimal image starter flow for a first workflow run', () => {
    const template = STARTER_WORKFLOW_TEMPLATES.find((item) => item.id === 'starter-image-flow');

    expect(template?.nodes.map((node) => node.kind)).toEqual(['imageGen']);
    expect(template?.edges).toEqual([]);
  });

  it('exports the minimal video starter flow for prompt-to-video onboarding', () => {
    const template = STARTER_WORKFLOW_TEMPLATES.find((item) => item.id === 'starter-video-flow');

    expect(template?.nodes.map((node) => node.kind)).toEqual(['imageGen', 'videoGen']);
    expect(template?.edges.map((edge) => `${edge.fromNode}:${edge.fromPort}->${edge.toNode}:${edge.toPort}`)).toEqual([
      'starter_image:image->starter_video:image',
    ]);
  });
});
