import React from 'react';

interface AppShellProps {
  topBar: React.ReactNode;
  leftSidebar?: React.ReactNode;
  main: React.ReactNode;
  rightSidebar?: React.ReactNode;
  themeBackground: string;
  overlays?: React.ReactNode;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  topBar,
  leftSidebar,
  main,
  rightSidebar,
  themeBackground,
  overlays,
  onDragOver,
  onDrop,
}) => (
  <div
    className="theme-aware w-screen h-screen flex flex-col font-sans"
    style={{ backgroundColor: themeBackground }}
    onDragOver={onDragOver}
    onDrop={onDrop}
  >
    <div className="shrink-0">{topBar}</div>
    <div className="min-h-0 flex flex-1 relative">
      {leftSidebar && <div className="shrink-0">{leftSidebar}</div>}
      <div className="min-w-0 min-h-0 flex-1 relative">{main}</div>
      {rightSidebar && <div className="shrink-0">{rightSidebar}</div>}
    </div>
    {overlays}
  </div>
);
