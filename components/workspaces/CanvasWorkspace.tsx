import React from 'react';

interface CanvasWorkspaceProps {
  children: React.ReactNode;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({ children }) => (
  <div className="relative w-full h-full min-h-0">{children}</div>
);
