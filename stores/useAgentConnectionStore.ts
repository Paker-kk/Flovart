import { create } from 'zustand';

export type AgentConnectionStatus = 'connecting' | 'ready' | 'offline' | 'auth_failed' | 'error';
export type AgentWriterStatus = 'unknown' | 'active' | 'inactive' | 'revoked';

interface AgentConnectionState {
  status: AgentConnectionStatus;
  url: string | null;
  clientId: string | null;
  projectId: string | null;
  revision: number | null;
  writerStatus: AgentWriterStatus;
  writerClientId: string | null;
  writerProjectId: string | null;
  activeHostIdentity: string | null;
  activeHostProjectId: string | null;
  error: string | null;
  setStatus: (status: AgentConnectionStatus, patch?: Partial<Pick<AgentConnectionState, 'url' | 'clientId' | 'projectId' | 'revision' | 'writerStatus' | 'writerClientId' | 'writerProjectId' | 'activeHostIdentity' | 'activeHostProjectId' | 'error'>>) => void;
  reset: () => void;
}

const initialState = {
  status: 'offline' as AgentConnectionStatus,
  url: null,
  clientId: null,
  projectId: null,
  revision: null,
  writerStatus: 'unknown' as AgentWriterStatus,
  writerClientId: null,
  writerProjectId: null,
  activeHostIdentity: null,
  activeHostProjectId: null,
  error: null,
};

export const useAgentConnectionStore = create<AgentConnectionState>(set => ({
  ...initialState,
  setStatus: (status, patch = {}) => set({ status, ...patch }),
  reset: () => set(initialState),
}));
