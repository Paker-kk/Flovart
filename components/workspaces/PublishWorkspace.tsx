import React from 'react';
import type { Element } from '../../types';
import type { OutputCandidate, ReviewStatus } from '../../types/collaboration';
import { listExportPresets } from '../../services/collaborationPipeline';
import {
  createExportPlanFromSelection,
  createPublishingPackageFromPlan,
  listCanvasMediaElements,
  loadCollaborationState,
  registerCanvasCandidates,
  reviewCandidate,
  saveCollaborationState,
  selectCandidateForReview,
  type CollaborationState,
} from '../../utils/collaborationStore';
import { loadStoryboardState } from '../../utils/storyboardStore';

interface PublishWorkspaceProps {
  elements: Element[];
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: ReviewStatus): string {
  if (status === 'approved' || status === 'published') return 'bg-emerald-400/15 text-emerald-200';
  if (status === 'rejected') return 'bg-rose-400/15 text-rose-200';
  if (status === 'exported') return 'bg-cyan-400/15 text-cyan-200';
  if (status === 'in_review') return 'bg-amber-400/15 text-amber-200';
  return 'bg-white/10 text-white/55';
}

function candidateLabel(candidate: OutputCandidate, elements: Element[]): string {
  const element = elements.find((item) => item.id === candidate.elementId);
  return element?.name || candidate.prompt || `${candidate.mediaType} candidate`;
}

function CandidatePreview({
  candidate,
  elements,
}: {
  candidate: OutputCandidate;
  elements: Element[];
}) {
  const element = elements.find((item) => item.id === candidate.elementId);
  if (element?.type === 'image') {
    return (
      <img
        src={element.href}
        alt=""
        className="h-16 w-20 rounded-lg object-cover"
      />
    );
  }
  if (element?.type === 'video') {
    return (
      <video
        src={element.href}
        poster={element.poster}
        muted
        className="h-16 w-20 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-16 w-20 items-center justify-center rounded-lg bg-white/10 text-xs text-white/40">
      missing
    </div>
  );
}

export const PublishWorkspace: React.FC<PublishWorkspaceProps> = ({ elements }) => {
  const [state, setState] = React.useState<CollaborationState>(() => loadCollaborationState());
  const [storyboardState] = React.useState(() => loadStoryboardState());
  const mediaElements = React.useMemo(() => listCanvasMediaElements(elements), [elements]);
  const presets = React.useMemo(() => listExportPresets(), []);
  const activeStoryboard = storyboardState.projects.find((project) => project.id === storyboardState.activeStoryboardId)
    ?? storyboardState.projects[0];
  const activePlan = state.exportPlans.find((plan) => plan.id === state.activeExportPlanId)
    ?? state.exportPlans[0]
    ?? null;
  const activePackage = state.packages.find((item) => item.id === state.activePackageId)
    ?? state.packages[0]
    ?? null;
  const selectedCandidate = state.candidates.find((candidate) => candidate.selected)
    ?? state.candidates.find((candidate) => candidate.id === state.activeCandidateId)
    ?? null;

  const commit = React.useCallback((nextState: CollaborationState) => {
    setState(nextState);
    saveCollaborationState(nextState);
  }, []);

  const captureCanvasMedia = React.useCallback(() => {
    commit(registerCanvasCandidates(state, elements));
  }, [commit, elements, state]);

  const markBest = React.useCallback((candidateId: string) => {
    commit(selectCandidateForReview(state, candidateId));
  }, [commit, state]);

  const rejectCandidate = React.useCallback((candidateId: string) => {
    commit(reviewCandidate(state, candidateId, { status: 'rejected' }));
  }, [commit, state]);

  const updateNotes = React.useCallback((candidateId: string, reviewNotes: string) => {
    commit(reviewCandidate(state, candidateId, { reviewNotes, status: 'in_review' }));
  }, [commit, state]);

  const createExport = React.useCallback((presetId: string) => {
    commit(createExportPlanFromSelection(state, presetId));
  }, [commit, state]);

  const createPackage = React.useCallback(() => {
    commit(createPublishingPackageFromPlan(state, activePlan?.id, activeStoryboard?.shots.length));
  }, [activePlan?.id, activeStoryboard?.shots.length, commit, state]);

  const reviewedCount = state.candidates.filter((candidate) => candidate.status !== 'draft').length;
  const approvedCount = state.candidates.filter((candidate) => candidate.status === 'approved').length;
  const rejectedCount = state.candidates.filter((candidate) => candidate.status === 'rejected').length;
  const canExport = !!selectedCandidate || state.candidates.some((candidate) => candidate.status === 'approved');

  return (
    <div className="workspace-view h-full overflow-auto bg-[#0a0f1c] px-5 py-4 text-white">
      <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[320px_1fr_380px]">
        <section className="workspace-shell rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">P8 Project</div>
          <h2 className="mt-3 text-xl font-semibold">{state.project.name}</h2>
          <div className="mt-2 flex items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] ${statusClass(state.project.status)}`}>
              {state.project.status}
            </span>
            <span className="text-xs text-white/40">Updated {formatTime(state.project.updatedAt)}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-2xl font-semibold">{state.candidates.length}</div>
              <div className="text-xs text-white/45">Candidates</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-2xl font-semibold">{reviewedCount}</div>
              <div className="text-xs text-white/45">Reviewed</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-2xl font-semibold text-emerald-200">{approvedCount}</div>
              <div className="text-xs text-white/45">Approved</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-2xl font-semibold text-rose-200">{rejectedCount}</div>
              <div className="text-xs text-white/45">Rejected</div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Storyboard Link</div>
            <div className="mt-2 text-sm text-white/80">{activeStoryboard?.name ?? 'No storyboard'}</div>
            <div className="mt-1 text-xs text-white/45">
              {activeStoryboard?.shots.length ?? 0} shots ready for export context
            </div>
          </div>

          <button
            type="button"
            onClick={captureCanvasMedia}
            disabled={mediaElements.length === 0}
            className="mt-5 w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/35"
          >
            Capture Canvas Media ({mediaElements.length})
          </button>
        </section>

        <section className="workspace-shell min-h-[560px] rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">Review Board</div>
              <h2 className="mt-2 text-lg font-semibold">Output candidates</h2>
            </div>
            {selectedCandidate && (
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">
                Best: {candidateLabel(selectedCandidate, elements)}
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {state.candidates.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-10 text-center">
                <div className="text-sm text-white/70">No candidates yet</div>
                <div className="mt-1 text-xs text-white/40">
                  Capture canvas images or videos to start review.
                </div>
              </div>
            )}

            {state.candidates.map((candidate) => (
              <article
                key={candidate.id}
                className={`rounded-xl border p-3 ${
                  candidate.selected
                    ? 'border-emerald-300/40 bg-emerald-400/10'
                    : 'border-white/10 bg-black/20'
                }`}
              >
                <div className="flex gap-3">
                  <CandidatePreview candidate={candidate} elements={elements} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-medium">{candidateLabel(candidate, elements)}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass(candidate.status)}`}>
                        {candidate.status}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/45">
                        {candidate.mediaType}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {candidate.model || candidate.provider || candidate.elementId || candidate.id}
                    </div>
                    <textarea
                      value={candidate.reviewNotes ?? ''}
                      onChange={(event) => updateNotes(candidate.id, event.target.value)}
                      placeholder="Review notes, rejection reason, or publishing instructions"
                      className="mt-3 min-h-16 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/30 focus:border-cyan-300/50"
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => markBest(candidate.id)}
                    className="rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-200"
                  >
                    Mark Best
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectCandidate(candidate.id)}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-rose-400/20 hover:text-rose-100"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-shell rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Export Center</div>
          <h2 className="mt-2 text-lg font-semibold">Package handoff</h2>

          <div className="mt-4 space-y-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => createExport(preset.id)}
                disabled={!canExport}
                className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-cyan-300/40 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-white/90">{preset.label}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-white/45">
                    {preset.target}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {[preset.resolution, preset.aspectRatio, preset.fps ? `${preset.fps}fps` : null]
                    .filter(Boolean)
                    .join(' / ') || 'JSON manifest'}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Active Export</div>
            {activePlan ? (
              <>
                <div className="mt-2 text-sm text-white/80">
                  {presets.find((preset) => preset.id === activePlan.presetId)?.label ?? activePlan.presetId}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {activePlan.candidateIds.length} candidates / {activePlan.status}
                </div>
                <button
                  type="button"
                  onClick={createPackage}
                  className="mt-3 w-full rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-cyan-200"
                >
                  Create Publishing Package
                </button>
              </>
            ) : (
              <div className="mt-2 text-sm text-white/45">
                Pick an export preset after choosing a best output.
              </div>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-white/40">Latest Package</div>
            {activePackage ? (
              <>
                <div className="mt-2 text-sm text-white/85">{activePackage.manifest.projectName}</div>
                <div className="mt-1 text-xs text-white/45">
                  {activePackage.manifest.presetLabel} / {activePackage.manifest.candidateCount} files
                </div>
                <div className="mt-3 rounded-lg bg-white/5 p-2 text-[11px] text-white/55">
                  Target {activePackage.manifest.target}; storyboard shots {activePackage.manifest.storyboardShotCount ?? 0}
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-white/45">
                No publishing package yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
