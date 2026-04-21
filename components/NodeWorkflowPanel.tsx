import React, { useEffect, useMemo, useRef, useState } from 'react';
import { inferProviderFromModel } from '../services/aiGateway';
import { createExecutionPlan, executeWorkflow } from '../services/workflowEngine';
import type { WorkflowExecutionScope } from '../services/workflowEngine';
import type { ChatAttachment, GenerationMode, PromptEnhanceMode, UserApiKey } from '../types';
import { NODE_DEFS } from './nodeflow/defs';
import { getBezierPath, getPortLabelY, getPortPosition, selectionBoxRect } from './nodeflow/graph';
import {
  getPrimaryWorkflowValue,
  summarizeWorkflowValue,
} from './nodeflow/types';
import type {
  NodeIOMap,
  NodeConfig,
  NodeKind,
  WorkflowNodeRunState,
  WorkflowRunStatus,
  WorkflowValue,
} from './nodeflow/types';
import { useNodeWorkflowStore } from './nodeflow/useNodeWorkflowStore';

interface NodeWorkflowPanelProps {
  prompt: string;
  setPrompt: (value: string) => void;
  generationMode: GenerationMode;
  setGenerationMode: (mode: GenerationMode) => void;
  selectedImageModel?: string;
  selectedVideoModel?: string;
  imageModelOptions?: string[];
  videoModelOptions?: string[];
  onImageModelChange?: (model: string) => void;
  onVideoModelChange?: (model: string) => void;
  attachments: ChatAttachment[];
  canvasImages: Array<{ id: string; name?: string; href: string; mimeType: string }>;
  onRemoveAttachment: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onDropCanvasImage: (payload: { id: string; name?: string; href: string; mimeType: string }) => void;
  userApiKeys: UserApiKey[];
  onPlaceWorkflowValue: (value: WorkflowValue) => Promise<void> | void;
}

type ContextMenuState = {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  target: 'canvas' | 'node' | 'group';
  nodeId?: string;
  groupId?: string;
};

const NODE_LIBRARY_KINDS: NodeKind[] = [
  'prompt',
  'loadImage',
  'enhancer',
  'llm',
  'template',
  'generator',
  'imageGen',
  'videoGen',
  'runningHub',
  'preview',
  'saveToCanvas',
];

const RUN_STATUS_STYLES: Record<WorkflowRunStatus, string> = {
  idle: 'bg-white/25',
  queued: 'bg-sky-300/80',
  running: 'bg-amber-300',
  success: 'bg-emerald-300',
  error: 'bg-rose-300',
  skipped: 'bg-white/20',
  pinned: 'bg-fuchsia-300',
};

function buildEnhancerSystemPrompt(mode: PromptEnhanceMode, stylePreset: string): string {
  if (mode === 'style') {
    return `Rewrite the user's creative prompt into a production-ready ${stylePreset} visual prompt. Keep subject intent unchanged, but improve scene specificity, composition, lighting, texture, and shot readability.`;
  }
  if (mode === 'precise') {
    return 'Rewrite the prompt into a precise production prompt. Remove ambiguity, keep structure tight, and make every visual instruction concrete.';
  }
  if (mode === 'translate') {
    return 'Translate the prompt into concise, production-ready English for image or video generation. Preserve all named entities and creative intent.';
  }
  return 'Rewrite the prompt into a stronger production-ready visual prompt with clearer subject, environment, composition, lighting, and style guidance.';
}

function getNodeTitle(kind: NodeKind, label?: string): string {
  return label?.trim() || NODE_DEFS[kind].title;
}

export const NodeWorkflowPanel: React.FC<NodeWorkflowPanelProps> = ({
  prompt,
  setPrompt,
  generationMode,
  setGenerationMode,
  selectedImageModel,
  selectedVideoModel,
  imageModelOptions = [],
  videoModelOptions = [],
  onImageModelChange,
  onVideoModelChange,
  attachments,
  canvasImages,
  onRemoveAttachment,
  onUploadFiles,
  onDropCanvasImage,
  userApiKeys,
  onPlaceWorkflowValue,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<SVGSVGElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const store = useNodeWorkflowStore();

  const [isExecuting, setIsExecuting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState('Ready');
  const [nodeRunState, setNodeRunState] = useState<Record<string, WorkflowNodeRunState>>({});
  const [enhanceMode, setEnhanceMode] = useState<PromptEnhanceMode>('smart');
  const [stylePreset, setStylePreset] = useState('cinematic');
  const [isPromptDropOver, setIsPromptDropOver] = useState(false);
  const [isImageDropOver, setIsImageDropOver] = useState(false);
  const [isMiniMapDragging, setIsMiniMapDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const selectedNode = store.selectedNodeIds.length > 0 ? store.nodeMap.get(store.selectedNodeIds[0]) ?? null : null;
  const selectedGroup = store.selectedGroupId
    ? store.groups.find((group) => group.id === store.selectedGroupId) ?? null
    : null;

  const getEffectiveNodeRuntime = (nodeId: string, config?: NodeConfig): WorkflowNodeRunState | null => {
    const runtime = nodeRunState[nodeId];
    if (runtime) return runtime;
    if (config?.pinnedOutputs) {
      return {
        status: 'pinned',
        outputs: config.pinnedOutputs,
        message: 'Pinned output',
        updatedAt: 0,
      };
    }
    return null;
  };

  const selectedNodeRuntime = selectedNode ? getEffectiveNodeRuntime(selectedNode.id, selectedNode.config) : null;

  const preparedNodes = useMemo(() => {
    return store.nodes.map((node) => {
      const nextConfig = { ...node.config };
      if (node.kind === 'enhancer' && !nextConfig.systemPrompt) {
        nextConfig.systemPrompt = buildEnhancerSystemPrompt(enhanceMode, stylePreset);
      }
      if (node.kind === 'generator') {
        nextConfig.generationMode = generationMode === 'video' ? 'video' : 'image';
        const fallbackModel = generationMode === 'video' ? selectedVideoModel : selectedImageModel;
        if (!nextConfig.model && fallbackModel) nextConfig.model = fallbackModel;
        if (!nextConfig.provider && nextConfig.model) nextConfig.provider = inferProviderFromModel(nextConfig.model);
      }
      if (node.kind === 'imageGen') {
        if (!nextConfig.model && selectedImageModel) nextConfig.model = selectedImageModel;
        if (!nextConfig.provider && nextConfig.model) nextConfig.provider = inferProviderFromModel(nextConfig.model);
      }
      if (node.kind === 'videoGen') {
        if (!nextConfig.model && selectedVideoModel) nextConfig.model = selectedVideoModel;
        if (!nextConfig.provider && nextConfig.model) nextConfig.provider = inferProviderFromModel(nextConfig.model);
      }
      return { ...node, config: nextConfig };
    });
  }, [enhanceMode, generationMode, selectedImageModel, selectedVideoModel, store.nodes, stylePreset]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - store.viewport.x) / store.viewport.scale,
      y: (clientY - rect.top - store.viewport.y) / store.viewport.scale,
    };
  };

  const edgePaths = useMemo(() => {
    return store.edges
      .map((edge) => {
        const from = store.nodeMap.get(edge.fromNode);
        const to = store.nodeMap.get(edge.toNode);
        if (!from || !to) return null;
        const fromIdx = NODE_DEFS[from.kind].outputs.findIndex((port) => port.key === edge.fromPort);
        const toIdx = NODE_DEFS[to.kind].inputs.findIndex((port) => port.key === edge.toPort);
        if (fromIdx < 0 || toIdx < 0) return null;
        const p1 = getPortPosition(from, fromIdx, true);
        const p2 = getPortPosition(to, toIdx, false);
        return { id: edge.id, d: getBezierPath(p1, p2) };
      })
      .filter((item): item is { id: string; d: string } => !!item);
  }, [store.edges, store.nodeMap]);

  const pendingPath = useMemo(() => {
    if (!store.pendingConnection) return null;
    const source = store.nodeMap.get(store.pendingConnection.fromNode);
    if (!source) return null;
    const index = NODE_DEFS[source.kind].outputs.findIndex((port) => port.key === store.pendingConnection?.fromPort);
    if (index < 0) return null;
    const p1 = getPortPosition(source, index, true);
    const p2 = { x: store.pendingConnection.mouseX, y: store.pendingConnection.mouseY };
    return getBezierPath(p1, p2);
  }, [store.pendingConnection, store.nodeMap]);

  const runGraph = async (scope: WorkflowExecutionScope = 'workflow', focusNodeId?: string) => {
    if (isExecuting || !prompt.trim()) return;
    const executionPlan = createExecutionPlan(preparedNodes, store.edges, scope, focusNodeId);
    if (executionPlan.nodes.length === 0) return;

    const runLabel = scope === 'node'
      ? 'Node execution'
      : scope === 'from-here'
        ? 'Execute from here'
        : 'Workflow';
    const initialTimestamp = Date.now();
    setIsExecuting(true);
    setRunError(null);
    setRunMessage(`Queueing ${runLabel.toLowerCase()}...`);
    setNodeRunState((prev) => {
      const next = scope === 'workflow' ? {} : { ...prev };
      for (const node of executionPlan.nodes) {
        next[node.id] = {
          status: 'queued',
          updatedAt: initialTimestamp,
          message: 'Queued',
        };
      }
      return next;
    });

    try {
      const result = await executeWorkflow(executionPlan.nodes, executionPlan.edges, {
        apiKeys: userApiKeys,
        inputPrompt: prompt,
        inputImages: attachments
          .filter((attachment) => attachment.mimeType.startsWith('image/'))
          .map((attachment) => attachment.href),
        onProgress: (nodeId, status) => {
          const runtimeStatus: WorkflowRunStatus = status === 'skipped' ? 'skipped' : 'running';
          const node = preparedNodes.find((item) => item.id === nodeId);
          store.setActiveNodeId(runtimeStatus === 'running' ? nodeId : null);
          setRunMessage(node ? `${getNodeTitle(node.kind, node.config?.label)} · ${status}` : status);
          setNodeRunState((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] ?? { updatedAt: Date.now() }),
              status: runtimeStatus,
              message: status,
              updatedAt: Date.now(),
            },
          }));
        },
        onNodeComplete: (nodeId, outputs) => {
          const primaryValue = getPrimaryWorkflowValue(outputs);
          setNodeRunState((prev) => ({
            ...prev,
            [nodeId]: {
              status: 'success',
              outputs,
              message: summarizeWorkflowValue(primaryValue),
              updatedAt: Date.now(),
            },
          }));
        },
        onError: (nodeId, error) => {
          setRunError(error);
          setNodeRunState((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] ?? { updatedAt: Date.now() }),
              status: 'error',
              error,
              message: error,
              updatedAt: Date.now(),
            },
          }));
        },
        onPlaceOnCanvas: onPlaceWorkflowValue,
        retryPolicy: {
          maxRetries: 0,
          backoffMs: 1200,
          backoffMultiplier: 2,
        },
      });
      store.setActiveNodeId(null);
      if (result.success) {
        setRunMessage(`${runLabel} completed`);
      } else {
        setRunError(result.errors[0]?.error || 'Execution failed. Check links and node parameters.');
        setRunMessage(result.errors[0]?.error || `${runLabel} failed`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed. Check links and node parameters.';
      setRunError(message);
      setRunMessage(message);
      store.setActiveNodeId(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const updateNodeConfig = <K extends keyof NodeConfig>(nodeId: string, key: K, value: NodeConfig[K]) => {
    store.updateNodeConfig(nodeId, { [key]: value } as Partial<NodeConfig>);
  };

  const pinNodeOutput = (nodeId: string) => {
    const runtime = nodeRunState[nodeId];
    if (!runtime?.outputs) return;
    store.updateNodeConfig(nodeId, { pinnedOutputs: runtime.outputs });
    setNodeRunState((prev) => ({
      ...prev,
      [nodeId]: {
        ...runtime,
        status: 'pinned',
        message: 'Pinned output',
        updatedAt: Date.now(),
      },
    }));
  };

  const unpinNodeOutput = (nodeId: string) => {
    store.updateNodeConfig(nodeId, { pinnedOutputs: undefined });
    setNodeRunState((prev) => {
      const runtime = prev[nodeId];
      if (!runtime) return prev;
      return {
        ...prev,
        [nodeId]: {
          ...runtime,
          status: 'idle',
          message: 'Pin cleared',
          updatedAt: Date.now(),
        },
      };
    });
  };

  const renderValuePreview = (value: WorkflowValue | null | undefined) => {
    if (!value || value.kind === 'empty') {
      return <div className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/45">No output yet</div>;
    }
    if (value.kind === 'image') {
      return <img src={value.href} alt="Workflow output" className="max-h-48 w-full rounded border border-white/10 object-cover" />;
    }
    if (value.kind === 'video') {
      return <video src={value.href} controls className="max-h-48 w-full rounded border border-white/10 bg-black/40" />;
    }
    if (value.kind === 'json') {
      return (
        <pre className="max-h-48 overflow-auto rounded border border-white/10 bg-black/20 p-3 text-[11px] text-white/70 whitespace-pre-wrap break-all">
          {JSON.stringify(value.value, null, 2)}
        </pre>
      );
    }
    return (
      <pre className="max-h-48 overflow-auto rounded border border-white/10 bg-black/20 p-3 text-[11px] text-white/80 whitespace-pre-wrap break-all">
        {value.text}
      </pre>
    );
  };

  const handleDropPayload = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-canvas-image');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id: string; name?: string; href: string; mimeType: string };
        if (parsed.href && parsed.mimeType) onDropCanvasImage(parsed);
      } catch {
        // ignore malformed payload
      }
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const centerWorldPosition = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 600, y: 360 };
    return {
      x: (rect.width * 0.45 - store.viewport.x) / store.viewport.scale,
      y: (rect.height * 0.45 - store.viewport.y) / store.viewport.scale,
    };
  };

  const openContextMenu = (
    event: React.MouseEvent,
    target: ContextMenuState['target'],
    payload?: { nodeId?: string; groupId?: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const world = toWorld(event.clientX, event.clientY);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      worldX: world.x,
      worldY: world.y,
      target,
      nodeId: payload?.nodeId,
      groupId: payload?.groupId,
    });
  };

  const pasteAtCenter = () => {
    store.pasteFromClipboard(centerWorldPosition());
  };

  const runContextAction = (action: string) => {
    if (!contextMenu) return;
    const at = { x: contextMenu.worldX, y: contextMenu.worldY };
    if (action === 'paste') {
      store.pasteFromClipboard(at);
    } else if (action === 'fit') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) store.fitViewToContent(rect.width, rect.height);
    } else if (action === 'copy-node' && contextMenu.nodeId) {
      store.selectSingleNode(contextMenu.nodeId, false);
      store.copySelection();
    } else if (action === 'delete-node' && contextMenu.nodeId) {
      store.removeNode(contextMenu.nodeId);
    } else if (action === 'copy-group' && contextMenu.groupId) {
      store.selectGroup(contextMenu.groupId);
      store.copySelection();
    } else if (action === 'ungroup' && contextMenu.groupId) {
      store.removeGroup(contextMenu.groupId);
    } else if (action === 'add-prompt') {
      store.addNode('prompt', at);
    } else if (action === 'add-load-image') {
      store.addNode('loadImage', at);
    } else if (action === 'add-enhancer') {
      store.addNode('enhancer', at);
    } else if (action === 'add-llm') {
      store.addNode('llm', at);
    } else if (action === 'add-template') {
      store.addNode('template', at);
    } else if (action === 'add-generator') {
      store.addNode('generator', at);
    } else if (action === 'add-image-gen') {
      store.addNode('imageGen', at);
    } else if (action === 'add-video-gen') {
      store.addNode('videoGen', at);
    } else if (action === 'add-runninghub') {
      store.addNode('runningHub', at);
    } else if (action === 'add-preview') {
      store.addNode('preview', at);
    } else if (action === 'add-save-to-canvas') {
      store.addNode('saveToCanvas', at);
    } else if (action === 'group-selected') {
      store.createGroupFromSelection();
    } else if (action === 'cut') {
      store.cutSelection();
    } else if (action === 'align-left') {
      store.alignSelectedNodes('left');
    } else if (action === 'align-center') {
      store.alignSelectedNodes('center');
    } else if (action === 'align-right') {
      store.alignSelectedNodes('right');
    } else if (action === 'align-top') {
      store.alignSelectedNodes('top');
    } else if (action === 'align-middle') {
      store.alignSelectedNodes('middle');
    } else if (action === 'align-bottom') {
      store.alignSelectedNodes('bottom');
    } else if (action === 'dist-h') {
      store.distributeSelectedNodes('horizontal');
    } else if (action === 'dist-v') {
      store.distributeSelectedNodes('vertical');
    }
    setContextMenu(null);
  };

  const panFromMiniMap = (clientX: number, clientY: number) => {
    const mmRect = minimapRef.current?.getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!mmRect || !canvasRect) return;
    const x = Math.max(0, Math.min(mmRect.width, clientX - mmRect.left));
    const y = Math.max(0, Math.min(mmRect.height, clientY - mmRect.top));
    const worldX = minimap.minX + (x / mmRect.width) * minimap.width;
    const worldY = minimap.minY + (y / mmRect.height) * minimap.height;
    store.setViewport((prev) => ({
      ...prev,
      x: canvasRect.width * 0.5 - worldX * prev.scale,
      y: canvasRect.height * 0.5 - worldY * prev.scale,
    }));
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
      const key = event.key.toLowerCase();
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === 'Escape') {
        setContextMenu(null);
        store.cancelConnection();
        return;
      }

      if (meta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (meta && key === 'y') {
        event.preventDefault();
        store.redo();
        return;
      }
      if (isTyping) return;

      if (meta && key === 'c') {
        event.preventDefault();
        store.copySelection();
      } else if (meta && key === 'x') {
        event.preventDefault();
        store.cutSelection();
      } else if (meta && key === 'v') {
        event.preventDefault();
        pasteAtCenter();
      } else if (meta && key === 'a') {
        event.preventDefault();
        store.selectAllNodes();
      } else if (meta && key === 'g') {
        event.preventDefault();
        store.createGroupFromSelection();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !isExecuting) {
        event.preventDefault();
        store.removeSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExecuting, store]);

  const minimap = useMemo(() => {
    const allXs: number[] = [];
    const allYs: number[] = [];
    const allX2: number[] = [];
    const allY2: number[] = [];
    for (const node of store.nodes) {
      allXs.push(node.x);
      allYs.push(node.y);
      allX2.push(node.x + NODE_DEFS[node.kind].width);
      allY2.push(node.y + NODE_DEFS[node.kind].height);
    }
    for (const group of store.groups) {
      allXs.push(group.x);
      allYs.push(group.y);
      allX2.push(group.x + group.width);
      allY2.push(group.y + group.height);
    }
    if (allXs.length === 0) {
      return { minX: 0, minY: 0, width: 1, height: 1, viewRect: { x: 0, y: 0, width: 0, height: 0 } };
    }
    const minX = Math.min(...allXs) - 80;
    const minY = Math.min(...allYs) - 80;
    const maxX = Math.max(...allX2) + 80;
    const maxY = Math.max(...allY2) + 80;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const cw = canvasRect?.width ?? 1;
    const ch = canvasRect?.height ?? 1;
    const worldVisibleW = cw / store.viewport.scale;
    const worldVisibleH = ch / store.viewport.scale;
    const worldVisibleX = -store.viewport.x / store.viewport.scale;
    const worldVisibleY = -store.viewport.y / store.viewport.scale;
    return {
      minX,
      minY,
      width,
      height,
      viewRect: { x: worldVisibleX, y: worldVisibleY, width: worldVisibleW, height: worldVisibleH },
    };
  }, [store.groups, store.nodes, store.viewport.scale, store.viewport.x, store.viewport.y]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#070a12] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:18px_18px] opacity-25" />

      <div className="absolute inset-x-0 top-0 z-50 h-12 border-b border-white/10 bg-[#0d1321]/95 backdrop-blur-xl flex items-center gap-2 px-4">
        <span className="text-sm text-white/85">Workflow Editor</span>
        <button
          onClick={() => runGraph('workflow')}
          disabled={isExecuting || !prompt.trim()}
          className="ml-2 rounded-md border border-emerald-300/40 bg-emerald-500/25 px-3 py-1.5 text-xs hover:bg-emerald-500/35 disabled:opacity-45"
          title="Run the entire workflow"
        >
          {isExecuting ? 'Running...' : 'Run Workflow'}
        </button>
        <button
          onClick={() => selectedNode && runGraph('node', selectedNode.id)}
          disabled={isExecuting || !prompt.trim() || !selectedNode}
          className="rounded-md border border-sky-300/35 bg-sky-500/15 px-3 py-1.5 text-xs hover:bg-sky-500/25 disabled:opacity-45"
          title="Run only the selected node and required upstream nodes"
        >
          Execute Node
        </button>
        <button
          onClick={() => selectedNode && runGraph('from-here', selectedNode.id)}
          disabled={isExecuting || !prompt.trim() || !selectedNode}
          className="rounded-md border border-cyan-300/35 bg-cyan-500/15 px-3 py-1.5 text-xs hover:bg-cyan-500/25 disabled:opacity-45"
          title="Run the selected node, downstream nodes, and required dependencies"
        >
          From Here
        </button>
        <button
          onClick={() => store.createGroupFromSelection()}
          disabled={store.selectedNodeIds.length < 2}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Group selected nodes (Ctrl/Cmd+G)"
        >
          Group
        </button>
        <button
          onClick={() => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            store.fitViewToContent(rect.width, rect.height);
          }}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          title="Fit view"
        >
          Fit View
        </button>
        <button
          onClick={() => store.undo()}
          disabled={!store.canUndo}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          onClick={() => store.redo()}
          disabled={!store.canRedo}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </button>
        <button
          onClick={() => store.cutSelection()}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          title="Cut (Ctrl/Cmd+X)"
        >
          Cut
        </button>
        <button
          onClick={() => store.copySelection()}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          title="Copy (Ctrl/Cmd+C)"
        >
          Copy
        </button>
        <button
          onClick={pasteAtCenter}
          disabled={!store.canPaste}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Paste (Ctrl/Cmd+V)"
        >
          Paste
        </button>
        <button
          onClick={() => store.alignSelectedNodes('left')}
          disabled={store.selectedNodeIds.length < 2}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Align Left"
        >
          Align L
        </button>
        <button
          onClick={() => store.alignSelectedNodes('top')}
          disabled={store.selectedNodeIds.length < 2}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Align Top"
        >
          Align T
        </button>
        <button
          onClick={() => store.distributeSelectedNodes('horizontal')}
          disabled={store.selectedNodeIds.length < 3}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Distribute Horizontal"
        >
          Dist H
        </button>
        <button
          onClick={() => store.distributeSelectedNodes('vertical')}
          disabled={store.selectedNodeIds.length < 3}
          className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
          title="Distribute Vertical"
        >
          Dist V
        </button>
        <span className={`ml-2 text-[11px] ${runError ? 'text-rose-300' : 'text-emerald-300'}`}>{runError || runMessage}</span>
        <span className="ml-auto text-[11px] text-white/45">n8n-style canvas architecture</span>
      </div>

      <aside className="absolute left-0 top-12 bottom-0 z-40 w-64 border-r border-white/10 bg-[#0b101d]/95 p-3 overflow-y-auto">
        <div className="mb-2 text-xs text-white/60">Node Library</div>
        <div className="space-y-2">
          {NODE_LIBRARY_KINDS.map((kind) => (
            <button
              key={kind}
              onClick={() => store.addNode(kind, centerWorldPosition())}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:bg-white/10"
              title={`Add ${NODE_DEFS[kind].title}`}
            >
              + {NODE_DEFS[kind].title}
            </button>
          ))}
        </div>
        <div className="mt-4 mb-2 text-xs text-white/60">Canvas Images</div>
        <div className="grid grid-cols-4 gap-2">
          {canvasImages.slice(0, 16).map((item) => (
            <button
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-canvas-image', JSON.stringify(item));
                e.dataTransfer.setData('text/plain', item.name || item.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onDropCanvasImage(item)}
              className="h-12 w-12 overflow-hidden rounded border border-white/20 hover:border-emerald-300/70"
              title={`Use ${item.name || item.id}`}
            >
              <img src={item.href} alt={item.name || item.id} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </aside>

      <main
        ref={canvasRef}
        className="absolute left-64 right-72 top-12 bottom-0 z-20"
        onContextMenu={(e) => openContextMenu(e, 'canvas')}
        onMouseMove={(e) => {
          const world = toWorld(e.clientX, e.clientY);
          store.moveConnection(world);
          store.moveSelection(world);
          store.moveDrag(world);
          store.panTo({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={(e) => {
          store.endDrag();
          store.endPan();
          store.endSelection(e.metaKey || e.ctrlKey);
          setIsMiniMapDragging(false);
        }}
        onMouseLeave={() => {
          store.endDrag();
          store.endPan();
          setIsMiniMapDragging(false);
        }}
        onWheel={(e) => {
          e.preventDefault();
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          store.zoomAt({ x: e.clientX, y: e.clientY }, rect, e.deltaY);
        }}
      >
        <div
          className="absolute inset-0"
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.graphbg !== '1') return;
            if (e.button === 1 || e.shiftKey) {
              store.startPan({ x: e.clientX, y: e.clientY });
            } else if (e.button === 0) {
              const world = toWorld(e.clientX, e.clientY);
              store.startSelection(world);
            }
          }}
          data-graphbg="1"
        />

        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${store.viewport.x}px, ${store.viewport.y}px) scale(${store.viewport.scale})`,
            transformOrigin: '0 0',
          }}
        >
          {store.groups.map((group) => (
            <div
              key={group.id}
              className={`absolute rounded-xl border ${
                store.selectedGroupId === group.id ? 'border-cyan-300/70 bg-cyan-400/8' : 'border-cyan-200/30 bg-cyan-200/5'
              }`}
              style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
              onContextMenu={(e) => openContextMenu(e, 'group', { groupId: group.id })}
            >
              <button
                className="absolute left-2 top-1 rounded px-2 py-0.5 text-[10px] bg-black/35 text-cyan-100"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const world = toWorld(e.clientX, e.clientY);
                  store.startGroupDrag(group.id, world);
                }}
                onClick={() => store.selectGroup(group.id)}
                title={group.title}
              >
                {group.title}
              </button>
            </div>
          ))}

          <svg className="absolute inset-0 h-[3200px] w-[4200px]">
            {edgePaths.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                stroke="rgba(167,139,250,0.88)"
                strokeWidth="2.2"
                fill="none"
                className="cursor-pointer"
                onDoubleClick={() => store.deleteEdge(edge.id)}
              />
            ))}
            {pendingPath && (
              <path
                d={pendingPath}
                stroke="rgba(34,197,94,0.95)"
                strokeWidth="2.2"
                fill="none"
                strokeDasharray="6 4"
              />
            )}
          </svg>

          {store.nodes.map((node) => {
            const def = NODE_DEFS[node.kind];
            const selected = store.selectedNodeIds.includes(node.id);
            const active = store.activeNodeId === node.id;
            const runtime = getEffectiveNodeRuntime(node.id, node.config);
            const primaryValue = getPrimaryWorkflowValue(runtime?.outputs);
            const runtimeSummary = runtime?.error || runtime?.message || summarizeWorkflowValue(primaryValue);
            const displayTitle = getNodeTitle(node.kind, node.config?.label);
            return (
              <div
                key={node.id}
                className={`absolute rounded-xl border shadow-2xl ${
                  active
                    ? 'border-emerald-300 bg-[#182132]/95'
                    : selected
                    ? 'border-violet-300/85 bg-[#151d2d]/95'
                    : 'border-white/15 bg-[#141b2a]/92'
                }`}
                style={{ left: node.x, top: node.y, width: def.width, minHeight: def.height }}
                onContextMenu={(e) => openContextMenu(e, 'node', { nodeId: node.id })}
                onClick={(e) => {
                  e.stopPropagation();
                  store.selectSingleNode(node.id, e.metaKey || e.ctrlKey);
                }}
              >
                <div
                  className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 text-xs cursor-move rounded-t-xl"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const world = toWorld(e.clientX, e.clientY);
                    store.startNodeDrag(node.id, world, e.metaKey || e.ctrlKey);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${RUN_STATUS_STYLES[runtime?.status || 'idle']}`} />
                    <span>{displayTitle}</span>
                  </span>
                  <button
                    className="rounded bg-black/35 px-1.5 py-0.5 text-[10px] hover:bg-black/55"
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeNode(node.id);
                    }}
                    title="Delete node"
                  >
                    x
                  </button>
                </div>

                <div className="relative p-3">
                  {node.kind === 'prompt' && (
                    <div
                      className={`rounded-lg border ${
                        isPromptDropOver ? 'border-emerald-300 bg-emerald-500/10' : 'border-white/10 bg-black/25'
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsPromptDropOver(true);
                      }}
                      onDragLeave={() => setIsPromptDropOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsPromptDropOver(false);
                        handleDropPayload(e);
                      }}
                    >
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="h-24 w-full resize-none bg-transparent px-2 py-2 text-xs outline-none placeholder:text-white/40"
                        placeholder="Prompt (drop board images here)"
                        title="Prompt"
                      />
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-2 pb-2">
                          {attachments.map((att) => (
                            <div key={att.id} className="relative h-10 w-10 overflow-hidden rounded border border-white/20">
                              <img src={att.href} alt={att.name} className="h-full w-full object-cover" />
                              <button
                                onClick={() => onRemoveAttachment(att.id)}
                                className="absolute right-0 top-0 h-4 w-4 bg-black/75 text-[10px]"
                                title="Remove attachment"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {node.kind === 'loadImage' && (
                    <div
                      className={`rounded-lg border p-2 ${
                        isImageDropOver ? 'border-emerald-300 bg-emerald-500/10' : 'border-white/10 bg-black/25'
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsImageDropOver(true);
                      }}
                      onDragLeave={() => setIsImageDropOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsImageDropOver(false);
                        handleDropPayload(e);
                      }}
                    >
                      <button onClick={() => fileInputRef.current?.click()} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                        Upload
                      </button>
                      <div className="mt-2 text-[11px] text-white/70">Loaded: {attachments.length}</div>
                    </div>
                  )}

                  {node.kind === 'enhancer' && (
                    <div className="space-y-2">
                      <label className="text-xs text-white/70">Enhance Mode</label>
                      <select
                        value={enhanceMode}
                        onChange={(e) => setEnhanceMode(e.target.value as PromptEnhanceMode)}
                        className="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs"
                        title="Enhance mode"
                      >
                        <option value="smart">Smart</option>
                        <option value="style">Style</option>
                        <option value="precise">Precise</option>
                        <option value="translate">Translate</option>
                      </select>
                      {enhanceMode === 'style' && (
                        <select
                          value={stylePreset}
                          onChange={(e) => setStylePreset(e.target.value)}
                          className="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs"
                          title="Style preset"
                        >
                          <option value="cinematic">Cinematic</option>
                          <option value="ink">Ink</option>
                          <option value="ghibli">Ghibli</option>
                          <option value="cyberpunk">Cyberpunk</option>
                          <option value="pixar3d">Pixar 3D</option>
                        </select>
                      )}
                    </div>
                  )}

                  {node.kind === 'generator' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setGenerationMode('image')}
                          className={`rounded px-2 py-1 text-xs ${
                            generationMode === 'image' ? 'bg-white text-black' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          Img2Img
                        </button>
                        <button
                          onClick={() => setGenerationMode('video')}
                          className={`rounded px-2 py-1 text-xs ${
                            generationMode === 'video' ? 'bg-white text-black' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          Img2Video
                        </button>
                      </div>
                      {generationMode === 'image' && imageModelOptions.length > 0 && (
                        <select
                          value={selectedImageModel}
                          onChange={(e) => onImageModelChange?.(e.target.value)}
                          className="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs"
                          title="Image model"
                        >
                          {imageModelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      )}
                      {generationMode === 'video' && videoModelOptions.length > 0 && (
                        <select
                          value={selectedVideoModel}
                          onChange={(e) => onVideoModelChange?.(e.target.value)}
                          className="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs"
                          title="Video model"
                        >
                          {videoModelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {node.kind === 'preview' && <div className="text-xs text-white/70">Output is rendered back to whiteboard canvas.</div>}

                  {node.kind === 'saveToCanvas' && <div className="text-xs text-white/70">Place the upstream image or video directly onto the canvas board.</div>}

                  {node.kind === 'llm' && (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] text-white/70">
                      {node.config?.model || 'Uses selected text model'}
                    </div>
                  )}

                  {node.kind === 'template' && (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] text-white/70">
                      {(node.config?.templateText || 'Template text with {{input}} / {{var1}} / {{var2}}').slice(0, 96)}
                    </div>
                  )}

                  {node.kind === 'runningHub' && (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] text-white/70">
                      {node.config?.rhEndpoint || 'RunningHub endpoint pending'}
                    </div>
                  )}

                  {(node.kind === 'imageGen' || node.kind === 'videoGen') && (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-[11px] text-white/70">
                      {(node.config?.model || (node.kind === 'videoGen' ? selectedVideoModel : selectedImageModel) || 'Model pending').slice(0, 64)}
                    </div>
                  )}

                  {runtime && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-[10px] text-white/65">
                      <div className="uppercase tracking-[0.16em] text-white/45">{runtime.status}</div>
                      <div className="mt-1 line-clamp-2 break-all">{runtimeSummary}</div>
                    </div>
                  )}

                  {def.inputs.map((port, idx) => (
                    <button
                      key={`in-${port.key}`}
                      className="absolute -left-2.5 h-4 w-4 rounded-full border border-sky-300 bg-[#1f2738]"
                      style={{ top: 56 + idx * 24 }}
                      title={`Input: ${port.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        store.commitConnection(node.id, port.key);
                      }}
                    />
                  ))}
                  {def.outputs.map((port, idx) => {
                    const linking =
                      store.pendingConnection?.fromNode === node.id && store.pendingConnection?.fromPort === port.key;
                    return (
                      <button
                        key={`out-${port.key}`}
                        className={`absolute -right-2.5 h-4 w-4 rounded-full border ${
                          linking ? 'bg-emerald-400 border-emerald-100' : 'bg-[#1f2738] border-violet-300'
                        }`}
                        style={{ top: 56 + idx * 24 }}
                        title={`Output: ${port.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const world = toWorld(e.clientX, e.clientY);
                          store.startConnection(node.id, port.key, world);
                        }}
                      />
                    );
                  })}

                  <div className="pointer-events-none absolute inset-0">
                    {def.inputs.map((port, idx) => (
                      <span key={`label-in-${port.key}`} className="absolute left-3 text-[10px] text-white/45" style={{ top: getPortLabelY(idx) }}>
                        {port.label}
                      </span>
                    ))}
                    {def.outputs.map((port, idx) => (
                      <span
                        key={`label-out-${port.key}`}
                        className="absolute right-3 text-[10px] text-white/45"
                        style={{ top: getPortLabelY(idx) }}
                      >
                        {port.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {store.selectionBox && (() => {
            const rect = selectionBoxRect(store.selectionBox);
            return <div className="absolute border border-cyan-300/80 bg-cyan-400/10" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />;
          })()}
        </div>

        <div className="absolute bottom-3 right-3 z-40 h-36 w-56 rounded-lg border border-white/15 bg-[#0b111d]/90 p-2 backdrop-blur">
          <div className="mb-1 text-[10px] text-white/60">MiniMap</div>
          <svg
            ref={minimapRef}
            className="h-[124px] w-[208px] rounded bg-black/25 cursor-pointer"
            onMouseDown={(e) => {
              setIsMiniMapDragging(true);
              panFromMiniMap(e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              if (!isMiniMapDragging) return;
              panFromMiniMap(e.clientX, e.clientY);
            }}
            onMouseUp={() => setIsMiniMapDragging(false)}
            onMouseLeave={() => setIsMiniMapDragging(false)}
          >
            {store.groups.map((group) => {
              const x = ((group.x - minimap.minX) / minimap.width) * 208;
              const y = ((group.y - minimap.minY) / minimap.height) * 124;
              const w = (group.width / minimap.width) * 208;
              const h = (group.height / minimap.height) * 124;
              return <rect key={group.id} x={x} y={y} width={w} height={h} fill="rgba(34,211,238,0.09)" stroke="rgba(34,211,238,0.45)" />;
            })}
            {store.nodes.map((node) => {
              const wNode = NODE_DEFS[node.kind].width;
              const hNode = NODE_DEFS[node.kind].height;
              const x = ((node.x - minimap.minX) / minimap.width) * 208;
              const y = ((node.y - minimap.minY) / minimap.height) * 124;
              const w = (wNode / minimap.width) * 208;
              const h = (hNode / minimap.height) * 124;
              return <rect key={node.id} x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.3)" />;
            })}
            <rect
              x={((minimap.viewRect.x - minimap.minX) / minimap.width) * 208}
              y={((minimap.viewRect.y - minimap.minY) / minimap.height) * 124}
              width={(minimap.viewRect.width / minimap.width) * 208}
              height={(minimap.viewRect.height / minimap.height) * 124}
              fill="rgba(167,139,250,0.12)"
              stroke="rgba(167,139,250,0.8)"
            />
          </svg>
        </div>
      </main>

      <aside className="absolute right-0 top-12 bottom-0 z-40 w-72 border-l border-white/10 bg-[#0b101d]/95 p-3 overflow-y-auto">
        <div className="mb-2 text-xs text-white/60">Inspector</div>
        {!selectedNode && !selectedGroup && <div className="text-xs text-white/50">Select a node or group</div>}
        {store.selectedNodeIds.length > 1 && (
          <div className="mb-3 space-y-2 rounded border border-white/10 bg-white/5 p-2 text-xs">
            <div className="text-white/80">Selected nodes: {store.selectedNodeIds.length}</div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => store.alignSelectedNodes('left')}>Align L</button>
              <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => store.alignSelectedNodes('center')}>Align C</button>
              <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => store.alignSelectedNodes('top')}>Align T</button>
              <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => store.alignSelectedNodes('middle')}>Align M</button>
              <button
                className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-45"
                disabled={store.selectedNodeIds.length < 3}
                onClick={() => store.distributeSelectedNodes('horizontal')}
              >
                Dist H
              </button>
              <button
                className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-45"
                disabled={store.selectedNodeIds.length < 3}
                onClick={() => store.distributeSelectedNodes('vertical')}
              >
                Dist V
              </button>
            </div>
          </div>
        )}
        {selectedGroup && (
          <div className="space-y-2 text-xs">
            <div className="text-sm text-cyan-100">{selectedGroup.title}</div>
            <div className="text-white/70">Nodes: {selectedGroup.nodeIds.length}</div>
            <div className="text-white/60">Drag group header to move members together.</div>
          </div>
        )}
        {selectedNode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-white/90">
              <span className={`h-2.5 w-2.5 rounded-full ${RUN_STATUS_STYLES[selectedNodeRuntime?.status || 'idle']}`} />
              <span>{getNodeTitle(selectedNode.kind, selectedNode.config?.label)}</span>
            </div>
            <div className="text-xs text-white/65">Node ID: {selectedNode.id}</div>
            <div className="text-xs text-white/65">
              Inputs: {NODE_DEFS[selectedNode.kind].inputs.length} / Outputs: {NODE_DEFS[selectedNode.kind].outputs.length}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/45">Debug</div>
              <div className="text-xs text-white/75">Status: {selectedNodeRuntime?.status || 'idle'}</div>
              <div className="mt-1 text-xs text-white/60">
                {selectedNodeRuntime?.error || selectedNodeRuntime?.message || 'This node has not executed yet.'}
              </div>
              <div className="mt-3">
                {renderValuePreview(getPrimaryWorkflowValue(selectedNodeRuntime?.outputs))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => pinNodeOutput(selectedNode.id)}
                  disabled={!selectedNodeRuntime?.outputs || isExecuting}
                  className="rounded-md border border-fuchsia-300/35 bg-fuchsia-500/15 px-3 py-1.5 text-xs hover:bg-fuchsia-500/25 disabled:opacity-45"
                >
                  Pin Output
                </button>
                <button
                  onClick={() => unpinNodeOutput(selectedNode.id)}
                  disabled={!selectedNode.config?.pinnedOutputs || isExecuting}
                  className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-45"
                >
                  Clear Pin
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Identity</div>
              <label className="block text-[11px] text-white/60">Label</label>
              <input
                value={selectedNode.config?.label || ''}
                onChange={(e) => updateNodeConfig(selectedNode.id, 'label', e.target.value)}
                className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                placeholder={NODE_DEFS[selectedNode.kind].title}
                title="Node label"
              />
            </div>

            {['enhancer', 'llm', 'generator', 'imageGen', 'videoGen', 'runningHub'].includes(selectedNode.kind) && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Runtime</div>
                <label className="block text-[11px] text-white/60">Provider</label>
                <select
                  value={selectedNode.config?.provider || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'provider', e.target.value || undefined)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  title="Provider"
                >
                  <option value="">Auto</option>
                  <option value="google">Google</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="runningHub">RunningHub</option>
                  <option value="minimax">MiniMax</option>
                  <option value="custom">Custom</option>
                </select>
                <label className="block text-[11px] text-white/60">Model</label>
                <input
                  value={selectedNode.config?.model || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'model', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  placeholder="Leave blank to use workspace default"
                  title="Model"
                />
                <label className="block text-[11px] text-white/60">Retry Count</label>
                <input
                  value={selectedNode.config?.retryCount ?? 0}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'retryCount', Number(e.target.value) || 0)}
                  type="number"
                  min={0}
                  max={5}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  title="Retry count"
                />
              </div>
            )}

            {(selectedNode.kind === 'enhancer' || selectedNode.kind === 'llm') && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Inputs</div>
                <label className="block text-[11px] text-white/60">System Prompt</label>
                <textarea
                  value={selectedNode.config?.systemPrompt || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'systemPrompt', e.target.value)}
                  className="h-28 w-full resize-none rounded border border-white/15 bg-black/20 px-2 py-2 text-xs outline-none"
                  placeholder="Control how this node rewrites or reasons over incoming text"
                  title="System prompt"
                />
              </div>
            )}

            {selectedNode.kind === 'template' && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Inputs</div>
                <label className="block text-[11px] text-white/60">Template</label>
                <textarea
                  value={selectedNode.config?.templateText || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'templateText', e.target.value)}
                  className="h-28 w-full resize-none rounded border border-white/15 bg-black/20 px-2 py-2 text-xs outline-none"
                  placeholder="Use {{input}}, {{var1}}, {{var2}}"
                  title="Template text"
                />
              </div>
            )}

            {selectedNode.kind === 'runningHub' && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Inputs</div>
                <label className="block text-[11px] text-white/60">Endpoint</label>
                <input
                  value={selectedNode.config?.rhEndpoint || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'rhEndpoint', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  placeholder="rhart-image-n-pro-official/edit"
                  title="RunningHub endpoint"
                />
                <label className="block text-[11px] text-white/60">Resolution</label>
                <select
                  value={selectedNode.config?.rhResolution || '2k'}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'rhResolution', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  title="RunningHub resolution"
                >
                  <option value="1k">1k</option>
                  <option value="2k">2k</option>
                  <option value="4k">4k</option>
                </select>
                <label className="block text-[11px] text-white/60">Aspect Ratio</label>
                <input
                  value={selectedNode.config?.rhAspectRatio || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'rhAspectRatio', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  placeholder="16:9"
                  title="RunningHub aspect ratio"
                />
              </div>
            )}

            {selectedNode.kind === 'httpRequest' && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Inputs</div>
                <label className="block text-[11px] text-white/60">Method</label>
                <select
                  value={selectedNode.config?.httpMethod || 'POST'}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'httpMethod', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  title="HTTP method"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <label className="block text-[11px] text-white/60">URL</label>
                <input
                  value={selectedNode.config?.httpUrl || ''}
                  onChange={(e) => updateNodeConfig(selectedNode.id, 'httpUrl', e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none"
                  placeholder="https://api.example.com/endpoint"
                  title="HTTP URL"
                />
              </div>
            )}

            <div className="border-t border-white/10 pt-2 text-xs text-white/55">
              Tips: double-click edge to remove; Shift + drag background to pan.
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => runGraph('workflow')}
                disabled={isExecuting || !prompt.trim()}
                className="rounded-md border border-emerald-300/40 bg-emerald-500/25 px-3 py-1.5 text-xs hover:bg-emerald-500/35 disabled:opacity-45"
              >
                Run Workflow
              </button>
              <button
                onClick={() => runGraph('node', selectedNode.id)}
                disabled={isExecuting || !prompt.trim()}
                className="rounded-md border border-sky-300/35 bg-sky-500/15 px-3 py-1.5 text-xs hover:bg-sky-500/25 disabled:opacity-45"
              >
                Execute Node
              </button>
              <button
                onClick={() => runGraph('from-here', selectedNode.id)}
                disabled={isExecuting || !prompt.trim()}
                className="rounded-md border border-cyan-300/35 bg-cyan-500/15 px-3 py-1.5 text-xs hover:bg-cyan-500/25 disabled:opacity-45"
              >
                Execute From Here
              </button>
            </div>
          </div>
        )}
      </aside>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[120] min-w-[180px] rounded-lg border border-white/15 bg-[#0d1321]/95 p-1 shadow-2xl backdrop-blur"
          style={{ left: contextMenu.x + 4, top: contextMenu.y + 4 }}
        >
          {contextMenu.target === 'canvas' && (
            <>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-prompt')}>+ Add Prompt Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-load-image')}>+ Add Load Image Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-enhancer')}>+ Add Enhancer Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-llm')}>+ Add LLM Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-template')}>+ Add Template Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-generator')}>+ Add Generator Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-image-gen')}>+ Add ImageGen Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-video-gen')}>+ Add VideoGen Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-runninghub')}>+ Add RunningHub Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-preview')}>+ Add Preview Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('add-save-to-canvas')}>+ Add SaveToCanvas Node</button>
              <div className="my-1 h-px bg-white/10" />
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={!store.canPaste} onClick={() => runContextAction('paste')}>Paste</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length === 0} onClick={() => runContextAction('cut')}>Cut Selection</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length < 2} onClick={() => runContextAction('group-selected')}>Group Selection</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length < 2} onClick={() => runContextAction('align-left')}>Align Left</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length < 2} onClick={() => runContextAction('align-top')}>Align Top</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length < 3} onClick={() => runContextAction('dist-h')}>Distribute Horizontal</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10 disabled:opacity-45" disabled={store.selectedNodeIds.length < 3} onClick={() => runContextAction('dist-v')}>Distribute Vertical</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('fit')}>Fit View</button>
            </>
          )}
          {contextMenu.target === 'node' && (
            <>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('copy-node')}>Copy Node</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-white/10" onClick={() => runContextAction('delete-node')}>Delete Node</button>
            </>
          )}
          {contextMenu.target === 'group' && (
            <>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs hover:bg-white/10" onClick={() => runContextAction('copy-group')}>Copy Group</button>
              <button className="w-full rounded px-3 py-1.5 text-left text-xs text-amber-300 hover:bg-white/10" onClick={() => runContextAction('ungroup')}>Ungroup</button>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        title="Upload image to workflow"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />
    </div>
  );
};

