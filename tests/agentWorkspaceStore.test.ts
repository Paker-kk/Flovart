import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultAgentLayout, useAgentWorkspaceStore } from '../components/agent/agentWorkspaceStore';

describe('Agent workspace layout', () => {
  beforeEach(() => useAgentWorkspaceStore.setState({ layouts: {} }));

  it('starts with Production Crew status instead of a second conversation', () => {
    const layout = createDefaultAgentLayout();
    expect(layout.panels.map(panel => panel.kind)).toEqual(['brief', 'crew', 'activity', 'artifacts']);
    expect(layout.panels.find(panel => panel.kind === 'crew')?.title).toBe('Production Crew');
  });

  it('keeps panel geometry isolated per Workflow project', () => {
    const store = useAgentWorkspaceStore.getState();
    store.ensureLayout('one');
    store.ensureLayout('two');
    store.updatePanel('one', 'brief', { x: 888 });

    expect(useAgentWorkspaceStore.getState().layouts.one.panels.find(panel => panel.id === 'brief')?.x).toBe(888);
    expect(useAgentWorkspaceStore.getState().layouts.two.panels.find(panel => panel.id === 'brief')?.x).toBe(0);
  });

  it('promotes a legacy main panel to Production Crew without dropping other panels', () => {
    useAgentWorkspaceStore.setState({
      layouts: {
        legacy: {
          viewport: { x: 0, y: 0, zoom: 1 },
          panels: [
            { id: 'codex-main', kind: 'brief', title: '旧主面板', status: 'idle', x: 10, y: 20, width: 500, height: 600, z: 2 },
            { id: 'codex-task', kind: 'activity', title: '旧任务面板', status: 'idle', x: 40, y: 50, width: 400, height: 500, z: 3 },
          ],
        },
      },
    });

    useAgentWorkspaceStore.getState().ensureLayout('legacy');
    const panels = useAgentWorkspaceStore.getState().layouts.legacy.panels;
    expect(panels.map(panel => [panel.id, panel.kind])).toEqual([
      ['crew-main', 'crew'],
      ['codex-task', 'activity'],
    ]);
    expect(panels[0]).toMatchObject({ x: 10, y: 20, width: 500, height: 600 });
  });
});
