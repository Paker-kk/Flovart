import { useCallback, useMemo, lazy, Suspense } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type NodeChange,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AiNodeComponent } from '../nodeflow/AiNodeComponent';
import { useBoardStore } from '../../stores/useBoardStore';
import type { SpatialNode } from '../../types';

const nodeTypes = { aiNode: AiNodeComponent };

type FlovartRFNode = Node<SpatialNode, 'aiNode'>;

export const NodeFlowWorkspace: React.FC = () => {
  const nodes = useBoardStore(s => s.nodes);
  const edges = useBoardStore(s => s.edges);
  const updateNodePosition = useBoardStore(s => s.updateNodePosition);
  const addEdge = useBoardStore(s => s.addEdge);

  const rfNodes: FlovartRFNode[] = useMemo(
    () => nodes.map(n => ({
      id: n.id,
      type: 'aiNode' as const,
      position: { x: n.x, y: n.y },
      data: n,
    })),
    [nodes],
  );

  const rfEdges: Edge[] = useMemo(
    () => edges.map(e => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      animated: e.animated ?? true,
      style: { stroke: '#00ff88', strokeWidth: 2 },
    })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          updateNodePosition(change.id, change.position.x, change.position.y);
        }
      }
    },
    [updateNodePosition],
  );

  const onConnect = useCallback(
    (connection: any) => {
      if (connection.source && connection.target) {
        addEdge({
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
          relation: 'references',
          animated: true,
        });
      }
    },
    [addEdge],
  );

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#222" gap={24} size={1} />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={() => '#333'}
          maskColor="rgba(0,0,0,0.6)"
          style={{ bottom: 60, right: 10 }}
        />
      </ReactFlow>
    </div>
  );
};
