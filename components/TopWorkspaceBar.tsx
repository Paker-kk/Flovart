import React from 'react';
import { WorkspaceSwitcher } from './canvas-ui/CanvasChrome';

export const TopWorkspaceBar: React.FC<{
  activeView: string;
  onChangeView: (v: string) => void;
  theme?: string;
  onOpenSettings?: () => void;
  appVersionLabel?: string;
}> = ({ activeView, onChangeView }) => (
  <div className="pointer-events-none flex items-center justify-center px-4 py-2 select-none">
    <WorkspaceSwitcher
      activeView={activeView}
      onChangeView={onChangeView}
      className="pointer-events-auto"
    />
  </div>
);
