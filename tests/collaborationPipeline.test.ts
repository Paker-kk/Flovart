import { describe, expect, it } from 'vitest';

import {
  attachCandidateToProject,
  createCreativeProject,
  createExportPlan,
  createOutputCandidate,
  createPublishingPackage,
  listExportPresets,
  selectOutputCandidate,
  updateCandidateReview,
  updateProjectStatus,
} from '../services/collaborationPipeline';

describe('collaborationPipeline', () => {
  it('creates a project and candidate with draft review semantics', () => {
    const project = createCreativeProject({ name: 'Launch Cut' });
    const candidate = createOutputCandidate({
      mediaType: 'video',
      shotId: 'shot_1',
      elementId: 'video_1',
      provider: 'google',
      model: 'veo-3.1-generate-preview',
    });

    expect(project).toMatchObject({
      name: 'Launch Cut',
      status: 'draft',
      outputCandidateIds: [],
    });
    expect(candidate).toMatchObject({
      mediaType: 'video',
      shotId: 'shot_1',
      elementId: 'video_1',
      status: 'draft',
      selected: false,
    });
  });

  it('marks one output candidate as the approved pick', () => {
    const first = createOutputCandidate({ mediaType: 'image', elementId: 'image_1' });
    const second = createOutputCandidate({ mediaType: 'image', elementId: 'image_2' });

    const selected = selectOutputCandidate([first, second], second.id);

    expect(selected.find((candidate) => candidate.id === second.id)).toMatchObject({
      selected: true,
      status: 'approved',
    });
    expect(selected.find((candidate) => candidate.id === first.id)?.selected).toBe(false);
  });

  it('supports review notes and export presets', () => {
    const candidate = createOutputCandidate({ mediaType: 'video' });
    const reviewed = updateCandidateReview(candidate, {
      status: 'in_review',
      reviewNotes: 'Needs shorter intro',
      score: 72,
    });
    const socialPreset = listExportPresets('social')[0];
    const plan = createExportPlan({
      projectId: 'project_1',
      presetId: socialPreset.id,
      candidateIds: [candidate.id],
    });

    expect(reviewed).toMatchObject({
      status: 'in_review',
      reviewNotes: 'Needs shorter intro',
      score: 72,
    });
    expect(socialPreset).toMatchObject({
      target: 'social',
      aspectRatio: '9:16',
    });
    expect(plan).toMatchObject({
      projectId: 'project_1',
      presetId: socialPreset.id,
      candidateIds: [candidate.id],
      status: 'draft',
    });
  });

  it('attaches candidates once and creates a publishing package manifest', () => {
    const project = createCreativeProject({ name: 'Launch Cut' });
    const candidate = createOutputCandidate({ mediaType: 'video', elementId: 'video_1' });
    const attached = attachCandidateToProject(project, candidate.id);
    const attachedAgain = attachCandidateToProject(attached, candidate.id);
    const preset = listExportPresets('social')[0];
    const exportPlan = createExportPlan({
      projectId: attached.id,
      presetId: preset.id,
      candidateIds: [candidate.id],
      status: 'exported',
    });
    const publishingPackage = createPublishingPackage({
      project: updateProjectStatus(attached, 'exported'),
      exportPlan,
      preset,
      candidates: [candidate],
      storyboardShotCount: 3,
    });

    expect(attached.outputCandidateIds).toEqual([candidate.id]);
    expect(attachedAgain.outputCandidateIds).toEqual([candidate.id]);
    expect(publishingPackage).toMatchObject({
      projectId: attached.id,
      presetId: preset.id,
      candidateIds: [candidate.id],
      status: 'published',
      manifest: {
        projectName: 'Launch Cut',
        target: 'social',
        candidateCount: 1,
        mediaTypes: ['video'],
        storyboardShotCount: 3,
      },
    });
  });
});
