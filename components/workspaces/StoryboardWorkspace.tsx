import React, { useCallback, useEffect, useState } from 'react';
import {
  addStoryboardShot,
  createStoryboardProject,
  loadStoryboardState,
  removeStoryboardShot,
  renameStoryboardProject,
  saveStoryboardState,
  selectStoryboardShot,
  updateStoryboardShot,
  type StoryboardStateSnapshot,
} from '../../utils/storyboardStore';

export const StoryboardWorkspace: React.FC = () => {
  const [state, setState] = useState<StoryboardStateSnapshot>(() => loadStoryboardState());
  const [editingName, setEditingName] = useState<string | null>(null);

  useEffect(() => {
    saveStoryboardState(state);
  }, [state]);

  const activeProject = state.projects.find((p) => p.id === state.activeStoryboardId) ?? state.projects[0] ?? null;

  const addProject = useCallback(() => {
    setState((prev) => {
      const project = createStoryboardProject();
      return { ...prev, projects: [...prev.projects, project], activeStoryboardId: project.id };
    });
  }, []);

  const addShot = useCallback(() => {
    if (!activeProject) return;
    setState((prev) => addStoryboardShot(prev, activeProject.id));
  }, [activeProject]);

  const isDark = true;

  return (
    <div className={`flex h-full flex-col ${isDark ? 'text-white' : 'text-neutral-900'}`}>
      <div className={`flex items-center gap-4 border-b px-6 py-3 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
        <span className="text-lg font-semibold">Storyboard</span>
        <button
          type="button"
          onClick={addProject}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-black/5 hover:bg-black/10'}`}
        >
          + New Project
        </button>
        <div className="ml-auto flex gap-1">
          {state.projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setState((prev) => ({ ...prev, activeStoryboardId: p.id }))}
              onDoubleClick={() => setEditingName(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                p.id === state.activeStoryboardId
                  ? isDark ? 'bg-white text-black' : 'bg-neutral-900 text-white'
                  : isDark ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/5'
              }`}
            >
              {editingName === p.id ? (
                <input
                  value={p.name}
                  autoFocus
                  onChange={(e) => setState((prev) => renameStoryboardProject(prev, p.id, e.target.value))}
                  onBlur={() => setEditingName(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(null); }}
                  className="bg-transparent border-b border-white/30 outline-none max-w-[120px] text-xs"
                  title="Project name"
                />
              ) : (
                <span>{p.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {activeProject ? (
        <div className="flex flex-1 min-h-0">
          <div className={`w-56 border-r overflow-y-auto ${isDark ? 'border-white/10' : 'border-neutral-200'} p-3 space-y-2`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold opacity-50">SHOTS</span>
              <button type="button" onClick={addShot} className="text-xs opacity-60 hover:opacity-100">+ Add</button>
            </div>
            {activeProject.shots.map((shot) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => setState((prev) => selectStoryboardShot(prev, activeProject.id, shot.id))}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                  shot.id === activeProject.activeShotId
                    ? isDark ? 'bg-white/10' : 'bg-black/5'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="font-medium truncate">{shot.title}</div>
                <div className={`mt-0.5 ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>
                  {shot.aspectRatio} / {shot.durationSec}s / {shot.status}
                </div>
              </button>
            ))}
            {activeProject.shots.length === 0 && (
              <div className="text-xs opacity-40 text-center py-4">No shots yet</div>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center p-6">
            {(() => {
              const activeShot = activeProject.shots.find((s) => s.id === activeProject.activeShotId);
              if (!activeShot) {
                return (
                  <div className="text-center opacity-40">
                    <div className="text-3xl mb-2">🎬</div>
                    <div className="text-sm">Select a shot or add a new one</div>
                  </div>
                );
              }
              return (
                <div className={`w-full max-w-lg rounded-2xl border p-6 space-y-4 ${isDark ? 'border-white/10 bg-white/5' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div className="flex items-center justify-between">
                    <input
                      value={activeShot.title}
                      onChange={(e) => setState((prev) => updateStoryboardShot(prev, activeProject.id, activeShot.id, { title: e.target.value }))}
                      className="bg-transparent text-lg font-semibold outline-none w-full"
                      placeholder="Shot title"
                      title="Shot title"
                    />
                    <button
                      type="button"
                      onClick={() => setState((prev) => removeStoryboardShot(prev, activeProject.id, activeShot.id))}
                      className="text-xs opacity-40 hover:opacity-100 hover:text-red-400 ml-2 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider opacity-40">Prompt</label>
                    <textarea
                      value={activeShot.prompt}
                      onChange={(e) => setState((prev) => updateStoryboardShot(prev, activeProject.id, activeShot.id, { prompt: e.target.value }))}
                      className={`mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200 bg-white'}`}
                      rows={3}
                      placeholder="Describe this shot..."
                      title="Shot prompt"
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <label className="opacity-40">Aspect</label>
                      <select
                        value={activeShot.aspectRatio}
                        onChange={(e) => setState((prev) => updateStoryboardShot(prev, activeProject.id, activeShot.id, { aspectRatio: e.target.value }))}
                        className={`ml-2 rounded border px-1 py-0.5 text-xs ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200'}`}
                        title="Aspect ratio"
                      >
                        {['16:9', '9:16', '1:1', '4:3'].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="opacity-40">Duration</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={activeShot.durationSec}
                        onChange={(e) => setState((prev) => updateStoryboardShot(prev, activeProject.id, activeShot.id, { durationSec: Number(e.target.value) || 4 }))}
                        className={`ml-2 w-14 rounded border px-1 py-0.5 text-xs ${isDark ? 'border-white/10 bg-black/20' : 'border-neutral-200'}`}
                        title="Duration in seconds"
                      />
                      <span className="ml-1 opacity-40">s</span>
                    </div>
                    <div>
                      <label className="opacity-40">Status</label>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        activeShot.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' :
                        activeShot.status === 'draft' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-neutral-500/20 text-neutral-400'
                      }`}>
                        {activeShot.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center opacity-40 text-sm">
          Create a project to get started
        </div>
      )}
    </div>
  );
};
