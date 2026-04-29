import type { WorkflowTemplate } from './templates';

export const STARTER_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'starter-image-flow',
    name: 'Image Node',
    nameEn: 'Image Node',
    description: 'Single image card with its own prompt, model, and key',
    descriptionEn: 'Single image card with its own prompt, model, and key',
    icon: 'IMG',
    category: 'utility',
    nodes: [
      {
        id: 'starter_image',
        kind: 'imageGen',
        x: 120,
        y: 180,
        config: { label: 'Image' },
      },
    ],
    edges: [],
  },
  {
    id: 'starter-video-flow',
    name: 'Image To Video',
    nameEn: 'Image To Video',
    description: 'Image card passes its media into a video card',
    descriptionEn: 'Image card passes its media into a video card',
    icon: 'VID',
    category: 'utility',
    nodes: [
      {
        id: 'starter_image',
        kind: 'imageGen',
        x: 120,
        y: 180,
        config: { label: 'Image' },
      },
      {
        id: 'starter_video',
        kind: 'videoGen',
        x: 520,
        y: 180,
        config: { label: 'Video' },
      },
    ],
    edges: [
      { id: 'starter_video_edge_1', fromNode: 'starter_image', fromPort: 'image', toNode: 'starter_video', toPort: 'image' },
    ],
  },
];
