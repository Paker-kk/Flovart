import { describe, expect, it } from 'vitest';
import { STARTER_WORKFLOW_TEMPLATES } from '../components/nodeflow/starterTemplates';
import {
  getWorkflowTemplateFilterKind,
  matchesWorkflowTemplateFilter,
} from '../components/nodeflow/templateFilters';
import { WORKFLOW_TEMPLATES } from '../components/nodeflow/templates';

describe('templateFilters', () => {
  it('classifies starter flows by their actual media node type', () => {
    const imageStarter = STARTER_WORKFLOW_TEMPLATES.find((template) => template.id === 'starter-image-flow');
    const videoStarter = STARTER_WORKFLOW_TEMPLATES.find((template) => template.id === 'starter-video-flow');

    expect(imageStarter && getWorkflowTemplateFilterKind(imageStarter)).toBe('image');
    expect(videoStarter && getWorkflowTemplateFilterKind(videoStarter)).toBe('video');
  });

  it('keeps RunningHub pipelines in the utility filter', () => {
    const runningHubTemplate = WORKFLOW_TEMPLATES.find((template) => template.id === 'runninghub-pipeline');

    expect(runningHubTemplate && getWorkflowTemplateFilterKind(runningHubTemplate)).toBe('utility');
  });

  it('matches image-focused templates against the image filter and excludes them from video', () => {
    const styleTransferTemplate = WORKFLOW_TEMPLATES.find((template) => template.id === 'style-transfer');

    expect(styleTransferTemplate && matchesWorkflowTemplateFilter(styleTransferTemplate, 'image')).toBe(true);
    expect(styleTransferTemplate && matchesWorkflowTemplateFilter(styleTransferTemplate, 'video')).toBe(false);
  });
});
