import { create } from 'zustand';

import {
  bundledDeploymentProfile,
  fetchDeploymentProfile,
  type DeploymentProfile,
} from '../services/deploymentProfile';

interface DeploymentState {
  profile: DeploymentProfile;
  initialized: boolean;
  load: () => Promise<void>;
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  profile: bundledDeploymentProfile(),
  initialized: false,
  load: async () => {
    if (get().initialized) return;
    const bundled = bundledDeploymentProfile();
    if (bundled.mode !== 'enterprise') {
      set({ profile: bundled, initialized: true });
      return;
    }
    const profile = await fetchDeploymentProfile();
    set({ profile, initialized: true });
  },
}));
