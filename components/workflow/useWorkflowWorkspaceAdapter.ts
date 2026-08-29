import { useEffect, useRef } from 'react';
import { subscribeBrowserWorkflowBinding } from '../../services/browserWorkflowBinding';
import { WorkflowWorkspaceAdapter } from '../../services/workflowWorkspaceAdapter';
import type { WorkflowProject } from './types';

const EMPTY_WORKFLOW_SNAPSHOT = {
  id: null,
  title: 'Workflow',
  nodes: [],
  connections: [],
  selectedNodeIds: [],
};

type WorkspaceAdapter = Pick<WorkflowWorkspaceAdapter, 'start' | 'update' | 'stop'>;
const createWorkspaceAdapter = (): WorkspaceAdapter => new WorkflowWorkspaceAdapter();

export function useWorkflowWorkspaceAdapter(
  project: WorkflowProject | null,
  createAdapter: () => WorkspaceAdapter = createWorkspaceAdapter,
) {
  const adapter = useRef<WorkspaceAdapter | null>(null);
  const snapshot = project || EMPTY_WORKFLOW_SNAPSHOT;
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;

  useEffect(() => {
    const current = createAdapter();
    adapter.current = current;
    const start = () => current.start(latestSnapshot.current).catch(error => {
      console.warn('Managed Agent auto-connect unavailable.', error);
    });
    void start();
    const unsubscribe = subscribeBrowserWorkflowBinding(() => {
      current.stop();
      void start();
    });
    return () => {
      unsubscribe();
      current.stop();
      if (adapter.current === current) adapter.current = null;
    };
  }, []);

  useEffect(() => {
    adapter.current?.update(snapshot);
  }, [snapshot]);
}
