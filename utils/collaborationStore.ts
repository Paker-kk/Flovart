import type { Element, ImageElement, VideoElement } from '../types';
import type {
  CreativeProject,
  ExportPlan,
  OutputCandidate,
  PublishingPackage,
  ReviewStatus,
} from '../types/collaboration';
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

export const COLLABORATION_STORAGE_KEY = 'flovart.collaboration.v1';

export interface CollaborationState {
  project: CreativeProject;
  candidates: OutputCandidate[];
  exportPlans: ExportPlan[];
  packages: PublishingPackage[];
  activeCandidateId: string | null;
  activeExportPlanId: string | null;
  activePackageId: string | null;
}

type CanvasMediaElement = ImageElement | VideoElement;

function isCanvasMediaElement(element: Element): element is CanvasMediaElement {
  return element.type === 'image' || element.type === 'video';
}

export function createDefaultCollaborationState(): CollaborationState {
  return {
    project: createCreativeProject({ name: 'Publish Review' }),
    candidates: [],
    exportPlans: [],
    packages: [],
    activeCandidateId: null,
    activeExportPlanId: null,
    activePackageId: null,
  };
}

export function ensureCollaborationState(
  snapshot?: Partial<CollaborationState> | null,
): CollaborationState {
  const fallback = createDefaultCollaborationState();
  const candidates = Array.isArray(snapshot?.candidates) ? snapshot.candidates : [];
  const exportPlans = Array.isArray(snapshot?.exportPlans) ? snapshot.exportPlans : [];
  const packages = Array.isArray(snapshot?.packages) ? snapshot.packages : [];
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const exportPlanIds = new Set(exportPlans.map((plan) => plan.id));
  const packageIds = new Set(packages.map((item) => item.id));

  return {
    project: snapshot?.project ?? fallback.project,
    candidates,
    exportPlans,
    packages,
    activeCandidateId: snapshot?.activeCandidateId && candidateIds.has(snapshot.activeCandidateId)
      ? snapshot.activeCandidateId
      : null,
    activeExportPlanId: snapshot?.activeExportPlanId && exportPlanIds.has(snapshot.activeExportPlanId)
      ? snapshot.activeExportPlanId
      : null,
    activePackageId: snapshot?.activePackageId && packageIds.has(snapshot.activePackageId)
      ? snapshot.activePackageId
      : null,
  };
}

export function loadCollaborationState(): CollaborationState {
  try {
    const raw = localStorage.getItem(COLLABORATION_STORAGE_KEY);
    if (!raw) return createDefaultCollaborationState();
    return ensureCollaborationState(JSON.parse(raw) as CollaborationState);
  } catch {
    return createDefaultCollaborationState();
  }
}

export function saveCollaborationState(state: CollaborationState): void {
  try {
    localStorage.setItem(COLLABORATION_STORAGE_KEY, JSON.stringify(ensureCollaborationState(state)));
  } catch {
    // Persistence is best-effort; keep the in-memory review flow usable.
  }
}

export function listCanvasMediaElements(elements: Element[]): CanvasMediaElement[] {
  return elements.filter(isCanvasMediaElement);
}

export function registerCanvasCandidates(
  state: CollaborationState,
  elements: Element[],
): CollaborationState {
  const current = ensureCollaborationState(state);
  const existingElementIds = new Set(
    current.candidates
      .map((candidate) => candidate.elementId)
      .filter((elementId): elementId is string => !!elementId),
  );
  let project = current.project;
  const newCandidates = listCanvasMediaElements(elements)
    .filter((element) => !existingElementIds.has(element.id))
    .map((element) => {
      const videoMeta = element.type === 'video' ? element.generationMeta : undefined;
      return createOutputCandidate({
        mediaType: element.type,
        elementId: element.id,
        prompt: videoMeta?.prompt || element.name,
        provider: videoMeta?.provider,
        model: videoMeta?.model,
        status: 'in_review',
      });
    });

  for (const candidate of newCandidates) {
    project = attachCandidateToProject(project, candidate.id);
  }

  return ensureCollaborationState({
    ...current,
    project,
    candidates: [...current.candidates, ...newCandidates],
    activeCandidateId: current.activeCandidateId ?? newCandidates[0]?.id ?? null,
  });
}

export function reviewCandidate(
  state: CollaborationState,
  candidateId: string,
  patch: {
    status?: ReviewStatus;
    reviewNotes?: string;
    score?: number;
  },
): CollaborationState {
  const current = ensureCollaborationState(state);
  let found = false;
  const candidates = current.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    found = true;
    return updateCandidateReview(candidate, patch);
  });
  if (!found) return current;

  return ensureCollaborationState({
    ...current,
    candidates,
    project: patch.status === 'in_review'
      ? updateProjectStatus(current.project, 'in_review')
      : current.project,
    activeCandidateId: candidateId,
  });
}

export function selectCandidateForReview(
  state: CollaborationState,
  candidateId: string,
): CollaborationState {
  const current = ensureCollaborationState(state);
  const exists = current.candidates.some((candidate) => candidate.id === candidateId);
  if (!exists) return current;

  return ensureCollaborationState({
    ...current,
    project: updateProjectStatus(attachCandidateToProject(current.project, candidateId), 'approved'),
    candidates: selectOutputCandidate(current.candidates, candidateId),
    activeCandidateId: candidateId,
  });
}

export function createExportPlanFromSelection(
  state: CollaborationState,
  presetId: string,
): CollaborationState {
  const current = ensureCollaborationState(state);
  const candidateIds = current.candidates
    .filter((candidate) => candidate.selected || candidate.status === 'approved')
    .map((candidate) => candidate.id);
  const fallbackIds = current.activeCandidateId ? [current.activeCandidateId] : [];
  const exportCandidateIds = candidateIds.length > 0 ? candidateIds : fallbackIds;
  if (exportCandidateIds.length === 0) return current;

  const exportPlan = createExportPlan({
    projectId: current.project.id,
    presetId,
    candidateIds: exportCandidateIds,
    status: 'exported',
  });

  return ensureCollaborationState({
    ...current,
    project: updateProjectStatus(current.project, 'exported'),
    exportPlans: [exportPlan, ...current.exportPlans],
    activeExportPlanId: exportPlan.id,
  });
}

export function createPublishingPackageFromPlan(
  state: CollaborationState,
  exportPlanId?: string,
  storyboardShotCount?: number,
): CollaborationState {
  const current = ensureCollaborationState(state);
  const exportPlan = current.exportPlans.find((plan) => plan.id === (exportPlanId ?? current.activeExportPlanId));
  if (!exportPlan) return current;

  const preset = listExportPresets().find((item) => item.id === exportPlan.presetId);
  if (!preset) return current;

  const candidates = current.candidates.filter((candidate) => exportPlan.candidateIds.includes(candidate.id));
  const publishingPackage = createPublishingPackage({
    project: current.project,
    exportPlan,
    preset,
    candidates,
    storyboardShotCount,
  });

  return ensureCollaborationState({
    ...current,
    project: updateProjectStatus(current.project, 'published'),
    packages: [publishingPackage, ...current.packages],
    activePackageId: publishingPackage.id,
  });
}
