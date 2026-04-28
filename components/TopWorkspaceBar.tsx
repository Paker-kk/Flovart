import React from 'react';

const Tabs = ({ active, onChange }: { active: string; onChange: (v: string) => void }) => (
  <div className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
    {[
      { key: 'canvas', label: 'Canvas' },
      { key: 'workflow', label: 'Workflow' },
    ].map(({ key, label }) => {
      const isActive = key === active;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
            isActive
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export const TopWorkspaceBar: React.FC<{
  activeView: string;
  onChangeView: (v: string) => void;
  theme?: string;
  onOpenSettings?: () => void;
  appVersionLabel?: string;
}> = ({ activeView, onChangeView, onOpenSettings, appVersionLabel }) => (
  <div className="flex items-center justify-between px-4 py-2 select-none">
    {/* Left: logo */}
    <div className="flex items-center min-w-[120px]">
      <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
        Flovart
      </span>
    </div>

    {/* Center: tab switcher */}
    <Tabs active={activeView} onChange={onChangeView} />

    {/* Right: settings */}
    <div className="flex items-center gap-3 min-w-[120px] justify-end">
      {appVersionLabel && (
        <span className="text-[11px] tabular-nums text-neutral-400">{appVersionLabel}</span>
      )}
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-[13px] text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          Settings
        </button>
      )}
    </div>
  </div>
);
