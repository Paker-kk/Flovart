import React from 'react';

interface WorkflowWorkspaceProps {
  workflowPanel: React.ReactNode;
}

export const WorkflowWorkspace: React.FC<WorkflowWorkspaceProps> = ({ workflowPanel }) => (
  <div className="h-full min-h-0 overflow-hidden">
    <div className="relative h-full min-h-0 overflow-hidden">
      {workflowPanel}
    </div>
  </div>
);
