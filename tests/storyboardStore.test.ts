import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORYBOARD_STORAGE_KEY,
  addStoryboardShot,
  attachStoryboardShotElement,
  detachStoryboardShotElement,
  ensureStoryboardState,
  loadStoryboardState,
  removeStoryboardShot,
  renameStoryboardProject,
  saveStoryboardState,
  setStoryboardPrimaryOutput,
  updateStoryboardShot,
} from '../utils/storyboardStore';

describe('storyboardStore', () => {
  beforeEach(() => {
    localStorage.removeItem(STORYBOARD_STORAGE_KEY);
  });

  it('creates a default storyboard project with a starter shot', () => {
    const snapshot = ensureStoryboardState();

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.activeStoryboardId).toBe(snapshot.projects[0].id);
    expect(snapshot.projects[0].shots).toHaveLength(1);
    expect(snapshot.projects[0].activeShotId).toBe(snapshot.projects[0].shots[0].id);
  });

  it('persists and reloads storyboard state', () => {
    const snapshot = ensureStoryboardState();
    const projectId = snapshot.projects[0].id;
    const shotId = snapshot.projects[0].shots[0].id;

    const renamed = renameStoryboardProject(snapshot, projectId, 'Pilot Board');
    const updated = updateStoryboardShot(renamed, projectId, shotId, {
      title: 'Shot A',
      prompt: 'A neon alley at night.',
    });

    saveStoryboardState(updated);
    const reloaded = loadStoryboardState();

    expect(reloaded.projects[0].name).toBe('Pilot Board');
    expect(reloaded.projects[0].shots[0].title).toBe('Shot A');
    expect(reloaded.projects[0].shots[0].prompt).toContain('neon alley');
  });

  it('attaches outputs and references without duplicates', () => {
    const snapshot = ensureStoryboardState();
    const projectId = snapshot.projects[0].id;
    const shotId = snapshot.projects[0].shots[0].id;

    const withOutput = attachStoryboardShotElement(snapshot, projectId, shotId, 'output', 'video-1');
    const withDuplicateOutput = attachStoryboardShotElement(withOutput, projectId, shotId, 'output', 'video-1');
    const withRefs = attachStoryboardShotElement(withDuplicateOutput, projectId, shotId, 'reference-image', 'image-1');

    expect(withRefs.projects[0].shots[0].outputElementIds).toEqual(['video-1']);
    expect(withRefs.projects[0].shots[0].primaryOutputId).toBe('video-1');
    expect(withRefs.projects[0].shots[0].referenceImageIds).toEqual(['image-1']);
    expect(withRefs.projects[0].shots[0].status).toBe('done');
  });

  it('switches primary output and keeps at least one shot after delete', () => {
    const snapshot = ensureStoryboardState();
    const projectId = snapshot.projects[0].id;
    const shotId = snapshot.projects[0].shots[0].id;

    const withMoreShots = addStoryboardShot(snapshot, projectId);
    const withOutputs = attachStoryboardShotElement(withMoreShots, projectId, shotId, 'output', 'video-1');
    const withSecondaryOutput = attachStoryboardShotElement(withOutputs, projectId, shotId, 'output', 'video-2');
    const withPrimary = setStoryboardPrimaryOutput(withSecondaryOutput, projectId, shotId, 'video-2');
    const trimmed = detachStoryboardShotElement(withPrimary, projectId, shotId, 'output', 'video-2');
    const afterDelete = removeStoryboardShot(trimmed, projectId, shotId);

    expect(withPrimary.projects[0].shots[0].primaryOutputId).toBe('video-2');
    expect(trimmed.projects[0].shots[0].primaryOutputId).toBe('video-1');
    expect(afterDelete.projects[0].shots.length).toBeGreaterThan(0);
    expect(afterDelete.projects[0].activeShotId).toBe(afterDelete.projects[0].shots[0].id);
  });
});
