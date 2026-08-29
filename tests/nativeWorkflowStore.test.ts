import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NativeWorkflowStore } from '../agent/native-workspace.js'

const temporaryStores: string[] = []

afterEach(() => {
  while (temporaryStores.length) rmSync(temporaryStores.pop()!, { recursive: true, force: true })
})

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), 'flovart-native-workflow-'))
  temporaryStores.push(directory)
  return new NativeWorkflowStore({ file: join(directory, 'workflow.json') })
}

describe('NativeWorkflowStore', () => {
  it('activates without inventing a blank project before a Production Brief exists', () => {
    const store = createStore()

    expect(store.activate()).toMatchObject({ enabled: true, hasWorkflow: false, activeProjectId: null, projects: [] })
  })

  it('creates a durable native project and applies graph commands', () => {
    const store = createStore()
    store.activate()
    const projectId = store.execute('workflow.project.create', { title: '测试项目' }, 'operator', 'create-project').result.projectId
    const textNode = store.execute('workflow.node.create', { projectId, type: 'text', title: '脚本', x: 20, y: 30 }, 'operator', 'create-text')
    const imageNode = store.execute('workflow.node.create', { projectId, type: 'image', title: '关键帧', x: 420, y: 30 }, 'operator', 'create-image')

    expect(textNode.ok).toBe(true)
    expect(imageNode.ok).toBe(true)
    const connection = store.execute('workflow.connect', {
      projectId,
      fromNodeId: textNode.result.nodeId,
      toNodeId: imageNode.result.nodeId,
    }, 'operator', 'connect')
    const inspected = store.execute('workflow.inspect', { projectId }, 'operator', 'inspect')

    expect(connection.ok).toBe(true)
    expect(inspected.result.nodes).toHaveLength(2)
    expect(inspected.result.connections).toHaveLength(1)
    expect(inspected.result.draftVersion).toBeGreaterThan(1)

    store.execute('workflow.select', { projectId, ids: [imageNode.result.nodeId] }, 'operator', 'select')
    const selection = store.execute('workflow.selection.get', { projectId }, 'operator', 'selection')
    expect(selection).toMatchObject({
      ok: true,
      result: {
        projectId,
        selectedNodeIds: [imageNode.result.nodeId],
        nodes: [expect.objectContaining({ id: imageNode.result.nodeId })],
      },
    })
  })

  it('rejects cycles, supports idempotency, and reloads persisted state', () => {
    const store = createStore()
    store.activate()
    const projectId = store.execute('workflow.project.create', { title: '测试项目' }, 'operator', 'create-project').result.projectId
    const first = store.execute('workflow.node.create', { projectId, type: 'text', title: 'A' }, 'agent', 'same-key')
    const replay = store.execute('workflow.node.create', { projectId, type: 'text', title: 'A' }, 'agent', 'same-key')
    const second = store.execute('workflow.node.create', { projectId, type: 'text', title: 'B', x: 400 }, 'agent', 'second')
    store.execute('workflow.connect', { projectId, fromNodeId: first.result.nodeId, toNodeId: second.result.nodeId }, 'agent', 'forward')
    const cycle = store.execute('workflow.connect', { projectId, fromNodeId: second.result.nodeId, toNodeId: first.result.nodeId }, 'agent', 'cycle')
    const reloaded = new NativeWorkflowStore({ file: join(temporaryStores[0], 'workflow.json') })
    const inspected = reloaded.execute('workflow.inspect', { projectId }, 'operator', 'reload')

    expect(replay).toEqual(first)
    expect(cycle.ok).toBe(false)
    expect(inspected.result.nodes).toHaveLength(2)
    expect(inspected.result.connections).toHaveLength(1)
  })

  it('supports the stable apply surface while keeping native execution explicit', () => {
    const store = createStore()
    store.activate()
    const projectId = store.execute('workflow.project.create', { title: '稳定工具面测试' }, 'operator', 'create-project').result.projectId
    const applied = store.execute('workflow.apply', {
      projectId,
      expectedRevision: 1,
      mutationId: 'stable-apply-v1',
      operations: [{
        type: 'add_node',
        node: { id: 'stable-node', type: 'text', title: '稳定节点', position: { x: 120, y: 80 } },
      }],
    }, 'operator', 'stable-apply-key')
    const replay = store.execute('workflow.apply', {
      projectId,
      expectedRevision: 1,
      mutationId: 'stable-apply-v1',
      operations: [{
        type: 'add_node',
        node: { id: 'stable-node', type: 'text', title: '稳定节点', position: { x: 120, y: 80 } },
      }],
    }, 'operator', 'stable-apply-key')
    const inspected = store.execute('workflow.inspect', { projectId }, 'operator', 'stable-inspect')
    const run = store.execute('workflow.node.run', { projectId, nodeId: 'stable-node' }, 'operator', 'stable-run')

    expect(applied).toMatchObject({ ok: true, result: { projectId, mutationId: 'stable-apply-v1', draftVersion: 2, operationCount: 1 } })
    expect(replay).toEqual(applied)
    expect(inspected.result.nodes).toHaveLength(1)
    expect(run).toMatchObject({ ok: false, error: { code: 'RUNNER_UNAVAILABLE' } })
  })
})
