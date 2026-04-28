import type { StoryboardProject, StoryboardShot } from '../types';
import { generateId } from './canvasHelpers';

export const STORYBOARD_STORAGE_KEY = 'flovart.storyboard.v1';
export const STORYBOARD_UPDATED_EVENT = 'flovart:storyboard-updated';

export interface StoryboardStateSnapshot {
  projects: StoryboardProject[];
  activeStoryboardId: string | null;
}

type StoryboardAttachmentKind = 'output' | 'reference-image' | 'reference-video';

const now = () => Date.now();

export const createStoryboardShot = (index = 0): StoryboardShot => {
  const timestamp = now();
  return {
    id: generateId(),
    title: `Shot ${index + 1}`,
    prompt: '',
    notes: '',
    aspectRatio: '16:9',
    durationSec: 4,
    referenceImageIds: [],
    referenceVideoIds: [],
    outputElementIds: [],
    primaryOutputId: null,
    status: 'draft',
    error: null,
    workflowId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const createStoryboardProject = (name = 'Storyboard Project'): StoryboardProject => {
  const timestamp = now();
  const firstShot = createStoryboardShot(0);
  return {
    id: generateId(),
    name,
    shots: [firstShot],
    activeShotId: firstShot.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const normalizeProject = (project: StoryboardProject): StoryboardProject => {
  const shots = project.shots.length > 0
    ? project.shots
    : [createStoryboardShot(0)];
  const activeShotId = shots.some((shot) => shot.id === project.activeShotId)
    ? project.activeShotId
    : shots[0].id;

  return {
    ...project,
    shots,
    activeShotId,
  };
};

export const ensureStoryboardState = (
  snapshot?: Partial<StoryboardStateSnapshot> | null,
): StoryboardStateSnapshot => {
  const projects = (snapshot?.projects ?? []).map(normalizeProject);
  if (projects.length === 0) {
    const project = createStoryboardProject();
    return {
      projects: [project],
      activeStoryboardId: project.id,
    };
  }

  const activeStoryboardId = projects.some((project) => project.id === snapshot?.activeStoryboardId)
    ? snapshot?.activeStoryboardId ?? projects[0].id
    : projects[0].id;

  return {
    projects,
    activeStoryboardId,
  };
};

export const loadStoryboardState = (): StoryboardStateSnapshot => {
  try {
    const raw = localStorage.getItem(STORYBOARD_STORAGE_KEY);
    if (!raw) return ensureStoryboardState();
    return ensureStoryboardState(JSON.parse(raw) as StoryboardStateSnapshot);
  } catch {
    return ensureStoryboardState();
  }
};

export const saveStoryboardState = (snapshot: StoryboardStateSnapshot): void => {
  try {
    localStorage.setItem(STORYBOARD_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore persistence failures and keep the in-memory state usable.
  }
};

export const notifyStoryboardUpdated = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORYBOARD_UPDATED_EVENT));
};

export const updateStoryboardProject = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  updater: (project: StoryboardProject) => StoryboardProject,
): StoryboardStateSnapshot => {
  return ensureStoryboardState({
    ...snapshot,
    projects: snapshot.projects.map((project) => {
      if (project.id !== projectId) return project;
      return normalizeProject(updater(project));
    }),
  });
};

export const addStoryboardShot = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => {
    const shot = createStoryboardShot(project.shots.length);
    return {
      ...project,
      shots: [...project.shots, shot],
      activeShotId: shot.id,
      updatedAt: now(),
    };
  });
};

export const removeStoryboardShot = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => {
    const remainingShots = project.shots.filter((shot) => shot.id !== shotId);
    const shots = remainingShots.length > 0
      ? remainingShots
      : [createStoryboardShot(0)];
    const nextActiveShotId = shots.some((shot) => shot.id === project.activeShotId)
      ? project.activeShotId
      : shots[0].id;
    return {
      ...project,
      shots,
      activeShotId: nextActiveShotId,
      updatedAt: now(),
    };
  });
};

export const selectStoryboardShot = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => ({
    ...project,
    activeShotId: shotId,
  }));
};

export const renameStoryboardProject = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  name: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => ({
    ...project,
    name: name.trim() || 'Storyboard Project',
    updatedAt: now(),
  }));
};

export const updateStoryboardShot = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
  updates: Partial<StoryboardShot>,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => ({
    ...project,
    shots: project.shots.map((shot) => {
      if (shot.id !== shotId) return shot;
      return {
        ...shot,
        ...updates,
        updatedAt: now(),
      };
    }),
    updatedAt: now(),
  }));
};

export const attachStoryboardShotElement = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
  kind: StoryboardAttachmentKind,
  elementId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => ({
    ...project,
    shots: project.shots.map((shot) => {
      if (shot.id !== shotId) return shot;

      if (kind === 'output') {
        const outputElementIds = shot.outputElementIds?.includes(elementId)
          ? shot.outputElementIds
          : [...(shot.outputElementIds ?? []), elementId];
        return {
          ...shot,
          outputElementIds,
          primaryOutputId: shot.primaryOutputId ?? elementId,
          status: 'done',
          updatedAt: now(),
        };
      }

      if (kind === 'reference-image') {
        const referenceImageIds = shot.referenceImageIds?.includes(elementId)
          ? shot.referenceImageIds
          : [...(shot.referenceImageIds ?? []), elementId];
        return {
          ...shot,
          referenceImageIds,
          updatedAt: now(),
        };
      }

      const referenceVideoIds = shot.referenceVideoIds?.includes(elementId)
        ? shot.referenceVideoIds
        : [...(shot.referenceVideoIds ?? []), elementId];
      return {
        ...shot,
        referenceVideoIds,
        updatedAt: now(),
      };
    }),
    updatedAt: now(),
  }));
};

export const detachStoryboardShotElement = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
  kind: StoryboardAttachmentKind,
  elementId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardProject(snapshot, projectId, (project) => ({
    ...project,
    shots: project.shots.map((shot) => {
      if (shot.id !== shotId) return shot;

      if (kind === 'output') {
        const outputElementIds = (shot.outputElementIds ?? []).filter((id) => id !== elementId);
        return {
          ...shot,
          outputElementIds,
          primaryOutputId: shot.primaryOutputId === elementId ? (outputElementIds[0] ?? null) : shot.primaryOutputId,
          updatedAt: now(),
        };
      }

      if (kind === 'reference-image') {
        return {
          ...shot,
          referenceImageIds: (shot.referenceImageIds ?? []).filter((id) => id !== elementId),
          updatedAt: now(),
        };
      }

      return {
        ...shot,
        referenceVideoIds: (shot.referenceVideoIds ?? []).filter((id) => id !== elementId),
        updatedAt: now(),
      };
    }),
    updatedAt: now(),
  }));
};

export const setStoryboardPrimaryOutput = (
  snapshot: StoryboardStateSnapshot,
  projectId: string,
  shotId: string,
  elementId: string,
): StoryboardStateSnapshot => {
  return updateStoryboardShot(snapshot, projectId, shotId, { primaryOutputId: elementId });
};
