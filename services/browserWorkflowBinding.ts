import type { ManagedAgentConnection } from './managedAgentConnection';

type BindingListener = () => void;

let browserWorkflowBinding: ManagedAgentConnection | null = null;
const listeners = new Set<BindingListener>();

function sameBinding(left: ManagedAgentConnection | null, right: ManagedAgentConnection | null) {
  return left?.url === right?.url && left?.token === right?.token && left?.managed === right?.managed;
}

export function getBrowserWorkflowBinding() {
  return browserWorkflowBinding;
}

export function setBrowserWorkflowBinding(connection: ManagedAgentConnection | null) {
  if (sameBinding(browserWorkflowBinding, connection)) return;
  browserWorkflowBinding = connection;
  listeners.forEach(listener => listener());
}

export function subscribeBrowserWorkflowBinding(listener: BindingListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
