import { describe, expect, it } from 'vitest';

import type { WorkflowEdge, WorkflowGroup, WorkflowNode, WorkflowViewport } from '../components/nodeflow/types';
import {
  applyWorkflowTemplateKeyBindings,
  createWorkflowTemplatePackage,
  parseWorkflowTemplatePackageJson,
  serializeWorkflowTemplatePackage,
} from '../utils/workflowTemplatePackage';

const viewport: WorkflowViewport = { x: -120, y: -80, scale: 0.86 };

describe('workflow template packages', () => {
  it('exports a reusable workflow without leaking local key bindings or pinned media', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'prompt_1',
        kind: 'prompt',
        x: 0,
        y: 0,
        config: { prompt: 'A launch film for Flovart' },
      },
      {
        id: 'image_1',
        kind: 'imageGen',
        x: 360,
        y: 0,
        config: {
          provider: 'google',
          model: 'gemini-3.1-flash-image-preview',
          apiKeyRef: 'local-google-key',
          pinnedOutputs: {
            image: { kind: 'image', href: 'data:image/png;base64,secret', mimeType: 'image/png' },
          },
          mediaKind: 'image',
          mediaHref: 'data:image/png;base64,local',
          mediaMimeType: 'image/png',
        },
      },
      {
        id: 'video_1',
        kind: 'videoGen',
        x: 720,
        y: 0,
        config: {
          provider: 'google',
          model: 'veo-3.1-generate-preview',
          apiKeyRef: 'local-veo-key',
        },
      },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'edge_1', fromNode: 'prompt_1', fromPort: 'text', toNode: 'image_1', toPort: 'text' },
      { id: 'edge_2', fromNode: 'image_1', fromPort: 'image', toNode: 'video_1', toPort: 'image' },
    ];

    const pack = createWorkflowTemplatePackage({
      metadata: {
        name: 'Gemini image to Veo video',
        description: 'Generate a key visual and turn it into video.',
        tags: ['official', 'video'],
      },
      nodes,
      edges,
      groups: [],
      viewport,
    });

    expect(pack.metadata.name).toBe('Gemini image to Veo video');
    expect(pack.workflow.nodes).toHaveLength(3);
    expect(pack.keySlots).toEqual([
      expect.objectContaining({
        id: 'key_image_1_google',
        nodeId: 'image_1',
        provider: 'google',
        capability: 'image',
        label: 'Image: Google',
      }),
      expect.objectContaining({
        id: 'key_video_1_google',
        nodeId: 'video_1',
        provider: 'google',
        capability: 'video',
        label: 'Video: Google',
      }),
    ]);
    expect(pack.requirements.providers).toEqual(['google']);
    expect(pack.requirements.models).toEqual([
      'gemini-3.1-flash-image-preview',
      'veo-3.1-generate-preview',
    ]);

    const imageConfig = pack.workflow.nodes.find((node) => node.id === 'image_1')?.config;
    expect(imageConfig).toMatchObject({
      provider: 'google',
      model: 'gemini-3.1-flash-image-preview',
    });
    expect(imageConfig).not.toHaveProperty('apiKeyRef');
    expect(imageConfig).not.toHaveProperty('pinnedOutputs');
    expect(imageConfig).not.toHaveProperty('mediaHref');
    expect(imageConfig).not.toHaveProperty('mediaMimeType');
  });

  it('removes sensitive HTTP headers while preserving safe request template fields', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'http_1',
        kind: 'httpRequest',
        x: 0,
        y: 0,
        config: {
          apiKeyRef: 'local-http-key',
          httpMethod: 'POST',
          httpUrl: 'https://api.example.com/render',
          httpHeaders: JSON.stringify({
            Authorization: 'Bearer secret',
            'x-api-key': 'secret',
            'Content-Type': 'application/json',
            'X-Workflow': 'flovart',
          }),
          httpBodyTemplate: '{"prompt":"{{input}}"}',
          httpResultPath: 'data.url',
        },
      },
    ];

    const pack = createWorkflowTemplatePackage({
      metadata: { name: 'HTTP render template' },
      nodes,
      edges: [],
      groups: [],
      viewport,
    });

    const config = pack.workflow.nodes[0].config;
    expect(config?.httpHeaders).toBe(JSON.stringify({
      'Content-Type': 'application/json',
      'X-Workflow': 'flovart',
    }, null, 2));
    expect(config).toMatchObject({
      httpMethod: 'POST',
      httpUrl: 'https://api.example.com/render',
      httpBodyTemplate: '{"prompt":"{{input}}"}',
      httpResultPath: 'data.url',
    });
    expect(config).not.toHaveProperty('apiKeyRef');
    expect(pack.keySlots[0]).toMatchObject({
      id: 'key_http_1_custom',
      nodeId: 'http_1',
      provider: 'custom',
      capability: 'text',
    });
  });

  it('serializes and validates template package JSON', () => {
    const groups: WorkflowGroup[] = [
      { id: 'group_1', title: 'Generation', x: -20, y: -20, width: 520, height: 220, nodeIds: ['prompt_1'] },
    ];
    const pack = createWorkflowTemplatePackage({
      metadata: { name: 'Prompt only' },
      nodes: [{ id: 'prompt_1', kind: 'prompt', x: 0, y: 0 }],
      edges: [],
      groups,
      viewport,
    });

    const parsed = parseWorkflowTemplatePackageJson(serializeWorkflowTemplatePackage(pack));

    expect(parsed).toMatchObject({
      version: 1,
      metadata: { name: 'Prompt only' },
      workflow: { groups },
    });
    expect(parseWorkflowTemplatePackageJson('not-json')).toBeNull();
    expect(parseWorkflowTemplatePackageJson('{"version":1,"metadata":{},"workflow":{"nodes":[]}}')).toBeNull();
  });

  it('binds imported template key slots to local API keys without mutating the package', () => {
    const pack = createWorkflowTemplatePackage({
      metadata: { name: 'Image to video' },
      nodes: [
        {
          id: 'image_1',
          kind: 'imageGen',
          x: 0,
          y: 0,
          config: {
            provider: 'google',
            model: 'gemini-3.1-flash-image-preview',
            apiKeyRef: 'local-key-before-export',
          },
        },
        {
          id: 'video_1',
          kind: 'videoGen',
          x: 360,
          y: 0,
          config: {
            provider: 'google',
            model: 'veo-3.1-generate-preview',
            apiKeyRef: 'local-video-key-before-export',
          },
        },
      ],
      edges: [],
      groups: [],
      viewport,
    });

    const hydrated = applyWorkflowTemplateKeyBindings(pack, {
      key_image_1_google: 'my-google-image-key',
      key_video_1_google: 'my-google-video-key',
    });

    expect(hydrated.nodes.find((node) => node.id === 'image_1')?.config).toMatchObject({
      provider: 'google',
      model: 'gemini-3.1-flash-image-preview',
      apiKeyRef: 'my-google-image-key',
    });
    expect(hydrated.nodes.find((node) => node.id === 'video_1')?.config).toMatchObject({
      provider: 'google',
      model: 'veo-3.1-generate-preview',
      apiKeyRef: 'my-google-video-key',
    });
    expect(pack.workflow.nodes.find((node) => node.id === 'image_1')?.config).not.toHaveProperty('apiKeyRef');
  });
});
