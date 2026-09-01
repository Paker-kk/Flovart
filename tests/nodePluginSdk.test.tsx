import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWorkflowNode } from '../components/workflow/constants';
import { findWorkflowNodeDefinition } from '../components/workflow/resourceContract';
import type { WorkflowNodePluginDefinition } from '../components/workflow/nodePluginSdk';
import {
  createWorkflowNodePluginContext,
  disableWorkflowNodePlugin,
  enableWorkflowNodePlugin,
  getWorkflowNodePlugin,
  installReferenceWorkflowNodePlugins,
  installWorkflowNodePlugin,
  referenceWorkflowNodePlugins,
  rollbackWorkflowNodePlugin,
  uninstallWorkflowNodePlugin,
  updateWorkflowNodePlugin,
  workflowNodePluginRegistry,
} from '../components/workflow/nodePluginSdk';

afterEach(() => {
  uninstallWorkflowNodePlugin('test.plugin');
  installReferenceWorkflowNodePlugins();
});

function testPlugin(version = '1.0.0'): WorkflowNodePluginDefinition {
  return {
    pluginId: 'test.plugin',
    type: 'plugin:test',
    version,
    title: '测试插件',
    outputs: node => node.metadata.content ? [{ resourceId: `${node.id}:output:0`, title: node.title, kind: 'text', locator: { kind: 'inline-text', text: node.metadata.content } }] : [],
    render: ({ node }) => <div>插件内容：{node.metadata.content || '空白'}</div>,
    panel: () => <span>插件面板</span>,
    toolbar: () => <button type="button">插件工具</button>,
  };
}

describe('Workflow Node Plugin SDK', () => {
  it('ships the three reference plugins with independent types and output contracts', () => {
    expect(referenceWorkflowNodePlugins.map(plugin => plugin.pluginId)).toEqual([
      'flovart.markdown',
      'flovart.storyboard-card',
      'flovart.style-bible',
    ]);
    expect(workflowNodePluginRegistry.list().filter(plugin => plugin.pluginId.startsWith('flovart.'))).toHaveLength(3);
    expect(findWorkflowNodeDefinition('plugin:markdown')?.type).toBe('plugin:markdown');
  });

  it('uses one host context for graph reads, mutation ops, storage and events', async () => {
    installWorkflowNodePlugin(testPlugin());
    const source = createWorkflowNode('source', 'text', { x: 0, y: 0 }, { content: '上游' });
    const node = createWorkflowNode('custom', 'plugin:test', { x: 300, y: 0 }, { content: '当前' });
    const applyOps = vi.fn(() => true);
    const context = createWorkflowNodePluginContext({
      project: { id: 'project-1', nodes: [source, node], connections: [{ id: 'edge', fromNodeId: source.id, toNodeId: node.id }] },
      node,
      pluginId: 'test.plugin',
      applyOps,
    });

    const copied = context.getNodes()[1];
    copied.metadata.content = '插件不能改宿主快照';
    expect(node.metadata.content).toBe('当前');
    expect(context.getUpstream().map(item => item.id)).toEqual(['source']);
    expect(context.updateMetadata({ prompt: '更新' })).toBe(true);
    expect(applyOps).toHaveBeenCalledWith([{ type: 'update_node', id: 'custom', metadata: { prompt: '更新' } }]);

    await context.storage.set('draft', { value: 1 });
    expect(await context.storage.get<{ value: number }>('draft')).toEqual({ value: 1 });
    const received: unknown[] = [];
    const off = context.events.on('test', payload => received.push(payload));
    context.events.emit('test', { ok: true });
    off();
    context.events.emit('test', { ok: false });
    expect(received).toEqual([{ ok: true }]);
    await context.storage.remove('draft');
    expect(await context.storage.get('draft')).toBeUndefined();
  });

  it('supports install, disable, update and uninstall without deleting the project node', () => {
    const node = createWorkflowNode('custom', 'plugin:test', { x: 0, y: 0 }, { content: '保留' });
    installWorkflowNodePlugin(testPlugin());
    expect(getWorkflowNodePlugin(node.type)?.version).toBe('1.0.0');
    disableWorkflowNodePlugin('test.plugin');
    expect(getWorkflowNodePlugin(node.type)).toBeUndefined();
    enableWorkflowNodePlugin('test.plugin');
    expect(getWorkflowNodePlugin(node.type)?.version).toBe('1.0.0');
    updateWorkflowNodePlugin(testPlugin('1.1.0'));
    expect(getWorkflowNodePlugin(node.type)?.version).toBe('1.1.0');
    expect(rollbackWorkflowNodePlugin('test.plugin')).toMatchObject({ version: '1.0.0', enabled: true });
    expect(getWorkflowNodePlugin(node.type)?.version).toBe('1.0.0');
    expect(uninstallWorkflowNodePlugin('test.plugin')).toBe(true);
    expect(node.metadata.content).toBe('保留');
  });

  it('rejects invalid plugin contracts and does not create a half-installed entry', () => {
    expect(() => installWorkflowNodePlugin({
      ...testPlugin(), pluginId: 'test.invalid-renderer', render: undefined as never,
    })).toThrow('outputs 与 render');
    expect(() => installWorkflowNodePlugin({
      ...testPlugin(), pluginId: 'test.invalid-version', version: '   ',
    })).toThrow('version');
    expect(workflowNodePluginRegistry.list().some(plugin => plugin.pluginId === 'test.invalid-renderer')).toBe(false);
    expect(() => rollbackWorkflowNodePlugin('test.plugin')).toThrow('尚未安装');
  });

  it('renders a reference plugin through the SDK render contract', () => {
    const plugin = getWorkflowNodePlugin('plugin:markdown');
    const node = createWorkflowNode('markdown', 'plugin:markdown', { x: 0, y: 0 }, { content: '风格说明' });
    const context = createWorkflowNodePluginContext({
      project: { id: 'project-render', nodes: [node], connections: [] },
      node,
      pluginId: plugin!.pluginId,
      applyOps: () => true,
    });
    render(<>{plugin!.render({ node, context })}</>);
    expect(screen.getByText('风格说明')).toBeInTheDocument();
  });
});
