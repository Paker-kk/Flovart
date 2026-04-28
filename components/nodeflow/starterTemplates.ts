import type { WorkflowTemplate } from './templates';

export const STARTER_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'starter-image-flow',
    name: 'Image Starter Flow',
    nameEn: 'Image Starter Flow',
    description: 'Prompt -> Enhancer -> ImageGen -> Save to Canvas',
    descriptionEn: 'Prompt -> Enhancer -> ImageGen -> Save to Canvas',
    icon: 'IMG',
    category: 'utility',
    nodes: [
      { id: 'starter_prompt', kind: 'prompt', x: 120, y: 180 },
      {
        id: 'starter_enhancer',
        kind: 'enhancer',
        x: 520,
        y: 180,
        config: { label: 'Polish Prompt' },
      },
      {
        id: 'starter_image',
        kind: 'imageGen',
        x: 960,
        y: 180,
        config: { label: 'Generate Image' },
      },
      {
        id: 'starter_save',
        kind: 'saveToCanvas',
        x: 1380,
        y: 200,
        config: { label: 'Place On Canvas' },
      },
    ],
    edges: [
      { id: 'starter_edge_1', fromNode: 'starter_prompt', fromPort: 'text', toNode: 'starter_enhancer', toPort: 'text' },
      { id: 'starter_edge_2', fromNode: 'starter_enhancer', fromPort: 'text', toNode: 'starter_image', toPort: 'text' },
      { id: 'starter_edge_3', fromNode: 'starter_image', fromPort: 'image', toNode: 'starter_save', toPort: 'result' },
    ],
  },
  {
    id: 'starter-video-flow',
    name: 'Video Starter Flow',
    nameEn: 'Video Starter Flow',
    description: 'Prompt -> Enhancer -> VideoGen -> Save to Canvas',
    descriptionEn: 'Prompt -> Enhancer -> VideoGen -> Save to Canvas',
    icon: 'VID',
    category: 'utility',
    nodes: [
      { id: 'starter_video_prompt', kind: 'prompt', x: 120, y: 180 },
      {
        id: 'starter_video_enhancer',
        kind: 'enhancer',
        x: 520,
        y: 180,
        config: { label: 'Polish Prompt' },
      },
      {
        id: 'starter_video',
        kind: 'videoGen',
        x: 960,
        y: 180,
        config: { label: 'Generate Video' },
      },
      {
        id: 'starter_video_save',
        kind: 'saveToCanvas',
        x: 1380,
        y: 200,
        config: { label: 'Place On Canvas' },
      },
    ],
    edges: [
      { id: 'starter_video_edge_1', fromNode: 'starter_video_prompt', fromPort: 'text', toNode: 'starter_video_enhancer', toPort: 'text' },
      { id: 'starter_video_edge_2', fromNode: 'starter_video_enhancer', fromPort: 'text', toNode: 'starter_video', toPort: 'text' },
      { id: 'starter_video_edge_3', fromNode: 'starter_video', fromPort: 'video', toNode: 'starter_video_save', toPort: 'result' },
    ],
  },
];
