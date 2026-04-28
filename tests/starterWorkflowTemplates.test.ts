import { describe, expect, it } from 'vitest';
import { STARTER_WORKFLOW_TEMPLATES } from '../components/nodeflow/starterTemplates';

describe('STARTER_WORKFLOW_TEMPLATES', () => {
  it('exports the minimal image starter flow for a first workflow run', () => {
    const template = STARTER_WORKFLOW_TEMPLATES.find((item) => item.id === 'starter-image-flow');

    expect(template?.nodes.map((node) => node.kind)).toEqual(['prompt', 'enhancer', 'imageGen', 'saveToCanvas']);
    expect(template?.edges.map((edge) => `${edge.fromNode}:${edge.fromPort}->${edge.toNode}:${edge.toPort}`)).toEqual([
      'starter_prompt:text->starter_enhancer:text',
      'starter_enhancer:text->starter_image:text',
      'starter_image:image->starter_save:result',
    ]);
  });

  it('exports the minimal video starter flow for prompt-to-video onboarding', () => {
    const template = STARTER_WORKFLOW_TEMPLATES.find((item) => item.id === 'starter-video-flow');

    expect(template?.nodes.map((node) => node.kind)).toEqual(['prompt', 'enhancer', 'videoGen', 'saveToCanvas']);
    expect(template?.edges.map((edge) => `${edge.fromNode}:${edge.fromPort}->${edge.toNode}:${edge.toPort}`)).toEqual([
      'starter_video_prompt:text->starter_video_enhancer:text',
      'starter_video_enhancer:text->starter_video:text',
      'starter_video:video->starter_video_save:result',
    ]);
  });
});
