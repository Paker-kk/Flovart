import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateWorkflowPersistedState, WORKFLOW_BACKUP_KEY, WORKFLOW_PERSISTENCE_VERSION } from '../components/workflow/migrations';
import { useWorkflowStore, WORKFLOW_STORE_KEY } from '../components/workflow/store';
import { workflowStorage } from '../components/workflow/storage';

const legacyProject = {
  id: 'legacy-a',
  title: '旧项目 A',
  nodes: [{ id: 'plugin-node', type: 'plugin:storyboard', title: '插件节点', position: { x: 12, y: 24 }, metadata: { pluginData: { version: 1 } } }],
  connections: [],
  selectedNodeIds: ['plugin-node', 'missing'],
  viewport: { x: 4, y: 8, k: 1.25 },
  agentSessions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('workflow persistence migrations', () => {
  beforeEach(async () => {
    await workflowStorage.clear();
    useWorkflowStore.setState({ hydrated: false, projects: [], activeProjectId: null });
  });

  it('migrates old project shapes without deleting unknown plugin nodes', async () => {
    const result = await migrateWorkflowPersistedState({ projects: [legacyProject], activeProjectId: legacyProject.id }, 0);
    expect(result.activeProjectId).toBe('legacy-a');
    expect(result.projects[0]).toMatchObject({
      draftVersion: 1,
      selectedNodeIds: ['plugin-node'],
      nodes: [{ id: 'plugin-node', type: 'plugin:storyboard', objectVersion: 1, isVisible: true, isLocked: false }],
    });
    expect(await workflowStorage.get(WORKFLOW_BACKUP_KEY)).toMatchObject({ version: 0, state: { activeProjectId: 'legacy-a' } });
  });

  it('accepts a second legacy shape with missing optional collections and filters broken edges', async () => {
    const result = await migrateWorkflowPersistedState({
      projects: [{ ...legacyProject, id: 'legacy-b', nodes: [{ ...legacyProject.nodes[0], id: 'node-b', width: 0, height: -1 }], connections: [{ fromNodeId: 'node-b', toNodeId: 'missing' }] }],
      activeProjectId: 'legacy-b',
    }, 0);
    expect(result.projects[0]).toMatchObject({ id: 'legacy-b', draftVersion: 1, draftChangeSets: [], draftRedoStack: [], workflowMutationReceipts: [], connections: [] });
    expect(result.projects[0].nodes[0]).toMatchObject({ width: 320, height: 200 });
  });

  it('writes the backup before a migration exception and leaves source state untouched', async () => {
    const legacyState = { projects: [{ ...legacyProject, nodes: [{ id: 'broken', type: null }] }], activeProjectId: 'legacy-a' };
    await expect(migrateWorkflowPersistedState(legacyState, 0)).rejects.toThrow('缺少 id 或 type');
    expect(await workflowStorage.get(WORKFLOW_BACKUP_KEY)).toMatchObject({ version: 0, state: legacyState });
  });

  it('does not replace the source when taking a backup fails', async () => {
    const failure = new Error('storage unavailable');
    vi.spyOn(workflowStorage, 'set').mockRejectedValueOnce(failure);
    await expect(migrateWorkflowPersistedState({ projects: [legacyProject], activeProjectId: legacyProject.id }, 0)).rejects.toBe(failure);
  });

  it('rehydrates a legacy storage envelope through the store migration and writes the current version', async () => {
    await workflowStorage.set(WORKFLOW_STORE_KEY, { state: { projects: [legacyProject], activeProjectId: legacyProject.id }, version: 0 });
    await useWorkflowStore.persist.rehydrate();
    expect(useWorkflowStore.getState().projects[0].nodes[0].type).toBe('plugin:storyboard');
    const persisted = await workflowStorage.get<{ version: number }>(WORKFLOW_STORE_KEY);
    expect(persisted?.version).toBe(WORKFLOW_PERSISTENCE_VERSION);
  });
});
