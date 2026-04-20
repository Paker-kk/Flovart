import React from 'react';

interface WorkflowWorkspaceProps {
  workflowPanel: React.ReactNode;
}

export const WorkflowWorkspace: React.FC<WorkflowWorkspaceProps> = ({ workflowPanel }) => (
  <div className="flex h-full min-h-0 flex-col px-4 pb-4">
    <div className="shrink-0 pb-3 flex items-center gap-2">
      <span className="text-sm font-semibold">⚡ Workflow Engine</span>
      <span className="text-xs opacity-50">Node-based generation pipeline</span>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--panel-border,#2A3140)]">
      {workflowPanel}
    </div>
  </div>
);
