/**
 * useBoardStore — Spatial Node Graph State (ADR-003 Isolation Protocol)
 *
 * Single source of truth for the AI pipeline board.
 * React Flow renders a read-only projection of this state.
 * External CLI/MCP modifies this state → React Flow auto-renders.
 *
 * Key ADR-003 rules:
 * - Undo/Redo only touches Zustand metadata, never IndexedDB blobs.
 * - STORYBOARD_TABLE runtimePayload is excluded from localStorage persistence.
 * - Candidates live inside parent node outputs, never as separate SpatialNodes.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SpatialNode,
  SpatialEdge,
  SpatialNodeType,
  NodeExecutionStatus,
  StaticAssetNode,
  PromptTextNode,
  GenerateImageNode,
  GenerateVideoNode,
  StoryboardTableNode,
  RowExecution,
} from '../types';

// ─── Helpers ─────────────────────────────────

let _nextId = 0;
export function generateNodeId(): string {
  return `node_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

function generateEdgeId(): string {
  return `edge_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

function makeBase(
  type: SpatialNodeType,
  partial: Partial<SpatialNode> = {},
): { id: string; type: SpatialNodeType; x: number; y: number; width: number; height: number; dependencies: string[] } {
  return {
    id: partial.id || generateNodeId(),
    type,
    x: partial.x ?? 100,
    y: partial.y ?? 100,
    width: partial.width ?? 280,
    height: partial.height ?? 200,
    dependencies: (partial as any).dependencies ?? [],
  };
}

export function createStaticAssetNode(partial: Partial<StaticAssetNode> = {}): StaticAssetNode {
  return {
    ...makeBase('STATIC_ASSET', partial),
    type: 'STATIC_ASSET',
    inputs: { src: '', ...partial.inputs },
    outputs: { blobId: '', ...partial.outputs },
  };
}

export function createPromptTextNode(partial: Partial<PromptTextNode> = {}): PromptTextNode {
  return {
    ...makeBase('PROMPT_TEXT', partial),
    type: 'PROMPT_TEXT',
    inputs: { text: '', ...partial.inputs },
    outputs: { text: '', ...partial.outputs },
  };
}

export function createGenerateImageNode(partial: Partial<GenerateImageNode> = {}): GenerateImageNode {
  return {
    ...makeBase('GENERATE_IMAGE', partial),
    type: 'GENERATE_IMAGE',
    inputs: { prompt: '', aspectRatio: '16:9', ...partial.inputs },
    outputs: { candidates: [], ...partial.outputs },
    execution: { status: 'idle', ...partial.execution },
  };
}

export function createGenerateVideoNode(partial: Partial<GenerateVideoNode> = {}): GenerateVideoNode {
  return {
    ...makeBase('GENERATE_VIDEO', partial),
    type: 'GENERATE_VIDEO',
    inputs: { prompt: '', durationSec: 5, ...partial.inputs },
    outputs: { candidates: [], ...partial.outputs },
    execution: { status: 'idle', ...partial.execution },
  };
}

export function createStoryboardTableNode(partial: Partial<StoryboardTableNode> = {}): StoryboardTableNode {
  return {
    ...makeBase('STORYBOARD_TABLE', partial),
    type: 'STORYBOARD_TABLE',
    inputs: { templatePrompt: '', ...partial.inputs },
    execution: { status: 'idle', progressPercent: 0, summary: '0 rows', ...partial.execution },
  };
}

// ─── Priority Chain Algorithm ────────────────

const STATUS_PRIORITY: Record<NodeExecutionStatus, number> = {
  running: 5,
  queued: 4,
  error: 3,
  success: 2,
  idle: 1,
};

/**
 * Compute the aggregate status from an array of row-level statuses.
 * Priority chain: running > queued > error > success > idle
 */
export function computeAggregateStatus(rows: RowExecution[]): NodeExecutionStatus {
  if (rows.length === 0) return 'idle';
  let best: NodeExecutionStatus = 'idle';
  let bestPrio = 0;
  for (const row of rows) {
    const p = STATUS_PRIORITY[row.status];
    if (p > bestPrio) {
      bestPrio = p;
      best = row.status;
    }
    if (best === 'running') break; // can't go higher
  }
  return best;
}

/**
 * Build the execution summary for a storyboard table node.
 */
export function computeTableSummary(rows: RowExecution[]): {
  status: NodeExecutionStatus;
  progressPercent: number;
  summary: string;
  errorSummary?: string;
} {
  const total = rows.length;
  if (total === 0) return { status: 'idle', progressPercent: 0, summary: '0 rows' };

  let done = 0;
  let failed = 0;
  let running = 0;
  let queued = 0;
  let idle = 0;
  const errors: string[] = [];

  for (const r of rows) {
    switch (r.status) {
      case 'success': done++; break;
      case 'error': failed++; errors.push(`Row ${r.rowIndex}: ${r.errorMessage || 'unknown'}`); break;
      case 'running': running++; break;
      case 'queued': queued++; break;
      default: idle++; break;
    }
  }

  const status = computeAggregateStatus(rows);
  const progressPercent = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  const parts: string[] = [];
  if (done > 0) parts.push(`${done} done`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (running > 0) parts.push(`${running} running`);
  if (queued > 0) parts.push(`${queued} queued`);
  if (idle > 0) parts.push(`${idle} idle`);

  return {
    status,
    progressPercent,
    summary: parts.join(' · ') || 'idle',
    errorSummary: errors.length > 0 ? errors[0] : undefined,
  };
}

// ─── Store ──────────────────────────────────

interface HistorySnapshot {
  nodes: SpatialNode[];
  edges: SpatialEdge[];
}

interface BoardState {
  boardId: string | null;
  boardName: string;
  nodes: SpatialNode[];
  edges: SpatialEdge[];

  // Command-pattern history stack (ADR-003: metadata only, no IndexedDB ops)
  history: {
    past: HistorySnapshot[];
    future: HistorySnapshot[];
  };

  // Board lifecycle
  initBoard: (name: string) => void;

  // Node CRUD
  addNode: (node: SpatialNode) => SpatialNode;
  updateNode: (id: string, patch: Partial<SpatialNode>) => void;
  removeNode: (id: string) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;

  // Dependency management (ADR-003: independent dependency zone)
  addDependency: (nodeId: string, depNodeId: string) => void;
  removeDependency: (nodeId: string, depNodeId: string) => void;

  // Candidates (Gacha) management
  addCandidate: (nodeId: string, blobId: string) => void;
  setActiveCandidate: (nodeId: string, index: number) => void;
  promoteCandidate: (nodeId: string, candidateIndex: number) => SpatialNode | null;

  // Storyboard table row operations
  setTableRuntimePayload: (nodeId: string, payload: StoryboardTableNode['runtimePayload']) => void;
  updateRowExecution: (nodeId: string, rowId: string, patch: Partial<RowExecution>) => void;
  recomputeTableStatus: (nodeId: string) => void;

  // Execution state
  setNodeExecution: (id: string, exec: Partial<GenerateImageNode['execution']>) => void;
  setNodeOutput: (id: string, output: Partial<GenerateImageNode['outputs']>) => void;

  // Edge CRUD
  addEdge: (source: string, target: string, handles?: { sourceHandle?: string; targetHandle?: string }) => SpatialEdge;
  removeEdge: (id: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Batch
  loadPipeline: (nodes: SpatialNode[], edges: SpatialEdge[]) => void;
  clearBoard: () => void;

  // Query
  getNodeById: (id: string) => SpatialNode | undefined;
  getDependencies: (nodeId: string) => SpatialNode[];
}

function pushHistory(state: BoardState): void {
  state.history.past.push({ nodes: state.nodes, edges: state.edges });
  state.history.future = [];
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      boardId: null,
      boardName: 'Untitled Board',
      nodes: [],
      edges: [],
      history: { past: [], future: [] },

      initBoard(name) {
        set({ boardName: name, boardId: `board_${Date.now().toString(36)}` });
      },

      addNode(node) {
        set(s => {
          pushHistory(s);
          return { nodes: [...s.nodes, node] };
        });
        return node;
      },

      updateNode(id, patch) {
        set(s => {
          pushHistory(s);
          return { nodes: s.nodes.map(n => (n.id === id ? { ...n, ...patch } as SpatialNode : n)) };
        });
      },

      removeNode(id) {
        set(s => {
          pushHistory(s);
          // ADR-003: Only remove node metadata + connected edges. Never touch IndexedDB blobs.
          // Remove the node itself, plus clean up its ID from all other nodes' dependency lists.
          const remainingNodes = s.nodes
            .filter(n => n.id !== id)
            .map(n => ({
              ...n,
              dependencies: (n as any).dependencies?.filter((d: string) => d !== id) ?? [],
            })) as SpatialNode[];
          return {
            nodes: remainingNodes,
            edges: s.edges.filter(e => e.source !== id && e.target !== id),
          };
        });
      },

      updateNodePosition(id, x, y) {
        set(s => ({
          nodes: s.nodes.map(n => (n.id === id ? { ...n, x, y } as SpatialNode : n)),
        }));
      },

      addDependency(nodeId, depNodeId) {
        set(s => {
          pushHistory(s);
          return {
            nodes: s.nodes.map(n => {
              if (n.id !== nodeId) return n;
              const deps = (n as any).dependencies as string[] ?? [];
              if (deps.includes(depNodeId)) return n;
              return { ...n, dependencies: [...deps, depNodeId] };
            }),
          };
        });
      },

      removeDependency(nodeId, depNodeId) {
        set(s => {
          pushHistory(s);
          return {
            nodes: s.nodes.map(n => {
              if (n.id !== nodeId) return n;
              const deps = (n as any).dependencies as string[] ?? [];
              return { ...n, dependencies: deps.filter(d => d !== depNodeId) };
            }),
          };
        });
      },

      addCandidate(nodeId, blobId) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== nodeId || (n.type !== 'GENERATE_IMAGE' && n.type !== 'GENERATE_VIDEO')) return n;
            const outputs = n.outputs as GenerateImageNode['outputs'];
            const candidates = [...outputs.candidates, blobId];
            return {
              ...n,
              outputs: {
                ...outputs,
                candidates,
                activeCandidateIndex: outputs.activeCandidateIndex ?? 0,
              },
            } as SpatialNode;
          }),
        }));
      },

      setActiveCandidate(nodeId, index) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== nodeId || (n.type !== 'GENERATE_IMAGE' && n.type !== 'GENERATE_VIDEO')) return n;
            const outputs = n.outputs as GenerateImageNode['outputs'];
            if (index < 0 || index >= outputs.candidates.length) return n;
            return {
              ...n,
              outputs: { ...outputs, activeCandidateIndex: index, blobId: outputs.candidates[index] },
            } as SpatialNode;
          }),
        }));
      },

      promoteCandidate(nodeId, candidateIndex) {
        const state = get();
        const node = state.nodes.find(n => n.id === nodeId);
        if (!node || (node.type !== 'GENERATE_IMAGE' && node.type !== 'GENERATE_VIDEO')) return null;

        const outputs = node.outputs as GenerateImageNode['outputs'];
        if (candidateIndex < 0 || candidateIndex >= outputs.candidates.length) return null;

        const blobId = outputs.candidates[candidateIndex];
        const newNode: SpatialNode = createStaticAssetNode({
          x: node.x + 350,
          y: node.y,
          inputs: { src: blobId, fileName: `promoted_${blobId}` },
          outputs: { blobId },
          dependencies: [nodeId],
        });

        set(s => {
          pushHistory(s);
          const edge: SpatialEdge = {
            id: generateEdgeId(),
            source: nodeId,
            target: newNode.id,
          };
          return {
            nodes: [...s.nodes, newNode],
            edges: [...s.edges, edge],
          };
        });

        return newNode;
      },

      setTableRuntimePayload(nodeId, payload) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== nodeId || n.type !== 'STORYBOARD_TABLE') return n;
            return { ...n, runtimePayload: payload } as StoryboardTableNode;
          }),
        }));
      },

      updateRowExecution(nodeId, rowId, patch) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== nodeId || n.type !== 'STORYBOARD_TABLE') return n;
            const tn = n as StoryboardTableNode;
            const rows = tn.runtimePayload?.rowExecutions?.map(r =>
              r.rowId === rowId ? { ...r, ...patch } : r,
            ) ?? [];
            return {
              ...tn,
              runtimePayload: { ...tn.runtimePayload!, rowExecutions: rows },
            } as StoryboardTableNode;
          }),
        }));
      },

      recomputeTableStatus(nodeId) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== nodeId || n.type !== 'STORYBOARD_TABLE') return n;
            const tn = n as StoryboardTableNode;
            const rows = tn.runtimePayload?.rowExecutions ?? [];
            const summary = computeTableSummary(rows);
            return { ...tn, execution: summary } as StoryboardTableNode;
          }),
        }));
      },

      setNodeExecution(id, exec) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== id) return n;
            if (n.type === 'GENERATE_IMAGE' || n.type === 'GENERATE_VIDEO') {
              return { ...n, execution: { ...(n as GenerateImageNode).execution, ...exec } } as SpatialNode;
            }
            return n;
          }),
        }));
      },

      setNodeOutput(id, output) {
        set(s => ({
          nodes: s.nodes.map(n => {
            if (n.id !== id) return n;
            if (n.type === 'GENERATE_IMAGE' || n.type === 'GENERATE_VIDEO') {
              return { ...n, outputs: { ...(n as GenerateImageNode).outputs, ...output } } as SpatialNode;
            }
            if (n.type === 'STATIC_ASSET') {
              return { ...n, outputs: { ...(n as StaticAssetNode).outputs, ...output } } as StaticAssetNode;
            }
            return n;
          }),
        }));
      },

      addEdge(source, target, handles) {
        const edge: SpatialEdge = {
          id: generateEdgeId(),
          source,
          target,
          sourceHandle: handles?.sourceHandle,
          targetHandle: handles?.targetHandle,
        };
        set(s => {
          pushHistory(s);
          // Also add to the target node's dependencies
          const updatedNodes = s.nodes.map(n => {
            if (n.id !== target) return n;
            const deps = (n as any).dependencies as string[] ?? [];
            if (deps.includes(source)) return n;
            return { ...n, dependencies: [...deps, source] };
          });
          return { nodes: updatedNodes, edges: [...s.edges, edge] };
        });
        return edge;
      },

      removeEdge(id) {
        set(s => {
          pushHistory(s);
          return { edges: s.edges.filter(e => e.id !== id) };
        });
      },

      undo() {
        set(s => {
          if (s.history.past.length === 0) return s;
          const past = [...s.history.past];
          const snapshot = past.pop()!;
          return {
            nodes: snapshot.nodes,
            edges: snapshot.edges,
            history: {
              past,
              future: [{ nodes: s.nodes, edges: s.edges }, ...s.history.future],
            },
          };
        });
      },

      redo() {
        set(s => {
          if (s.history.future.length === 0) return s;
          const future = [...s.history.future];
          const snapshot = future.shift()!;
          return {
            nodes: snapshot.nodes,
            edges: snapshot.edges,
            history: {
              past: [...s.history.past, { nodes: s.nodes, edges: s.edges }],
              future,
            },
          };
        });
      },

      loadPipeline(nodes, edges) {
        set(s => {
          pushHistory(s);
          return { nodes, edges };
        });
      },

      clearBoard() {
        set(s => {
          pushHistory(s);
          return { nodes: [], edges: [] };
        });
      },

      getNodeById(id) {
        return get().nodes.find(n => n.id === id);
      },

      getDependencies(nodeId) {
        const node = get().nodes.find(n => n.id === nodeId);
        if (!node) return [];
        const depIds: string[] = (node as any).dependencies ?? [];
        return get().nodes.filter(n => depIds.includes(n.id));
      },
    }),
    {
      name: 'flovart-board-store',
      partialize: (state) => ({
        boardId: state.boardId,
        boardName: state.boardName,
        nodes: state.nodes.map(n => {
          // ADR-003: Strip runtimePayload from STORYBOARD_TABLE nodes before localStorage persistence
          if (n.type === 'STORYBOARD_TABLE') {
            const { runtimePayload, ...rest } = n as StoryboardTableNode;
            return rest;
          }
          return n;
        }),
        edges: state.edges,
        // History is session-only, not persisted
      }),
    },
  ),
);
