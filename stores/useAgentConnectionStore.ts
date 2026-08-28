import { create } from 'zustand';

export type AgentConnectionStatus = 'connecting' | 'ready' | 'offline' | 'auth_failed' | 'error';

interface AgentConnectionState {
  status: AgentConnectionStatus;
  url: string | null;
  clientId: string | null;
  projectId: string | null;
  revision: number | null;
  error: string | null;
  setStatus: (status: AgentConnectionStatus, patch?: Partial<Pick<AgentConnectionState, 'url' | 'clientId' | 'projectId' | 'revision' | 'error'>>) => void;
  reset: () => void;
}

const initialState = {
  status: 'offline' as AgentConnectionStatus,
  url: null,
  clientId: null,
  projectId: null,
  revision: null,
  error: null,
};

export const useAgentConnectionStore = create<AgentConnectionState>(set => ({
  ...initialState,
  setStatus: (status, patch = {}) => set({ status, ...patch }),
  reset: () => set(initialState),
}));
