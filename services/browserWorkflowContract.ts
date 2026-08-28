import { dispatchWorkflowCommand, type WorkflowCommandEnvelope, type WorkflowCommandResult } from './workflowDispatcher';

export const BROWSER_WORKFLOW_CONTRACT_VERSION = 'flovart.browser-workflow/1' as const;

export interface BrowserWorkflowContract {
  readonly version: typeof BROWSER_WORKFLOW_CONTRACT_VERSION;
  dispatch(envelope: WorkflowCommandEnvelope): Promise<WorkflowCommandResult>;
}

export function createBrowserWorkflowContract(
  dispatch: (envelope: WorkflowCommandEnvelope) => Promise<WorkflowCommandResult> = dispatchWorkflowCommand,
): BrowserWorkflowContract {
  return Object.freeze({
    version: BROWSER_WORKFLOW_CONTRACT_VERSION,
    dispatch,
  });
}
