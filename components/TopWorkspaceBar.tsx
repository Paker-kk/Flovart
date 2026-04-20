import React from 'react';
import type { WorkspaceView } from '../types';

const ITEMS: ReadonlyArray<{ key: WorkspaceView; label: string; icon: string }> = [
  { key: 'canvas', label: 'Canvas', icon: '🎨' },
  { key: 'workflow', label: 'Workflow', icon: '⚡' },
  { key: 'storyboard', label: 'Storyboard', icon: '🎬' },
  { key: 'assets', label: 'Assets', icon: '📦' },
];

interface TopWorkspaceBarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  theme: 'light' | 'dark';
  onOpenSettings?: () => void;
  appVersionLabel?: string;
}

export const TopWorkspaceBar: React.FC<TopWorkspaceBarProps> = ({
  activeView,
  onChangeView,
  theme,
  onOpenSettings,
  appVersionLabel,
}) => {
  const isDark = theme === 'dark';

  return (
    <div className="px-3 pt-2 pb-1 select-none" style={{ zIndex: 60 }}>
      <div
        className={`mx-auto flex max-w-[1600px] items-center justify-between rounded-2xl border px-3 py-1.5 backdrop-blur-xl transition-colors duration-200 ${
          isDark
            ? 'border-[#2A3140] bg-[#11161F]/85 text-white'
            : 'border-neutral-200 bg-white/85 text-neutral-900'
        }`}
      >
        {/* Left: Logo + Tabs */}
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold tracking-wide whitespace-nowrap">
            Flovart Studio
          </div>
          <div
            className={`flex items-center gap-0.5 rounded-xl p-0.5 ${
              isDark ? 'bg-white/5' : 'bg-black/5'
            }`}
          >
            {ITEMS.map((item) => {
              const active = item.key === activeView;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChangeView(item.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    active
                      ? isDark
                        ? 'bg-white text-black shadow-sm'
                        : 'bg-neutral-900 text-white shadow-sm'
                      : isDark
                        ? 'text-[#98A2B3] hover:text-white hover:bg-white/5'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/5'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: version + settings */}
        <div className="flex items-center gap-2">
          {appVersionLabel && (
            <span className={`text-[10px] tabular-nums ${isDark ? 'text-[#555]' : 'text-neutral-400'}`}>
              {appVersionLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-white/70' : 'bg-black/5 hover:bg-black/10 text-neutral-600'
            }`}
          >
            ⚙ Settings
          </button>
        </div>
      </div>
    </div>
  );
};
