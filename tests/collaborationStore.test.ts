import { beforeEach, describe, expect, it } from 'vitest';

import type { Element } from '../types';
import {
  createDefaultCollaborationState,
  createExportPlanFromSelection,
  createPublishingPackageFromPlan,
  loadCollaborationState,
  registerCanvasCandidates,
  reviewCandidate,
  saveCollaborationState,
  selectCandidateForReview,
} from '../utils/collaborationStore';

const imageElement: Element = {
  id: 'image_1',
  type: 'image',
  x: 0,
  y: 0,
  href: 'data:image/png;base64,a',
  width: 100,
  height: 100,
  mimeType: 'image/png',
  name: 'Hero still',
};

const videoElement: Element = {
  id: 'video_1',
  type: 'video',
  x: 0,
  y: 0,
  href: 'blob:video_1',
  width: 1920,
  height: 1080,
  mimeType: 'video/mp4',
  name: 'Hero cut',
  generationMeta: {
    provider: 'google',
    model: 'veo-3.1-generate-preview',
    prompt: 'A crisp product hero shot',
  },
};

const textElement: Element = {
  id: 'text_1',
  type: 'text',
  x: 0,
  y: 0,
  text: 'Caption',
  fontSize: 18,
  fontColor: '#ffffff',
  width: 160,
  height: 40,
};

describe('collaborationStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('registers canvas media as review candidates without duplicating them', () => {
    const initial = createDefaultCollaborationState();
    const registered = registerCanvasCandidates(initial, [imageElement, videoElement, textElement]);
    const registeredAgain = registerCanvasCandidates(registered, [imageElement, videoElement]);

    expect(registered.candidates).toHaveLength(2);
    expect(registered.candidates.map((candidate) => candidate.elementId)).toEqual(['image_1', 'video_1']);
    expect(registered.project.outputCandidateIds).toHaveLength(2);
    expect(registeredAgain.candidates).toHaveLength(2);
  });

  it('selects a best output, creates an export plan, then creates a publishing package', () => {
    const initial = registerCanvasCandidates(createDefaultCollaborationState(), [imageElement, videoElement]);
    const videoCandidate = initial.candidates.find((candidate) => candidate.elementId === 'video_1');
    expect(videoCandidate).toBeTruthy();

    const reviewed = reviewCandidate(initial, videoCandidate!.id, {
      reviewNotes: 'Best pacing for the launch cut',
      status: 'in_review',
    });
    const selected = selectCandidateForReview(reviewed, videoCandidate!.id);
    const exported = createExportPlanFromSelection(selected, 'social-short-9x16');
    const packaged = createPublishingPackageFromPlan(exported, exported.activeExportPlanId, 4);

    expect(selected.project.status).toBe('approved');
    expect(exported.project.status).toBe('exported');
    expect(exported.exportPlans[0]).toMatchObject({
      presetId: 'social-short-9x16',
      candidateIds: [videoCandidate!.id],
      status: 'exported',
    });
    expect(packaged.project.status).toBe('published');
    expect(packaged.packages[0].manifest).toMatchObject({
      target: 'social',
      candidateCount: 1,
      mediaTypes: ['video'],
      storyboardShotCount: 4,
    });
  });

  it('persists and reloads collaboration state', () => {
    const state = registerCanvasCandidates(createDefaultCollaborationState(), [imageElement]);
    saveCollaborationState(state);

    const loaded = loadCollaborationState();

    expect(loaded.candidates).toHaveLength(1);
    expect(loaded.candidates[0].elementId).toBe('image_1');
  });
});
